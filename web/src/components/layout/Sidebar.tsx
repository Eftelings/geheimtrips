import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../ui/BrandLogo.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useAuthGate } from '../../store/useAuthGate.js';
import { useRequireAuth } from '../../hooks/useRequireAuth.js';
import { notificationsApi } from '../../services/api.js';
import { Avatar } from '../ui/Avatar.js';

// `open: true` = öffentlich; alles andere braucht ein Konto (Klick → Login-Lightbox)
const TABS = [
  { to: '/',            icon: 'fa-compass',         label: 'Entdecken',     open: true },
  { to: '/leute',       icon: 'fa-user-group',      label: 'Neue Leute'    },
  { to: '/postfach',    icon: 'fa-bell',            label: 'Postfach'      },
  { to: '/geheimquiz',  icon: 'fa-earth-europe',    label: 'Geheimquiz'    },
  { to: '/meine-orte',  icon: 'fa-bookmark',        label: 'Meine Orte'    },
  { to: '/meine-trips', icon: 'fa-route',           label: 'Meine Trips'   },
  { to: '/besucht',     icon: 'fa-flag-checkered',  label: 'Besuchte Orte' },
  { to: '/awards',      icon: 'fa-trophy',          label: 'Awards'        },
  { to: '/rangliste',   icon: 'fa-medal',           label: 'Prämien'       },
  { to: '/einreichen',  icon: 'fa-feather-pointed', label: 'Einreichen'    },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const { gate } = useRequireAuth();
  const openGate = useAuthGate(s => s.openGate);
  const navigate = useNavigate();
  const [notif, setNotif] = useState(0);
  useEffect(() => { if (user) notificationsApi.count().then(r => setNotif(r.count)).catch(() => {}); }, [user]);

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-white border-r border-[var(--color-bg-soft)] px-4 py-6 sticky top-0 shrink-0">

      {/* Logo */}
      <div className="mb-6 px-2">
        <BrandLogo size="lg" />
      </div>

      {/* ── Profil-Card (ausgeloggt: Anmelde-Aufruf) ─────────── */}
      {!user && (
        <button
          onClick={() => openGate()}
          className="flex items-center gap-3 w-full px-3 py-3 rounded-2xl mb-5 text-left text-white"
          style={{ background: 'linear-gradient(135deg, #4a3268, #34254c)' }}
        >
          <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-right-to-bracket" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold leading-tight">Anmelden</div>
            <div className="text-xs text-white/60 truncate">Speichern, bewerten, einreichen</div>
          </div>
        </button>
      )}
      {user && (
        <button
          onClick={() => navigate('/profil')}
          className="flex items-center gap-3 w-full px-3 py-3 rounded-2xl bg-[var(--color-bg-soft)] hover:bg-[var(--color-bg-soft)]/80 transition-colors mb-5 text-left group"
        >
          <span className="relative flex-shrink-0">
            <Avatar name={user.name} src={user.avatarUrl} size={42} />
            {notif > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--color-amber)] border-2 border-white" />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-[var(--color-aubergine)] truncate leading-tight">
              {user.name}
            </div>
            <div className="text-xs text-[var(--color-lavender)] truncate">@{user.handle}</div>
          </div>
          <i className="fa-solid fa-chevron-right text-[10px] text-[var(--color-lavender)] opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      )}

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="flex flex-col gap-1 flex-1">
        {TABS.map(({ to, icon, label, open }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={e => { if (!open && !user) { e.preventDefault(); gate(undefined, `Melde dich an, um „${label}" zu nutzen.`); } }}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--color-bg-soft)] text-[var(--color-amber)] font-semibold'
                  : 'text-[var(--color-lavender)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-aubergine)]'
              }`
            }
          >
            <i className={`fa-solid ${icon} w-5 text-center`} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* ── Business Portal ─────────────────────────────────── */}
      <NavLink to="/business"
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            isActive
              ? 'bg-[var(--color-bg-soft)] text-[var(--color-amber)] font-semibold'
              : 'text-[var(--color-lavender)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-aubergine)]'
          }`
        }>
        <i className="fa-solid fa-building w-5 text-center" />
        Business-Portal
      </NavLink>

      {/* ── Admin ────────────────────────────────────────────── */}
      {user?.isAdmin && (
        <NavLink to="/admin"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-[var(--color-amber)] hover:bg-[var(--color-bg-soft)] border border-[var(--color-amber)]/30 mb-3">
          <i className="fa-solid fa-shield-halved w-5 text-center" />
          Admin
        </NavLink>
      )}

      {/* ── Abmelden ─────────────────────────────────────────── */}
      {user && (
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-[var(--color-lavender)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-soft)] transition-colors w-full"
        >
          <i className="fa-solid fa-arrow-right-from-bracket w-5 text-center" />
          Abmelden
        </button>
      )}
    </aside>
  );
}
