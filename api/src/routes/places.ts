import { Hono } from 'hono';
import { db } from '../db/index.js';
import { places, savedPlaces, visitedPlaces, ratings, placeMedia, authors, businessClaims, placeContributions, users, photoLikes, favoritePlaces } from '../db/schema.js';
import { isUserLocalHero } from '../lib/ranking.js';
import { eq, and, inArray, sql, count, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { cleanRichText, cleanPlainText } from '../lib/sanitize.js';

// ── Runtime schema migrations (idempotent) ────────────────────────────────────
// Add parking column to places if it doesn't exist yet
db.run(sql`ALTER TABLE places ADD COLUMN parking TEXT`).catch(() => { /* column already exists */ });
// Eigene Tags je gemerktem Ort (pro Nutzer:in)
db.run(sql`ALTER TABLE saved_places ADD COLUMN tags TEXT DEFAULT '[]'`).catch(() => {});

// Ensure place_contributions table exists (no formal migration needed)
db.run(sql`
  CREATE TABLE IF NOT EXISTS place_contributions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id   TEXT    NOT NULL REFERENCES places(id),
    user_id    INTEGER NOT NULL REFERENCES users(id),
    type       TEXT    NOT NULL DEFAULT 'parking',
    value      TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(place_id, user_id, type)
  )
`).catch(console.error);

// Lieblingsorte-Tabelle (eigene Rangfolge besuchter Orte)
db.run(sql`
  CREATE TABLE IF NOT EXISTS favorite_places (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    place_id   TEXT    NOT NULL REFERENCES places(id),
    position   INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(user_id, place_id)
  )
`).catch(console.error);

// Ensure photo_likes table exists
db.run(sql`
  CREATE TABLE IF NOT EXISTS photo_likes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id   TEXT    NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    photo_url  TEXT    NOT NULL,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(place_id, photo_url, user_id)
  )
`).catch(console.error);

const router = new Hono();

// GET /places — list all freigegebenen Orte (ungeprüfte/eingereichte ausgeblendet)
router.get('/', async (c) => {
  const all = await db.select().from(places).all();
  return c.json(all.filter(p => !p.isUserSubmitted).map(hydrate));
});

// POST /places/submit — user submits a new place (auth required, stored as pending)
router.post('/submit', requireAuth,
  zValidator('json', z.object({
    name:         z.string().min(2).max(120),
    region:       z.string().min(2).max(100).optional().default(''),
    short:        z.string().min(5).max(400),
    long:         z.string().min(0).max(8000).optional().default(''),
    hero:         z.string().optional().default(''),
    lat:          z.number().nullable().optional(),
    lng:          z.number().nullable().optional(),
    locationText: z.string().optional(),
    l1Slug:       z.string().optional(),
    l2Slug:       z.string().optional(),
    l3Slug:       z.string().optional(),
    l4Features:   z.array(z.string()).optional().default([]),
    answers:      z.record(z.unknown()).optional().default({}),
    tips:         z.array(z.string()).optional().default([]),
    mediaItems:   z.array(z.object({
      url:     z.string(),
      caption: z.string().optional().default(''),
      type:    z.string().optional().default('image'),
      cropX:   z.number().min(0).max(1).optional().default(0.5),
      cropY:   z.number().min(0).max(1).optional().default(0.5),
    })).optional().default([]),
    heroCropX:    z.number().min(0).max(1).optional().default(0.5),
    heroCropY:    z.number().min(0).max(1).optional().default(0.5),
  })),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    // Build a URL-safe slug from name + short random suffix
    const baseSlug = body.name
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    const suffix  = Math.random().toString(36).slice(2, 7);
    const id      = `${baseSlug}-${suffix}`;

    // Map L1 → legacy category
    const L1_MAP: Record<string, { category: string; categoryLabel: string }> = {
      'kultur-geschichte':   { category: 'kultur',  categoryLabel: 'Kultur'  },
      'freizeit-action':     { category: 'aktiv',   categoryLabel: 'Aktiv'   },
      'natur-landschaft':    { category: 'natur',   categoryLabel: 'Natur'   },
      'urbanes-architektur': { category: 'kultur',  categoryLabel: 'Kultur'  },
      'kulinarik':           { category: 'genuss',  categoryLabel: 'Genuss'  },
    };
    const cat = L1_MAP[body.l1Slug ?? ''] ?? { category: 'natur', categoryLabel: 'Natur' };

    // Rich-Text-Antworten (Highlight/Trivia) als Klartext säubern — XSS-Schutz
    const safeAnswers = { ...(body.answers ?? {}) } as Record<string, unknown>;
    if (typeof safeAnswers.highlight === 'string')   safeAnswers.highlight   = cleanPlainText(safeAnswers.highlight);
    if (typeof safeAnswers.trivia_text === 'string') safeAnswers.trivia_text = cleanPlainText(safeAnswers.trivia_text);

    const attributesJson = JSON.stringify({
      l1Slug:       body.l1Slug,
      l2Slug:       body.l2Slug,
      l3Slug:       body.l3Slug,
      l4Features:   body.l4Features,
      answers:      safeAnswers,
      locationText: body.locationText,
      heroCropX:    body.heroCropX ?? 0.5,
      heroCropY:    body.heroCropY ?? 0.5,
    });

    await db.insert(places).values({
      id,
      name:          body.name,
      region:        body.region || (body.locationText ?? ''),
      category:      cat.category,
      categoryLabel: cat.categoryLabel,
      short:         cleanPlainText(body.short),
      long:          cleanRichText(body.long),
      // Kein Stock-Foto erfinden: ohne Upload bleibt das Titelbild leer
      hero:          body.hero || body.mediaItems?.[0]?.url || '',
      cost:          1,
      costLabel:     '€',
      distanceMin:   0,
      distanceLabel: 'Entfernung variiert',
      lat:           body.lat ?? null,
      lng:           body.lng ?? null,
      authorId:      null,
      submittedBy:   user.id,
      isUserSubmitted: 1 as unknown as boolean,
      attributesJson,
      tipsJson:      JSON.stringify((body.tips ?? []).map(cleanRichText).filter(Boolean)),
      vibeJson:      '[]',
      // Store as objects with crop coords; hero URL not duplicated in gallery
      galleryJson:   JSON.stringify(
        (body.mediaItems ?? [])
          .filter(m => m.url !== (body.hero || ''))
          .map(m => ({ url: m.url, cropX: m.cropX ?? 0.5, cropY: m.cropY ?? 0.5, caption: m.caption ?? '' }))
      ),
    });

    // Ersteller:in war ja vor Ort → automatisch als „war hier" markieren
    try {
      await db.insert(visitedPlaces).values({ userId: user.id, placeId: id, gpsVerified: false });
    } catch { /* bereits markiert — ignorieren */ }

    return c.json({ ok: true, id }, 201);
  }
);

