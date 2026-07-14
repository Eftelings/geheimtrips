import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { PlaceCard } from '../components/ui/PlaceCard.js';
import { BottomSheet } from '../components/ui/BottomSheet.js';
import { useAppStore } from '../store/useAppStore.js';
import { placesApi } from '../services/api.js';
import { TagFilter, placeMatchesTag, EMPTY_TAG_SEL } from '../components/ui/TagFilter.js';
import type { TagSelection } from '../components/ui/TagFilter.js';
import { useTaxVocab } from '../data/taxVocab.js';
import { ReachControls } from '../components/ui/ReachControls.js';
import { ReachLayer, MapComputeOverlay } from '../components/map/ReachLayer.js';
import type { TravelView } from '../components/map/ReachLayer.js';
import { useTravelReach } from '../hooks/useTravelReach.js';
import { geocodeSuggestions, distanceKm, requestGpsPosition, getLocationByIp } from '../services/geoService.js';
import type { Coords, GeoLocation } from '../services/geoService.js';
import { pointInGeoJSON, EFFECTIVE_SPEED_KMH, reachBBoxPoints } from '../utils/geo.js';
import { MOBILITY } from '../types/index.js';
import type { Place, Trip } from '../types/index.js';

type Tab = 'orte' | 'trips';

// ─── Marker (wie auf der Startseite) ─────────────────────────────────────────
const makePinMarker = (n: number) => L.divIcon({
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#F99039;color:white;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.35)">${n}</div>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map(p => p.join(',')).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) { map.flyTo(points[0], 13, { duration: 0.6 }); return; }
    map.fitBounds(points, { padding: [40, 40], maxZoom: 13, animate: true, duration: 0.6 });
  }, [key]); // eslint-disable-line
  return null;
}

