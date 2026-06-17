import type { ReactNode } from 'react';

interface Props {
  title: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHead({ title, action, className = '' }: Props) {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-amber)]">{title}</span>
      {action}
    </div>
  );
}
