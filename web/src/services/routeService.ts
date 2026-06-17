import type { Place, Transport } from '../types/index.js';
import { MOBILITY } from '../types/index.js';

/** Haversine distance in km between two lat/lng points */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/** Travel time in hours for a given distance and transport mode (with 1.3× detour factor) */
export function travelHours(km: number, transport: Transport): number {
  const mode = MOBILITY.find(m => m.id === transport) ?? MOBILITY[4];
  return (km * 1.3) / mode.speedKmh;
}

export interface DayGroup {
  dayIndex: number;
  places: Place[];
  travelHoursTotal: number;
  needsOvernight: boolean;
}

/**
 * Groups an ordered list of places into day segments.
 * A new overnight is inserted whenever a leg between consecutive stops > 2 hours.
 */
export function groupRouteIntoDays(places: Place[], transport: Transport): DayGroup[] {
  if (!places.length) return [];

  const groups: DayGroup[] = [{ dayIndex: 0, places: [], travelHoursTotal: 0, needsOvernight: false }];
  let current = groups[0];

  for (let i = 0; i < places.length; i++) {
    current.places.push(places[i]);
    if (i < places.length - 1) {
      const a = places[i];
      const b = places[i + 1];
      if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
        const leg = travelHours(kmBetween({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }), transport);
        current.travelHoursTotal += leg;
        if (leg > 2) {
          current.needsOvernight = true;
          const next: DayGroup = { dayIndex: current.dayIndex + 1, places: [], travelHoursTotal: 0, needsOvernight: false };
          groups.push(next);
          current = next;
        }
      }
    }
  }

  return groups;
}

/** Total trip duration in hours across all legs */
export function totalTravelHours(places: Place[], transport: Transport): number {
  let total = 0;
  for (let i = 0; i < places.length - 1; i++) {
    const a = places[i];
    const b = places[i + 1];
    if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
      total += travelHours(kmBetween({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }), transport);
    }
  }
  return total;
}

/** Format hours → "2 Std 30 Min" or "45 Min" */
export function formatDuration(hours: number): string {
  const totalMin = Math.round(hours * 60);
  if (totalMin < 60) return `${totalMin} Min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} Std ${m} Min` : `${h} Std`;
}

/** Cost estimates (all clearly labeled as estimates) */
export function estimateTripCost(
  places: Place[],
  transport: Transport,
  nights: number,
  persons: number,
  hotelPricePerNight = 90,
): { transport: number; eintritte: number; hotel: number; verpflegung: number; gesamt: number } {
  const totalKm = places.reduce((sum, p, i) => {
    if (i === 0 || !p.lat || !places[i - 1].lat) return sum;
    return sum + kmBetween(
      { lat: places[i - 1].lat!, lng: places[i - 1].lng! },
      { lat: p.lat, lng: p.lng! }
    );
  }, 0);

  const transportCost = (() => {
    if (transport === 'walk' || transport === 'bike') return 0;
    if (transport === 'transit') return persons * 49; // Deutschlandticket Monat
    if (transport === 'train')   return persons * Math.round(totalKm * 0.18);
    return Math.round(totalKm * 0.08 * 1.3 + 5 * Math.ceil(totalKm / 50)); // fuel + parking
  })();

  const eintritte = places.reduce((s, p) => s + (p.cost === 2 ? 8 : p.cost === 3 ? 18 : 0), 0) * persons;
  const hotel     = nights * hotelPricePerNight * Math.ceil(persons / 2);
  const days      = nights + 1;
  const verpflegung = days * persons * 35;

  return {
    transport: transportCost,
    eintritte,
    hotel,
    verpflegung,
    gesamt: transportCost + eintritte + hotel + verpflegung,
  };
}
