import { Hono } from 'hono';
import { db } from '../db/index.js';
import { categories } from '../db/schema.js';
import { eq, asc, count } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// ── Tabelle + Seed der Standard-Kategorien (idempotent) ───────────────────────
db.run(sql`
  CREATE TABLE IF NOT EXISTS categories (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    slug     TEXT NOT NULL UNIQUE,
    label    TEXT NOT NULL,
    icon     TEXT NOT NULL DEFAULT 'fa-tag',
    color    TEXT DEFAULT '#71587A',
    keywords TEXT DEFAULT '',
    sort     INTEGER NOT NULL DEFAULT 0,
    active   INTEGER NOT NULL DEFAULT 1
  )
`).then(async () => {
  const existing = await db.select({ c: count() }).from(categories);
  if ((existing[0]?.c ?? 0) > 0) return;
  await db.insert(categories).values([
    { slug: 'natur',    label: 'Natur',     icon: 'fa-leaf',           color: '#5B8F6E', keywords: 'wald,see,berg,fluss,wasserfall,naturpark', sort: 0 },
    { slug: 'kultur',   label: 'Kultur',    icon: 'fa-landmark',       color: '#8A6FB3', keywords: 'museum,kirche,schloss,burg,denkmal,theater', sort: 1 },
    { slug: 'genuss',   label: 'Genuss',    icon: 'fa-mug-hot',        color: '#D97757', keywords: 'café,cafe,restaurant,weingut,brauerei', sort: 2 },
    { slug: 'aktiv',    label: 'Aktiv',     icon: 'fa-person-hiking',  color: '#F99039', keywords: 'klettern,wandern,rad,kanu,park', sort: 3 },
    { slug: 'mystisch', label: 'Mystisch',  icon: 'fa-user-secret',    color: '#4A8C7A', keywords: 'ruine,höhle,sage,verlassen,lost place', sort: 4 },
    { slug: 'wasser',   label: 'Am Wasser', icon: 'fa-water',          color: '#3E7CB1', keywords: 'see,strand,küste,meer,fluss,badesee', sort: 5 },
  ]);
  console.log('Kategorien-Seed angelegt.');
}).catch(console.error);

const router = new Hono();

// GET /categories — aktive Kategorien (öffentlich)
router.get('/', async (c) => {
  const rows = await db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.sort)).all();
  return c.json(rows);
});

// GET /categories/merkmale — DB-Overrides der Merkmale (neu hinzugefügte + ausgeblendete)
// Das Frontend mischt diese mit der Code-Taxonomie (taxonomy.ts).
router.get('/merkmale', async (c) => {
  const rows = await db.all(
    sql`SELECT l3_slug as l3Slug, key, label, hidden FROM merkmale`
  ).catch(() => []) as { l3Slug: string; key: string; label: string; hidden: number }[];
  return c.json(rows);
});

export default router;
