/**
 * Kleiner Schalter hinter einer Überschrift: gibt diesen Abschnitt fürs öffentliche Blog frei.
 * „Öffentlich" heißt: wer Follower zulässt, zeigt ihn allen — sonst nur Freund:innen.
 */
export function PublicToggle({ on, onChange, label = 'Öffentlich', compact }: {
  on: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  /** Nur Auge statt Text + Schalter — für enge Zeilen wie die Reiterleiste. */
  compact?: boolean;
}) {
  if (compact) return (
    <button onClick={() => onChange(!on)} title={on ? `${label} — sichtbar` : `${label} — nur für dich`}
      aria-label={label}
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
      style={{ background: on ? 'var(--color-amber)' : 'var(--color-bg-soft)' }}>
      <i className={`fa-solid ${on ? 'fa-eye' : 'fa-eye-slash'} text-xs`}
        style={{ color: on ? '#fff' : 'var(--color-lavender-lt)' }} />
    </button>
  );
  return (
    <button onClick={() => onChange(!on)} title={on ? `${label} — sichtbar` : `${label} — nur für dich`}
      className="flex items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform">
      <span className={`text-[10px] font-bold uppercase tracking-wider ${on ? 'text-[var(--color-amber)]' : 'text-[var(--color-lavender-lt)]'}`}>
        <i className={`fa-solid ${on ? 'fa-eye' : 'fa-eye-slash'} mr-1`} />{label}
      </span>
      <span className={`w-9 h-5 rounded-full relative transition-colors ${on ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-bg-soft)]'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
