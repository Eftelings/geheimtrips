/**
 * Migration alt → neu: leitet für bestehende Orte einen Typ-Tag (neues Modell) ab.
 * Priorität: altes L3-Blatt  →  bekannter Ortsname  →  alte Kategorie (Fallback).
 * Slugs sind die tatsächlich geseedeten Tag-Slugs (siehe taxonomy2.ts / taxSlug()).
 */

// Altes Taxonomie-Blatt (l3Slug) → neuer Tag-Slug
export const L3_TO_TAG: Record<string, string> = {
  // Kultur, Geschichte & Wissen
  'technik-industriemuseum': 'technikmuseum',
  'kunstmuseum-galerie': 'kunstmuseum',
  'naturkunde-wissenschaftsmuseum': 'naturkundemuseum',
  'kultur-geschichtsmuseum': 'geschichtsmuseum',
  'freilichtmuseum': 'freilichtmuseum',
  'kuriositaeten-spezialmuseum': 'geschichtsmuseum',
  'burgen-schloesser-palaeste': 'schloss',
  'gedenkstaetten-mahnmale': 'mahnmal',
  'sakralbauten': 'sakralbau',
  'archaeologische-staetten': 'archaeologische-staette',
  'ruinen': 'ruine',
  'planetarium-sternwarte': 'planetarium',
  'science-center': 'science-center',
  // Freizeit, Action & Entertainment
  'grosse-freizeitparks': 'freizeitpark',
  'miniatur-modellwelten': 'miniaturwelt',
  'filmparks-studio-touren': 'freizeitpark',
  'wellness-spa': 'therme',
  'erlebnisbaeder-wasserparks': 'wasserpark',
  'klassische-schwimmbaeder': 'schwimmbad',
  'zoologische-gaerten': 'zoo',
  'aquarien-meereszentren': 'aquarium',
  'safariparks-wildgehege': 'wildgehege',
  'raetsel-geschicklichkeit': 'escape-room',
  'sportliche-indoor-action': 'trampolinhalle',
  'klettern-fliegen': 'hochseilgarten',
  'fahren-rutschen': 'sommerrodelbahn',
  // Natur, Landschaft & Outdoor
  'schutzgebiete': 'wald',
  'naturerlebnispfade': 'wald',
  'stehende-gewaesser': 'see',
  'fliessgewaesser': 'fluss',
  'meer-kueste': 'strand',
  'felsformationen-taeler': 'felsformation',
  'hoehlen': 'hoehle',
  'gebirge': 'berg',
  // Urbanes, Architektur & Lifestyle
  'historische-viertel': 'historische-altstadt-viertel',
  'moderne-urbane-viertel': 'besondere-architektur',
  'parkanlagen-gaerten': 'park',
  'tueme-aussichtspunkte': 'turm',
  'industriekultur': 'industriedenkmal-und-zeche',
  'buehnen-theater': 'theater',
  // Kulinarik & Gastronomie
  'restaurants-speiselokale': 'restaurant',
  'cafes-snacks': 'caf',
  'bars-nightlife': 'bar-und-pub',
  'maerkte-food-halls': 'markt-und-markthalle',
  'produktionsstaetten': 'markenwelt',
};

// Bekannte Bestands-/Demo-Orte, deren Kategorie-Fallback danebenläge
export const NAME_TO_TAG: Record<string, string> = {
  'Burg Eltz': 'burg',
  'Basteibrücke': 'bruecke',
  'Oybin Tafelberg': 'berg',
  'Externsteine': 'felsformation',
  'Monbijoupark bei Nacht': 'park',
  'Baumkronenpfad Beelitz-Heilstätten': 'wald',
};

// Letzter Fallback: alte Kategorie → repräsentativer Tag
export const CAT_TO_TAG: Record<string, string> = {
  natur: 'wald',
  wasser: 'see',
  genuss: 'restaurant',
  kultur: 'historische-altstadt-viertel',
  mystisch: 'ruine',
  aktiv: 'freizeitpark',
};

export function deriveTag(l3Slug: string | undefined, name: string, category: string): string {
  return L3_TO_TAG[l3Slug ?? ''] ?? NAME_TO_TAG[name] ?? CAT_TO_TAG[category] ?? 'historische-altstadt-viertel';
}
