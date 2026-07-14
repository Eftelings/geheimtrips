import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AppShell } from '../components/layout/AppShell.js';
import { LegalFooter } from '../components/layout/LegalFooter.js';
import { Toast } from '../components/ui/Toast.js';
import { BottomSheet } from '../components/ui/BottomSheet.js';
import { PlaceImage } from '../components/ui/PlaceImage.js';
import { TagBadge } from '../components/ui/TagBadge.js';
import { WeatherForecast } from '../components/ui/WeatherForecast.js';
import { useAppStore } from '../store/useAppStore.js';
import exifr from 'exifr';
import { placesApi, businessApi, mediaApi } from '../services/api.js';
import type { ParkingContributions, PlaceQuestion } from '../services/api.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { useRequireAuth } from '../hooks/useRequireAuth.js';
import { Avatar } from '../components/ui/Avatar.js';
import { ReviewFlow } from '../components/ui/ReviewFlow.js';
import type { ReviewSection } from '../components/ui/ReviewFlow.js';
import type { Place, Transport } from '../types/index.js';
import { isOpenNow, HOUR_DAYS } from '../data/detailQuestions.js';
import type { WeekHours } from '../data/detailQuestions.js';
import { distanceKm, geocodeSuggestions } from '../services/geoService.js';
import type { Coords, GeoLocation } from '../services/geoService.js';
import { pointInGeoJSON, EFFECTIVE_SPEED_KMH, reachBBoxPoints } from '../utils/geo.js';
import type { IsochroneResponse } from '../utils/geo.js';
import { ReachControls } from '../components/ui/ReachControls.js';
import { ReachLayer } from '../components/map/ReachLayer.js';
import { useTravelReach } from '../hooks/useTravelReach.js';

// ─── Transport helpers ────────────────────────────────────────────────────────

function toGoogleTravelMode(t: Transport | null) {
  const m: Record<Transport, string> = { walk: 'walking', bike: 'bicycling', transit: 'transit', train: 'transit', auto: 'driving' };
  return t ? (m[t] ?? 'driving') : 'driving';
}
function toAppleTravelMode(t: Transport | null) {
  const m: Record<Transport, string> = { walk: 'w', bike: 'b', transit: 'r', train: 'r', auto: 'd' };
  return t ? (m[t] ?? 'd') : 'd';
}
function toOsrmProfile(t: Transport | null) {
  if (t === 'walk') return 'foot';
  if (t === 'bike') return 'cycling';
  return 'driving';
}
function transportIcon(t: Transport | null) {
  if (t === 'walk')                       return 'fa-person-walking';
  if (t === 'bike')                       return 'fa-bicycle';
  if (t === 'transit' || t === 'train')   return 'fa-train-subway';
  return 'fa-car';
}
function formatDuration(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`;
}
function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// Estimate travel duration per mode from road distance.
// Driving uses OSRM actual time; all others use distance ÷ realistic speed.
const SPEED_MS: Record<Transport, number> = {
  auto:    0,     // unused — use OSRM duration directly
  walk:    1.39,  // 5 km/h
  bike:    4.17,  // 15 km/h
  transit: 8.33,  // 30 km/h (stops factored in)
  train:   27.78, // 100 km/h
};
function computeDisplayDuration(distance: number, drivingDuration: number, t: Transport): number {
  return t === 'auto' ? drivingDuration : distance / SPEED_MS[t];
}

// ─── Brand marker ─────────────────────────────────────────────────────────────

const brandMarker = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#F99039;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(52,37,76,0.35);"></div>`,
  iconSize: [14, 14], iconAnchor: [7, 7], className: '',
});
// Aktueller Ort: größerer lila Marker mit Halo, hebt sich von den orangenen ab
const currentMarker = L.divIcon({
  html: `<div style="position:relative;width:24px;height:24px;">
    <div style="position:absolute;inset:0;border-radius:50%;background:rgba(124,58,237,0.22);transform:scale(1.9);"></div>
    <div style="position:absolute;inset:0;border-radius:50%;background:#7c3aed;border:3px solid #fff;box-shadow:0 3px 9px rgba(52,37,76,0.5);"></div>
  </div>`,
  iconSize: [24, 24], iconAnchor: [12, 12], className: '',
});
// Luftlinie in km (Haversine) – für „nächstgelegene Orte auf der Karte"
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], 14); }, [lat, lng, map]);
  return null;
}

// Karte auf mehrere Punkte einpassen (verlinkte Orte in einer Beschreibung)
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map(p => p.join(',')).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) { map.setView(points[0], 14); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Mini-Karte mit allen im Text verlinkten Orten (z.B. Spots in einem Stadtteil). */
function LinkedPlacesMap({ linked, onOpen }: {
  linked: { id: string; name: string; lat: number; lng: number }[];
  onOpen: (id: string) => void;
}) {
  const pts = linked.map(p => [p.lat, p.lng] as [number, number]);
  return (
    <div className="rounded-2xl overflow-hidden border border-[var(--color-bg-soft)]">
      <div style={{ height: 200, position: 'relative', zIndex: 0 }}>
        <MapContainer center={pts[0]} zoom={13} scrollWheelZoom={false} zoomControl={false} attributionControl={false}
          style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          {linked.map(p => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={brandMarker}
              eventHandlers={{ click: () => onOpen(p.id) }} />
          ))}
          <FitBounds points={pts} />
        </MapContainer>
      </div>
      <div className="flex flex-wrap gap-1.5 p-3 bg-white">
        {linked.map(p => (
          <button key={p.id} onClick={() => onOpen(p.id)}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full active:scale-95 transition-transform"
            style={{ background: '#FFF4EB', color: '#C96442' }}>
            <i className="fa-solid fa-location-dot text-[10px]" />{p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// Bei Änderung von Radius/Verkehrsmittel die Karte auf die Reichweite (+ aktuellen Ort) einpassen,
// damit der gewählte Radius sichtbar wird. Erstansicht bleibt auf den Ort zentriert.
function FitReachOnChange({ center, travel, radiusKm, place }: {
  center: Coords | null;
  travel: { mode: 'radius' | Transport; minutes: number; iso: IsochroneResponse | null };
  radiusKm: number;
  place: [number, number];
}) {
  const map = useMap();
  const first = useRef(true);
  const key = `${center?.lat?.toFixed(3)},${center?.lng?.toFixed(3)}|${travel.mode}|${travel.minutes}|${radiusKm}`;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!center) return;
    const pts = [...reachBBoxPoints(center, travel, radiusKm), place];
    if (pts.length < 2) return;
    try { map.fitBounds(pts as [number, number][], { padding: [50, 50], maxZoom: 13, animate: true }); } catch { /* ignore */ }
  }, [key]); // eslint-disable-line
  return null;
}

// Erkennt mobile Viewports (< lg). Steuert den Vollbildkarten-+-Bottom-Sheet-Modus.
function useIsMobile(breakpoint = 1024) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [breakpoint]);
  return mobile;
}

// ─── Rating criteria ──────────────────────────────────────────────────────────
//  Dimensionen: Hedonic | Economic | Social | Functional | Quality

const RATING_CRITERIA = [
  { key: 'experience',     label: 'Erlebniswert',      icon: 'fa-star',           desc: 'War der Besuch das Erlebnis wert?' },
  { key: 'atmosphere',     label: 'Atmosphäre',         icon: 'fa-face-smile',     desc: 'Stimmung und Feeling vor Ort' },
  { key: 'value',          label: 'Preis-Leistung',     icon: 'fa-coins',          desc: 'Wie fair ist Aufwand zum Erlebnis?' },
  { key: 'familyfriendly', label: 'Familientauglich',   icon: 'fa-child',          desc: 'Geeignet für Familien & Kinder?' },
  { key: 'accessibility',  label: 'Zugänglichkeit',     icon: 'fa-person-walking', desc: 'Erreichbarkeit & Orientierung' },
  { key: 'condition',      label: 'Zustand & Pflege',   icon: 'fa-broom',          desc: 'Sauberkeit, Aktualität, Pflege' },
] as const;
type RatingKey = typeof RATING_CRITERIA[number]['key'];

// ─── Reviews ──────────────────────────────────────────────────────────────────

interface Review {
  id: number; userName: string; avatarColor: string; rating: number;
  categories: Partial<Record<RatingKey, number>>; comment: string; date: string; helpful: number;
}
const SEED_REVIEWS: Review[] = [
  { id: 1, userName: 'Sarah K.',  avatarColor: '#5B8F6E', rating: 5, date: '12.10.2024', helpful: 8,
    categories: { experience: 5, atmosphere: 5, value: 4, familyfriendly: 5, accessibility: 4, condition: 5 },
    comment: 'Absolut beeindruckend! Die Aussicht ist einzigartig und man spürt sofort die Geschichte des Ortes.' },
  { id: 2, userName: 'Marcus W.', avatarColor: '#C9A227', rating: 4, date: '28.09.2024', helpful: 5,
    categories: { experience: 4, atmosphere: 5, value: 3, familyfriendly: 3, accessibility: 4, condition: 4 },
    comment: 'Wunderschöner Ort, aber etwas überlaufen an Wochenenden. Unter der Woche deutlich angenehmer.' },
  { id: 3, userName: 'Lena F.',   avatarColor: '#D97757', rating: 5, date: '15.09.2024', helpful: 12,
    categories: { experience: 5, atmosphere: 5, value: 5, familyfriendly: 4, accessibility: 3, condition: 5 },
    comment: 'Im Herbst besonders schön — weniger Besucher, tolles Licht, alles wirkt irgendwie magischer.' },
  { id: 4, userName: 'Thomas B.', avatarColor: '#8A6FB3', rating: 3, date: '05.08.2024', helpful: 3,
    categories: { experience: 3, atmosphere: 4, value: 2, familyfriendly: 2, accessibility: 3, condition: 3 },
    comment: 'Guter Ort, aber die Anfahrt ist mühsam. Mit kleinen Kindern schwierig.' },
  { id: 5, userName: 'Jana P.',   avatarColor: '#34254C', rating: 5, date: '01.11.2024', helpful: 6,
    categories: { experience: 5, atmosphere: 5, value: 4, familyfriendly: 5, accessibility: 5, condition: 5 },
    comment: 'Sehr gut ausgeschildert, sauber, und das Team vor Ort war super freundlich. Kindergerechte Wege.' },
];

// ─── Q&A ──────────────────────────────────────────────────────────────────────

interface QAEntry {
  id: number; question: string; askedBy: string; askedAt: string;
  answers: { id: number; text: string; answeredBy: string; answeredAt: string; isCreator?: boolean; helpful: number }[];
}

// Trivia-Typ → Lila-Icon (FontAwesome)
const TRIVIA_ICONS: Record<string, string> = {
  'Fun Fact':            'fa-face-laugh-beam',
  'Historischer Fakt':   'fa-scroll',
  'Kuriosität':          'fa-wand-magic-sparkles',
  'Legende & Sage':      'fa-dragon',
  'Rekord':              'fa-trophy',
  'Drehort & Popkultur': 'fa-clapperboard',
  'Geheimtipp':          'fa-user-secret',
};
// Backend-Frage → Anzeige-Eintrag (eine Antwort der/des Ersteller:in)
function toQaEntry(q: PlaceQuestion): QAEntry {
  const fmt = (d: string | null) => d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleDateString('de') : '';
  return {
    id: q.id, question: q.question, askedBy: q.askerName, askedAt: fmt(q.createdAt),
    answers: q.answer
      ? [{ id: q.id, text: q.answer, answeredBy: q.answeredBy ?? 'Ersteller:in', answeredAt: fmt(q.answeredAt), isCreator: true, helpful: 0 }]
      : [],
  };
}

// Photo categories
const PHOTO_CATS = [
  { id: 'alle', label: 'Alle' }, { id: 'außen', label: 'Außenansicht' },
  { id: 'natur', label: 'Natur' }, { id: 'innen', label: 'Innenansicht' },
  { id: 'details', label: 'Details' }, { id: 'atmosphäre', label: 'Atmosphäre' },
] as const;
type PhotoCat = typeof PHOTO_CATS[number]['id'];

// ─── Shared sub-components ────────────────────────────────────────────────────

function StarDisplay({ rating, size = 'sm' }: { rating: number; size?: 'xs' | 'sm' | 'lg' }) {
  const cls = size === 'xs' ? 'text-[10px]' : size === 'lg' ? 'text-lg' : 'text-xs';
  return (
    <span className={`flex gap-0.5 ${cls}`} style={{ color: '#F99039' }}>
      {[1,2,3,4,5].map(n => (
        <i key={n} className={n <= Math.floor(rating) ? 'fa-solid fa-star' : n - 0.5 <= rating ? 'fa-solid fa-star-half-stroke' : 'fa-regular fa-star'} />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1 flex-shrink-0">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)} onMouseLeave={() => setHovered(0)}
          className={`text-xl transition-colors ${n <= (hovered || value) ? 'text-[var(--color-amber)]' : 'text-[var(--color-bg-soft)]'}`}>
          <i className="fa-solid fa-star" />
        </button>
      ))}
    </div>
  );
}

function VisitedToggle({ isVisited, gpsLoading, onToggle }: { isVisited: boolean; gpsLoading: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} disabled={gpsLoading} aria-pressed={isVisited}
      className="flex items-center gap-2.5 select-none">
      <div className="relative w-12 h-6 rounded-full transition-all duration-300 flex-shrink-0"
        style={{ background: isVisited ? 'var(--color-success)' : '#D1C7DC' }}>
        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center transition-all duration-300"
          style={{ left: isVisited ? '26px' : '2px' }}>
          {gpsLoading
            ? <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 8, color: '#71587A' }} />
            : isVisited
              ? <i className="fa-solid fa-check" style={{ fontSize: 8, color: 'var(--color-success)' }} />
              : <i className="fa-solid fa-location-crosshairs" style={{ fontSize: 8, color: '#71587A' }} />}
        </div>
      </div>
      <span className="text-sm font-semibold transition-colors"
        style={{ color: isVisited ? 'var(--color-success)' : 'var(--color-lavender)' }}>
        {gpsLoading ? 'GPS…' : isVisited ? 'Besucht ✓' : 'Ich war hier'}
      </span>
    </button>
  );
}

// ─── Opening hours helpers ────────────────────────────────────────────────────

type HourSlot = { months: number[]; open: string; close: string; lastEntry?: string };

function getTodayHours(schedule: HourSlot[]): HourSlot | 'closed' {
  const m = new Date().getMonth() + 1; // 1–12
  return schedule.find(s => s.months.includes(m)) ?? 'closed';
}

// ─── Price icon helper ────────────────────────────────────────────────────────

const PRICE_ICONS: [RegExp, string][] = [
  [/geburtstag/i,          'fa-cake-candles'],
  [/kinder|kind|jugend/i,  'fa-child'       ],
  [/senior|rentner/i,      'fa-person-cane' ],
  [/familie/i,             'fa-people-roof' ],
  [/ermäßig|student/i,     'fa-id-card'     ],
  [/hund/i,                'fa-dog'         ],
  [/erwachsen/i,           'fa-person'      ],
];
function priceIcon(label: string): string {
  for (const [re, icon] of PRICE_ICONS) if (re.test(label)) return icon;
  return 'fa-ticket';
}

