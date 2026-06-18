import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { PlaceCard } from '../components/ui/PlaceCard.js';
import { useAppStore } from '../store/useAppStore.js';
import { CategoryFilter, placeMatchesCategory, EMPTY_CATEGORY } from '../components/ui/CategoryFilter.js';
import type { CategorySelection } from '../components/ui/CategoryFilter.js';
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
  const [tab, setTab]             = useState<Tab>(initialTab);
  const [q, setQ]                 = useState('');
  const [catSel, setCatSel] = useState<CategorySelection>(EMPTY_CATEGORY);
  const catActive = catSel.cat !== null || catSel.l1 !== null;
  const [showMap, setShowMap]     = useState(true);
  const [mapReady, setMapReady]   = useState(false);
  // Standort-Suche (wie Startseite): Stadt wählen → Reichweiten-Filter
  const [geoSugs, setGeoSugs]           = useState<GeoLocation[]>([]);
  const [showSugs, setShowSugs]         = useState(false);
  const [searchCenter, setSearchCenter] = useState<Coords | null>(null);
  const [centerLabel, setCenterLabel]   = useState<string | null>(null);
  const [radiusKm, setRadiusKm]         = useState(80);
  const [userCoords, setUserCoords]     = useState<Coords | null>(null);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { places, savedIds, loadPlaces, trips, loadTrips, createTrip } = useAppStore();

  useEffect(() => { loadPlaces(); loadTrips(); }, []); // eslint-disable-line
  useEffect(() => { setMapReady(true); }, []);

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

  // ── Gefilterte Orte: Reichweite + Freitext + Kategorie-Tag ───────────────
  const filteredPlaces = useMemo(() => {
    let list: (Place & { _dist?: number })[] = savedPlaces;
    if (catActive) list = list.filter(p => placeMatchesCategory(p, catSel));
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
  }, [savedPlaces, q, catSel, catActive, reachActive, activeCenter, radiusKm, travelMode, travelMinutes, iso]);

  // ── Gefilterte Trips: Kategorie-Tag + Freitext + Reichweite ──────────────
  const filteredTrips = useMemo(() => {
    let list: Trip[] = trips;
    if (catActive) list = list.filter(t => t.places.some(tp => tp.place && placeMatchesCategory(tp.place, catSel)));
    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter(t =>
        [t.title, t.subtitle ?? '', ...t.places.map(tp => `${tp.place?.name ?? ''} ${tp.place?.region ?? ''}`)]
          .join(' ').toLowerCase().includes(s));
    }
    if (reachActive && activeCenter) {
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
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, q, catSel, catActive, reachActive, activeCenter, radiusKm, travelMode, travelMinutes, iso]);

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

  const hasFilter = Boolean(q.trim() || catActive || reachActive);
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
    setQ(''); setCatSel(EMPTY_CATEGORY);
    setSearchCenter(null); setCenterLabel(null);
    setGeoSugs([]); setShowSugs(false);
    setTravelMode('radius');
  }

  return (
    <AppShell>
      <div className="px-6 pt-5 max-w-2xl mx-auto md:max-w-none md:px-8">
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-5" style={{ letterSpacing: '-0.02em' }}>
          Deine <em className="italic text-[var(--color-amber)]">Sammlung</em>
        </h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(['orte', 'trips'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-full font-semibold text-sm transition-colors ${
                tab === t ? 'bg-[var(--color-aubergine)] text-white' : 'bg-[var(--color-bg-soft)] text-[var(--color-lavender)]'
              }`}>
              {t === 'orte' ? `Orte (${savedPlaces.length})` : `Trips (${trips.length})`}
            </button>
          ))}
        </div>

        {/* ── Aktives Suchzentrum ───────────────────────────────────────── */}
        {searchCenter && centerLabel && (
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

        {/* ── Reichweite: Radius oder echte Fahrzeit (wie Startseite) ────── */}
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

        {/* ── Orte-Tab ──────────────────────────────────────────────────── */}
        {tab === 'orte' && (
          <>
            {/* Kategorien — Hauptkategorien (nach Profil sortiert) + Drilldown */}
            <div className="mb-4">
              <CategoryFilter value={catSel} onChange={setCatSel} />
            </div>

            {/* Trefferzahl bei aktivem Filter */}
            {hasFilter && (
              <p className="text-xs text-[var(--color-lavender)] mb-3">
                <span className="font-semibold text-[var(--color-aubergine)]">{filteredPlaces.length}</span>{' '}
                von {savedPlaces.length} gemerkten Orten
                {reachActive && travelMode === 'radius' && centerLabel && <> im Umkreis von {radiusKm} km um {centerLabel}</>}
                {reachActive && travelMode !== 'radius' && (
                  <> erreichbar in {travelMinutes} Min ({modeLabel}) {centerLabel ? `ab ${centerLabel}` : 'ab deinem Standort'}</>
                )}
              </p>
            )}

            {/* Karte */}
            {showMap && mapReady && savedPlaces.length > 0 && (
              <CollectionMap places={filteredPlaces} center={activeCenter} travel={travel}
                radiusKm={radiusKm} reachActive={reachActive}
                onOpen={id => navigate(`/place/${id}`)} />
            )}

            {savedPlaces.length === 0 ? (
              <div className="text-center py-16 text-[var(--color-lavender)]">
                <i className="fa-regular fa-bookmark text-5xl mb-4 opacity-30" />
                <p className="font-semibold mb-1">Noch nichts gemerkt</p>
                <p className="text-sm">Swipe Orte nach rechts, um sie hier zu speichern.</p>
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
                  {filteredPlaces.map(p => <PlaceCard key={p.id} place={p} />)}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Trips-Tab ─────────────────────────────────────────────────── */}
        {tab === 'trips' && (
          <div className="flex flex-col gap-3">
            {/* Kategorien — filtern Trips über ihre enthaltenen Orte */}
            <CategoryFilter value={catSel} onChange={setCatSel} />

            {/* Trefferzahl bei aktivem Filter */}
            {hasFilter && (
              <p className="text-xs text-[var(--color-lavender)]">
                <span className="font-semibold text-[var(--color-aubergine)]">{filteredTrips.length}</span>{' '}
                von {trips.length} Trips
                {reachActive && travelMode === 'radius' && centerLabel && <> im Umkreis von {radiusKm} km um {centerLabel}</>}
                {reachActive && travelMode !== 'radius' && (
                  <> erreichbar in {travelMinutes} Min ({modeLabel}) {centerLabel ? `ab ${centerLabel}` : 'ab deinem Standort'}</>
                )}
              </p>
            )}

            {/* Karte: alle Orte der gefilterten Trips */}
            {showMap && mapReady && trips.length > 0 && (
              <CollectionMap places={tripMapPlaces} center={activeCenter} travel={travel}
                radiusKm={radiusKm} reachActive={reachActive}
                onOpen={id => navigate(`/place/${id}`)} />
            )}

            {/* Create */}
            <button onClick={() => navigate('/trip-wizard')}
              className="flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-[var(--color-amber)] text-[var(--color-amber)] font-semibold text-sm active:scale-[0.98] transition-transform">
              <i className="fa-solid fa-plus text-lg" />
              Neuen Trip erstellen
            </button>

            {filteredTrips.length === 0 && hasFilter ? (
              <div className="text-center py-10 text-[var(--color-lavender)]">
                <i className="fa-solid fa-magnifying-glass text-4xl mb-3 opacity-30" />
                <p className="font-semibold mb-1">Keine Treffer</p>
                <p className="text-sm">
                  {reachActive
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
      <LegalFooter />
    </AppShell>
  );
}
