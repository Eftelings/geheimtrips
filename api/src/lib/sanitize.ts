import sanitizeHtml from 'sanitize-html';

/**
 * Bereinigt nutzergenerierten Rich-Text (Geschichte, Tipps) vor dem Speichern.
 * Erlaubt nur harmlose Formatierungs-Tags — entfernt <script>, Event-Handler,
 * Inline-Styles, iframes etc. Schützt vor gespeichertem XSS, da diese Inhalte
 * im Frontend per dangerouslySetInnerHTML gerendert werden.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'ul', 'ol', 'li', 'span'],
  allowedAttributes: {},          // keine Attribute (kein style, kein onerror, kein href)
  allowedSchemes: [],
  disallowedTagsMode: 'discard',
};

export function cleanRichText(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) return '';
  return sanitizeHtml(input, OPTIONS).trim();
}

/** Klartext (keinerlei HTML) — für kurze Felder wie Highlight/Trivia. */
export function cleanPlainText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim();
}
