import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users, quizGames, perks } from '../db/schema.js';
import { eq, sql, isNotNull, and, asc } from 'drizzle-orm';
import { jwtVerify } from 'jose';
import { requireAuth, JWT_SECRET } from '../middleware/auth.js';
import type { Context } from 'hono';
import {
  computeRankingStats, sortBy, friendIds,
  type Board, type RankStat,
} from '../lib/ranking.js';

const router = new Hono();

// Weiche Authentifizierung: Nutzer-ID aus dem Token lesen, ohne 401 zu erzwingen
// (für den optionalen „Nur Freunde"-Filter der öffentlichen Rangliste).
async function softUserId(c: Context): Promise<number | null> {
  const h = c.req.header('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const { payload } = await jwtVerify(h.slice(7), JWT_SECRET);
    return (payload as { userId?: number }).userId ?? null;
  } catch { return null; }
}

// GET /rankings/leaderboard?board=gesamt|orte|eingereicht|quiz&friends=1
router.get('/leaderboard', async (c) => {
  const board = (c.req.query('board') ?? 'gesamt') as Board;
  const friendsOnly = c.req.query('friends') === '1';
  const { stats } = await computeRankingStats();

  let list: RankStat[] = stats;
  if (friendsOnly) {
    const uid = await softUserId(c);
    if (uid) {
      const ids = await friendIds(uid);
      list = stats.filter(s => ids.has(s.id));
    }
  }

  const sorted = [...list].sort(sortBy(board));
  return c.json(sorted.slice(0, 200));
});

// GET /rankings/me — eigene Stats, Rang je Board, Monats-Status
router.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const { stats, total } = await computeRankingStats();
  const base: RankStat = stats.find(s => s.id === user.id) ?? {
    id: user.id, name: user.name, handle: user.handle, avatarUrl: user.avatarUrl,
    orte: 0, eingereicht: 0, reviewed: 0, quizWins: 0, quizPlayed: 0, winRate: 0, punkte: 0,
    mOrte: 0, mEingereicht: 0, mReviewed: 0, mQuizWins: 0, mScore: 0,
    percentile: 1, tierKey: 'rookie', isLocalHero: false,
  };
  const rankIn = (board: Board) => {
    const i = [...stats].sort(sortBy(board)).findIndex(s => s.id === user.id);
    return i >= 0 ? i + 1 : null;
  };
  return c.json({
    ...base,
    total,
    ranks: {
      gesamt:      rankIn('gesamt'),
      orte:        rankIn('orte'),
      eingereicht: rankIn('eingereicht'),
      quiz:        rankIn('quiz'),
    },
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
