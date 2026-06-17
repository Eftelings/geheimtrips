import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore.js';
import { tripsApi } from '../services/api.js';
import { geocodeSuggestions, distanceKm } from '../services/geoService.js';
import type { Coords, GeoLocation } from '../services/geoService.js';
import { MOBILITY } from '../types/index.js';
import type { Transport, Trip } from '../types/index.js';

/**
 * Trip-Funnel: Ziel? → Verkehrsmittel → max. Entfernung → Wer reist mit?
 * → Merklisten-Auswahl (vorsortiert nach Entfernung) oder leerer Trip.
 * „Weiß noch nicht" → kuratierte Trips als Inspiration.
 */

const COMPANIONS = ['Solo', 'Partner:in', 'Freunde', 'Familie mit Kindern', 'Gruppe', 'Mit Hund'];

export function TripWizardPage() {
  const navigate = useNavigate();
  const { places, savedIds, loadPlaces, loadTrips } = useAppStore();
  const [step, setStep] = useState(0);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [label, setLabel] = useState('');
  const [sugs, setSugs] = useState<GeoLocation[]>([]);
  const [curated, setCurated] = useState<Trip[]>([]);
  const [transport, setTransport] = useState<Transport>('auto');
  const [maxKm, setMaxKm] = useState(150);
  const [persons, setPersons] = useState(2);
  const [companions, setCompanions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadPlaces(); }, []); // eslint-disable-line

  function search(val: string) {
    setLabel(val); setCoords(null);
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 3) { setSugs([]); return; }
    timer.current = setTimeout(async () => setSugs(await geocodeSuggestions(val)), 450);
  }

  // Merkliste, nach Entfernung zum Ziel sortiert; im Radius zuerst
  const saved = places
    .filter(p => savedIds.has(p.id))
    .map(p => ({ p, dist: coords && p.lat != null && p.lng != null ? distanceKm(coords, { lat: p.lat, lng: p.lng }) : null }))
    .sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
  const inRange = saved.filter(x => x.dist !== null && x.dist <= maxKm);
  const outRange = saved.filter(x => !(x.dist !== null && x.dist <= maxKm));
  const shown = showAll ? saved : inRange;

  async function createTrip(placeIds: string[]) {
    setBusy(true);
    try {
      const t = await tripsApi.create({
        title: label ? `Trip nach ${label}` : 'Mein neuer Trip',
        subtitle: companions.length ? `${persons} Personen · ${companions.join(', ')}` : `${persons} Personen`,
        transport,
        placeIds,
      }) as Trip;
      await tripsApi.update(t.id, { persons }).catch(() => {});
      await loadTrips();
      navigate(`/trips/${t.id}`);
    } finally { setBusy(false); }
  }

  const card = 'bg-white rounded-3xl border-2 border-[var(--color-bg-soft)] p-5';

  return (
    <div className="min-h-dvh" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-md mx-auto w-full px-5 pt-8 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => step === 0 ? navigate(-1) : setStep(s => Math.max(0, s - 1))}
            className="w-9 h-9 rounded-full bg-white shadow flex items-center justify-center text-[var(--color-aubergine)]">
            <i className="fa-solid fa-arrow-left" />
          </button>
          <p className="font-display font-bold text-[var(--color-aubergine)]">Eigenen Trip gestalten</p>
        </div>

        {/* 1: Ziel bekannt? */}
        {step === 0 && (
          <div className={card}>
            <h1 className="font-display font-bold text-xl text-[var(--color-aubergine)] mb-4">Weißt du schon, wo du hinwillst?</h1>
            <div className="relative mb-3">
              <div className="flex items-center gap-2.5 border-2 border-[var(--color-bg-soft)] rounded-2xl px-4 py-3 focus-within:border-[var(--color-amber)]">
                <i className={`fa-solid ${coords ? 'fa-circle-check text-[#2e7d32]' : 'fa-magnifying-glass text-[var(--color-lavender)]'} text-sm`} />
                <input type="text" value={label} onChange={e => search(e.target.value)} placeholder="Ja — nach…"
                  className="flex-1 outline-none text-sm font-semibold text-[var(--color-aubergine)] bg-transparent" />
              </div>
              {sugs.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-[var(--shadow-raised)] border border-[var(--color-bg-soft)] z-50 overflow-hidden">
                  {sugs.map((s, i) => (
                    <button key={i} onClick={() => { setCoords(s.coords); setLabel(s.displayName); setSugs([]); }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-soft)] border-b border-[var(--color-bg-soft)] last:border-0">
                      <i className="fa-solid fa-location-dot text-[var(--color-amber)] mt-0.5" />
                      <span className="text-sm font-semibold text-[var(--color-aubergine)]">{s.displayName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => coords && setStep(1)} disabled={!coords}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-50 mb-3"
              style={{ background: 'var(--color-amber)' }}>Weiter</button>
            <button onClick={async () => { setCurated(await tripsApi.curated().catch(() => [])); setStep(9); }}
              className="w-full py-3.5 rounded-2xl font-bold text-sm border-2 border-dashed border-[var(--color-lavender-lt)] text-[var(--color-lavender)] hover:border-[var(--color-amber)]">
              <i className="fa-solid fa-wand-magic-sparkles mr-2" />Nein — überrasch mich!
            </button>
          </div>
        )}

        {/* Überrasch mich: kuratierte Trips */}
        {step === 9 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-lavender)]">Unsere kuratierten Trips — übernimm einen und mach ihn zu deinem:</p>
            {curated.length === 0 && <p className="text-sm text-[var(--color-lavender)] text-center py-8">Noch keine kuratierten Trips.</p>}
            {curated.map(t => (
              <button key={t.id} onClick={() => navigate(`/trips/${t.id}`)}
                className="flex items-center gap-3 bg-white rounded-2xl p-3 shadow-[var(--shadow-card)] text-left">
                {t.hero && <img src={t.hero} alt="" className="w-16 h-16 rounded-xl object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-[var(--color-aubergine)]">{t.title}</p>
                  <p className="text-xs text-[var(--color-lavender)] truncate">{t.subtitle}</p>
                </div>
                <i className="fa-solid fa-chevron-right text-[var(--color-lavender-lt)]" />
              </button>
            ))}
          </div>
        )}

        {/* 2: Verkehrsmittel + Entfernung + Personen */}
        {step === 1 && (
          <div className={card}>
            <p className="text-sm font-bold text-[var(--color-aubergine)] mb-3">Wie wollt ihr reisen?</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {MOBILITY.map(m => (
                <button key={m.id} onClick={() => setTransport(m.id)}
                  className={`flex items-center gap-2.5 p-3 rounded-2xl border-2 text-left ${transport === m.id ? 'border-[var(--color-amber)] bg-[#FFF4EB]' : 'border-[var(--color-bg-soft)]'}`}>
                  <i className={`fa-solid ${m.icon} w-5 text-center`} style={{ color: transport === m.id ? 'var(--color-amber)' : 'var(--color-lavender)' }} />
                  <span className="font-semibold text-xs text-[var(--color-aubergine)]">{m.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-[var(--color-aubergine)]">Wie weit darf's weg sein?</p>
              <p className="text-sm font-bold text-[var(--color-amber)]">{maxKm} km</p>
            </div>
            <input type="range" min={10} max={400} step={10} value={maxKm}
              onChange={e => setMaxKm(Number(e.target.value))} className="map-radius w-full mb-5" />
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-[var(--color-aubergine)]">Für wie viele?</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPersons(p => Math.max(1, p - 1))} className="w-8 h-8 rounded-full bg-[var(--color-bg-soft)] font-bold text-[var(--color-aubergine)]">−</button>
                <span className="w-6 text-center font-bold text-[var(--color-aubergine)]">{persons}</span>
                <button onClick={() => setPersons(p => p + 1)} className="w-8 h-8 rounded-full bg-[var(--color-bg-soft)] font-bold text-[var(--color-aubergine)]">+</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              {COMPANIONS.map(cp => (
                <button key={cp} onClick={() => setCompanions(c => c.includes(cp) ? c.filter(x => x !== cp) : [...c, cp])}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${companions.includes(cp) ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]' : 'bg-white text-[var(--color-lavender)] border-[var(--color-bg-soft)]'}`}>
                  {cp}
                </button>
              ))}
            </div>
            <button onClick={() => { setSelected(new Set(inRange.slice(0, 6).map(x => x.p.id))); setStep(2); }}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-sm" style={{ background: 'var(--color-amber)' }}>
              Weiter zur Orte-Auswahl
            </button>
          </div>
        )}

        {/* 3: Merklisten-Auswahl */}
        {step === 2 && (
          <>
            <p className="text-sm text-[var(--color-lavender)] mb-3">
              Aus deiner Merkliste — passend zu <strong className="text-[var(--color-aubergine)]">{label}</strong> ({maxKm} km Umkreis), vorausgewählt:
            </p>
            <div className="flex flex-col gap-2 mb-3">
              {shown.map(({ p, dist }) => {
                const on = selected.has(p.id);
                return (
                  <button key={p.id}
                    onClick={() => setSelected(s => { const n = new Set(s); if (on) n.delete(p.id); else n.add(p.id); return n; })}
                    className={`flex items-center gap-3 rounded-2xl p-2.5 text-left border-2 transition-all ${on ? 'border-[var(--color-amber)] bg-[#FFF4EB]' : 'border-transparent bg-white shadow-[var(--shadow-card)]'}`}>
                    <i className={`fa-${on ? 'solid' : 'regular'} fa-square-check text-lg ${on ? 'text-[var(--color-amber)]' : 'text-[var(--color-lavender-lt)]'}`} />
                    <img src={p.hero} alt="" className="w-11 h-11 rounded-xl object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[var(--color-aubergine)] truncate">{p.name}</p>
                      <p className="text-xs text-[var(--color-lavender)] truncate">{p.region}</p>
                    </div>
                    {dist !== null && <span className="text-[10px] font-bold text-[var(--color-lavender)] bg-[var(--color-bg-soft)] px-2 py-1 rounded-full">{dist.toFixed(0)} km</span>}
                  </button>
                );
              })}
              {shown.length === 0 && <p className="text-sm text-[var(--color-lavender)] text-center py-6">Keine gemerkten Orte im Umkreis.</p>}
            </div>
            {!showAll && outRange.length > 0 && (
              <button onClick={() => setShowAll(true)} className="w-full text-center text-xs font-bold text-[var(--color-amber)] mb-4">
                Alle gemerkten Geheimtrips anzeigen ({saved.length})
              </button>
            )}
            <button onClick={() => createTrip([...selected])} disabled={busy || selected.size === 0}
              className="w-full py-4 rounded-2xl font-bold text-white text-sm shadow-[var(--shadow-amber)] disabled:opacity-50 mb-3"
              style={{ background: 'var(--color-amber)' }}>
              {busy ? 'Wird erstellt…' : `Trip erstellen (${selected.size} Orte)`}
            </button>
            <button onClick={() => createTrip([])} disabled={busy}
              className="w-full text-center text-xs text-[var(--color-lavender)]">
              Mit leerem Trip beginnen
            </button>
          </>
        )}
      </div>
    </div>
  );
}
