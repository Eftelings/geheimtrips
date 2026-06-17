import { useEffect, useState } from 'react';
import { Marker, Circle, GeoJSON as GeoJsonLayer } from 'react-leaflet';
import L from 'leaflet';
import type { Coords } from '../../services/geoService.js';
import type { Transport } from '../../types/index.js';
import type { IsochroneResponse } from '../../utils/geo.js';
import { EFFECTIVE_SPEED_KMH } from '../../utils/geo.js';

export interface TravelView {
  mode: 'radius' | Transport;
  minutes: number;
  iso: IsochroneResponse | null;
  loading: boolean;
}

const centerIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#8A6FB3;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/**
 * Reichweiten-Ebene für alle Karten: Zentrum-Marker + Isochronen-Polygon
 * bzw. Radius-Kreis. `radiusActive: false` unterdrückt den Kreis im
 * Radius-Modus (Sammlung ohne gewähltes Suchzentrum filtert nicht).
 */
export function ReachLayer({ center, travel, radiusKm, radiusActive = true }: {
  center: Coords | null;
  travel: TravelView;
  radiusKm: number;
  radiusActive?: boolean;
}) {
  if (!center) return null;
  const showCircle = travel.mode === 'radius' ? radiusActive : !travel.iso;
  return (
    <>
      <Marker position={[center.lat, center.lng]} icon={centerIcon} />
      {travel.mode !== 'radius' && travel.iso ? (
        <GeoJsonLayer
          key={`${travel.mode}-${travel.minutes}-${center.lat.toFixed(3)}-${center.lng.toFixed(3)}-${travel.iso.source}`}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={travel.iso.feature as any}
          style={{
            color: '#F99039',
            weight: travel.iso.source === 'stations' ? 1 : 2,
            fillColor: '#F99039',
            fillOpacity: travel.iso.source === 'stations' ? 0.12 : 0.08,
            // nonzero: überlappende Bahnhofs-Kreise füllen sich gleichmäßig
            fillRule: 'nonzero',
            // Näherungen (Kreis / Hochrechnung) gestrichelt kennzeichnen
            dashArray: travel.iso.source === 'approx' || travel.iso.source === 'scaled' ? '6 4' : undefined,
          }}
        />
      ) : showCircle ? (
        <Circle
          center={[center.lat, center.lng]}
          radius={(travel.mode === 'radius'
            ? radiusKm
            : (EFFECTIVE_SPEED_KMH[travel.mode] * travel.minutes) / 60) * 1000}
          pathOptions={{ color: '#F99039', fillColor: '#F99039', fillOpacity: 0.07, weight: 1.5, dashArray: '6 4' }}
        />
      ) : null}
    </>
  );
}

/** Kompass-Overlay über der Karte, erscheint erst wenn das Laden > 1 s dauert */
export function MapComputeOverlay({ loading, transitLike }: { loading: boolean; transitLike: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 1000);
    return () => clearTimeout(t);
  }, [loading]);

  if (!slow || !loading) return null;
  return (
    <div className="absolute inset-0 z-[1002] flex flex-col items-center justify-center gap-3"
      style={{ background: 'rgba(251,249,252,0.78)', backdropFilter: 'blur(5px)' }}>
      <i className="fa-solid fa-compass fa-spin text-4xl text-[var(--color-amber)]" />
      <p className="text-sm font-bold text-[var(--color-aubergine)]">Reichweite wird berechnet…</p>
      <p className="text-xs text-[var(--color-lavender)] text-center px-6">
        {transitLike
          ? 'Fahrpläne werden ausgewertet — bei 6 h dauert das einen Moment'
          : 'Straßennetz wird ausgewertet'}
      </p>
    </div>
  );
}
