import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// Produktion: UPLOAD_DIR auf ein persistentes Volume (z.B. Railway /data/uploads).
// Lokal: ./uploads im Projektordner als Fallback.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// Diagnose: zeigt in den Railway-Logs, wohin Uploads geschrieben werden.
// Sollte in Produktion '/data/uploads' (persistentes Volume) sein — NICHT '/app/...'.
console.log(`📁 UPLOAD_DIR = ${UPLOAD_DIR}${process.env.UPLOAD_DIR ? '' : '  ⚠️ (Env nicht gesetzt → temporär, geht bei Redeploy verloren!)'}`);

// Persistenz-Selbsttest: Marker schreiben und beim nächsten Start prüfen, ob er den
// Redeploy überlebt hat. Überlebt er → /data/uploads ist wirklich persistent.
try {
  const marker = path.join(UPLOAD_DIR, '.persist-check');
  const existing = fs.existsSync(marker);
  const fileCount = fs.readdirSync(UPLOAD_DIR).filter(f => !f.startsWith('.')).length;
  console.log(existing
    ? `✅ Uploads PERSISTENT — Marker vom ${fs.readFileSync(marker, 'utf8')} hat den Redeploy überlebt. Aktuell ${fileCount} Datei(en) im Ordner.`
    : `🆕 Kein Persistenz-Marker gefunden — entweder erster Start mit dieser Pruefung ODER der Ordner wurde geleert (nicht persistent). Aktuell ${fileCount} Datei(en).`);
  fs.writeFileSync(marker, new Date().toISOString());
} catch (e) { console.error('Persistenz-Check fehlgeschlagen:', e); }

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg':  'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp':  'webp', 'image/gif': 'gif',
  'image/heic':  'heic', 'image/heif': 'heif',        // HEIC/HEIF (iPhone)
  'video/mp4':   'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};

const SERVE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
};

// ── Upload router (mounted at /media) ─────────────────────────────────────────
export const uploadRouter = new Hono();

uploadRouter.post('/upload', requireAuth, async (c) => {
  try {
    const form = await c.req.formData();
    const file = form.get('file') as File | null;

    if (!file)                          return c.json({ error: 'Keine Datei angegeben.' }, 400);
    const ext = ALLOWED_MIME[file.type];
    if (!ext)                           return c.json({ error: 'Dateityp nicht erlaubt.' }, 400);
    // Videos: 80 MB — Images/HEIC: 30 MB
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? 80 * 1024 * 1024 : 30 * 1024 * 1024;
    if (file.size > maxSize) return c.json({ error: `Maximale Dateigröße: ${isVideo ? '80' : '30'} MB.` }, 400);

    let buffer = Buffer.from(await file.arrayBuffer());
    let outExt = ext;

    // HEIC/HEIF (iPhone-Standardformat) → JPEG konvertieren, sonst können
    // Chrome/Firefox/Inkognito die Bilder nicht anzeigen (nur Safari kann HEIC).
    if (ext === 'heic' || ext === 'heif') {
      try {
        const convert = (await import('heic-convert')).default;
        const jpeg = await convert({ buffer, format: 'JPEG', quality: 0.85 });
        buffer = Buffer.from(jpeg);
        outExt = 'jpg';
      } catch (e) {
        console.error('HEIC-Konvertierung fehlgeschlagen:', e);
        return c.json({ error: 'Dieses HEIC-Foto konnte nicht verarbeitet werden. Bitte als JPG hochladen.' }, 400);
      }
    }

    const filename = `${crypto.randomBytes(16).toString('hex')}.${outExt}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

    // Unter /api ausgeliefert (Single-Origin) — siehe Mount in index.ts
    return c.json({ url: `/api/uploads/${filename}` });
  } catch (e) {
    console.error('Upload error:', e);
    return c.json({ error: 'Upload fehlgeschlagen.' }, 500);
  }
});

// ── Serve router (mounted at /uploads) ────────────────────────────────────────
export const serveRouter = new Hono();

serveRouter.get('/:filename', async (c) => {
  const filename = c.req.param('filename');

  // Sanitize: block path traversal
  if (/[/\\]/.test(filename) || filename.includes('..')) {
    return c.json({ error: 'Ungültiger Dateiname.' }, 400);
  }

  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) return c.json({ error: 'Nicht gefunden.' }, 404);

  const ext  = path.extname(filename).slice(1).toLowerCase();
  const mime = SERVE_MIME[ext] ?? 'application/octet-stream';
  const data = fs.readFileSync(filepath);

  return new Response(data, {
    headers: {
      'Content-Type':   mime,
      'Cache-Control':  'public, max-age=31536000, immutable',
      'Content-Length': String(data.length),
    },
  });
});
