// ─── Taxonomy Types ───────────────────────────────────────────────────────────

export type QuestionType =
  | 'textarea' | 'text' | 'select' | 'stars' | 'yesno' | 'multicheck' | 'slider'
  | 'weekhours'    // Öffnungszeiten je Wochentag (Record<mo|di|…|so, string>)
  | 'phone'        // Telefon: Ländervorwahl-Dropdown + Nummer → gespeichert als „+49 …"
  | 'pricefields'; // Eintrittspreise Erwachsene/Kinder/Ermäßigte/Senioren (Record)

export interface SubmitQuestion {
  id:           string;
  label:        string;
  hint?:        string;
  type:         QuestionType;
  placeholder?: string;
  options?:     string[];
  required?:    boolean;
  starLabels?:  [string, string]; // [worst-label, best-label]
  /** Only show this question when condition is met */
  showIf?:      (answers: Record<string, unknown>) => boolean;
}

export interface TaxonomyFeature { key: string; label: string; }

export interface TaxonomyL3 {
  slug:      string;
  label:     string;
  features:  TaxonomyFeature[];
  questions: SubmitQuestion[];
}

export interface TaxonomyL2 {
  slug:     string;
  label:    string;
  icon:     string;
  children: TaxonomyL3[];
}

export interface TaxonomyL1 {
  slug:     string;
  label:    string;
  icon:     string;
  color:    string;
  bg:       string;
  children: TaxonomyL2[];
}

// ─── Shared question builders ─────────────────────────────────────────────────

const Q = {
  highlight: (ph = 'Was dürfen Besucher nicht verpassen? Was ist hier einzigartig?'): SubmitQuestion =>
    ({ id: 'highlight', label: 'Was macht diesen Ort so besonders?', type: 'textarea', required: true, placeholder: ph }),

  duration: (): SubmitQuestion =>
    ({ id: 'duration', label: 'Wie lange sollte man mindestens einplanen?', type: 'select',
       options: ['Unter 1 Stunde', '1–2 Stunden', '2–3 Stunden', 'Halber Tag', 'Ganzer Tag oder mehr'] }),

  audience: (extra?: string[]): SubmitQuestion =>
    ({ id: 'audience', label: 'Für wen ist es besonders geeignet?', type: 'multicheck',
       options: ['Familien mit Kindern', 'Paare', 'Solo-Reisende', 'Gruppen & Freunde', 'Senioren', 'Fotografen', ...(extra ?? [])] }),

  bestSeason: (): SubmitQuestion =>
    ({ id: 'best_season', label: 'Wann ist der Besuch am schönsten?', type: 'multicheck',
       options: ['Frühling', 'Sommer', 'Herbst', 'Winter', 'Ganzjährig schön'] }),

  yesno: (id: string, label: string): SubmitQuestion => ({ id, label, type: 'yesno' }),

  sel: (id: string, label: string, options: string[]): SubmitQuestion => ({ id, label, type: 'select', options }),

  stars: (id: string, label: string, starLabels?: [string, string]): SubmitQuestion => ({ id, label, type: 'stars', starLabels }),

  multi: (id: string, label: string, options: string[]): SubmitQuestion => ({ id, label, type: 'multicheck', options }),

  text: (id: string, label: string, placeholder?: string): SubmitQuestion => ({ id, label, type: 'text', placeholder }),
};

// ─── Taxonomy Tree ────────────────────────────────────────────────────────────

