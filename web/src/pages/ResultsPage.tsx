import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { useAppStore } from '../store/useAppStore.js';
import { matchPlaces } from '../services/matchService.js';
import type { Place } from '../types/index.js';
import { PlaceCard } from '../components/ui/PlaceCard.js';
import { TripMap } from '../components/map/TripMap.js';

type View = 'swipe' | 'liste' | 'karte';
type Filter = 'neu' | 'alle';

export function ResultsPage() {
  const navigate = useNavigate();
  const { places, funnelAnswers, visitedIds, savedIds, toggleSave, placesLoaded, loadPlaces } = useAppStore();
  const [view, setView]     = useState<View>('swipe');
  const [filter, setFilter] = useState<Filter>('neu');

  useEffect(() => { loadPlaces(); }, []);

  const defaultAnswers = { when: null, location: '', transport: 'auto' as const, distanceMin: 60, budget: null, vibe: [50,50,50,50] as [number,number,number,number], social: null, meetPeople: false };
  const answers = funnelAnswers ?? defaultAnswers;

  let matched = matchPlaces(places, answers);
  if (filter === 'neu') matched = matched.filter(p => !visitedIds.has(p.id));

  return (
    <AppShell showBack>
      <div className="px-6 pt-5 max-w-2xl mx-auto">
        {/* Header */}
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-1">Dein Match</p>
        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-4" style={{ letterSpacing: '-0.02em' }}>
          Hier sind <em className="italic text-[var(--color-amber)]">{matched.length}</em> Geheimtrips für dich
        </h1>
        <p className="text-xs text-[var(--color-lavender)] mb-5">Alle mit über 50 % Übereinstimmung</p>

        {/* Filter */}
        <div className="flex gap-2 mb-4">
          {(['neu', 'alle'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 py-2 rounded-full text-sm font-semibold border-2 transition-colors ${
                filter === f
                  ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]'
                  : 'bg-white text-[var(--color-aubergine)] border-[var(--color-bg-soft)]'
              }`}>
              {f === 'neu' ? 'Nur neue Orte' : 'inkl. besuchter Orte'}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex gap-1 bg-[var(--color-bg-soft)] rounded-full p-1 mb-6">
          {(['swipe', 'liste', 'karte'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 py-1.5 rounded-full text-sm font-semibold capitalize transition-colors ${
                view === v ? 'bg-white text-[var(--color-aubergine)] shadow-[var(--shadow-card)]' : 'text-[var(--color-lavender)]'
              }`}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {matched.length === 0 && (
          <div className="text-center py-12 text-[var(--color-lavender)]">
            <i className="fa-solid fa-map-location-dot text-4xl mb-3 opacity-30" />
            <p className="text-sm">Keine Treffer — probier andere Filtereinstellungen.</p>
          </div>
        )}

        {/* Swipe view */}
        {view === 'swipe' && matched.length > 0 && (
          <SwipeDeck places={matched} onSave={toggleSave} savedIds={savedIds} onOpen={id => navigate(`/place/${id}`)} />
        )}

        {/* Liste view */}
        {view === 'liste' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {matched.map(p => <PlaceCard key={p.id} place={p} showMatch />)}
          </div>
        )}

        {/* Karte view */}
        {view === 'karte' && (
          <div className="rounded-2xl overflow-hidden h-72 md:h-96">
            <TripMap places={matched} showRoute={false} numbered={false} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Swipe Deck ───────────────────────────────────────────────────────────────

function SwipeDeck({ places, onSave, savedIds, onOpen }: {
  places: Place[];
  onSave: (id: string) => void;
  savedIds: Set<string>;
  onOpen: (id: string) => void;
}) {
  const [idx, setIdx]     = useState(0);
  const [drag, setDrag]   = useState({ x: 0, y: 0, dragging: false });
  const startRef          = useRef({ x: 0, y: 0 });
  const cardRef           = useRef<HTMLDivElement>(null);

  const place = places[idx];
  if (!place) return (
    <div className="text-center py-16 text-[var(--color-lavender)]">
      <i className="fa-solid fa-check-circle text-4xl text-[var(--color-success)] mb-3" />
      <p className="font-semibold">Alle gesehen!</p>
    </div>
  );

  const skip = () => setIdx(i => i + 1);
  const save = () => { onSave(place.id); setIdx(i => i + 1); };

  const rotation = drag.x * 0.08;
  const opacity = 1 - Math.abs(drag.x) / 400;

  return (
    <div className="relative flex flex-col items-center">
      {/* Next card peek */}
      {places[idx + 1] && (
        <div className="absolute top-2 left-2 right-2 rounded-2xl overflow-hidden bg-white shadow-[var(--shadow-card)]" style={{ height: 380, opacity: 0.5, transform: 'scale(0.95)' }}>
          <img src={places[idx + 1].hero} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Active card */}
      <div
        ref={cardRef}
        className="relative w-full rounded-2xl overflow-hidden shadow-[var(--shadow-raised)] cursor-grab active:cursor-grabbing select-none touch-none"
        style={{ height: 400, transform: `translateX(${drag.x}px) rotate(${rotation}deg)`, opacity, transition: drag.dragging ? 'none' : 'all 0.3s' }}
        onPointerDown={e => {
          cardRef.current?.setPointerCapture(e.pointerId);
          startRef.current = { x: e.clientX, y: e.clientY };
          setDrag(d => ({ ...d, dragging: true }));
        }}
        onPointerMove={e => {
          if (!drag.dragging) return;
          setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y, dragging: true });
        }}
        onPointerUp={() => {
          if (drag.x > 100) save();
          else if (drag.x < -100) skip();
          setDrag({ x: 0, y: 0, dragging: false });
        }}
        onClick={() => { if (Math.abs(drag.x) < 5) onOpen(place.id); }}
      >
        <img src={place.hero} alt={place.name} className="w-full h-full object-cover pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Save indicator */}
        {drag.x > 30 && (
          <div className="absolute top-6 left-6 bg-[var(--color-success)] text-white font-bold px-4 py-1.5 rounded-full text-sm rotate-[-15deg]">MERKEN</div>
        )}
        {drag.x < -30 && (
          <div className="absolute top-6 right-6 bg-[var(--color-danger)] text-white font-bold px-4 py-1.5 rounded-full text-sm rotate-[15deg]">WEITER</div>
        )}

        {/* Labels */}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="bg-black/50 text-white text-xs px-2.5 py-1 rounded-full">{place.categoryLabel}</span>
        </div>
        <div className="absolute top-3 right-3">
          <span className="bg-[var(--color-amber)] text-white text-xs font-bold px-2.5 py-1 rounded-full">{place.match}% Match</span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-display font-bold text-white text-2xl leading-tight">{place.name}</h3>
          <p className="text-white/80 text-sm flex items-center gap-1 mt-0.5">
            <i className="fa-solid fa-location-dot text-xs" /> {place.region}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-4 mt-5">
        <button onClick={skip}
          className="w-14 h-14 rounded-full bg-white shadow-[var(--shadow-card)] flex items-center justify-center text-[var(--color-danger)] active:scale-90 transition-transform">
          <i className="fa-solid fa-xmark text-xl" />
        </button>
        <button onClick={() => onOpen(place.id)}
          className="w-14 h-14 rounded-full bg-[var(--color-bg-soft)] shadow-[var(--shadow-card)] flex items-center justify-center text-[var(--color-aubergine)] active:scale-90 transition-transform">
          <i className="fa-solid fa-info text-xl" />
        </button>
        <button onClick={save}
          className="w-14 h-14 rounded-full bg-[var(--color-amber)] shadow-[var(--shadow-amber)] flex items-center justify-center text-white active:scale-90 transition-transform">
          <i className="fa-solid fa-bookmark text-xl" />
        </button>
      </div>
      <p className="text-xs text-[var(--color-lavender-lt)] mt-3">{idx + 1} / {places.length}</p>
    </div>
  );
}
