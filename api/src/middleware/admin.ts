import { createMiddleware } from 'hono/factory';

export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get('user');
  if (!user?.isAdmin) {
    return c.json({ error: 'Kein Zugriff. Nur für Admins.' }, 403);
  }
  await next();
});
