import { useEffect, useState } from 'react';
import { getWeather, type WeatherData } from '../../services/weatherService.js';

interface Props {
  lat: number | null;
  lng: number | null;
  placeId: string;
  compact?: boolean;   // true = nur Icon + Temp; false = Icon + Temp + Label
}

export function WeatherBadge({ lat, lng, placeId, compact = true }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    if (lat == null || lng == null) return;
    getWeather(lat, lng, placeId).then(setWeather).catch(() => {});
  }, [lat, lng, placeId]);

  if (!weather) return null;

  const { icon, temp } = weather.current;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--color-lavender)]">
        {icon} {temp}°
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-lavender)] bg-[var(--color-bg-soft)] px-2 py-1 rounded-full">
      {icon} {temp}° · {weather.current.label}
    </span>
  );
}
