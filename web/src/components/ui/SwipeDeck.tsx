import { useMemo, useRef, useState } from 'react';
import type { Place } from '../../types/index.js';
import { useAppStore } from '../../store/useAppStore.js';
import { discoverApi, placesApi } from '../../services/api.js';
import { TagBadge } from './TagBadge.js';
import { PlaceImage } from './PlaceImage.js';

const isVid = (u: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(u);

/**
 * Tinder-Stil Swipe-Deck für das Karten-Overlay: großes Bild, Buttons UNTER dem Bild,
 * Bildergalerie per Tap. Links = nicht merken, rechts = merken, hoch = Details.
 * Bekommt die bereits gefilterten Orte der Karte übergeben (Filter/Funnel wirken also mit).
 */
export function SwipeDeck({ places, onOpenDetail }: { places: Place[]; onOpenDetail: (id: string) => void }) {
  const { toggleSave, savedIds } = useAppStore();
  const [idx, setIdx] = useState(0);
  const [imgIdx, setImgIdx] = useState(0);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flyOut, setFlyOut] = useState<'left' | 'right' | 'up' | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const shownAt = useRef(Date.now());
  const [likedPhotos, setLikedPhotos] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const card = places[idx];
  const media = useMemo(() => {
    if (!card) return [] as { url: string; video: boolean }[];
    const urls = [card.hero, ...(((card.gallery as string[]) ?? []))].filter(Boolean);
    return [...new Set(urls)].map(u => ({ url: u, video: isVid(u) }));
  }, [card]);
  const cur = media[imgIdx] ?? media[0];

  const showToast = (m: string) => { if (!m) return; setToast(m); setTimeout(() => setToast(null), 1400); };
  const advance = (action: 'like' | 'dislike') => {
    if (!card) return;
    discoverApi.swipe(card.id, action, Date.now() - shownAt.current).catch(() => {});
    if (action === 'like' && !savedIds.has(card.id)) toggleSave(card.id);
    setFlyOut(action === 'like' ? 'right' : 'left');
    setTimeout(() => { setFlyOut(null); setDrag(null); setImgIdx(0); setIdx(i => i + 1); shownAt.current = Date.now(); }, 240);
  };
  const openDetail = () => {
    if (!card) return;
    discoverApi.swipe(card.id, 'click', Date.now() - shownAt.current).catch(() => {});
    setFlyOut('up'); setTimeout(() => onOpenDetail(card.id), 180);
  };
  const nextImg = (dir: 1 | -1) => { if (media.length > 1) setImgIdx(i => (i + dir + media.length) % media.length); };
  const likePhoto = () => {
    if (!card || !cur) return;
    const u = cur.url; const was = likedPhotos.has(u);
    setLikedPhotos(s => { const n = new Set(s); if (was) n.delete(u); else n.add(u); return n; });
    showToast(was ? '' : 'Schönes Foto! ❤');
    placesApi.likePhoto(card.id, u).catch(() => {});
  };
  const share = () => {
    if (!card) return;
    const url = `${location.origin}/place/${card.id}`;
    if (navigator.share) navigator.share({ title: card.name, text: card.short, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => showToast('Link kopiert')).catch(() => {});
  };

  function down(e: React.PointerEvent) { start.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }
  function move(e: React.PointerEvent) { if (start.current) setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y }); }
  function up() {
    if (!start.current) return;
    const dx = drag?.x ?? 0, dy = drag?.y ?? 0; start.current = null;
    if (dx > 90) advance('like');
    else if (dx < -90) advance('dislike');
    else if (dy < -90) openDetail();
    else if (Math.abs(dx) < 6 && Math.abs(dy) < 6) nextImg(1); // Tap = nächstes Bild
    else setDrag(null);
  }

  if (!card) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8" style={{ background: 'var(--color-bg)' }}>
        <i className="fa-solid fa-champagne-glasses text-5xl text-[var(--color-amber)]" />
        <p className="font-display font-bold text-xl text-[var(--color-aubergine)]">{places.length === 0 ? 'Keine Orte im Filter' : 'Alle durchgeswipet!'}</p>
        <p className="text-sm text-[var(--color-lavender)] max-w-xs">{places.length === 0 ? 'Passe Radius, Standort oder Filter an — dann tauchen hier Orte zum Swipen auf.' : 'Schließe das Overlay und passe die Filter an für neue Vorschläge.'}</p>
      </div>
    );
  }

  const dx = flyOut === 'right' ? 600 : flyOut === 'left' ? -600 : (drag?.x ?? 0);
  const dy = flyOut === 'up' ? -800 : (drag?.y ?? 0);
  const rot = dx / 22;
  const likeOp = Math.min(1, Math.max(0, dx / 90)), nopeOp = Math.min(1, Math.max(0, -dx / 90));
  const tags = (card.tagSlugs?.length ? card.tagSlugs : (card.tagSlug ? [card.tagSlug] : [null])).slice(0, 3);

  return (
    <div className="h-full flex flex-col select-none" style={{ background: 'var(--color-bg)' }}>
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-[var(--color-aubergine)] text-white text-xs font-bold px-3.5 py-2 rounded-full shadow-lg pointer-events-none">{toast}</div>
      )}

      <div className="flex-1 min-h-0 relative px-3 pt-3" style={{ touchAction: 'pan-y' }}>
        <div className="absolute inset-3 rounded-3xl overflow-hidden shadow-2xl bg-black cursor-grab active:cursor-grabbing"
          style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, transition: flyOut ? 'transform .22s ease-in' : drag ? 'none' : 'transform .28s cubic-bezier(.2,.8,.3,1)' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDrag(null); }}>
          {cur?.video
            ? <video src={cur.url} autoPlay muted loop playsInline className="w-full h-full object-cover pointer-events-none" />
            : <PlaceImage src={cur?.url ?? ''} category="" alt={card.name} className="w-full h-full object-cover pointer-events-none" iconClass="text-6xl" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10 pointer-events-none" />

          {media.length > 1 && (<>
            <button onClick={() => nextImg(-1)} className="absolute left-0 top-12 bottom-24 w-1/3" aria-label="Vorheriges Bild" />
            <button onClick={() => nextImg(1)} className="absolute right-0 top-12 bottom-24 w-1/3" aria-label="Nächstes Bild" />
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
              {media.map((_, i) => <span key={i} className="h-1 rounded-full transition-all" style={{ width: i === imgIdx ? 20 : 6, background: i === imgIdx ? 'white' : 'rgba(255,255,255,.5)' }} />)}
            </div>
          </>)}

          <div className="absolute top-3 right-3 flex flex-col gap-2">
            <button onClick={share} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center active:scale-90" aria-label="Senden"><i className="fa-solid fa-paper-plane text-sm" /></button>
            <button onClick={likePhoto} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center active:scale-90" style={{ color: likedPhotos.has(cur?.url ?? '') ? '#ff5a7a' : 'white' }} aria-label="Schönes Foto"><i className={`fa-${likedPhotos.has(cur?.url ?? '') ? 'solid' : 'regular'} fa-heart text-sm`} /></button>
          </div>

          <div className="absolute top-8 left-6 px-3 py-1 rounded-lg border-[3px] border-white text-white font-black text-lg rotate-[-15deg] pointer-events-none" style={{ opacity: likeOp, background: 'rgba(52,37,76,.5)' }}>MERKEN</div>
          <div className="absolute top-8 right-6 px-3 py-1 rounded-lg border-[3px] border-white text-white font-black text-lg rotate-[15deg] pointer-events-none" style={{ opacity: nopeOp, background: 'rgba(229,72,77,.55)' }}>NÖ</div>

          <div className="absolute bottom-0 left-0 right-0 p-5 pointer-events-none">
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {tags.map((s, i) => <TagBadge key={i} slug={s} fallback={i === 0 ? card.categoryLabel : undefined} variant="dark" icon={i === 0} />)}
            </div>
            <h2 className="font-display font-bold text-white text-2xl leading-tight" style={{ textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>{card.name}</h2>
            {card.short && <p className="text-white/85 text-[13px] mt-1 line-clamp-2 leading-snug">{card.short}</p>}
          </div>
        </div>
      </div>

      {/* Buttons unter dem Bild (Tinder-Stil) */}
      <div className="flex-shrink-0 flex items-center justify-center gap-7 py-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
        <button onClick={() => advance('dislike')} aria-label="Nicht merken"
          className="w-16 h-16 rounded-full bg-white shadow-[0_6px_20px_rgba(229,72,77,0.25)] ring-1 ring-black/5 flex items-center justify-center text-[#E5484D] text-2xl active:scale-90 transition-transform"><i className="fa-solid fa-xmark" /></button>
        <button onClick={openDetail} aria-label="Details"
          className="w-12 h-12 rounded-full bg-white shadow-md ring-1 ring-black/5 flex items-center justify-center text-[var(--color-lavender)] text-lg active:scale-90 transition-transform"><i className="fa-solid fa-arrow-up" /></button>
        <button onClick={() => advance('like')} aria-label="Merken"
          className="w-16 h-16 rounded-full bg-[var(--color-aubergine)] shadow-[0_6px_20px_rgba(52,37,76,0.4)] flex items-center justify-center text-white text-2xl active:scale-90 transition-transform"><i className="fa-solid fa-bookmark" /></button>
      </div>
    </div>
  );
}
