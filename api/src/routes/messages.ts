import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users, friendships, places } from '../db/schema.js';
import { eq, and, or, sql, inArray } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { hydrate } from './places.js';
import { pushToUser } from '../lib/messageSocket.js';

/**
 * Direktnachrichten zwischen Freund:innen — getrennt von den Meldungen (Reviews,
 * Fragen, Änderungsanfragen). Eine Nachricht kann Text tragen, einen Ort oder beides;
 * so lässt sich ein Geheimtrip direkt ins Postfach schicken.
 */
const router = new Hono();

await db.run(sql`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  text TEXT,
  place_id TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`).catch(() => {});
await db.run(sql`CREATE INDEX IF NOT EXISTS messages_pair ON messages (from_user_id, to_user_id, id)`).catch(() => {});
// Einzelner Standort („Ich bin hier") hängt an der Nachricht selbst.
await db.run(sql`ALTER TABLE messages ADD COLUMN lat REAL`).catch(() => {});
await db.run(sql`ALTER TABLE messages ADD COLUMN lng REAL`).catch(() => {});

/**
 * Live-Standort: gilt immer nur für EIN Gespräch und läuft von selbst ab. Je Paar
 * höchstens eine Freigabe — eine neue ersetzt die alte (UNIQUE + INSERT OR REPLACE).
 * Abgelaufene Zeilen bleiben liegen und werden beim Lesen gefiltert; sie kosten nichts
 * und ein Aufräum-Job wäre mehr Maschinerie als Nutzen.
 */
await db.run(sql`CREATE TABLE IF NOT EXISTS live_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  lat REAL, lng REAL,
  updated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  UNIQUE(user_id, to_user_id)
)`).catch(() => {});

/** Sind die beiden befreundet? Nur dann darf geschrieben werden. */
async function areFriends(a: number, b: number): Promise<boolean> {
  const row = await db.select({ id: friendships.id }).from(friendships).where(and(
    eq(friendships.status, 'accepted'),
    or(
      and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
      and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
    ),
  )).get();
  return !!row;
}

/** GET /messages — ein Eintrag je Person: letzte Nachricht + ungelesene Anzahl. */
router.get('/', requireAuth, async (c) => {
  const me = c.get('user');
  const rows = await db.all<{
    id: number; from_user_id: number; to_user_id: number;
    text: string | null; place_id: string | null; read_at: string | null; created_at: string;
  }>(sql`SELECT * FROM messages WHERE from_user_id = ${me.id} OR to_user_id = ${me.id} ORDER BY id DESC`)
    .catch(() => []);

  const byPartner = new Map<number, { last: typeof rows[number]; unread: number }>();
  for (const m of rows) {
    const partner = m.from_user_id === me.id ? m.to_user_id : m.from_user_id;
    const entry = byPartner.get(partner) ?? { last: m, unread: 0 };   // rows sind absteigend → erstes = neuestes
    if (m.to_user_id === me.id && !m.read_at) entry.unread += 1;
    byPartner.set(partner, entry);
  }
  if (!byPartner.size) return c.json([]);

  const partnerIds = [...byPartner.keys()];
  const people = await db.select({
    id: users.id, name: users.name, handle: users.handle,
    avatarUrl: users.avatarUrl, avatarCropX: users.avatarCropX, avatarCropY: users.avatarCropY,
  }).from(users).where(inArray(users.id, partnerIds)).all();

  const list = people.map(p => {
    const e = byPartner.get(p.id)!;
    return {
      user: p,
      unread: e.unread,
      last: {
        id: e.last.id, text: e.last.text, placeId: e.last.place_id,
        createdAt: e.last.created_at, fromMe: e.last.from_user_id === me.id,
      },
    };
  }).sort((a, b) => b.last.id - a.last.id);
  return c.json(list);
});

