import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { WebSocketServer } from 'ws';
import { handleMessageConnection } from './lib/messageSocket.js';
import type { Server } from 'http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { sql } from 'drizzle-orm';
import { injectPlaceMeta, type SeoPlace } from './lib/seo.js';
import authRouter from './routes/auth.js';
import placesRouter from './routes/places.js';
import tripsRouter from './routes/trips.js';
import rankingsRouter from './routes/rankings.js';
import friendsRouter from './routes/friends.js';
import adminRouter from './routes/admin.js';
import businessRouter from './routes/business.js';
import gameHttpRouter, { handleGameConnection } from './routes/game.js';
import { uploadRouter, serveRouter } from './routes/media.js';
import geoRouter from './routes/geo.js';
import discoverRouter from './routes/discover.js';
import categoriesRouter from './routes/categories.js';
import notificationsRouter from './routes/notifications.js';
import messagesRouter from './routes/messages.js';
import usersRouter from './routes/users.js';
import aiRouter from './routes/ai.js';
import peopleRouter from './routes/people.js';
import taxonomyRouter from './routes/taxonomy.js';

const app = new Hono();

app.use('*', logger());
// CORS: bei Single-Origin (Frontend wird mit ausgeliefert) nicht nötig.
// Für getrennte Domains: CORS_ORIGINS="https://geheimtrips.de,https://www.geheimtrips.de"
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];
app.use('/api/*', cors({ origin: corsOrigins, credentials: true }));

// ── Alle API-Routen unter /api (vermeidet Kollisionen mit SPA-Pfaden) ──────────
const api = new Hono();
api.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));
api.route('/auth', authRouter);
api.route('/places', placesRouter);
api.route('/trips', tripsRouter);
api.route('/rankings', rankingsRouter);
api.route('/friends', friendsRouter);
api.route('/admin', adminRouter);
api.route('/business', businessRouter);
api.route('/game', gameHttpRouter);
api.route('/media', uploadRouter);
api.route('/uploads', serveRouter);
api.route('/geo', geoRouter);
api.route('/discover', discoverRouter);
api.route('/categories', categoriesRouter);
api.route('/notifications', notificationsRouter);
api.route('/messages', messagesRouter);
api.route('/users', usersRouter);
api.route('/ai', aiRouter);
api.route('/people', peopleRouter);
api.route('/taxonomy', taxonomyRouter);
app.route('/api', api);

// Alt-Bestand: frühe Uploads wurden als „/uploads/x.jpg" (ohne /api) gespeichert.
// Ohne diesen Mount fallen sie in den SPA-Fallback und liefern index.html statt des
// Bildes aus (HTTP 200, text/html) → Bild kaputt. Deshalb zusätzlich am Root bedienen.
app.route('/uploads', serveRouter);

