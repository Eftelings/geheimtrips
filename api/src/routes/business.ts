import { Hono } from 'hono';
import { db } from '../db/index.js';
import { businessProfiles, businessClaims, places } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const router = new Hono();

// ─── Claim submission ─────────────────────────────────────────────────────────

// POST /business/claim — submit a claim for a place
router.post('/claim', requireAuth, zValidator('json', z.object({
  placeId:         z.string().min(1),
  businessName:    z.string().min(2),
  contactEmail:    z.string().email(),
  contactWebsite:  z.string().optional(),
  message:         z.string().optional(),
})), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  const place = await db.select().from(places).where(eq(places.id, body.placeId)).get();
  if (!place) return c.json({ error: 'Ort nicht gefunden.' }, 404);

  if (place.isOfficiallyManaged) {
    return c.json({ error: 'Dieser Ort ist bereits offiziell verwaltet.' }, 409);
  }

  // Only one pending claim per user+place
  const existing = await db.select().from(businessClaims)
    .where(and(
      eq(businessClaims.placeId, body.placeId),
      eq(businessClaims.userId, user.id),
      eq(businessClaims.status, 'pending'),
    )).get();
  if (existing) return c.json({ error: 'Du hast bereits eine offene Anfrage für diesen Ort.' }, 409);

  const [claim] = await db.insert(businessClaims).values({
    placeId:        body.placeId,
    userId:         user.id,
    businessName:   body.businessName,
    contactEmail:   body.contactEmail,
    contactWebsite: body.contactWebsite,
    message:        body.message,
  }).returning();

  return c.json({ ok: true, claimId: claim.id }, 201);
});

// GET /business/claims/me — my pending / resolved claims
router.get('/claims/me', requireAuth, async (c) => {
  const user = c.get('user');
  const claims = await db.select().from(businessClaims)
    .where(eq(businessClaims.userId, user.id)).all();
  return c.json(claims);
});

// ─── Business profile ─────────────────────────────────────────────────────────

// GET /business/profile — my profile + managed places
router.get('/profile', requireAuth, async (c) => {
  const user = c.get('user');
  const profile = await db.select().from(businessProfiles)
    .where(eq(businessProfiles.userId, user.id)).get();
  if (!profile) return c.json({ profile: null, managedPlaces: [] });

  const managed = await db.select().from(places)
    .where(eq(places.businessProfileId, profile.id)).all();

  return c.json({ profile, managedPlaces: managed.map(hydratePlace) });
});

// ─── Manage place attributes ──────────────────────────────────────────────────

const PriceEntrySchema = z.object({
  label:  z.string(),
  amount: z.string(),
  from:   z.boolean().optional(),
  note:   z.string().optional(),
});

const HourSlotSchema = z.object({
  months:     z.array(z.number().int().min(1).max(12)),
  open:       z.string(),
  close:      z.string(),
  lastEntry:  z.string().optional(),
});

// PUT /business/places/:id/attributes — update hours, prices, website (owner only)
router.put('/places/:id/attributes', requireAuth, zValidator('json', z.object({
  website:       z.string().nullable().optional(),
  hoursSchedule: z.array(HourSlotSchema).nullable().optional(),
  hoursUrl:      z.string().nullable().optional(),
  prices:        z.array(PriceEntrySchema).nullable().optional(),
  pricesUrl:     z.string().nullable().optional(),
  specialInfo:   z.array(z.string()).nullable().optional(),
})), async (c) => {
  const user    = c.get('user');
  const placeId = c.req.param('id');

  const profile = await db.select().from(businessProfiles)
    .where(eq(businessProfiles.userId, user.id)).get();
  if (!profile) return c.json({ error: 'Kein Business-Profil vorhanden.' }, 403);

  const place = await db.select().from(places).where(eq(places.id, placeId)).get();
  if (!place || place.businessProfileId !== profile.id) {
    return c.json({ error: 'Kein Zugriff auf diesen Ort.' }, 403);
  }

  const body    = c.req.valid('json');
  const current = JSON.parse(place.attributesJson ?? '{}') as Record<string, unknown>;
  const updated = { ...current };

  if (body.website       !== undefined) updated.website       = body.website;
  if (body.hoursSchedule !== undefined) updated.hoursSchedule = body.hoursSchedule;
  if (body.hoursUrl      !== undefined) updated.hoursUrl      = body.hoursUrl;
  if (body.prices        !== undefined) updated.prices        = body.prices;
  if (body.pricesUrl     !== undefined) updated.pricesUrl     = body.pricesUrl;
  if (body.specialInfo   !== undefined) updated.specialInfo   = body.specialInfo;

  await db.update(places)
    .set({ attributesJson: JSON.stringify(updated) })
    .where(eq(places.id, placeId));

  return c.json({ ok: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hydratePlace(p: typeof places.$inferSelect) {
  return {
    ...p,
    vibe:       JSON.parse(p.vibeJson    ?? '[]'),
    gallery:    JSON.parse(p.galleryJson ?? '[]'),
    tips:       JSON.parse(p.tipsJson    ?? '[]'),
    attributes: JSON.parse(p.attributesJson ?? '{}'),
  };
}

export default router;
