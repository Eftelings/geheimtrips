/**
 * Die drei Profil-Zahlen als kompakte Knöpfe: Symbol + Zahl (besucht · erstellt · gemerkt).
 * Im Blog sind sie einzeln freischaltbar — dort wird schlicht weggelassen, was nicht
 * veröffentlicht ist. `onImage` für die Variante über dem Titelbild.
 */
export interface CountItem {
  icon: string;
  value: number;
  /** Nur für Tooltip/Screenreader — sichtbar ist bewusst nur die Zahl. */
  label: string;
  onClick?: () => void;
}

export function ProfileCounts({ items, onImage, className = '' }: {
  items: CountItem[]; onImage?: boolean; className?: string;
}) {
  if (!items.length) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {items.map(it => (
        <button key={it.label} onClick={it.onClick} disabled={!it.onClick}
          title={it.label} aria-label={`${it.value} ${it.label}`}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-bold ${
            onImage ? 'text-white' : 'text-[var(--color-aubergine)] shadow-[var(--shadow-card)]'
          } ${it.onClick ? 'active:scale-95 transition-transform' : ''}`}
          style={onImage
            ? { background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(6px)' }
            : { background: '#fff' }}>
          <i className={`fa-solid ${it.icon} text-[13px] ${onImage ? 'text-white/75' : 'text-[var(--color-amber)]'}`} />
          {it.value}
        </button>
      ))}
    </div>
  );
}
