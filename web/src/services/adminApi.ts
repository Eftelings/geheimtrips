const BASE = (import.meta.env.VITE_API_BASE ?? '/api') + '/admin';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('gt_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Fehler');
  return data as T;
}

const get    = <T>(p: string)               => request<T>(p);
const post   = <T>(p: string, b?: unknown)  => request<T>(p, { method: 'POST',   body: JSON.stringify(b) });
const patch  = <T>(p: string, b?: unknown)  => request<T>(p, { method: 'PATCH',  body: JSON.stringify(b) });
const del    = <T>(p: string)               => request<T>(p, { method: 'DELETE' });

export interface AdminStats {
  stats: {
    users: number; places: number; visits: number;
    media: number; trips: number; openReports: number; pendingSubmissions: number;
  };
  recentVisits: { userId: number; placeId: string; visitedAt: string }[];
}

export interface AdminUser {
  id: number; email: string; name: string; handle: string;
  isAdmin: boolean; isBanned: boolean; createdAt: string; profileVisible: boolean;
}

export interface AdminPlace {
  id: string; name: string; region: string; category: string; categoryLabel: string;
  short: string; long: string; hero: string; cost: number; costLabel: string;
  distanceMin: number; distanceLabel: string; lat: number | null; lng: number | null;
  rating: number; reviews: number; saves: number; isUserSubmitted: boolean;
  authorId: number | null; vibe: string[]; gallery: string[]; tips: string[];
  parking: 'free' | 'paid' | 'limited' | null;
  createdAt: string;
}

export interface AdminReport {
  id: number; reporterName: string; reporterEmail: string;
  placeId: string | null; mediaId: number | null;
  description: string; infringingUrl: string | null;
  rightDescription: string | null;
  status: 'open' | 'in_review' | 'resolved' | 'dismissed';
  adminNote: string | null; resolvedAt: string | null; createdAt: string;
}

export interface AdminAuthor {
  id: number; name: string; handle: string; bio: string | null;
  avatarColor: string; instagram: string | null; tiktok: string | null; website: string | null;
  placeCount: number; savedCount: number; avgStars: number;
}

export interface AdminClaim {
  id: number; placeId: string; userId: number;
  businessName: string; contactEmail: string; contactWebsite?: string; message?: string;
  status: 'pending' | 'approved' | 'rejected'; adminNote?: string;
  reviewedAt?: string; createdAt: string;
  place?: { id: string; name: string };
  user?: { id: number; name: string; email: string };
}

export interface AdminPerk {
  id: number;
  board: 'orte' | 'quiz' | 'punkte';
  minRank: number; maxRank: number;
  partner: string; title: string;
  discount: string | null; logoUrl: string | null;
  terms: string | null; redeemUrl: string | null; validUntil: string | null;
  active: boolean; sort: number;
}

export interface AdminCategory {
  id: number; slug: string; label: string; icon: string;
  color: string | null; keywords: string | null; sort: number; active: boolean;
}

export interface PlaceQuality {
  id: string; name: string; region: string;
  accuracyAvg: number | null; accuracyCount: number;
  starsAvg: number | null; ratingCount: number;
}

export interface MailStatus {
  provider: 'resend' | 'smtp' | 'none';
  configured: boolean;
  host: string | null; port: number; secure: boolean;
  user: string | null; hasAuth: boolean; hasPass: boolean; from: string;
  hasResendKey: boolean;
  verify: { ok: boolean; error?: string };
}

export const adminApi = {
  stats:       ()           => get<AdminStats>('/stats'),
  // E-Mail-Versand (SMTP) Diagnose
  mailStatus:  ()           => get<MailStatus>('/mail/status'),
  mailTest:    (to: string) => post<{ ok: boolean; error?: string }>('/mail/test', { to }),
  // Perks
  perks:       ()           => get<AdminPerk[]>('/perks'),
  createPerk:  (d: object)  => post<AdminPerk>('/perks', d),
  updatePerk:  (id: number, d: object) => patch<AdminPerk>(`/perks/${id}`, d),
  deletePerk:  (id: number) => del<{ ok: boolean }>(`/perks/${id}`),
  // Categories
  categories:      ()           => get<AdminCategory[]>('/categories'),
  createCategory:  (d: object)  => post<AdminCategory>('/categories', d),
  updateCategory:  (id: number, d: object) => patch<AdminCategory>(`/categories/${id}`, d),
  deleteCategory:  (id: number) => del<{ ok: boolean }>(`/categories/${id}`),
  // Places
  places:      ()           => get<AdminPlace[]>('/places'),
  placesQuality: ()         => get<PlaceQuality[]>('/places/quality'),
  createPlace: (d: object)  => post<{ ok: boolean }>('/places', d),
  updatePlace: (id: string, d: object) => patch<{ ok: boolean }>(`/places/${id}`, d),
  deletePlace: (id: string) => del<{ ok: boolean }>(`/places/${id}`),
  // Users
  users:       ()           => get<AdminUser[]>('/users'),
  updateUser:  (id: number, d: object) => patch<{ ok: boolean }>(`/users/${id}`, d),
  deleteUser:  (id: number) => del<{ ok: boolean }>(`/users/${id}`),
  // Submissions
  submissions: ()            => get<AdminPlace[]>('/submissions'),
  approveSubmission: (id: string) => patch<{ ok: boolean }>(`/submissions/${id}/approve`),
  rejectSubmission:  (id: string) => del<{ ok: boolean }>(`/submissions/${id}`),
  // Takedown
  reports:     ()           => get<AdminReport[]>('/takedown'),
  updateReport:(id: number, d: object) => patch<{ ok: boolean }>(`/takedown/${id}`, d),
  deleteMedia: (id: number) => del<{ ok: boolean }>(`/media/${id}`),
  // Authors
  authors:     ()           => get<AdminAuthor[]>('/authors'),
  createAuthor:(d: object)  => post<AdminAuthor>('/authors', d),
  // Business claims
  claims:        ()           => get<AdminClaim[]>('/claims'),
  approveClaim:  (id: number) => patch<{ ok: boolean }>(`/claims/${id}/approve`),
  rejectClaim:   (id: number, d?: { adminNote?: string }) => patch<{ ok: boolean }>(`/claims/${id}/reject`, d ?? {}),
};
