/**
 * Neues Taxonomie-Vokabular (Konzept „Tags · Merkmale · Vibes").
 * Quelle: Taxonomie-Konzept-Dokument (Teil 1–4) + Anpassungen:
 *  - Bahnhof → Gruppe Kultur/Architektur
 *  - 4. Gruppe heißt „Kulinarik & Übernachten"
 *  - Markenwelt in Kulinarik UND Freizeit
 *
 * Labels sind die Quelle der Wahrheit; slugs werden beim Seed daraus abgeleitet.
 */

export interface T2Group { slug: string; label: string; icon: string; color: string; }
export interface T2Tag { label: string; groups: string[]; }

export const T2_GROUPS: T2Group[] = [
  { slug: 'kultur',    label: 'Kultur, Geschichte & Architektur', icon: 'fa-landmark',        color: '#8A6FB3' },
  { slug: 'natur',     label: 'Natur, Outdoor & Landschaft',      icon: 'fa-leaf',            color: '#5B8F6E' },
  { slug: 'freizeit',  label: 'Freizeit, Action & Entertainment', icon: 'fa-ticket',          color: '#F99039' },
  { slug: 'kulinarik', label: 'Kulinarik & Übernachten',          icon: 'fa-mug-hot',         color: '#D97757' },
];

export const T2_TAGS: T2Tag[] = [
  // ── Kultur, Geschichte & Architektur ──
  { label: 'Kunstmuseum', groups: ['kultur'] },
  { label: 'Galerie', groups: ['kultur'] },
  { label: 'Technikmuseum', groups: ['kultur'] },
  { label: 'Industriemuseum', groups: ['kultur'] },
  { label: 'Naturkundemuseum', groups: ['kultur'] },
  { label: 'Wissenschaftsmuseum', groups: ['kultur'] },
  { label: 'Geschichtsmuseum', groups: ['kultur'] },
  { label: 'Anthropologisches Museum', groups: ['kultur'] },
  { label: 'Freilichtmuseum', groups: ['kultur'] },
  { label: 'Burg', groups: ['kultur'] },
  { label: 'Schloss', groups: ['kultur'] },
  { label: 'Villa', groups: ['kultur'] },
  { label: 'Palast', groups: ['kultur'] },
  { label: 'Ruine', groups: ['kultur'] },
  { label: 'Sakralbau', groups: ['kultur'] },
  { label: 'Kirche', groups: ['kultur'] },
  { label: 'Kloster', groups: ['kultur'] },
  { label: 'Tempel', groups: ['kultur'] },
  { label: 'Synagoge', groups: ['kultur'] },
  { label: 'Moschee', groups: ['kultur'] },
  { label: 'Denkmal', groups: ['kultur'] },
  { label: 'Mahnmal', groups: ['kultur'] },
  { label: 'Archäologische Stätte', groups: ['kultur'] },
  { label: 'Historische Altstadt / Viertel', groups: ['kultur'] },
  { label: 'Industriedenkmal & Zeche', groups: ['kultur'] },
  { label: 'Bergwerk', groups: ['kultur'] },
  { label: 'Turm', groups: ['kultur'] },
  { label: 'Brücke', groups: ['kultur'] },
  { label: 'Leuchtturm', groups: ['kultur'] },
  { label: 'Besondere Architektur', groups: ['kultur'] },
  { label: 'Planetarium', groups: ['kultur'] },
  { label: 'Science Center', groups: ['kultur'] },
  { label: 'Bibliothek', groups: ['kultur'] },
  { label: 'Bahnhof', groups: ['kultur'] },              // Anpassung: aus Infrastruktur hierher

  // ── Natur, Outdoor & Landschaft ──
  { label: 'See', groups: ['natur'] },
  { label: 'Fluss', groups: ['natur'] },
  { label: 'Wasserfall', groups: ['natur'] },
  { label: 'Strand', groups: ['natur'] },
  { label: 'Berg', groups: ['natur'] },
  { label: 'Höhle', groups: ['natur'] },
  { label: 'Wald', groups: ['natur'] },
  { label: 'Felsformation', groups: ['natur'] },
  { label: 'Schlucht', groups: ['natur'] },
  { label: 'Botanischer Garten', groups: ['natur'] },
  { label: 'Park', groups: ['natur'] },
  { label: 'Moor', groups: ['natur'] },
  { label: 'Heide', groups: ['natur'] },

  // ── Freizeit, Action & Entertainment ──
  { label: 'Freizeitpark', groups: ['freizeit'] },
  { label: 'Miniaturwelt', groups: ['freizeit'] },
  { label: 'Zoo', groups: ['freizeit'] },
  { label: 'Tierpark', groups: ['freizeit'] },
  { label: 'Wildgehege', groups: ['freizeit'] },
  { label: 'Aquarium', groups: ['freizeit'] },
  { label: 'Schwimmbad', groups: ['freizeit'] },
  { label: 'Wasserpark', groups: ['freizeit'] },
  { label: 'Therme', groups: ['freizeit'] },
  { label: 'Hochseilgarten', groups: ['freizeit'] },
  { label: 'Sommerrodelbahn', groups: ['freizeit'] },
  { label: 'Minigolf', groups: ['freizeit'] },
  { label: 'Seilbahn', groups: ['freizeit'] },
  { label: 'Trampolinhalle', groups: ['freizeit'] },
  { label: 'Paintball', groups: ['freizeit'] },
  { label: 'Lasertag', groups: ['freizeit'] },
  { label: 'Escape Room', groups: ['freizeit'] },
  { label: 'VR- & Gaming-Lounge', groups: ['freizeit'] },
  { label: 'Kino', groups: ['freizeit'] },
  { label: 'Theater', groups: ['freizeit'] },

  // ── Kulinarik & Übernachten ──
  { label: 'Restaurant', groups: ['kulinarik'] },
  { label: 'Café', groups: ['kulinarik'] },
  { label: 'Eisdiele', groups: ['kulinarik'] },
  { label: 'Bar & Pub', groups: ['kulinarik'] },
  { label: 'Markt & Markthalle', groups: ['kulinarik'] },
  { label: 'Markenwelt', groups: ['kulinarik', 'freizeit'] },   // Anpassung: in beiden Gruppen
  { label: 'Übernachtung', groups: ['kulinarik'] },
  { label: 'Campingplatz', groups: ['kulinarik'] },
];

