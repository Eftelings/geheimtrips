/**
 * Wetter-Service via Open-Meteo (https://open-meteo.com).
 * Komplett kostenlos, kein API-Key, CORS-fähig, WMO-Wettercodes.
 */

export interface CurrentWeather {
  temp: number;           // °C, gerundet
  code: number;           // WMO Wettercode
  label: string;          // "Sonnig", "Bewölkt", …
  icon: string;           // Emoji
  windKmh: number;
  isDay: boolean;
}

export interface DayForecast {
  date: string;           // "Mo", "Di", …
  code: number;
  icon: string;
  label: string;
  tempMax: number;
  rainPct: number;        // Regenwahrscheinlichkeit 0–100
}

export interface WeatherData {
  current: CurrentWeather;
  forecast: DayForecast[];  // 3 Tage
  fetchedAt: number;         // timestamp
}

// In-Memory-Cache: placeId / `${lat},${lng}` → WeatherData (30 min TTL)
const cache = new Map<string, WeatherData>();
const TTL_MS = 30 * 60 * 1000;

/** WMO Wetter-Code → Label + Emoji */
function decodeWMO(code: number, isDay = true): { label: string; icon: string } {
  if (code === 0)            return { label: 'Klar',            icon: isDay ? '☀️' : '🌙' };
  if (code <= 2)             return { label: 'Leicht bewölkt',  icon: '⛅' };
  if (code === 3)            return { label: 'Bewölkt',         icon: '☁️' };
  if (code <= 48)            return { label: 'Nebel',           icon: '🌫️' };
  if (code <= 55)            return { label: 'Nieselregen',     icon: '🌦️' };
  if (code <= 65)            return { label: 'Regen',           icon: '🌧️' };
  if (code <= 75)            return { label: 'Schnee',          icon: '❄️' };
  if (code <= 77)            return { label: 'Schneeregen',     icon: '🌨️' };
  if (code <= 82)            return { label: 'Regenschauer',    icon: '🌦️' };
  if (code <= 86)            return { label: 'Schneeschauer',   icon: '🌨️' };
  if (code <= 95)            return { label: 'Gewitter',        icon: '⛈️' };
  return                            { label: 'Unwetter',        icon: '🌩️' };
}

const DAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export async function getWeather(lat: number, lng: number, cacheKey?: string): Promise<WeatherData> {
  const key = cacheKey ?? `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weathercode,wind_speed_10m,is_day` +
    `&daily=weathercode,temperature_2m_max,precipitation_probability_max` +
    `&timezone=Europe%2FBerlin&forecast_days=4`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Wetterdaten nicht verfügbar.');
  const raw = await res.json();

  const cur = raw.current;
  const isDay = !!cur.is_day;
  const { label: curLabel, icon: curIcon } = decodeWMO(cur.weathercode, isDay);

  const current: CurrentWeather = {
    temp: Math.round(cur.temperature_2m),
    code: cur.weathercode,
    label: curLabel,
    icon: curIcon,
    windKmh: Math.round(cur.wind_speed_10m),
    isDay,
  };

  // Nur Tage ab morgen (Index 1..3)
  const forecast: DayForecast[] = raw.daily.time.slice(1, 4).map((dateStr: string, i: number) => {
    const code = raw.daily.weathercode[i + 1];
    const { label, icon } = decodeWMO(code, true);
    const dayIdx = new Date(dateStr).getDay();
    return {
      date: DAYS_DE[dayIdx],
      code,
      icon,
      label,
      tempMax: Math.round(raw.daily.temperature_2m_max[i + 1]),
      rainPct: raw.daily.precipitation_probability_max[i + 1] ?? 0,
    };
  });

  const result: WeatherData = { current, forecast, fetchedAt: Date.now() };
  cache.set(key, result);
  return result;
}

/** Regenwahrscheinlichkeit für ein bestimmtes Datum (ISO string) */
export function getRainRisk(forecast: DayForecast[]): 'low' | 'medium' | 'high' {
  const maxRain = Math.max(...forecast.map(d => d.rainPct));
  if (maxRain >= 70) return 'high';
  if (maxRain >= 40) return 'medium';
  return 'low';
}
