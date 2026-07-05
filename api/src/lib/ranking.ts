import { db } from '../db/index.js';
import { users, visitedPlaces, quizGames, places, friendships } from '../db/schema.js';
import { eq, sql, isNotNull, and, or, gte } from 'drizzle-orm';

// ─── Konfiguration ───────────────────────────────────────────────────────────
// Punktegewichte für den Gesamt-Score (besuchte / eingereichte Orte / Quiz-Siege)
export const W_ORT = 10;
export const W_EINREICHUNG = 20;
export const W_QUIZ = 15;
export const W_REVIEW = 12;   // Ort reviewt (Beschreibung bestätigt/aktualisiert)

export type Board = 'gesamt' | 'orte' | 'eingereicht' | 'quiz';

// Status-Stufen — monatlich, anhand des Perzentils im Gesamtranking.
// percentile ≤ maxPct ⇒ diese Stufe (von der besten zur schwächsten geprüft).
export const TIERS = [
  { key: 'legende',   maxPct: 0.01 },
  { key: 'insider',   maxPct: 0.10 },
  { key: 'localhero', maxPct: 0.25 },
  { key: 'entdecker', maxPct: 0.50 },
  { key: 'reisende',  maxPct: 0.75 },
  { key: 'rookie',    maxPct: 2.00 }, // Auffangstufe: alle Übrigen
] as const;

// Ab dieser Schwelle (Top 25 %) trägt man das Local-Hero-Badge.
export const LOCAL_HERO_MAX_PCT = 0.25;

export function tierFor(percentile: number, score: number): string {
  if (score <= 0) return 'rookie';
  return (TIERS.find(t => percentile <= t.maxPct) ?? TIERS[TIERS.length - 1]).key;
}

export interface RankStat {
  id: number; name: string; handle: string; avatarUrl: string | null;
  // All-time
  orte: number; eingereicht: number; reviewed: number; quizWins: number; quizPlayed: number; winRate: number; punkte: number;
  // Dieser Monat
  mOrte: number; mEingereicht: number; mReviewed: number; mQuizWins: number; mScore: number;
  // Monats-Status (abgeleitet)
  percentile: number; tierKey: string; isLocalHero: boolean;
}

