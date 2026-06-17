import { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout.js';
import { adminApi, type AdminStats } from '../../services/adminApi.js';
import { useNavigate } from 'react-router-dom';

interface StatCard {
  key: keyof AdminStats['stats'];
  label: string;
  icon: string;
  color: string;
  urgent?: boolean;
}

const STAT_CARDS: StatCard[] = [
  { key: 'users',              label: 'Nutzer:innen',       icon: 'fa-users',               color: '#8A6FB3' },
  { key: 'places',             label: 'Orte',               icon: 'fa-map-pin',             color: '#F99039' },
  { key: 'visits',             label: 'Besuche',            icon: 'fa-location-crosshairs', color: '#5B8F6E' },
  { key: 'trips',              label: 'Trips',              icon: 'fa-flag-checkered',      color: '#C9A227' },
  { key: 'media',              label: 'Medien',             icon: 'fa-images',              color: '#71587A' },
  { key: 'openReports',        label: 'Offene Meldungen',  icon: 'fa-flag',                color: '#C96442', urgent: true },
  { key: 'pendingSubmissions', label: 'Neue Einreichungen', icon: 'fa-inbox',               color: '#F99039', urgent: true },
];

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    adminApi.stats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout title="Dashboard">
      {loading ? (
        <div className="flex items-center justify-center h-48 text-white/30">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {STAT_CARDS.map(card => {
              const value = stats.stats[card.key];
              return (
                <div key={card.key}
                  className={`bg-white/5 border rounded-2xl p-4 hover:bg-white/8 transition-colors ${card.urgent && value > 0 ? 'border-[var(--color-amber)]/40' : 'border-white/8'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: card.color + '22' }}>
                      <i className={`fa-solid ${card.icon} text-sm`} style={{ color: card.color }} />
                    </div>
                    {card.urgent && value > 0 && (
                      <span className="bg-[var(--color-amber)] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                        {value}
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-2xl text-white mb-0.5">{value}</div>
                  <div className="text-xs text-white/40">{card.label}</div>
                </div>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Schnellzugriff</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Ort hinzufügen', icon: 'fa-plus', to: '/admin/places', color: 'var(--color-amber)' },
                { label: 'Einreichungen', icon: 'fa-inbox', to: '/admin/submissions', color: '#8A6FB3', badge: stats.stats.pendingSubmissions },
                { label: 'Takedown-Meldungen', icon: 'fa-flag', to: '/admin/takedown', color: '#C96442', badge: stats.stats.openReports },
                { label: 'Nutzer verwalten', icon: 'fa-users', to: '/admin/users', color: '#5B8F6E' },
              ].map(a => (
                <button key={a.to} onClick={() => navigate(a.to)}
                  className="bg-white/5 border border-white/8 rounded-2xl p-4 text-left hover:bg-white/8 transition-colors relative">
                  <i className={`fa-solid ${a.icon} mb-3 text-lg`} style={{ color: a.color }} />
                  <div className="text-sm font-medium text-white/80">{a.label}</div>
                  {a.badge != null && a.badge > 0 && (
                    <span className="absolute top-3 right-3 bg-[var(--color-amber)] text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {a.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          {stats.recentVisits.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Letzte Aktivität</h2>
              <div className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
                {stats.recentVisits.map((v, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-[var(--color-success)]/20 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-location-crosshairs text-[var(--color-success)] text-xs" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-white/60">Nutzer #{v.userId} besuchte </span>
                      <span className="text-xs font-semibold text-white/80">{v.placeId}</span>
                    </div>
                    <span className="text-[10px] text-white/30 flex-shrink-0">
                      {v.visitedAt ? new Date(v.visitedAt).toLocaleDateString('de') : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-white/30 text-sm">Daten konnten nicht geladen werden.</p>
      )}
    </AdminLayout>
  );
}
