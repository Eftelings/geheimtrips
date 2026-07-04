import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users, friendships } from '../db/schema.js';
import { sql, eq, and, or } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { isUserLocalHero } from '../lib/ranking.js';

const router = new Hono();

type UserRow = typeof users.$inferSelect;

// Luftlinie in km (Haversine)
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// POST /people/location — aktuellen GPS-Standort speichern (nur mit Standortfreigabe)
router.post('/location', requireAuth, async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({})) as { lat?: unknown; lng?: unknown };
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return c.json({ error: 'invalid coords' }, 400);
  }
  await db.update(users).set({ lat, lng, locationUpdatedAt: new Date().toISOString() }).where(eq(users.id, me.id));
  return c.json({ ok: true });
});

// DELETE /people/location — Standort wieder entfernen (Freigabe zurückziehen)
router.delete('/location', requireAuth, async (c) => {
  const me = c.get('user');
  await db.update(users).set({ lat: null, lng: null, locationUpdatedAt: null }).where(eq(users.id, me.id));
  return c.json({ ok: true });
});

// GET /people/suggestions — Menschen in der Nähe / mit denselben gemerkten Orten (Phase C)
router.get('/suggestions', requireAuth, async (c) => {
  const me = c.get('user');
  const myLat = me.lat as number | null, myLng = me.lng as number | null;
  const hasMyLoc = myLat != null && myLng != null;

  // Bereits verbundene/angefragte Personen ausschließen
  const rels = await db.select({ a: friendships.requesterId, b: friendships.addresseeId })
    .from(friendships)
    .where(or(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, me.id))).all();
  const excluded = new Set<number>([me.id]);
  for (const r of rels) { excluded.add(r.a); excluded.add(r.b); }

  // Gemeinsame gemerkte Orte je Kandidat:in (Anzahl)
  const shared = await db.all(sql`
    SELECT sp.user_id AS userId, count(*) AS shared
    FROM saved_places sp
    WHERE sp.place_id IN (SELECT place_id FROM saved_places WHERE user_id = ${me.id})
      AND sp.user_id != ${me.id}
    GROUP BY sp.user_id ORDER BY shared DESC LIMIT 50
  `).catch(() => []) as { userId: number; shared: number }[];
  const sharedMap = new Map(shared.map(s => [s.userId, Number(s.shared)]));

  // Namen der gemeinsamen Orte (max. 3 je Kandidat:in)
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

  // Pool: alle Meet-People-Nutzer:innen (opt-in, sichtbar, nicht gesperrt, nicht ausgeschlossen)
  const meet = await db.select().from(users)
    .where(and(eq(users.meetPeopleEnabled, true), eq(users.profileVisible, true))).limit(200).all();

  // Distanz je Kandidat:in — nur wenn BEIDE Seiten den Standort geteilt haben
  const distOf = (u: UserRow): number | null =>
    (hasMyLoc && u.lat != null && u.lng != null)
      ? haversineKm(myLat as number, myLng as number, u.lat, u.lng) : null;

  // Wenn ich meinen Standort geteilt habe: nur Leute in der Nähe (mit Standort, im Umkreis) vorschlagen
  const MAX_NEARBY_KM = 100;
  const pool: UserRow[] = meet
    .filter(u => !excluded.has(u.id) && !u.isBanned)
    .filter(u => {
      if (!hasMyLoc) return true;            // ohne eigenen Standort: nach gemeinsamen Orten (kein Nähe-Filter)
      const d = distOf(u);
      return d != null && d <= MAX_NEARBY_KM;
    });

  // Sortierung: nächste zuerst; ohne Distanz nach gemeinsamen Orten
  const sorted = pool.sort((a, b) => {
    const da = distOf(a), dbb = distOf(b);
    if (da != null && dbb != null) return da - dbb;
    if (da != null) return -1;
    if (dbb != null) return 1;
    return (sharedMap.get(b.id) ?? 0) - (sharedMap.get(a.id) ?? 0);
  }).slice(0, 24);

  const suggestions = await Promise.all(sorted.map(async u => {
    const d = distOf(u);
    return {
      id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl, bio: u.bio ?? '', age: u.age ?? null,
      sharedCount: sharedMap.get(u.id) ?? 0,
      sharedPlaces: sharedNames.get(u.id) ?? [],
      distanceKm: d != null ? Math.round(d * 10) / 10 : null,
      isLocalHero: await isUserLocalHero(u.id),
    };
  }));

  return c.json({ meetPeopleEnabled: !!me.meetPeopleEnabled, hasLocation: hasMyLoc, suggestions });
});

export default router;