/** GET /messages/unread — Zähler für den Punkt am Postfach. */
router.get('/unread', requireAuth, async (c) => {
  const me = c.get('user');
  const rows = await db.all<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM messages WHERE to_user_id = ${me.id} AND read_at IS NULL`).catch(() => []);
  return c.json({ count: Number(rows[0]?.n ?? 0) });
});

/** GET /messages/:userId — der Verlauf mit einer Person; markiert eingehende als gelesen. */
router.get('/:userId', requireAuth, async (c) => {
  const me = c.get('user');
  const other = Number(c.req.param('userId'));
  const rows = await db.all<{
    id: number; from_user_id: number; text: string | null; place_id: string | null;
    lat: number | null; lng: number | null; created_at: string;
  }>(sql`SELECT id, from_user_id, text, place_id, lat, lng, created_at FROM messages
         WHERE (from_user_id = ${me.id} AND to_user_id = ${other})
            OR (from_user_id = ${other} AND to_user_id = ${me.id})
         ORDER BY id`).catch(() => []);

  const unread = rows.some(r => r.from_user_id === other);
  await db.run(sql`UPDATE messages SET read_at = datetime('now')
    WHERE to_user_id = ${me.id} AND from_user_id = ${other} AND read_at IS NULL`).catch(() => {});
  // Das Gegenueber darf wissen, dass gelesen wurde — sonst bliebe sein Zaehler stehen.
  if (unread) pushToUser(other, { type: 'read', by: me.id });

  // Verschickte Orte gleich mitliefern, damit die Kachel im Verlauf sofort steht
  const placeIds = [...new Set(rows.map(r => r.place_id).filter((x): x is string => !!x))];
  const placeRows = placeIds.length
    ? await db.select().from(places).where(inArray(places.id, placeIds)).all()
    : [];
  const placeById = Object.fromEntries(placeRows.map(p => [p.id, hydrate(p)]));

  const partner = await db.select({
    id: users.id, name: users.name, handle: users.handle,
    avatarUrl: users.avatarUrl, avatarCropX: users.avatarCropX, avatarCropY: users.avatarCropY,
  }).from(users).where(eq(users.id, other)).get();

  return c.json({
    partner: partner ?? null,
    messages: rows.map(r => ({
      id: r.id, text: r.text, placeId: r.place_id, lat: r.lat, lng: r.lng,
      createdAt: r.created_at, fromMe: r.from_user_id === me.id,
    })),
    places: placeById,
    // Laufende Live-Freigaben in beide Richtungen — abgelaufene fallen raus.
    live: await liveFor(me.id, other),
  });
});

/** POST /messages/:userId — Nachricht schicken (Text, Ort oder beides). */
router.post('/:userId', requireAuth,
  zValidator('json', z.object({
    text: z.string().max(2000).optional(),
    placeId: z.string().max(120).optional(),
    // Einzelner Standort — bleibt als Pin im Verlauf stehen
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })),
  async (c) => {
    const me = c.get('user');
    const other = Number(c.req.param('userId'));
    const { text, placeId, lat, lng } = c.req.valid('json');
    const hasPin = lat != null && lng != null;
    if (other === me.id) return c.json({ error: 'An dich selbst geht nicht.' }, 400);
    if (!text?.trim() && !placeId && !hasPin) return c.json({ error: 'Leere Nachricht.' }, 400);
    if (!(await areFriends(me.id, other))) {
      return c.json({ error: 'Schreiben geht nur unter Freund:innen.' }, 403);
    }
    if (placeId) {
      const exists = await db.select({ id: places.id }).from(places).where(eq(places.id, placeId)).get();
      if (!exists) return c.json({ error: 'Ort nicht gefunden.' }, 404);
    }
    await db.run(sql`INSERT INTO messages (from_user_id, to_user_id, text, place_id, lat, lng)
      VALUES (${me.id}, ${other}, ${text?.trim() || null}, ${placeId ?? null},
              ${hasPin ? lat : null}, ${hasPin ? lng : null})`);

    // Frisch geschriebene Zeile holen und beiden Seiten zustellen: der Empfaengerin,
    // damit sie es sofort sieht — und den eigenen weiteren Geraeten, damit dort
    // derselbe Stand steht.
    const row = await db.all<{ id: number; text: string | null; place_id: string | null; lat: number | null; lng: number | null; created_at: string }>(
      sql`SELECT id, text, place_id, lat, lng, created_at FROM messages
          WHERE from_user_id = ${me.id} AND to_user_id = ${other} ORDER BY id DESC LIMIT 1`).catch(() => []);
    const fresh = row[0];
    if (fresh) {
      const event = {
        type: 'message' as const, from: me.id, to: other,
        message: { id: fresh.id, text: fresh.text, placeId: fresh.place_id, lat: fresh.lat, lng: fresh.lng, createdAt: fresh.created_at },
      };
      pushToUser(other, event);
      pushToUser(me.id, event);
    }
    return c.json({ ok: true }, 201);
  });

/** Laufende Freigaben zwischen zwei Personen (abgelaufene werden ausgeblendet). */
async function liveFor(me: number, other: number) {
  const rows = await db.all<{ user_id: number; lat: number | null; lng: number | null; updated_at: string; expires_at: string }>(
    sql`SELECT user_id, lat, lng, updated_at, expires_at FROM live_locations
        WHERE ((user_id = ${me} AND to_user_id = ${other}) OR (user_id = ${other} AND to_user_id = ${me}))
          AND expires_at > datetime('now')`).catch(() => []);
  return rows.map(r => ({
    userId: r.user_id, lat: r.lat, lng: r.lng, updatedAt: r.updated_at, expiresAt: r.expires_at,
    mine: r.user_id === me,
  }));
}

/** POST /messages/:userId/live — Freigabe starten oder Position nachschieben. */
router.post('/:userId/live', requireAuth,
  zValidator('json', z.object({
    minutes: z.number().int().min(1).max(720).optional(),   // nur beim Start
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })),
  async (c) => {
    const me = c.get('user');
    const other = Number(c.req.param('userId'));
    const { minutes, lat, lng } = c.req.valid('json');
    if (!(await areFriends(me.id, other))) return c.json({ error: 'Nur unter Freund:innen.' }, 403);

    if (minutes) {
      await db.run(sql`INSERT OR REPLACE INTO live_locations (user_id, to_user_id, lat, lng, updated_at, expires_at)
        VALUES (${me.id}, ${other}, ${lat}, ${lng}, datetime('now'), datetime('now', ${'+' + minutes + ' minutes'}))`);
    } else {
      // Nachschieben nur, solange die Freigabe läuft — sonst wäre sie nicht beendbar.
      const res = await db.run(sql`UPDATE live_locations SET lat = ${lat}, lng = ${lng}, updated_at = datetime('now')
        WHERE user_id = ${me.id} AND to_user_id = ${other} AND expires_at > datetime('now')`);
      if (!res.rowsAffected) return c.json({ error: 'Keine laufende Freigabe.' }, 409);
    }

    const row = await db.all<{ expires_at: string }>(
      sql`SELECT expires_at FROM live_locations WHERE user_id = ${me.id} AND to_user_id = ${other}`).catch(() => []);
    const expiresAt = row[0]?.expires_at ?? '';
    pushToUser(other, { type: 'live', from: me.id, lat, lng, expiresAt });
    return c.json({ ok: true, expiresAt });
  });

/** DELETE /messages/:userId/live — Freigabe beenden. */
router.delete('/:userId/live', requireAuth, async (c) => {
  const me = c.get('user');
  const other = Number(c.req.param('userId'));
  await db.run(sql`DELETE FROM live_locations WHERE user_id = ${me.id} AND to_user_id = ${other}`).catch(() => {});
  pushToUser(other, { type: 'live_stop', from: me.id });
  return c.json({ ok: true });
});

export default router;
