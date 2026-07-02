import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { JWT_SECRET, requireAuth } from '../middleware/auth.js';
import { sendMail } from '../lib/mailer.js';

const router = new Hono();

// Tabelle für Passwort-Reset-Tokens (Laufzeit-Anlage, keine Migration nötig).
await db.run(sql`CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`).catch(() => {});

// Alter-Spalte nachrüsten (für Phase C / Profil)
await db.run(sql`ALTER TABLE users ADD COLUMN age INTEGER`).catch(() => {});
// Standort-Spalten nachrüsten (Phase C / „Neue Leute in der Nähe")
await db.run(sql`ALTER TABLE users ADD COLUMN lat REAL`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN lng REAL`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN location_updated_at TEXT`).catch(() => {});

const APP_URL = (process.env.APP_URL ?? 'https://www.geheimtrips.de').replace(/\/$/, '');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

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
  // Alter separat (Zahl/leer → null, plausibel begrenzt)
  if ('age' in body) {
    const n = body.age == null || body.age === '' ? null : Number(body.age);
    update.age = n != null && Number.isFinite(n) && n >= 13 && n <= 120 ? Math.floor(n) : null;
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

// POST /auth/forgot — Reset-Link anfordern. Verrät nie, ob die E-Mail existiert.
router.post('/forgot',
  zValidator('json', z.object({ email: z.string().email() })),
  async (c) => {
    const { email } = c.req.valid('json');
    const user = await db.select().from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`).get();
    if (user) {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 Stunde gültig
      await db.run(sql`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES (${user.id}, ${sha256(token)}, ${expiresAt})`).catch(() => {});
      const link = `${APP_URL}/reset?token=${token}`;
      await sendMail({
        to: user.email,
        subject: 'Passwort zurücksetzen · Geheimtrips.de',
        text: `Hallo ${user.name},\n\nsetze dein Passwort über diesen Link zurück (1 Stunde gültig):\n${link}\n\nFalls du das nicht angefordert hast, ignoriere diese E-Mail einfach.\n\nLiebe Grüße\nDavid & Lea`,
        html: `<p>Hallo ${user.name},</p><p>setze dein Passwort über diesen Link zurück (1&nbsp;Stunde gültig):</p><p><a href="${link}">${link}</a></p><p>Falls du das nicht angefordert hast, ignoriere diese E-Mail einfach.</p><p>Liebe Grüße<br>David &amp; Lea</p>`,
      }).catch(e => console.error('Reset-Mail fehlgeschlagen:', (e as Error).message));
    }
    return c.json({ ok: true });
  }
);

// POST /auth/reset — neues Passwort mit gültigem Token setzen
router.post('/reset',
  zValidator('json', z.object({ token: z.string().min(10), newPassword: z.string().min(6) })),
  async (c) => {
    const { token, newPassword } = c.req.valid('json');
    const rows = await db.all(sql`SELECT id, user_id FROM password_reset_tokens
      WHERE token_hash = ${sha256(token)} AND used = 0 AND expires_at > ${new Date().toISOString()}
      ORDER BY id DESC LIMIT 1`) as { id: number; user_id: number }[];
    const row = rows[0];
    if (!row) return c.json({ error: 'Link ungültig oder abgelaufen. Bitte fordere einen neuen an.' }, 400);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, row.user_id));
    // Alle Tokens dieser Person entwerten (auch das eben genutzte)
    await db.run(sql`UPDATE password_reset_tokens SET used = 1 WHERE user_id = ${row.user_id}`).catch(() => {});
    return c.json({ ok: true });
  }
);

export default router;
