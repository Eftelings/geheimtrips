import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, GATE_ENABLED } from './store/useAuthStore.js';
import { CookieConsent } from './components/ui/CookieConsent.js';
import React from 'react';

// Routen lazy laden → kleineres Initial-Bundle (v.a. mobil). Named exports → default mappen.
const lz = (loader: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() => loader().then(m => ({ default: m[name] as React.ComponentType<any> }))); // eslint-disable-line @typescript-eslint/no-explicit-any

const GatePage           = lz(() => import('./pages/GatePage.js'), 'GatePage');
const AdminDashboard     = lz(() => import('./pages/admin/AdminDashboard.js'), 'AdminDashboard');
const AdminPlaces        = lz(() => import('./pages/admin/AdminPlaces.js'), 'AdminPlaces');
const AdminQuality       = lz(() => import('./pages/admin/AdminQuality.js'), 'AdminQuality');
const AdminUsers         = lz(() => import('./pages/admin/AdminUsers.js'), 'AdminUsers');
const AdminSubmissions   = lz(() => import('./pages/admin/AdminSubmissions.js'), 'AdminSubmissions');
const AdminTakedown      = lz(() => import('./pages/admin/AdminTakedown.js'), 'AdminTakedown');
const AdminAuthors       = lz(() => import('./pages/admin/AdminAuthors.js'), 'AdminAuthors');
const AdminClaims        = lz(() => import('./pages/admin/AdminClaims.js'), 'AdminClaims');
const AdminPerks         = lz(() => import('./pages/admin/AdminPerks.js'), 'AdminPerks');
const AdminCategories    = lz(() => import('./pages/admin/AdminCategories.js'), 'AdminCategories');
const AdminTaxonomy      = lz(() => import('./pages/admin/AdminTaxonomy.js'), 'AdminTaxonomy');
const AdminChangeRequests = lz(() => import('./pages/admin/AdminChangeRequests.js'), 'AdminChangeRequests');
const AdminTaxonomyMod = lz(() => import('./pages/admin/AdminTaxonomyMod.js'), 'AdminTaxonomyMod');
const BusinessDashboardPage = lz(() => import('./pages/BusinessDashboardPage.js'), 'BusinessDashboardPage');
const EntdeckenPage      = lz(() => import('./pages/EntdeckenPage.js'), 'EntdeckenPage');
const FunnelPage         = lz(() => import('./pages/FunnelPage.js'), 'FunnelPage');
const OnboardingPage     = lz(() => import('./pages/OnboardingPage.js'), 'OnboardingPage');
const SwipePage          = lz(() => import('./pages/SwipePage.js'), 'SwipePage');
const FinderPage         = lz(() => import('./pages/FinderPage.js'), 'FinderPage');
const TripWizardPage     = lz(() => import('./pages/TripWizardPage.js'), 'TripWizardPage');
const TripCreatePage     = lz(() => import('./pages/TripCreatePage.js'), 'TripCreatePage');
const ResultsPage        = lz(() => import('./pages/ResultsPage.js'), 'ResultsPage');
const PlaceDetailPage    = lz(() => import('./pages/PlaceDetailPage.js'), 'PlaceDetailPage');
const AuthorPage         = lz(() => import('./pages/AuthorPage.js'), 'AuthorPage');
const UserProfilePage    = lz(() => import('./pages/UserProfilePage.js'), 'UserProfilePage');
const SavedPage          = lz(() => import('./pages/SavedPage.js'), 'SavedPage');
const TripDetailPage     = lz(() => import('./pages/TripDetailPage.js'), 'TripDetailPage');
const VisitedPage        = lz(() => import('./pages/VisitedPage.js'), 'VisitedPage');
const MapPage            = lz(() => import('./pages/MapPage.js'), 'MapPage');
const RankingPage        = lz(() => import('./pages/RankingPage.js'), 'RankingPage');
const AwardsPage         = lz(() => import('./pages/AwardsPage.js'), 'AwardsPage');
const ProfilePage        = lz(() => import('./pages/ProfilePage.js'), 'ProfilePage');
const NotificationInboxPage = lz(() => import('./pages/NotificationInboxPage.js'), 'NotificationInboxPage');
const MeetPeoplePage     = lz(() => import('./pages/MeetPeoplePage.js'), 'MeetPeoplePage');
const LegalPage          = lz(() => import('./pages/LegalPage.js'), 'LegalPage');
const ResetPasswordPage  = lz(() => import('./pages/ResetPasswordPage.js'), 'ResetPasswordPage');
const SubmitPage         = lz(() => import('./pages/SubmitPage.js'), 'SubmitPage');
const GeoGamePage        = lz(() => import('./pages/game/GeoGamePage.js'), 'GeoGamePage');

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useAuthStore();
  const location = useLocation();

  if (!hydrated) return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)]">
      <i className="fa-solid fa-compass fa-spin text-3xl text-[var(--color-amber)]" />
    </div>
  );

  if (GATE_ENABLED && !user) {
    return <Navigate to="/gate" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useAuthStore();
  if (!hydrated) return <div className="min-h-dvh bg-[#0f0b1a] flex items-center justify-center"><i className="fa-solid fa-circle-notch fa-spin text-3xl text-[var(--color-amber)]" /></div>;
  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const PageFallback = (
  <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)]">
    <i className="fa-solid fa-compass fa-spin text-3xl text-[var(--color-amber)]" />
  </div>
);

