import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AppShell } from '../components/layout/AppShell.js';
import { discoverApi } from '../services/api.js';
import type { DeckPlace } from '../services/api.js';
import { useAppStore } from '../store/useAppStore.js';
import { requestGpsPosition, getLocationByIp } from '../services/geoService.js';
import type { Coords } from '../services/geoService.js';
import { TagBadge } from '../components/ui/TagBadge.js';

const isVideoUrl = (u: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(u);

const pin = L.divIcon({
  html: `<div style="width:30px;height:36px;display:flex;align-items:center;justify-content:center;background:#F99039;color:white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.35)"><i class="fa-solid fa-location-dot" style="transform:rotate(45deg);font-size:13px"></i></div>`,
  className: '', iconSize: [30, 36], iconAnchor: [15, 36],
});
const mePin = L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#3B82F6;border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,0.3)"></div>`,
  className: '', iconSize: [16, 16], iconAnchor: [8, 8],
});

function FlyTo({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (pos) map.flyTo(pos, 9, { duration: 0.6 }); }, [pos?.[0], pos?.[1]]); // eslint-disable-line
  return null;
}

const THRESH = 90; // px bis eine Geste auslöst

export function SwipePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const calibrate = params.get('calibrate') === '1';
  const { toggleSave, savedIds } = useAppStore();

  const [deck, setDeck] = useState<DeckPlace[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flyOut, setFlyOut] = useState<'left' | 'right' | 'up' | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const shownAt = useRef(Date.now());
  const [userPos, setUserPos] = useState<Coords | null>(null);
  const [includeKnown, setIncludeKnown] = useState(false);

  const qLat = params.get('lat'), qLng = params.get('lng');
  const qMode = params.get('mode') ?? undefined;
  const qMin = params.get('minutes') ? Number(params.get('minutes')) : undefined;

  async function loadDeck() {
    setLoading(true);
    try {
      const d = await discoverApi.deck({
        lat: qLat ? Number(qLat) : userPos?.lat,
        lng: qLng ? Number(qLng) : userPos?.lng,
        mode: qMode, minutes: qMin, limit: 12, includeKnown,
      });
      setDeck(d); setIdx(0); shownAt.current = Date.now();
    } finally { setLoading(false); }
  }

  useEffect(() => {
    (async () => {
      if (!qLat) {
        try { setUserPos(await requestGpsPosition()); }
        catch { const ip = await getLocationByIp(); if (ip) setUserPos({ lat: ip.lat, lng: ip.lng }); }
      }
    })();
  }, []); // eslint-disable-line

  useEffect(() => { loadDeck(); }, [includeKnown]); // eslint-disable-line
  useEffect(() => { loadDeck(); }, [userPos?.lat, qLat]); // eslint-disable-line

  const card = deck[idx];
  const next = deck[idx + 1];
  const done = !loading && (idx >= deck.length);
  const cardPos: [number, number] | null = card?.lat != null && card?.lng != null ? [card.lat, card.lng] : null;

  // Medien des Ortes (Titelbild/-video + Galerie) für den Bilder-Karussell
  const media = useMemo(() => {
    if (!card) return [] as { url: string; video: boolean }[];
    const urls = [card.hero, ...((card.gallery as string[]) ?? [])].filter(Boolean);
    return [...new Set(urls)].map(u => ({ url: u, video: isVideoUrl(u) }));
  }, [card]);
  useEffect(() => { setImgIdx(0); }, [idx]);
  const cur = media[imgIdx] ?? media[0];

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1600); };

  function advance(action: 'like' | 'dislike') {
    if (!card) return;
    const dwell = Date.now() - shownAt.current;
    discoverApi.swipe(card.id, action, dwell).catch(() => {});
    if (action === 'like' && !savedIds.has(card.id)) toggleSave(card.id);
    setFlyOut(action === 'like' ? 'right' : 'left');
    setTimeout(() => {
      setFlyOut(null); setDrag(null); setMapOpen(false);
      setIdx(i => i + 1);
      shownAt.current = Date.now();
    }, 240);
  }

  function openDetail() {
    if (!card) return;
    discoverApi.swipe(card.id, 'click', Date.now() - shownAt.current).catch(() => {});
    setFlyOut('up');
    setTimeout(() => navigate(`/place/${card.id}`), 200);
  }

  function share() {
    if (!card) return;
    const url = `${location.origin}/place/${card.id}`;
    if (navigator.share) navigator.share({ title: card.name, text: card.short, url }).catch(() => {});
    else { navigator.clipboard?.writeText(url).then(() => showToast('Link kopiert')).catch(() => {}); }
  }

  function toggleSaveNow() {
    if (!card) return;
    toggleSave(card.id);
    showToast(savedIds.has(card.id) ? 'Entfernt' : 'Gemerkt');
  }

  function nextImage() { if (media.length > 1) setImgIdx(i => (i + 1) % media.length); }

  // ── Drag-Gesten (4 Richtungen) ──────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    if (mapOpen) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    setDrag({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  }
  function onPointerUp() {
    if (!dragStart.current) return;
    const dx = drag?.x ?? 0, dy = drag?.y ?? 0;
    dragStart.current = null;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    if (horizontal && dx > THRESH) advance('like');
    else if (horizontal && dx < -THRESH) advance('dislike');
    else if (!horizontal && dy < -THRESH) openDetail();          // hoch → Detailseite
    else if (!horizontal && dy > THRESH) { setMapOpen(true); setDrag(null); } // runter → Karte
    else if (Math.abs(dx) < 6 && Math.abs(dy) < 6) nextImage();  // Tippen → nächstes Bild
    else setDrag(null);
  }

  const dx = flyOut === 'right' ? 600 : flyOut === 'left' ? -600 : (drag?.x ?? 0);
  const dyRaw = flyOut === 'up' ? -700 : (drag?.y ?? 0);
  // Vertikales Ziehen nur nach oben/als leichter Peek nach unten (Karte kommt separat)
  const dyShown = flyOut === 'up' ? dyRaw : Math.max(-40, Math.min(60, drag?.y ?? 0));
  const rot = (flyOut === 'up' ? 0 : dx) / 26;
  const likeOpacity = Math.min(1, Math.max(0, dx / THRESH));
  const nopeOpacity = Math.min(1, Math.max(0, -dx / THRESH));
  const downHint = Math.min(1, Math.max(0, (drag?.y ?? 0) / THRESH));

  const progress = calibrate && deck.length ? `${Math.min(idx + 1, deck.length)}/${deck.length}` : null;

  // Kurze Tag-Chips: Typ-Tag + max. 2 Merkmale/Vibes
  const extraTags = useMemo(() => {
    if (!card) return [] as string[];
    const a = (card.attributes ?? {}) as { merkmale?: string[]; vibes?: string[] };
    return [...(a.merkmale ?? []), ...(a.vibes ?? []), ...(card.vibe ?? [])].filter(Boolean).slice(0, 2);
  }, [card]);

  const filterChip = qMode && qMin
    ? `${qMode === 'walk' ? '🚶' : qMode === 'bike' ? '🚲' : qMode === 'transit' ? '🚆' : '🚗'} ${qMin} Min`
    : includeKnown ? 'Inkl. bekannter' : 'Nur neue';

  useEffect(() => {
    if (calibrate && done && deck.length > 0) {
      const t = setTimeout(() => navigate('/', { replace: true }), 1800);
      return () => clearTimeout(t);
    }
  }, [calibrate, done]); // eslint-disable-line

  return (
    <AppShell noHeader>
      <div className="h-[calc(100dvh-5rem)] md:h-dvh relative overflow-hidden select-none" style={{ background: '#0d0a14' }}>

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--color-amber)]">
            <i className="fa-solid fa-compass fa-spin text-4xl" />
          </div>
        ) : done ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
            {(() => {
              const emptyReach = !calibrate && deck.length === 0;
              return (<>
                <i className={`fa-solid ${calibrate ? 'fa-circle-check' : emptyReach ? 'fa-location-dot' : 'fa-champagne-glasses'} text-5xl text-[var(--color-amber)]`} />
                <p className="font-display font-bold text-xl text-white">
                  {calibrate ? 'Perfekt — wir kennen dich jetzt!' : emptyReach ? 'Nichts in deiner Reichweite' : 'Alle Karten durch!'}
                </p>
                <p className="text-sm text-white/60 max-w-xs">
                  {calibrate ? 'Deine Vorschläge werden ab jetzt persönlicher…'
                    : emptyReach ? 'In deinem Umkreis gibt es noch keine passenden Geheimtrips. Erhöhe Zeit/Verkehrsmittel — oder schau bald wieder rein.'
                    : 'Lade neue Vorschläge — je mehr du wischst, desto besser werden sie.'}
                </p>
                {!calibrate && (
                  <button onClick={() => emptyReach ? navigate('/finder') : loadDeck()}
                    className="mt-2 bg-[var(--color-amber)] text-white font-bold px-6 py-3 rounded-2xl text-sm shadow-[var(--shadow-amber)] active:scale-95 transition-all">
                    <i className={`fa-solid ${emptyReach ? 'fa-sliders' : 'fa-rotate'} mr-2`} />{emptyReach ? 'Reichweite anpassen' : 'Neue Orte laden'}
                  </button>
                )}
              </>);
            })()}
          </div>
        ) : card ? (
          <>
            {/* nächste Karte (Reels-Vorschau darunter) */}
            {next && (
              <div className="absolute inset-0">
                <img src={next.hero} alt="" className="w-full h-full object-cover opacity-40" />
                <div className="absolute inset-0 bg-black/50" />
              </div>
            )}

            {/* aktuelle Vollbild-Karte */}
            <div
              className="absolute inset-0 touch-none"
              style={{
                transform: `translate(${dx}px, ${dyShown}px) rotate(${rot}deg)`,
                transition: flyOut ? 'transform 0.24s ease-in' : drag ? 'none' : 'transform 0.28s cubic-bezier(0.2,0.8,0.3,1)',
              }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove}
              onPointerUp={onPointerUp} onPointerCancel={() => { dragStart.current = null; setDrag(null); }}
            >
              {cur?.video
                ? <video src={cur.url} autoPlay muted loop playsInline className="w-full h-full object-cover pointer-events-none" />
                : <img src={cur?.url} alt={card.name} className="w-full h-full object-cover pointer-events-none" />}
              {/* Lesbarkeits-Verläufe oben & unten */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/45 via-transparent to-black/80" />

              {/* Wisch-Feedback */}
              <div className="absolute top-24 left-6 px-3.5 py-1.5 rounded-xl border-[3px] border-white text-white font-black text-xl rotate-[-15deg] pointer-events-none"
                style={{ opacity: likeOpacity, background: 'rgba(52,37,76,0.55)', backdropFilter: 'blur(2px)' }}>MERKEN</div>
              <div className="absolute top-24 right-6 px-3.5 py-1.5 rounded-xl border-[3px] border-white text-white font-black text-xl rotate-[15deg] pointer-events-none"
                style={{ opacity: nopeOpacity, background: 'rgba(229,72,77,0.6)', backdropFilter: 'blur(2px)' }}>NICHT MEINS</div>

              {/* Karten-Hinweis beim Runterziehen */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center text-white pointer-events-none" style={{ opacity: downHint }}>
                <i className="fa-solid fa-chevron-down text-lg" />
                <span className="text-[11px] font-semibold">Karte ansehen</span>
              </div>

              {/* Bild-Punkte (Galerie) */}
              {media.length > 1 && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none" style={{ opacity: 1 - downHint }}>
                  {media.map((_, i) => (
                    <span key={i} className="h-1 rounded-full transition-all" style={{ width: i === imgIdx ? 18 : 6, background: i === imgIdx ? 'white' : 'rgba(255,255,255,0.5)' }} />
                  ))}
                </div>
              )}

              {/* Untere Infos: Tags · Name · Kurzbeschreibung */}
              <div className="absolute bottom-0 left-0 right-0 p-5 pr-20 pointer-events-none">
                <div className="flex gap-1.5 mb-2 flex-wrap items-center">
                  <TagBadge slug={card.tagSlug} fallback={card.categoryLabel} icon variant="dark" />
                  {extraTags.map(t => (
                    <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white/90"
                      style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}>{t}</span>
                  ))}
                </div>
                <h2 className="font-display font-bold text-white text-2xl leading-tight" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>{card.name}</h2>
                {card.short && <p className="text-white/85 text-[13px] mt-1.5 line-clamp-2 leading-snug">{card.short}</p>}
              </div>
            </div>

            {/* ── Kopfzeile: zurück + „Nur neue" (weiß, Reels-Stil) ── */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3 z-20 pointer-events-none">
              <button onClick={() => navigate(calibrate ? '/' : -1 as never)}
                className="w-10 h-10 rounded-full bg-black/35 backdrop-blur flex items-center justify-center text-white active:scale-95 transition-transform pointer-events-auto">
                <i className="fa-solid fa-arrow-left" />
              </button>
              {calibrate ? (
                progress && <span className="text-white/90 text-xs font-semibold bg-black/35 backdrop-blur px-3 py-1.5 rounded-full pointer-events-none">Karte {progress}</span>
              ) : (
                <button onClick={() => setIncludeKnown(v => !v)}
                  className="text-xs font-bold px-3.5 py-1.5 rounded-full transition-colors pointer-events-auto"
                  style={includeKnown
                    ? { background: 'rgba(0,0,0,0.35)', color: 'white', backdropFilter: 'blur(6px)' }
                    : { background: 'white', color: '#34254C' }}>
                  {includeKnown ? 'Inkl. bekannter' : 'Nur neue'}
                </button>
              )}
            </div>

            {/* ── Rechte Aktionsleiste (TikTok-Stil) ── */}
            <div className="absolute right-3 bottom-6 flex flex-col items-center gap-5 z-20">
              <ActionBtn icon={savedIds.has(card.id) ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}
                label="Merken" active={savedIds.has(card.id)} onClick={toggleSaveNow} />
              <ActionBtn icon="fa-solid fa-paper-plane" label="Senden" onClick={share} />
              {media.length > 1 && (
                <button onClick={nextImage} aria-label="Weitere Bilder"
                  className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
                  <span className="w-12 h-12 rounded-xl overflow-hidden ring-2 ring-white/80 shadow-lg relative">
                    <img src={media[(imgIdx + 1) % media.length].url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-[10px] font-bold">+{media.length - 1}</span>
                  </span>
                  <span className="text-white text-[10px] font-semibold drop-shadow">Bilder</span>
                </button>
              )}
              <ActionBtn icon="fa-solid fa-arrow-up" label="Öffnen" onClick={openDetail} />
            </div>

          </>
        ) : null}

        {/* ── Karten-Overlay (runterziehen) ── */}
        {mapOpen && card && (
          <div className="absolute inset-0 z-40 flex flex-col" style={{ background: '#0d0a14', animation: 'gtSlideDown 0.25s ease' }}>
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
              <span className="text-white font-display font-bold text-lg">{card.name}</span>
              <button onClick={() => setMapOpen(false)}
                className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white active:scale-95 transition-transform">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <MapContainer center={cardPos ?? [51.16, 10.45]} zoom={cardPos ? 9 : 5}
                style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO' />
                <FlyTo pos={cardPos} />
                {cardPos && <Marker position={cardPos} icon={pin} />}
                {userPos && <Marker position={[userPos.lat, userPos.lng]} icon={mePin} />}
              </MapContainer>
              <div className="absolute top-3 left-3 z-[500] flex gap-2 pointer-events-none">
                <span className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--color-aubergine)] shadow-sm">
                  <i className="fa-solid fa-location-dot text-[var(--color-amber)] mr-1.5" />{card.region}
                </span>
                <span className="bg-[var(--color-aubergine)]/90 backdrop-blur px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-sm">
                  <i className="fa-solid fa-sliders mr-1.5" />{filterChip}
                </span>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-black/75 text-white text-sm font-semibold px-4 py-2 rounded-full pointer-events-none">
            {toast}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ActionBtn({ icon, label, onClick, active }: { icon: string; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
      <span className="w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg"
        style={active ? { background: '#F99039', color: 'white' } : { background: 'rgba(0,0,0,0.35)', color: 'white', backdropFilter: 'blur(6px)' }}>
        <i className={icon} />
      </span>
      <span className="text-white text-[10px] font-semibold drop-shadow">{label}</span>
    </button>
  );
}
