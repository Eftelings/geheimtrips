import { useEffect, useMemo, useRef, useState } from 'react';
import type { Place } from '../../types/index.js';
import { useAppStore } from '../../store/useAppStore.js';
import { discoverApi, placesApi } from '../../services/api.js';
import { TagBadge } from './TagBadge.js';
import { PlaceImage } from './PlaceImage.js';

const isVid = (u: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(u);

/**
 * Swipe-Deck fürs Karten-Overlay: Full-Bleed-Bild, Buttons als Layer darüber.
 * Drei Entscheidungen — links „Nein", rechts „Will ich hin", hoch = Details.
 * Bekommt einen stabilen Feed (Snapshot) übergeben, damit der Index beim Weglegen nicht springt.
 */
export function SwipeDeck({ places, onOpenDetail, onCardChange }: {
  places: Place[];
  onOpenDetail: (id: string) => void;
  onCardChange?: (p: Place | null) => void;
}) {
  const { toggleSave, savedIds, swipeNope, swipeMaybe } = useAppStore();
  const [idx, setIdx] = useState(0);
  const [imgIdx, setImgIdx] = useState(0);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flyOut, setFlyOut] = useState<'left' | 'right' | 'up' | 'maybe' | null>(null);
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
  useEffect(() => { onCardChange?.(card ?? null); }, [card?.id]); // eslint-disable-line

  const showToast = (m: string) => { if (!m) return; setToast(m); setTimeout(() => setToast(null), 1400); };

  const decide = (action: 'nope' | 'maybe' | 'want') => {
    if (!card) return;
    if (action === 'nope')  swipeNope(card.id);
    else if (action === 'maybe') swipeMaybe(card.id);
    else { if (!savedIds.has(card.id)) toggleSave(card.id); discoverApi.swipe(card.id, 'like', Date.now() - shownAt.current).catch(() => {}); }
    setFlyOut(action === 'nope' ? 'left' : action === 'want' ? 'right' : 'maybe');
    setTimeout(() => { setFlyOut(null); setDrag(null); setImgIdx(0); setIdx(i => i + 1); shownAt.current = Date.now(); }, 240);
  };
  const openDetail = () => {
    if (!card) return;
    discoverApi.swipe(card.id, 'click', Date.now() - shownAt.current).catch(() => {});
    onOpenDetail(card.id);
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
    const url = `${location.origin}/ort/${card.id}`;
    if (navigator.share) navigator.share({ title: card.name, text: card.short, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => showToast('Link kopiert')).catch(() => {});
  };

  function down(e: React.PointerEvent) { start.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }
  function move(e: React.PointerEvent) { if (start.current) setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y }); }
  function up() {
    if (!start.current) return;
    const dx = drag?.x ?? 0, dy = drag?.y ?? 0; start.current = null;
    if (dx > 90) decide('want');
    else if (dx < -90) decide('nope');
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
  const wantOp = Math.min(1, Math.max(0, dx / 90)), nopeOp = Math.min(1, Math.max(0, -dx / 90));
  const detailOp = Math.min(1, Math.max(0, -dy / 90));
  const tags = (card.tagSlugs?.length ? card.tagSlugs : (card.tagSlug ? [card.tagSlug] : [null])).slice(0, 3);

  return (
    <div className="h-full relative select-none overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-[var(--color-aubergine)] text-white text-xs font-bold px-3.5 py-2 rounded-full shadow-lg pointer-events-none">{toast}</div>
      )}

      {/* Full-Bleed-Karte */}
      <div className="absolute inset-0 overflow-hidden bg-black cursor-grab active:cursor-grabbing"
        style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: flyOut === 'maybe' ? 0 : 1, transition: flyOut ? 'transform .22s ease-in, opacity .22s ease-in' : drag ? 'none' : 'transform .28s cubic-bezier(.2,.8,.3,1)' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDrag(null); }}>
        {cur?.video
          ? <video src={cur.url} autoPlay muted loop playsInline className="w-full h-full object-cover pointer-events-none" />
          : <PlaceImage src={cur?.url ?? ''} category="" alt={card.name} className="w-full h-full object-cover pointer-events-none" iconClass="text-6xl" eager />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25 pointer-events-none" />

        {media.length > 1 && (<>
          <button onClick={() => nextImg(-1)} className="absolute left-0 top-16 bottom-40 w-1/3" aria-label="Vorheriges Bild" />
          <button onClick={() => nextImg(1)} className="absolute right-0 top-16 bottom-40 w-1/3" aria-label="Nächstes Bild" />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
            {media.map((_, i) => <span key={i} className="h-1 rounded-full transition-all" style={{ width: i === imgIdx ? 20 : 6, background: i === imgIdx ? 'white' : 'rgba(255,255,255,.5)' }} />)}
          </div>
        </>)}

        <div className="absolute top-3.5 right-3.5 flex flex-col gap-2">
          <button onClick={share} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center active:scale-90" aria-label="Senden"><i className="fa-solid fa-paper-plane text-sm" /></button>
          <button onClick={likePhoto} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center active:scale-90" style={{ color: likedPhotos.has(cur?.url ?? '') ? '#ff5a7a' : 'white' }} aria-label="Schönes Foto"><i className={`fa-${likedPhotos.has(cur?.url ?? '') ? 'solid' : 'regular'} fa-heart text-sm`} /></button>
        </div>

        {/* Swipe-Stempel */}
        <div className="absolute top-8 left-6 px-3 py-1 rounded-xl border-[3px] font-black text-lg rotate-[-15deg] pointer-events-none" style={{ opacity: wantOp, borderColor: '#fff', color: '#fff', background: 'rgba(52,37,76,.55)' }}>WILL ICH HIN</div>
        <div className="absolute top-8 right-6 px-3 py-1 rounded-xl border-[3px] font-black text-lg rotate-[15deg] pointer-events-none" style={{ opacity: nopeOp, borderColor: '#fff', color: '#fff', background: 'rgba(229,72,77,.6)' }}>NEIN</div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-xl border-[3px] font-black text-base pointer-events-none" style={{ opacity: detailOp, borderColor: '#fff', color: '#fff', background: 'rgba(0,0,0,.4)' }}>DETAILS ↑</div>

        {/* Text + Hinweis „hochziehen für Details" */}
        <div className="absolute left-0 right-0 pointer-events-none px-5" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}>
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {tags.map((s, i) => <TagBadge key={i} slug={s} fallback={i === 0 ? card.categoryLabel : undefined} variant="dark" icon={i === 0} />)}
          </div>
          <h2 className="font-display font-bold text-white text-2xl leading-tight" style={{ textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>{card.name}</h2>
          {card.short && <p className="text-white/85 text-[13px] mt-1 line-clamp-2 leading-snug">{card.short}</p>}
          <button onClick={openDetail} className="pointer-events-auto mt-2 inline-flex items-center gap-1.5 text-white/90 text-xs font-bold bg-white/15 backdrop-blur rounded-full px-3 py-1.5">
            <i className="fa-solid fa-chevron-up text-[10px]" />Hochziehen für Details
          </button>
        </div>
      </div>

      {/* Buttons als Layer über dem Bild: abgerundete Rechtecke im Brand-Stil */}
      <div className="absolute left-0 right-0 z-30 flex items-stretch gap-2 px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}>
        <button onClick={() => decide('nope')} aria-label="Nein"
          className="flex-1 h-12 rounded-2xl bg-white/95 backdrop-blur shadow-lg flex items-center justify-center gap-2 text-[#E5484D] font-bold text-sm active:scale-95 transition-transform">
          <i className="fa-solid fa-xmark text-lg" />Nein
        </button>
        <button onClick={() => decide('maybe')} aria-label="Vielleicht"
          className="flex-1 h-12 rounded-2xl bg-white/95 backdrop-blur shadow-lg flex items-center justify-center gap-2 font-bold text-sm active:scale-95 transition-transform" style={{ color: 'var(--color-amber)' }}>
          <i className="fa-solid fa-clock-rotate-left text-base" />Vielleicht
        </button>
        <button onClick={() => decide('want')} aria-label="Will ich hin"
          className="flex-[1.3] h-12 rounded-2xl shadow-lg flex items-center justify-center gap-2 text-white font-bold text-sm active:scale-95 transition-transform" style={{ background: 'var(--color-aubergine)' }}>
          <i className="fa-solid fa-heart text-base" />Will ich hin
        </button>
      </div>
    </div>
  );
}
