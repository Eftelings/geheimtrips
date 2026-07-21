import { useMemo, useState } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { VisitedPlace } from '../../services/api.js';
import type { Rating } from '../../types/index.js';

/**
 * Zeitstrahl und Lieblingsorte fürs Profil — beide im selben schmalen Fenster wie das
 * Ranking, aber mit dem vollen Funktionsumfang der Seite „Besuchte Orte": Monate zum
 * Auswählen bzw. Karten zum Verschieben.
 */

const WINDOW = { maxHeight: 340 };
const monthKey = (p: VisitedPlace) => (p.visitedAt ? p.visitedAt.slice(0, 7) : '');
const monthLabel = (key: string) =>
  key ? new Date(`${key}-01T00:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) : 'Ohne Datum';

function Stars({ n }: { n: number }) {
  return <span className="text-[11px] text-[var(--color-amber)]">{'★'.repeat(n)}</span>;
}

// ─── Zeitstrahl: nach Monaten gruppiert, Monate als Filter wählbar ────────────
export function TimelinePanel({ items, ratings, onOpen }: {
  items: VisitedPlace[];                       // bereits nach Datum absteigend
  ratings: Record<string, Rating>;
  onOpen: (id: string) => void;
}) {
  const [month, setMonth] = useState<string | null>(null);   // null = alle

  const months = useMemo(() => {
    const seen: string[] = [];
    for (const p of items) { const k = monthKey(p); if (!seen.includes(k)) seen.push(k); }
    return seen;
  }, [items]);

  const groups = useMemo(() => {
    const list = month === null ? items : items.filter(p => monthKey(p) === month);
    const out: { key: string; items: VisitedPlace[] }[] = [];
    for (const p of list) {
      const k = monthKey(p);
      let g = out.find(x => x.key === k);
      if (!g) { g = { key: k, items: [] }; out.push(g); }
      g.items.push(p);
    }
    return out;
  }, [items, month]);

  if (!items.length) return (
    <div className="text-center py-10 text-[var(--color-lavender-lt)]">
      <i className="fa-solid fa-map-location-dot text-3xl mb-2 opacity-30 block" />
      <p className="text-sm">Noch keine besuchten Orte.</p>
    </div>
  );

  return (
    <div>
      {/* Monate zum Auswählen */}
      {months.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-1">
          <button onClick={() => setMonth(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap flex-shrink-0 ${
              month === null ? 'bg-[var(--color-aubergine)] text-white' : 'bg-[var(--color-bg-soft)] text-[var(--color-lavender)]'}`}>
            Alle
          </button>
          {months.map(k => (
            <button key={k || 'none'} onClick={() => setMonth(k)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap flex-shrink-0 capitalize ${
                month === k ? 'bg-[var(--color-aubergine)] text-white' : 'bg-[var(--color-bg-soft)] text-[var(--color-lavender)]'}`}>
              {monthLabel(k)}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-y-auto no-scrollbar relative" style={{ ...WINDOW, overscrollBehavior: 'contain' }}>
        {/* durchgehende Linie wie auf der Seite „Besuchte Orte" */}
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[var(--color-bg-soft)]" />
        <div className="flex flex-col gap-5">
          {groups.map(g => (
            <div key={g.key || 'none'}>
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-4 h-4 rounded-full bg-[var(--color-amber)] ring-4 ring-[var(--color-bg)] z-10 flex-shrink-0" />
                <h3 className="font-display font-bold text-sm text-[var(--color-aubergine)] capitalize">{monthLabel(g.key)}</h3>
                <span className="text-[10px] text-[var(--color-lavender-lt)]">{g.items.length} Ort{g.items.length !== 1 ? 'e' : ''}</span>
              </div>
              <div className="flex flex-col gap-2 ml-8">
                {g.items.map(p => {
                  const d = p.visitedAt ? new Date(p.visitedAt) : null;
                  const stars = ratings[p.id]?.stars ?? 0;
                  return (
                    <button key={p.id} onClick={() => onOpen(p.id)}
                      className="w-full flex items-center gap-3 bg-white rounded-2xl p-2.5 shadow-[var(--shadow-card)] text-left active:scale-[0.99] transition-transform">
                      <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--color-bg-soft)]">
                        <img src={p.hero} alt="" loading="lazy" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-[var(--color-aubergine)] truncate">{p.name}</p>
                        <p className="text-xs text-[var(--color-lavender)] truncate">{p.region}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {stars > 0 && <Stars n={stars} />}
                          {d && <span className="text-[10px] text-[var(--color-lavender-lt)]">{d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Lieblingsorte: eigene Rangfolge, per Griff verschiebbar ──────────────────
function FavRow({ place, rank, stars, onOpen }: {
  place: VisitedPlace; rank: number; stars: number; onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: place.id });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2 bg-white rounded-2xl p-2.5 shadow-[var(--shadow-card)]">
      {/* Nur der Griff startet das Ziehen — sonst käme man nicht mehr zum Wischen/Scrollen */}
      <button {...attributes} {...listeners} aria-label="Verschieben"
        className="text-[var(--color-lavender-lt)] cursor-grab active:cursor-grabbing px-0.5 touch-none flex-shrink-0">
        <i className="fa-solid fa-grip-lines" />
      </button>
      <span className="font-display font-bold text-lg w-5 text-center flex-shrink-0"
        style={{ color: rank <= 3 ? 'var(--color-amber)' : 'var(--color-lavender-lt)' }}>{rank}</span>
      <button onClick={onOpen} className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--color-bg-soft)]">
        <img src={place.hero} alt="" loading="lazy" className="w-full h-full object-cover" />
      </button>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className="font-semibold text-sm text-[var(--color-aubergine)] truncate">{place.name}</p>
        <p className="text-xs text-[var(--color-lavender)] truncate">{place.region}</p>
        {stars > 0 && <Stars n={stars} />}
      </button>
    </div>
  );
}

export function FavoritesPanel({ items, ratings, manual, onOpen, onReorder, onReset }: {
  items: VisitedPlace[];                    // in Anzeige-Reihenfolge
  ratings: Record<string, Rating>;
  manual: boolean;                          // eigene Reihenfolge aktiv?
  onOpen: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onReset: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!items.length) return (
    <div className="text-center py-10 text-[var(--color-lavender-lt)]">
      <i className="fa-solid fa-heart text-3xl mb-2 opacity-30 block" />
      <p className="text-sm">Noch keine besuchten Orte.</p>
    </div>
  );

  return (
    <div>
      <p className="text-[11px] text-[var(--color-lavender)] leading-snug mb-2">
        {manual
          ? 'Deine eigene Rangfolge — am Griff verschieben. '
          : 'Automatisch nach deiner Bewertung sortiert — zieh die Karten am Griff für deine eigene Rangfolge. '}
        {manual && (
          <button onClick={onReset} className="font-bold text-[var(--color-amber)]">
            <i className="fa-solid fa-arrow-rotate-left mr-1" />Zurücksetzen
          </button>
        )}
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragEnd={e => {
          if (!e.over || e.active.id === e.over.id) return;
          const ids = items.map(p => p.id);
          const from = ids.indexOf(String(e.active.id));
          const to   = ids.indexOf(String(e.over.id));
          if (from < 0 || to < 0) return;
          onReorder(arrayMove(ids, from, to));
        }}>
        <SortableContext items={items.map(p => p.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2 overflow-y-auto no-scrollbar" style={{ ...WINDOW, overscrollBehavior: 'contain' }}>
            {items.map((p, i) => (
              <FavRow key={p.id} place={p} rank={i + 1} stars={ratings[p.id]?.stars ?? 0} onOpen={() => onOpen(p.id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
