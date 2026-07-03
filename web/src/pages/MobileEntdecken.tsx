import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AppShell } from '../components/layout/AppShell.js';
import { useAppStore } from '../store/useAppStore.js';
import { requestGpsPosition, geocodeSuggestions, distanceKm } from '../services/geoService.js';
import type { Coords, GeoLocation } from '../services/geoService.js';
import { EFFECTIVE_SPEED_KMH, pointInGeoJSON, reachBBoxPoints } from '../utils/geo.js';
import { useTravelReach } from '../hooks/useTravelReach.js';
import { ReachControls } from '../components/ui/ReachControls.js';
import { ReachLayer } from '../components/map/ReachLayer.js';
import { CategoryFilter, placeMatchesCategory, EMPTY_CATEGORY } from '../components/ui/CategoryFilter.js';
import type { CategorySelection } from '../components/ui/CategoryFilter.js';
import type { Place, Transport } from '../types/index.js';

const orangeMarker = L.divIcon({
  html: `<div style="width:15px;height:15px;border-radius:50%;background:#F99039;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(52,37,76,0.35);"></div>`,
  iconSize: [15, 15], iconAnchor: [7, 7], className: '',
});
const purpleMarker = L.divIcon({
  html: `<div style="position:relative;width:26px;height:26px;">
    <div style="position:absolute;inset:0;border-radius:50%;background:rgba(124,58,237,0.22);transform:scale(1.9);"></div>
    <div style="position:absolute;inset:0;border-radius:50%;background:#7c3aed;border:3px solid #fff;box-shadow:0 3px 9px rgba(52,37,76,0.5);"></div>
  </div>`,
  iconSize: [26, 26], iconAnchor: [13, 13], className: '',
});

const T_ICON: Record<string, string> = {
  radius: 'fa-circle-dot', walk: 'fa-person-walking', bike: 'fa-bicycle',
  transit: 'fa-train-subway', train: 'fa-train', auto: 'fa-car',
};
type Mode = 'newest' | 'all' | 'top5' | 'saved';
const MODES: { id: Mode; label: string }[] = [
  { id: 'newest', label: 'Neueste' }, { id: 'all', label: 'Alle' },
  { id: 'top5', label: 'Top 5' }, { id: 'saved', label: 'Gemerkt' },
];

// Karte auf die Reichweite (Radius/Isochrone) einpassen — sonst liegt der Kreis außerhalb des Sichtfelds
function FitReach({ center, travel, radiusKm, fallback }: {
  center: Coords | null;
  travel: { mode: 'radius' | Transport; minutes: number; iso: ReturnType<typeof useTravelReach>['iso'] };
  radiusKm: number;
  fallback: [number, number][];
}) {
  const map = useMap();
  const pts = center ? reachBBoxPoints(center, travel, radiusKm) : fallback;
  const key = pts.map(p => p.map(n => n.toFixed(3)).join(',')).join('|');
  useEffect(() => {
    if (!pts.length) return;
    if (pts.length === 1) { map.setView(pts[0], 12, { animate: true }); return; }
    try { map.fitBounds(pts as [number, number][], { padding: [56, 56], maxZoom: 13, animate: true }); } catch { /* ignore */ }
  }, [key]); // eslint-disable-line
  return null;
}

