import type { Place } from '../types/index.js';

// ─── Tag-Helfer ───────────────────────────────────────────────────────────────
export function getAttr(p: Place, key: string): string | null {
  const attrs = p.attributes as Record<string, unknown> | null | undefined;
  return (attrs?.[key] as string | null | undefined) ?? null;
}

export function kwMatch(p: Place, words: string[]): boolean {
  const hay = `${p.name} ${p.region} ${(p as unknown as Record<string, string>).short ?? ''} ${p.vibe.join(' ')}`.toLowerCase();
  return words.some(w => hay.includes(w));
}

// ─── Suchbegriffe (geteilt von Startseite & Sammlung) ─────────────────────────
export const SEARCH_TAGS: { label: string; icon: string; match: (p: Place) => boolean }[] = [
  { label: 'Museen & Ausstellungen',  icon: 'fa-building-columns',
    match: p => getAttr(p,'l2Slug') === 'museen-ausstellungen' || kwMatch(p, ['museum','ausstellung','galerie']) },
  { label: 'Historische Bauwerke',    icon: 'fa-chess-rook',
    match: p => getAttr(p,'l2Slug') === 'historische-bauwerke' || kwMatch(p, ['burg','schloss','kirche','kloster','ruine','denkmal','festung']) },
  { label: 'Freizeitparks',           icon: 'fa-ferris-wheel',
    match: p => getAttr(p,'l2Slug') === 'themenparks' || kwMatch(p, ['freizeitpark','erlebnispark','wasserpark','funpark','vergnügungs']) },
  { label: 'Tierwelten',              icon: 'fa-paw',
    match: p => getAttr(p,'l2Slug') === 'tierwelten' || kwMatch(p, ['zoo','aquarium','tierpark','wildgehege','safari','vogelpark']) },
  { label: 'Indoor-Action',           icon: 'fa-gamepad',
    match: p => getAttr(p,'l2Slug') === 'indoor-action' || kwMatch(p, ['escape','trampolin','bowling','lasertag','kart','minigolf']) },
  { label: 'Outdoor-Action',          icon: 'fa-person-hiking',
    match: p => getAttr(p,'l2Slug') === 'outdoor-action' || p.category === 'aktiv' || kwMatch(p, ['klettersteig','zipline','rafting','sommerrodelbahn','hochseilgarten']) },
  { label: 'Wälder & Naturparks',     icon: 'fa-tree',
    match: p => getAttr(p,'l2Slug') === 'waelder-naturparks' || p.category === 'natur' || kwMatch(p, ['wald','nationalpark','naturpark','baumwipfelpfad']) },
  { label: 'Gewässer & Küsten',       icon: 'fa-water',
    match: p => getAttr(p,'l2Slug') === 'gewaesser-kuesten' || p.category === 'wasser' || kwMatch(p, ['see','strand','küste','fluss','bach','wasserfall','meer','stausee']) },
  { label: 'Altstädte',               icon: 'fa-city',
    match: p => getAttr(p,'l3Slug') === 'historische-viertel' || kwMatch(p, ['altstadt','marktplatz','altmarkt','gasse','fachwerk','stadtmauer']) },
  { label: 'Restaurants',             icon: 'fa-utensils',
    match: p => getAttr(p,'l3Slug') === 'restaurants-speiselokale' || (p.category === 'genuss' && kwMatch(p, ['restaurant','gaststätte','gasthof','speiselokal'])) },
  { label: 'Cafés',                   icon: 'fa-mug-hot',
    match: p => getAttr(p,'l3Slug') === 'cafes-snacks' || kwMatch(p, ['café','cafe','kaffee','konditorei']) },
];
