import { useEffect, useRef } from 'react';
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        style={{ animation: 'gtFade 0.2s ease' }}
        onClick={onClose}
      />
      {/* Sheet / Dialog */}
      <div
        ref={ref}
        className={`relative z-10 w-full bg-white md:max-w-lg md:rounded-[var(--radius-card)] rounded-t-[var(--radius-sheet)] shadow-[var(--shadow-raised)] max-h-[90dvh] overflow-y-auto ${className}`}
        style={{ animation: 'gtSlideUp 0.28s cubic-bezier(0.32,0.72,0,1)' }}
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
    </div>
  );
}
