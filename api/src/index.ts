import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
