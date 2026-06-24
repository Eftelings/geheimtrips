import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  users, places, authors, visitedPlaces, savedPlaces,
  ratings, placeMedia, takedownReports, trips, tripPlaces,
  businessClaims, businessProfiles, perks, categories,
  placeContributions, photoLikes,
} from '../db/schema.js';
import { eq, desc, count, sql, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { mailStatus, verifyMail, sendMail } from '../lib/mailer.js';

// ── Runtime migration + Seed: Perks-Tabelle mit zwei Dummy-Vorteilen ───────────
db.run(sql`
  CREATE TABLE IF NOT EXISTS perks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    board       TEXT    NOT NULL DEFAULT 'quiz',
    min_rank    INTEGER NOT NULL DEFAULT 1,
    max_rank    INTEGER NOT NULL DEFAULT 50,
    partner     TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    discount    TEXT,
    logo_url    TEXT,
    terms       TEXT,
    redeem_url  TEXT,
    valid_until TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  )
`).then(async () => {
  const existing = await db.select({ c: count() }).from(perks);
  if ((existing[0]?.c ?? 0) > 0) return;
  await db.insert(perks).values([
    {
      board: 'quiz', minRank: 1, maxRank: 50, partner: 'Europcar', sort: 0,
      title: '20% Gutschrift bei Europcar',
      discount: '20%',
      logoUrl: 'https://logo.clearbit.com/europcar.com',
      terms: 'Nur online einlösbar. Gültig auf Mietwagen-Buchungen über die Europcar-Website. Nicht mit anderen Aktionen kombinierbar. Ein Gutschein pro Person.',
      redeemUrl: 'https://www.europcar.de',
      validUntil: '2026-08-19',
    },
    {
      board: 'quiz', minRank: 1, maxRank: 50, partner: 'Merlin Entertainments', sort: 1,
      title: '45% Rabatt auf ein Tagesticket',
      discount: '45%',
      logoUrl: 'https://logo.clearbit.com/merlinentertainments.biz',
      terms: 'Nur online einlösbar (LEGOLAND, SEA LIFE, Heide Park u.a.). Gültig für ein Tagesticket pro Person. Nach Verfügbarkeit, ausgenommen Feiertage.',
      redeemUrl: 'https://www.merlinentertainments.biz',
      validUntil: '2026-08-30',
    },
  ]);
  console.log('Perks-Dummys angelegt.');
}).catch(console.error);

// Merkmale-Overrides: zusätzlich angelegte Merkmale + ausgeblendete (gelöscht/zusammengeführt).
// Die Basis-Merkmale leben weiter im Code (taxonomy.ts); diese Tabelle ergänzt/überschreibt nur.
db.run(sql`
  CREATE TABLE IF NOT EXISTS merkmale (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    l3_slug    TEXT    NOT NULL,
    key        TEXT    NOT NULL,
    label      TEXT    NOT NULL,
    hidden     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(l3_slug, key)
  )
`).catch(console.error);

// Taxonomie-Overrides: neue/geänderte/ausgeblendete Haupt- (L2) und Unterkategorien (L3).
// Die Basis lebt im Code (taxonomy.ts); NULL-Felder bedeuten „Code-Standard verwenden".
db.run(sql`
  CREATE TABLE IF NOT EXISTS taxonomy_nodes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    level       INTEGER NOT NULL,          -- 2 = Hauptkategorie, 3 = Unterkategorie
    slug        TEXT    NOT NULL,
    label       TEXT,
    icon        TEXT,
    parent_slug TEXT,
    hidden      INTEGER NOT NULL DEFAULT 0,
    is_custom   INTEGER NOT NULL DEFAULT 0,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now')),
    UNIQUE(level, slug)
  )
`).catch(console.error);

const router = new Hono();

// All admin routes require auth + admin role
router.use('*', requireAuth, requireAdmin);

// ─── E-Mail-Versand (SMTP) Diagnose ─────────────────────────────────────────────
// Zeigt den (maskierten) SMTP-Status und prüft Verbindung + Login.
router.get('/mail/status', async (c) => {
  const status = mailStatus();
  const verify = await verifyMail();
  return c.json({ ...status, verify });
});

// Schickt eine echte Test-Mail und gibt die exakte Fehlermeldung zurück (statt sie zu verschlucken).
router.post('/mail/test',
  zValidator('json', z.object({ to: z.string().email() })),
  async (c) => {
    const { to } = c.req.valid('json');
    if (!mailStatus().configured) {
      return c.json({ ok: false, error: 'SMTP ist nicht konfiguriert — bitte SMTP_HOST/PORT/USER/PASS/FROM setzen.' });
    }
    try {
      await sendMail({
        to,
        subject: 'Test-E-Mail · Geheimtrips.de',
        text: 'Diese Test-E-Mail bestätigt, dass der Mail-Versand von Geheimtrips.de funktioniert. 🎉',
        html: '<p>Diese Test-E-Mail bestätigt, dass der Mail-Versand von <strong>Geheimtrips.de</strong> funktioniert. 🎉</p>',
      });
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: (e as Error).message });
    }
  }
);

