import { useRef, useState } from 'react';
import { BottomSheet } from './BottomSheet.js';

const MIN_ZOOM = 1, MAX_ZOOM = 4;

/**
 * „Ausschnitt anpassen": zeigt das Bild im Zielrahmen (querformatiger Header ODER runder
 * Profilbild-Ausschnitt). Ziehen verschiebt den Fokuspunkt, Zwei-Finger-Geste oder der Regler
 * zoomt hinein. Gespeichert werden cropX/cropY (0–1, object-position) und die Zoomstufe —
 * dieselben Werte nutzt die Anzeige überall sonst.
 */
export function ImageFocusSheet({ src, shape, initX = 0.5, initY = 0.5, initZoom = 1, busy = false, onSave, onClose }: {
  src: string;
  shape: 'cover' | 'round';
  initX?: number;
  initY?: number;
  initZoom?: number;
  busy?: boolean;
  onSave: (cropX: number, cropY: number, zoom: number) => void;
  onClose: () => void;
}) {
  const [cx, setCx] = useState(initX);
  const [cy, setCy] = useState(initY);
  const [zoom, setZoom] = useState(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, initZoom)));
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  // Zwei-Finger-Zoom: aktive Zeiger + Startabstand/-zoom
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const clampZoom = (n: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n));
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function onDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) { pinch.current = { dist: spread(), zoom }; drag.current = null; }
    else drag.current = { x: e.clientX, y: e.clientY, cx, cy };
  }
  function onMove(e: React.PointerEvent) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    if (pinch.current && pointers.current.size === 2) {
      const d = spread();
      if (pinch.current.dist > 0) setZoom(clampZoom(pinch.current.zoom * (d / pinch.current.dist)));
      return;
    }
    const d = drag.current;
    if (!d) return;
    // Bild in Ziehrichtung mitführen → Fokuspunkt gegenläufig verschieben. Je stärker gezoomt,
    // desto feiner die Bewegung, sonst schießt der Ausschnitt bei jedem Wisch ans Ende.
    setCx(clamp(d.cx - (e.clientX - d.x) / r.width / zoom));
    setCy(clamp(d.cy - (e.clientY - d.y) / r.height / zoom));
  }
  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  return (
    <BottomSheet open onClose={onClose} title="Ausschnitt anpassen">
      <div className="flex flex-col items-center gap-3">
        <div
          ref={frameRef}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          className={`relative overflow-hidden bg-[var(--color-bg-soft)] select-none ${
            shape === 'round' ? 'w-56 aspect-square rounded-full' : 'w-full aspect-[16/6] rounded-2xl'
          }`}
          style={{ touchAction: 'none', cursor: 'grab' }}
        >
          <img src={src} alt="" draggable={false}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{
              objectPosition: `${cx * 100}% ${cy * 100}%`,
              transform: `scale(${zoom})`, transformOrigin: `${cx * 100}% ${cy * 100}%`,
            }} />
          {/* dezentes Fadenkreuz zur Orientierung */}
          <div className="absolute inset-0 pointer-events-none ring-1 ring-white/40 rounded-[inherit]" />
        </div>

        {/* Zoom-Regler — die Zwei-Finger-Geste macht dasselbe */}
        <div className="w-full flex items-center gap-3 px-1">
          <button type="button" onClick={() => setZoom(z => clampZoom(z - 0.25))} aria-label="Herauszoomen"
            className="w-8 h-8 rounded-full bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-magnifying-glass-minus text-xs" />
          </button>
          <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={zoom}
            onChange={e => setZoom(clampZoom(Number(e.target.value)))}
            className="flex-1 accent-[var(--color-amber)]" aria-label="Zoom" />
          <button type="button" onClick={() => setZoom(z => clampZoom(z + 0.25))} aria-label="Hineinzoomen"
            className="w-8 h-8 rounded-full bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-magnifying-glass-plus text-xs" />
          </button>
        </div>

        <p className="text-xs text-[var(--color-lavender)] text-center">
          <i className="fa-solid fa-arrows-up-down-left-right mr-1.5" />Verschieben zum Anpassen — mit zwei Fingern zoomen.
        </p>
        <button type="button" onClick={() => onSave(cx, cy, zoom)} disabled={busy}
          className="w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50">
          {busy ? 'Speichern…' : 'Übernehmen'}
        </button>
      </div>
    </BottomSheet>
  );
}
