/**
 * Geo-Service: GPS-Koordinaten + Reverse Geocoding via OpenStreetMap Nominatim.
 * Komplett kostenlos, kein API-Key.
 */

export interface Coords {
  lat: number;
  lng: number;
}

export interface GeoLocation {
  coords: Coords;
  displayName: string;    // z.B. "Berlin"
  fullAddress: string;    // z.B. "Berlin, Deutschland"
}

/** Aktuelle GPS-Position des Nutzers abfragen */
export function requestGpsPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS nicht verfügbar in diesem Browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:   reject(new Error('GPS-Zugriff verweigert.')); break;
          case err.POSITION_UNAVAILABLE: reject(new Error('Standort nicht verfügbar.')); break;
          case err.TIMEOUT:             reject(new Error('GPS-Anfrage abgelaufen.')); break;
          default:                      reject(new Error('Unbekannter GPS-Fehler.'));
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}

/** Koordinaten → Ortsname via Nominatim (OpenStreetMap) */
export async function reverseGeocode(coords: Coords): Promise<GeoLocation> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&accept-language=de`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Geheimtrips.de/1.0 (david@lennart-sturz.com)' },
  });
  if (!res.ok) throw new Error('Geocoding fehlgeschlagen.');
  const data = await res.json();
  const addr = data.address ?? {};
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || 'Unbekannter Ort';
  const country = addr.country || 'Deutschland';
  return {
    coords,
    displayName: city,
    fullAddress: `${city}, ${country}`,
  };
}

/** Adresse / Suchbegriff → Koordinaten via Nominatim (1 Treffer) */
export async function geocodeAddress(query: string): Promise<GeoLocation | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=de,at,ch&accept-language=de`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Geheimtrips.de/1.0 (david@lennart-sturz.com)' },
  });
  if (!res.ok) return null;
  const results = await res.json();
  if (!results.length) return null;
  const r = results[0];
  return {
    coords: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
    displayName: r.display_name.split(',')[0],
    fullAddress: r.display_name,
  };
}

/** Adresse / Stadt → bis zu 5 Vorschläge (für Dropdown-Suche) */
export async function geocodeSuggestions(query: string): Promise<GeoLocation[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=de,at,ch&accept-language=de`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Geheimtrips.de/1.0 (david@lennart-sturz.com)' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const results = await res.json();
    return results.map((r: { lat: string; lon: string; display_name: string }) => ({
      coords: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
      displayName: r.display_name.split(',')[0],
      fullAddress: r.display_name.split(',').slice(0, 3).join(', ').trim(),
    }));
  } catch {
    return [];
  }
}

/**
 * Ungefähren Standort via IP-Adresse ermitteln (ip-api.com, kostenlos, kein Key).
 * Genauigkeit: ~Stadt-Level. Funktioniert ohne GPS-Berechtigung.
 */
export async function getLocationByIp(): Promise<(Coords & { city?: string }) | null> {
  try {
    const res = await fetch('https://ip-api.com/json/?fields=status,lat,lon,city', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.status !== 'success') return null;
    return { lat: d.lat, lng: d.lon, city: d.city };
  } catch {
    return null;
  }
}

/** Entfernung zwischen zwei Punkten in km (Haversine) */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}
