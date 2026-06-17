import { Hono } from 'hono';
import polygonClipping from 'polygon-clipping';

/**
 * Isochronen-API: Liefert ein GeoJSON-Polygon, das angibt, wie weit man
 * vom Startpunkt in X Minuten mit einem Verkehrsmittel kommt.
 *
 * - walk / bike / auto → echtes Straßennetz via FOSSGIS-Valhalla
 *   (https://valhalla1.openstreetmap.de, kostenlos, Fair-Use, kein API-Key).
 *   Limits des Dienstes: Zeit-Konturen max. 100 Min, Distanz-Konturen max. 150 km.
 *   → bis 100 Min: Zeit-Kontur. Darüber: Distanz-Kontur (Netz-Tempo × Zeit).
 *   → übersteigt die Zieldistanz 150 km (Auto > ~2 h): 150-km-Netzkontur radial
 *     hochskaliert (`source: 'scaled'`) — folgt den Korridoren, ehrliche Näherung.
 * - transit / train → Chronotrains-Prinzip via Transitous/MOTIS (GTFS-Fahrplandaten):
 *   one-to-all liefert erreichbare Haltestellen; Fußweg-Kreise um jede, vereinigt
 *   zu zusammenhängenden Flächen (polygon-clipping). Best-Case über mehrere
 *   Abfahrtszeiten, damit Taktlücken (stündliches ICE) nicht verfälschen.
 * - Fallback bei Ausfall der externen Dienste: Kreis-Näherung über Ø-Tempo.
 */

const router = new Hono();

type TravelMode = 'walk' | 'bike' | 'transit' | 'train' | 'auto';

// Muss zu TRAVEL_MAX_MIN in web/src/utils/geo.ts passen
const MODE_MAX_MIN: Record<TravelMode, number> = {
  walk: 120, bike: 180, transit: 180, train: 360, auto: 360,
};

const VALHALLA_COSTING: Partial<Record<TravelMode, string>> = {
  walk: 'pedestrian',
  bike: 'bicycle',
  auto: 'auto',
};

// Limits des FOSSGIS-Valhalla (empirisch: "Exceeded max time: 100" / "max distance: 150")
const VALHALLA_MAX_TIME_MIN = 100;
const VALHALLA_MAX_DIST_KM = 150;

// Effektives Netz-Tempo (km/h) für Distanz-Konturen jenseits des Zeit-Limits
const NETWORK_SPEED_KMH: Partial<Record<TravelMode, number>> = {
  walk: 4.8, bike: 15, auto: 78,
};

// Effektive Luftlinien-Geschwindigkeiten (km/h) für die Kreis-Näherung (Fallback).
const APPROX_SPEED_KMH: Record<TravelMode, number> = {
  walk: 4.5, bike: 14, transit: 30, train: 100, auto: 70,
};

const WALK_KMH = 4.5;          // Fußweg ab Haltestelle (Restzeit)
const MAX_ISLANDS = 800;       // Obergrenze Haltestellen-Kreise (Payload/Render)
const UA = { 'User-Agent': 'geheimtrips-demo' };

// In-Memory-Cache: Isochronen sind quasi statisch → einfache FIFO-Verdrängung
const cache = new Map<string, object>();
const CACHE_MAX = 500;

interface GeoFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

/** Kreis-Ring um (lat, lng) mit Radius km — GeoJSON-Reihenfolge [lng, lat] */
function circleRing(lat: number, lng: number, km: number, points = 64): [number, number][] {
  const pts: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * 2 * Math.PI;
    const dLat = (km / 110.574) * Math.sin(a);
    const dLng = (km / (111.32 * Math.cos(latRad))) * Math.cos(a);
    pts.push([Number((lng + dLng).toFixed(4)), Number((lat + dLat).toFixed(4))]);
  }
  return pts;
}

/** Kreis-Polygon als GeoJSON-Feature (Fallback / Näherung) */
function circleFeature(lat: number, lng: number, km: number): GeoFeature {
  return {
    type: 'Feature',
    properties: { contour: km },
    geometry: { type: 'Polygon', coordinates: [circleRing(lat, lng, km)] },
  };
}

/** Schnelle Distanz in km (äquirektangulare Näherung) */
function fastDistKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const x = (bLng - aLng) * Math.cos(((aLat + bLat) / 2) * Math.PI / 180) * 111.32;
  const y = (bLat - aLat) * 110.574;
  return Math.hypot(x, y);
}

