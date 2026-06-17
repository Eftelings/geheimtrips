import { Hono } from 'hono';
import { db } from '../db/index.js';
import { trips, tripPlaces, tripOvernights, places } from '../db/schema.js';
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

const router = new Hono();

// GET /trips — current user's trips
router.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const userTrips = await db.select().from(trips).where(eq(trips.userId, user.id)).all();
  return c.json(await expandTrips(userTrips));
});

// GET /trips/curated
router.get('/curated', async (c) => {
  const curated = await db.select().from(trips).where(eq(trips.isCurated, true)).all();
  return c.json(await expandTrips(curated));
});

// GET /trips/:id — eigener Trip ODER kuratierter Trip (für alle einsehbar)
router.get('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const trip = await db.select().from(trips)
    .where(eq(trips.id, Number(c.req.param('id')))).get();
  if (!trip || (trip.userId !== user.id && !trip.isCurated)) {
    return c.json({ error: 'Trip nicht gefunden.' }, 404);
  }
  const [expanded] = await expandTrips([trip]);
  return c.json({ ...expanded, isOwner: trip.userId === user.id });
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

// ─── helpers ──────────────────────────────────────────────────────────────────

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