// GET /places/:id — single place with author + approved business claim
router.get('/:id', async (c) => {
  const place = await db.select().from(places).where(eq(places.id, c.req.param('id'))).get();
  if (!place) return c.json({ error: 'Ort nicht gefunden.' }, 404);
  let author = null;
  if (place.authorId) {
    author = await db.select().from(authors).where(eq(authors.id, place.authorId)).get();
  }
  // Fetch submitter info for user-submitted places that have no curated author
  let submitter: { id: number; name: string; handle: string; avatarUrl: string | null; isLocalHero: boolean } | null = null;
  if (place.submittedBy && !place.authorId) {
    const u = await db.select({
      id: users.id, name: users.name, handle: users.handle, avatarUrl: users.avatarUrl,
    }).from(users).where(eq(users.id, place.submittedBy)).get();
    if (u) submitter = { ...u, isLocalHero: await isUserLocalHero(u.id) };
  }
  const media = await db.select().from(placeMedia).where(eq(placeMedia.placeId, place.id)).all();

  // Fetch approved business claim if place is officially managed
  let approvedClaim: { businessName: string; contactWebsite: string | null } | null = null;
  if (place.isOfficiallyManaged) {
    const claim = await db.select({
      businessName:    businessClaims.businessName,
      contactWebsite:  businessClaims.contactWebsite,
    }).from(businessClaims)
      .where(and(eq(businessClaims.placeId, place.id), eq(businessClaims.status, 'approved')))
      .get();
    if (claim) approvedClaim = claim;
  }

  // Photo likes: aggregate count per URL
  const likesRows = await db.select({
    photoUrl: photoLikes.photoUrl,
    cnt:      count(),
  }).from(photoLikes).where(eq(photoLikes.placeId, place.id))
    .groupBy(photoLikes.photoUrl).all();
  const photoLikesMap: Record<string, number> = {};
  for (const row of likesRows) photoLikesMap[row.photoUrl] = row.cnt;

  return c.json({ ...hydrate(place), author, submitter, media, approvedClaim, photoLikes: photoLikesMap });
});

