import { NavLink, useNavigate } from 'react-router-dom';
import { useRequireAuth } from '../../hooks/useRequireAuth.js';
import { useUiStore } from '../../store/useUiStore.js';

const LEFT_TABS = [
  { to: '/meine-orte',  icon: 'fa-bookmark',       label: 'Meine Orte',    reason: 'Melde dich an, um deine gemerkten Orte zu sehen.' },
  { to: '/meine-trips', icon: 'fa-route',          label: 'Meine Trips',   reason: 'Melde dich an, um deine Trips zu planen.' },
];
const RIGHT_TABS = [
  { to: '/geheimquiz',  icon: 'fa-earth-europe',   label: 'Geheimquiz',    reason: 'Melde dich an, um das Geheimquiz zu spielen.' },
  // „Besuchte Orte" liegen jetzt im persönlichen Profil — hier stattdessen die Traveler
  // (Personen denen ich folge + Freund:innen) als schnellster Weg zu deren Blogs.
  { to: '/traveler',    icon: 'fa-user-group',     label: 'Traveler',      reason: 'Melde dich an, um deine Traveler zu sehen.' },
];

export function BottomNav() {
  const navigate = useNavigate();
  const { gate, isLoggedIn } = useRequireAuth();
  const navPeek = useUiStore(s => s.navPeek);
  // Ausgeloggt: Klick öffnet das Login-Lightbox statt zu navigieren
  const tabClick = (e: React.MouseEvent, reason: string) => {
    if (!isLoggedIn) { e.preventDefault(); gate(undefined, reason); }
  };

  // z-50: die Nav liegt ÜBER den Karten-Overlays (Sheet z-20), nicht darunter.
  // `navPeek` (Swipe-Modus) fährt sie ganz raus: eigene Höhe + 40px, denn der Kompass-FAB ragt per
  // -mt-5 aus der Leiste heraus und stünde bei glatten 100% samt Schatten noch am Rand.
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--color-bg-soft)] z-50 pb-safe md:hidden"
      style={{ transform: navPeek ? 'translateY(calc(100% + 40px))' : 'translateY(0)', transition: 'transform .34s cubic-bezier(.32,.72,0,1)' }}>
      <div className="flex items-end">
        {/* Links */}
        {LEFT_TABS.map(({ to, icon, label, reason }) => (
          <NavLink
            key={to}
            to={to}
            onClick={e => tabClick(e, reason)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors text-xs font-medium ${
                isActive ? 'text-[var(--color-amber)]' : 'text-[var(--color-aubergine)]'
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
          <span className="text-[9px] font-medium text-[var(--color-aubergine)] mt-0.5">Entdecken</span>
        </div>

        {/* Rechts */}
        {RIGHT_TABS.map(({ to, icon, label, reason }) => (
          <NavLink
            key={to}
            to={to}
            onClick={e => tabClick(e, reason)}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors text-xs font-medium ${
                isActive ? 'text-[var(--color-amber)]' : 'text-[var(--color-aubergine)]'
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