// ─── Merkmale (Features) verwalten ──────────────────────────────────────────────
// Basis-Merkmale leben im Code (taxonomy.ts); die DB-Tabelle ergänzt (neue) und
// blendet aus (gelöscht/zusammengeführt). Reassign passt place.attributesJson.l4Features an.

function slugifyKey(label: string): string {
  return label.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || `m-${Date.now().toString(36)}`;
}

// Wendet eine Funktion auf die l4Features aller Orte einer Unterkategorie an.
async function rewriteFeatures(l3Slug: string, fn: (feats: string[]) => string[]): Promise<number> {
  const rows = await db.select({ id: places.id, attributesJson: places.attributesJson }).from(places).all();
  let changed = 0;
  for (const p of rows) {
    let a: Record<string, unknown>;
    try { a = JSON.parse(p.attributesJson ?? '{}'); } catch { continue; }
    if (a.l3Slug !== l3Slug || !Array.isArray(a.l4Features)) continue;
    const before = a.l4Features as string[];
    const after  = [...new Set(fn(before))];
    if (after.length !== before.length || after.some((k, i) => k !== before[i])) {
      a.l4Features = after;
      await db.update(places).set({ attributesJson: JSON.stringify(a) }).where(eq(places.id, p.id));
      changed++;
    }
  }
  return changed;
}

async function hideMerkmal(l3Slug: string, key: string, label: string) {
  await db.run(sql`
    INSERT INTO merkmale (l3_slug, key, label, hidden) VALUES (${l3Slug}, ${key}, ${label}, 1)
    ON CONFLICT(l3_slug, key) DO UPDATE SET hidden = 1`);
}

// GET /admin/merkmale — DB-Overrides + Nutzungs-Zähler je (Unterkategorie, Merkmal)
router.get('/merkmale', async (c) => {
  const dbRows = await db.all(sql`SELECT l3_slug as l3Slug, key, label, hidden FROM merkmale`) as
    { l3Slug: string; key: string; label: string; hidden: number }[];
  const all = await db.select({ attributesJson: places.attributesJson }).from(places).all();
  const counter = new Map<string, number>();
  for (const p of all) {
    let a: Record<string, unknown>;
    try { a = JSON.parse(p.attributesJson ?? '{}'); } catch { continue; }
    const l3 = a.l3Slug; const feats = a.l4Features;
    if (typeof l3 !== 'string' || !Array.isArray(feats)) continue;
    for (const k of feats) counter.set(`${l3}|${k}`, (counter.get(`${l3}|${k}`) ?? 0) + 1);
  }
  const usage = [...counter.entries()].map(([k, count]) => {
    const [l3Slug, key] = k.split('|');
    return { l3Slug, key, count };
  });
  return c.json({ db: dbRows, usage });
});

// POST /admin/merkmale — neues Merkmal zu einer Unterkategorie hinzufügen
router.post('/merkmale', zValidator('json', z.object({
  l3Slug: z.string().min(1), label: z.string().min(1).max(60),
})), async (c) => {
  const { l3Slug, label } = c.req.valid('json');
  const key = slugifyKey(label);
  await db.run(sql`
    INSERT INTO merkmale (l3_slug, key, label, hidden) VALUES (${l3Slug}, ${key}, ${label.trim()}, 0)
    ON CONFLICT(l3_slug, key) DO UPDATE SET label = excluded.label, hidden = 0`);
  return c.json({ ok: true, key });
});

