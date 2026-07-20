/**
 * Geheimquiz — real-time multiplayer location-guessing game.
 *
 * Timer starts only after the first player pins a guess (14 s countdown).
 * Round advances only when BOTH players click "Weiter" (ready message).
 * Photos: hero + galleryJson sent per round; views tracked for end-of-game stats.
 * Results are persisted to quiz_games for logged-in players.
 */

import { Hono } from 'hono';
import type { WebSocket, RawData } from 'ws';
import { db } from '../db/index.js';
import { places, quizGames } from '../db/schema.js';
import { isNotNull, sql } from 'drizzle-orm';

// ── Ensure quiz_games table exists (no migration step needed) ─────────────────
db.run(sql`CREATE TABLE IF NOT EXISTS quiz_games (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id),
  player_name  TEXT NOT NULL,
  opponent_name TEXT NOT NULL,
  won          INTEGER NOT NULL,
  my_wins      INTEGER NOT NULL,
  opp_wins     INTEGER NOT NULL,
  rounds       INTEGER NOT NULL,
  played_at    TEXT DEFAULT (datetime('now'))
)`).catch(e => console.error('[quiz] table init error:', e));

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
  id: string;
  name: string;
  userId: number | null;   // DB user id — null for guests
  avatarUrl: string | null;   // Profilbild (vom Client mitgeschickt) → Kreis mit Bild statt Initiale
  ws: WebSocket;
  guess: { lat: number; lng: number } | null;
  wins: number;
}

interface PlaceForGame {
  id: string;
  name: string;
  region: string;
  categoryLabel: string;
  tagSlug: string | null;
  short: string;
  photos: string[];          // [hero, ...gallery]
  lat: number;
  lng: number;
  rating: number;
}

interface GameRoom {
  code: string;
  players: Map<string, Player>;
  state: 'playing' | 'done';
  round: number;
  places: PlaceForGame[];
  timer: ReturnType<typeof setInterval> | null;
  ticksLeft: number;
  guessedCount: number;
  timerStarted: boolean;     // timer only starts after first guess
  readyCount: number;        // players who clicked "Weiter"
  photosSeen: Map<string, number>; // pid → cumulative photos seen
}

// ── In-memory state ───────────────────────────────────────────────────────────

const rooms      = new Map<string, GameRoom>();
const wsToRoom   = new Map<WebSocket, string>();
const wsToPlayer = new Map<WebSocket, string>();

let matchQueue: { ws: WebSocket; pid: string; name: string; userId: number | null; avatarUrl: string | null } | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function genCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function send(ws: WebSocket, msg: object): void {
  try {
    if ((ws as WebSocket & { readyState: number }).readyState === 1)
      ws.send(JSON.stringify(msg));
  } catch { /* ignore */ }
}

