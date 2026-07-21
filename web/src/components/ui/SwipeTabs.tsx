import { useRef, useState, type ReactNode } from 'react';

/**
 * Mehrere Kategorien auf demselben Platz: oben die Umschalter, darunter genau eine
 * Kachel — wischbar nach links/rechts. Hält die Profilseite kurz, statt drei Blöcke
 * untereinander zu stapeln.
 */
export function SwipeTabs({ tabs, index, onIndex, right, children }: {
  tabs: { key: string; label: string; icon?: string }[];
  index: number;
  onIndex: (i: number) => void;
  /** Platz rechts neben den Umschaltern — z.B. der Öffentlich-Schalter der aktiven Kategorie. */
  right?: ReactNode;
  children: ReactNode[];
}) {
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; dir: 'h' | 'v' | null } | null>(null);
  const width = useRef(0);
  const viewRef = useRef<HTMLDivElement>(null);

  function start(e: React.TouchEvent) {
    width.current = viewRef.current?.clientWidth ?? 1;
    drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dir: null };
  }
  function move(e: React.TouchEvent) {
    const d = drag.current; if (!d) return;
    const mx = e.touches[0].clientX - d.x;
    const my = e.touches[0].clientY - d.y;
    // Richtung einmal festlegen: quer gehört uns, längs dem Scrollen in der Kachel
    if (!d.dir) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      d.dir = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
    }
    if (d.dir !== 'h') return;
    // An den Rändern nur gedämpft mitgehen — zeigt, dass dort Schluss ist
    const over = (index === 0 && mx > 0) || (index === tabs.length - 1 && mx < 0);
    setDx(over ? mx * 0.28 : mx);
  }
  function end() {
    const d = drag.current; drag.current = null;
    if (d?.dir === 'h' && Math.abs(dx) > width.current * 0.22) {
      onIndex(Math.min(tabs.length - 1, Math.max(0, index + (dx < 0 ? 1 : -1))));
    }
    setDx(0);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {/* Die Leiste nimmt den ganzen Rest der Zeile — jeder Reiter bekommt gleich viel Platz,
            damit auch „Lieblingsorte" neben dem Schalter noch hineinpasst. */}
        <div className="flex-1 min-w-0 flex gap-1 p-1 bg-[var(--color-bg-soft)] rounded-2xl">
          {tabs.map((t, i) => (
            <button key={t.key} onClick={() => onIndex(i)}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-1.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                i === index ? 'bg-white text-[var(--color-aubergine)] shadow-sm' : 'text-[var(--color-lavender)]'}`}>
              {t.icon && <i className={`fa-solid ${t.icon} flex-shrink-0`} />}
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
        {right}
      </div>

      <div ref={viewRef} className="overflow-hidden" onTouchStart={start} onTouchMove={move} onTouchEnd={end}>
        <div className="flex items-start"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${dx}px))`,
            transition: drag.current ? 'none' : 'transform .28s cubic-bezier(.32,.72,0,1)',
          }}>
          {children.map((child, i) => (
            <div key={tabs[i]?.key ?? i} className="w-full flex-shrink-0"
              /* Inaktive Kacheln aus der Tab-Reihenfolge nehmen, aber im Layout lassen */
              aria-hidden={i !== index}>
              {child}
            </div>
          ))}
        </div>
      </div>

      {/* Punkte als Orientierung, welche Kachel gerade dran ist */}
      <div className="flex justify-center gap-1.5 mt-2.5">
        {tabs.map((t, i) => (
          <span key={t.key} className="rounded-full transition-all"
            style={{
              width: i === index ? 16 : 6, height: 6,
              background: i === index ? 'var(--color-amber)' : 'var(--color-bg-soft)',
            }} />
        ))}
      </div>
    </div>
  );
}
