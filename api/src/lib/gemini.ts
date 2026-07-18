// Google Gemini (AI Studio) — KI-Unterstützung beim Anlegen von Orten:
// Kurz-Zusammenfassung, Tipps, Text-Empfehlung aus Fotos (Vision) + Grammatik-Pass.
// Key über GEMINI_API_KEY (Google AI Studio). Modell per GEMINI_MODEL überschreibbar.
import * as fs from 'node:fs';
import * as path from 'node:path';

const KEY = process.env.GEMINI_API_KEY?.trim();

const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve(process.cwd(), 'uploads');

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

// Hochgeladene Bilder (URLs /api/uploads/…) vom Volume lesen und als base64-Parts für Gemini Vision aufbereiten.
async function loadImageParts(urls: string[]): Promise<Part[]> {
  const out: Part[] = [];
  for (const url of urls.slice(0, 3)) {
    try {
      const file = url.split('/').pop();
      if (!file) continue;
      const ext = file.split('.').pop()?.toLowerCase() ?? '';
      if (['mp4', 'webm', 'mov'].includes(ext)) continue; // keine Videos
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const buf = await fs.promises.readFile(path.join(UPLOAD_DIR, file));
      if (buf.length > 4 * 1024 * 1024) continue; // zu groß fürs Inline-Base64
      out.push({ inlineData: { mimeType, data: buf.toString('base64') } });
    } catch { /* Bild überspringen */ }
  }
  return out;
}

// Fallback-Kette: erst Qualität (2.5-flash), dann das Lite-Modell mit großzügigem
// Gratis-Kontingent. Bei 429 (Quota)/503 (Auslastung)/404 wird das nächste probiert.
const MODELS = process.env.GEMINI_MODEL?.trim()
  ? [process.env.GEMINI_MODEL.trim()]
  : ['gemini-2.5-flash', 'gemini-flash-lite-latest'];

export const geminiConfigured = !!KEY;

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

async function callGemini(prompt: string, maxOutputTokens = 300): Promise<string> {
  return callGeminiParts([{ text: prompt }], maxOutputTokens);
}

async function callGeminiParts(parts: Part[], maxOutputTokens = 300): Promise<string> {
  if (!KEY) throw new Error('Gemini ist nicht konfiguriert — GEMINI_API_KEY fehlt.');
  let lastErr = 'Gemini-Aufruf fehlgeschlagen.';
  for (const model of MODELS) {
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            // thinkingBudget:0 schaltet das „Nachdenken" der 2.5-Modelle ab — sonst
            // verbrauchen die internen Reasoning-Tokens das Output-Budget und der
            // eigentliche Text wird mittendrin abgeschnitten (Symptom: „3-Wort-Antwort").
            generationConfig: { maxOutputTokens, temperature: 0.85, thinkingConfig: { thinkingBudget: 0 } },
          }),
        },
      );
    } catch (e) {
      lastErr = (e as Error).message;
      continue;
    }
    if (res.ok) {
      const data = await res.json().catch(() => ({})) as any;
      const txt: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (txt && txt.trim()) return txt.trim();
      lastErr = 'Gemini lieferte eine leere Antwort.';
      continue;
    }
    const err = await res.json().catch(() => ({})) as any;
    lastErr = `${err?.error?.status ?? res.status}: ${err?.error?.message ?? 'Fehler'}`;
    // Nur bei Quota/Auslastung/Modell-nicht-da das nächste Modell versuchen, sonst abbrechen.
    if (![429, 503, 404, 500].includes(res.status)) break;
  }
  throw new Error(lastErr);
}

/** Genau ZWEI kurze, einladende Sätze für die Swipe-Karte — aus der Beschreibung & den Feldern. */
export async function generateSummary(input: {
  name?: string; long?: string; highlight?: string; category?: string; location?: string;
}): Promise<string> {
  const long = stripHtml(input.long ?? '');
  if (long.length < 30 && !(input.highlight ?? '').trim()) {
    throw new Error('Für eine Zusammenfassung brauche ich zuerst etwas mehr Beschreibung.');
  }
  const prompt =
`Du schreibst für eine App mit Geheimtipps für Ausflugsorte in Deutschland.
Fasse den Ort in GENAU ZWEI lebendigen deutschen Sätzen zusammen (zusammen ca. 25–40 Wörter), die so
neugierig machen, dass man sofort hin möchte. Konkret und sinnlich, nenne das Besondere – kein
Werbe-Blabla, keine Floskeln, keine Aufzählung, keine Anführungszeichen.
Der Text erscheint als Teaser auf einer Swipe-Karte. Gib NUR die zwei Sätze aus.

Name: ${input.name || '—'}
Kategorie: ${input.category || '—'}
Standort: ${input.location || '—'}
Besonderheit: ${stripHtml(input.highlight ?? '') || '—'}
Beschreibung: ${long || '—'}`;
  const out = await callGemini(prompt, 260);
  return out.replace(/^["„»]+|["“«]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 320);
}