/** Geometrie radial um (lat, lng) skalieren (für Auto-Reichweiten > 150 km Netz-Limit) */
function scaleGeometry(geom: { type: string; coordinates: unknown }, lat: number, lng: number, f: number) {
  const scaleRing = (ring: number[][]) =>
    ring.map(([x, y]) => [
      Number((lng + (x - lng) * f).toFixed(4)),
      Number((lat + (y - lat) * f).toFixed(4)),
    ]);
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: (geom.coordinates as number[][][]).map(scaleRing) };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: (geom.coordinates as number[][][][]).map(poly => poly.map(scaleRing)),
    };
  }
  return geom;
}

/** Valhalla-Isochrone (Zeit- oder Distanz-Kontur) abrufen */
async function valhallaContour(
  lat: number, lng: number, costing: string,
  contour: { time?: number; distance?: number },
): Promise<GeoFeature | null> {
  const q = {
    locations: [{ lat, lon: lng }],
    costing,
    contours: [contour],
    polygons: true,
    denoise: 0.3,
    generalize: 150,
  };
  const res = await fetch(
    `https://valhalla1.openstreetmap.de/isochrone?json=${encodeURIComponent(JSON.stringify(q))}`,
    { signal: AbortSignal.timeout(10_000), headers: UA },
  );
  if (!res.ok) return null;
  const fc = (await res.json()) as { features?: GeoFeature[] };
  return fc.features?.find(
    (f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon',
  ) ?? null;
}

/** Abfahrtszeit: morgen ~09:00 deutscher Zeit (07:00Z) — typischer Reisetag */
function departureBase(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(7, 0, 0, 0);
  return d;
}

interface ReachedStop { lat: number; lng: number; remaining: number; distO: number; hub: boolean }

/**
 * Chronotrains-Isochrone für ÖPNV / Fernverkehr:
 * erreichbare Haltestellen + Fußweg-Restzeit → vereinigte Kreisflächen.
 * Gibt null zurück, wenn Transitous nicht antwortet (→ Kreis-Fallback).
 */
async function stationIsochrone(
  lat: number, lng: number, minutes: number, mode: 'transit' | 'train',
): Promise<{ feature: GeoFeature; stations: number; minutes: number } | null> {
  // Best-Case über mehrere Abfahrten: erwischt stündliche Takte (ICE!).
  // Bei großen Budgets reichen 2 Stichproben (relativer Fehler klein, Datenmenge groß).
  const offsets = minutes <= 120 ? [0, 20, 40] : [0, 30];
  const base = departureBase();

  // Raster fürs Zusammenfassen naher Haltestellen — gröber bei großen Reichweiten
  const nearCell = 0.02;                                                  // ~2,2 km innerhalb 25 km
  const farCell = minutes <= 120 ? 0.003 : minutes <= 240 ? 0.008 : 0.02; // 330 m / 900 m / 2,2 km

  const best = new Map<string, ReachedStop>();
  let anySuccess = false;

  await Promise.all(offsets.map(async (off) => {
    try {
      const params = new URLSearchParams({
        one: `${lat},${lng}`,
        maxTravelTime: String(minutes),
        time: new Date(base.getTime() + off * 60_000).toISOString(),
      });
      // ÖPNV: nur Nahverkehr. Fernverkehr: alles (TRANSIT-Default inkl. ICE/IC).
      if (mode === 'transit') {
        params.set('transitModes', 'TRAM,SUBWAY,FERRY,BUS,REGIONAL_RAIL,SUBURBAN');
      }
      const res = await fetch(`https://api.transitous.org/api/v6/one-to-all?${params}`, {
        headers: UA, signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        all?: { place: { lat: number; lon: number; modes?: string[] }; duration: number }[];
      };
      anySuccess = true;
      for (const s of data.all ?? []) {
        const remaining = minutes - s.duration;
        if (remaining < 4) continue;
        const distO = fastDistKm(lat, lng, s.place.lat, s.place.lon);
        const cell = distO < 25 ? nearCell : farCell;
        // Fernverkehrs-Knoten (ICE/IC/Nachtzug-Halte) bekommen später Vorrang
        const hub = s.place.modes?.some(m =>
          m === 'HIGHSPEED_RAIL' || m === 'LONG_DISTANCE' || m === 'NIGHT_RAIL') ?? false;
        const key = `${Math.round(s.place.lat / cell)},${Math.round(s.place.lon / cell)}`;
        const prev = best.get(key);
        if (!prev || remaining > prev.remaining) {
          best.set(key, { lat: s.place.lat, lng: s.place.lon, remaining, distO, hub: hub || (prev?.hub ?? false) });
        } else if (hub && !prev.hub) {
          prev.hub = true;
        }
      }
    } catch { /* einzelne Abfahrt fehlgeschlagen → andere zählen weiter */ }
  }));

  if (!anySuccess) return null;

  // Startpunkt selbst: Fußweg-Reichweite (gedeckelt — lange Märsche zeigt der Fuß-Modus)
  const kept: (ReachedStop & { rKm: number; ring: number })[] = [
    { lat, lng, remaining: minutes, distO: 0, hub: false, rKm: Math.min((minutes / 60) * WALK_KMH, 3), ring: 0 },
  ];

  // Ausdünnen in zwei Phasen:
  //  1. Fernverkehrs-Knoten (ICE/IC-Halte) ohne Quote — jede per Fernzug erreichbare
  //     Stadt erscheint garantiert (Chronotrains-Prinzip), nur Nähe-Veto gilt.
  //  2. Übrige Haltestellen mit Polar-Zellen-Quoten (10 Ringe × 12 Sektoren), damit
  //     keine Metropole das Budget monopolisiert und kein "Donut-Loch" entsteht.
  const SECTORS = 12;
  const stops = [...best.values()].sort((a, b) => b.remaining - a.remaining);
  const maxDist = Math.max(10, ...stops.map(s => s.distO));
  const ringW = maxDist / 10;
  const cellQuota = (ring: number) =>
    Math.max(2, Math.ceil((MAX_ISLANDS * (10 - ring)) / 55 / SECTORS));
  const cellCount = new Map<number, number>();

  const tryKeep = (s: ReachedStop, useQuota: boolean): void => {
    if (kept.length >= MAX_ISLANDS) return;
    const ring = Math.min(9, Math.floor(s.distO / ringW));
    let cellKey = -1;
    if (useQuota) {
      const sector = Math.floor(((Math.atan2(s.lat - lat, s.lng - lng) + Math.PI) / (2 * Math.PI)) * SECTORS) % SECTORS;
      cellKey = ring * SECTORS + sector;
      if ((cellCount.get(cellKey) ?? 0) >= cellQuota(ring)) return;
    }
    const rKm = Math.max(0.3, Math.min((s.remaining / 60) * WALK_KMH, 2));
    // Zusammenfassen: Veto-Radius wächst mit der Entfernung — ferne Metropolen
    // kollabieren zu wenigen Kreisen, nahe Abdeckung bleibt lückenlos.
    const covered = kept.some(k =>
      Math.abs(k.ring - ring) <= 1 &&
      fastDistKm(k.lat, k.lng, s.lat, s.lng) <= Math.max(k.rKm * 0.8, k.distO / 40));
    if (covered) return;
    kept.push({ ...s, rKm, ring });
    if (cellKey >= 0) cellCount.set(cellKey, (cellCount.get(cellKey) ?? 0) + 1);
  };

  for (const s of stops) { if (s.hub) tryKeep(s, false); }
  for (const s of stops) { if (!s.hub) tryKeep(s, true); }

  // Überlappende Kreise zu zusammenhängenden Flächen vereinigen
  let coordinates: unknown;
  try {
    const circles = kept.map(k => [circleRing(k.lat, k.lng, k.rKm, 16)] as [number, number][][]);
    const [first, ...rest] = circles;
    coordinates = polygonClipping.union(first, ...rest);
  } catch {
    // Robustheits-Fallback: rohe Kreise (Rendering nutzt fillRule nonzero)
    coordinates = kept.map(k => [circleRing(k.lat, k.lng, k.rKm, 16)]);
  }

  const feature: GeoFeature = {
    type: 'Feature',
    properties: { stations: kept.length - 1 },
    geometry: { type: 'MultiPolygon', coordinates },
  };
  return { feature, stations: kept.length - 1, minutes };
}

router.get('/isochrone', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  const mode = (c.req.query('mode') ?? 'auto') as TravelMode;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: 'lat und lng sind erforderlich.' }, 400);
  }
  if (!(mode in APPROX_SPEED_KMH)) {
    return c.json({ error: 'Ungültiger Modus.' }, 400);
  }

  const minutes = Math.min(
    MODE_MAX_MIN[mode],
    Math.max(10, Math.round(Number(c.req.query('minutes') ?? 60))),
  );

  const key = `${mode}|${minutes}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return c.json(hit);

  let payload: object | null = null;

  // Echte Straßennetz-Isochrone für Fuß / Rad / Auto
  const costing = VALHALLA_COSTING[mode];
  if (costing) {
    try {
      if (minutes <= VALHALLA_MAX_TIME_MIN) {
        // Zeit-Kontur: exakt
        const feat = await valhallaContour(lat, lng, costing, { time: minutes });
        if (feat) payload = { mode, minutes, source: 'route', feature: feat };
      } else {
        // Distanz-Kontur: Netz-Tempo × Zeit; jenseits 150 km radial hochskalieren
        const targetKm = (NETWORK_SPEED_KMH[mode] ?? 50) * (minutes / 60);
        const reqKm = Math.min(targetKm, VALHALLA_MAX_DIST_KM);
        const feat = await valhallaContour(lat, lng, costing, { distance: reqKm });
        if (feat) {
          if (targetKm > reqKm + 1) {
            const f = targetKm / reqKm;
            payload = {
              mode, minutes, source: 'scaled',
              feature: { ...feat, geometry: scaleGeometry(feat.geometry, lat, lng, f) },
            };
          } else {
            payload = { mode, minutes, source: 'route', feature: feat };
          }
        }
      }
    } catch {
      /* Netzwerkfehler / Timeout → Kreis-Fallback unten */
    }
  }

  // Fahrplan-basierte Isochrone für ÖPNV / Fernverkehr (Chronotrains-Prinzip)
  if (mode === 'transit' || mode === 'train') {
    try {
      const result = await stationIsochrone(lat, lng, minutes, mode);
      if (result) {
        payload = { mode, minutes: result.minutes, source: 'stations', feature: result.feature };
      }
    } catch {
      /* Transitous nicht erreichbar → Kreis-Fallback unten */
    }
  }

  if (!payload) {
    const km = (APPROX_SPEED_KMH[mode] * minutes) / 60;
    payload = { mode, minutes, source: 'approx', feature: circleFeature(lat, lng, km) };
  }

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, payload);

  return c.json(payload);
});

// ─── Routen zwischen Trip-Stopps (echte Wegeführung) ──────────────────────────

interface RouteLeg {
  seconds: number;
  meters: number;
  coords: [number, number][];  // [lat, lng]
  transit?: string;            // z.B. "RE 5 → S 2" bei ÖPNV/Bahn
}

/** Google-Polyline dekodieren (precision 6 = Valhalla, 7 = MOTIS v1) */
function decodePolyline(str: string, precision: number): [number, number][] {
  const factor = Math.pow(10, precision);
  const coords: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    for (const which of [0, 1] as const) {
      let result = 0, shift = 0, byte = 0x20;
      while (byte >= 0x20) {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      }
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta; else lng += delta;
    }
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

/** Auf max. n Punkte ausdünnen (Payload), Endpunkt bleibt erhalten */
function thinCoords(coords: [number, number][], n = 140): [number, number][] {
  if (coords.length <= n) return coords;
  const step = (coords.length - 1) / (n - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push(coords[Math.round(i * step)]);
  return out.map(([a, b]) => [Number(a.toFixed(5)), Number(b.toFixed(5))]);
}

function approxLeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }, mode: TravelMode): RouteLeg {
  const km = fastDistKm(a.lat, a.lng, b.lat, b.lng);
  return {
    seconds: Math.round((km / APPROX_SPEED_KMH[mode]) * 3600),
    meters: Math.round(km * 1000),
    coords: [[a.lat, a.lng], [b.lat, b.lng]],
  };
}

/** Straßen-Route via Valhalla: eine Anfrage mit allen Stopps → legs je Abschnitt */
async function valhallaRoute(pts: { lat: number; lng: number }[], costing: string): Promise<RouteLeg[] | null> {
  const q = {
    locations: pts.map(p => ({ lat: p.lat, lon: p.lng, type: 'break' })),
    costing,
    units: 'kilometers',
  };
  const res = await fetch(
    `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(q))}`,
    { signal: AbortSignal.timeout(12_000), headers: UA },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    trip?: { legs?: { summary: { time: number; length: number }; shape: string }[] };
  };
  const legs = data.trip?.legs;
  if (!legs || legs.length !== pts.length - 1) return null;
  return legs.map(l => ({
    seconds: Math.round(l.summary.time),
    meters: Math.round(l.summary.length * 1000),
    coords: thinCoords(decodePolyline(l.shape, 6)),
  }));
}

/** ÖPNV/Bahn-Route via Transitous-Plan je Abschnitt */
async function transitLeg(
  a: { lat: number; lng: number }, b: { lat: number; lng: number }, mode: 'transit' | 'train',
): Promise<RouteLeg | null> {
  const params = new URLSearchParams({
    fromPlace: `${a.lat},${a.lng}`,
    toPlace: `${b.lat},${b.lng}`,
    time: departureBase().toISOString(),
    numItineraries: '1',
  });
  if (mode === 'transit') {
    params.set('transitModes', 'TRAM,SUBWAY,FERRY,BUS,REGIONAL_RAIL,SUBURBAN');
  }
  const res = await fetch(`https://api.transitous.org/api/v6/plan?${params}`, {
    headers: UA, signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    itineraries?: {
      duration: number;
      legs: {
        mode: string; duration: number; distance?: number;
        routeShortName?: string;
        from: { lat: number; lon: number };
        legGeometry?: { points: string };
      }[];
    }[];
  };
  const it = data.itineraries?.[0];
  if (!it) return null;

  const coords: [number, number][] = [];
  const lines: string[] = [];
  for (const leg of it.legs) {
    if (leg.routeShortName) lines.push(leg.routeShortName);
    const enc = leg.legGeometry?.points;
    if (!enc) continue;
    // Polyline-Präzision erkennen (MOTIS-Versionen variieren zwischen 6 und 7):
    // dekodierten Startpunkt mit der bekannten Startkoordinate des Legs abgleichen
    let dec = decodePolyline(enc, 7);
    if (dec.length && Math.abs(dec[0][0] - leg.from.lat) > 0.01) {
      dec = decodePolyline(enc, 6);
    }
    coords.push(...dec);
  }
  const meters = it.legs.reduce((s, l) => s + (l.distance ?? 0), 0);
  return {
    seconds: Math.round(it.duration),
    meters: Math.round(meters),
    coords: coords.length >= 2 ? thinCoords(coords) : [[a.lat, a.lng], [b.lat, b.lng]],
    transit: lines.length ? lines.join(' → ') : undefined,
  };
}

