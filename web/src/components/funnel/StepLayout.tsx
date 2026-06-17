import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  step: number;
  total?: number;
  question: ReactNode;
  kicker: string;
  children: ReactNode;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  showPrev?: boolean;
}

export function StepLayout({
  step, total = 10, question, kicker, children, onNext, nextDisabled, nextLabel = 'Weiter', showPrev = true,
}: Props) {
  const navigate = useNavigate();
  const pct = ((step - 1) / total) * 100;

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-bg)] max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="sticky top-0 z-10 bg-[var(--color-bg)] px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          {showPrev && (
            <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center text-[var(--color-aubergine)] flex-shrink-0">
              <i className="fa-solid fa-chevron-left" />
            </button>
          )}
          <div className="flex-1 h-1 rounded-full bg-[var(--color-bg-soft)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-amber)] rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-[var(--color-lavender-lt)] flex-shrink-0 w-8 text-right">
            {step}/{total}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 pt-4 pb-6 overflow-y-auto">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-amber)] mb-2">
          {kicker}
        </p>
        <h2
          className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-7 leading-snug"
          style={{ letterSpacing: '-0.02em' }}
        >
          {question}
        </h2>
        {children}
      </div>

      {/* CTA */}
      <div className="px-5 pb-8 pt-2 bg-[var(--color-bg)]">
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="w-full bg-[var(--color-amber)] text-white font-bold py-4 rounded-2xl shadow-[var(--shadow-amber)] transition-opacity disabled:opacity-40 text-base"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
