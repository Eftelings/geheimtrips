import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { discoverApi } from '../services/api.js';
import { geocodeSuggestions, requestGpsPosition, getLocationByIp, reverseGeocode } from '../services/geoService.js';
import type { Coords, GeoLocation } from '../services/geoService.js';
import { MOBILITY } from '../types/index.js';
import type { Transport } from '../types/index.js';
import { TRAVEL_MAX_MIN } from '../utils/geo.js';

/** Wann-Kacheln: „Jetzt" groß über beide Spalten, darunter 2×2 */
const WHEN = [
  { id: 'jetzt',      label: 'Jetzt',       icon: 'fa-bolt',          minutes: 60,  big: true },
  { id: 'morgen',     label: 'Morgen',      icon: 'fa-sun',           minutes: 120 },
  { id: 'wochenende', label: 'Wochenende',  icon: 'fa-calendar-week', minutes: 240 },
  { id: 'urlaub',     label: 'Urlaub',      icon: 'fa-umbrella-beach', minutes: 360 },
  { id: 'egal',       label: 'Egal',        icon: 'fa-shuffle',       minutes: 240 },
] as const;

export function FinderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [placeLabel, setPlaceLabel] = useState('');
  const [sugs, setSugs] = useState<GeoLocation[]>([]);
  const [transport, setTransport] = useState<Transport>('auto');
  const [minutes, setMinutes] = useState(60);
  const [count, setCount] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Standort sofort erkennen — Schritt 2 ist keine Frage, sondern Bestätigung
  useEffect(() => {
    discoverApi.prefs().then(p => { if (p.exists && p.transport) setTransport(p.transport as Transport); }).catch(() => {});
    (async () => {
      try {
        const c = await requestGpsPosition();
        setCoords(c);
        try { setPlaceLabel((await reverseGeocode(c)).displayName); } catch { setPlaceLabel('Mein Standort'); }
      } catch {
        const ip = await getLocationByIp();
        if (ip) { setCoords({ lat: ip.lat, lng: ip.lng }); setPlaceLabel(ip.city ?? 'Mein Standort'); }
      }
    })();
  }, []);

  // Live-Zähler in Schritt 3: wie viele Geheimtrips liegen in der Reichweite?
  useEffect(() => {
    if (step !== 2 || !coords) return;
    setCount(null);
    const t = setTimeout(async () => {
      try {
        const d = await discoverApi.deck({ lat: coords.lat, lng: coords.lng, mode: transport, minutes, limit: 60 });
        setCount(d.length);
      } catch { setCount(null); }
    }, 350);
    return () => clearTimeout(t);
  }, [step, coords?.lat, coords?.lng, transport, minutes]); // eslint-disable-line

  function search(val: string) {
    setPlaceLabel(val);
    setCoords(null);
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 3) { setSugs([]); return; }
    timer.current = setTimeout(async () => setSugs(await geocodeSuggestions(val)), 450);
  }

  function go() {
    const p = new URLSearchParams();
    if (coords) {
      p.set('lat', String(coords.lat)); p.set('lng', String(coords.lng));
      p.set('mode', transport); p.set('minutes', String(minutes));
    }
    navigate(`/swipe?${p.toString()}`);
  }

  const maxMin = TRAVEL_MAX_MIN[transport];
  const stepCfg = maxMin >= 360 ? 30 : 15;
  const minLabel = minutes >= 120
    ? (minutes % 60 === 0 ? `${minutes / 60} Std` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} Std`)
    : `${minutes} Min`;

  const tile = (active: boolean) =>
    `flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-5 transition-all ${active ? 'border-[var(--color-amber)] bg-[#FFF4EB]' : 'border-[var(--color-bg-soft)] bg-white hover:border-[var(--color-amber)]'}`;

  return (
    <div className="min-h-dvh" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-md mx-auto w-full px-5 pt-8 pb-12">

        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => step === 0 ? navigate('/') : setStep(s => s - 1)}
            className="w-9 h-9 rounded-full bg-white shadow flex items-center justify-center text-[var(--color-aubergine)]">
            <i className="fa-solid fa-arrow-left" />
          </button>
          <div>
            <p className="font-display font-bold text-[var(--color-aubergine)] leading-none">Geheimtripp finden</p>
            <p className="text-[11px] text-[var(--color-lavender)] mt-0.5">Lass uns finden, wonach du suchst.</p>
          </div>
        </div>

        <div className="flex gap-1.5 mb-7">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex-1 h-1.5 rounded-full transition-colors"
              style={{ background: i <= step ? 'var(--color-amber)' : 'var(--color-bg-soft)' }} />
          ))}
        </div>

        {/* ── Kachel 1: Wann? — „Jetzt" groß, darunter 2×2 ── */}
        {step === 0 && (
          <>
            <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] mb-5">Wann soll's losgehen?</h1>
            <div className="grid grid-cols-2 gap-2.5">
              {WHEN.map(w => (
                <button key={w.id}
                  onClick={() => { setMinutes(Math.min(w.minutes, TRAVEL_MAX_MIN[transport])); setStep(1); }}
                  className={`${tile(false)} ${'big' in w && w.big ? 'col-span-2 py-7' : ''}`}>
                  <i className={`fa-solid ${w.icon} ${'big' in w && w.big ? 'text-3xl' : 'text-xl'} text-[var(--color-amber)]`} />
                  <span className={`font-bold text-[var(--color-aubergine)] ${'big' in w && w.big ? 'text-lg' : 'text-sm'}`}>{w.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Kachel 2: Standort (erkannt, austauschbar) + Verkehrsmittel ── */}
        {step === 1 && (
          <div className="bg-white rounded-3xl border-2 border-[var(--color-bg-soft)] p-5">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-[#FFF4EB] flex items-center justify-center mb-2">
                <i className="fa-solid fa-location-dot text-2xl text-[var(--color-amber)]" />
              </div>
              <p className="text-xs text-[var(--color-lavender)]">
                {coords ? 'Dein Standort wurde erkannt' : 'Wo startest du?'}
              </p>
            </div>

            <div className="relative mb-6">
              <div className="flex items-center gap-2.5 border-2 border-[var(--color-bg-soft)] rounded-2xl px-4 py-3 focus-within:border-[var(--color-amber)] transition-colors">
                <i className={`fa-solid ${coords ? 'fa-circle-check text-[#2e7d32]' : 'fa-magnifying-glass text-[var(--color-lavender)]'} text-sm`} />
                <input type="text" value={placeLabel} onChange={e => search(e.target.value)}
                  placeholder="Ort, Region oder Land…"
                  className="flex-1 outline-none text-sm font-semibold text-[var(--color-aubergine)] bg-transparent" />
              </div>
              {sugs.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-[var(--shadow-raised)] border border-[var(--color-bg-soft)] z-50 overflow-hidden">
                  {sugs.map((s, i) => (
                    <button key={i}
                      onClick={() => { setCoords(s.coords); setPlaceLabel(s.displayName); setSugs([]); }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-soft)] border-b border-[var(--color-bg-soft)] last:border-0">
                      <i className="fa-solid fa-location-dot text-[var(--color-amber)] mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-aubergine)]">{s.displayName}</p>
                        <p className="text-xs text-[var(--color-lavender)] truncate">{s.fullAddress}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p className="text-sm font-bold text-[var(--color-aubergine)] mb-3">Wie willst du reisen?</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {MOBILITY.map(m => (
                <button key={m.id}
                  onClick={() => { setTransport(m.id); setMinutes(v => Math.min(v, TRAVEL_MAX_MIN[m.id])); }}
                  className={`flex items-center gap-2.5 p-3 rounded-2xl border-2 text-left transition-all ${transport === m.id ? 'border-[var(--color-amber)] bg-[#FFF4EB]' : 'border-[var(--color-bg-soft)]'}`}>
                  <i className={`fa-solid ${m.icon} w-5 text-center`} style={{ color: transport === m.id ? 'var(--color-amber)' : 'var(--color-lavender)' }} />
                  <span className="font-semibold text-xs text-[var(--color-aubergine)]">{m.label}</span>
                </button>
              ))}
            </div>

            <button onClick={() => coords && setStep(2)} disabled={!coords}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm shadow-[var(--shadow-amber)] disabled:opacity-50 transition-all"
              style={{ background: 'var(--color-amber)' }}>
              Weiter
            </button>
          </div>
        )}

        {/* ── Kachel 3: Reisezeit + Live-Zähler ── */}
        {step === 2 && (
          <div className="bg-white rounded-3xl border-2 border-[var(--color-bg-soft)] p-5">
            <h2 className="font-display font-bold text-xl text-[var(--color-aubergine)] mb-1">Wie lange darf die Anreise dauern?</h2>
            <p className="text-xs text-[var(--color-lavender)] mb-5">
              <i className={`fa-solid ${MOBILITY.find(m => m.id === transport)?.icon} mr-1`} />
              {MOBILITY.find(m => m.id === transport)?.label} ab {placeLabel}
            </p>

            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)]">Reisezeit</p>
              <p className="text-base font-bold text-[var(--color-amber)]">{minLabel}</p>
            </div>
            <input type="range" min={stepCfg} max={maxMin} step={stepCfg} value={minutes}
              onChange={e => setMinutes(Number(e.target.value))} className="map-radius w-full mb-6" />

            {/* Live-Zähler */}
            <div className="rounded-2xl p-4 mb-6 text-center" style={{ background: 'var(--color-bg-soft)' }}>
              {count === null ? (
                <p className="text-sm text-[var(--color-lavender)]"><i className="fa-solid fa-compass fa-spin mr-2 text-[var(--color-amber)]" />Wir zählen deine Geheimtrips…</p>
              ) : (
                <p className="text-sm text-[var(--color-aubergine)]">
                  In diesem Gebiet haben wir <strong className="text-[var(--color-amber)] text-lg">{count >= 60 ? '60+' : count}</strong> Geheimtrips,<br />die dir gefallen könnten.
                </p>
              )}
            </div>

            <button onClick={go}
              className="w-full py-4 rounded-2xl font-bold text-white text-sm shadow-[var(--shadow-amber)] hover:brightness-105 transition-all"
              style={{ background: 'var(--color-amber)' }}>
              <i className="fa-solid fa-layer-group mr-2" />Los geht's!
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
