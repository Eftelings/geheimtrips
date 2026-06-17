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

const router = new Hono();

// All admin routes require auth + admin role
router.use('*', requireAuth, requireAdmin);

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
