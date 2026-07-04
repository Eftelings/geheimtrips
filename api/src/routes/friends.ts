import { Hono } from 'hono';
import { db } from '../db/index.js';
import { friendships, users } from '../db/schema.js';
import { eq, or, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { notify } from '../lib/notify.js';

const router = new Hono();

// GET /friends — accepted friends
router.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const rows = await db.select().from(friendships)
    .where(and(
      or(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, user.id)),
      eq(friendships.status, 'accepted')
    )).all();
  const friendIds = rows.map(r => r.requesterId === user.id ? r.addresseeId : r.requesterId);
  if (!friendIds.length) return c.json([]);
  const friends = await db.select({
    id: users.id, name: users.name, handle: users.handle, avatarUrl: users.avatarUrl, bio: users.bio,
  }).from(users).all();
  return c.json(friends.filter(f => friendIds.includes(f.id)));
});

// GET /friends/requests — incoming pending requests
router.get('/requests', requireAuth, async (c) => {
  const user = c.get('user');
  const rows = await db.select().from(friendships)
    .where(and(eq(friendships.addresseeId, user.id), eq(friendships.status, 'pending'))).all();
  const ids = rows.map(r => r.requesterId);
  if (!ids.length) return c.json([]);
  const requesters = await db.select({
    id: users.id, name: users.name, handle: users.handle, avatarUrl: users.avatarUrl,
  }).from(users).all();
  return c.json(requesters.filter(u => ids.includes(u.id)).map(u => ({
    ...u,
    friendshipId: rows.find(r => r.requesterId === u.id)!.id,
  })));
});

// POST /friends/request/:handle
router.post('/request/:handle', requireAuth, async (c) => {
  const user = c.get('user');
  const handle = c.req.param('handle');
  const target = await db.select().from(users).where(eq(users.handle, handle)).get();
  if (!target) return c.json({ error: 'Nutzer nicht gefunden.' }, 404);
  if (target.id === user.id) return c.json({ error: 'Du kannst dich nicht selbst hinzufügen.' }, 400);
  const existing = await db.select().from(friendships).where(
    or(
      and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, target.id)),
      and(eq(friendships.requesterId, target.id), eq(friendships.addresseeId, user.id))
    )
  ).get();
  if (existing) return c.json({ error: 'Anfrage bereits vorhanden.' }, 409);
  await db.insert(friendships).values({ requesterId: user.id, addresseeId: target.id });
  return c.json({ ok: true });
});

// POST /friends/accept/:id
router.post('/accept/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const row = await db.select().from(friendships)
    .where(and(eq(friendships.id, id), eq(friendships.addresseeId, user.id))).get();
  if (!row) return c.json({ error: 'Anfrage nicht gefunden.' }, 404);
  await db.update(friendships).set({ status: 'accepted' }).where(eq(friendships.id, id));
  await notify({
    userId: row.requesterId, type: 'friend_accept', title: 'Freundschaftsanfrage angenommen',
    body: `${user.name} hat deine Freundschaftsanfrage angenommen.`,
    link: `/u/${user.id}`, actorId: user.id,
  });
  return c.json({ ok: true });
});

// DELETE /friends/decline/:id
router.delete('/decline/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  await db.delete(friendships)
    .where(and(eq(friendships.id, id), eq(friendships.addresseeId, user.id)));
  return c.json({ ok: true });
});

export default router;