// POST /admin/merkmale/merge — alle Orte von fromKey → toKey, fromKey ausblenden
router.post('/merkmale/merge', zValidator('json', z.object({
  l3Slug: z.string().min(1), fromKey: z.string().min(1), toKey: z.string().min(1),
})), async (c) => {
  const { l3Slug, fromKey, toKey } = c.req.valid('json');
  if (fromKey === toKey) return c.json({ error: 'Quelle und Ziel sind identisch.' }, 400);
  const changed = await rewriteFeatures(l3Slug, feats => feats.map(k => k === fromKey ? toKey : k));
  await hideMerkmal(l3Slug, fromKey, fromKey);
  return c.json({ ok: true, changed });
});

// POST /admin/merkmale/delete — entfernen (mode=remove) oder umziehen (mode=reassign)
router.post('/merkmale/delete', zValidator('json', z.object({
  l3Slug: z.string().min(1), key: z.string().min(1),
  mode: z.enum(['remove', 'reassign']), toKey: z.string().optional(),
})), async (c) => {
  const { l3Slug, key, mode, toKey } = c.req.valid('json');
  let changed = 0;
  if (mode === 'reassign') {
    if (!toKey) return c.json({ error: 'Zielmerkmal fehlt.' }, 400);
    changed = await rewriteFeatures(l3Slug, feats => feats.map(k => k === key ? toKey : k));
  } else {
    changed = await rewriteFeatures(l3Slug, feats => feats.filter(k => k !== key));
  }
  await hideMerkmal(l3Slug, key, key);
  return c.json({ ok: true, changed });
});

// POST /admin/merkmale/restore — Override entfernen: Code-Merkmal wird wieder sichtbar
// (bei zusammengeführten/gelöschten bleiben die Orte unverändert — nur das Merkmal kehrt zurück).
router.post('/merkmale/restore', zValidator('json', z.object({
  l3Slug: z.string().min(1), key: z.string().min(1),
})), async (c) => {
  const { l3Slug, key } = c.req.valid('json');
  await db.run(sql`DELETE FROM merkmale WHERE l3_slug = ${l3Slug} AND key = ${key}`);
  return c.json({ ok: true });
});

// ─── Haupt-/Unterkategorien verwalten (Taxonomie-Overrides) ─────────────────────
// Basis im Code (taxonomy.ts); diese Tabelle ergänzt (neue), überschreibt (Label/Icon/Eltern)
// und blendet aus. level 2 = Hauptkategorie, level 3 = Unterkategorie.
const nodeLevel = z.union([z.literal(2), z.literal(3)]);

router.get('/taxonomy-nodes', async (c) => {
  const rows = await db.all(sql`
    SELECT level, slug, label, icon, parent_slug AS parentSlug, hidden, is_custom AS isCustom, sort
    FROM taxonomy_nodes`);
  return c.json(rows);
});

// Neue Haupt-/Unterkategorie anlegen
router.post('/taxonomy-nodes', zValidator('json', z.object({
  level: nodeLevel, label: z.string().min(1).max(80),
  icon: z.string().max(40).optional().default(''), parentSlug: z.string().min(1),
})), async (c) => {
  const { level, label, icon, parentSlug } = c.req.valid('json');
  const slug = slugifyKey(label);
  await db.run(sql`
    INSERT INTO taxonomy_nodes (level, slug, label, icon, parent_slug, is_custom, hidden)
    VALUES (${level}, ${slug}, ${label.trim()}, ${icon || null}, ${parentSlug}, 1, 0)
    ON CONFLICT(level, slug) DO UPDATE SET label=excluded.label, icon=excluded.icon, parent_slug=excluded.parent_slug, hidden=0`);
  return c.json({ ok: true, slug });
});

