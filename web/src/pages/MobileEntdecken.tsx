import React, { useEffect, useMemo, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
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
import { TagFilter, placeMatchesTag, EMPTY_TAG_SEL } from '../components/ui/TagFilter.js';
import type { TagSelection } from '../components/ui/TagFilter.js';
import { SwipeDeck } from '../components/ui/SwipeDeck.js';
import { useRequireAuth } from '../hooks/useRequireAuth.js';

// Ortsdetails im Overlay (lazy → hält das Karten-Bundle klein)
const PlaceDetailEmbed = lazy(() => import('./PlaceDetailPage.js').then(m => ({ default: m.PlaceDetailPage })));
import { useTaxVocab, tagInfoFrom } from '../data/taxVocab.js';
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
type Mode = 'all' | 'saved' | 'new' | 'foryou';
const MODES: { id: Mode; label: string }[] = [
  { id: 'all', label: 'Alle' }, { id: 'saved', label: 'Nur gemerkte' },
  { id: 'new', label: 'Nur neue' }, { id: 'foryou', label: 'Für dich' },
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

// Karte auf den aktuellen Swipe-Ort fliegen (damit man beim Runterziehen sieht, wo er liegt)
function SwipeFlyTo({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.flyTo([lat, lng], Math.max(map.getZoom(), 11), { duration: 0.6 });
  }, [lat, lng]); // eslint-disable-line
  return null;
}

// Merkt sich die Entdecken-Einstellungen für die Session, damit „Zurück" vom Ort
// die vorherige Liste + Reichweite wiederherstellt (statt frisch zu starten).
const entdeckenCache = {
  searchCenter: null as Coords | null,
  searchLabel: null as string | null,
  userCoords: null as Coords | null,   // zuletzt bekannter GPS-Standort → „Zurück" muss nicht erst neu orten
  radiusKm: 10,   // Standard vorerst 10 km — Karte zoomt beim Laden genau auf diesen Radius
  mode: 'all' as Mode,
  tagSel: EMPTY_TAG_SEL as TagSelection,
  travelMode: 'radius' as 'radius' | Transport,
  travelMinutes: 45,
  selectedId: null as string | null,
  sheetExpanded: false,
  scrollTop: 0,
};

// Langes Drücken (mobil) bzw. Rechtsklick (Desktop) auf die Karte → Startpunkt für den Radius
function LongPressPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ contextmenu: e => { e.originalEvent?.preventDefault?.(); onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export function MobileEntdecken() {
  const navigate = useNavigate();
  const { places, loadPlaces, savedIds, visitedIds, funnelAnswers } = useAppStore();
  const vocab = useTaxVocab();
  const { gate } = useRequireAuth();

  const [userCoords, setUserCoords] = useState<Coords | null>(() => entdeckenCache.userCoords ?? funnelAnswers?.coords ?? null);
  const [searchCenter, setSearchCenter] = useState<Coords | null>(entdeckenCache.searchCenter);
  const [searchLabel, setSearchLabel] = useState<string | null>(entdeckenCache.searchLabel);
  const [pickToast, setPickToast] = useState(false);
  const pickToastTimer = useRef<number>(0);
  const [radiusKm, setRadiusKm] = useState(entdeckenCache.radiusKm);
  const [mode, setMode] = useState<Mode>(entdeckenCache.mode);
  const [tagSel, setTagSel] = useState<TagSelection>(entdeckenCache.tagSel);
  const [selectedId, setSelectedId] = useState<string | null>(entdeckenCache.selectedId);
  const [panel, setPanel] = useState<null | 'cat' | 'reach'>(null);

  // Standort-Suche (Adresse → Suchzentrum)
  const [searchQuery, setSearchQuery] = useState('');
  const [geoSug, setGeoSug] = useState<GeoLocation[]>([]);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reachCenter = searchCenter ?? userCoords;
  const reach = useTravelReach(reachCenter, { mode: entdeckenCache.travelMode, minutes: entdeckenCache.travelMinutes });
  const travel = useMemo(() => ({ mode: reach.travelMode, minutes: reach.travelMinutes, iso: reach.iso, loading: reach.isoLoading }),
    [reach.travelMode, reach.travelMinutes, reach.iso, reach.isoLoading]);
  const catActive = tagSel.group !== null || tagSel.tag !== null;

  useEffect(() => {
    loadPlaces();
    if (!userCoords) requestGpsPosition().then(setUserCoords).catch(() => {});
  }, []); // eslint-disable-line

  // Orte filtern: Kategorie + Reichweite + Modus
  const shownPlaces = useMemo(() => {
    let base = places.filter(p => p.lat != null && p.lng != null);
    if (catActive) base = base.filter(p => placeMatchesTag(p, tagSel, vocab));
    if (reachCenter) {
      const within = (p: Place) =>
        reach.travelMode === 'radius' ? distanceKm(reachCenter, { lat: p.lat!, lng: p.lng! }) <= radiusKm
        : reach.iso                   ? pointInGeoJSON(p.lat!, p.lng!, reach.iso.feature.geometry)
        : distanceKm(reachCenter, { lat: p.lat!, lng: p.lng! }) <= (EFFECTIVE_SPEED_KMH[reach.travelMode as Transport] * reach.travelMinutes) / 60;
      base = base.filter(within);
    }
    if (mode === 'saved') return base.filter(p => savedIds.has(p.id));
    if (mode === 'new')   return base.filter(p => !visitedIds.has(p.id) && !savedIds.has(p.id));
    if (mode === 'foryou') {
      // „Für dich": Orte in den Gruppen, die die Person schon gemerkt hat (echtes Signal);
      // ohne gemerkte Orte fällt es auf die beste Übereinstimmung (match) zurück.
      const likedGroups = new Set(
        places.filter(p => savedIds.has(p.id)).map(p => tagInfoFrom(vocab, p.tagSlug)?.groupSlug).filter(Boolean),
      );
      const pool = base.filter(p => !savedIds.has(p.id));
      return likedGroups.size
        ? pool.filter(p => likedGroups.has(tagInfoFrom(vocab, p.tagSlug)?.groupSlug ?? ''))
        : [...pool].sort((a, b) => (b.match - a.match) || (b.rating - a.rating));
    }
    return base; // 'all'
  }, [places, tagSel, catActive, vocab, reachCenter, reach.travelMode, reach.travelMinutes, reach.iso, radiusKm, mode, savedIds, visitedIds]);

  // Liste nach Entfernung sortiert (nächste zuerst)
  const listPlaces = useMemo(() => {
    const arr = shownPlaces.map(p => ({
      p, dist: reachCenter && p.lat != null && p.lng != null ? distanceKm(reachCenter, { lat: p.lat, lng: p.lng }) : null,
    }));
    arr.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
    return arr;
  }, [shownPlaces, reachCenter]);

  const preview = shownPlaces.find(p => p.id === selectedId) ?? listPlaces[0]?.p ?? null;
  const fallbackPts = useMemo<[number, number][]>(
    () => shownPlaces.slice(0, 40).map(p => [p.lat!, p.lng!]), [shownPlaces]);

  // ── Ziehbares Listen-Sheet ────────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null);
  const [sheetExpanded, setSheetExpanded] = useState(entdeckenCache.sheetExpanded);
  const [swipeOpen, setSwipeOpen] = useState(false);   // Swipe-Sheet über der Karte
  const [swipeFocus, setSwipeFocus] = useState<Place | null>(null);   // aktueller Swipe-Ort (Karte fokussiert ihn)
  const [swipeLow, setSwipeLow] = useState(false);     // Sheet heruntergezogen → mehr Karte sichtbar
  const [swipeDragY, setSwipeDragY] = useState(0);
  const swipeDrag = useRef<{ startY: number; moved: number } | null>(null);
  const [placeOpen, setPlaceOpen] = useState<string | null>(null);   // Ortsdetails im Overlay
  const closeSwipe = () => { setSwipeOpen(false); setSwipeFocus(null); setSwipeLow(false); setSwipeDragY(0); };
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetDrag = useRef<{ startY: number; startOffset: number; moved: number } | null>(null);
  const listSwipe = useRef<{ x: number; y: number } | null>(null);
  const justSwiped = useRef(false);
  // Peek-Höhe so wählen, dass Griff + Kopf + der erste Ort ÜBER der Bottom-Nav sichtbar sind.
  // Sheet-Oberkante (eingeklappt) = 0.38·H (top:38vh) + Offset; sichtbar = H − Offset − 0.38·H.
  const peekOffset = () => {
    const H = typeof window !== 'undefined' ? window.innerHeight : 800;
    return Math.max(120, Math.round(H * 0.62 - 238)); // 238 = Nav(76) + Griff/Kopf(70) + erster Eintrag(92)
  };
  useEffect(() => {
    if (sheetDragging) return;
    const apply = () => setSheetDragY(sheetExpanded ? 0 : peekOffset());
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [sheetExpanded, sheetDragging]);

  // Einstellungen für „Zurück" merken — jeder Render hält den Cache aktuell
  useEffect(() => {
    Object.assign(entdeckenCache, {
      searchCenter, searchLabel, userCoords, radiusKm, mode, tagSel,
      travelMode: reach.travelMode, travelMinutes: reach.travelMinutes,
      selectedId, sheetExpanded, scrollTop: listRef.current?.scrollTop ?? entdeckenCache.scrollTop,
    });
  });
  // Beim Öffnen zuletzt gemerkte Scroll-Position der Liste wiederherstellen
  useEffect(() => {
    if (entdeckenCache.scrollTop && listRef.current) listRef.current.scrollTop = entdeckenCache.scrollTop;
  }, []); // eslint-disable-line

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
  // Langes Drücken auf die Karte → diesen Punkt als Radius-Startpunkt setzen
  function pickMapPoint(lat: number, lng: number) {
    setSearchCenter({ lat, lng });
    setSearchLabel('Auf der Karte gewählt');
    setPanel(null);
    setPickToast(true); window.clearTimeout(pickToastTimer.current); pickToastTimer.current = window.setTimeout(() => setPickToast(false), 1900);
  }

  function onSheetTouchStart(e: React.TouchEvent) {
    sheetDrag.current = { startY: e.touches[0].clientY, startOffset: sheetDragY, moved: 0 };
    setSheetDragging(true);
  }
  function onSheetTouchMove(e: React.TouchEvent) {
    const d = sheetDrag.current; if (!d) return;
    const delta = e.touches[0].clientY - d.startY;
    d.moved = Math.max(d.moved, Math.abs(delta));
    setSheetDragY(Math.min(Math.max(d.startOffset + delta, 0), peekOffset()));
  }
  function onSheetTouchEnd() {
    const d = sheetDrag.current; setSheetDragging(false);
    if (!d) return;
    if (d.moved < 6) { setSheetExpanded(v => !v); return; }
    setSheetExpanded(sheetDragY < peekOffset() / 2);
  }
  const selectPlace = useCallback((id: string) => {
    setSelectedId(id);
    setSheetExpanded(true);
    setTimeout(() => listRef.current?.querySelector(`[data-place-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  }, []);
  // Swipe-Sheet über der Karte — nutzt direkt die auf der Karte gefilterten Orte (kein Seitenwechsel)
  function goSwipe() { gate(() => { setSwipeOpen(true); setSwipeLow(false); }, 'Melde dich an, um den Swipe-Modus zu nutzen.'); }
  // Swipe-Sheet ziehen: runter → mehr Karte (aktueller Ort sichtbar), hoch → wieder swipen
  function onSwipeSheetStart(e: React.TouchEvent) { swipeDrag.current = { startY: e.touches[0].clientY, moved: 0 }; }
  function onSwipeSheetMove(e: React.TouchEvent) {
    const d = swipeDrag.current; if (!d) return;
    const delta = e.touches[0].clientY - d.startY;
    d.moved = Math.max(d.moved, Math.abs(delta));
    setSwipeDragY(delta);
  }
  function onSwipeSheetEnd() {
    const d = swipeDrag.current; swipeDrag.current = null; if (!d) return;
    const dy = swipeDragY;
    setSwipeDragY(0);
    if (d.moved < 6) { setSwipeLow(v => !v); return; }        // Tippen = umschalten Swipe/Karte
    if (swipeLow && dy > 90) { closeSwipe(); return; }         // aus der Kartenansicht weit runter → zurück zur Liste
    setSwipeLow(dy > 40 ? true : dy < -40 ? false : swipeLow);
  }
  function onListTouchStart(e: React.TouchEvent) { const t = e.touches[0]; listSwipe.current = { x: t.clientX, y: t.clientY }; }
  function onListTouchEnd(e: React.TouchEvent) {
    const s = listSwipe.current; listSwipe.current = null; if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (dx > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {   // nach rechts wischen → Swipe-Modus
      justSwiped.current = true;
      setTimeout(() => { justSwiped.current = false; }, 400);
      goSwipe();
    }
  }
  const fmtDist = (d: number) => d < 1 ? `${Math.round(d * 1000)} m` : `${d < 10 ? d.toFixed(1) : Math.round(d)} km`;

  const toolBtn = 'w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0';
  const toolShadow = { boxShadow: '0 2px 10px rgba(52,37,76,0.18)' } as const;

  // Marker memoisieren → beim Sheet-Ziehen (häufige Re-Renders) werden NICHT alle Leaflet-Marker
  // neu gebunden (das war die Hänger-Ursache auf Mobil).
  const highlightId = swipeOpen ? swipeFocus?.id : preview?.id;
  const markerEls = useMemo(() => shownPlaces.map(p => (
    <Marker key={p.id} position={[p.lat!, p.lng!]}
      icon={p.id === highlightId ? purpleMarker : orangeMarker}
      zIndexOffset={p.id === highlightId ? 1000 : 0}
      eventHandlers={{ click: () => selectPlace(p.id) }} />
  )), [shownPlaces, highlightId, selectPlace]);

  return (
    <AppShell>
      {/* Vollbildkarte */}
      <div className="fixed inset-0 z-0" style={{ background: '#e8e4ee' }}>
        <MapContainer center={reachCenter ? [reachCenter.lat, reachCenter.lng] : [51.1657, 10.4515]}
          zoom={reachCenter ? 9 : 6} scrollWheelZoom zoomControl={false} attributionControl={false}
          style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          <LongPressPick onPick={pickMapPoint} />
          <ReachLayer center={reachCenter} travel={travel} radiusKm={radiusKm} />
          {markerEls}
          <FitReach center={reachCenter} travel={travel} radiusKm={radiusKm} fallback={fallbackPts} />
          <SwipeFlyTo lat={swipeOpen ? swipeFocus?.lat ?? null : null} lng={swipeOpen ? swipeFocus?.lng ?? null : null} />
        </MapContainer>
      </div>

      {/* Kurze Bestätigung nach dem Setzen eines Startpunkts (der Hinweis dazu steht im Standort-Panel) */}
      {pickToast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-40 pointer-events-none" style={{ top: '31%' }}>
          <span className="text-xs font-bold text-white bg-[var(--color-aubergine)] px-3.5 py-2 rounded-full shadow-lg">
            <i className="fa-solid fa-location-crosshairs text-[var(--color-amber)] mr-1.5" />Startpunkt gesetzt
          </span>
        </div>
      )}

      {/* Toolbar — direkt unter dem Standard-Header. Beim Swipen (Karte nicht sichtbar) fliegt sie
          nach oben weg; sobald man das Swipe-Sheet runterzieht (swipeLow), fliegt sie wieder rein. */}
      <div className="fixed left-0 right-0 z-30 px-3 flex flex-col gap-2"
        style={{
          top: '52px',
          transform: (swipeOpen && !swipeLow) ? 'translateY(-150%)' : 'translateY(0)',
          opacity: (swipeOpen && !swipeLow) ? 0 : 1,
          pointerEvents: (swipeOpen && !swipeLow) ? 'none' : 'auto',
          transition: 'transform .32s cubic-bezier(.32,.72,0,1), opacity .28s ease',
        }}>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setPanel(panel === 'cat' ? null : 'cat')} className={toolBtn}
            style={{ ...toolShadow, color: catActive ? '#F99039' : '#34254c' }} aria-label="Filter">
            <i className="fa-solid fa-filter" />
          </button>
          {/* Standort + Reichweite in einer Leiste: tippen öffnet beides; geschlossen zeigt sie Ort + Radius */}
          <button onClick={() => setPanel(panel === 'reach' ? null : 'reach')}
            className="flex-1 min-w-0 flex items-center gap-2 bg-white rounded-xl h-10 px-3" style={toolShadow}>
            <i className="fa-solid fa-location-dot text-sm flex-shrink-0" style={{ color: searchCenter ? '#F99039' : '#34254c' }} />
            <span className="text-xs font-semibold text-[var(--color-aubergine)] truncate flex-1 text-left">
              {searchLabel ?? (userCoords ? 'Mein Standort' : 'Standort wählen')}
            </span>
            <span className="w-px h-4 bg-[var(--color-bg-soft)] flex-shrink-0" />
            <i className={`fa-solid ${T_ICON[reach.travelMode]} text-sm flex-shrink-0`} style={{ color: '#F99039' }} />
            <span className="text-xs font-semibold text-[var(--color-aubergine)] whitespace-nowrap flex-shrink-0">
              {reach.travelMode === 'radius' ? `${radiusKm} km` : `${reach.travelMinutes} Min`}
            </span>
            {reach.isoLoading
              ? <i className="fa-solid fa-circle-notch fa-spin text-[10px] flex-shrink-0" style={{ color: '#b9a8c4' }} />
              : <i className="fa-solid fa-chevron-down text-[10px] flex-shrink-0" style={{ color: '#b9a8c4' }} />}
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => (m.id === 'saved' || m.id === 'foryou')
              ? gate(() => setMode(m.id), 'Melde dich an für persönliche Filter wie „Nur gemerkte" und „Für dich".')
              : setMode(m.id)}
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
            style={{ top: '108px', boxShadow: '0 14px 40px rgba(52,37,76,0.25)', maxHeight: '58vh', overflowY: 'auto' }}>
            {panel === 'cat' && <TagFilter value={tagSel} onChange={setTagSel} />}
            {panel === 'reach' && (
              <div className="space-y-3">
                {/* Standort */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2 px-0.5">Standort</p>
                  <div className="flex items-center gap-2 bg-[var(--color-bg-soft)] rounded-xl px-3 h-10 mb-2">
                    <i className="fa-solid fa-magnifying-glass text-[var(--color-lavender)] text-sm" />
                    <input value={searchQuery} onChange={e => onSearchInput(e.target.value)}
                      placeholder="Stadt oder Adresse…"
                      className="flex-1 bg-transparent outline-none text-sm text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)]" />
                  </div>
                  <p className="text-[11px] text-[var(--color-lavender)] mb-2 px-1">
                    <i className="fa-solid fa-hand-pointer text-[var(--color-amber)] mr-1.5" />Tipp: lange auf die Karte drücken, um direkt einen Startpunkt zu setzen.
                  </p>
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
                <div className="h-px bg-[var(--color-bg-soft)]" />
                {/* Reichweite (Radius bzw. Reisezeit) */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2 px-0.5">Reichweite</p>
                  <ReachControls
                    travelMode={reach.travelMode} setTravelMode={reach.setTravelMode}
                    travelMinutes={reach.travelMinutes} setTravelMinutes={reach.setTravelMinutes}
                    radiusKm={radiusKm} setRadiusKm={setRadiusKm}
                    iso={reach.iso} isoLoading={reach.isoLoading} />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Orts-Liste als ziehbares Bottom-Sheet (nach Entfernung sortiert) — beim Swipen ausgeblendet */}
      <div className="fixed left-0 right-0 z-20 flex flex-col overflow-hidden rounded-t-[1.75rem]"
        style={{
          top: '38vh', bottom: 0, background: '#FBF9FC',
          boxShadow: '0 -8px 30px rgba(52,37,76,0.18)',
          transform: `translateY(${sheetDragY}px)`,
          transition: sheetDragging ? 'none' : 'transform .34s cubic-bezier(.32,.72,0,1)',
          display: swipeOpen ? 'none' : undefined,
        }}>
        {/* Griff + Kopf (Zieh-Bereich) */}
        <div className="flex-shrink-0" onTouchStart={onSheetTouchStart} onTouchMove={onSheetTouchMove} onTouchEnd={onSheetTouchEnd} style={{ touchAction: 'none' }}>
          <div className="flex justify-center pt-2.5 pb-1.5"><div className="w-10 h-1.5 rounded-full" style={{ background: '#d9cfe2' }} /></div>
          <div className="px-4 pb-2.5 flex items-center justify-between gap-2">
            <p className="font-display font-bold text-[var(--color-aubergine)]">
              {listPlaces.length} {listPlaces.length === 1 ? 'Ort' : 'Orte'}{reachCenter ? ' in der Nähe' : ''}
            </p>
            <button onClick={goSwipe}
              onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--color-amber)', color: 'white' }}>
              <i className="fa-solid fa-layer-group" /> Swipen
            </button>
          </div>
        </div>
        {/* Scrollbare Liste — nach rechts wischen startet den Swipe-Modus */}
        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 88px)' }}
          onTouchStart={onListTouchStart} onTouchEnd={onListTouchEnd}>
          {listPlaces.length === 0 ? (
            <div className="text-center py-12 text-[var(--color-lavender)] text-sm">
              <i className="fa-solid fa-map-location-dot text-3xl mb-3 opacity-40 block" />
              Keine Orte im Radius. Erhöhe Reisezeit/Radius oder ändere die Kategorie.
            </div>
          ) : listPlaces.map(({ p, dist }) => (
            <button key={p.id} data-place-id={p.id} onClick={() => { if (justSwiped.current) return; setPlaceOpen(p.id); }}
              className="w-full flex items-center gap-3 py-2 px-2 rounded-2xl text-left transition-colors active:scale-[0.99]"
              style={{ background: p.id === selectedId ? '#F1ECF4' : 'transparent' }}>
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-[var(--color-bg-soft)]">
                <img src={p.hero} alt={p.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--color-aubergine)] truncate">{p.name}</p>
                <p className="text-xs text-[var(--color-lavender)] truncate">{p.region} · {tagInfoFrom(vocab, p.tagSlug)?.label ?? p.categoryLabel}</p>
                <div className="flex items-center gap-2.5 mt-0.5 text-xs">
                  {p.reviews > 0 && (
                    <span className="flex items-center gap-1 text-[var(--color-aubergine)] font-semibold">
                      <i className="fa-solid fa-star text-[var(--color-amber)] text-[10px]" />{p.rating}
                    </span>
                  )}
                  {dist != null && (
                    <span className="flex items-center gap-1 text-[var(--color-lavender)]">
                      <i className="fa-solid fa-location-dot text-[10px]" />{fmtDist(dist)}
                    </span>
                  )}
                </div>
              </div>
              <i className="fa-solid fa-chevron-right text-[var(--color-lavender-lt)] flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Swipe-Sheet über der Karte: oben bleibt Karte sichtbar, runterziehen zeigt den aktuellen Ort ── */}
      {swipeOpen && (
        <>
          {/* aktueller Ort — Label auf dem sichtbaren Karten-Streifen (bei Filter-Ansicht unter die Toolbar) */}
          {swipeFocus && (
            <div className="fixed left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all" style={{ top: swipeLow ? 'calc(env(safe-area-inset-top) + 140px)' : 'calc(env(safe-area-inset-top) + 56px)' }}>
              <span className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-aubergine)] shadow-sm whitespace-nowrap">
                <i className="fa-solid fa-location-dot text-[var(--color-amber)] mr-1.5" />{swipeFocus.name}
              </span>
            </div>
          )}
          <div className="fixed left-0 right-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-[1.75rem]"
            style={{
              top: swipeLow ? '58vh' : '16vh',
              background: 'var(--color-bg)',
              boxShadow: '0 -8px 30px rgba(52,37,76,0.22)',
              transform: `translateY(${swipeLow ? swipeDragY : Math.max(0, swipeDragY)}px)`,
              transition: swipeDrag.current ? 'none' : 'top .3s cubic-bezier(.32,.72,0,1), transform .3s cubic-bezier(.32,.72,0,1)',
            }}>
            {/* Griff + Kopf (Zieh-Bereich) */}
            <div className="flex-shrink-0" onTouchStart={onSwipeSheetStart} onTouchMove={onSwipeSheetMove} onTouchEnd={onSwipeSheetEnd} style={{ touchAction: 'none' }}>
              <div className="flex justify-center pt-2 pb-1"><div className="w-10 h-1.5 rounded-full" style={{ background: '#d9cfe2' }} /></div>
              <div className="px-4 pb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--color-lavender)]">
                  <i className={`fa-solid ${swipeLow ? 'fa-chevron-up' : 'fa-chevron-down'} mr-1.5`} />{swipeLow ? 'Hoch zum Swipen · weiter runter zur Liste' : 'Runterziehen für Karte & Filter'}
                </span>
                <button onClick={closeSwipe}
                  onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}
                  className="text-xs font-bold text-[var(--color-amber)] flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(249,144,57,0.12)' }}><i className="fa-solid fa-list" />Liste</button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <SwipeDeck places={shownPlaces} onOpenDetail={id => setPlaceOpen(id)} onCardChange={setSwipeFocus} />
            </div>
          </div>
        </>
      )}

      {/* ── Orts-Overlay: Klick auf einen Ort fährt die Details hoch (kein Seitenwechsel). ──
           PlaceDetailPage bringt im embedded-Modus sein eigenes Layout + Zurück (onClose) mit. */}
      {placeOpen && (
        <div className="fixed inset-0 z-[55]" style={{ background: 'var(--color-bg)', animation: 'gtSlideUp 0.3s cubic-bezier(.32,.72,0,1)' }}>
          <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center text-[var(--color-lavender)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>}>
            <PlaceDetailEmbed key={placeOpen} id={placeOpen} embedded onOpenPlace={setPlaceOpen} onClose={() => setPlaceOpen(null)} />
          </Suspense>
        </div>
      )}
    </AppShell>
  );
}
