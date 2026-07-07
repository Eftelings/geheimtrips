import { useEffect, useState } from 'react';
import { taxonomyApi, type TaxVocab } from '../services/api.js';

/**
 * Prozessweiter Cache fürs Taxonomie-Vokabular (Tags/Gruppen/Merkmale/Vibes).
 * Wird einmal geladen und von allen Komponenten geteilt (z.B. Ortskacheln,
 * die aus tagSlug Label + Gruppenfarbe ableiten).
 */
let cache: TaxVocab | null = null;
let inflight: Promise<TaxVocab> | null = null;

export function loadTaxVocab(): Promise<TaxVocab> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) inflight = taxonomyApi.vocab().then(v => { cache = v; return v; }).catch(err => { inflight = null; throw err; });
  return inflight;
}

export interface TagInfo { slug: string; label: string; color: string; icon: string; groupSlug: string; groupLabel: string }

export function tagInfoFrom(vocab: TaxVocab | null, slug?: string | null): TagInfo | null {
  if (!vocab || !slug) return null;
  const tag = vocab.tags.find(t => t.slug === slug);
  if (!tag) return null;
  const group = vocab.groups.find(g => g.slug === tag.groups[0]);
  return { slug: tag.slug, label: tag.label, color: group?.color ?? '#8A6FB3', icon: group?.icon ?? 'fa-tag', groupSlug: tag.groups[0] ?? '', groupLabel: group?.label ?? '' };
}

// Umlaute/Akzente vereinheitlichen (café → cafe, Gaststätte → gaststaette)
function norm(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
}

// Stichwörter je Tag-Slug (zusätzlich zum Label) — für Vorschläge aus dem Beschreibungstext
const TAG_KEYWORDS: Record<string, string[]> = {
  restaurant: ['restaurant', 'gaststaette', 'gasthof', 'gasthaus', 'wirtshaus', 'speiselokal', 'kueche', 'brunch', 'dinner'],
  caf: ['cafe', 'kaffee', 'kaffeehaus', 'coffee', 'kuchen', 'fruehstueck', 'roesterei'],
  'bar-und-pub': ['kneipe', 'cocktail', 'brauerei', 'biergarten', 'nightlife'],
  eisdiele: ['eisdiele', 'gelato', 'eiscafe'],
  'markt-und-markthalle': ['markt', 'markthalle', 'wochenmarkt', 'foodcourt'],
  see: ['badesee', 'stausee', 'weiher', 'baggersee'],
  fluss: ['fluss', 'bach', 'ufer'],
  wasserfall: ['wasserfall', 'kaskade'],
  strand: ['strand', 'kueste', 'ostsee', 'nordsee', 'meer'],
  berg: ['berg', 'gipfel', 'gebirge', 'aussichtsberg'],
  hoehle: ['hoehle', 'tropfstein', 'grotte'],
  wald: ['wald', 'forst', 'naturpark'],
  park: ['park', 'garten', 'gruenanlage', 'schlosspark'],
  'botanischer-garten': ['botanischer', 'gewaechshaus', 'palmenhaus'],
  schlucht: ['schlucht', 'klamm', 'tal'],
  felsformation: ['felsen', 'felsformation', 'felsformationen'],
  burg: ['burg', 'festung'],
  schloss: ['schloss', 'schloesser', 'residenz'],
  palast: ['palast', 'palais'],
  ruine: ['ruine', 'gemaeuer'],
  kirche: ['kirche', 'kapelle', 'dom', 'muenster', 'basilika'],
  kloster: ['kloster', 'abtei', 'stift'],
  turm: ['turm', 'aussichtsturm', 'aussichtsplattform', 'fernsehturm'],
  bruecke: ['bruecke', 'viadukt'],
  leuchtturm: ['leuchtturm'],
  kunstmuseum: ['kunstmuseum', 'kunsthalle', 'gemaelde', 'moderne kunst'],
  galerie: ['galerie'],
  technikmuseum: ['technikmuseum', 'technik'],
  naturkundemuseum: ['naturkunde', 'dinosaurier', 'fossil'],
  geschichtsmuseum: ['geschichtsmuseum', 'stadtmuseum', 'heimatmuseum'],
  freilichtmuseum: ['freilichtmuseum'],
  'industriedenkmal-und-zeche': ['zeche', 'industriekultur', 'bergwerk', 'hochofen'],
  'historische-altstadt-viertel': ['altstadt', 'viertel', 'gasse'],
  bahnhof: ['bahnhof'],
  bibliothek: ['bibliothek', 'buecherei'],
  zoo: ['zoo', 'tiergarten'],
  tierpark: ['tierpark', 'wildpark'],
  wildgehege: ['wildgehege', 'gehege'],
  aquarium: ['aquarium', 'meereswelt'],
  freizeitpark: ['freizeitpark', 'achterbahn', 'themenpark', 'vergnuegungspark'],
  therme: ['therme', 'thermalbad', 'wellness', 'sauna'],
  schwimmbad: ['schwimmbad', 'freibad', 'hallenbad'],
  wasserpark: ['wasserpark', 'erlebnisbad', 'rutschen'],
  seilbahn: ['seilbahn', 'gondel', 'bergbahn'],
  kino: ['kino', 'lichtspielhaus'],
  theater: ['theater', 'buehne', 'oper'],
  'markenwelt': ['markenwelt', 'schauwerk', 'manufaktur', 'fabrikverkauf'],
  uebernachtung: ['hotel', 'pension', 'uebernachtung', 'baumhaus'],
  campingplatz: ['campingplatz', 'camping', 'stellplatz'],
};

/** Schlägt aus einem Freitext (Name + Beschreibung) passende Typ-Tags vor. */
export function suggestTagsFromText(text: string, vocab: TaxVocab | null): TagInfo[] {
  if (!vocab || !text.trim()) return [];
  const hay = ' ' + norm(text) + ' ';
  const hits: string[] = [];
  for (const tag of vocab.tags) {
    const kws = [norm(tag.label), ...(TAG_KEYWORDS[tag.slug] ?? [])];
    if (kws.some(k => k.length >= 4 && hay.includes(k))) hits.push(tag.slug);
  }
  return hits.slice(0, 6).map(s => tagInfoFrom(vocab, s)).filter((t): t is TagInfo => !!t);
}

/** Lädt (gecacht) das Vokabular und gibt es reaktiv zurück. */
export function useTaxVocab(): TaxVocab | null {
  const [vocab, setVocab] = useState<TaxVocab | null>(cache);
  useEffect(() => { if (!cache) loadTaxVocab().then(setVocab).catch(() => {}); }, []);
  return vocab;
}
