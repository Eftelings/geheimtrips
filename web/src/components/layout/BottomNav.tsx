import { NavLink, useNavigate } from 'react-router-dom';

const LEFT_TABS = [
  { to: '/saved',   icon: 'fa-bookmark',        label: 'Meine Orte'  },
  { to: '/trips',   icon: 'fa-route',           label: 'Meine Trips' },
];
const RIGHT_TABS = [
  { to: '/game',    icon: 'fa-earth-europe',    label: 'Geheimquiz'  },
  { to: '/visited', icon: 'fa-flag-checkered',  label: 'Besuchte Orte' },
];

export function BottomNav() {
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--color-bg-soft)] z-30 pb-safe md:hidden">
      <div className="flex items-end">
        {/* Links */}
        {LEFT_TABS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors text-xs font-medium ${
                isActive ? 'text-[var(--color-amber)]' : 'text-[var(--color-lavender-lt)]'
              }`
            }
          >
            <i className={`fa-solid ${icon} text-lg`} />
            <span className="text-[10px]">{label}</span>
          </NavLink>
        ))}

        {/* FAB Mitte — Entdecken */}
        <div className="flex-1 flex flex-col items-center justify-center pb-1">
          <button
            onClick={() => navigate('/')}
            className="w-14 h-14 rounded-full bg-[var(--color-amber)] text-white flex items-center justify-center shadow-[var(--shadow-amber)] active:scale-95 transition-transform -mt-5"
            style={{ boxShadow: '0 4px 20px rgba(249,144,57,0.45)' }}
          >
            <i className="fa-solid fa-compass text-xl" />
          </button>
          <span className="text-[9px] font-medium text-[var(--color-lavender-lt)] mt-0.5">Entdecken</span>
        </div>

        {/* Rechts */}
        {RIGHT_TABS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors text-xs font-medium ${
                isActive ? 'text-[var(--color-amber)]' : 'text-[var(--color-lavender-lt)]'
              }`
            }
          >
            <i className={`fa-solid ${icon} text-lg`} />
            <span className="text-[10px]">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