// Teil 2 — kanonische Merkmale (weitere entstehen automatisch aus dem Mapping unten)
export const T2_MERKMALE: string[] = [
  // Technik & Industrie
  'Automobil', 'Motorrad', 'Luftfahrt', 'Raumfahrt', 'Schifffahrt', 'Eisenbahn', 'Straßenbahn', 'Bergbau',
  'Textilindustrie', 'Stahl & Eisen', 'Energie & Strom', 'Telekommunikation', 'Handwerk', 'Landwirtschaftstechnik',
  // Kunst & Kultur
  'Gemälde', 'Skulpturen', 'Moderne Kunst', 'Zeitgenössische Kunst', 'Antike', 'Fotografie', 'Street Art', 'Design',
  'Architektur', 'Regionalgeschichte', 'Zweiter Weltkrieg', 'Kalter Krieg', 'Mittelalter', 'Römer', 'Kelten', 'Ägypten',
  // Biologisch & Geologisch
  'Einheimische Tiere', 'Exotische Tiere', 'Streichelzoo', 'Vögel', 'Reptilien & Amphibien', 'Fische', 'Insekten',
  'Dinosaurier/Fossilien', 'Tropfstein', 'Vulkanismus', 'Gletscher', 'Sandstrand', 'Kiesstrand', 'Steilküste',
  // Ausstattung & Action
  'Wechselausstellung', 'Dauerausstellung', 'Interaktive Exponate', 'Vorführungen', 'Kostümierte Führungen', 'Audioguide',
  'Aussichtsplattform', 'Ruinen-Romantik', 'Prunkräume', 'Gartenanlage', 'Wellness-Bereich', 'Thermalwasser',
  'Rutschen-Paradies', 'Saunalandschaft', 'Achterbahnen', 'Wasserfahrgeschäfte', 'Hindernis-Parcours',
  'Bällebad/Schaumstoffgrube', 'Terrasse', 'Vegane Optionen', 'Hauseigene Röstung',
];