/** Liefert konkrete, zum Ort passende Praxis-Tipps (je ein Satz). */
export async function generateTips(input: {
  name?: string; long?: string; category?: string; location?: string; count?: number;
}): Promise<string[]> {
  const n = Math.min(Math.max(input.count ?? 4, 1), 5);
  const prompt =
`Du bist ein erfahrener Local Guide. Erstelle ${n} konkrete, praktische Insider-Tipps
für den Besuch dieses Ortes (Anreise, beste Zeit, Parken, was man nicht verpassen sollte, Geheimtipp).
Beziehe dich wenn möglich konkret auf diesen Ort.

WICHTIG:
- Jeder Tipp ist ein VOLLSTÄNDIG ausformulierter deutscher Satz (mindestens 8 Wörter), keine Stichworte.
- Schreibe jeden Tipp auf GENAU eine Zeile (kein Zeilenumbruch innerhalb eines Tipps).
- Gib NUR die ${n} Tipps aus – einen pro Zeile, ohne Nummerierung, ohne Aufzählungszeichen, ohne Anführungszeichen.

Name: ${input.name || '—'}
Standort: ${input.location || '—'}
Kategorie: ${input.category || '—'}
Beschreibung: ${stripHtml(input.long ?? '') || '—'}`;
  const out = await callGemini(prompt, 600);
  return out
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["„»]+|["“«]+$/g, '').trim())
    // nur vollständige Sätze (Fragmente/Überschriften rausfiltern)
    .filter(l => l.length >= 15 && /\s/.test(l))
    .slice(0, n);
}

/** Formuliert eine lebendige Beschreibung — aus Notizen ausgebaut oder neu entworfen. */
export async function generateDescription(input: {
  name?: string; long?: string; category?: string; location?: string;
}): Promise<string> {
  const draft = stripHtml(input.long ?? '');
  const hasDraft = draft.length > 10;
  const prompt =
`Du hilfst beim Beschreiben eines Ausflugsorts für eine App mit Geheimtipps in Deutschland.
${hasDraft
  ? 'Formuliere die folgenden Notizen zu einer lebendigen, persönlichen Beschreibung aus (3–5 Sätze). Behalte alle genannten Fakten bei und erfinde nichts dazu.'
  : 'Schreibe eine lebendige, einladende Beschreibung (3–5 Sätze) für diesen Ort.'}
Atmosphärisch und konkret, kein Werbe-Blabla, keine Floskeln, keine Überschrift, keine Anführungszeichen.
Gib NUR den Beschreibungstext aus.

Name: ${input.name || '—'}
Kategorie: ${input.category || '—'}
Standort: ${input.location || '—'}
${hasDraft ? `Notizen: ${draft}` : ''}`;
  const out = await callGemini(prompt, 600);
  return out.replace(/^["„»]+|["“«]+$/g, '').trim();
}

/** B: Text-Empfehlung aus den hochgeladenen Fotos + Name + Standort (Gemini Vision). */
export async function generateRecommendation(input: {
  name?: string; location?: string; imageUrls?: string[];
}): Promise<string> {
  const imageParts = await loadImageParts(input.imageUrls ?? []);
  if (imageParts.length === 0) {
    throw new Error('Für eine Foto-Empfehlung lade zuerst mindestens ein Foto hoch.');
  }
  const prompt =
`Du hilfst beim Beschreiben eines Ausflugsorts für eine App mit Geheimtipps in Deutschland.
Schau dir die beigefügten Fotos an und schreibe eine lebendige, einladende deutsche Beschreibung (3–5 Sätze),
die zu den Fotos, dem Namen und dem Standort passt. Beschreibe nur, was plausibel zu sehen/erkennbar ist –
erfinde keine falschen Fakten (keine Öffnungszeiten, Preise o.Ä.). Atmosphärisch und konkret, kein Werbe-Blabla,
keine Floskeln, keine Überschrift, keine Anführungszeichen. Gib NUR den Beschreibungstext aus.

Name: ${input.name || '—'}
Standort: ${input.location || '—'}`;
  const out = await callGeminiParts([{ text: prompt }, ...imageParts], 600);
  return out.replace(/^["„»]+|["“«]+$/g, '').trim();
}

/** B: Reiner Korrektur-Pass — nur Rechtschreibung/Zeichensetzung/Grammatik, sonst nichts ändern. */
export async function proofread(text: string): Promise<string> {
  const clean = (text ?? '').trim();
  if (clean.length < 3) return text;
  const prompt =
`Korrigiere im folgenden deutschen Text AUSSCHLIESSLICH Rechtschreibung, Zeichensetzung und Grammatik.
Ändere NICHTS am Inhalt, am Stil, an der Wortwahl oder an der Reihenfolge. Formuliere nicht um, kürze nicht,
füge nichts hinzu. Falls HTML-Tags (z.B. <b>, <i>) oder Zeilenumbrüche vorkommen, behalte sie exakt bei.
Gib NUR den korrigierten Text aus, ohne Anführungszeichen, ohne Kommentar.

Text:
${text}`;
  const out = await callGemini(prompt, Math.min(2000, Math.ceil(clean.length / 2) + 300));
  const fixed = out.replace(/^["„»]+|["“«]+$/g, '').trim();
  // Sicherheitsnetz: wenn die KI den Text stark verändert (Länge ±40 %), lieber das Original behalten.
  if (!fixed || Math.abs(fixed.length - clean.length) > clean.length * 0.4) return text;
  return fixed;
}

/** proofread, aber niemals werfend — gibt im Zweifel das Original zurück (für den Absende-Pfad). */
export async function proofreadSafe(text: string): Promise<string> {
  if (!geminiConfigured) return text;
  try { return await proofread(text); } catch { return text; }
}
