// Fragen-Katalog + Config-Auflösung fürs Admin-Fragen-CMS.
// Die Fragen selbst bleiben im Code (UNIVERSAL_QUESTIONS + detailQuestions);
// die DB liefert nur Overrides { [tagSlug]: { [questionId]: enabled } }.
import type { SubmitQuestion } from './taxonomy.js';
import { UNIVERSAL_QUESTIONS } from './taxonomy.js';
import { detailQuestions } from './detailQuestions.js';

// In StepDetails ausgeblendete Universal-Fragen (woanders gefragt / durch berechenbare ersetzt).
// Einzige Quelle der Wahrheit — SubmitPage importiert diese Menge.
export const SUBMIT_HIDDEN = new Set<string>([
  'trivia_type', 'trivia_text', 'highlight',
  'entrance_fee', 'entrance_prices', 'entrance_fee_url',
  'has_opening_hours', 'opening_hours_week', 'opening_hours_url', 'opening_hours_text',
]);

// Universelle Detail-Fragen (für alle Orte), ohne die ausgeblendeten.
export const UNIVERSAL_DETAIL_QUESTIONS: SubmitQuestion[] =
  UNIVERSAL_QUESTIONS.filter(q => !SUBMIT_HIDDEN.has(q.id));

/** Alle Fragen, die für EINEN Typ-Tag standardmäßig gestellt werden
 *  (typ-spezifische zuerst, dann die universellen). */
export function catalogForTag(tag: string): SubmitQuestion[] {
  const seen = new Set<string>();
  const out: SubmitQuestion[] = [];
  for (const q of [...detailQuestions([tag]), ...UNIVERSAL_DETAIL_QUESTIONS]) {
    if (!seen.has(q.id)) { seen.add(q.id); out.push(q); }
  }
  return out;
}

/**
 * ALLE Fragen, die es ueberhaupt gibt — unabhaengig vom Typ. `detailQuestions` liefert je
 * nach Tag unterschiedliche Baende (Gastro bekommt Speisekarte, Eintritts-Orte Ticketpreise),
 * deshalb wird hier ueber je einen Vertreter jeder Sorte vereinigt.
 *
 * Gedacht fuers Admin-Board: dort soll je Tag die vollstaendige Liste stehen, mit Schaltern
 * nur dort an, wo die Frage standardmaessig gilt.
 */
export function allQuestions(): SubmitQuestion[] {
  const seen = new Set<string>();
  const out: SubmitQuestion[] = [];
  // 'restaurant' = Gastro, 'kunstmuseum' = Eintritt, '' = weder noch
  for (const q of [
    ...detailQuestions(['restaurant']),
    ...detailQuestions(['kunstmuseum']),
    ...detailQuestions(['']),
    ...UNIVERSAL_DETAIL_QUESTIONS,
  ]) {
    if (!seen.has(q.id)) { seen.add(q.id); out.push(q); }
  }
  return out;
}

export type QuestionConfig = Record<string, Record<string, boolean>>;

/** Gilt die Frage für DIESEN einen Tag? Override sticht, sonst Katalog-Zugehörigkeit. */
export function enabledForTag(tag: string, questionId: string, cfg: QuestionConfig | null): boolean {
  const override = cfg?.[tag]?.[questionId];
  if (override !== undefined) return override;
  return catalogForTag(tag).some(q => q.id === questionId);
}

/** Für einen Ort (bis zu 3 Tags): sichtbar, sobald für mindestens einen Tag aktiviert. */
export function enabledForPlace(tags: string[], questionId: string, cfg: QuestionConfig | null): boolean {
  if (!tags.length) return true;
  return tags.some(t => enabledForTag(t, questionId, cfg));
}
