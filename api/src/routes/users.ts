import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users, places, friendships, visitedPlaces } from '../db/schema.js';
import { eq, and, or } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { hydrate } from './places.js';
import { isUserLocalHero } from '../lib/ranking.js';

const router = new Hono();

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

  return c.json({
    id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl, coverUrl: u.coverUrl, bio: u.bio,
    avatarCropX: u.avatarCropX, avatarCropY: u.avatarCropY, coverCropX: u.coverCropX, coverCropY: u.coverCropY,
    instagram: u.instagram, tiktok: u.tiktok, website: u.website, facebook: u.facebook, snapchat: u.snapchat,
    allowFollowers: u.allowFollowers,
    isLocalHero: await isUserLocalHero(u.id),
    placeCount: placeRows.length,       // Beigetragene Orte
    visitedCount: visitedRows.length,   // Besuchte Orte
    friendStatus, pendingRequestId,
    places: placeRows.map(hydrate),
  });
});

export default router;
