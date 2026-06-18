import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { useAppStore } from '../store/useAppStore.js';
import { tripsApi } from '../services/api.js';
import { geocodeSuggestions } from '../services/geoService.js';
import type { GeoLocation, Coords } from '../services/geoService.js';

// Vereinfachte Trip-Erstellung: Orte aus der eigenen Sammlung wählen, optionaler
// Startpunkt — keine Entfernungs-/Routen- oder Personen-Abfrage. Personenzahl &
// Kosten passt man später im Trip an; Freund:innen lädt man danach im Trip ein.
export function TripCreatePage() {
  const navigate = useNavigate();
  const { places, savedIds, loadPlaces } = useAppStore();
  const [title, setTitle]           = useState('');
  const [startLabel, setStartLabel] = useState('');
  const [startCoords, setStartCoords] = useState<Coords | null>(null);
  const [sugs, setSugs]             = useState<GeoLocation[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [q, setQ]                   = useState('');
  const [busy, setBusy]             = useState(false);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadPlaces(); }, []); // eslint-disable-line

  const saved = places.filter(p => savedIds.has(p.id));
  const filtered = q.trim()
    ? saved.filter(p => `${p.name} ${p.region}`.toLowerCase().includes(q.toLowerCase()))
    : saved;

  function searchStart(v: string) {
    setStartLabel(v); setStartCoords(null);
    if (geoTimer.current) clearTimeout(geoTimer.current);
    if (v.trim().length >= 3) geoTimer.current = setTimeout(async () => setSugs(await geocodeSuggestions(v)), 400);
    else setSugs([]);
  }
  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function create() {
    if (!title.trim() || selected.size === 0) return;
    setBusy(true);
    try {
      const t = await tripsApi.create({ title: title.trim(), placeIds: [...selected] });
      if (startCoords) {
        await tripsApi.update(t.id, { startLabel, startLat: startCoords.lat, startLng: startCoords.lng }).catch(() => {});
      }
      navigate(`/trips/${t.id}`);
    } catch (e) { alert((e as Error).message ?? 'Fehler'); setBusy(false); }
  }

  return (
    <AppShell showBack title="Neuer Trip">
      <div className="px-6 pt-5 max-w-2xl mx-auto pb-28">
        {/* Titel */}
        <label className="block text-sm font-bold text-[var(--color-aubergine)] mb-1.5">Wie soll dein Ausflug heißen?</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. Wochenende im Harz"
          className="w-full border-2 border-[var(--color-bg-soft)] rounded-2xl px-4 py-3 text-sm outline-none focus:border-[var(--color-amber)] transition-colors mb-5" />

        {/* Startpunkt (optional) */}
        <label className="block text-sm font-bold text-[var(--color-aubergine)] mb-1.5">
          Startpunkt <span className="font-normal text-[var(--color-lavender)]">(optional)</span>
        </label>
        <div className="relative mb-5">
          <div className="flex items-center gap-2.5 border-2 border-[var(--color-bg-soft)] rounded-2xl px-4 py-3 focus-within:border-[var(--color-amber)] transition-colors">
            <i className={`fa-solid ${startCoords ? 'fa-circle-check text-[#2e7d32]' : 'fa-location-crosshairs text-[var(--color-lavender)]'} text-sm`} />
            <input value={startLabel} onChange={e => searchStart(e.target.value)} placeholder="z. B. dein Zuhause oder eine Stadt"
              className="flex-1 min-w-0 outline-none text-sm bg-transparent text-[var(--color-aubergine)]" />
            {startLabel && (
              <button onClick={() => { setStartLabel(''); setStartCoords(null); setSugs([]); }} className="text-[var(--color-lavender)] flex-shrink-0">
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </div>
          {sugs.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-[var(--shadow-raised)] border border-[var(--color-bg-soft)] z-50 overflow-hidden">
              {sugs.map((s, i) => (
                <button key={i} onClick={() => { setStartCoords(s.coords); setStartLabel(s.displayName); setSugs([]); }}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-soft)] border-b border-[var(--color-bg-soft)] last:border-0">
                  <i className="fa-solid fa-location-dot text-[var(--color-amber)] mt-0.5" />
                  <span className="text-sm font-semibold text-[var(--color-aubergine)]">{s.displayName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Orte aus der Sammlung */}
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-bold text-[var(--color-aubergine)]">Orte aus deiner Sammlung</label>
          <span className="text-xs font-semibold text-[var(--color-amber)]">{selected.size} gewählt</span>
        </div>

        {saved.length === 0 ? (
          <div className="text-center py-10 text-[var(--color-lavender)] text-sm">
            <i className="fa-solid fa-bookmark text-3xl mb-2 block opacity-30" />
            Du hast noch keine Orte gemerkt. Merk dir zuerst ein paar Orte beim Entdecken.
          </div>
        ) : (
          <>
            {saved.length > 6 && (
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="In deiner Sammlung suchen…"
                className="w-full border-2 border-[var(--color-bg-soft)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-amber)] mb-3" />
            )}
            <div className="flex flex-col gap-2">
              {filtered.map(p => {
                const on = selected.has(p.id);
                return (
                  <button key={p.id} onClick={() => toggle(p.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-2xl border-2 text-left transition-colors ${
                      on ? 'border-[var(--color-amber)] bg-[var(--color-amber)]/5' : 'border-[var(--color-bg-soft)] bg-white'}`}>
                    {p.hero
                      ? <img src={p.hero} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                      : <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-soft)] flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[var(--color-aubergine)] truncate">{p.name}</div>
                      <div className="text-xs text-[var(--color-lavender)] truncate">{p.region}</div>
                    </div>
                    <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      on ? 'border-[var(--color-amber)] bg-[var(--color-amber)] text-white' : 'border-[var(--color-bg-soft)]'}`}>
                      {on && <i className="fa-solid fa-check text-[10px]" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Erstellen */}
        <button onClick={create} disabled={busy || !title.trim() || selected.size === 0}
          className="w-full mt-6 bg-[var(--color-amber)] text-white font-bold py-3.5 rounded-2xl shadow-[var(--shadow-amber)] disabled:opacity-50 text-sm transition-opacity">
          {busy ? 'Wird erstellt…' : `Trip erstellen${selected.size ? ` (${selected.size} Orte)` : ''}`}
        </button>
        <p className="text-center text-[11px] text-[var(--color-lavender-lt)] mt-2">
          Personenzahl & Kosten passt du später im Trip an · Freund:innen lädst du danach im Trip ein.
        </p>
      </div>
    </AppShell>
  );
}
