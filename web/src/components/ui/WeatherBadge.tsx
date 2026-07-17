import { useEffect, useState } from 'react';
import { getWeather, type WeatherData } from '../../services/weatherService.js';
import { WeatherSheet } from './WeatherSheet.js';

interface Props {
  lat: number | null;
  lng: number | null;
  placeId: string;
  compact?: boolean;   // true = nur Icon + Temp; false = Icon + Temp + Label
  name?: string;
}

export function WeatherBadge({ lat, lng, placeId, compact = true, name }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) return;
    getWeather(lat, lng, placeId).then(setWeather).catch(() => {});
  }, [lat, lng, placeId]);

  if (!weather) return null;

  const { icon, temp } = weather.current;
  // stopPropagation: das Badge sitzt auf der Ortskachel — ohne das öffnet sich der Ort mit.
  const open$ = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); setOpen(true); };

  return (
    <>
      <button onClick={open$} aria-label="Wetter im Detail"
        className={compact
          ? 'inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--color-lavender)] active:opacity-60'
          : 'inline-flex items-center gap-1 text-xs font-medium text-[var(--color-lavender)] bg-[var(--color-bg-soft)] px-2 py-1 rounded-full active:opacity-60'}>
        {icon} {temp}°{compact ? '' : ` · ${weather.current.label}`}
      </button>
      {open && <WeatherSheet weather={weather} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}
