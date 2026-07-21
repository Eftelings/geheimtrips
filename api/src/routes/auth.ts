import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { JWT_SECRET, requireAuth } from '../middleware/auth.js';
import { sendMail, mailConfigured } from '../lib/mailer.js';
import { checkUserNaming, containsBannedWord } from '../lib/moderation.js';

// E-Mail: Format inkl. gültiger Domain-Endung (Zod .email() lässt „a@b" ohne TLD zu)
const emailField = z.string().email().refine(e => /@[^@\s]+\.[a-z]{2,}$/i.test(e), 'Bitte eine gültige E-Mail-Adresse angeben.');

// zValidator mit lesbarer Fehlermeldung. Ohne Hook liefert Hono bei Validierungsfehlern die rohe
// ZodError-Struktur — der Client zeigt daraus „[object Object]". Wir übersetzen die erste Issue.
function jsonBody<T extends z.ZodTypeAny>(schema: T) {
  const map: Record<string, string> = {
    email:    'Bitte eine gültige E-Mail-Adresse angeben.',
    password: 'Das Passwort muss mindestens 6 Zeichen haben.',
    name:     'Bitte gib einen Namen an.',
    handle:   'Der Handle darf nur Kleinbuchstaben, Zahlen und _ enthalten.',
  };
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = String(issue?.path[0] ?? '');
      return c.json({ error: map[field] ?? issue?.message ?? 'Eingabe ungültig.' }, 400);
    }
  });
}

// Handle aus Name/E-Mail ableiten, falls keiner angegeben — und eindeutig machen.
function slugHandle(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '').slice(0, 20);
}
async function uniqueHandle(base: string): Promise<string> {
  const root = (slugHandle(base) || 'entdecker').padEnd(2, '1');
  for (let i = 0; i < 25; i++) {
    const cand = i === 0 ? root : `${root}${Math.floor(1000 + Math.random() * 9000)}`;
    const taken = await db.select().from(users).where(eq(users.handle, cand)).get();
    if (!taken) return cand;
  }
  return `${root}${randomBytes(3).toString('hex')}`;
}

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

// E-Mail-Bestätigung (Double-Opt-in): Spalten + Token-Tabelle zur Laufzeit anlegen.
// email_verified DEFAULT 1 → BESTEHENDE Nutzer gelten als bestätigt (nie nachträglich aussperren);
// neue Konten setzt /register explizit (0, wenn Mailversand aktiv ist).
await db.run(sql`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN email_opt_in   INTEGER NOT NULL DEFAULT 0`).catch(() => {});
await db.run(sql`CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`).catch(() => {});

