import type { Transport } from '../types/index.js';

// ─── Isochronen-Typen (Antwort von GET /api/geo/isochrone) ────────────────────

export interface IsoGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface IsoFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: IsoGeometry;
}

export interface IsochroneResponse {
  mode: string;
  minutes: number;
  // route = echtes Wegenetz (Valhalla) · stations = Fahrplan-basiert (Transitous/GTFS,
  // Chronotrains-Prinzip: Kreise um erreichbare Haltestellen) · scaled = Netz-Kontur
  // radial hochgerechnet (Auto > 150 km Dienst-Limit) · approx = Kreis-Näherung
  source: 'route' | 'stations' | 'scaled' | 'approx';
  feature: IsoFeature;
}

// Effektive Luftlinien-Geschwindigkeiten (km/h) — Fallback-Filter solange
// kein Polygon geladen ist. Muss zu api/src/routes/geo.ts passen.
export const EFFECTIVE_SPEED_KMH: Record<Transport, number> = {
  walk: 4.5, bike: 14, transit: 30, train: 100, auto: 70,
};

// ─── Routen zwischen Trip-Stopps (GET /api/geo/route) ─────────────────────────

export interface RouteLeg {
  seconds: number;
  meters: number;
  coords: [number, number][];  // [lat, lng] — echte Wegeführung
  transit?: string;            // Linien bei ÖPNV/Bahn, z.B. "RE 5 → S 2"
}

export interface RouteResponse {
  mode: string;
  source: 'route' | 'stations' | 'approx';
  legs: RouteLeg[];
  totalSeconds: number;
  totalMeters: number;
}

// Maximale Reisezeit (Minuten) je Verkehrsmittel — muss zu MODE_MAX_MIN im Backend passen
export const TRAVEL_MAX_MIN: Record<Transport, number> = {
  walk: 120, bike: 180, transit: 180, train: 360, auto: 360,
};

/**
 * FitBounds-Eckpunkte für die aktuelle Reichweite: Isochronen-BBox bzw. Kreis-Ecken.
 * `radiusActive: false` (z.B. Sammlung ohne Suchzentrum) liefert keine Kreis-Ecken.
 */
export function reachBBoxPoints(
  center: { lat: number; lng: number },
  travel: { mode: 'radius' | Transport; minutes: number; iso: IsochroneResponse | null },
  radiusKm: number,
  radiusActive = true,
): [number, number][] {
  if (travel.mode !== 'radius' && travel.iso) {
    const bbox = geoJsonBBox(travel.iso.feature.geometry);
    return bbox ? [bbox[0], bbox[1]] : [];
  }
  if (travel.mode === 'radius' && !radiusActive) return [];
  const km = travel.mode === 'radius'
    ? radiusKm
    : (EFFECTIVE_SPEED_KMH[travel.mode] * travel.minutes) / 60;
  const dLat = km / 110.574;
  const dLng = km / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return [
    [center.lat - dLat, center.lng - dLng],
    [center.lat + dLat, center.lng + dLng],
  ];
}

/** Bounding-Box einer Isochronen-Geometrie: [[minLat, minLng], [maxLat, maxLng]] */
export function geoJsonBBox(geom: IsoGeometry): [[number, number], [number, number]] | null {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  const eatRing = (ring: number[][]) => {
    for (const [x, y] of ring) {
      if (y < minLat) minLat = y;
      if (y > maxLat) maxLat = y;
      if (x < minLng) minLng = x;
      if (x > maxLng) maxLng = x;
    }
  };
  if (geom.type === 'Polygon') {
    (geom.coordinates as number[][][]).forEach(eatRing);
  } else {
    (geom.coordinates as number[][][][]).forEach(poly => poly.forEach(eatRing));
  }
  if (minLat > maxLat) return null;
  return [[minLat, minLng], [maxLat, maxLng]];
}

// ─── Punkt-in-Polygon (Ray-Casting, GeoJSON-Ringe sind [lng, lat]) ────────────

function inRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Liegt im äußeren Ring, aber in keinem Loch */
function inPolygon(lng: number, lat: number, rings: number[][][]): boolean {
  if (!rings.length || !inRing(lng, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) {
    if (inRing(lng, lat, rings[k])) return false;
  }
  return true;
}

export function pointInGeoJSON(lat: number, lng: number, geom: IsoGeometry): boolean {
  if (geom.type === 'Polygon') {
    return inPolygon(lng, lat, geom.coordinates as number[][][]);
  }
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][]).some((poly) => inPolygon(lng, lat, poly));
  }
  return false;
}
