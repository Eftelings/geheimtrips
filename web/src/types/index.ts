// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  name: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  age: number | null;
  instagram: string | null;
  tiktok: string | null;
  website: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  profileVisible: boolean;
  notificationsEnabled: boolean;
  playVideos: boolean;
  meetPeopleEnabled: boolean;
  createdAt: string;
}

// ─── Places ───────────────────────────────────────────────────────────────────

export interface Place {
  id: string;
  name: string;
  region: string;
  category: PlaceCategory;
  categoryLabel: string;
  tagSlug?: string | null;   // primärer Typ-Tag
  tagSlugs?: string[];       // alle Typ-Tags (z.B. Restaurant + Café)
  vibe: string[];
  distanceMin: number;
  distanceLabel: string;
  cost: 1 | 2 | 3;
  costLabel: string;
  rating: number;
  reviews: number;
  saves: number;
  match: number;
  short: string;
  long: string;
  hero: string;
  gallery: string[];
  tips: string[];
  highlights?: PlaceHighlight[];   // Must-sees bei Erlebnis-Orten (Freizeitpark, Museum …)
  attributes: Record<string, unknown>;
  authorId: number | null;
  author?: Author | null;
  submittedBy?: number | null;
  submitter?: { id: number; name: string; handle: string; avatarUrl: string | null; isLocalHero?: boolean } | null;
  lat: number | null;
  lng: number | null;
  hasVideo: boolean;
  isUserSubmitted: boolean;
  isOfficiallyManaged: boolean;
  businessProfileId: number | null;
  parking: 'free' | 'paid' | 'limited' | null;
  approvedClaim?: { businessName: string; contactWebsite: string | null } | null;
  galleryCrops?: Record<string, { cropX: number; cropY: number }>;
  heroCropX?: number;
  heroCropY?: number;
  photoLikes?: Record<string, number>;
  captions?: Record<string, string>;
  photoAuthors?: Record<string, { name: string; avatarUrl: string | null }>;
  savers?: { name: string; avatarUrl: string | null }[];
  saverCount?: number;
  createdAt: string;
}

export type PlaceCategory = 'natur' | 'kultur' | 'genuss' | 'aktiv' | 'mystisch' | 'wasser';

/** Ein „Das musst du sehen"-Highlight eines Ortes (z.B. eine Achterbahn, ein Gemälde). */
export interface PlaceHighlight {
  title: string;
  description: string;
  photos: string[];   // mind. 1 Foto-URL
}

// Backend-Kategorie (im Admin editierbar). slug = places.category bei den Standard-6.
export interface CategoryDef {
  id: number;
  slug: string;
  label: string;
  icon: string;
  color: string | null;
  keywords: string | null;   // CSV: zusätzliche Treffer per Stichwort
  sort: number;
  active: boolean;
}

// Fallback, falls das Backend (noch) nicht antwortet
export const CATEGORIES: CategoryDef[] = [
  { id: 1, slug: 'natur',    label: 'Natur',     icon: 'fa-leaf',          color: '#5B8F6E', keywords: '', sort: 0, active: true },
  { id: 2, slug: 'kultur',   label: 'Kultur',    icon: 'fa-landmark',      color: '#8A6FB3', keywords: '', sort: 1, active: true },
  { id: 3, slug: 'genuss',   label: 'Genuss',    icon: 'fa-mug-hot',       color: '#D97757', keywords: '', sort: 2, active: true },
  { id: 4, slug: 'aktiv',    label: 'Aktiv',     icon: 'fa-person-hiking', color: '#F99039', keywords: '', sort: 3, active: true },
  { id: 5, slug: 'mystisch', label: 'Mystisch',  icon: 'fa-user-secret',   color: '#4A8C7A', keywords: '', sort: 4, active: true },
  { id: 6, slug: 'wasser',   label: 'Am Wasser', icon: 'fa-water',         color: '#3E7CB1', keywords: '', sort: 5, active: true },
];

// ─── Authors ──────────────────────────────────────────────────────────────────

