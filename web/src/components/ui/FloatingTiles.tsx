import { useEffect, useState } from 'react';
import { placesApi, type ShowcasePlace } from '../../services/api.js';

/**
 * Zwei gegenläufig scrollende Reihen echter Orts-Kacheln (Bild + Name) —
 * zeigt auf der Landing-Page sofort, worum es geht: echte Lieblingsorte von Menschen.
 */
export function FloatingTiles() {
  const [tiles, setTiles] = useState<ShowcasePlace[]>([]);
  useEffect(() => { placesApi.showcase().then(setTiles).catch(() => {}); }, []);

  if (tiles.length < 4) return null;
  const half = Math.ceil(tiles.length / 2);

  return (
    <div className="relative -mx-6 mb-6 select-none"
      style={{ WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)', maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)' }}>
      <Row items={tiles.slice(0, half)} dir="L" />
      <Row items={tiles.slice(half)}    dir="R" />
    </div>
  );
}

function Row({ items, dir }: { items: ShowcasePlace[]; dir: 'L' | 'R' }) {
  const loop = [...items, ...items]; // Duplikat → nahtloser Loop bei -50%
  return (
    <div className="flex gap-3 py-1.5 w-max" style={{ animation: `gtMarquee${dir} 34s linear infinite` }}>
      {loop.map((t, i) => (
        <div key={t.id + '-' + i}
          className="relative w-28 h-20 rounded-2xl overflow-hidden flex-shrink-0 shadow-lg ring-1 ring-white/10"
          style={{ animation: `gtTileBob ${3 + (i % 4) * 0.4}s ease-in-out ${(i % 5) * 0.3}s infinite` }}>
          <img src={t.hero} alt={t.name} loading="lazy" decoding="async" className="w-full h-full object-cover"
            onError={e => { e.currentTarget.style.display = 'none'; }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          <span className="absolute bottom-1.5 left-2 right-2 text-white text-[10px] font-bold leading-tight line-clamp-2 drop-shadow">
            {t.name}
          </span>
        </div>
      ))}
    </div>
  );
}
