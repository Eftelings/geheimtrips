import { Hono } from 'hono';
import { db } from '../db/index.js';
import { trips, tripPlaces, tripOvernights, tripParticipants, tripVotes, places, users } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { hydrate } from './places.js';

// ── Runtime schema migrations (idempotent) ────────────────────────────────────
db.run(sql`ALTER TABLE trips ADD COLUMN intro TEXT DEFAULT ''`).catch(() => {});
db.run(sql`ALTER TABLE trips ADD COLUMN costs_json TEXT DEFAULT '{}'`).catch(() => {});
db.run(sql`ALTER TABLE trip_overnights ADD COLUMN hotel_lat REAL`).catch(() => {});
db.run(sql`ALTER TABLE trip_overnights ADD COLUMN hotel_lng REAL`).catch(() => {});
db.run(sql`ALTER TABLE trips ADD COLUMN start_label TEXT`).catch(() => {});
db.run(sql`ALTER TABLE trips ADD COLUMN start_lat REAL`).catch(() => {});
db.run(sql`ALTER TABLE trips ADD COLUMN start_lng REAL`).catch(() => {});
db.run(sql`ALTER TABLE trips ADD COLUMN end_label TEXT`).catch(() => {});
db.run(sql`ALTER TABLE trips ADD COLUMN end_lat REAL`).catch(() => {});
db.run(sql`ALTER TABLE trips ADD COLUMN end_lng REAL`).catch(() => {});
db.run(sql`CREATE TABLE IF NOT EXISTS trip_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited',
  created_at TEXT DEFAULT (datetime('now'))
)`).catch(() => {});
db.run(sql`CREATE TABLE IF NOT EXISTS trip_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  place_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  vote TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`).catch(() => {});

const router = new Hono();

// GET /trips — eigene Trips + Trips, zu denen ich eingeladen bin
router.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const owned = await db.select().from(trips).where(eq(trips.userId, user.id)).all();
  const myParts = await db.select().from(tripParticipants).where(eq(tripParticipants.userId, user.id)).all();
  const statusMap = Object.fromEntries(myParts.map(p => [p.tripId, p.status]));
  const extraIds = myParts.map(p => p.tripId).filter(id => !owned.some(t => t.id === id));
  const joined = extraIds.length ? await db.select().from(trips).where(inArray(trips.id, extraIds)).all() : [];
  const expanded = await expandTrips([...owned, ...joined]);
  return c.json(expanded.map(t => ({
    ...t,
    isOwner: t.userId === user.id,
    myStatus: t.userId === user.id ? 'owner' : (statusMap[t.id] ?? null),
  })));
});

// GET /trips/curated
router.get('/curated', async (c) => {
  const curated = await db.select().from(trips).where(eq(trips.isCurated, true)).all();
  return c.json(await expandTrips(curated));
});

// GET /trips/:id — eigener/kuratierter Trip ODER Trip, zu dem ich eingeladen bin
router.get('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const trip = await db.select().from(trips).where(eq(trips.id, id)).get();
  if (!trip) return c.json({ error: 'Trip nicht gefunden.' }, 404);
  const myPart = await db.select().from(tripParticipants)
    .where(and(eq(tripParticipants.tripId, id), eq(tripParticipants.userId, user.id))).get();
  if (trip.userId !== user.id && !trip.isCurated && !myPart) {
    return c.json({ error: 'Trip nicht gefunden.' }, 404);
  }
  const [expanded] = await expandTrips([trip]);
  return c.json({
    ...expanded,
    isOwner: trip.userId === user.id,
    myStatus: trip.userId === user.id ? 'owner' : (myPart?.status ?? null),
    participants: await getParticipants(id),
    votes: await getVotes(id, user.id),
  });
});

