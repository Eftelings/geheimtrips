import type { CSSProperties } from 'react';

const CAT_ICON: Record<string, string> = {
  natur: 'fa-leaf', kultur: 'fa-landmark', genuss: 'fa-mug-hot',
  aktiv: 'fa-person-hiking', mystisch: 'fa-user-secret', wasser: 'fa-water',
};

/**
 * Ortsbild mit Marken-Platzhalter: Ohne hochgeladenes Bild wird KEIN Stock-Foto
 * erfunden, sondern ein dezenter Aubergine-Verlauf mit Kategorie-Icon gezeigt.
 */
export function PlaceImage({ src, category, alt = '', className = '', style, iconClass = 'text-2xl', eager = false }: {
  src?: string | null;
  category?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  iconClass?: string;
  /** Nur fürs LCP-Bild („above the fold") setzen — alles andere lädt faul nach. */
  eager?: boolean;
}) {
  if (src) {
    // Listen/Karten rendern viele Bilder auf einmal: faul laden, damit sie dem
    // sichtbaren Bild nicht die Bandbreite wegnehmen.
    return <img src={src} alt={alt} className={className} style={style}
      loading={eager ? 'eager' : 'lazy'} decoding="async" />;
  }
  return (
    <div className={`flex items-center justify-center ${className}`}
      style={{ background: 'linear-gradient(135deg, #34254C 0%, #71587A 100%)', ...style }}>
      <i className={`fa-solid ${CAT_ICON[category ?? ''] ?? 'fa-mountain-sun'} text-white/35 ${iconClass}`} />
    </div>
  );
}
