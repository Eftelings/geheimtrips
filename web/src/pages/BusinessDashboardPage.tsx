import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { businessApi, type BusinessProfile, type PriceEntry, type HourSlot } from '../services/api.js';
import type { Place } from '../types/index.js';

// ─── Month labels ─────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// ─── Price icon map ───────────────────────────────────────────────────────────
const PRICE_ICONS: [RegExp, string][] = [
  [/geburtstag/i,         'fa-cake-candles'],
  [/kinder|kind|jugend/i, 'fa-child'       ],
  [/senior|rentner/i,     'fa-person-cane' ],
  [/familie/i,            'fa-people-roof' ],
  [/ermäßig|student/i,   'fa-id-card'     ],
  [/hund/i,               'fa-dog'         ],
  [/erwachsen/i,          'fa-person'      ],
];
function priceIcon(label: string) {
  for (const [re, icon] of PRICE_ICONS) if (re.test(label)) return icon;
  return 'fa-ticket';
}

// ─── Prices Editor ────────────────────────────────────────────────────────────

function PricesEditor({
  prices,
  onChange,
}: {
  prices: PriceEntry[];
  onChange: (p: PriceEntry[]) => void;
}) {
  const add = () => onChange([...prices, { label: '', amount: '', from: false }]);
  const remove = (i: number) => onChange(prices.filter((_, j) => j !== i));
  const update = (i: number, patch: Partial<PriceEntry>) => {
    const next = [...prices];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {prices.map((p, i) => (
        <div key={i} className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: '#F1ECF4' }}>
          <div className="flex items-center gap-2">
            <i className={`fa-solid ${priceIcon(p.label)} text-[var(--color-lavender)] w-4 text-sm`} />
            <input
              value={p.label}
              onChange={e => update(i, { label: e.target.value })}
              placeholder="z. B. Erwachsene"
              className="flex-1 bg-white rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
              style={{ color: '#34254c' }}
            />
            <button onClick={() => remove(i)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white transition-colors"
              style={{ color: '#c96442' }}>
              <i className="fa-solid fa-trash-can text-xs" />
            </button>
          </div>
          <div className="flex items-center gap-2 pl-6">
            <input
              value={p.amount}
              onChange={e => update(i, { amount: e.target.value })}
              placeholder="z. B. 17 € oder kostenlos"
              className="flex-1 bg-white rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
              style={{ color: '#34254c' }}
            />
            <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-lavender)] cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={!!p.from}
                onChange={e => update(i, { from: e.target.checked })}
                className="accent-[var(--color-aubergine)]"
              />
              ab-Preis
            </label>
          </div>
          <div className="pl-6">
            <input
              value={p.note ?? ''}
              onChange={e => update(i, { note: e.target.value || undefined })}
              placeholder="Hinweis (optional) — z. B. je nach Saison"
              className="w-full bg-white rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
              style={{ color: '#34254c' }}
            />
          </div>
        </div>
      ))}
      <button onClick={add}
        className="flex items-center gap-2 text-sm font-semibold py-2.5 rounded-xl border-2 border-dashed transition-colors hover:border-[var(--color-aubergine)] hover:text-[var(--color-aubergine)]"
        style={{ borderColor: '#D1C7DC', color: '#71587A', justifyContent: 'center' }}>
        <i className="fa-solid fa-plus" />
        Preiskategorie hinzufügen
      </button>
    </div>
  );
}

// ─── Hours Editor ─────────────────────────────────────────────────────────────

const MONTH_NUMS = [1,2,3,4,5,6,7,8,9,10,11,12];