// ─── Praktisches: Öffnungsstatus, Kontakt, Links, Tickets (neues Feld-Modell) ──
function PlaceExtras({ place, className = '' }: { place: Place; className?: string }) {
  const answers = ((place.attributes as Record<string, unknown> | undefined)?.answers ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const rawHours = answers.opening_hours;
  const hours = rawHours && typeof rawHours === 'object' && !Array.isArray(rawHours) ? rawHours as (WeekHours & { alwaysOpen?: boolean }) : null;
  const alwaysOpen = hours?.alwaysOpen === true;
  const open = isOpenNow(hours);
  const phone = str(answers.phone), email = str(answers.email);
  const menuUrl = str(answers.menu_url), rsvUrl = str(answers.reservation_url), ticketUrl = str(answers.ticket_url);
  const tp = answers.ticket_prices && typeof answers.ticket_prices === 'object' ? answers.ticket_prices as Record<string, string> : null;
  const priceRows = tp ? ([['adult', 'Erwachsene'], ['child', 'Kinder'], ['reduced', 'Ermäßigte'], ['senior', 'Senioren']] as const)
    .filter(([k]) => str(tp[k])).map(([k, label]) => ({ label, amount: str(tp[k]) })) : [];
  const daysWithHours = hours ? HOUR_DAYS.filter(([k]) => hours[k] && (hours[k].closed || (hours[k].open && hours[k].close))) : [];
  const todayKey = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'][new Date().getDay()];

  const links: { href: string; icon: string; label: string }[] = [];
  if (menuUrl)   links.push({ href: menuUrl,          icon: 'fa-book-open',      label: 'Speisekarte' });
  if (rsvUrl)    links.push({ href: rsvUrl,           icon: 'fa-calendar-check', label: 'Reservieren' });
  if (ticketUrl) links.push({ href: ticketUrl,        icon: 'fa-ticket',         label: 'Tickets' });
  if (phone)     links.push({ href: `tel:${phone}`,   icon: 'fa-phone',          label: 'Anrufen' });
  if (email)     links.push({ href: `mailto:${email}`, icon: 'fa-envelope',      label: 'E-Mail' });

  if (!alwaysOpen && !daysWithHours.length && !links.length && !priceRows.length) return null;

  return (
    <div className={`rounded-2xl border border-[var(--color-bg-soft)] bg-white p-4 ${className}`}>
      {(alwaysOpen || daysWithHours.length > 0) && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-lavender)]">Öffnungszeiten</p>
            {open !== null && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={open ? { background: 'rgba(46,138,78,0.14)', color: '#2D8A4E' } : { background: 'rgba(201,100,66,0.14)', color: '#C96442' }}>
                <i className="fa-solid fa-circle text-[7px] mr-1 align-middle" />{open ? 'Jetzt geöffnet' : 'Geschlossen'}
              </span>
            )}
          </div>
          {alwaysOpen ? (
            <p className="text-sm text-[var(--color-aubergine)]">Durchgehend geöffnet (rund um die Uhr)</p>
          ) : (
          <div className="space-y-0.5">
            {daysWithHours.map(([k, label]) => (
              <div key={k} className="flex justify-between text-sm" style={k === todayKey ? { fontWeight: 700, color: '#34254C' } : { color: '#71587A' }}>
                <span>{label}</span><span>{hours![k].closed ? 'geschlossen' : `${hours![k].open}–${hours![k].close}`}</span>
              </div>
            ))}
          </div>
          )}
        </div>
      )}
      {priceRows.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-lavender)] mb-1.5">Ticketpreise</p>
          <div className="space-y-0.5">
            {priceRows.map(p => (
              <div key={p.label} className="flex justify-between text-sm"><span className="text-[var(--color-lavender)]">{p.label}</span><span className="font-semibold text-[var(--color-aubergine)]">{p.amount}</span></div>
            ))}
          </div>
        </div>
      )}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map(l => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-[var(--color-bg-soft)] text-[var(--color-aubergine)] hover:border-[var(--color-amber)] transition-colors">
              <i className={`fa-solid ${l.icon} text-[11px] text-[var(--color-amber)]`} />{l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Auf einen Blick card ─────────────────────────────────────────────────────

type PriceEntry = { label: string; amount: string; from?: boolean; note?: string };

interface AebProps {
  className?: string;
  costLabel: string;
  entranceFee?: string | null;
  entranceFeeAmount?: string | null;
  rating: number;
  reviews: number;
  website: string | null;
  openingHours: string | null;
  weekHours?: Record<string, string> | null;   // Wochentags-Zeiten aus dem Einreichformular
  hoursSchedule: HourSlot[] | null;
  hoursUrl: string | null;
  prices: PriceEntry[] | null;
  pricesUrl: string | null;
  specialInfo: string[] | null;
  isOfficiallyManaged?: boolean;
  parking?: 'free' | 'paid' | 'limited' | null;
  parkingContribs?: { yes: number; no: number; limited: number; total: number } | null;
  merkmale?: string[];
  vibes?: string[];
}

const WEEKDAY_KEYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'] as const;
const WEEKDAY_LABELS: Record<string, string> = {
  mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag',
  fr: 'Freitag', sa: 'Samstag', so: 'Sonntag',
};

function AtAGlanceBox({ className = '', costLabel, entranceFee, entranceFeeAmount, rating, reviews, website, openingHours, weekHours, hoursSchedule, hoursUrl, prices, pricesUrl, specialInfo, isOfficiallyManaged, parking, parkingContribs, merkmale, vibes }: AebProps) {
  const todayHours = hoursSchedule ? getTodayHours(hoursSchedule) : null;
  const hasWeekHours = !!weekHours && Object.keys(weekHours).length > 0;
  const todayKey = WEEKDAY_KEYS[new Date().getDay()];
  const todayWeekText = hasWeekHours ? (weekHours![todayKey] ?? null) : null;
  const externalLink = (
    <i className="fa-solid fa-arrow-up-right-from-square text-[9px]" style={{ color: 'rgba(255,255,255,0.55)' }} />
  );
  const btnCls = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:brightness-110';
  const btnStyle = { background: '#71587a', color: 'white' };

  return (
    <div className={`rounded-3xl p-5 ${className}`} style={{ background: '#F1ECF4' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-lavender)]">Auf einen Blick</p>
        {isOfficiallyManaged && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: '#e8f5e9', color: '#2e7d32' }}>
            <i className="fa-solid fa-circle-check text-[9px]" />
            Offiziell
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3.5">

        {/* Merkmale */}
        {merkmale && merkmale.length > 0 && (
          <div className="flex items-start gap-3">
            <i className="fa-solid fa-tags text-[var(--color-lavender)] mt-0.5 w-4 text-sm flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-[var(--color-lavender)] uppercase tracking-wider leading-none mb-1.5">Merkmale</p>
              <div className="flex flex-wrap gap-1.5">
                {merkmale.map(m => <span key={m} className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'white', color: '#71587a' }}>{m}</span>)}
              </div>
            </div>
          </div>
        )}

        {/* Vibe */}
        {vibes && vibes.length > 0 && (
          <div className="flex items-start gap-3">
            <i className="fa-solid fa-wand-magic-sparkles text-[var(--color-lavender)] mt-0.5 w-4 text-sm flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-[var(--color-lavender)] uppercase tracking-wider leading-none mb-1.5">Vibe</p>
              <div className="flex flex-wrap gap-1.5">
                {vibes.map(v => <span key={v} className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#8A6FB3', color: 'white' }}>{v}</span>)}
              </div>
            </div>
          </div>
        )}

        {/* Budget */}
        <div className="flex items-start gap-3">
          <i className="fa-solid fa-coins text-[var(--color-lavender)] mt-0.5 w-4 text-sm flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--color-lavender)] uppercase tracking-wider leading-none mb-0.5">Budget</p>
            <p className="text-sm font-semibold text-[var(--color-aubergine)]">{costLabel}</p>
          </div>
        </div>

        {/* Eintritt (from submission answers) */}
        {entranceFee && entranceFee !== 'Nicht bekannt' && (
          <div className="flex items-start gap-3">
            <i className={`fa-solid ${entranceFee === 'Kostenlos' ? 'fa-circle-check' : entranceFee === 'Kostenpflichtig' ? 'fa-euro-sign' : 'fa-ticket-simple'} text-[var(--color-lavender)] mt-0.5 w-4 text-sm flex-shrink-0`} />
            <div className="min-w-0">
              <p className="text-[10px] text-[var(--color-lavender)] uppercase tracking-wider leading-none mb-0.5">Eintritt</p>
              <p className="text-sm font-semibold"
                style={{ color: entranceFee === 'Kostenlos' ? '#2D8A4E' : 'var(--color-aubergine)' }}>
                {entranceFee}
              </p>
              {entranceFeeAmount && (
                <p className="text-xs mt-0.5" style={{ color: '#71587a' }}>{entranceFeeAmount}</p>
              )}
            </div>
          </div>
        )}

        {/* Bewertung */}
        <div className="flex items-start gap-3">
          <i className="fa-solid fa-star text-[var(--color-lavender)] mt-0.5 w-4 text-sm flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--color-lavender)] uppercase tracking-wider leading-none mb-0.5">Bewertung</p>
            <p className="text-sm font-semibold text-[var(--color-aubergine)]">{rating} ★ ({reviews} Bew.)</p>
          </div>
        </div>

        {/* Website — button */}
        {website && (
          <div className="flex items-start gap-3">
            <i className="fa-solid fa-globe text-[var(--color-lavender)] mt-0.5 w-4 text-sm flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-[var(--color-lavender)] uppercase tracking-wider leading-none mb-1.5">Website</p>
              <a href={website.startsWith('http') ? website : `https://${website}`}
                target="_blank" rel="noopener noreferrer" className={btnCls} style={btnStyle}>
                Zur Website {externalLink}
              </a>
            </div>
          </div>
        )}

        {/* Öffnungszeiten — heute */}
        {(hoursSchedule || openingHours || hasWeekHours) && (
          <div className="flex items-start gap-3">
            <i className="fa-solid fa-clock text-[var(--color-lavender)] mt-0.5 w-4 text-sm flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-[var(--color-lavender)] uppercase tracking-wider leading-none mb-0.5">Öffnungszeiten</p>
              {todayHours === 'closed' ? (
                <p className="text-sm font-semibold" style={{ color: '#C96442' }}>Heute geschlossen</p>
              ) : todayHours ? (
                <>
                  <p className="text-sm font-semibold text-[var(--color-aubergine)]">
                    Heute: {todayHours.open} – {todayHours.close} Uhr
                  </p>
                  {todayHours.lastEntry && (
                    <p className="text-xs mt-0.5" style={{ color: '#71587a' }}>
                      Letzter Einlass: {todayHours.lastEntry} Uhr
                    </p>
                  )}
                </>
              ) : hasWeekHours ? (
                <>
                  <p className="text-sm font-semibold"
                    style={{ color: todayWeekText?.toLowerCase().includes('geschlossen') ? '#C96442' : 'var(--color-aubergine)' }}>
                    Heute: {todayWeekText || 'keine Angabe'}
                  </p>
                  <details className="mt-1">
                    <summary className="text-xs cursor-pointer select-none" style={{ color: '#71587a' }}>
                      Alle Wochentage
                    </summary>
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      {(['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'] as const).map(k => (
                        <div key={k} className="flex items-baseline gap-2 text-xs">
                          <span className="w-20 flex-shrink-0"
                            style={{ color: k === todayKey ? 'var(--color-amber)' : '#9A8FAA', fontWeight: k === todayKey ? 700 : 500 }}>
                            {WEEKDAY_LABELS[k]}
                          </span>
                          <span className="text-[var(--color-aubergine)]">{weekHours![k] || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              ) : (
                <p className="text-sm font-semibold text-[var(--color-aubergine)]">{openingHours}</p>
              )}
              {hoursUrl && (
                <a href={hoursUrl.startsWith('http') ? hoursUrl : `https://${hoursUrl}`}
                  target="_blank" rel="noopener noreferrer" className={`${btnCls} mt-1.5`} style={btnStyle}>
                  Alle Zeiten {externalLink}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Eintrittspreis — mit Icons */}
        {prices && prices.length > 0 && (
          <div className="flex items-start gap-3">
            <i className="fa-solid fa-ticket text-[var(--color-lavender)] mt-0.5 w-4 text-sm flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-[var(--color-lavender)] uppercase tracking-wider leading-none mb-2">Eintrittspreis</p>
              <div className="flex flex-col gap-1.5">
                {prices.map((p, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <i className={`fa-solid ${priceIcon(p.label)} flex-shrink-0 mt-0.5`}
                      style={{ fontSize: 12, color: '#71587A', width: 16, textAlign: 'center' as const }} />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1 flex-wrap">
                        {p.from && <span className="text-[10px] font-medium text-[var(--color-lavender)]">ab</span>}
                        <span className="text-sm font-bold text-[var(--color-aubergine)]">{p.amount}</span>
                        {p.label && <span className="text-xs text-[var(--color-lavender)]">— {p.label}</span>}
                      </div>
                      {p.note && (
                        <p className="text-[10px] text-[var(--color-lavender-lt)] mt-0.5 italic">{p.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {pricesUrl && (
                <a href={pricesUrl.startsWith('http') ? pricesUrl : `https://${pricesUrl}`}
                  target="_blank" rel="noopener noreferrer" className={`${btnCls} mt-2`} style={btnStyle}>
                  Zu den offiziellen Preisen {externalLink}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Parking */}
        {(parking || (parkingContribs && parkingContribs.total > 0)) && (
          <div className="flex items-start gap-3">
            <i className="fa-solid fa-square-parking text-[var(--color-lavender)] mt-0.5 w-4 text-sm flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-[var(--color-lavender)] uppercase tracking-wider leading-none mb-0.5">Parkmöglichkeiten</p>
              {parking === 'free'    && <p className="text-sm font-semibold text-[var(--color-aubergine)]">Kostenlos <span className="text-[11px] font-normal text-[var(--color-lavender)]">(lt. Angabe)</span></p>}
              {parking === 'paid'    && <p className="text-sm font-semibold text-[var(--color-aubergine)]">Kostenpflichtig <span className="text-[11px] font-normal text-[var(--color-lavender)]">(lt. Angabe)</span></p>}
              {parking === 'limited' && <p className="text-sm font-semibold text-[var(--color-aubergine)]">Begrenzt / schwierig <span className="text-[11px] font-normal text-[var(--color-lavender)]">(lt. Angabe)</span></p>}
              {!parking && <p className="text-sm font-semibold text-[var(--color-aubergine)]">Keine Angabe</p>}
              {parkingContribs && parkingContribs.total > 0 && (() => {
                const { yes, no, limited, total } = parkingContribs;
                const yesPct = Math.round((yes / total) * 100);
                const icon = yesPct >= 60 ? 'fa-circle-check' : yesPct >= 30 ? 'fa-circle-half-stroke' : 'fa-circle-xmark';
                const col  = yesPct >= 60 ? '#2e7d32' : yesPct >= 30 ? '#c97500' : '#c62828';
                return (
                  <p className="text-xs mt-0.5" style={{ color: col }}>
                    <i className={`fa-solid ${icon} mr-1`} />
                    {yesPct}% fanden Parkplatz
                    <span className="text-[10px] text-[var(--color-lavender-lt)] ml-1">({total} Stimmen)</span>
                  </p>
                );
              })()}
            </div>
          </div>
        )}

        {/* Hinweise */}
        {specialInfo && specialInfo.map((info, i) => (
          <div key={i} className="flex items-center gap-3">
            <i className="fa-solid fa-circle-info text-[var(--color-lavender)] w-4 text-sm flex-shrink-0" />
            <p className="text-sm text-[var(--color-aubergine)]">{info}</p>
          </div>
        ))}

      </div>
    </div>
  );
}

// Erkennt Video-URLs (hochgeladene Videos) anhand der Dateiendung
const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v)$/i.test(url);

// Galerie-Kachel: rendert <video> für Videos, sonst <img> — mit Crop-Position
function GalleryMedia({ url, pos = 'center', className, onClick }:
  { url: string; pos?: string; className: string; onClick?: () => void }) {
  const style = { animation: 'fadeIn 0.7s ease', objectPosition: pos };
  return isVideoUrl(url)
    // preload="metadata" + #t=0.1 → Browser zeigt sofort den ersten Frame, bis das Video läuft
    ? <video src={`${url}#t=0.1`} muted loop playsInline autoPlay preload="metadata"
        onClick={onClick} className={className} style={style} />
    : <img src={url} alt="" onClick={onClick} className={className} style={style} />;
}

// ─── Mobiler Titelbild-Slider (Swipe + Dots + „X Bilder"-Badge → Lightbox) ──────
function MobileHero({ place, photos, onOpen, onReviews }: {
  place: Place;
  photos: { url: string }[];
  onOpen: (idx: number) => void;
  onReviews: () => void;
}) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const list = photos.length ? photos : [{ url: place.hero ?? '' }];
  const cropFor = (url: string) => {
    const c = place.galleryCrops?.[url];
    if (c) return `${c.cropX * 100}% ${c.cropY * 100}%`;
    if (url === place.hero) return `${(place.heroCropX ?? 0.5) * 100}% ${(place.heroCropY ?? 0.5) * 100}%`;
    return 'center';
  };
  const onScroll = () => { const el = ref.current; if (el) setActive(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1))); };

  return (
    <div>
      <div className="relative rounded-3xl overflow-hidden" style={{ aspectRatio: '4 / 3' }}>
        <div ref={ref} onScroll={onScroll}
          className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none">
          {list.map((p, i) => (
            <button key={`${p.url}-${i}`} type="button" onClick={() => onOpen(i)}
              className="snap-center shrink-0 w-full h-full">
              {p.url
                ? <GalleryMedia url={p.url} pos={cropFor(p.url)} className="w-full h-full object-cover" />
                : <PlaceImage src={null} category={place.category} className="w-full h-full" iconClass="text-5xl" />}
            </button>
          ))}
        </div>

        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 45%)' }} />

        <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {(place.tagSlugs?.length ? place.tagSlugs : [place.tagSlug]).map((s, i) => (
              <TagBadge key={i} slug={s} fallback={i === 0 ? place.categoryLabel : undefined} icon={i === 0} variant="dark"
                className="text-[9px] px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(6px)' }} />
            ))}
            {place.isUserSubmitted && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white flex items-center gap-1"
                style={{ background: 'rgba(249,144,57,0.92)' }}>
                <i className="fa-solid fa-clock" /> In Prüfung
              </span>
            )}
          </div>
          <h1 className="font-display font-bold text-white leading-tight"
            style={{ fontSize: 'clamp(1.25rem, 6vw, 1.6rem)', letterSpacing: '-0.02em', textShadow: '0 2px 12px rgba(0,0,0,0.45)' }}>
            {place.name}
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-white/75 text-xs flex items-center gap-1">
              <i className="fa-solid fa-location-dot text-[10px]" /> {place.region}
            </span>
            <button onClick={onReviews} className="flex items-center gap-1.5 pointer-events-auto">
              <StarDisplay rating={place.rating} size="xs" />
              <span className="text-white/90 text-xs font-semibold">{place.rating}</span>
              <span className="text-white/60 text-[10px] underline underline-offset-2">({place.reviews})</span>
            </button>
          </div>
        </div>

        {photos.length > 0 && (
          <button type="button" onClick={() => onOpen(active)}
            className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', color: 'white' }}>
            <i className="fa-solid fa-images" style={{ fontSize: 10 }} /> {photos.length} {photos.length === 1 ? 'Bild' : 'Bilder'}
          </button>
        )}
      </div>

      {list.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2.5">
          {list.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-4 bg-[var(--color-amber)]' : 'w-1.5 bg-[var(--color-bg-soft)]'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Image Lightbox ──────────────────────────────────────────────────────────

function ImageLightbox({
  photos, startIndex, onClose, photoLikes, myLikedPhotos, onLike,
}: {
  photos: { url: string; caption?: string; author?: { name: string; avatarUrl: string | null } }[];
  startIndex: number;
  onClose: () => void;
  photoLikes?: Record<string, number>;
  myLikedPhotos?: Set<string>;
  onLike?: (url: string) => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(photos.length - 1, i + 1));
  const cur = photos[idx];
  const currentUrl = cur?.url ?? '';
  const liked = myLikedPhotos?.has(currentUrl) ?? false;
  const likeCount = photoLikes?.[currentUrl] ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowRight')  next();
      if (e.key === 'ArrowLeft')   prev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]); // eslint-disable-line

  // prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      style={{ background: 'rgba(15,11,26,0.96)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      {/* Close */}
      <button onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:brightness-125"
        style={{ background: 'rgba(255,255,255,0.12)', color: 'white' }}>
        <i className="fa-solid fa-xmark text-lg" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-sm font-medium pointer-events-none">
        {idx + 1} / {photos.length}
      </div>

      {/* Heart button */}
      {onLike && (
        <button
          onClick={e => { e.stopPropagation(); onLike(currentUrl); }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all hover:brightness-125 z-10"
          style={{
            background: liked ? 'rgba(249,144,57,0.9)' : 'rgba(255,255,255,0.14)',
            color: 'white',
            backdropFilter: 'blur(8px)',
          }}
        >
          <i className={`${liked ? 'fa-solid' : 'fa-regular'} fa-heart text-base`} />
          <span>{likeCount > 0 ? likeCount : 'Gefällt mir'}</span>
        </button>
      )}

      {/* Image */}
      <div className="relative max-w-[90vw] max-h-[80vh] flex items-center justify-center"
        onClick={e => e.stopPropagation()}>
        {isVideoUrl(currentUrl) ? (
          <video key={idx} src={currentUrl} controls autoPlay playsInline
            className="max-w-[90vw] max-h-[80vh] rounded-2xl shadow-2xl"
            style={{ animation: 'fadeIn 0.18s ease' }} />
        ) : (
          <img key={idx} src={currentUrl} alt=""
            className="max-w-[90vw] max-h-[80vh] rounded-2xl object-contain shadow-2xl"
            style={{ animation: 'fadeIn 0.18s ease' }} />
        )}
        {likeCount >= 10 && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ background: 'rgba(249,144,57,0.9)', color: 'white' }}>
            🔥 Beliebt
          </div>
        )}
      </div>

      {/* Bildunterschrift + Profilbild der Urheber:in */}
      {(cur?.caption || cur?.author) && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-20 w-[92vw] max-w-xl flex items-center gap-3 px-4 py-3 rounded-2xl"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
          onClick={e => e.stopPropagation()}>
          <p className="flex-1 min-w-0 text-white/90 text-sm leading-snug">
            {cur?.caption || <span className="text-white/40 italic">Ohne Beschreibung</span>}
          </p>
          {cur?.author && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="hidden sm:block text-white/70 text-xs font-medium">{cur.author.name}</span>
              <Avatar name={cur.author.name} src={cur.author.avatarUrl} size={34} />
            </div>
          )}
        </div>
      )}

      {/* Prev */}
      {idx > 0 && (
        <button onClick={e => { e.stopPropagation(); prev(); }}
          className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:brightness-125 hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.14)', color: 'white' }}>
          <i className="fa-solid fa-chevron-left" />
        </button>
      )}

      {/* Next */}
      {idx < photos.length - 1 && (
        <button onClick={e => { e.stopPropagation(); next(); }}
          className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:brightness-125 hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.14)', color: 'white' }}>
          <i className="fa-solid fa-chevron-right" />
        </button>
      )}

      {/* Thumbnails strip */}
      {photos.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 max-w-[80vw] overflow-x-auto px-2"
          style={{ scrollbarWidth: 'none' }}>
          {photos.map((p, i) => (
            <button key={i} onClick={e => { e.stopPropagation(); setIdx(i); }}
              className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden transition-all"
              style={{ opacity: i === idx ? 1 : 0.45, outline: i === idx ? '2px solid white' : 'none', outlineOffset: 2 }}>
              {isVideoUrl(p.url)
                ? <video src={p.url} muted playsInline className="w-full h-full object-cover" />
                : <img src={p.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── VisitorContribPanel ──────────────────────────────────────────────────────
// Shown to verified visitors to answer community questions about a place.

type ContribState = {
  parking:      string;
  dogs_allowed: string;
  secretness:   number;
};
const CONTRIB_EMPTY: ContribState = { parking: '', dogs_allowed: '', secretness: 3 };

function VisitorContribPanel({ place, user, onDone, showToast }: {
  place: Place & { id: string };
  user: unknown;
  onDone: () => void;
  showToast: (msg: string) => void;
}) {
  const [vals, setVals]     = useState<ContribState>(CONTRIB_EMPTY);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!user) { showToast('Bitte melde dich an.'); return; }
    setSaving(true);
    try {
      const tasks: Promise<unknown>[] = [];
      if (vals.parking)      tasks.push(placesApi.contribute(place.id, 'parking', vals.parking === 'Kostenloser Parkplatz direkt am Ort' ? 'yes' : vals.parking.startsWith('Kostenpflichtig') ? 'yes' : vals.parking.startsWith('Begrenzte') ? 'limited' : vals.parking === 'Kein Parkplatz – ÖPNV empfohlen' ? 'no' : 'limited'));
      if (vals.dogs_allowed)  tasks.push(placesApi.contribute(place.id, 'dogs_allowed', vals.dogs_allowed));
      if (vals.secretness > 0) tasks.push(placesApi.contribute(place.id, 'secretness', String(vals.secretness)));
      await Promise.all(tasks);
      showToast('Danke für deinen Beitrag! +5 Punkte');
      onDone();
    } catch { showToast('Speichern fehlgeschlagen – bitte nochmal versuchen.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-3xl p-4 bg-white flex flex-col gap-4"
      style={{ border: '1.5px solid #F99039', boxShadow: '0 2px 10px rgba(249,144,57,0.12)' }}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <i className="fa-solid fa-clipboard-question text-[var(--color-amber)] text-lg mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: '#34254c' }}>Teile deine Erfahrung</p>
          <p className="text-xs" style={{ color: '#71587a' }}>Als verifizierter Besucher kannst du die Community mit deinem Wissen unterstützen.</p>
        </div>
        <button onClick={onDone} className="text-[var(--color-lavender-lt)] hover:text-[var(--color-lavender)] flex-shrink-0">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Geheimnisgrad slider */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: '#34254c' }}>Wie geheim ist dieser Ort?</p>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#9A8FAA] flex-shrink-0 w-20">Touristisch bekannt</span>
          <input type="range" min="1" max="5" step="1" value={vals.secretness}
            onChange={e => setVals(v => ({ ...v, secretness: Number(e.target.value) }))}
            className="flex-1 accent-[#F99039] cursor-pointer h-2" />
          <span className="text-[10px] text-[#9A8FAA] flex-shrink-0 w-20 text-right">Echter Geheimtipp</span>
        </div>
        <p className="text-center text-xs font-bold mt-1" style={{ color: '#F99039' }}>
          {vals.secretness}/5
        </p>
      </div>

      {/* Parking */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: '#34254c' }}>
          <i className="fa-solid fa-square-parking mr-1.5" style={{ color: '#71587a' }} />
          Hattest du Parkplatz-Glück?
        </p>
        <div className="flex gap-2">
          {([
            { v: 'yes',     icon: 'fa-circle-check',       label: 'Ja, gefunden',    col: '#2e7d32', bg: '#e8f5e9' },
            { v: 'limited', icon: 'fa-circle-half-stroke',  label: 'Eingeschränkt',   col: '#c97500', bg: '#fff8e1' },
            { v: 'no',      icon: 'fa-circle-xmark',        label: 'Kein Platz',      col: '#c62828', bg: '#ffebee' },
          ] as const).map(({ v, icon, label, col, bg }) => (
            <button key={v} type="button" disabled={saving}
              onClick={() => setVals(prev => ({ ...prev, parking: prev.parking === v ? '' : v }))}
              className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl text-xs font-semibold transition-all hover:brightness-95 active:scale-[0.97] disabled:opacity-50"
              style={{
                background: bg,
                color: col,
                outline: vals.parking === v ? `2px solid ${col}` : 'none',
              }}>
              <i className={`fa-solid ${icon} text-lg`} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Dogs */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: '#34254c' }}>
          <i className="fa-solid fa-dog mr-1.5" style={{ color: '#71587a' }} />
          Sind Hunde erlaubt?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {['Ja, Hunde sind willkommen', 'Leinenpflicht', 'Nein'].map(opt => (
            <button key={opt} type="button" disabled={saving}
              onClick={() => setVals(prev => ({ ...prev, dogs_allowed: prev.dogs_allowed === opt ? '' : opt }))}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all"
              style={{
                background:  vals.dogs_allowed === opt ? '#34254c' : 'white',
                color:       vals.dogs_allowed === opt ? 'white'   : '#71587a',
                borderColor: vals.dogs_allowed === opt ? '#34254c' : '#E4DCF0',
              }}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button type="button" onClick={submit} disabled={saving}
        className="w-full py-3 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
        style={{ background: saving ? '#D1C7DC' : 'var(--color-amber)' }}>
        {saving ? <><i className="fa-solid fa-circle-notch fa-spin mr-1.5" /> Speichern…</> : 'Antworten speichern'}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlaceDetailPage({ id: idProp, embedded, onOpenPlace, onClose }: { id?: string; embedded?: boolean; onOpenPlace?: (id: string) => void; onClose?: () => void } = {}) {
  const { id: routeId } = useParams<{ id: string }>();
  const id = idProp ?? routeId;
  // Im Overlay: Ort→Ort-Links (z.B. ähnliche Orte) im Overlay öffnen statt Seitenwechsel;
  // Zurück schließt das Overlay statt die Route zu wechseln.
  const openPlace = (pid: string) => (onOpenPlace ? onOpenPlace(pid) : navigate(`/ort/${pid}`));
  const goBack = () => (embedded && onClose ? onClose() : navigate(-1));
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { gate } = useRequireAuth();
  const { places, savedIds, visitedIds, toggleSave, markVisited, trips, loadTrips, loadPlaces, funnelAnswers } = useAppStore();

  // State
  const [place, setPlace]              = useState<Place | null>(places.find(p => p.id === id) ?? null);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [qaSearch, setQaSearch]        = useState('');
  const [qaShowAll, setQaShowAll]      = useState(false);
  const [openQaId, setOpenQaId]        = useState<number | null>(null);
  const [qaEntries, setQaEntries]      = useState<QAEntry[]>([]);
  const [answerInput, setAnswerInput]  = useState('');
  const [newQuestion, setNewQuestion]  = useState('');
  const [ratingOpen, setRatingOpen]    = useState(false);
  const [addTripOpen, setAddTripOpen]  = useState(false);
  const [gpsLoading, setGpsLoading]    = useState(false);
  const [toastMsg, setToastMsg]        = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [ratings, setRatings]          = useState<Partial<Record<RatingKey, number>>>({});
  const [ratingComment, setRatingComment] = useState('');
  const [travelTimeInfo, setTravelTimeInfo] = useState<{ drivingDuration: number; distance: number } | null>(null);
  const [travelTimeLoading, setTravelTimeLoading] = useState(false);
  const [mapTransport, setMapTransport] = useState<Transport>(() => funnelAnswers?.transport ?? 'auto');
  const [userCoords, setUserCoords]     = useState<{ lat: number; lng: number } | null>(() => funnelAnswers?.coords ?? null);
  const [transportPickerOpen, setTransportPickerOpen] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ files: File[]; urls: string[] } | null>(null);
  const [pendingCat, setPendingCat]       = useState<PhotoCat>('alle');
  const [pendingCcAccepted, setPendingCcAccepted] = useState(false);
  const [showReviews, setShowReviews]  = useState(false);
  const [claimOpen, setClaimOpen]      = useState(false);
  const [lightboxIdx, setLightboxIdx]  = useState<number | null>(null);
  const [claimSent, setClaimSent]      = useState(false);
  const [suggestOpen, setSuggestOpen]     = useState(false);
  // Review-Prozess
  const [reviewStatus, setReviewStatus]   = useState<{ canReview: boolean; needsReview: boolean; reviewCount: number; snoozed?: boolean; points: number } | null>(null);
  const [reviewPopup, setReviewPopup]     = useState(false);
  const [reviewFlowOpen, setReviewFlowOpen] = useState(false);
  const [suggestCategory, setSuggestCategory] = useState<string | null>(null);
  const [suggestText, setSuggestText]     = useState('');
  const [suggestSent, setSuggestSent]     = useState(false);
  const [suggestPhoto, setSuggestPhoto]   = useState<string | null>(null);
  const [suggestPhotoReason, setSuggestPhotoReason] = useState('');
  const [suggestHours, setSuggestHours]   = useState<{label: string; open: string; close: string}[]>([
    { label: 'Mo – Fr', open: '', close: '' },
    { label: 'Samstag', open: '', close: '' },
    { label: 'Sonntag', open: '', close: '' },
  ]);
  const [claimBizName, setClaimBizName]   = useState('');
  const [claimEmail, setClaimEmail]       = useState('');
  const [claimWebsite, setClaimWebsite]   = useState('');
  const [claimMessage, setClaimMessage]   = useState('');
  const [claimLoading, setClaimLoading]   = useState(false);
  const [ratingFilterStar, setRatingFilterStar] = useState<number | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<{ url: string; cat: PhotoCat }[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [pendingCrops, setPendingCrops] = useState<{ x: number; y: number }[]>([]);
  const [photoCategory, setPhotoCategory] = useState<PhotoCat>('alle');
  const [galleryOffset, setGalleryOffset] = useState(0);       // rolling-window offset
  // Parking contributions
  const [parkingContribs, setParkingContribs]   = useState<ParkingContributions | null>(null);
  const [myParkingAnswer, setMyParkingAnswer]   = useState<'yes' | 'no' | 'limited' | null>(null);
  const [showParkingQ, setShowParkingQ]         = useState(false);
  const [parkingSubmitting, setParkingSubmitting] = useState(false);
  const [visibleGalleryCount, setVisibleGalleryCount] = useState(9); // infinite scroll
  // Photo likes: { url → count } loaded from API; myLikedPhotos persisted in localStorage
  const [photoLikes, setPhotoLikes]       = useState<Record<string, number>>({});
  const [myLikedPhotos, setMyLikedPhotos] = useState<Set<string>>(new Set());

  const galleryScrollRef   = useRef<HTMLDivElement>(null); // kept for future use
  const galleryLoadMoreRef = useRef<HTMLDivElement>(null); // infinite-scroll sentinel
  const fileInputRef     = useRef<HTMLInputElement>(null);

  // ── Memos (before early return — Rules of Hooks) ──────────────────────────

  // All photos: hero first, then gallery (deduped), then uploads. Sorted by likes.
  const allPhotos = useMemo(() => {
    type P = { url: string; cat: PhotoCat; caption?: string; author?: { name: string; avatarUrl: string | null } };
    if (!place) return [] as P[];
    const authorFor = (url: string) =>
      place.photoAuthors?.[url] ?? (place.submitter ? { name: place.submitter.name, avatarUrl: place.submitter.avatarUrl } : undefined);
    const seen = new Set<string>();
    const base = [place.hero, ...place.gallery]
      .filter((x): x is string => Boolean(x))
      .filter(url => { if (seen.has(url)) return false; seen.add(url); return true; })
      .map(url => ({ url, cat: 'alle' as PhotoCat }));
    const all = [...base, ...uploadedPhotos];
    // Sort by likes descending; stable sort preserves hero-first when likes are equal
    return [...all]
      .sort((a, b) => (photoLikes[b.url] ?? 0) - (photoLikes[a.url] ?? 0))
      .map(p => ({ ...p, caption: place.captions?.[p.url], author: authorFor(p.url) }));
  }, [place, uploadedPhotos, photoLikes]);


  // Ähnliche Orte: Score aus gemeinsamen Tags (stark), Merkmalen, Vibe. Kein Treffer → leer → Abschnitt versteckt.
  const similar = useMemo(() => {
    if (!place) return [] as Place[];
    const tagsOf = (p: Place) => (p.tagSlugs?.length ? p.tagSlugs : (p.tagSlug ? [p.tagSlug] : []));
    const attrOf = (p: Place, k: string) => { const a = (p.attributes ?? {}) as Record<string, unknown>; return Array.isArray(a[k]) ? a[k] as string[] : []; };
    const myTags = new Set(tagsOf(place));
    const myMerk = new Set(attrOf(place, 'merkmale'));
    const myVibes = new Set([...attrOf(place, 'vibes'), ...(place.vibe ?? [])]);
    const score = (p: Place) => {
      let s = 0;
      for (const t of tagsOf(p)) if (myTags.has(t)) s += 5;
      for (const m of attrOf(p, 'merkmale')) if (myMerk.has(m)) s += 2;
      for (const v of [...attrOf(p, 'vibes'), ...(p.vibe ?? [])]) if (myVibes.has(v)) s += 1;
      return s;
    };
    return places.filter(p => p.id !== place.id).map(p => ({ p, s: score(p) }))
      .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map(x => x.p);
  }, [places, place]);

  // Im Beschreibungstext verlinkte andere Orte (data-place-id) → kleine Karte darunter
  const linkedInStory = useMemo(() => {
    if (!place?.long) return [] as { id: string; name: string; lat: number; lng: number }[];
    const ids: string[] = [];
    try {
      const doc = new DOMParser().parseFromString(place.long, 'text/html');
      doc.querySelectorAll('a.gt-place[data-place-id]').forEach(a => {
        const pid = a.getAttribute('data-place-id');
        if (pid && !ids.includes(pid)) ids.push(pid);
      });
    } catch { /* kaputtes HTML ignorieren */ }
    return ids
      .map(pid => places.find(p => p.id === pid))
      .filter((p): p is Place => !!p && p.id !== place.id && p.lat != null && p.lng != null)
      .map(p => ({ id: p.id, name: p.name, lat: p.lat as number, lng: p.lng as number }));
  }, [place?.long, place?.id, places]);

  const filteredQa = useMemo(() => {
    const q = qaSearch.trim().toLowerCase();
    if (!q) return qaEntries;
    return qaEntries.filter(e => e.question.toLowerCase().includes(q) || e.answers.some(a => a.text.toLowerCase().includes(q)));
  }, [qaEntries, qaSearch]);

  const visibleQa = qaShowAll || qaSearch ? filteredQa : filteredQa.slice(0, 3);

  // Only show seed reviews for demo places that actually have ratings (reviews > 0).
  // User-submitted places start with 0 reviews and should show an empty state.
  const displayReviews = place && place.reviews > 0 ? SEED_REVIEWS : ([] as Review[]);

  const reviewStats = useMemo(() => {
    const total = displayReviews.length;
    if (total === 0) return { total: 0, byStars: [], catAvgs: {}, overallAvg: 0 };
    const byStars = [5,4,3,2,1].map(s => ({
      stars: s,
      count: displayReviews.filter(r => r.rating === s).length,
      pct: Math.round(displayReviews.filter(r => r.rating === s).length / total * 100),
    }));
    const catAvgs: Partial<Record<RatingKey, number>> = {};
    for (const c of RATING_CRITERIA) {
      const vals = displayReviews.map(r => r.categories[c.key] ?? 0).filter(v => v > 0);
      catAvgs[c.key] = vals.length ? Math.round(vals.reduce((a,b) => a+b,0) / vals.length * 10) / 10 : 0;
    }
    return { total, byStars, catAvgs, overallAvg: Math.round(displayReviews.reduce((s,r) => s+r.rating,0)/total*10)/10 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayReviews.length]);

  const filteredReviews = ratingFilterStar ? displayReviews.filter(r => r.rating === ratingFilterStar) : displayReviews;

  // Visible photos in the bottom category filter
  const visibleFilterPhotos = photoCategory === 'alle' ? allPhotos : allPhotos.filter(p => p.cat === photoCategory);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    // Sofort aus dem Store anzeigen (Marker-/Such-Wechsel snappy), dann frische Daten nachladen
    if (id) {
      const cached = places.find(p => p.id === id);
      if (cached) setPlace(cached);
      placesApi.get(id).then(setPlace).catch(() => {});
      // Review-Prozess: braucht der Ort ein Review + darf ich? → Pop-up.
      // Wenn schon vertagt (liegt im Postfach), nur über den Postfach-Link (?review=1) erneut anzeigen –
      // sonst nicht ungefragt am Ort nachhaken (kein Spam).
      const forceReview = new URLSearchParams(window.location.search).get('review') === '1';
      placesApi.reviewStatus(id).then(rs => {
        setReviewStatus(rs);
        if (rs.canReview && rs.needsReview && (!rs.snoozed || forceReview)) setReviewPopup(true);
      }).catch(() => setReviewStatus(null));
    }
    loadTrips();
    loadPlaces();   // andere Orte für die Karten-Marker / Suche (im Store 30s gecacht)
  }, [id]); // eslint-disable-line

  // Seitentitel bei SPA-Navigation mitziehen (beim ersten Laden setzt ihn der Server samt OG-Tags)
  useEffect(() => {
    if (!place || embedded) return;
    const prev = document.title;
    document.title = `${place.name}${place.region ? ` – ${place.region}` : ''} · Geheimtrips.de`;
    return () => { document.title = prev; };
  }, [place?.id, place?.name, place?.region, embedded]); // eslint-disable-line

  // Echte Community-Fragen vom Backend laden (keine Dummy-Fragen mehr)
  async function loadQuestions(pid: string) {
    try { setQaEntries((await placesApi.questions(pid)).map(toQaEntry)); }
    catch { setQaEntries([]); }
  }
  useEffect(() => {
    if (place?.id) loadQuestions(place.id);
  }, [place?.id]); // eslint-disable-line

  useEffect(() => {
    if (id) placesApi.contributions(id).then(setParkingContribs).catch(() => {});
  }, [id]); // eslint-disable-line

  // Initialize photo likes from API response when place loads
  useEffect(() => {
    if (place?.photoLikes) setPhotoLikes(place.photoLikes);
  }, [place?.id]); // eslint-disable-line

  // Initialize my liked photos from localStorage
  useEffect(() => {
    if (!place?.id) return;
    try {
      const stored = localStorage.getItem(`gt_photo_likes_${place.id}`);
      setMyLikedPhotos(stored ? new Set(JSON.parse(stored) as string[]) : new Set());
    } catch { setMyLikedPhotos(new Set()); }
  }, [place?.id]); // eslint-disable-line

  // Silent geolocation — try once on mount so travel time works without the funnel
  useEffect(() => {
    if (userCoords) return;
    navigator.geolocation?.getCurrentPosition(
      p => setUserCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, []); // eslint-disable-line

  // Sync funnel coords / transport into local state when available
  useEffect(() => {
    if (funnelAnswers?.coords) setUserCoords(c => c ?? funnelAnswers!.coords!);
    if (funnelAnswers?.transport) setMapTransport(funnelAnswers.transport);
  }, [funnelAnswers?.coords?.lat, funnelAnswers?.transport]); // eslint-disable-line

  // OSRM travel time — always fetch driving profile (road distance is most accurate).
  // Duration for non-driving modes is derived client-side from distance ÷ speed.
  // Re-fetches only when place or start coords change, NOT on transport mode change.
  useEffect(() => {
    if (!place?.lat || !place?.lng || !userCoords) return;
    setTravelTimeInfo(null);
    setTravelTimeLoading(true);
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${userCoords.lng},${userCoords.lat};${place.lng},${place.lat}?overview=false`,
    )
      .then(r => r.json())
      .then(d => { const rt = d.routes?.[0]; if (rt) setTravelTimeInfo({ drivingDuration: rt.duration, distance: rt.distance }); })
      .catch(() => {})
      .finally(() => setTravelTimeLoading(false));
  }, [place?.id, userCoords]); // eslint-disable-line


  // Auto-advance gallery header every 4 s (only when >5 photos available)
  useEffect(() => {
    if (allPhotos.length <= 5) return;
    const t = setInterval(() => setGalleryOffset(p => (p + 1) % allPhotos.length), 4000);
    return () => clearInterval(t);
  }, [allPhotos.length]);

  // Infinite scroll for the Bildergalerie grid
  useEffect(() => {
    const el = galleryLoadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleGalleryCount(p => p + 9);
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleFilterPhotos.length]);

  // ── Mobiles Bottom-Sheet über der Vollbildkarte ────────────────────────────
  const isMobile = useIsMobile(1024);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetDrag = useRef<{ startOffset: number; startY: number; lastY: number; lastT: number; v: number; moved: number } | null>(null);
  const collapsedOffset = () => Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.56);
  // ── Reichweiten-Filter für die Karte (Standort + Verkehrsmittel + Reisezeit, wie auf der Startseite) ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCenter, setSearchCenter] = useState<Coords | null>(null);
  const [searchLabel, setSearchLabel] = useState<string | null>(null);
  const [geoSug, setGeoSug] = useState<GeoLocation[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [radiusKm, setRadiusKm] = useState(80);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Zentrum: eingetippte Adresse überschreibt den GPS-Standort
  const reachCenter = searchCenter ?? userCoords;
  const reach = useTravelReach(reachCenter);
  const travel = { mode: reach.travelMode, minutes: reach.travelMinutes, iso: reach.iso, loading: reach.isoLoading };
  // Andere Orte als orange Marker — nach Reichweite gefiltert (ohne Zentrum: die 60 nächsten zum aktuellen Ort)
  const mapPlaces = useMemo(() => {
    if (!place) return [] as Place[];
    const others = places.filter(p => p.id !== place.id && p.lat != null && p.lng != null);
    if (!reachCenter) {
      if (place.lat == null || place.lng == null) return others.slice(0, 60);
      const cLat = place.lat, cLng = place.lng;
      return others
        .map(p => ({ p, d: haversineKm(cLat, cLng, p.lat as number, p.lng as number) }))
        .sort((a, b) => a.d - b.d).slice(0, 60).map(x => x.p);
    }
    const within = (lat: number, lng: number) =>
      reach.travelMode === 'radius' ? distanceKm(reachCenter, { lat, lng }) <= radiusKm
      : reach.iso                   ? pointInGeoJSON(lat, lng, reach.iso.feature.geometry)
      : distanceKm(reachCenter, { lat, lng }) <= (EFFECTIVE_SPEED_KMH[reach.travelMode as Transport] * reach.travelMinutes) / 60;
    return others.filter(p => within(p.lat as number, p.lng as number));
  }, [places, place?.id, place?.lat, place?.lng, reachCenter, reach.travelMode, reach.travelMinutes, reach.iso, radiusKm]); // eslint-disable-line
  // Adress-Vorschläge (debounced) fürs Standort-Suchfeld
  function onSearchInput(val: string) {
    setSearchQuery(val);
    setShowSug(false);
    if (geoTimer.current) clearTimeout(geoTimer.current);
    if (val.trim().length >= 3) {
      geoTimer.current = setTimeout(async () => {
        const sug = await geocodeSuggestions(val).catch(() => []);
        setGeoSug(sug);
        setShowSug(sug.length > 0);
      }, 400);
    } else {
      setGeoSug([]);
    }
  }
  function pickCenter(s: GeoLocation) {
    setSearchCenter(s.coords);
    setSearchLabel(s.displayName);
    setSearchQuery('');
    setGeoSug([]);
    setShowSug(false);
  }
  function resetToGps() {
    setSearchCenter(null);
    setSearchLabel(null);
    setSearchQuery('');
    setGeoSug([]);
    setShowSug(false);
  }
  // Sheet-Position bei Statuswechsel / Resize aktuell halten (nicht während des Ziehens)
  useEffect(() => {
    if (sheetDragging) return;
    const apply = () => setSheetDragY(sheetCollapsed ? collapsedOffset() : 0);
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [sheetCollapsed, sheetDragging]);
  // Bei Ortswechsel (Marker/Suche) den Sheet-Inhalt nach oben scrollen
  useEffect(() => { sheetScrollRef.current?.scrollTo(0, 0); }, [place?.id]);

  // ── Early return ──────────────────────────────────────────────────────────

  if (!place) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ color: 'var(--color-lavender)' }}>
        <i className="fa-solid fa-circle-notch fa-spin text-2xl" />
      </div>
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  // Rolling-window helper: returns photo at visual slot i.
  // When ≤5 photos, gallery is static (galleryOffset stays 0).
  const galleryAt = (i: number) =>
    allPhotos.length > 5
      ? allPhotos[(galleryOffset + i) % allPhotos.length]
      : (allPhotos[i] ?? null);

  const isSaved      = savedIds.has(place.id);
  const isVisited    = visitedIds.has(place.id);
  // Bearbeiten erlaubt: Ersteller:in solange ungeprüft – oder Admin
  const isOwnerPending = place.isUserSubmitted && !!user && user.id === place.submittedBy;
  // Fragen beantworten darf die/der Ersteller:in (auch nach Freigabe) sowie Admins
  const canAnswer      = (!!user && user.id === place.submittedBy) || !!user?.isAdmin;
  const canEditPlace   = isOwnerPending || (!!user?.isAdmin && place.isUserSubmitted);
  const isLongStory  = place.long.length > 280;
  const transport    = funnelAnswers?.transport ?? null;
  const attrs        = place.attributes as Record<string, unknown>;
  const answers      = (attrs.answers ?? {}) as Record<string, unknown>;
  const website      = typeof answers.website === 'string'       ? answers.website
                       : typeof attrs.website === 'string'       ? attrs.website      : null;
  const openingHours = typeof answers.opening_hours_text === 'string' ? answers.opening_hours_text
                       : typeof attrs.openingHours === 'string'  ? attrs.openingHours : null;
  // Link zu Öffnungszeiten: Business-Angabe vor Community-Antwort
  const hoursUrl      = typeof attrs.hoursUrl === 'string' ? attrs.hoursUrl
                       : typeof answers.opening_hours_url === 'string' ? answers.opening_hours_url : null;
  const hoursSchedule = Array.isArray(attrs.hoursSchedule)        ? attrs.hoursSchedule as HourSlot[] : null;
  const videoUrl      = typeof attrs.videoUrl === 'string'        ? attrs.videoUrl      : null;

  // Wochentags-Öffnungszeiten aus dem Einreichformular (Community)
  const weekHoursRaw = answers.opening_hours_week as Record<string, string> | undefined;
  const weekHours: Record<string, string> | null =
    weekHoursRaw && typeof weekHoursRaw === 'object' && !Array.isArray(weekHoursRaw)
      ? Object.fromEntries(Object.entries(weekHoursRaw).filter(([, v]) => typeof v === 'string' && v.trim() !== ''))
      : null;
  const hasWeekHours = !!weekHours && Object.keys(weekHours).length > 0;

  // Eintrittspreise: Business-Angaben vor Community-Antworten (Erwachsene/Kinder/…)
  const communityPricesRaw = answers.entrance_prices as Record<string, string> | undefined;
  const communityPrices: PriceEntry[] =
    communityPricesRaw && typeof communityPricesRaw === 'object' && !Array.isArray(communityPricesRaw)
      ? ([['adult', 'Erwachsene'], ['child', 'Kinder'], ['reduced', 'Ermäßigte'], ['senior', 'Senioren']] as const)
          .filter(([key]) => typeof communityPricesRaw[key] === 'string' && communityPricesRaw[key].trim() !== '')
          .map(([key, label]) => ({ label, amount: communityPricesRaw[key].trim() }))
      : [];
  const prices        = Array.isArray(attrs.prices) && (attrs.prices as PriceEntry[]).length > 0
                          ? attrs.prices as PriceEntry[]
                          : communityPrices.length > 0 ? communityPrices : null;
  const pricesUrl     = typeof attrs.pricesUrl === 'string' ? attrs.pricesUrl
                       : typeof answers.entrance_fee_url === 'string' ? answers.entrance_fee_url : null;
  const specialInfo   = Array.isArray(attrs.specialInfo)          ? attrs.specialInfo as string[] : null;
  const isOfficiallyManaged = place.isOfficiallyManaged ?? false;
  // Merkmale & Vibe für „Auf einen Blick" (neues Modell; Vibe fällt auf altes vibeJson zurück)
  const merkmaleList = Array.isArray(attrs.merkmale) ? attrs.merkmale as string[] : [];
  const vibeList = Array.isArray(attrs.vibes) && (attrs.vibes as string[]).length ? attrs.vibes as string[] : (place.vibe ?? []);

  // Entrance fee from UNIVERSAL_QUESTIONS answers
  const entranceFee       = typeof answers.entrance_fee === 'string'        ? answers.entrance_fee        : null;
  const entranceFeeAmount = typeof answers.entrance_fee_amount === 'string' ? answers.entrance_fee_amount : null;

  // "Das Besondere" (highlight): Rich-Text-Feld → HTML zu sauberem Klartext strippen;
  // verfälschte Datensätze (Formular-Markup) werden ausgeblendet.
  const stripHtml = (s: string) => s
    .replace(/<\/(div|p|br|li)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // „Das Besondere" speist sich jetzt aus der Kurz-Besonderheit (Schritt 3 / place.short);
  // Fallback auf die alte highlight-Antwort für ältere Datensätze.
  const legacyHighlight = typeof answers.highlight === 'string' ? stripHtml(answers.highlight) : '';
  const highlight = (place.short ?? '').trim()
    || ((legacyHighlight.length > 1 && !/Was macht diesen Ort/i.test(legacyHighlight)) ? legacyHighlight : '');
  const triviaType = typeof answers.trivia_type === 'string' ? answers.trivia_type : '';
  const triviaText = typeof answers.trivia_text === 'string' ? stripHtml(answers.trivia_text) : '';

  // Derive parking display from submission-form answer (UNIVERSAL_QUESTIONS parking answer)
  // or fall back to the community-editable place.parking column
  const answersParking = typeof answers.parking === 'string' ? answers.parking : null;
  const derivedParking: 'free' | 'paid' | 'limited' | null =
    answersParking?.startsWith('Kostenloser')  ? 'free' :
    answersParking?.startsWith('Kostenpflichtig') ? 'paid' :
    answersParking?.startsWith('Begrenzte')    ? 'limited' :
    answersParking?.startsWith('Kein Parkplatz') ? 'limited' :
    place.parking ?? null;

  const navUrl = place.lat && place.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=${toGoogleTravelMode(mapTransport)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.name)}`;
  const appleMapsUrl = place.lat && place.lng
    ? `https://maps.apple.com/?daddr=${place.lat},${place.lng}&dirflg=${toAppleTravelMode(transport)}&q=${encodeURIComponent(place.name)}`
    : `https://maps.apple.com/?q=${encodeURIComponent(place.name)}`;

  // Abschnitte für den geführten Review-Durchlauf (nur Abschnitte mit Inhalt)
  const parkingLabel = derivedParking === 'free' ? 'Kostenlos' : derivedParking === 'paid' ? 'Kostenpflichtig' : derivedParking === 'limited' ? 'Begrenzt' : '';
  const reviewSections: ReviewSection[] = [
    { key: 'Name',           label: 'Name des Orts',   value: place.name },
    { key: 'Das Besondere',  label: 'Das Besondere',   value: highlight },
    { key: 'Beschreibung',   label: 'Beschreibung',    value: place.long ? stripHtml(place.long) : '' },
    { key: 'Tipps',          label: 'Tipps',           value: place.tips.map(t => stripHtml(t)).join(' · ') },
    { key: 'Öffnungszeiten', label: 'Öffnungszeiten',  value: openingHours ?? '' },
    { key: 'Preise',         label: 'Preise',          value: (prices ?? []).map(p => `${p.label}: ${p.amount}`).join(', ') },
    { key: 'Parken',         label: 'Parken',          value: parkingLabel },
  ].filter(s => s.value && s.value.trim());

  // ── Handlers ──────────────────────────────────────────────────────────────

  function showToast(msg: string) { setToastMsg(msg); setToastVisible(true); }

  // ── Bottom-Sheet: Ziehen am Griff ──────────────────────────────────────────
  function onSheetTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    sheetDrag.current = { startOffset: sheetDragY, startY: t.clientY, lastY: t.clientY, lastT: Date.now(), v: 0, moved: 0 };
    setSheetDragging(true);
  }
  function onSheetTouchMove(e: React.TouchEvent) {
    const d = sheetDrag.current; if (!d) return;
    const t = e.touches[0];
    const now = Date.now();
    if (now > d.lastT) d.v = (t.clientY - d.lastY) / (now - d.lastT);
    d.lastY = t.clientY; d.lastT = now;
    const delta = t.clientY - d.startY;
    d.moved = Math.max(d.moved, Math.abs(delta));
    const max = collapsedOffset();
    let next = d.startOffset + delta;
    if (next < 0) next = next / 3;                 // Gummiband nach oben
    else if (next > max) next = max + (next - max) / 3;
    setSheetDragY(next);
  }
  function onSheetTouchEnd() {
    const d = sheetDrag.current;
    setSheetDragging(false);
    if (!d) return;
    if (d.moved < 6) { setSheetCollapsed(c => !c); return; }   // Tipp = umschalten
    const max = collapsedOffset();
    let collapse: boolean;
    if (d.v > 0.45) collapse = true;
    else if (d.v < -0.45) collapse = false;
    else collapse = sheetDragY > max * 0.4;
    setSheetCollapsed(collapse);
  }

  async function handleLikePhoto(photoUrl: string) {
    if (!user) { showToast('Bitte einloggen, um Fotos zu liken.'); return; }
    if (!place) return;
    try {
      const res = await placesApi.likePhoto(place.id, photoUrl);
      setPhotoLikes(prev => ({ ...prev, [photoUrl]: res.count }));
      setMyLikedPhotos(prev => {
        const next = new Set(prev);
        if (res.liked) next.add(photoUrl); else next.delete(photoUrl);
        try { localStorage.setItem(`gt_photo_likes_${place.id}`, JSON.stringify(Array.from(next))); } catch {}
        return next;
      });
    } catch { showToast('Fehler beim Liken des Fotos.'); }
  }

async function handleVerifyToggle() {
    if (!gate(undefined, 'Melde dich an, um „Ich war hier" zu markieren.')) return;
    if (isVisited) { setRatingOpen(true); return; }
    if (!place) return;
    setGpsLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }),
      );
      if (place.lat && place.lng) {
        const dLat = (pos.coords.latitude  - place.lat) * (Math.PI / 180);
        const dLng = (pos.coords.longitude - place.lng) * (Math.PI / 180);
        const a = Math.sin(dLat/2)**2 + Math.cos(place.lat*(Math.PI/180))*Math.cos(pos.coords.latitude*(Math.PI/180))*Math.sin(dLng/2)**2;
        if (6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) > 0.5) {
          showToast('Du bist zu weit entfernt — besuche den Ort, um ihn zu verifizieren.');
          return;
        }
      }
      await markVisited(place.id);
      showToast('✓ Besuch verifiziert! +15 Punkte');
      setRatingOpen(true);
      if (user) setShowParkingQ(true);
    } catch { showToast('GPS nicht verfügbar. Bitte erlaube den Standortzugriff.'); }
    finally { setGpsLoading(false); }
  }

  function handleRatingSubmit() {
    setRatingOpen(false);
    showToast('Bewertung gespeichert! +10 Punkte');
    setRatings({}); setRatingComment('');
  }

  async function handleAskQuestion() {
    const q = newQuestion.trim();
    if (!q || !place) return;
    if (!gate(undefined, 'Melde dich an, um eine Frage zu diesem Ort zu stellen.')) return;
    setNewQuestion(''); setQaShowAll(true);
    try {
      await placesApi.askQuestion(place.id, q);
      await loadQuestions(place.id);
      showToast('Frage gestellt! Die/der Ersteller:in wird benachrichtigt.');
    } catch (e) {
      showToast((e as Error).message || 'Frage konnte nicht gesendet werden.');
    }
  }

  async function handleAnswerQuestion(qid: number, answer: string) {
    if (!place || !answer.trim()) return;
    try {
      await placesApi.answerQuestion(place.id, qid, answer.trim());
      await loadQuestions(place.id);
      showToast('Antwort gespeichert!');
    } catch (e) {
      showToast((e as Error).message || 'Antwort konnte nicht gespeichert werden.');
    }
  }

  async function handleDeleteQuestion(qid: number) {
    if (!place) return;
    try {
      await placesApi.deleteQuestion(place.id, qid);
      await loadQuestions(place.id);
      showToast('Frage gelöscht.');
    } catch (e) {
      showToast((e as Error).message || 'Frage konnte nicht gelöscht werden.');
    }
  }

  async function handleParkingContribute(value: 'yes' | 'no' | 'limited') {
    if (!place || !user) return;
    setParkingSubmitting(true);
    try {
      await placesApi.contribute(place.id, 'parking', value);
      setMyParkingAnswer(value);
      setShowParkingQ(false);
      // refresh aggregate
      const updated = await placesApi.contributions(place.id);
      setParkingContribs(updated);
      showToast('Danke für deinen Beitrag!');
    } catch { showToast('Beitrag konnte nicht gespeichert werden.'); }
    finally { setParkingSubmitting(false); }
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const urls = files.map(f => URL.createObjectURL(f));
    setPendingUpload({ files, urls });
    setPendingCrops(files.map(() => ({ x: 0.5, y: 0.5 })));
    setPendingCat('alle');
    setPendingCcAccepted(false);
    e.target.value = '';
  }

  async function handleConfirmUpload() {
    if (!pendingUpload || !pendingCcAccepted || !place || uploadBusy) return;
    setUploadBusy(true);
    let ok = 0;
    let autoVisited = false;
    try {
      // 1) Datei zum Server hochladen (HEIC wird dort zu JPEG), 2) am Ort persistieren
      for (let i = 0; i < pendingUpload.files.length; i++) {
        const file = pendingUpload.files[i];
        try {
          // Standortdaten aus den Foto-EXIF lesen — Foto nah am Ort ⇒ automatisch „besucht"
          let lat: number | null = null, lng: number | null = null;
          if (file.type.startsWith('image/')) {
            try {
              const g = await exifr.gps(file);
              if (g && typeof g.latitude === 'number' && typeof g.longitude === 'number') { lat = g.latitude; lng = g.longitude; }
            } catch { /* keine EXIF-GPS */ }
          }
          const { url } = await mediaApi.upload(file);
          const type = file.type.startsWith('video/') ? 'video' : 'photo';
          const c = pendingCrops[i] ?? { x: 0.5, y: 0.5 };
          const res = await placesApi.addMedia(place.id, { url, type, cropX: c.x, cropY: c.y, lat, lng });
          if (res.visited) autoVisited = true;
          ok++;
        } catch { /* einzelne Datei übersprungen */ }
      }
      // 3) Ort frisch laden → die persistierten Medien erscheinen dauerhaft in der Galerie
      const fresh = await placesApi.get(place.id).catch(() => null);
      if (fresh) setPlace(fresh);
      // Foto mit passenden Standortdaten hat den Ort als besucht markiert
      if (autoVisited && !isVisited) await markVisited(place.id).catch(() => {});
      showToast(autoVisited
        ? `${ok} Foto${ok > 1 ? 's' : ''} hinzugefügt — als besucht markiert ✓`
        : ok > 0 ? `${ok} Datei${ok > 1 ? 'en' : ''} hinzugefügt!` : 'Upload fehlgeschlagen.');
    } finally {
      setUploadBusy(false);
      setPendingUpload(null);
    }
  }

  const ratingComplete = RATING_CRITERIA.every(c => (ratings[c.key] ?? 0) > 0);

  // Gallery height (CSS value)
  const GALLERY_H = 'clamp(260px, 46vh, 480px)';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AppShell noHeader bare={embedded}>

      {/* ══ Mobil: Vollbildkarte im Hintergrund ══════════════════════════════ */}
      {isMobile && place.lat && place.lng && (
        <div className="fixed inset-0 z-0" style={{ background: '#e8e4ee' }}>
          {embedded ? (
            // Im Karten-Overlay läuft schon eine Leaflet-Karte → hier keine zweite (Performance).
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-8 text-center"
              style={{ background: 'radial-gradient(circle at 50% 40%, #f1ecf4, #e2dcec)' }}>
              <i className="fa-solid fa-location-dot text-4xl text-[var(--color-amber)]" />
              <p className="text-sm font-semibold text-[var(--color-aubergine)]">{place.region}</p>
              <a href={navUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-xs font-bold text-[var(--color-amber)]">
                <i className="fa-solid fa-diamond-turn-right mr-1" />Route öffnen
              </a>
            </div>
          ) : (
            <MapContainer center={[place.lat, place.lng]} zoom={14}
              scrollWheelZoom zoomControl={false} attributionControl={false}
              style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {/* Reichweite: Isochrone / Radius-Kreis + Standort-Zentrum */}
              <ReachLayer center={reachCenter} travel={travel} radiusKm={radiusKm} />
              {/* Bei Radius-/Verkehrsmittel-Änderung auf die Reichweite einpassen (Radius wird sichtbar) */}
              <FitReachOnChange center={reachCenter} travel={travel} radiusKm={radiusKm} place={[place.lat, place.lng]} />
              {/* Andere Orte (orange) — Klick wechselt das Sheet auf diesen Ort */}
              {mapPlaces.map(p => (
                <Marker key={p.id} position={[p.lat as number, p.lng as number]} icon={brandMarker}
                  eventHandlers={{ click: () => navigate(`/ort/${p.id}`) }} />
              ))}
              {/* Aktueller Ort (lila) zuletzt → liegt über den anderen */}
              <Marker position={[place.lat, place.lng]} icon={currentMarker} />
              <MapRecenter lat={place.lat} lng={place.lng} />
            </MapContainer>
          )}
        </div>
      )}

      {/* ══ Karten-Header (nur eingeklappt): Standort + Verkehrsmittel + Reisezeit (wie Startseite) ══ */}
      {isMobile && sheetCollapsed && (
        <div className="fixed top-0 left-0 right-0 z-20 px-3 pt-3 pb-5 flex flex-col gap-2"
          style={{ background: 'linear-gradient(to bottom, rgba(232,228,238,0.97) 62%, rgba(232,228,238,0))' }}>

          {/* Zeile 1: Zurück + Standort-Suche (Adresse → Suchzentrum) */}
          <div className="flex items-start gap-2">
            <button onClick={goBack} aria-label="Zurück"
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0"
              style={{ boxShadow: '0 2px 10px rgba(52,37,76,0.18)' }}>
              <i className="fa-solid fa-arrow-left text-[var(--color-aubergine)]" />
            </button>
            <div className="flex-1 relative">
              <div className="flex items-center gap-2 bg-white rounded-full px-4 h-10"
                style={{ boxShadow: '0 2px 10px rgba(52,37,76,0.18)' }}>
                <i className="fa-solid fa-location-dot text-[var(--color-amber)] text-sm" />
                <input value={searchQuery} onChange={e => onSearchInput(e.target.value)}
                  onFocus={() => geoSug.length > 0 && setShowSug(true)}
                  onBlur={() => setTimeout(() => setShowSug(false), 150)}
                  placeholder={searchLabel ?? 'Stadt oder Adresse…'}
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)]" />
                {(searchQuery || searchCenter) && (
                  <button onClick={resetToGps} aria-label="Zurücksetzen">
                    <i className="fa-solid fa-xmark text-[var(--color-lavender)] text-sm" />
                  </button>
                )}
              </div>
              {/* Adress-Vorschläge (Geocoding) */}
              {showSug && geoSug.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl overflow-hidden z-10"
                  style={{ boxShadow: '0 12px 32px rgba(52,37,76,0.22)' }}>
                  {geoSug.map((s, i) => (
                    <button key={i} onMouseDown={() => pickCenter(s)}
                      className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-bg-soft)] transition-colors border-b last:border-b-0"
                      style={{ borderColor: '#F1ECF4' }}>
                      <i className="fa-solid fa-location-dot text-[var(--color-amber)] mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-aubergine)] truncate">{s.displayName}</p>
                        <p className="text-xs text-[var(--color-lavender)] truncate">{s.fullAddress}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Zeile 2: aktives Zentrum + Reichweiten-Regler (Verkehrsmittel + Reisezeit/Radius) */}
          <div className="bg-white/95 rounded-2xl px-2.5 py-2 flex flex-col gap-2"
            style={{ boxShadow: '0 2px 10px rgba(52,37,76,0.14)' }}>
            <div className="flex items-center gap-1.5 text-[11px] px-1" style={{ color: '#71587a' }}>
              <i className="fa-solid fa-location-crosshairs text-[var(--color-amber)]" />
              <span className="truncate flex-1">
                {searchLabel ?? (userCoords ? 'Mein Standort' : 'Kein Standort — tippe eine Adresse ein')}
              </span>
              <span className="font-semibold text-[var(--color-aubergine)] flex-shrink-0">{mapPlaces.length} Orte</span>
              {searchCenter && (
                <button onClick={resetToGps} className="flex items-center gap-1 font-semibold flex-shrink-0" style={{ color: '#7c3aed' }}>
                  <i className="fa-solid fa-location-arrow" /> GPS
                </button>
              )}
            </div>
            <ReachControls
              travelMode={reach.travelMode} setTravelMode={reach.setTravelMode}
              travelMinutes={reach.travelMinutes} setTravelMinutes={reach.setTravelMinutes}
              radiusKm={radiusKm} setRadiusKm={setRadiusKm}
              iso={reach.iso} isoLoading={reach.isoLoading}
            />
          </div>
        </div>
      )}

      {/* ══ Detailseite: mobil ziehbares Bottom-Sheet, ab lg normaler Fluss ══ */}
      <div
        className={isMobile
          ? 'fixed inset-x-0 z-40 flex flex-col overflow-hidden rounded-t-[1.75rem] shadow-[0_-10px_44px_rgba(52,37,76,0.22)]'
          : 'contents'}
        style={isMobile ? {
          top: '6vh', bottom: 0, background: '#FBF9FC',
          transform: `translateY(${sheetDragY}px)`,
          transition: sheetDragging ? 'none' : 'transform .34s cubic-bezier(.32,.72,0,1)',
        } : undefined}
      >
        {/* ── Sheet-Kopf: Griff + Karten-Infozeile (nur mobil) ──────────────── */}
        {isMobile && (
          <div className="flex-shrink-0">
            {/* Zieh-Griff — antippen schaltet auf/zu, ziehen bewegt das Sheet */}
            <div onTouchStart={onSheetTouchStart} onTouchMove={onSheetTouchMove} onTouchEnd={onSheetTouchEnd}
              className="flex justify-center pt-2.5 pb-2 cursor-grab active:cursor-grabbing"
              style={{ touchAction: 'none' }}>
              <div className="w-10 h-1.5 rounded-full" style={{ background: '#d9cfe2' }} />
            </div>
            {/* Karten-Infozeile: Verkehrsmittel · Reisezeit · Maps/Route — nur ausgeklappt */}
            {!sheetCollapsed && place.lat && place.lng && (
              <div className="px-4 pb-2.5 flex items-center gap-2">
                <div className="relative flex-shrink-0">
                  <button onClick={() => setTransportPickerOpen(v => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all hover:brightness-95"
                    style={{ background: '#F1ECF4', color: '#34254c' }}>
                    <i className={`fa-solid ${transportIcon(mapTransport)}`} style={{ color: '#F99039' }} />
                    <i className="fa-solid fa-chevron-down text-[8px]" style={{ color: '#b9a8c4' }} />
                  </button>
                  {transportPickerOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setTransportPickerOpen(false)} />
                      <div className="absolute left-0 top-full mt-1.5 z-30 rounded-2xl p-1.5 flex flex-col gap-0.5"
                        style={{ background: 'white', boxShadow: '0 8px 24px rgba(52,37,76,0.18)', minWidth: 160 }}>
                        {([
                          { id: 'walk'    as Transport, label: 'Zu Fuß',     icon: 'fa-person-walking' },
                          { id: 'bike'    as Transport, label: 'Fahrrad',    icon: 'fa-bicycle'        },
                          { id: 'transit' as Transport, label: 'ÖPNV / Zug', icon: 'fa-train-subway'  },
                          { id: 'auto'    as Transport, label: 'Auto',       icon: 'fa-car'            },
                        ]).map(opt => (
                          <button key={opt.id}
                            onClick={() => { setMapTransport(opt.id); setTransportPickerOpen(false); }}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left hover:bg-[var(--color-bg-soft)]"
                            style={{ color: mapTransport === opt.id ? '#34254c' : '#71587a', background: mapTransport === opt.id ? '#F1ECF4' : 'transparent' }}>
                            <i className={`fa-solid ${opt.icon} w-4 text-center`}
                              style={{ color: mapTransport === opt.id ? '#F99039' : '#b9a8c4' }} />
                            {opt.label}
                            {mapTransport === opt.id && <i className="fa-solid fa-check ml-auto text-[10px]" style={{ color: '#F99039' }} />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs min-w-0 flex-1" style={{ color: '#71587a' }}>
                  {travelTimeLoading ? (
                    <><i className="fa-solid fa-circle-notch fa-spin text-[10px]" style={{ color: '#b9a8c4' }} /><span style={{ color: '#b9a8c4' }}>Reisezeit…</span></>
                  ) : travelTimeInfo ? (
                    <>
                      <strong style={{ color: '#34254c' }}>~{formatDuration(computeDisplayDuration(travelTimeInfo.distance, travelTimeInfo.drivingDuration, mapTransport))}</strong>
                      <span style={{ color: '#b9a8c4' }}>·</span>
                      <span>{formatDistance(travelTimeInfo.distance)}</span>
                    </>
                  ) : !userCoords ? (
                    <span style={{ color: '#b9a8c4' }}>Standort aus</span>
                  ) : null}
                </div>
                <a href={navUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 h-9 rounded-xl flex-shrink-0 font-semibold text-xs transition-all hover:brightness-110"
                  style={{ background: 'var(--color-amber)', color: 'white' }}>
                  <i className="fa-solid fa-diamond-turn-right" /> Route
                </a>
              </div>
            )}

            {/* Eingeklappte Vorschau: Bild auf sichtbare Höhe eingepasst + Name + Bewertung */}
            {sheetCollapsed && (
              <div className="px-4 pb-3 pt-0.5">
                <button onClick={() => setSheetCollapsed(false)}
                  className="block w-full rounded-2xl overflow-hidden mb-2" style={{ height: '20vh' }}>
                  <img src={place.hero} alt={place.name} className="w-full h-full object-cover" />
                </button>
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setSheetCollapsed(false)} className="min-w-0 text-left flex-1">
                    <h2 className="font-display font-bold text-[var(--color-aubergine)] text-lg leading-tight truncate">{place.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      {place.reviews > 0 && (
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <i className="fa-solid fa-star text-[var(--color-amber)] text-xs" />
                          <span className="text-sm font-bold text-[var(--color-aubergine)]">{place.rating}</span>
                          <span className="text-xs text-[var(--color-lavender)]">({place.reviews})</span>
                        </span>
                      )}
                      <span className="text-xs text-[var(--color-lavender)] truncate">{place.region}</span>
                    </div>
                  </button>
                  {place.lat && place.lng && (
                    <a href={navUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 h-9 rounded-xl flex-shrink-0 font-semibold text-xs"
                      style={{ background: 'var(--color-amber)', color: 'white' }}>
                      <i className="fa-solid fa-diamond-turn-right" /> Route
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scrollbarer Sheet-Inhalt — eingeklappt ausgeblendet (dann zählt nur die Vorschau) */}
        <div ref={sheetScrollRef} className={isMobile ? (sheetCollapsed ? 'hidden' : 'flex-1 overflow-y-auto overscroll-contain') : 'contents'}>

      {/* „In Prüfung"-Banner — nur bei noch nicht freigegebenen Orten */}
      {place.isUserSubmitted && (
        <div className="bg-[var(--color-amber)] text-white px-4 py-2.5 flex items-center justify-center gap-2 text-[13px] font-semibold text-center leading-snug">
          <i className="fa-solid fa-clock flex-shrink-0" />
          <span>Dieser Ort wird gerade geprüft und ist für andere Entdecker:innen noch nicht sichtbar.</span>
        </div>
      )}

      {/* Bearbeiten-Leiste — Ersteller:in (solange ungeprüft) oder Admin */}
      {canEditPlace && (
        <div className="bg-[#FFF4EB] border-b border-[#F2DCC4] px-4 py-2 flex items-center justify-center gap-3 text-[13px]">
          <span className="text-[#9A6A3A]">
            {user?.isAdmin && !isOwnerPending ? 'Admin-Ansicht.' : 'Das ist dein Vorschlag.'} Du kannst die Texte noch anpassen.
          </span>
          <button
            onClick={() => navigate(`/submit?edit=${place.id}`)}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-amber)] text-white font-semibold text-xs hover:opacity-90 transition-opacity"
          >
            <i className="fa-solid fa-pen" /> Bearbeiten
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          CARD HEADER
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ background: '#FBF9FC' }}>

        {/* ── Row 1: Navigation bar ─────────────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 flex items-center gap-3">
          {/* Back button — small lavender circle (im Overlay übernimmt der Overlay-Header das Zurück) */}
          <button onClick={goBack}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95"
            style={{ background: '#F1ECF4' }}>
            <i className="fa-solid fa-arrow-left text-sm" style={{ color: '#34254c' }} />
          </button>

          {/* „Ich war hier": grüner Status-Button (besucht) oder Toggle */}
          {isVisited ? (
            <button onClick={() => showToast('Du hast diesen Ort besucht ✓')} title="Besucht"
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95"
              style={{ background: 'var(--color-success)', color: 'white' }}>
              <i className="fa-solid fa-check text-sm" />
            </button>
          ) : (
            <VisitedToggle isVisited={isVisited} gpsLoading={gpsLoading} onToggle={handleVerifyToggle} />
          )}

          {/* Bewerten — nur wenn besucht */}
          {isVisited && (
            <button onClick={() => setRatingOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold flex-shrink-0 transition-all hover:brightness-110 active:scale-95"
              style={{ background: 'var(--color-amber)', color: 'white' }}>
              <i className="fa-solid fa-star text-[11px]" /> Bewerten
            </button>
          )}

          {/* Foto/Video hinzufügen */}
          <button onClick={() => gate(() => fileInputRef.current?.click(), 'Melde dich an, um Fotos zu diesem Ort hinzuzufügen.')} title="Foto oder Video hinzufügen"
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95"
            style={{ background: '#F1ECF4', color: '#71587A' }}>
            <i className="fa-solid fa-camera text-sm" />
          </button>

          {/* Right: Trip + share + save */}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => gate(() => setAddTripOpen(true), 'Melde dich an, um Orte zu einem Trip hinzuzufügen.')} title="Zu Trip hinzufügen"
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ background: '#F1ECF4', color: '#71587A' }}>
              <i className="fa-solid fa-route text-sm" />
            </button>
            <button onClick={() => navigator.share?.({ title: place.name, url: window.location.href }).catch(() => {})}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ background: '#F1ECF4', color: '#71587A' }}>
              <i className="fa-solid fa-share-nodes text-sm" />
            </button>
            <button onClick={() => gate(() => toggleSave(place.id), 'Melde dich an, um diesen Geheimtrip zu speichern.')}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ background: isSaved ? 'var(--color-amber)' : '#F1ECF4', color: isSaved ? 'white' : '#71587A' }}>
              <i className={`${isSaved ? 'fa-solid' : 'fa-regular'} fa-bookmark text-sm`} />
            </button>
          </div>
        </div>

        {/* ── Galerie: mobil Swipe-Slider, ab sm 3-Panel-Mosaik ─── */}
        <div className="max-w-7xl mx-auto px-4 pb-4">
          {/* Mobil: Titelbild als Swipe-Slider mit Dots + „X Bilder"-Badge */}
          <div className="sm:hidden">
            <MobileHero place={place} photos={allPhotos}
              onOpen={idx => setLightboxIdx(idx)} onReviews={() => setShowReviews(v => !v)} />
          </div>
          {/* Ab sm: bestehendes 3-Panel-Mosaik */}
          <div className="hidden sm:flex gap-2" style={{ height: GALLERY_H }}>

            {/* ── Hero tile (large, ~60%) ── */}
            <div className="rounded-3xl overflow-hidden relative flex-1 sm:flex-[3] min-w-0">
              {(() => {
                const heroUrl = galleryAt(0)?.url ?? place.hero;
                if (!heroUrl) {
                  // Kein Bild hochgeladen → Marken-Platzhalter statt Stock-Foto
                  return <PlaceImage src={null} category={place.category} className="w-full h-full" iconClass="text-5xl" />;
                }
                const crop = place.galleryCrops?.[heroUrl];
                const heroPos = crop
                  ? `${crop.cropX * 100}% ${crop.cropY * 100}%`
                  : heroUrl === place.hero
                    ? `${(place.heroCropX ?? 0.5) * 100}% ${(place.heroCropY ?? 0.5) * 100}%`
                    : 'center';
                return (
                  <GalleryMedia key={heroUrl} url={heroUrl} pos={heroPos}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setLightboxIdx((galleryOffset) % Math.max(allPhotos.length, 1))} />
                );
              })()}

              {/* Gradient */}
              <div className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 45%)' }} />

              {/* Place name + rating overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {(place.tagSlugs?.length ? place.tagSlugs : [place.tagSlug]).map((s, i) => (
                    <TagBadge key={i} slug={s} fallback={i === 0 ? place.categoryLabel : undefined} icon={i === 0} variant="dark"
                      className="text-[9px] px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(6px)' }} />
                  ))}
                  {place.match > 0 && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ background: 'var(--color-amber)' }}>{place.match}% Match</span>
                  )}
                  {place.isUserSubmitted && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white flex items-center gap-1"
                      style={{ background: 'rgba(249,144,57,0.92)' }} title="Noch nicht veröffentlicht – wird von uns geprüft">
                      <i className="fa-solid fa-clock" /> In Prüfung
                    </span>
                  )}
                </div>
                <h1 className="font-display font-bold text-white leading-tight"
                  style={{ fontSize: 'clamp(1.25rem, 2.8vw, 1.9rem)', letterSpacing: '-0.02em', textShadow: '0 2px 12px rgba(0,0,0,0.45)' }}>
                  {place.name}
                </h1>
                {/* Kurz-Besonderheit erscheint prominent im „Das Besondere"-Banner weiter unten */}
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-white/75 text-xs flex items-center gap-1">
                    <i className="fa-solid fa-location-dot text-[10px]" /> {place.region}
                  </span>
                  <button onClick={() => setShowReviews(v => !v)}
                    className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                    <StarDisplay rating={place.rating} size="xs" />
                    <span className="text-white/90 text-xs font-semibold">{place.rating}</span>
                    <span className="text-white/60 text-[10px] underline underline-offset-2">({place.reviews})</span>
                  </button>
                </div>
              </div>

              {/* Photo count badge — top right */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(8px)', color: 'white' }}>
                <i className="fa-solid fa-images" style={{ fontSize: 9 }} /> {allPhotos.length}
              </div>
            </div>

            {/* ── Middle column: portrait video OR 2 stacked photos ── */}
            <div className="hidden sm:flex flex-col gap-2 flex-[1] min-w-0">
              {videoUrl ? (
                /* Full-height portrait video — static, not cycled */
                <div className="rounded-3xl overflow-hidden flex-1">
                  <video src={videoUrl} muted loop playsInline autoPlay className="w-full h-full object-cover" />
                </div>
              ) : (
                <>
                  {galleryAt(1) && (
                    <div className="rounded-3xl overflow-hidden flex-1 cursor-pointer"
                      onClick={() => setLightboxIdx((galleryOffset + 1) % Math.max(allPhotos.length, 1))}>
                      <GalleryMedia key={galleryAt(1)!.url} url={galleryAt(1)!.url}
                        pos={(() => { const c = place.galleryCrops?.[galleryAt(1)!.url]; return c ? `${c.cropX*100}% ${c.cropY*100}%` : 'center'; })()}
                        className="w-full h-full object-cover hover:brightness-95 transition-all" />
                    </div>
                  )}
                  {galleryAt(2) && (
                    <div className="rounded-3xl overflow-hidden flex-1 cursor-pointer"
                      onClick={() => setLightboxIdx((galleryOffset + 2) % Math.max(allPhotos.length, 1))}>
                      <GalleryMedia key={galleryAt(2)!.url} url={galleryAt(2)!.url}
                        pos={(() => { const c = place.galleryCrops?.[galleryAt(2)!.url]; return c ? `${c.cropX*100}% ${c.cropY*100}%` : 'center'; })()}
                        className="w-full h-full object-cover hover:brightness-95 transition-all" />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Right column: 2 cycled photos + grey arrow (advances gallery) ── */}
            <div className="hidden sm:flex flex-col gap-2 flex-[1] min-w-0">
              {galleryAt(3) && (
                <div className="rounded-3xl overflow-hidden flex-1 cursor-pointer"
                  onClick={() => setLightboxIdx((galleryOffset + 3) % Math.max(allPhotos.length, 1))}>
                  <GalleryMedia key={galleryAt(3)!.url} url={galleryAt(3)!.url}
                    pos={(() => { const c = place.galleryCrops?.[galleryAt(3)!.url]; return c ? `${c.cropX*100}% ${c.cropY*100}%` : 'center'; })()}
                    className="w-full h-full object-cover hover:brightness-95 transition-all" />
                </div>
              )}
              {galleryAt(4) && (
                <div className="rounded-3xl overflow-hidden flex-1 cursor-pointer"
                  onClick={() => setLightboxIdx((galleryOffset + 4) % Math.max(allPhotos.length, 1))}>
                  <GalleryMedia key={galleryAt(4)!.url} url={galleryAt(4)!.url}
                    pos={(() => { const c = place.galleryCrops?.[galleryAt(4)!.url]; return c ? `${c.cropX*100}% ${c.cropY*100}%` : 'center'; })()}
                    className="w-full h-full object-cover hover:brightness-95 transition-all" />
                </div>
              )}
              {/* Grey box: manually advance gallery (or open lightbox when static) */}
              <button
                className="rounded-3xl flex-1 flex items-center justify-center transition-all hover:brightness-95 group"
                style={{ background: '#EDE6F3' }}
                onClick={() => allPhotos.length > 5
                  ? setGalleryOffset(p => (p + 1) % allPhotos.length)
                  : setLightboxIdx(0)
                }>
                <div className="w-11 h-11 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-0.5"
                  style={{ background: '#71587a' }}>
                  <i className="fa-solid fa-arrow-right text-white" />
                </div>
              </button>
            </div>

          </div>
        </div>

      </div>
      {/* END CARD HEADER */}

      {/* ── Rezensionen panel ─────────────────────────────────────────────────── */}
      {showReviews && (
        <div className="border-b border-[var(--color-bg-soft)]" style={{ background: '#faf8fc' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: '#71587a' }}>Gemeinschaft</p>
                <h2 className="font-display font-bold leading-tight" style={{ fontSize: '1.6rem', letterSpacing: '-0.02em', color: '#34254c' }}>
                  <em className="italic" style={{ color: '#71587a' }}>Rezensionen</em>
                </h2>
              </div>
              <button onClick={() => setShowReviews(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:brightness-95"
                style={{ background: '#F1ECF4', color: '#71587a' }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* Empty state for new places */}
            {reviewStats.total === 0 && (
              <div className="text-center py-8 mb-6">
                <i className="fa-regular fa-star text-3xl mb-3" style={{ color: '#D1C7DC' }} />
                <p className="font-semibold" style={{ color: '#34254c' }}>Noch keine Bewertungen</p>
                <p className="text-sm mt-1" style={{ color: '#71587a' }}>
                  Besuche den Ort und hinterlasse die erste Bewertung!
                </p>
                <button onClick={() => gate(() => { setShowReviews(false); setRatingOpen(true); }, 'Melde dich an, um eine Rezension zu hinterlassen.')}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110"
                  style={{ background: 'var(--color-amber)' }}>
                  <i className="fa-solid fa-star" /> Jetzt bewerten
                </button>
              </div>
            )}

            {reviewStats.total > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Star distribution */}
              <div className="flex gap-5 items-start">
                <div className="flex flex-col items-center flex-shrink-0 pt-1">
                  <span className="font-display font-bold leading-none" style={{ fontSize: '3.5rem', color: '#34254c' }}>
                    {reviewStats.overallAvg.toFixed(1).replace('.', ',')}
                  </span>
                  <StarDisplay rating={reviewStats.overallAvg} size="lg" />
                  <span className="text-xs mt-1" style={{ color: '#71587a' }}>{reviewStats.total} Bew.</span>
                </div>
                <div className="flex-1 flex flex-col gap-1.5 pt-2">
                  {reviewStats.byStars.map(({ stars, count, pct }) => (
                    <button key={stars} onClick={() => setRatingFilterStar(ratingFilterStar === stars ? null : stars)}
                      className="flex items-center gap-2 group w-full text-left">
                      <span className="text-xs font-semibold w-3 text-right flex-shrink-0" style={{ color: '#34254c' }}>{stars}</span>
                      <i className="fa-solid fa-star flex-shrink-0" style={{ fontSize: 9, color: '#F99039' }} />
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#e5dcea' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: ratingFilterStar === stars ? '#F99039' : '#34254c' }} />
                      </div>
                      <span className="text-[10px] w-5 text-right flex-shrink-0" style={{ color: '#71587a' }}>{count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category averages */}
              <div className="flex flex-col gap-2.5">
                {RATING_CRITERIA.map(c => {
                  const avg = reviewStats.catAvgs[c.key] ?? 0;
                  return (
                    <div key={c.key} className="flex items-center gap-2.5">
                      <i className={`fa-solid ${c.icon} w-4 flex-shrink-0 text-sm`} style={{ color: '#71587a' }} />
                      <span className="text-xs font-semibold w-[108px] flex-shrink-0" style={{ color: '#34254c' }}>{c.label}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#e5dcea' }}>
                        <div className="h-full rounded-full" style={{ width: `${avg/5*100}%`, background: '#F99039' }} />
                      </div>
                      <span className="text-xs font-semibold w-6 text-right flex-shrink-0" style={{ color: '#34254c' }}>{avg.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>}

            {reviewStats.total > 0 && <>
            {/* Filter chips */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {[null, 5, 4, 3, 2, 1].map(s => (
                <button key={s ?? 'all'} onClick={() => setRatingFilterStar(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${ratingFilterStar === s ? 'border-[var(--color-aubergine)] bg-[var(--color-aubergine)] text-white' : 'border-[#e5dcea] bg-white text-[var(--color-lavender)] hover:border-[var(--color-aubergine)]'}`}>
                  {s === null ? 'Alle' : <>{s} <i className="fa-solid fa-star text-[8px]" /></>}
                </button>
              ))}
              <span className="text-xs ml-1" style={{ color: '#b9a8c4' }}>
                {filteredReviews.length} {filteredReviews.length === 1 ? 'Rezension' : 'Rezensionen'}
              </span>
            </div>

            {/* Review cards */}
            <div className="flex flex-col gap-4">
              {filteredReviews.map(r => (
                <div key={r.id} className="rounded-2xl p-4 bg-white" style={{ border: '1px solid #F1ECF4' }}>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ background: r.avatarColor }}>{r.userName[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: '#34254c' }}>{r.userName}</p>
                      <div className="flex items-center gap-2">
                        <StarDisplay rating={r.rating} size="xs" />
                        <span className="text-[10px]" style={{ color: '#b9a8c4' }}>{r.date}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed mb-3" style={{ color: '#3d2d56' }}>{r.comment}</p>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 mb-2">
                    {RATING_CRITERIA.map(c => {
                      const v = r.categories[c.key];
                      if (!v) return null;
                      return (
                        <div key={c.key} className="flex items-center gap-1.5">
                          <i className={`fa-solid ${c.icon}`} style={{ fontSize: 9, color: '#b9a8c4' }} />
                          <span className="text-[10px]" style={{ color: '#71587a' }}>{c.label.split(' ')[0]}</span>
                          <span className="text-[10px] font-bold ml-auto" style={{ color: '#34254c' }}>{v}.0</span>
                        </div>
                      );
                    })}
                  </div>
                  <button className="text-[10px] flex items-center gap-1 transition-colors hover:text-[var(--color-aubergine)]"
                    style={{ color: '#71587a' }}>
                    <i className="fa-regular fa-thumbs-up" /> Hilfreich ({r.helpful})
                  </button>
                </div>
              ))}
            </div>
            </>}
          </div>
        </div>
      )}

      {/* ── Main layout ──────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 pt-2 lg:pt-6 pb-2">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">

          {/* ═══ LEFT ════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-2 flex flex-col gap-10">

            {/* „Zu Trip hinzufügen" ist mobil jetzt im Header (runder Icon-Button) */}

            {/* ── Author card + business claim tile + primary actions ──────────── */}
            {/* Mobil: „Entdeckt von" wandert unter „Auf einen Blick" + Fragen (order) */}
            <div className="flex flex-col gap-3 order-1 lg:order-none">
              <div className={`flex gap-3 ${place.approvedClaim ? 'flex-col sm:flex-row' : ''}`}>

                {/* Entdecker card */}
                <div className="rounded-3xl p-4 bg-white flex items-center gap-4 flex-wrap flex-1"
                  style={{ border: '1px solid #F1ECF4', boxShadow: '0 2px 10px rgba(52,37,76,0.05)' }}>
                  {place.author ? (
                    <button onClick={() => gate(() => navigate(`/author/${place.author!.id}`), 'Melde dich an, um das Profil der Entdecker:in zu sehen.')}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                      <div className="w-12 h-12 rounded-2xl flex-shrink-0 overflow-hidden flex items-center justify-center text-base font-bold text-white"
                        style={{ background: place.author.avatarColor }}>
                        {place.author.avatarUrl
                          ? <img src={place.author.avatarUrl} alt={place.author.name} className="w-full h-full object-cover" />
                          : place.author.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#b9a8c4' }}>Entdecker</p>
                        <p className="text-sm font-bold leading-tight truncate" style={{ color: '#34254c' }}>{place.author.name}</p>
                        {place.author.bio && (
                          <p className="text-xs leading-snug truncate mt-0.5" style={{ color: '#71587a' }}>{place.author.bio}</p>
                        )}
                        <p className="text-[10px] mt-0.5" style={{ color: '#b9a8c4' }}>
                          <i className="fa-solid fa-map-pin mr-1" />{place.author.placeCount} Orte entdeckt
                        </p>
                      </div>
                    </button>
                  ) : place.submitter ? (
                    /* User-submitted place — auf Profil tippen */
                    <button onClick={() => gate(() => navigate(`/u/${place.submitter!.id}`), 'Melde dich an, um das Profil der Ersteller:in zu sehen.')} className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.99] transition-transform">
                      <div className="w-12 h-12 rounded-2xl flex-shrink-0 overflow-hidden flex items-center justify-center text-base font-bold text-white"
                        style={{ background: '#71587A' }}>
                        {place.submitter.avatarUrl
                          ? <img src={place.submitter.avatarUrl} alt={place.submitter.name} className="w-full h-full object-cover" />
                          : place.submitter.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#b9a8c4' }}>Entdeckt von</p>
                        <p className="text-sm font-bold leading-tight truncate flex items-center gap-1.5" style={{ color: '#34254c' }}>
                          {place.submitter.name}
                          {place.submitter.isLocalHero && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'rgba(249,144,57,0.15)', color: '#F99039' }} title="Local Hero – Top 25 % der Geheimtriper">
                              <i className="fa-solid fa-shield-halved" /> Local Hero
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: '#b9a8c4' }}>
                          @{place.submitter.handle}
                        </p>
                      </div>
                    </button>
                  ) : (
                    <div className="flex-1" />
                  )}

                  {/* Änderungen vorschlagen — nur für Personen, die den Ort besucht haben */}
                  {!place.approvedClaim && isVisited && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => gate(() => { setSuggestOpen(true); setSuggestCategory(null); setSuggestText(''); setSuggestSent(false); }, 'Melde dich an, um Änderungen vorzuschlagen.')}
                        title="Änderungen vorschlagen"
                        className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:brightness-95"
                        style={{ background: '#F1ECF4', color: '#71587A' }}>
                        <i className="fa-solid fa-pen-to-square text-sm" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Business claim tile — only when place is officially managed with approved claim */}
                {place.approvedClaim && (
                  <div className="rounded-3xl p-4 bg-white flex items-center gap-3 flex-1"
                    style={{ border: '1.5px solid #e8f5e9', boxShadow: '0 2px 10px rgba(52,37,76,0.05)' }}>
                    <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center"
                      style={{ background: '#e8f5e9' }}>
                      <i className="fa-solid fa-building-circle-check text-xl" style={{ color: '#2e7d32' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#2e7d32' }}>Offizieller Betreiber</p>
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                          style={{ background: '#e8f5e9', color: '#2e7d32' }}>
                          <i className="fa-solid fa-circle-check text-[8px]" /> Verifiziert
                        </span>
                      </div>
                      <p className="text-sm font-bold leading-tight truncate" style={{ color: '#34254c' }}>
                        {place.approvedClaim.businessName}
                      </p>
                      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: '#71587a' }}>
                        Informationen auf dieser Seite sind mit dem offiziellen Betreiber verknüpft.
                      </p>
                      {place.approvedClaim.contactWebsite && (
                        <a href={place.approvedClaim.contactWebsite.startsWith('http') ? place.approvedClaim.contactWebsite : `https://${place.approvedClaim.contactWebsite}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[10px] font-semibold mt-1 flex items-center gap-1 hover:underline"
                          style={{ color: '#2e7d32' }}>
                          <i className="fa-solid fa-arrow-up-right-from-square text-[9px]" /> Zur offiziellen Website
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Änderungen vorschlagen (bei Business-Ort) — nur für Besucher:innen */}
              {place.approvedClaim && isVisited && (
                <div className="flex justify-end">
                  <button onClick={() => gate(() => { setSuggestOpen(true); setSuggestCategory(null); setSuggestText(''); setSuggestSent(false); }, 'Melde dich an, um Änderungen vorzuschlagen.')}
                    title="Änderungen vorschlagen"
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:brightness-95"
                    style={{ background: '#F1ECF4', color: '#71587A' }}>
                    <i className="fa-solid fa-pen-to-square text-sm" />
                  </button>
                </div>
              )}

              {/* Community question panel — shown after marking visited */}
              {showParkingQ && (
                <VisitorContribPanel
                  place={place}
                  user={user}
                  onDone={() => { setShowParkingQ(false); placesApi.contributions(place.id).then(setParkingContribs).catch(() => {}); }}
                  showToast={showToast}
                />
              )}
            </div>

            {/* Das Besondere — der USP-Teaser aus dem Einreichformular (highlight) */}
            {/* Mobil: direkt unter die Bilder ziehen (order-first) */}
            {highlight && (
              <section className="rounded-2xl p-4 order-first lg:order-none"
                style={{ background: 'linear-gradient(135deg, #FFF4EB, #FFEAD6)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-amber)] mb-1">Das Besondere</p>
                <p className="text-[15px] text-[var(--color-aubergine)] leading-snug font-medium">{highlight}</p>
              </section>
            )}

            {/* Nur für die/den Ersteller:in: wie oft wurde dieser Geheimtrip aufgerufen */}
            {!!user && user.id === place.submittedBy && (
              <section className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: '#F1ECF4' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#E2D7EB' }}>
                  <i className="fa-regular fa-eye text-sm" style={{ color: '#71587A' }} />
                </div>
                <div>
                  <p className="text-[15px] font-bold text-[var(--color-aubergine)] leading-none">
                    {(place.views ?? 0).toLocaleString('de')} {(place.views ?? 0) === 1 ? 'Aufruf' : 'Aufrufe'}
                  </p>
                  <p className="text-[11px] text-[var(--color-lavender)] mt-0.5">So oft wurde dein Geheimtrip geöffnet · nur du siehst das</p>
                </div>
              </section>
            )}

            {/* Story */}
            {place.long && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-amber)] mb-3">Über diesen Ort</p>
                <div
                  className={`text-[15px] text-[var(--color-body)] leading-relaxed prose prose-sm max-w-none [&_img]:rounded-2xl [&_img]:w-full [&_img]:my-4 [&_img]:shadow-[var(--shadow-card)] [&_a.gt-place]:text-[#C96442] [&_a.gt-place]:font-semibold [&_a.gt-place]:no-underline [&_a.gt-place]:cursor-pointer ${!storyExpanded && isLongStory ? 'line-clamp-5' : ''}`}
                  onClick={e => {
                    const a = (e.target as HTMLElement).closest?.('a.gt-place') as HTMLElement | null;
                    if (a) { e.preventDefault(); const pid = a.getAttribute('data-place-id'); if (pid) openPlace(pid); }
                  }}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: place.long }}
                />
                {isLongStory && (
                  <button onClick={() => setStoryExpanded(v => !v)}
                    className="mt-2.5 text-[var(--color-aubergine)] font-semibold text-sm flex items-center gap-1.5 hover:underline">
                    {storyExpanded ? 'Weniger anzeigen' : 'Mehr lesen'}
                    <i className={`fa-solid fa-chevron-${storyExpanded ? 'up' : 'down'} text-xs`} />
                  </button>
                )}
                {/* Karte mit den im Text verlinkten Orten (z.B. Stadtteil mit mehreren Spots) */}
                {linkedInStory.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-amber)] mb-2">
                      Orte in diesem Text
                    </p>
                    <LinkedPlacesMap linked={linkedInStory} onOpen={openPlace} />
                  </div>
                )}
              </section>
            )}

            {/* Must-see-Highlights — „Das solltest du sehen" (nur Erlebnis-Orte) */}
            {Array.isArray(place.highlights) && place.highlights.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-amber)] mb-3">
                  <i className="fa-solid fa-star mr-1.5" />Das solltest du sehen
                </p>
                <div className="flex flex-col gap-4">
                  {place.highlights.map((h, i) => (
                    <div key={i} className="rounded-2xl overflow-hidden border border-[var(--color-bg-soft)] bg-white shadow-[var(--shadow-card)]">
                      {h.photos.length > 0 && (
                        h.photos.length === 1 ? (
                          <img src={h.photos[0]} alt={h.title} loading="lazy" decoding="async" className="w-full aspect-[16/10] object-cover" />
                        ) : (
                          <div className="flex overflow-x-auto scrollbar-none snap-x" style={{ scrollbarWidth: 'none' }}>
                            {h.photos.map((src, j) => (
                              <img key={j} src={src} alt="" loading="lazy" decoding="async" className="h-44 w-auto flex-shrink-0 object-cover snap-start" />
                            ))}
                          </div>
                        )
                      )}
                      <div className="p-3.5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold" style={{ background: 'var(--color-amber)' }}>{i + 1}</span>
                          <h3 className="font-display font-bold text-[var(--color-aubergine)]">{h.title}</h3>
                        </div>
                        {h.description && <p className="text-[14px] text-[var(--color-body)] leading-relaxed">{h.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Trivia — optionaler heller-Lila Block mit typ-spezifischem Icon */}
            {triviaText && (
              <section className="rounded-2xl p-4 flex items-start gap-3" style={{ background: '#F1ECF4' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#E2D7EB' }}>
                  <i className={`fa-solid ${TRIVIA_ICONS[triviaType] ?? 'fa-circle-info'} text-sm`} style={{ color: '#71587A' }} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#71587A' }}>
                    {triviaType || 'Wusstest du schon?'}
                  </p>
                  <p className="text-[15px] leading-snug" style={{ color: '#4A3D5C' }}>{triviaText}</p>
                </div>
              </section>
            )}

            {/* Tips */}
            {place.tips.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-amber)] mb-3">Tipps</p>
                <ul className="flex flex-col gap-2.5">
                  {place.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--color-amber)' }}>
                        <i className="fa-solid fa-check text-white" style={{ fontSize: 9 }} />
                      </span>
                      {/* Tips may contain HTML formatting from the rich-text editor */}
                      <span className="text-[15px] text-[var(--color-body)] leading-relaxed"
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: tip }} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Mobile only: Auf einen Blick — after Tips */}
            <AtAGlanceBox className="lg:hidden"
              costLabel={place.costLabel} entranceFee={entranceFee} entranceFeeAmount={entranceFeeAmount}
              rating={place.rating} reviews={place.reviews}
              website={website} openingHours={openingHours} weekHours={hasWeekHours ? weekHours : null}
              hoursSchedule={hoursSchedule}
              hoursUrl={hoursUrl} prices={prices} pricesUrl={pricesUrl} specialInfo={specialInfo}
              isOfficiallyManaged={isOfficiallyManaged}
              parking={derivedParking} parkingContribs={parkingContribs} merkmale={merkmaleList} vibes={vibeList} />
            <PlaceExtras place={place} className="lg:hidden mt-4" />

            {/* Mobile: claim button */}
            {!isOfficiallyManaged && (
              <button onClick={() => setClaimOpen(true)}
                className="lg:hidden flex items-center gap-2 text-xs text-[var(--color-lavender)] hover:text-[var(--color-aubergine)] transition-colors w-full justify-center py-1">
                <i className="fa-solid fa-building text-[10px]" />
                Bist du der Betreiber?
              </button>
            )}

            {/* Mobile-Karte entfällt: ersetzt durch Vollbildkarte im Hintergrund + Sheet-Kopf (Reisezeit/Route) */}

            {/* Q&A */}
            <section>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-amber)] mb-3">Fragen &amp; Antworten</p>

              {qaEntries.length > 3 && (
                <div className="flex items-center gap-3 bg-white border border-[var(--color-bg-soft)] rounded-2xl px-4 py-3 shadow-[var(--shadow-card)] mb-5">
                  <i className="fa-solid fa-magnifying-glass text-[var(--color-lavender)] flex-shrink-0" />
                  <input type="text" value={qaSearch} onChange={e => { setQaSearch(e.target.value); setQaShowAll(true); }}
                    placeholder="Fragen durchsuchen…"
                    className="flex-1 bg-transparent outline-none text-sm text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)]" />
                  {qaSearch && (
                    <button onClick={() => setQaSearch('')} className="text-[var(--color-lavender)] hover:text-[var(--color-aubergine)] transition-colors">
                      <i className="fa-solid fa-xmark text-sm" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-col mb-4" style={{ borderTop: '1px solid #F1ECF4' }}>
                {visibleQa.length === 0 && qaSearch && <p className="text-sm italic py-4 text-center" style={{ color: '#b9a8c4' }}>Keine Fragen gefunden.</p>}
                {visibleQa.map(qa => (
                  <div key={qa.id} style={{ borderBottom: '1px solid #F1ECF4' }}>
                    {/* Question row */}
                    <button onClick={() => setOpenQaId(openQaId === qa.id ? null : qa.id)}
                      className="w-full flex items-start gap-3 py-3.5 text-left group">
                      {/* Orange circle with white question mark — like tip checkmarks */}
                      <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--color-amber)' }}>
                        <i className="fa-solid fa-question text-white" style={{ fontSize: 8 }} />
                      </span>
                      <p className="flex-1 text-[15px] text-[var(--color-body)] leading-snug">{qa.question}</p>
                      {/* Answer count + chevron on the right */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        {qa.answers.length > 0 && (
                          <span className="text-xs" style={{ color: '#b9a8c4' }}>
                            {qa.answers.length} {qa.answers.length === 1 ? 'Antwort' : 'Antworten'}
                          </span>
                        )}
                        <i className={`fa-solid fa-chevron-${openQaId === qa.id ? 'up' : 'down'} text-xs`}
                          style={{ color: '#b9a8c4' }} />
                      </div>
                    </button>

                    {/* Expanded answers */}
                    {openQaId === qa.id && (
                      <div className="pb-3 pl-8 flex flex-col gap-2.5">
                        {qa.answers.map(ans => (
                          <div key={ans.id} className="flex gap-2.5">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white mt-0.5"
                              style={{ background: ans.isCreator ? '#F99039' : '#34254c' }}>
                              {ans.isCreator ? <i className="fa-solid fa-pen-nib" /> : ans.answeredBy[0]}
                            </div>
                            <div className="flex-1">
                              <p className="text-[11px] mb-0.5" style={{ color: '#b9a8c4' }}>
                                <button className="font-semibold hover:underline transition-colors"
                                  style={{ color: '#34254c' }}
                                  onClick={() => navigate('/profile')}>
                                  {ans.answeredBy}
                                </button>
                                {ans.isCreator && (
                                  <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider bg-[var(--color-amber)] text-white px-1.5 py-0.5 rounded-full">Ersteller</span>
                                )}
                                {' · '}{ans.answeredAt}
                              </p>
                              <p className="text-sm text-[var(--color-body)] leading-relaxed">{ans.text}</p>
                            </div>
                          </div>
                        ))}
                        {qa.answers.length === 0 && !canAnswer && (
                          <p className="text-xs italic" style={{ color: '#b9a8c4' }}>Noch keine Antwort.</p>
                        )}
                        {qa.answers.length === 0 && canAnswer && (
                          <form onSubmit={e => { e.preventDefault(); handleAnswerQuestion(qa.id, answerInput); setAnswerInput(''); }}
                            className="flex gap-2">
                            <input value={answerInput} onChange={e => setAnswerInput(e.target.value)}
                              placeholder="Deine Antwort…" maxLength={2000}
                              className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none border-[#E4DCF0] focus:border-[#F99039] bg-white text-[#34254C]" />
                            <button type="submit" disabled={!answerInput.trim()}
                              className="bg-[var(--color-amber)] text-white font-semibold px-3 rounded-xl text-sm disabled:opacity-50">
                              Antworten
                            </button>
                          </form>
                        )}
                        {/* Moderation: Ersteller:in/Admin kann die Frage löschen (z.B. bei Missbrauch) */}
                        {canAnswer && (
                          <button onClick={() => { if (confirm('Diese Frage wirklich löschen?')) handleDeleteQuestion(qa.id); }}
                            className="self-start text-[11px] font-semibold text-[#C96442] hover:underline mt-0.5">
                            <i className="fa-solid fa-trash mr-1 text-[10px]" /> Frage löschen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!qaShowAll && !qaSearch && filteredQa.length > 3 && (
                <button onClick={() => setQaShowAll(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-2xl transition-all hover:bg-[var(--color-bg-soft)]"
                  style={{ color: 'var(--color-lavender)', border: '1.5px solid #F1ECF4' }}>
                  <i className="fa-solid fa-chevron-down text-xs" /> {filteredQa.length - 3} weitere Fragen
                </button>
              )}
              {qaShowAll && filteredQa.length > 3 && !qaSearch && (
                <button onClick={() => setQaShowAll(false)}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold"
                  style={{ color: 'var(--color-lavender)' }}>
                  <i className="fa-solid fa-chevron-up text-xs" /> Weniger anzeigen
                </button>
              )}

              <div className="mt-5 rounded-3xl p-5" style={{ background: '#F1ECF4' }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: '#71587a' }}>Hast du eine Frage?</p>
                <p className="text-sm font-semibold mb-3" style={{ color: '#34254c' }}>Stelle eine Frage zu diesem Ort</p>
                <div className="flex gap-2">
                  <input value={newQuestion} onChange={e => setNewQuestion(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAskQuestion()}
                    placeholder="z.B. Ist der Einlass kostenpflichtig?"
                    className="flex-1 bg-white rounded-2xl px-4 py-2.5 text-sm text-[var(--color-body)] placeholder:text-[var(--color-lavender-lt)] outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
                    style={{ border: '1px solid #e5dcea' }} />
                  <button type="button" onClick={handleAskQuestion} disabled={!newQuestion.trim()}
                    className="w-11 h-11 rounded-2xl bg-[var(--color-aubergine)] text-white flex items-center justify-center flex-shrink-0 hover:brightness-110 transition-all disabled:opacity-40">
                    <i className="fa-solid fa-paper-plane text-sm" />
                  </button>
                </div>
              </div>
            </section>

            {/* Mobile only: Wetter — after Q&A */}
            <div className="lg:hidden order-2 lg:order-none">
              <WeatherForecast lat={place.lat} lng={place.lng} placeId={place.id} />
            </div>

            {/* Datei-Input fürs Hochladen (vom Header-Kamera-Button + der Galerie genutzt) */}
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handlePhotoUpload} className="hidden" />

            {/* Verify CTA — mobil über den Header abgebildet, daher erst ab sm */}
            <div className="hidden sm:block order-3 lg:order-none">
            {!isVisited ? (
              <section className="rounded-3xl p-6" style={{ background: '#34254c' }}>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(249,144,57,0.18)' }}>
                    <i className="fa-solid fa-location-crosshairs text-[var(--color-amber)] text-xl" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-amber)] mb-1">Schon da gewesen?</p>
                    <p className="text-white font-display font-bold text-lg leading-tight mb-1.5">Verifiziere deinen Besuch</p>
                    <p className="text-white/60 text-sm mb-5 leading-relaxed">
                      Nur verifizierte Besucher können bewerten, Fragen beantworten und Punkte sammeln.
                    </p>
                    <div className="flex items-center gap-5 flex-wrap">
                      <VisitedToggle isVisited={isVisited} gpsLoading={gpsLoading} onToggle={handleVerifyToggle} />
                      <button onClick={() => gate(async () => { await markVisited(place.id); setRatingOpen(true); showToast('+15 Punkte!'); }, 'Melde dich an, um deinen Besuch zu markieren.')}
                        className="text-white/60 font-semibold text-sm hover:text-white transition-colors">
                        Ich war kürzlich hier →
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="flex flex-col gap-3">
                <div className="rounded-3xl p-5 flex items-center gap-4" style={{ background: '#F1ECF4' }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#d4edda' }}>
                    <i className="fa-solid fa-circle-check text-[var(--color-success)] text-xl" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[var(--color-aubergine)]">Besuch verifiziert ✓</p>
                    <p className="text-sm text-[var(--color-lavender)]">Du hast +15 Punkte für diesen Besuch gesammelt.</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setShowParkingQ(v => !v)}
                      className="flex items-center gap-1.5 bg-white text-[var(--color-aubergine)] font-semibold px-3 py-2 rounded-full text-xs border border-[#E4DCF0] hover:border-[var(--color-aubergine)] transition-all">
                      <i className="fa-solid fa-clipboard-question" /> Fragen
                    </button>
                    <button onClick={() => setRatingOpen(true)}
                      className="flex items-center gap-1.5 bg-[var(--color-aubergine)] text-white font-semibold px-4 py-2 rounded-full text-sm hover:brightness-110 transition-all">
                      <i className="fa-solid fa-star" /> Bewerten
                    </button>
                  </div>
                </div>
                {showParkingQ && (
                  <VisitorContribPanel
                    place={place}
                    user={user}
                    onDone={() => { setShowParkingQ(false); placesApi.contributions(place.id).then(setParkingContribs).catch(() => {}); }}
                    showToast={showToast}
                  />
                )}
              </section>
            )}
            </div>

            {/* ── Bildergalerie — mobil durch Slider + Lightbox ersetzt, daher ab sm ── */}
            <div className="hidden sm:block pt-4 pb-2 order-4 lg:order-none">
              <div className="flex items-center mb-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-lavender)]">
                  Bildergalerie <span className="font-normal ml-1">({allPhotos.length})</span>
                </p>
              </div>
              {/* Category filter — only shown when at least one photo has been tagged */}
              {allPhotos.some(p => p.cat !== 'alle') && (
                <div className="flex gap-2 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
                  {PHOTO_CATS.map(cat => (
                    <button key={cat.id} onClick={() => setPhotoCategory(cat.id)}
                      className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border ${photoCategory === cat.id ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]' : 'bg-white text-[var(--color-lavender)] border-[#e5dcea] hover:border-[var(--color-aubergine)]'}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}
              {visibleFilterPhotos.length > 0 ? (
                <>
                  {/* Photo grid — shows visibleGalleryCount tiles, more load on scroll */}
                  <div className="grid grid-cols-3 gap-2">
                    {visibleFilterPhotos.slice(0, visibleGalleryCount).map((photo, i) => {
                      const globalIdx = allPhotos.findIndex(p => p.url === photo.url);
                      const crop = place.galleryCrops?.[photo.url];
                      const cropPos = crop ? `${crop.cropX * 100}% ${crop.cropY * 100}%` : 'center';
                      const likes = photoLikes[photo.url] ?? 0;
                      const iLiked = myLikedPhotos.has(photo.url);
                      return (
                        <div key={i} className="relative aspect-square rounded-2xl overflow-hidden group">
                          <GalleryMedia url={photo.url} pos={cropPos}
                            className="w-full h-full object-cover cursor-pointer hover:brightness-95 transition-all"
                            onClick={() => setLightboxIdx(globalIdx >= 0 ? globalIdx : i)} />
                          {/* Like button */}
                          <button
                            onClick={e => { e.stopPropagation(); void handleLikePhoto(photo.url); }}
                            className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-all hover:scale-110 active:scale-95"
                            style={{
                              background: iLiked ? 'rgba(249,144,57,0.92)' : 'rgba(0,0,0,0.38)',
                              color: 'white', backdropFilter: 'blur(4px)',
                            }}
                          >
                            <i className={`${iLiked ? 'fa-solid' : 'fa-regular'} fa-heart text-[10px]`} />
                            {likes > 0 && <span>{likes}</span>}
                          </button>
                          {/* "Popular" badge */}
                          {likes >= 10 && (
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none"
                              style={{ background: 'rgba(249,144,57,0.92)', color: 'white' }}>
                              🔥
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Infinite-scroll sentinel */}
                  {visibleGalleryCount < visibleFilterPhotos.length && (
                    <div ref={galleryLoadMoreRef} className="h-4 mt-1" />
                  )}

                  {/* Foto hinzufügen — always bottom-right */}
                  <div className="flex justify-end mt-3">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all hover:brightness-95"
                      style={{ background: '#F1ECF4', border: '1.5px dashed #D1C7DC', color: '#71587A' }}>
                      <i className="fa-solid fa-plus" style={{ color: '#71587A' }} />
                      Foto hinzufügen
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center rounded-2xl py-8" style={{ background: '#F1ECF4' }}>
                    <p className="text-sm" style={{ color: '#b9a8c4' }}>Keine Fotos in dieser Kategorie.</p>
                  </div>
                  <div className="flex justify-end mt-3">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-semibold transition-all hover:brightness-95"
                      style={{ background: '#F1ECF4', border: '1.5px dashed #D1C7DC', color: '#71587A' }}>
                      <i className="fa-solid fa-plus" style={{ color: '#71587A' }} />
                      Foto hinzufügen
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ═══ RIGHT ════════════════════════════════════════════════════════ */}
          <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">

            <div className="hidden lg:block">
              <button onClick={() => setAddTripOpen(true)}
                className="w-full flex items-center justify-center gap-2 bg-[var(--color-amber)] text-white font-bold py-3.5 rounded-2xl shadow-[var(--shadow-amber)] hover:brightness-110 transition-all text-sm">
                <i className="fa-solid fa-plus" /> Zu Trip hinzufügen
              </button>
            </div>

            {place.lat && place.lng && (
              <div className="hidden lg:block rounded-3xl overflow-hidden" style={{ border: '1px solid #F1ECF4' }}>
                <div style={{ height: 220, position: 'relative', zIndex: 0 }}>
                  <MapContainer key={place.id} center={[place.lat, place.lng]} zoom={14}
                    scrollWheelZoom={false} zoomControl={false} attributionControl={false}
                    style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    <Marker position={[place.lat, place.lng]} icon={brandMarker} />
                    <ZoomControl position="bottomright" />
                    <MapRecenter lat={place.lat} lng={place.lng} />
                  </MapContainer>
                </div>
                {/* Travel time row — picker left, time right */}
                <div className="px-3 pt-3 pb-1 flex items-center gap-2.5">

                  {/* Transport mode picker (left) */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setTransportPickerOpen(v => !v)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all hover:brightness-95"
                      style={{ background: '#F1ECF4', color: '#34254c' }}
                      title="Verkehrsmittel wechseln"
                    >
                      <i className={`fa-solid ${transportIcon(mapTransport)}`} style={{ color: '#F99039' }} />
                      <i className="fa-solid fa-chevron-down text-[8px]" style={{ color: '#b9a8c4' }} />
                    </button>

                    {transportPickerOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setTransportPickerOpen(false)} />
                        <div className="absolute left-0 bottom-full mb-1.5 z-30 rounded-2xl p-1.5 flex flex-col gap-0.5"
                          style={{ background: 'white', boxShadow: '0 8px 24px rgba(52,37,76,0.18)', minWidth: 160 }}>
                          {([
                            { id: 'walk'    as Transport, label: 'Zu Fuß',     icon: 'fa-person-walking' },
                            { id: 'bike'    as Transport, label: 'Fahrrad',    icon: 'fa-bicycle'        },
                            { id: 'transit' as Transport, label: 'ÖPNV / Zug', icon: 'fa-train-subway'  },
                            { id: 'auto'    as Transport, label: 'Auto',       icon: 'fa-car'            },
                          ]).map(opt => (
                            <button key={opt.id}
                              onClick={() => { setMapTransport(opt.id); setTransportPickerOpen(false); }}
                              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left hover:bg-[var(--color-bg-soft)]"
                              style={{ color: mapTransport === opt.id ? '#34254c' : '#71587a', background: mapTransport === opt.id ? '#F1ECF4' : 'transparent' }}>
                              <i className={`fa-solid ${opt.icon} w-4 text-center`}
                                style={{ color: mapTransport === opt.id ? '#F99039' : '#b9a8c4' }} />
                              {opt.label}
                              {mapTransport === opt.id && <i className="fa-solid fa-check ml-auto text-[10px]" style={{ color: '#F99039' }} />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Duration + distance (right of picker) */}
                  <div className="flex items-center gap-1.5 text-xs min-w-0" style={{ color: '#71587a' }}>
                    {travelTimeLoading ? (
                      <>
                        <i className="fa-solid fa-circle-notch fa-spin text-[10px]" style={{ color: '#b9a8c4' }} />
                        <span style={{ color: '#b9a8c4' }}>Reisezeit…</span>
                      </>
                    ) : travelTimeInfo ? (
                      <>
                        <strong style={{ color: '#34254c' }}>
                          ~{formatDuration(computeDisplayDuration(travelTimeInfo.distance, travelTimeInfo.drivingDuration, mapTransport))}
                        </strong>
                        <span style={{ color: '#b9a8c4' }}>·</span>
                        <span>{formatDistance(travelTimeInfo.distance)}</span>
                        {(mapTransport === 'transit' || mapTransport === 'train') && (
                          <span style={{ color: '#b9a8c4' }}>(ca.)</span>
                        )}
                      </>
                    ) : !userCoords ? (
                      <span style={{ color: '#b9a8c4' }}>Standort nicht verfügbar</span>
                    ) : null}
                  </div>
                </div>

                <div className="p-3 flex gap-2">
                  <a href={navUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] font-semibold py-2.5 rounded-xl text-xs hover:brightness-95 transition-all">
                    <i className="fa-solid fa-diamond-turn-right" /> Route
                    <i className={`fa-solid ${transportIcon(mapTransport)} text-[var(--color-lavender-lt)]`} />
                  </a>
                </div>
              </div>
            )}

            <AtAGlanceBox className="hidden lg:block"
              costLabel={place.costLabel} entranceFee={entranceFee} entranceFeeAmount={entranceFeeAmount}
              rating={place.rating} reviews={place.reviews}
              website={website} openingHours={openingHours} weekHours={hasWeekHours ? weekHours : null}
              hoursSchedule={hoursSchedule}
              hoursUrl={hoursUrl} prices={prices} pricesUrl={pricesUrl} specialInfo={specialInfo}
              isOfficiallyManaged={isOfficiallyManaged}
              parking={derivedParking} parkingContribs={parkingContribs} merkmale={merkmaleList} vibes={vibeList} />
            <PlaceExtras place={place} className="hidden lg:block mt-4" />

            {/* Claim button — desktop, only if not yet officially managed */}
            {!isOfficiallyManaged && (
              <button onClick={() => setClaimOpen(true)}
                className="hidden lg:flex items-center gap-2 text-xs text-[var(--color-lavender)] hover:text-[var(--color-aubergine)] transition-colors w-full justify-center py-1">
                <i className="fa-solid fa-building text-[10px]" />
                Bist du der Betreiber?
              </button>
            )}

            <div className="hidden lg:block">
              <WeatherForecast lat={place.lat} lng={place.lng} placeId={place.id} />
            </div>

            {similar.length > 0 && (
              <div className="rounded-3xl p-5" style={{ background: '#F1ECF4' }}>
                <div className="mb-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-lavender)]">Ähnliche Orte</p>
                </div>
                <div className="flex flex-col gap-3">
                  {similar.map(p => (
                    <button key={p.id} onClick={() => openPlace(p.id)} className="flex items-center gap-3 text-left group">
                      <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                        <img src={p.hero} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[var(--color-aubergine)] text-sm truncate">{p.name}</p>
                        <p className="text-xs text-[var(--color-lavender)] truncate">{p.region}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <i className="fa-solid fa-star text-[var(--color-amber)] text-[9px]" />
                          <span className="text-[11px] font-semibold text-[var(--color-lavender)]">{p.rating}</span>
                        </div>
                      </div>
                      <i className="fa-solid fa-arrow-right text-[var(--color-lavender-lt)] text-sm opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

        </div>{/* Ende scrollbarer Sheet-Inhalt */}
      </div>{/* Ende mobiles Bottom-Sheet */}


      {/* ── Photo upload overlay ─────────────────────────────────────────────── */}
      {pendingUpload && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden"
            style={{ background: '#FBF9FC' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-amber)]">Foto / Video hochladen</p>
                <p className="font-display font-bold text-[var(--color-aubergine)] text-lg leading-tight mt-0.5">
                  {pendingUpload.files.length === 1 ? 'Deine Datei' : `${pendingUpload.files.length} Dateien`}
                </p>
              </div>
              <button onClick={() => setPendingUpload(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:brightness-95"
                style={{ background: '#F1ECF4', color: '#71587a' }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* Vorschau + Bildausschnitt (Fokuspunkt antippen) */}
            <div className="px-6 mb-5">
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {pendingUpload.urls.map((url, i) => {
                  const isVid = pendingUpload.files[i]?.type.startsWith('video/');
                  const c = pendingCrops[i] ?? { x: 0.5, y: 0.5 };
                  return (
                    <div key={i} className="flex-shrink-0 relative rounded-2xl overflow-hidden bg-black/5"
                      style={{ width: pendingUpload.urls.length === 1 ? '100%' : 150, aspectRatio: '3 / 2' }}
                      onClick={isVid ? undefined : e => {
                        const r = e.currentTarget.getBoundingClientRect();
                        const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
                        const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
                        setPendingCrops(prev => { const n = [...prev]; n[i] = { x, y }; return n; });
                      }}>
                      {isVid
                        ? <video src={url} muted playsInline className="w-full h-full object-cover" />
                        : <img src={url} alt="" className="w-full h-full object-cover cursor-crosshair"
                            style={{ objectPosition: `${c.x * 100}% ${c.y * 100}%` }} />}
                      {!isVid && (
                        <span className="absolute w-4 h-4 rounded-full border-2 border-white pointer-events-none"
                          style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 1px rgba(0,0,0,0.45)' }} />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: '#71587a' }}>
                <i className="fa-solid fa-crop-simple mr-1" /> So wird der Ausschnitt angezeigt — tippe aufs Bild, um den Fokuspunkt zu setzen.
              </p>
            </div>

            {/* Category picker */}
            <div className="px-6 mb-5">
              <p className="text-xs font-semibold mb-2.5" style={{ color: '#34254c' }}>Kategorie wählen</p>
              <div className="flex flex-wrap gap-2">
                {PHOTO_CATS.map(cat => (
                  <button key={cat.id} onClick={() => setPendingCat(cat.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${pendingCat === cat.id ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]' : 'bg-white text-[var(--color-lavender)] border-[#e5dcea] hover:border-[var(--color-aubergine)]'}`}>
                    {cat.id === 'alle' ? 'Keine Angabe' : cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* CC license acknowledgment */}
            <label className="mx-6 mb-6 flex items-start gap-3 cursor-pointer select-none rounded-2xl p-4"
              style={{ background: '#F1ECF4' }}>
              <div className="flex-shrink-0 mt-0.5">
                <div onClick={() => setPendingCcAccepted(v => !v)}
                  className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                  style={{ background: pendingCcAccepted ? 'var(--color-aubergine)' : 'white', border: `2px solid ${pendingCcAccepted ? 'var(--color-aubergine)' : '#D1C7DC'}` }}>
                  {pendingCcAccepted && <i className="fa-solid fa-check text-white" style={{ fontSize: 9 }} />}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold leading-snug mb-0.5" style={{ color: '#34254c' }}>
                  Ich stimme der CC BY-SA 4.0 Lizenz zu
                </p>
                <p className="text-[11px] leading-relaxed" style={{ color: '#71587a' }}>
                  Mein Foto wird unter der Creative-Commons-Lizenz (Attribution–ShareAlike 4.0) veröffentlicht.
                  Andere dürfen es teilen und weiterverwenden, solange sie mich als Urheber:in nennen und dieselbe Lizenz verwenden.
                </p>
              </div>
            </label>

            {/* Actions */}
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => setPendingUpload(null)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all hover:brightness-95"
                style={{ background: '#F1ECF4', color: '#71587a' }}>
                Abbrechen
              </button>
              <button onClick={handleConfirmUpload} disabled={!pendingCcAccepted || uploadBusy}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: 'var(--color-amber)', boxShadow: pendingCcAccepted ? '0 8px 22px rgba(249,144,57,0.4)' : 'none' }}>
                <i className={`fa-solid ${uploadBusy ? 'fa-circle-notch fa-spin' : 'fa-cloud-arrow-up'} mr-1.5`} />
                {uploadBusy ? 'Wird hochgeladen…' : 'Hochladen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rating modal ──────────────────────────────────────────────────────── */}
      {ratingOpen && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setRatingOpen(false); }}>
          <div className="w-full md:max-w-lg rounded-t-3xl md:rounded-3xl p-6 md:p-7" style={{ background: '#FBF9FC' }}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-amber)] mb-0.5">Deine Bewertung</p>
                <h3 className="font-display font-bold text-[var(--color-aubergine)] text-xl leading-tight">{place.name}</h3>
              </div>
              <button onClick={() => setRatingOpen(false)}
                className="w-8 h-8 rounded-full bg-[var(--color-bg-soft)] flex items-center justify-center text-[var(--color-lavender)] ml-4 flex-shrink-0">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="flex flex-col gap-4 mb-5">
              {RATING_CRITERIA.map(c => (
                <div key={c.key} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <i className={`fa-solid ${c.icon} text-[var(--color-lavender)] w-4 flex-shrink-0 text-sm`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-aubergine)] leading-tight">{c.label}</p>
                      <p className="text-[10px] text-[var(--color-lavender-lt)] leading-tight">{c.desc}</p>
                    </div>
                  </div>
                  <StarPicker value={ratings[c.key] ?? 0} onChange={v => setRatings(prev => ({ ...prev, [c.key]: v }))} />
                </div>
              ))}
            </div>
            <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)}
              placeholder="Optionaler Kommentar…" maxLength={280} rows={3}
              className="w-full bg-[var(--color-bg-soft)] rounded-2xl px-4 py-3 text-sm text-[var(--color-body)] placeholder:text-[var(--color-lavender-lt)] outline-none focus:ring-2 focus:ring-[var(--color-aubergine)] resize-none" />
            <p className="text-right text-[10px] text-[var(--color-lavender-lt)] mt-1 mb-4">{ratingComment.length}/280</p>
            <button onClick={handleRatingSubmit} disabled={!ratingComplete}
              className="w-full bg-[var(--color-amber)] text-white font-bold py-3.5 rounded-2xl shadow-[var(--shadow-amber)] hover:brightness-110 transition-all disabled:opacity-40 disabled:shadow-none text-sm">
              <i className="fa-solid fa-paper-plane mr-2" />Bewertung absenden · +10 Punkte
            </button>
          </div>
        </div>
      )}

      {/* ── Add to trip ───────────────────────────────────────────────────────── */}
      <BottomSheet open={addTripOpen} onClose={() => setAddTripOpen(false)} title="Zu einem Trip hinzufügen">
        {trips.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-[var(--color-lavender)] mb-4">Du hast noch keine Trips.</p>
            <button onClick={() => { setAddTripOpen(false); navigate('/trips'); }}
              className="w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-xl text-sm">Neuen Trip erstellen</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {trips.map(t => (
              <button key={t.id} onClick={async () => {
                  const { addPlaceToTrip } = useAppStore.getState();
                  await addPlaceToTrip(t.id, place.id).catch(() => {});
                  setAddTripOpen(false); navigate(`/trips/${t.id}`);
                }}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-bg-soft)] text-left">
                <i className="fa-solid fa-flag-checkered text-[var(--color-amber)]" />
                <div>
                  <div className="font-semibold text-sm text-[var(--color-aubergine)]">{t.title}</div>
                  <div className="text-xs text-[var(--color-lavender)]">{t.places.length} Orte</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* ── Lightbox ─────────────────────────────────────────────────────────── */}
      {lightboxIdx !== null && (
        <ImageLightbox
          photos={allPhotos}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          photoLikes={photoLikes}
          myLikedPhotos={myLikedPhotos}
          onLike={handleLikePhoto}
        />
      )}

      {/* ── Business Claim modal ──────────────────────────────────────────────── */}
      {claimOpen && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) { setClaimOpen(false); setClaimSent(false); } }}>
          <div className="w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden" style={{ background: '#FBF9FC' }}>

            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-lavender)] mb-0.5">Betreiber-Zugang</p>
                <h3 className="font-display font-bold text-[var(--color-aubergine)] text-xl leading-tight">
                  {claimSent ? 'Anfrage eingegangen!' : 'Diesen Ort beanspruchen'}
                </h3>
              </div>
              <button onClick={() => { setClaimOpen(false); setClaimSent(false); }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:brightness-95"
                style={{ background: '#F1ECF4', color: '#71587a' }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {claimSent ? (
              <div className="px-6 pb-8 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: '#e8f5e9' }}>
                  <i className="fa-solid fa-circle-check text-3xl" style={{ color: '#2e7d32' }} />
                </div>
                <p className="text-sm text-[var(--color-lavender)] mb-2">
                  Wir prüfen deine Anfrage und melden uns per E-Mail.
                </p>
                <p className="text-xs text-[var(--color-lavender-lt)]">
                  Nach Bestätigung kannst du Öffnungszeiten, Preise und offizielle Fotos direkt verwalten.
                </p>
                <button onClick={() => { setClaimOpen(false); setClaimSent(false); }}
                  className="mt-5 w-full py-3 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110"
                  style={{ background: 'var(--color-aubergine)' }}>
                  Schließen
                </button>
              </div>
            ) : (
              <div className="px-6 pb-6 flex flex-col gap-4">
                <p className="text-sm text-[var(--color-lavender)] -mt-1">
                  Als offizieller Betreiber kannst du Öffnungszeiten, Preise und Fotos verwalten
                  und erhältst ein <span className="font-semibold text-[var(--color-aubergine)]">„Offiziell"</span>-Badge.
                </p>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#34254c' }}>
                      Name des Unternehmens <span className="text-red-400">*</span>
                    </label>
                    <input value={claimBizName} onChange={e => setClaimBizName(e.target.value)}
                      placeholder={`z. B. ${place.name} GmbH`}
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
                      style={{ background: '#F1ECF4', color: '#34254c' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#34254c' }}>
                      Geschäftliche E-Mail <span className="text-red-400">*</span>
                    </label>
                    <input type="email" value={claimEmail} onChange={e => setClaimEmail(e.target.value)}
                      placeholder="info@meinbetrieb.de"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
                      style={{ background: '#F1ECF4', color: '#34254c' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#34254c' }}>
                      Offizielle Website
                    </label>
                    <input type="url" value={claimWebsite} onChange={e => setClaimWebsite(e.target.value)}
                      placeholder="https://www.meinbetrieb.de"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
                      style={{ background: '#F1ECF4', color: '#34254c' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#34254c' }}>
                      Kurze Nachricht (optional)
                    </label>
                    <textarea value={claimMessage} onChange={e => setClaimMessage(e.target.value)}
                      rows={2} placeholder="z. B. Ich bin der Geschäftsführer und…"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)] resize-none"
                      style={{ background: '#F1ECF4', color: '#34254c' }} />
                  </div>
                </div>

                <p className="text-[10px] text-[var(--color-lavender-lt)]">
                  Wir verifizieren jede Anfrage manuell. Kein Spam, keine automatische Veröffentlichung.
                </p>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => setClaimOpen(false)}
                    className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all hover:brightness-95"
                    style={{ background: '#F1ECF4', color: '#71587a' }}>
                    Abbrechen
                  </button>
                  <button
                    disabled={!claimBizName.trim() || !claimEmail.trim() || claimLoading}
                    onClick={async () => {
                      setClaimLoading(true);
                      try {
                        await businessApi.submitClaim({
                          placeId: place.id,
                          businessName: claimBizName.trim(),
                          contactEmail: claimEmail.trim(),
                          contactWebsite: claimWebsite.trim() || undefined,
                          message: claimMessage.trim() || undefined,
                        });
                        setClaimSent(true);
                      } catch {
                        // show toast but keep modal open
                        setToastMsg('Anfrage konnte nicht gesendet werden.');
                        setToastVisible(true);
                      } finally {
                        setClaimLoading(false);
                      }
                    }}
                    className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
                    style={{ background: 'var(--color-aubergine)' }}>
                    {claimLoading ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Anfrage senden'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Review-Prozess: Einstiegs-Pop-up (motivierend) ─────────────────────── */}
      {reviewPopup && reviewStatus && (
        <div className="fixed inset-0 z-[290] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full sm:max-w-md bg-[#FBF9FC] rounded-t-3xl sm:rounded-3xl p-6 text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(249,144,57,0.15)' }}>
              <i className="fa-solid fa-hand-sparkles text-3xl text-[var(--color-amber)]" />
            </div>
            <h2 className="font-display font-bold text-xl text-[var(--color-aubergine)] mb-2">Cool, dass du hier warst! 🎉</h2>
            <p className="text-sm text-[var(--color-body)] leading-relaxed mb-5">
              {reviewStatus.reviewCount === 0
                ? <>Du kannst <strong>die erste Person</strong> sein, die diesen Geheimtrip für uns prüft. </>
                : reviewStatus.reviewCount === 1
                  ? <>Du bist erst die <strong>zweite Person</strong>, die diesen Ort für uns prüft. </>
                  : <>Dieser Ort wurde länger nicht mehr geprüft. </>}
              Wir sammeln hier wirklich nur <strong>echte</strong> Geheimtrips — dafür brauchen wir dich: Stimmt die Beschreibung noch, oder hat sich etwas geändert? Dauert nur eine Minute und bringt dir <strong className="text-[var(--color-amber)]">+{reviewStatus.points} Punkte</strong>.
            </p>
            <button onClick={() => { setReviewPopup(false); setReviewFlowOpen(true); }}
              className="w-full bg-[var(--color-amber)] text-white font-bold py-3.5 rounded-2xl mb-2 active:scale-[0.98] transition-transform">
              <i className="fa-solid fa-clipboard-check mr-2" />Los geht's
            </button>
            <button onClick={() => { setReviewPopup(false); placesApi.dismissReview(place.id).catch(() => {}); }}
              className="w-full text-[var(--color-lavender)] font-semibold py-2 text-sm">
              Später — erinnere mich im Postfach
            </button>
            <button onClick={() => {
                setReviewPopup(false);
                setReviewStatus(s => s ? { ...s, canReview: false } : s);
                placesApi.declineReview(place.id).catch(() => {});
              }}
              className="w-full text-[var(--color-lavender-lt)] font-medium py-1.5 text-[13px]">
              Nein danke — diesen Ort möchte ich nicht prüfen
            </button>
          </div>
        </div>
      )}

      {/* ── Review-Prozess: geführter Durchlauf ─────────────────────────────────── */}
      {reviewFlowOpen && (
        <ReviewFlow placeId={place.id} placeName={place.name} sections={reviewSections}
          onClose={() => setReviewFlowOpen(false)}
          onReviewed={() => { showToast('Danke fürs Reviewen! ✓'); setReviewStatus(s => s ? { ...s, canReview: false } : s); }} />
      )}

      {/* ── Änderungen vorschlagen modal ──────────────────────────────────────── */}
      {suggestOpen && (() => {
        const CATS = [
          { id: 'inhalt',   icon: 'fa-file-lines',  label: 'Inhalt'                },
          { id: 'tipp',     icon: 'fa-lightbulb',   label: 'Tipp'                  },
          { id: 'bilder',   icon: 'fa-images',      label: 'Bilder'                },
          { id: 'zeiten',   icon: 'fa-clock',       label: 'Öffnungszeiten'        },
          { id: 'website',  icon: 'fa-globe',       label: 'Website'               },
          { id: 'social',   icon: 'fa-share-nodes', label: 'Social Media'          },
          { id: 'duplikat', icon: 'fa-copy',        label: 'Ort doppelt vorhanden' },
        ];
        const cat = CATS.find(c => c.id === suggestCategory);

        const defaultHours = [
          { label: 'Mo – Fr', open: '', close: '' },
          { label: 'Samstag', open: '', close: '' },
          { label: 'Sonntag', open: '', close: '' },
        ];
        const closeSuggest = () => {
          setSuggestOpen(false); setSuggestSent(false); setSuggestCategory(null);
          setSuggestText(''); setSuggestPhoto(null); setSuggestPhotoReason('');
          setSuggestHours(defaultHours);
        };
        const selectCat = (id: string) => {
          setSuggestCategory(id);
          if      (id === 'inhalt')  setSuggestText(place.long);
          else if (id === 'tipp')    setSuggestText(place.short);
          else if (id === 'website') setSuggestText(website ?? '');
          else                       setSuggestText('');
          setSuggestPhoto(null); setSuggestPhotoReason('');
          setSuggestHours(defaultHours);
        };
        const updateHour = (i: number, field: 'label' | 'open' | 'close', val: string) =>
          setSuggestHours(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
        const addHour    = () => setSuggestHours(prev => [...prev, { label: '', open: '', close: '' }]);
        const removeHour = (i: number) => setSuggestHours(prev => prev.filter((_, idx) => idx !== i));

        const canSubmit = suggestCategory === 'bilder'
          ? !!suggestPhoto && !!suggestPhotoReason
          : suggestCategory === 'zeiten'
          ? suggestHours.some(r => r.open.trim() || r.close.trim())
          : !!suggestText.trim();

        const handleSubmit = async () => {
          const cat = suggestCategory ?? 'sonstiges';
          let text = suggestText.trim();
          if (cat === 'bilder')      text = `Foto-Hinweis: ${suggestPhotoReason}`.trim();
          else if (cat === 'zeiten') text = 'Öffnungszeiten-Vorschlag: ' + suggestHours.filter(r => r.open.trim() || r.close.trim()).map(r => `${r.label}: ${r.open}–${r.close}`).join(', ');
          try {
            await placesApi.suggestChange(place.id, cat, text || '(ohne Text)');
            setSuggestSent(true);
            showToast('Änderungsvorschlag gesendet — danke!');
          } catch (e) {
            showToast((e as Error).message || 'Vorschlag konnte nicht gesendet werden.');
          }
        };

        const iCls  = 'w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none text-[var(--color-body)] placeholder:text-[var(--color-lavender-lt)]';
        const iStyl = { background: 'white', border: '1px solid #e5dcea' } as const;
        const lCls  = 'text-[11px] font-bold uppercase tracking-[0.08em] mb-1.5 block';

        // ── Category-specific form ──────────────────────────────────────────
        const step2Body = (() => {
          // Inhalt / Tipp — show current text + edit field
          if (suggestCategory === 'inhalt' || suggestCategory === 'tipp') {
            const isInhalt     = suggestCategory === 'inhalt';
            const currentText  = isInhalt ? place.long  : place.short;
            const currentLabel = isInhalt ? 'Aktuelle Beschreibung' : 'Aktueller Tipp';
            return (
              <div className="space-y-3">
                <div>
                  <span className={lCls} style={{ color: '#71587a' }}>{currentLabel}</span>
                  <div className="rounded-2xl px-4 py-3 text-sm max-h-28 overflow-y-auto leading-relaxed"
                    style={{ background: '#F1ECF4', color: '#34254c' }}>{currentText}</div>
                </div>
                <div>
                  <span className={lCls} style={{ color: '#71587a' }}>Mein Vorschlag</span>
                  <textarea autoFocus rows={5} placeholder="Korrigierte Version…"
                    value={suggestText} onChange={e => setSuggestText(e.target.value)}
                    className={iCls} style={iStyl} />
                </div>
              </div>
            );
          }

          // Bilder — photo grid + reason chips
          if (suggestCategory === 'bilder') {
            const REASONS = [
              'Urheberrechtsverletzung', 'Falscher Ort', 'Unangemessener Inhalt',
              'Schlechte Qualität', 'Sonstiges',
            ];
            return (
              <div className="space-y-3">
                <p className="text-sm text-[var(--color-lavender)]">Klicke auf ein Foto, das du melden möchtest:</p>
                <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                  {allPhotos.map(photo => (
                    <div key={photo.url}
                      className="aspect-square rounded-xl overflow-hidden cursor-pointer relative"
                      style={{ outline: suggestPhoto === photo.url ? '3px solid #71587a' : '2px solid transparent' }}
                      onClick={() => setSuggestPhoto(p => p === photo.url ? null : photo.url)}>
                      <img src={photo.url} loading="lazy" decoding="async" className="w-full h-full object-cover" alt="" />
                      {suggestPhoto === photo.url && (
                        <div className="absolute inset-0 flex items-center justify-center"
                          style={{ background: 'rgba(113,88,122,0.25)' }}>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center"
                            style={{ background: '#71587a' }}>
                            <i className="fa-solid fa-check text-white text-xs" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {suggestPhoto && (
                  <div>
                    <span className={lCls} style={{ color: '#71587a' }}>Grund der Meldung</span>
                    <div className="flex flex-wrap gap-2">
                      {REASONS.map(r => (
                        <button key={r}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                            suggestPhotoReason === r
                              ? 'text-white border-[var(--color-aubergine)]'
                              : 'text-[var(--color-lavender)] border-[#e5dcea] hover:border-[var(--color-aubergine)]'
                          }`}
                          style={{ background: suggestPhotoReason === r ? 'var(--color-aubergine)' : 'white' }}
                          onClick={() => setSuggestPhotoReason(r)}>{r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // Öffnungszeiten — structured row editor
          if (suggestCategory === 'zeiten') {
            return (
              <div className="space-y-3">
                {(openingHours || hoursSchedule) && (
                  <div>
                    <span className={lCls} style={{ color: '#71587a' }}>Aktuelle Öffnungszeiten</span>
                    <div className="rounded-2xl px-4 py-2 text-xs leading-relaxed"
                      style={{ background: '#F1ECF4', color: '#34254c' }}>
                      {openingHours
                        ? openingHours
                        : hoursSchedule?.map(s => `${s.open}–${s.close}`).join(' | ')}
                    </div>
                  </div>
                )}
                <div>
                  <span className={lCls} style={{ color: '#71587a' }}>Korrigierte Öffnungszeiten</span>
                  <div className="space-y-2">
                    {suggestHours.map((row, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input value={row.label} onChange={e => updateHour(i, 'label', e.target.value)}
                          placeholder="Mo – Fr"
                          className="w-24 rounded-xl px-3 py-2 text-xs outline-none"
                          style={{ background: 'white', border: '1px solid #e5dcea' }} />
                        <input value={row.open} onChange={e => updateHour(i, 'open', e.target.value)}
                          placeholder="10:00"
                          className="w-16 rounded-xl px-3 py-2 text-xs outline-none text-center"
                          style={{ background: 'white', border: '1px solid #e5dcea' }} />
                        <span className="flex-shrink-0 text-sm" style={{ color: '#b9a8c4' }}>–</span>
                        <input value={row.close} onChange={e => updateHour(i, 'close', e.target.value)}
                          placeholder="18:00"
                          className="w-16 rounded-xl px-3 py-2 text-xs outline-none text-center"
                          style={{ background: 'white', border: '1px solid #e5dcea' }} />
                        <button onClick={() => removeHour(i)}
                          className="w-7 h-7 rounded-full flex items-center justify-center hover:brightness-95"
                          style={{ background: '#F1ECF4', color: '#b9a8c4' }}>
                          <i className="fa-solid fa-xmark text-xs" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={addHour}
                    className="flex items-center gap-1.5 mt-2 text-xs font-semibold hover:opacity-80"
                    style={{ color: '#71587a' }}>
                    <i className="fa-solid fa-plus text-[10px]" /> Zeile hinzufügen
                  </button>
                </div>
              </div>
            );
          }

          // Website — show current + URL input
          if (suggestCategory === 'website') {
            return (
              <div className="space-y-3">
                {website && (
                  <div>
                    <span className={lCls} style={{ color: '#71587a' }}>Aktuelle Website</span>
                    <div className="rounded-2xl px-4 py-2.5 text-sm truncate"
                      style={{ background: '#F1ECF4', color: '#34254c' }}>{website}</div>
                  </div>
                )}
                <div>
                  <span className={lCls} style={{ color: '#71587a' }}>Korrekte URL</span>
                  <input autoFocus type="url" placeholder="https://beispiel.de"
                    value={suggestText} onChange={e => setSuggestText(e.target.value)}
                    className="w-full rounded-2xl px-4 py-3 text-sm outline-none"
                    style={iStyl} />
                </div>
              </div>
            );
          }

          // Social / Duplikat — free-form textarea
          const phs: Record<string, string> = {
            social:   'Welche Social-Media-Profile (Instagram, Facebook …) sind korrekt?',
            duplikat: 'Gibt es einen anderen Eintrag für diesen Ort? (Name oder Link)',
          };
          return (
            <textarea autoFocus rows={4} placeholder={phs[suggestCategory ?? ''] ?? ''}
              value={suggestText} onChange={e => setSuggestText(e.target.value)}
              className={iCls} style={iStyl} />
          );
        })();

        return (
          <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
            onClick={e => { if (e.target === e.currentTarget) closeSuggest(); }}>
            <div className="w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden" style={{ background: '#FBF9FC' }}>

              {/* Header */}
              <div className="flex items-start justify-between px-6 pt-6 pb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-lavender)] mb-0.5">Community</p>
                  <h3 className="font-display font-bold text-[var(--color-aubergine)] text-xl leading-tight">
                    {suggestSent ? 'Danke für deinen Hinweis!' : suggestCategory ? cat?.label : 'Was möchtest du ändern?'}
                  </h3>
                </div>
                <button onClick={closeSuggest}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ml-4 hover:brightness-95 transition-all"
                  style={{ background: '#F1ECF4', color: '#71587a' }}>
                  <i className="fa-solid fa-xmark text-sm" />
                </button>
              </div>

              {/* Body */}
              {suggestSent ? (
                /* Success state */
                <div className="px-6 pb-8 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ background: '#EDE6F3' }}>
                    <i className="fa-solid fa-circle-check text-3xl" style={{ color: '#71587a' }} />
                  </div>
                  <p className="text-sm text-[var(--color-lavender)] leading-relaxed mb-6">
                    Wir prüfen deinen Vorschlag und aktualisieren den Eintrag falls nötig. Du hilfst damit der ganzen Community!
                  </p>
                  <button onClick={closeSuggest}
                    className="w-full py-3 rounded-2xl text-sm font-bold text-white"
                    style={{ background: 'var(--color-aubergine)' }}>
                    Schließen
                  </button>
                </div>

              ) : suggestCategory ? (
                /* Step 2: category-specific form */
                <div className="px-6 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: '70dvh' }}>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl text-sm font-semibold"
                    style={{ background: '#EDE6F3', color: '#71587a' }}>
                    <i className={`fa-solid ${cat?.icon} text-sm`} />
                    {cat?.label}
                  </div>
                  {step2Body}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setSuggestCategory(null); setSuggestText(''); setSuggestPhoto(null); setSuggestPhotoReason(''); }}
                      className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all hover:brightness-95"
                      style={{ background: '#F1ECF4', color: '#71587a' }}>
                      <i className="fa-solid fa-arrow-left mr-1.5" />Zurück
                    </button>
                    <button disabled={!canSubmit} onClick={handleSubmit}
                      className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
                      style={{ background: 'var(--color-aubergine)' }}>
                      Absenden
                    </button>
                  </div>
                </div>

              ) : (
                /* Step 1: Category grid */
                <div className="px-6 pb-6">
                  <p className="text-sm text-[var(--color-lavender)] mb-4">Wähle eine Kategorie:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {CATS.map(c => (
                      <button key={c.id} onClick={() => selectCat(c.id)}
                        className="flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-semibold text-left transition-all hover:brightness-95"
                        style={{ background: '#F1ECF4', color: '#34254c' }}>
                        <i className={`fa-solid ${c.icon} text-[var(--color-lavender)] flex-shrink-0`} />
                        <span className="leading-tight">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <Toast visible={toastVisible} message={toastMsg} icon="fa-circle-check" onHide={() => setToastVisible(false)} />

      <LegalFooter />
    </AppShell>
  );
}
