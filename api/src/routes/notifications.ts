import { Hono } from 'hono';
import { db } from '../db/index.js';
import { places, ratings, placeMedia, photoLikes, users, friendships } from '../db/schema.js';
import { and, eq, gt, ne, inArray, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = new Hono();

// Spalte für „zuletzt gesehen" nachrüsten (bestehende DBs)
db.run(sql`ALTER TABLE users ADD COLUMN notifications_seen_at TEXT`).catch(() => {});
// Ereignis-Benachrichtigungen (Trip-Einladung, angenommene Anfragen …)
db.run(sql`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  actor_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
)`).catch(() => {});

// GET /notifications/count — Anzahl neuer Ereignisse seit dem letzten Ansehen:
// neue Bewertungen auf meinen Orten + neue Likes auf meinen Fotos (nicht von mir selbst).
router.get('/count', requireAuth, async (c) => {
  const me = c.get('user');
  const seen = me.notificationsSeenAt ?? '1970-01-01 00:00:00';

  // Meine eingereichten Orte
  const myPlaces = await db.select({ id: places.id }).from(places)
    .where(eq(places.submittedBy, me.id)).all();
  const placeIds = myPlaces.map(p => p.id);

  let ratingCount = 0;
  if (placeIds.length) {
    const r = await db.select({ n: sql<number>`count(*)`.as('n') }).from(ratings)
      .where(and(inArray(ratings.placeId, placeIds), gt(ratings.createdAt, seen), ne(ratings.userId, me.id)))
      .get();
    ratingCount = Number(r?.n ?? 0);
  }

  // Meine hochgeladenen Fotos
  const myPhotos = await db.select({ url: placeMedia.url }).from(placeMedia)
    .where(eq(placeMedia.userId, me.id)).all();
  const urls = myPhotos.map(m => m.url);

  let likeCount = 0;
  if (urls.length) {
    const l = await db.select({ n: sql<number>`count(*)`.as('n') }).from(photoLikes)
      .where(and(inArray(photoLikes.photoUrl, urls), gt(photoLikes.createdAt, seen), ne(photoLikes.userId, me.id)))
      .get();
    likeCount = Number(l?.n ?? 0);
  }

  // Offene Freundschaftsanfragen an mich — nicht zeitlich begrenzt, bleiben aktionierbar,
  // bis sie an-/abgelehnt sind (deshalb nicht über notifications_seen_at gefiltert).
  const fr = await db.select({ n: sql<number>`count(*)`.as('n') }).from(friendships)
    .where(and(eq(friendships.addresseeId, me.id), eq(friendships.status, 'pending')))
    .get();
  const requestCount = Number(fr?.n ?? 0);

  // Neue Fragen zu meinen Orten (nicht von mir selbst), seit dem letzten Ansehen
  const qRows = await db.all(sql`
    SELECT count(*) AS n FROM place_questions
    WHERE created_at > ${seen} AND asker_id != ${me.id}
      AND place_id IN (SELECT id FROM places WHERE submitted_by = ${me.id})
  `).catch(() => [{ n: 0 }]) as { n: number }[];
  const questionCount = Number(qRows[0]?.n ?? 0);

  // Offene Änderungsanfragen zu meinen Orten (als Ersteller:in oder Business), nicht von mir
  const crRows = await db.all(sql`
    SELECT count(*) AS n FROM change_requests
    WHERE status = 'open' AND user_id != ${me.id} AND created_at > ${seen}
      AND place_id IN (
        SELECT id FROM places WHERE submitted_by = ${me.id}
        UNION SELECT place_id FROM business_claims WHERE user_id = ${me.id} AND status = 'approved'
      )
  `).catch(() => [{ n: 0 }]) as { n: number }[];
  const changeCount = Number(crRows[0]?.n ?? 0);

  // Neue Ereignis-Benachrichtigungen (Trip-Einladung, angenommene Anfragen) seit dem letzten Ansehen
  const nRows = await db.all(sql`
    SELECT count(*) AS n FROM notifications WHERE user_id = ${me.id} AND created_at > ${seen}
  `).catch(() => [{ n: 0 }]) as { n: number }[];
  const notifCount = Number(nRows[0]?.n ?? 0);

  return c.json({
    count: ratingCount + likeCount + requestCount + questionCount + changeCount + notifCount,
    ratings: ratingCount, likes: likeCount, requests: requestCount, questions: questionCount, changes: changeCount, events: notifCount,
  });
});

// GET /notifications/list — Postfach: Freundschaftsanfragen, Fragen & Änderungswünsche zu meinen Orten
router.get('/list', requireAuth, async (c) => {
  const me = c.get('user');
  type Item = { type: string; id: string; title: string; body: string; link: string; createdAt: string };
  const items: Item[] = [];

  // 1) Freundschaftsanfragen
  const reqs = await db.select({ id: friendships.id, name: users.name, handle: users.handle, createdAt: friendships.createdAt })
    .from(friendships).innerJoin(users, eq(users.id, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, me.id), eq(friendships.status, 'pending'))).all();
  for (const r of reqs) items.push({ type: 'friend_request', id: `fr-${r.id}`, title: 'Freundschaftsanfrage', body: `${r.name} (@${r.handle}) möchte sich mit dir vernetzen.`, link: '/profile', createdAt: r.createdAt ?? '' });

  // 2) Fragen zu meinen Orten
  const qs = await db.all(sql`
    SELECT q.id, q.question, q.asker_name AS askerName, q.created_at AS createdAt, p.id AS placeId, p.name AS placeName
    FROM place_questions q JOIN places p ON p.id = q.place_id
    WHERE p.submitted_by = ${me.id} AND q.asker_id != ${me.id} AND (q.answer IS NULL OR q.answer = '')
    ORDER BY q.id DESC LIMIT 50`).catch(() => []) as any[];
  for (const q of qs) items.push({ type: 'question', id: `q-${q.id}`, title: `Frage zu „${q.placeName}"`, body: `${q.askerName}: ${q.question}`, link: `/place/${q.placeId}`, createdAt: q.createdAt ?? '' });

  // 3) Änderungswünsche zu meinen Orten (Ersteller oder Business)
  const crs = await db.all(sql`
    SELECT cr.id, cr.text, cr.category, cr.user_name AS userName, cr.created_at AS createdAt, p.id AS placeId, p.name AS placeName
    FROM change_requests cr JOIN places p ON p.id = cr.place_id
    WHERE cr.status = 'open' AND cr.user_id != ${me.id}
      AND cr.place_id IN (
        SELECT id FROM places WHERE submitted_by = ${me.id}
        UNION SELECT place_id FROM business_claims WHERE user_id = ${me.id} AND status = 'approved'
      )
    ORDER BY cr.id DESC LIMIT 50`).catch(() => []) as any[];
  for (const cr of crs) items.push({ type: 'change_request', id: `cr-${cr.id}`, title: `Änderungswunsch zu „${cr.placeName}"`, body: `${cr.userName} (${cr.category}): ${cr.text}`, link: `/place/${cr.placeId}`, createdAt: cr.createdAt ?? '' });

  // 4) Ereignis-Benachrichtigungen (Trip-Einladung erhalten, Anfrage/Einladung angenommen)
  const evs = await db.all(sql`
    SELECT id, type, title, body, link, created_at AS createdAt
    FROM notifications WHERE user_id = ${me.id} ORDER BY id DESC LIMIT 50`).catch(() => []) as any[];
  for (const e of evs) items.push({ type: e.type, id: `n-${e.id}`, title: e.title, body: e.body, link: e.link ?? '/notifications', createdAt: e.createdAt ?? '' });

  items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return c.json(items);
});

// POST /notifications/seen — alles als gesehen markieren (löscht den Punkt)
router.post('/seen', requireAuth, async (c) => {
  const me = c.get('user');
  await db.update(users).set({ notificationsSeenAt: sql`datetime('now')` }).where(eq(users.id, me.id));
  return c.json({ ok: true });
});

export default router;