// Bestehende bearbeiten (Label/Icon/Eltern) — NULL-Felder bleiben unverändert
router.patch('/taxonomy-nodes', zValidator('json', z.object({
  level: nodeLevel, slug: z.string().min(1),
  label: z.string().max(80).optional(), icon: z.string().max(40).optional(), parentSlug: z.string().optional(),
})), async (c) => {
  const { level, slug, label, icon, parentSlug } = c.req.valid('json');
  const exists = (await db.all(sql`SELECT 1 FROM taxonomy_nodes WHERE level=${level} AND slug=${slug}`)).length > 0;
  if (exists) {
    await db.run(sql`UPDATE taxonomy_nodes SET
      label = COALESCE(${label ?? null}, label),
      icon = COALESCE(${icon ?? null}, icon),
      parent_slug = COALESCE(${parentSlug ?? null}, parent_slug)
      WHERE level=${level} AND slug=${slug}`);
  } else {
    await db.run(sql`INSERT INTO taxonomy_nodes (level, slug, label, icon, parent_slug, is_custom, hidden)
      VALUES (${level}, ${slug}, ${label ?? null}, ${icon ?? null}, ${parentSlug ?? null}, 0, 0)`);
  }
  return c.json({ ok: true });
});

router.post('/taxonomy-nodes/hide', zValidator('json', z.object({
  level: nodeLevel, slug: z.string().min(1),
})), async (c) => {
  const { level, slug } = c.req.valid('json');
  await db.run(sql`INSERT INTO taxonomy_nodes (level, slug, hidden, is_custom) VALUES (${level}, ${slug}, 1, 0)
    ON CONFLICT(level, slug) DO UPDATE SET hidden=1`);
  return c.json({ ok: true });
});

router.post('/taxonomy-nodes/restore', zValidator('json', z.object({
  level: nodeLevel, slug: z.string().min(1),
})), async (c) => {
  const { level, slug } = c.req.valid('json');
  const row = (await db.all(sql`SELECT is_custom AS isCustom FROM taxonomy_nodes WHERE level=${level} AND slug=${slug}`))[0] as { isCustom: number } | undefined;
  if (row?.isCustom) await db.run(sql`DELETE FROM taxonomy_nodes WHERE level=${level} AND slug=${slug}`);
  else await db.run(sql`UPDATE taxonomy_nodes SET hidden=0 WHERE level=${level} AND slug=${slug}`);
  return c.json({ ok: true });
});

// ─── Änderungsanfragen ──────────────────────────────────────────────────────────
router.get('/change-requests', async (c) => {
  const rows = await db.all(sql`
    SELECT cr.id, cr.place_id AS placeId, cr.user_name AS userName, cr.category, cr.text,
           cr.status, cr.created_at AS createdAt, p.name AS placeName
    FROM change_requests cr LEFT JOIN places p ON p.id = cr.place_id
    ORDER BY (cr.status = 'open') DESC, cr.id DESC`).catch(() => []);
  return c.json(rows);
});

router.patch('/change-requests/:id', zValidator('json', z.object({
  status: z.enum(['open', 'done', 'dismissed']),
})), async (c) => {
  const user = c.get('user');
  await db.run(sql`
    UPDATE change_requests SET status = ${c.req.valid('json').status},
      resolved_by = ${user.name}, resolved_at = datetime('now')
    WHERE id = ${Number(c.req.param('id'))}`);
  return c.json({ ok: true });
});

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

router.get('/stats', async (c) => {
  const [userCount]    = await db.select({ count: count() }).from(users);
  const [placeCount]   = await db.select({ count: count() }).from(places);
  const [visitCount]   = await db.select({ count: count() }).from(visitedPlaces);
  const [mediaCount]   = await db.select({ count: count() }).from(placeMedia);
  const [tripCount]    = await db.select({ count: count() }).from(trips);
  const [reportCount]  = await db.select({ count: count() }).from(takedownReports).where(eq(takedownReports.status, 'open'));
  const [pendingSubmissions] = await db.select({ count: count() }).from(places).where(eq(places.isUserSubmitted, true));

  // Recent activity
  const recentVisits = await db.select({
    userId: visitedPlaces.userId,
    placeId: visitedPlaces.placeId,
    visitedAt: visitedPlaces.visitedAt,
  }).from(visitedPlaces).orderBy(desc(visitedPlaces.visitedAt)).limit(5).all();

  return c.json({
    stats: {
      users: userCount.count,
      places: placeCount.count,
      visits: visitCount.count,
      media: mediaCount.count,
      trips: tripCount.count,
      openReports: reportCount.count,
      pendingSubmissions: pendingSubmissions.count,
    },
    recentVisits,
  });
});

