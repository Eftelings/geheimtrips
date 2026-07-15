import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { PlaceCard } from '../components/ui/PlaceCard.js';
import { TagBadge } from '../components/ui/TagBadge.js';
import { SectionHead } from '../components/ui/SectionHead.js';
import { useAppStore } from '../store/useAppStore.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { getLocationByIp, requestGpsPosition, reverseGeocode, distanceKm, geocodeSuggestions } from '../services/geoService.js';
import { tripsApi } from '../services/api.js';
import type { Place, Trip, RankingEntry, Transport } from '../types/index.js';
import { GT_LEVELS } from '../types/index.js';
import type { Coords, GeoLocation } from '../services/geoService.js';
import { pointInGeoJSON, EFFECTIVE_SPEED_KMH, reachBBoxPoints } from '../utils/geo.js';
import type { IsochroneResponse } from '../utils/geo.js';
import { TagFilter, placeMatchesTag, EMPTY_TAG_SEL, shortGroupLabel } from '../components/ui/TagFilter.js';
import type { TagSelection } from '../components/ui/TagFilter.js';
import { useTaxVocab } from '../data/taxVocab.js';
import { ReachControls } from '../components/ui/ReachControls.js';
import { ReachLayer, MapComputeOverlay } from '../components/map/ReachLayer.js';
import { useTravelReach } from '../hooks/useTravelReach.js';

// ─── Leaflet custom markers ───────────────────────────────────────────────────
const makeNumberMarker = (n: number) => L.divIcon({
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#F99039;color:white;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.35)">${n}</div>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
});
const userMarker = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#8A6FB3;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// ─── Karten-Tiles ────────────────────────────────────────────────────────────
type TileStyle = 'map' | 'satellite';
const TILES: Record<TileStyle, { url: string; attribution: string }> = {
  map: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
};

// ─── FitBounds helper ─────────────────────────────────────────────────────────
function FitBoundsHelper({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map(p => p.join(',')).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) { map.flyTo(points[0], 13, { duration: 0.6 }); return; }
    map.fitBounds(points as [number, number][], { padding: [44, 44], maxZoom: 13, animate: true, duration: 0.6 });
  }, [key]);
  return null;
}

// ─── Modus-Typen ─────────────────────────────────────────────────────────────
type MapMode = 'newest' | 'all' | 'top5' | 'saved';

// Reichweiten-Modus: klassischer Luftlinien-Radius oder echte Fahrzeit je Verkehrsmittel
interface TravelState {
  mode: 'radius' | Transport;
  minutes: number;
  iso: IsochroneResponse | null;
  loading: boolean;
}
const SECTION_TITLES: Record<MapMode, string> = {
  newest: 'Kürzlich hinzugefügte Geheimtipps in deiner Nähe',
  all:    'Alle Geheimtipps in deiner Nähe',
  top5:   'Meine Top 5 Geheimtrips',
  saved:  'Meine gemerkten Orte',
};

// ─── Hilfsfunktion: Leaflet-Map-Instanz in Ref speichern ─────────────────────
function MapCapture({ r }: { r: React.MutableRefObject<L.Map | null> }) {
  r.current = useMap();
  return null;
}