// Teil 3 — Vibes (kategorieübergreifend)
export const T2_VIBES: string[] = [
  // Gemütlich & Ruhig
  'Hygge', 'Romantisch', 'Entschleunigung / Zen', 'Rustikal', 'Versteckt / Geheimtipp',
  // Spannend & Historisch
  'Zeitreise', 'Mystisch / Geheimnisvoll', 'Düster / Lost Place', 'Prunkvoll / Majestätisch',
  // Action & Energie
  'Adrenalin-Kick', 'Fantasiewelten', 'Lebhaft / Trubelig', 'Hip & Urban', 'Team-Geist',
  // Klassisch & Anspruchsvoll
  'Klassisches Kaffeehaus', 'Chic & Elegant', 'Puristisch / Modern',
];

/**
 * Teil 4 — Mapping Tag → { Merkmale, Vibes }.
 * Merkmale, die nicht in T2_MERKMALE stehen, werden beim Seed automatisch angelegt
 * (Kandidaten fürs spätere Alias-Merging). Leere Vibe-Listen = „offen für UGC".
 */
export const T2_MAP: Record<string, { m: string[]; v: string[] }> = {
  'Kunstmuseum': { m: ['Gemälde', 'Skulpturen', 'Moderne Kunst', 'Zeitgenössische Kunst', 'Antike', 'Fotografie', 'Design', 'Wechselausstellung', 'Architektur'], v: [] },
  'Galerie': { m: ['Gemälde', 'Skulpturen', 'Moderne Kunst', 'Zeitgenössische Kunst', 'Antike', 'Fotografie', 'Design'], v: [] },
  'Technikmuseum': { m: ['Automobil', 'Motorrad', 'Luftfahrt', 'Schifffahrt', 'Eisenbahn', 'Bergbau', 'Textilindustrie', 'Energie & Strom', 'Interaktive Exponate', 'Maschinen'], v: [] },
  'Industriemuseum': { m: ['Automobil', 'Motorrad', 'Luftfahrt', 'Schifffahrt', 'Eisenbahn', 'Bergbau', 'Textilindustrie', 'Energie & Strom', 'Interaktive Exponate', 'Maschinen', 'Stahlproduktion'], v: [] },
  'Naturkundemuseum': { m: ['Dinosaurier/Fossilien', 'Einheimische Tiere', 'Exotische Tiere', 'Interaktive Exponate', 'Wechselausstellung'], v: [] },
  'Wissenschaftsmuseum': { m: ['Physik', 'Raumfahrt', 'Tiere', 'Interaktive Exponate', 'Wechselausstellung'], v: [] },
  'Geschichtsmuseum': { m: ['Regionalgeschichte', 'Zweiter Weltkrieg', 'Kalter Krieg', 'Mittelalter', 'Römer', 'Kelten', 'Ägypten'], v: [] },
  'Anthropologisches Museum': { m: ['Regionalgeschichte', 'Zweiter Weltkrieg', 'Kalter Krieg', 'Mittelalter', 'Römer', 'Kelten', 'Ägypten', 'Persien', 'China', 'Polynesien'], v: [] },
  'Freilichtmuseum': { m: ['Regionalgeschichte', 'Handwerk', 'Landwirtschaftstechnik', 'Vorführungen', 'Einheimische Tiere', 'Maschinen', 'Landwirtschaft', '60er', 'Mittelalter', 'Kolonialzeit'], v: [] },
  'Burg': { m: ['Mittelalter', 'Prunkräume', 'Aussicht', 'Gartenanlage', 'Führungen'], v: [] },
  'Schloss': { m: ['Barock', 'Mittelalter', 'Renaissance', 'Rokoko', 'Jugendstil', 'Bauhaus', 'Gotik', 'Klassizismus', 'Garten', 'Park'], v: [] },
  'Villa': { m: ['Barock', 'Renaissance', 'Rokoko', 'Jugendstil', 'Bauhaus', 'Gotik', 'Klassizismus', 'Gründerzeit', 'Garten', 'Park'], v: [] },
  'Palast': { m: ['Barock', 'Renaissance', 'Rokoko', 'Jugendstil', 'Bauhaus', 'Gotik', 'Klassizismus', 'Gründerzeit', 'Garten', 'Park'], v: [] },
  'Ruine': { m: ['Mittelalter', 'Römer', 'Kelten', 'Perser', 'Ägypter', 'Aussichtsplattform', 'Romantik'], v: ['Romantisch', 'Düster / Lost Place', 'Mystisch / Geheimnisvoll'] },
  'Sakralbau': { m: ['Architektur', 'Mittelalter', 'Prunkräume', 'Gotik', 'Romanisch', 'Klassizistisch', 'Geschichte', 'Aussicht'], v: [] },
  'Kirche': { m: ['Architektur', 'Mittelalter', 'Prunkräume', 'Gotik', 'Romanisch', 'Klassizistisch', 'Geschichte', 'Aussicht'], v: [] },
  'Kloster': { m: ['Architektur', 'Mittelalter', 'Prunkräume', 'Gotik', 'Romanisch', 'Klassizistisch', 'Geschichte', 'Aussicht'], v: [] },
  'Tempel': { m: ['Architektur', 'Mittelalter', 'Prunkräume', 'Gotik', 'Romanisch', 'Klassizistisch', 'Geschichte', 'Aussicht'], v: [] },
  'Synagoge': { m: ['Architektur', 'Mittelalter', 'Prunkräume', 'Gotik', 'Romanisch', 'Klassizistisch', 'Geschichte', 'Aussicht'], v: [] },
  'Moschee': { m: ['Architektur', 'Mittelalter', 'Prunkräume', 'Gotik', 'Romanisch', 'Klassizistisch', 'Geschichte', 'Aussicht'], v: [] },
  'Denkmal': { m: ['Architektur', 'Zweiter Weltkrieg', 'Kalter Krieg', 'Erster Weltkrieg', 'Völkermord', 'Freiheit', 'Herrscher', 'Regionalgeschichte', 'Schlacht'], v: [] },
  'Mahnmal': { m: ['Architektur', 'Zweiter Weltkrieg', 'Kalter Krieg', 'Erster Weltkrieg', 'Völkermord', 'Freiheit', 'Herrscher', 'Regionalgeschichte', 'Schlacht'], v: [] },
  'Archäologische Stätte': { m: ['Mittelalter', 'Römer', 'Kelten', 'Perser', 'Ägypter', 'Aussichtsplattform', 'Romantik', 'Ausgrabung', 'Menschheitsgeschichte', 'Dinosaurier'], v: [] },
  'Historische Altstadt / Viertel': { m: ['Mittelalter', 'Regionalgeschichte', 'Architektur', 'Outdoor'], v: [] },
  'Industriedenkmal & Zeche': { m: ['Bergbau', 'Stahl & Eisen', 'Energie & Strom', 'Architektur', 'Aussichtsplattform'], v: [] },
  'Turm': { m: ['Aussichtsplattform', 'Architektur', 'Sehenswürdigkeit', 'Wolkenkratzer', 'Mittelalter'], v: [] },
  'Brücke': { m: ['Architektur', 'Aussichtsplattform', 'Eisenbahn', 'Straßenbahn', 'Mittelalter', 'Moderne', 'Sehenswürdigkeit'], v: [] },
  'Leuchtturm': { m: ['Schifffahrt', 'Aussichtsplattform', 'Steilküste', 'Sehenswürdigkeit'], v: [] },
  'Planetarium': { m: ['Interaktive Exponate', 'Raumfahrt', 'Vorführungen', 'Kino', 'Lasershow'], v: [] },
  'Science Center': { m: ['Interaktive Exponate', 'Astronomie', 'Biologie'], v: [] },
  'Bibliothek': { m: ['Architektur', 'Prunkräume', 'Regionalgeschichte', 'Indoor', 'Barock', 'Fantasie', 'Rokoko', 'Klassizismus', 'Gotik', 'Romanisch'], v: [] },
  'Bergwerk': { m: ['Salz', 'Kohle', 'Führung', 'Eisenerz', 'Mittelalter'], v: [] },
  'Bahnhof': { m: ['Architektur', 'Eisenbahn', 'Historisch'], v: [] },

  'See': { m: ['Sandstrand', 'Kiesstrand', 'Tiere', 'Schwimmen', 'Wandern', 'Naturschutzgebiet'], v: [] },
  'Fluss': { m: ['Einheimische Tiere', 'Outdoor', 'Kiesstrand', 'Naturschutzgebiet', 'Kanu', 'Kajak'], v: [] },
  'Wasserfall': { m: ['Einheimische Tiere', 'Schwimmen'], v: ['Prunkvoll / Majestätisch'] },
  'Strand': { m: ['Sandstrand', 'Kiesstrand', 'Steilküste', 'Wrack', 'Aussicht', 'Naturschutzgebiet'], v: [] },
  'Berg': { m: ['Aussicht', 'Gletscher', 'Wandern', 'Naturschutzgebiet', 'Tiere'], v: [] },
  'Höhle': { m: ['Tropfstein', 'Vulkanismus', 'Fossilien', 'Grotte', 'Steinbruch', 'Führung', 'Eis', 'Wasserfall', 'See', 'Salz'], v: [] },
  'Wald': { m: ['Tiere', 'Outdoor', 'Vegetation', 'Bäume', 'Ruhe'], v: [] },
  'Felsformation': { m: ['Aussicht', 'Wandern', 'Wegenetz', 'Brücken', 'Wasserfall', 'Vegetation'], v: [] },
  'Schlucht': { m: ['Aussicht', 'Wandern', 'Wegenetz', 'Brücken', 'Wasserfall', 'Vegetation'], v: [] },
  'Botanischer Garten': { m: ['Gartenanlage', 'Exotische Tiere', 'Gewächshaus', 'Einheimische Tiere', 'Dschungel', 'Barocker Garten'], v: [] },
  'Park': { m: ['Gartenanlage', 'Exotische Tiere', 'Gewächshaus', 'Einheimische Tiere', 'Barocker Garten', 'Tempel', 'Wandern', 'Orangerie', 'Schloss', 'Landesgartenschau', 'Modern', 'Bootfahren', 'Schwimmen', 'Picknick'], v: [] },
  'Moor': { m: ['Einheimische Tiere', 'Blüten', 'Wandern'], v: [] },
  'Heide': { m: ['Einheimische Tiere', 'Blüten', 'Wandern'], v: [] },

  'Freizeitpark': { m: ['Achterbahnen', 'Wasserfahrgeschäfte', 'Shows', 'Kulinarik', 'Themenfahrten', 'Themenwelten', 'China', 'Mystery', 'Filmpark', 'Flatrides', 'Afrika', 'Europa', 'Hanse', 'Kirmes', 'Western'], v: [] },
  'Miniaturwelt': { m: ['Eisenbahn', 'Schifffahrt', 'Automobil', 'Architektur', 'Modelle', 'Sehenswürdigkeiten'], v: [] },
  'Zoo': { m: ['Exotische Tiere', 'Einheimische Tiere', 'Streichelzoo', 'Reptilien & Amphibien'], v: [] },
  'Tierpark': { m: ['Einheimische Tiere', 'Streichelzoo', 'Wald', 'Wandern'], v: [] },
  'Wildgehege': { m: ['Einheimische Tiere', 'Streichelzoo', 'Wald', 'Wandern', 'Exotische Tiere'], v: [] },
  'Aquarium': { m: ['Fische', 'Reptilien & Amphibien'], v: [] },
  'Schwimmbad': { m: ['Rutschen', 'Wellness-Bereich', 'Saunalandschaft', 'Wellenbad', 'Tropisch'], v: [] },
  'Wasserpark': { m: ['Rutschen', 'Wellness-Bereich', 'Saunalandschaft', 'Wellenbad', 'Tropisch'], v: [] },
  'Therme': { m: ['Rutschen', 'Thermalwasser', 'Wellness-Bereich', 'Saunalandschaft', 'Wellenbad', 'Tropisch'], v: [] },
  'Hochseilgarten': { m: ['Hindernis-Parcours', 'Wald', 'Team-Building'], v: ['Adrenalin-Kick', 'Team-Geist'] },
  'Sommerrodelbahn': { m: ['Achterbahnen', 'Outdoor', 'Hindernis-Parcours', 'Wandern', 'Seilbahn'], v: [] },
  'Minigolf': { m: ['Hindernis-Parcours', 'Erlebnisminigolf'], v: [] },
  'Kino': { m: ['Vorführungen', 'Architektur', 'Gründerzeit', 'Saal', 'Prunkvoll', 'Ungewöhnlich'], v: [] },
  'Theater': { m: ['Vorführungen', 'Führungen', 'Architektur', 'Gründerzeit', 'Saal', 'Prunkvoll', 'Ungewöhnlich'], v: [] },
  'Seilbahn': { m: ['Aussicht', 'Technik', 'Standseilbahn', 'Historisch'], v: [] },
  'Trampolinhalle': { m: ['Hindernis-Parcours', 'Bällebad'], v: [] },
  'Paintball': { m: ['Hindernis-Parcours', 'Team-Building'], v: ['Team-Geist', 'Adrenalin-Kick'] },
  'Lasertag': { m: ['Hindernis-Parcours', 'Team-Building'], v: ['Team-Geist', 'Adrenalin-Kick'] },
  'Escape Room': { m: ['Interaktive Exponate', 'Team-Building', 'Film'], v: ['Team-Geist'] },
  'VR- & Gaming-Lounge': { m: ['Interaktive Exponate', 'Indoor', 'E-Sports'], v: [] },

  'Restaurant': { m: ['Vegan', 'Vegetarisch', 'Terrasse', 'Regionalgeschichte', 'Aussicht', 'Außergewöhnlich', 'Mittelalter', 'Erlebnisgastronomie'], v: [] },
  'Café': { m: ['Hauseigene Röstung', 'Vegan', 'Vegetarisch', 'Terrasse', 'Aussicht', 'Erlebnisgastronomie', 'Teehaus', 'Kuchen', 'Torten', 'Tiere'], v: ['Hygge', 'Klassisches Kaffeehaus'] },
  'Eisdiele': { m: ['Vegan', 'Terrasse', 'Aussicht'], v: [] },
  'Bar & Pub': { m: ['Terrasse', 'Indoor', 'Live-Musik', 'Erlebnisgastronomie'], v: [] },
  'Markt & Markthalle': { m: ['Regionalgeschichte', 'Architektur', 'Lebensmittel', 'Foodcourt', 'Gründerzeit', 'Viktorianisch'], v: [] },
  'Markenwelt': { m: ['Handwerk', 'Landwirtschaftstechnik', 'Vorführungen', 'Verkostung', 'Schokolade', 'Marke', 'Fabrik', 'Käse', 'Weingut', 'Bier', 'Süßigkeit', 'Automobil', 'Maschinen', 'Führung', 'Kreuzfahrtschiffe', 'Flugzeuge'], v: [] },
  'Übernachtung': { m: ['Wellness-Bereich', 'Saunalandschaft', 'Prunkräume', 'Baumhaus', 'Bungalow', 'Aussicht', 'Außergewöhnlich'], v: [] },
};