export interface Author {
  id: number;
  name: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  avatarColor: string;
  instagram: string | null;
  tiktok: string | null;
  website: string | null;
  placeCount: number;
  savedCount: number;
  avgStars: number;
}

// ─── Mobility / Transport ─────────────────────────────────────────────────────

export type Transport = 'walk' | 'bike' | 'transit' | 'train' | 'auto';

export interface MobilityOption {
  id: Transport;
  label: string;
  sublabel: string;
  icon: string;
  speedKmh: number;   // for route time calculations
  co2free: boolean;
}

export const MOBILITY: MobilityOption[] = [
  { id: 'walk',    label: 'Zu Fuß',          sublabel: 'Bummeln',              icon: 'fa-person-walking', speedKmh: 5,   co2free: true  },
  { id: 'bike',    label: 'Rad',             sublabel: 'Eigene Kraft',         icon: 'fa-bicycle',        speedKmh: 15,  co2free: true  },
  { id: 'transit', label: 'Bus & Bahn',      sublabel: 'Deutschlandticket',    icon: 'fa-train-subway',   speedKmh: 40,  co2free: true  },
  { id: 'train',   label: 'Fernverkehr',     sublabel: 'IC / ICE',             icon: 'fa-train',          speedKmh: 100, co2free: false },
  { id: 'auto',    label: 'Auto',            sublabel: '',                     icon: 'fa-car',            speedKmh: 80,  co2free: false },
];

// ─── Funnel ───────────────────────────────────────────────────────────────────

export type WhenOption = 'jetzt' | 'morgen' | 'wochenende' | 'irgendwann';
export type BudgetOption = 'kostenlos' | 'günstig' | 'moderat' | 'egal';
export type SocialOption = 'allein' | 'freunde' | 'date' | 'neue-leute';

export interface FunnelAnswers {
  when: WhenOption | null;
  location: string;
  coords?: { lat: number; lng: number } | null;  // GPS-Koordinaten wenn bekannt
  transport: Transport | null;
  distanceMin: number;          // in minutes, steps of 10
  budget: BudgetOption | null;
  vibe: [number, number, number, number]; // 0–100 each
  social: SocialOption | null;
  meetPeople: boolean;
}

export const VIBE_AXES = [
  { left: 'Stadt',     right: 'Natur',    key: 'stadtNatur'   },
  { left: 'Adrenalin', right: 'Kultur',   key: 'adrenalinKultur' },
  { left: 'Genuss',    right: 'Bewegung', key: 'genussBewegung' },
  { left: 'Bekannt',   right: 'Geheim',   key: 'bekanntGeheim' },
] as const;

// ─── Trips ────────────────────────────────────────────────────────────────────

export interface TripPlace {
  id: number;
  tripId: number;
  placeId: string;
  position: number;
  dayIndex: number;
  notes: string;
  place: Place;
}

export interface TripOvernight {
  id: number;
  tripId: number;
  afterDayIndex: number;
  hotelId: string | null;
  hotelName: string | null;
  hotelPrice: number | null;
  hotelLat?: number | null;
  hotelLng?: number | null;
}

export interface Trip {
  id: number;
  userId: number;
  title: string;
  subtitle: string;
  intro?: string;              // Teaser-Text (kuratierte Trips)
  hero: string | null;
  transport: Transport;
  startDate: string | null;
  endDate: string | null;
  persons: number;
  costsJson?: string;          // manuelle Kosten { transportCost, foodPerDay, startLocation }
  // Start-/Endpunkt (gemeinsame Trips) — Ziele sind die places dazwischen
  startLabel?: string | null;
  startLat?: number | null;
  startLng?: number | null;
  endLabel?: string | null;
  endLat?: number | null;
  endLng?: number | null;
  isCurated: boolean;
  isOwner?: boolean;           // von GET /trips/:id gesetzt
  myStatus?: 'owner' | 'invited' | 'accepted' | 'declined' | null;
  participants?: TripParticipant[];
  votes?: Record<string, TripVoteTally>;   // placeId → Abstimmungs-Stand
  createdAt: string;
  places: TripPlace[];
  overnights: TripOvernight[];
}

