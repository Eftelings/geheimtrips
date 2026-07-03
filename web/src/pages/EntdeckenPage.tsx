import { useIsMobile } from '../hooks/useIsMobile.js';
import { DiscoverPage } from './DiscoverPage.js';
import { MobileEntdecken } from './MobileEntdecken.js';

/** Entdecken (/): mobil die Vollbildkarte, ab lg der bestehende Feed. */
export function EntdeckenPage() {
  return useIsMobile(1024) ? <MobileEntdecken /> : <DiscoverPage />;
}
