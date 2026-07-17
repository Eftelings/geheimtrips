import { BottomSheet } from './BottomSheet.js';
import { getRainRisk, type WeatherData } from '../../services/weatherService.js';

/**
 * Wetter-Detail: aktuell, Tagesverlauf (nächste 12 Stunden) und die 3 Folgetage.
 * Bekommt die bereits geladenen Daten übergeben — der Service cacht sie ohnehin je Ort,
 * ein eigener Abruf hier wäre nur eine zweite Quelle für dieselbe Zahl.
 */
export function WeatherSheet({ weather, name, onClose }: {
  weather: WeatherData;
  name?: string;
  onClose: () => void;
}) {
  const { current, forecast, hours } = weather;
  const risk = getRainRisk(forecast);
  const riskColor = { low: 'var(--color-success)', medium: 'var(--color-amber)', high: 'var(--color-danger)' }[risk];
  const riskLabel = { low: 'Gutes Wetter', medium: 'Teils bewölkt', high: 'Regen möglich' }[risk];
  // Skala für die Temperaturkurve — bei konstanter Temperatur nicht durch 0 teilen.
  const temps = hours.map(h => h.temp);
  const lo = Math.min(...temps, current.temp);
  const hi = Math.max(...temps, current.temp);
  const span = Math.max(1, hi - lo);

  return (
    <BottomSheet open onClose={onClose} title={name ? `Wetter · ${name}` : 'Wetter'}>
      <div className="pb-2">
        {/* Aktuell */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">{current.icon}</span>
          <div>
            <div className="font-bold text-2xl text-[var(--color-aubergine)]">{current.temp}°C</div>
            <div className="text-xs text-[var(--color-lavender)]">{current.label} · Wind {current.windKmh} km/h</div>
          </div>
          <span className="ml-auto text-xs font-semibold" style={{ color: riskColor }}>{riskLabel}</span>
        </div>

        {/* Tagesverlauf */}
        {hours.length > 0 && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-2">Heute im Verlauf</p>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-4 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
              {hours.map((h, i) => (
                <div key={i} className="flex-shrink-0 w-12 rounded-xl py-2 text-center bg-[var(--color-bg-soft)]">
                  <div className="text-[10px] font-bold text-[var(--color-lavender)]">{h.hour}<span className="opacity-60">h</span></div>
                  <div className="text-base leading-tight my-0.5">{h.icon}</div>
                  {/* Balken statt Zahlenkolonne: der Verlauf ist auf einen Blick lesbar */}
                  <div className="h-8 flex items-end justify-center">
                    <div className="w-1.5 rounded-full" style={{
                      height: `${20 + ((h.temp - lo) / span) * 80}%`,
                      background: 'var(--color-amber)',
                    }} />
                  </div>
                  <div className="text-[11px] font-bold text-[var(--color-aubergine)] mt-0.5">{h.temp}°</div>
                  {h.rainPct >= 20 && <div className="text-[9px] text-[var(--color-lavender-lt)]">{h.rainPct}%</div>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Folgetage */}
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-amber)] mb-2">Nächste Tage</p>
        <div className="flex gap-2">
          {forecast.map(day => (
            <div key={day.date} className="flex-1 bg-[var(--color-bg-soft)] rounded-xl p-2.5 text-center">
              <div className="text-[10px] font-bold text-[var(--color-lavender)] uppercase mb-1">{day.date}</div>
              <div className="text-lg mb-0.5">{day.icon}</div>
              <div className="font-bold text-sm text-[var(--color-aubergine)]">{day.tempMax}°</div>
              <div className="text-[10px] text-[var(--color-lavender)] mt-0.5 leading-tight">{day.label}</div>
              {day.rainPct > 20 && <div className="text-[10px] text-[var(--color-lavender-lt)]">{day.rainPct}% 🌧️</div>}
            </div>
          ))}
        </div>

        <p className="text-[10px] text-[var(--color-lavender-lt)] mt-4 text-center">Daten: Open-Meteo</p>
      </div>
    </BottomSheet>
  );
}