// ─── Karte der Sammlung ───────────────────────────────────────────────────────
function CollectionMap({ places, center, travel, radiusKm, reachActive, onOpen }: {
  places: Place[];
  center: Coords | null;
  travel: TravelView;
  radiusKm: number;
  reachActive: boolean;
  onOpen: (id: string) => void;
}) {
  const withCoords = places.filter(p => p.lat != null && p.lng != null);
  const points = withCoords.map(p => [p.lat!, p.lng!] as [number, number]);
  if (center) {
    points.push([center.lat, center.lng]);
    if (reachActive) points.push(...reachBBoxPoints(center, travel, radiusKm, travel.mode === 'radius'));
  }

  if (!points.length) {
    return (
      <div className="flex items-center justify-center rounded-2xl mb-5 text-sm text-[var(--color-lavender)]"
        style={{ height: 180, background: 'var(--color-bg-soft)' }}>
        Keine Orte mit Koordinaten in dieser Auswahl.
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden mb-5 border border-[var(--color-bg-soft)] h-[300px] md:h-[380px]">
      <MapComputeOverlay loading={travel.loading}
        transitLike={travel.mode === 'train' || travel.mode === 'transit'} />
      <MapContainer center={points[0]} zoom={8} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />
        <FitBounds points={points} />
        {/* Suchzentrum / Standort + Reichweite (Isochrone oder Umkreis) */}
        <ReachLayer center={center} travel={travel} radiusKm={radiusKm}
          radiusActive={reachActive && travel.mode === 'radius'} />
        {withCoords.map((p, i) => (
          <Marker key={p.id} position={[p.lat!, p.lng!]} icon={makePinMarker(i + 1)}>
            <Popup>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>{p.region}</div>
              <button onClick={() => onOpen(p.id)}
                style={{ fontSize: 11, fontWeight: 700, color: '#F99039', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
                Ort öffnen →
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

// Freitext-Suche über alle relevanten Felder (inkl. Adresse aus der Einreichung)
function placeMatchesText(p: Place, s: string): boolean {
  const attrs = p.attributes as Record<string, unknown> | null | undefined;
  const locationText = typeof attrs?.locationText === 'string' ? attrs.locationText : '';
  return [p.name, p.region, p.short, p.categoryLabel, locationText, ...p.vibe]
    .join(' ').toLowerCase().includes(s);
}

// ─── Seite ────────────────────────────────────────────────────────────────────
export function SavedPage({ initialTab = 'orte' }: { initialTab?: Tab } = {}) {
  const navigate = useNavigate();
  const tab: Tab = initialTab;   // Orte vs. Trips wird über die Route bestimmt (Bottom-Nav)
  // Trips-Ansicht: Alle anzeigen · nach Anreisezeit filtern · nach Datum sortieren
  const [tripView, setTripView]  = useState<'alle' | 'anreise' | 'datum'>('alle');
  const [orteView, setOrteView]  = useState<'gemerkt' | 'anreise' | 'beigetragen'>('gemerkt');
  const [q, setQ]                 = useState('');
  const vocab = useTaxVocab();
  const [tagSel, setTagSel] = useState<TagSelection>(EMPTY_TAG_SEL);
  const catActive = tagSel.group !== null || tagSel.tag !== null;
  const [showMap, setShowMap]     = useState(false);   // Liste zuerst — Karte erst per Karten-Icon
  const [createdPlaces, setCreatedPlaces] = useState<Place[]>([]);
  const [mapReady, setMapReady]   = useState(false);
  // Standort-Suche (wie Startseite): Stadt wählen → Reichweiten-Filter
  const [geoSugs, setGeoSugs]           = useState<GeoLocation[]>([]);
  const [showSugs, setShowSugs]         = useState(false);
  const [searchCenter, setSearchCenter] = useState<Coords | null>(null);
  const [centerLabel, setCenterLabel]   = useState<string | null>(null);
  const [radiusKm, setRadiusKm]         = useState(80);
  const [userCoords, setUserCoords]     = useState<Coords | null>(null);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { places, savedIds, loadPlaces, trips, loadTrips, createTrip, savedTags, loadSavedTags, setPlaceTags } = useAppStore();
  const [tagFilter, setTagFilter]       = useState<string | null>(null);
  const [editTagsPlace, setEditTagsPlace] = useState<Place | null>(null);

  useEffect(() => { loadPlaces(); loadTrips(); loadSavedTags(); }, []); // eslint-disable-line
  useEffect(() => { setMapReady(true); }, []);
  // Beigetragene Orte (selbst eingereicht) — für den Reiter „Beigetragene"
  useEffect(() => { placesApi.myCreated().then(setCreatedPlaces).catch(() => {}); }, []);

  // Eigener Standort (still): GPS → IP-Fallback — Zentrum für Verkehrsmittel-Reichweiten
  useEffect(() => {
    (async () => {
      try {
        setUserCoords(await requestGpsPosition());
      } catch {
        const ip = await getLocationByIp();
        if (ip) setUserCoords({ lat: ip.lat, lng: ip.lng });
      }
    })();
  }, []);

  // Reichweite: Suchzentrum (Stadt) hat Vorrang vor dem eigenen Standort
  const activeCenter = searchCenter ?? userCoords;
  const { travelMode, setTravelMode, travelMinutes, setTravelMinutes, iso, isoLoading } =
    useTravelReach(activeCenter);
  const travel: TravelView = { mode: travelMode, minutes: travelMinutes, iso, loading: isoLoading };

  // Filter aktiv? Radius-Modus filtert nur mit gewähltem Suchzentrum
  // (sonst würde die Sammlung standardmäßig Orte ausblenden) —
  // Verkehrsmittel-Modi filtern auch ab dem eigenen Standort.
  const reachActive = !!activeCenter && (travelMode !== 'radius' || !!searchCenter);

  function withinReach(lat: number, lng: number): boolean {
    if (!activeCenter) return true;
    if (travelMode === 'radius') return distanceKm(activeCenter, { lat, lng }) <= radiusKm;
    if (iso) return pointInGeoJSON(lat, lng, iso.feature.geometry);
    return distanceKm(activeCenter, { lat, lng }) <= (EFFECTIVE_SPEED_KMH[travelMode] * travelMinutes) / 60;
  }

  const savedPlaces = useMemo(() => places.filter(p => savedIds.has(p.id)), [places, savedIds]);
  // Basis je Reiter: Beigetragene = eigene Orte, sonst gemerkte Orte
  const orteBase = orteView === 'beigetragen' ? createdPlaces : savedPlaces;

  // Alle eigenen Tags der Sammlung (für die Filterleiste)
  const allTags = useMemo(
    () => [...new Set(savedPlaces.flatMap(p => savedTags[p.id] ?? []))].sort((a, b) => a.localeCompare(b, 'de')),
    [savedPlaces, savedTags],
  );

  // ── Gefilterte Orte: Reichweite + Freitext + Kategorie + eigene Tags ──────
  const filteredPlaces = useMemo(() => {
    let list: (Place & { _dist?: number })[] = orteBase;
    if (catActive) list = list.filter(p => placeMatchesTag(p, tagSel, vocab));
    if (tagFilter) list = list.filter(p => (savedTags[p.id] ?? []).includes(tagFilter));
    const s = q.trim().toLowerCase();
    if (s) list = list.filter(p => placeMatchesText(p, s));
    if (reachActive && activeCenter) {
      list = list
        .filter(p => p.lat != null && p.lng != null && withinReach(p.lat!, p.lng!))
        .map(p => ({ ...p, _dist: distanceKm(activeCenter, { lat: p.lat!, lng: p.lng! }) }))
        .sort((a, b) => a._dist! - b._dist!);
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orteBase, q, tagSel, catActive, vocab, tagFilter, savedTags, reachActive, activeCenter, radiusKm, travelMode, travelMinutes, iso]);

  // ── Gefilterte Trips: Kategorie-Tag + Freitext + Reichweite ──────────────
  const filteredTrips = useMemo(() => {
    let list: Trip[] = trips;
    if (catActive) list = list.filter(t => t.places.some(tp => tp.place && placeMatchesTag(tp.place, tagSel, vocab)));
    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter(t =>
        [t.title, t.subtitle ?? '', ...t.places.map(tp => `${tp.place?.name ?? ''} ${tp.place?.region ?? ''}`)]
          .join(' ').toLowerCase().includes(s));
    }
    // Reichweiten-Filter nur im „Anreisezeit"-Modus
    if (tripView === 'anreise' && reachActive && activeCenter) {
      list = list
        .map(t => {
          const pts = t.places.filter(tp => tp.place?.lat != null && tp.place?.lng != null);
          const inReach = pts.some(tp => withinReach(tp.place!.lat!, tp.place!.lng!));
          const dists = pts.map(tp => distanceKm(activeCenter, { lat: tp.place!.lat!, lng: tp.place!.lng! }));
          return { t, inReach, min: dists.length ? Math.min(...dists) : Infinity };
        })
        .filter(x => x.inReach)
        .sort((a, b) => a.min - b.min)
        .map(x => x.t);
    } else if (tripView === 'datum') {
      // Nach Datum: geplantes Startdatum, sonst Erstellungsdatum — neueste zuerst (wie besuchte Orte)
      list = [...list].sort((a, b) =>
        (b.startDate ?? b.createdAt ?? '').localeCompare(a.startDate ?? a.createdAt ?? ''));
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, q, tagSel, catActive, vocab, tripView, reachActive, activeCenter, radiusKm, travelMode, travelMinutes, iso]);

  // Orte aller gefilterten Trips (dedupliziert) für die Trip-Karte
  const tripMapPlaces = useMemo(() => {
    const seen = new Set<string>();
    const out: Place[] = [];
    for (const t of filteredTrips) {
      for (const tp of t.places) {
        const pl = tp.place;
        if (pl && pl.lat != null && pl.lng != null && !seen.has(pl.id)) {
          seen.add(pl.id);
          out.push(pl);
        }
      }
    }
    return out;
  }, [filteredTrips]);

  const hasFilter = Boolean(q.trim() || catActive || reachActive || tagFilter);
  const modeLabel = travelMode !== 'radius' ? MOBILITY.find(m => m.id === travelMode)?.label : null;

  function handleSearchInput(val: string) {
    setQ(val);
    setShowSugs(false);
    if (geoTimer.current) clearTimeout(geoTimer.current);
    if (val.length >= 3) {
      geoTimer.current = setTimeout(async () => {
        const sugs = await geocodeSuggestions(val);
        setGeoSugs(sugs);
        setShowSugs(sugs.length > 0);
      }, 450);
    } else {
      setGeoSugs([]);
    }
  }

  function pickSuggestion(s: GeoLocation) {
    setSearchCenter(s.coords);
    setCenterLabel(s.displayName);
    setQ('');
    setGeoSugs([]);
    setShowSugs(false);
  }

  function clearAll() {
    setQ(''); setTagSel(EMPTY_TAG_SEL); setTagFilter(null);
    setSearchCenter(null); setCenterLabel(null);
    setGeoSugs([]); setShowSugs(false);
    setTravelMode('radius'); setTripView('alle');
  }

  return (
    <AppShell>
      <div className="px-6 pt-5 max-w-2xl mx-auto md:max-w-none md:px-8">
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-5" style={{ letterSpacing: '-0.02em' }}>
          {tab === 'trips'
            ? <>Meine <em className="italic text-[var(--color-amber)]">Trips</em></>
            : <>Meine <em className="italic text-[var(--color-amber)]">Orte</em></>}
        </h1>

        {/* Trips-Ansicht: Alle · nach Anreisezeit · nach Datum */}
        {tab === 'trips' && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {([
              { id: 'alle',    icon: 'fa-layer-group',  label: 'Alle' },
              { id: 'anreise', icon: 'fa-car-side',     label: 'Anreisezeit' },
              { id: 'datum',   icon: 'fa-calendar-day', label: 'Nach Datum' },
            ] as const).map(v => (
              <button key={v.id} onClick={() => setTripView(v.id)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl border-2 text-xs font-bold transition-colors ${
                  tripView === v.id
                    ? 'border-[var(--color-amber)] bg-[var(--color-amber)] text-white'
                    : 'border-[var(--color-bg-soft)] bg-white text-[var(--color-lavender)]'
                }`}>
                <i className={`fa-solid ${v.icon} text-sm`} />
                {v.label}
              </button>
            ))}
          </div>
        )}

        {/* Orte-Ansicht: Gemerkte · Anreisezeit · Beigetragene */}
        {tab === 'orte' && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {([
              { id: 'gemerkt',     icon: 'fa-bookmark',        label: 'Gemerkte' },
              { id: 'anreise',     icon: 'fa-car-side',        label: 'Anreisezeit' },
              { id: 'beigetragen', icon: 'fa-feather-pointed', label: 'Beigetragene' },
            ] as const).map(v => (
              <button key={v.id} onClick={() => setOrteView(v.id)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl border-2 text-xs font-bold transition-colors ${
                  orteView === v.id
                    ? 'border-[var(--color-amber)] bg-[var(--color-amber)] text-white'
                    : 'border-[var(--color-bg-soft)] bg-white text-[var(--color-lavender)]'
                }`}>
                <i className={`fa-solid ${v.icon} text-sm`} />
                {v.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Aktives Suchzentrum ───────────────────────────────────────── */}
        {searchCenter && centerLabel && (tab === 'orte' || tripView === 'anreise') && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-[var(--color-aubergine)] text-white text-xs font-semibold px-3 py-1 rounded-full">
              <i className="fa-solid fa-location-dot" />
              {centerLabel}
              <button onClick={() => { setSearchCenter(null); setCenterLabel(null); }}
                className="ml-1 opacity-70 hover:opacity-100">
                <i className="fa-solid fa-xmark" />
              </button>
            </span>
            <span className="text-xs text-[var(--color-lavender)]">wird als Suchzentrum verwendet</span>
          </div>
        )}

        {/* Suchleiste + Reichweite — nur Orte-Tab oder Trips/Anreisezeit */}
        {(tab === 'orte' || tripView === 'anreise') && (<>
        {/* ── Suchleiste + Karten-Toggle ─────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <div className="flex items-center gap-3 bg-white border border-[var(--color-bg-soft)] rounded-2xl px-4 py-2.5 shadow-[var(--shadow-card)]">
              <i className="fa-solid fa-magnifying-glass text-[var(--color-lavender)] flex-shrink-0 text-sm" />
              <input
                type="text"
                placeholder={tab === 'orte'
                  ? 'Stadt (z.B. Siegburg), Name oder Aktivität…'
                  : 'Stadt, Trip-Titel oder Ort…'}
                value={q}
                onChange={e => handleSearchInput(e.target.value)}
                onFocus={() => geoSugs.length > 0 && setShowSugs(true)}
                onBlur={() => setTimeout(() => setShowSugs(false), 150)}
                className="flex-1 bg-transparent outline-none text-sm text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)]"
              />
              {(q || catActive || searchCenter || travelMode !== 'radius') && (
                <button onClick={clearAll}
                  className="text-[var(--color-lavender)] hover:text-[var(--color-aubergine)] transition-colors">
                  <i className="fa-solid fa-xmark text-sm" />
                </button>
              )}
            </div>
            {/* Standort-Vorschläge (Geocoding wie auf der Startseite) */}
            {showSugs && geoSugs.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-[var(--shadow-raised)] border border-[var(--color-bg-soft)] z-[1100] overflow-hidden">
                {geoSugs.map((s, i) => (
                  <button key={i} onMouseDown={() => pickSuggestion(s)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-soft)] transition-colors border-b border-[var(--color-bg-soft)] last:border-0">
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
          <button onClick={() => setShowMap(v => !v)}
            title={showMap ? 'Karte ausblenden' : 'Karte einblenden'}
            className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center transition-all border ${
              showMap
                ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]'
                : 'bg-white text-[var(--color-lavender)] border-[var(--color-bg-soft)] hover:border-[var(--color-aubergine)]'
            }`}>
            <i className="fa-solid fa-map text-sm" />
          </button>
        </div>

        {/* ── Reichweite: nur im Reiter „Anreisezeit" (Orte) bzw. Trips/Anreisezeit ────── */}
        {((tab === 'orte' && orteView === 'anreise') || (tab === 'trips' && tripView === 'anreise')) && (
        <div className="mb-4">
          <ReachControls
            travelMode={travelMode} setTravelMode={setTravelMode}
            travelMinutes={travelMinutes} setTravelMinutes={setTravelMinutes}
            radiusKm={radiusKm} setRadiusKm={setRadiusKm}
            iso={iso} isoLoading={isoLoading}
            radiusSliderVisible={!!searchCenter}
            radiusHint="Stadt wählen oder Verkehrsmittel antippen, um nach Reichweite zu filtern"
          />
          {travelMode !== 'radius' && !activeCenter && (
            <p className="text-[10px] text-[#C96442] mt-1">
              <i className="fa-solid fa-location-dot mr-1" />
              Kein Standort verfügbar — wähle eine Stadt in der Suche.
            </p>
          )}
        </div>
        )}
        </>)}

        {/* ── Orte-Tab ──────────────────────────────────────────────────── */}
        {tab === 'orte' && (
          <>
            {/* Kategorien — Hauptkategorien (nach Profil sortiert) + Drilldown */}
            <div className="mb-4">
              <TagFilter value={tagSel} onChange={setTagSel} />
            </div>

            {/* Eigene Tags — Filterleiste (nur bei gemerkten Orten) */}
            {orteView === 'gemerkt' && allTags.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none">
                {allTags.map(t => (
                  <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)}
                    className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-colors ${
                      tagFilter === t ? 'border-[var(--color-amber)] bg-[var(--color-amber)] text-white' : 'border-[var(--color-bg-soft)] text-[var(--color-lavender)]'}`}>
                    <i className="fa-solid fa-tag text-[10px] mr-1" />{t}
                  </button>
                ))}
              </div>
            )}

            {/* Trefferzahl bei aktivem Filter */}
            {hasFilter && (
              <p className="text-xs text-[var(--color-lavender)] mb-3">
                <span className="font-semibold text-[var(--color-aubergine)]">{filteredPlaces.length}</span>{' '}
                von {orteBase.length} {orteView === 'beigetragen' ? 'beigetragenen' : 'gemerkten'} Orten
                {reachActive && travelMode === 'radius' && centerLabel && <> im Umkreis von {radiusKm} km um {centerLabel}</>}
                {reachActive && travelMode !== 'radius' && (
                  <> erreichbar in {travelMinutes} Min ({modeLabel}) {centerLabel ? `ab ${centerLabel}` : 'ab deinem Standort'}</>
                )}
              </p>
            )}

            {/* Karte — nur wenn per Karten-Icon eingeblendet */}
            {showMap && mapReady && orteBase.length > 0 && (
              <CollectionMap places={filteredPlaces} center={activeCenter} travel={travel}
                radiusKm={radiusKm} reachActive={reachActive}
                onOpen={id => navigate(`/place/${id}`)} />
            )}

            {orteBase.length === 0 ? (
              <div className="text-center py-16 text-[var(--color-lavender)]">
                <i className={`${orteView === 'beigetragen' ? 'fa-solid fa-feather-pointed' : 'fa-regular fa-bookmark'} text-5xl mb-4 opacity-30`} />
                <p className="font-semibold mb-1">{orteView === 'beigetragen' ? 'Noch nichts beigetragen' : 'Noch nichts gemerkt'}</p>
                <p className="text-sm">{orteView === 'beigetragen' ? 'Reiche einen Ort ein — er erscheint dann hier.' : 'Swipe Orte nach rechts, um sie hier zu speichern.'}</p>
                {orteView === 'beigetragen' && (
                  <button onClick={() => navigate('/submit')} className="mt-4 bg-[var(--color-amber)] text-white font-bold px-5 py-2.5 rounded-2xl text-sm">
                    <i className="fa-solid fa-feather-pointed mr-2" />Ort einreichen
                  </button>
                )}
              </div>
            ) : filteredPlaces.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-lavender)]">
                <i className="fa-solid fa-magnifying-glass text-4xl mb-3 opacity-30" />
                <p className="font-semibold mb-1">Keine Treffer</p>
                <p className="text-sm">
                  {reachActive
                    ? 'Kein gemerkter Ort liegt in dieser Reichweite — erhöhe Zeit bzw. Umkreis.'
                    : 'Kein gemerkter Ort passt zu deiner Suche.'}
                </p>
                <button onClick={clearAll} className="mt-3 text-xs font-bold text-[var(--color-amber)]">
                  Filter zurücksetzen
                </button>
              </div>
            ) : (
              <>
                {/* Entfernungsliste bei aktiver Reichweite */}
                {reachActive && (
                  <div className="flex flex-col gap-1 mb-3">
                    {filteredPlaces.map((p, i) => (
                      <p key={p.id} className="text-xs text-[var(--color-lavender)]">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-amber)] text-white text-[9px] font-bold mr-1.5">{i + 1}</span>
                        <span className="font-semibold text-[var(--color-aubergine)]">{p.name}</span>
                        {' '}— {(p._dist ?? 0) < 1 ? `${Math.round((p._dist ?? 0) * 1000)} m` : `${(p._dist ?? 0).toFixed(0)} km`} entfernt
                      </p>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredPlaces.map(p => {
                    const tags = savedTags[p.id] ?? [];
                    return (
                      <div key={p.id} className="flex flex-col gap-1.5">
                        <PlaceCard place={p} />
                        {orteView === 'beigetragen' ? (
                          <p className="px-1 text-[11px] font-semibold text-[var(--color-lavender)] inline-flex items-center gap-1.5">
                            <i className="fa-regular fa-eye text-[10px]" />
                            {(p.views ?? 0).toLocaleString('de')} {(p.views ?? 0) === 1 ? 'Aufruf' : 'Aufrufe'}
                          </p>
                        ) : (
                          <button onClick={() => setEditTagsPlace(p)}
                            className="flex flex-wrap items-center gap-1 text-left px-0.5">
                            {tags.map(t => (
                              <span key={t} className="bg-[var(--color-amber)]/15 text-[var(--color-amber)] text-[10px] font-bold px-2 py-0.5 rounded-full">{t}</span>
                            ))}
                            <span className="text-[10px] font-semibold text-[var(--color-lavender)] inline-flex items-center gap-1 px-1.5 py-0.5">
                              <i className="fa-solid fa-tag text-[9px]" /> {tags.length ? 'bearbeiten' : 'Tag'}
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Trips-Tab ─────────────────────────────────────────────────── */}
        {tab === 'trips' && (
          <div className="flex flex-col gap-3">
            {/* Kategorien — filtern Trips über ihre enthaltenen Orte */}
            <TagFilter value={tagSel} onChange={setTagSel} />

            {/* Trefferzahl / Sortier-Hinweis */}
            {(q.trim() || catActive || tripView !== 'alle') && trips.length > 0 && (
              <p className="text-xs text-[var(--color-lavender)]">
                <span className="font-semibold text-[var(--color-aubergine)]">{filteredTrips.length}</span>{' '}
                von {trips.length} Trips
                {tripView === 'anreise' && reachActive && travelMode === 'radius' && centerLabel && <> im Umkreis von {radiusKm} km um {centerLabel}</>}
                {tripView === 'anreise' && reachActive && travelMode !== 'radius' && (
                  <> erreichbar in {travelMinutes} Min ({modeLabel}) {centerLabel ? `ab ${centerLabel}` : 'ab deinem Standort'}</>
                )}
                {tripView === 'datum' && <> · neueste zuerst</>}
              </p>
            )}

            {/* Karte: alle Orte der gefilterten Trips — nur im Anreisezeit-Modus */}
            {tripView === 'anreise' && showMap && mapReady && trips.length > 0 && (
              <CollectionMap places={tripMapPlaces} center={activeCenter} travel={travel}
                radiusKm={radiusKm} reachActive={reachActive}
                onOpen={id => navigate(`/place/${id}`)} />
            )}

            {/* Create */}
            <button onClick={() => navigate('/trips/create')}
              className="flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-[var(--color-amber)] text-[var(--color-amber)] font-semibold text-sm active:scale-[0.98] transition-transform">
              <i className="fa-solid fa-plus text-lg" />
              Neuen Trip erstellen
            </button>

            {filteredTrips.length === 0 && (q.trim() || catActive || (tripView === 'anreise' && reachActive)) ? (
              <div className="text-center py-10 text-[var(--color-lavender)]">
                <i className="fa-solid fa-magnifying-glass text-4xl mb-3 opacity-30" />
                <p className="font-semibold mb-1">Keine Treffer</p>
                <p className="text-sm">
                  {tripView === 'anreise' && reachActive
                    ? 'Kein Trip hat Orte in dieser Reichweite — erhöhe Zeit bzw. Umkreis.'
                    : 'Kein Trip passt zu deiner Suche.'}
                </p>
                <button onClick={clearAll} className="mt-3 text-xs font-bold text-[var(--color-amber)]">
                  Filter zurücksetzen
                </button>
              </div>
            ) : (
              filteredTrips.map(t => (
                <button key={t.id} onClick={() => navigate(`/trips/${t.id}`)}
                  className="flex items-start gap-4 p-4 bg-white rounded-2xl shadow-[var(--shadow-card)] text-left active:scale-[0.99] transition-transform">
                  {t.hero && <img src={t.hero} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-[var(--color-aubergine)] text-sm">{t.title}</div>
                    {t.subtitle && <div className="text-xs text-[var(--color-lavender)] mt-0.5">{t.subtitle}</div>}
                    <div className="text-xs text-[var(--color-lavender-lt)] mt-1 flex items-center gap-2">
                      <span><i className="fa-solid fa-map-pin text-[10px]" /> {t.places.length} Orte</span>
                      {t.isCurated && <span className="bg-[var(--color-bg-soft)] px-2 py-0.5 rounded-full text-[10px] text-[var(--color-lavender)]">Kuratiert</span>}
                      {t.myStatus === 'invited' && <span className="bg-[var(--color-amber)] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">Eingeladen</span>}
                      {t.myStatus === 'accepted' && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">Du bist dabei</span>}
                    </div>
                  </div>
                  <i className="fa-solid fa-chevron-right text-[var(--color-lavender-lt)] ml-auto mt-1 flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {editTagsPlace && (
        <TagEditorSheet
          place={editTagsPlace}
          tags={savedTags[editTagsPlace.id] ?? []}
          allTags={allTags}
          onClose={() => setEditTagsPlace(null)}
          onSave={tags => setPlaceTags(editTagsPlace.id, tags)}
        />
      )}

      <LegalFooter />
    </AppShell>
  );
}

// ─── Tag-Editor (Bottom-Sheet) ────────────────────────────────────────────────
function TagEditorSheet({ place, tags, allTags, onClose, onSave }: {
  place: Place; tags: string[]; allTags: string[];
  onClose: () => void; onSave: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const add = (t: string) => {
    const v = t.trim().slice(0, 24);
    if (!v || tags.includes(v)) { setInput(''); return; }
    onSave([...tags, v]); setInput('');
  };
  const remove = (t: string) => onSave(tags.filter(x => x !== t));
  const suggestions = allTags.filter(t => !tags.includes(t)).slice(0, 12);

  return (
    <BottomSheet open onClose={onClose} title={`Tags · ${place.name}`}>
      <div className="px-1 pb-4">
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {tags.map(t => (
              <span key={t} className="inline-flex items-center gap-1.5 bg-[var(--color-amber)]/15 text-[var(--color-amber)] text-xs font-bold px-2.5 py-1 rounded-full">
                {t}
                <button onClick={() => remove(t)} aria-label="Entfernen"><i className="fa-solid fa-xmark" /></button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--color-lavender)] mb-3">Noch keine Tags. Gib z. B. „Sommer", „mit Hund" oder „Date" ein.</p>
        )}

        <form onSubmit={e => { e.preventDefault(); add(input); }} className="flex gap-2 mb-3">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Neuer Tag…" maxLength={24} autoFocus
            className="flex-1 min-w-0 border-2 border-[var(--color-bg-soft)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-amber)]" />
          <button type="submit" disabled={!input.trim()}
            className="bg-[var(--color-amber)] text-white font-bold px-4 rounded-xl text-sm disabled:opacity-50">Hinzufügen</button>
        </form>

        {suggestions.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-lavender)] mb-1.5">Deine bisherigen Tags</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map(t => (
                <button key={t} onClick={() => add(t)}
                  className="bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] text-xs font-semibold px-2.5 py-1 rounded-full hover:bg-[var(--color-amber)]/15 transition-colors">+ {t}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