export function App() {
  const { hydrate } = useAuthStore();

  useEffect(() => { hydrate(); }, []);

  return (
    <Suspense fallback={PageFallback}>
      <Routes>
        <Route path="/gate"    element={<GatePage />} />
        <Route path="/legal"   element={<LegalPage />} />
        <Route path="/reset"   element={<ResetPasswordPage />} />

        <Route path="/" element={<RequireAuth><EntdeckenPage /></RequireAuth>} />
        <Route path="/funnel/*" element={<RequireAuth><FunnelPage /></RequireAuth>} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
        <Route path="/swipe"      element={<RequireAuth><SwipePage /></RequireAuth>} />
        <Route path="/finder"     element={<RequireAuth><FinderPage /></RequireAuth>} />
        <Route path="/trip-wizard" element={<RequireAuth><TripWizardPage /></RequireAuth>} />
        <Route path="/results"  element={<RequireAuth><ResultsPage /></RequireAuth>} />
        <Route path="/place/:id"  element={<RequireAuth><PlaceDetailPage /></RequireAuth>} />
        <Route path="/author/:id" element={<RequireAuth><AuthorPage /></RequireAuth>} />
        <Route path="/u/:id"      element={<RequireAuth><UserProfilePage /></RequireAuth>} />
        <Route path="/saved"     element={<RequireAuth><SavedPage /></RequireAuth>} />
        <Route path="/visited"   element={<RequireAuth><VisitedPage /></RequireAuth>} />
        <Route path="/trips"     element={<RequireAuth><SavedPage initialTab="trips" /></RequireAuth>} />
        <Route path="/trips/create" element={<RequireAuth><TripCreatePage /></RequireAuth>} />
        <Route path="/trips/:id" element={<RequireAuth><TripDetailPage /></RequireAuth>} />
        <Route path="/map"       element={<RequireAuth><MapPage /></RequireAuth>} />
        <Route path="/ranking"  element={<RequireAuth><RankingPage /></RequireAuth>} />
        <Route path="/awards"   element={<RequireAuth><AwardsPage /></RequireAuth>} />
        <Route path="/profile"  element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><NotificationInboxPage /></RequireAuth>} />
        <Route path="/people"    element={<RequireAuth><MeetPeoplePage /></RequireAuth>} />
        <Route path="/submit"    element={<RequireAuth><SubmitPage /></RequireAuth>} />
        <Route path="/game"      element={<RequireAuth><GeoGamePage /></RequireAuth>} />
        <Route path="/business"  element={<RequireAuth><BusinessDashboardPage /></RequireAuth>} />

        {/* Admin Panel */}
        <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/admin/places" element={<RequireAdmin><AdminPlaces /></RequireAdmin>} />
        <Route path="/admin/quality" element={<RequireAdmin><AdminQuality /></RequireAdmin>} />
        <Route path="/admin/users" element={<RequireAdmin><AdminUsers /></RequireAdmin>} />
        <Route path="/admin/submissions" element={<RequireAdmin><AdminSubmissions /></RequireAdmin>} />
        <Route path="/admin/takedown" element={<RequireAdmin><AdminTakedown /></RequireAdmin>} />
        <Route path="/admin/authors" element={<RequireAdmin><AdminAuthors /></RequireAdmin>} />
        <Route path="/admin/claims"  element={<RequireAdmin><AdminClaims /></RequireAdmin>} />
        <Route path="/admin/perks"   element={<RequireAdmin><AdminPerks /></RequireAdmin>} />
        <Route path="/admin/categories" element={<RequireAdmin><AdminCategories /></RequireAdmin>} />
        <Route path="/admin/taxonomy" element={<RequireAdmin><AdminTaxonomy /></RequireAdmin>} />
        <Route path="/admin/change-requests" element={<RequireAdmin><AdminChangeRequests /></RequireAdmin>} />
        <Route path="/admin/taxonomy-mod" element={<RequireAdmin><AdminTaxonomyMod /></RequireAdmin>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export function AppWithConsent() {
  return (
    <>
      <App />
      <CookieConsent />
    </>
  );
}
