import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
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
import { placeMatchesTag, EMPTY_TAG_SEL } from '../components/ui/TagFilter.js';
import type { TagSelection } from '../components/ui/TagFilter.js';
import { PlaceFilters, EMPTY_FACETS, facetsActive, type Facets } from '../components/ui/PlaceFilters.js';
import { SwipeDeck } from '../components/ui/SwipeDeck.js';
import { useRequireAuth } from '../hooks/useRequireAuth.js';
import { useUiStore } from '../store/useUiStore.js';
import { MAP_LAYERS, TILE_URL, HYBRID_ROADS, HYBRID_LABELS, TILE_PERF, type MapLayer } from '../utils/mapTiles.js';
import { imgUrl } from '../utils/img.js';
import { Avatar } from '../components/ui/Avatar.js';
import { usersApi, messagesApi, type FollowedUser } from '../services/api.js';
import { useMessageSocket } from '../store/useMessageSocket.js';

// Ortsdetails im Overlay (lazy → hält das Karten-Bundle klein)
const PlaceDetailEmbed = lazy(() => import('./PlaceDetailPage.js').then(m => ({ default: m.PlaceDetailPage })));
// Blog einer Person im selben Overlay (lazy → nur laden, wenn wirklich jemand geöffnet wird)
const BlogEmbed = lazy(() => import('./UserProfilePage.js').then(m => ({ default: m.UserProfilePage })));
// Das eigene Profil liegt im selben Overlay — gleicher Kopf, nur mit Stiften
const ProfileEmbed = lazy(() => import('./ProfilePage.js').then(m => ({ default: m.ProfilePage })));
// Nachrichtenverlauf ebenfalls auf dem Overlay — herunterziehen zeigt die Karte
const ChatEmbed = lazy(() => import('./ChatPage.js').then(m => ({ default: m.ChatPage })));
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

/**
 * Marker fuer geteilte Standorte. Der Live-Punkt pulsiert leicht, damit er sich vom
 * ruhenden Pin unterscheidet; am Pin steht, wie alt er ist („vor 8 Std") — sonst haelt
 * man einen Standort von gestern fuer den aktuellen.
 */
function personMarker(label: string, live: boolean, mine: boolean): L.DivIcon {
  const color = mine ? '#8A6FB3' : '#F99039';
  const dot = live
    ? `<span style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:.28;animation:gtPulse 1.8s ease-out infinite;"></span>`
    : '';
  return L.divIcon({
    html: `<div style="position:relative;width:30px;height:30px;">
             ${dot}
             <div style="position:absolute;inset:3px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 3px 9px rgba(52,37,76,.45);display:flex;align-items:center;justify-content:center;">
               <i class="fa-solid ${live ? 'fa-location-crosshairs' : 'fa-location-dot'}" style="font-size:11px;line-height:1;color:#fff"></i>
             </div>
             <div style="position:absolute;top:32px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#fff;color:#34254c;font-size:10px;font-weight:700;padding:2px 6px;border-radius:9px;box-shadow:0 2px 6px rgba(52,37,76,.25);">${label}</div>
           </div>`,
    iconSize: [30, 30], iconAnchor: [15, 15], className: '',
  });
}

