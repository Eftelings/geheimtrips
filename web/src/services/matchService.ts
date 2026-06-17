import type { FunnelAnswers, Place } from '../types/index.js';

/** Score a place against funnel answers (0–100). */
export function scorePlace(place: Place, answers: FunnelAnswers): number {
  let score = 50; // base

  // Distance: distanceMin vs answers.distanceMin (±20 min tolerance)
  const diff = Math.abs(place.distanceMin - answers.distanceMin);
  if (diff <= 20)        score += 20;
  else if (diff <= 40)   score += 10;
  else if (diff > 80)    score -= 20;

  // Budget
  if (answers.budget === 'kostenlos' && place.cost === 1)     score += 15;
  else if (answers.budget === 'günstig'  && place.cost <= 2)  score += 10;
  else if (answers.budget === 'moderat'  && place.cost <= 3)  score += 8;
  else if (answers.budget === 'egal')                         score += 5;
  else if (answers.budget === 'kostenlos' && place.cost > 1)  score -= 10;

  // Vibe axes
  const [stadtNatur, adrenalinKultur, genussBewegung, bekanntGeheim] = answers.vibe;
  const vibeSet = new Set(place.vibe);

  if (stadtNatur > 60    && vibeSet.has('natur'))          score += 10;
  if (stadtNatur < 40    && vibeSet.has('urban'))          score += 10;
  if (adrenalinKultur > 60 && vibeSet.has('historisch'))   score += 10;
  if (adrenalinKultur < 40 && vibeSet.has('abenteuer'))    score += 10;
  if (adrenalinKultur > 60 && (vibeSet.has('kultur') || vibeSet.has('fotogen'))) score += 8;
  if (genussBewegung > 60  && vibeSet.has('wandern'))      score += 10;
  if (genussBewegung < 40  && vibeSet.has('genuss'))       score += 10;
  if (bekanntGeheim > 60   && vibeSet.has('geheimtipp'))   score += 12;
  if (bekanntGeheim > 60   && vibeSet.has('mystisch'))     score += 8;

  // Category affinity
  if (answers.budget === 'kostenlos' && place.category === 'wasser')  score += 5;
  if (adrenalinKultur > 60 && place.category === 'kultur')            score += 5;
  if (stadtNatur > 60 && place.category === 'natur')                  score += 5;
  if (adrenalinKultur < 40 && place.category === 'aktiv')             score += 5;

  // Rating bonus
  if (place.rating >= 4.7) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Filter places to those with >50% match, sorted desc by match. */
export function matchPlaces(places: Place[], answers: FunnelAnswers): Place[] {
  return places
    .map(p => ({ ...p, match: scorePlace(p, answers) }))
    .filter(p => p.match > 50)
    .sort((a, b) => b.match - a.match);
}