// ─── Places ───────────────────────────────────────────────────────────────────

router.get('/places', async (c) => {
  const all = await db.select().from(places).orderBy(desc(places.createdAt)).all();
  return c.json(all.map(p => ({
    ...p,
    vibe: JSON.parse(p.vibeJson ?? '[]'),
    gallery: JSON.parse(p.galleryJson ?? '[]'),
    tips: JSON.parse(p.tipsJson ?? '[]'),
  })));
});

router.post('/places', zValidator('json', z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  region: z.string().min(1),
  category: z.string().min(1),
  categoryLabel: z.string().min(1),
  short: z.string().min(1),
  long: z.string().min(1),
  hero: z.string().url(),
  cost: z.number().int().min(1).max(3),
  costLabel: z.string(),
  distanceMin: z.number().int().min(1),
  distanceLabel: z.string(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  authorId: z.number().int().nullable().optional(),
  vibe: z.array(z.string()).optional(),
  gallery: z.array(z.string()).optional(),
  tips: z.array(z.string()).optional(),
  parking: z.enum(['free', 'paid', 'limited']).nullable().optional(),
})), async (c) => {
  const body = c.req.valid('json');
  const existing = await db.select().from(places).where(eq(places.id, body.id)).get();
  if (existing) return c.json({ error: 'ID bereits vergeben.' }, 409);
  await db.insert(places).values({
    ...body,
    vibeJson: JSON.stringify(body.vibe ?? []),
    galleryJson: JSON.stringify(body.gallery ?? []),
    tipsJson: JSON.stringify(body.tips ?? []),
    attributesJson: '{}',
  });
  return c.json({ ok: true }, 201);
});

router.patch('/places/:id', zValidator('json', z.object({
  name: z.string().optional(),
  region: z.string().optional(),
  short: z.string().optional(),
  long: z.string().optional(),
  hero: z.string().optional(),
  cost: z.number().int().min(1).max(3).optional(),
  costLabel: z.string().optional(),
  distanceMin: z.number().int().optional(),
  distanceLabel: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  authorId: z.number().int().nullable().optional(),
  vibe: z.array(z.string()).optional(),
  gallery: z.array(z.string()).optional(),
  tips: z.array(z.string()).optional(),
  parking: z.enum(['free', 'paid', 'limited']).nullable().optional(),
})), async (c) => {
  const id   = c.req.param('id');
  const body = c.req.valid('json');
  const update: Record<string, unknown> = { ...body };
  if (body.vibe)    update.vibeJson    = JSON.stringify(body.vibe);
  if (body.gallery) update.galleryJson = JSON.stringify(body.gallery);
  if (body.tips)    update.tipsJson    = JSON.stringify(body.tips);
  delete update.vibe; delete update.gallery; delete update.tips;
  await db.update(places).set(update).where(eq(places.id, id));
  return c.json({ ok: true });
});

// GET /admin/places/quality — Beschreibungs-Treffsicherheit je Ort (zum Verbessern)
// description_accurate: 1=Gar nicht … 5=Perfekt. Niedriger Schnitt = Beschreibung anpassen.
router.get('/places/quality', async (c) => {
  const rows = await db.all<{
    place_id: string; acc_avg: number | null; acc_count: number;
    stars_avg: number | null; rating_count: number;
  }>(sql`
    SELECT place_id,
           AVG(description_accurate) AS acc_avg,
           COUNT(description_accurate) AS acc_count,
           AVG(stars) AS stars_avg,
           COUNT(*) AS rating_count
    FROM ratings GROUP BY place_id
  `);
  const placeRows = await db.select({ id: places.id, name: places.name, region: places.region }).from(places).all();
  const nameMap = Object.fromEntries(placeRows.map(p => [p.id, p]));
  const result = rows
    .filter(r => nameMap[r.place_id])
    .map(r => ({
      id: r.place_id,
      name: nameMap[r.place_id].name,
      region: nameMap[r.place_id].region,
      accuracyAvg: r.acc_avg != null ? Math.round(Number(r.acc_avg) * 10) / 10 : null,
      accuracyCount: Number(r.acc_count),
      starsAvg: r.stars_avg != null ? Math.round(Number(r.stars_avg) * 10) / 10 : null,
      ratingCount: Number(r.rating_count),
    }));
  return c.json(result);
});

