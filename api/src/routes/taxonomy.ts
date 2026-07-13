import { Hono } from 'hono';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { notify } from '../lib/notify.js';
import { T2_GROUPS, T2_TAGS, T2_MERKMALE, T2_VIBES, T2_MAP } from '../data/taxonomy2.js';

const router = new Hono();

async function notifyAdmins(title: string, body: string) {
  const admins = await db.all<{ id: number }>(sql`SELECT id FROM users WHERE is_admin = 1`).catch(() => []);
  for (const a of admins) await notify({ userId: a.id, type: 'tax_moderation', title, body, link: '/admin/taxonomy' });
}

// Slug aus einem Label (deutsche Umlaute + & → und)
export function taxSlug(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/&/g, ' und ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Tabellen (neues Modell: Tags · Merkmale · Vibes + Mappings) ───────────────
async function ensureTables() {
  await db.run(sql`CREATE TABLE IF NOT EXISTS tax_groups (
    slug TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT, color TEXT, sort INTEGER DEFAULT 0)`);
  await db.run(sql`CREATE TABLE IF NOT EXISTS tax_tags (
    slug TEXT PRIMARY KEY, label TEXT NOT NULL, sort INTEGER DEFAULT 0,
    is_approved INTEGER DEFAULT 1, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
  await db.run(sql`CREATE TABLE IF NOT EXISTS tax_tag_group (
    tag_slug TEXT NOT NULL, group_slug TEXT NOT NULL, PRIMARY KEY (tag_slug, group_slug))`);
  await db.run(sql`CREATE TABLE IF NOT EXISTS tax_merkmale (
    slug TEXT PRIMARY KEY, label TEXT NOT NULL, is_approved INTEGER DEFAULT 1,
    created_by INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
  await db.run(sql`CREATE TABLE IF NOT EXISTS tax_vibes (
    slug TEXT PRIMARY KEY, label TEXT NOT NULL, is_approved INTEGER DEFAULT 1,
    created_by INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
  await db.run(sql`CREATE TABLE IF NOT EXISTS tax_tag_merkmal (
    tag_slug TEXT NOT NULL, merkmal_slug TEXT NOT NULL, is_approved INTEGER DEFAULT 1,
    created_by INTEGER, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (tag_slug, merkmal_slug))`);
  await db.run(sql`CREATE TABLE IF NOT EXISTS tax_tag_vibe (
    tag_slug TEXT NOT NULL, vibe_slug TEXT NOT NULL, is_approved INTEGER DEFAULT 1,
    created_by INTEGER, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (tag_slug, vibe_slug))`);
  await db.run(sql`CREATE TABLE IF NOT EXISTS tax_aliases (
    alias_slug TEXT PRIMARY KEY, canonical_slug TEXT NOT NULL, kind TEXT NOT NULL)`);
}

// ── Idempotenter Seed aus dem Konzept-Dokument (INSERT OR IGNORE, gebündelt) ───
async function seedTaxonomy() {
  // Globale Merkmal-/Vibe-Listen (Teil 2/3 ∪ alle im Mapping referenzierten)
  const merk = new Map<string, string>();
  for (const l of T2_MERKMALE) merk.set(taxSlug(l), l);
  const vibe = new Map<string, string>();
  for (const l of T2_VIBES) vibe.set(taxSlug(l), l);
  for (const t of Object.values(T2_MAP)) {
    for (const l of t.m) if (!merk.has(taxSlug(l))) merk.set(taxSlug(l), l);
    for (const l of t.v) if (!vibe.has(taxSlug(l))) vibe.set(taxSlug(l), l);
  }

  const chunks = <T>(a: T[], n: number) => a.length ? Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n)) : [];
  const runRows = async (head: string, rows: ReturnType<typeof sql>[]) => {
    for (const c of chunks(rows, 50)) await db.run(sql`${sql.raw(head)} VALUES ${sql.join(c, sql`, `)}`);
  };

  await runRows('INSERT OR IGNORE INTO tax_groups (slug,label,icon,color,sort)',
    T2_GROUPS.map((g, i) => sql`(${g.slug},${g.label},${g.icon},${g.color},${i})`));
  await runRows('INSERT OR IGNORE INTO tax_tags (slug,label,sort)',
    T2_TAGS.map((t, i) => sql`(${taxSlug(t.label)},${t.label},${i})`));
  await runRows('INSERT OR IGNORE INTO tax_tag_group (tag_slug,group_slug)',
    T2_TAGS.flatMap(t => t.groups.map(g => sql`(${taxSlug(t.label)},${g})`)));
  await runRows('INSERT OR IGNORE INTO tax_merkmale (slug,label)',
    [...merk].map(([s, l]) => sql`(${s},${l})`));
  await runRows('INSERT OR IGNORE INTO tax_vibes (slug,label)',
    [...vibe].map(([s, l]) => sql`(${s},${l})`));

  const tm: ReturnType<typeof sql>[] = [];
  const tv: ReturnType<typeof sql>[] = [];
  for (const [tagLabel, map] of Object.entries(T2_MAP)) {
    const ts = taxSlug(tagLabel);
    for (const m of map.m) tm.push(sql`(${ts},${taxSlug(m)})`);
    for (const v of map.v) tv.push(sql`(${ts},${taxSlug(v)})`);
  }
  await runRows('INSERT OR IGNORE INTO tax_tag_merkmal (tag_slug,merkmal_slug)', tm);
  await runRows('INSERT OR IGNORE INTO tax_tag_vibe (tag_slug,vibe_slug)', tv);

  // Aufräumen: Vibes sind Adjektive — Nomen-Vibe „Klassisches Kaffeehaus" → „Nostalgisch".
  // (INSERT OR IGNORE lässt Alt-Einträge sonst stehen; idempotent.)
  await db.run(sql`UPDATE places SET vibe_json = replace(vibe_json, 'klassisches-kaffeehaus', 'nostalgisch')
    WHERE vibe_json LIKE '%klassisches-kaffeehaus%'`).catch(() => {});
  await db.run(sql`DELETE FROM tax_tag_vibe WHERE vibe_slug = 'klassisches-kaffeehaus'`).catch(() => {});
  await db.run(sql`DELETE FROM tax_vibes WHERE slug = 'klassisches-kaffeehaus'`).catch(() => {});
}

(async () => {
  try { await ensureTables(); await seedTaxonomy(); console.log('Taxonomie (Tags/Merkmale/Vibes) geseedet.'); }
  catch (e) { console.error('Taxonomie-Seed fehlgeschlagen:', (e as Error).message); }
})();

// ── Read-only API ──────────────────────────────────────────────────────────────

// GET /taxonomy — komplettes Vokabular (Gruppen, Tags+Gruppen, freigegebene Merkmale/Vibes)
router.get('/', async (c) => {
  const groups = await db.all(sql`SELECT slug, label, icon, color FROM tax_groups ORDER BY sort`).catch(() => []);
  const tagRows = await db.all<{ slug: string; label: string }>(sql`SELECT slug, label FROM tax_tags WHERE is_approved = 1 ORDER BY sort`).catch(() => []);
  const tg = await db.all<{ tag_slug: string; group_slug: string }>(sql`SELECT tag_slug, group_slug FROM tax_tag_group`).catch(() => []);
  const byTag = new Map<string, string[]>();
  for (const r of tg) { const a = byTag.get(r.tag_slug) ?? []; a.push(r.group_slug); byTag.set(r.tag_slug, a); }
  const tags = tagRows.map(t => ({ ...t, groups: byTag.get(t.slug) ?? [] }));
  const merkmale = await db.all(sql`SELECT slug, label FROM tax_merkmale WHERE is_approved = 1 ORDER BY label`).catch(() => []);
  const vibes = await db.all(sql`SELECT slug, label FROM tax_vibes WHERE is_approved = 1 ORDER BY label`).catch(() => []);
  return c.json({ groups, tags, merkmale, vibes });
});

// GET /taxonomy/tag/:slug/suggestions — gemappte Merkmale + Vibes für einen Tag (fürs Anlege-Formular)
router.get('/tag/:slug/suggestions', async (c) => {
  const slug = c.req.param('slug');
  const merkmale = await db.all(sql`
    SELECT m.slug, m.label FROM tax_tag_merkmal tm JOIN tax_merkmale m ON m.slug = tm.merkmal_slug
    WHERE tm.tag_slug = ${slug} AND tm.is_approved = 1 AND m.is_approved = 1 ORDER BY m.label`).catch(() => []);
  const vibes = await db.all(sql`
    SELECT v.slug, v.label FROM tax_tag_vibe tv JOIN tax_vibes v ON v.slug = tv.vibe_slug
    WHERE tv.tag_slug = ${slug} AND tv.is_approved = 1 AND v.is_approved = 1 ORDER BY v.label`).catch(() => []);
  return c.json({ merkmale, vibes });
});

// POST /taxonomy/resolve — Auswahl (Slugs oder Freitext) auflösen; Neues/ungewöhnliche
// Verknüpfungen als „to review" anlegen (is_approved=0) + Admins benachrichtigen.
router.post('/resolve', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({})) as { tag?: string; merkmale?: string[]; vibes?: string[] };
  const tag = taxSlug(body.tag ?? '');
  if (!tag) return c.json({ error: 'Tag fehlt.' }, 400);
  const tagRow = await db.all<{ label: string }>(sql`SELECT label FROM tax_tags WHERE slug = ${tag}`).catch(() => []);
  if (!tagRow.length) return c.json({ error: 'Unbekannter Tag.' }, 400);
  const tagLabel = tagRow[0].label;

  const canonical = async (input: string, table: 'tax_merkmale' | 'tax_vibes', kind: 'merkmal' | 'vibe') => {
    const s = taxSlug(input);
    const al = await db.all<{ c: string }>(sql`SELECT canonical_slug AS c FROM tax_aliases WHERE alias_slug = ${s} AND kind = ${kind}`).catch(() => []);
    const cs = al[0]?.c ?? s;
    const ex = await db.all<{ slug: string }>(sql`SELECT slug FROM ${sql.raw(table)} WHERE slug = ${cs}`).catch(() => []);
    return { slug: ex.length ? cs : s, exists: ex.length > 0 };
  };

  const newMerk: string[] = [], crossLinks: string[] = [], newVibes: string[] = [];
  const outMerk: string[] = [];
  for (const input of body.merkmale ?? []) {
    if (!input?.trim()) continue;
    const { slug, exists } = await canonical(input, 'tax_merkmale', 'merkmal');
    outMerk.push(slug);
    if (!exists) { await db.run(sql`INSERT OR IGNORE INTO tax_merkmale (slug,label,is_approved,created_by) VALUES (${slug},${input.trim()},0,${user.id})`); newMerk.push(input.trim()); }
    const link = await db.all(sql`SELECT 1 AS x FROM tax_tag_merkmal WHERE tag_slug = ${tag} AND merkmal_slug = ${slug}`).catch(() => []);
    if (!link.length) {
      await db.run(sql`INSERT OR IGNORE INTO tax_tag_merkmal (tag_slug,merkmal_slug,is_approved,created_by) VALUES (${tag},${slug},0,${user.id})`);
      if (exists) crossLinks.push(input.trim());   // bestehendes Merkmal, neu am Tag → ungewöhnliche Verknüpfung
    }
  }
  const outVibes: string[] = [];
  for (const input of body.vibes ?? []) {
    if (!input?.trim()) continue;
    const { slug, exists } = await canonical(input, 'tax_vibes', 'vibe');
    outVibes.push(slug);
    if (!exists) { await db.run(sql`INSERT OR IGNORE INTO tax_vibes (slug,label,is_approved,created_by) VALUES (${slug},${input.trim()},0,${user.id})`); newVibes.push(input.trim()); }
    await db.run(sql`INSERT OR IGNORE INTO tax_tag_vibe (tag_slug,vibe_slug,is_approved) VALUES (${tag},${slug},${exists ? 1 : 0})`);
  }

  if (newMerk.length || crossLinks.length || newVibes.length) {
    const parts: string[] = [];
    if (newMerk.length)    parts.push(`neue Merkmale: ${newMerk.join(', ')}`);
    if (crossLinks.length) parts.push(`neue Verknüpfung zu „${tagLabel}": ${crossLinks.join(', ')}`);
    if (newVibes.length)   parts.push(`neue Vibes: ${newVibes.join(', ')}`);
    await notifyAdmins('Taxonomie prüfen', `${user.name} bei „${tagLabel}" — ${parts.join(' · ')}.`);
  }

  return c.json({ tag, merkmale: outMerk, vibes: outVibes });
});

export default router;
