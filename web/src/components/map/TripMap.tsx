import { useEffect, useRef } from 'react';
import type { Place } from '../../types/index.js';

interface Props {
  places: Place[];
  showRoute?: boolean;
  numbered?: boolean;
  onMarkerClick?: (placeId: string) => void;
  activeId?: string;
  className?: string;
}

declare global {
  interface Window { L: typeof import('leaflet'); }
}

export function TripMap({ places, showRoute = false, numbered = false, onMarkerClick, activeId, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const markersRef   = useRef<any[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const L = window.L;
    if (!L) return;

    const validPlaces = places.filter(p => p.lat != null && p.lng != null);
    const center: [number, number] = validPlaces.length
      ? [validPlaces[0].lat!, validPlaces[0].lng!]
      : [51.1657, 10.4515]; // Germany center

    const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false });
    mapRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);

    // Add markers
    validPlaces.forEach((p, i) => {
      const color = '#F99039';
      const label = numbered ? `${i + 1}` : '•';
      const html = `<div style="
        width:30px;height:36px;display:flex;align-items:center;justify-content:center;
        background:${activeId === p.id ? '#34254c' : color};
        color:white;font-weight:bold;font-size:${numbered ? '13px' : '20px'};
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
        border:2px solid white;
      "><span style="transform:rotate(45deg);display:block">${label}</span></div>`;
      const icon = L.divIcon({ html, iconSize: [30, 36], iconAnchor: [15, 36], className: '' });
      const marker = L.marker([p.lat!, p.lng!], { icon });
      if (onMarkerClick) marker.on('click', () => onMarkerClick(p.id));
      marker.bindTooltip(p.name, { direction: 'top', offset: [0, -36] });
      marker.addTo(map);
      markersRef.current.push(marker);
    });

    // Route line
    if (showRoute && validPlaces.length > 1) {
      const latlngs = validPlaces.map(p => [p.lat!, p.lng!] as [number, number]);
      L.polyline(latlngs, {
        color: '#F99039', weight: 3, dashArray: '8, 6', opacity: 0.85,
      }).addTo(map);
    }

    // Fit bounds
    if (validPlaces.length === 1) {
      map.setView([validPlaces[0].lat!, validPlaces[0].lng!], 13);
    } else if (validPlaces.length > 1) {
      map.fitBounds(validPlaces.map(p => [p.lat!, p.lng!] as [number, number]), { padding: [40, 40] });
    } else {
      map.setView(center, 6);
    }

    return () => { map.remove(); mapRef.current = null; markersRef.current = []; };
  }, []);

  // Update active marker styles
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;
    const validPlaces = places.filter(p => p.lat != null && p.lng != null);
    markersRef.current.forEach((m, i) => {
      const p = validPlaces[i];
      if (!p) return;
      const color = activeId === p.id ? '#34254c' : '#F99039';
      const label = numbered ? `${i + 1}` : '•';
      const html = `<div style="width:30px;height:36px;display:flex;align-items:center;justify-content:center;background:${color};color:white;font-weight:bold;font-size:${numbered ? '13px' : '20px'};border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid white"><span style="transform:rotate(45deg);display:block">${label}</span></div>`;
      m.setIcon(L.divIcon({ html, iconSize: [30, 36], iconAnchor: [15, 36], className: '' }));
    });
  }, [activeId]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`} style={{ minHeight: 260 }} />
  );
}
