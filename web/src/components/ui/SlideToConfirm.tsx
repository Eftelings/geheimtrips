import { useRef, useState } from 'react';

/**
 * Schieberegler statt Knopf — für Schritte, die man nicht aus Versehen auslösen soll
 * (z.B. den Follower-Modus abschalten und dabei alle Follower verlieren).
 * Erst wenn der Griff ganz rechts ankommt, wird bestätigt.
 */
const KNOB = 44;

export function SlideToConfirm({ label, doneLabel = 'Erledigt', onConfirm }: {
  label: string;
  doneLabel?: string;
  onConfirm: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startVal: number } | null>(null);
  const [x, setX] = useState(0);
  const [done, setDone] = useState(false);

  const maxX = () => Math.max(0, (trackRef.current?.clientWidth ?? 0) - KNOB - 8);

  function down(e: React.PointerEvent) {
    if (done) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startVal: x };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d || done) return;
    const m = maxX();
    const next = Math.min(m, Math.max(0, d.startVal + (e.clientX - d.startX)));
    setX(next);
    if (next >= m - 2) {   // ganz rechts angekommen → auslösen
      drag.current = null;
      setDone(true);
      onConfirm();
    }
  }
  function up() {
    drag.current = null;
    if (!done) setX(0);   // nicht weit genug → zurückschnappen
  }

  const progress = maxX() > 0 ? x / maxX() : 0;

  return (
    <div ref={trackRef}
      className="relative w-full h-14 rounded-full overflow-hidden select-none"
      style={{ background: 'var(--color-bg-soft)' }}>
      {/* Füllung wächst mit dem Griff mit */}
      <div className="absolute inset-y-0 left-0 pointer-events-none transition-colors"
        style={{ width: x + KNOB + 4, background: done ? '#e05858' : `rgba(224,88,88,${0.10 + progress * 0.35})` }} />
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold pointer-events-none"
        style={{ color: done ? '#fff' : 'var(--color-lavender)', opacity: done ? 1 : 1 - progress * 0.6 }}>
        {done ? doneLabel : label}
      </span>
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="absolute top-1 left-1 flex items-center justify-center rounded-full bg-white shadow-md"
        style={{ width: KNOB, height: KNOB, transform: `translateX(${x}px)`, touchAction: 'none', cursor: done ? 'default' : 'grab', transition: drag.current ? 'none' : 'transform .18s ease' }}>
        <i className={`fa-solid ${done ? 'fa-check' : 'fa-angles-right'} text-sm`} style={{ color: '#e05858' }} />
      </div>
    </div>
  );
}
