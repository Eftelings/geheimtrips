import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Place, Transport } from '../../types/index.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useRequireAuth } from '../../hooks/useRequireAuth.js';
import { discoverApi } from '../../services/api.js';
import { distanceKm } from '../../services/geoService.js';
import { EFFECTIVE_SPEED_KMH } from '../../utils/geo.js';
import { formatDuration } from '../../services/routeService.js';
import { TagBadge } from './TagBadge.js';
import { PlaceImage } from './PlaceImage.js';

const isVid = (u: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(u);

const TRANSPORT_ICON: Record<Transport, string> = {
  walk: 'fa-person-walking', bike: 'fa-bicycle', transit: 'fa-train-subway', train: 'fa-train', auto: 'fa-car',
};
const fmtKm = (d: number) => d < 1 ? `${Math.round(d * 1000)} m` : `${d < 10 ? d.toFixed(1) : Math.round(d)} km`;

/** Höhe des Bildes, sobald der Artikel darunter offen ist: flacher, aber NICHT schmaler. */
const HERO_H = 'clamp(240px, 44vh, 440px)';

// Sterne wie auf der Ortsseite. Bewusst nachgebaut statt importiert: StarDisplay liegt privat in
// PlaceDetailPage, und ein Import würde deren Bundle in die Karte ziehen (der Lazy-Import wäre hin).
function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5 text-[10px]" style={{ color: '#F99039' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <i key={n} className={n <= Math.floor(rating) ? 'fa-solid fa-star' : n - 0.5 <= rating ? 'fa-solid fa-star-half-stroke' : 'fa-regular fa-star'} />
      ))}
    </span>
  );
}

/**
 * Swipe-Deck fürs Karten-Overlay: Full-Bleed-Bild, Buttons als Layer darüber.
 * Entscheidungen laufen NUR über die Buttons. Wischen l/r = Bilder blättern.
 *  · hoch  → das Bild wird zum Hero und der Artikel klappt DARUNTER auf (gleiche Seite)
 *  · runter→ bewegt das Overlay selbst (`onPullDown`), die Karte bleibt stehen
 * Bekommt einen stabilen Feed (Snapshot) übergeben, damit der Index beim Weglegen nicht springt.
 */