router.delete('/places/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.select({ id: places.id }).from(places).where(eq(places.id, id)).get();
  if (!existing) return c.json({ error: 'Ort nicht gefunden.' }, 404);

  try {
    // Takedown-Reports sind rechtliche Belege → nicht löschen, nur Verweise lösen
    await db.run(sql`UPDATE takedown_reports SET media_id = NULL WHERE media_id IN (SELECT id FROM place_media WHERE place_id = ${id})`);
    await db.update(takedownReports).set({ placeId: null }).where(eq(takedownReports.placeId, id));

    // Alle abhängigen Zeilen entfernen (FK-sichere Reihenfolge, Kinder zuerst)
    await db.delete(photoLikes).where(eq(photoLikes.placeId, id));
    await db.delete(placeContributions).where(eq(placeContributions.placeId, id));
    await db.delete(savedPlaces).where(eq(savedPlaces.placeId, id));
    await db.delete(visitedPlaces).where(eq(visitedPlaces.placeId, id));
    await db.delete(ratings).where(eq(ratings.placeId, id));
    await db.delete(tripPlaces).where(eq(tripPlaces.placeId, id));
    await db.delete(businessClaims).where(eq(businessClaims.placeId, id));
    await db.delete(placeMedia).where(eq(placeMedia.placeId, id));
    // Laufzeit-Tabelle (kein Drizzle-Schema)
    await db.run(sql`DELETE FROM swipe_events WHERE place_id = ${id}`).catch(() => {});

    await db.delete(places).where(eq(places.id, id));
    return c.json({ ok: true });
  } catch (e) {
    console.error('Ort löschen fehlgeschlagen:', e);
    return c.json({ error: 'Ort konnte nicht gelöscht werden.' }, 500);
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────

router.get('/users', async (c) => {
  const all = await db.select({
    id: users.id, email: users.email, name: users.name, handle: users.handle,
    isAdmin: users.isAdmin, isBanned: users.isBanned, createdAt: users.createdAt,
    profileVisible: users.profileVisible,
  }).from(users).orderBy(desc(users.createdAt)).all();
  return c.json(all);
});

router.patch('/users/:id', zValidator('json', z.object({
  isAdmin:  z.boolean().optional(),
  isBanned: z.boolean().optional(),
})), async (c) => {
  const id   = Number(c.req.param('id'));
  const self = c.get('user');
  if (id === self.id) return c.json({ error: 'Du kannst dein eigenes Konto nicht ändern.' }, 400);
  await db.update(users).set(c.req.valid('json')).where(eq(users.id, id));
  return c.json({ ok: true });
});

router.delete('/users/:id', async (c) => {
  const id   = Number(c.req.param('id'));
  const self = c.get('user');
  if (id === self.id) return c.json({ error: 'Du kannst dein eigenes Konto nicht löschen.' }, 400);

  // Verknüpfte Daten aufräumen — sonst blockieren Fremdschlüssel die Löschung.
  // Beigetragene Inhalte bleiben erhalten, nur der persönliche Bezug wird entfernt:
  await db.run(sql`UPDATE places       SET submitted_by = NULL WHERE submitted_by = ${id}`).catch(() => {});
  await db.run(sql`UPDATE place_media  SET user_id      = NULL WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`UPDATE quiz_games   SET user_id      = NULL WHERE user_id = ${id}`).catch(() => {});

  // Persönliche & relationale Daten entfernen:
  await db.run(sql`DELETE FROM trip_overnights     WHERE trip_id IN (SELECT id FROM trips WHERE user_id = ${id})`).catch(() => {});
  await db.run(sql`DELETE FROM trip_places         WHERE trip_id IN (SELECT id FROM trips WHERE user_id = ${id})`).catch(() => {});
  await db.run(sql`DELETE FROM trips               WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM saved_places        WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM visited_places      WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM favorite_places     WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM ratings             WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM photo_likes         WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM place_contributions WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM friendships         WHERE requester_id = ${id} OR addressee_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM business_claims     WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM business_profiles   WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM user_prefs          WHERE user_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM swipe_events        WHERE user_id = ${id}`).catch(() => {});

  await db.delete(users).where(eq(users.id, id));
  return c.json({ ok: true });
});

// ─── Submissions ──────────────────────────────────────────────────────────────

router.get('/submissions', async (c) => {
  const all = await db.select().from(places).where(eq(places.isUserSubmitted, true))
    .orderBy(desc(places.createdAt)).all();
  return c.json(all);
});

router.patch('/submissions/:id/approve', async (c) => {
  await db.update(places).set({ isUserSubmitted: false }).where(eq(places.id, c.req.param('id')));
  return c.json({ ok: true });
});

router.delete('/submissions/:id', async (c) => {
  await db.delete(places).where(eq(places.id, c.req.param('id')));
  return c.json({ ok: true });
});

// ─── Takedown Reports ─────────────────────────────────────────────────────────

router.get('/takedown', async (c) => {
  const all = await db.select().from(takedownReports).orderBy(desc(takedownReports.createdAt)).all();
  return c.json(all);
});

router.post('/takedown', zValidator('json', z.object({
  reporterName: z.string().min(1),
  reporterEmail: z.string().email(),
  description: z.string().min(10),
  infringingUrl: z.string().optional(),
  rightDescription: z.string().optional(),
  placeId: z.string().optional(),
  mediaId: z.number().int().optional(),
})), async (c) => {
  const body = c.req.valid('json');
  const [report] = await db.insert(takedownReports).values(body).returning();
  return c.json(report, 201);
});

router.patch('/takedown/:id', zValidator('json', z.object({
  status: z.enum(['open', 'in_review', 'resolved', 'dismissed']),
  adminNote: z.string().optional(),
})), async (c) => {
  const id = Number(c.req.param('id'));
  const { status, adminNote } = c.req.valid('json');
  await db.update(takedownReports).set({
    status,
    adminNote,
    resolvedAt: ['resolved', 'dismissed'].includes(status) ? new Date().toISOString() : null,
  }).where(eq(takedownReports.id, id));
  return c.json({ ok: true });
});

// Delete media reported in takedown
router.delete('/media/:id', async (c) => {
  await db.delete(placeMedia).where(eq(placeMedia.id, Number(c.req.param('id'))));
  return c.json({ ok: true });
});

// ─── Business Claims ──────────────────────────────────────────────────────────

router.get('/claims', async (c) => {
  const claims = await db.select().from(businessClaims)
    .orderBy(desc(businessClaims.createdAt)).all();
  // Enrich with place + user names
  const enriched = await Promise.all(claims.map(async (claim) => {
    const place = await db.select({ id: places.id, name: places.name })
      .from(places).where(eq(places.id, claim.placeId)).get();
    const user = await db.select({ id: users.id, name: users.name, email: users.email })
      .from(users).where(eq(users.id, claim.userId)).get();
    return { ...claim, place, user };
  }));
  return c.json(enriched);
});

router.patch('/claims/:id/approve', async (c) => {
  const id    = Number(c.req.param('id'));
  const claim = await db.select().from(businessClaims).where(eq(businessClaims.id, id)).get();
  if (!claim)                    return c.json({ error: 'Anfrage nicht gefunden.' }, 404);
  if (claim.status !== 'pending') return c.json({ error: 'Bereits bearbeitet.' }, 409);

  // Upsert business profile
  let profile = await db.select().from(businessProfiles)
    .where(eq(businessProfiles.userId, claim.userId)).get();
  if (!profile) {
    const [inserted] = await db.insert(businessProfiles).values({
      userId:          claim.userId,
      companyName:     claim.businessName,
      companyEmail:    claim.contactEmail,
      companyWebsite:  claim.contactWebsite,
      isVerified:      true,
      verifiedAt:      new Date().toISOString(),
    }).returning();
    profile = inserted;
  }

  await db.update(places).set({
    businessProfileId:   profile.id,
    isOfficiallyManaged: true,
  }).where(eq(places.id, claim.placeId));

  await db.update(businessClaims).set({
    status:     'approved',
    reviewedAt: new Date().toISOString(),
  }).where(eq(businessClaims.id, id));

  return c.json({ ok: true });
});

router.patch('/claims/:id/reject', zValidator('json', z.object({
  adminNote: z.string().optional(),
})), async (c) => {
  const id          = Number(c.req.param('id'));
  const { adminNote } = c.req.valid('json');
  await db.update(businessClaims).set({
    status:     'rejected',
    adminNote,
    reviewedAt: new Date().toISOString(),
  }).where(eq(businessClaims.id, id));
  return c.json({ ok: true });
});

// ─── Authors ──────────────────────────────────────────────────────────────────

router.get('/authors', async (c) => {
  return c.json(await db.select().from(authors).all());
});

router.post('/authors', zValidator('json', z.object({
  name: z.string().min(1),
  handle: z.string().min(1),
  bio: z.string().optional(),
  avatarColor: z.string().optional(),
  instagram: z.string().nullable().optional(),
  tiktok: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
})), async (c) => {
  const [author] = await db.insert(authors).values(c.req.valid('json')).returning();
  return c.json(author, 201);
});

// ─── Perks / Partner-Vorteile ─────────────────────────────────────────────────

const perkSchema = z.object({
  board:      z.enum(['orte', 'quiz', 'punkte']),
  minRank:    z.number().int().min(1),
  maxRank:    z.number().int().min(1),
  partner:    z.string().min(1),
  title:      z.string().min(1),
  discount:   z.string().nullable().optional(),
  logoUrl:    z.string().nullable().optional(),
  terms:      z.string().nullable().optional(),
  redeemUrl:  z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  active:     z.boolean().optional(),
  sort:       z.number().int().optional(),
});

router.get('/perks', async (c) => {
  return c.json(await db.select().from(perks).orderBy(asc(perks.sort)).all());
});

router.post('/perks', zValidator('json', perkSchema), async (c) => {
  const [perk] = await db.insert(perks).values(c.req.valid('json')).returning();
  return c.json(perk, 201);
});

router.patch('/perks/:id', zValidator('json', perkSchema.partial()), async (c) => {
  const id = Number(c.req.param('id'));
  const [perk] = await db.update(perks).set(c.req.valid('json')).where(eq(perks.id, id)).returning();
  if (!perk) return c.json({ error: 'Vorteil nicht gefunden.' }, 404);
  return c.json(perk);
});

router.delete('/perks/:id', async (c) => {
  await db.delete(perks).where(eq(perks.id, Number(c.req.param('id'))));
  return c.json({ ok: true });
});

// ─── Kategorien (Haupt-Browse) ────────────────────────────────────────────────

const categorySchema = z.object({
  slug:     z.string().min(1).max(40).regex(/^[a-z0-9-]+$/, 'Nur Kleinbuchstaben, Zahlen, Bindestrich'),
  label:    z.string().min(1),
  icon:     z.string().min(1),
  color:    z.string().nullable().optional(),
  keywords: z.string().nullable().optional(),
  sort:     z.number().int().optional(),
  active:   z.boolean().optional(),
});

router.get('/categories', async (c) => {
  return c.json(await db.select().from(categories).orderBy(asc(categories.sort)).all());
});

router.post('/categories', zValidator('json', categorySchema), async (c) => {
  const [row] = await db.insert(categories).values(c.req.valid('json')).returning();
  return c.json(row, 201);
});

router.patch('/categories/:id', zValidator('json', categorySchema.partial()), async (c) => {
  const id = Number(c.req.param('id'));
  const [row] = await db.update(categories).set(c.req.valid('json')).where(eq(categories.id, id)).returning();
  if (!row) return c.json({ error: 'Kategorie nicht gefunden.' }, 404);
  return c.json(row);
});

router.delete('/categories/:id', async (c) => {
  await db.delete(categories).where(eq(categories.id, Number(c.req.param('id'))));
  return c.json({ ok: true });
});

export default router;