function HoursEditor({
  schedule,
  onChange,
}: {
  schedule: HourSlot[];
  onChange: (s: HourSlot[]) => void;
}) {
  const add = () => onChange([...schedule, { months: [], open: '09:00', close: '18:00' }]);
  const remove = (i: number) => onChange(schedule.filter((_, j) => j !== i));
  const update = (i: number, patch: Partial<HourSlot>) => {
    const next = [...schedule];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const toggleMonth = (slotIdx: number, m: number) => {
    const s = schedule[slotIdx];
    const months = s.months.includes(m) ? s.months.filter(x => x !== m) : [...s.months, m].sort((a,b) => a-b);
    update(slotIdx, { months });
  };

  return (
    <div className="flex flex-col gap-4">
      {schedule.map((slot, i) => (
        <div key={i} className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#F1ECF4' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[var(--color-aubergine)]">Zeitraum {i + 1}</p>
            <button onClick={() => remove(i)} className="text-xs text-[var(--color-lavender-lt)] hover:text-[#c96442] transition-colors">
              <i className="fa-solid fa-trash-can" />
            </button>
          </div>

          {/* Month toggles */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-lavender-lt)] mb-1.5">Monate</p>
            <div className="flex flex-wrap gap-1">
              {MONTH_NUMS.map(m => (
                <button key={m} onClick={() => toggleMonth(i, m)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all border ${slot.months.includes(m) ? 'bg-[var(--color-aubergine)] text-white border-[var(--color-aubergine)]' : 'bg-white text-[var(--color-lavender)] border-[#e5dcea] hover:border-[var(--color-aubergine)]'}`}>
                  {MONTHS[m - 1]}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-lavender-lt)]">Öffnet</label>
              <input type="time" value={slot.open} onChange={e => update(i, { open: e.target.value })}
                className="mt-1 w-full bg-white rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
                style={{ color: '#34254c' }} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-lavender-lt)]">Schließt</label>
              <input type="time" value={slot.close} onChange={e => update(i, { close: e.target.value })}
                className="mt-1 w-full bg-white rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
                style={{ color: '#34254c' }} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-lavender-lt)]">Letzter Einlass</label>
              <input type="time" value={slot.lastEntry ?? ''} onChange={e => update(i, { lastEntry: e.target.value || undefined })}
                className="mt-1 w-full bg-white rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
                style={{ color: '#34254c' }} />
            </div>
          </div>
        </div>
      ))}
      <button onClick={add}
        className="flex items-center gap-2 text-sm font-semibold py-2.5 rounded-xl border-2 border-dashed transition-colors hover:border-[var(--color-aubergine)] hover:text-[var(--color-aubergine)]"
        style={{ borderColor: '#D1C7DC', color: '#71587A', justifyContent: 'center' }}>
        <i className="fa-solid fa-plus" />
        Zeitraum hinzufügen
      </button>
    </div>
  );
}

// ─── Place editor card ────────────────────────────────────────────────────────

function PlaceEditor({ place }: { place: Place }) {
  const attrs = place.attributes as Record<string, unknown>;
  const [website, setWebsite]         = useState(typeof attrs.website === 'string' ? attrs.website : '');
  const [hoursUrl, setHoursUrl]       = useState(typeof attrs.hoursUrl === 'string' ? attrs.hoursUrl : '');
  const [pricesUrl, setPricesUrl]     = useState(typeof attrs.pricesUrl === 'string' ? attrs.pricesUrl : '');
  const [prices, setPrices]           = useState<PriceEntry[]>(Array.isArray(attrs.prices) ? attrs.prices as PriceEntry[] : []);
  const [schedule, setSchedule]       = useState<HourSlot[]>(Array.isArray(attrs.hoursSchedule) ? attrs.hoursSchedule as HourSlot[] : []);
  const [specialInfo, setSpecialInfo] = useState<string[]>(Array.isArray(attrs.specialInfo) ? attrs.specialInfo as string[] : []);
  const [newHint, setNewHint]         = useState('');

  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await businessApi.updateAttributes(place.id, {
        website: website || null,
        hoursSchedule: schedule.length ? schedule : null,
        hoursUrl: hoursUrl || null,
        prices: prices.length ? prices : null,
        pricesUrl: pricesUrl || null,
        specialInfo: specialInfo.length ? specialInfo : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-3xl overflow-hidden" style={{ background: '#F1ECF4' }}>
      {/* Header */}
      <button className="w-full flex items-center gap-4 p-5 text-left" onClick={() => setExpanded(e => !e)}>
        <img src={place.hero} alt={place.name} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-[var(--color-aubergine)] truncate">{place.name}</p>
          <p className="text-xs text-[var(--color-lavender)] truncate">{place.region}</p>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1"
            style={{ background: '#e8f5e9', color: '#2e7d32' }}>
            <i className="fa-solid fa-circle-check text-[9px]" />
            Offiziell verwaltet
          </span>
        </div>
        <i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'} text-[var(--color-lavender)] flex-shrink-0`} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-6 border-t" style={{ borderColor: '#D1C7DC' }}>

          {/* Website */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2 mt-4">Offizielle Website</label>
            <input value={website} onChange={e => setWebsite(e.target.value)} type="url"
              placeholder="https://www.example.de"
              className="w-full bg-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
              style={{ color: '#34254c' }} />
          </div>

          {/* Öffnungszeiten */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)]">Öffnungszeiten</label>
            </div>
            <HoursEditor schedule={schedule} onChange={setSchedule} />
            <input value={hoursUrl} onChange={e => setHoursUrl(e.target.value)} type="url"
              placeholder="URL zur vollständigen Öffnungszeitenübersicht"
              className="mt-3 w-full bg-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
              style={{ color: '#34254c' }} />
          </div>

          {/* Preise */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)]">Eintrittspreis</label>
            </div>
            <PricesEditor prices={prices} onChange={setPrices} />
            <input value={pricesUrl} onChange={e => setPricesUrl(e.target.value)} type="url"
              placeholder="URL zur offiziellen Preisübersicht"
              className="mt-3 w-full bg-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
              style={{ color: '#34254c' }} />
          </div>

          {/* Hinweise */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2">Besondere Hinweise</label>
            <div className="flex flex-col gap-2 mb-2">
              {specialInfo.map((info, i) => (
                <div key={i} className="flex items-center gap-2 bg-white rounded-xl px-4 py-2.5">
                  <i className="fa-solid fa-circle-info text-[var(--color-lavender)] text-sm flex-shrink-0" />
                  <span className="flex-1 text-sm" style={{ color: '#34254c' }}>{info}</span>
                  <button onClick={() => setSpecialInfo(sp => sp.filter((_, j) => j !== i))}
                    className="text-[var(--color-lavender-lt)] hover:text-[#c96442] transition-colors">
                    <i className="fa-solid fa-xmark text-xs" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newHint} onChange={e => setNewHint(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newHint.trim()) { setSpecialInfo(sp => [...sp, newHint.trim()]); setNewHint(''); } }}
                placeholder="Hinweis eingeben und Enter drücken"
                className="flex-1 bg-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-aubergine)]"
                style={{ color: '#34254c' }} />
              <button onClick={() => { if (newHint.trim()) { setSpecialInfo(sp => [...sp, newHint.trim()]); setNewHint(''); } }}
                className="px-4 rounded-xl text-white font-bold text-sm transition-all hover:brightness-110"
                style={{ background: 'var(--color-lavender)' }}>
                <i className="fa-solid fa-plus" />
              </button>
            </div>
          </div>

          {/* Save */}
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
            style={{ background: saved ? '#2e7d32' : 'var(--color-aubergine)' }}>
            {saving
              ? <i className="fa-solid fa-circle-notch fa-spin" />
              : saved
                ? <><i className="fa-solid fa-check mr-1.5" />Gespeichert!</>
                : <><i className="fa-solid fa-floppy-disk mr-1.5" />Änderungen speichern</>
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BusinessDashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile]       = useState<BusinessProfile | null>(null);
  const [managedPlaces, setManaged] = useState<Place[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    businessApi.getProfile().then(({ profile: p, managedPlaces: mp }) => {
      setProfile(p);
      setManaged(mp);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <AppShell showBack title="Business-Portal">
      <div className="max-w-2xl mx-auto px-4 py-8 pb-24">

        {/* Header */}
        <div className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-lavender)] mb-1">Geheimtrips.de</p>
          <h1 className="font-display font-bold text-3xl text-[var(--color-aubergine)] leading-tight">Business-Portal</h1>
          <p className="text-sm text-[var(--color-lavender)] mt-1">Verwalte Öffnungszeiten, Preise und Informationen für deine Orte.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-[var(--color-lavender)]" />
          </div>
        ) : !profile ? (
          /* No profile yet */
          <div className="rounded-3xl p-8 text-center" style={{ background: '#F1ECF4' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'white' }}>
              <i className="fa-solid fa-building text-2xl text-[var(--color-lavender)]" />
            </div>
            <h2 className="font-display font-bold text-[var(--color-aubergine)] text-xl mb-2">Kein Business-Zugang</h2>
            <p className="text-sm text-[var(--color-lavender)] mb-6 max-w-sm mx-auto">
              Du hast noch keinen verifizierten Betreiber-Zugang. Öffne die Detailseite deines Ortes und klicke auf „Bist du der Betreiber?".
            </p>
            <button onClick={() => navigate('/')}
              className="px-6 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110"
              style={{ background: 'var(--color-aubergine)' }}>
              Zur Ortsuche
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Profile info */}
            <div className="rounded-3xl p-5" style={{ background: '#F1ECF4' }}>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'white' }}>
                  <i className="fa-solid fa-building text-[var(--color-lavender)]" />
                </div>
                <div>
                  <p className="font-bold text-[var(--color-aubergine)]">{profile.companyName}</p>
                  <p className="text-xs text-[var(--color-lavender)]">{profile.companyEmail}</p>
                </div>
                {profile.isVerified && (
                  <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold"
                    style={{ background: '#e8f5e9', color: '#2e7d32' }}>
                    <i className="fa-solid fa-circle-check text-[9px]" />
                    Verifiziert
                  </span>
                )}
              </div>
            </div>

            {/* Managed places */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-lavender)] mb-3">
                Deine Orte ({managedPlaces.length})
              </p>
              {managedPlaces.length === 0 ? (
                <div className="rounded-3xl p-6 text-center" style={{ background: '#F1ECF4' }}>
                  <p className="text-sm text-[var(--color-lavender)]">Noch keine Orte zugewiesen.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {managedPlaces.map(place => (
                    <PlaceEditor key={place.id} place={place} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