const routeCache = new Map<string, object>();

// GET /geo/route?mode=auto&points=lat,lng;lat,lng;…  → Wegeführung + Zeit/Distanz je Abschnitt
router.get('/route', async (c) => {
  const mode = (c.req.query('mode') ?? 'auto') as TravelMode;
  if (!(mode in APPROX_SPEED_KMH)) return c.json({ error: 'Ungültiger Modus.' }, 400);

  const pts = (c.req.query('points') ?? '')
    .split(';')
    .map(s => s.split(',').map(Number))
    .filter(p => p.length === 2 && p.every(Number.isFinite))
    .map(([lat, lng]) => ({ lat, lng }));
  if (pts.length < 2) return c.json({ error: 'Mindestens 2 Punkte erforderlich.' }, 400);
  if (pts.length > 25) return c.json({ error: 'Maximal 25 Punkte.' }, 400);

  const key = `${mode}|${pts.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')}`;
  const hit = routeCache.get(key);
  if (hit) return c.json(hit);

  let legs: RouteLeg[] | null = null;
  let source: 'route' | 'stations' | 'approx' = 'approx';

  try {
    const costing = VALHALLA_COSTING[mode];
    if (costing) {
      // Ein Retry — transiente Valhalla-Timeouts sollen nicht in Luftlinien enden
      legs = await valhallaRoute(pts, costing).catch(() => null)
          ?? await valhallaRoute(pts, costing).catch(() => null);
      if (legs) source = 'route';
    } else {
      // ÖPNV/Bahn: Abschnitte parallel planen; fehlgeschlagene → Luftlinien-Näherung
      const results = await Promise.all(
        pts.slice(0, -1).map((p, i) => transitLeg(p, pts[i + 1], mode as 'transit' | 'train').catch(() => null)),
      );
      legs = results.map((r, i) => r ?? approxLeg(pts[i], pts[i + 1], mode));
      source = results.some(r => r !== null) ? 'stations' : 'approx';
    }
  } catch { /* Fallback unten */ }

  if (!legs) legs = pts.slice(0, -1).map((p, i) => approxLeg(p, pts[i + 1], mode));

  const payload = {
    mode, source, legs,
    totalSeconds: legs.reduce((s, l) => s + l.seconds, 0),
    totalMeters: legs.reduce((s, l) => s + l.meters, 0),
  };

  if (routeCache.size >= 300) {
    const oldest = routeCache.keys().next().value;
    if (oldest !== undefined) routeCache.delete(oldest);
  }
  routeCache.set(key, payload);
  return c.json(payload);
});

export default router;
