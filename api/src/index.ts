import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { sql } from 'drizzle-orm';
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
api.route('/users', usersRouter);
api.route('/ai', aiRouter);
api.route('/people', peopleRouter);
api.route('/taxonomy', taxonomyRouter);
app.route('/api', api);

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
  // SPA-Fallback: alle übrigen Pfade auf index.html (React-Router übernimmt)
  const indexHtml = readFileSync(resolve(process.cwd(), STATIC_DIR, 'index.html'), 'utf8');
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

// ── WebSocket-Server (Geheimquiz) — am selben HTTP-Server, Pfad /api/game/ws ───
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (ws) => handleGameConnection(ws));

httpServer.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  if (pathname.startsWith('/api/game/ws')) {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  } else {
    socket.destroy();
  }
});
