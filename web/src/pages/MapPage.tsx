import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { TripMap } from '../components/map/TripMap.js';
import { useAppStore } from '../store/useAppStore.js';
import type { Place } from '../types/index.js';

type Filter = 'alle' | 'nah' | 'gemerkt';

export function MapPage() {
  const navigate = useNavigate();
  const { places, savedIds, loadPlaces } = useAppStore();
  const [filter, setFilter] = useState<Filter>('alle');
  const [active, setActive] = useState<Place | null>(null);

  useEffect(() => { loadPlaces(); }, []);

  const filtered = places.filter(p => {
    if (filter === 'nah')    return p.distanceMin <= 60;
    if (filter === 'gemerkt') return savedIds.has(p.id);
    return true;
  });

  return (
    <AppShell noHeader>
      <div className="relative w-full h-dvh flex flex-col">
        {/* Map */}
        <div className="flex-1">
          <TripMap places={filtered} showRoute={false} numbered={false}
            onMarkerClick={id => setActive(places.find(p => p.id === id) ?? null)}
            activeId={active?.id}
            className="w-full h-full"
          />
        </div>

        {/* Back button */}
        <button onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-10 w-10 h-10 bg-white rounded-full shadow-[var(--shadow-raised)] flex items-center justify-center text-[var(--color-aubergine)]">
          <i className="fa-solid fa-arrow-left" />
        </button>

        {/* Filter chips */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-white rounded-full shadow-[var(--shadow-raised)] px-2 py-1.5">
          {(['alle', 'nah', 'gemerkt'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors capitalize ${
                filter === f ? 'bg-[var(--color-aubergine)] text-white' : 'text-[var(--color-lavender)]'
              }`}>
              {f === 'alle' ? 'Alle' : f === 'nah' ? 'Nah dran' : 'Gemerkt'}
            </button>
          ))}
        </div>

        {/* Active place card */}
        {active && (
          <div
            className="absolute bottom-4 left-4 right-4 z-10 bg-white rounded-2xl shadow-[var(--shadow-raised)] p-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
            style={{ animation: 'gtSlideUp 0.2s ease' }}
            onClick={() => navigate(`/place/${active.id}`)}
          >
            <img src={active.hero} alt={active.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-[var(--color-aubergine)] text-sm truncate">{active.name}</div>
              <div className="text-xs text-[var(--color-lavender)] flex items-center gap-1 mt-0.5">
                <i className="fa-solid fa-location-dot text-[10px]" />{active.region}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-[var(--color-lavender)]"><i className="fa-solid fa-star text-[var(--color-amber)] text-[10px]" /> {active.rating}</span>
                <span className="text-xs text-[var(--color-lavender)]">{active.distanceLabel}</span>
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); setActive(null); }} className="text-[var(--color-lavender-lt)] ml-1">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
