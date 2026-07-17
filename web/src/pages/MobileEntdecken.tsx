import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import { useUiStore } from '../store/useUiStore.js';
import { MAP_LAYERS, TILE_URL, HYBRID_ROADS, HYBRID_LABELS, TILE_PERF, type MapLayer } from '../utils/mapTiles.js';
import { imgUrl } from '../utils/img.js';

// Ortsdetails im Overlay (lazy → hält das Karten-Bundle klein)
const PlaceDetailEmbed = lazy(() => import('./PlaceDetailPage.js').then(m => ({ default: m.PlaceDetailPage })));
import { useTaxVocab, tagInfoFrom } from '../data/taxVocab.js';
import type { Place, Transport } from '../types/index.js';

/**
 * Karten-Pin: weißer Kreis mit dem Icon der Ortskategorie — orange, der fokussierte Ort lila
 * (mit Halo, damit er sich weiter abhebt). FontAwesome liegt als CSS-Webfont vor, deshalb greift
 * die Icon-Klasse auch in dem HTML, das Leaflet nachträglich einhängt.
 * Icons werden je Kategorie/Zustand EINMAL gebaut — ein L.divIcon pro Ort und Render wäre auf der
 * Karte spürbar (die Marker werden ohnehin schon deshalb memoisiert).
 */
const markerCache = new Map<string, L.DivIcon>();
function catMarker(icon: string, active: boolean): L.DivIcon {
  const key = `${icon}|${active}`;
  const hit = markerCache.get(key);
  if (hit) return hit;
  const made = L.divIcon({
    html: active
      ? `<div style="position:relative;width:30px;height:30px;">
           <div style="position:absolute;inset:0;border-radius:50%;background:rgba(124,58,237,0.22);transform:scale(1.7);"></div>
           <div style="position:absolute;inset:0;border-radius:50%;background:#fff;border:2.5px solid #7c3aed;box-shadow:0 3px 9px rgba(52,37,76,0.5);display:flex;align-items:center;justify-content:center;">
             <i class="fa-solid ${icon}" style="font-size:13px;line-height:1;color:#7c3aed"></i>
           </div>
         </div>`
      : `<div style="width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 7px rgba(52,37,76,0.4);display:flex;align-items:center;justify-content:center;">
           <i class="fa-solid ${icon}" style="font-size:12px;line-height:1;color:#F99039"></i>
         </div>`,
    iconSize: active ? [30, 30] : [26, 26],
    iconAnchor: active ? [15, 15] : [13, 13],
    className: '',
  });
  markerCache.set(key, made);
  return made;
}

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

/**
 * Karte auf einen Ort fliegen — aber in die MITTE des sichtbaren Kartenstreifens (zwischen Filtern
 * und Overlay), nicht in die Mitte des Viewports: dort läge der Pin hinter dem Overlay.
 * `offsetY` verschiebt das Kartenzentrum in Pixeln, damit der Ort im Streifen landet.
 */
function FlyToPlace({ lat, lng, offsetY }: { lat: number | null; lng: number | null; offsetY: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat == null || lng == null) return;
    const z = Math.max(map.getZoom(), 11);
    const target = map.unproject(map.project([lat, lng], z).add([0, offsetY]), z);
    map.flyTo(target, z, { duration: 0.6 });
  }, [lat, lng, offsetY]); // eslint-disable-line
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
  sheetSnap: 0 as SheetSnap,
  scrollTop: 0,
};

/** Rasten des Listen-Overlays: 0 = Peek (Kopf + erster Ort), 1 = Halb (wie bisher), 2 = Groß (~90% — oben bleibt Header + Kartenstreifen). */
type SheetSnap = 0 | 1 | 2;
const HEADER_H = 48;   // AppShell-Mobile-Header (h-12)

