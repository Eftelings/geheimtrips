import { useNavigate } from 'react-router-dom';
import type { Place } from '../../types/index.js';
import { useAppStore } from '../../store/useAppStore.js';
import { WeatherBadge } from './WeatherBadge.js';
import { PlaceImage } from './PlaceImage.js';

interface Props {
  place: Place;
  showMatch?: boolean;
  className?: string;
}

export function PlaceCard({ place, showMatch, className = '' }: Props) {
  const navigate = useNavigate();
  const { savedIds, toggleSave } = useAppStore();
  const isSaved = savedIds.has(place.id);

  return (
    <div
      onClick={() => navigate(`/place/${place.id}`)}
      className={`bg-white rounded-[var(--radius-card)] shadow-[var(--shadow-card)] overflow-hidden cursor-pointer active:scale-[0.98] transition-transform ${className}`}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <PlaceImage src={place.hero} category={place.category} alt={place.name} className="w-full h-full object-cover" />
        {showMatch && (
          <div className="absolute bottom-2 left-2 bg-[var(--color-amber)] text-white text-xs font-bold px-2.5 py-1 rounded-full">
            {place.match}% Match
          </div>
        )}
        <button
          onClick={e => { e.stopPropagation(); toggleSave(place.id); }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-sm shadow-sm"
        >
          <i className={`${isSaved ? 'fa-solid' : 'fa-regular'} fa-bookmark text-[var(--color-amber)]`} />
        </button>
      </div>
      <div className="p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-0.5">
          {place.categoryLabel}
        </div>
        <div className="font-display font-semibold text-[var(--color-aubergine)] text-sm leading-tight">{place.name}</div>
        <div className="text-[var(--color-lavender)] text-xs mt-0.5 flex items-center gap-1">
          <i className="fa-solid fa-location-dot text-[10px]" />
          {place.region}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-[var(--color-lavender)]">
            <i className="fa-solid fa-star text-[var(--color-amber)] text-[10px]" /> {place.rating}
          </span>
          <span className="text-xs text-[var(--color-lavender)]">{place.costLabel}</span>
          <span className="text-xs text-[var(--color-lavender)]">{place.distanceLabel}</span>
          <WeatherBadge lat={place.lat} lng={place.lng} placeId={place.id} compact />
        </div>
      </div>
    </div>
  );
}