// POST /trips — create (optional mit vollständiger Stopp-Liste, z.B. „Trip übernehmen")
router.post('/', requireAuth,
  zValidator('json', z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    intro: z.string().optional(),
    hero: z.string().optional(),
    transport: z.enum(['walk', 'bike', 'transit', 'train', 'auto']).optional(),
    placeIds: z.array(z.string()).optional(),
    places: z.array(z.object({
      placeId: z.string(), position: z.number(), dayIndex: z.number(),
    })).optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const { title, subtitle, intro, hero, transport, placeIds, places: placeRows } = c.req.valid('json');
    const [trip] = await db.insert(trips).values({
      userId: user.id, title,
      subtitle: subtitle ?? '',
      intro: intro ?? '',
      hero: hero ?? '',
      transport: transport ?? 'auto',
    }).returning();
    if (placeRows?.length) {
      await db.insert(tripPlaces).values(
        placeRows.map(p => ({ tripId: trip.id, placeId: p.placeId, position: p.position, dayIndex: p.dayIndex }))
      );
    } else if (placeIds?.length) {
      await db.insert(tripPlaces).values(
        placeIds.map((placeId, position) => ({ tripId: trip.id, placeId, position, dayIndex: 0 }))
      );
    }
    const [expanded] = await expandTrips([trip]);
    return c.json(expanded, 201);
  }
);

// PATCH /trips/:id
router.patch('/:id', requireAuth,
  zValidator('json', z.object({
    title: z.string().min(1).optional(),
    subtitle: z.string().optional(),
    intro: z.string().optional(),
    hero: z.string().optional(),
    transport: z.enum(['walk', 'bike', 'transit', 'train', 'auto']).optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    persons: z.number().int().min(1).optional(),
    costsJson: z.string().max(2000).optional(),
    startLabel: z.string().nullable().optional(),
    startLat: z.number().nullable().optional(),
    startLng: z.number().nullable().optional(),
    endLabel: z.string().nullable().optional(),
    endLat: z.number().nullable().optional(),
    endLng: z.number().nullable().optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    const trip = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.userId, user.id))).get();
    if (!trip) return c.json({ error: 'Trip nicht gefunden.' }, 404);
    const update = c.req.valid('json');
    const [updated] = await db.update(trips).set(update).where(eq(trips.id, id)).returning();
    const [expanded] = await expandTrips([updated]);
    return c.json(expanded);
  }
);

// DELETE /trips/:id
router.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const trip = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.userId, user.id))).get();
  if (!trip) return c.json({ error: 'Trip nicht gefunden.' }, 404);
  await db.delete(tripPlaces).where(eq(tripPlaces.tripId, id));
  await db.delete(tripOvernights).where(eq(tripOvernights.tripId, id));
  await db.delete(tripParticipants).where(eq(tripParticipants.tripId, id));
  await db.delete(tripVotes).where(eq(tripVotes.tripId, id));
  await db.delete(trips).where(eq(trips.id, id));
  return c.json({ ok: true });
});

// PUT /trips/:id/places — reorder places
router.put('/:id/places', requireAuth,
  zValidator('json', z.object({
    places: z.array(z.object({ placeId: z.string(), position: z.number(), dayIndex: z.number(), notes: z.string().max(2000).optional() }))
  })),
  async (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    const trip = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.userId, user.id))).get();
    if (!trip) return c.json({ error: 'Trip nicht gefunden.' }, 404);
    await db.delete(tripPlaces).where(eq(tripPlaces.tripId, id));
    const body = c.req.valid('json');
    if (body.places.length) {
      await db.insert(tripPlaces).values(
        body.places.map(p => ({ tripId: id, placeId: p.placeId, position: p.position, dayIndex: p.dayIndex, notes: p.notes ?? '' }))
      );
    }
    return c.json({ ok: true });
  }
);

// POST /trips/:id/places/:placeId — add a place
router.post('/:id/places/:placeId', requireAuth, async (c) => {
  const user = c.get('user');
  const tripId = Number(c.req.param('id'));
  const placeId = c.req.param('placeId');
  const trip = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, user.id))).get();
  if (!trip) return c.json({ error: 'Trip nicht gefunden.' }, 404);
  const existing = await db.select().from(tripPlaces)
    .where(and(eq(tripPlaces.tripId, tripId), eq(tripPlaces.placeId, placeId))).get();
  if (existing) return c.json({ error: 'Ort bereits im Trip.' }, 409);
  const count = (await db.select().from(tripPlaces).where(eq(tripPlaces.tripId, tripId)).all()).length;
  await db.insert(tripPlaces).values({ tripId, placeId, position: count, dayIndex: 0 });
  return c.json({ ok: true });
});

