import { useEffect, useRef, useState } from 'react';

/**
 * Einzeilige Tag-Chip-Leiste mit "mehr"-Button: Passen nicht alle Tags in eine
 * Zeile, erscheint rechts „mehr" — ein Klick klappt die restlichen Zeilen auf
 * („weniger" klappt wieder zu). Ob etwas überläuft, wird per ResizeObserver
 * gemessen, reagiert also auch auf Fenstergrößen-Änderungen.
 */

const COLLAPSED_H = 32; // eine Chip-Zeile (py-1.5 + text-xs + Border)

export function TagChipsRow({ tags, active, onToggle }: {
  tags: { label: string; icon: string }[];
  active: string | null;
  onToggle: (label: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > COLLAPSED_H + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tags]);

  const chipCls = (on: boolean) =>
    `flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
      on
        ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]'
        : 'bg-white text-[var(--color-lavender)] border-[var(--color-bg-soft)] hover:border-[var(--color-aubergine)] hover:text-[var(--color-aubergine)]'
    }`;

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="flex flex-wrap gap-2 overflow-hidden transition-[max-height] duration-300"
        // Rechts Platz für den "mehr"-Button reservieren, damit kein Chip darunter liegt
        style={{ maxHeight: expanded ? 600 : COLLAPSED_H, paddingRight: expanded ? 0 : 72 }}
      >
        {tags.map(tag => (
          <button
            key={tag.label}
            onClick={() => onToggle(tag.label)}
            className={chipCls(active === tag.label)}
          >
            <i className={`fa-solid ${tag.icon} text-[10px]`} />
            {tag.label}
          </button>
        ))}
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-amber)] border border-transparent hover:bg-[var(--color-bg-soft)] transition-all"
          >
            weniger <i className="fa-solid fa-chevron-up text-[10px]" />
          </button>
        )}
      </div>

      {!expanded && overflowing && (
        <button
          onClick={() => setExpanded(true)}
          className="absolute right-0 top-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-amber)] bg-white border border-[var(--color-bg-soft)] hover:border-[var(--color-amber)] transition-all"
        >
          mehr <i className="fa-solid fa-chevron-down text-[10px]" />
        </button>
      )}
    </div>
  );
}
