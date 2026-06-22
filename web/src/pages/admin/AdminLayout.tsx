import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';

const NAV = [
  { to: '/admin',             icon: 'fa-gauge-high',     label: 'Dashboard',     end: true },
  { to: '/admin/places',      icon: 'fa-map-pin',        label: 'Orte' },
  { to: '/admin/quality',     icon: 'fa-star-half-stroke', label: 'Qualität' },
  { to: '/admin/users',       icon: 'fa-users',          label: 'Nutzer:innen' },
  { to: '/admin/submissions', icon: 'fa-inbox',          label: 'Einreichungen' },
  { to: '/admin/takedown',    icon: 'fa-flag',           label: 'Notice & Takedown' },
  { to: '/admin/authors',     icon: 'fa-user-pen',       label: 'Autoren' },
  { to: '/admin/claims',      icon: 'fa-building',       label: 'Betreiber-Anfragen' },
  { to: '/admin/taxonomy',    icon: 'fa-folder-tree',    label: 'Kategorien & Merkmale' },
  { to: '/admin/categories',  icon: 'fa-tags',           label: 'Filter-Kategorien (alt)' },
  { to: '/admin/perks',       icon: 'fa-gift',           label: 'Vorteile' },
];

interface Props { children: ReactNode; title?: string }

export function AdminLayout({ children, title }: Props) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  return (
    <div className="flex min-h-dvh bg-[#0f0b1a] text-white">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-[#1a1228] border-r border-white/8 px-3 py-5">
        {/* Logo */}
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5 px-2 mb-7 group">
          <div className="w-7 h-7 rounded-lg bg-[var(--color-amber)] flex items-center justify-center">
            <i className="fa-solid fa-compass text-white text-sm" />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-white leading-none">Geheimtrips.de</div>
            <div className="text-[10px] text-[var(--color-amber)] font-semibold">Admin</div>
          </div>
        </button>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {NAV.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--color-amber)]/15 text-[var(--color-amber)]'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`
              }>
              <i className={`fa-solid ${icon} w-4 text-center text-sm`} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Back to app + logout */}
        <div className="border-t border-white/8 pt-3 mt-3 space-y-1">
          <button onClick={() => navigate('/')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
            <i className="fa-solid fa-arrow-left w-4 text-center text-sm" />
            Zurück zur App
          </button>
          <button onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors">
            <i className="fa-solid fa-arrow-right-from-bracket w-4 text-center text-sm" />
            Abmelden
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="h-14 border-b border-white/8 flex items-center justify-between px-6 bg-[#0f0b1a] shrink-0">
          <h1 className="font-semibold text-white/90">{title ?? 'Admin'}</h1>
          {user && (
            <div className="flex items-center gap-2 text-sm text-white/50">
              <i className="fa-solid fa-shield-halved text-[var(--color-amber)] text-xs" />
              {user.name}
            </div>
          )}
        </header>

        {/* Page */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