// POST /places/:id/save — save a place (auth required)
router.post('/:id/save', requireAuth, async (c) => {
  const user = c.get('user');
  const placeId = c.req.param('id');
  const existing = await db.select().from(savedPlaces)
    .where(and(eq(savedPlaces.userId, user.id), eq(savedPlaces.placeId, placeId))).get();
  if (!existing) {
    await db.insert(savedPlaces).values({ userId: user.id, placeId });
    await db.update(places).set({ saves: sql`saves + 1` }).where(eq(places.id, placeId));
  }
  return c.json({ saved: true });
});

// DELETE /places/:id/save — unsave
router.delete('/:id/save', requireAuth, async (c) => {
  const user = c.get('user');
  const placeId = c.req.param('id');
  await db.delete(savedPlaces)
    .where(and(eq(savedPlaces.userId, user.id), eq(savedPlaces.placeId, placeId)));
  return c.json({ saved: false });
});

// POST /places/:id/visit — mark as visited (GPS verified)
router.post('/:id/visit', requireAuth, async (c) => {
  const user = c.get('user');
  const placeId = c.req.param('id');
  const existing = await db.select().from(visitedPlaces)
    .where(and(eq(visitedPlaces.userId, user.id), eq(visitedPlaces.placeId, placeId))).get();
  if (!existing) {
    await db.insert(visitedPlaces).values({ userId: user.id, placeId, gpsVerified: true });
  }
  return c.json({ visited: true });
});