export function SwipeDeck({ places, onCardChange, articleOpen, article, onOpenArticle, onCloseArticle, onPullDown, onPullDownEnd, onBackToList, onOpenReviews, radiusCount, onShowAll, emptyFilters, reachFrom, travelMode }: {
  places: Place[];
  onCardChange?: (p: Place | null) => void;
  /** Artikel unter dem Bild offen (Zustand liegt beim Overlay, das Sheet muss ihn kennen). */
  articleOpen?: boolean;
  article?: ReactNode;
  onOpenArticle?: () => void;
  onCloseArticle?: () => void;
  /** Runterziehen auf dem Bild = das Overlay ziehen: laufender Wert bzw. Loslassen. */
  onPullDown?: (dy: number) => void;
  onPullDownEnd?: (dy: number) => void;
  onBackToList?: () => void;
  /** Sterne am Hero angetippt → Rezensionen im Artikel aufklappen. */
  onOpenReviews?: () => void;
  /** Wie viele Orte liegen im Radius? Leerer Feed trotz Orten = alles schon beantwortet. */
  radiusCount?: number;
  /** „Nochmal zeigen" — entfällt, wenn ohnehin „Alle" eingestellt ist. */
  onShowAll?: () => void;
  /** Standort/Verkehrsmittel/Radius zum direkten Nachjustieren auf der leeren Seite. */
  emptyFilters?: ReactNode;
  /** Startpunkt + Verkehrsmittel der Karte → Entfernung bzw. Fahrzeit am Ort. */
  reachFrom?: { lat: number; lng: number } | null;
  travelMode?: 'radius' | Transport;
}) {
  const { toggleSave, savedIds, swipeNope, swipeSkip, photoLikes, togglePhotoLike, sharePlace } = useAppStore();
  const { gate } = useRequireAuth();
  const [idx, setIdx] = useState(0);
  const [imgIdx, setImgIdx] = useState(0);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  // Karten fliegen IMMER nach links raus, die nächste kommt von rechts rein ('enter').
  const [flyOut, setFlyOut] = useState(false);
  const [enter, setEnter] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef({ x: 0, y: 0 });   // Loslassen darf nicht auf den State warten (sonst verschluckte Wische)
  const pulling = useRef(false);            // Zug gehört dem Overlay (runter) statt der Karte
  const scrollRef = useRef<HTMLDivElement>(null);
  const shownAt = useRef(Date.now());
  const [toast, setToast] = useState<string | null>(null);

  // Neuer Feed (z.B. „Weggewischte zurückholen", oder Orte luden erst nach) → wieder vorne
  // anfangen. Ohne das zeigte der alte Index ins Leere und der Swipe bliebe leer.
  useEffect(() => { setIdx(0); }, [places]);

  const card = places[idx];
  const media = useMemo(() => {
    if (!card) return [] as { url: string; video: boolean }[];
    const urls = [card.hero, ...(((card.gallery as string[]) ?? []))].filter(Boolean);
    return [...new Set(urls)].map(u => ({ url: u, video: isVid(u) }));
  }, [card]);
  const cur = media[imgIdx] ?? media[0];
  useEffect(() => { onCardChange?.(card ?? null); }, [card?.id]); // eslint-disable-line

  // Nur Radius eingestellt → Strecke; Verkehrsmittel gewählt → Fahrzeit damit. Bewusst mit
  // EFFECTIVE_SPEED_KMH gerechnet — genau damit filtert die Karte, sonst widerspricht die
  // Anzeige dem Filter („45 Min erreichbar", aber am Ort stünde 60 Min).
  const travel = useMemo(() => {
    if (!card || !reachFrom || card.lat == null || card.lng == null) return null;
    const km = distanceKm(reachFrom, { lat: card.lat, lng: card.lng });
    if (!travelMode || travelMode === 'radius') return { icon: 'fa-ruler-horizontal', text: fmtKm(km) };
    return { icon: TRANSPORT_ICON[travelMode], text: formatDuration(km / EFFECTIVE_SPEED_KMH[travelMode]) };
  }, [card?.id, card?.lat, card?.lng, reachFrom, travelMode]); // eslint-disable-line

  const showToast = (m: string) => { if (!m) return; setToast(m); setTimeout(() => setToast(null), 1400); };

  const decide = (action: 'nope' | 'skip' | 'save') => {
    if (!card) return;
    if (action === 'nope')      swipeNope(card.id);
    else if (action === 'skip') swipeSkip(card.id);
    else { if (!savedIds.has(card.id)) toggleSave(card.id); discoverApi.swipe(card.id, 'like', Date.now() - shownAt.current).catch(() => {}); }
    setFlyOut(true);
    setTimeout(() => {
      setFlyOut(false); setDrag(null); setImgIdx(0); setIdx(i => i + 1); shownAt.current = Date.now();
      // Die neue Karte sitzt schon dort, wo eben die Vorschau lag — sie darf NICHT von -620
      // zurückfahren. Ein Frame ohne Transform-Transition setzt sie still auf 0; zwei rAF, sonst
      // fasst der Browser das mit dem Wiedereinschalten zu einem Paint zusammen.
      setEnter(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setEnter(false)));
    }, 240);
  };
  const openArticle = () => {
    if (!card || articleOpen) return;
    discoverApi.swipe(card.id, 'click', Date.now() - shownAt.current).catch(() => {});
    onOpenArticle?.();
  };
  // Neuer Ort / Artikel auf: oben beginnen und beim ersten Bild — sonst hängt die Scroll-Position
  // bzw. der Bildindex des vorigen Orts drin (der neue hat den u.U. gar nicht).
  useEffect(() => {
    setImgIdx(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [articleOpen, card?.id]);
  const nextImg = (dir: 1 | -1) => { if (media.length > 1) setImgIdx(i => (i + dir + media.length) % media.length); };
  // Der Server verlangt ein Konto — ohne Gate lief der Like ins Leere (401 wurde verschluckt)
  // und der Zustand hing nur lokal im Deck. Beides liegt jetzt im Store (persistiert + gespiegelt).
  const likePhoto = () => {
    if (!card || !cur) return;
    gate(() => {
      const liked = photoLikes.has(cur.url);
      togglePhotoLike(card.id, cur.url);
      showToast(liked ? '' : 'Schönes Foto! ❤');
    }, 'Melde dich an, um Fotos zu liken.');
  };
  const share = () => {
    if (!card) return;
    const url = `${location.origin}/ort/${card.id}`;
    // Zähler erst hochsetzen, wenn wirklich geteilt wurde — der Teilen-Dialog lässt sich abbrechen.
    if (navigator.share) navigator.share({ title: card.name, text: card.short, url }).then(() => sharePlace(card.id)).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => { showToast('Link kopiert'); sharePlace(card.id); }).catch(() => {});
  };

  function down(e: React.PointerEvent) {
    // Taps auf echte Bedienelemente (Teilen/Herz/Details) sind kein Zieh-Start.
    if ((e.target as HTMLElement).closest('button')) { start.current = null; return; }
    start.current = { x: e.clientX, y: e.clientY };
    dragRef.current = { x: 0, y: 0 };
    pulling.current = false;
    // WICHTIG: auf die Karte fangen (nicht auf e.target) — die hat touchAction:'none'.
    // Sonst reißt der Browser den Zug nach unten als Pull-to-Refresh an sich → pointercancel.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!start.current) return;
    const d = { x: e.clientX - start.current.x, y: e.clientY - start.current.y };
    dragRef.current = d;
    // Runterziehen ohne Artikel gehört dem Overlay: das Sheet folgt dem Finger, die Karte bleibt stehen.
    if (!articleOpen && !pulling.current && d.y > 0 && Math.abs(d.y) > Math.abs(d.x) + 4) pulling.current = true;
    if (pulling.current) onPullDown?.(Math.max(0, d.y));
    setDrag(d);
  }
  function up(e: React.PointerEvent) {
    if (!start.current) return;
    const { x: dx, y: dy } = dragRef.current; start.current = null;
    // Einmal am Sheet, immer am Sheet: sonst bliebe es im Zieh-Zustand hängen.
    if (pulling.current) { pulling.current = false; setDrag(null); onPullDownEnd?.(Math.max(0, dy)); return; }
    const w = e.currentTarget.clientWidth || window.innerWidth;
    const vert = Math.abs(dy) > Math.abs(dx);
    if (vert && dy < -60) openArticle();                                  // hoch = Artikel darunter
    else if (vert && dy > 60 && articleOpen) onCloseArticle?.();          // runter am Hero = Artikel zu
    else if (dx > 50) nextImg(-1);                                        // rechts wischen = vorheriges Bild
    else if (dx < -50) nextImg(1);                                        // links wischen = nächstes Bild
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) nextImg(e.clientX < w / 3 ? -1 : 1);   // Tap links = zurück, sonst weiter
    setDrag(null);
  }
  function cancel() {
    start.current = null; setDrag(null);
    if (pulling.current) { pulling.current = false; onPullDownEnd?.(Math.max(0, dragRef.current.y)); }
  }

  // Griff + „Liste" — auf dem Bild hell, auf hellem Grund dunkel. Muss in BEIDEN Zweigen raus,
  // sonst ist der leere Zustand eine Sackgasse (kein Button, keine Geste, kein Weg zurück).
  const topBar = (onImage: boolean) => (
    <>
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="w-10 h-1.5 rounded-full" style={{ background: onImage ? 'rgba(255,255,255,.6)' : '#d9cfe2' }} />
      </div>
      <button onClick={onBackToList}
        className="absolute right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white"
        style={{ top: 22, background: 'var(--color-amber)', boxShadow: '0 2px 8px rgba(52,37,76,0.35)' }}>
        <i className="fa-solid fa-list" />Liste
      </button>
    </>
  );

  if (!card) {
    // Drei verschiedene Sackgassen, die sich nicht gleich anfühlen dürfen:
    //  · Feed leer, aber Orte im Radius → alles schon beantwortet (der häufigste Fall!)
    //  · Feed leer und nichts im Radius → Filter/Radius zu eng
    //  · Feed hatte Orte, Index durch  → durchgeswipet
    const answered = places.length === 0 && (radiusCount ?? 0) > 0;
    // Keine Karte mehr, sondern eine Seite zum Nachjustieren — also scrollbar. Der obere Teil
    // bleibt aber ziehbar (runter = Overlay klein), nur die Regler darunter sind ausgenommen:
    // dort kämpfte der Zug sonst mit Schieberegler und Scrollen.
    return (
      <div className="h-full relative overflow-y-auto overscroll-contain" style={{ background: 'var(--color-bg)' }}>
        {topBar(false)}
        <div className="min-h-full flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-end gap-2.5 text-center px-6 pt-16 pb-5"
            style={{ touchAction: 'none' }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
            <i className={`fa-solid ${answered ? 'fa-clipboard-check' : 'fa-champagne-glasses'} text-4xl text-[var(--color-amber)]`} />
            <p className="font-display font-bold text-xl text-[var(--color-aubergine)]">
              {answered ? 'Hier kennst du schon alles' : places.length === 0 ? 'Keine Orte im Radius' : 'Alle durchgeswipet!'}
            </p>
            <p className="text-sm text-[var(--color-lavender)] max-w-xs">
              {answered
                ? `Zu ${radiusCount === 1 ? 'dem Ort' : `allen ${radiusCount} Orten`} hier hast du dich schon geäußert. Zeig sie dir nochmal an — oder erweitere die Reichweite.`
                : places.length === 0
                  ? 'Erweitere Radius oder Reisezeit, oder wähle einen anderen Startpunkt.'
                  : 'Zieh das Overlay runter oder tippe auf „Liste".'}
            </p>
            {onShowAll && (
              <button onClick={onShowAll}
                className="mt-1 inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white active:scale-95 transition-transform"
                style={{ background: 'var(--color-amber)' }}>
                <i className="fa-solid fa-rotate-left" />Nochmal zeigen
              </button>
            )}
          </div>
          <div className="px-6 pb-8 flex justify-center">{emptyFilters}</div>
        </div>
      </div>
    );
  }

  // Entschieden wird nur über die Buttons: die Karte fliegt IMMER nach links raus und gibt den
  // nächsten Ort frei, der schon darunter liegt. Nach oben hebt sie an (Artikel-Hinweis); nach
  // unten bewegt sich das OVERLAY, nicht die Karte → hier bewusst kein Schrumpfen/Morph.
  const dx = flyOut ? -620 : 0;
  // Mit offenem Artikel hebt sich der Hero nicht mehr an — dort ist Hochziehen sinnlos (Artikel ist ja da).
  const dragY = drag && !flyOut && !articleOpen ? Math.min(0, drag.y) : 0;
  const rot = dx / 90;
  const detailOp = articleOpen ? 0 : Math.min(1, Math.max(0, -dragY / 70));
  // Höhe fährt immer weich (Bild → Hero); der Transform hängt am Finger und darf dabei NICHT federn.
  // `enter` ist der Frame, in dem die neue Karte still auf 0 gesetzt wird — der muss ohne Transition
  // sein, sonst führe sie von -620 sichtbar zurück.
  const HEIGHT_T = 'height .34s cubic-bezier(.32,.72,0,1)';
  const cardTransition = enter ? HEIGHT_T
    : flyOut ? `${HEIGHT_T}, transform .22s ease-in`
    : drag ? HEIGHT_T
    : `${HEIGHT_T}, transform .28s cubic-bezier(.2,.8,.3,1)`;
  const nextCard = places[idx + 1];   // liegt als Vorschau unter der aktuellen Karte
  const photoLikeCount = card.photoLikes?.[cur?.url ?? ''] ?? 0;
  const tags = (card.tagSlugs?.length ? card.tagSlugs : (card.tagSlug ? [card.tagSlug] : [null])).slice(0, 3);

  // Kein touchAction:'none' auf der Wurzel — touch-action wirkt über die Vorfahren-Kette und würde
  // das Scrollen des Artikels mit abwürgen. Die Sperre sitzt allein auf dem Bild.
  return (
    <div className="h-full relative select-none overflow-hidden" style={{ background: 'var(--color-bg)', overscrollBehavior: 'none' }}>
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-[var(--color-aubergine)] text-white text-xs font-bold px-3.5 py-2 rounded-full shadow-lg pointer-events-none">{toast}</div>
      )}

      {/* Scroll-Ebene: ohne Artikel füllt das Bild das ganze Overlay, mit Artikel wird es zum Hero
          und der Artikel liegt DARUNTER — dieselbe Seite, kein zweites Overlay. */}
      <div ref={scrollRef} className="absolute inset-0" style={{ overflowY: articleOpen ? 'auto' : 'hidden', overscrollBehavior: 'contain', background: articleOpen ? undefined : '#000' }}>

      {/* Der nächste Ort liegt schon bereit — beim Wegfliegen sieht man ihn statt des hellen
          Sheet-Hintergrunds. Steht vor der Karte im DOM, beide positioniert → Karte liegt darüber. */}
      {nextCard && !articleOpen && (
        <div className="absolute inset-0 overflow-hidden bg-black pointer-events-none">
          <PlaceImage src={nextCard.hero ?? ''} category="" alt="" className="w-full h-full object-cover" iconClass="text-6xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25" />
        </div>
      )}

      {/* Das Bild. touchAction:none, sonst fängt iOS Safari die vertikalen Wische selbst ab. */}
      <div className="relative overflow-hidden bg-black cursor-grab active:cursor-grabbing"
        style={{ height: articleOpen ? HERO_H : '100%', transform: `translate(${dx}px, ${dragY}px) rotate(${rot}deg)`, touchAction: 'none', transition: cardTransition }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
        {cur?.video
          ? <video src={cur.url} autoPlay muted loop playsInline className="w-full h-full object-cover pointer-events-none" />
          : <PlaceImage src={cur?.url ?? ''} category="" alt={card.name} className="w-full h-full object-cover pointer-events-none" iconClass="text-6xl" eager />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25 pointer-events-none" />

        {/* Griff + „Liste" liegen IM Bild (nicht im Sheet-Kopf) — sie scrollen mit dem Hero weg,
            statt dauerhaft über dem Artikel zu schweben. Position wie zuvor der Sheet-Kopf. */}
        {topBar(true)}

        {/* Kein Button-Layer fürs Blättern: Tippen/Wischen macht das die Karte selbst (siehe up()).
            Buttons hätten touch-action:auto (nicht vererbt) und würden den Zug nach unten schlucken. */}
        {media.length > 1 && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
            {media.map((_, i) => <span key={i} className="h-1 rounded-full transition-all" style={{ width: i === imgIdx ? 20 : 6, background: i === imgIdx ? 'white' : 'rgba(255,255,255,.5)' }} />)}
          </div>
        )}

        {/* Teilen + Foto-Like, jeweils mit Zähler darunter. Der Like zählt das AKTUELLE Foto
            (das tut der Knopf auch), der Flieger den Ort. Nullen bleiben leer statt „0". */}
        <div className="absolute top-14 right-3.5 flex flex-col gap-2.5 items-center">
          <div className="flex flex-col items-center gap-0.5">
            <button onClick={share} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center active:scale-90" aria-label="Senden"><i className="fa-solid fa-paper-plane text-sm" /></button>
            {!!card.shares && <span className="text-white text-[10px] font-bold" style={{ textShadow: '0 1px 4px rgba(0,0,0,.7)' }}>{card.shares}</span>}
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <button onClick={likePhoto} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center active:scale-90" style={{ color: photoLikes.has(cur?.url ?? '') ? '#ff5a7a' : 'white' }} aria-label="Schönes Foto"><i className={`fa-${photoLikes.has(cur?.url ?? '') ? 'solid' : 'regular'} fa-heart text-sm`} /></button>
            {!!photoLikeCount && <span className="text-white text-[10px] font-bold" style={{ textShadow: '0 1px 4px rgba(0,0,0,.7)' }}>{photoLikeCount}</span>}
          </div>
        </div>

        {/* Hinweis beim Hochziehen (runter bewegt das Overlay — das sieht man ja schon) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-xl border-[3px] font-black text-base pointer-events-none" style={{ opacity: detailOp, borderColor: '#fff', color: '#fff', background: 'rgba(0,0,0,.4)' }}>DETAILS ↑</div>

        {/* Titel-Ebene. Mit Artikel: Beschreibung raus, Sterne rein — der Rest bleibt stehen. */}
        <div className="absolute left-0 right-0 pointer-events-none px-5"
          style={{ bottom: articleOpen ? 14 : 'calc(env(safe-area-inset-bottom) + 118px)', transition: 'bottom .34s cubic-bezier(.32,.72,0,1)' }}>
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {tags.map((s, i) => <TagBadge key={i} slug={s} fallback={i === 0 ? card.categoryLabel : undefined} variant="dark" icon={i === 0} />)}
          </div>
          <h2 className="font-display font-bold text-white text-2xl leading-tight" style={{ textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>{card.name}</h2>
          {!articleOpen && card.short && <p className="text-white/85 text-[13px] mt-1 line-clamp-2 leading-snug">{card.short}</p>}
          {articleOpen ? (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-white/75 text-xs flex items-center gap-1">
                <i className="fa-solid fa-location-dot text-[10px]" />{card.region}
              </span>
              {travel && (
                <span className="text-white/75 text-xs flex items-center gap-1.5">
                  <i className={`fa-solid ${travel.icon} text-[10px]`} style={{ color: 'var(--color-amber)' }} />{travel.text}
                </span>
              )}
              <button onClick={onOpenReviews} className="pointer-events-auto flex items-center gap-1.5 active:opacity-70">
                <Stars rating={card.rating} />
                <span className="text-white/90 text-xs font-semibold">{card.rating}</span>
                <span className="text-white/60 text-[10px] underline underline-offset-2">({card.reviews})</span>
              </button>
            </div>
          ) : (
            <button onClick={openArticle} className="pointer-events-auto mt-2 inline-flex items-center gap-1.5 text-white/90 text-xs font-bold bg-white/15 backdrop-blur rounded-full px-3 py-1.5">
              <i className="fa-solid fa-chevron-up text-[10px]" />Hochziehen für Details
            </button>
          )}
        </div>
      </div>

      {/* Der Artikel — direkt unter dem Bild, im selben Scroll-Container. Keine eigene Seite. */}
      {articleOpen && article}
      </div>

      {/* Entscheidungs-Buttons als Layer über dem Bild (etwas höher), abgerundete Brand-Rechtecke.
          Beim Hochziehen faden sie aus, mit offenem Artikel sind sie weg. */}
      {!articleOpen && (
      <div className="absolute left-0 right-0 z-30 flex items-stretch gap-2 px-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 30px)', opacity: 1 - detailOp, pointerEvents: detailOp > 0.4 ? 'none' : 'auto', transition: drag ? 'none' : 'opacity .2s ease' }}>
        <button onClick={() => decide('nope')} aria-label="Nicht meins"
          className="flex-1 h-12 rounded-2xl bg-white/95 backdrop-blur shadow-lg flex items-center justify-center gap-2 text-[#E5484D] font-bold text-sm active:scale-95 transition-transform">
          <i className="fa-solid fa-xmark text-lg" />Nicht meins
        </button>
        <button onClick={() => decide('save')} aria-label="Merken"
          className="flex-1 h-12 rounded-2xl bg-white/95 backdrop-blur shadow-lg flex items-center justify-center gap-2 font-bold text-sm active:scale-95 transition-transform" style={{ color: 'var(--color-amber)' }}>
          <i className={`fa-${savedIds.has(card.id) ? 'solid' : 'regular'} fa-bookmark text-base`} />Merken
        </button>
        <button onClick={() => decide('skip')} aria-label="Nächstes"
          className="flex-1 h-12 rounded-2xl bg-white/95 backdrop-blur shadow-lg flex items-center justify-center gap-2 font-bold text-sm active:scale-95 transition-transform" style={{ color: 'var(--color-lavender)' }}>
          Nächstes<i className="fa-solid fa-arrow-right text-base" />
        </button>
      </div>
      )}
    </div>
  );
}
