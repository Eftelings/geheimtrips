import { useEffect, useRef, useState } from 'react';
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
  tax_moderation: { icon: 'fa-tags',            color: '#8A6FB3', bg: '#F1ECF4', label: 'Taxonomie' },
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

/** Eine Postfach-Zeile: nach links wischen zum Löschen (Touch + Maus). */
function SwipeRow({ it, onOpen, onDismiss }: { it: InboxItem; onOpen: () => void; onDismiss: () => void }) {
  const m = META[it.type];
  const [dx, setDx] = useState(0);
  const [removing, setRemoving] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const THRESHOLD = 96;

  function down(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
    dragging.current = false;
  }
  function move(e: React.PointerEvent) {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;
    if (!dragging.current) {
      if (Math.abs(ddx) < 8) return;
      if (Math.abs(ddx) < Math.abs(ddy)) { start.current = null; return; } // vertikales Scrollen zulassen
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setDx(Math.min(0, ddx)); // nur nach links
  }
  function up() {
    if (!start.current) return;
    start.current = null;
    if (dx <= -THRESHOLD) {
      setRemoving(true);
      setDx(-window.innerWidth);
      setTimeout(onDismiss, 180);
    } else {
      setDx(0);
      setTimeout(() => { dragging.current = false; }, 0);
    }
  }
  const progress = Math.min(1, Math.abs(dx) / THRESHOLD);

  return (
    <div className={`relative overflow-hidden rounded-2xl transition-[max-height,opacity,margin] duration-200 ${removing ? 'max-h-0 opacity-0 my-0' : 'max-h-40'}`}>
      {/* Lösch-Hintergrund */}
      <div className="absolute inset-0 flex items-center justify-end pr-6 rounded-2xl"
        style={{ background: `rgba(201,100,66,${0.25 + progress * 0.55})` }}>
        <div className="flex flex-col items-center text-white" style={{ transform: `scale(${0.8 + progress * 0.3})` }}>
          <i className="fa-solid fa-trash-can text-lg" />
          <span className="text-[10px] font-bold mt-0.5">Löschen</span>
        </div>
      </div>
      {/* Karte */}
      <button
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={() => { if (!dragging.current && dx === 0) onOpen(); }}
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform 0.2s ease', touchAction: 'pan-y' }}
        className="relative w-full flex items-start gap-3 p-4 bg-white rounded-2xl shadow-[var(--shadow-card)] text-left active:scale-[0.99]">
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
    </div>
  );
}

export function NotificationInboxPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useEffect(() => {
    notificationsApi.list().then(setItems).catch(() => setItems([]));
    notificationsApi.seen().catch(() => {});
  }, []);

  function dismiss(it: InboxItem) {
    setItems(prev => (prev ?? []).filter(x => x.id !== it.id));
    notificationsApi.dismiss(it.id).catch(() => {});
  }

  return (
    <AppShell title="Postfach" showBack>
      <div className="px-5 py-6 max-w-2xl mx-auto">
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-1" style={{ letterSpacing: '-0.02em' }}>
          Dein <em className="italic text-[var(--color-amber)]">Postfach</em>
        </h1>
        {items && items.length > 0 && (
          <p className="text-[12px] text-[var(--color-lavender-lt)] mb-4">
            <i className="fa-solid fa-arrow-left-long mr-1" />Nach links wischen zum Löschen
          </p>
        )}

        {items === null ? (
          <div className="flex justify-center py-16 text-[var(--color-lavender)] mt-4">
            <i className="fa-solid fa-circle-notch fa-spin text-3xl" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-lavender)] mt-4">
            <i className="fa-regular fa-bell text-5xl mb-4 opacity-30" />
            <p className="font-semibold mb-1">Alles erledigt</p>
            <p className="text-sm">Neue Freundschaftsanfragen, Fragen und Änderungswünsche zu deinen Orten erscheinen hier.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {items.map(it => (
              <SwipeRow key={it.id} it={it} onOpen={() => navigate(it.link)} onDismiss={() => dismiss(it)} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
