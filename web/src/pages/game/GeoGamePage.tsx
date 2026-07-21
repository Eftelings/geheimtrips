/**
 * Geheimquiz — Geheimtrips multiplayer location-guessing game.
 *
 * Desktop:  header (3-col) + main (40 % photo column | 60 % map)
 * Mobile:   header + stacked (photo → map), bottom-sheet reveal panel
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapContainer, TileLayer, Marker, Polyline,
  useMapEvents, useMap,
} from 'react-leaflet';
import L, { type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_LAYERS, TILE_URL, HYBRID_ROADS, HYBRID_LABELS, TILE_PERF, type MapLayer } from '../../utils/mapTiles.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { AppShell } from '../../components/layout/AppShell.js';
import { BrandLogo } from '../../components/ui/BrandLogo.js';
import { TagBadge } from '../../components/ui/TagBadge.js';

// Rundendauer (Sekunden) — Server steuert den echten Countdown, hier für Ring-Mathe/Anzeige.
const ROUND_SECONDS = 14;

const WS_URL = import.meta.env.VITE_WS_URL
  ?? `${location.protocol.replace('http', 'ws')}//${location.host}/api/game/ws`;

// ── Brand palette (hex so the playing overlay can use them without CSS vars) ──
const C = {
  aubergine: '#34254C',
  amber:     '#F99039',
  lavender:  '#71587A',
  bg:        '#FBF9FC',
  bgSoft:    '#F1ECF4',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GPlayer { id: string; name: string; avatarUrl?: string | null; }
interface Score   { playerId: string; name: string; wins: number; avatarUrl?: string | null; }

// Runder Avatar: Profilbild, sonst Initiale.
function GAvatar({ name, avatarUrl, className, bg, textClass = 'text-white' }: {
  name?: string; avatarUrl?: string | null; className: string; bg: string; textClass?: string;
}) {
  return (
    <div className={`${className} rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 font-bold ${textClass}`} style={{ background: bg }}>
      {avatarUrl
        ? <img src={avatarUrl} alt={name ?? ''} className="w-full h-full object-cover" />
        : (name?.[0]?.toUpperCase() ?? '?')}
    </div>
  );
}
interface GuessResult {
  playerId: string; name: string;
  guess: { lat: number; lng: number } | null;
  dist: number | null;
}
interface PlaceResult {
  id: string; name: string; region: string;
  categoryLabel: string; tagSlug?: string | null; short: string;
  photos: string[]; lat: number; lng: number; rating: number;
}
interface PhotoStat { playerId: string; name: string; count: number; }

type Phase = 'hub' | 'searching' | 'playing' | 'gameover';

// ── Map helpers ───────────────────────────────────────────────────────────────

const GERMANY: LatLngExpression = [51.1, 10.4];

function pin(color: string, size = 22) {
  // iconAnchor centres the icon on the coordinate — no CSS translate needed.
  // Having both causes a double-offset that makes lines miss the circle centres.
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:4px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.2);"></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}
const PIN_ACTUAL = pin(C.lavender, 28);
const PIN_ME     = pin(C.amber, 24);
const PIN_OPP    = pin(C.aubergine, 24);

function MapClick({ onGuess }: { onGuess: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onGuess(e.latlng.lat, e.latlng.lng) });
  return null;
}
function FitBounds({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  // Re-fire whenever the actual coordinates change (not just length),
  // so every round reveal correctly re-fits the map.
  const ptsKey = pts.map(p => p.join(',')).join('|');
  useEffect(() => {
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [80, 80], maxZoom: 12 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptsKey]);
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GeoGamePage() {
  const { toggleSave, savedIds } = useAppStore();
  const { user }  = useAuthStore();

  // Pre-fill name from account; allow manual override for guests
  const [phase,           setPhase]           = useState<Phase>('hub');
  const [myName,          setMyName]          = useState(user?.name?.split(' ')[0] ?? '');
  const [myId,            setMyId]            = useState('');
  const [players,         setPlayers]         = useState<GPlayer[]>([]);
  const [matchedOpponent, setMatchedOpponent] = useState<string | null>(null);

  const [curRound,    setCurRound]    = useState(0);
  const [totalRounds, setTotalRounds] = useState(5);
  const [scores,      setScores]      = useState<Score[]>([]);

  const [photos,                setPhotos]                = useState<string[]>([]);
  const [photoIndex,            setPhotoIndex]            = useState(0);
  const [photosViewedThisRound, setPhotosViewedThisRound] = useState(1);

  const [pendingGuess,    setPendingGuess]    = useState<{ lat: number; lng: number } | null>(null);
  const [hasGuessed,      setHasGuessed]      = useState(false);
  const [opponentGuessed, setOpponentGuessed] = useState(false);

  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft,    setTimeLeft]    = useState(ROUND_SECONDS);
  const [mapLayer,    setMapLayer]    = useState<MapLayer>('standard');

  const [revealed,       setRevealed]       = useState(false);
  const [revealPlace,    setRevealPlace]    = useState<PlaceResult | null>(null);
  const [revealResults,  setRevealResults]  = useState<GuessResult[]>([]);
  const [revealWinnerId, setRevealWinnerId] = useState<string | null>(null);
  const [myReady,        setMyReady]        = useState(false);
  const [opponentReady,  setOpponentReady]  = useState(false);

  const [finalScores, setFinalScores] = useState<Score[]>([]);
  const [winnerId,    setWinnerId]    = useState<string | null>(null);
  const [photosSeen,  setPhotosSeen]  = useState<PhotoStat[]>([]);

  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // ── WS ──────────────────────────────────────────────────────────────────────

  const sendMsg = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const handleServerMsg = useCallback((raw: string) => {
    const msg = JSON.parse(raw) as Record<string, unknown>;

    if (msg.type === 'searching' || msg.type === 'cancelled') return;

    if (msg.type === 'matched') {
      setMyId(msg.playerId as string);
      const pl = msg.players as GPlayer[];
      setPlayers(pl);
      setScores(pl.map(p => ({ playerId: p.id, name: p.name, wins: 0, avatarUrl: p.avatarUrl })));
      setMatchedOpponent(pl.find(p => p.id !== (msg.playerId as string))?.name ?? 'Entdecker');
      return;
    }
    if (msg.type === 'game_start') { setPlayers(msg.players as GPlayer[]); return; }

    if (msg.type === 'round_start') {
      const d = msg as { round: number; total: number; photos: string[]; region: string };
      setCurRound(d.round); setTotalRounds(d.total);
      setPhotos(d.photos); setPhotoIndex(0); setPhotosViewedThisRound(1);
      setPendingGuess(null); setHasGuessed(false); setOpponentGuessed(false);
      setTimerActive(false); setTimeLeft(ROUND_SECONDS);
      setRevealed(false); setRevealPlace(null); setRevealResults([]); setRevealWinnerId(null);
      setMyReady(false); setOpponentReady(false);
      setPhase('playing');
      return;
    }
    if (msg.type === 'timer_start') { setTimerActive(true); setTimeLeft(msg.remaining as number); return; }
    if (msg.type === 'timer')        { setTimeLeft(msg.remaining as number); return; }
    if (msg.type === 'player_guessed') { setOpponentGuessed(true); return; }

    if (msg.type === 'round_result') {
      const r = msg as { place: PlaceResult; results: GuessResult[]; roundWinnerId: string | null; scores: Score[] };
      setRevealPlace(r.place); setRevealResults(r.results);
      setRevealWinnerId(r.roundWinnerId); setScores(r.scores);
      setPhotos(r.place.photos); setRevealed(true);
      return;
    }
    if (msg.type === 'player_ready') {
      if ((msg.playerId as string) !== myId) setOpponentReady(true);
      return;
    }
    if (msg.type === 'game_over') {
      setFinalScores(msg.scores as Score[]);
      setWinnerId(msg.winnerId as string | null);
      setPhotosSeen((msg.photosSeen as PhotoStat[]) ?? []);
      setPhase('gameover');
      return;
    }
    if (msg.type === 'player_left') { setError('Dein Gegner hat das Spiel verlassen.'); return; }
    if (msg.type === 'error')       { setError(msg.message as string); return; }
  }, [myId]);

  const openWs = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onmessage = e => handleServerMsg(e.data as string);
    ws.onerror   = () => setError('Verbindung zum Server fehlgeschlagen.');
    return ws;
  }, [handleServerMsg]);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handlePlay = () => {
    if (!myName.trim()) return;
    setError(null); setMatchedOpponent(null); setPhase('searching');
    const ws = openWs();
    ws.onerror = () => { setError('Verbindung zum Server fehlgeschlagen.'); setPhase('hub'); };
    ws.onopen  = () => sendMsg({ type: 'find_match', name: myName.trim(), userId: user?.id ?? null, avatarUrl: user?.avatarUrl ?? null });
  };

  const handleCancelSearch = () => {
    sendMsg({ type: 'cancel_match' });
    wsRef.current?.close(); wsRef.current = null;
    setMatchedOpponent(null); setError(null); setPhase('hub');
  };

  const advancePhoto = (i: number) => {
    if (i < 0 || i >= photos.length) return;
    setPhotoIndex(i);
    setPhotosViewedThisRound(p => Math.max(p, i + 1));
  };

  const submitGuess = () => {
    if (!pendingGuess || hasGuessed) return;
    setHasGuessed(true);
    sendMsg({ type: 'guess', lat: pendingGuess.lat, lng: pendingGuess.lng });
  };

  const handleReady = () => {
    if (myReady) return;
    setMyReady(true);
    sendMsg({ type: 'ready', photosCount: photosViewedThisRound });
  };

  const resetToHub = () => {
    wsRef.current?.close(); wsRef.current = null;
    setMatchedOpponent(null); setScores([]); setFinalScores([]); setPhotosSeen([]); setError(null);
    setPhase('hub');
  };

  // ── Timer math ───────────────────────────────────────────────────────────────
  const TIMER_R    = 18;
  const timerCirc  = 2 * Math.PI * TIMER_R;
  const timerDash  = timerCirc * Math.max(0, timeLeft / ROUND_SECONDS);
  const timerColor = timeLeft > 3 ? C.amber : '#ef4444';

  // ── Derived ──────────────────────────────────────────────────────────────────
  const opponent  = players.find(p => p.id !== myId);
  const myScore   = scores.find(s => s.playerId === myId)?.wins ?? 0;
  const oppScore  = scores.find(s => s.playerId !== myId)?.wins ?? 0;
  const myRes     = revealResults.find(r => r.playerId === myId);
  const oppRes    = revealResults.find(r => r.playerId !== myId);
  const iWon      = revealWinnerId === myId;
  const fitPts    = revealPlace
    ? ([[revealPlace.lat, revealPlace.lng], ...revealResults.flatMap(r => r.guess ? [[r.guess.lat, r.guess.lng]] : [])] as [number, number][])
    : [];

  // ═══════════════════════════════════════════════════════════════════════════
  // NON-PLAYING PHASES — wrapped in AppShell
  // ═══════════════════════════════════════════════════════════════════════════

  if (phase === 'hub') return (
    <AppShell>
      <div className="max-w-sm mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: C.bgSoft }}>
            <i className="fa-solid fa-earth-europe text-3xl" style={{ color: C.amber }} />
          </div>
          <h1 className="font-display text-3xl font-bold leading-tight mb-1" style={{ color: C.aubergine }}>Geheimquiz</h1>
          <p className="text-sm" style={{ color: C.lavender }}>Erkenne Geheimtrips — schlage deinen Gegner</p>
        </div>
        <div className="space-y-3">
          {user ? (
            /* Logged-in: show name badge, no input needed */
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border"
              style={{ background: 'white', borderColor: `${C.lavender}33` }}>
              <GAvatar name={user.name} avatarUrl={user.avatarUrl} className="w-8 h-8 text-sm" bg={C.amber} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate" style={{ color: C.aubergine }}>{user.name}</div>
                <div className="text-[10px]" style={{ color: C.lavender }}>@{user.handle}</div>
              </div>
              <i className="fa-solid fa-check-circle flex-shrink-0" style={{ color: C.amber }} />
            </div>
          ) : (
            /* Guest: enter display name */
            <input type="text" maxLength={20} placeholder="Dein Name"
              value={myName} onChange={e => setMyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePlay()}
              className="w-full px-4 py-3 rounded-2xl text-sm border outline-none font-semibold transition-colors"
              style={{ borderColor: C.bgSoft, background: 'white', color: C.aubergine }} />
          )}
          <button onClick={handlePlay} disabled={!myName.trim()}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
            style={{ background: C.amber }}>
            <i className="fa-solid fa-play text-xs" /> Spielen
          </button>
          <p className="text-center text-xs pt-1" style={{ color: C.lavender }}>
            Das Spiel beginnt automatisch, sobald ein Entdecker gefunden wird.
          </p>
        </div>
        {error && (
          <div className="mt-4 px-4 py-3 rounded-2xl text-sm font-semibold text-white flex items-center gap-2 bg-red-500">
            <i className="fa-solid fa-circle-exclamation" />{error}
          </div>
        )}
      </div>
    </AppShell>
  );

  if (phase === 'searching') return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 py-10">
        {!matchedOpponent ? (
          <>
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 rounded-full animate-ping" style={{ background: C.amber + '33' }} />
              <div className="absolute inset-3 rounded-full animate-ping" style={{ background: C.amber + '22', animationDelay: '0.4s' }} />
              <div className="relative w-full h-full rounded-full flex items-center justify-center" style={{ background: C.bgSoft }}>
                <i className="fa-solid fa-earth-europe text-4xl" style={{ color: C.amber }} />
              </div>
            </div>
            <h2 className="font-display text-2xl font-bold mb-2" style={{ color: C.aubergine }}>
              Warte auf andere Entdecker…
            </h2>
            <p className="text-sm mb-1" style={{ color: C.lavender }}>
              Du spielst als <strong style={{ color: C.aubergine }}>{myName}</strong>
            </p>
            <p className="text-xs mb-8" style={{ color: C.lavender }}>Sobald jemand beitritt, geht's los!</p>
            <button onClick={handleCancelSearch}
              className="px-6 py-2.5 rounded-2xl text-sm font-semibold transition-colors"
              style={{ background: C.bgSoft, color: C.lavender }}>
              Abbrechen
            </button>
          </>
        ) : (
          <>
            <div className="w-24 h-24 mb-6 rounded-3xl flex items-center justify-center"
              style={{ background: C.bgSoft, border: `2px solid ${C.amber}` }}>
              <i className="fa-solid fa-flag-checkered text-4xl" style={{ color: C.amber }} />
            </div>
            <h2 className="font-display text-2xl font-bold mb-4" style={{ color: C.aubergine }}>Entdecker gefunden!</h2>
            <div className="flex items-center gap-5 mb-6">
              {[{ name: myName, color: C.amber, sub: 'du', avatarUrl: user?.avatarUrl ?? null }, { name: matchedOpponent, color: C.aubergine, sub: 'gegner', avatarUrl: opponent?.avatarUrl ?? null }].map((p, i) => (
                <React.Fragment key={i}>
                  {i === 1 && <span className="font-display text-xl font-bold" style={{ color: C.lavender }}>VS</span>}
                  <div className="text-center">
                    <GAvatar name={p.name} avatarUrl={p.avatarUrl} className="w-12 h-12 text-lg mx-auto mb-1" bg={p.color} />
                    <p className="text-sm font-semibold" style={{ color: C.aubergine }}>{p.name}</p>
                    <p className="text-xs" style={{ color: C.lavender }}>{p.sub}</p>
                  </div>
                </React.Fragment>
              ))}
            </div>
            <p className="text-sm mb-3" style={{ color: C.lavender }}>Das Spiel startet gleich…</p>
            <div className="flex gap-1.5">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full"
                  style={{ background: C.amber, animation: `bounce 1.2s ease-in-out infinite`, animationDelay: `${i*0.2}s` }} />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );

  if (phase === 'gameover') {
    const isWinner = winnerId === myId;
    const winnerName = finalScores.find(s => s.playerId === winnerId)?.name ?? '';
    return (
      <AppShell>
        <div className="max-w-sm mx-auto px-6 py-8">
          <div className="text-center mb-6">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-3"
              style={{ background: C.bgSoft, border: `2px solid ${C.amber}` }}>
              <i className="fa-solid fa-trophy text-4xl" style={{ color: C.amber }} />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.lavender }}>Spielende</p>
            <h2 className="font-display text-3xl font-bold" style={{ color: C.aubergine }}>
              {isWinner ? 'Du hast gewonnen!' : `${winnerName} gewinnt!`}
            </h2>
            {isWinner && <p className="text-sm mt-1" style={{ color: C.lavender }}>Glückwunsch! 🎉</p>}
          </div>

          <div className="space-y-3 mb-5">
            {[...finalScores].sort((a, b) => b.wins - a.wins).map(s => {
              const isW = s.playerId === winnerId;
              const isMe = s.playerId === myId;
              return (
                <div key={s.playerId} className="flex items-center gap-4 px-5 py-4 rounded-3xl bg-white"
                  style={{ boxShadow: isW ? `0 0 0 2px ${C.amber}` : `0 0 0 1px ${C.bgSoft}` }}>
                  <GAvatar name={s.name} avatarUrl={s.avatarUrl} className="w-10 h-10 text-base" bg={isMe ? C.amber : C.aubergine} />
                  <div className="flex-1">
                    <p className="font-bold" style={{ color: C.aubergine }}>
                      {s.name} {isMe && <span className="text-xs font-normal" style={{ color: C.lavender }}>(du)</span>}
                    </p>
                    <p className="text-xs" style={{ color: C.lavender }}>
                      {s.wins} {s.wins === 1 ? 'Runde' : 'Runden'} gewonnen
                    </p>
                  </div>
                  {isW && <i className="fa-solid fa-crown text-xl" style={{ color: C.amber }} />}
                </div>
              );
            })}
          </div>

          {photosSeen.length > 0 && (
            <div className="rounded-2xl px-4 py-3 mb-5" style={{ background: C.bgSoft }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.lavender }}>Fotos gesehen</p>
              <div className="flex gap-5">
                {photosSeen.map(p => (
                  <div key={p.playerId} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center flex-shrink-0"
                      style={{ background: p.playerId === myId ? C.amber : C.aubergine }}>
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-bold" style={{ color: C.aubergine }}>{p.count}</span>
                    {p.playerId === myId && <span className="text-xs" style={{ color: C.lavender }}>(du)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button onClick={resetToHub}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110 active:scale-95"
              style={{ background: C.amber }}>
              <i className="fa-solid fa-rotate-right mr-2" />Nochmal spielen
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYING PHASE — fullscreen branded overlay
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: C.bg, zIndex: 50 }}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 h-16 lg:h-20 bg-white flex items-center justify-between px-5 lg:px-8 z-50"
        style={{ boxShadow: '0 1px 0 rgba(113,88,122,0.1), 0 4px 12px rgba(52,37,76,0.05)' }}>

        {/* Left: logo */}
        <div className="w-auto lg:w-1/3">
          <BrandLogo size="sm" />
        </div>

        {/* Center: headline (desktop only) */}
        <div className="hidden lg:flex lg:w-1/3 justify-center">
          <h1 className="font-display text-xl xl:text-2xl leading-tight" style={{ color: C.aubergine }}>
            <em className="italic" style={{ color: C.lavender }}>Wo ist</em>{' '}
            <span className="font-bold">dieser Geheimtrip?</span>
          </h1>
        </div>

        {/* Right: scores + round/timer */}
        <div className="flex items-center gap-3 ml-auto lg:ml-0 lg:w-1/3 lg:justify-end">

          {/* Score pill */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border"
            style={{ background: C.bg, borderColor: `${C.lavender}33` }}>
            {/* My avatar + score */}
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                style={{ background: C.amber }}>
                {myName[0]?.toUpperCase() ?? 'I'}
              </div>
              <span className="font-bold text-base" style={{ color: C.aubergine }}>{myScore}</span>
            </div>
            <span className="font-light text-sm" style={{ color: C.lavender }}>|</span>
            {/* Opponent score + avatar */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base" style={{ color: C.aubergine }}>{oppScore}</span>
              <GAvatar name={opponent?.name} avatarUrl={opponent?.avatarUrl} className="w-7 h-7 text-xs shadow-sm" bg={C.aubergine} />
            </div>
          </div>

          {/* Round badge / timer ring */}
          {timerActive ? (
            <div className="relative w-11 h-11 flex-shrink-0">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r={TIMER_R} fill="none" stroke={`${C.amber}33`} strokeWidth="3.5" />
                <circle cx="22" cy="22" r={TIMER_R} fill="none" stroke={timerColor} strokeWidth="3.5"
                  strokeDasharray={`${timerDash} ${timerCirc}`} strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold"
                style={{ color: timerColor }}>{timeLeft}</span>
            </div>
          ) : (
            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 border-2"
              style={{ borderColor: C.amber }}>
              <span className="font-bold text-xs leading-none" style={{ color: C.amber }}>
                {curRound}
                <span className="text-[9px] font-normal mx-px" style={{ color: C.lavender }}>/</span>
                {totalRounds}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── MAIN: 40% left | 60% right ─────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 lg:gap-6 px-3 pt-3 pb-0 lg:px-8 lg:pt-6 lg:pb-2">

        {/* ── LEFT COLUMN (photo → results on reveal) ─────────────────── */}
        {/* Mobil: eigene vertikale Fläche (flex-1), sonst kollabiert das Foto auf 0 Höhe */}
        <div className="flex flex-col min-h-0 flex-1 lg:flex-none lg:w-[40%]"
          style={{ gap: revealed ? '1rem' : '0' }}>

          {/* Foto-Karte — auch bei der Auswertung sichtbar; Ort-Infos liegen als Overlay darauf. */}
          <div className="relative overflow-hidden flex-shrink-0"
            style={{
              flexGrow: revealed ? 0 : 1,
              height: revealed ? '42%' : undefined,
              minHeight: '35%',
              borderRadius: '1.5rem',
              boxShadow: '0 10px 40px rgba(52,37,76,0.10)',
            }}>

            {photos.length > 0
              ? <img src={photos[photoIndex]} alt="Geheimtrip"
                  className="absolute inset-0 w-full h-full object-cover" />
              : <div className="absolute inset-0 flex items-center justify-center" style={{ background: C.bgSoft }}>
                  <i className="fa-solid fa-image text-4xl" style={{ color: C.lavender }} />
                </div>
            }

            {/* Top gradient */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 35%, transparent 55%, rgba(52,37,76,0.85) 100%)' }} />

            {/* Photo counter + opponent badge row */}
            <div className="absolute top-3.5 left-4 right-4 flex items-center justify-between">
              {/* Runde badge (guessing only) */}
              {!revealed && (
                <div className="bg-black/40 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/20">
                  Runde {curRound} / {totalRounds}
                </div>
              )}

              {/* Photo count */}
              {photos.length > 1 && (
                <div className="ml-auto bg-black/40 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1.5 rounded-full">
                  {photoIndex + 1} / {photos.length}
                </div>
              )}
            </div>

            {/* Arrow navigation */}
            {photos.length > 1 && (
              <>
                <button onClick={() => advancePhoto(photoIndex - 1)} disabled={photoIndex === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 z-10">
                  <i className="fa-solid fa-chevron-left text-xs" />
                </button>
                <button onClick={() => advancePhoto(photoIndex + 1)} disabled={photoIndex === photos.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 z-10">
                  <i className="fa-solid fa-chevron-right text-xs" />
                </button>
                {/* Dot indicators */}
                <div className="absolute bottom-[4.5rem] left-0 right-0 flex justify-center gap-1.5 z-10">
                  {photos.map((_, i) => (
                    <button key={i} onClick={() => advancePhoto(i)}
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{ background: i === photoIndex ? 'white' : 'rgba(255,255,255,0.45)', transform: i === photoIndex ? 'scale(1.2)' : 'scale(1)' }} />
                  ))}
                </div>
              </>
            )}

            {/* Bottom overlay: place info (revealed) or hint (guessing) */}
            <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
              {revealed && revealPlace ? (
                <>
                  <TagBadge slug={revealPlace.tagSlug} fallback={revealPlace.categoryLabel} icon variant="dark" className="mb-1" />
                  <h2 className="font-display text-2xl lg:text-3xl font-bold text-white leading-tight drop-shadow-md">
                    {revealPlace.name}
                  </h2>
                  <p className="text-white/80 text-sm mt-1 flex items-center gap-1.5">
                    <i className="fa-solid fa-location-dot" style={{ color: C.amber }} />
                    {revealPlace.region}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <i className="fa-solid fa-star text-xs" style={{ color: C.amber }} />
                    <span className="text-white/90 text-sm font-semibold">{revealPlace.rating.toFixed(1)}</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-display text-lg font-bold text-white drop-shadow-md">
                    <em className="italic font-normal" style={{ color: '#c5b5d2' }}>Wo ist</em> dieser Geheimtrip?
                  </p>
                  <p className="text-white/70 text-sm mt-0.5">
                    {!hasGuessed
                      ? 'Tippe auf die Karte, wo du diesen Ort vermutest!'
                      : <><i className="fa-solid fa-check mr-1" style={{ color: C.amber }} />Tipp abgegeben — warte auf Auswertung…</>
                    }
                  </p>
                  {opponentGuessed && opponent && (
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 text-xs text-white font-semibold">
                      <GAvatar name={opponent.name} avatarUrl={opponent.avatarUrl} className="w-4 h-4 text-[9px]" bg={C.aubergine} />
                      {opponent.name} hat getippt
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Results card (revealed only) ───────────────────────────── */}
          {revealed && revealPlace && (
            <div className="flex-1 min-h-0 bg-white rounded-3xl p-3.5 lg:p-5 overflow-auto"
              style={{ boxShadow: '0 10px 40px rgba(52,37,76,0.08)', border: `1px solid ${C.lavender}1A` }}>

              {/* Runden-Gewinner steht schon am Punktestand oben + an der hervorgehobenen Distanz-Karte;
                  der eigene Banner ist raus, damit die Auswertung mobil ohne Scrollen passt. */}

              {/* Distance stats */}
              <div className="grid grid-cols-2 gap-2.5 mb-2 lg:gap-3 lg:mb-4">
                {[myRes, oppRes].filter(Boolean).map(r => {
                  const isMe   = r!.playerId === myId;
                  const isWin  = r!.playerId === revealWinnerId;
                  return (
                    <div key={r!.playerId}
                      className="rounded-2xl p-2.5 lg:p-3.5 flex flex-col items-center border-2"
                      style={{
                        background:   isWin ? `${C.aubergine}08` : C.bg,
                        borderColor:  isWin ? `${C.aubergine}33` : 'transparent',
                      }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-3 h-3 rounded-full" style={{ background: isMe ? C.amber : C.aubergine }} />
                        <span className="text-sm font-bold" style={{ color: C.aubergine }}>
                          {isMe ? 'Du' : players.find(p => p.id === r!.playerId)?.name ?? 'Gegner'}
                        </span>
                      </div>
                      <span className="font-display text-lg lg:text-2xl font-bold" style={{ color: C.aubergine }}>
                        {r!.dist != null ? `${r!.dist.toLocaleString('de')} km` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: Map ───────────────────────────────────────── */}
        {/* Bei der Auswertung mobil kleiner (feste Höhe), damit der Gewinn-Block ohne Scrollen passt;
            Desktop bleibt flexibel. Beim Raten füllt die Karte wie gehabt die Fläche. */}
        <div className={`min-h-0 relative ${revealed ? 'flex-none h-[34vh] lg:h-auto lg:flex-1' : 'flex-1'}`}
          style={{
            minHeight: revealed ? undefined : '30%',
            borderRadius: '1.5rem',
            overflow: 'hidden',
            boxShadow: '0 10px 40px rgba(52,37,76,0.08)',
            border: `1px solid ${C.lavender}33`,
          }}>

          {/* Auffälliger Countdown, während geraten wird */}
          {timerActive && !revealed && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full text-white font-extrabold"
                style={{
                  background: timerColor,
                  boxShadow: `0 6px 22px ${timerColor}88`,
                  animation: `gtCountPulse ${timeLeft <= 3 ? '0.5s' : '1.1s'} ease-in-out infinite`,
                }}>
                <i className="fa-solid fa-stopwatch text-sm" />
                <span className="text-lg leading-none tabular-nums">{timeLeft}s</span>
              </div>
            </div>
          )}

          {/* Karten-Ebene umschalten (Standard / Satellit / Hybrid) */}
          <div className="absolute top-3 right-3 z-[900] flex gap-1 bg-white/90 backdrop-blur rounded-full p-1"
            style={{ boxShadow: '0 2px 10px rgba(52,37,76,0.2)' }}>
            {MAP_LAYERS.map(l => (
              <button key={l.id} onClick={() => setMapLayer(l.id)} title={l.label} aria-label={l.label}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors"
                style={mapLayer === l.id ? { background: C.amber, color: 'white' } : { color: C.aubergine }}>
                <i className={`fa-solid ${l.icon}`} />
              </button>
            ))}
          </div>

          <MapContainer center={GERMANY} zoom={5} minZoom={2} scrollWheelZoom worldCopyJump
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}>
            <TileLayer key={mapLayer} url={TILE_URL[mapLayer]} attribution="" {...TILE_PERF} />
            {mapLayer === 'hybrid' && <TileLayer url={HYBRID_ROADS} attribution="" {...TILE_PERF} />}
            {mapLayer === 'hybrid' && <TileLayer url={HYBRID_LABELS} attribution="" {...TILE_PERF} />}

            {!revealed && (
              <MapClick onGuess={hasGuessed ? () => {} : (lat, lng) => setPendingGuess({ lat, lng })} />
            )}
            {!revealed && pendingGuess && (
              <Marker position={[pendingGuess.lat, pendingGuess.lng]} icon={PIN_ME} />
            )}

            {revealed && revealPlace && (
              <>
                <FitBounds pts={fitPts} />
                <Marker position={[revealPlace.lat, revealPlace.lng]} icon={PIN_ACTUAL} />
                {revealResults.map(r => r.guess && (
                  <React.Fragment key={r.playerId}>
                    <Marker position={[r.guess.lat, r.guess.lng]} icon={r.playerId === myId ? PIN_ME : PIN_OPP} />
                    <Polyline
                      positions={[[r.guess.lat, r.guess.lng], [revealPlace.lat, revealPlace.lng]]}
                      color={r.playerId === myId ? C.amber : C.aubergine}
                      dashArray="12 7" weight={3.5} opacity={0.95}
                    />
                  </React.Fragment>
                ))}
              </>
            )}
          </MapContainer>

        </div>
      </div>

      {/* ── FOOTER: dedicated action bar (never overlays content) ──────── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 lg:px-8 lg:pb-6 lg:pt-3"
        style={{ background: C.bg }}>
        {!revealed ? (
          /* Guessing: centred pill button — not full-width */
          <div className="flex justify-center">
            <button onClick={submitGuess} disabled={!pendingGuess || hasGuessed}
              className="min-w-[200px] py-3.5 px-8 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
              style={{
                background: pendingGuess && !hasGuessed ? C.amber : C.aubergine,
                boxShadow: pendingGuess && !hasGuessed ? `0 4px 18px ${C.amber}55` : undefined,
              }}>
              {hasGuessed
                ? <><i className="fa-solid fa-check" /> Tipp abgegeben — warte auf Auswertung…</>
                : pendingGuess
                ? <><i className="fa-solid fa-location-dot" /> Tipp abschicken!</>
                : <><i className="fa-regular fa-hand-pointer" /> Auf die Karte tippen</>
              }
            </button>
          </div>
        ) : revealPlace ? (
          /* Reveal: Merken + Nächste Runde */
          <div className="flex gap-3">
            <button
              onClick={() => { toggleSave(revealPlace.id); handleReady(); }}
              disabled={myReady}
              className="flex items-center justify-center gap-2 rounded-2xl py-3.5 px-5 text-sm font-bold border-2 transition-all active:scale-[0.98] disabled:opacity-50"
              style={{
                width: '35%',
                background: savedIds.has(revealPlace.id) ? C.aubergine : 'white',
                color:      savedIds.has(revealPlace.id) ? 'white' : C.aubergine,
                borderColor: savedIds.has(revealPlace.id) ? C.aubergine : `${C.lavender}4D`,
              }}>
              <i className={`fa-${savedIds.has(revealPlace.id) ? 'solid' : 'regular'} fa-bookmark`} />
              Merken
            </button>
            <button onClick={handleReady} disabled={myReady}
              className="flex items-center justify-center gap-2 rounded-2xl py-3.5 px-5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ flex: 1, background: C.amber, boxShadow: `0 4px 15px ${C.amber}4D` }}>
              {myReady
                ? (opponentReady
                    ? <><i className="fa-solid fa-circle-notch fa-spin" /> Gleich weiter…</>
                    : <><i className="fa-solid fa-hourglass-half" /> Warte auf {opponent?.name ?? 'Gegner'}…</>)
                : <>Nächste Runde <i className="fa-solid fa-arrow-right" /></>
              }
            </button>
          </div>
        ) : null}
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white bg-red-500 shadow-lg z-[60]">
          <i className="fa-solid fa-circle-exclamation" />{error}
        </div>
      )}
    </div>
  );
}
