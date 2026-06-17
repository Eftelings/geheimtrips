import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AppShell } from '../components/layout/AppShell.js';
import { PlaceImage } from '../components/ui/PlaceImage.js';
import { discoverApi } from '../services/api.js';
import type { DeckPlace } from '../services/api.js';
import { requestGpsPosition, getLocationByIp } from '../services/geoService.js';
import type { Coords } from '../services/geoService.js';

const pin = L.divIcon({
  html: `<div style="width:30px;height:36px;display:flex;align-items:center;justify-content:center;background:#F99039;color:white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.35)"><i class="fa-solid fa-location-dot" style="transform:rotate(45deg);font-size:13px"></i></div>`,
  className: '', iconSize: [30, 36], iconAnchor: [15, 36],
});

function FlyTo({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (pos) map.flyTo(pos, 9, { duration: 0.8 }); }, [pos?.[0], pos?.[1]]); // eslint-disable-line
  return null;
}

export function SwipePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const calibrate = params.get('calibrate') === '1';

  const [deck, setDeck] = useState<DeckPlace[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flyOut, setFlyOut] = useState<'left' | 'right' | null>(null);
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

  function advance(action: 'like' | 'dislike') {
    if (!card) return;
    const dwell = Date.now() - shownAt.current;
    discoverApi.swipe(card.id, action, dwell).catch(() => {});
    setFlyOut(action === 'like' ? 'right' : 'left');
    setTimeout(() => {
      setFlyOut(null); setDrag(null);
      setIdx(i => i + 1);
      shownAt.current = Date.now();
    }, 240);
  }

  function openDetail() {
    if (!card) return;
    discoverApi.swipe(card.id, 'click', Date.now() - shownAt.current).catch(() => {});
    navigate(`/place/${card.id}`);
  }

  // ── Drag-Gesten ────────────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    setDrag({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  }
  function onPointerUp() {
    if (!dragStart.current) return;
    const dx = drag?.x ?? 0;
    dragStart.current = null;
    if (dx > 90) advance('like');
    else if (dx < -90) advance('dislike');
    else if (Math.abs(dx) < 6) openDetail();   // Tap = Details (starkes Signal)
    else setDrag(null);
  }

  const dx = flyOut === 'right' ? 600 : flyOut === 'left' ? -600 : (drag?.x ?? 0);
  const rot = dx / 22;
  const likeOpacity = Math.min(1, Math.max(0, dx / 90));
  const nopeOpacity = Math.min(1, Math.max(0, -dx / 90));

  const progress = calibrate && deck.length ? `${Math.min(idx + 1, deck.length)}/${deck.length}` : null;

  const tags = useMemo(() => {
    if (!card) return [] as string[];
    const attrs = (card.attributes ?? {}) as Record<string, unknown>;
    const out: string[] = [card.categoryLabel];
    for (const k of ['l2Slug', 'l3Slug'] as const) {
      const v = attrs[k];
      if (typeof v === 'string' && v) out.push(v.split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' '));
    }
    return out.slice(0, 3);
  }, [card]);

  // Kalibrierung fertig → zurück zur Startseite
  useEffect(() => {
    if (calibrate && done && deck.length > 0) {
      const t = setTimeout(() => navigate('/', { replace: true }), 1800);
      return () => clearTimeout(t);
    }
  }, [calibrate, done]); // eslint-disable-line

  return (
    <AppShell noHeader>
      {/* Füllt exakt eine Bildschirmhöhe (abzgl. Mobil-Navleiste) — kein Scrollen */}
      <div className="h-[calc(100dvh-5rem)] md:h-dvh flex flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>

        {/* ── Kopfzeile ── */}
        <div className="shrink-0 flex items-center justify-between px-4 pt-3 pb-1 max-w-5xl mx-auto w-full">
          <button onClick={() => navigate(calibrate ? '/' : -1 as never)}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[var(--color-aubergine)] hover:shadow active:scale-95 transition-all">
            <i className="fa-solid fa-arrow-left" />
          </button>
          <div className="text-center">
            <p className="font-display font-bold text-[var(--color-aubergine)] leading-none text-lg">
              {calibrate ? 'Wir lernen dich kennen' : 'Entdecken'}
            </p>
            {calibrate && progress && (
              <p className="text-[11px] text-[var(--color-lavender)] mt-1">Karte {progress}</p>
            )}
          </div>
          <div className="w-10" />
        </div>

        {/* ── Filter-Segmente (zentriert, kompakt) ── */}
        {!calibrate && (
          <div className="shrink-0 flex justify-center px-4 pt-1 pb-2">
            <div className="inline-flex gap-1 p-1 bg-[var(--color-bg-soft)] rounded-full">
              {([[false, 'Nur neue'], [true, 'Inkl. bekannter']] as const).map(([v, l]) => (
                <button key={l} onClick={() => { if (includeKnown !== v) setIncludeKnown(v); }}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${includeKnown === v ? 'bg-white text-[var(--color-aubergine)] shadow-sm' : 'text-[var(--color-lavender)]'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 max-w-5xl mx-auto w-full px-4 pb-3">
          <div className="h-full flex flex-col lg:flex-row gap-4 lg:gap-5">

            {/* ═══ Karten-Spalte: Stapel + Aktionsreihe darunter ═══ */}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-none lg:w-[55%] lg:h-full">
              <div className="relative flex-1 min-h-0 select-none" style={{ touchAction: 'pan-y' }}>
                {loading ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-white border border-[var(--color-bg-soft)] text-[var(--color-amber)]">
                    <i className="fa-solid fa-compass fa-spin text-4xl" />
                  </div>
                ) : done ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 rounded-3xl bg-white border border-[var(--color-bg-soft)]">
                    <i className={`fa-solid ${calibrate ? 'fa-circle-check' : 'fa-champagne-glasses'} text-5xl text-[var(--color-amber)]`} />
                    <p className="font-display font-bold text-xl text-[var(--color-aubergine)]">
                      {calibrate ? 'Perfekt — wir kennen dich jetzt!' : 'Alle Karten durch!'}
                    </p>
                    <p className="text-sm text-[var(--color-lavender)] max-w-xs">
                      {calibrate ? 'Deine Vorschläge werden ab jetzt persönlicher…' : 'Lade neue Vorschläge — je mehr du wischst, desto besser werden sie.'}
                    </p>
                    {!calibrate && (
                      <button onClick={loadDeck}
                        className="mt-2 bg-[var(--color-amber)] text-white font-bold px-6 py-3 rounded-2xl text-sm shadow-[var(--shadow-amber)] hover:brightness-105 active:scale-95 transition-all">
                        <i className="fa-solid fa-rotate mr-2" />Neue Orte laden
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* nächste Karte (Stapel-Effekt) */}
                    {next && (
                      <div className="absolute inset-0 rounded-3xl overflow-hidden scale-[0.95] translate-y-3 shadow-lg">
                        <PlaceImage src={next.hero} category={next.category} alt="" className="w-full h-full object-cover" iconClass="text-4xl" />
                        <div className="absolute inset-0 bg-black/25" />
                      </div>
                    )}
                    {/* aktuelle Karte */}
                    {card && (
                      <div
                        className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl cursor-grab active:cursor-grabbing bg-[var(--color-aubergine)]"
                        style={{
                          transform: `translateX(${dx}px) rotate(${rot}deg)`,
                          transition: flyOut ? 'transform 0.24s ease-in' : drag ? 'none' : 'transform 0.25s cubic-bezier(0.2,0.8,0.3,1)',
                        }}
                        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp} onPointerCancel={() => { dragStart.current = null; setDrag(null); }}
                      >
                        <PlaceImage src={card.hero} category={card.category} alt={card.name} className="w-full h-full object-cover pointer-events-none" iconClass="text-6xl" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/25 pointer-events-none" />

                        {/* farbiges Rand-Feedback beim Wischen */}
                        <div className="absolute inset-0 rounded-3xl pointer-events-none transition-opacity"
                          style={{ boxShadow: 'inset 0 0 0 5px var(--color-aubergine)', opacity: likeOpacity * 0.9 }} />
                        <div className="absolute inset-0 rounded-3xl pointer-events-none transition-opacity"
                          style={{ boxShadow: 'inset 0 0 0 5px #E5484D', opacity: nopeOpacity * 0.9 }} />

                        {/* Like/Nope-Stempel */}
                        <div className="absolute top-7 left-6 px-3.5 py-1.5 rounded-xl border-[3px] border-white text-white font-black text-xl rotate-[-15deg] pointer-events-none"
                          style={{ opacity: likeOpacity, background: 'rgba(52,37,76,0.55)', backdropFilter: 'blur(2px)' }}>MERKEN</div>
                        <div className="absolute top-7 right-6 px-3.5 py-1.5 rounded-xl border-[3px] border-white text-white font-black text-xl rotate-[15deg] pointer-events-none"
                          style={{ opacity: nopeOpacity, background: 'rgba(229,72,77,0.6)', backdropFilter: 'blur(2px)' }}>NICHT MEINS</div>

                        {/* Infos */}
                        <div className="absolute bottom-0 left-0 right-0 p-5 pointer-events-none">
                          <div className="flex gap-1.5 mb-2.5 flex-wrap items-center">
                            {!calibrate && card.matchScore > 55 && (
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white inline-flex items-center gap-1"
                                style={{ background: 'var(--color-amber)' }}>
                                <i className="fa-solid fa-wand-magic-sparkles text-[9px]" />{card.matchScore}% dein Stil
                              </span>
                            )}
                            {tags.map(t => (
                              <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white/90"
                                style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(6px)' }}>{t}</span>
                            ))}
                            {card.costLabel === '€' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                                style={{ background: 'rgba(46,204,113,0.85)' }}>günstig/frei</span>
                            )}
                          </div>
                          <h2 className="font-display font-bold text-white text-2xl leading-tight"
                            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.55)' }}>{card.name}</h2>
                          <p className="text-white/75 text-sm mt-0.5"><i className="fa-solid fa-location-dot mr-1" />{card.region}</p>
                          {card.short && <p className="text-white/80 text-[13px] mt-1.5 line-clamp-2 leading-snug">{card.short}</p>}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Aktionsreihe (eigene Zeile, niemals über dem Text) ── */}
              {!done && !loading && card && (
                <div className="shrink-0 flex items-center justify-center gap-7 mt-4">
                  <button onClick={() => advance('dislike')} aria-label="Nicht meins"
                    className="w-16 h-16 rounded-full bg-white shadow-[0_6px_20px_rgba(229,72,77,0.25)] ring-1 ring-black/5 flex items-center justify-center text-[#E5484D] text-2xl hover:scale-105 active:scale-90 transition-transform">
                    <i className="fa-solid fa-xmark" />
                  </button>
                  <button onClick={openDetail} aria-label="Details"
                    className="w-12 h-12 rounded-full bg-white shadow-md ring-1 ring-black/5 flex items-center justify-center text-[var(--color-lavender)] text-lg hover:scale-105 hover:text-[var(--color-aubergine)] active:scale-90 transition-all">
                    <i className="fa-solid fa-arrow-up-right-from-square" />
                  </button>
                  <button onClick={() => advance('like')} aria-label="Gefällt mir"
                    className="w-16 h-16 rounded-full bg-[var(--color-aubergine)] shadow-[0_6px_20px_rgba(52,37,76,0.4)] flex items-center justify-center text-white text-2xl hover:scale-105 active:scale-90 transition-transform">
                    <i className="fa-solid fa-heart" />
                  </button>
                </div>
              )}
              {/* Hinweistext nur ohne Kalibrierung */}
              {!done && !loading && card && (
                <p className="shrink-0 text-center text-[11px] text-[var(--color-lavender-lt)] mt-2.5 hidden sm:block">
                  Wischen oder Buttons · Tippen für Details
                </p>
              )}
            </div>

            {/* ═══ Landkarte: wo liegt der aktuelle Ort? ═══ */}
            <div className="shrink-0 h-[150px] sm:h-[190px] lg:shrink lg:flex-1 lg:h-full">
              <div className="relative rounded-3xl overflow-hidden border border-[var(--color-bg-soft)] h-full">
                <MapContainer center={cardPos ?? [51.16, 10.45]} zoom={cardPos ? 9 : 5}
                  style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={false} dragging={false}>
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO' />
                  <FlyTo pos={cardPos} />
                  {cardPos && <Marker position={cardPos} icon={pin} />}
                </MapContainer>
                {card && (
                  <div className="absolute top-3 left-3 z-[500] bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--color-aubergine)] shadow-sm pointer-events-none">
                    <i className="fa-solid fa-location-dot text-[var(--color-amber)] mr-1.5" />{card.region}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
