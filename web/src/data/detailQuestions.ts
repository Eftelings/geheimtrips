import type { SubmitQuestion } from './taxonomy.js';

/**
 * Zusatz-Infos im neuen Tag-Modell, abhängig vom Typ:
 *  - Gastro (Restaurant/Café/…): Speisekarte, Reservierung, Kontakt — KEIN Eintritt
 *  - Eintritts-Orte (Museen/Parks/…): Ticketpreise + Ticket-Link
 *  - Öffnungszeiten/Kontakt nur, wo es Sinn ergibt (Natur-Orte haben keine)
 */
const GASTRO = new Set(['restaurant', 'caf', 'bar-und-pub', 'eisdiele', 'markt-und-markthalle']);
const ENTRY = new Set([
  'kunstmuseum', 'galerie', 'technikmuseum', 'industriemuseum', 'naturkundemuseum', 'wissenschaftsmuseum',
  'geschichtsmuseum', 'anthropologisches-museum', 'freilichtmuseum', 'planetarium', 'science-center', 'bergwerk',
  'freizeitpark', 'miniaturwelt', 'zoo', 'tierpark', 'wildgehege', 'aquarium', 'schwimmbad', 'wasserpark', 'therme',
  'hochseilgarten', 'sommerrodelbahn', 'minigolf', 'seilbahn', 'trampolinhalle', 'paintball', 'lasertag',
  'escape-room', 'vr-und-gaming-lounge', 'kino', 'theater', 'botanischer-garten', 'markenwelt',
]);

export function isGastroTag(tag: string | null | undefined): boolean { return !!tag && GASTRO.has(tag); }
export function isEntryTag(tag: string | null | undefined): boolean { return !!tag && ENTRY.has(tag); }
export function hasHours(tags: (string | null | undefined)[]): boolean {
  return tags.some(t => isGastroTag(t) || isEntryTag(t));
}

/**
 * „Erlebnis-Orte" mit mehreren Sehenswürdigkeiten → dürfen Must-see-Highlights anlegen.
 * (Freizeitparks, Museen, Zoos, botanische Gärten, große Natur-/Historik-Areale …)
 * Bewusst NICHT: Gastro, Einzel-Attraktionen (Kino, Escape-Room), einzelne Landmarken/Punkt-Natur.
 */
const HIGHLIGHTABLE = new Set([
  // Museen & Wissen
  'kunstmuseum', 'galerie', 'technikmuseum', 'industriemuseum', 'naturkundemuseum', 'wissenschaftsmuseum',
  'geschichtsmuseum', 'anthropologisches-museum', 'freilichtmuseum', 'bergwerk', 'science-center', 'planetarium',
  'miniaturwelt', 'markenwelt', 'industriedenkmal-und-zeche',
  // Historische Anlagen (mehrere sehenswerte Punkte)
  'burg', 'schloss', 'palast', 'kloster', 'archaeologische-staette', 'historische-altstadt-viertel',
  // Natur-Gebiete (Naturparks, große Flächen mit Aussichten/Stationen)
  'wald', 'berg', 'schlucht', 'moor', 'heide', 'park', 'botanischer-garten',
  // Tier- & Erlebniswelten
  'zoo', 'tierpark', 'wildgehege', 'aquarium', 'freizeitpark', 'wasserpark',
]);
export function isHighlightableTag(tag: string | null | undefined): boolean { return !!tag && HIGHLIGHTABLE.has(tag); }
export function hasHighlights(tags: (string | null | undefined)[]): boolean { return tags.some(isHighlightableTag); }

/** Fragen für einen (oder mehrere) Typ-Tag(s). */
export function detailQuestions(tags: (string | null | undefined)[]): SubmitQuestion[] {
  const gastro = tags.some(isGastroTag);
  const entry  = tags.some(isEntryTag);
  const qs: SubmitQuestion[] = [
    { id: 'indoor_outdoor', label: 'Drinnen oder draußen?', type: 'select',
      options: ['Draußen (Outdoor)', 'Drinnen (Indoor)', 'Beides'] },
    { id: 'budget', label: 'Preisniveau', type: 'select',
      options: ['Kostenlos', '€ – günstig', '€€ – mittel', '€€€ – gehoben'] },
  ];
  if (gastro || entry) {
    qs.push({ id: 'opening_hours', label: 'Öffnungszeiten', type: 'weekhours',
      hint: 'Als Uhrzeit hinterlegt – so sehen andere, ob gerade geöffnet ist.' });
    qs.push({ id: 'phone',   label: 'Telefon (optional)', type: 'phone', placeholder: '30 12345678' });
    qs.push({ id: 'email',   label: 'E-Mail (optional)',  type: 'text', placeholder: 'kontakt@ort.de' });
    // Website NICHT hier — sie wird universal (für alle Orte) im „Allgemeines"-Block gefragt (keine Dublette).
  }
  if (gastro) {
    qs.push({ id: 'menu_url',        label: 'Link zur Speisekarte (optional)', type: 'text', placeholder: 'https://…' });
    qs.push({ id: 'reservation_url', label: 'Link zum Reservieren (optional)',  type: 'text', placeholder: 'https://…' });
  }
  if (entry) {
    qs.push({ id: 'ticket_prices', label: 'Ticketpreise (optional)', type: 'pricefields' });
    qs.push({ id: 'ticket_url',    label: 'Link zum Ticketkauf (optional)', type: 'text', placeholder: 'https://…' });
  }
  return qs;
}

// ─── Öffnungszeiten: strukturiert (Uhrzeit) + „gerade geöffnet?" ────────────────
export type DayHours = { open?: string; close?: string; closed?: boolean };
export type WeekHours = Record<string, DayHours>;
export const HOUR_DAYS: [string, string][] = [
  ['mo', 'Montag'], ['di', 'Dienstag'], ['mi', 'Mittwoch'], ['do', 'Donnerstag'],
  ['fr', 'Freitag'], ['sa', 'Samstag'], ['so', 'Sonntag'],
];

/** Ist der Ort laut Öffnungszeiten gerade geöffnet? null = keine Angabe. */
export function isOpenNow(hours: (WeekHours & { alwaysOpen?: boolean }) | null | undefined, now = new Date()): boolean | null {
  if (!hours || typeof hours !== 'object') return null;
  if (hours.alwaysOpen === true) return true;   // rund um die Uhr geöffnet
  const keys = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
  const day = hours[keys[now.getDay()]];
  if (!day) return null;
  if (day.closed) return false;
  if (!day.open || !day.close) return null;
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  const cur = now.getHours() * 60 + now.getMinutes();
  const o = toMin(day.open), c = toMin(day.close);
  return c > o ? cur >= o && cur < c : cur >= o || cur < c; // über Mitternacht
}
