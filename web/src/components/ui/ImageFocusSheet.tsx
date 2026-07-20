import { useRef, useState } from 'react';
import { BottomSheet } from './BottomSheet.js';

/**
 * „Ausschnitt anpassen": zeigt das Bild im Zielrahmen (querformatiger Header ODER runder
 * Profilbild-Ausschnitt) und lässt den Fokuspunkt per Ziehen verschieben. Speichert cropX/cropY
 * (0–1, object-position) — dasselbe Fokus-Prinzip wie bei den anderen Bildern auf Geheimtrips.
 */
export function ImageFocusSheet({ src, shape, initX = 0.5, initY = 0.5, busy = false, onSave, onClose }: {
  src: string;
  shape: 'cover' | 'round';
  initX?: number;
  initY?: number;
  busy?: boolean;
  onSave: (cropX: number, cropY: number) => void;
  onClose: () => void;
}) {
  const [cx, setCx] = useState(initX);
  const [cy, setCy] = useState(initY);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const clamp = (n: number) => Math.min(1, Math.max(0, n));

  function onDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx, cy };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current; const r = frameRef.current?.getBoundingClientRect();
    if (!d || !r) return;
    // Bild in Ziehrichtung mitführen → Fokuspunkt gegenläufig verschieben
    setCx(clamp(d.cx - (e.clientX - d.x) / r.width));
    setCy(clamp(d.cy - (e.clientY - d.y) / r.height));
  }
  function onUp() { drag.current = null; }

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
            style={{ objectPosition: `${cx * 100}% ${cy * 100}%` }} />
          {/* dezentes Fadenkreuz zur Orientierung */}
          <div className="absolute inset-0 pointer-events-none ring-1 ring-white/40 rounded-[inherit]" />
        </div>
        <p className="text-xs text-[var(--color-lavender)]">
          <i className="fa-solid fa-arrows-up-down-left-right mr-1.5" />Zum Anpassen verschieben.
        </p>
        <button type="button" onClick={() => onSave(cx, cy)} disabled={busy}
          className="w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50">
          {busy ? 'Speichern…' : 'Übernehmen'}
        </button>
      </div>
    </BottomSheet>
  );
}