api.notFound((c) => c.json({ error: 'Route nicht gefunden.' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Serverfehler.' }, 500);
});

// ── Frontend statisch ausliefern (Single-Origin-Deploy) ───────────────────────
// STATIC_DIR (relativ zum Arbeitsverzeichnis) zeigt auf das gebaute web/dist.
// Nicht gesetzt (lokale Entwicklung) → Vite liefert das Frontend separat aus.
const STATIC_DIR = process.env.STATIC_DIR;
if (STATIC_DIR) {
  // Gehashte Assets (Vite: /assets/index-XXXX.js|css) sind unveränderlich → sehr lange cachen
  app.use('/assets/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('/*', serveStatic({ root: STATIC_DIR }));
  const indexHtml = readFileSync(resolve(process.cwd(), STATIC_DIR, 'index.html'), 'utf8');

  // ── SEO ──────────────────────────────────────────────────────────────────────
  // Öffentliche Origin: hinter einem Proxy (Railway) terminiert TLS davor, c.req.url
  // meldet dann http://. Deshalb x-forwarded-* auswerten; PUBLIC_ORIGIN übersteuert alles.
  const publicOrigin = (c: { req: { url: string; header: (k: string) => string | undefined } }): string => {
    const env = process.env.PUBLIC_ORIGIN;
    if (env) return env.replace(/\/+$/, '');
    const u = new URL(c.req.url);
    const proto = c.req.header('x-forwarded-proto') ?? u.protocol.replace(':', '');
    const host  = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? u.host;
    return `${proto}://${host}`;
  };

  app.get('/robots.txt', (c) => {
    const origin = publicOrigin(c);
    return c.text([
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api',
      'Disallow: /profil',
      'Disallow: /postfach',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
      '',
    ].join('\n'));
  });

  app.get('/sitemap.xml', async (c) => {
    const origin = publicOrigin(c);
    const rows = await db.all<{ id: string; createdAt: string | null }>(
      sql`SELECT id, created_at AS createdAt FROM places ORDER BY created_at DESC`,
    ).catch(() => []);
    const entries = [
      `<url><loc>${origin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...rows.map(r =>
        `<url><loc>${origin}/ort/${r.id}</loc>`
        + (r.createdAt ? `<lastmod>${String(r.createdAt).slice(0, 10)}</lastmod>` : '')
        + `<changefreq>weekly</changefreq><priority>0.8</priority></url>`),
    ].join('');
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,
      200, { 'Content-Type': 'application/xml; charset=utf-8' },
    );
  });

  // Ort-Detailseite: Meta-Tags serverseitig einsetzen (Google + Social/Bing sehen echten Inhalt)
  app.get('/ort/:id', async (c) => {
    const rows = await db.all<SeoPlace>(sql`
      SELECT id, name, region, short, hero, lat, lng FROM places WHERE id = ${c.req.param('id')} LIMIT 1
    `).catch(() => []);
    const place = rows[0];
    if (!place) return c.html(indexHtml, 404);
    return c.html(injectPlaceMeta(indexHtml, place, publicOrigin(c)));
  });

  // SPA-Fallback: alle übrigen Pfade auf index.html (React-Router übernimmt)
  app.get('/*', (c) => c.html(indexHtml));
} else {
  app.notFound((c) => c.json({ error: 'Route nicht gefunden.' }, 404));
}

const PORT = Number(process.env.PORT ?? 3001);

// Warnung, falls in Produktion noch das Dev-JWT-Secret aktiv ist
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('⚠️  WARNUNG: JWT_SECRET ist nicht gesetzt — bitte in Produktion zwingend ein eigenes Secret setzen!');
}

// Basis-Tabellen (users, places, …) anlegen. Auf einer frischen DB — z.B. dem
// Railway-Volume — werden so alle Tabellen erstellt; bestehende DBs bleiben unberührt.
try {
  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');
  await migrate(db, { migrationsFolder });
  console.log('Migrationen angewendet.');
} catch (e) {
  console.error('Migration übersprungen (Tabellen evtl. bereits vorhanden):', (e as Error).message);
}

// Admin-Bootstrap: in ADMIN_EMAILS (kommagetrennt) gelistete Konten werden beim
// Start zu Admins gemacht. So braucht es keinen Shell-Zugriff auf die DB; der
// Eintrag ist idempotent und kann dauerhaft gesetzt bleiben.
const adminEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
if (adminEmails.length) {
  try {
    for (const email of adminEmails) {
      await db.update(users).set({ isAdmin: true }).where(sql`lower(${users.email}) = ${email}`);
    }
    console.log(`Admin-Bootstrap angewendet für: ${adminEmails.join(', ')}`);
  } catch (e) {
    console.error('Admin-Bootstrap fehlgeschlagen:', (e as Error).message);
  }
}

const httpServer = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Geheimtrips API läuft auf Port ${PORT}`);
}) as Server;

// ── WebSocket-Server — am selben HTTP-Server, zwei Pfade ──────────────────────
//    /api/game/ws     → Geheimquiz (Spielrunden)
//    /api/messages/ws → Direktnachrichten (Live statt Nachfragen im Sekundentakt)
const wss = new WebSocketServer({ noServer: true });
const wssMessages = new WebSocketServer({ noServer: true });
wss.on('connection', (ws) => handleGameConnection(ws));
wssMessages.on('connection', (ws, request) => {
  void handleMessageConnection(ws, request.url ?? '/');
});

httpServer.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  if (pathname.startsWith('/api/game/ws')) {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  } else if (pathname.startsWith('/api/messages/ws')) {
    wssMessages.handleUpgrade(request, socket, head, (ws) => wssMessages.emit('connection', ws, request));
  } else {
    socket.destroy();
  }
});
