import type { TaxonomyNode as TaxNode } from '../data/effectiveTaxonomy.js';

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

export interface AdminBusinessAccount {
  id: number; userId: number; companyName: string; companyEmail: string;
  companyWebsite: string | null; description: string | null;
  isVerified: boolean; verifiedAt: string | null; createdAt: string;
  user: { id: number; name: string; email: string; handle: string } | null;
  places: { id: string; name: string }[];
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

export interface AdminChangeRequest {
  id: number; placeId: string; placeName: string | null; userName: string;
  category: string; text: string; status: 'open' | 'done' | 'dismissed'; createdAt: string;
}

export interface MerkmalRow { l3Slug: string; key: string; label: string; hidden: number }
export interface MerkmaleData {
  db: MerkmalRow[];
  usage: { l3Slug: string; key: string; count: number }[];
}

export const adminApi = {
  stats:       ()           => get<AdminStats>('/stats'),
  // E-Mail-Versand (SMTP) Diagnose
  mailStatus:  ()           => get<MailStatus>('/mail/status'),
  mailTest:    (to: string) => post<{ ok: boolean; error?: string }>('/mail/test', { to }),
  // Merkmale (Features) verwalten
  merkmale:       ()                                  => get<MerkmaleData>('/merkmale'),
  addMerkmal:     (l3Slug: string, label: string)     => post<{ ok: boolean; key: string }>('/merkmale', { l3Slug, label }),
  mergeMerkmal:   (l3Slug: string, fromKey: string, toKey: string) =>
                    post<{ ok: boolean; changed: number }>('/merkmale/merge', { l3Slug, fromKey, toKey }),
  deleteMerkmal:  (l3Slug: string, key: string, mode: 'remove' | 'reassign', toKey?: string) =>
                    post<{ ok: boolean; changed: number }>('/merkmale/delete', { l3Slug, key, mode, toKey }),
  restoreMerkmal: (l3Slug: string, key: string)       => post<{ ok: boolean }>('/merkmale/restore', { l3Slug, key }),
  // Haupt-/Unterkategorien (Taxonomie-Overrides)
  taxonomyNodes:  ()  => get<TaxNode[]>('/taxonomy-nodes'),
  addTaxNode:     (level: 2 | 3, label: string, parentSlug: string, icon?: string) =>
                    post<{ ok: boolean; slug: string }>('/taxonomy-nodes', { level, label, parentSlug, icon }),
  editTaxNode:    (level: 2 | 3, slug: string, d: { label?: string; icon?: string; parentSlug?: string }) =>
                    patch<{ ok: boolean }>('/taxonomy-nodes', { level, slug, ...d }),
  hideTaxNode:    (level: 2 | 3, slug: string) => post<{ ok: boolean }>('/taxonomy-nodes/hide', { level, slug }),
  restoreTaxNode: (level: 2 | 3, slug: string) => post<{ ok: boolean }>('/taxonomy-nodes/restore', { level, slug }),
  // Fragen-CMS: pro Typ-Tag steuern, welche Einreichungs-Fragen gestellt werden
  questionsConfig: () => get<Record<string, Record<string, boolean>>>('/questions-config'),
  toggleQuestion:  (tagSlug: string, questionId: string, enabled: boolean) =>
                     post<{ ok: boolean }>('/questions-config/toggle', { tagSlug, questionId, enabled }),
  resetQuestions:  (tagSlug: string, questionId?: string) =>
                     post<{ ok: boolean }>('/questions-config/reset', { tagSlug, questionId }),
  // Änderungsanfragen
  changeRequests:       ()  => get<AdminChangeRequest[]>('/change-requests'),
  resolveChangeRequest: (id: number, status: 'open' | 'done' | 'dismissed') =>
                          patch<{ ok: boolean }>(`/change-requests/${id}`, { status }),
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
  // Business-Accounts (Admin legt Unternehmen direkt an)
  businessAccounts: () => get<AdminBusinessAccount[]>('/business-accounts'),
  createBusinessAccount: (d: { companyName: string; companyEmail: string; companyWebsite?: string; description?: string; placeIds?: string[] }) =>
    post<{ ok: boolean; tempPassword: string; email: string; userId: number; profileId: number; assigned: string[] }>('/business-accounts', d),
  // Taxonomie-Moderation (neues Modell)
  taxPending:        () => get<TaxPending>('/tax/pending'),
  taxApproveMerkmal: (slug: string) => post<{ ok: boolean }>(`/tax/merkmal/${encodeURIComponent(slug)}/approve`),
  taxDeleteMerkmal:  (slug: string) => del<{ ok: boolean }>(`/tax/merkmal/${encodeURIComponent(slug)}`),
  taxApproveVibe:    (slug: string) => post<{ ok: boolean }>(`/tax/vibe/${encodeURIComponent(slug)}/approve`),
  taxDeleteVibe:     (slug: string) => del<{ ok: boolean }>(`/tax/vibe/${encodeURIComponent(slug)}`),
  taxLink:           (tagSlug: string, merkmalSlug: string, approve: boolean) => post<{ ok: boolean }>('/tax/link', { tagSlug, merkmalSlug, approve }),
  taxMerge:          (aliasSlug: string, canonicalSlug: string, kind: 'merkmal' | 'vibe') => post<{ ok: boolean }>('/tax/merge', { aliasSlug, canonicalSlug, kind }),
  // Live-Taxonomie verwalten (das, was die App wirklich nutzt)
  taxAll:        ()  => get<TaxAll>('/tax/all'),
  taxAddGroup:   (label: string, icon?: string, color?: string) => post<{ ok: boolean; slug: string }>('/tax/group', { label, icon, color }),
  taxEditGroup:  (slug: string, d: { label?: string; icon?: string; color?: string }) => patch<{ ok: boolean }>('/tax/group', { slug, ...d }),
  taxAddTag:     (label: string, group: string) => post<{ ok: boolean; slug: string }>('/tax/tag', { label, group }),
  taxEditTag:    (slug: string, d: { label?: string; group?: string; sub?: string }) => patch<{ ok: boolean }>('/tax/tag', { slug, ...d }),
  taxMergeTag:   (from: string, to: string) => post<{ ok: boolean }>('/tax/tag/merge', { from, to }),
  taxDeleteTag:  (slug: string) => del<{ ok: boolean }>(`/tax/tag/${encodeURIComponent(slug)}`),
  taxRenameTerm: (kind: 'merkmal' | 'vibe', slug: string, label: string) => patch<{ ok: boolean }>('/tax/term', { kind, slug, label }),
};

/** Komplettes Live-Vokabular (das, was Picker/Filter/Fragen wirklich nutzen). */
export interface TaxAll {
  groups:   { slug: string; label: string; icon: string | null; color: string | null; sort: number }[];
  tags:     { slug: string; label: string; sub: string | null; groupSlug: string | null; usage: number }[];
  merkmale: { slug: string; label: string; isApproved: number; usage: number }[];
  vibes:    { slug: string; label: string; isApproved: number; usage: number }[];
}

export interface TaxPending {
  merkmale: { slug: string; label: string; createdAt: string; byName: string | null }[];
  vibes: { slug: string; label: string; createdAt: string; byName: string | null }[];
  links: { tagSlug: string; tagLabel: string; merkmalSlug: string; merkmalLabel: string; byName: string | null }[];
  allMerkmale: { slug: string; label: string }[];
  allVibes: { slug: string; label: string }[];
}
