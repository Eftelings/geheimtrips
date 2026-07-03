import { type ReactNode, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav.js';
import { Sidebar } from './Sidebar.js';
import { useAuthStore } from '../../store/useAuthStore.js';
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
}

export function AppShell({ children, showBack, title, headerRight, noHeader }: Props) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [notif, setNotif] = useState(0);

  useEffect(() => {
    if (!user) return;
    notificationsApi.count().then(r => setNotif(r.count)).catch(() => {});
  }, [user]);

  const openInbox = () => {
    if (notif > 0) { notificationsApi.seen().catch(() => {}); setNotif(0); }
    navigate('/notifications');
  };

  return (
    <div className="min-h-dvh bg-white">
      {/* Max-width container — centres layout on ultra-wide displays */}
      <div className="flex min-h-dvh max-w-[1440px] mx-auto">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">

        {/* ── Mobile header (Instagram-Stil) ───────────────────── */}
        {!noHeader && (
          <header className="md:hidden sticky top-0 z-20 bg-[var(--color-bg)] border-b border-[var(--color-bg-soft)] flex items-center px-4 h-14 gap-3">
            {/* Links: Zurück (Unterseiten) oder Feder zum Einreichen */}
            {showBack ? (
              <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center text-[var(--color-aubergine)]" aria-label="Zurück">
                <i className="fa-solid fa-arrow-left text-lg" />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={() => navigate('/submit')} className="w-9 h-9 flex items-center justify-center text-[var(--color-aubergine)]" aria-label="Ort einreichen">
                  <i className="fa-solid fa-feather-pointed text-lg" />
                </button>
                <button onClick={() => navigate('/awards')} className="w-9 h-9 flex items-center justify-center text-[var(--color-amber)]" aria-label="Awards">
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

            {/* Rechts: Postfach-Glocke + Profil */}
            <div className="flex items-center gap-0.5 justify-end">
              {headerRight ?? (
                user && (
                  <>
                    <button onClick={openInbox} className="relative w-9 h-9 flex items-center justify-center text-[var(--color-aubergine)]" aria-label="Postfach">
                      <i className="fa-regular fa-bell text-lg" />
                      {notif > 0 && (
                        <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-[var(--color-amber)] text-white text-[9px] font-bold flex items-center justify-center border border-[var(--color-bg)]">
                          {notif > 9 ? '9+' : notif}
                        </span>
                      )}
                    </button>
                    <button onClick={() => navigate('/profile')} aria-label="Profil" className="relative">
                      <Avatar name={user.name} src={user.avatarUrl} size={32} />
                      {notif > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[var(--color-amber)] border-2 border-[var(--color-bg)]" />
                      )}
                    </button>
                  </>
                )
              )}
            </div>
          </header>
        )}

        {/* Page content */}
        <main className="flex-1 pb-20 md:pb-0 bg-[var(--color-bg)]">
          {children}
        </main>
      </div>

      <BottomNav />
      </div>{/* end max-width wrapper */}
    </div>
  );
}