// Mitreisende:r eines Trips
export interface TripParticipant {
  userId: number;
  name: string;
  handle: string;
  avatarUrl: string | null;
  status: 'invited' | 'accepted' | 'declined';
}

// Abstimmungs-Stand eines Ortes im Trip
export interface TripVoteTally {
  yes: number;
  maybe: number;
  no: number;
  myVote: 'yes' | 'maybe' | 'no' | null;
}

// ─── Hotels (demo data) ───────────────────────────────────────────────────────

export interface Hotel {
  id: string;
  name: string;
  stars: number;
  rating: number;
  ratingLabel: string;
  pricePerNight: number;
  provider: 'Booking' | 'HRS';
  image: string;
}

export const DEMO_HOTELS: Hotel[] = [
  { id: 'h1', name: 'Landhotel Waldblick', stars: 3, rating: 8.4, ratingLabel: 'Sehr gut', pricePerNight: 89,  provider: 'Booking', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&auto=format&fit=crop&q=70' },
  { id: 'h2', name: 'Boutique Hotel Elztal', stars: 4, rating: 9.1, ratingLabel: 'Ausgezeichnet', pricePerNight: 139, provider: 'HRS', image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400&auto=format&fit=crop&q=70' },
  { id: 'h3', name: 'Pension am Fluss', stars: 2, rating: 7.8, ratingLabel: 'Gut', pricePerNight: 65,  provider: 'Booking', image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=400&auto=format&fit=crop&q=70' },
];

// ─── Rankings ─────────────────────────────────────────────────────────────────

export interface Level {
  level: number;
  label: string;
  minPoints: number;
}

export const GT_LEVELS: Level[] = [
  { level: 1, label: 'Entdecker:in',  minPoints: 0   },
  { level: 2, label: 'Sammler:in',    minPoints: 50  },
  { level: 3, label: 'Kenner:in',     minPoints: 150 },
  { level: 4, label: 'Insider:in',    minPoints: 350 },
  { level: 5, label: 'Legende',       minPoints: 700 },
];

export interface RankingEntry {
  id: number;
  name: string;
  handle: string;
  avatarUrl: string | null;
  // All-time
  orte: number;
  eingereicht: number;
  reviewed: number;
  quizWins: number;
  quizPlayed: number;
  winRate: number;
  punkte: number;
  // Dieser Monat
  mOrte: number;
  mEingereicht: number;
  mReviewed: number;
  mQuizWins: number;
  mScore: number;
  // Monats-Status (abgeleitet)
  percentile: number;
  tierKey: string;
  isLocalHero: boolean;
}

// Ranking-Boards: Gesamt (monatlich) · besuchte / eingereichte Orte · Geheimquiz
export type RankBoardId = 'gesamt' | 'orte' | 'eingereicht' | 'quiz';

// Legacy-Board für Partner-Vorteile (Perks-Verwaltung im Admin)
export type PerkBoardId = 'orte' | 'quiz' | 'punkte';

// Partner-Vorteil (vom Backend verwaltet)
export interface PerkEntry {
  id: number;
  board: PerkBoardId;
  minRank: number;
  maxRank: number;
  partner: string;
  title: string;
  discount: string | null;
  logoUrl: string | null;
  terms: string | null;
  redeemUrl: string | null;
  validUntil: string | null;
  active: boolean;
  sort: number;
}

// ─── Ratings ──────────────────────────────────────────────────────────────────

export interface Rating {
  stars: number;
  mood?: number;
  descriptionAccurate?: number;
  timeSpent?: '<1h' | '1-3h' | 'halber-tag' | 'tagesfüllend';
  companions?: string[];
}

// ─── Friend ───────────────────────────────────────────────────────────────────

export interface Friend {
  id: number;
  name: string;
  handle: string;
  avatarUrl: string | null;
  bio?: string;
}

export interface FriendRequest extends Friend {
  friendshipId: number;
}
