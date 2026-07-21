import { useState } from 'react';

/**
 * Die Bildmarke (Kompass mit G). Liegt als Datei unter /logo.svg — fehlt sie, zeigen wir
 * ersatzweise das „G" in Markenfarben, damit nie ein kaputtes Bild erscheint.
 */
export function BrandMark({ size = 44, className = '' }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return (
    <span className={`rounded-2xl flex items-center justify-center font-display font-bold text-white ${className}`}
      style={{ width: size, height: size, background: 'var(--color-aubergine)', fontSize: size * 0.5 }}>
      G
    </span>
  );

  return (
    <img src="/logo.svg" alt="Geheimtrips.de" width={size} height={size}
      onError={() => setFailed(true)}
      className={className} style={{ width: size, height: size, objectFit: 'contain' }} />
  );
}