// POST /places/:id/rate — submit a rating
router.post('/:id/rate', requireAuth,
  zValidator('json', z.object({
    stars: z.number().int().min(1).max(5),
    mood: z.number().int().min(1).max(5).optional(),
    descriptionAccurate: z.number().int().min(1).max(5).optional(),
    timeSpent: z.string().optional(),
    companions: z.array(z.string()).optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const placeId = c.req.param('id');
    const data = c.req.valid('json');
    await db.insert(ratings).values({
      userId: user.id,
      placeId,
      stars: data.stars,
      mood: data.mood,
      descriptionAccurate: data.descriptionAccurate,
      timeSpent: data.timeSpent,
      companions: data.companions ? JSON.stringify(data.companions) : null,
    }).onConflictDoNothing();
    // recompute avg rating
    const allRatings = await db.select({ stars: ratings.stars })
      .from(ratings).where(eq(ratings.placeId, placeId)).all();
    const avg = allRatings.reduce((s, r) => s + r.stars, 0) / allRatings.length;
    await db.update(places).set({ rating: Math.round(avg * 10) / 10, reviews: allRatings.length })
      .where(eq(places.id, placeId));
    return c.json({ ok: true });
  }
);

// GET /places/:id/contributions — aggregated community answers (parking etc.)
router.get('/:id/contributions', async (c) => {
  const placeId = c.req.param('id');
  // Get counts grouped by value for parking type
  const rows = await db.select({
    value: placeContributions.value,
    cnt:   count(),
  }).from(placeContributions)
    .where(and(eq(placeContributions.placeId, placeId), eq(placeContributions.type, 'parking')))
    .groupBy(placeContributions.value)
    .all();

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.value] = r.cnt;
  const total = rows.reduce((s, r) => s + r.cnt, 0);

  return c.json({ yes: counts['yes'] ?? 0, no: counts['no'] ?? 0, limited: counts['limited'] ?? 0, total });
});

// POST /places/:id/contribute — submit a community answer (auth + visited required)
router.post('/:id/contribute', requireAuth,
  zValidator('json', z.object({
    type:  z.string().min(1).max(60),
    value: z.string().min(1).max(500),
  })),
  async (c) => {
    const user    = c.get('user');
    const placeId = c.req.param('id');
    const { type, value } = c.req.valid('json');

    // Check user has visited
    const visited = await db.select().from(visitedPlaces)
      .where(and(eq(visitedPlaces.userId, user.id), eq(visitedPlaces.placeId, placeId))).get();
    if (!visited) return c.json({ error: 'Du musst den Ort besucht haben, um eine Antwort beizutragen.' }, 403);

    // Upsert: one answer per user per place per type
    await db.run(sql`
      INSERT INTO place_contributions (place_id, user_id, type, value)
      VALUES (${placeId}, ${user.id}, ${type}, ${value})
      ON CONFLICT(place_id, user_id, type) DO UPDATE SET value = excluded.value
    `);

    return c.json({ ok: true });
  }
);

// POST /places/:id/photos/like — toggle like on a photo (auth required)
router.post('/:id/photos/like', requireAuth,
  zValidator('json', z.object({ url: z.string().min(1) })),
  async (c) => {
    const user    = c.get('user');
    const placeId = c.req.param('id');
    const { url } = c.req.valid('json');

    const existing = await db.select({ id: photoLikes.id })
      .from(photoLikes)
      .where(and(eq(photoLikes.placeId, placeId), eq(photoLikes.photoUrl, url), eq(photoLikes.userId, user.id)))
      .get();

    let liked: boolean;
    if (existing) {
      await db.delete(photoLikes)
        .where(and(eq(photoLikes.placeId, placeId), eq(photoLikes.photoUrl, url), eq(photoLikes.userId, user.id)));
      liked = false;
    } else {
      await db.insert(photoLikes).values({ placeId, photoUrl: url, userId: user.id });
      liked = true;
    }

    const countRow = await db.select({ cnt: count() })
      .from(photoLikes)
      .where(and(eq(photoLikes.placeId, placeId), eq(photoLikes.photoUrl, url)))
      .get();

    return c.json({ liked, count: countRow?.cnt ?? 0 });
  }
);

// POST /places/:id/media — Foto/Video zu einem bestehenden Ort hinzufügen (an Galerie anhängen)
router.post('/:id/media', requireAuth,
  zValidator('json', z.object({
    url:     z.string().min(1),
    type:    z.enum(['photo', 'video']).optional(),
    cropX:   z.number().min(0).max(1).optional(),
    cropY:   z.number().min(0).max(1).optional(),
    caption: z.string().max(280).optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const place = await db.select().from(places).where(eq(places.id, id)).get();
    if (!place) return c.json({ error: 'Ort nicht gefunden.' }, 404);
    const { url, type = 'photo', cropX = 0.5, cropY = 0.5, caption = '' } = c.req.valid('json');

    // An galleryJson anhängen (gleiches Objekt-Format wie beim Einreichen)
    let gallery: unknown[] = [];
    try { gallery = JSON.parse(place.galleryJson ?? '[]'); } catch { gallery = []; }
    gallery.push({ url, cropX, cropY, caption, type });
    const update: Record<string, unknown> = { galleryJson: JSON.stringify(gallery) };
    if (type === 'video') update.hasVideo = true;
    await db.update(places).set(update).where(eq(places.id, id));

    // Uploader vermerken (für Eigentum + Like-Benachrichtigungen)
    await db.insert(placeMedia).values({ placeId: id, userId: user.id, url, type, ccConfirmed: true }).catch(() => {});

    const updated = await db.select().from(places).where(eq(places.id, id)).get();
    return c.json({ ok: true, place: updated ? hydrate(updated) : null });
  }
);

// GET /places/me/saved — current user's saved places
router.get('/me/saved', requireAuth, async (c) => {
  const user = c.get('user');
  const rows = await db.select({ placeId: savedPlaces.placeId })
    .from(savedPlaces).where(eq(savedPlaces.userId, user.id)).all();
  const ids = rows.map(r => r.placeId);
  if (!ids.length) return c.json([]);
  const all = await db.select().from(places).where(inArray(places.id, ids)).all();
  return c.json(all.map(hydrate));
});

// GET /places/me/saved-tags — eigene Tags je gemerktem Ort: { placeId: string[] }
router.get('/me/saved-tags', requireAuth, async (c) => {
  const user = c.get('user');
  const rows = await db.select({ placeId: savedPlaces.placeId, tags: savedPlaces.tags })
    .from(savedPlaces).where(eq(savedPlaces.userId, user.id)).all();
  const map: Record<string, string[]> = {};
  for (const r of rows) { try { map[r.placeId] = JSON.parse(r.tags ?? '[]'); } catch { map[r.placeId] = []; } }
  return c.json(map);
});

// PUT /places/:id/tags — eigene Tags eines gemerkten Orts setzen (taggen merkt ihn automatisch)
router.put('/:id/tags', requireAuth,
  zValidator('json', z.object({ tags: z.array(z.string()).max(20) })),
  async (c) => {
    const user = c.get('user');
    const placeId = c.req.param('id');
    const clean = [...new Set(
      c.req.valid('json').tags.map(t => t.trim().slice(0, 24)).filter(Boolean)
    )].slice(0, 12);
    const tagsJson = JSON.stringify(clean);
    const existing = await db.select().from(savedPlaces)
      .where(and(eq(savedPlaces.userId, user.id), eq(savedPlaces.placeId, placeId))).get();
    if (existing) {
      await db.update(savedPlaces).set({ tags: tagsJson }).where(eq(savedPlaces.id, existing.id));
    } else {
      await db.insert(savedPlaces).values({ userId: user.id, placeId, tags: tagsJson });
    }
    return c.json({ ok: true, tags: clean });
  }
);

// GET /places/me/visited — besuchte Orte inkl. Besuchsdatum + eigener Rangposition
router.get('/me/visited', requireAuth, async (c) => {
  const user = c.get('user');
  const rows = await db.select({ placeId: visitedPlaces.placeId, visitedAt: visitedPlaces.visitedAt })
    .from(visitedPlaces).where(eq(visitedPlaces.userId, user.id)).all();
  const ids = rows.map(r => r.placeId);
  if (!ids.length) return c.json([]);
  const visitedAtMap = Object.fromEntries(rows.map(r => [r.placeId, r.visitedAt]));

  const favRows = await db.select({ placeId: favoritePlaces.placeId, position: favoritePlaces.position })
    .from(favoritePlaces).where(eq(favoritePlaces.userId, user.id)).all();
  const favMap = Object.fromEntries(favRows.map(r => [r.placeId, r.position]));

  const all = await db.select().from(places).where(inArray(places.id, ids)).all();
  return c.json(all.map(p => ({
    ...hydrate(p),
    visitedAt: visitedAtMap[p.id] ?? null,
    favoritePosition: favMap[p.id] ?? null,
  })));
});

// GET /places/me/favorites — gespeicherte Lieblings-Reihenfolge (placeId[])
router.get('/me/favorites', requireAuth, async (c) => {
  const user = c.get('user');
  const rows = await db.select({ placeId: favoritePlaces.placeId })
    .from(favoritePlaces).where(eq(favoritePlaces.userId, user.id)).orderBy(asc(favoritePlaces.position)).all();
  return c.json(rows.map(r => r.placeId));
});

// PUT /places/me/favorites — eigene Lieblings-Reihenfolge speichern
router.put('/me/favorites', requireAuth,
  zValidator('json', z.object({ order: z.array(z.string()).max(500) })),
  async (c) => {
    const user = c.get('user');
    const { order } = c.req.valid('json');
    await db.delete(favoritePlaces).where(eq(favoritePlaces.userId, user.id));
    if (order.length) {
      await db.insert(favoritePlaces).values(
        order.map((placeId, position) => ({ userId: user.id, placeId, position })),
      );
    }
    return c.json({ ok: true });
  },
);

export function hydrate(p: typeof places.$inferSelect) {
  // Gallery may be string[] (legacy) or {url,cropX,cropY,caption}[] (new format)
  const rawGallery = JSON.parse(p.galleryJson ?? '[]') as (string | { url: string; cropX?: number; cropY?: number; caption?: string })[];
  const gallery: string[] = rawGallery.map(item => (typeof item === 'string' ? item : item.url));
  const galleryCrops: Record<string, { cropX: number; cropY: number }> = {};
  for (const item of rawGallery) {
    if (typeof item !== 'string' && item.url) {
      galleryCrops[item.url] = { cropX: item.cropX ?? 0.5, cropY: item.cropY ?? 0.5 };
    }
  }
  const attrs = JSON.parse(p.attributesJson ?? '{}') as Record<string, unknown>;
  return {
    ...p,
    vibe:         JSON.parse(p.vibeJson  ?? '[]'),
    gallery,
    galleryCrops,
    heroCropX:    typeof attrs.heroCropX === 'number' ? attrs.heroCropX : 0.5,
    heroCropY:    typeof attrs.heroCropY === 'number' ? attrs.heroCropY : 0.5,
    tips:         JSON.parse(p.tipsJson  ?? '[]'),
    attributes:   attrs,
    // parking is passed through as-is (null | 'free' | 'paid' | 'limited')
  };
}

export default router;
