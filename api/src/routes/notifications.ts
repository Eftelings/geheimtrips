import { Hono } from 'hono';
import { db } from '../db/index.js';
import { places, ratings, placeMedia, photoLikes, users } from '../db/schema.js';
import { and, eq, gt, ne, inArray, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = new Hono();

// Spalte für „zuletzt gesehen" nachrüsten (bestehende DBs)
db.run(sql`ALTER TABLE users ADD COLUMN notifications_seen_at TEXT`).catch(() => {});

// GET /notifications/count — Anzahl neuer Ereignisse seit dem letzten Ansehen:
// neue Bewertungen auf meinen Orten + neue Likes auf meinen Fotos (nicht von mir selbst).
router.get('/count', requireAuth, async (c) => {
  const me = c.get('user');
  const seen = me.notificationsSeenAt ?? '1970-01-01 00:00:00';

  // Meine eingereichten Orte
  const myPlaces = await db.select({ id: places.id }).from(places)
    .where(eq(places.submittedBy, me.id)).all();
  const placeIds = myPlaces.map(p => p.id);

  let ratingCount = 0;
  if (placeIds.length) {
    const r = await db.select({ n: sql<number>`count(*)`.as('n') }).from(ratings)
      .where(and(inArray(ratings.placeId, placeIds), gt(ratings.createdAt, seen), ne(ratings.userId, me.id)))
      .get();
    ratingCount = Number(r?.n ?? 0);
  }

  // Meine hochgeladenen Fotos
  const myPhotos = await db.select({ url: placeMedia.url }).from(placeMedia)
    .where(eq(placeMedia.userId, me.id)).all();
  const urls = myPhotos.map(m => m.url);

  let likeCount = 0;
  if (urls.length) {
    const l = await db.select({ n: sql<number>`count(*)`.as('n') }).from(photoLikes)
      .where(and(inArray(photoLikes.photoUrl, urls), gt(photoLikes.createdAt, seen), ne(photoLikes.userId, me.id)))
      .get();
    likeCount = Number(l?.n ?? 0);
  }

  return c.json({ count: ratingCount + likeCount, ratings: ratingCount, likes: likeCount });
});

// POST /notifications/seen — alles als gesehen markieren (löscht den Punkt)
router.post('/seen', requireAuth, async (c) => {
  const me = c.get('user');
  await db.update(users).set({ notificationsSeenAt: sql`datetime('now')` }).where(eq(users.id, me.id));
  return c.json({ ok: true });
});

export default router;
