import { useEffect, useState } from 'react';

interface Props {
  message: string;
  icon?: string;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export function Toast({ message, icon = 'fa-check-circle', visible, onHide, duration = 2500 }: Props) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onHide, duration);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 bg-[var(--color-aubergine)] text-white px-4 py-2.5 rounded-full shadow-[var(--shadow-raised)] text-sm font-semibold"
      style={{ animation: 'gtFade 0.2s ease' }}
    >
      <i className={`fa-solid ${icon} text-[var(--color-amber)]`} />
      {message}
    </div>
  );
}
