import { MOBILITY } from '../../types/index.js';
import type { Transport } from '../../types/index.js';
import type { IsochroneResponse } from '../../utils/geo.js';
import { TRAVEL_MAX_MIN } from '../../utils/geo.js';

/**
 * Reichweiten-Regler: Verkehrsmittel-Auswahl (Radius / Fuß / Rad / ÖPNV / Zug / Auto)
 * + km- bzw. Minuten-Slider + Status-Badge. Geteilt zwischen Startseite
 * (Orte & Trips) und Sammlung.
 */
export function ReachControls({
  travelMode, setTravelMode, travelMinutes, setTravelMinutes,
  radiusKm, setRadiusKm, iso, isoLoading,
  radiusSliderVisible = true, radiusHint,
}: {
  travelMode: 'radius' | Transport;
  setTravelMode: (m: 'radius' | Transport) => void;
  travelMinutes: number;
  setTravelMinutes: React.Dispatch<React.SetStateAction<number>>;
  radiusKm: number;
  setRadiusKm: (km: number) => void;
  iso: IsochroneResponse | null;
  isoLoading: boolean;
  /** Sammlung: km-Slider nur zeigen, wenn ein Suchzentrum gewählt ist */
  radiusSliderVisible?: boolean;
  /** Hinweistext im Radius-Modus, wenn der Slider ausgeblendet ist */
  radiusHint?: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Verkehrsmittel-Auswahl */}
      <div className="flex gap-0.5 p-1 bg-[var(--color-bg-soft)] rounded-2xl">
        <button onClick={() => setTravelMode('radius')} title="Luftlinien-Radius (km)"
          className={`w-8 h-7 rounded-xl text-xs flex items-center justify-center transition-all ${travelMode === 'radius' ? 'bg-[var(--color-aubergine)] text-white shadow-sm' : 'text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]'}`}>
          <i className="fa-solid fa-circle-dot" />
        </button>
        {MOBILITY.map(m => (
          <button key={m.id} onClick={() => setTravelMode(m.id)}
            title={`${m.label}: Was erreiche ich in dieser Zeit?`}
            className={`w-8 h-7 rounded-xl text-xs flex items-center justify-center transition-all ${travelMode === m.id ? 'bg-[var(--color-aubergine)] text-white shadow-sm' : 'text-[var(--color-lavender)] hover:text-[var(--color-aubergine)]'}`}>
            <i className={`fa-solid ${m.icon}`} />
          </button>
        ))}
      </div>

      {/* Slider: km im Radius-Modus, Minuten sonst (Limit je Verkehrsmittel) */}
      {travelMode === 'radius' ? (
        radiusSliderVisible ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-soft)] rounded-2xl">
            <span className="text-[11px] font-semibold text-[var(--color-lavender)] flex-shrink-0">Radius</span>
            <input type="range" min={10} max={400} step={10} value={radiusKm}
              onChange={e => setRadiusKm(Number(e.target.value))} className="map-radius w-28" />
            <span className="text-[11px] font-bold text-[var(--color-aubergine)] flex-shrink-0">{radiusKm} km</span>
          </div>
        ) : radiusHint ? (
          <span className="text-[10px] text-[var(--color-lavender)]">{radiusHint}</span>
        ) : null
      ) : (() => {
        const maxMin = TRAVEL_MAX_MIN[travelMode];
        const step = maxMin >= 360 ? 30 : 15;
        const label = travelMinutes >= 120
          ? (travelMinutes % 60 === 0 ? `${travelMinutes / 60} Std` : `${Math.floor(travelMinutes / 60)}:${String(travelMinutes % 60).padStart(2, '0')} Std`)
          : `${travelMinutes} Min`;
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-soft)] rounded-2xl">
            <span className="text-[11px] font-semibold text-[var(--color-lavender)] flex-shrink-0">Reisezeit</span>
            <input type="range" min={step} max={maxMin} step={step} value={travelMinutes}
              onChange={e => setTravelMinutes(Number(e.target.value))} className="map-radius w-28" />
            <span className="text-[11px] font-bold text-[var(--color-aubergine)] flex-shrink-0">{label}</span>
          </div>
        );
      })()}

      {/* Status: echtes Wegenetz / Fahrplan / Hochrechnung / Näherung */}
      {travelMode !== 'radius' && (
        <span className="text-[10px] text-[var(--color-lavender)] flex items-center gap-1.5">
          {isoLoading
            ? <><i className="fa-solid fa-circle-notch fa-spin" /> Reichweite wird berechnet…</>
            : iso?.source === 'route'
              ? <><i className="fa-solid fa-route" /> echtes Wegenetz (OSM)</>
              : iso?.source === 'stations'
                ? <><i className="fa-solid fa-train" /> Fahrplan-Daten (GTFS)</>
                : iso?.source === 'scaled'
                  ? <><i className="fa-solid fa-up-right-and-down-left-from-center" /> Netz-Hochrechnung</>
                  : <><i className="fa-solid fa-wave-square" /> Näherung über Ø-Tempo</>}
        </span>
      )}
    </div>
  );
}
