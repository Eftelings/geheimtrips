import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users, friendships } from '../db/schema.js';
import { sql, eq, and, or, inArray } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { isUserLocalHero } from '../lib/ranking.js';

const router = new Hono();

// GET /people/suggestions — Menschen mit denselben gemerkten Orten (Phase C)
router.get('/suggestions', requireAuth, async (c) => {
  const me = c.get('user');

  // Bereits verbundene/angefragte Personen ausschließen
  const rels = await db.select({ a: friendships.requesterId, b: friendships.addresseeId })
    .from(friendships)
    .where(or(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, me.id))).all();
  const excluded = new Set<number>([me.id]);
  for (const r of rels) { excluded.add(r.a); excluded.add(r.b); }

  // Kandidat:innen nach Anzahl gemeinsamer gemerkter Orte
  const shared = await db.all(sql`
    SELECT sp.user_id AS userId, count(*) AS shared
    FROM saved_places sp
    WHERE sp.place_id IN (SELECT place_id FROM saved_places WHERE user_id = ${me.id})
      AND sp.user_id != ${me.id}
    GROUP BY sp.user_id ORDER BY shared DESC LIMIT 50
  `).catch(() => []) as { userId: number; shared: number }[];
  const sharedMap = new Map(shared.map(s => [s.userId, Number(s.shared)]));

  // Namen der gemeinsamen Orte (eine Abfrage für alle Kandidat:innen)
  const sharedNames = new Map<number, string[]>();
  const candIds = shared.map(s => s.userId).filter(id => !excluded.has(id));
  if (candIds.length) {
    const rows = await db.all(sql`
      SELECT sp.user_id AS userId, p.name AS placeName
      FROM saved_places sp JOIN places p ON p.id = sp.place_id
      WHERE sp.user_id IN (${sql.join(candIds.map(id => sql`${id}`), sql`, `)})
        AND sp.place_id IN (SELECT place_id FROM saved_places WHERE user_id = ${me.id})
    `).catch(() => []) as { userId: number; placeName: string }[];
    for (const r of rows) {
      const arr = sharedNames.get(r.userId) ?? [];
      if (arr.length < 3) arr.push(r.placeName);
      sharedNames.set(r.userId, arr);
    }
  }

  // Userdaten holen (opt-in + sichtbar + nicht gesperrt)
  let candidates = candIds.length
    ? (await db.select().from(users).where(inArray(users.id, candIds)).all())
        .filter(u => u.meetPeopleEnabled && u.profileVisible && !u.isBanned)
    : [];

  // Auffüllen mit weiteren Meet-People-Nutzer:innen, falls wenige
  if (candidates.length < 12) {
    const more = await db.select().from(users)
      .where(and(eq(users.meetPeopleEnabled, true), eq(users.profileVisible, true))).limit(50).all();
    for (const u of more) {
      if (excluded.has(u.id) || u.isBanned || candidates.some(x => x.id === u.id)) continue;
      candidates.push(u);
      if (candidates.length >= 30) break;
    }
  }

  const result = await Promise.all(candidates
    .sort((a, b) => (sharedMap.get(b.id) ?? 0) - (sharedMap.get(a.id) ?? 0))
    .slice(0, 24)
    .map(async u => ({
      id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl, bio: u.bio ?? '',
      sharedCount: sharedMap.get(u.id) ?? 0,
      sharedPlaces: sharedNames.get(u.id) ?? [],
      isLocalHero: await isUserLocalHero(u.id),
    })));

  return c.json({ meetPeopleEnabled: !!me.meetPeopleEnabled, suggestions: result });
});

export default router;
