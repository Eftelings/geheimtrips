/**
 * Einmal-Backfill: bestehende Uploads nachträglich optimieren.
 *
 * Hintergrund: Die Upload-Pipeline komprimiert erst seit einer späteren Version
 * (max 1600px, WebP q80). Alles davor liegt als rohes Original im Upload-Ordner —
 * z.B. Handyfotos mit 3024x4032 und 3–4 MB. Das Skript rechnet sie nach und zieht
 * die Verweise in der DB mit (places.hero, places.gallery_json, place_media.url).
 *
 *   npm run optimize-images -- --dry     # nur anzeigen, nichts ändern
 *   npm run optimize-images              # konvertieren + DB umbiegen (Originale bleiben)
 *   npm run optimize-images -- --prune   # zusätzlich die nun unbenutzten Originale löschen
 *
 * In Produktion mit denselben Env-Vars laufen lassen (DATABASE_URL, UPLOAD_DIR).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

const DRY   = process.argv.includes('--dry');
const PRUNE = process.argv.includes('--prune');

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads');

const CONVERTIBLE = new Set(['.jpg', '.jpeg', '.png']);   // gif = Animation, Videos = separat
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

/** Ersetzt einen Dateinamen in einer URL, egal ob "/uploads/x" oder "/api/uploads/x". */
const swap = (url: string, from: string, to: string) =>
  url.endsWith(`/${from}`) ? url.slice(0, -from.length) + to : url;

async function main() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.error(`Upload-Ordner nicht gefunden: ${UPLOAD_DIR}`);
    process.exit(1);
  }
  const sharp = (await import('sharp')).default;

  const files = fs.readdirSync(UPLOAD_DIR).filter(f => !f.startsWith('.'));
  const todo = files.filter(f => CONVERTIBLE.has(path.extname(f).toLowerCase()));
  const videos = files.filter(f => ['.mp4', '.mov', '.webm'].includes(path.extname(f).toLowerCase()));

  console.log(`Upload-Ordner: ${UPLOAD_DIR}`);
  console.log(`${files.length} Dateien, davon ${todo.length} konvertierbar${DRY ? '  [DRY-RUN]' : ''}\n`);

  const renames: { from: string; to: string }[] = [];
  const corrupt: string[] = [];
  let before = 0, after = 0;

  for (const f of todo) {
    const src = path.join(UPLOAD_DIR, f);
    const origSize = fs.statSync(src).size;
    try {
      const out = await sharp(src)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      // Größer geworden? Dann lohnt es nicht (z.B. winzige PNGs) → Original behalten.
      if (out.length >= origSize) {
        console.log(`  – ${f}: ${kb(origSize)} → ${kb(out.length)} (kein Gewinn, übersprungen)`);
        continue;
      }

      const target = `${path.basename(f, path.extname(f))}.webp`;
      before += origSize; after += out.length;
      console.log(`  ✓ ${f}: ${kb(origSize)} → ${kb(out.length)}  (−${(100 - out.length / origSize * 100).toFixed(0)} %)`);

      if (!DRY) fs.writeFileSync(path.join(UPLOAD_DIR, target), out);
      renames.push({ from: f, to: target });
    } catch {
      // Nicht lesbar → defekte/abgeschnittene Datei (z.B. 70-Byte-PNG-Stummel aus Tests).
      // Original bleibt unangetastet; unten wird gemeldet, ob ein Ort darauf verweist.
      corrupt.push(f);
      console.log(`  ! ${f}: ${kb(origSize)} — nicht lesbar (defekt), übersprungen`);
    }
  }

  if (!renames.length) {
    console.log('\nNichts zu tun.');
  } else if (!DRY) {
    console.log('\nDB-Verweise umbiegen …');
    const map = new Map(renames.map(r => [r.from, r.to]));

    // places.hero
    const heroes = await db.all<{ id: string; hero: string }>(sql`SELECT id, hero FROM places WHERE hero LIKE '%uploads/%'`);
    for (const p of heroes) {
      const file = p.hero.split('/').pop() ?? '';
      const to = map.get(file);
      if (to) await db.run(sql`UPDATE places SET hero = ${swap(p.hero, file, to)} WHERE id = ${p.id}`);
    }

    // places.gallery_json — string[] (alt) oder {url,…}[] (neu)
    const gals = await db.all<{ id: string; gallery_json: string | null }>(sql`SELECT id, gallery_json FROM places WHERE gallery_json LIKE '%uploads/%'`);
    for (const p of gals) {
      try {
        const list = JSON.parse(p.gallery_json ?? '[]') as (string | { url: string })[];
        let changed = false;
        const next = list.map(item => {
          const url = typeof item === 'string' ? item : item.url;
          const file = url?.split('/').pop() ?? '';
          const to = map.get(file);
          if (!to) return item;
          changed = true;
          return typeof item === 'string' ? swap(url, file, to) : { ...item, url: swap(url, file, to) };
        });
        if (changed) await db.run(sql`UPDATE places SET gallery_json = ${JSON.stringify(next)} WHERE id = ${p.id}`);
      } catch { /* kaputtes JSON überspringen */ }
    }

    // place_media.url (+ photo_likes hängen an der URL)
    const media = await db.all<{ id: number; url: string }>(sql`SELECT id, url FROM place_media WHERE url LIKE '%uploads/%'`);
    for (const m of media) {
      const file = m.url.split('/').pop() ?? '';
      const to = map.get(file);
      if (!to) continue;
      const nu = swap(m.url, file, to);
      await db.run(sql`UPDATE place_media SET url = ${nu} WHERE id = ${m.id}`);
      await db.run(sql`UPDATE photo_likes SET photo_url = ${nu} WHERE photo_url = ${m.url}`).catch(() => {});
    }
    console.log('DB aktualisiert.');

    if (PRUNE) {
      let freed = 0;
      for (const r of renames) {
        const p = path.join(UPLOAD_DIR, r.from);
        try { freed += fs.statSync(p).size; fs.unlinkSync(p); } catch { /* egal */ }
      }
      console.log(`Originale gelöscht — ${kb(freed)} freigegeben.`);
    }
  }

  console.log('\n─── Ergebnis ───');
  console.log(`Konvertiert : ${renames.length}`);
  if (before) {
    console.log(`Vorher      : ${kb(before)}`);
    console.log(`Nachher     : ${kb(after)}   (−${(100 - after / before * 100).toFixed(0)} %)`);
  }

  // Defekte Dateien: sagen, ob sie noch irgendwo verlinkt sind (dann ist dort das Bild kaputt)
  if (corrupt.length) {
    console.log(`\nDefekte Dateien: ${corrupt.length} (nicht lesbar, unangetastet gelassen)`);
    for (const f of corrupt) {
      const p = await db.all<{ name: string }>(sql`
        SELECT name FROM places WHERE hero LIKE ${'%' + f} OR gallery_json LIKE ${'%' + f + '%'}`).catch(() => []);
      console.log(p.length
        ? `  ⚠ ${f} — VERLINKT bei: ${p.map(x => x.name).join(', ')}  (dort ist das Bild kaputt)`
        : `  · ${f} — nirgends verlinkt (Waise, gefahrlos löschbar)`);
    }
  }
  if (videos.length) {
    const vSize = videos.reduce((n, f) => n + fs.statSync(path.join(UPLOAD_DIR, f)).size, 0);
    console.log(`\nHinweis: ${videos.length} Video(s), zusammen ${kb(vSize)} — die rührt dieses Skript nicht an.`);
  }
  if (!PRUNE && renames.length && !DRY) {
    console.log('\nDie Originale liegen noch da. Mit "--prune" löschen, wenn alles passt.');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
