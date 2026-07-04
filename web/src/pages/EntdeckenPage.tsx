import { lazy, Suspense } from 'react';
import { useIsMobile } from '../hooks/useIsMobile.js';

// Mobil und Desktop getrennt laden → mobil kommt nur die Karte, nicht der Desktop-Feed (und umgekehrt)
const MobileEntdecken = lazy(() => import('./MobileEntdecken.js').then(m => ({ default: m.MobileEntdecken })));
const DiscoverPage    = lazy(() => import('./DiscoverPage.js').then(m => ({ default: m.DiscoverPage })));

const Fallback = (
  <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)]">
    <i className="fa-solid fa-compass fa-spin text-3xl text-[var(--color-amber)]" />
  </div>
);

/** Entdecken (/): mobil die Vollbildkarte, ab lg der bestehende Feed. */
export function EntdeckenPage() {
  const isMobile = useIsMobile(1024);
  return <Suspense fallback={Fallback}>{isMobile ? <MobileEntdecken /> : <DiscoverPage />}</Suspense>;
}
