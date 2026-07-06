import type { CSSProperties } from 'react';
import { useTaxVocab, tagInfoFrom } from '../../data/taxVocab.js';

/**
 * Zeigt den Typ-Tag eines Ortes als Pille (Label in Gruppenfarbe).
 * Fällt auf `fallback` (alte categoryLabel) zurück, solange ein Ort noch keinen Tag hat.
 * variant: 'soft' = getönter Hintergrund · 'plain' = nur farbiger Text · 'dark' = für dunkle Flächen.
 */
export function TagBadge({ slug, fallback, icon = false, variant = 'soft', className = '', style }: {
  slug?: string | null;
  fallback?: string | null;
  icon?: boolean;
  variant?: 'soft' | 'plain' | 'dark';
  className?: string;
  style?: CSSProperties;
}) {
  const vocab = useTaxVocab();
  const tag = tagInfoFrom(vocab, slug);
  const label = tag?.label ?? fallback;
  if (!label) return null;
  const color = tag?.color ?? 'var(--color-amber)';

  const base = 'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5';
  const variantStyle: CSSProperties =
    variant === 'dark'  ? { background: 'rgba(0,0,0,0.5)', color: '#fff' }
    : variant === 'plain' ? { color }
    : { background: `${color}1a`, color };

  return (
    <span className={`${base} ${className}`} style={{ ...variantStyle, ...style }}>
      {icon && tag && <i className={`fa-solid ${tag.icon} text-[9px]`} />}
      {label}
    </span>
  );
}
