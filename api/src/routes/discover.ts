import { Hono } from 'hono';
import { db } from '../db/index.js';
import { places } from '../db/schema.js';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { hydrate } from './places.js';

/**
 * Lernende Entdecken-Engine:
 * - user_prefs: Basics (Verkehrsmittel, Begleitung, …) + Tag-Affinitäten
 * - swipe_events: jede Interaktion (Like/Dislike/Klick/Anschauzeit)
 * - GET /deck: personalisiert sortierte Orte (Affinität + Rating + Geheim-Bonus
 *   + ε-Exploration, damit die Filterblase nicht zuschnappt)
 */

db.run(sql`
  CREATE TABLE IF NOT EXISTS user_prefs (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id),
    transport        TEXT,
    companions       TEXT DEFAULT '[]',
    location_consent INTEGER DEFAULT 0,
    gender           TEXT,
    birth_year       INTEGER,
    tag_scores       TEXT DEFAULT '{}',
    updated_at       TEXT DEFAULT (datetime('now'))
  )
`).catch(console.error);

db.run(sql`
  CREATE TABLE IF NOT EXISTS swipe_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    place_id   TEXT NOT NULL REFERENCES places(id),
    action     TEXT NOT NULL,           -- like | dislike | click | skip
    dwell_ms   INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).catch(console.error);

const router = new Hono();

type TagScores = Record<string, { s: number; n: number }>;

/** Tags eines Ortes für das Affinitäts-Profil */
function placeTags(p: ReturnType<typeof hydrate>): string[] {
  const attrs = (p.attributes ?? {}) as Record<string, unknown>;
  const answers = (attrs.answers ?? {}) as Record<string, unknown>;
  const tags = [`cat:${p.category}`];
  for (const k of ['l1Slug', 'l2Slug', 'l3Slug'] as const) {
    if (typeof attrs[k] === 'string' && attrs[k]) tags.push(`${k}:${attrs[k]}`);
  }
  const secret = Number(answers.secretness ?? 0);
  tags.push(secret >= 4 ? 'secret:hoch' : 'secret:normal');
  tags.push(answers.entrance_fee === 'Kostenlos' || p.cost === 1 ? 'preis:frei' : 'preis:kostet');
  return tags;
}

function affinity(scores: TagScores, tags: string[]): number {
  let sum = 0, cnt = 0;
  for (const t of tags) {
    const e = scores[t];
    if (!e || e.n === 0) continue;
    sum += Math.tanh(e.s / Math.max(1, e.n));  // -1..1 je Tag
    cnt++;
  }
  return cnt ? sum / cnt : 0;
}

async function getPrefs(userId: number) {
  const r = await db.all<{ transport: string | null; companions: string; location_consent: number; gender: string | null; birth_year: number | null; tag_scores: string }>(
    sql`SELECT transport, companions, location_consent, gender, birth_year, tag_scores FROM user_prefs WHERE user_id = ${userId}`);
  return r[0] ?? null;
}

// GET /discover/prefs — Basics + ob Profil existiert
router.get('/prefs', requireAuth, async (c) => {
  const user = c.get('user');
  const p = await getPrefs(user.id);
  if (!p) return c.json({ exists: false });
  return c.json({
    exists: true,
    transport: p.transport,
    companions: JSON.parse(p.companions ?? '[]'),
    locationConsent: !!p.location_consent,
    gender: p.gender,
    birthYear: p.birth_year,
  });
});

// PUT /discover/prefs — Basics speichern (jederzeit anpassbar)
router.put('/prefs', requireAuth,
  zValidator('json', z.object({
    transport: z.enum(['walk', 'bike', 'transit', 'train', 'auto']).optional(),
    companions: z.array(z.string()).max(6).optional(),
    locationConsent: z.boolean().optional(),
    gender: z.string().max(20).nullable().optional(),
    birthYear: z.number().int().min(1920).max(2020).nullable().optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const b = c.req.valid('json');
    const cur = await getPrefs(user.id);
    await db.run(sql`
      INSERT INTO user_prefs (user_id, transport, companions, location_consent, gender, birth_year, tag_scores, updated_at)
      VALUES (${user.id}, ${b.transport ?? cur?.transport ?? null}, ${JSON.stringify(b.companions ?? JSON.parse(cur?.companions ?? '[]'))},
              ${b.locationConsent === undefined ? (cur?.location_consent ?? 0) : (b.locationConsent ? 1 : 0)},
              ${b.gender === undefined ? (cur?.gender ?? null) : b.gender},
              ${b.birthYear === undefined ? (cur?.birth_year ?? null) : b.birthYear},
              ${cur?.tag_scores ?? '{}'}, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        transport = excluded.transport, companions = excluded.companions,
        location_consent = excluded.location_consent, gender = excluded.gender,
        birth_year = excluded.birth_year, updated_at = excluded.updated_at
    `);
    return c.json({ ok: true });
  }
);

// POST /discover/swipe — Interaktion erfassen + Affinitäten lernen
router.post('/swipe', requireAuth,
  zValidator('json', z.object({
    placeId: z.string(),
    action: z.enum(['like', 'dislike', 'click', 'skip']),
    dwellMs: z.number().int().min(0).max(600_000).optional().default(0),
  })),
  async (c) => {
    const user = c.get('user');
    const { placeId, action, dwellMs } = c.req.valid('json');
    const place = await db.select().from(places).where(sql`id = ${placeId}`).get();
    if (!place) return c.json({ error: 'Ort nicht gefunden.' }, 404);

    await db.run(sql`INSERT INTO swipe_events (user_id, place_id, action, dwell_ms) VALUES (${user.id}, ${placeId}, ${action}, ${dwellMs})`);

    // Lern-Update: Klick ist starkes Positiv-Signal, langes Anschauen ein leichtes;
    // schnelles Wegwischen (< 1,5 s) wertet stärker ab als ein überlegtes Nein.
    let delta = action === 'like' ? 1 : action === 'click' ? 0.6 : action === 'dislike' ? -1 : -0.4;
    if (action === 'dislike' && dwellMs > 0 && dwellMs < 1500) delta = -1.2;
    if ((action === 'like' || action === 'click') && dwellMs >= 6000) delta += 0.3;

    const cur = await getPrefs(user.id);
    const scores: TagScores = JSON.parse(cur?.tag_scores ?? '{}');
    for (const t of placeTags(hydrate(place))) {
      const e = scores[t] ?? { s: 0, n: 0 };
      e.s += delta; e.n += 1;
      scores[t] = e;
    }
    await db.run(sql`
      INSERT INTO user_prefs (user_id, tag_scores, updated_at) VALUES (${user.id}, ${JSON.stringify(scores)}, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET tag_scores = ${JSON.stringify(scores)}, updated_at = datetime('now')
    `);
    return c.json({ ok: true });
  }
);

// GET /discover/category-affinity — Vorliebe je Hauptkategorie (cat:<slug>)
// für die personalisierte Reihenfolge der Kategorie-Chips. Werte ~ -1..1.
router.get('/category-affinity', requireAuth, async (c) => {
  const user = c.get('user');
  const cur = await getPrefs(user.id);
  const scores: TagScores = JSON.parse(cur?.tag_scores ?? '{}');

  // Frisch anreichern mit Besuchen / Bewertungen / Einreichungen (wie im Deck)
  const all = (await db.select().from(places).all()).map(hydrate);
  const byId = new Map(all.map(p => [p.id, p]));
  const bump = (pid: string, d: number) => {
    const pl = byId.get(pid);
    if (!pl) return;
    const t = `cat:${pl.category}`;
    const e = scores[t] ?? { s: 0, n: 0 };
    e.s += d; e.n += 1; scores[t] = e;
  };
  for (const r of await db.all<{ place_id: string }>(sql`SELECT place_id FROM visited_places WHERE user_id = ${user.id}`)) bump(r.place_id, 0.8);
  for (const r of await db.all<{ place_id: string; stars: number }>(sql`SELECT place_id, stars FROM ratings WHERE user_id = ${user.id}`)) bump(r.place_id, ((r.stars - 3) / 2) * 1.2);
  for (const r of await db.all<{ id: string }>(sql`SELECT id FROM places WHERE submitted_by = ${user.id}`)) bump(r.id, 1.0);
  // Lieblingsorte: höhere Position (= Lieblingsort) → stärkeres Positiv-Signal
  for (const r of await db.all<{ place_id: string; position: number }>(sql`SELECT place_id, position FROM favorite_places WHERE user_id = ${user.id}`).catch(() => [])) bump(r.place_id, Math.max(0, 1.4 - r.position * 0.12));

  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) {
    if (k.startsWith('cat:') && v.n > 0) out[k.slice(4)] = Math.tanh(v.s / v.n);
  }
  return c.json(out);
});

// ─── Kollaboratives Filtern ───────────────────────────────────────────────────
// Präferenz-Vektor je Nutzer über ALLE Signalquellen: Swipes, echte Besuche,
// abgegebene Bewertungen und selbst eingereichte Orte (= stärkstes Signal dafür,
// welche Art Ort jemand liebt).

interface UserVec { prefs: Map<string, number>; gender: string | null; decade: number | null }

async function loadAllUserVectors(): Promise<Map<number, UserVec>> {
  const vecs = new Map<number, UserVec>();
  const ensure = (uid: number): UserVec => {
    let v = vecs.get(uid);
    if (!v) { v = { prefs: new Map(), gender: null, decade: null }; vecs.set(uid, v); }
    return v;
  };
  const add = (uid: number, pid: string, d: number) => {
    const m = ensure(uid).prefs;
    m.set(pid, Math.max(-1.5, Math.min(1.5, (m.get(pid) ?? 0) + d)));
  };

  const swipes = await db.all<{ user_id: number; place_id: string; action: string }>(
    sql`SELECT user_id, place_id, action FROM swipe_events`);
  for (const s of swipes) {
    add(s.user_id, s.place_id, s.action === 'like' ? 1 : s.action === 'click' ? 0.6 : s.action === 'dislike' ? -1 : -0.3);
  }

  const visits = await db.all<{ user_id: number; place_id: string }>(
    sql`SELECT user_id, place_id FROM visited_places`);
  for (const v of visits) add(v.user_id, v.place_id, 0.8);

  const rat = await db.all<{ user_id: number; place_id: string; stars: number }>(
    sql`SELECT user_id, place_id, stars FROM ratings`);
  for (const r of rat) add(r.user_id, r.place_id, ((r.stars - 3) / 2) * 1.2);

  const subs = await db.all<{ submitted_by: number; id: string }>(
    sql`SELECT submitted_by, id FROM places WHERE submitted_by IS NOT NULL`);
  for (const s of subs) add(s.submitted_by, s.id, 1.0);

  const favs = await db.all<{ user_id: number; place_id: string; position: number }>(
    sql`SELECT user_id, place_id, position FROM favorite_places`).catch(() => []);
  for (const f of favs) add(f.user_id, f.place_id, Math.max(0, 1.4 - f.position * 0.12));

  const prefRows = await db.all<{ user_id: number; gender: string | null; birth_year: number | null }>(
    sql`SELECT user_id, gender, birth_year FROM user_prefs`);
  for (const p of prefRows) {
    const v = ensure(p.user_id);
    v.gender = p.gender;
    v.decade = p.birth_year ? Math.floor(p.birth_year / 10) : null;
  }
  return vecs;
}

/** Kosinus-Ähnlichkeit zweier Präferenz-Vektoren (über gemeinsame Orte) */
function cosine(a: Map<string, number>, b: Map<string, number>): { sim: number; overlap: number } {
  let dot = 0, overlap = 0;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (vb !== undefined) { dot += va * vb; overlap++; }
  }
  if (!overlap) return { sim: 0, overlap: 0 };
  const na = Math.sqrt([...a.values()].reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt([...b.values()].reduce((s, v) => s + v * v, 0));
  return { sim: na && nb ? dot / (na * nb) : 0, overlap };
}

/** Schnelle Distanz in km */
function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const x = (bLng - aLng) * Math.cos(((aLat + bLat) / 2) * Math.PI / 180) * 111.32;
  const y = (bLat - aLat) * 110.574;
  return Math.hypot(x, y);
}
const SPEED: Record<string, number> = { walk: 4.5, bike: 14, transit: 30, train: 100, auto: 70 };

// GET /discover/deck?lat&lng&mode&minutes&limit — personalisierte Karten
router.get('/deck', requireAuth, async (c) => {
  const user = c.get('user');
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  const mode = c.req.query('mode') ?? '';
  const minutes = Number(c.req.query('minutes') ?? 0);
  const limit = Math.min(60, Math.max(1, Number(c.req.query('limit') ?? 12)));
  const includeKnown = c.req.query('includeKnown') === '1' || c.req.query('includeKnown') === 'true';

  const cur = await getPrefs(user.id);
  const scores: TagScores = JSON.parse(cur?.tag_scores ?? '{}');

  // Bereits geswipte Orte ausschließen (Likes/Dislikes nicht erneut zeigen)
  const seenRows = await db.all<{ place_id: string }>(
    sql`SELECT DISTINCT place_id FROM swipe_events WHERE user_id = ${user.id} AND action IN ('like','dislike')`);
  const seen = new Set(seenRows.map(r => r.place_id));
  // „Nur neue Orte" (Standard): auch gemerkte + besuchte ausblenden
  if (!includeKnown) {
    const known = await db.all<{ place_id: string }>(sql`
      SELECT place_id FROM saved_places WHERE user_id = ${user.id}
      UNION SELECT place_id FROM visited_places WHERE user_id = ${user.id}`);
    for (const k of known) seen.add(k.place_id);
  }

  const all = (await db.select().from(places).all()).map(hydrate);
  const byId = new Map(all.map(p => [p.id, p]));

  // ── Eigenes Tag-Profil flüchtig anreichern (kein Doppelzählen in der DB):
  // echte Besuche, eigene Bewertungen und selbst eingereichte Orte sagen mehr
  // über den Geschmack als jeder Swipe.
  const enriched: TagScores = JSON.parse(JSON.stringify(scores));
  const bump = (pid: string, d: number) => {
    const pl = byId.get(pid);
    if (!pl) return;
    for (const t of placeTags(pl)) {
      const e = enriched[t] ?? { s: 0, n: 0 };
      e.s += d; e.n += 1;
      enriched[t] = e;
    }
  };
  const myVisits = await db.all<{ place_id: string }>(
    sql`SELECT place_id FROM visited_places WHERE user_id = ${user.id}`);
  for (const r of myVisits) bump(r.place_id, 0.8);
  const myRatings = await db.all<{ place_id: string; stars: number }>(
    sql`SELECT place_id, stars FROM ratings WHERE user_id = ${user.id}`);
  for (const r of myRatings) bump(r.place_id, ((r.stars - 3) / 2) * 1.2);
  const mySubs = await db.all<{ id: string }>(
    sql`SELECT id FROM places WHERE submitted_by = ${user.id}`);
  for (const r of mySubs) bump(r.id, 1.0);
  // Lieblingsorte: eigene Rangfolge prägt die Vorschläge mit
  const myFavs = await db.all<{ place_id: string; position: number }>(
    sql`SELECT place_id, position FROM favorite_places WHERE user_id = ${user.id}`).catch(() => []);
  for (const r of myFavs) bump(r.place_id, Math.max(0, 1.4 - r.position * 0.12));

  // ── Kollaboratives Filtern: ähnliche Nutzer:innen finden
  const vecs = await loadAllUserVectors();
  const me = vecs.get(user.id);
  const neighbors = me
    ? [...vecs.entries()]
        .filter(([uid]) => uid !== user.id)
        .map(([uid, v]) => ({ uid, v, ...cosine(me.prefs, v.prefs) }))
        .filter(n => n.overlap >= 1 && Math.abs(n.sim) > 0.05)
    : [];

  /** „Nutzer wie du fanden diesen Ort…" — mit Shrinkage bei dünner Beleglage */
  const cfScore = (pid: string): number => {
    let num = 0, den = 0, n = 0;
    for (const nb of neighbors) {
      const pref = nb.v.prefs.get(pid);
      if (pref === undefined) continue;
      num += nb.sim * pref; den += Math.abs(nb.sim); n++;
    }
    return den ? (num / den) * (n / (n + 2)) : 0;
  };

  // ── Demografie: gleiche Gender-/Altersdekaden-Gruppe als schwaches Vorzeichen
  const myGender = me?.gender ?? cur?.gender ?? null;
  const myDecade = me?.decade ?? (cur?.birth_year ? Math.floor(cur.birth_year / 10) : null);
  const demoScore = (pid: string): number => {
    if (!myGender && myDecade == null) return 0;
    let sum = 0, n = 0;
    for (const [uid, v] of vecs) {
      if (uid === user.id) continue;
      const sameG = !!myGender && v.gender === myGender;
      const sameD = myDecade != null && v.decade === myDecade;
      if (!sameG && !sameD) continue;
      const pref = v.prefs.get(pid);
      if (pref === undefined) continue;
      sum += pref * (sameG && sameD ? 1 : 0.6);
      n++;
    }
    return n ? (sum / n) * (n / (n + 3)) : 0;
  };

  let pool = all.filter(p => !seen.has(p.id));
  // Reichweiten-Filter (Luftlinie × Tempo) — die Karte daneben zeigt die Lage
  if (Number.isFinite(lat) && Number.isFinite(lng) && mode && minutes > 0) {
    const maxKm = (SPEED[mode] ?? 70) * (minutes / 60);
    pool = pool.filter(p => p.lat != null && p.lng != null && distKm(lat, lng, p.lat, p.lng) <= maxKm);
  }
  if (!pool.length) pool = all.filter(p => !seen.has(p.id));
  if (!pool.length) pool = all; // alles gesehen → von vorn

  const scored = pool.map(p => {
    const tags = placeTags(p);
    const aff = affinity(enriched, tags);
    const cf = cfScore(p.id);
    const demo = demoScore(p.id);
    const ratingFactor = p.reviews > 0 ? (p.rating - 3) / 4 : 0;   // schlechte Orte abwerten
    const secretBonus = tags.includes('secret:hoch') ? 0.15 : 0;
    const noise = Math.random() * 0.25;                            // Zufall fürs Kennenlernen
    // Persönlicher Match: Inhalt (70 %) + Schwarmwissen (30 %)
    const personal = Math.max(-1, Math.min(1, aff * 0.7 + cf * 0.3));
    return {
      p, tags, personal,
      score: aff * 1.0 + cf * 0.7 + demo * 0.3 + ratingFactor * 0.4 + secretBonus + noise,
    };
  }).sort((a, b) => b.score - a.score);

  // ε-Exploration: ~jeder 4. Slot bekommt einen Ort aus einer noch unbewerteten
  // Kategorie — so erkennen wir neue/veränderte Interessen
  const picked: typeof scored = [];
  const rest = [...scored];
  const knownCats = new Set(Object.keys(enriched).filter(k => k.startsWith('cat:')).map(k => k.slice(4)));
  while (picked.length < limit && rest.length) {
    const explore = picked.length % 4 === 3;
    let idx = 0;
    if (explore) {
      const i = rest.findIndex(x => !knownCats.has(x.p.category));
      idx = i >= 0 ? i : 0;
    }
    picked.push(rest.splice(idx, 1)[0]);
  }

  return c.json(picked.map(x => ({
    ...x.p,
    matchScore: Math.round(((x.personal + 1) / 2) * 100),   // 0–100 fürs UI
  })));
});

export default router;