function broadcast(room: GameRoom, msg: object): void {
  for (const p of room.players.values()) send(p.ws, msg);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function loadGamePlaces(): Promise<PlaceForGame[]> {
  const rows  = await db.select().from(places).where(isNotNull(places.lat)).all();
  const valid = rows.filter(p => p.lat != null && p.lng != null);
  for (let i = valid.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [valid[i], valid[j]] = [valid[j], valid[i]];
  }
  return valid.slice(0, 5).map(p => {
    let gallery: string[] = [];
    try {
      // galleryJson enthält heute Objekte ({ url, cropX, … }), früher reine Strings — beides zu URLs.
      gallery = (JSON.parse(p.galleryJson ?? '[]') as unknown[])
        .map(g => (typeof g === 'string' ? g : (g as { url?: string } | null)?.url))
        .filter((u): u is string => typeof u === 'string' && u.length > 0);
    } catch { /* skip */ }
    const photos = [p.hero, ...gallery].filter(Boolean);
    return {
      id: p.id, name: p.name, region: p.region,
      categoryLabel: p.categoryLabel,
      tagSlug: p.tagSlug ?? null,
      short: p.short,
      photos,
      lat: p.lat as number, lng: p.lng as number, rating: p.rating,
    };
  });
}

// ── Game state machine ────────────────────────────────────────────────────────

function startRound(room: GameRoom): void {
  room.guessedCount  = 0;
  room.timerStarted  = false;
  room.readyCount    = 0;
  for (const p of room.players.values()) p.guess = null;

  const place = room.places[room.round];
  if (!place) { endGame(room).catch(console.error); return; }

  broadcast(room, {
    type:   'round_start',
    round:  room.round + 1,
    total:  room.places.length,
    photos: place.photos,
    region: place.region,
  });
}

function endRound(room: GameRoom): void {
  if (room.timer) { clearInterval(room.timer); room.timer = null; }

  const place      = room.places[room.round];
  const playerList = [...room.players.values()];

  const results = playerList.map(p => ({
    playerId: p.id, name: p.name, guess: p.guess,
    dist: p.guess
      ? Math.round(haversineKm(p.guess.lat, p.guess.lng, place.lat, place.lng))
      : null,
  }));

  let roundWinnerId: string | null = null;
  const withGuess = results.filter(r => r.dist !== null);
  if (withGuess.length > 0) {
    const winner = withGuess.reduce((a, b) => a.dist! < b.dist! ? a : b);
    roundWinnerId = winner.playerId;
    const wp = room.players.get(roundWinnerId);
    if (wp) wp.wins++;
  }

  broadcast(room, {
    type: 'round_result',
    round: room.round + 1,
    place: {
      id: place.id, name: place.name, region: place.region,
      categoryLabel: place.categoryLabel, tagSlug: place.tagSlug, short: place.short,
      photos: place.photos,
      lat: place.lat, lng: place.lng, rating: place.rating,
    },
    results,
    roundWinnerId,
    scores: playerList.map(p => ({ playerId: p.id, name: p.name, wins: p.wins, avatarUrl: p.avatarUrl })),
  });
  // Advance is triggered by both players sending 'ready'
}

async function endGame(room: GameRoom): Promise<void> {
  room.state = 'done';
  if (room.timer) { clearInterval(room.timer); room.timer = null; }

  const playerList = [...room.players.values()];
  const sorted     = [...playerList].sort((a, b) => b.wins - a.wins);
  const isDraw     = playerList.length >= 2 && sorted[0]?.wins === sorted[1]?.wins;

  broadcast(room, {
    type:       'game_over',
    scores:     playerList.map(p => ({ playerId: p.id, name: p.name, wins: p.wins })),
    winnerId:   isDraw ? null : (sorted[0]?.id ?? null),
    photosSeen: playerList.map(p => ({
      playerId: p.id,
      name:     p.name,
      count:    room.photosSeen.get(p.id) ?? 0,
    })),
  });

  // Persist results for logged-in players
  for (const p of playerList) {
    if (!p.userId) continue;
    const opp = playerList.find(q => q.id !== p.id);
    if (!opp) continue;
    try {
      await db.insert(quizGames).values({
        userId:       p.userId,
        playerName:   p.name,
        opponentName: opp.name,
        won:          !isDraw && sorted[0]?.id === p.id,
        myWins:       p.wins,
        oppWins:      opp.wins,
        rounds:       room.places.length,
      });
    } catch (e) {
      console.error('[quiz] Failed to save result for', p.name, e);
    }
  }

  setTimeout(() => rooms.delete(room.code), 10 * 60 * 1000);
}

// ── WebSocket connection handler ──────────────────────────────────────────────

export function handleGameConnection(ws: WebSocket): void {
  ws.on('message', (raw: RawData) => {
    try {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

      // ── FIND_MATCH ────────────────────────────────────────────────
      if (msg.type === 'find_match') {
        const name   = String(msg.name ?? 'Spieler').trim().slice(0, 30) || 'Spieler';
        const userId = typeof msg.userId === 'number' ? msg.userId : null;
        const avatarUrl = typeof msg.avatarUrl === 'string' && msg.avatarUrl ? msg.avatarUrl : null;
        const pid    = `p${Date.now()}`;

        if (matchQueue && matchQueue.ws.readyState === 1) {
          const opp  = matchQueue;
          matchQueue = null;

          const code = genCode();
          const room: GameRoom = {
            code, players: new Map(), state: 'playing',
            round: 0, places: [], timer: null, ticksLeft: 14,
            guessedCount: 0, timerStarted: false, readyCount: 0,
            photosSeen: new Map(),
          };
          rooms.set(code, room);

          const p1: Player = { id: opp.pid, name: opp.name, userId: opp.userId, avatarUrl: opp.avatarUrl, ws: opp.ws, guess: null, wins: 0 };
          const p2: Player = { id: pid,     name,           userId,             avatarUrl,             ws,          guess: null, wins: 0 };
          room.players.set(opp.pid, p1);
          room.players.set(pid,     p2);
          wsToRoom.set(opp.ws, code);
          wsToRoom.set(ws,     code);
          wsToPlayer.set(opp.ws, opp.pid);
          wsToPlayer.set(ws,     pid);

          const playerList = [{ id: opp.pid, name: opp.name, avatarUrl: opp.avatarUrl }, { id: pid, name, avatarUrl }];
          send(opp.ws, { type: 'matched', playerId: opp.pid, players: playerList });
          send(ws,     { type: 'matched', playerId: pid,     players: playerList });

          loadGamePlaces().then(ps => {
            room.places = ps;
            broadcast(room, { type: 'game_start', players: playerList });
            setTimeout(() => startRound(room), 2000);
          });
          return;
        }

        if (matchQueue) matchQueue = null;
        matchQueue = { ws, pid, name, userId, avatarUrl };
        wsToPlayer.set(ws, pid);
        send(ws, { type: 'searching' });
        return;
      }

      // ── CANCEL_MATCH ──────────────────────────────────────────────
      if (msg.type === 'cancel_match') {
        if (matchQueue?.ws === ws) {
          matchQueue = null;
          wsToPlayer.delete(ws);
          send(ws, { type: 'cancelled' });
        }
        return;
      }

      // ── GUESS ─────────────────────────────────────────────────────
      if (msg.type === 'guess') {
        const code = wsToRoom.get(ws);
        const pid  = wsToPlayer.get(ws);
        if (!code || !pid) return;
        const room = rooms.get(code);
        if (!room || room.state !== 'playing') return;
        const player = room.players.get(pid);
        if (!player || player.guess) return;

        player.guess = { lat: Number(msg.lat), lng: Number(msg.lng) };
        room.guessedCount++;

        for (const [p2id, p2] of room.players) {
          if (p2id !== pid) send(p2.ws, { type: 'player_guessed', playerId: pid });
        }

        // Start 14-second timer on FIRST guess
        if (!room.timerStarted) {
          room.timerStarted = true;
          room.ticksLeft    = 14;
          broadcast(room, { type: 'timer_start', remaining: 14 });
          room.timer = setInterval(() => {
            room.ticksLeft--;
            broadcast(room, { type: 'timer', remaining: room.ticksLeft });
            if (room.ticksLeft <= 0) endRound(room);
          }, 1000);
        }

        if (room.guessedCount >= room.players.size) endRound(room);
        return;
      }

      // ── READY (Weiter button) ─────────────────────────────────────
      if (msg.type === 'ready') {
        const code = wsToRoom.get(ws);
        const pid  = wsToPlayer.get(ws);
        if (!code || !pid) return;
        const room = rooms.get(code);
        if (!room || room.state !== 'playing') return;

        // Accumulate photos seen
        const photosCount = Number(msg.photosCount ?? 0);
        room.photosSeen.set(pid, (room.photosSeen.get(pid) ?? 0) + photosCount);

        room.readyCount++;
        broadcast(room, { type: 'player_ready', playerId: pid });

        if (room.readyCount >= room.players.size) {
          const isLastRound = room.round >= room.places.length - 1;
          if (isLastRound) {
            endGame(room).catch(console.error);
          } else {
            room.round++;
            startRound(room);
          }
        }
        return;
      }

    } catch (e) {
      console.error('[game ws] parse error:', e);
    }
  });

  ws.on('close', () => {
    if (matchQueue?.ws === ws) matchQueue = null;

    const code = wsToRoom.get(ws);
    const pid  = wsToPlayer.get(ws);
    wsToRoom.delete(ws);
    wsToPlayer.delete(ws);
    if (!code || !pid) return;

    const room = rooms.get(code);
    if (!room) return;
    room.players.delete(pid);

    if (room.players.size > 0) {
      broadcast(room, { type: 'player_left', playerId: pid });
    } else {
      if (room.timer) clearInterval(room.timer);
      rooms.delete(code);
    }
  });
}

// ── HTTP endpoints ────────────────────────────────────────────────────────────

const gameHttpRouter = new Hono();
gameHttpRouter.get('/queue', (c) => c.json({ waiting: matchQueue ? 1 : 0 }));
export default gameHttpRouter;