// Alter-Spalte nachrüsten (für Phase C / Profil)
await db.run(sql`ALTER TABLE users ADD COLUMN age INTEGER`).catch(() => {});
// Creator-Profil (Epic 1): Titelbild, weitere Social-Links, Follower-Opt-in
await db.run(sql`ALTER TABLE users ADD COLUMN cover_url TEXT`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN facebook TEXT`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN snapchat TEXT`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN allow_followers INTEGER NOT NULL DEFAULT 0`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN visited_public INTEGER NOT NULL DEFAULT 0`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN created_public INTEGER NOT NULL DEFAULT 1`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN avatar_zoom REAL NOT NULL DEFAULT 1`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN cover_zoom REAL NOT NULL DEFAULT 1`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN saved_public INTEGER NOT NULL DEFAULT 0`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN trips_public INTEGER NOT NULL DEFAULT 0`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN photos_public INTEGER NOT NULL DEFAULT 0`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN favorites_public INTEGER NOT NULL DEFAULT 0`).catch(() => {});
// Bild-Ausschnitt (Fokuspunkt 0–1) für Avatar + Titelbild
await db.run(sql`ALTER TABLE users ADD COLUMN avatar_crop_x REAL NOT NULL DEFAULT 0.5`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN avatar_crop_y REAL NOT NULL DEFAULT 0.5`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN cover_crop_x REAL NOT NULL DEFAULT 0.5`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN cover_crop_y REAL NOT NULL DEFAULT 0.5`).catch(() => {});
// Standort-Spalten nachrüsten (Phase C / „Neue Leute in der Nähe")
await db.run(sql`ALTER TABLE users ADD COLUMN lat REAL`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN lng REAL`).catch(() => {});
await db.run(sql`ALTER TABLE users ADD COLUMN location_updated_at TEXT`).catch(() => {});

const APP_URL = (process.env.APP_URL ?? 'https://www.geheimtrips.de').replace(/\/$/, '');

/**
 * Cloudflare Turnstile — Bot-Schutz für Registrierung und Passwort-Reset.
 * Ohne TURNSTILE_SECRET wird nicht geprüft: lokale Umgebungen und Installationen ohne
 * Schlüssel laufen unverändert weiter. Mit Schlüssel ist ein gültiger Token Pflicht.
 */
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET ?? '';
async function captchaOk(token: unknown, ip?: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;
  if (typeof token !== 'string' || !token) return false;
  try {
    const body = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = await res.json() as { success?: boolean };
    return !!data.success;
  } catch {
    return false;   // Prüfdienst nicht erreichbar → lieber abweisen als durchwinken
  }
}
const clientIp = (c: { req: { header: (k: string) => string | undefined } }) =>
  c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function makeToken(userId: number): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

// Bestätigungs-Mail mit Einmal-Token (gehasht gespeichert, 3 Tage gültig) verschicken.
async function sendVerificationEmail(user: { id: number; email: string; name: string }): Promise<void> {
  const raw = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 Tage
  await db.run(sql`INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${sha256(raw)}, ${expiresAt})`).catch(() => {});
  const link = `${APP_URL}/e-mail-bestaetigen?token=${raw}`;
  await sendMail({
    to: user.email,
    subject: 'Bestätige deine Anmeldung · Geheimtrips.de',
    text: `Hallo ${user.name},\n\nschön, dass du dabei bist! Bitte bestätige deine Anmeldung über diesen Link (3 Tage gültig):\n${link}\n\nErst danach kannst du eigene Geheimtrips einreichen und bewerten.\n\nLiebe Grüße\nDavid & Lea`,
    html: `<p>Hallo ${user.name},</p><p>schön, dass du dabei bist! Bitte bestätige deine Anmeldung über diesen Link (3&nbsp;Tage gültig):</p><p><a href="${link}">${link}</a></p><p>Erst danach kannst du eigene Geheimtrips einreichen und bewerten.</p><p>Liebe Grüße<br>David &amp; Lea</p>`,
  }).catch(e => console.error('Bestätigungs-Mail fehlgeschlagen:', (e as Error).message));
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: emailField,
  password: z.string().min(6),
  name: z.string().min(1).max(60),
  // Optional: leer/fehlend → wird serverseitig aus dem Namen erzeugt. Nur Format prüfen, wenn da.
  handle: z.string().max(30).regex(/^[a-z0-9_]*$/, 'Der Handle darf nur Kleinbuchstaben, Zahlen und _ enthalten.').optional(),
  // Zustimmung zum E-Mail-Empfang (Newsletter/Hinweise) — die Doppel-Bestätigung erfolgt über den Link.
  emailOptIn: z.boolean().optional().default(false),
  // Turnstile-Token; ohne konfiguriertes Secret wird es ignoriert.
  captcha: z.string().optional().default(''),
});

router.post('/login', jsonBody(loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) return c.json({ error: 'E-Mail oder Passwort falsch.' }, 401);
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return c.json({ error: 'E-Mail oder Passwort falsch.' }, 401);
  const token = await makeToken(user.id);
  const { passwordHash: _, ...safeUser } = user;
  return c.json({ token, user: safeUser });
});

router.post('/register', jsonBody(registerSchema), async (c) => {
  const { email, password, name, emailOptIn, captcha } = c.req.valid('json');
  if (!(await captchaOk(captcha, clientIp(c)))) {
    return c.json({ error: 'Sicherheitsprüfung fehlgeschlagen. Bitte lade die Seite neu.' }, 400);
  }
  // Handle optional: getippten übernehmen (mind. 2 Zeichen), sonst aus dem Namen erzeugen.
  let handle = (c.req.valid('json').handle ?? '').trim().toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(handle)) handle = await uniqueHandle(name || email.split('@')[0]);
  // Blacklist: Schimpfwörter / Hassrede in Name oder Handle blockieren
  const namingError = checkUserNaming(name, handle);
  if (namingError) return c.json({ error: namingError }, 400);
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return c.json({ error: 'Diese E-Mail ist bereits registriert.' }, 409);
  const handleTaken = await db.select().from(users).where(eq(users.handle, handle)).get();
  if (handleTaken) return c.json({ error: 'Dieser Handle ist bereits vergeben. Wähle einen anderen.' }, 409);
  const passwordHash = await bcrypt.hash(password, 10);
  // Ohne konfigurierten Mailversand niemanden aussperren → dann direkt als bestätigt anlegen.
  const emailVerified = !mailConfigured;
  const [user] = await db.insert(users)
    .values({ email, passwordHash, name, handle, emailVerified, emailOptIn })
    .returning();
  if (!emailVerified) await sendVerificationEmail(user);
  const token = await makeToken(user.id);
  const { passwordHash: _, ...safeUser } = user;
  return c.json({ token, user: safeUser }, 201);
});

/**
 * POST /auth/google — Anmelden mit Google.
 *
 * Der Browser holt über Google Identity Services ein signiertes ID-Token; hier wird nur
 * dessen Signatur gegen Googles öffentliche Schlüssel geprüft (plus Aussteller und
 * Empfänger). Kein Client Secret, kein Redirect — die Client-ID ist öffentlich und steht
 * ebenso im ausgelieferten Frontend, deshalb liegt sie hier als Vorgabe im Code und lässt
 * sich per GOOGLE_CLIENT_ID überschreiben.
 */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  ?? '581781823367-7sr1ldvvacifaffdmhfip6i5os3iq36m.apps.googleusercontent.com';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

router.post('/google',
  zValidator('json', z.object({ credential: z.string().min(20) })),
  async (c) => {
    const { credential } = c.req.valid('json');

    let claims: { email?: string; email_verified?: boolean | string; name?: string; picture?: string };
    try {
      const { payload } = await jwtVerify(credential, googleKeys, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: GOOGLE_CLIENT_ID,
      });
      claims = payload as typeof claims;
    } catch {
      return c.json({ error: 'Google-Anmeldung konnte nicht geprüft werden. Bitte versuch es erneut.' }, 401);
    }

    const email = (claims.email ?? '').toLowerCase().trim();
    // Nur bestätigte Adressen: sonst könnte man sich über eine fremde Adresse einloggen.
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    if (!email || !verified) {
      return c.json({ error: 'Diese Google-Adresse ist nicht bestätigt.' }, 400);
    }

    // Bestehendes Konto mit derselben Adresse übernehmen — sonst entstünden zwei Konten
    // zur selben Person. Die Adresse gilt hier als bewiesen (Google hat sie bestätigt).
    const existing = await db.select().from(users)
      .where(sql`lower(${users.email}) = ${email}`).get();
    if (existing) {
      if (existing.isBanned) return c.json({ error: 'Dieses Konto ist gesperrt.' }, 403);
      // Wer sich per Google anmeldet, hat die Adresse belegt → offene Bestätigung erledigt.
      if (!existing.emailVerified) {
        await db.update(users).set({ emailVerified: true }).where(eq(users.id, existing.id));
        existing.emailVerified = true;
      }
      const token = await makeToken(existing.id);
      const { passwordHash: _, ...safeUser } = existing;
      return c.json({ token, user: safeUser, created: false });
    }

    const name = (claims.name ?? '').trim() || email.split('@')[0];
    const handle = await uniqueHandle(name);
    const namingError = checkUserNaming(name, handle);
    if (namingError) return c.json({ error: namingError }, 400);
    // Zufälliges Passwort: das Konto wird über Google geöffnet. Wer später ein Passwort
    // will, setzt es über „Passwort vergessen" — dafür ist die Adresse ja bestätigt.
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    const [user] = await db.insert(users)
      .values({ email, passwordHash, name, handle, emailVerified: true, emailOptIn: false })
      .returning();
    const token = await makeToken(user.id);
    const { passwordHash: _, ...safeUser } = user;
    return c.json({ token, user: safeUser, created: true }, 201);
  });

// POST /auth/verify-email — Anmeldung per Token bestätigen (Link aus der Mail)
router.post('/verify-email',
  zValidator('json', z.object({ token: z.string().min(10) })),
  async (c) => {
    const { token } = c.req.valid('json');
    const rows = await db.all(sql`SELECT id, user_id FROM email_verification_tokens
      WHERE token_hash = ${sha256(token)} AND used = 0 AND expires_at > ${new Date().toISOString()}
      ORDER BY id DESC LIMIT 1`) as { id: number; user_id: number }[];
    const row = rows[0];
    if (!row) return c.json({ error: 'Link ungültig oder abgelaufen. Fordere in deinem Profil einen neuen an.' }, 400);
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, row.user_id));
    await db.run(sql`UPDATE email_verification_tokens SET used = 1 WHERE user_id = ${row.user_id}`).catch(() => {});
    return c.json({ ok: true });
  }
);

// POST /auth/resend-verification — neue Bestätigungs-Mail anfordern (eingeloggt)
router.post('/resend-verification', requireAuth, async (c) => {
  const user = c.get('user');
  if (user.emailVerified) return c.json({ ok: true, alreadyVerified: true });
  // Kein Mailversand konfiguriert → sofort bestätigen, statt eine Mail zu versprechen, die nie kommt.
  if (!mailConfigured) {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
    return c.json({ ok: true, autoVerified: true });
  }
  await sendVerificationEmail(user);
  return c.json({ ok: true });
});

router.get('/me', requireAuth, (c) => {
  const { passwordHash: _, ...safeUser } = c.get('user');
  return c.json({ user: safeUser });
});

router.patch('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const allowed = ['name', 'bio', 'instagram', 'tiktok', 'website', 'facebook', 'snapchat',
                   'allowFollowers', 'visitedPublic', 'createdPublic', 'savedPublic',
                   'tripsPublic', 'photosPublic', 'favoritesPublic', 'profileVisible',
                   'notificationsEnabled', 'playVideos', 'meetPeopleEnabled'] as const;
  // Name darf nachträglich nicht zu einem Sperrbegriff geändert werden
  if (typeof body.name === 'string' && containsBannedWord(body.name)) {
    return c.json({ error: 'Dieser Name ist nicht erlaubt. Bitte wähle einen anderen.' }, 400);
  }
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  // Profil- + Titelbild: nur eigene Uploads bzw. leeren (kein beliebiges Hotlink-Ziel setzen)
  if ('avatarUrl' in body) {
    const u = body.avatarUrl;
    update.avatarUrl = (typeof u === 'string' && /^\/(?:api\/)?uploads\//.test(u)) ? u : null;
  }
  if ('coverUrl' in body) {
    const u = body.coverUrl;
    update.coverUrl = (typeof u === 'string' && /^\/(?:api\/)?uploads\//.test(u)) ? u : null;
  }
  // Bild-Ausschnitt (Fokuspunkt) — auf 0–1 begrenzt
  for (const key of ['avatarCropX', 'avatarCropY', 'coverCropX', 'coverCropY'] as const) {
    if (key in body) {
      const n = Number(body[key]);
      if (Number.isFinite(n)) update[key] = Math.min(1, Math.max(0, n));
    }
  }
  // Zoomstufe — 1 = formatfüllend, darüber wird ins Bild hineingezoomt
  for (const key of ['avatarZoom', 'coverZoom'] as const) {
    if (key in body) {
      const n = Number(body[key]);
      if (Number.isFinite(n)) update[key] = Math.min(4, Math.max(1, n));
    }
  }
  // Alter separat (Zahl/leer → null, plausibel begrenzt)
  if ('age' in body) {
    const n = body.age == null || body.age === '' ? null : Number(body.age);
    update.age = n != null && Number.isFinite(n) && n >= 13 && n <= 120 ? Math.floor(n) : null;
  }
  // Folgen abschalten heißt: die bestehenden Follower fallen weg. Das ist im Profil so
  // angekündigt (Schieberegler mit Warnung) — also hier auch wirklich ausführen.
  if (update.allowFollowers === false) {
    await db.run(sql`DELETE FROM follows WHERE followee_id = ${user.id}`).catch(() => {});
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
  zValidator('json', z.object({ email: z.string().email(), captcha: z.string().optional().default('') })),
  async (c) => {
    const { email, captcha } = c.req.valid('json');
    if (!(await captchaOk(captcha, clientIp(c)))) {
      return c.json({ error: 'Sicherheitsprüfung fehlgeschlagen. Bitte lade die Seite neu.' }, 400);
    }
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
