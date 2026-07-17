import { type ReactNode, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav.js';
import { Sidebar } from './Sidebar.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useAuthGate } from '../../store/useAuthGate.js';
import { useRequireAuth } from '../../hooks/useRequireAuth.js';
import { notificationsApi } from '../../services/api.js';
import { Avatar } from '../ui/Avatar.js';
import { BrandLogo } from '../ui/BrandLogo.js';

interface Props {
  children: ReactNode;
  /** Show back arrow instead of app header */
  showBack?: boolean;
  /** Override page title in mobile header */
  title?: string;
  /** Extra right-side element in mobile header */
  headerRight?: ReactNode;
  /** Hide the mobile top header entirely */
  noHeader?: boolean;
  /** Eingebettet (z.B. im Karten-Overlay): ohne Sidebar/BottomNav/Header — nur der Inhalt */
  bare?: boolean;
  /** Fokus-Flow (z.B. Einreichen): globale Tab-Leiste ausblenden — sie kollidiert sonst mit der
   *  seiteneigenen Weiter/Zurück-Leiste. Header bleibt. */
  noBottomNav?: boolean;
}

export function AppShell({ children, showBack, title, headerRight, noHeader, bare, noBottomNav }: Props) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { gate } = useRequireAuth();
  const openGate = useAuthGate(s => s.openGate);
  const [notif, setNotif] = useState(0);

  useEffect(() => {
    if (!user) return;
    notificationsApi.count().then(r => setNotif(r.count)).catch(() => {});
  }, [user]);

  // Eingebettet (Karten-Overlay): nur der Inhalt, ohne Sidebar/BottomNav/Header
  if (bare) return <div className="min-h-full bg-[var(--color-bg)]">{children}</div>;

  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      {/* Max-width container — centres layout on ultra-wide displays */}
      <div className="flex min-h-dvh max-w-[1440px] mx-auto bg-[var(--color-bg)]">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">

        {/* ── Mobile header (Instagram-Stil) ───────────────────── */}
        {!noHeader && (
          <header className="md:hidden sticky top-0 z-20 bg-[var(--color-bg)] border-b border-[var(--color-bg-soft)] flex items-center px-4 h-12 gap-3">
            {/* Links: Zurück (Unterseiten) oder Feder zum Einreichen */}
            {showBack ? (
              <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center text-[var(--color-aubergine)]" aria-label="Zurück">
                <i className="fa-solid fa-arrow-left text-lg" />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={() => gate(() => navigate('/einreichen'), 'Melde dich an, um einen Geheimtrip einzureichen.')} className="w-9 h-9 flex items-center justify-center text-[var(--color-aubergine)]" aria-label="Ort einreichen">
                  <i className="fa-solid fa-feather-pointed text-lg" />
                </button>
                <button onClick={() => gate(() => navigate('/awards'), 'Melde dich an, um deine Awards zu sehen.')} className="w-9 h-9 flex items-center justify-center text-[var(--color-amber)]" aria-label="Awards">
                  <i className="fa-solid fa-trophy text-lg" />
                </button>
              </div>
            )}

            {/* Mitte: Titel oder Logo */}
            <div className="flex-1 flex justify-center min-w-0">
              {title
                ? <span className="font-display font-semibold text-[var(--color-aubergine)] text-base truncate">{title}</span>
                : <BrandLogo size="sm" />}
            </div>

            {/* Rechts: Fernglas (Fragen-Funnel → neue Orte) + Profil (Postfach liegt jetzt im Profil) */}
            <div className="flex items-center gap-1 justify-end">
              {headerRight ?? (
                <>
                  <button onClick={() => gate(() => navigate('/funnel'), 'Melde dich an, um passende neue Orte zu finden.')} className="w-9 h-9 flex items-center justify-center text-[var(--color-aubergine)]" aria-label="Neue Orte entdecken">
                    <i className="fa-solid fa-binoculars text-lg" />
                  </button>
                  {user ? (
                    <button onClick={() => navigate('/profil')} aria-label="Profil" className="relative">
                      <Avatar name={user.name} src={user.avatarUrl} size={28} />
                      {notif > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[var(--color-amber)] border-2 border-[var(--color-bg)]" />
                      )}
                    </button>
                  ) : (
                    <button onClick={() => openGate()} className="text-xs font-bold text-[var(--color-amber)] px-2.5 py-1.5 rounded-full" style={{ background: 'rgba(249,144,57,0.12)' }}>
                      Anmelden
                    </button>
                  )}
                </>
              )}
            </div>
          </header>
        )}

        {/* Page content. overflow-x-clip: kein versehentlich zu breites Kind kann die ganze Seite
            seitlich scrollbar machen (fiel auf kleinen Handys beim Einreichen auf). */}
        <main className={`flex-1 flex flex-col overflow-x-clip bg-[var(--color-bg)] ${noBottomNav ? '' : 'pb-20 md:pb-0'}`}>
          {children}
        </main>
      </div>

      {!noBottomNav && <BottomNav />}
      </div>{/* end max-width wrapper */}
    </div>
  );
}