export const TAXONOMY: TaxonomyL1[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // L1: Kultur, Geschichte & Wissen
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug: 'kultur-geschichte', label: 'Kultur, Geschichte & Wissen',
    icon: 'fa-landmark', color: '#34254C', bg: '#F1ECF4',
    children: [

      // ── L2: Museen & Ausstellungen ──────────────────────────────────────
      {
        slug: 'museen-ausstellungen', label: 'Museen & Ausstellungen', icon: 'fa-building-columns',
        children: [
          {
            slug: 'technik-industriemuseum', label: 'Technik- & Industriemuseum',
            features: [
              { key: 'automobil', label: 'Automobil' }, { key: 'luftfahrt', label: 'Luftfahrt' },
              { key: 'schifffahrt', label: 'Schifffahrt' }, { key: 'eisenbahn', label: 'Eisenbahn' },
              { key: 'bergbau', label: 'Bergbau' }, { key: 'maschinenbau', label: 'Maschinenbau' },
              { key: 'textilindustrie', label: 'Textilindustrie' },
            ],
            questions: [
              Q.highlight('Was macht dieses Museum einzigartig? Was hat dich am meisten fasziniert?'),
              Q.sel('epoch', 'Aus welcher Epoche stammt der Betrieb/die Anlage?',
                ['Frühe Industrialisierung (vor 1900)', 'Gründerzeit 1900–1940', 'Nachkriegszeit 1945–1970', 'Jüngere Vergangenheit ab 1970']),
              Q.yesno('live_demo', 'Gibt es Live-Vorführungen oder aktive Maschinen?'),
              Q.stars('guide_value', 'Wie sehr lohnt sich eine geführte Tour?', ['Nicht nötig', 'Absolut empfehlenswert']),
              Q.duration(),
              Q.audience(['Technik-Begeisterte', 'Schulklassen']),
            ],
          },
          {
            slug: 'kunstmuseum-galerie', label: 'Kunstmuseum & Galerie',
            features: [
              { key: 'gemaelde', label: 'Gemälde' }, { key: 'skulpturen', label: 'Skulpturen' },
              { key: 'moderne-kunst', label: 'Moderne Kunst' }, { key: 'fotografie', label: 'Fotografie' },
              { key: 'zeitgenoessisch', label: 'Zeitgenössisch' }, { key: 'klassische-antike', label: 'Klassische Antike' },
            ],
            questions: [
              Q.highlight('Was hebt diese Galerie ab? Welcher Künstler / welches Werk beeindruckt am meisten?'),
              Q.multi('art_types', 'Welche Art von Kunst überwiegt?',
                ['Gemälde', 'Skulpturen', 'Installationen', 'Fotografie', 'Digital/Medienkunst', 'Zeichnungen']),
              Q.yesno('wechselausstellung', 'Wechselt die Ausstellung regelmäßig?'),
              Q.duration(),
              Q.audience(['Kunstbegeisterte', 'Kulturliebhaber']),
            ],
          },
          {
            slug: 'naturkunde-wissenschaftsmuseum', label: 'Naturkunde- & Wissenschaftsmuseum',
            features: [
              { key: 'palaeontologie', label: 'Paläontologie / Dinosaurier' }, { key: 'geologie', label: 'Geologie' },
              { key: 'biologie', label: 'Biologie' }, { key: 'anthropologie', label: 'Anthropologie' },
              { key: 'evolution', label: 'Evolution' },
            ],
            questions: [
              Q.highlight('Was macht dieses Museum besonders? Gibt es Exponate, die einem die Sprache verschlagen?'),
              Q.yesno('interactive', 'Gibt es Mitmach-Bereiche oder interaktive Stationen?'),
              Q.stars('kid_friendly', 'Wie geeignet ist es für Kinder?', ['Ungeeignet', 'Perfekt für Kinder']),
              Q.duration(),
              Q.audience(['Schulklassen', 'Naturbegeisterte', 'Familien']),
            ],
          },
          {
            slug: 'kultur-geschichtsmuseum', label: 'Kultur- & Geschichtsmuseum',
            features: [
              { key: 'regionalgeschichte', label: 'Regionalgeschichte' }, { key: 'archaeologie', label: 'Archäologie' },
              { key: 'ethnologie', label: 'Ethnologie' }, { key: 'militaergeschichte', label: 'Militärgeschichte' },
              { key: 'zeitgeschichte', label: 'Zeitgeschichte' },
            ],
            questions: [
              Q.highlight('Was macht dieses Museum einzigartig? Welche Geschichte wird hier lebendig?'),
              Q.sel('main_epoch', 'Welche Epoche steht im Mittelpunkt?',
                ['Vorgeschichte / Antike', 'Mittelalter', 'Frühe Neuzeit', 'Industriezeitalter', '20. Jahrhundert', 'Zeitgeschichte']),
              Q.yesno('guided_tour', 'Gibt es empfehlenswerte Führungen?'),
              Q.stars('authenticity', 'Wie authentisch und lebendig ist die Präsentation?', ['Trocken / veraltet', 'Sehr lebendig & authentisch']),
              Q.duration(),
            ],
          },
          {
            slug: 'freilichtmuseum', label: 'Freilichtmuseum',
            features: [
              { key: 'historische-gebaeude', label: 'Historische Gebäude' }, { key: 'handwerksvorführungen', label: 'Handwerksvorführungen' },
              { key: 'alte-landwirtschaft', label: 'Alte Landwirtschaft' }, { key: 'reenactment', label: 'Reenactment' },
            ],
            questions: [
              Q.highlight('Was macht das Gelände lebendig? Welches Highlight darfst du nicht verpassen?'),
              Q.sel('size', 'Wie groß ist das Gelände?',
                ['Klein – unter 2 Stunden', 'Mittel – 2 bis 4 Stunden', 'Groß – halber Tag', 'Riesig – ganzer Tag']),
              Q.yesno('live_crafts', 'Gibt es aktive Vorführungen (Handwerk, Landwirtschaft)?'),
              Q.bestSeason(),
              Q.audience(['Schulklassen', 'Familien', 'Geschichtsinteressierte']),
            ],
          },
          {
            slug: 'kuriositaeten-spezialmuseum', label: 'Kuriositäten- & Spezialmuseum',
            features: [
              { key: 'nischenthemen', label: 'Nischenthemen' }, { key: 'kulinarisch', label: 'Kulinarische Museen' },
              { key: 'spionage', label: 'Spionage' }, { key: 'spielzeug', label: 'Spielzeug' },
              { key: 'kriminalitaet', label: 'Kriminalität' },
            ],
            questions: [
              Q.highlight('Warum ist das eine Reise wert? Was macht es so schräg / besonders?'),
              Q.stars('uniqueness', 'Wie einzigartig ist das Thema?', ['Eher gewöhnlich', 'Absolut einmalig in der Welt']),
              Q.audience(['Neugierige', 'Pop-Kultur-Fans', 'Schulklassen']),
              Q.duration(),
            ],
          },
        ],
      },

      // ── L2: Historische Bauwerke & Monumente ─────────────────────────────
      {
        slug: 'historische-bauwerke', label: 'Historische Bauwerke & Monumente', icon: 'fa-chess-rook',
        children: [
          {
            slug: 'burgen-schloesser-palaeste', label: 'Burgen, Schlösser & Paläste',
            features: [
              { key: 'mittelalterlich', label: 'Mittelalterlich' }, { key: 'barock', label: 'Barock' },
              { key: 'renaissance', label: 'Renaissance' }, { key: 'festungsanlagen', label: 'Festungsanlagen' },
              { key: 'schlossgaerten', label: 'Schlossgärten' }, { key: 'wehrgang', label: 'Wehrgänge' },
            ],
            questions: [
              Q.highlight('Was beeindruckt dich an diesem Ort? Was darf man nicht verpassen?'),
              Q.stars('condition', 'Wie gut ist der Erhaltungszustand?', ['Große Ruine', 'Perfekt restauriert']),
              Q.yesno('interior', 'Kann man das Gebäude von innen besichtigen?'),
              Q.yesno('guided_tour', 'Gibt es geführte Touren?'),
              Q.audience(['Historienliebhaber', 'Familien', 'Fotografen']),
            ],
          },
          {
            slug: 'gedenkstaetten-mahnmale', label: 'Gedenkstätten & Mahnmale',
            features: [
              { key: 'kriegsdenkmäler', label: 'Kriegsdenkmäler' }, { key: 'historische-ereignisse', label: 'Historische Ereignisse' },
              { key: 'friedhöfe', label: 'Prominente Friedhöfe' }, { key: 'gedenktafeln', label: 'Gedenktafeln' },
            ],
            questions: [
              Q.highlight('Welche Geschichte wird hier erinnert und warum ist dieser Ort bedeutsam?'),
              Q.yesno('documentation', 'Gibt es eine Ausstellung / Dokumentation vor Ort?'),
              Q.text('visitor_note', 'Gibt es besondere Hinweise für Besucher?', 'z.B. Kleiderordnung, Verhaltensregeln...'),
              Q.audience(['Geschichtsinteressierte', 'Schulklassen']),
            ],
          },
          {
            slug: 'sakralbauten', label: 'Sakralbauten',
            features: [
              { key: 'kirchen', label: 'Kirchen' }, { key: 'kathedralen', label: 'Kathedralen' },
              { key: 'kloester', label: 'Klöster' }, { key: 'tempel', label: 'Tempel' },
              { key: 'moscheen', label: 'Moscheen' }, { key: 'synagogen', label: 'Synagogen' },
            ],
            questions: [
              Q.highlight('Was ist architektonisch oder spirituell einzigartig an diesem Ort?'),
              Q.sel('age', 'Wie alt ist das Bauwerk ungefähr?',
                ['Vor 1000 n.Chr.', '1000–1500', '1500–1800', 'Nach 1800']),
              Q.yesno('freely_accessible', 'Ist es frei und öffentlich zugänglich?'),
              Q.multi('highlights', 'Was gibt es Besonderes zu sehen?',
                ['Fresken / Malereien', 'Glasfenster', 'Krypta', 'Türme / Aussicht', 'Besondere Akustik', 'Schöner Kreuzgang']),
            ],
          },
          {
            slug: 'archaeologische-staetten', label: 'Archäologische Stätten',
            features: [
              { key: 'roemisch', label: 'Römisch' }, { key: 'griechisch', label: 'Griechisch' },
              { key: 'keltisch', label: 'Keltisch' }, { key: 'praehistorisch', label: 'Prähistorisch' },
              { key: 'ruinenfelder', label: 'Ruinenfelder' },
            ],
            questions: [
              Q.highlight('Was erwartet Besucher? Was kann man hier erkennen und erleben?'),
              Q.yesno('guided_tour', 'Gibt es eine Führung oder Informationstafeln?'),
              Q.stars('preservation', 'Wie gut erkennbar / erhalten sind die Überreste?', ['Kaum zu erahnen', 'Eindrucksvoll erhalten']),
              Q.sel('accessibility', 'Wie gut ist der Ort erreichbar?',
                ['Direkt erreichbar', 'Kurzer Fußweg < 15 Min', 'Moderater Fußweg', 'Längerer Weg > 30 Min']),
            ],
          },
          {
            slug: 'ruinen', label: 'Ruinen',
            features: [
              { key: 'burgruinen', label: 'Burgruinen' }, { key: 'antike-überreste', label: 'Antike Überreste' },
              { key: 'lost-places', label: 'Verlassene Orte / Lost Places' },
            ],
            questions: [
              Q.highlight('Was macht diese Ruine so faszinierend? Welche Geschichte steckt dahinter?'),
              Q.yesno('officially_open', 'Ist der Zugang offiziell erlaubt und sicher?'),
              Q.sel('access_difficulty', 'Wie schwer ist sie zu erreichen?',
                ['Einfach erreichbar', 'Leichter Fußweg < 15 Min', 'Moderater Weg 15–45 Min', 'Anspruchsvoller Weg', 'Nur für Erfahrene']),
              Q.stars('worth_seeing', 'Wie viel ist noch zu sehen / zu erleben?', ['Fast nichts mehr übrig', 'Absolut beeindruckend']),
            ],
          },
        ],
      },

      // ── L2: Astronomie & Angewandte Wissenschaft ─────────────────────────
      {
        slug: 'astronomie-wissenschaft', label: 'Astronomie & Angewandte Wissenschaft', icon: 'fa-star',
        children: [
          {
            slug: 'planetarium-sternwarte', label: 'Planetarium & Sternwarte',
            features: [
              { key: 'teleskop', label: 'Teleskop-Beobachtung' }, { key: 'multimedia-shows', label: 'Multimedia-Shows' },
              { key: 'weltraum-ausstellung', label: 'Weltraum-Ausstellung' }, { key: 'kuppelsaal', label: 'Kuppelsaal' },
            ],
            questions: [
              Q.highlight('Was ist das absolute Highlight? Was hast du gelernt oder erlebt?'),
              Q.yesno('evening_obs', 'Gibt es abendliche Himmelsbeobachtungen?'),
              Q.yesno('shows', 'Werden regelmäßig Multimedia-Shows angeboten?'),
              Q.sel('level', 'Für wen geeignet?', ['Für alle – auch ohne Vorkenntnisse', 'Für Interessierte', 'Eher für Experten']),
              Q.duration(),
            ],
          },
          {
            slug: 'science-center', label: 'Science Center',
            features: [
              { key: 'mitmach-experimente', label: 'Mitmach-Experimente' }, { key: 'physik-chemie-live', label: 'Physik/Chemie Live' },
              { key: 'virtual-reality', label: 'Virtual Reality' }, { key: 'kinder-erlebniszonen', label: 'Kinder-Erlebniszonen' },
            ],
            questions: [
              Q.highlight('Was begeistert dich am meisten? Welches Experiment / welche Station ist ein Muss?'),
              Q.stars('interactivity', 'Wie interaktiv und mitmachend ist es?', ['Eher Schaukästen', 'Alles zum Anfassen']),
              Q.sel('min_age', 'Ab welchem Alter wirklich spannend?',
                ['Ab ca. 3 Jahren', 'Ab Schulalter (6–8 J.)', 'Ab ca. 10 Jahren', 'Für Jugendliche & Erwachsene']),
              Q.duration(),
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // L1: Freizeit, Action & Entertainment
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug: 'freizeit-action', label: 'Freizeit, Action & Entertainment',
    icon: 'fa-ticket', color: '#F99039', bg: '#FFF4EB',
    children: [

      // ── L2: Themen- & Erlebnisparks ──────────────────────────────────────
      {
        slug: 'themenparks', label: 'Themen- & Erlebnisparks', icon: 'fa-ferris-wheel',
        children: [
          {
            slug: 'grosse-freizeitparks', label: 'Große Freizeitparks',
            features: [
              { key: 'achterbahnen', label: 'Achterbahnen' }, { key: 'themenbereiche', label: 'Themenbereiche' },
              { key: 'live-shows', label: 'Live-Shows' }, { key: 'kinderfahrgeschaefte', label: 'Kinderfahrgeschäfte' },
              { key: 'vr-rides', label: 'Virtual Reality Rides' },
            ],
            questions: [
              Q.highlight('Was macht diesen Park zum Geheimtipp? Was ist hier anders als in den bekannten Parks?'),
              Q.multi('age_group', 'Für welche Altersgruppen geeignet?',
                ['Kleinkinder 0–5 J.', 'Kinder 6–12 J.', 'Teenagers', 'Erwachsene', 'Senioren']),
              Q.sel('wait_times', 'Wie sind die Wartezeiten an Attraktionen?',
                ['Meist unter 15 Minuten', '15–30 Minuten', 'Oft über 30 Minuten', 'Sehr lange – früh kommen!']),
              Q.stars('price_value', 'Preis-Leistungs-Verhältnis?', ['Sehr teuer', 'Absolut fair']),
              Q.text('top_tip', 'Dein wichtigster Tipp für den Besuch:', 'z.B. Am besten unter der Woche, Frühstarter-Ticket...'),
            ],
          },
          {
            slug: 'miniatur-modellwelten', label: 'Miniatur- & Modellwelten',
            features: [
              { key: 'modelleisenbahn', label: 'Modelleisenbahn' }, { key: 'miniaturstaedte', label: 'Miniaturstädte' },
              { key: 'interaktive-lichteffekte', label: 'Interaktive Lichteffekte' }, { key: 'flughafen-modell', label: 'Flughafen-Modelle' },
            ],
            questions: [
              Q.highlight('Was hat dich hier am meisten gestaunt? Was ist das heimliche Highlight?'),
              Q.sel('size', 'Wie groß / detailreich ist die Anlage?',
                ['Klein – unter 1 Stunde', 'Mittel – 1 bis 2 Stunden', 'Groß – 2 bis 4 Stunden', 'Riesig – halber Tag']),
              Q.audience(['Modellbahn-Fans', 'Kinder', 'Familien']),
            ],
          },
          {
            slug: 'filmparks-studio-touren', label: 'Filmparks & Studio-Touren',
            features: [
              { key: 'original-filmsets', label: 'Original Filmsets' }, { key: 'stunt-shows', label: 'Stunt-Shows' },
              { key: 'requisiten-ausstellung', label: 'Requisiten-Ausstellung' }, { key: 'kino-effekte', label: 'Kino-Effekte' },
            ],
            questions: [
              Q.highlight('Was ist das absolute Highlight für Filmfans?'),
              Q.sel('film_knowledge', 'Muss man den Film/die Serie kennen?',
                ['Ja – für Fans ein Muss', 'Hilfreich, aber nicht nötig', 'Nein – für alle interessant']),
              Q.stars('price_value', 'Preis-Leistung?', ['Sehr teuer', 'Absolut fair']),
              Q.duration(),
            ],
          },
        ],
      },

      // ── L2: Wasser-, Bade- & Spa-Erlebnisse ─────────────────────────────
      {
        slug: 'wasser-bade-spa', label: 'Wasser-, Bade- & Spa-Erlebnisse', icon: 'fa-droplet',
        children: [
          {
            slug: 'wellness-spa', label: 'Wellness & Spa',
            features: [
              { key: 'thermenbecken', label: 'Thermenbecken' }, { key: 'saunalandschaft', label: 'Saunalandschaften' },
              { key: 'textilfreie-zonen', label: 'Textilfreie Zonen' }, { key: 'massagen', label: 'Massagen' },
              { key: 'dampfbaeder', label: 'Dampfbäder' }, { key: 'ruheoasen', label: 'Ruheoasen' },
            ],
            questions: [
              Q.highlight('Was macht das Erlebnis so entspannend und besonders?'),
              Q.stars('atmosphere', 'Wie entspannend und ruhig ist die Atmosphäre?', ['Sehr laut / voll', 'Absolute Ruhe-Oase']),
              Q.sel('price_level', 'Preiskategorie (Tageseintritt ca.)?',
                ['Günstig unter 20 €', 'Mittel 20–40 €', 'Gehoben 40–70 €', 'Luxus über 70 €']),
              Q.yesno('family_friendly', 'Gibt es explizit familienfreundliche Bereiche?'),
              Q.text('must_try', 'Was sollte man auf keinen Fall verpassen?', 'z.B. Außenbecken bei Sonnenuntergang...'),
            ],
          },
          {
            slug: 'erlebnisbaeder-wasserparks', label: 'Erlebnisbäder & Wasserparks',
            features: [
              { key: 'wasserrutschen', label: 'Wasserrutschen' }, { key: 'wellenbecken', label: 'Wellenbecken' },
              { key: 'stroemungskanal', label: 'Strömungskanal' }, { key: 'outdoor-rutschen', label: 'Outdoor-Rutschen' },
              { key: 'kleinkindbereich', label: 'Kleinkindbereiche' },
            ],
            questions: [
              Q.highlight('Was macht dieses Bad zum Geheimtipp? Welche Attraktion ist ein Muss?'),
              Q.sel('indoor_outdoor', 'Indoor oder Outdoor?', ['Rein Indoor', 'Rein Outdoor', 'Kombination Indoor & Outdoor']),
              Q.stars('crowding', 'Wie überfüllt wird es typischerweise?', ['Immer sehr voll', 'Angenehm entspannt']),
              Q.multi('age_group', 'Für welche Altersgruppen besonders geeignet?',
                ['Kleinkinder', 'Kinder 6–12 J.', 'Teenager', 'Erwachsene', 'Familien allgemein']),
            ],
          },
          {
            slug: 'klassische-schwimmbaeder', label: 'Klassische Schwimmbäder',
            features: [
              { key: 'sportbecken', label: 'Sportbecken' }, { key: 'sprungturm', label: 'Sprungtürme' },
              { key: 'freibadwiesen', label: 'Freibadwiesen' }, { key: 'hallenbad', label: 'Hallenbad' },
            ],
            questions: [
              Q.highlight('Was macht dieses Schwimmbad zu einem Geheimtipp? Freibad-Flair, Nostalgie, besondere Lage?'),
              Q.sel('type', 'Art des Bads?', ['Freibad', 'Hallenbad', 'Frei- und Hallenbad kombiniert']),
              Q.stars('quality', 'Wie gepflegt und sauber ist das Becken?', ['Sehr schlecht', 'Tadellos sauber']),
              Q.yesno('swimming_lanes', 'Gibt es Schwimmbahnen für Sportler?'),
            ],
          },
        ],
      },

      // ── L2: Tierwelten ────────────────────────────────────────────────────
      {
        slug: 'tierwelten', label: 'Tierwelten', icon: 'fa-paw',
        children: [
          {
            slug: 'zoologische-gaerten', label: 'Zoologische Gärten',
            features: [
              { key: 'grossgehege', label: 'Großgehege' }, { key: 'streichelzoo', label: 'Streichelzoo' },
              { key: 'schaufuetterungen', label: 'Schaufütterungen' }, { key: 'exotische-raubtiere', label: 'Exotische Raubtiere' },
              { key: 'tropenhaeuser', label: 'Tropenhäuser' },
            ],
            questions: [
              Q.highlight('Was macht diesen Zoo besonders? Welches Tier / welcher Bereich ist ein Muss?'),
              Q.sel('size', 'Wie groß ist das Gelände?',
                ['Klein – 1 bis 2 Stunden', 'Mittel – 2 bis 4 Stunden', 'Groß – halber bis ganzer Tag']),
              Q.yesno('feeding_shows', 'Gibt es Fütterungen zum Zuschauen?'),
              Q.stars('animal_welfare', 'Wie modern und artgerecht wirken die Gehege?', ['Sehr beengt / veraltet', 'Sehr modern & artgerecht']),
            ],
          },
          {
            slug: 'aquarien-meereszentren', label: 'Aquarien & Meereszentren',
            features: [
              { key: 'glastunnel', label: 'Unterwasser-Glastunnel' }, { key: 'korallenriffe', label: 'Korallenriffe' },
              { key: 'beruehrungsbecken', label: 'Berührungsbecken' }, { key: 'rochenbecken', label: 'Rochenbecken' },
            ],
            questions: [
              Q.highlight('Was ist das Unterwasser-Highlight? Was lässt einem den Atem stocken?'),
              Q.yesno('tunnel', 'Gibt es einen begehbaren Unterwassertunnel?'),
              Q.stars('kid_wow', 'Wie begeisternd ist es für Kinder?', ['Eher unbeeindruckt', 'Absolutes Staunen garantiert']),
              Q.duration(),
            ],
          },
          {
            slug: 'safariparks-wildgehege', label: 'Safariparks & Wildgehege',
            features: [
              { key: 'auto-safari', label: 'Autofahrt-Safari' }, { key: 'heimisches-wild', label: 'Heimisches Wild' },
              { key: 'raubvogel-shows', label: 'Raubvögel-Flugshows' }, { key: 'wildgehege-rundweg', label: 'Wildgehege-Rundwege' },
            ],
            questions: [
              Q.highlight('Was erlebst du hier, das du woanders nicht bekommst?'),
              Q.yesno('drive_through', 'Kann man mit dem Auto durch ein Freigehege fahren?'),
              Q.sel('animal_types', 'Welche Tiere stehen im Fokus?',
                ['Heimische Wildtiere', 'Exotische / afrikanische Tiere', 'Mix aus beidem']),
              Q.audience(['Familien', 'Tierliebhaber', 'Naturbegeisterte']),
            ],
          },
        ],
      },

      // ── L2: Indoor-Action & Gaming ────────────────────────────────────────
      {
        slug: 'indoor-action', label: 'Indoor-Action & Gaming', icon: 'fa-gamepad',
        children: [
          {
            slug: 'raetsel-geschicklichkeit', label: 'Rätsel & Geschicklichkeit',
            features: [
              { key: 'escape-rooms', label: 'Escape Rooms' }, { key: 'vr-arenen', label: 'VR-Arenen' },
              { key: 'lasertag', label: 'Lasertag' }, { key: 'indoor-minigolf', label: 'Neon-Indoor-Minigolf' },
            ],
            questions: [
              Q.highlight('Was macht es besonders spannend? Was hebt es von anderen Escape Rooms / VR-Erlebnissen ab?'),
              Q.stars('difficulty', 'Schwierigkeitsgrad?', ['Sehr einfach', 'Extrem herausfordernd']),
              Q.sel('group_size', 'Ideal für welche Gruppengröße?',
                ['Zu zweit', 'Kleine Gruppen 3–5', 'Große Gruppen 6+', 'Auch alleine sinnvoll']),
              Q.yesno('booking_required', 'Muss man im Voraus buchen?'),
            ],
          },
          {
            slug: 'sportliche-indoor-action', label: 'Sportliche Indoor-Action',
            features: [
              { key: 'trampolinhallen', label: 'Trampolinhallen' }, { key: 'indoor-skihalle', label: 'Indoor-Skihallen' },
              { key: 'kartbahnen', label: 'Indoor-Kartbahnen' }, { key: 'bowling', label: 'Schwarzlicht-Bowling' },
            ],
            questions: [
              Q.highlight('Was macht hier besonders viel Spaß? Was ist das Alleinstellungsmerkmal?'),
              Q.multi('age_group', 'Ideal für welche Altersgruppe?',
                ['Kinder ab 5 J.', 'Kinder ab 10 J.', 'Teenager', 'Erwachsene', 'Alle Altersgruppen']),
              Q.stars('price_value', 'Preis-Leistung?', ['Sehr teuer', 'Absolut fair']),
              Q.yesno('booking_required', 'Vorab-Buchung empfehlenswert?'),
            ],
          },
        ],
      },

      // ── L2: Outdoor-Action & Abenteuer ───────────────────────────────────
      {
        slug: 'outdoor-action', label: 'Outdoor-Action & Abenteuer', icon: 'fa-person-hiking',
        children: [
          {
            slug: 'klettern-fliegen', label: 'Klettern & Fliegen',
            features: [
              { key: 'hochseilgarten', label: 'Hochseilgärten' }, { key: 'klettersteige', label: 'Klettersteige' },
              { key: 'ziplines', label: 'Ziplines' }, { key: 'bungee', label: 'Bungee-Jumping' },
              { key: 'waldseilgarten', label: 'Waldseilgärten' },
            ],
            questions: [
              Q.highlight('Was ist das Adrenalin-Highlight? Was bleibt unvergessen?'),
              Q.sel('min_age', 'Ab welchem Alter / Level geeignet?',
                ['Ab ca. 5 Jahren (niedrig)', 'Ab ca. 8 Jahren (mittel)', 'Ab 12 Jahren (anspruchsvoll)', 'Nur für Erwachsene / Fortgeschrittene']),
              Q.stars('adrenaline', 'Wie hoch ist der Nervenkitzel?', ['Sehr sanft / sicher', 'Extremes Adrenalin-Level']),
              Q.yesno('booking_required', 'Muss man vorab buchen?'),
              Q.yesno('equipment_rental', 'Gibt es Ausrüstungsverleih vor Ort?'),
            ],
          },
          {
            slug: 'fahren-rutschen', label: 'Fahren & Rutschen',
            features: [
              { key: 'sommerrodelbahn', label: 'Sommerrodelbahnen' }, { key: 'alpine-coaster', label: 'Alpine Coaster' },
              { key: 'mountaincart', label: 'Mountaincarts' }, { key: 'quad', label: 'Quad-Geländetouren' },
            ],
            questions: [
              Q.highlight('Was macht die Fahrt so besonders? Aussicht, Tempo, Strecke?'),
              Q.sel('season', 'Saisonal oder ganzjährig?',
                ['Ganzjährig betrieben', 'Nur Sommer', 'Nur Winter', 'Wetterabhängig']),
              Q.stars('thrill', 'Wie aufregend ist die Fahrt?', ['Gemütlich / familienfreundlich', 'Richtig schnell & aufregend']),
              Q.yesno('kid_friendly', 'Können auch kleine Kinder mitfahren (als Beifahrer)?'),
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // L1: Natur, Landschaft & Outdoor
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug: 'natur-landschaft', label: 'Natur, Landschaft & Outdoor',
    icon: 'fa-leaf', color: '#2E7D32', bg: '#E8F5E9',
    children: [

      // ── L2: Wälder & Naturparks ───────────────────────────────────────────
      {
        slug: 'waelder-naturparks', label: 'Wälder & Naturparks', icon: 'fa-tree',
        children: [
          {
            slug: 'schutzgebiete', label: 'Schutzgebiete (Nationalpark etc.)',
            features: [
              { key: 'nationalpark', label: 'Nationalpark' }, { key: 'biosphaerenreservat', label: 'Biosphärenreservat' },
              { key: 'urwald', label: 'Urwälder' }, { key: 'hochmoor', label: 'Hochmoore' },
              { key: 'heidegebiete', label: 'Heidegebiete' },
            ],
            questions: [
              Q.highlight('Was ist das Besondere an diesem Naturschutzgebiet? Welches Naturerlebnis ist unvergesslich?'),
              Q.bestSeason(),
              Q.yesno('marked_trails', 'Gibt es gut markierte Wanderwege?'),
              Q.sel('difficulty', 'Wie anspruchsvoll ist das Gelände?',
                ['Für alle – auch Kinderwagen', 'Leichte Wege', 'Mittelschwere Wanderungen', 'Anspruchsvoll – gutes Schuhwerk nötig']),
              Q.yesno('wildlife', 'Kann man seltene Tiere in der Natur beobachten?'),
            ],
          },
          {
            slug: 'naturerlebnispfade', label: 'Naturerlebnispfade',
            features: [
              { key: 'baumwipfelpfad', label: 'Baumwipfelpfade' }, { key: 'barfusspfad', label: 'Barfußpfade' },
              { key: 'haengebruecke', label: 'Seil-Hängebrücken' }, { key: 'waldlehrpfad', label: 'Waldlehrpfade' },
            ],
            questions: [
              Q.highlight('Was macht diesen Pfad unvergesslich? Was ist das Erlebnis-Highlight?'),
              Q.sel('length', 'Wie lang ist der Weg ungefähr?',
                ['Unter 1 km', '1–3 km', '3–5 km', 'Über 5 km']),
              Q.sel('difficulty', 'Wie anspruchsvoll?',
                ['Für alle – auch Kinderwagen', 'Leicht begehbar', 'Etwas hügelig', 'Anspruchsvoll']),
              Q.yesno('family_friendly', 'Mit Kindern gut zu machen?'),
            ],
          },
        ],
      },

      // ── L2: Gewässer & Küsten ─────────────────────────────────────────────
      {
        slug: 'gewaesser-kuesten', label: 'Gewässer & Küsten', icon: 'fa-water',
        children: [
          {
            slug: 'stehende-gewaesser', label: 'Stehende Gewässer (Seen)',
            features: [
              { key: 'naturbadesee', label: 'Naturbadeseen' }, { key: 'stausee', label: 'Stauseen' },
              { key: 'bergsee', label: 'Bergseen' }, { key: 'tretboot', label: 'Tretbootverleih' },
              { key: 'angelplaetze', label: 'Angelplätze' },
            ],
            questions: [
              Q.highlight('Was macht diesen See so besonders? Farbe, Lage, Einsamkeit, Atmosphäre?'),
              Q.yesno('swimming_allowed', 'Ist Schwimmen hier erlaubt und empfehlenswert?'),
              Q.stars('crowding', 'Wie ruhig und unberührt ist der Ort?', ['Sehr überlaufen', 'Echte Ruhe & Einsamkeit']),
              Q.multi('infra', 'Welche Infrastruktur gibt es?',
                ['Parkplatz', 'WC', 'Umkleiden', 'Kiosk/Imbiss', 'Bootsvermietung', 'Spielbereich für Kinder']),
              Q.bestSeason(),
            ],
          },
          {
            slug: 'fliessgewaesser', label: 'Fließgewässer (Flüsse, Bäche, Wasserfälle)',
            features: [
              { key: 'fluesse', label: 'Flüsse' }, { key: 'gebirgsbaehe', label: 'Gebirgsbäche' },
              { key: 'wasserfaelle', label: 'Wasserfälle' }, { key: 'kanutouren', label: 'Kanutouren' },
              { key: 'wildwasser', label: 'Wildwasser-Rafting' },
            ],
            questions: [
              Q.highlight('Was macht diesen Ort magisch? Rauschen, Kraft, Ruhe, Landschaft?'),
              Q.yesno('swimming', 'Kann man hier plantschen oder schwimmen?'),
              Q.sel('access', 'Wie leicht ist der Ort zu erreichen?',
                ['Direkt begehbar', 'Kurzer Fußweg < 15 Min', 'Moderater Weg 15–30 Min', 'Längerer Weg > 30 Min']),
              Q.bestSeason(),
            ],
          },
          {
            slug: 'meer-kueste', label: 'Meer & Küste',
            features: [
              { key: 'sandstrand', label: 'Sandstrände' }, { key: 'kiesstrand', label: 'Kiesstrände' },
              { key: 'steilkueste', label: 'Steilküsten' }, { key: 'lagunen', label: 'Lagunen' },
              { key: 'wattenmeer', label: 'Wattenmeer' }, { key: 'strandpromenade', label: 'Strandpromenaden' },
            ],
            questions: [
              Q.highlight('Was macht diesen Ort so besonders? Was unterscheidet ihn von anderen Stränden?'),
              Q.stars('cleanliness', 'Wie sauber sind Strand und Wasser?', ['Sehr schmutzig', 'Kristallklar & picobello sauber']),
              Q.sel('walk_distance', 'Wie weit ist es vom Parkplatz / ÖPNV bis zum Strand?',
                ['Direkt am Parkplatz / Haltestelle', 'Ca. 5–15 Minuten', 'Ca. 15–30 Minuten', 'Über 30 Minuten – aber lohnt sich!']),
              Q.sel('swimming', 'Darf und kann man hier schwimmen?',
                ['Ja, offiziell erlaubt und empfohlen', 'Auf eigene Gefahr', 'Nein / nicht empfohlen']),
              Q.yesno('tides', 'Muss man auf die Gezeiten / Flut achten?'),
              Q.multi('infra', 'Infrastruktur vor Ort?',
                ['WC', 'Umkleiden', 'Imbiss / Café', 'Sonnenschirm-Verleih', 'Rettungsschwimmer', 'Hundebereich']),
            ],
          },
        ],
      },

      // ── L2: Geologie & Erhebungen ─────────────────────────────────────────
      {
        slug: 'geologie-erhebungen', label: 'Geologie & Erhebungen', icon: 'fa-mountain',
        children: [
          {
            slug: 'felsformationen-taeler', label: 'Felsformationen & Täler',
            features: [
              { key: 'schluchten', label: 'Felsenschluchten' }, { key: 'klammen', label: 'Klammen' },
              { key: 'canyons', label: 'Canyons' }, { key: 'kletterfelsen', label: 'Kletterfelsen' },
              { key: 'gesteinsformationen', label: 'Gesteinsformationen' },
            ],
            questions: [
              Q.highlight('Was macht diese Formation so einzigartig? Was bleibt hängen?'),
              Q.yesno('climbing_possible', 'Kann man hier klettern (Fels / Klettersteig)?'),
              Q.sel('access', 'Wie kommt man dorthin?',
                ['Leicht erreichbar', 'Leichter Wanderweg', 'Mittelschwere Wanderung', 'Anspruchsvoller Weg']),
              Q.yesno('danger', 'Ist Vorsicht / Erfahrung nötig ohne offizielle Führung?'),
            ],
          },
          {
            slug: 'hoehlen', label: 'Höhlen',
            features: [
              { key: 'tropfsteinhöhlen', label: 'Tropfsteinhöhlen' }, { key: 'eishöhlen', label: 'Eishöhlen' },
              { key: 'schauhoehle', label: 'Schauhöhle mit Führung' }, { key: 'wildhoehle', label: 'Unerschlossene Höhlen' },
            ],
            questions: [
              Q.highlight('Was ist das Highlight in der Höhle? Welches Naturbild bleibt dir im Gedächtnis?'),
              Q.sel('guided', 'Wird die Höhle nur mit Führung besucht?',
                ['Führung ist Pflicht', 'Führung wird angeboten, aber optional', 'Frei zugänglich ohne Führung']),
              Q.stars('development', 'Wie gut ist die Höhle touristisch erschlossen?', ['Wild / unerschlossen', 'Perfekt ausgebaut & beleuchtet']),
              Q.sel('tour_length', 'Wie lang dauert der Besuch ungefähr?',
                ['Unter 30 Minuten', '30–60 Minuten', '1–2 Stunden', 'Über 2 Stunden']),
            ],
          },
          {
            slug: 'gebirge', label: 'Gebirge (Gipfel & Bergpässe)',
            features: [
              { key: 'berggipfel', label: 'Berggipfel' }, { key: 'gipfelkreuz', label: 'Gipfelkreuze' },
              { key: 'panorama', label: 'Panorama-Aussichtsplattformen' }, { key: 'bergpässe', label: 'Bergpässe' },
              { key: 'vulkane', label: 'Erloschene Vulkane' },
            ],
            questions: [
              Q.highlight('Was macht diesen Berg / Gipfel besonders? Panorama, Erlebnis, Geschichte?'),
              Q.sel('difficulty', 'Schwierigkeitsgrad des Aufstiegs?',
                ['Leichte Wanderung – für alle', 'Mittelschwer – festes Schuhwerk', 'Anspruchsvoll – gute Kondition', 'Nur für erfahrene Bergsteiger']),
              Q.stars('view', 'Wie beeindruckend ist die Aussicht?', ['Kaum Aussicht', 'Atemberaubendes Panorama']),
              Q.sel('ascent_type', 'Wie kommt man hoch?',
                ['Nur zu Fuß', 'Seilbahn / Lift vorhanden', 'Zu Fuß oder Lift möglich', 'Mit dem Auto auf die Passhöhe']),
              Q.bestSeason(),
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // L1: Urbanes, Architektur & Lifestyle
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug: 'urbanes-architektur', label: 'Urbanes, Architektur & Lifestyle',
    icon: 'fa-city', color: '#71587A', bg: '#F1ECF4',
    children: [

      // ── L2: Stadtstrukturen & Plätze ─────────────────────────────────────
      {
        slug: 'stadtstrukturen', label: 'Stadtstrukturen & Plätze', icon: 'fa-map',
        children: [
          {
            slug: 'historische-viertel', label: 'Historische Viertel',
            features: [
              { key: 'altstaedte', label: 'Altstädte' }, { key: 'fachwerkgassen', label: 'Fachwerkgassen' },
              { key: 'historische-marktplaetze', label: 'Historische Marktplätze' }, { key: 'stadtmauern', label: 'Stadtmauern' },
              { key: 'befestigungstore', label: 'Befestigungstore' },
            ],
            questions: [
              Q.highlight('Was macht dieses Viertel einzigartig? Welche Gasse oder welches Gebäude ist ein Muss?'),
              Q.stars('preservation', 'Wie gut ist das historische Erscheinungsbild erhalten?', ['Stark verändert / modern überlagert', 'Perfekt original erhalten']),
              Q.sel('best_time', 'Wann ist es am schönsten?',
                ['Morgens (ruhig & leer)', 'Tagsüber (lebendig)', 'Abends (besonderes Licht)', 'Egal – immer schön']),
              Q.yesno('gastronomy', 'Gibt es gute Restaurants / Cafés im Viertel?'),
            ],
          },
          {
            slug: 'moderne-urbane-viertel', label: 'Moderne & Urbane Viertel',
            features: [
              { key: 'street-art', label: 'Street-Art-Viertel' }, { key: 'alternative-kieze', label: 'Alternative Kieze' },
              { key: 'container-doerfer', label: 'Container-Dörfer' }, { key: 'hafencity', label: 'Umstrukturierte Hafencitys' },
            ],
            questions: [
              Q.highlight('Was ist das Besondere an diesem Viertel? Welche Energie herrscht hier?'),
              Q.yesno('street_art', 'Gibt es bemerkenswerte Wandbilder oder Street Art zu entdecken?'),
              Q.stars('vibe', 'Wie lebendig und kreativ ist das Viertel?', ['Sehr ruhig / unspektakulär', 'Extrem lebendig & inspirierend']),
              Q.sel('best_time', 'Wann lohnt sich ein Besuch am meisten?',
                ['Tagsüber', 'Abends / Nachts', 'Wochenende', 'Egal']),
            ],
          },
          {
            slug: 'parkanlagen-gaerten', label: 'Parkanlagen & Gärten',
            features: [
              { key: 'stadtparks', label: 'Große Stadtparks' }, { key: 'botanische-gaerten', label: 'Botanische Gärten' },
              { key: 'japanische-gaerten', label: 'Japanische Gärten' }, { key: 'barockgarten', label: 'Barocke Schlossgärten' },
            ],
            questions: [
              Q.highlight('Was macht diesen Park besonders? Gestaltung, Ruhe, spezielle Pflanzen, Atmosphäre?'),
              Q.yesno('picnic', 'Ist er gut für ein Picknick geeignet?'),
              Q.stars('peace', 'Wie ruhig und entspannend ist er?', ['Laut & überlaufen', 'Absolute Erholung']),
              Q.bestSeason(),
            ],
          },
        ],
      },

      // ── L2: Landmarken & Infrastruktur ────────────────────────────────────
      {
        slug: 'landmarken', label: 'Landmarken & Infrastruktur', icon: 'fa-tower-observation',
        children: [
          {
            slug: 'tueme-aussichtspunkte', label: 'Türme & Aussichtspunkte',
            features: [
              { key: 'fernsehturm', label: 'Fernsehtürme' }, { key: 'leuchtturm', label: 'Historische Leuchttürme' },
              { key: 'wasserturm', label: 'Alte Wassertürme' }, { key: 'riesenrad', label: 'Riesenräder' },
            ],
            questions: [
              Q.highlight('Wie ist der Ausblick von hier? Was sieht man und was macht ihn unvergesslich?'),
              Q.yesno('panorama_360', 'Bietet der Aussichtspunkt 360°-Rundsicht?'),
              Q.yesno('entry_fee', 'Ist Eintritt erforderlich?'),
              Q.yesno('climbable', 'Kann man den Turm wirklich besteigen?'),
            ],
          },
          {
            slug: 'industriekultur', label: 'Industriekultur',
            features: [
              { key: 'zechen', label: 'Stillgelegte Zechen' }, { key: 'gasometer', label: 'Begehbare Gasometer' },
              { key: 'historische-bahnhöfe', label: 'Historische Bahnhöfe' }, { key: 'viadukte', label: 'Viadukte' },
            ],
            questions: [
              Q.highlight('Was macht diesen Industrieort so faszinierend? Größe, Geschichte, Atmosphäre?'),
              Q.sel('epoch', 'Aus welcher Epoche stammt die Anlage?',
                ['Frühindustrialisierung vor 1900', 'Gründerzeit / Kaiserreich', 'Weimarer Republik / NS-Zeit', 'Nachkriegszeit 1945–1990']),
              Q.yesno('tours_exhibits', 'Gibt es Führungen oder eine Ausstellung vor Ort?'),
              Q.yesno('publicly_accessible', 'Ist das Gelände öffentlich und legal zugänglich?'),
            ],
          },
        ],
      },

      // ── L2: Kultur & Aufführungsorte ──────────────────────────────────────
      {
        slug: 'kultur-aufführungsorte', label: 'Kultur & Aufführungsorte', icon: 'fa-masks-theater',
        children: [
          {
            slug: 'buehnen-theater', label: 'Bühnen & Theater',
            features: [
              { key: 'schauspielhaeuser', label: 'Schauspielhäuser' }, { key: 'opernhaeuser', label: 'Opernhäuser' },
              { key: 'musical', label: 'Musical-Theater' }, { key: 'open-air', label: 'Open-Air-Waldbühnen' },
              { key: 'amphitheater', label: 'Antike Amphitheater' },
            ],
            questions: [
              Q.highlight('Was macht diesen Aufführungsort einzigartig? Architektur, Akustik, besondere Inszenierungen?'),
              Q.yesno('booking_advance', 'Müssen Tickets weit im Voraus gebucht werden?'),
              Q.sel('indoor_outdoor', 'Drinnen oder Draußen?', ['Rein Indoor', 'Rein Outdoor', 'Beides möglich']),
              Q.stars('architecture', 'Wie beeindruckend ist allein die Architektur?', ['Unspektakulär', 'Absolut atemberaubend']),
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // L1: Kulinarik & Gastronomie
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug: 'kulinarik', label: 'Kulinarik & Gastronomie',
    icon: 'fa-utensils', color: '#C96442', bg: '#FFF0EB',
    children: [

      // ── L2: Gastronomiebetriebe ───────────────────────────────────────────
      {
        slug: 'gastronomiebetriebe', label: 'Gastronomiebetriebe', icon: 'fa-fork-knife',
        children: [
          {
            slug: 'restaurants-speiselokale', label: 'Restaurants & Speiselokale',
            features: [
              { key: 'fine-dining', label: 'Fine Dining / Sterne-Küche' }, { key: 'regionalküche', label: 'Traditionelle Regionalküche' },
              { key: 'internationale-küche', label: 'Internationale Küche' }, { key: 'vegan-vegetarisch', label: 'Vegan / Vegetarisch' },
            ],
            questions: [
              Q.highlight('Was ist das absolute Signature-Gericht? Warum ist das ein Geheimtipp?'),
              Q.yesno('reservation', 'Sollte man reservieren?'),
              Q.sel('price_range', 'Preiskategorie pro Person (Hauptgericht)?',
                ['Unter 15 €', '15–30 €', '30–60 €', 'Über 60 € (gehobene Küche)']),
              Q.text('specialty', 'Was ist die Spezialität des Hauses?', 'z.B. hausgemachte Pasta, Flammkuchen aus dem Holzofen...'),
              Q.yesno('vegan_options', 'Gibt es gute vegetarische oder vegane Optionen?'),
            ],
          },
          {
            slug: 'cafes-snacks', label: 'Cafés & Snacks',
            features: [
              { key: 'specialty-coffee', label: 'Specialty Coffee / Drittwelle' }, { key: 'konditorei', label: 'Traditions-Konditoreien' },
              { key: 'eisdiele', label: 'Eisdielen' }, { key: 'rooftop-cafe', label: 'Rooftop-Cafés' },
            ],
            questions: [
              Q.highlight('Was ist ein absolutes Muss hier? Welche Spezialität oder welches Ambiente?'),
              Q.yesno('homemade', 'Wird hier selbst gebacken / hergestellt?'),
              Q.yesno('outdoor_seating', 'Gibt es schöne Außenplätze?'),
              Q.sel('wait_times', 'Wie sind die Wartezeiten?',
                ['Kaum Wartezeit', 'Manchmal etwas warten', 'Oft längere Wartezeiten – früh gehen!']),
            ],
          },
          {
            slug: 'bars-nightlife', label: 'Bars & Nightlife',
            features: [
              { key: 'cocktailbar', label: 'Speakeasy Cocktailbars' }, { key: 'irish-pub', label: 'Irish Pubs' },
              { key: 'craft-beer', label: 'Craft Beer Schänken' }, { key: 'club', label: 'Clubs / Diskos' },
              { key: 'weinbar', label: 'Weinbars' },
            ],
            questions: [
              Q.highlight('Was macht diese Location zum Geheimtipp? Konzept, Cocktails, Atmosphäre, Stammgäste?'),
              Q.yesno('reservation', 'Reservierung ratsam?'),
              Q.sel('vibe', 'Wie ist das Ambiente?',
                ['Gemütlich / Entspannt', 'Belebt / Gesellig', 'Club / Tanzfläche', 'Gehoben / Exklusiv']),
              Q.sel('price_level', 'Preisniveau?', ['Günstig', 'Mittel', 'Gehoben']),
            ],
          },
        ],
      },

      // ── L2: Kulinarische Erlebnisse & Märkte ──────────────────────────────
      {
        slug: 'kulinarische-erlebnisse', label: 'Kulinarische Erlebnisse & Märkte', icon: 'fa-basket-shopping',
        children: [
          {
            slug: 'maerkte-food-halls', label: 'Märkte & Food-Halls',
            features: [
              { key: 'permanente-markthallen', label: 'Permanente Markthallen' }, { key: 'street-food', label: 'Street-Food-Festivals' },
              { key: 'wochenmaerkte', label: 'Historische Wochenmärkte' },
            ],
            questions: [
              Q.highlight('Was darf man hier auf keinen Fall verpassen? Welcher Stand oder welches Produkt ist ein Muss?'),
              Q.sel('frequency', 'Wie oft findet der Markt statt?',
                ['Täglich', 'Mehrmals pro Woche', 'Wöchentlich', 'Saisonal / Jährlich']),
              Q.yesno('parking', 'Gibt es Parkplätze in der Nähe?'),
              Q.text('opening_hours', 'Wann hat er offen?', 'z.B. Di–Sa 8–14 Uhr...'),
            ],
          },
          {
            slug: 'produktionsstaetten', label: 'Produktionsstätten & Führungen',
            features: [
              { key: 'brauereiführungen', label: 'Brauereiführungen' }, { key: 'weinführungen', label: 'Weingüter mit Verkostung' },
              { key: 'whisky', label: 'Whiskydestillerien' }, { key: 'schokolade', label: 'Schokoladenmanufakturen' },
            ],
            questions: [
              Q.highlight('Was macht diese Führung/diesen Betrieb besonders? Was nimmt man mit?'),
              Q.yesno('tasting_included', 'Ist eine Verkostung in der Tour inklusive?'),
              Q.yesno('booking_required', 'Muss man im Voraus buchen?'),
              Q.sel('tour_duration', 'Wie lange dauert die Führung?',
                ['Unter 1 Stunde', '1–2 Stunden', '2–3 Stunden', 'Über 3 Stunden']),
            ],
          },
        ],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getAllL3(): TaxonomyL3[] {
  return TAXONOMY.flatMap(l1 => l1.children.flatMap(l2 => l2.children));
}

export function getL1ForL3Slug(l3Slug: string): TaxonomyL1 | undefined {
  return TAXONOMY.find(l1 => l1.children.some(l2 => l2.children.some(l3 => l3.slug === l3Slug)));
}

export function getL3BySlug(slug: string): TaxonomyL3 | undefined {
  return getAllL3().find(l3 => l3.slug === slug);
}

// ─── Universal questions (shown for ALL place types at end of Step 4) ─────────

export const UNIVERSAL_QUESTIONS: SubmitQuestion[] = [
  {
    id:          'secretness',
    label:       'Wie geheim ist dieser Ort?',
    hint:        '1 = Alle kennen ihn · 5 = Echter Insider-Tipp',
    type:        'slider',
    starLabels:  ['Touristisch bekannt', 'Echter Geheimtipp'],
    required:    true,
  },
  {
    id:      'trivia_type',
    label:   'Gibt es etwas Besonderes über diesen Ort zu berichten? (optional)',
    hint:    'Ein kurioses Detail, das andere überrascht – komplett freiwillig.',
    type:    'select',
    options: [
      'Fun Fact',
      'Historischer Fakt',
      'Kuriosität',
      'Legende & Sage',
      'Rekord',
      'Drehort & Popkultur',
      'Geheimtipp',
    ],
  },
  {
    id:          'trivia_text',
    label:       'Erzähl uns davon',
    hint:        'z.B. „Hier wurde 1981 eine Tatort-Folge gedreht."',
    type:        'textarea',
    placeholder: 'Das Besondere an diesem Ort…',
    showIf:      (a) => typeof a['trivia_type'] === 'string' && a['trivia_type'] !== '',
  },
  {
    id:      'duration',
    label:   'Wie viel Zeit sollte man einplanen?',
    type:    'select',
    options: ['Unter 1 Stunde', '1–2 Stunden', '2–3 Stunden', 'Halber Tag', 'Ganzer Tag oder mehr'],
  },
  {
    id:      'audience',
    label:   'Für wen ist dieser Ort besonders geeignet?',
    type:    'multicheck',
    options: ['Familien mit Kindern', 'Paare', 'Solo-Reisende', 'Gruppen & Freunde', 'Senioren', 'Fotograf:innen', 'Hundebesitzer:innen', 'Barrierefrei'],
  },
  {
    id:      'entrance_fee',
    label:   'Gibt es einen Eintritt?',
    hint:    'Gilt für alle Orte – auch Naturgebiete können Parkgebühren oder Eintrittsgelder haben.',
    type:    'select',
    options: [
      'Kostenlos',
      'Kostenpflichtig',
      'Nur Parkgebühr (kein Eintritt)',
      'Spende / freiwillig',
      'Nicht bekannt',
    ],
  },
  {
    id:     'entrance_prices',
    label:  'Eintrittspreise',
    hint:   'Trage ein, was du weißt – leere Felder werden nicht angezeigt.',
    type:   'pricefields',
    showIf: (a) => a['entrance_fee'] === 'Kostenpflichtig' || a['entrance_fee'] === 'Nur Parkgebühr (kein Eintritt)',
  },
  {
    id:          'entrance_fee_url',
    label:       'Link zu den Preisen',
    hint:        'Offizielle Seite mit aktuellen Eintrittspreisen.',
    type:        'text',
    placeholder: 'https://…',
    showIf:      (a) => a['entrance_fee'] === 'Kostenpflichtig' || a['entrance_fee'] === 'Nur Parkgebühr (kein Eintritt)',
  },
  {
    id:      'dogs_allowed',
    label:   'Sind Hunde erlaubt?',
    type:    'select',
    options: ['Ja, Hunde sind willkommen', 'Leinenpflicht', 'Nein', 'Nicht bekannt'],
  },
  {
    id:      'parking',
    label:   'Parksituation',
    type:    'select',
    options: [
      'Kostenloser Parkplatz direkt am Ort',
      'Kostenpflichtiger Parkplatz',
      'Begrenzte / schwierige Parkmöglichkeiten',
      'Kein Parkplatz – ÖPNV empfohlen',
      'Nicht bekannt',
    ],
  },
  {
    id:    'has_opening_hours',
    label: 'Hat der Ort offizielle Öffnungszeiten?',
    type:  'yesno',
  },
  {
    id:     'opening_hours_week',
    label:  'Öffnungszeiten',
    hint:   'Je Wochentag, z.B. „10:00–17:00" oder „geschlossen" – leer = keine Angabe.',
    type:   'weekhours',
    showIf: (a) => a['has_opening_hours'] === 'yes',
  },
  {
    id:          'opening_hours_url',
    label:       'Link zu den Öffnungszeiten',
    hint:        'Offizielle Seite mit aktuellen Zeiten.',
    type:        'text',
    placeholder: 'https://…',
    showIf:      (a) => a['has_opening_hours'] === 'yes',
  },
  {
    id:          'website',
    label:       'Website des Ortes',
    hint:        'Falls der Ort eine eigene Website hat.',
    type:        'text',
    placeholder: 'https://…',
  },
];

export function mapToLegacyCategory(l1Slug: string | null | undefined): { category: string; categoryLabel: string } {
  const map: Record<string, { category: string; categoryLabel: string }> = {
    'kultur-geschichte':  { category: 'kultur',  categoryLabel: 'Kultur'  },
    'freizeit-action':    { category: 'aktiv',   categoryLabel: 'Aktiv'   },
    'natur-landschaft':   { category: 'natur',   categoryLabel: 'Natur'   },
    'urbanes-architektur':{ category: 'kultur',  categoryLabel: 'Kultur'  },
    'kulinarik':          { category: 'genuss',  categoryLabel: 'Genuss'  },
  };
  return map[l1Slug ?? ''] ?? { category: 'natur', categoryLabel: 'Natur' };
}