/** „vor 8 Std" — grobe Angabe reicht und liest sich besser als ein Zeitstempel. */
function ageLabel(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')).getTime()) / 60000));
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std`;
  return `vor ${Math.round(h / 24)} Tg`;
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
  facets: EMPTY_FACETS as Facets,   // Merkmale/Vibe/Bewertung/Budget/Zielgruppe
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
  // Personenfilter (aus einem Blog geöffnet oder über den Traveler-Filter): nur Orte dieser Person
  const [personFilter, setPersonFilter] = useState<{ id: number; name: string } | null>(null);
  const [travelers, setTravelers] = useState<FollowedUser[] | null>(null);   // null = noch nicht geladen
  const [tagSel, setTagSel] = useState<TagSelection>(entdeckenCache.tagSel);
  const [facets, setFacets] = useState<Facets>(entdeckenCache.facets);
  const [selectedId, setSelectedId] = useState<string | null>(entdeckenCache.selectedId);
  const [panel, setPanel] = useState<null | 'cat' | 'loc' | 'reach' | 'traveler'>(null);
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
  const anyFilter = facetsActive(tagSel, facets);   // steuert Icon-Highlight + „Zurücksetzen"

  useEffect(() => {
    loadPlaces();
    if (!userCoords) requestGpsPosition().then(setUserCoords).catch(() => {});
  }, []); // eslint-disable-line

  // Was überhaupt in Reichweite liegt (Kategorie + Facetten + Radius/Isochrone) — noch ohne Modus-Regel.
  // Karte/Liste und Swipe leiten getrennt davon ab: sie brauchen unterschiedliche Regeln.
  const inRadius = useMemo(() => {
    // Merkmale/Vibes liegen in attributes; Zielgruppe in attributes.answers.audience.
    const attrArr = (p: Place, key: 'merkmale' | 'vibes'): string[] => {
      const v = (p.attributes as Record<string, unknown>)?.[key];
      return Array.isArray(v) ? (v as string[]) : [];
    };
    const audienceArr = (p: Place): string[] => {
      const ans = (p.attributes as Record<string, unknown>)?.answers as Record<string, unknown> | undefined;
      const v = ans?.audience;
      return Array.isArray(v) ? (v as string[]) : [];
    };
    const hasAny = (have: string[], want: string[]) => want.some(w => have.includes(w));

    let base = places.filter(p => p.lat != null && p.lng != null);
    // Personenfilter: nur Orte einer bestimmten Person (z.B. aus deren Blog geöffnet)
    if (personFilter) base = base.filter(p => p.submittedBy === personFilter.id);
    if (catActive) base = base.filter(p => placeMatchesTag(p, tagSel, vocab));
    // Facetten: OR innerhalb einer Facette, AND über die Facetten hinweg (narrows, aber nicht leer).
    if (facets.merkmale.length) base = base.filter(p => hasAny(attrArr(p, 'merkmale'), facets.merkmale));
    if (facets.vibes.length)    base = base.filter(p => hasAny(attrArr(p, 'vibes'), facets.vibes));
    if (facets.audience.length) base = base.filter(p => hasAny(audienceArr(p), facets.audience));
    if (facets.minRating)         base = base.filter(p => (p.rating ?? 0) >= facets.minRating);
    if (facets.maxCost !== null)  base = base.filter(p => (p.cost ?? 99) <= facets.maxCost!);
    if (reachCenter) {
      const within = (p: Place) =>
        reach.travelMode === 'radius' ? distanceKm(reachCenter, { lat: p.lat!, lng: p.lng! }) <= radiusKm
        : reach.iso                   ? pointInGeoJSON(p.lat!, p.lng!, reach.iso.feature.geometry)
        : distanceKm(reachCenter, { lat: p.lat!, lng: p.lng! }) <= (EFFECTIVE_SPEED_KMH[reach.travelMode as Transport] * reach.travelMinutes) / 60;
      base = base.filter(within);
    }
    return base;
  }, [places, personFilter, tagSel, catActive, facets, vocab, reachCenter, reach.travelMode, reach.travelMinutes, reach.iso, radiusKm]);

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
  // Blog einer Person: liegt AUF dem Overlay (Rast 2). Zieht man es herunter, kommt die
  // Karte — über den Personenfilter bereits auf die Orte dieser Person gefiltert.
  const [blogUserId, setBlogUserId] = useState<number | null>(null);
  // Das eigene Profil liegt auf demselben Overlay wie ein fremdes Blog
  const [profileOpen, setProfileOpen] = useState(false);
  // Nachrichtenverlauf — ebenfalls auf dem Overlay, damit die Karte einen Zug entfernt ist
  const [chatUserId, setChatUserId] = useState<number | null>(null);
  // Geteilte Standorte des offenen Gespraechs: laufende Freigaben + gesetzte Pins
  const [chatLive, setChatLive] = useState<{ lat: number; lng: number; mine: boolean; updatedAt: string; expiresAt: string }[]>([]);
  const [chatPins, setChatPins] = useState<{ id: number; lat: number; lng: number; fromMe: boolean; createdAt: string }[]>([]);
  const blogMode = blogUserId !== null && sheetSnap === 2;
  const profileMode = profileOpen && chatUserId === null && sheetSnap === 2;
  const chatMode = chatUserId !== null && sheetSnap === 2;
  // Rast 2 IST der Swipe — es gibt kein eigenes Sheet und keine eigene Seite mehr.
  const swipeMode = sheetSnap === 2 && blogUserId === null && !profileOpen && chatUserId === null;
  const [swipeArticle, setSwipeArticle] = useState(false);   // Artikel unter dem Bild (gleiche Seite)
  const [reviewsSignal, setReviewsSignal] = useState(0);     // Sterne am Hero → Rezensionen aufklappen
  // Stapel neu aufnehmen anfordern. Über einen Zähler statt direktem setSwipeFeed: Modus/Filter
  // wirken erst im nächsten Render, ein Aufruf in derselben Runde griffe auf alte Werte.
  const [feedNonce, setFeedNonce] = useState(0);
  const [swipeLocOpen, setSwipeLocOpen] = useState(false);   // Ortssuche auf der leeren Swipe-Seite
  const [backTo, setBackTo] = useState<string | null>(null);  // Herkunft (z.B. „Meine Orte") für den Zurückpfeil
  // Stapel der Orte, von denen aus man einem Link IM Artikel gefolgt ist. „Zurück" führt
  // dann Schritt für Schritt zum Ausgangsartikel zurück, statt gleich in die Liste zu schließen.
  const [placeStack, setPlaceStack] = useState<Place[]>([]);
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
    setPlaceStack([]);   // Artikel-Kette endet hier — Zurück-Stapel verwerfen
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
  // Einen Ort als Artikel zeigen — ohne den Zurück-Stapel anzufassen (nutzen alle Öffner intern).
  const showPlace = (p: Place) => {
    setPanel(null);         // sonst schwebt der offene Filter über dem Artikel
    setBlogUserId(null); setProfileOpen(false); setChatUserId(null);   // ein Ort löst alles andere im Overlay ab
    setSwipeFeed([p]);      // Einzel-Feed: es geht um GENAU diesen Ort
    setSwipeFocus(p);       // direkt setzen — sonst rendert der Artikel einen Frame lang den alten Ort
    setArticleOnly(true);
    setSwipeArticle(true);
    setSheetSnap(2);
  };
  // Gezielt geöffnet (Liste, Pin, „Meine Orte"): frische Sitzung → Zurück-Stapel leeren.
  const openPlace = (p: Place) => { setPlaceStack([]); showPlace(p); };
  /**
   * Blog einer Person im Overlay öffnen. Der Personenfilter wird gleich mitgesetzt, damit
   * die Karte darunter schon ihre Orte zeigt, sobald man das Blog herunterzieht.
   */
  const openBlog = (id: number, name = '') => {
    setPanel(null);
    setProfileOpen(false);
    setChatUserId(null);
    setPersonFilter({ id, name });
    setBlogUserId(id);
    setSheetSnap(2);
  };
  /** Eigenes Profil im Overlay öffnen (kein Personenfilter — das sind ja die eigenen Orte). */
  const openProfile = () => {
    setPanel(null);
    setBlogUserId(null);
    setChatUserId(null);
    setProfileOpen(true);
    setSheetSnap(2);
  };
  /**
   * Standorte des offenen Gespraechs holen. Laeuft nur, solange ein Verlauf offen ist —
   * ohne Gespraech gibt es auf der Karte auch nichts zu zeigen.
   */
  useEffect(() => {
    if (chatUserId === null) { setChatLive([]); setChatPins([]); return; }
    let alive = true;
    messagesApi.thread(chatUserId).then(d => {
      if (!alive) return;
      setChatPins(d.messages.filter(m => m.lat != null && m.lng != null)
        .map(m => ({ id: m.id, lat: m.lat!, lng: m.lng!, fromMe: m.fromMe, createdAt: m.createdAt })));
      setChatLive((d.live ?? []).filter(l => l.lat != null && l.lng != null)
        .map(l => ({ lat: l.lat!, lng: l.lng!, mine: l.mine, updatedAt: l.updatedAt, expiresAt: l.expiresAt })));
    }).catch(() => {});
    // Der Punkt wandert ueber denselben Kanal wie die Nachrichten.
    const off = useMessageSocket.getState().subscribe(ev => {
      if (ev.type === 'live' && ev.from === chatUserId) {
        setChatLive(l => [...l.filter(x => x.mine), {
          lat: ev.lat, lng: ev.lng, mine: false, updatedAt: new Date().toISOString(), expiresAt: ev.expiresAt,
        }]);
      }
      if (ev.type === 'live_stop' && ev.from === chatUserId) setChatLive(l => l.filter(x => x.mine));
      if (ev.type === 'message' && (ev.from === chatUserId || ev.to === chatUserId)
          && ev.message.lat != null && ev.message.lng != null) {
        setChatPins(p => [...p, {
          id: ev.message.id, lat: ev.message.lat!, lng: ev.message.lng!,
          fromMe: ev.from !== chatUserId, createdAt: ev.message.createdAt,
        }]);
      }
    });
    return () => { alive = false; off(); };
  }, [chatUserId]);

  /** Nachrichtenverlauf im Overlay öffnen — herunterziehen führt zur Karte. */
  const openChat = (id: number) => {
    setPanel(null);
    setBlogUserId(null);
    setProfileOpen(false);
    setChatUserId(id);
    setSheetSnap(2);
  };
  // Ort→Ort-Link IM Artikel: den aktuellen Ort merken, damit „Zurück" wieder zu ihm führt.
  const openPlaceId = (id: string) => {
    const p = places.find(x => x.id === id);
    if (!p) return;
    setPlaceStack(prev => (swipeFocus ? [...prev, swipeFocus] : prev));
    showPlace(p);
  };
  /**
   * Pin-Klick auf der Karte: NICHT direkt öffnen. Den Ort in der Liste markieren, dorthin scrollen
   * und die Karte auf ihn zentrieren — man entscheidet dann selbst, ob man ihn anschaut.
   */
  const focusPlace = (p: Place) => {
    setListFocus(p);           // Karte fliegt ihn an, Pin wird lila
    setSelectedId(p.id);       // Listeneintrag markiert
    setSheetSnap(s => (s === 0 ? 1 : s));   // Liste sichtbar machen, falls nur Peek
    setTimeout(() => listRef.current?.querySelector(`[data-place-id="${p.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  };
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
      searchCenter, searchLabel, userCoords, radiusKm, mode, tagSel, facets,
      travelMode: reach.travelMode, travelMinutes: reach.travelMinutes,
      selectedId, scrollTop: listRef.current?.scrollTop ?? entdeckenCache.scrollTop,
      // Rast 2 NICHT merken: der Swipe-Feed ist ein Snapshot dieser Sitzung — beim Neuaufbau
      // stünde man sonst im Swipe vor einem leeren Feed. „Zurück" landet in der Liste.
      sheetSnap: swipeMode || blogMode || profileMode || chatMode ? 1 : sheetSnap,
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

  // Spiegel für die nativen Listener: die werden einmal gesetzt und sähen sonst alte Werte.
  const snapRef = useRef(snap); snapRef.current = snap;
  const sheetDragYRef = useRef(sheetDragY); sheetDragYRef.current = sheetDragY;
  const pullCleanup = useRef<(() => void) | null>(null);

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
  /**
   * Zug am INHALT des Overlays: steht der Inhalt schon ganz oben und man zieht nach unten,
   * gehört die Geste dem Overlay — nicht dem Scroll-Container. Man muss also nicht erst den
   * Griff am oberen Rand treffen, sondern kann irgendwo im Inhalt (z.B. am Titelbild) ziehen.
   *
   * WICHTIG: Der touchmove-Listener wird von Hand und mit passive:false gesetzt. React hängt
   * onTouchMove passiv ein — dort verpufft preventDefault, der Browser würde den Inhalt also
   * ZUSÄTZLICH federn lassen. Genau das schob den Inhalt schneller nach unten als das Overlay
   * und riss oben einen weißen Rand auf.
   */
  const pullState = useRef({ startY: 0, active: false, atTop: false });
  const overlayPull = useCallback((el: HTMLDivElement | null) => {
    const prev = pullCleanup.current;
    if (prev) { prev(); pullCleanup.current = null; }
    if (!el) return;

    const start = (e: TouchEvent) => { pullState.current = { startY: e.touches[0].clientY, active: false, atTop: el.scrollTop <= 0 }; };
    const move = (e: TouchEvent) => {
      const p = pullState.current;
      const y = e.touches[0].clientY;
      if (!p.active) {
        // Auch MITTEN in der Geste übernehmen: wer nach oben scrollt und am Anfang ankommt,
        // zieht sonst weiter am Inhalt — der federt dann über den Header hinaus (weißer Rand).
        if (el.scrollTop > 0) { p.startY = y; p.atTop = true; return; }
        if (y <= p.startY) { p.startY = y; return; }   // nach oben gewischt: gehört dem Inhalt
        // Ab dem ersten Pixel abwehren: entscheidet der Browser erst, federt der Inhalt mit.
        e.preventDefault();
        if (y - p.startY < 3) return;
        p.active = true;
        setPanel(null);
        sheetDrag.current = { startY: y, startOffset: sheetDragYRef.current, moved: 0 };
        setSheetDragging(true);
      }
      e.preventDefault();   // der Inhalt selbst rührt sich nicht — nur das Overlay
      const d = sheetDrag.current; if (!d) return;
      const next = Math.min(Math.max(d.startOffset + (y - d.startY), 0), snapRef.current.offs[0]);
      sheetDragYRef.current = next;
      setSheetDragY(next);
    };
    const end = () => {
      const p = pullState.current;
      pullState.current = { startY: 0, active: false, atTop: false };
      if (!p.active) return;
      sheetDrag.current = null;
      setSheetDragging(false);
      // Bewusst ohne „Tippen = eine Stufe" — das gilt nur für den Griff.
      const offs = snapRef.current.offs;
      let best: SheetSnap = 0, bd = Infinity;
      offs.forEach((v, i) => { const dist = Math.abs(v - sheetDragYRef.current); if (dist < bd) { bd = dist; best = i as SheetSnap; } });
      setSheetSnap(best);
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    pullCleanup.current = () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, []);

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
  function goSwipe() { setPanel(null); setArticleOnly(false); setBackTo(null); setPlaceStack([]); setBlogUserId(null); setProfileOpen(false); setChatUserId(null); setSheetSnap(2); }
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
    const st = location.state as { openPlace?: string; place?: Place; mode?: Mode; from?: string; personId?: number; personName?: string; blogUserId?: number; blogName?: string; profileOverlay?: boolean; chatUserId?: number } | null;
    // Blog einer Person (/u/:id leitet mobil hierher): als Overlay öffnen, Karte darunter gefiltert
    if (st?.blogUserId) {
      setMode('all');
      openBlog(st.blogUserId, st.blogName ?? '');
      navigate('.', { replace: true, state: null });
      return;
    }
    // Eigenes Profil (/profil leitet mobil hierher)
    if (st?.profileOverlay) {
      openProfile();
      navigate('.', { replace: true, state: null });
      return;
    }
    // Nachrichtenverlauf (/postfach/:id leitet mobil hierher)
    if (st?.chatUserId) {
      openChat(st.chatUserId);
      navigate('.', { replace: true, state: null });
      return;
    }
    // Aus einem Blog: Karte automatisch auf die Orte dieser Person filtern
    if (st?.personId) {
      setPersonFilter({ id: st.personId, name: st.personName ?? '' });
      setMode('all');           // alle Orte der Person zeigen, nicht der „Für dich"-Ausschnitt
      setSheetSnap(1);          // Karte + Liste (kein Swipe)
      navigate('.', { replace: true, state: null });
      return;
    }
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
        <button onClick={() => { resetToGps(); setPanel(null); setSwipeLocOpen(false); if (!userCoords) requestGpsPosition().then(setUserCoords).catch(() => {}); }}
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
  // Nur ein bewusst fokussierter/gewählter Ort wird auf der Karte hervorgehoben — beim Start ist
  // NICHTS lila. (Früher fiel es auf `preview` = erster Listeneintrag zurück → immer ein Pin lila.)
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
  const highlightId = swipeMode ? swipeFocus?.id : (listFocus?.id ?? selectedId ?? null);
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
        eventHandlers={{ click: () => focusPlace(p) }} />
    );
  }), [markerPlaces, highlightId, vocab]); // eslint-disable-line

  // Geteilte Standorte liegen ueber den Ortsmarkern — sie sind der Grund, warum die
  // Karte beim offenen Gespraech ueberhaupt angeschaut wird.
  const locationEls = useMemo(() => [
    ...chatLive.map((l, i) => (
      <Marker key={`live${i}`} position={[l.lat, l.lng]} zIndexOffset={2000}
        icon={personMarker(l.mine ? 'du · live' : 'live', true, l.mine)} />
    )),
    ...chatPins.map(p => (
      <Marker key={`pin${p.id}`} position={[p.lat, p.lng]} zIndexOffset={1500}
        icon={personMarker(ageLabel(p.createdAt), false, p.fromMe)} />
    )),
  ], [chatLive, chatPins]);

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
        {locationEls}
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
          <button onClick={() => { const opening = panel !== 'cat'; setPanel(opening ? 'cat' : null); if (opening) setSheetSnap(0); }} className={toolBtn}
            style={{ ...toolShadow, color: anyFilter ? '#F99039' : '#34254c' }} aria-label="Filter">
            <i className="fa-solid fa-filter" />
          </button>
          {/* Traveler-Filter: nur die Orte einer Person, der ich folge */}
          <button onClick={() => gate(() => {
            const opening = panel !== 'traveler';
            setPanel(opening ? 'traveler' : null);
            if (opening) {
              setSheetSnap(0);
              if (travelers === null) usersApi.following().then(setTravelers).catch(() => setTravelers([]));
            }
          }, 'Melde dich an, um nach Travelern zu filtern.')} className={toolBtn}
            style={{ ...toolShadow, color: personFilter ? '#F99039' : '#34254c' }} aria-label="Nach Traveler filtern">
            <i className="fa-solid fa-user-group" />
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
                {panel === 'cat' ? 'Filter' : panel === 'loc' ? 'Standort' : panel === 'traveler' ? 'Traveler' : 'Reichweite'}
              </p>
              <div className="flex items-center gap-3">
                {panel === 'cat' && anyFilter && (
                  <button onClick={() => { setTagSel(EMPTY_TAG_SEL); setFacets(EMPTY_FACETS); }} className="text-[11px] font-bold text-[var(--color-amber)]">
                    <i className="fa-solid fa-rotate-left mr-1" />Alle zurücksetzen
                  </button>
                )}
                {panel === 'traveler' && personFilter && (
                  <button onClick={() => setPersonFilter(null)} className="text-[11px] font-bold text-[var(--color-amber)]">
                    <i className="fa-solid fa-rotate-left mr-1" />Zurücksetzen
                  </button>
                )}
                <button onClick={() => setPanel(null)} className="text-[var(--color-lavender)]" aria-label="Schließen">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
            {panel === 'cat' && <PlaceFilters vocab={vocab} sel={tagSel} onSel={setTagSel} facets={facets} onFacets={setFacets} />}
            {panel === 'traveler' && (
              travelers === null ? (
                <div className="flex justify-center py-6 text-[var(--color-lavender-lt)]"><i className="fa-solid fa-circle-notch fa-spin" /></div>
              ) : travelers.length === 0 ? (
                <div className="text-center py-5 text-[var(--color-lavender)]">
                  <i className="fa-solid fa-user-plus text-2xl mb-2 opacity-30 block" />
                  <p className="text-sm">Du folgst noch niemandem.</p>
                  <button onClick={() => navigate('/traveler')} className="text-xs font-bold text-[var(--color-amber)] mt-1.5">Traveler entdecken</button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {travelers.map(t => {
                    const active = personFilter?.id === t.id;
                    return (
                      <button key={t.id}
                        onClick={() => { setPersonFilter(active ? null : { id: t.id, name: t.name }); setPanel(null); }}
                        className={`w-full flex items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors ${active ? 'bg-[var(--color-amber)]/12' : 'bg-[var(--color-bg-soft)]'}`}>
                        <Avatar name={t.name} src={t.avatarUrl} size={34} cropX={t.avatarCropX} cropY={t.avatarCropY} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-[var(--color-aubergine)] truncate">{t.name}</span>
                          <span className="block text-[11px] text-[var(--color-lavender)] truncate">@{t.handle}</span>
                        </span>
                        {active && <i className="fa-solid fa-check text-[var(--color-amber)] mr-1.5" />}
                      </button>
                    );
                  })}
                </div>
              )
            )}
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
          {personFilter && (
            <button onClick={() => setPersonFilter(null)}
              className="text-[11px] font-bold rounded-full px-3 py-1.5 flex-shrink-0 inline-flex items-center gap-1.5 text-white"
              style={{ background: '#F99039' }} title="Personenfilter aufheben">
              <i className="fa-solid fa-user text-[10px]" />
              Orte von {personFilter.name || 'dieser Person'}
              <i className="fa-solid fa-xmark text-[10px]" />
            </button>
          )}
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
        {!swipeMode && !blogMode && !profileMode && !chatMode && (
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
                if (placeStack.length) {                          // einem Link IM Artikel gefolgt
                  const prev = placeStack[placeStack.length - 1];  // → Schritt zurück zum Ausgangsort
                  setPlaceStack(s => s.slice(0, -1));
                  showPlace(prev);
                } else if (backTo) navigate(-1);
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
        {/* Profil auf dem Overlay — fremdes Blog ODER das eigene. Am Griff (oder irgendwo im
            Inhalt, solange er oben steht) herunterziehen zeigt die Karte, beim Blog schon über
            den Personenfilter auf ihre Orte eingestellt; noch weiter unten die Liste. */}
        {(blogMode || profileMode || chatMode) && (
          <div className="absolute inset-0 z-30 bg-white rounded-t-3xl overflow-hidden">
            {/* Das Titelbild beginnt ganz oben — Griff und Zurück liegen IM Bild (wie beim Ort),
                sonst stünde eine weiße Leiste über dem Header. */}
            <div className="h-full overflow-y-auto no-scrollbar"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 88px)', overscrollBehavior: 'none' }}
              ref={overlayPull}>
              <Suspense fallback={<div className="py-20 flex items-center justify-center text-[var(--color-lavender)]"><i className="fa-solid fa-circle-notch fa-spin text-2xl" /></div>}>
                {chatMode && chatUserId !== null
                  ? <ChatEmbed key={`c${chatUserId}`} userId={chatUserId} embedded />
                  : blogMode && blogUserId !== null
                  ? <BlogEmbed key={blogUserId} userId={blogUserId} embedded
                      onUser={u => setPersonFilter(pf => (pf && pf.id === u.id ? { id: u.id, name: u.name } : pf))} />
                  : <ProfileEmbed embedded />}
              </Suspense>
            </div>
            {/* Zieh-Griff über dem Bild — nimmt die Geste an, ohne Fläche zu belegen */}
            <div className="absolute top-0 left-0 right-0 h-9 z-10 flex justify-center pt-2.5"
              onTouchStart={onSheetTouchStart} onTouchMove={onSheetTouchMove} onTouchEnd={onSheetTouchEnd} style={{ touchAction: 'none' }}>
              <div className="w-10 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,.6)' }} />
            </div>
            {/* Schließen: Profil weg, beim Blog bleibt die Karte auf die Person gefiltert
                (der Chip über den Modus-Knöpfen löst ihn wieder). */}
            <button onClick={() => { setBlogUserId(null); setProfileOpen(false); setChatUserId(null); setSheetSnap(1); }}
              className="absolute left-4 top-4 z-20 w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-90"
              style={{ background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(6px)' }} aria-label="Profil schließen">
              <i className="fa-solid fa-arrow-left" />
            </button>
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
