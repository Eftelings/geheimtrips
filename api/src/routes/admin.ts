import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  users, places, authors, visitedPlaces, savedPlaces,
  ratings, placeMedia, takedownReports, trips, tripPlaces,
  businessClaims, businessProfiles, perks, categories,
  placeContributions, photoLikes, favoritePlaces, placeArticles,
} from '../db/schema.js';
import { eq, desc, count, sql, asc, inArray } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { mailStatus, verifyMail, sendMail } from '../lib/mailer.js';

// ── Zusätzliche Beiträge zu Orten: Liste + Freigabe ───────────────────────────
const articleRouter = new Hono();

/** GET /admin/articles?status=pending — Beiträge zur Prüfung (Standard: offene). */
articleRouter.get('/', async (c) => {
  const status = c.req.query('status') ?? 'pending';
  const rows = await db.select({
    id: placeArticles.id, placeId: placeArticles.placeId, status: placeArticles.status,
    short: placeArticles.short, long: placeArticles.long,
    triviaText: placeArticles.triviaText, highlightsJson: placeArticles.highlightsJson,
    createdAt: placeArticles.createdAt, reviewNote: placeArticles.reviewNote,
    placeName: places.name, placeRegion: places.region,
    authorId: users.id, authorName: users.name, authorHandle: users.handle,
  }).from(placeArticles)
    .innerJoin(places, eq(places.id, placeArticles.placeId))
    .innerJoin(users, eq(users.id, placeArticles.userId))
    .where(eq(placeArticles.status, status))
    .orderBy(desc(placeArticles.id)).all();
  return c.json(rows);
});

/** POST /admin/articles/:id/review — freigeben oder ablehnen. */
articleRouter.post('/:id/review',
  zValidator('json', z.object({
    status: z.enum(['approved', 'rejected']),
    note: z.string().max(500).optional(),
  })),
  async (c) => {
    const id = Number(c.req.param('id'));
    const { status, note } = c.req.valid('json');
    await db.update(placeArticles)
      .set({ status, reviewNote: note ?? null, updatedAt: sql`(datetime('now'))` })
      .where(eq(placeArticles.id, id));
    return c.json({ ok: true, status });
  });

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

// Zusätzliche Beiträge zu Orten (Prüfung) — Definition steht oben.
router.route('/articles', articleRouter);

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

// ─── Fragen-CMS: pro Typ-Tag steuern, welche Einreichungs-Fragen gestellt werden ──
// Tabelle wird in taxonomy.ts angelegt; hier nur Lesen/Schreiben der Overrides.
router.get('/questions-config', async (c) => {
  const rows = await db.all<{ tag_slug: string; question_id: string; enabled: number }>(
    sql`SELECT tag_slug, question_id, enabled FROM question_config`).catch(() => []);
  const map: Record<string, Record<string, boolean>> = {};
  for (const r of rows) { (map[r.tag_slug] ??= {})[r.question_id] = r.enabled === 1; }
  return c.json(map);
});

router.post('/questions-config/toggle', zValidator('json', z.object({
  tagSlug: z.string().min(1), questionId: z.string().min(1), enabled: z.boolean(),
})), async (c) => {
  const { tagSlug, questionId, enabled } = c.req.valid('json');
  await db.run(sql`
    INSERT INTO question_config (tag_slug, question_id, enabled) VALUES (${tagSlug}, ${questionId}, ${enabled ? 1 : 0})
    ON CONFLICT(tag_slug, question_id) DO UPDATE SET enabled = ${enabled ? 1 : 0}`).catch(() => {});
  return c.json({ ok: true });
});

// Override(s) löschen → zurück zur Code-Vorgabe (ein Tag oder eine einzelne Frage)
router.post('/questions-config/reset', zValidator('json', z.object({
  tagSlug: z.string().min(1), questionId: z.string().optional(),
})), async (c) => {
  const { tagSlug, questionId } = c.req.valid('json');
  if (questionId) await db.run(sql`DELETE FROM question_config WHERE tag_slug = ${tagSlug} AND question_id = ${questionId}`).catch(() => {});
  else await db.run(sql`DELETE FROM question_config WHERE tag_slug = ${tagSlug}`).catch(() => {});
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
  const [pendingArticles] = await db.select({ count: count() }).from(placeArticles).where(eq(placeArticles.status, 'pending'));

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
      pendingArticles: pendingArticles.count,
    },
    recentVisits,
  });
});

