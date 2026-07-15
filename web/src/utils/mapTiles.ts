// Karten-Ebenen (Standard / Satellit / Hybrid) — geteilt von Entdecken-Karte und Geheimquiz.
export type MapLayer = 'standard' | 'satellite' | 'hybrid';

export const MAP_LAYERS: { id: MapLayer; label: string; icon: string }[] = [
  { id: 'standard',  label: 'Karte',    icon: 'fa-map' },
  { id: 'satellite', label: 'Satellit', icon: 'fa-satellite' },
  { id: 'hybrid',    label: 'Hybrid',   icon: 'fa-layer-group' },
];

// Voyager (Carto) für Standard; Esri World Imagery für Luftbild (ohne API-Key nutzbar).
export const TILE_URL: Record<MapLayer, string> = {
  standard:  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  hybrid:    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

// Overlays für „Hybrid": Straßen/Verkehr + Orts-/Grenz-Beschriftung über dem Luftbild.
export const HYBRID_ROADS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
export const HYBRID_LABELS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

// Tile-Performance: gerenderte Kacheln länger halten, erst bei Ruhe nachladen (weniger Ruckeln).
export const TILE_PERF = { updateWhenIdle: true, keepBuffer: 4 } as const;
