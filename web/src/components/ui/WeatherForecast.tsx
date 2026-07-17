import { useEffect, useState } from 'react';
import { getWeather, getRainRisk, type WeatherData } from '../../services/weatherService.js';
import { WeatherSheet } from './WeatherSheet.js';

interface Props {
  lat: number | null;
  lng: number | null;
  placeId: string;
  name?: string;
}

export function WeatherForecast({ lat, lng, placeId, name }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) { setLoading(false); return; }
    getWeather(lat, lng, placeId)
      .then(setWeather)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lat, lng, placeId]);

  if (loading) return (
    <div className="h-16 flex items-center justify-center text-[var(--color-lavender-lt)]">
      <i className="fa-solid fa-circle-notch fa-spin text-sm" />
    </div>
  );
  if (!weather) return null;

  const { current, forecast } = weather;
  const riskLevel = getRainRisk(forecast);
  const riskColors = { low: 'text-[var(--color-success)]', medium: 'text-[var(--color-amber)]', high: 'text-[var(--color-danger)]' };
  const riskLabels = { low: 'Gutes Wetter', medium: 'Teils bewölkt', high: 'Regen möglich' };

  return (
    <>
      {/* Der ganze Block ist antippbar — Tagesverlauf und Details liegen im Sheet. */}
      <button onClick={() => setOpen(true)}
        className="block w-full text-left bg-[var(--color-bg-soft)] rounded-2xl p-4 mb-5 active:scale-[0.99] transition-transform">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-3 flex items-center gap-1.5">
          Wetter <i className="fa-solid fa-chevron-right text-[9px] opacity-60" />
        </p>

        {/* Aktuell */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">{current.icon}</span>
          <div>
            <div className="font-bold text-xl text-[var(--color-aubergine)]">{current.temp}°C</div>
            <div className="text-xs text-[var(--color-lavender)]">
              {current.label} · Wind {current.windKmh} km/h
            </div>
          </div>
          <div className={`ml-auto text-xs font-semibold ${riskColors[riskLevel]}`}>
            <i className={`fa-solid ${riskLevel === 'low' ? 'fa-sun' : riskLevel === 'medium' ? 'fa-cloud-sun' : 'fa-cloud-rain'} mr-1`} />
            {riskLabels[riskLevel]}
          </div>
        </div>

        {/* 3-Tage-Vorschau */}
        <div className="flex gap-2">
          {forecast.map((day) => (
            <div key={day.date} className="flex-1 bg-white rounded-xl p-2.5 text-center">
              <div className="text-[10px] font-bold text-[var(--color-lavender)] uppercase mb-1">{day.date}</div>
              <div className="text-lg mb-0.5">{day.icon}</div>
              <div className="font-bold text-sm text-[var(--color-aubergine)]">{day.tempMax}°</div>
              {day.rainPct > 20 && (
                <div className="text-[10px] text-[var(--color-lavender-lt)] mt-0.5">
                  {day.rainPct}% 🌧️
                </div>
              )}
            </div>
          ))}
        </div>
      </button>
      {open && <WeatherSheet weather={weather} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}