// Monatsbeginn als 'YYYY-MM-01 00:00:00' — passt zum datetime('now')-Format (UTC),
// daher ist ein lexikografischer Vergleich (>=) korrekt.
function monthStartIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`;
}

export function sortBy(board: Board) {
  return (a: RankStat, b: RankStat) => {
    if (board === 'orte')        return b.orte - a.orte || b.punkte - a.punkte;
    if (board === 'eingereicht') return b.eingereicht - a.eingereicht || b.punkte - a.punkte;
    if (board === 'quiz')        return b.quizWins - a.quizWins || b.winRate - a.winRate;
    return b.mScore - a.mScore || b.punkte - a.punkte; // gesamt (monatlich)
  };
}

// 30-Sekunden-Cache: /me + /leaderboard + Ortsdetail rufen das mehrfach auf.
let cache: { at: number; stats: RankStat[]; total: number } | null = null;

export async function computeRankingStats(): Promise<{ stats: RankStat[]; total: number }> {
  if (cache && Date.now() - cache.at < 30_000) return { stats: cache.stats, total: cache.total };
  const since = monthStartIso();

  // Besuche (all-time + Monat)
  const vAll = await db.select({ userId: visitedPlaces.userId, c: sql<number>`count(*)`.as('c') })
    .from(visitedPlaces).groupBy(visitedPlaces.userId).all();
  const vMon = await db.select({ userId: visitedPlaces.userId, c: sql<number>`count(*)`.as('c') })
    .from(visitedPlaces).where(gte(visitedPlaces.visitedAt, since)).groupBy(visitedPlaces.userId).all();

  // Einreichungen (all-time + Monat) — Orte mit submittedBy
  const sAll = await db.select({ userId: places.submittedBy, c: sql<number>`count(*)`.as('c') })
    .from(places).where(isNotNull(places.submittedBy)).groupBy(places.submittedBy).all();
  const sMon = await db.select({ userId: places.submittedBy, c: sql<number>`count(*)`.as('c') })
    .from(places).where(and(isNotNull(places.submittedBy), gte(places.createdAt, since))).groupBy(places.submittedBy).all();

  // Quiz (all-time + Monat)
  const qAll = await db.select({
      userId: quizGames.userId,
      played: sql<number>`count(*)`.as('played'),
      won:    sql<number>`sum(${quizGames.won})`.as('won'),
    }).from(quizGames).where(isNotNull(quizGames.userId)).groupBy(quizGames.userId).all();
  const qMon = await db.select({ userId: quizGames.userId, won: sql<number>`sum(${quizGames.won})`.as('won') })
    .from(quizGames).where(and(isNotNull(quizGames.userId), gte(quizGames.playedAt, since))).groupBy(quizGames.userId).all();

  // Reviews (all-time + Monat) — raw SQL, tolerant falls Tabelle (noch) fehlt
  const rvAll = await db.all<{ userId: number; c: number }>(sql`SELECT user_id AS userId, count(*) AS c FROM place_reviews GROUP BY user_id`).catch(() => []);
  const rvMon = await db.all<{ userId: number; c: number }>(sql`SELECT user_id AS userId, count(*) AS c FROM place_reviews WHERE created_at >= ${since} GROUP BY user_id`).catch(() => []);
  const rvAllMap = Object.fromEntries(rvAll.map(r => [r.userId, Number(r.c)]));
  const rvMonMap = Object.fromEntries(rvMon.map(r => [r.userId, Number(r.c)]));

  const vAllMap = Object.fromEntries(vAll.map(r => [r.userId, Number(r.c)]));
  const vMonMap = Object.fromEntries(vMon.map(r => [r.userId, Number(r.c)]));
  const sAllMap = Object.fromEntries(sAll.map(r => [r.userId, Number(r.c)]));
  const sMonMap = Object.fromEntries(sMon.map(r => [r.userId, Number(r.c)]));
  const qMonMap = Object.fromEntries(qMon.map(r => [r.userId, Number(r.won)]));
  const qAllMap = Object.fromEntries(qAll.map(q => [q.userId, { played: Number(q.played), won: Number(q.won) }]));

  const allUsers = await db.select({
    id: users.id, name: users.name, handle: users.handle,
    avatarUrl: users.avatarUrl, profileVisible: users.profileVisible,
  }).from(users).all();

  const stats: RankStat[] = allUsers.filter(u => u.profileVisible).map(u => {
    const orte        = vAllMap[u.id] ?? 0;
    const eingereicht = sAllMap[u.id] ?? 0;
    const reviewed    = rvAllMap[u.id] ?? 0;
    const q           = qAllMap[u.id] ?? { played: 0, won: 0 };
    const mOrte        = vMonMap[u.id] ?? 0;
    const mEingereicht = sMonMap[u.id] ?? 0;
    const mReviewed    = rvMonMap[u.id] ?? 0;
    const mQuizWins    = qMonMap[u.id] ?? 0;
    const punkte = orte * W_ORT + eingereicht * W_EINREICHUNG + reviewed * W_REVIEW + q.won * W_QUIZ;
    const mScore = mOrte * W_ORT + mEingereicht * W_EINREICHUNG + mReviewed * W_REVIEW + mQuizWins * W_QUIZ;
    return {
      id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl,
      orte, eingereicht, reviewed, quizWins: q.won, quizPlayed: q.played,
      winRate: q.played > 0 ? Math.round((q.won / q.played) * 100) : 0,
      punkte, mOrte, mEingereicht, mReviewed, mQuizWins, mScore,
      percentile: 1, tierKey: 'rookie', isLocalHero: false,
    };
  });

  // Monats-Perzentil + Status je Nutzer:in (Basis = Gesamt-Monatsscore).
  // Perzentil-Rang nach der Mittelpunkt-Methode: (Rang − 0,5) / N. So landet
  // auch der/die Erste bei kleiner Nutzerzahl fair weit oben (Rang 1 von 3 ⇒ 17 %).
  const N = stats.length;
  [...stats].sort((a, b) => b.mScore - a.mScore || b.punkte - a.punkte).forEach((s, i) => {
    const pct = N > 0 ? (i + 0.5) / N : 1;
    s.percentile  = s.mScore > 0 ? pct : 1;
    s.tierKey     = tierFor(s.percentile, s.mScore);
    s.isLocalHero = s.mScore > 0 && s.percentile <= LOCAL_HERO_MAX_PCT;
  });

  cache = { at: Date.now(), stats, total: N };
  return { stats, total: N };
}

/** Local-Hero-Status einer einzelnen Person (für Ortsdetail / Profil). */
export async function isUserLocalHero(userId: number): Promise<boolean> {
  const { stats } = await computeRankingStats();
  return stats.find(s => s.id === userId)?.isLocalHero ?? false;
}

/** IDs der bestätigten Freunde (für den „Nur Freunde"-Filter). */
export async function friendIds(userId: number): Promise<Set<number>> {
  const fr = await db.select().from(friendships)
    .where(and(eq(friendships.status, 'accepted'),
      or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))).all();
  const ids = new Set<number>([userId]);
  fr.forEach(f => ids.add(f.requesterId === userId ? f.addresseeId : f.requesterId));
  return ids;
}
