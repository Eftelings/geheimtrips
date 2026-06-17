import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav.js';
import { Sidebar } from './Sidebar.js';
import { useAuthStore } from '../../store/useAuthStore.js';
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

  return (
    <div className="min-h-dvh bg-white">
      {/* Max-width container — centres layout on ultra-wide displays */}
      <div className="flex min-h-dvh max-w-[1440px] mx-auto">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">

        {/* ── Mobile header ────────────────────────────────────── */}
        {!noHeader && (
          <header className="md:hidden sticky top-0 z-20 bg-[var(--color-bg)] border-b border-[var(--color-bg-soft)] flex items-center px-4 h-14 gap-3">
            {showBack ? (
              <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center text-[var(--color-aubergine)]">
                <i className="fa-solid fa-arrow-left" />
              </button>
            ) : (
              <BrandLogo size="sm" />
            )}

            {title && (
              <span className="font-display font-semibold text-[var(--color-aubergine)] text-base flex-1 text-center">
                {title}
              </span>
            )}

            <div className="ml-auto">
              {headerRight ?? (
                user && (
                  <button onClick={() => navigate('/profile')} className="flex items-center gap-2">
                    <Avatar name={user.name} src={user.avatarUrl} size={32} />
                  </button>
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
