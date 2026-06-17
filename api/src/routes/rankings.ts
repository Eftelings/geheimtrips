import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users, visitedPlaces, quizGames, perks } from '../db/schema.js';
import { eq, sql, isNotNull, and, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = new Hono();

// Levels config
const GT_LEVELS = [
  { level: 1, label: 'Entdecker:in',  minPoints: 0 },
  { level: 2, label: 'Sammler:in',     minPoints: 50 },
  { level: 3, label: 'Kenner:in',      minPoints: 150 },
  { level: 4, label: 'Insider:in',     minPoints: 350 },
  { level: 5, label: 'Legende',        minPoints: 700 },
];

function levelFor(points: number) {
  return [...GT_LEVELS].reverse().find(l => points >= l.minPoints) ?? GT_LEVELS[0];
}

type Board = 'orte' | 'quiz' | 'punkte';

/** Gemeinsame Statistik je Nutzer:in — besuchte Orte, Quiz-Siege, Geheimtripspunkte */
async function computeStats() {
  const visitCounts = await db
    .select({ userId: visitedPlaces.userId, count: sql<number>`count(*)`.as('count') })
    .from(visitedPlaces).groupBy(visitedPlaces.userId).all();
  const visitMap = Object.fromEntries(visitCounts.map(v => [v.userId, Number(v.count)]));

  const quizStats = await db
    .select({
      userId: quizGames.userId,
      played: sql<number>`count(*)`.as('played'),
      won:    sql<number>`sum(${quizGames.won})`.as('won'),
    })
    .from(quizGames).where(isNotNull(quizGames.userId)).groupBy(quizGames.userId).all();
  const quizMap = Object.fromEntries(quizStats.map(q => [q.userId, { played: Number(q.played), won: Number(q.won) }]));

  const allUsers = await db.select({
    id: users.id, name: users.name, handle: users.handle,
    avatarUrl: users.avatarUrl, profileVisible: users.profileVisible,
  }).from(users).all();

  return allUsers
    .filter(u => u.profileVisible)
    .map(u => {
      const orte = visitMap[u.id] ?? 0;
      const q = quizMap[u.id] ?? { played: 0, won: 0 };
      // Geheimtripspunkte: besuchte Orte (×10) + Quiz-Siege (×20)
      const punkte = orte * 10 + q.won * 20;
      return {
        id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl,
        orte, quizWins: q.won, quizPlayed: q.played,
        winRate: q.played > 0 ? Math.round((q.won / q.played) * 100) : 0,
        punkte, level: levelFor(punkte),
      };
    });
}

function sortBy(board: Board) {
  return (a: Awaited<ReturnType<typeof computeStats>>[number], b: typeof a) => {
    if (board === 'orte') return b.orte - a.orte || b.punkte - a.punkte;
    if (board === 'quiz') return b.quizWins - a.quizWins || b.winRate - a.winRate;
    return b.punkte - a.punkte;
  };
}

// GET /rankings/leaderboard?board=punkte|orte|quiz — komplette Rangliste (sortiert)
router.get('/leaderboard', async (c) => {
  const board = (c.req.query('board') ?? 'punkte') as Board;
  const stats = await computeStats();
  const sorted = [...stats].sort(sortBy(board));
  return c.json(sorted.slice(0, 200));
});

// GET /rankings/me — eigene Stats + Rang je Board
router.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const stats = await computeStats();
  const mine = stats.find(s => s.id === user.id)
    ?? { id: user.id, name: user.name, handle: user.handle, avatarUrl: user.avatarUrl,
         orte: 0, quizWins: 0, quizPlayed: 0, winRate: 0, punkte: 0, level: levelFor(0) };
  const rankIn = (board: Board) =>
    [...stats].sort(sortBy(board)).findIndex(s => s.id === user.id) + 1 || null;
  return c.json({
    ...mine,
    ranks: { orte: rankIn('orte'), quiz: rankIn('quiz'), punkte: rankIn('punkte') },
  });
});

// GET /rankings/geheimquiz — Quiz-Rangliste (Detail: Siege, Spiele, Quote)
router.get('/geheimquiz', async (c) => {
  const stats = await db
    .select({
      userId:      quizGames.userId,
      playerName:  quizGames.playerName,
      gamesPlayed: sql<number>`count(*)`.as('gamesPlayed'),
      gamesWon:    sql<number>`sum(${quizGames.won})`.as('gamesWon'),
    })
    .from(quizGames).where(isNotNull(quizGames.userId)).groupBy(quizGames.userId).all();

  const userRows = await db
    .select({ id: users.id, name: users.name, handle: users.handle, avatarUrl: users.avatarUrl })
    .from(users).all();
  const userMap = Object.fromEntries(userRows.map(u => [u.id, u]));

  const result = stats
    .map(s => {
      const u = s.userId != null ? userMap[s.userId] : null;
      const played = Number(s.gamesPlayed), won = Number(s.gamesWon);
      return {
        userId:      s.userId,
        name:        u?.name ?? s.playerName,
        handle:      u?.handle ?? '',
        avatarUrl:   u?.avatarUrl ?? null,
        gamesPlayed: played,
        gamesWon:    won,
        winRate:     played > 0 ? Math.round((won / played) * 100) : 0,
      };
    })
    .sort((a, b) => b.gamesWon - a.gamesWon || b.winRate - a.winRate);

  return c.json(result);
});

// GET /rankings/geheimquiz/me — eigene Quiz-Stats
router.get('/geheimquiz/me', requireAuth, async (c) => {
  const user = c.get('user');
  const rows = await db
    .select({
      gamesPlayed: sql<number>`count(*)`,
      gamesWon:    sql<number>`sum(${quizGames.won})`,
    })
    .from(quizGames).where(eq(quizGames.userId, user.id)).get();

  const gamesPlayed = Number(rows?.gamesPlayed ?? 0);
  const gamesWon    = Number(rows?.gamesWon    ?? 0);
  return c.json({
    gamesPlayed, gamesWon,
    gamesLost: gamesPlayed - gamesWon,
    winRate:   gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0,
  });
});

// GET /rankings/perks?board=quiz — aktive Vorteile für ein Board (für alle sichtbar)
router.get('/perks', async (c) => {
  const board = c.req.query('board');
  const rows = board
    ? await db.select().from(perks).where(and(eq(perks.active, true), eq(perks.board, board))).orderBy(asc(perks.sort)).all()
    : await db.select().from(perks).where(eq(perks.active, true)).orderBy(asc(perks.sort)).all();
  return c.json(rows);
});

export default router;
