import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, GATE_ENABLED } from './store/useAuthStore.js';
import { CookieConsent } from './components/ui/CookieConsent.js';
import React from 'react';

import { GatePage }          from './pages/GatePage.js';
import { AdminDashboard }    from './pages/admin/AdminDashboard.js';
import { AdminPlaces }       from './pages/admin/AdminPlaces.js';
import { AdminQuality }      from './pages/admin/AdminQuality.js';
import { AdminUsers }        from './pages/admin/AdminUsers.js';
import { AdminSubmissions }  from './pages/admin/AdminSubmissions.js';
import { AdminTakedown }     from './pages/admin/AdminTakedown.js';
import { AdminAuthors }      from './pages/admin/AdminAuthors.js';
import { AdminClaims }       from './pages/admin/AdminClaims.js';
import { AdminPerks }        from './pages/admin/AdminPerks.js';
import { AdminCategories }   from './pages/admin/AdminCategories.js';
import { BusinessDashboardPage } from './pages/BusinessDashboardPage.js';
import { DiscoverPage }      from './pages/DiscoverPage.js';
import { FunnelPage }      from './pages/FunnelPage.js';
import { OnboardingPage }  from './pages/OnboardingPage.js';
import { SwipePage }       from './pages/SwipePage.js';
import { FinderPage }      from './pages/FinderPage.js';
import { TripWizardPage }  from './pages/TripWizardPage.js';
import { ResultsPage }     from './pages/ResultsPage.js';
import { PlaceDetailPage } from './pages/PlaceDetailPage.js';
import { AuthorPage }      from './pages/AuthorPage.js';
import { UserProfilePage } from './pages/UserProfilePage.js';
import { SavedPage }       from './pages/SavedPage.js';
import { TripDetailPage }  from './pages/TripDetailPage.js';
import { VisitedPage }     from './pages/VisitedPage.js';
import { MapPage }         from './pages/MapPage.js';
import { RankingPage }     from './pages/RankingPage.js';
import { ProfilePage }     from './pages/ProfilePage.js';
import { LegalPage }       from './pages/LegalPage.js';
import { ResetPasswordPage } from './pages/ResetPasswordPage.js';
import { SubmitPage }      from './pages/SubmitPage.js';
import { GeoGamePage }    from './pages/game/GeoGamePage.js';

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

export function App() {
  const { hydrate } = useAuthStore();

  useEffect(() => { hydrate(); }, []);

  return (
    <Routes>
      <Route path="/gate"    element={<GatePage />} />
      <Route path="/legal"   element={<LegalPage />} />
      <Route path="/reset"   element={<ResetPasswordPage />} />

      <Route path="/" element={<RequireAuth><DiscoverPage /></RequireAuth>} />
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
      <Route path="/trips/:id" element={<RequireAuth><TripDetailPage /></RequireAuth>} />
      <Route path="/map"       element={<RequireAuth><MapPage /></RequireAuth>} />
      <Route path="/ranking"  element={<RequireAuth><RankingPage /></RequireAuth>} />
      <Route path="/profile"  element={<RequireAuth><ProfilePage /></RequireAuth>} />
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
