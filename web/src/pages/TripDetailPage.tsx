import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppShell } from '../components/layout/AppShell.js';
import { BottomSheet } from '../components/ui/BottomSheet.js';
import { Avatar } from '../components/ui/Avatar.js';
import { useAppStore } from '../store/useAppStore.js';
import { useAuthStore } from '../store/useAuthStore.js';
import type { Place, Trip, TripPlace, Transport, Friend } from '../types/index.js';
import { MOBILITY, DEMO_HOTELS } from '../types/index.js';
import { tripsApi, geoApi, friendsApi } from '../services/api.js';
import { geocodeSuggestions, distanceKm } from '../services/geoService.js';
import type { GeoLocation } from '../services/geoService.js';
import type { RouteResponse } from '../utils/geo.js';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';

// ─── Abstimmung: Mitreisende voten Ja/Vielleicht/Nein je Ort ──────────────────
function TripVoting({ trip, reload }: { trip: Trip; reload: () => unknown }) {
  const [busy, setBusy] = useState(false);
  const votes = trip.votes ?? {};
  const places = trip.places ?? [];

  const score = (pid: string) => { const v = votes[pid]; return v ? v.yes * 2 + v.maybe : 0; };
  const maxScore = places.length ? Math.max(0, ...places.map(tp => score(tp.placeId))) : 0;
  const hasVotes = maxScore > 0;

  async function vote(placeId: string, v: 'yes' | 'maybe' | 'no') {
    setBusy(true);
    try { await tripsApi.vote(trip.id, placeId, v); await reload(); } catch { /* */ }
    setBusy(false);
  }

  const OPTIONS: { v: 'yes' | 'maybe' | 'no'; icon: string; label: string; color: string }[] = [
    { v: 'yes',   icon: 'fa-thumbs-up',   label: 'Ja',         color: '#2e7d32' },
    { v: 'maybe', icon: 'fa-face-meh',    label: 'Vielleicht', color: '#F99039' },
    { v: 'no',    icon: 'fa-thumbs-down', label: 'Nein',       color: '#b9a8c4' },
  ];

  if (places.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border-2 border-[var(--color-bg-soft)] p-4">
      <h2 className="font-display font-bold text-base text-[var(--color-aubergine)] mb-1">
        <i className="fa-solid fa-square-poll-vertical text-[var(--color-amber)] mr-2" />Abstimmung
      </h2>
      <p className="text-xs text-[var(--color-lavender)] mb-4">Stimmt gemeinsam ab, welche Orte ihr wirklich besuchen wollt.</p>
      <div className="flex flex-col gap-3">
        {places.map(tp => {
          const place = tp.place;
          const v = votes[tp.placeId] ?? { yes: 0, maybe: 0, no: 0, myVote: null };
          const isFav = hasVotes && score(tp.placeId) === maxScore;
          return (
            <div key={tp.placeId} className={`rounded-2xl border-2 p-3 ${isFav ? 'border-[var(--color-amber)] bg-[var(--color-amber)]/5' : 'border-[var(--color-bg-soft)]'}`}>
              <div className="flex items-center gap-3 mb-2.5">
                {place?.hero
                  ? <img src={place.hero} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-11 h-11 rounded-xl bg-[var(--color-bg-soft)] flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--color-aubergine)] truncate flex items-center gap-1.5">
                    {place?.name ?? 'Ort'}
                    {isFav && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--color-amber)] text-white flex-shrink-0">★ Favorit</span>}
                  </div>
                  <div className="text-[11px] text-[var(--color-lavender)]">{v.yes} ×👍 · {v.maybe} ×🤔 · {v.no} ×👎</div>
                </div>
              </div>
              <div className="flex gap-2">
                {OPTIONS.map(o => {
                  const active = v.myVote === o.v;
                  return (
                    <button key={o.v} disabled={busy} onClick={() => vote(tp.placeId, o.v)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border-2 transition-colors disabled:opacity-60 ${
                        active ? 'text-white border-transparent' : 'border-[var(--color-bg-soft)] text-[var(--color-lavender)]'}`}
                      style={active ? { background: o.color } : undefined}>
                      <i className={`fa-solid ${o.icon}`} /> {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Mitreisende: Teilnehmer anzeigen, einladen, an-/absagen ──────────────────
function TripParticipants({ trip, reload }: { trip: Trip; reload: () => unknown }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [busy, setBusy] = useState(false);
  const parts = trip.participants ?? [];
  const isOwner = !!trip.isOwner;
  const invitedIds = new Set(parts.map(p => p.userId));

  const openInvite = async () => {
    setInviteOpen(true);
    try { setFriends(await friendsApi.list()); } catch { /* */ }
  };
  const invite = async (handle: string) => {
    setBusy(true);
    try { await tripsApi.invite(trip.id, handle); await reload(); }
    catch (e) { alert((e as Error).message ?? 'Fehler'); }
    setBusy(false);
  };
  const respond = async (status: 'accepted' | 'declined') => {
    setBusy(true);
    try { await tripsApi.respond(trip.id, status); await reload(); } catch { /* */ }
    setBusy(false);
  };
  const remove = async (userId: number) => {
    if (!confirm('Aus dem Ausflug entfernen?')) return;
    try { await tripsApi.removeParticipant(trip.id, userId); await reload(); } catch { /* */ }
  };

  return (
    <section className="mb-6 rounded-2xl border-2 border-[var(--color-bg-soft)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-base text-[var(--color-aubergine)]">
          <i className="fa-solid fa-user-group text-[var(--color-amber)] mr-2" />Mitreisende
        </h2>
        {isOwner && (
          <button onClick={openInvite} className="text-xs font-bold text-[var(--color-amber)] flex items-center gap-1">
            <i className="fa-solid fa-plus" /> Einladen
          </button>
        )}
      </div>

      {/* Einladung an mich */}
      {trip.myStatus === 'invited' && (
        <div className="bg-[var(--color-amber)]/10 border border-[var(--color-amber)] rounded-xl p-3 mb-3">
          <p className="text-sm text-[var(--color-aubergine)] font-semibold mb-2">Du wurdest zu diesem Ausflug eingeladen 🎒</p>
          <div className="flex gap-2">
            <button onClick={() => respond('accepted')} disabled={busy}
              className="flex-1 bg-[var(--color-amber)] text-white font-bold py-2 rounded-xl text-sm disabled:opacity-60">Bin dabei!</button>
            <button onClick={() => respond('declined')} disabled={busy}
              className="flex-1 border-2 border-[var(--color-bg-soft)] text-[var(--color-lavender)] font-bold py-2 rounded-xl text-sm disabled:opacity-60">Absagen</button>
          </div>
        </div>
      )}

      {parts.length === 0 ? (
        <p className="text-xs text-[var(--color-lavender)]">
          {isOwner ? 'Lade Freund:innen ein und plant den Ausflug gemeinsam.' : 'Noch niemand eingeladen.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {parts.map(p => (
            <div key={p.userId} className="flex items-center gap-3">
              <Avatar name={p.name} src={p.avatarUrl} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--color-aubergine)] truncate">{p.name}</div>
                <div className="text-[10px] text-[var(--color-lavender-lt)]">@{p.handle}</div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                p.status === 'accepted' ? 'bg-green-100 text-green-700'
                : p.status === 'declined' ? 'bg-[var(--color-bg-soft)] text-[var(--color-lavender)]'
                : 'bg-[var(--color-amber)]/15 text-[var(--color-amber)]'}`}>
                {p.status === 'accepted' ? 'kommt mit' : p.status === 'declined' ? 'abgesagt' : 'eingeladen'}
              </span>
              {isOwner && (
                <button onClick={() => remove(p.userId)} className="text-[var(--color-lavender-lt)] hover:text-[#e05858] text-xs px-1" aria-label="Entfernen">
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Freund:in einladen">
        {friends.length === 0 ? (
          <p className="text-sm text-[var(--color-lavender)] py-6 text-center px-4">
            Du hast noch keine Freund:innen, die du einladen kannst. Füge zuerst Freund:innen über ihr Profil hinzu.
          </p>
        ) : (
          <div className="flex flex-col gap-1 pb-4 px-1">
            {friends.map(f => {
              const already = invitedIds.has(f.id);
              return (
                <button key={f.id} disabled={already || busy} onClick={() => invite(f.handle)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--color-bg-soft)] disabled:opacity-50 text-left transition-colors">
                  <Avatar name={f.name} src={f.avatarUrl} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--color-aubergine)] truncate">{f.name}</div>
                    <div className="text-[10px] text-[var(--color-lavender-lt)]">@{f.handle}</div>
                  </div>
                  {already
                    ? <span className="text-[10px] text-[var(--color-lavender)]">eingeladen</span>
                    : <i className="fa-solid fa-plus text-[var(--color-amber)]" />}
                </button>
              );
            })}
          </div>
        )}
      </BottomSheet>
    </section>
  );
}

// Verkehrsmittel für Trips: Rad, Auto, ÖPNV (Deutschlandticket), Fernverkehr
const TRIP_MODES = MOBILITY.filter(m => ['bike', 'auto', 'transit', 'train'].includes(m.id));

// ─── Helfer ───────────────────────────────────────────────────────────────────

/** Gastronomie? → eigene Kachel-Optik (Pause statt Attraktion) */
function isGastro(p?: Place): 'cafe' | 'restaurant' | null {
  if (!p) return null;
  const attrs = p.attributes as Record<string, unknown> | undefined;
  const l3 = typeof attrs?.l3Slug === 'string' ? attrs.l3Slug : '';
  const hay = `${p.name}`.toLowerCase();
  if (l3 === 'cafes-snacks' || /café|cafe|kaffee|konditorei/.test(hay)) return 'cafe';
  if (l3 === 'restaurants-speiselokale' || p.category === 'genuss' || /restaurant|gasthof|gaststätte/.test(hay)) return 'restaurant';
  return null;
}

/** "5 €", "ab 7,50€" → Zahl (Erwachsenen-Eintritt für den Kostenrechner) */
function parseEuro(s?: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = s.replace(',', '.').match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function adultPrice(p?: Place): number | null {
  if (!p) return null;
  const answers = ((p.attributes as Record<string, unknown>)?.answers ?? {}) as Record<string, unknown>;
  if (answers.entrance_fee === 'Kostenlos') return 0;
  const prices = answers.entrance_prices as Record<string, string> | undefined;
  return parseEuro(prices?.adult) ?? parseEuro(answers.entrance_fee_amount);
}

function fmtLeg(seconds: number, meters: number): string {
  const min = Math.round(seconds / 60);
  const time = min >= 60 ? `${Math.floor(min / 60)} Std ${min % 60 ? `${min % 60} Min` : ''}`.trim() : `${min} Min`;
  const dist = meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km` : `${meters} m`;
  return `${time} · ${dist}`;
}

function gmapsTravelMode(t: Transport): string {
  return t === 'bike' ? 'bicycling' : t === 'auto' ? 'driving' : 'transit';
}

/** Google-Maps-Route eines Tages (mit Zwischenstopps) */
function gmapsDayUrl(stops: Place[], t: Transport): string {
  const pts = stops.filter(p => p.lat != null && p.lng != null);
  if (!pts.length) return 'https://www.google.com/maps';
  if (pts.length === 1) return `https://www.google.com/maps/search/?api=1&query=${pts[0].lat},${pts[0].lng}`;
  const origin = `${pts[0].lat},${pts[0].lng}`;
  const dest = `${pts[pts.length - 1].lat},${pts[pts.length - 1].lng}`;
  const waypoints = pts.slice(1, -1).slice(0, 9).map(p => `${p.lat},${p.lng}`).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}&travelmode=${gmapsTravelMode(t)}`;
}

function appleDayUrl(stops: Place[], t: Transport): string {
  const p = stops.find(p => p.lat != null && p.lng != null);
  if (!p) return 'https://maps.apple.com';
  const flg = t === 'auto' || t === 'bike' ? 'd' : 'r';
  return `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=${flg}`;
}

/** Booking.com-Suche für den Zielort eines Tages (Affiliate-ready Deeplink) */
function bookingUrl(place: Place | undefined, trip: Trip, dayIdx: number): string {
  const ss = place ? `${place.region || place.name}` : trip.title;
  let dates = '';
  if (trip.startDate) {
    const inD = addDays(new Date(trip.startDate), dayIdx);
    const outD = addDays(inD, 1);
    dates = `&checkin=${format(inD, 'yyyy-MM-dd')}&checkout=${format(outD, 'yyyy-MM-dd')}`;
  }
  return `https://www.booking.com/searchresults.de.html?ss=${encodeURIComponent(ss)}${dates}&group_adults=${trip.persons || 1}`;
}

interface TripCosts { transportCost?: number; foodPerDay?: number }

// ─── Karte mit echter Wegeführung ─────────────────────────────────────────────

const stopIcon = (n: number, gastro: 'cafe' | 'restaurant' | null) => L.divIcon({
  html: gastro
    ? `<div style="width:28px;height:28px;border-radius:50%;background:#EDE6F3;color:#71587A;display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:12px"><i class="fa-solid ${gastro === 'cafe' ? 'fa-mug-hot' : 'fa-utensils'}"></i></div>`
    : `<div style="width:28px;height:28px;border-radius:50%;background:#F99039;color:white;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${n}</div>`,
  className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16],
});

function FitAll({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.length ? `${points.length}|${points[0].join(',')}|${points[points.length - 1].join(',')}` : '';
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) { map.flyTo(points[0], 13); return; }
    map.fitBounds(points, { padding: [36, 36], maxZoom: 14 });
  }, [key]); // eslint-disable-line
  return null;
}

function TripRouteMap({ ordered, route, dayFilter, activeId, onMarkerClick }: {
  ordered: TripPlace[];
  route: RouteResponse | null;
  dayFilter: 'all' | number;
  activeId: string | null;
  onMarkerClick: (placeId: string) => void;
}) {
  // Sichtbare Stopps (Gesamtroute oder Tagesetappe) — Nummerierung bleibt global
  const visible = ordered
    .map((tp, i) => ({ tp, i }))
    .filter(({ tp }) => tp.place?.lat != null && tp.place?.lng != null)
    .filter(({ tp }) => dayFilter === 'all' || tp.dayIndex === dayFilter);

  // Legs: route.legs[i] verbindet ordered[i] → ordered[i+1]
  const visibleLegs = (route?.legs ?? [])
    .map((leg, i) => ({ leg, i }))
    .filter(({ i }) => {
      const a = ordered[i], b = ordered[i + 1];
      if (!a || !b) return false;
      if (dayFilter === 'all') return true;
      return a.dayIndex === dayFilter && b.dayIndex === dayFilter;
    });

  const fitPts: [number, number][] = [
    ...visible.map(({ tp }) => [tp.place!.lat!, tp.place!.lng!] as [number, number]),
    ...visibleLegs.flatMap(({ leg }) => [leg.coords[0], leg.coords[leg.coords.length - 1]]),
  ];

  return (
    <MapContainer center={[51.16, 10.45]} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <FitAll points={fitPts} />
      {visibleLegs.map(({ leg, i }) => (
        <Polyline key={`${i}-${route?.mode}`} positions={leg.coords}
          pathOptions={{
            color: '#F99039', weight: 3.5, opacity: 0.85,
            dashArray: route?.source === 'approx' ? '8 6' : undefined,
          }} />
      ))}
      {visible.map(({ tp, i }) => (
        <Marker key={tp.id} position={[tp.place!.lat!, tp.place!.lng!]}
          icon={stopIcon(i + 1, isGastro(tp.place))}
          eventHandlers={{ click: () => onMarkerClick(tp.placeId) }}>
          <Popup>
            <div style={{ fontWeight: 700 }}>{tp.place!.name}</div>
            <div style={{ fontSize: 11, color: '#666' }}>{tp.place!.region}</div>
          </Popup>
        </Marker>
      ))}
      {activeId && null}
    </MapContainer>
  );
}

// ─── Seite ────────────────────────────────────────────────────────────────────

export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { places: allKnownPlaces, savedIds, loadPlaces, loadTrips, updateTrip, deleteTrip } = useAppStore();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [transport, setTransport] = useState<Transport>('auto');
  const [dayFilter, setDayFilter] = useState<'all' | number>('all');
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeSeq = useRef(0);
  const [activeStop, setActiveStop] = useState<string | null>(null);
  const [expandedOvernight, setExpandedOvernight] = useState<number | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedQ, setSavedQ] = useState('');
  const [savedKm, setSavedKm] = useState(150);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [costs, setCosts] = useState<TripCosts>({});
  const costsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shareMsg, setShareMsg] = useState('');

  async function reload(): Promise<Trip | null> {
    try {
      const t = await tripsApi.get(Number(id));
      setTrip(t);
      return t;
    } catch {
      setNotFound(true);
      return null;
    }
  }

  useEffect(() => {
    reload().then(t => {
      if (t) {
        setTransport((t.transport as Transport) === 'walk' ? 'auto' : t.transport as Transport);
        setStartDate(t.startDate ?? '');
        setEndDate(t.endDate ?? '');
        try { setCosts(JSON.parse(t.costsJson || '{}')); } catch { /* leer */ }
      }
    });
    loadPlaces();
  }, [id]); // eslint-disable-line

  const editable = !!trip?.isOwner;
  // Der Profil-Schalter „Meine Trips" ist die Klammer über allen einzelnen Trips
  const tripsPublic = useAuthStore(st => !!st.user?.tripsPublic);

  // Stopps in Reihenfolge (Tag, dann Position)
  const ordered = useMemo(() =>
    (trip?.places ?? [])
      .filter(tp => tp.place)
      .slice()
      .sort((a, b) => a.dayIndex - b.dayIndex || a.position - b.position),
    [trip]);

  const dayIndexes = useMemo(() =>
    [...new Set(ordered.map(tp => tp.dayIndex))].sort((a, b) => a - b), [ordered]);

  // Tage normalisiert: index in dayIndexes = angezeigte Tag-Nummer
  const days = useMemo(() =>
    dayIndexes.map(d => ordered.filter(tp => tp.dayIndex === d)), [ordered, dayIndexes]);

  // ── Route laden (echte Wegeführung je Verkehrsmittel) ────────────────────
  useEffect(() => {
    const pts = ordered
      .filter(tp => tp.place?.lat != null && tp.place?.lng != null)
      .map(tp => ({ lat: tp.place!.lat!, lng: tp.place!.lng! }));
    if (pts.length < 2) { setRoute(null); return; }
    const seq = ++routeSeq.current;
    setRouteLoading(true);
    setRoute(null);
    const t = setTimeout(async () => {
      try {
        const r = await geoApi.route(transport, pts);
        if (seq === routeSeq.current) setRoute(r);
      } catch {
        if (seq === routeSeq.current) setRoute(null);
      } finally {
        if (seq === routeSeq.current) setRouteLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [transport, ordered.map(tp => tp.placeId).join(','), ordered.map(tp => tp.dayIndex).join(',')]); // eslint-disable-line

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Mutationen ────────────────────────────────────────────────────────────
  async function persistOrder(next: TripPlace[]) {
    if (!trip) return;
    // Tage lückenlos renummerieren + Positionen je Reihenfolge
    const seen: number[] = [];
    for (const tp of next) if (!seen.includes(tp.dayIndex)) seen.push(tp.dayIndex);
    const dayMap = new Map(seen.map((d, i) => [d, i]));
    const rows = next.map((tp, i) => ({ placeId: tp.placeId, position: i, dayIndex: dayMap.get(tp.dayIndex) ?? 0, notes: tp.notes ?? '' }));
    setTrip({ ...trip, places: next.map((tp, i) => ({ ...tp, position: i, dayIndex: dayMap.get(tp.dayIndex) ?? 0 })) });
    await tripsApi.reorderPlaces(trip.id, rows).catch(() => {});
    await reload();
  }

  async function handleDragEnd(event: { active: { id: unknown }; over: { id: unknown } | null }) {
    const { active, over } = event;
    if (!trip || !over || active.id === over.id) return;
    const oldIndex = ordered.findIndex(tp => tp.id === active.id);
    const newIndex = ordered.findIndex(tp => tp.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(ordered, oldIndex, newIndex);
    // Der verschobene Stopp übernimmt den Tag seines neuen Nachbarn
    const target = moved[newIndex];
    const neighbor = moved[newIndex - 1] ?? moved[newIndex + 1];
    const next = moved.map(tp => tp.id === target.id ? { ...tp, dayIndex: neighbor?.dayIndex ?? tp.dayIndex } : tp);
    await persistOrder(next);
  }

  /** Nach diesem Stopp übernachten → alle folgenden rutschen in den nächsten Tag */
  async function splitAfter(tpId: number) {
    const idx = ordered.findIndex(tp => tp.id === tpId);
    if (idx < 0 || idx === ordered.length - 1) return;
    const next = ordered.map((tp, i) => i > idx ? { ...tp, dayIndex: tp.dayIndex + 1 } : tp);
    await persistOrder(next);
  }

  /** Tag-Grenze auflösen: Folgetag mit diesem Tag zusammenlegen */
  async function mergeAfterDay(dayNo: number) {
    if (!trip) return;
    const d = dayIndexes[dayNo];
    const next = ordered.map(tp => tp.dayIndex > d ? { ...tp, dayIndex: tp.dayIndex - 1 } : tp);
    await tripsApi.saveOvernights(trip.id, trip.overnights
      .filter(o => o.afterDayIndex !== dayNo)
      .map(o => ({ afterDayIndex: o.afterDayIndex > dayNo ? o.afterDayIndex - 1 : o.afterDayIndex, hotelId: o.hotelId, hotelName: o.hotelName, hotelPrice: o.hotelPrice }))).catch(() => {});
    await persistOrder(next);
  }

  type HotelPick = { id: string; name: string; pricePerNight: number; lat?: number | null; lng?: number | null } | null;

  function overnightRows(except?: number) {
    return (trip?.overnights ?? []).filter(o => o.afterDayIndex !== except)
      .map(o => ({ afterDayIndex: o.afterDayIndex, hotelId: o.hotelId, hotelName: o.hotelName, hotelPrice: o.hotelPrice, hotelLat: o.hotelLat ?? null, hotelLng: o.hotelLng ?? null }));
  }

  async function setHotel(dayNo: number, h: HotelPick) {
    if (!trip) return;
    const rows = h
      ? [...overnightRows(dayNo), { afterDayIndex: dayNo, hotelId: h.id, hotelName: h.name, hotelPrice: h.pricePerNight, hotelLat: h.lat ?? null, hotelLng: h.lng ?? null }]
      : overnightRows(dayNo);
    await tripsApi.saveOvernights(trip.id, rows).catch(() => {});
    await reload();
  }

  /** Preis einer bestehenden Übernachtung ändern */
  async function setHotelPrice(dayNo: number, price: number | null) {
    const o = trip?.overnights.find(x => x.afterDayIndex === dayNo);
    if (!o) return;
    await setHotel(dayNo, { id: o.hotelId ?? 'custom', name: o.hotelName ?? '', pricePerNight: price ?? 0, lat: o.hotelLat, lng: o.hotelLng });
  }

  /** Gleiches Hotel für alle Nächte übernehmen */
  async function applyHotelAllNights(dayNo: number) {
    if (!trip) return;
    const o = trip.overnights.find(x => x.afterDayIndex === dayNo);
    if (!o) return;
    const rows = Array.from({ length: Math.max(0, days.length - 1) }, (_, i) => ({
      afterDayIndex: i, hotelId: o.hotelId, hotelName: o.hotelName, hotelPrice: o.hotelPrice,
      hotelLat: o.hotelLat ?? null, hotelLng: o.hotelLng ?? null,
    }));
    await tripsApi.saveOvernights(trip.id, rows).catch(() => {});
    await reload();
  }

  /** Zwischentext eines Stopps speichern */
  async function saveNote(tpId: number, text: string) {
    if (!trip) return;
    const rows = ordered.map((tp, i) => ({ placeId: tp.placeId, position: i, dayIndex: tp.dayIndex, notes: tp.id === tpId ? text : (tp.notes ?? '') }));
    await tripsApi.reorderPlaces(trip.id, rows).catch(() => {});
    await reload();
  }

  async function removeStop(placeId: string) {
    if (!trip) return;
    await tripsApi.removePlace(trip.id, placeId).catch(() => {});
    await reload();
  }

  async function addFromSaved(placeId: string) {
    if (!trip) return;
    await tripsApi.addPlace(trip.id, placeId).catch(() => {});
    const t = await reload();
    // ans Ende des letzten Tages hängen
    if (t) {
      const ord = t.places.filter(tp => tp.place).sort((a, b) => a.dayIndex - b.dayIndex || a.position - b.position);
      const lastDay = Math.max(0, ...ord.filter(tp => tp.placeId !== placeId).map(tp => tp.dayIndex));
      const next = [...ord.filter(tp => tp.placeId !== placeId), ...ord.filter(tp => tp.placeId === placeId).map(tp => ({ ...tp, dayIndex: lastDay }))];
      const rows = next.map((tp, i) => ({ placeId: tp.placeId, position: i, dayIndex: tp.dayIndex, notes: tp.notes ?? '' }));
      await tripsApi.reorderPlaces(t.id, rows).catch(() => {});
      await reload();
    }
  }

  async function adoptTrip() {
    if (!trip) return;
    const created = await tripsApi.create({
      title: trip.title,
      subtitle: trip.subtitle,
      intro: trip.intro ?? '',
      hero: trip.hero ?? '',
      transport,
      places: ordered.map((tp, i) => ({ placeId: tp.placeId, position: i, dayIndex: tp.dayIndex })),
    } as object) as Trip;
    await loadTrips();
    navigate(`/trips/${created.id}`);
  }

  function saveCosts(patch: Partial<TripCosts>) {
    const next = { ...costs, ...patch };
    setCosts(next);
    if (costsTimer.current) clearTimeout(costsTimer.current);
    costsTimer.current = setTimeout(() => {
      if (trip) updateTrip(trip.id, { costsJson: JSON.stringify(next) }).catch(() => {});
    }, 600);
  }

  async function share() {
    const url = window.location.href;
    const text = `Schau dir diesen Geheimtrip an: ${trip?.title}`;
    if (navigator.share) {
      try { await navigator.share({ title: trip?.title, text, url }); return; } catch { /* abgebrochen */ }
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setShareMsg('Link kopiert!');
    setTimeout(() => setShareMsg(''), 2000);
  }

  // ── Kostenrechnung ────────────────────────────────────────────────────────
  const persons = trip?.persons ?? 1;
  const nightsList = days.length - 1;
  const uniquePlaces = useMemo(() => {
    const seen = new Set<string>();
    return ordered.filter(tp => !seen.has(tp.placeId) && seen.add(tp.placeId)).map(tp => tp.place!);
  }, [ordered]);
  const entranceKnown = uniquePlaces.map(adultPrice).filter((v): v is number => v !== null);
  const entranceMissing = uniquePlaces.length - entranceKnown.length;
  const entranceSum = entranceKnown.reduce((s, v) => s + v, 0) * persons;
  const hotelSum = (trip?.overnights ?? []).reduce((s, o) => s + (o.hotelPrice ?? 0), 0);
  const foodSum = (costs.foodPerDay ?? 0) * days.length * persons;
  const transportSum = costs.transportCost ?? 0;
  const totalSum = entranceSum + hotelSum + foodSum + transportSum;

  if (notFound) return (
    <AppShell><div className="min-h-[60vh] flex flex-col items-center justify-center text-[var(--color-lavender)] gap-2">
      <i className="fa-solid fa-route text-4xl opacity-30" />
      <p>Trip nicht gefunden.</p>
    </div></AppShell>
  );
  if (!trip) return (
    <div className="min-h-dvh flex items-center justify-center text-[var(--color-lavender)]">
      <i className="fa-solid fa-compass fa-spin text-3xl text-[var(--color-amber)]" />
    </div>
  );

  const heroImg = trip.hero || ordered[0]?.place?.hero;
  const sideImgs = ordered.slice(1, 3).map(tp => tp.place?.hero).filter(Boolean) as string[];
  // Merkliste: Suche + Umkreis um den letzten Trip-Stopp (dort geht die Reise weiter)
  const anchor = [...ordered].reverse().find(tp => tp.place?.lat != null && tp.place?.lng != null)?.place ?? null;
  const savedCandidates = allKnownPlaces
    .filter(p => savedIds.has(p.id) && !ordered.some(tp => tp.placeId === p.id))
    .filter(p => !savedQ.trim() || `${p.name} ${p.region}`.toLowerCase().includes(savedQ.trim().toLowerCase()))
    .map(p => ({
      p,
      dist: anchor && p.lat != null && p.lng != null
        ? distanceKm({ lat: anchor.lat!, lng: anchor.lng! }, { lat: p.lat, lng: p.lng })
        : null,
    }))
    .filter(x => x.dist === null || x.dist <= savedKm)
    .sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));

  let stopCounter = 0;

  return (
    <AppShell noHeader>
      <div className="lg:flex">
      {/* ── Linke Spalte: Header-Bilder + Inhalt (Desktop), alles (Mobil) ── */}
      <div className="lg:w-[55%] xl:w-1/2 lg:h-dvh lg:overflow-y-auto">
      {/* ═══ Header: Bilder-Grid wie auf den Orts-Seiten ═══ */}
      <div className="relative">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 md:h-[360px]">
          <div className="relative md:col-span-2 aspect-[16/9] md:aspect-auto overflow-hidden md:rounded-br-3xl">
            {heroImg
              ? <img src={heroImg} alt={trip.title} className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-[var(--color-aubergine)]" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
              {trip.isCurated && (
                <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white mb-1.5"
                  style={{ background: 'var(--color-amber)' }}>Kuratierter Trip</span>
              )}
              <h1 className="font-display font-bold text-white text-2xl md:text-3xl leading-tight"
                style={{ textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>{trip.title}</h1>
              {trip.subtitle && <p className="text-white/75 text-sm mt-0.5">{trip.subtitle}</p>}
              <p className="text-white/60 text-xs mt-1 flex items-center gap-2 flex-wrap">
                <span><i className="fa-solid fa-map-pin mr-1" />{ordered.length} Stopps</span>
                <span>·</span><span>{days.length} Tag{days.length !== 1 ? 'e' : ''}</span>
                {route && <><span>·</span><span><i className="fa-solid fa-route mr-1" />{fmtLeg(route.totalSeconds, route.totalMeters)}</span></>}
              </p>
            </div>
          </div>
          {/* Seitenbilder (Desktop) */}
          <div className="hidden md:flex flex-col gap-1.5">
            {sideImgs.length ? sideImgs.map((src, i) => (
              <div key={i} className="flex-1 overflow-hidden rounded-l-none first:rounded-tr-none last:rounded-3xl last:rounded-t-none">
                <img src={src} alt="" className="w-full h-full object-cover" />
              </div>
            )) : <div className="flex-1 bg-[var(--color-bg-soft)]" />}
          </div>
        </div>
        {/* Schwebende Buttons */}
        <div className="absolute top-4 left-4 z-10">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-[var(--color-aubergine)] shadow">
            <i className="fa-solid fa-arrow-left" />
          </button>
        </div>
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(`${trip.title} – ${window.location.href}`)}`}
            target="_blank" rel="noopener noreferrer"
            className="w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-[#25D366] shadow">
            <i className="fa-brands fa-whatsapp text-lg" />
          </a>
          <button onClick={share}
            className="w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-[var(--color-aubergine)] shadow">
            <i className="fa-solid fa-share-nodes" />
          </button>
        </div>
        {shareMsg && (
          <div className="absolute top-16 right-4 z-10 bg-[var(--color-aubergine)] text-white text-xs font-semibold px-3 py-1.5 rounded-full">
            {shareMsg}
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-4 pb-28">

        {/* Beschreibung / Intro — bei eigenen Trips editierbar */}
        <IntroBlock intro={trip.intro ?? ''} editable={editable}
          onSave={async t => { await updateTrip(trip.id, { intro: t }); await reload(); }} />

        {/* Kuratiert & nicht meiner → übernehmen */}
        {!editable && (
          <button onClick={adoptTrip}
            className="w-full md:w-auto mb-5 bg-[var(--color-amber)] text-white font-bold px-6 py-3 rounded-2xl text-sm shadow-[var(--shadow-amber)] hover:brightness-110 transition-all">
            <i className="fa-solid fa-wand-magic-sparkles mr-2" />
            Trip übernehmen & anpassen
          </button>
        )}

        {/* Startpunkt (falls gesetzt) */}
        {trip.startLabel && (
          <div className="flex items-center gap-2 text-sm mb-4">
            <i className="fa-solid fa-location-crosshairs text-[var(--color-amber)]" />
            <span className="text-[var(--color-lavender)]">Start:</span>
            <strong className="text-[var(--color-aubergine)]">{trip.startLabel}</strong>
          </div>
        )}

        {/* Mitreisende — gemeinsamer Ausflug (nicht bei kuratierten Vorlagen) */}
        {!trip.isCurated && <TripParticipants trip={trip} reload={reload} />}

        {/* Abstimmung — sobald jemand eingeladen ist */}
        {!trip.isCurated && (trip.participants?.length ?? 0) > 0 && <TripVoting trip={trip} reload={reload} />}

        {/* ── Verkehrsmittel + Reisezeitraum ── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex gap-1 p-1 bg-[var(--color-bg-soft)] rounded-2xl">
            {TRIP_MODES.map(m => (
              <button key={m.id}
                onClick={async () => { setTransport(m.id); if (editable) await updateTrip(trip.id, { transport: m.id }).catch(() => {}); }}
                title={m.id === 'transit' ? 'ÖPNV (Deutschlandticket)' : m.id === 'train' ? 'Fernverkehr inkl. ÖPNV' : m.label}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${transport === m.id ? 'bg-[var(--color-aubergine)] text-white shadow-sm' : 'text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]'}`}>
                <i className={`fa-solid ${m.icon}`} />{m.id === 'transit' ? 'ÖPNV' : m.label}
              </button>
            ))}
          </div>
          <button onClick={() => editable && setDateOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[var(--color-bg-soft)] rounded-2xl text-xs font-semibold text-[var(--color-aubergine)]">
            <i className="fa-solid fa-calendar text-[var(--color-amber)]" />
            {trip.startDate
              ? `${format(new Date(trip.startDate), 'dd. MMM', { locale: de })}${trip.endDate ? ` – ${format(new Date(trip.endDate), 'dd. MMM', { locale: de })}` : ''}`
              : editable ? 'Datum wählen' : 'flexibel'}
          </button>
          {routeLoading
            ? <span className="text-[10px] text-[var(--color-lavender)]"><i className="fa-solid fa-circle-notch fa-spin mr-1" />Route wird berechnet…</span>
            : route && (
              <span className="text-[10px] text-[var(--color-lavender)] flex items-center gap-1">
                {route.source === 'route' ? <><i className="fa-solid fa-route" /> echtes Straßennetz</>
                  : route.source === 'stations' ? <><i className="fa-solid fa-train" /> Fahrplan-Daten (GTFS)</>
                  : <><i className="fa-solid fa-wave-square" /> Luftlinien-Näherung</>}
              </span>
            )}
        </div>

        {/* ── Tages-Buttons ── */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none">
          <button onClick={() => setDayFilter('all')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${dayFilter === 'all' ? 'bg-[var(--color-aubergine)] text-white' : 'bg-white border border-[var(--color-bg-soft)] text-[var(--color-aubergine)]'}`}>
            <i className="fa-solid fa-route mr-1" />Gesamte Route
          </button>
          {days.map((_, i) => (
            <button key={i} onClick={() => setDayFilter(dayIndexes[i])}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${dayFilter === dayIndexes[i] ? 'bg-[var(--color-aubergine)] text-white' : 'bg-white border border-[var(--color-bg-soft)] text-[var(--color-aubergine)]'}`}>
              Tag {i + 1}
            </button>
          ))}
        </div>

        {/* ── Karte (mobil & Tablet — auf Desktop rechts sticky) ── */}
        <div className="lg:hidden rounded-2xl overflow-hidden border border-[var(--color-bg-soft)] mb-6 h-[300px] md:h-[400px] relative">
          <TripRouteMap ordered={ordered} route={route} dayFilter={dayFilter}
            activeId={activeStop} onMarkerClick={pid => setActiveStop(pid)} />
          {routeLoading && (
            <div className="absolute inset-0 z-[1001] flex items-center justify-center pointer-events-none">
              <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-xs font-semibold text-[var(--color-aubergine)] shadow">
                <i className="fa-solid fa-compass fa-spin text-[var(--color-amber)] mr-2" />Route wird berechnet…
              </div>
            </div>
          )}
        </div>

        {/* ── Timeline / Tagesetappen ── */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordered.map(tp => tp.id)} strategy={verticalListSortingStrategy}>
            {days.map((dayStops, dayNo) => {
              const d = dayIndexes[dayNo];
              if (dayFilter !== 'all' && dayFilter !== d) { stopCounter += dayStops.length; return null; }
              const overnight = trip.overnights.find(o => o.afterDayIndex === dayNo);
              const dayDate = trip.startDate ? format(addDays(new Date(trip.startDate), dayNo), 'EEEE, dd. MMM', { locale: de }) : null;
              return (
                <div key={d} className="mb-2">
                  {/* Tages-Header */}
                  <div className="flex items-center gap-3 mt-4 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-[var(--color-aubergine)] text-white text-xs font-bold flex items-center justify-center">{dayNo + 1}</span>
                      <div>
                        <p className="text-sm font-bold text-[var(--color-aubergine)] leading-none">Tag {dayNo + 1}</p>
                        {dayDate && <p className="text-[10px] text-[var(--color-lavender)] mt-0.5">{dayDate}</p>}
                      </div>
                    </div>
                    <div className="flex-1 border-t border-dashed border-[var(--color-lavender-lt)]" />
                    {/* Take me there + Teilen je Tag */}
                    <a href={gmapsDayUrl(dayStops.map(tp => tp.place!), transport)} target="_blank" rel="noopener noreferrer"
                      title="Tagesroute in Google Maps öffnen"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-[var(--color-aubergine)] text-white hover:brightness-110 transition-all">
                      <i className="fa-solid fa-diamond-turn-right" /> Take me there
                    </a>
                    <a href={appleDayUrl(dayStops.map(tp => tp.place!), transport)} target="_blank" rel="noopener noreferrer"
                      title="In Apple Karten öffnen"
                      className="w-8 h-8 rounded-xl bg-white border border-[var(--color-bg-soft)] flex items-center justify-center text-[var(--color-aubergine)]">
                      <i className="fa-brands fa-apple" />
                    </a>
                  </div>

                  {/* Stopps des Tages */}
                  <div className="flex flex-col">
                    {dayStops.map((tp, i) => {
                      const globalIdx = stopCounter++;
                      const leg = route?.legs[globalIdx];  // Weg ZUM nächsten Stopp
                      const isLastOfDay = i === dayStops.length - 1;
                      const nextIsSameDay = !isLastOfDay;
                      return (
                        <div key={tp.id}>
                          <StopCard tp={tp} index={globalIdx} editable={editable}
                            isActive={activeStop === tp.placeId}
                            onOpen={() => navigate(`/ort/${tp.placeId}`)}
                            onRemove={() => removeStop(tp.placeId)} />
                          {/* Zwischentext (Notiz) zum Stopp */}
                          <NoteBlock text={tp.notes ?? ''} editable={editable}
                            onSave={t => saveNote(tp.id, t)} />
                          {/* Wegezeit zum nächsten Stopp (gleicher Tag) */}
                          {nextIsSameDay && leg && (
                            <div className="flex items-center gap-2 pl-12 py-1 text-[11px] text-[var(--color-lavender)]">
                              <i className={`fa-solid ${TRIP_MODES.find(m => m.id === transport)?.icon}`} />
                              <span>{fmtLeg(leg.seconds, leg.meters)}</span>
                              {leg.transit && <span className="px-1.5 py-0.5 rounded bg-[var(--color-bg-soft)] font-semibold">{leg.transit}</span>}
                            </div>
                          )}
                          {/* Tag hier teilen (Übernachtung einfügen) */}
                          {editable && nextIsSameDay && dayFilter === 'all' && (
                            <button onClick={() => splitAfter(tp.id)}
                              className="w-full text-center text-[10px] text-[var(--color-lavender-lt)] hover:text-[var(--color-amber)] transition-colors -mt-1 mb-1"
                              title="Nach diesem Stopp übernachten — folgende Stopps rutschen in den nächsten Tag">
                              <i className="fa-solid fa-moon mr-1" />Tag hier beenden
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Übernachtung / Tages-Trenner */}
                  {dayNo < days.length - 1 && dayFilter === 'all' && (
                    <OvernightDivider
                      overnightName={overnight?.hotelName ?? null}
                      overnightPrice={overnight?.hotelPrice ?? null}
                      expanded={expandedOvernight === dayNo}
                      editable={editable}
                      bookingHref={bookingUrl(dayStops[dayStops.length - 1]?.place, trip, dayNo)}
                      onToggle={() => setExpandedOvernight(e => e === dayNo ? null : dayNo)}
                      onPick={h => setHotel(dayNo, h)}
                      onPrice={p => setHotelPrice(dayNo, p)}
                      onApplyAll={days.length > 2 ? () => applyHotelAllNights(dayNo) : undefined}
                      onMerge={() => mergeAfterDay(dayNo)}
                    />
                  )}
                </div>
              );
            })}
          </SortableContext>
        </DndContext>

        {/* Aus Merkliste hinzufügen */}
        {editable && (
          <button onClick={() => setSavedOpen(true)}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[var(--color-amber)] text-[var(--color-amber)] font-semibold text-sm rounded-2xl py-3.5 mt-3 active:scale-[0.99] transition-transform">
            <i className="fa-solid fa-bookmark" />
            Orte aus deiner Merkliste hinzufügen
          </button>
        )}

        {/* ── Kostenrechner ── */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-[var(--color-aubergine)]">
              <i className="fa-solid fa-calculator mr-2 text-[var(--color-amber)]" />Kostenrechner
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-lavender)]">Personen</span>
              <button onClick={() => editable && updateTrip(trip.id, { persons: Math.max(1, persons - 1) }).then(reload)}
                className="w-7 h-7 rounded-full bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] font-bold">−</button>
              <span className="w-5 text-center font-bold text-[var(--color-aubergine)]">{persons}</span>
              <button onClick={() => editable && updateTrip(trip.id, { persons: persons + 1 }).then(reload)}
                className="w-7 h-7 rounded-full bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] font-bold">+</button>
            </div>
          </div>

          <div className="flex justify-between py-2 border-b border-[var(--color-bg-soft)] text-sm">
            <span className="text-[var(--color-aubergine)]">
              Eintritte <span className="text-[10px] text-[var(--color-lavender)]">({entranceKnown.length} Orte mit Preis{entranceMissing > 0 ? `, ${entranceMissing} ohne Angabe` : ''})</span>
            </span>
            <span className="font-semibold text-[var(--color-aubergine)]">{entranceSum.toFixed(0)} €</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[var(--color-bg-soft)] text-sm">
            <span className="text-[var(--color-aubergine)]">
              Übernachtungen <span className="text-[10px] text-[var(--color-lavender)]">({nightsList} Nacht{nightsList !== 1 ? 'e' : ''})</span>
            </span>
            <span className="font-semibold text-[var(--color-aubergine)]">{hotelSum.toFixed(0)} €</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[var(--color-bg-soft)] text-sm gap-3">
            <span className="text-[var(--color-aubergine)] flex-shrink-0">Tickets / Sprit <span className="text-[10px] text-[var(--color-lavender)]">(manuell)</span></span>
            <div className="flex items-center gap-1">
              <input type="number" min={0} value={costs.transportCost ?? ''} placeholder="0"
                onChange={e => saveCosts({ transportCost: e.target.value === '' ? undefined : Number(e.target.value) })}
                disabled={!editable}
                className="w-20 text-right border border-[var(--color-bg-soft)] rounded-lg px-2 py-1 text-sm outline-none focus:border-[var(--color-amber)]" />
              <span className="text-sm font-semibold text-[var(--color-aubergine)]">€</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[var(--color-bg-soft)] text-sm gap-3">
            <span className="text-[var(--color-aubergine)] flex-shrink-0">Verpflegung <span className="text-[10px] text-[var(--color-lavender)]">€/Tag/Person</span></span>
            <div className="flex items-center gap-1">
              <input type="number" min={0} value={costs.foodPerDay ?? ''} placeholder="0"
                onChange={e => saveCosts({ foodPerDay: e.target.value === '' ? undefined : Number(e.target.value) })}
                disabled={!editable}
                className="w-20 text-right border border-[var(--color-bg-soft)] rounded-lg px-2 py-1 text-sm outline-none focus:border-[var(--color-amber)]" />
              <span className="text-sm font-semibold text-[var(--color-aubergine)]">€</span>
            </div>
          </div>
          {foodSum > 0 && (
            <p className="text-[10px] text-[var(--color-lavender)] pt-1">Verpflegung gesamt: {costs.foodPerDay} € × {days.length} Tage × {persons} Pers. = {foodSum.toFixed(0)} €</p>
          )}
          <div className="flex justify-between pt-3">
            <span className="font-bold text-[var(--color-aubergine)]">Gesamt</span>
            <span className="font-bold text-[var(--color-amber)] text-lg">{totalSum.toFixed(0)} €</span>
          </div>
          <p className="text-xs text-[var(--color-lavender)]">≈ {(totalSum / persons).toFixed(0)} € pro Person · Eintritte basieren auf den hinterlegten Erwachsenen-Preisen</p>
        </div>

        {/* Im „Dein Blog"-Profil veröffentlichen — jeder Trip einzeln, Standard ist aus */}
        {editable && !trip.isCurated && (
          <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-bg-soft)] bg-white p-3.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-aubergine)]">Im Blog veröffentlichen</p>
              <p className="text-xs text-[var(--color-lavender)]">
                {tripsPublic
                  ? 'Zeigt diesen Trip auf deinem öffentlichen Profil.'
                  : 'Trips sind in deinem Profil noch nicht freigegeben — dort erst „Meine Trips" öffentlich stellen.'}
              </p>
            </div>
            <button aria-label="Im Blog veröffentlichen" onClick={async () => {
                const next = !trip.published;
                setTrip({ ...trip, published: next });
                await tripsApi.update(trip.id, { published: next }).catch(() => setTrip({ ...trip, published: !next }));
              }}
              className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ${trip.published ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-bg-soft)]'}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${trip.published ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>
        )}

        {/* Trip löschen */}
        {editable && !trip.isCurated && (
          <button onClick={async () => { await deleteTrip(trip.id); navigate('/saved'); }}
            className="w-full text-center text-xs text-[var(--color-lavender)] hover:text-[#C96442] transition-colors mt-6 py-2">
            <i className="fa-solid fa-trash-can mr-1" />Trip löschen
          </button>
        )}
      </div>
      </div>

      {/* ── Rechte Spalte: sticky Karte (nur Desktop) ── */}
      <div className="hidden lg:block lg:flex-1 lg:h-dvh lg:sticky lg:top-0 relative">
        <TripRouteMap ordered={ordered} route={route} dayFilter={dayFilter}
          activeId={activeStop} onMarkerClick={pid => setActiveStop(pid)} />
        {routeLoading && (
          <div className="absolute inset-0 z-[1001] flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-xs font-semibold text-[var(--color-aubergine)] shadow">
              <i className="fa-solid fa-compass fa-spin text-[var(--color-amber)] mr-2" />Route wird berechnet…
            </div>
          </div>
        )}
      </div>
      </div>

      {/* ── Datum-Sheet ── */}
      <BottomSheet open={dateOpen} onClose={() => setDateOpen(false)} title="Reisezeitraum wählen">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-1 block">Anreise</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full border border-[var(--color-bg-soft)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)]" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-1 block">Abreise</label>
            <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
              className="w-full border border-[var(--color-bg-soft)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)]" />
          </div>
          <button onClick={async () => { await updateTrip(trip.id, { startDate: startDate || null, endDate: endDate || null }); await reload(); setDateOpen(false); }}
            className="w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-xl text-sm shadow-[var(--shadow-amber)]">
            Speichern
          </button>
        </div>
      </BottomSheet>

      {/* ── Merkliste-Sheet ── */}
      <BottomSheet open={savedOpen} onClose={() => setSavedOpen(false)} title="Aus deiner Merkliste">
        {/* Suche + Umkreis um den letzten Stopp */}
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center gap-2 border border-[var(--color-bg-soft)] rounded-xl px-3 py-2 bg-white">
            <i className="fa-solid fa-magnifying-glass text-[var(--color-lavender)] text-xs" />
            <input type="text" value={savedQ} onChange={e => setSavedQ(e.target.value)}
              placeholder="Gemerkte Orte durchsuchen…"
              className="flex-1 outline-none text-sm text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)]" />
          </div>
          {anchor && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] text-[var(--color-lavender)] flex-shrink-0">
                Umkreis um <strong className="text-[var(--color-aubergine)]">{anchor.name}</strong>
              </span>
              <input type="range" min={10} max={400} step={10} value={savedKm}
                onChange={e => setSavedKm(Number(e.target.value))} className="map-radius flex-1" />
              <span className="text-[11px] font-bold text-[var(--color-aubergine)] flex-shrink-0">{savedKm} km</span>
            </div>
          )}
        </div>
        {savedCandidates.length === 0 ? (
          <p className="text-sm text-[var(--color-lavender)] text-center py-6">
            Kein gemerkter Ort passt zu Suche und Umkreis — vergrößere den Radius.
          </p>
        ) : (
          <div className="flex flex-col gap-2 max-h-[48vh] overflow-y-auto">
            {savedCandidates.map(({ p, dist }) => (
              <div key={p.id} className="flex items-center gap-3 bg-white rounded-2xl p-2.5 shadow-[var(--shadow-card)]">
                <img src={p.hero} alt={p.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[var(--color-aubergine)] truncate">{p.name}</p>
                  <p className="text-xs text-[var(--color-lavender)] truncate">{p.region}</p>
                </div>
                {dist !== null && (
                  <span className="text-[10px] font-bold text-[var(--color-lavender)] bg-[var(--color-bg-soft)] px-2 py-1 rounded-full flex-shrink-0">
                    {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(0)} km`}
                  </span>
                )}
                <button onClick={() => addFromSaved(p.id)}
                  className="w-9 h-9 rounded-xl bg-[var(--color-amber)] text-white font-bold flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform">
                  <i className="fa-solid fa-plus" />
                </button>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </AppShell>
  );
}

// ─── Stopp-Kachel (weiß = Attraktion, helles Lila = Gastronomie) ──────────────

function StopCard({ tp, index, isActive, editable, onOpen, onRemove }: {
  tp: TripPlace; index: number; isActive: boolean; editable: boolean;
  onOpen: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tp.id, disabled: !editable });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };
  const p = tp.place;
  if (!p) return null;
  const gastro = isGastro(p);

  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-3 rounded-2xl p-3 shadow-[var(--shadow-card)] transition-colors cursor-pointer mb-1.5 border-2 ${
        isActive ? 'border-[var(--color-amber)]' : 'border-transparent'} ${
        gastro ? 'bg-[#F1ECF4]' : 'bg-white'}`}
      onClick={onOpen}>
      {editable && (
        <button {...attributes} {...listeners} onClick={e => e.stopPropagation()}
          className="text-[var(--color-lavender-lt)] cursor-grab active:cursor-grabbing px-0.5 touch-none">
          <i className="fa-solid fa-grip-lines text-sm" />
        </button>
      )}

      {/* Nummer bzw. Gastro-Icon */}
      {gastro ? (
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: '#E2D7EB', color: '#71587A' }}>
          <i className={`fa-solid ${gastro === 'cafe' ? 'fa-mug-hot' : 'fa-utensils'} text-xs`} />
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-[var(--color-amber)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {index + 1}
        </div>
      )}

      <img src={p.hero} alt={p.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm text-[var(--color-aubergine)] truncate">{p.name}</span>
          {gastro && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: '#E2D7EB', color: '#71587A' }}>
              {gastro === 'cafe' ? 'Café-Pause' : 'Einkehr'}
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--color-lavender)] mt-0.5 truncate">{p.region}</div>
        {p.short && <div className="text-xs text-[var(--color-lavender)] mt-0.5 line-clamp-2 leading-snug">{p.short}</div>}
      </div>

      {editable && (
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-lavender-lt)] hover:text-[#C96442] hover:bg-[#FEF2F2] transition-colors flex-shrink-0">
          <i className="fa-solid fa-xmark text-xs" />
        </button>
      )}
      <i className="fa-solid fa-chevron-right text-[var(--color-lavender-lt)] text-xs flex-shrink-0" />
    </div>
  );
}

// ─── Übernachtungs-Trenner (Tagesgrenze) ──────────────────────────────────────

function OvernightDivider({ overnightName, overnightPrice, expanded, editable, bookingHref, onToggle, onPick, onPrice, onApplyAll, onMerge }: {
  overnightName: string | null;
  overnightPrice: number | null;
  expanded: boolean;
  editable: boolean;
  bookingHref: string;
  onToggle: () => void;
  onPick: (h: { id: string; name: string; pricePerNight: number; lat?: number | null; lng?: number | null } | null) => void;
  onPrice: (p: number | null) => void;
  onApplyAll?: () => void;
  onMerge: () => void;
}) {
  // Hotel-Suche: Name eingeben (z.B. „Hotel Matamba") → Geocoding liefert Koordinaten
  const [q, setQ] = useState('');
  const [sugs, setSugs] = useState<GeoLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function search(val: string) {
    setQ(val);
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 3) { setSugs([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      setSugs(await geocodeSuggestions(val));
      setSearching(false);
    }, 450);
  }
  return (
    <div className="my-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 border-t-2 border-dashed border-[var(--color-lavender-lt)]" />
        <button onClick={onToggle}
          className="flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all"
          style={{ background: '#34254C', color: 'white' }}>
          <i className="fa-solid fa-moon text-[var(--color-amber)]" />
          {overnightName ? `Übernachtung: ${overnightName}${overnightPrice ? ` · ${overnightPrice} €` : ''}` : 'Übernachtung'}
          <i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'} opacity-60`} />
        </button>
        <div className="flex-1 border-t-2 border-dashed border-[var(--color-lavender-lt)]" />
        {editable && (
          <button onClick={onMerge} title="Tagesgrenze auflösen (Tage zusammenlegen)"
            className="w-7 h-7 rounded-full bg-white border border-[var(--color-bg-soft)] text-[var(--color-lavender)] hover:text-[#C96442] flex items-center justify-center text-xs flex-shrink-0">
            <i className="fa-solid fa-xmark" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2" style={{ animation: 'gtSlideUp 0.2s ease' }}>

          {/* Hotel-Suche (Geocoding → Name + Koordinaten) */}
          {editable && (
            <div className="bg-white rounded-xl p-3 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-2 border border-[var(--color-bg-soft)] rounded-xl px-3 py-2">
                <i className={`fa-solid ${searching ? 'fa-circle-notch fa-spin' : 'fa-magnifying-glass'} text-[var(--color-lavender)] text-xs`} />
                <input type="text" value={q} onChange={e => search(e.target.value)}
                  placeholder="Unterkunft suchen, z.B. Hotel Matamba…"
                  className="flex-1 outline-none text-sm text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)]" />
              </div>
              {sugs.length > 0 && (
                <div className="mt-1.5 flex flex-col">
                  {sugs.map((s, i) => (
                    <button key={i}
                      onClick={() => { onPick({ id: 'custom', name: s.displayName, pricePerNight: 0, lat: s.coords.lat, lng: s.coords.lng }); setQ(''); setSugs([]); }}
                      className="flex items-start gap-2 px-2 py-2 text-left hover:bg-[var(--color-bg-soft)] rounded-lg transition-colors">
                      <i className="fa-solid fa-bed text-[var(--color-amber)] mt-0.5 text-xs flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-aubergine)] truncate">{s.displayName}</p>
                        <p className="text-[11px] text-[var(--color-lavender)] truncate">{s.fullAddress}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Gewähltes Hotel: Preis je Nacht + für alle Nächte übernehmen */}
          {editable && overnightName && (
            <div className="bg-white rounded-xl p-3 shadow-[var(--shadow-card)] flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-[var(--color-aubergine)] flex-1 min-w-0 truncate">
                <i className="fa-solid fa-bed text-[var(--color-amber)] mr-1.5" />{overnightName}
              </span>
              <div className="flex items-center gap-1">
                <input type="number" min={0} value={overnightPrice ?? ''} placeholder="0"
                  onChange={e => onPrice(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-20 text-right border border-[var(--color-bg-soft)] rounded-lg px-2 py-1 text-sm outline-none focus:border-[var(--color-amber)]" />
                <span className="text-xs text-[var(--color-lavender)]">€/Nacht</span>
              </div>
              {onApplyAll && (
                <button onClick={onApplyAll}
                  className="text-[11px] font-bold text-[var(--color-amber)] hover:underline">
                  <i className="fa-solid fa-copy mr-1" />Für alle Nächte übernehmen
                </button>
              )}
            </div>
          )}

          {editable && <p className="text-[10px] text-[var(--color-lavender)] px-1">Empfehlungen (Demo-Daten):</p>}
          {editable && DEMO_HOTELS.map(h => (
            <button key={h.id} onClick={() => onPick({ id: h.id, name: h.name, pricePerNight: h.pricePerNight })}
              className={`flex items-center gap-3 bg-white rounded-xl p-3 shadow-[var(--shadow-card)] text-left border-2 transition-colors ${overnightName === h.name ? 'border-[var(--color-amber)]' : 'border-transparent'}`}>
              <img src={h.image} alt={h.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-[var(--color-aubergine)] truncate">{h.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-bold bg-[#d4edda] text-[#2e7d32] px-1.5 py-0.5 rounded">{h.rating} {h.ratingLabel}</span>
                  <span className="text-xs text-[var(--color-lavender)]">{h.provider} · {h.stars}★</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-bold text-[var(--color-aubergine)]">{h.pricePerNight} €</div>
                <div className="text-[10px] text-[var(--color-lavender)]">/ Nacht</div>
              </div>
            </button>
          ))}
          <div className="flex gap-2">
            <a href={bookingHref} target="_blank" rel="noopener noreferrer sponsored"
              className="flex-1 text-center bg-[#003580] text-white text-xs font-bold py-2.5 rounded-xl hover:brightness-110 transition-all">
              <i className="fa-solid fa-bed mr-1.5" />Mehr Hotels auf Booking.com
            </a>
            {editable && overnightName && (
              <button onClick={() => onPick(null)}
                className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-white border border-[var(--color-bg-soft)] text-[var(--color-lavender)]">
                Hotel entfernen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Zwischentext (Notiz) unter einem Stopp ───────────────────────────────────

function NoteBlock({ text, editable, onSave }: {
  text: string; editable: boolean; onSave: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  if (!text && !editable) return null;

  if (editing) {
    return (
      <div className="ml-12 mb-2 -mt-0.5">
        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} autoFocus
          placeholder="Zwischentext, z.B. Tipps für den Weg oder was hier besonders ist…"
          className="w-full border border-[var(--color-bg-soft)] rounded-xl px-3 py-2 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)] resize-none" />
        <div className="flex gap-2 mt-1">
          <button onClick={() => { onSave(draft.trim()); setEditing(false); }}
            className="text-[11px] font-bold text-white bg-[var(--color-amber)] px-3 py-1 rounded-lg">Speichern</button>
          <button onClick={() => { setDraft(text); setEditing(false); }}
            className="text-[11px] font-semibold text-[var(--color-lavender)]">Abbrechen</button>
        </div>
      </div>
    );
  }

  if (text) {
    return (
      <div className="ml-12 mb-2 -mt-0.5 pl-3 border-l-2 border-[var(--color-lavender-lt)] cursor-pointer"
        onClick={() => editable && setEditing(true)}
        title={editable ? 'Klicken zum Bearbeiten' : undefined}>
        <p className="text-[13px] italic leading-relaxed text-[var(--color-lavender)]">{text}</p>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)}
      className="ml-12 mb-1.5 -mt-0.5 text-[10px] text-[var(--color-lavender-lt)] hover:text-[var(--color-amber)] transition-colors block">
      <i className="fa-solid fa-pen mr-1" />Zwischentext hinzufügen
    </button>
  );
}

// ─── Trip-Beschreibung (Intro) — bei eigenen Trips editierbar ─────────────────

function IntroBlock({ intro, editable, onSave }: {
  intro: string; editable: boolean; onSave: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(intro);
  if (!intro && !editable) return null;

  if (editing) {
    return (
      <div className="mb-5">
        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} autoFocus
          placeholder="Was erwartet einen auf diesem Trip? Schreib eine kurze Einleitung…"
          className="w-full border border-[var(--color-bg-soft)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)] resize-none" />
        <div className="flex gap-2 mt-1.5">
          <button onClick={() => { onSave(draft.trim()); setEditing(false); }}
            className="text-xs font-bold text-white bg-[var(--color-amber)] px-4 py-1.5 rounded-lg">Speichern</button>
          <button onClick={() => { setDraft(intro); setEditing(false); }}
            className="text-xs font-semibold text-[var(--color-lavender)]">Abbrechen</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 md:max-w-3xl group">
      {intro
        ? <p className="text-[15px] leading-relaxed text-[var(--color-body)]">{intro}</p>
        : <p className="text-sm italic text-[var(--color-lavender-lt)]">Noch keine Beschreibung.</p>}
      {editable && (
        <button onClick={() => { setDraft(intro); setEditing(true); }}
          className="text-[11px] font-bold text-[var(--color-amber)] mt-1">
          <i className="fa-solid fa-pen mr-1" />{intro ? 'Beschreibung bearbeiten' : 'Beschreibung hinzufügen'}
        </button>
      )}
    </div>
  );
}
