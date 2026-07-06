/**
 * Thin API client — all requests go through /api (proxied to localhost:3001 in dev).
 * Replace BASE_URL for production.
 */

// Single-Origin (Standard): '/api' (Dev via Vite-Proxy, Prod same-origin).
// Getrennte Domains: VITE_API_BASE z.B. "https://api.geheimtrips.de/api".
const BASE = import.meta.env.VITE_API_BASE ?? '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('gt_token');
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...init.headers };
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Unbekannter Fehler.');
  return data as T;
}

const get  = <T>(path: string)                  => request<T>(path, { method: 'GET'    });
const post = <T>(path: string, body?: unknown)  => request<T>(path, { method: 'POST',  body: JSON.stringify(body) });
const patch= <T>(path: string, body?: unknown)  => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const put  = <T>(path: string, body?: unknown)  => request<T>(path, { method: 'PUT',   body: JSON.stringify(body) });
const del  = <T>(path: string, body?: unknown)  => request<T>(path, { method: 'DELETE',body: body ? JSON.stringify(body) : undefined });

export { ApiError };

// ─── Auth ──────────────────────────────────────────────────────────────────────

import type { User } from '../types/index.js';

export const authApi = {
  login:          (email: string, password: string)    => post<{ token: string; user: User }>('/auth/login', { email, password }),
  register:       (email: string, password: string, name: string, handle: string) =>
                    post<{ token: string; user: User }>('/auth/register', { email, password, name, handle }),
  me:             ()                                   => get<{ user: User }>('/auth/me'),
  updateMe:       (data: Partial<User>)                => patch<{ user: User }>('/auth/me', data),
  changePassword: (currentPassword: string, newPassword: string) =>
                    post<{ ok: boolean }>('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email: string) =>
                    post<{ ok: boolean }>('/auth/forgot', { email }),
  resetPassword:  (token: string, newPassword: string) =>
                    post<{ ok: boolean }>('/auth/reset', { token, newPassword }),
};

// ─── Places ────────────────────────────────────────────────────────────────────

import type { Place } from '../types/index.js';

export interface ParkingContributions {
  yes: number; no: number; limited: number; total: number;
}

export interface VisitedPlace extends Place {
  visitedAt: string | null;
  favoritePosition: number | null;
}

export interface SubmitPlacePayload {
  name:          string;
  region:        string;
  short:         string;
  long:          string;
  hero:          string;
  lat?:          number | null;
  lng?:          number | null;
  locationText?: string;
  l1Slug?:       string;
  l2Slug?:       string;
  l3Slug?:       string;
  l4Features?:   string[];
  // Neues Taxonomie-Modell
  tagSlug?:      string;
  merkmale?:     string[];
  vibes?:        string[];
  answers?:      Record<string, unknown>;
  tips?:         string[];
  mediaItems?:   { url: string; caption: string; type: string; cropX: number; cropY: number }[];
  heroCropX?:    number;
  heroCropY?:    number;
}

export interface ShowcasePlace { id: string; name: string; region: string; hero: string; tagSlug?: string | null }

export const placesApi = {
  list:           ()                 => get<Place[]>('/places'),
  showcase:       ()                 => get<ShowcasePlace[]>('/places/showcase'),
  myCreated:      ()                 => get<Place[]>('/places/me/created'),
  get:            (id: string)       => get<Place>(`/places/${id}`),
  save:           (id: string)       => post<{ saved: boolean }>(`/places/${id}/save`),
  unsave:         (id: string)       => del<{ saved: boolean }>(`/places/${id}/save`),
  visit:          (id: string)       => post<{ visited: boolean }>(`/places/${id}/visit`),
  rate:           (id: string, r: object) => post<{ ok: boolean }>(`/places/${id}/rate`, r),
  mySaved:        ()                 => get<Place[]>('/places/me/saved'),
  savedTags:      ()                 => get<Record<string, string[]>>('/places/me/saved-tags'),
  setTags:        (id: string, tags: string[]) => put<{ ok: boolean; tags: string[] }>(`/places/${id}/tags`, { tags }),
  myVisited:      ()                 => get<VisitedPlace[]>('/places/me/visited'),
  saveFavorites:  (order: string[])  => put<{ ok: boolean }>('/places/me/favorites', { order }),
  contributions:  (id: string)       => get<ParkingContributions>(`/places/${id}/contributions`),
  contribute:     (id: string, type: string, value: string) =>
                    post<{ ok: boolean }>(`/places/${id}/contribute`, { type, value }),
  likePhoto:      (id: string, url: string) =>
                    post<{ liked: boolean; count: number }>(`/places/${id}/photos/like`, { url }),
  addMedia:       (id: string, data: { url: string; type?: 'photo' | 'video'; cropX?: number; cropY?: number; caption?: string }) =>
                    post<{ ok: boolean; place: Place }>(`/places/${id}/media`, data),
  submit:         (payload: SubmitPlacePayload) =>
                    post<{ ok: boolean; id: string }>('/places/submit', payload),
  update:         (id: string, payload: SubmitPlacePayload) =>
                    patch<{ ok: boolean; id: string }>(`/places/${id}`, payload),
  // Community-Q&A
  questions:      (id: string)       => get<PlaceQuestion[]>(`/places/${id}/questions`),
  askQuestion:    (id: string, question: string) => post<{ ok: boolean }>(`/places/${id}/questions`, { question }),
  answerQuestion: (id: string, qid: number, answer: string) =>
                    post<{ ok: boolean }>(`/places/${id}/questions/${qid}/answer`, { answer }),
  deleteQuestion: (id: string, qid: number) => del<{ ok: boolean }>(`/places/${id}/questions/${qid}`),
  suggestChange:  (id: string, category: string, text: string) =>
                    post<{ ok: boolean }>(`/places/${id}/change-request`, { category, text }),
  reviewStatus:   (id: string) => get<{ canReview: boolean; needsReview: boolean; reviewCount: number; alreadyReviewed: boolean; points: number }>(`/places/${id}/review-status`),
  submitReview:   (id: string) => post<{ ok: boolean; points: number }>(`/places/${id}/review`),
  dismissReview:  (id: string) => post<{ ok: boolean }>(`/places/${id}/review-dismiss`),
};

export interface PlaceQuestion {
  id: number; askerName: string; question: string;
  answer: string | null; answeredBy: string | null; answeredAt: string | null; createdAt: string;
}

// ─── KI-Unterstützung (Gemini) ──────────────────────────────────────────────────

export interface AiPlaceCtx {
  name?: string; long?: string; highlight?: string; category?: string; location?: string;
}

export const aiApi = {
  status:          ()                  => get<{ configured: boolean }>('/ai/status'),
  placeSummary:    (ctx: AiPlaceCtx)   => post<{ summary: string }>('/ai/place-summary', ctx),
  placeDescription:(ctx: AiPlaceCtx)   => post<{ description: string }>('/ai/place-description', ctx),
  placeTips:       (ctx: AiPlaceCtx & { count?: number }) => post<{ tips: string[] }>('/ai/place-tips', ctx),
};

// ─── Trips ─────────────────────────────────────────────────────────────────────

import type { Trip } from '../types/index.js';

export const tripsApi = {
  list:           ()               => get<Trip[]>('/trips'),
  curated:        ()               => get<Trip[]>('/trips/curated'),
  get:            (id: number)     => get<Trip>(`/trips/${id}`),
  create:         (data: object)   => post<Trip>('/trips', data),
  update:         (id: number, d: object) => patch<Trip>(`/trips/${id}`, d),
  delete:         (id: number)     => del<{ ok: boolean }>(`/trips/${id}`),
  reorderPlaces:  (id: number, places: object[]) => put<{ ok: boolean }>(`/trips/${id}/places`, { places }),
  addPlace:       (id: number, placeId: string) => post<{ ok: boolean }>(`/trips/${id}/places/${placeId}`),
  removePlace:    (id: number, placeId: string) => del<{ ok: boolean }>(`/trips/${id}/places/${placeId}`),
  saveOvernights: (id: number, overnights: object[]) => put<{ ok: boolean }>(`/trips/${id}/overnights`, { overnights }),
  invite:         (id: number, handle: string) => post<{ ok: boolean }>(`/trips/${id}/invite`, { handle }),
  respond:        (id: number, status: 'accepted' | 'declined') => post<{ ok: boolean }>(`/trips/${id}/respond`, { status }),
  removeParticipant: (id: number, userId: number) => del<{ ok: boolean }>(`/trips/${id}/participants/${userId}`),
  vote:           (id: number, placeId: string, vote: 'yes' | 'maybe' | 'no') => post<{ ok: boolean }>(`/trips/${id}/vote`, { placeId, vote }),
};

// ─── Rankings ──────────────────────────────────────────────────────────────────

import type { RankingEntry } from '../types/index.js';

export interface QuizRankEntry {
  userId:      number;
  name:        string;
  handle:      string;
  avatarUrl:   string | null;
  gamesPlayed: number;
  gamesWon:    number;
  winRate:     number;
}

export interface QuizMeStats {
  gamesPlayed: number;
  gamesWon:    number;
  gamesLost:   number;
  winRate:     number;
}

import type { RankBoardId, PerkEntry } from '../types/index.js';

export interface MyRankStats {
  id: number; name: string; handle: string; avatarUrl: string | null;
  orte: number; eingereicht: number; reviewed: number; quizWins: number; quizPlayed: number; winRate: number; punkte: number;
  mOrte: number; mEingereicht: number; mReviewed: number; mQuizWins: number; mScore: number;
  percentile: number; tierKey: string; isLocalHero: boolean;
  total: number;
  ranks: { gesamt: number | null; orte: number | null; eingereicht: number | null; quiz: number | null };
}

export const rankingsApi = {
  leaderboard:       (board: RankBoardId, friends = false) =>
                       get<RankingEntry[]>(`/rankings/leaderboard?board=${board}${friends ? '&friends=1' : ''}`),
  me:                ()                    => get<MyRankStats>('/rankings/me'),
  perks:             (board?: RankBoardId) => get<PerkEntry[]>(`/rankings/perks${board ? `?board=${board}` : ''}`),
  quizLeaderboard:   ()                    => get<QuizRankEntry[]>('/rankings/geheimquiz'),
  quizMe:            ()                    => get<QuizMeStats>('/rankings/geheimquiz/me'),
};

// ─── Benachrichtigungen (Punkt im Header) ───────────────────────────────────────
export interface InboxItem {
  type: 'friend_request' | 'question' | 'change_request' | 'trip_invite' | 'trip_accept' | 'friend_accept' | 'review_reminder' | 'tax_moderation';
  id: string; title: string; body: string; link: string; createdAt: string;
}

export const notificationsApi = {
  count: () => get<{ count: number; ratings: number; likes: number; requests: number; questions?: number; changes?: number; events?: number }>('/notifications/count'),
  list:  () => get<InboxItem[]>('/notifications/list'),
  seen:  () => post<{ ok: boolean }>('/notifications/seen'),
};

// ─── Business ──────────────────────────────────────────────────────────────────

export type ClaimStatus = 'pending' | 'approved' | 'rejected';

export interface BusinessClaim {
  id: number; placeId: string; userId: number;
  businessName: string; contactEmail: string; contactWebsite?: string;
  message?: string; status: ClaimStatus; adminNote?: string;
  reviewedAt?: string; createdAt: string;
}

export interface BusinessProfile {
  id: number; userId: number; companyName: string; companyEmail: string;
  companyWebsite?: string; description?: string;
  isVerified: boolean; verifiedAt?: string; createdAt: string;
}

export interface PriceEntry {
  label: string; amount: string; from?: boolean; note?: string;
}

export interface HourSlot {
  months: number[]; open: string; close: string; lastEntry?: string;
}

export interface BusinessAttributes {
  website?: string | null;
  hoursSchedule?: HourSlot[] | null;
  hoursUrl?: string | null;
  prices?: PriceEntry[] | null;
  pricesUrl?: string | null;
  specialInfo?: string[] | null;
}

export const businessApi = {
  // Claims
  submitClaim: (data: { placeId: string; businessName: string; contactEmail: string; contactWebsite?: string; message?: string }) =>
    post<{ ok: boolean; claimId: number }>('/business/claim', data),
  myClaims: () => get<BusinessClaim[]>('/business/claims/me'),

  // Profile
  getProfile: () => get<{ profile: BusinessProfile | null; managedPlaces: Place[] }>('/business/profile'),

  // Update place attributes (business owner)
  updateAttributes: (placeId: string, attrs: BusinessAttributes) =>
    put<{ ok: boolean }>(`/business/places/${placeId}/attributes`, attrs),
};

// ─── Media ─────────────────────────────────────────────────────────────────────

export const mediaApi = {
  upload: async (file: File): Promise<{ url: string }> => {
    const token = localStorage.getItem('gt_token');
    const form  = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res  = await fetch(`${BASE}/media/upload`, { method: 'POST', body: form, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? 'Upload fehlgeschlagen.');
    return data as { url: string };
  },
};

// ─── Geo / Isochronen ──────────────────────────────────────────────────────────

import type { IsochroneResponse, RouteResponse } from '../utils/geo.js';

export const geoApi = {
  /** Reichweiten-Polygon: wie weit komme ich in X Minuten mit diesem Verkehrsmittel? */
  isochrone: (lat: number, lng: number, mode: string, minutes: number) =>
    get<IsochroneResponse>(`/geo/isochrone?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&mode=${mode}&minutes=${minutes}`),
  /** Echte Wegeführung + Zeit/Distanz zwischen Trip-Stopps */
  route: (mode: string, points: { lat: number; lng: number }[]) =>
    get<RouteResponse>(`/geo/route?mode=${mode}&points=${points.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')}`),
};

// ─── Discover (lernendes Entdecken) ────────────────────────────────────────────

export interface DiscoverPrefs {
  exists: boolean;
  transport?: string | null;
  transports?: string[];
  companions?: string[];
  locationConsent?: boolean;
  gender?: string | null;
  birthYear?: number | null;
}

export type DeckPlace = Place & { matchScore: number };

export const discoverApi = {
  prefs:     () => get<DiscoverPrefs>('/discover/prefs'),
  savePrefs: (p: Partial<DiscoverPrefs>) => put<{ ok: boolean }>('/discover/prefs', p),
  swipe:     (placeId: string, action: 'like' | 'dislike' | 'click' | 'skip', dwellMs: number) =>
               post<{ ok: boolean }>('/discover/swipe', { placeId, action, dwellMs }),
  deck:      (params: { lat?: number; lng?: number; mode?: string; minutes?: number; limit?: number; includeKnown?: boolean }) => {
    const q = new URLSearchParams();
    if (params.lat != null && params.lng != null) { q.set('lat', String(params.lat)); q.set('lng', String(params.lng)); }
    if (params.mode) q.set('mode', params.mode);
    if (params.minutes) q.set('minutes', String(params.minutes));
    if (params.limit) q.set('limit', String(params.limit));
    if (params.includeKnown) q.set('includeKnown', '1');
    return get<DeckPlace[]>(`/discover/deck?${q}`);
  },
  categoryAffinity: () => get<Record<string, number>>('/discover/category-affinity'),
};

// ─── Kategorien (Haupt-Browse) ──────────────────────────────────────────────────

import type { CategoryDef } from '../types/index.js';

export interface MerkmalOverride { l3Slug: string; key: string; label: string; hidden: number }

export const categoriesApi = {
  list:     () => get<CategoryDef[]>('/categories'),
  // DB-Overrides der Merkmale (neu hinzugefügt / ausgeblendet) — fürs Anlege-Formular
  merkmale: () => get<MerkmalOverride[]>('/categories/merkmale'),
  // DB-Overrides der Haupt-/Unterkategorien — fürs Anlege-Formular
  taxonomyNodes: () => get<TaxNodeDto[]>('/categories/taxonomy-nodes'),
};

export interface TaxNodeDto {
  level: number; slug: string; label: string | null; icon: string | null;
  parentSlug: string | null; hidden: number; isCustom: number; sort?: number;
}

// ─── Friends ───────────────────────────────────────────────────────────────────

import type { Friend, FriendRequest } from '../types/index.js';

export const friendsApi = {
  list:     ()              => get<Friend[]>('/friends'),
  requests: ()              => get<FriendRequest[]>('/friends/requests'),
  request:  (handle: string) => post<{ ok: boolean }>(`/friends/request/${handle}`),
  accept:   (id: number)    => post<{ ok: boolean }>(`/friends/accept/${id}`),
  decline:  (id: number)    => del<{ ok: boolean }>(`/friends/decline/${id}`),
};

// ─── Neue Leute kennenlernen (Phase C) ──────────────────────────────────────────
export interface PersonSuggestion {
  id: number; name: string; handle: string; avatarUrl: string | null; bio: string; age: number | null;
  sharedCount: number; sharedPlaces: string[]; isLocalHero: boolean; distanceKm: number | null;
}
export const peopleApi = {
  suggestions: () => get<{ meetPeopleEnabled: boolean; hasLocation: boolean; suggestions: PersonSuggestion[] }>('/people/suggestions'),
  updateLocation: (lat: number, lng: number) => post<{ ok: true }>('/people/location', { lat, lng }),
  clearLocation: () => del<{ ok: true }>('/people/location'),
};

// ─── Neue Taxonomie (Tags · Merkmale · Vibes) ────────────────────────────────────
export interface TaxGroup { slug: string; label: string; icon: string; color: string }
export interface TaxTag { slug: string; label: string; groups: string[] }
export interface TaxTerm { slug: string; label: string }
export interface TaxVocab { groups: TaxGroup[]; tags: TaxTag[]; merkmale: TaxTerm[]; vibes: TaxTerm[] }
export const taxonomyApi = {
  vocab:       ()               => get<TaxVocab>('/taxonomy'),
  suggestions: (tagSlug: string) => get<{ merkmale: TaxTerm[]; vibes: TaxTerm[] }>(`/taxonomy/tag/${tagSlug}/suggestions`),
  resolve:     (tag: string, merkmale: string[], vibes: string[]) =>
                 post<{ tag: string; merkmale: string[]; vibes: string[] }>('/taxonomy/resolve', { tag, merkmale, vibes }),
};

// ─── Öffentliche Profile (reale Nutzer:innen) ──────────────────────────────────
export type FriendStatus = 'self' | 'none' | 'pending_out' | 'pending_in' | 'friends';
export interface PublicUser {
  id: number; name: string; handle: string; avatarUrl: string | null; bio: string | null;
  instagram: string | null; tiktok: string | null; website: string | null;
  isLocalHero: boolean; placeCount: number;
  friendStatus: FriendStatus; pendingRequestId: number | null;
  places: Place[];
}
export const usersApi = {
  get: (id: number) => get<PublicUser>(`/users/${id}`),
};
