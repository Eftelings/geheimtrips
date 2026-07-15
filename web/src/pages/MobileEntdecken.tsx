import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
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
import { MAP_LAYERS, TILE_URL, HYBRID_ROADS, HYBRID_LABELS, TILE_PERF, type MapLayer } from '../utils/mapTiles.js';

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
  { id: 'foryou', label: 'Für dich' }, { id: 'all', label: 'Alle' },
  { id: 'new', label: 'Nur neue' }, { id: 'saved', label: 'Nur gemerkte' },
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
  mode: 'foryou' as Mode,   // Standard „Für dich": Besuchte + weggewischte Orte sind ausgeblendet
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
  const { places, loadPlaces, savedIds, visitedIds, nopeIds, funnelAnswers } = useAppStore();
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
  const [panel, setPanel] = useState<null | 'cat' | 'loc' | 'reach'>(null);
  const [mapLayer, setMapLayer] = useState<MapLayer>('standard');   // Standard/Satellit/Hybrid

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

  // Orte filtern: Kategorie + Reichweite + Modus. „Nein"-Orte (nope) fliegen IMMER raus.
  const shownPlaces = useMemo(() => {
    let base = places.filter(p => p.lat != null && p.lng != null && !nopeIds.has(p.id));
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
      // „Für dich" (Standard): Besuchtes raus, nach Affinität sortiert. Gemerkte Gruppen priorisiert.
      const pool = base.filter(p => !visitedIds.has(p.id));
      const likedGroups = new Set(
        places.filter(p => savedIds.has(p.id)).map(p => tagInfoFrom(vocab, p.tagSlug)?.groupSlug).filter(Boolean),
      );
      const primary = likedGroups.size
        ? pool.filter(p => likedGroups.has(tagInfoFrom(vocab, p.tagSlug)?.groupSlug ?? ''))
        : pool;
      return [...(primary.length ? primary : pool)].sort((a, b) => (b.match - a.match) || (b.rating - a.rating));
    }
    return base; // 'all' — alles außer „Nein"
  }, [places, tagSel, catActive, vocab, reachCenter, reach.travelMode, reach.travelMinutes, reach.iso, radiusKm, mode, savedIds, visitedIds, nopeIds]);

  // Swipe-Feed: nur bereits gemerkte („Will ich hin") raus. „Vielleicht" bleibt bewusst drin —
  // es hat keine bleibende Wirkung, die Orte werden künftig (und auf der Karte) weiter gezeigt.
  const swipePlaces = useMemo(() => shownPlaces.filter(p => !savedIds.has(p.id)), [shownPlaces, savedIds]);

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
  const [swipeFeed, setSwipeFeed] = useState<Place[]>([]);   // stabiler Snapshot beim Öffnen (Index springt sonst)
  const [swipeFocus, setSwipeFocus] = useState<Place | null>(null);   // aktueller Swipe-Ort (Karte fokussiert ihn)
  const [swipeLow, setSwipeLow] = useState(false);     // Sheet heruntergezogen → mehr Karte sichtbar
  const [swipeDragY, setSwipeDragY] = useState(0);
  const swipeDrag = useRef<{ startY: number; moved: number } | null>(null);
  const [placeOpen, setPlaceOpen] = useState<string | null>(null);   // Ortsdetails im ziehbaren Overlay
  const [detailIn, setDetailIn] = useState(false);                   // Slide-up-Zustand
  const [detailDragY, setDetailDragY] = useState(0);
  const [detailDragging, setDetailDragging] = useState(false);
  const detailDrag = useRef<{ startY: number; moved: number } | null>(null);
  const closeDetail = () => { setPlaceOpen(null); setDetailDragY(0); };
  const closeSwipe = () => { setSwipeOpen(false); setSwipeFocus(null); setSwipeLow(false); setSwipeDragY(0); };
  // Aus dem Swipe runterziehen → zurück zur Liste, dabei zum aktuellen Ort scrollen (der, auf dem man war)
  const closeSwipeToList = () => {
    const focusId = swipeFocus?.id ?? null;
    closeSwipe();
    if (focusId) {
      setSelectedId(focusId);
      setSheetExpanded(true);
      setTimeout(() => listRef.current?.querySelector(`[data-place-id="${focusId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 90);
    }
  };
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
  // Swipe-Sheet über der Karte — Snapshot des gefilterten Feeds (stabiler Index beim Weglegen)
  function goSwipe() { gate(() => { setSwipeFeed(swipePlaces); setSwipeOpen(true); setSwipeLow(false); }, 'Melde dich an, um den Swipe-Modus zu nutzen.'); }

  // Detail-Overlay: beim Öffnen von unten hereinfahren (Single-Page-Feel, Karte bleibt dahinter)
  useEffect(() => {
    if (!placeOpen) { setDetailIn(false); return; }
    setDetailDragY(0);
    if (detailIn) return;   // schon offen (Ort → Ort, z.B. „ähnliche Orte") → nicht neu einfahren
    const r = requestAnimationFrame(() => setDetailIn(true));
    return () => cancelAnimationFrame(r);
  }, [placeOpen]); // eslint-disable-line
  function onDetailStart(e: React.TouchEvent) { detailDrag.current = { startY: e.touches[0].clientY, moved: 0 }; setDetailDragging(true); }
  function onDetailMove(e: React.TouchEvent) {
    const d = detailDrag.current; if (!d) return;
    const dy = e.touches[0].clientY - d.startY;
    d.moved = Math.max(d.moved, Math.abs(dy));
    setDetailDragY(Math.max(0, dy));   // nur nach unten ziehen
  }
  function onDetailEnd() {
    const d = detailDrag.current; detailDrag.current = null; setDetailDragging(false);
    if (!d) return;
    if (detailDragY > 120) closeDetail(); else setDetailDragY(0);   // weit genug runter → schließen
  }
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
    if (d.moved < 6) { setSwipeLow(v => !v); return; }        // Tippen = Karten-Peek umschalten
    if (dy > 80) { closeSwipeToList(); return; }               // runterziehen → zurück zur Liste (aktueller Ort)
    if (dy < -40) { setSwipeLow(false); return; }              // hochziehen → wieder voll swipen
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
  // Pin-Klick öffnet direkt das Orts-Overlay (nicht erst die Liste)
  const markerEls = useMemo(() => shownPlaces.map(p => (
    <Marker key={p.id} position={[p.lat!, p.lng!]}
      icon={p.id === highlightId ? purpleMarker : orangeMarker}
      zIndexOffset={p.id === highlightId ? 1000 : 0}
      eventHandlers={{ click: () => setPlaceOpen(p.id) }} />
  )), [shownPlaces, highlightId]);

  return (
    <AppShell>
      {/* Vollbildkarte */}
      <div className="fixed inset-0 z-0" style={{ background: '#e8e4ee' }}>
        <MapContainer center={reachCenter ? [reachCenter.lat, reachCenter.lng] : [51.1657, 10.4515]}
          zoom={reachCenter ? 9 : 6} scrollWheelZoom zoomControl={false} attributionControl={false}
          style={{ height: '100%', width: '100%' }}>
          <TileLayer key={mapLayer} url={TILE_URL[mapLayer]} {...TILE_PERF} />
          {mapLayer === 'hybrid' && <TileLayer url={HYBRID_ROADS} {...TILE_PERF} />}
          {mapLayer === 'hybrid' && <TileLayer url={HYBRID_LABELS} {...TILE_PERF} />}
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

      {/* Toolbar — direkt unter dem Standard-Header. Beim Swipen fliegt sie nach oben HINTER den
          (opaken) Header (z unter Header z-20), nicht darüber. Runterziehen (swipeLow) holt sie zurück. */}
      <div className="fixed left-0 right-0 z-[15] px-3 flex flex-col gap-2"
        style={{
          top: '52px',
          transform: (swipeOpen && !swipeLow) ? 'translateY(-160%)' : 'translateY(0)',
          opacity: (swipeOpen && !swipeLow) ? 0 : 1,
          pointerEvents: (swipeOpen && !swipeLow) ? 'none' : 'auto',
          transition: 'transform .32s cubic-bezier(.32,.72,0,1), opacity .28s ease',
        }}>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setPanel(panel === 'cat' ? null : 'cat')} className={toolBtn}
            style={{ ...toolShadow, color: catActive ? '#F99039' : '#34254c' }} aria-label="Filter">
            <i className="fa-solid fa-filter" />
          </button>
          {/* Eine weiße Leiste, zwei Tippziele: links Standort ändern, rechts Reichweite einstellen */}
          <div className="flex-1 min-w-0 flex items-center bg-white rounded-xl h-10" style={toolShadow}>
            <button onClick={() => setPanel(panel === 'loc' ? null : 'loc')}
              className="flex-1 min-w-0 flex items-center gap-2 h-full pl-3 pr-2" aria-label="Standort ändern">
              <i className="fa-solid fa-location-dot text-sm flex-shrink-0" style={{ color: searchCenter ? '#F99039' : '#34254c' }} />
              <span className="text-xs font-semibold text-[var(--color-aubergine)] truncate text-left">
                {searchLabel ?? (userCoords ? 'Mein Standort' : 'Standort wählen')}
              </span>
            </button>
            <span className="w-px h-4 bg-[var(--color-bg-soft)] flex-shrink-0" />
            <button onClick={() => setPanel(panel === 'reach' ? null : 'reach')}
              className="flex items-center gap-1.5 h-full pl-2.5 pr-3 flex-shrink-0" aria-label="Reichweite einstellen">
              <i className={`fa-solid ${T_ICON[reach.travelMode]} text-sm`} style={{ color: '#F99039' }} />
              <span className="text-xs font-semibold text-[var(--color-aubergine)] whitespace-nowrap">
                {reach.travelMode === 'radius' ? `${radiusKm} km` : `${reach.travelMinutes} Min`}
              </span>
              {reach.isoLoading
                ? <i className="fa-solid fa-circle-notch fa-spin text-[10px]" style={{ color: '#b9a8c4' }} />
                : <i className="fa-solid fa-chevron-down text-[10px]" style={{ color: '#b9a8c4' }} />}
            </button>
          </div>
          {/* Karten-Ebene: Standard → Satellit → Hybrid (durchtippen) */}
          <button onClick={() => { const i = MAP_LAYERS.findIndex(l => l.id === mapLayer); setMapLayer(MAP_LAYERS[(i + 1) % MAP_LAYERS.length].id); }}
            className={toolBtn} style={{ ...toolShadow, color: mapLayer === 'standard' ? '#34254c' : '#F99039' }}
            aria-label="Karten-Ebene wechseln" title={MAP_LAYERS.find(l => l.id === mapLayer)?.label}>
            <i className="fa-solid fa-layer-group" />
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => m.id === 'saved'
              ? gate(() => setMode(m.id), 'Melde dich an, um deine gemerkten Orte zu filtern.')
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

            {/* Nur Standort — Klick auf „Mein Standort" öffnet direkt die Ortssuche */}
            {panel === 'loc' && (
              <div>
                <div className="flex items-center gap-2 bg-[var(--color-bg-soft)] rounded-xl px-3 h-10 mb-2">
                  <i className="fa-solid fa-magnifying-glass text-[var(--color-lavender)] text-sm" />
                  <input autoFocus value={searchQuery} onChange={e => onSearchInput(e.target.value)}
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
            )}

            {/* Nur Reichweite — Klick auf die km/Min-Angabe: Verkehrsmittel + Radius/Reisezeit, ohne Ortssuche */}
            {panel === 'reach' && (
              <ReachControls
                travelMode={reach.travelMode} setTravelMode={reach.setTravelMode}
                travelMinutes={reach.travelMinutes} setTravelMinutes={reach.setTravelMinutes}
                radiusKm={radiusKm} setRadiusKm={setRadiusKm}
                iso={reach.iso} isoLoading={reach.isoLoading} />
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
          <div className="fixed left-0 right-0 bottom-0 z-40 overflow-hidden rounded-t-[1.75rem]"
            style={{
              top: swipeLow ? '58vh' : '12vh',
              boxShadow: '0 -8px 30px rgba(52,37,76,0.22)',
              transform: `translateY(${swipeLow ? swipeDragY : Math.max(0, swipeDragY)}px)`,
              transition: swipeDrag.current ? 'none' : 'top .3s cubic-bezier(.32,.72,0,1), transform .3s cubic-bezier(.32,.72,0,1)',
            }}>
            {/* Full-Bleed: das Bild selbst ist oben abgerundet — kein weißer Hintergrund */}
            <div className="absolute inset-0">
              <SwipeDeck places={swipeFeed} onOpenDetail={id => setPlaceOpen(id)} onCardChange={setSwipeFocus} />
            </div>
            {/* Zieh-Griff (zentriert): runterziehen zeigt Karte/Filter, Tippen klappt um */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 w-28 h-9 flex items-start justify-center pt-2"
              onTouchStart={onSwipeSheetStart} onTouchMove={onSwipeSheetMove} onTouchEnd={onSwipeSheetEnd} style={{ touchAction: 'none' }}>
              <div className="w-10 h-1.5 rounded-full bg-white/60" />
            </div>
            {/* Ansicht wechseln — gleiche Farbe & Position wie „Swipen" in der Liste (amber, oben rechts) */}
            <button onClick={closeSwipe} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}
              className="absolute top-2.5 right-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white"
              style={{ background: 'var(--color-amber)', boxShadow: '0 2px 8px rgba(52,37,76,0.35)' }}>
              <i className="fa-solid fa-list" />Liste
            </button>
          </div>
        </>
      )}

      {/* ── Orts-Overlay als ziehbares Sheet: Karte bleibt dahinter, Griff runterziehen schließt. ──
           Aus dem Swipe-Modus (hochziehen) fährt es nahtlos über die Karte; runterziehen führt zurück. */}
      {placeOpen && (
        <div className="fixed inset-0 z-[55]"
          style={{ background: `rgba(248,246,251,${detailIn ? 0.72 : 0})`, backdropFilter: detailIn ? 'blur(6px)' : 'none', WebkitBackdropFilter: detailIn ? 'blur(6px)' : 'none', transition: 'background .3s ease, backdrop-filter .3s ease' }}
          onClick={closeDetail}>
          {/* Eingerückte Karte: links/rechts/oben bleibt ein heller Rand — passt besser als Full-Page */}
          <div className="absolute left-2 right-2 bottom-0 flex flex-col rounded-t-[1.5rem] overflow-hidden bg-[var(--color-bg)]"
            onClick={e => e.stopPropagation()}
            style={{
              top: 'calc(env(safe-area-inset-top) + 14px)',
              transform: `translateY(${detailIn ? detailDragY : (typeof window !== 'undefined' ? window.innerHeight : 900)}px)`,
              transition: detailDragging ? 'none' : 'transform .32s cubic-bezier(.32,.72,0,1)',
              boxShadow: '0 -10px 40px rgba(52,37,76,0.22)',
            }}>
            {/* Zieh-Griff (nur hier schließt das Runterziehen — der Inhalt scrollt normal) */}
            <div className="flex-shrink-0 flex justify-center pt-2 pb-1.5 bg-[var(--color-bg)]"
              onTouchStart={onDetailStart} onTouchMove={onDetailMove} onTouchEnd={onDetailEnd} style={{ touchAction: 'none' }}>
              <div className="w-10 h-1.5 rounded-full" style={{ background: '#d9cfe2' }} />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <Suspense fallback={<div className="py-20 flex items-center justify-center text-[var(--color-lavender)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>}>
                <PlaceDetailEmbed key={placeOpen} id={placeOpen} embedded onOpenPlace={setPlaceOpen} onClose={closeDetail} />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
