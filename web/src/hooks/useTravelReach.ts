import { useEffect, useRef, useState } from 'react';
import { geoApi } from '../services/api.js';
import type { Coords } from '../services/geoService.js';
import type { Transport } from '../types/index.js';
import type { IsochroneResponse } from '../utils/geo.js';
import { TRAVEL_MAX_MIN } from '../utils/geo.js';

export interface TravelReach {
  travelMode: 'radius' | Transport;
  setTravelMode: (m: 'radius' | Transport) => void;
  travelMinutes: number;
  setTravelMinutes: React.Dispatch<React.SetStateAction<number>>;
  iso: IsochroneResponse | null;
  isoLoading: boolean;
}

/**
 * Reichweiten-State + Isochronen-Laden (debounced, gecacht, race-sicher).
 * Wird von Startseite (Orte & Trips) und Sammlung geteilt.
 *
 * Wichtig: Bei jedem Wechsel wird die Request-Sequenz erhöht und das alte
 * Polygon sofort ausgeblendet — sonst überschreibt eine verspätete Antwort
 * des vorherigen Modus die Anzeige des neuen.
 */
export function useTravelReach(center: Coords | null, initial?: { mode?: 'radius' | Transport; minutes?: number }): TravelReach {
  const [travelMode, setTravelModeRaw] = useState<'radius' | Transport>(initial?.mode ?? 'radius');
  const [travelMinutes, setTravelMinutes] = useState(initial?.minutes ?? 45);
  const [iso, setIso] = useState<IsochroneResponse | null>(null);
  const [isoLoading, setIsoLoading] = useState(false);
  const cacheRef = useRef(new Map<string, IsochroneResponse>());
  const seqRef = useRef(0);

  // Beim Moduswechsel die Reisezeit aufs Limit des Verkehrsmittels deckeln
  function setTravelMode(m: 'radius' | Transport) {
    setTravelModeRaw(m);
    if (m !== 'radius') setTravelMinutes(v => Math.min(v, TRAVEL_MAX_MIN[m]));
  }

  useEffect(() => {
    if (travelMode === 'radius') { seqRef.current++; setIso(null); setIsoLoading(false); return; }
    if (!center) return;

    const key = `${travelMode}|${travelMinutes}|${center.lat.toFixed(3)}|${center.lng.toFixed(3)}`;
    const cached = cacheRef.current.get(key);
    if (cached) { seqRef.current++; setIso(cached); setIsoLoading(false); return; }

    const seq = ++seqRef.current;
    setIso(null);  // Stale-Polygon des vorherigen Modus nie anzeigen
    setIsoLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await geoApi.isochrone(center.lat, center.lng, travelMode, travelMinutes);
        cacheRef.current.set(key, res);
        if (seq === seqRef.current) setIso(res);
      } catch {
        if (seq === seqRef.current) setIso(null);
      } finally {
        if (seq === seqRef.current) setIsoLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [travelMode, travelMinutes, center?.lat, center?.lng]); // eslint-disable-line

  return { travelMode, setTravelMode, travelMinutes, setTravelMinutes, iso, isoLoading };
}
