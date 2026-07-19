import sanitizeHtml from 'sanitize-html';

/**
 * Bereinigt nutzergenerierten Rich-Text (Geschichte, Tipps) vor dem Speichern.
 * Erlaubt nur harmlose Formatierungs-Tags — entfernt <script>, Event-Handler,
 * Inline-Styles, iframes etc. Schützt vor gespeichertem XSS, da diese Inhalte
 * im Frontend per dangerouslySetInnerHTML gerendert werden.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  // img erlaubt eingebettete Reiseblog-Bilder; Schemes leer → nur relative /api/uploads/-URLs,
  // keine externen Bilder/Tracking-Pixel/data:-URIs.
  // figure/figcaption: eingebettete Bilder mit Bildunterschrift + Format-Klasse (quer/hoch).
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'ul', 'ol', 'li', 'span', 'img', 'a', 'figure', 'figcaption'],
  // Nur ein gefiltertes style-Attribut: manche Browser (v.a. iOS Safari) erzeugen
  // beim Formatieren <span style="font-weight:…"> statt <b>/<i>/<u>. Wir erlauben
  // ausschließlich diese harmlosen Formatierungs-Properties — kein position, url(),
  // kein onerror etc. → kein XSS / kein Layout-Hijack.
  // <a> nur für interne Ort-Verlinkungen: href ist relativ (/place/…) → externe/js:-Schemes
  // werden durch allowedSchemes:[] geblockt.
  allowedAttributes: { '*': ['style'], img: ['src', 'class', 'alt'], a: ['href', 'class', 'data-place-id'], figure: ['class'] },
  allowedStyles: {
    '*': {
      'font-weight':          [/^(bold|bolder|[5-9]00)$/],
      'font-style':           [/^(italic|oblique)$/],
      'text-decoration':      [/^underline/],
      'text-decoration-line': [/^underline/],
    },
  },
  allowedSchemes: [],
  allowedSchemesByTag: { img: [] },   // img-src: nur schemalos (relativ) → blockt http(s)/data
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
