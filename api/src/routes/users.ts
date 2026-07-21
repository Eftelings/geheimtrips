import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users, places, friendships, visitedPlaces, trips, follows } from '../db/schema.js';
import { eq, and, or, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { hydrate } from './places.js';
import { expandTrips } from './trips.js';
import { isUserLocalHero } from '../lib/ranking.js';

const router = new Hono();

// Follows-Tabelle zur Laufzeit anlegen (kein Migrationsschritt nötig); ein Paar nur einmal.
await db.run(sql`CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL,
  followee_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(follower_id, followee_id)
)`).catch(() => {});

// GET /users/me/following — Personen, denen ich folge („Traveler" + Personenfilter).
// MUSS vor '/:id' stehen, sonst würde 'me' als ID interpretiert.
router.get('/me/following', requireAuth, async (c) => {
  const me = c.get('user');
  const rows = await db.select({
    id: users.id, name: users.name, handle: users.handle,
    avatarUrl: users.avatarUrl, avatarCropX: users.avatarCropX, avatarCropY: users.avatarCropY,
  }).from(follows)
    .innerJoin(users, eq(users.id, follows.followeeId))
    .where(eq(follows.followerId, me.id)).all();
  return c.json(rows);
});

// GET /users/:id — öffentliches Profil einer realen Nutzer:in + mein Freundschaftsstatus
router.get('/:id', requireAuth, async (c) => {
  const me = c.get('user');
  const id = Number(c.req.param('id'));
  const u = await db.select().from(users).where(eq(users.id, id)).get();
  if (!u || !u.profileVisible) return c.json({ error: 'Profil nicht gefunden.' }, 404);

  // Freundschaftsstatus zwischen mir und dieser Person
  let friendStatus: 'self' | 'none' | 'pending_out' | 'pending_in' | 'friends' = 'none';
  let pendingRequestId: number | null = null;
  if (id === me.id) {
    friendStatus = 'self';
  } else {
    const fr = await db.select().from(friendships).where(or(
      and(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, id)),
      and(eq(friendships.requesterId, id), eq(friendships.addresseeId, me.id)),
    )).get();
    if (fr) {
      if (fr.status === 'accepted') friendStatus = 'friends';
      else if (fr.requesterId === me.id) friendStatus = 'pending_out';
      else { friendStatus = 'pending_in'; pendingRequestId = fr.id; }
    }
  }

  // Beigetragene (eingereichte) + besuchte Orte dieser Person — die zwei Profil-Metriken
  const placeRows   = await db.select().from(places).where(eq(places.submittedBy, id)).all();
  const visitedRows = await db.select({ id: visitedPlaces.id }).from(visitedPlaces).where(eq(visitedPlaces.userId, id)).all();
  // Veröffentlichte Trips fürs Blog-Carousel
  const tripRows       = await db.select().from(trips).where(and(eq(trips.userId, id), eq(trips.published, true))).all();
  const publishedTrips = await expandTrips(tripRows);

  // Follower / Folge ich dieser Person?
  const followerRows  = await db.select({ id: follows.id }).from(follows).where(eq(follows.followeeId, id)).all();
  const followingRows = await db.select({ id: follows.id }).from(follows).where(eq(follows.followerId, id)).all();
  const iFollow = id === me.id ? false : !!(await db.select({ id: follows.id }).from(follows)
    .where(and(eq(follows.followerId, me.id), eq(follows.followeeId, id))).get());

  return c.json({
    id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl, coverUrl: u.coverUrl, bio: u.bio,
    avatarCropX: u.avatarCropX, avatarCropY: u.avatarCropY, coverCropX: u.coverCropX, coverCropY: u.coverCropY,
    instagram: u.instagram, tiktok: u.tiktok, website: u.website, facebook: u.facebook, snapchat: u.snapchat,
    allowFollowers: u.allowFollowers,
    visitedPublic: u.visitedPublic,
    isLocalHero: await isUserLocalHero(u.id),
    placeCount: placeRows.length,       // Beigetragene Orte
    visitedCount: visitedRows.length,   // Besuchte Orte
    followerCount: followerRows.length,
    followingCount: followingRows.length,
    isFollowing: iFollow,
    friendStatus, pendingRequestId,
    places: placeRows.map(hydrate),
    trips: publishedTrips,
  });
});

// POST /users/:id/follow — folgen (nur wenn die Person Follower zulässt)
router.post('/:id/follow', requireAuth, async (c) => {
  const me = c.get('user');
  const id = Number(c.req.param('id'));
  if (id === me.id) return c.json({ error: 'Du kannst dir nicht selbst folgen.' }, 400);
  const target = await db.select({ id: users.id, allow: users.allowFollowers }).from(users).where(eq(users.id, id)).get();
  if (!target) return c.json({ error: 'Profil nicht gefunden.' }, 404);
  if (!target.allow) return c.json({ error: 'Diese Person lässt kein Folgen zu.' }, 403);
  await db.run(sql`INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (${me.id}, ${id})`).catch(() => {});
  return c.json({ ok: true, isFollowing: true });
});

// DELETE /users/:id/follow — entfolgen
router.delete('/:id/follow', requireAuth, async (c) => {
  const me = c.get('user');
  const id = Number(c.req.param('id'));
  await db.delete(follows).where(and(eq(follows.followerId, me.id), eq(follows.followeeId, id)));
  return c.json({ ok: true, isFollowing: false });
});

export default router;