// ─── Nearby Map Section ───────────────────────────────────────────────────────
function NearbyMapSection({ places, userCoords, centerOverride, mode, radiusKm, travel }: {
  places: Place[];
  userCoords: Coords | null;
  centerOverride?: Coords | null;
  mode: MapMode;
  radiusKm: number;
  travel: TravelState;
}) {
  const { savedIds } = useAppStore();
  const [tileStyle, setTileStyle] = useState<TileStyle>('map');
  const [mapReady, setMapReady]   = useState(false);
  const [sortOrder, setSortOrder] = useState<'dist' | 'az' | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  useEffect(() => { setMapReady(true); }, []);

  // Sort-Order zurücksetzen wenn Modus wechselt
  useEffect(() => { setSortOrder(null); }, [mode]);

  // Aktives Zentrum: Suchadresse überschreibt GPS-Standort
  const activeCenter = centerOverride ?? userCoords;

  // ── Orte filtern & sortieren ────────────────────────────────────────────────
  const shownPlaces = useMemo(() => {
    const withCoords = places.filter(p => p.lat != null && p.lng != null);
    const scored = withCoords.map(p => ({
      ...p,
      distKm: activeCenter ? distanceKm(activeCenter, { lat: p.lat!, lng: p.lng! }) : 0,
    }));

    if (mode === 'saved') {
      const base = scored
        .filter(p => savedIds.has(p.id))
        .slice(0, 10);
      if (sortOrder === 'az') return [...base].sort((a, b) => a.name.localeCompare(b.name, 'de'));
      return base.sort((a, b) => a.distKm - b.distKm);
    }

    // Reichweite: Luftlinien-Radius ODER Isochrone (echte Fahrzeit je Verkehrsmittel)
    const inRadius = !activeCenter ? scored
      : travel.mode === 'radius' ? scored.filter(p => p.distKm <= radiusKm)
      : travel.iso               ? scored.filter(p => pointInGeoJSON(p.lat!, p.lng!, travel.iso!.feature.geometry))
      : scored.filter(p => p.distKm <= (EFFECTIVE_SPEED_KMH[travel.mode as Transport] * travel.minutes) / 60);

    if (mode === 'top5') {
      const base = inRadius
        .sort((a, b) => b.match !== a.match ? b.match - a.match : b.rating - a.rating)
        .slice(0, 5);
      if (sortOrder === 'az')   return [...base].sort((a, b) => a.name.localeCompare(b.name, 'de'));
      if (sortOrder === 'dist') return [...base].sort((a, b) => a.distKm - b.distKm);
      return base;
    }

    // all + newest → gemeinsame Sort-Override-Logik
    const base = mode === 'all'
      ? inRadius
      : inRadius.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

    if (sortOrder === 'az')   return [...base].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (sortOrder === 'dist') return [...base].sort((a, b) => a.distKm - b.distKm);
    if (mode === 'all') return [...base].sort((a, b) => a.distKm - b.distKm);
    return base;
  }, [places, activeCenter, mode, radiusKm, savedIds, sortOrder, travel]);

  // ── FitBounds-Punkte: Orte + Zentrum + die GESAMTE Reichweiten-Fläche ───────
  const fitPoints = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = shownPlaces
      .filter(p => p.lat != null && p.lng != null)
      .map(p => [p.lat!, p.lng!]);
    if (activeCenter) {
      pts.push([activeCenter.lat, activeCenter.lng]);
      if (mode !== 'saved') pts.push(...reachBBoxPoints(activeCenter, travel, radiusKm));
    }
    return pts;
  }, [shownPlaces, activeCenter, mode, travel, radiusKm]);

  const defaultCenter: [number, number] = activeCenter
    ? [activeCenter.lat, activeCenter.lng]
    : [51.1657, 10.4515];

  return (
    <div className="mb-8">
      <SectionHead title={SECTION_TITLES[mode]} />

      {/* ── Karte ──────────────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden mb-5 border border-[var(--color-bg-soft)] h-[340px] md:h-[420px]">

        {/* Kompass-Overlay während längerer Reichweiten-Berechnung */}
        <MapComputeOverlay loading={travel.loading}
          transitLike={travel.mode === 'train' || travel.mode === 'transit'} />

        {/* Zoom-Buttons unten links */}
        <div className="absolute bottom-4 left-3 z-[1000] flex flex-col gap-0.5">
          <button onClick={() => mapRef.current?.zoomIn()}
            className="w-8 h-8 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-t-lg shadow-sm text-lg font-bold text-[var(--color-aubergine)] hover:bg-white transition-colors leading-none">+</button>
          <button onClick={() => mapRef.current?.zoomOut()}
            className="w-8 h-8 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-b-lg shadow-sm text-lg font-bold text-[var(--color-aubergine)] hover:bg-white transition-colors leading-none">−</button>
        </div>

        {/* Stil-Toggle oben rechts */}
        <div className="absolute top-3 right-3 z-[999] flex gap-1 bg-white/90 backdrop-blur-sm rounded-xl p-1 shadow-sm">
          <button
            onClick={() => setTileStyle('map')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${tileStyle === 'map' ? 'bg-[var(--color-aubergine)] text-white' : 'text-[var(--color-lavender)]'}`}
          >
            <i className="fa-solid fa-map" /> Karte
          </button>
          <button
            onClick={() => setTileStyle('satellite')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${tileStyle === 'satellite' ? 'bg-[var(--color-aubergine)] text-white' : 'text-[var(--color-lavender)]'}`}
          >
            <i className="fa-solid fa-satellite" /> Satellit
          </button>
        </div>

        {!mapReady ? (
          <div className="w-full h-full flex items-center justify-center bg-[var(--color-bg-soft)]">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[var(--color-lavender)]" />
          </div>
        ) : (
          <MapContainer
            center={defaultCenter}
            zoom={userCoords ? 9 : 6}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            scrollWheelZoom={false}
          >
            <MapCapture r={mapRef} />
            <TileLayer
              key={tileStyle}
              url={TILES[tileStyle].url}
              attribution={TILES[tileStyle].attribution}
            />
            <FitBoundsHelper points={fitPoints} />

            {/* Aktives Zentrum + Reichweite (Isochrone oder Radius-Kreis) */}
            {mode !== 'saved' && (
              <ReachLayer center={activeCenter} travel={travel} radiusKm={radiusKm} />
            )}
            {activeCenter && mode === 'saved' && (
              <Marker position={[activeCenter.lat, activeCenter.lng]} icon={userMarker} />
            )}
            {/* Echter Nutzer-Standort (nur wenn Suchadresse aktiv ist) */}
            {centerOverride && userCoords && (
              <Marker position={[userCoords.lat, userCoords.lng]} icon={userMarker} />
            )}

            {/* Orte */}
            {shownPlaces.map((p, i) => p.lat != null && p.lng != null && (
              <Marker key={p.id} position={[p.lat!, p.lng!]} icon={makeNumberMarker(i + 1)}>
                <Popup>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#666' }}>{p.region}</div>
                  {activeCenter && (
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {p.distKm < 1 ? `${(p.distKm * 1000).toFixed(0)} m` : `${p.distKm.toFixed(1)} km`} entfernt
                    </div>
                  )}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* ── Sortierung ─────────────────────────────────────────────────────── */}
      {mode !== 'saved' && (
        <div className="flex gap-2 mb-4">
          {[
            { key: 'dist', icon: 'fa-location-crosshairs', label: 'Nach Entfernung' },
            { key: 'az',   icon: 'fa-arrow-down-a-z',      label: 'A–Z'            },
          ].map(({ key, icon, label }) => (
            <button key={key}
              onClick={() => setSortOrder(s => s === key ? null : key as 'dist' | 'az')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all border ${sortOrder === key ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]' : 'bg-white text-[var(--color-lavender)] border-[var(--color-bg-soft)] hover:border-[var(--color-aubergine)] hover:text-[var(--color-aubergine)]'}`}>
              <i className={`fa-solid ${icon}`} />{label}
            </button>
          ))}
        </div>
      )}

      {/* ── Place Cards ────────────────────────────────────────────────────── */}
      {shownPlaces.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {shownPlaces.slice(0, 5).map(p => (
            <PlaceCard key={p.id} place={p} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-[var(--color-lavender)] text-sm">
          <i className="fa-solid fa-map-pin mb-2 text-2xl block opacity-30" />
          {mode === 'saved'
            ? 'Du hast noch keine Orte gemerkt.'
            : travel.mode !== 'radius'
              ? 'Keine Orte in dieser Reichweite — erhöhe die Reisezeit.'
              : 'Keine Orte in diesem Radius — vergrößere den Schieberegler.'}
        </div>
      )}
    </div>
  );
}

// ─── Desktop Split-Hero ───────────────────────────────────────────────────────
function DesktopHero({ places, cityLabel, onCta }: { places: Place[]; cityLabel: string | null; onCta: () => void }) {
  const navigate = useNavigate();
  const [activeIdx, setActiveIdx] = useState(0);
  const [entering, setEntering] = useState(false);   // blendet die obere (neue) Ebene ein
  const idxRef = useRef(0);                            // aktueller Index ohne Stale-Closure
  const prevIdxRef = useRef(0);                        // vorheriges Bild bleibt darunter voll sichtbar
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const n = Math.min(places.length, 6);

  // Wechsel ohne dunklen Zwischenblitz: neues Bild vorladen, darunter bleibt das alte,
  // das neue blendet on-top von 0→1. So wird nie der Hintergrund sichtbar.
  const goTo = (next: number) => {
    if (next === idxRef.current) return;
    prevIdxRef.current = idxRef.current;
    idxRef.current = next;
    const img = new Image(); img.src = places[next]?.hero ?? '';   // vorladen
    setActiveIdx(next);
    setEntering(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setEntering(false)));
  };

  useEffect(() => {
    if (places.length < 2) return;
    timerRef.current = setInterval(() => goTo((idxRef.current + 1) % n), 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [places.length, n]); // eslint-disable-line

  const place = places[activeIdx];
  const prevPlace = places[prevIdxRef.current];
  if (!place) return null;

  return (
    <div className="hidden md:flex h-[460px] rounded-3xl overflow-hidden mb-10 shadow-[var(--shadow-raised)]">
      {/* Links: Orts-Bild — klickbar → Place-Detail */}
      <div
        className="relative flex-1 overflow-hidden bg-[var(--color-aubergine)] cursor-pointer group"
        onClick={() => navigate(`/ort/${place.id}`)}
      >
        {/* Untere Ebene: vorheriges Bild bleibt voll sichtbar, bis das neue eingeblendet ist */}
        {prevPlace && prevPlace.id !== place.id && (
          <img key={`prev-${prevPlace.id}`} src={prevPlace.hero} alt=""
            className="absolute inset-0 w-full h-full object-cover" />
        )}
        {/* Obere Ebene: aktuelles Bild, blendet von 0→1 über dem vorherigen ein (kein Schwarz dazwischen) */}
        <img
          key={place.id}
          src={place.hero}
          alt={place.name}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02]"
          style={{ opacity: entering ? 0 : 1, transition: 'opacity .7s ease, transform .4s ease' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="absolute top-4 left-4">
          <TagBadge slug={place.tagSlug} fallback={place.categoryLabel} icon variant="dark" className="backdrop-blur-sm text-[11px] px-2.5 py-1" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <p className="text-white/60 text-xs font-medium mb-1 flex items-center gap-1.5">
            <i className="fa-solid fa-location-dot text-[var(--color-amber)]" />
            {place.region}
          </p>
          <h3 className="font-display font-bold text-white text-2xl leading-tight mb-1" style={{ letterSpacing: '-0.01em' }}>
            {place.name}
          </h3>
          <p className="text-white/60 text-xs mb-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <i className="fa-solid fa-arrow-right text-[var(--color-amber)]" /> Ort ansehen
          </p>
          <div className="flex gap-1.5">
            {places.slice(0, 6).map((_, i) => (
              <button
                key={i}
                onClick={() => { goTo(i); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === activeIdx ? 'w-6 bg-[var(--color-amber)]' : 'w-1.5 bg-white/40 hover:bg-white/70'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Rechts: Aubergine-Panel */}
      <div className="w-[400px] flex-shrink-0 bg-[var(--color-aubergine)] flex flex-col justify-center px-10 py-10">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-2 h-2 rounded-full bg-[var(--color-amber)] animate-pulse" />
          <span className="text-white/50 text-xs font-medium uppercase tracking-wider">
            Jetzt {cityLabel ?? 'Orte'} entdecken
          </span>
        </div>
        <h2
          className="font-display font-bold text-white leading-tight mb-4"
          style={{ fontSize: 'clamp(1.75rem, 2.5vw, 2.5rem)', letterSpacing: '-0.02em' }}
        >
          Geheime Orte<br />
          <em className="italic text-[var(--color-amber)]">direkt vor</em><br />
          deiner Haustür.
        </h2>
        <p className="text-white/50 text-sm leading-relaxed mb-8">
          Lass uns deinen perfekten Geheimtipp finden —
          zugeschnitten auf dein Budget, deine Zeit und deinen Vibe.
        </p>
        <button
          onClick={onCta}
          className="flex items-center justify-center gap-3 bg-[var(--color-amber)] text-white font-bold text-base px-7 py-4 rounded-2xl shadow-[var(--shadow-amber)] hover:brightness-110 active:scale-[0.98] transition-all"
        >
          <i className="fa-solid fa-compass text-lg" />
          Geheimtipp finden
          <i className="fa-solid fa-arrow-right opacity-70" />
        </button>
        <p className="text-white/40 text-xs mt-4 text-center">Lass uns finden, wonach du suchst.</p>
      </div>
    </div>
  );
}

// ─── Geheimtrips Awards ───────────────────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear();
// Jahres-Array wächst automatisch (Backend muss rating.year mitschicken)
const AWARD_YEARS = Array.from({ length: Math.max(1, CURRENT_YEAR - 2025) }, (_, i) => CURRENT_YEAR - i);

// Podium-Slots: Reihenfolge links→rechts = 2. | 1. | 3. (klassische Anordnung)
const PODIUM_SLOTS = [
  { srcIdx: 1, rank: 2, platformH: 58, delay: 150 },
  { srcIdx: 0, rank: 1, platformH: 76, delay: 300 },
  { srcIdx: 2, rank: 3, platformH: 44, delay: 0   },
] as const;

export function SpotlightCard({ places, onNavigate }: { places: Place[]; onNavigate: (path: string) => void }) {
  const vocab = useTaxVocab();
  const [activeGroup, setActiveGroup] = useState<string | null>(null); // null = Alle
  const [activeYear, setActiveYear] = useState(CURRENT_YEAR);
  const [listCount, setListCount] = useState(3);

  // Chips: „Alle" + die 4 Gruppen (aus dem Vokabular)
  const chips = useMemo(() => [
    { slug: null as string | null, label: 'Alle', icon: 'fa-star' },
    ...(vocab?.groups ?? []).map(g => ({ slug: g.slug as string | null, label: shortGroupLabel(g.label), icon: g.icon })),
  ], [vocab]);
  const tagGroup = useMemo(() => new Map((vocab?.tags ?? []).map(t => [t.slug, t.groups])), [vocab]);

  // Scroll-Trigger: Podest fährt aus, wenn Section sichtbar wird
  const podiumRef = useRef<HTMLDivElement>(null);
  const [podiumReady, setPodiumReady] = useState(false);
  useEffect(() => {
    const el = podiumRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setPodiumReady(true); io.disconnect(); } },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const sorted = useMemo(() => {
    // TODO backend: wenn place.ratings nach Jahr gefiltert werden können,
    // hier activeYear übergeben → GET /places/awards?year=activeYear&group=activeGroup
    const inGroup = (p: Place) => !activeGroup || (!!p.tagSlug && (tagGroup.get(p.tagSlug)?.includes(activeGroup) ?? false));
    return places.filter(inGroup).sort((a, b) => b.rating - a.rating);
  }, [places, activeGroup, activeYear, tagGroup]);

  const top3 = sorted.slice(0, 3);
  const restAll = sorted.slice(3);
  const restVisible = restAll.slice(0, listCount);

  return (
    <div className="bg-white rounded-3xl shadow-[var(--shadow-card)] overflow-hidden flex flex-col">

      {/* ── Header: heller Amber-Ton statt dunklem Lila ── */}
      <div className="px-5 pt-5 pb-4" style={{ background: 'rgba(249,144,57,0.07)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(249,144,57,0.18)' }}>
              <i className="fa-solid fa-medal text-[var(--color-amber)] text-lg" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-amber)]">Nur verifizierte Besucher können bewerten</p>
              <h3 className="font-display font-bold text-[var(--color-aubergine)] text-base leading-tight">Geheimtrips Awards</h3>
            </div>
          </div>
          {/* Jahres-Dropdown */}
          <select
            value={activeYear}
            onChange={e => { setActiveYear(Number(e.target.value)); setListCount(3); }}
            className="flex-shrink-0 text-xs font-bold text-[var(--color-aubergine)] bg-white border border-[var(--color-bg-soft)] rounded-xl px-2.5 py-1.5 cursor-pointer outline-none hover:border-[var(--color-amber)] focus:border-[var(--color-amber)] transition-colors"
          >
            {AWARD_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {/* Kategorie-Chips — auf hellem Hintergrund */}
        <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {chips.map(chip => (
            <button key={chip.label} onClick={() => { setActiveGroup(chip.slug); setListCount(3); }}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${activeGroup === chip.slug ? 'bg-[var(--color-amber)] text-white border-[var(--color-amber)]' : 'text-[var(--color-lavender)] border-[var(--color-bg-soft)] hover:border-[var(--color-amber)] hover:text-[var(--color-amber)]'}`}>
              <i className={`fa-solid ${chip.icon} text-[9px]`} />{chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Podium: oben bündig, Podest fährt beim Scrollen aus ── */}
      <div ref={podiumRef} className="px-4 pt-4 pb-0">
        {top3.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-[var(--color-lavender)] text-sm">
            Keine Orte in dieser Kategorie
          </div>
        ) : (
          <div className="flex gap-2">
            {PODIUM_SLOTS.map(({ srcIdx, rank, platformH, delay }) => {
              const p = top3[srcIdx];
              if (!p) return <div key={rank} className="flex-1" />;
              return (
                <div key={p.id} className="flex-1 flex flex-col cursor-pointer group"
                  onClick={() => onNavigate(`/ort/${p.id}`)}>

                  {/* Label-Bereich: feste Höhe → alle Bilder starten auf gleicher Linie */}
                  <div className="flex flex-col items-center justify-end mb-1.5 px-1" style={{ height: '2.75rem' }}>
                    <p className="text-[10px] font-bold text-[var(--color-aubergine)] line-clamp-2 leading-tight text-center">{p.name}</p>
                    <div className="flex items-center justify-center gap-0.5 mt-0.5">
                      <i className="fa-solid fa-star text-[var(--color-amber)] text-[8px]" />
                      <span className="text-[9px] text-[var(--color-lavender)] font-semibold">{p.rating}</span>
                    </div>
                  </div>

                  {/* Bild (quadratisch) + Podest als Overlay unten:
                      Container ist immer gleich groß → oben UND unten bündig */}
                  <div className="relative w-full aspect-square overflow-hidden rounded-xl">
                    <img src={p.hero} alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />

                    {/* Podest steigt von unten auf — height 0→platformH, Container fix */}
                    <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-center overflow-hidden"
                      style={{
                        height: podiumReady ? `${platformH}px` : '0px',
                        background: 'linear-gradient(to bottom, rgba(249,144,57,0.88) 0%, #F99039 30%)',
                        transition: 'height 0.6s cubic-bezier(0.34, 1.3, 0.64, 1)',
                        transitionDelay: `${delay}ms`,
                      }}>
                      <span className="text-white font-display font-black leading-none select-none"
                        style={{
                          fontSize: rank === 1 ? '1.5rem' : '1.15rem',
                          opacity: podiumReady ? 1 : 0,
                          transition: 'opacity 0.2s',
                          transitionDelay: `${delay + 380}ms`,
                        }}>
                        {rank}.
                      </span>
                      <span className="text-white/80 font-bold uppercase tracking-widest leading-none select-none"
                        style={{
                          fontSize: '7px',
                          opacity: podiumReady ? 1 : 0,
                          transition: 'opacity 0.2s',
                          transitionDelay: `${delay + 420}ms`,
                        }}>
                        Platz
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Erweiterbare Liste ab Platz 4 ── */}
      {restAll.length > 0 && (
        <div className="border-t border-[var(--color-bg-soft)] px-4 pt-3 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-1">Weitere Top-Orte</p>
          <div className="space-y-0.5">
            {restVisible.map((p, i) => (
              <div key={p.id} onClick={() => onNavigate(`/ort/${p.id}`)}
                className="flex items-center gap-2.5 py-1.5 rounded-xl hover:bg-[var(--color-bg-soft)] -mx-2 px-2 cursor-pointer transition-colors group">
                <span className="w-6 text-center text-[11px] font-black flex-shrink-0 text-[var(--color-lavender)]">
                  {i + 4}.
                </span>
                <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--color-bg-soft)]">
                  <img src={p.hero} alt={p.name} className="w-full h-full object-cover" />
                </div>
                <span className="flex-1 text-xs font-semibold text-[var(--color-aubergine)] truncate group-hover:text-[var(--color-amber)] transition-colors">{p.name}</span>
                <span className="text-[10px] text-[var(--color-lavender)] flex-shrink-0">
                  <i className="fa-solid fa-star text-[var(--color-amber)] mr-0.5 text-[8px]" />{p.rating}
                </span>
              </div>
            ))}
          </div>
          {restAll.length > listCount && (
            <button onClick={() => setListCount(c => c + 3)}
              className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--color-amber)] hover:text-[var(--color-aubergine)] py-1.5 transition-colors">
              <i className="fa-solid fa-chevron-down text-[10px]" /> Mehr Orte
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ranking-Vorschau ─────────────────────────────────────────────────────────
type RankBoard = 'orte' | 'published' | 'quiz';

export function RankingCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [board, setBoard] = useState<RankBoard>('orte');
  const [entriesOrte, setEntriesOrte] = useState<RankingEntry[]>([]);
  const [entriesEingereicht, setEntriesEingereicht] = useState<RankingEntry[]>([]);
  const [quizEntries, setQuizEntries] = useState<{ userId: number; name: string; avatarUrl: string | null; gamesPlayed: number; gamesWon: number; winRate: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import('../services/api.js').then(({ rankingsApi }) =>
      Promise.all([
        rankingsApi.leaderboard('orte').then(setEntriesOrte),
        rankingsApi.leaderboard('eingereicht').then(setEntriesEingereicht).catch(() => {}),
        rankingsApi.quizLeaderboard().then(setQuizEntries).catch(() => {}),
      ]).finally(() => setLoading(false))
    );
  }, []);

  const RANK_COLORS = ['#F99039', '#8A6FB3', '#C4A882'];
  const entries: RankingEntry[] =
    board === 'quiz'
      ? quizEntries.map(q => ({
          id: q.userId, name: q.name, handle: '', avatarUrl: q.avatarUrl,
          orte: 0, eingereicht: 0, reviewed: 0, quizWins: q.gamesWon, quizPlayed: q.gamesPlayed, winRate: q.winRate, punkte: 0,
          mOrte: 0, mEingereicht: 0, mReviewed: 0, mQuizWins: 0, mScore: 0, percentile: 1, tierKey: 'rookie', isLocalHero: false,
        }))
      : board === 'published' ? entriesEingereicht
      : entriesOrte;

  return (
    <div className="bg-white rounded-3xl shadow-[var(--shadow-card)] overflow-hidden flex flex-col">

      {/* ── Header + Tabs ── */}
      <div className="px-5 pt-5 pb-0" style={{ background: '#34254c' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(249,144,57,0.2)' }}>
            <i className="fa-solid fa-chart-simple text-[var(--color-amber)] text-lg" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-amber)]">Wer war überall?</p>
            <h3 className="font-display font-bold text-white text-base leading-tight">TripCounting</h3>
          </div>
        </div>
        {/* Board-Tabs direkt im Header */}
        <div className="flex">
          {(['orte', 'published', 'quiz'] as RankBoard[]).map(b => (
            <button key={b} onClick={() => setBoard(b)}
              className={`flex-1 text-[11px] font-semibold py-2.5 border-b-2 transition-colors ${board === b ? 'text-[var(--color-amber)] border-[var(--color-amber)]' : 'text-white/45 border-transparent hover:text-white/70'}`}>
              {b === 'orte' ? 'Besuchte Orte' : b === 'published' ? 'Eingereicht | Reviewed' : 'Geheimquiz'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Leaderboard ── */}
      <div className="flex-1 px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <i className="fa-solid fa-circle-notch fa-spin text-[var(--color-lavender)]" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-6 text-[var(--color-lavender)] text-sm">Noch keine Daten vorhanden.</div>
        ) : (
          entries.slice(0, 5).map((e, i) => (
            <div key={e.id} onClick={() => onNavigate(`/u/${e.id}`)}
              className="flex items-center gap-2.5 py-2 border-b border-[var(--color-bg-soft)] last:border-0 cursor-pointer hover:bg-[var(--color-bg-soft)] -mx-2 px-2 rounded-xl transition-colors">
              <span className="text-sm font-black w-5 text-center flex-shrink-0"
                style={{ color: RANK_COLORS[i] ?? 'var(--color-lavender)' }}>
                #{i + 1}
              </span>
              <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--color-bg-soft)] flex-shrink-0 flex items-center justify-center text-xs font-bold text-[var(--color-lavender)]">
                {e.avatarUrl
                  ? <img src={e.avatarUrl} alt={e.name} className="w-full h-full object-cover" />
                  : e.name[0]}
              </div>
              <span className="flex-1 text-xs font-semibold text-[var(--color-aubergine)] truncate">{e.name}</span>
              <span className="text-[10px] font-bold text-[var(--color-amber)] flex-shrink-0">
                {board === 'quiz' ? `${e.quizWins} Siege · ${e.winRate} %`
                  : board === 'published' ? `${e.eingereicht} eingereicht · ${e.reviewed} reviewed`
                  : `${e.orte} Orte`}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Punkte-Übersicht: wofür es wie viele Punkte gibt */}
      <div className="px-5 pb-3">
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--color-bg-soft)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2">So sammelst du Punkte</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-[var(--color-aubergine)]">
            {[
              { i: 'fa-flag-checkered', t: 'Ort besucht', p: 10 },
              { i: 'fa-feather-pointed', t: 'Ort eingereicht', p: 20 },
              { i: 'fa-clipboard-check', t: 'Ort reviewt', p: 12 },
              { i: 'fa-earth-europe', t: 'Quiz-Sieg', p: 15 },
            ].map(x => (
              <div key={x.t} className="flex items-center gap-1.5">
                <i className={`fa-solid ${x.i} text-[var(--color-amber)] text-[11px] w-4 text-center`} />
                <span className="flex-1">{x.t}</span>
                <span className="font-bold text-[var(--color-amber)]">+{x.p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        <button onClick={() => onNavigate('/ranking')}
          className="w-full flex items-center justify-center gap-2 bg-[var(--color-aubergine)] text-white text-xs font-bold py-2.5 rounded-xl hover:brightness-110 active:scale-95 transition-all">
          <i className="fa-solid fa-chart-simple" /> Vollständiges Ranking
        </button>
      </div>
    </div>
  );
}

// ─── Meet People / Blog ───────────────────────────────────────────────────────
function MeetPeopleCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="relative bg-[var(--color-aubergine)] rounded-3xl overflow-hidden">
      {/* Deko */}
      <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full opacity-[0.06]"
        style={{ background: 'radial-gradient(circle, #F99039, transparent)' }} />
      <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full opacity-[0.06]"
        style={{ background: 'radial-gradient(circle, #b9a8c4, transparent)' }} />

      <div className="relative flex flex-col md:flex-row items-center gap-8 px-7 py-8 md:py-10">
        {/* Avatare + Icon */}
        <div className="flex-shrink-0 flex flex-col items-center gap-3">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(249,144,57,0.15)' }}>
              <i className="fa-solid fa-people-group text-[var(--color-amber)] text-3xl" />
            </div>
          </div>
          <div className="flex -space-x-2">
            {['L','M','S','T','J'].map((initial, i) => (
              <div key={initial} className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ background: ['#71587a','#F99039','#34254c','#8A6FB3','#b9a8c4'][i], borderColor: '#34254c' }}>
                {initial}
              </div>
            ))}
            <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white/60 flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.1)', borderColor: '#34254c' }}>
              +∞
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="flex-1 text-center md:text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-amber)] mb-2">Mitreisende & Blog</p>
          <h3 className="font-display font-bold text-white leading-tight mb-2"
            style={{ fontSize: 'clamp(1.2rem, 2.5vw, 1.75rem)', letterSpacing: '-0.01em' }}>
            <em className="italic" style={{ color: '#b9a8c4' }}>Neue Leute</em> kennenlernen,<br />
            die gerne die Welt entdecken.
          </h3>
          <p className="text-white/50 text-sm leading-relaxed max-w-lg">
            Finde Reisepartner mit denselben Interessen, lese Berichte von echten Entdecker:innen
            und vernetze dich mit Menschen, die Geheimtipps genauso lieben wie du.
          </p>
        </div>

        {/* CTA */}
        <div className="flex-shrink-0 flex flex-col gap-3 items-center md:items-end">
          <button onClick={() => onNavigate('/finder')}
            className="flex items-center gap-2 bg-[var(--color-amber)] text-white font-bold px-6 py-3.5 rounded-2xl shadow-[var(--shadow-amber)] hover:brightness-110 active:scale-95 transition-all text-sm whitespace-nowrap">
            <i className="fa-solid fa-compass" />
            Jetzt Orte &amp; Leute finden
            <i className="fa-solid fa-arrow-right opacity-70" />
          </button>
          <p className="text-white/30 text-[11px]">kostenlos · kein Account nötig</p>
        </div>
      </div>
    </div>
  );
}

const MOODS = [
  { label: 'Spontan jetzt',   icon: 'fa-bolt'      },
  { label: 'Wochenende',      icon: 'fa-calendar'  },
  { label: 'Mit Freunden',    icon: 'fa-users'      },
  { label: 'Naturauszeit',    icon: 'fa-leaf'       },
  { label: 'Stadtentflucht',  icon: 'fa-city'       },
];

// ─── Trip-Marker (Aubergine, nummeriert) ──────────────────────────────────────
const makeTripMarker = (n: number) => L.divIcon({
  html: `<div style="width:30px;height:30px;border-radius:50%;background:#34254c;color:white;font-weight:700;font-size:11px;display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3)">${n}</div>`,
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -17],
});

/** Durchschnittlicher Mittelpunkt aller Orte eines Trips */
function tripCentroid(trip: Trip): [number, number] | null {
  const pts = trip.places.filter(tp => tp.place.lat != null && tp.place.lng != null);
  if (!pts.length) return null;
  return [
    pts.reduce((s, tp) => s + tp.place.lat!, 0) / pts.length,
    pts.reduce((s, tp) => s + tp.place.lng!, 0) / pts.length,
  ];
}

// ─── Karte für Trips ──────────────────────────────────────────────────────────
function TripMapSection({ trips, userCoords, centerOverride, radiusKm, travel, showReach }: {
  trips: Trip[];
  userCoords: Coords | null;
  centerOverride?: Coords | null;
  radiusKm: number;
  travel: TravelState;
  showReach: boolean;
}) {
  const [tileStyle, setTileStyle] = useState<TileStyle>('map');
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const activeCenter = centerOverride ?? userCoords;
  useEffect(() => { setMapReady(true); }, []);

  const tripPoints = useMemo(() =>
    trips.map((trip, i) => ({ trip, idx: i + 1, centroid: tripCentroid(trip) }))
         .filter(t => t.centroid !== null) as { trip: Trip; idx: number; centroid: [number, number] }[],
    [trips]
  );

  const fitPoints = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = tripPoints.map(t => t.centroid);
    if (activeCenter) {
      pts.push([activeCenter.lat, activeCenter.lng]);
      if (showReach) pts.push(...reachBBoxPoints(activeCenter, travel, radiusKm));
    }
    return pts;
  }, [tripPoints, activeCenter, showReach, travel, radiusKm]);

  const defaultCenter: [number, number] = activeCenter
    ? [activeCenter.lat, activeCenter.lng]
    : [51.1657, 10.4515];

  return (
    <div className="relative rounded-2xl overflow-hidden mb-5 border border-[var(--color-bg-soft)] h-[320px] md:h-[400px]">
      {/* Kompass-Overlay während längerer Reichweiten-Berechnung */}
      <MapComputeOverlay loading={travel.loading}
        transitLike={travel.mode === 'train' || travel.mode === 'transit'} />

      {/* Zoom-Buttons unten links */}
      <div className="absolute bottom-4 left-3 z-[1000] flex flex-col gap-0.5">
        <button onClick={() => mapRef.current?.zoomIn()}
          className="w-8 h-8 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-t-lg shadow-sm text-lg font-bold text-[var(--color-aubergine)] hover:bg-white transition-colors leading-none">+</button>
        <button onClick={() => mapRef.current?.zoomOut()}
          className="w-8 h-8 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-b-lg shadow-sm text-lg font-bold text-[var(--color-aubergine)] hover:bg-white transition-colors leading-none">−</button>
      </div>

      {/* Karte / Satellit Toggle */}
      <div className="absolute top-3 right-3 z-[999] flex gap-1 bg-white/90 backdrop-blur-sm rounded-xl p-1 shadow-sm">
        <button onClick={() => setTileStyle('map')}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${tileStyle === 'map' ? 'bg-[var(--color-aubergine)] text-white' : 'text-[var(--color-lavender)]'}`}>
          <i className="fa-solid fa-map" /> Karte
        </button>
        <button onClick={() => setTileStyle('satellite')}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${tileStyle === 'satellite' ? 'bg-[var(--color-aubergine)] text-white' : 'text-[var(--color-lavender)]'}`}>
          <i className="fa-solid fa-satellite" /> Satellit
        </button>
      </div>

      {!mapReady ? (
        <div className="w-full h-full flex items-center justify-center bg-[var(--color-bg-soft)]">
          <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[var(--color-lavender)]" />
        </div>
      ) : (
        <MapContainer center={defaultCenter} zoom={6} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={false}>
          <MapCapture r={mapRef} />
          <TileLayer key={tileStyle} url={TILES[tileStyle].url} attribution={TILES[tileStyle].attribution} />
          <FitBoundsHelper points={fitPoints} />

          {/* Reichweite (Isochrone oder Radius-Kreis) + Zentrum */}
          {showReach ? (
            <ReachLayer center={activeCenter} travel={travel} radiusKm={radiusKm} />
          ) : activeCenter && (
            <Marker position={[activeCenter.lat, activeCenter.lng]} icon={userMarker} />
          )}
          {/* Echter Nutzer-Standort wenn Suchadresse aktiv */}
          {centerOverride && userCoords && (
            <Marker position={[userCoords.lat, userCoords.lng]} icon={userMarker} />
          )}

          {/* Nutzer-Standort (kein centerOverride) */}
          {!centerOverride && !activeCenter && userCoords && (
            <Marker position={[userCoords.lat, userCoords.lng]} icon={userMarker} />
          )}

          {/* Trip-Pins */}
          {tripPoints.map(({ trip, idx, centroid }) => {
            const regions = [...new Set(trip.places.map(tp => tp.place.region).filter(Boolean))];
            const days = trip.places.length > 0 ? Math.max(...trip.places.map(p => p.dayIndex)) + 1 : 1;
            return (
              <Marker key={trip.id} position={centroid} icon={makeTripMarker(idx)}>
                <Popup>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{trip.title}</div>
                  {regions.length > 0 && (
                    <div style={{ fontSize: 11, color: '#71587a', marginBottom: 2 }}>
                      <span style={{ fontSize: 10 }}>📍</span> {regions.slice(0, 2).join(' · ')}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {days} {days === 1 ? 'Tag' : 'Tage'} · {trip.places.length} Orte
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      )}
    </div>
  );
}

// ─── Trips-Sektion ────────────────────────────────────────────────────────────
// TRIP_TAGS is defined after SEARCH_TAGS further below (reuses same list)

type TripViewMode = 'newest' | 'all' | 'top5' | 'saved';

function TripsSection({ trips, tripsLoaded, userCoords, onCreateTrip, viewMode }: {
  trips: Trip[];
  tripsLoaded: boolean;
  userCoords: Coords | null;
  onCreateTrip: () => void;
  viewMode: TripViewMode;
}) {
  const navigate = useNavigate();
  const { savedIds } = useAppStore();
  const [sortOrder, setSortOrder] = useState<'dist' | 'az' | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);

  // Reset pagination + sort on filter/mode change
  useEffect(() => { setVisibleCount(5); setSortOrder(null); }, [viewMode, trips.length]);

  const sorted = useMemo(() => {
    let base = [...trips];

    // Modus-Filter
    if (viewMode === 'saved') {
      base = base.filter(t => t.places.some(tp => savedIds.has(tp.placeId)));
    } else if (viewMode === 'top5') {
      base = base
        .map(t => ({
          t,
          score: t.places.length
            ? t.places.reduce((s, tp) => s + (tp.place.match ?? 0), 0) / t.places.length
            : 0,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(x => x.t);
    } else if (viewMode === 'newest') {
      base = base.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    // 'all' → keine Basis-Sortierung, Sort-Override greift unten

    // Sort-Override (unabhängig vom Modus)
    if (sortOrder === 'az') {
      return base.slice().sort((a, b) => a.title.localeCompare(b.title, 'de'));
    }
    if (sortOrder === 'dist' && userCoords) {
      return base.slice().sort((a, b) => {
        const ca = tripCentroid(a), cb = tripCentroid(b);
        const da = ca ? distanceKm(userCoords, { lat: ca[0], lng: ca[1] }) : Infinity;
        const db = cb ? distanceKm(userCoords, { lat: cb[0], lng: cb[1] }) : Infinity;
        return da - db;
      });
    }
    return base;
  }, [trips, viewMode, sortOrder, userCoords, savedIds]);

  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  return (
    <div>
      {/* ── Sortierung ────────────────────────────────────── */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {userCoords && (
          <button
            onClick={() => setSortOrder(s => s === 'dist' ? null : 'dist')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all border ${sortOrder === 'dist' ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]' : 'bg-white text-[var(--color-lavender)] border-[var(--color-bg-soft)] hover:border-[var(--color-aubergine)] hover:text-[var(--color-aubergine)]'}`}>
            <i className="fa-solid fa-location-crosshairs" /> Nach Entfernung
          </button>
        )}
        <button
          onClick={() => setSortOrder(s => s === 'az' ? null : 'az')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all border ${sortOrder === 'az' ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]' : 'bg-white text-[var(--color-lavender)] border-[var(--color-bg-soft)] hover:border-[var(--color-aubergine)] hover:text-[var(--color-aubergine)]'}`}>
          <i className="fa-solid fa-arrow-down-a-z" /> A–Z
        </button>
      </div>

      {/* ── Trip-Karten ────────────────────────────────────── */}
      {!tripsLoaded ? (
        <div className="flex justify-center py-12">
          <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[var(--color-lavender)]" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-10 text-[var(--color-lavender)]">
          <i className="fa-solid fa-route text-4xl block opacity-20 mb-3" />
          <p className="text-sm">{viewMode === 'saved' ? 'Noch keine gemerkten Trips.' : 'Keine Trips gefunden.'}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {visible.map(trip => {
              const heroImg = trip.hero ?? trip.places[0]?.place.hero ?? null;
              const days = trip.places.length > 0 ? Math.max(...trip.places.map(p => p.dayIndex)) + 1 : 1;
              const centroid = tripCentroid(trip);
              const distKm = (centroid && userCoords)
                ? distanceKm(userCoords, { lat: centroid[0], lng: centroid[1] })
                : null;
              return (
                <div key={trip.id} onClick={() => navigate(`/trips/${trip.id}`)}
                  className="bg-white rounded-[var(--radius-card)] shadow-[var(--shadow-card)] overflow-hidden cursor-pointer hover:shadow-[var(--shadow-raised)] transition-shadow">
                  <div className="relative aspect-[16/9] overflow-hidden bg-[var(--color-bg-soft)]">
                    {heroImg
                      ? <img src={heroImg} alt={trip.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><i className="fa-solid fa-route text-3xl text-[var(--color-lavender-lt)]" /></div>
                    }
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-2 left-2 flex gap-1.5">
                      <span className="bg-[var(--color-amber)] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {days} {days === 1 ? 'Tag' : 'Tage'}
                      </span>
                      <span className="bg-black/40 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
                        {trip.places.length} Orte
                      </span>
                    </div>
                    {distKm !== null && (
                      <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        {distKm < 1 ? `${(distKm * 1000).toFixed(0)} m` : `${distKm.toFixed(0)} km`}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-display font-bold text-[var(--color-aubergine)] text-sm leading-tight mb-0.5">{trip.title}</div>
                    {trip.subtitle && <div className="text-xs text-[var(--color-lavender)] line-clamp-1">{trip.subtitle}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mehr laden */}
          {hasMore && (
            <button
              onClick={() => setVisibleCount(c => c + 5)}
              className="w-full py-3 rounded-2xl border border-[var(--color-bg-soft)] text-xs font-semibold text-[var(--color-lavender)] hover:border-[var(--color-aubergine)] hover:text-[var(--color-aubergine)] transition-all mb-4 flex items-center justify-center gap-2">
              <i className="fa-solid fa-chevron-down" />
              {Math.min(5, sorted.length - visibleCount)} weitere Trips laden
            </button>
          )}
        </>
      )}

      {/* Eigenen Trip erstellen CTA */}
      <div className="flex items-center gap-4 bg-[var(--color-bg-soft)] rounded-2xl px-5 py-4">
        <div className="w-10 h-10 rounded-xl bg-[var(--color-aubergine)]/10 flex items-center justify-center flex-shrink-0">
          <i className="fa-solid fa-wand-magic-sparkles text-[var(--color-aubergine)]" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-[var(--color-aubergine)]">Deinen eigenen Trip gestalten</div>
          <div className="text-xs text-[var(--color-lavender)]">Kombiniere Geheimtipps zu deiner persönlichen Route</div>
        </div>
        <button onClick={onCreateTrip}
          className="flex-shrink-0 flex items-center gap-1.5 bg-[var(--color-aubergine)] text-white text-xs font-bold px-4 py-2 rounded-xl hover:brightness-110 active:scale-95 transition-all">
          <i className="fa-solid fa-plus" /> Erstellen
        </button>
      </div>
    </div>
  );
}


// ─── Seite ────────────────────────────────────────────────────────────────────
export function DiscoverPage() {
  const navigate = useNavigate();
  const { user }  = useAuthStore();
  const { places, placesLoaded, loadPlaces, visitedIds } = useAppStore();
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [cityLabel, setCityLabel]   = useState<string | null>(null);
  const [searchQuery, setSearchQuery]         = useState('');
  // Typ-Filter (Gruppe + Tag) — neues Taxonomie-Modell
  const vocab = useTaxVocab();
  const [tagSel, setTagSel] = useState<TagSelection>(EMPTY_TAG_SEL);
  const tagActive = tagSel.group !== null || tagSel.tag !== null;
  const [mainMode, setMainMode]               = useState<'places' | 'trips'>('places');
  const [placeMode, setPlaceMode]             = useState<MapMode>('newest');
  const [tripMode,  setTripMode]              = useState<TripViewMode>('newest');
  const [radiusKm,  setRadiusKm]             = useState(80);
  const [searchCenter, setSearchCenter]       = useState<Coords | null>(null);
  const [searchCenterLabel, setSearchCenterLabel] = useState<string | null>(null);
  const [geoSuggestions, setGeoSuggestions]   = useState<GeoLocation[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const geoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { tripsLoaded, loadTrips } = useAppStore();
  // Kuratierte Trips kommen vom eigenen Endpoint — sie gehören der Redaktion,
  // nicht dem eingeloggten User, und stecken daher nicht im Trips-Store
  const [curatedTrips, setCuratedTrips] = useState<Trip[]>([]);

  useEffect(() => {
    loadPlaces();
    tripsApi.curated().then(setCuratedTrips).catch(() => {});
  }, []); // eslint-disable-line

  // Reichweiten-State + Isochronen-Laden (geteilt mit der Sammlung)
  const activeCenter = searchCenter ?? userCoords;
  const { travelMode, setTravelMode, travelMinutes, setTravelMinutes, iso, isoLoading } =
    useTravelReach(activeCenter);
  const travel: TravelState = { mode: travelMode, minutes: travelMinutes, iso, loading: isoLoading };

  // Standort: GPS → Reverse Geocode, sonst IP
  useEffect(() => {
    (async () => {
      try {
        const coords = await requestGpsPosition();
        setUserCoords(coords);
        const geo = await reverseGeocode(coords);
        setCityLabel(geo.displayName);
      } catch {
        const ip = await getLocationByIp();
        if (ip) {
          setUserCoords({ lat: ip.lat, lng: ip.lng });
          if (ip.city) setCityLabel(ip.city);
        }
      }
    })();
  }, []);

  const tippDesTages = places.find(p => !visitedIds.has(p.id)) ?? places[0];
  const nearbyPlaces = places.filter(p => p.distanceMin <= 60 && !visitedIds.has(p.id)).slice(0, 6);
  const heroPlaces   = nearbyPlaces.length >= 3 ? nearbyPlaces : places.slice(0, 6);

  // Gefilterte Orte für Suche + Kartenansicht
  const filteredPlaces = useMemo(() => {
    if (!searchQuery && !tagActive) return places;
    return places.filter(p => {
      if (tagActive && !placeMatchesTag(p, tagSel, vocab)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.region.toLowerCase().includes(q) && !p.vibe.some(v => v.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [places, searchQuery, tagSel, tagActive, vocab]);

  const filteredTrips = useMemo(() => {
    const curated = curatedTrips;
    if (!searchQuery && !tagActive) return curated;
    return curated.filter(t => {
      if (tagActive && !t.places.some(tp => tp.place && placeMatchesTag(tp.place, tagSel, vocab))) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !(t.subtitle?.toLowerCase().includes(q) ?? false)) return false;
      }
      return true;
    });
  }, [curatedTrips, searchQuery, tagSel, tagActive, vocab]);

  // Trips zusätzlich nach Reichweite filtern (mind. ein Ort im Radius / in der Isochrone)
  const reachTrips = useMemo(() => {
    if (!activeCenter || tripMode === 'saved') return filteredTrips;
    const within = (lat: number, lng: number): boolean => {
      if (travelMode === 'radius') return distanceKm(activeCenter, { lat, lng }) <= radiusKm;
      if (iso) return pointInGeoJSON(lat, lng, iso.feature.geometry);
      return distanceKm(activeCenter, { lat, lng }) <= (EFFECTIVE_SPEED_KMH[travelMode] * travelMinutes) / 60;
    };
    return filteredTrips.filter(t =>
      t.places.some(tp => tp.place?.lat != null && tp.place?.lng != null && within(tp.place.lat!, tp.place.lng!)));
  }, [filteredTrips, activeCenter, tripMode, travelMode, travelMinutes, iso, radiusKm]);

  return (
    <AppShell>
      <div className="px-6 pt-4 max-w-2xl mx-auto md:max-w-none md:px-8 md:pt-8">

        {/* ── Desktop Text-Header ───────────────────────────────── */}
        <div className="hidden md:block mb-6">
          {user && (
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: '#71587a' }}>
              {user.name.split(' ')[0]}, the world is your oyster.
            </p>
          )}
          <h1
            className="font-display text-5xl xl:text-6xl leading-tight"
            style={{ letterSpacing: '-0.025em', color: '#34254c' }}
          >
            <em className="italic" style={{ color: '#71587a' }}>Worauf</em>{' '}
            wartest du?<br />
            <em className="italic" style={{ color: '#71587a' }}>Finde jetzt</em>{' '}
            deinen Geheimtrip.
          </h1>
        </div>

        {/* ── Desktop Split-Hero ────────────────────────────────── */}
        {placesLoaded && heroPlaces.length > 0 && (
          <DesktopHero
            places={heroPlaces}
            cityLabel={cityLabel}
            onCta={() => navigate('/finder')}
          />
        )}

        {/* ── Mobile Hero ───────────────────────────────────────── */}
        <div className="md:hidden mb-6">
          {user && (
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1" style={{ color: '#71587a' }}>
              {user.name.split(' ')[0]}, the world is your oyster.
            </p>
          )}
          <h1
            className="font-display text-4xl leading-tight mb-5"
            style={{ letterSpacing: '-0.02em', color: '#34254c' }}
          >
            <em className="italic" style={{ color: '#71587a' }}>Wohin</em>{' '}
            treibt's dich{' '}
            <em className="italic" style={{ color: '#71587a' }}>heute?</em>
          </h1>
          <button
            onClick={() => navigate('/finder')}
            className="w-full flex items-center gap-3 bg-[var(--color-amber)] text-white rounded-2xl px-5 py-4 shadow-[var(--shadow-amber)] active:scale-[0.98] transition-transform mb-5"
          >
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-compass text-lg" />
            </div>
            <div className="text-left">
              <div className="font-bold text-base leading-none mb-0.5">Finde meine Geheimtrips</div>
              <div className="text-white/80 text-xs">10 Fragen bis zum Abenteuer</div>
            </div>
            <i className="fa-solid fa-arrow-right ml-auto opacity-70" />
          </button>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-lavender)] mb-2">
            Oder in der Umgebung stöbern
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {MOODS.map(m => (
              <button
                key={m.label}
                onClick={() => navigate(m.label === 'Spontan jetzt' ? '/swipe?minutes=60&mode=auto' : '/finder')}
                className="flex-shrink-0 flex items-center gap-1.5 bg-white border border-[var(--color-bg-soft)] rounded-full px-3 py-1.5 text-xs font-medium text-[var(--color-aubergine)] shadow-[var(--shadow-card)] active:scale-95 transition-transform"
              >
                <i className={`fa-solid ${m.icon} text-[var(--color-amber)] text-[10px]`} />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tipp des Tages (nur Mobile) ───────────────────────── */}
        {tippDesTages && (
          <div className="md:hidden mb-7">
            <SectionHead title="Tipp des Tages" />
            <div
              className="relative rounded-[var(--radius-card)] overflow-hidden cursor-pointer aspect-[16/9] active:scale-[0.99] transition-transform shadow-[var(--shadow-raised)]"
              onClick={() => navigate(`/ort/${tippDesTages.id}`)}
            >
              <img src={tippDesTages.hero} alt={tippDesTages.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <TagBadge slug={tippDesTages.tagSlug} fallback={tippDesTages.categoryLabel} icon variant="dark" className="mb-1" />
                <h2 className="font-display font-bold text-white text-xl leading-tight mb-1">
                  {tippDesTages.name}
                </h2>
                <p className="text-white/80 text-xs flex items-center gap-1">
                  <i className="fa-solid fa-location-dot" />
                  {tippDesTages.region}
                </p>
              </div>
              {tippDesTages.match > 0 && (
                <div className="absolute top-3 right-3 bg-[var(--color-amber)] text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  {tippDesTages.match}% Match
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Orte / Trips / Suche + Karte (Desktop & Mobil) ───────────── */}
        {placesLoaded && (
          <div className="mb-2">

            {/* ── Sliding-Toggle ───────────────────────────────────── */}
            <div className="relative flex bg-[var(--color-bg-soft)] rounded-2xl p-1 mb-6">
              {/* Gleitende orange Pille */}
              <div
                className="absolute inset-y-1 rounded-xl bg-[var(--color-amber)] shadow-sm transition-all duration-250 ease-out pointer-events-none"
                style={{ width: 'calc(50% - 4px)', left: mainMode === 'places' ? '4px' : '50%' }}
              />
              <button
                onClick={() => setMainMode('places')}
                className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200 ${mainMode === 'places' ? 'text-white' : 'text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]'}`}
              >
                <i className="fa-solid fa-map-pin" /> Orte entdecken
              </button>
              <button
                onClick={() => { setMainMode('trips'); if (!tripsLoaded) loadTrips(); }}
                className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200 ${mainMode === 'trips' ? 'text-white' : 'text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]'}`}
              >
                <i className="fa-solid fa-route" /> Trips entdecken
              </button>
            </div>

            {/* ── Zwei-Ton-Überschrift (wechselt per Modus) ─────────── */}
            <h2 className="font-display text-2xl md:text-3xl xl:text-4xl leading-tight mb-5"
              style={{ letterSpacing: '-0.02em', color: '#34254c' }}>
              {mainMode === 'places' ? (
                <><em className="italic" style={{ color: '#71587a' }}>Schnell</em>{' '}geheime Orte{' '}<em className="italic" style={{ color: '#71587a' }}>finden.</em></>
              ) : (
                <><em className="italic" style={{ color: '#71587a' }}>Entdecke</em>{' '}kuratierte{' '}<em className="italic" style={{ color: '#71587a' }}>Trips.</em></>
              )}
            </h2>

            {/* ── Geteilte Suchleiste ───────────────────────────────── */}
            <div className="mb-5">
              <div className="relative">
                {/* Aktive Suchadresse Badge (nur Orte-Modus) */}
                {mainMode === 'places' && searchCenter && searchCenterLabel && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 bg-[var(--color-aubergine)] text-white text-xs font-semibold px-3 py-1 rounded-full">
                      <i className="fa-solid fa-location-dot" />
                      {searchCenterLabel}
                      <button onClick={() => { setSearchCenter(null); setSearchCenterLabel(null); }}
                        className="ml-1 opacity-70 hover:opacity-100">
                        <i className="fa-solid fa-xmark" />
                      </button>
                    </span>
                    <span className="text-xs text-[var(--color-lavender)]">wird als Suchzentrum verwendet</span>
                  </div>
                )}
                <div className="flex items-center gap-3 bg-white border border-[var(--color-bg-soft)] rounded-2xl px-4 py-3 shadow-[var(--shadow-card)]">
                  <i className="fa-solid fa-magnifying-glass text-[var(--color-lavender)] flex-shrink-0" />
                  <input
                    type="text"
                    placeholder={mainMode === 'places'
                      ? 'Stadt, Adresse oder Stichwort (z.B. München, Breslauer Str.)…'
                      : 'Trip nach Titel oder Region suchen…'}
                    value={searchQuery}
                    onChange={e => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      setShowSuggestions(false);
                      if (geoTimerRef.current) clearTimeout(geoTimerRef.current);
                      if (mainMode === 'places' && val.length >= 3) {
                        geoTimerRef.current = setTimeout(async () => {
                          const sug = await geocodeSuggestions(val);
                          setGeoSuggestions(sug);
                          setShowSuggestions(sug.length > 0);
                        }, 450);
                      } else {
                        setGeoSuggestions([]);
                      }
                    }}
                    onFocus={() => mainMode === 'places' && geoSuggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)]"
                  />
                  {(searchQuery || tagActive || searchCenter) && (
                    <button onClick={() => { setSearchQuery(''); setTagSel(EMPTY_TAG_SEL); setSearchCenter(null); setSearchCenterLabel(null); setGeoSuggestions([]); setShowSuggestions(false); }}
                      className="text-[var(--color-lavender)] hover:text-[var(--color-aubergine)] transition-colors">
                      <i className="fa-solid fa-xmark text-sm" />
                    </button>
                  )}
                </div>
                {/* Geocoding-Dropdown (nur Orte-Modus) */}
                {mainMode === 'places' && showSuggestions && geoSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-[var(--shadow-raised)] border border-[var(--color-bg-soft)] z-50 overflow-hidden">
                    {geoSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onMouseDown={() => {
                          setSearchCenter(s.coords);
                          setSearchCenterLabel(s.displayName);
                          setSearchQuery('');
                          setShowSuggestions(false);
                          setGeoSuggestions([]);
                        }}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-soft)] transition-colors border-b border-[var(--color-bg-soft)] last:border-0"
                      >
                        <i className="fa-solid fa-location-dot text-[var(--color-amber)] mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-[var(--color-aubergine)]">{s.displayName}</div>
                          <div className="text-xs text-[var(--color-lavender)] truncate">{s.fullAddress}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Kategorien — Hauptkategorien (nach Profil sortiert) + Drilldown */}
              <div className="mt-5">
                <TagFilter value={tagSel} onChange={setTagSel} />
              </div>
            </div>


            {/* ── Modus-Chips (gleiches Layout für beide Modi) ─────── */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <div className="flex gap-1.5 p-1 bg-[var(--color-bg-soft)] rounded-2xl">
                {mainMode === 'places' ? (
                  <>
                    {([
                      { id: 'newest', icon: 'fa-clock-rotate-left', label: 'Neueste' },
                      { id: 'all',    icon: 'fa-layer-group',        label: 'Alle'   },
                    ] as const).map(({ id, icon, label }) => (
                      <button key={id} onClick={() => setPlaceMode(id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${placeMode === id ? 'bg-[var(--color-aubergine)] text-white shadow-sm' : 'text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]'}`}>
                        <i className={`fa-solid ${icon}`} />{label}
                      </button>
                    ))}
                    {user && ([
                      { id: 'top5',  icon: 'fa-star',     label: 'Top 5 Matche' },
                      { id: 'saved', icon: 'fa-bookmark',  label: 'Gemerkt'     },
                    ] as const).map(({ id, icon, label }) => (
                      <button key={id} onClick={() => setPlaceMode(id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${placeMode === id ? 'bg-[var(--color-aubergine)] text-white shadow-sm' : 'text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]'}`}>
                        <i className={`fa-solid ${icon}`} />{label}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    {([
                      { id: 'newest', icon: 'fa-clock-rotate-left', label: 'Neueste' },
                      { id: 'all',    icon: 'fa-layer-group',        label: 'Alle'   },
                    ] as const).map(({ id, icon, label }) => (
                      <button key={id} onClick={() => setTripMode(id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${tripMode === id ? 'bg-[var(--color-aubergine)] text-white shadow-sm' : 'text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]'}`}>
                        <i className={`fa-solid ${icon}`} />{label}
                      </button>
                    ))}
                    {user && ([
                      { id: 'top5',  icon: 'fa-star',     label: 'Top 5 Matche' },
                      { id: 'saved', icon: 'fa-bookmark',  label: 'Gemerkt'     },
                    ] as const).map(({ id, icon, label }) => (
                      <button key={id} onClick={() => setTripMode(id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${tripMode === id ? 'bg-[var(--color-aubergine)] text-white shadow-sm' : 'text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]'}`}>
                        <i className={`fa-solid ${icon}`} />{label}
                      </button>
                    ))}
                  </>
                )}
              </div>

              {/* Reichweite: Radius oder echte Fahrzeit je Verkehrsmittel — Orte UND Trips */}
              {((mainMode === 'places' && placeMode !== 'saved') || (mainMode === 'trips' && tripMode !== 'saved')) && (
                <ReachControls
                  travelMode={travelMode} setTravelMode={setTravelMode}
                  travelMinutes={travelMinutes} setTravelMinutes={setTravelMinutes}
                  radiusKm={radiusKm} setRadiusKm={setRadiusKm}
                  iso={iso} isoLoading={isoLoading}
                />
              )}

              {/* Trefferzahl */}
              {(searchQuery || tagActive || searchCenter) && !showSuggestions && (
                <p className="text-xs text-[var(--color-lavender)]">
                  <span className="font-semibold text-[var(--color-aubergine)]">
                    {mainMode === 'places' ? filteredPlaces.length : reachTrips.length}
                  </span>{' '}
                  {mainMode === 'places' ? 'Geheimtipps' : 'Trips'} gefunden
                </p>
              )}
            </div>

            {/* ── Inhaltsbereich ───────────────────────────────────── */}
            {mainMode === 'places' && (<>
              
              <NearbyMapSection places={filteredPlaces} userCoords={userCoords} centerOverride={searchCenter} mode={placeMode} radiusKm={radiusKm}
                travel={travel} />
            </>)}
            {mainMode === 'trips' && (<>
              <TripMapSection trips={reachTrips} userCoords={userCoords} centerOverride={searchCenter} radiusKm={radiusKm}
                travel={travel} showReach={tripMode !== 'saved'} />
              <TripsSection trips={reachTrips} tripsLoaded={tripsLoaded} userCoords={userCoords} onCreateTrip={() => navigate('/trip-wizard')} viewMode={tripMode} />
            </>)}
          </div>
        )}

        {/* ── Fußläufig erreichbar (Mobile) ─────────────────────── */}
        {nearbyPlaces.length > 0 && (
          <div className="md:hidden mb-7">
            <SectionHead
              title="Fußläufig erreichbar"
              action={
                <button onClick={() => navigate('/map')} className="text-xs font-semibold text-[var(--color-amber)] flex items-center gap-1">
                  Karte <i className="fa-solid fa-arrow-right text-[10px]" />
                </button>
              }
            />
            <div className="grid grid-cols-2 gap-3">
              {nearbyPlaces.map(p => <PlaceCard key={p.id} place={p} />)}
            </div>
          </div>
        )}

        {!placesLoaded && (
          <div className="flex justify-center py-12 text-[var(--color-lavender-lt)]">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl" />
          </div>
        )}

        {/* ── Community + Gründer ────────────────────────────────── */}
        {placesLoaded && (
          <div className="mb-8">
            {/* Abschnitts-Überschrift */}
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: '#71587a' }}>
              Community
            </p>
            <h2 className="font-display leading-tight mb-6"
              style={{ fontSize: 'clamp(1.6rem, 3vw, 2.25rem)', letterSpacing: '-0.02em', color: '#34254c' }}>
              <em className="italic" style={{ color: '#71587a' }}>Deine</em>{' '}
              Geheimtrips mit der{' '}
              <em className="italic" style={{ color: '#71587a' }}>Welt teilen.</em>
            </h2>

            {/*
              Foto hier ablegen: web/public/images/founder.jpg
              Solange kein Bild vorhanden zeigt ein Lila-Gradient als Dummy.
            */}
            <div className="rounded-3xl overflow-hidden relative" style={{ background: '#34254c' }}>
              <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full opacity-[0.07]"
                style={{ background: 'radial-gradient(circle, #F99039, transparent)' }} />

              <div className="relative flex flex-col sm:flex-row">

                {/* ── Linkes Drittel: Foto + Sprechblase ── */}
                <div className="relative sm:w-1/3 flex-shrink-0 overflow-hidden min-h-[220px]">
                  {/* Dummy-Gradient (sichtbar solange kein Foto vorhanden) */}
                  <div className="absolute inset-0"
                    style={{ background: 'linear-gradient(160deg, #5c4070 0%, #2e1f48 100%)' }} />
                  {/* Foto – überlagert Gradient sobald geladen */}
                  <img
                    src="/images/founder.jpg"
                    alt="David – Gründer von Geheimtrips.de"
                    className="absolute inset-0 w-full h-full object-cover object-center"
                  />

                  {/* Sprechblase im Foto (unterer Bereich) */}
                  <div className="absolute bottom-3 left-3 right-3">
                    {/* Pfeil ↑ zeigt ins Foto */}
                    <div style={{
                      marginLeft: '14px',
                      width: 0, height: 0,
                      borderLeft: '7px solid transparent',
                      borderRight: '7px solid transparent',
                      borderBottom: '8px solid #F1ECF4',
                    }} />
                    <div className="rounded-2xl px-3.5 py-2.5" style={{ background: '#F1ECF4' }}>
                      <p className="font-display leading-snug"
                        style={{ fontSize: '11px', color: '#34254c', fontStyle: 'italic' }}>
                        „Lasst uns gemeinsam Geheimtrips auf der ganzen Welt entdecken und der Welt davon erzählen."
                      </p>
                      <p className="text-[9px] font-semibold mt-1.5 tracking-wide"
                        style={{ color: '#71587a' }}>— David-Lennart Sturz</p>
                    </div>
                  </div>
                </div>

                {/* ── Rechte zwei Drittel: Community Content ── */}
                <div className="flex-1 flex flex-col md:flex-row items-center gap-6 px-7 py-8 md:py-9">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(249,144,57,0.18)' }}>
                    <i className="fa-solid fa-feather-pointed text-3xl text-[var(--color-amber)]" />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-amber)] mb-1">Community</p>
                    <h3 className="font-display font-bold text-white text-xl md:text-2xl leading-tight mb-1"
                      style={{ letterSpacing: '-0.01em' }}>
                      Kennst du einen geheimen Ort?
                    </h3>
                    <p className="text-white/50 text-sm">Teile ihn mit der Community — werde Teil von Geheimtrips.de.</p>
                  </div>
                  <button
                    onClick={() => navigate('/submit')}
                    className="flex-shrink-0 flex items-center gap-2 bg-[var(--color-amber)] text-white font-bold px-6 py-3 rounded-2xl shadow-[var(--shadow-amber)] hover:brightness-110 active:scale-95 transition-all text-sm"
                  >
                    <i className="fa-solid fa-plus" />
                    Jetzt einreichen
                    <i className="fa-solid fa-arrow-right opacity-70" />
                  </button>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ── Feature Showcase ──────────────────────────────────── */}
        {placesLoaded && (
          <div className="mb-10 mt-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: '#71587a' }}>
              Mehr entdecken
            </p>
            <h2 className="font-display leading-tight mb-6"
              style={{ fontSize: 'clamp(1.6rem, 3vw, 2.25rem)', letterSpacing: '-0.02em', color: '#34254c' }}>
              <em className="italic" style={{ color: '#71587a' }}>Die schönsten Orte</em>{' '}
              der Welt — von Entdeckern für{' '}
              <em className="italic" style={{ color: '#71587a' }}>Abenteurerinnen.</em>
            </h2>

            {/* Awards → eigene Seite (/awards), TripCounting → Profil/Account — hier ausgezogen */}

            {/* ── Mitreisende / Meet People (voll) ────── */}
            <MeetPeopleCard onNavigate={navigate} />
          </div>
        )}

      </div>
      <LegalFooter />
    </AppShell>
  );
}
