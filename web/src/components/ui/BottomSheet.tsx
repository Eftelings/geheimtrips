import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function BottomSheet({ open, onClose, title, children, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Ein `fixed`-Sheet hängt am Layout-Viewport — und den ändert die Tastatur (iOS) nicht: das Sheet
  // liegt dann darunter, genau dort, wo man tippen will. Der visualViewport kennt die tatsächlich
  // sichtbare Höhe; um dessen Differenz heben wir das Sheet an.
  const [kbInset, setKbInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) return;
    const apply = () => setKbInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply); };
  }, [open]);

  // Escape schließt (Desktop) — zusätzliche, immer verfügbare Schließ-Möglichkeit.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // In einen Portal an <body> hängen: sonst positioniert ein transformierter/gefilterter Vorfahre
  // (z.B. das animierte Orts-Sheet) dieses `fixed`-Overlay relativ zu sich — dann liegen Backdrop
  // und X-Knopf außerhalb des Sichtbaren und das Sheet lässt sich „manchmal" nicht schließen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
      style={{ bottom: kbInset, transition: 'bottom .2s ease' }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        style={{ animation: 'gtFade 0.2s ease', bottom: -kbInset }}
        onClick={onClose}
      />
      {/* Sheet / Dialog */}
      <div
        ref={ref}
        className={`relative z-10 w-full bg-white md:max-w-lg md:rounded-[var(--radius-card)] rounded-t-[var(--radius-sheet)] shadow-[var(--shadow-raised)] overflow-y-auto ${className}`}
        style={{ animation: 'gtSlideUp 0.28s cubic-bezier(0.32,0.72,0,1)', maxHeight: `calc(90dvh - ${kbInset}px)` }}
      >
        {/* Handle (mobile only) */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--color-lavender-lt)]" />
        </div>
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-bg-soft)]">
            <span className="font-ui font-semibold text-[var(--color-aubergine)]">{title}</span>
            <button onClick={onClose} className="text-[var(--color-lavender)] hover:text-[var(--color-aubergine)] text-lg w-8 h-8 flex items-center justify-center">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        )}
        <div className="px-5 pb-6 pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
