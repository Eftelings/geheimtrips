// Google Gemini (AI Studio) — KI-Unterstützung beim Anlegen von Orten:
// Kurz-Zusammenfassung für die Swipe-Karten + passende Tipps.
// Key über GEMINI_API_KEY (Google AI Studio). Modell per GEMINI_MODEL überschreibbar.
const KEY = process.env.GEMINI_API_KEY?.trim();

// Fallback-Kette: erst Qualität (2.5-flash), dann das Lite-Modell mit großzügigem
// Gratis-Kontingent. Bei 429 (Quota)/503 (Auslastung)/404 wird das nächste probiert.
const MODELS = process.env.GEMINI_MODEL?.trim()
  ? [process.env.GEMINI_MODEL.trim()]
  : ['gemini-2.5-flash', 'gemini-flash-lite-latest'];

export const geminiConfigured = !!KEY;

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

async function callGemini(prompt: string, maxOutputTokens = 300): Promise<string> {
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
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens, temperature: 0.85 },
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

/** Zwei kurze, einladende Sätze für die Swipe-Karte — aus der Beschreibung & den Feldern. */
export async function generateSummary(input: {
  name?: string; long?: string; highlight?: string; category?: string; location?: string;
}): Promise<string> {
  const long = stripHtml(input.long ?? '');
  if (long.length < 30 && !(input.highlight ?? '').trim()) {
    throw new Error('Für eine Zusammenfassung brauche ich zuerst etwas mehr Beschreibung.');
  }
  const prompt =
`Du schreibst für eine App mit Geheimtipps für Ausflugsorte in Deutschland.
Fasse den folgenden Ort in genau zwei kurzen, einladenden deutschen Sätzen zusammen.
Dieser Text erscheint auf einer Swipe-Karte – konkret, treffend, kein Werbe-Blabla, keine Floskeln.
Gib NUR die zwei Sätze aus, ohne Einleitung, ohne Anführungszeichen.

Name: ${input.name || '—'}
Kategorie: ${input.category || '—'}
Standort: ${input.location || '—'}
Besonderheit: ${stripHtml(input.highlight ?? '') || '—'}
Beschreibung: ${long || '—'}`;
  const out = await callGemini(prompt, 160);
  // evtl. umschließende Anführungszeichen entfernen, Länge begrenzen
  return out.replace(/^["„»]|["“«]$/g, '').trim().slice(0, 350);
}

/** Liefert konkrete, zum Ort passende Praxis-Tipps (je ein Satz). */
export async function generateTips(input: {
  name?: string; long?: string; category?: string; location?: string; count?: number;
}): Promise<string[]> {
  const n = Math.min(Math.max(input.count ?? 4, 1), 5);
  const prompt =
`Du bist ein erfahrener Local Guide. Erstelle ${n} kurze, konkrete und praktische Insider-Tipps
für den Besuch dieses Ortes (Anreise, beste Zeit, Parken, was man nicht verpassen sollte, Geheimtipp).
Beziehe dich wenn möglich konkret auf diesen Ort. Jeder Tipp ein einzelner, vollständiger deutscher Satz.
Gib NUR die Tipps aus – einen pro Zeile, ohne Nummerierung, ohne Aufzählungszeichen.

Name: ${input.name || '—'}
Standort: ${input.location || '—'}
Kategorie: ${input.category || '—'}
Beschreibung: ${stripHtml(input.long ?? '') || '—'}`;
  const out = await callGemini(prompt, 400);
  return out
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["„»]|["“«]$/g, '').trim())
    .filter(l => l.length > 3)
    .slice(0, n);
}
