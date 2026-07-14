import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore.js';
import { useAuthGate } from './store/useAuthGate.js';
import { AuthGateModal } from './components/ui/AuthGateModal.js';
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
const AdminTaxonomy      = lz(() => import('./pages/admin/AdminTaxonomy.js'), 'AdminTaxonomy');
const AdminChangeRequests = lz(() => import('./pages/admin/AdminChangeRequests.js'), 'AdminChangeRequests');
const AdminTaxonomyMod = lz(() => import('./pages/admin/AdminTaxonomyMod.js'), 'AdminTaxonomyMod');
const AdminQuestions   = lz(() => import('./pages/admin/AdminQuestions.js'), 'AdminQuestions');
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

// Öffentlich sichtbar, aber Aktion braucht Konto → statt Redirect auf die Login-Seite
// öffnen wir das Login-Lightbox und schicken zurück auf die (öffentliche) Startseite.
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, hydrated } = useAuthStore();
  const openGate = useAuthGate(s => s.openGate);

  useEffect(() => { if (hydrated && !user) openGate(); }, [hydrated, user, openGate]);

  if (!hydrated) return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)]">
      <i className="fa-solid fa-compass fa-spin text-3xl text-[var(--color-amber)]" />
    </div>
  );

  if (!user) return <Navigate to="/" replace />;

  return <>{children}</>;
}

// /place/:id → /ort/:id (deutsche, SEO-freundliche URL; alte Links leiten weiter)
function PlaceRedirect() {
  const { id } = useParams();
  return <Navigate to={`/ort/${id ?? ''}`} replace />;
}

// Alte englische Route → deutsche Route, Query-String bleibt erhalten (z.B. ?edit=…)
function RedirectTo({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
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

  useEffect(() => {
    hydrate();
    // Häufige Tab-Ziele im Leerlauf vorladen → Footer-Wechsel fühlt sich sofort an
    // (Vite bündelt dieselben import()-Specifier, der Klick greift dann auf den Cache zu).
    const prefetch = () => {
      import('./pages/SavedPage.js');
      import('./pages/VisitedPage.js');
      import('./pages/game/GeoGamePage.js');
      import('./pages/ProfilePage.js');
      import('./pages/PlaceDetailPage.js');
      import('./pages/NotificationInboxPage.js');
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const t = ric ? ric(prefetch) : window.setTimeout(prefetch, 1500);
    return () => {
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (ric && cic) cic(t as number); else clearTimeout(t as number);
    };
  }, []); // eslint-disable-line

  return (
    <Suspense fallback={PageFallback}>
      <Routes>
        {/* Öffentlich zugänglich (crawlbar) */}
        <Route path="/anmelden" element={<GatePage />} />
        <Route path="/gate"     element={<RedirectTo to="/anmelden" />} />
        <Route path="/legal"   element={<LegalPage />} />
        <Route path="/reset"   element={<ResetPasswordPage />} />
        <Route path="/" element={<EntdeckenPage />} />
        <Route path="/ort/:id"   element={<PlaceDetailPage />} />
        <Route path="/place/:id" element={<PlaceRedirect />} />

        {/* Konto nötig — Seite ist sichtbar, aber der Zugriff öffnet das Login-Lightbox */}
        <Route path="/funnel/*" element={<RequireAuth><FunnelPage /></RequireAuth>} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
        <Route path="/swipe"      element={<RequireAuth><SwipePage /></RequireAuth>} />
        <Route path="/finder"     element={<RequireAuth><FinderPage /></RequireAuth>} />
        <Route path="/trip-wizard" element={<RequireAuth><TripWizardPage /></RequireAuth>} />
        <Route path="/results"  element={<RequireAuth><ResultsPage /></RequireAuth>} />
        <Route path="/author/:id" element={<RequireAuth><AuthorPage /></RequireAuth>} />
        <Route path="/u/:id"      element={<RequireAuth><UserProfilePage /></RequireAuth>} />

        <Route path="/meine-orte"  element={<RequireAuth><SavedPage /></RequireAuth>} />
        <Route path="/saved"       element={<RedirectTo to="/meine-orte" />} />
        <Route path="/besucht"     element={<RequireAuth><VisitedPage /></RequireAuth>} />
        <Route path="/visited"     element={<RedirectTo to="/besucht" />} />
        <Route path="/meine-trips" element={<RequireAuth><SavedPage initialTab="trips" /></RequireAuth>} />
        <Route path="/trips"       element={<RedirectTo to="/meine-trips" />} />
        <Route path="/trips/erstellen" element={<RequireAuth><TripCreatePage /></RequireAuth>} />
        <Route path="/trips/create"    element={<RedirectTo to="/trips/erstellen" />} />
        <Route path="/trips/:id" element={<RequireAuth><TripDetailPage /></RequireAuth>} />
        <Route path="/karte"    element={<RequireAuth><MapPage /></RequireAuth>} />
        <Route path="/map"      element={<RedirectTo to="/karte" />} />
        <Route path="/rangliste" element={<RequireAuth><RankingPage /></RequireAuth>} />
        <Route path="/ranking"   element={<RedirectTo to="/rangliste" />} />
        <Route path="/awards"   element={<RequireAuth><AwardsPage /></RequireAuth>} />
        <Route path="/profil"   element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/profile"  element={<RedirectTo to="/profil" />} />
        <Route path="/postfach" element={<RequireAuth><NotificationInboxPage /></RequireAuth>} />
        <Route path="/notifications" element={<RedirectTo to="/postfach" />} />
        <Route path="/leute"    element={<RequireAuth><MeetPeoplePage /></RequireAuth>} />
        <Route path="/people"   element={<RedirectTo to="/leute" />} />
        <Route path="/einreichen" element={<RequireAuth><SubmitPage /></RequireAuth>} />
        <Route path="/submit"     element={<RedirectTo to="/einreichen" />} />
        <Route path="/geheimquiz" element={<RequireAuth><GeoGamePage /></RequireAuth>} />
        <Route path="/game"       element={<RedirectTo to="/geheimquiz" />} />
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
        <Route path="/admin/taxonomy" element={<RequireAdmin><AdminTaxonomy /></RequireAdmin>} />
        <Route path="/admin/questions" element={<RequireAdmin><AdminQuestions /></RequireAdmin>} />
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
      <AuthGateModal />
      <CookieConsent />
    </>
  );
}
