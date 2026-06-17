import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { JWT_SECRET, requireAuth } from '../middleware/auth.js';

const router = new Hono();

async function makeToken(userId: number): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  handle: z.string().min(2).regex(/^[a-z0-9_]+$/),
});

router.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) return c.json({ error: 'E-Mail oder Passwort falsch.' }, 401);
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return c.json({ error: 'E-Mail oder Passwort falsch.' }, 401);
  const token = await makeToken(user.id);
  const { passwordHash: _, ...safeUser } = user;
  return c.json({ token, user: safeUser });
});

router.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, name, handle } = c.req.valid('json');
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return c.json({ error: 'Diese E-Mail ist bereits registriert.' }, 409);
  const handleTaken = await db.select().from(users).where(eq(users.handle, handle)).get();
  if (handleTaken) return c.json({ error: 'Dieser Handle ist bereits vergeben.' }, 409);
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(users).values({ email, passwordHash, name, handle }).returning();
  const token = await makeToken(user.id);
  const { passwordHash: _, ...safeUser } = user;
  return c.json({ token, user: safeUser }, 201);
});

router.get('/me', requireAuth, (c) => {
  const { passwordHash: _, ...safeUser } = c.get('user');
  return c.json({ user: safeUser });
});

router.patch('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const allowed = ['name', 'bio', 'instagram', 'tiktok', 'website', 'profileVisible',
                   'notificationsEnabled', 'playVideos', 'meetPeopleEnabled'] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  const [updated] = await db.update(users).set(update).where(eq(users.id, user.id)).returning();
  const { passwordHash: _, ...safeUser } = updated;
  return c.json({ user: safeUser });
});

router.post('/change-password', requireAuth,
  zValidator('json', z.object({ currentPassword: z.string(), newPassword: z.string().min(6) })),
  async (c) => {
    const user = c.get('user');
    const { currentPassword, newPassword } = c.req.valid('json');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return c.json({ error: 'Aktuelles Passwort falsch.' }, 400);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    return c.json({ ok: true });
  }
);

export default router;
