import { createMiddleware } from 'hono/factory';
import { jwtVerify } from 'jose';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const JWT_SECRET_RAW = process.env.JWT_SECRET ?? 'geheimtrips-dev-secret-change-in-prod';
export const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

export type AuthUser = typeof users.$inferSelect;

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Nicht eingeloggt.' }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = (payload as { userId: number }).userId;
    const user = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return c.json({ error: 'Nutzer nicht gefunden.' }, 401);
    c.set('user', user);
    await next();
  } catch {
    return c.json({ error: 'Ungültiger Token.' }, 401);
  }
});