export function MobileEntdecken() {
  const navigate = useNavigate();
  const { places, loadPlaces, savedIds, funnelAnswers } = useAppStore();

  const [userCoords, setUserCoords] = useState<Coords | null>(() => funnelAnswers?.coords ?? null);
  const [searchCenter, setSearchCenter] = useState<Coords | null>(null);
  const [searchLabel, setSearchLabel] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(80);
  const [mode, setMode] = useState<Mode>('newest');
  const [catSel, setCatSel] = useState<CategorySelection>(EMPTY_CATEGORY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | 'loc' | 'cat' | 'transport'>(null);

  // Standort-Suche (Adresse → Suchzentrum)
  const [searchQuery, setSearchQuery] = useState('');
  const [geoSug, setGeoSug] = useState<GeoLocation[]>([]);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reachCenter = searchCenter ?? userCoords;
  const reach = useTravelReach(reachCenter);
  const travel = { mode: reach.travelMode, minutes: reach.travelMinutes, iso: reach.iso, loading: reach.isoLoading };
  const catActive = catSel.cat !== null || catSel.l1 !== null;

  useEffect(() => {
    loadPlaces();
    if (!userCoords) requestGpsPosition().then(setUserCoords).catch(() => {});
  }, []); // eslint-disable-line

  // Orte filtern: Kategorie + Reichweite + Modus
  const shownPlaces = useMemo(() => {
    let base = places.filter(p => p.lat != null && p.lng != null);
    if (catActive) base = base.filter(p => placeMatchesCategory(p, catSel));
    if (reachCenter) {
      const within = (p: Place) =>
        reach.travelMode === 'radius' ? distanceKm(reachCenter, { lat: p.lat!, lng: p.lng! }) <= radiusKm
        : reach.iso                   ? pointInGeoJSON(p.lat!, p.lng!, reach.iso.feature.geometry)
        : distanceKm(reachCenter, { lat: p.lat!, lng: p.lng! }) <= (EFFECTIVE_SPEED_KMH[reach.travelMode as Transport] * reach.travelMinutes) / 60;
      base = base.filter(within);
    }
    if (mode === 'saved') return base.filter(p => savedIds.has(p.id));
    if (mode === 'top5')  return [...base].sort((a, b) => (b.match - a.match) || (b.rating - a.rating)).slice(0, 5);
    if (mode === 'newest') return [...base].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return base;
  }, [places, catSel, catActive, reachCenter, reach.travelMode, reach.travelMinutes, reach.iso, radiusKm, mode, savedIds]);

  const preview = shownPlaces.find(p => p.id === selectedId) ?? shownPlaces[0] ?? null;
  const fallbackPts = useMemo<[number, number][]>(
    () => shownPlaces.slice(0, 40).map(p => [p.lat!, p.lng!]), [shownPlaces]);

  const navUrl = preview?.lat && preview?.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${preview.lat},${preview.lng}`
    : '#';

  function onSearchInput(val: string) {
    setSearchQuery(val);
    if (geoTimer.current) clearTimeout(geoTimer.current);
    if (val.trim().length >= 3) {
      geoTimer.current = setTimeout(async () => setGeoSug(await geocodeSuggestions(val).catch(() => [])), 400);
    } else setGeoSug([]);
  }
  function pickCenter(s: GeoLocation) {
    setSearchCenter(s.coords); setSearchLabel(s.displayName);
    setSearchQuery(''); setGeoSug([]); setPanel(null);
  }
  function resetToGps() { setSearchCenter(null); setSearchLabel(null); setSearchQuery(''); setGeoSug([]); }

  const toolBtn = 'w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0';
  const toolShadow = { boxShadow: '0 2px 10px rgba(52,37,76,0.18)' } as const;

  return (
    <AppShell noHeader>
      {/* Vollbildkarte */}
      <div className="fixed inset-0 z-0" style={{ background: '#e8e4ee' }}>
        <MapContainer center={reachCenter ? [reachCenter.lat, reachCenter.lng] : [51.1657, 10.4515]}
          zoom={reachCenter ? 9 : 6} scrollWheelZoom zoomControl={false} attributionControl={false}
          style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          <ReachLayer center={reachCenter} travel={travel} radiusKm={radiusKm} />
          {shownPlaces.map(p => (
            <Marker key={p.id} position={[p.lat!, p.lng!]}
              icon={p.id === preview?.id ? purpleMarker : orangeMarker}
              zIndexOffset={p.id === preview?.id ? 1000 : 0}
              eventHandlers={{ click: () => setSelectedId(p.id) }} />
          ))}
          <FitReach center={reachCenter} travel={travel} radiusKm={radiusKm} fallback={fallbackPts} />
        </MapContainer>
      </div>

      {/* Funnel-Sheet oben — antippen startet den Funnel */}
      <div className="fixed top-0 left-0 right-0 z-20" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={() => navigate('/funnel')} className="block w-full"
          style={{ background: 'var(--color-amber)', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, boxShadow: '0 8px 22px rgba(249,144,57,0.28)' }}>
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center justify-center gap-2.5">
              <i className="fa-solid fa-wand-magic-sparkles text-white text-sm" />
              <span className="text-white font-semibold text-sm">Neue Geheimtrips finden</span>
              <i className="fa-solid fa-chevron-down text-white text-xs opacity-80" />
            </div>
            <div className="w-9 h-1 rounded-full bg-white/60 mx-auto mt-2" />
          </div>
        </button>
      </div>

      {/* Toolbar */}
      <div className="fixed left-0 right-0 z-20 px-3 flex flex-col gap-2" style={{ top: 'calc(env(safe-area-inset-top) + 60px)' }}>
        <div className="flex items-center gap-1.5">
          <button onClick={() => navigate(-1)} className={toolBtn} style={toolShadow} aria-label="Zurück">
            <i className="fa-solid fa-arrow-left text-[var(--color-aubergine)]" />
          </button>
          <button onClick={() => setPanel(panel === 'loc' ? null : 'loc')} className={toolBtn}
            style={{ ...toolShadow, color: searchCenter ? '#F99039' : '#34254c' }} aria-label="Standort">
            <i className="fa-solid fa-location-dot" />
          </button>
          <button onClick={() => setPanel(panel === 'cat' ? null : 'cat')} className={toolBtn}
            style={{ ...toolShadow, color: catActive ? '#F99039' : '#34254c' }} aria-label="Kategorien">
            <i className="fa-solid fa-layer-group" />
          </button>
          <button onClick={() => setPanel(panel === 'transport' ? null : 'transport')}
            className="flex-1 flex items-center gap-2 bg-white rounded-xl h-10 px-3" style={toolShadow}>
            <i className={`fa-solid ${T_ICON[reach.travelMode]} text-sm`} style={{ color: '#F99039' }} />
            <i className="fa-solid fa-chevron-down text-[10px]" style={{ color: '#b9a8c4' }} />
            <span className="w-px h-4 bg-[var(--color-bg-soft)]" />
            <span className="text-xs font-semibold text-[var(--color-aubergine)]">
              {reach.travelMode === 'radius' ? `${radiusKm} km` : `${reach.travelMinutes} Min`}
            </span>
            {reach.isoLoading && <i className="fa-solid fa-circle-notch fa-spin text-[10px] ml-auto" style={{ color: '#b9a8c4' }} />}
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className="text-[11px] font-semibold rounded-full px-3 py-1.5 flex-shrink-0 transition-colors"
              style={mode === m.id
                ? { background: '#34254c', color: 'white' }
                : { background: 'white', color: '#71587a', ...toolShadow }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Popovers */}
      {panel && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setPanel(null)} />
          <div className="fixed left-3 right-3 z-40 bg-white rounded-2xl p-3.5"
            style={{ top: 'calc(env(safe-area-inset-top) + 116px)', boxShadow: '0 14px 40px rgba(52,37,76,0.25)', maxHeight: '58vh', overflowY: 'auto' }}>
            {panel === 'loc' && (
              <div>
                <div className="flex items-center gap-2 bg-[var(--color-bg-soft)] rounded-xl px-3 h-10 mb-2">
                  <i className="fa-solid fa-magnifying-glass text-[var(--color-lavender)] text-sm" />
                  <input autoFocus value={searchQuery} onChange={e => onSearchInput(e.target.value)}
                    placeholder="Stadt oder Adresse…"
                    className="flex-1 bg-transparent outline-none text-sm text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)]" />
                </div>
                {geoSug.length > 0 ? geoSug.map((s, i) => (
                  <button key={i} onClick={() => pickCenter(s)}
                    className="w-full flex items-start gap-3 px-2 py-2 text-left rounded-xl hover:bg-[var(--color-bg-soft)]">
                    <i className="fa-solid fa-location-dot text-[var(--color-amber)] mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-aubergine)] truncate">{s.displayName}</p>
                      <p className="text-xs text-[var(--color-lavender)] truncate">{s.fullAddress}</p>
                    </div>
                  </button>
                )) : (
                  <div className="flex items-center justify-between px-1 py-1.5">
                    <span className="text-xs text-[var(--color-lavender)]">
                      <i className="fa-solid fa-location-crosshairs text-[var(--color-amber)] mr-1.5" />
                      {searchLabel ?? (userCoords ? 'Mein Standort' : 'Kein Standort')}
                    </span>
                    {searchCenter && (
                      <button onClick={resetToGps} className="text-xs font-semibold" style={{ color: '#7c3aed' }}>
                        <i className="fa-solid fa-location-arrow mr-1" />GPS
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {panel === 'cat' && <CategoryFilter value={catSel} onChange={setCatSel} />}
            {panel === 'transport' && (
              <ReachControls
                travelMode={reach.travelMode} setTravelMode={reach.setTravelMode}
                travelMinutes={reach.travelMinutes} setTravelMinutes={reach.setTravelMinutes}
                radiusKm={radiusKm} setRadiusKm={setRadiusKm}
                iso={reach.iso} isoLoading={reach.isoLoading} />
            )}
          </div>
        </>
      )}

      {/* Orts-Vorschau unten (aktueller = lila) */}
      {preview && (
        <div className="fixed left-3 right-3 z-20" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}>
          <div className="rounded-3xl px-3 pt-2 pb-3" style={{ background: '#FBF9FC', boxShadow: '0 -8px 24px rgba(52,37,76,0.16)' }}>
            <div className="w-10 h-1.5 rounded-full mx-auto mb-2.5" style={{ background: '#d9cfe2' }} />
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(`/place/${preview.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.99] transition-transform">
                <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 bg-[var(--color-bg-soft)]">
                  <img src={preview.hero} alt={preview.name} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="font-display font-bold text-[var(--color-aubergine)] leading-tight truncate">{preview.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {preview.reviews > 0 && (
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <i className="fa-solid fa-star text-[var(--color-amber)] text-xs" />
                        <span className="text-sm font-bold text-[var(--color-aubergine)]">{preview.rating}</span>
                      </span>
                    )}
                    <span className="text-xs text-[var(--color-lavender)] truncate">{preview.region}</span>
                  </div>
                </div>
              </button>
              <a href={navUrl} target="_blank" rel="noopener noreferrer"
                className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-amber)', color: 'white' }} aria-label="Route">
                <i className="fa-solid fa-diamond-turn-right" />
              </a>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