// Langes Drücken (mobil) bzw. Rechtsklick (Desktop) auf die Karte → Startpunkt für den Radius
function LongPressPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ contextmenu: e => { e.originalEvent?.preventDefault?.(); onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export function MobileEntdecken() {
  const navigate = useNavigate();
  const location = useLocation();
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

  // Was überhaupt in Reichweite liegt (Kategorie + Radius/Isochrone) — noch ohne Modus-Regel.
  // Karte/Liste und Swipe leiten getrennt davon ab: sie brauchen unterschiedliche Regeln.
  const inRadius = useMemo(() => {
    let base = places.filter(p => p.lat != null && p.lng != null);
    if (catActive) base = base.filter(p => placeMatchesTag(p, tagSel, vocab));
    if (reachCenter) {
      const within = (p: Place) =>
        reach.travelMode === 'radius' ? distanceKm(reachCenter, { lat: p.lat!, lng: p.lng! }) <= radiusKm
        : reach.iso                   ? pointInGeoJSON(p.lat!, p.lng!, reach.iso.feature.geometry)
        : distanceKm(reachCenter, { lat: p.lat!, lng: p.lng! }) <= (EFFECTIVE_SPEED_KMH[reach.travelMode as Transport] * reach.travelMinutes) / 60;
      base = base.filter(within);
    }
    return base;
  }, [places, tagSel, catActive, vocab, reachCenter, reach.travelMode, reach.travelMinutes, reach.iso, radiusKm]);

  // Karte + Liste: Modus-Regel, „Nein" wirkt nur bei Vorschlägen — „Alle" heißt alle.
  const shownPlaces = useMemo(() => {
    const base = inRadius;
    if (mode === 'saved') return base.filter(p => savedIds.has(p.id));
    if (mode === 'new')   return base.filter(p => !visitedIds.has(p.id) && !savedIds.has(p.id) && !nopeIds.has(p.id));
    if (mode === 'foryou') {
      // „Für dich" (Standard): Besuchtes + Weggewischtes raus, nach Affinität sortiert.
      // Gemerkte Gruppen priorisiert.
      const pool = base.filter(p => !visitedIds.has(p.id) && !nopeIds.has(p.id));
      // Im Radius alles schon gesehen? Dann lieber wie „Alle" zeigen als eine leere Karte —
      // eine leere Entdecken-Seite ist die schlechteste aller Antworten.
      if (!pool.length) return base;
      const likedGroups = new Set(
        places.filter(p => savedIds.has(p.id)).map(p => tagInfoFrom(vocab, p.tagSlug)?.groupSlug).filter(Boolean),
      );
      const primary = likedGroups.size
        ? pool.filter(p => likedGroups.has(tagInfoFrom(vocab, p.tagSlug)?.groupSlug ?? ''))
        : pool;
      return [...(primary.length ? primary : pool)].sort((a, b) => (b.match - a.match) || (b.rating - a.rating));
    }
    return base; // 'all' — wirklich alles, auch Weggewischtes und schon Beantwortetes
  }, [inRadius, places, vocab, mode, savedIds, visitedIds, nopeIds]);

  /**
   * Der Swipe-Stapel folgt der eingestellten Ansicht:
   *  · Alle        → wirklich alles im Radius, auch schon Beantwortetes (neue Entscheidung sticht)
   *  · Nur gemerkte→ Aufräum-Modus über die eigene Sammlung
   *  · Nur neue    → nur Unberührtes
   *  · Für dich    → Unberührtes, nach Übereinstimmung sortiert
   * Bewusst NICHT aus `shownPlaces` abgeleitet: dort greift der „Für dich"-Fallback (zeigt notfalls
   * alles), wodurch die Liste Orte zeigte, die der Swipe direkt wieder rauswarf — genau der Grund
   * für „Keine Orte im Filter" trotz Treffern auf der Karte.
   */
  const swipePlaces = useMemo(() => {
    const base = inRadius;
    if (mode === 'all')   return base;
    if (mode === 'saved') return base.filter(p => savedIds.has(p.id));
    const fresh = base.filter(p => !visitedIds.has(p.id) && !savedIds.has(p.id) && !nopeIds.has(p.id));
    if (mode === 'new')   return fresh;
    return [...fresh].sort((a, b) => (b.match - a.match) || (b.rating - a.rating));   // 'foryou'
  }, [inRadius, mode, savedIds, visitedIds, nopeIds]);

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
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(entdeckenCache.sheetSnap);
  const [swipeFeed, setSwipeFeed] = useState<Place[]>([]);   // stabiler Snapshot beim Öffnen (Index springt sonst)
  const [swipeFocus, setSwipeFocus] = useState<Place | null>(null);   // aktueller Swipe-Ort (Karte fokussiert ihn)
  // Rast 2 IST der Swipe — es gibt kein eigenes Sheet und keine eigene Seite mehr.
  const swipeMode = sheetSnap === 2;
  const [swipeArticle, setSwipeArticle] = useState(false);   // Artikel unter dem Bild (gleiche Seite)
  const [reviewsSignal, setReviewsSignal] = useState(0);     // Sterne am Hero → Rezensionen aufklappen
  // Stapel neu aufnehmen anfordern. Über einen Zähler statt direktem setSwipeFeed: Modus/Filter
  // wirken erst im nächsten Render, ein Aufruf in derselben Runde griffe auf alte Werte.
  const [feedNonce, setFeedNonce] = useState(0);
  const [swipeLocOpen, setSwipeLocOpen] = useState(false);   // Ortssuche auf der leeren Swipe-Seite
  const [backTo, setBackTo] = useState<string | null>(null);  // Herkunft (z.B. „Meine Orte") für den Zurückpfeil
  const recaptureFeed = () => setFeedNonce(n => n + 1);
  // „Nochmal zeigen" = die Ansicht „Alle" — dieselbe Wirkung, nur als Knopf. Der Chip oben springt
  // sichtbar mit, damit klar ist, warum plötzlich alles kommt (und man mit einem Tipp zurückkann).
  const showAllAgain = () => { setMode('all'); recaptureFeed(); };
  // „Zeig mir DIESEN Ort" (Liste/Pin/ähnlicher Ort) statt „lass mich durchgehen" (Swipe):
  // Einzel-Feed, Artikel sofort offen, keine Entscheidungs-Buttons, runter führt direkt zur Liste.
  const [articleOnly, setArticleOnly] = useState(false);
  const [listFocus, setListFocus] = useState<Place | null>(null);   // Ort, von dem man zurückkommt
  // Aus dem Swipe zurück in die Liste und zu dem Ort scrollen, auf dem man war
  const closeSwipeToList = (to: SheetSnap = 1) => {
    const focus = swipeFocus;
    const focusId = focus?.id ?? null;
    setSheetSnap(to);
    setListFocus(focus);   // Karte zeigt ihn danach im sichtbaren Streifen (lila, mittig)
    if (focusId) {
      setSelectedId(focusId);
      setTimeout(() => listRef.current?.querySelector(`[data-place-id="${focusId}"]`)?.scrollIntoView({ block: 'center', behavior: 'auto' }), 90);
    }
  };
  /**
   * Einen bestimmten Ort öffnen (Liste, Pin, „ähnlicher Ort"). Wer gezielt tippt, hat die Auswahl
   * schon getroffen — also direkt der Artikel, ohne den Umweg über den Swipe-Bildschirm und ohne
   * eine Entscheidungsfrage, die niemand gestellt hat. Runterziehen führt zurück in die Liste.
   */
  const openPlace = (p: Place) => {
    setPanel(null);         // sonst schwebt der offene Filter über dem Artikel
    setSwipeFeed([p]);      // Einzel-Feed: es geht um GENAU diesen Ort
    setSwipeFocus(p);       // direkt setzen — sonst rendert der Artikel einen Frame lang den alten Ort
    setArticleOnly(true);
    setSwipeArticle(true);
    setSheetSnap(2);
  };
  const openPlaceId = (id: string) => { const p = places.find(x => x.id === id); if (p) openPlace(p); };
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetDrag = useRef<{ startY: number; startOffset: number; moved: number } | null>(null);
  const listSwipe = useRef<{ x: number; y: number } | null>(null);
  const justSwiped = useRef(false);
  const [vh, setVh] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 800);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // Das Sheet steht per CSS auf seiner OBERSTEN Rast (top) und wird für die anderen
  // beiden nur nach unten geschoben (translateY) — verschieben ist billig, `top` animieren nicht.
  //  · Rast 2 „Groß": Oberkante ~10vh → darüber bleiben Header + ein schmaler Kartenstreifen.
  //  · Rast 1 „Halb": Oberkante 38vh (wie bisher).
  //  · Rast 0 „Peek": 238px sichtbar = Nav(76) + Griff/Kopf(70) + erster Eintrag(92).
  const snap = useMemo(() => {
    const top = Math.max(HEADER_H + 22, Math.round(vh * 0.10));
    const mid = Math.max(0, Math.round(vh * 0.38) - top);
    const peek = Math.max(mid + 80, vh - 238 - top);
    return { top, offs: [peek, mid, 0] as [number, number, number] };
  }, [vh]);
  useEffect(() => {
    if (sheetDragging) return;
    setSheetDragY(snap.offs[sheetSnap]);
  }, [sheetSnap, sheetDragging, snap]);

  // Einstellungen für „Zurück" merken — jeder Render hält den Cache aktuell
  useEffect(() => {
    Object.assign(entdeckenCache, {
      searchCenter, searchLabel, userCoords, radiusKm, mode, tagSel,
      travelMode: reach.travelMode, travelMinutes: reach.travelMinutes,
      selectedId, scrollTop: listRef.current?.scrollTop ?? entdeckenCache.scrollTop,
      // Rast 2 NICHT merken: der Swipe-Feed ist ein Snapshot dieser Sitzung — beim Neuaufbau
      // stünde man sonst im Swipe vor einem leeren Feed. „Zurück" landet in der Liste.
      sheetSnap: swipeMode ? 1 : sheetSnap,
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
    setSearchQuery(''); setGeoSug([]); setPanel(null); setSwipeLocOpen(false);
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
    setPanel(null);   // wer das Overlay anfasst, ist mit dem Filter fertig
    sheetDrag.current = { startY: e.touches[0].clientY, startOffset: sheetDragY, moved: 0 };
    setSheetDragging(true);
  }
  function onSheetTouchMove(e: React.TouchEvent) {
    const d = sheetDrag.current; if (!d) return;
    const delta = e.touches[0].clientY - d.startY;
    d.moved = Math.max(d.moved, Math.abs(delta));
    setSheetDragY(Math.min(Math.max(d.startOffset + delta, 0), snap.offs[0]));
  }
  /** Nächstgelegene Rast zu einem Zug-Offset — eine Regel für Griff UND Bild. */
  function settleSnap(y: number): SheetSnap {
    let best: SheetSnap = 0, bd = Infinity;
    snap.offs.forEach((v, i) => { const dist = Math.abs(v - y); if (dist < bd) { bd = dist; best = i as SheetSnap; } });
    return best;
  }
  function onSheetTouchEnd() {
    const d = sheetDrag.current; sheetDrag.current = null; setSheetDragging(false);
    if (!d) return;
    if (d.moved < 6) { setSheetSnap(s => (s === 1 ? 0 : 1)); return; }   // Tippen = eine Stufe
    setSheetSnap(settleSnap(sheetDragY));
  }
  // Runterziehen auf dem Swipe-Bild zieht das Overlay selbst — dieselbe Mechanik wie am Griff,
  // damit die Karte nicht zusätzlich schrumpft (kein Morph) und die Filter im Takt mitlaufen.
  function onDeckPull(dy: number) {
    if (!sheetDragging) setSheetDragging(true);
    setSheetDragY(Math.min(Math.max(dy, 0), snap.offs[0]));
  }
  function onDeckPullEnd(dy: number) {
    setSheetDragging(false);
    const to = settleSnap(Math.min(Math.max(dy, 0), snap.offs[0]));
    if (to === 2) { setSheetSnap(2); return; }   // nicht weit genug → zurück in den Swipe
    closeSwipeToList(to);
  }
  // „Swipen" zieht nur das Overlay auf die oberste Rast — dort IST der Swipe. Nur HIER endet eine
  // gezielte Ort-Sitzung: wer bewusst swipen geht, will keinen Zurückpfeil nach „Meine Orte" mehr.
  function goSwipe() { setPanel(null); setArticleOnly(false); setBackTo(null); setSheetSnap(2); }
  // Ankommen auf Rast 2 (egal ob per Button oder mit der Hand hochgezogen): Feed einfrieren.
  // Snapshot, sonst indiziert der Feed beim Weglegen neu → Index springt.
  useEffect(() => {
    // Rast 2 verlassen heißt NICHT „fertig mit dem Ort": man zieht das Overlay runter, um kurz auf
    // die Karte zu schauen. Räumten wir hier articleOnly/backTo weg, käme beim Hochziehen der
    // Swipe statt des Orts und der Zurückpfeil hätte sein Ziel verloren.
    if (!swipeMode) return;
    if (articleOnly) { setSwipeArticle(true); return; }   // gezielter Ort: Rast 2 zeigt IHN, nicht den Swipe
    setSwipeArticle(false);   // frischer Swipe beginnt beim Bild, nicht bei einem alten Artikel
    if (!gate(() => setSwipeFeed(swipePlaces), 'Melde dich an, um den Swipe-Modus zu nutzen.')) setSheetSnap(1);
  }, [swipeMode, feedNonce]); // eslint-disable-line

  /**
   * Auftrag von außen („Meine Orte" → dieser Ort): Modus setzen, Ort öffnen, Herkunft merken.
   * Läuft erst, wenn die Orte geladen sind — beim Mount ist die Liste oft noch leer. Danach wird
   * der Router-State geleert, sonst risse ein Zurück/Reload den Ort erneut auf.
   */
  useEffect(() => {
    const st = location.state as { openPlace?: string; place?: Place; mode?: Mode; from?: string } | null;
    if (!st?.openPlace) return;
    // Eingereichte Orte (in Prüfung) sind nicht im Store → das mitgegebene Objekt als Fallback.
    const p = places.find(x => x.id === st.openPlace) ?? st.place;
    if (!p) return;
    if (st.mode) setMode(st.mode);
    // Der Ort wird zum Standort. Man kommt her, um IHN anzusehen — mit dem alten Standort läge er
    // womöglich weit außerhalb der eingestellten Reichweite: die Karte zeigte ihn nicht und die
    // Liste kennt ihn nicht. So ist er der Mittelpunkt, und die Liste zeigt, was in seiner Nähe
    // liegt. Sichtbar und umkehrbar — in der Standort-Leiste steht sein Name, daneben „GPS".
    if (p.lat != null && p.lng != null) { setSearchCenter({ lat: p.lat, lng: p.lng }); setSearchLabel(p.name); }
    setBackTo(st.from ?? null);
    openPlace(p);
    navigate('.', { replace: true, state: null });
  }, [places, location.state]); // eslint-disable-line

  // Im Swipe fährt die Bottom-Nav bis auf den Kompass-Überstand runter. Aufräumen beim Verlassen
  // ist Pflicht — sonst bliebe sie auf der nächsten Seite versteckt.
  const setNavPeek = useUiStore(s => s.setNavPeek);
  useEffect(() => { setNavPeek(swipeMode); return () => setNavPeek(false); }, [swipeMode, setNavPeek]);

  // Der Swipe wird direkt auf dem Bild gezogen (SwipeDeck): runter = zurück zur Liste (kein Zwischenzustand mehr).
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

  // Die Filter hängen am selben Wert wie das Sheet: 0 = Rast 1 (Filter da), 1 = Rast 2 (hinter dem
  // Header). Beim Ziehen folgen sie damit dem Finger 1:1, beim Loslassen teilen sie sich die
  // Animation des Sheets (gleiche Dauer/Kurve) — statt eigenständig loszufliegen.
  const filterHide = Math.min(1, Math.max(0, 1 - sheetDragY / Math.max(1, snap.offs[1])));

  const toolBtn = 'w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0';
  const toolShadow = { boxShadow: '0 2px 10px rgba(52,37,76,0.18)' } as const;

  // Ortssuche — einmal gebaut, zweimal benutzt: im Popover der Toolbar und direkt auf der leeren
  // Swipe-Seite. Dort darf sie NICHT als Popover oben aufspringen, sondern muss dort aufklappen,
  // wo der Knopf steht — sonst springt die Eingabe quer über den Bildschirm.
  const locSearch = (
    <div>
      <div className="flex items-center gap-2 bg-[var(--color-bg-soft)] rounded-xl px-3 h-10 mb-2">
        <i className="fa-solid fa-magnifying-glass text-[var(--color-lavender)] text-sm" />
        <input autoFocus value={searchQuery} onChange={e => onSearchInput(e.target.value)}
          placeholder="Stadt oder Adresse…"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)]" />
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
        // Nur der Weg zurück zum eigenen Standort — welcher Ort gerade gesetzt ist, steht schon in
        // der Leiste darüber. Ohne GPS-Erlaubnis fragt der Tipp danach, statt „Kein Standort" zu
        // melden und den Weg raus offen zu lassen.
        <button onClick={() => { resetToGps(); if (!userCoords) requestGpsPosition().then(setUserCoords).catch(() => {}); }}
          className="w-full flex items-center gap-1.5 px-1 py-2 text-left rounded-xl active:bg-[var(--color-bg-soft)]">
          <i className="fa-solid fa-location-crosshairs text-[var(--color-amber)]" />
          <span className="text-xs font-semibold text-[var(--color-aubergine)]">Mein Standort</span>
        </button>
      )}
    </div>
  );

  // Filter direkt auf der leeren Swipe-Seite: Standort, Verkehrsmittel und Radius sind genau die
  // Stellschrauben, die hier fehlen. Sie schreiben in denselben State wie die Toolbar — die Karte
  // übernimmt die Einstellung also mit. „Jetzt zeigen" nimmt den Stapel neu auf.
  const swipeFilters = (
    <div className="w-full max-w-sm mt-2 flex flex-col gap-2.5 text-left">
      <div className="bg-white rounded-2xl overflow-hidden" style={toolShadow}>
        <button onClick={() => setSwipeLocOpen(v => !v)} className="w-full flex items-center gap-2 h-11 px-3.5">
          <i className="fa-solid fa-location-dot text-sm flex-shrink-0" style={{ color: searchCenter ? '#F99039' : '#34254c' }} />
          <span className="text-xs font-semibold text-[var(--color-aubergine)] truncate">
            {searchLabel ?? (userCoords ? 'Mein Standort' : 'Standort wählen')}
          </span>
          <i className={`fa-solid fa-chevron-down text-[10px] text-[var(--color-lavender-lt)] ml-auto transition-transform ${swipeLocOpen ? 'rotate-180' : ''}`} />
        </button>
        {swipeLocOpen && (
          <div className="px-3 pb-3 pt-2.5 border-t border-[var(--color-bg-soft)]">{locSearch}</div>
        )}
      </div>
      <div className="bg-white rounded-2xl p-3" style={toolShadow}>
        <ReachControls
          travelMode={reach.travelMode} setTravelMode={reach.setTravelMode}
          travelMinutes={reach.travelMinutes} setTravelMinutes={reach.setTravelMinutes}
          radiusKm={radiusKm} setRadiusKm={setRadiusKm}
          iso={reach.iso} isoLoading={reach.isoLoading} />
      </div>
      <button onClick={recaptureFeed}
        className="w-full h-11 rounded-2xl text-sm font-bold text-white active:scale-95 transition-transform"
        style={{ background: 'var(--color-aubergine)' }}>
        Jetzt zeigen
      </button>
    </div>
  );

  // Der Ort, auf den die Karte fliegt: im Swipe die aktuelle Karte, sonst der, von dem man
  // zurückkommt. Beim Laden bewusst null — sonst kämen sich Flug und FitReach in die Quere.
  const mapFocus = swipeMode ? swipeFocus : listFocus;
  // Pixel-Versatz, damit der Ort im sichtbaren Streifen landet statt hinter dem Overlay.
  // Hängt an der RAST, nicht am laufenden Zug — sonst flöge die Karte in jedem Frame neu.
  const mapFocusOffset = useMemo(() => {
    const top = swipeMode ? HEADER_H + 4 : 140;             // unter dem Header bzw. unter den Filtern
    const bottom = Math.max(top + 60, snap.top + snap.offs[sheetSnap]);   // Oberkante des Overlays
    return Math.round(vh / 2 - (top + bottom) / 2);
  }, [vh, swipeMode, snap, sheetSnap]);

  // Der Ort, den man gerade ansieht, ist immer der hervorgehobene — sonst bekäme beim Zurück aus
  // „Meine Orte" der erste Listeneintrag den lila Pin, weil `preview` ihn nicht findet.
  const highlightId = mapFocus?.id ?? preview?.id;
  /**
   * Der angesehene Ort gehört IMMER auf die Karte — auch außerhalb der Reichweite. Aus „Meine Orte"
   * geöffnet kann er 200 km weg liegen, während hier 10 km eingestellt sind: `shownPlaces` filtert
   * ihn dann raus, die Karte fliegt hin und dort ist nichts. Nur der Pin, nicht die Liste — deren
   * Zähler („N Orte in der Nähe") würde sonst lügen.
   */
  const markerPlaces = useMemo(() => (
    mapFocus && mapFocus.lat != null && !shownPlaces.some(p => p.id === mapFocus.id)
      ? [...shownPlaces, mapFocus] : shownPlaces
  ), [shownPlaces, mapFocus]);

  // Marker memoisieren → beim Sheet-Ziehen (häufige Re-Renders) werden NICHT alle Leaflet-Marker
  // neu gebunden (das war die Hänger-Ursache auf Mobil).
  // Pin-Klick öffnet direkt das Orts-Overlay (nicht erst die Liste)
  const markerEls = useMemo(() => markerPlaces.map(p => {
    const active = p.id === highlightId;
    return (
      <Marker key={p.id} position={[p.lat!, p.lng!]}
        icon={catMarker(tagInfoFrom(vocab, p.tagSlug)?.icon ?? 'fa-location-dot', active)}
        zIndexOffset={active ? 1000 : 0}
        eventHandlers={{ click: () => openPlace(p) }} />
    );
  }), [markerPlaces, highlightId, vocab]); // eslint-disable-line

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
          <FlyToPlace lat={mapFocus?.lat ?? null} lng={mapFocus?.lng ?? null} offsetY={mapFocusOffset} />
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

      {/* Toolbar — direkt unter dem Standard-Header. Sie wischt im Gleichtakt mit dem Overlay nach
          oben HINTER den (opaken) Header (z unter Header z-20), nicht darüber — dort wäre sie sonst
          vom Sheet verdeckt. Timing bewusst identisch zum Sheet, sonst laufen sie auseinander. */}
      <div className="fixed left-0 right-0 z-[15] px-3 flex flex-col gap-2"
        style={{
          top: '52px',
          transform: `translateY(${-160 * filterHide}%)`,
          // Weggenommen werden sie vom Header; die Deckkraft geht erst spät runter (hoch 3),
          // sonst lösen sie sich schon auf, während sie noch voll im Bild stehen.
          opacity: 1 - filterHide ** 3,
          pointerEvents: filterHide > 0.02 ? 'none' : 'auto',
          transition: sheetDragging ? 'none' : 'transform .34s cubic-bezier(.32,.72,0,1), opacity .34s cubic-bezier(.32,.72,0,1)',
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

        {/* Aufklappung DIREKT unter der Leiste (kein schwebender Popover, kein Backdrop) — die
            Modus-Chips darunter rücken dadurch nach unten, und die Karte bleibt bedienbar. */}
        {panel && (
          <div className="bg-white rounded-2xl p-3.5" style={{ boxShadow: '0 14px 40px rgba(52,37,76,0.22)', maxHeight: '56vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs font-bold text-[var(--color-aubergine)]">
                {panel === 'cat' ? 'Filter' : panel === 'loc' ? 'Standort' : 'Reichweite'}
              </p>
              <div className="flex items-center gap-3">
                {panel === 'cat' && catActive && (
                  <button onClick={() => setTagSel(EMPTY_TAG_SEL)} className="text-[11px] font-bold text-[var(--color-amber)]">
                    <i className="fa-solid fa-rotate-left mr-1" />Zurücksetzen
                  </button>
                )}
                <button onClick={() => setPanel(null)} className="text-[var(--color-lavender)]" aria-label="Schließen">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
            {panel === 'cat' && <TagFilter value={tagSel} onChange={setTagSel} />}
            {panel === 'loc' && locSearch}
            {panel === 'reach' && (
              <ReachControls
                travelMode={reach.travelMode} setTravelMode={reach.setTravelMode}
                travelMinutes={reach.travelMinutes} setTravelMinutes={reach.setTravelMinutes}
                radiusKm={radiusKm} setRadiusKm={setRadiusKm}
                iso={reach.iso} isoLoading={reach.isoLoading} />
            )}
          </div>
        )}

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

      {/* Das EINE Overlay: Rast 0/1 = Liste, Rast 2 = Swipe. Kein zweites Sheet, keine neue Seite.
          Liegt immer UNTER der Bottom-Nav (z-50) — die fährt im Swipe selbst aus dem Weg. */}
      <div className="fixed left-0 right-0 z-20 flex flex-col overflow-hidden rounded-t-[1.75rem]"
        style={{
          top: snap.top, bottom: 0, background: '#FBF9FC',
          boxShadow: '0 -8px 30px rgba(52,37,76,0.18)',
          transform: `translateY(${sheetDragY}px)`,
          transition: sheetDragging ? 'none' : 'transform .34s cubic-bezier(.32,.72,0,1)',
        }}>
        {/* Griff + Kopf (Zieh-Bereich) — nur in der Liste. Im Swipe liegen Griff und „Liste"-Button
            IM Bild (siehe SwipeDeck), damit sie mit dem Hero wegscrollen statt zu schweben. */}
        {!swipeMode && (
          <div className="flex-shrink-0 relative z-30" onTouchStart={onSheetTouchStart} onTouchMove={onSheetTouchMove} onTouchEnd={onSheetTouchEnd} style={{ touchAction: 'none' }}>
            <div className="flex justify-center pt-2.5 pb-1.5">
              <div className="w-10 h-1.5 rounded-full" style={{ background: '#d9cfe2' }} />
            </div>
            <div className="px-4 pb-2.5 flex items-center justify-between gap-2">
              <p className="font-display font-bold text-[var(--color-aubergine)]">
                {listPlaces.length} {listPlaces.length === 1 ? 'Ort' : 'Orte'}{reachCenter ? ' in der Nähe' : ''}
              </p>
              <button onClick={goSwipe}
                onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
                style={{ background: 'var(--color-amber)', color: 'white' }}>
                <i className="fa-solid fa-layer-group" />Swipen
              </button>
            </div>
          </div>
        )}

        {/* Rast 2: der Swipe-Ort füllt dasselbe Overlay (Bild oben abgerundet durchs Sheet selbst).
            Hochwischen klappt den Artikel DARUNTER auf — kein zweites Overlay, gleiche Seite. */}
        {swipeMode && (
          <div className="absolute inset-0 z-20">
            <SwipeDeck places={swipeFeed} onCardChange={setSwipeFocus}
              onPullDown={onDeckPull} onPullDownEnd={onDeckPullEnd}
              onBackToList={() => closeSwipeToList()}
              // Zurück führt dorthin, wo man hergekommen ist: „Meine Orte", die Liste (gezielt
              // geöffneter Ort) oder das Swipe-Bild (von dort hochgewischt).
              // Bei fremder Herkunft echtes History-Zurück statt navigate(pfad) — das schöbe einen
              // neuen Eintrag drauf und die Scroll-Position der Merkliste wäre sicher verloren.
              onBack={() => {
                if (backTo) navigate(-1);
                else if (articleOnly) closeSwipeToList();
                else setSwipeArticle(false);
              }}
              onOpenReviews={() => setReviewsSignal(n => n + 1)}
              radiusCount={inRadius.length} onShowAll={mode === 'all' ? undefined : showAllAgain}
              emptyFilters={swipeFilters}
              reachFrom={reachCenter} travelMode={reach.travelMode}
              articleOpen={swipeArticle}
              onOpenArticle={() => setSwipeArticle(true)}
              // Gezielt geöffnet → runter führt direkt in die Liste (kein Umweg über den Swipe).
              onCloseArticle={() => (articleOnly ? closeSwipeToList() : setSwipeArticle(false))}
              article={swipeFocus && (
                <Suspense fallback={<div className="py-20 flex items-center justify-center text-[var(--color-lavender)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>}>
                  <PlaceDetailEmbed key={swipeFocus.id} id={swipeFocus.id} embedded inline reviewsSignal={reviewsSignal} onOpenPlace={openPlaceId} />
                </Suspense>
              )} />
          </div>
        )}
        {/* Scrollbare Liste (nach rechts wischen startet den Swipe). Scroll-Fuß = Bottom-Nav + der
            Teil des Sheets, der in dieser Rast unter dem Bildschirmrand hängt — sonst wären die
            letzten Orte nicht erreichbar. Bewusst an der RAST statt am laufenden Zug: sonst würde
            die Liste bei jedem Frame neu umbrechen. */}
        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-3"
          style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${88 + snap.offs[sheetSnap]}px)` }}
          onTouchStart={onListTouchStart} onTouchEnd={onListTouchEnd}>
          {listPlaces.length === 0 ? (
            <div className="text-center py-12 text-[var(--color-lavender)] text-sm">
              <i className="fa-solid fa-map-location-dot text-3xl mb-3 opacity-40 block" />
              Keine Orte im Radius. Erhöhe Reisezeit/Radius oder ändere die Kategorie.
            </div>
          ) : listPlaces.map(({ p, dist }) => (
            <button key={p.id} data-place-id={p.id} onClick={() => { if (justSwiped.current) return; openPlace(p); }}
              className="w-full flex items-center gap-3 py-2 px-2 rounded-2xl text-left transition-colors active:scale-[0.99]"
              style={{ background: p.id === selectedId ? '#F1ECF4' : 'transparent' }}>
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-[var(--color-bg-soft)]">
                <img src={imgUrl(p.hero, 64)} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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


    </AppShell>
  );
}