// DELETE /trips/:id/places/:placeId
router.delete('/:id/places/:placeId', requireAuth, async (c) => {
  const user = c.get('user');
  const tripId = Number(c.req.param('id'));
  const placeId = c.req.param('placeId');
  const trip = await db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, user.id))).get();
  if (!trip) return c.json({ error: 'Trip nicht gefunden.' }, 404);
  await db.delete(tripPlaces)
    .where(and(eq(tripPlaces.tripId, tripId), eq(tripPlaces.placeId, placeId)));
  return c.json({ ok: true });
});

// PUT /trips/:id/overnights — save overnight config
router.put('/:id/overnights', requireAuth,
  zValidator('json', z.object({
    overnights: z.array(z.object({
      afterDayIndex: z.number(),
      hotelId: z.string().nullable().optional(),
      hotelName: z.string().nullable().optional(),
      hotelPrice: z.number().nullable().optional(),
      hotelLat: z.number().nullable().optional(),
      hotelLng: z.number().nullable().optional(),
    }))
  })),
  async (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    const trip = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.userId, user.id))).get();
    if (!trip) return c.json({ error: 'Trip nicht gefunden.' }, 404);
    await db.delete(tripOvernights).where(eq(tripOvernights.tripId, id));
    const { overnights } = c.req.valid('json');
    if (overnights.length) {
      await db.insert(tripOvernights).values(
        overnights.map(o => ({ tripId: id, ...o }))
      );
    }
    return c.json({ ok: true });
  }
);

// ─── Mitreisende (gemeinsame Trips) ───────────────────────────────────────────

// POST /trips/:id/invite — Besitzer:in lädt eine Person per Handle ein
router.post('/:id/invite', requireAuth,
  zValidator('json', z.object({ handle: z.string().min(1) })),
  async (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    const trip = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.userId, user.id))).get();
    if (!trip) return c.json({ error: 'Trip nicht gefunden.' }, 404);
    const handle = c.req.valid('json').handle.replace(/^@/, '').toLowerCase();
    const invitee = await db.select().from(users).where(eq(users.handle, handle)).get();
    if (!invitee) return c.json({ error: 'Nutzer:in nicht gefunden.' }, 404);
    if (invitee.id === user.id) return c.json({ error: 'Du bist bereits dabei.' }, 400);
    const existing = await db.select().from(tripParticipants)
      .where(and(eq(tripParticipants.tripId, id), eq(tripParticipants.userId, invitee.id))).get();
    if (existing) return c.json({ error: 'Bereits eingeladen.' }, 409);
    await db.insert(tripParticipants).values({ tripId: id, userId: invitee.id, status: 'invited' });
    return c.json({ ok: true });
  }
);

// POST /trips/:id/respond — Eingeladene:r nimmt an oder lehnt ab
router.post('/:id/respond', requireAuth,
  zValidator('json', z.object({ status: z.enum(['accepted', 'declined']) })),
  async (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    const part = await db.select().from(tripParticipants)
      .where(and(eq(tripParticipants.tripId, id), eq(tripParticipants.userId, user.id))).get();
    if (!part) return c.json({ error: 'Keine Einladung gefunden.' }, 404);
    await db.update(tripParticipants).set({ status: c.req.valid('json').status })
      .where(eq(tripParticipants.id, part.id));
    return c.json({ ok: true });
  }
);

// DELETE /trips/:id/participants/:userId — Besitzer:in entfernt jemanden, oder man tritt selbst aus
router.delete('/:id/participants/:userId', requireAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const targetId = Number(c.req.param('userId'));
  const trip = await db.select().from(trips).where(eq(trips.id, id)).get();
  if (!trip) return c.json({ error: 'Trip nicht gefunden.' }, 404);
  if (trip.userId !== user.id && targetId !== user.id) return c.json({ error: 'Nicht erlaubt.' }, 403);
  await db.delete(tripParticipants)
    .where(and(eq(tripParticipants.tripId, id), eq(tripParticipants.userId, targetId)));
  return c.json({ ok: true });
});

