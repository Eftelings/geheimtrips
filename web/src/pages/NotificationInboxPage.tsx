import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { notificationsApi, type InboxItem } from '../services/api.js';

const META: Record<InboxItem['type'], { icon: string; color: string; bg: string; label: string }> = {
  friend_request: { icon: 'fa-user-plus',      color: '#8A6FB3', bg: '#F1ECF4', label: 'Freundschaft' },
  question:       { icon: 'fa-circle-question', color: '#F99039', bg: '#FFF4EB', label: 'Frage' },
  change_request: { icon: 'fa-pen-to-square',   color: '#5B8F6E', bg: '#EEF6F0', label: 'Änderungswunsch' },
  trip_invite:    { icon: 'fa-route',           color: '#8A6FB3', bg: '#F1ECF4', label: 'Trip-Einladung' },
  trip_accept:    { icon: 'fa-user-check',      color: '#5B8F6E', bg: '#EEF6F0', label: 'Trip' },
  friend_accept:  { icon: 'fa-user-check',      color: '#5B8F6E', bg: '#EEF6F0', label: 'Freundschaft' },
  review_reminder:{ icon: 'fa-clipboard-check', color: '#F99039', bg: '#FFF4EB', label: 'Review' },
};

function timeAgo(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (isNaN(mins)) return '';
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `vor ${h} Std`;
  const days = Math.round(h / 24);
  return days < 7 ? `vor ${days} Tg` : d.toLocaleDateString('de');
}

export function NotificationInboxPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useEffect(() => {
    notificationsApi.list().then(setItems).catch(() => setItems([]));
    notificationsApi.seen().catch(() => {});
  }, []);

  return (
    <AppShell title="Postfach" showBack>
      <div className="px-5 py-6 max-w-2xl mx-auto">
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-5" style={{ letterSpacing: '-0.02em' }}>
          Dein <em className="italic text-[var(--color-amber)]">Postfach</em>
        </h1>

        {items === null ? (
          <div className="flex justify-center py-16 text-[var(--color-lavender)]">
            <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-lavender)]">
            <i className="fa-regular fa-bell text-5xl mb-4 opacity-30" />
            <p className="font-semibold mb-1">Alles erledigt</p>
            <p className="text-sm">Neue Freundschaftsanfragen, Fragen und Änderungswünsche zu deinen Orten erscheinen hier.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {items.map(it => {
              const m = META[it.type];
              return (
                <button key={it.id} onClick={() => navigate(it.link)}
                  className="flex items-start gap-3 p-4 bg-white rounded-2xl shadow-[var(--shadow-card)] text-left active:scale-[0.99] transition-transform">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: m.bg }}>
                    <i className={`fa-solid ${m.icon}`} style={{ color: m.color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-[var(--color-aubergine)] text-sm truncate">{it.title}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: m.bg, color: m.color }}>{m.label}</span>
                    </div>
                    <p className="text-sm text-[var(--color-lavender)] mt-0.5 line-clamp-2">{it.body}</p>
                    {it.createdAt && <p className="text-[11px] text-[var(--color-lavender-lt)] mt-1">{timeAgo(it.createdAt)}</p>}
                  </div>
                  <i className="fa-solid fa-chevron-right text-[var(--color-lavender-lt)] mt-1 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