// ─── Places ───────────────────────────────────────────────────────────────────

router.get('/places', async (c) => {
  const all = await db.select().from(places).orderBy(desc(places.createdAt)).all();

  // Beiträge je Ort — der Hauptbeitrag ist der Ort selbst, deshalb steht er vorn.
  const extraRows = await db.select({
    id: placeArticles.id, placeId: placeArticles.placeId, status: placeArticles.status,
    userId: users.id, name: users.name,
  }).from(placeArticles).innerJoin(users, eq(users.id, placeArticles.userId)).all();
  const submitterIds = [...new Set(all.map(p => p.submittedBy).filter((x): x is number => x != null))];
  const submitters = submitterIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, submitterIds)).all()
    : [];
  const nameById = new Map(submitters.map(u => [u.id, u.name]));

  return c.json(all.map(p => ({
    ...p,
    vibe: JSON.parse(p.vibeJson ?? '[]'),
    gallery: JSON.parse(p.galleryJson ?? '[]'),
    tips: JSON.parse(p.tipsJson ?? '[]'),
    tagSlugs: JSON.parse(p.tagSlugsJson ?? '[]'),
    articles: [
      { id: 0, isMain: true, status: 'approved',
        authorId: p.submittedBy ?? null,
        authorName: (p.submittedBy != null ? nameById.get(p.submittedBy) : null) ?? 'Redaktion' },
      ...extraRows.filter(r => r.placeId === p.id).map(r => ({
        id: r.id, isMain: false, status: r.status, authorId: r.userId, authorName: r.name,
      })),
    ],
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

/**
 * Ort samt aller abhängigen Zeilen löschen. Foreign Keys werden erzwungen
 * (PRAGMA foreign_keys = 1) und referenzieren places mit NO ACTION — ein blankes
 * DELETE auf places scheitert daher, sobald irgendeine Kind-Zeile existiert.
 * Jede Einreichung hat mindestens einen visited_places-Eintrag (Ersteller:in gilt
 * automatisch als „war hier"), deshalb IMMER über diesen Helper löschen.
 */
async function deletePlaceCascade(id: string) {
  // Takedown-Reports sind rechtliche Belege → nicht löschen, nur Verweise lösen
  await db.run(sql`UPDATE takedown_reports SET media_id = NULL WHERE media_id IN (SELECT id FROM place_media WHERE place_id = ${id})`);
  await db.update(takedownReports).set({ placeId: null }).where(eq(takedownReports.placeId, id));

  // Kinder zuerst (FK-sichere Reihenfolge)
  await db.delete(photoLikes).where(eq(photoLikes.placeId, id));
  await db.delete(placeContributions).where(eq(placeContributions.placeId, id));
  await db.delete(savedPlaces).where(eq(savedPlaces.placeId, id));
  await db.delete(visitedPlaces).where(eq(visitedPlaces.placeId, id));
  await db.delete(ratings).where(eq(ratings.placeId, id));
  await db.delete(tripPlaces).where(eq(tripPlaces.placeId, id));
  await db.delete(businessClaims).where(eq(businessClaims.placeId, id));
  await db.delete(placeMedia).where(eq(placeMedia.placeId, id));
  await db.delete(favoritePlaces).where(eq(favoritePlaces.placeId, id));
  // Laufzeit-Tabellen ohne Drizzle-Schema (sonst bleiben Waisen zurück)
  await db.run(sql`DELETE FROM swipe_events        WHERE place_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM place_questions     WHERE place_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM place_reviews       WHERE place_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM place_review_optout WHERE place_id = ${id}`).catch(() => {});
  await db.run(sql`DELETE FROM change_requests     WHERE place_id = ${id}`).catch(() => {});

  await db.delete(places).where(eq(places.id, id));
}

router.delete('/places/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.select({ id: places.id }).from(places).where(eq(places.id, id)).get();
  if (!existing) return c.json({ error: 'Ort nicht gefunden.' }, 404);

  try {
    await deletePlaceCascade(id);
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

  // Optional: alle Artikel (+ Foto-Bezug) dieser Person an jemand anderen übertragen, statt sie
  // zu anonymisieren. ?transferTo=<userId>
  const transferRaw = c.req.query('transferTo');
  const transferTo  = transferRaw != null && transferRaw !== '' ? Number(transferRaw) : null;
  if (transferTo != null) {
    if (!Number.isInteger(transferTo) || transferTo === id) return c.json({ error: 'Ungültiges Übertragungsziel.' }, 400);
    const target = await db.select({ id: users.id }).from(users).where(eq(users.id, transferTo)).get();
    if (!target) return c.json({ error: 'Zielperson nicht gefunden.' }, 404);
  }

  // Verknüpfte Daten aufräumen — sonst blockieren Fremdschlüssel die Löschung.
  // Beigetragene Inhalte bleiben erhalten: entweder übertragen ODER nur den persönlichen Bezug lösen.
  if (transferTo != null) {
    await db.run(sql`UPDATE places      SET submitted_by = ${transferTo} WHERE submitted_by = ${id}`).catch(() => {});
    await db.run(sql`UPDATE place_media SET user_id      = ${transferTo} WHERE user_id = ${id}`).catch(() => {});
  } else {
    await db.run(sql`UPDATE places      SET submitted_by = NULL WHERE submitted_by = ${id}`).catch(() => {});
    await db.run(sql`UPDATE place_media SET user_id      = NULL WHERE user_id = ${id}`).catch(() => {});
  }
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

// Einreichung ablehnen = Ort löschen. Muss über den Cascade-Helper laufen, sonst
// scheitert es an den Foreign Keys (jede Einreichung hat einen visited_places-Eintrag).
router.delete('/submissions/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.select({ id: places.id }).from(places).where(eq(places.id, id)).get();
  if (!existing) return c.json({ error: 'Ort nicht gefunden.' }, 404);
  try {
    await deletePlaceCascade(id);
    return c.json({ ok: true });
  } catch (e) {
    console.error('Einreichung ablehnen fehlgeschlagen:', e);
    return c.json({ error: 'Einreichung konnte nicht gelöscht werden.' }, 500);
  }
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

// ─── Business-Accounts (Admin legt Unternehmen direkt an) ─────────────────────

router.get('/business-accounts', async (c) => {
  const profiles = await db.select().from(businessProfiles).orderBy(desc(businessProfiles.createdAt)).all();
  const rows = await Promise.all(profiles.map(async (p) => {
    const user = await db.select({ id: users.id, name: users.name, email: users.email, handle: users.handle })
      .from(users).where(eq(users.id, p.userId)).get();
    const claimed = await db.select({ id: places.id, name: places.name })
      .from(places).where(eq(places.businessProfileId, p.id)).all();
    return { ...p, user, places: claimed };
  }));
  return c.json(rows);
});

const slugifyHandle = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'unternehmen';

router.post('/business-accounts', zValidator('json', z.object({
  companyName:    z.string().min(1),
  companyEmail:   z.string().email(),
  companyWebsite: z.string().optional(),
  description:    z.string().optional(),
  placeIds:       z.array(z.string()).optional(),
})), async (c) => {
  const { companyName, companyEmail, companyWebsite, description, placeIds } = c.req.valid('json');

  // E-Mail muss frei sein
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, companyEmail)).get();
  if (existing) return c.json({ error: 'Diese E-Mail ist bereits registriert.' }, 409);

  // Eindeutigen Handle finden
  const base = slugifyHandle(companyName);
  let handle = base;
  for (let i = 0; i < 50; i++) {
    const taken = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).get();
    if (!taken) break;
    handle = `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
  }

  // Temporäres Passwort erzeugen (Unternehmen ändert es nach dem ersten Login)
  const tempPassword = Math.random().toString(36).slice(2, 10) + Math.floor(10 + Math.random() * 89);
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const [user] = await db.insert(users).values({
    email: companyEmail, passwordHash, name: companyName, handle,
  }).returning();

  const [profile] = await db.insert(businessProfiles).values({
    userId: user.id, companyName, companyEmail,
    companyWebsite: companyWebsite || null, description: description || null,
    isVerified: true, verifiedAt: new Date().toISOString(),
  }).returning();

  // Orte zuweisen: offiziell verwaltet + genehmigter Claim (→ Änderungswünsche landen im Postfach)
  const assigned: string[] = [];
  for (const pid of placeIds ?? []) {
    const place = await db.select({ id: places.id, name: places.name }).from(places).where(eq(places.id, pid)).get();
    if (!place) continue;
    await db.update(places).set({ businessProfileId: profile.id, isOfficiallyManaged: true }).where(eq(places.id, pid));
    await db.insert(businessClaims).values({
      placeId: pid, userId: user.id, businessName: companyName, contactEmail: companyEmail,
      contactWebsite: companyWebsite || null, status: 'approved', reviewedAt: new Date().toISOString(),
    });
    assigned.push(place.name);
  }

  return c.json({ ok: true, tempPassword, email: companyEmail, userId: user.id, profileId: profile.id, assigned }, 201);
});

// ─── Taxonomie-Moderation (neues Modell: Tags · Merkmale · Vibes) ─────────────

// GET /admin/tax/pending — zu prüfende Merkmale, Vibes und ungewöhnliche Verknüpfungen
router.get('/tax/pending', async (c) => {
  const merkmale = await db.all(sql`
    SELECT m.slug, m.label, m.created_at AS createdAt, u.name AS byName
    FROM tax_merkmale m LEFT JOIN users u ON u.id = m.created_by
    WHERE m.is_approved = 0 ORDER BY m.created_at DESC`).catch(() => []);
  const vibes = await db.all(sql`
    SELECT v.slug, v.label, v.created_at AS createdAt, u.name AS byName
    FROM tax_vibes v LEFT JOIN users u ON u.id = v.created_by
    WHERE v.is_approved = 0 ORDER BY v.created_at DESC`).catch(() => []);
  const links = await db.all(sql`
    SELECT tm.tag_slug AS tagSlug, t.label AS tagLabel, tm.merkmal_slug AS merkmalSlug, m.label AS merkmalLabel, u.name AS byName
    FROM tax_tag_merkmal tm JOIN tax_tags t ON t.slug = tm.tag_slug JOIN tax_merkmale m ON m.slug = tm.merkmal_slug
    LEFT JOIN users u ON u.id = tm.created_by
    WHERE tm.is_approved = 0 AND m.is_approved = 1 ORDER BY tm.created_at DESC`).catch(() => []);
  // Für Alias-Merging: alle freigegebenen Merkmale/Vibes als Ziel-Vorschläge
  const allMerkmale = await db.all(sql`SELECT slug, label FROM tax_merkmale WHERE is_approved = 1 ORDER BY label`).catch(() => []);
  const allVibes = await db.all(sql`SELECT slug, label FROM tax_vibes WHERE is_approved = 1 ORDER BY label`).catch(() => []);
  return c.json({ merkmale, vibes, links, allMerkmale, allVibes });
});

router.post('/tax/merkmal/:slug/approve', async (c) => {
  const s = c.req.param('slug');
  await db.run(sql`UPDATE tax_merkmale SET is_approved = 1 WHERE slug = ${s}`);
  await db.run(sql`UPDATE tax_tag_merkmal SET is_approved = 1 WHERE merkmal_slug = ${s}`);
  return c.json({ ok: true });
});
router.delete('/tax/merkmal/:slug', async (c) => {
  const s = c.req.param('slug');
  await db.run(sql`DELETE FROM tax_tag_merkmal WHERE merkmal_slug = ${s}`);
  await db.run(sql`DELETE FROM tax_merkmale WHERE slug = ${s}`);
  return c.json({ ok: true });
});
router.post('/tax/vibe/:slug/approve', async (c) => {
  const s = c.req.param('slug');
  await db.run(sql`UPDATE tax_vibes SET is_approved = 1 WHERE slug = ${s}`);
  await db.run(sql`UPDATE tax_tag_vibe SET is_approved = 1 WHERE vibe_slug = ${s}`);
  return c.json({ ok: true });
});
router.delete('/tax/vibe/:slug', async (c) => {
  const s = c.req.param('slug');
  await db.run(sql`DELETE FROM tax_tag_vibe WHERE vibe_slug = ${s}`);
  await db.run(sql`DELETE FROM tax_vibes WHERE slug = ${s}`);
  return c.json({ ok: true });
});
router.post('/tax/link', zValidator('json', z.object({ tagSlug: z.string(), merkmalSlug: z.string(), approve: z.boolean() })), async (c) => {
  const { tagSlug, merkmalSlug, approve } = c.req.valid('json');
  if (approve) await db.run(sql`UPDATE tax_tag_merkmal SET is_approved = 1 WHERE tag_slug = ${tagSlug} AND merkmal_slug = ${merkmalSlug}`);
  else await db.run(sql`DELETE FROM tax_tag_merkmal WHERE tag_slug = ${tagSlug} AND merkmal_slug = ${merkmalSlug}`);
  return c.json({ ok: true });
});
// Alias-Merging: aliasSlug wird zu canonicalSlug zusammengeführt (Synonym)
router.post('/tax/merge', zValidator('json', z.object({ aliasSlug: z.string(), canonicalSlug: z.string(), kind: z.enum(['merkmal', 'vibe']) })), async (c) => {
  const { aliasSlug, canonicalSlug, kind } = c.req.valid('json');
  if (aliasSlug === canonicalSlug) return c.json({ error: 'Gleiche Slugs.' }, 400);
  if (kind === 'merkmal') {
    await db.run(sql`INSERT OR IGNORE INTO tax_tag_merkmal (tag_slug, merkmal_slug, is_approved) SELECT tag_slug, ${canonicalSlug}, 1 FROM tax_tag_merkmal WHERE merkmal_slug = ${aliasSlug}`);
    await db.run(sql`DELETE FROM tax_tag_merkmal WHERE merkmal_slug = ${aliasSlug}`);
    await db.run(sql`DELETE FROM tax_merkmale WHERE slug = ${aliasSlug}`);
  } else {
    await db.run(sql`INSERT OR IGNORE INTO tax_tag_vibe (tag_slug, vibe_slug, is_approved) SELECT tag_slug, ${canonicalSlug}, 1 FROM tax_tag_vibe WHERE vibe_slug = ${aliasSlug}`);
    await db.run(sql`DELETE FROM tax_tag_vibe WHERE vibe_slug = ${aliasSlug}`);
    await db.run(sql`DELETE FROM tax_vibes WHERE slug = ${aliasSlug}`);
  }
  await db.run(sql`INSERT OR REPLACE INTO tax_aliases (alias_slug, canonical_slug, kind) VALUES (${aliasSlug}, ${canonicalSlug}, ${kind})`);
  return c.json({ ok: true });
});

// ─── Live-Taxonomie verwalten (tax_groups / tax_tags / tax_merkmale / tax_vibes) ──
// WICHTIG zum Datenmodell:
//  · Orte speichern TAGS als Slug (places.tag_slug / tag_slugs_json)  → Tag umbenennen = nur Label, keine Migration
//  · Orte speichern MERKMALE/VIBES als LABEL (attributes_json)        → Umbenennen MUSS die Orte mitziehen
const taxSlugify = (s: string) => s.toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/&/g, ' und ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Merkmal/Vibe-Label an allen Orten umschreiben (sie speichern Labels, nicht Slugs). */
async function renameTermOnPlaces(kind: 'merkmal' | 'vibe', oldLabel: string, newLabel: string) {
  const key = kind === 'merkmal' ? 'merkmale' : 'vibes';
  const rows = await db.all<{ id: string; attributes_json: string | null }>(sql`
    SELECT id, attributes_json FROM places WHERE attributes_json LIKE ${'%' + oldLabel + '%'}`).catch(() => []);
  for (const r of rows) {
    let attrs: Record<string, unknown>;
    try { attrs = JSON.parse(r.attributes_json ?? '{}'); } catch { continue; }
    const list = attrs[key];
    if (!Array.isArray(list) || !list.includes(oldLabel)) continue;
    attrs[key] = list.map(x => (x === oldLabel ? newLabel : x));
    await db.run(sql`UPDATE places SET attributes_json = ${JSON.stringify(attrs)} WHERE id = ${r.id}`).catch(() => {});
  }
}

// Komplettes Live-Vokabular inkl. Nutzungszahlen
router.get('/tax/all', async (c) => {
  const groups = await db.all(sql`SELECT slug, label, icon, color, sort FROM tax_groups ORDER BY sort, label`).catch(() => []);
  const tags = await db.all(sql`
    SELECT t.slug, t.label, t.sub, t.is_approved AS isApproved,
           (SELECT group_slug FROM tax_tag_group g WHERE g.tag_slug = t.slug LIMIT 1) AS groupSlug,
           (SELECT count(*) FROM places p WHERE p.tag_slug = t.slug) AS usage
    FROM tax_tags t ORDER BY t.sort, t.label`).catch(() => []);
  const terms = async (table: 'tax_merkmale' | 'tax_vibes', key: 'merkmale' | 'vibes') => {
    const rows = await db.all<{ slug: string; label: string; isApproved: number }>(
      sql`SELECT slug, label, is_approved AS isApproved FROM ${sql.raw(table)} ORDER BY label`).catch(() => []);
    const places = await db.all<{ attributes_json: string | null }>(
      sql`SELECT attributes_json FROM places`).catch(() => []);
    const counts = new Map<string, number>();
    for (const p of places) {
      try {
        const list = (JSON.parse(p.attributes_json ?? '{}') as Record<string, unknown>)[key];
        if (Array.isArray(list)) for (const l of list) counts.set(String(l), (counts.get(String(l)) ?? 0) + 1);
      } catch { /* ignore */ }
    }
    return rows.map(r => ({ ...r, usage: counts.get(r.label) ?? 0 }));
  };
  return c.json({ groups, tags, merkmale: await terms('tax_merkmale', 'merkmale'), vibes: await terms('tax_vibes', 'vibes') });
});

// Hauptkategorie anlegen / umbenennen (Orte referenzieren Gruppen nie direkt → gefahrlos)
router.post('/tax/group', zValidator('json', z.object({
  label: z.string().min(2).max(60), icon: z.string().max(40).optional(), color: z.string().max(20).optional(),
})), async (c) => {
  const { label, icon, color } = c.req.valid('json');
  const slug = taxSlugify(label);
  if (!slug) return c.json({ error: 'Ungültiger Name.' }, 400);
  const max = await db.all<{ m: number }>(sql`SELECT COALESCE(max(sort), -1) AS m FROM tax_groups`).catch(() => [{ m: -1 }]);
  await db.run(sql`INSERT OR IGNORE INTO tax_groups (slug, label, icon, color, sort)
    VALUES (${slug}, ${label.trim()}, ${icon ?? 'fa-tag'}, ${color ?? '#8A6FB3'}, ${Number(max[0]?.m ?? -1) + 1})`);
  return c.json({ ok: true, slug });
});

router.patch('/tax/group', zValidator('json', z.object({
  slug: z.string().min(1), label: z.string().min(2).max(60).optional(),
  icon: z.string().max(40).optional(), color: z.string().max(20).optional(),
})), async (c) => {
  const { slug, label, icon, color } = c.req.valid('json');
  await db.run(sql`UPDATE tax_groups SET
    label = COALESCE(${label ?? null}, label),
    icon  = COALESCE(${icon ?? null}, icon),
    color = COALESCE(${color ?? null}, color)
    WHERE slug = ${slug}`);
  return c.json({ ok: true });
});

// Typ-Tag anlegen / umbenennen / Gruppe wechseln (Label-Änderung ist gefahrlos: Orte halten den Slug)
router.post('/tax/tag', zValidator('json', z.object({
  label: z.string().min(2).max(60), group: z.string().min(1),
})), async (c) => {
  const { label, group } = c.req.valid('json');
  const slug = taxSlugify(label);
  if (!slug) return c.json({ error: 'Ungültiger Name.' }, 400);
  await db.run(sql`INSERT OR IGNORE INTO tax_tags (slug, label, is_approved) VALUES (${slug}, ${label.trim()}, 1)`);
  await db.run(sql`INSERT OR IGNORE INTO tax_tag_group (tag_slug, group_slug) VALUES (${slug}, ${group})`);
  return c.json({ ok: true, slug });
});

router.patch('/tax/tag', zValidator('json', z.object({
  slug: z.string().min(1), label: z.string().min(2).max(60).optional(),
  group: z.string().min(1).optional(), sub: z.string().max(60).optional(),
})), async (c) => {
  const { slug, label, group, sub } = c.req.valid('json');
  if (label) await db.run(sql`UPDATE tax_tags SET label = ${label.trim()} WHERE slug = ${slug}`);
  if (sub !== undefined) await db.run(sql`UPDATE tax_tags SET sub = ${sub.trim() || null} WHERE slug = ${slug}`);
  if (group) {
    await db.run(sql`DELETE FROM tax_tag_group WHERE tag_slug = ${slug}`);
    await db.run(sql`INSERT OR IGNORE INTO tax_tag_group (tag_slug, group_slug) VALUES (${slug}, ${group})`);
  }
  return c.json({ ok: true });
});

// Zwei Typ-Tags zusammenlegen: Orte ziehen um (tag_slug + tag_slugs_json), dann fällt der alte weg
router.post('/tax/tag/merge', zValidator('json', z.object({
  from: z.string().min(1), to: z.string().min(1),
})), async (c) => {
  const { from, to } = c.req.valid('json');
  if (from === to) return c.json({ error: 'Gleiche Tags.' }, 400);
  const target = await db.all(sql`SELECT slug FROM tax_tags WHERE slug = ${to}`).catch(() => []);
  if (!target.length) return c.json({ error: 'Ziel-Tag unbekannt.' }, 400);

  await db.run(sql`UPDATE places SET tag_slug = ${to} WHERE tag_slug = ${from}`);
  // tag_slugs_json ist eine JSON-Liste → Slug darin ersetzen, danach evtl. Dubletten bereinigen
  const rows = await db.all<{ id: string; tag_slugs_json: string | null }>(sql`
    SELECT id, tag_slugs_json FROM places WHERE tag_slugs_json LIKE ${'%"' + from + '"%'}`).catch(() => []);
  for (const r of rows) {
    try {
      const list = JSON.parse(r.tag_slugs_json ?? '[]') as string[];
      const next = [...new Set(list.map(s => (s === from ? to : s)))];
      await db.run(sql`UPDATE places SET tag_slugs_json = ${JSON.stringify(next)} WHERE id = ${r.id}`);
    } catch { /* ignore */ }
  }
  // Verknüpfungen übernehmen, dann alten Tag entfernen
  await db.run(sql`INSERT OR IGNORE INTO tax_tag_merkmal (tag_slug, merkmal_slug, is_approved) SELECT ${to}, merkmal_slug, 1 FROM tax_tag_merkmal WHERE tag_slug = ${from}`);
  await db.run(sql`INSERT OR IGNORE INTO tax_tag_vibe   (tag_slug, vibe_slug,    is_approved) SELECT ${to}, vibe_slug,    1 FROM tax_tag_vibe   WHERE tag_slug = ${from}`);
  await db.run(sql`DELETE FROM tax_tag_merkmal WHERE tag_slug = ${from}`);
  await db.run(sql`DELETE FROM tax_tag_vibe    WHERE tag_slug = ${from}`);
  await db.run(sql`DELETE FROM tax_tag_group   WHERE tag_slug = ${from}`);
  await db.run(sql`DELETE FROM tax_tags        WHERE slug     = ${from}`);
  await db.run(sql`INSERT OR REPLACE INTO tax_aliases (alias_slug, canonical_slug, kind) VALUES (${from}, ${to}, 'tag')`).catch(() => {});
  return c.json({ ok: true });
});

router.delete('/tax/tag/:slug', async (c) => {
  const slug = c.req.param('slug');
  const used = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM places WHERE tag_slug = ${slug}`).catch(() => [{ n: 0 }]);
  if (Number(used[0]?.n ?? 0) > 0) {
    return c.json({ error: 'Tag wird noch von Orten genutzt — bitte erst zusammenlegen.' }, 400);
  }
  await db.run(sql`DELETE FROM tax_tag_merkmal WHERE tag_slug = ${slug}`);
  await db.run(sql`DELETE FROM tax_tag_vibe    WHERE tag_slug = ${slug}`);
  await db.run(sql`DELETE FROM tax_tag_group   WHERE tag_slug = ${slug}`);
  await db.run(sql`DELETE FROM tax_tags        WHERE slug     = ${slug}`);
  return c.json({ ok: true });
});

// Merkmal/Vibe umbenennen — Slug bleibt stabil (Verknüpfungen intakt), Orte werden mitgezogen
router.patch('/tax/term', zValidator('json', z.object({
  kind: z.enum(['merkmal', 'vibe']), slug: z.string().min(1), label: z.string().min(2).max(60),
})), async (c) => {
  const { kind, slug, label } = c.req.valid('json');
  const table = kind === 'merkmal' ? 'tax_merkmale' : 'tax_vibes';
  const cur = await db.all<{ label: string }>(sql`SELECT label FROM ${sql.raw(table)} WHERE slug = ${slug}`).catch(() => []);
  if (!cur.length) return c.json({ error: 'Nicht gefunden.' }, 404);
  const oldLabel = cur[0].label;
  const newLabel = label.trim();
  if (oldLabel === newLabel) return c.json({ ok: true });

  await db.run(sql`UPDATE ${sql.raw(table)} SET label = ${newLabel} WHERE slug = ${slug}`);
  await renameTermOnPlaces(kind, oldLabel, newLabel);   // Orte halten Labels → mitziehen
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
