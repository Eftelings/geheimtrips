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
/** `sub` = Unterkategorie (nur zur Gruppierung im Auswahl-Picker; optional). */
export interface T2Tag { label: string; groups: string[]; sub?: string; }

export const T2_GROUPS: T2Group[] = [
  { slug: 'kultur',    label: 'Kultur, Geschichte & Architektur', icon: 'fa-landmark',        color: '#8A6FB3' },
  { slug: 'natur',     label: 'Natur, Outdoor & Landschaft',      icon: 'fa-leaf',            color: '#5B8F6E' },
  { slug: 'freizeit',  label: 'Freizeit, Action & Entertainment', icon: 'fa-ticket',          color: '#F99039' },
  { slug: 'urbanes',   label: 'Urbanes, Architektur & Lifestyle', icon: 'fa-city',            color: '#4A7FB5' },
  { slug: 'kulinarik', label: 'Kulinarik & Übernachten',          icon: 'fa-mug-hot',         color: '#D97757' },
];

export const T2_TAGS: T2Tag[] = [
  // ── Kultur, Geschichte & Architektur ──
  { label: 'Kunstmuseum', groups: ['kultur'], sub: 'Museen & Ausstellungen' },
  { label: 'Galerie', groups: ['kultur'], sub: 'Museen & Ausstellungen' },
  { label: 'Technikmuseum', groups: ['kultur'], sub: 'Museen & Ausstellungen' },
  { label: 'Industriemuseum', groups: ['kultur'], sub: 'Museen & Ausstellungen' },
  { label: 'Naturkundemuseum', groups: ['kultur'], sub: 'Museen & Ausstellungen' },
  { label: 'Wissenschaftsmuseum', groups: ['kultur'], sub: 'Museen & Ausstellungen' },
  { label: 'Geschichtsmuseum', groups: ['kultur'], sub: 'Museen & Ausstellungen' },
  { label: 'Anthropologisches Museum', groups: ['kultur'], sub: 'Museen & Ausstellungen' },
  { label: 'Freilichtmuseum', groups: ['kultur'], sub: 'Museen & Ausstellungen' },
  { label: 'Bibliothek', groups: ['kultur'], sub: 'Museen & Ausstellungen' },
  { label: 'Burg', groups: ['kultur'], sub: 'Burgen, Schlösser & Paläste' },
  { label: 'Schloss', groups: ['kultur'], sub: 'Burgen, Schlösser & Paläste' },
  { label: 'Villa', groups: ['kultur'], sub: 'Burgen, Schlösser & Paläste' },
  { label: 'Palast', groups: ['kultur'], sub: 'Burgen, Schlösser & Paläste' },
  { label: 'Ruine', groups: ['kultur'], sub: 'Burgen, Schlösser & Paläste' },
  { label: 'Sakralbau', groups: ['kultur'], sub: 'Sakralbauten' },
  { label: 'Kirche', groups: ['kultur'], sub: 'Sakralbauten' },
  { label: 'Kloster', groups: ['kultur'], sub: 'Sakralbauten' },
  { label: 'Tempel', groups: ['kultur'], sub: 'Sakralbauten' },
  { label: 'Synagoge', groups: ['kultur'], sub: 'Sakralbauten' },
  { label: 'Moschee', groups: ['kultur'], sub: 'Sakralbauten' },
  { label: 'Denkmal', groups: ['kultur'], sub: 'Denkmäler & Stätten' },
  { label: 'Mahnmal', groups: ['kultur'], sub: 'Denkmäler & Stätten' },
  { label: 'Archäologische Stätte', groups: ['kultur'], sub: 'Denkmäler & Stätten' },
  { label: 'Industriedenkmal & Zeche', groups: ['kultur'], sub: 'Industriekultur' },
  { label: 'Bergwerk', groups: ['kultur'], sub: 'Industriekultur' },
  { label: 'Turm', groups: ['kultur'], sub: 'Landmarken & Architektur' },
  { label: 'Brücke', groups: ['kultur'], sub: 'Landmarken & Architektur' },
  { label: 'Leuchtturm', groups: ['kultur'], sub: 'Landmarken & Architektur' },
  { label: 'Besondere Architektur', groups: ['kultur'], sub: 'Landmarken & Architektur' },
  { label: 'Bahnhof', groups: ['kultur'], sub: 'Landmarken & Architektur' },
  { label: 'Planetarium', groups: ['kultur'], sub: 'Wissenschaft & Astronomie' },
  { label: 'Science Center', groups: ['kultur'], sub: 'Wissenschaft & Astronomie' },

  // ── Urbanes, Architektur & Lifestyle ──
  // „Historische Altstadt / Viertel" ist zu „Stadt" zusammengeführt — die Ausprägung
  // (Altstadt, Szeneviertel, Platz …) ist jetzt ein Merkmal, kein eigener Tag.
  { label: 'Stadt', groups: ['urbanes'], sub: 'Städte & Orte' },
  { label: 'Dorf',  groups: ['urbanes'], sub: 'Städte & Orte' },

  // ── Natur, Outdoor & Landschaft ──
  { label: 'See', groups: ['natur'], sub: 'Gewässer & Küsten' },
  { label: 'Fluss', groups: ['natur'], sub: 'Gewässer & Küsten' },
  { label: 'Wasserfall', groups: ['natur'], sub: 'Gewässer & Küsten' },
  { label: 'Strand', groups: ['natur'], sub: 'Gewässer & Küsten' },
  { label: 'Berg', groups: ['natur'], sub: 'Berge & Geologie' },
  { label: 'Höhle', groups: ['natur'], sub: 'Berge & Geologie' },
  { label: 'Felsformation', groups: ['natur'], sub: 'Berge & Geologie' },
  { label: 'Schlucht', groups: ['natur'], sub: 'Berge & Geologie' },
  { label: 'Wald', groups: ['natur'], sub: 'Wälder, Parks & Landschaft' },
  { label: 'Botanischer Garten', groups: ['natur'], sub: 'Wälder, Parks & Landschaft' },
  { label: 'Park', groups: ['natur'], sub: 'Wälder, Parks & Landschaft' },
  { label: 'Moor', groups: ['natur'], sub: 'Wälder, Parks & Landschaft' },
  { label: 'Heide', groups: ['natur'], sub: 'Wälder, Parks & Landschaft' },

  // ── Freizeit, Action & Entertainment ──
  { label: 'Freizeitpark', groups: ['freizeit'], sub: 'Parks & Erlebniswelten' },
  { label: 'Miniaturwelt', groups: ['freizeit'], sub: 'Parks & Erlebniswelten' },
  { label: 'Zoo', groups: ['freizeit'], sub: 'Tierwelten' },
  { label: 'Tierpark', groups: ['freizeit'], sub: 'Tierwelten' },
  { label: 'Wildgehege', groups: ['freizeit'], sub: 'Tierwelten' },
  { label: 'Aquarium', groups: ['freizeit'], sub: 'Tierwelten' },
  { label: 'Schwimmbad', groups: ['freizeit'], sub: 'Wasser & Wellness' },
  { label: 'Wasserpark', groups: ['freizeit'], sub: 'Wasser & Wellness' },
  { label: 'Therme', groups: ['freizeit'], sub: 'Wasser & Wellness' },
  { label: 'Hochseilgarten', groups: ['freizeit'], sub: 'Outdoor-Action' },
  { label: 'Sommerrodelbahn', groups: ['freizeit'], sub: 'Outdoor-Action' },
  { label: 'Minigolf', groups: ['freizeit'], sub: 'Outdoor-Action' },
  { label: 'Seilbahn', groups: ['freizeit'], sub: 'Outdoor-Action' },
  { label: 'Trampolinhalle', groups: ['freizeit'], sub: 'Indoor-Action & Gaming' },
  { label: 'Paintball', groups: ['freizeit'], sub: 'Indoor-Action & Gaming' },
  { label: 'Lasertag', groups: ['freizeit'], sub: 'Indoor-Action & Gaming' },
  { label: 'Escape Room', groups: ['freizeit'], sub: 'Indoor-Action & Gaming' },
  { label: 'VR- & Gaming-Lounge', groups: ['freizeit'], sub: 'Indoor-Action & Gaming' },
  { label: 'Kino', groups: ['freizeit'], sub: 'Bühne & Kino' },
  { label: 'Theater', groups: ['freizeit'], sub: 'Bühne & Kino' },

  // ── Kulinarik & Übernachten ──
  { label: 'Restaurant', groups: ['kulinarik'], sub: 'Essen & Trinken' },
  { label: 'Café', groups: ['kulinarik'], sub: 'Essen & Trinken' },
  { label: 'Eisdiele', groups: ['kulinarik'], sub: 'Essen & Trinken' },
  { label: 'Bar & Pub', groups: ['kulinarik'], sub: 'Essen & Trinken' },
  { label: 'Markt & Markthalle', groups: ['kulinarik'], sub: 'Märkte & Genuss' },
  { label: 'Markenwelt', groups: ['kulinarik', 'freizeit'], sub: 'Märkte & Genuss' },
  { label: 'Übernachtung', groups: ['kulinarik'], sub: 'Übernachten' },
  { label: 'Campingplatz', groups: ['kulinarik'], sub: 'Übernachten' },
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
  'Nostalgisch', 'Chic & Elegant', 'Puristisch / Modern',
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
  'Stadt': { m: ['Altstadt', 'Szeneviertel', 'Platz', 'Marktplatz', 'Fußgängerzone', 'Hafenviertel', 'Fachwerk', 'Streetart', 'Architektur', 'Mittelalter', 'Regionalgeschichte', 'Outdoor'], v: [] },
  'Dorf':  { m: ['Fachwerk', 'Marktplatz', 'Handwerk', 'Architektur', 'Mittelalter', 'Regionalgeschichte', 'Outdoor'], v: [] },
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
  'Café': { m: ['Hauseigene Röstung', 'Vegan', 'Vegetarisch', 'Terrasse', 'Aussicht', 'Erlebnisgastronomie', 'Teehaus', 'Kuchen', 'Torten', 'Tiere'], v: ['Hygge', 'Nostalgisch'] },
  'Eisdiele': { m: ['Vegan', 'Terrasse', 'Aussicht'], v: [] },
  'Bar & Pub': { m: ['Terrasse', 'Indoor', 'Live-Musik', 'Erlebnisgastronomie'], v: [] },
  'Markt & Markthalle': { m: ['Regionalgeschichte', 'Architektur', 'Lebensmittel', 'Foodcourt', 'Gründerzeit', 'Viktorianisch'], v: [] },
  'Markenwelt': { m: ['Handwerk', 'Landwirtschaftstechnik', 'Vorführungen', 'Verkostung', 'Schokolade', 'Marke', 'Fabrik', 'Käse', 'Weingut', 'Bier', 'Süßigkeit', 'Automobil', 'Maschinen', 'Führung', 'Kreuzfahrtschiffe', 'Flugzeuge'], v: [] },
  'Übernachtung': { m: ['Wellness-Bereich', 'Saunalandschaft', 'Prunkräume', 'Baumhaus', 'Bungalow', 'Aussicht', 'Außergewöhnlich'], v: [] },
};