// POST /trips/:id/vote — Stimme für einen Ort abgeben (Owner oder Teilnehmer:in)
router.post('/:id/vote', requireAuth,
  zValidator('json', z.object({ placeId: z.string(), vote: z.enum(['yes', 'maybe', 'no']) })),
  async (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    const trip = await db.select().from(trips).where(eq(trips.id, id)).get();
    if (!trip) return c.json({ error: 'Trip nicht gefunden.' }, 404);
    const member = trip.userId === user.id || !!(await db.select().from(tripParticipants)
      .where(and(eq(tripParticipants.tripId, id), eq(tripParticipants.userId, user.id))).get());
    if (!member) return c.json({ error: 'Du gehörst nicht zu diesem Trip.' }, 403);
    const { placeId, vote } = c.req.valid('json');
    // Eine Stimme je Person & Ort → alte ersetzen
    await db.delete(tripVotes).where(and(
      eq(tripVotes.tripId, id), eq(tripVotes.placeId, placeId), eq(tripVotes.userId, user.id)));
    await db.insert(tripVotes).values({ tripId: id, placeId, userId: user.id, vote });
    return c.json({ ok: true });
  }
);

// ─── helpers ──────────────────────────────────────────────────────────────────

// Abstimmungs-Stand je Ort: Zähler + meine eigene Stimme
async function getVotes(tripId: number, myUserId: number) {
  const rows = await db.select().from(tripVotes).where(eq(tripVotes.tripId, tripId)).all();
  const map: Record<string, { yes: number; maybe: number; no: number; myVote: string | null }> = {};
  for (const r of rows) {
    if (!map[r.placeId]) map[r.placeId] = { yes: 0, maybe: 0, no: 0, myVote: null };
    const m = map[r.placeId];
    if (r.vote === 'yes') m.yes++; else if (r.vote === 'maybe') m.maybe++; else if (r.vote === 'no') m.no++;
    if (r.userId === myUserId) m.myVote = r.vote;
  }
  return map;
}

// Mitreisende eines Trips inkl. Namen/Avatar
async function getParticipants(tripId: number) {
  return db.select({
    userId: tripParticipants.userId, status: tripParticipants.status,
    name: users.name, handle: users.handle, avatarUrl: users.avatarUrl,
  }).from(tripParticipants)
    .innerJoin(users, eq(users.id, tripParticipants.userId))
    .where(eq(tripParticipants.tripId, tripId)).all();
}

async function expandTrips(tripRows: (typeof trips.$inferSelect)[]) {
  if (!tripRows.length) return [];
  const ids = tripRows.map(t => t.id);
  const allTripPlaces = await db.select().from(tripPlaces).where(inArray(tripPlaces.tripId, ids)).all();
  const allOvernights = await db.select().from(tripOvernights).where(inArray(tripOvernights.tripId, ids)).all();
  const placeIds = [...new Set(allTripPlaces.map(tp => tp.placeId))];
  const placeMap: Record<string, typeof places.$inferSelect> = {};
  if (placeIds.length) {
    const placeRows = await db.select().from(places).where(inArray(places.id, placeIds)).all();
    for (const p of placeRows) placeMap[p.id] = p;
  }
  return tripRows.map(trip => ({
    ...trip,
    places: allTripPlaces
      .filter(tp => tp.tripId === trip.id)
      .sort((a, b) => a.position - b.position)
      // hydrate: galleryJson/attributesJson/tipsJson parsen — Kostenrechner & Kacheln
      // brauchen attributes.answers (Eintrittspreise) und gallery als Arrays
      .map(tp => ({ ...tp, place: placeMap[tp.placeId] ? hydrate(placeMap[tp.placeId]) : undefined })),
    overnights: allOvernights.filter(o => o.tripId === trip.id),
  }));
}

export default router;
