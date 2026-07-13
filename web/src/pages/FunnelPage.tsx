import { useState, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { StepLayout } from '../components/funnel/StepLayout.js';
import { useAppStore } from '../store/useAppStore.js';
import type { FunnelAnswers, WhenOption, BudgetOption, SocialOption, Transport } from '../types/index.js';
import { MOBILITY, VIBE_AXES } from '../types/index.js';
import { requestGpsPosition, reverseGeocode } from '../services/geoService.js';

const DEFAULT: FunnelAnswers = {
  when: null, location: '', transport: null,
  distanceMin: 60, budget: null,
  vibe: [50, 50, 50, 50],
  social: null, meetPeople: false,
};

// ─── Step components ─────────────────────────────────────────────────────────

function StepWhen({ answers, set }: { answers: FunnelAnswers; set: (a: Partial<FunnelAnswers>) => void }) {
  const navigate = useNavigate();
  const OPTIONS: { id: WhenOption; label: string; sub: string; icon: string }[] = [
    { id: 'jetzt',      label: 'Jetzt gleich',         sub: 'Ab sofort los',              icon: 'fa-bolt' },
    { id: 'morgen',     label: 'Morgen',                sub: 'Schon fast spontan',          icon: 'fa-sun' },
    { id: 'wochenende', label: 'Dieses Wochenende',     sub: 'Sa + So — geplant & easy',   icon: 'fa-calendar-week' },
    { id: 'irgendwann', label: 'Irgendwann',            sub: 'Ideen für später sammeln',   icon: 'fa-clock' },
  ];
  return (
    <StepLayout step={1} kicker="Frage 1 von 10" question={<>Wann soll's <em className="text-[var(--color-amber)] italic">losgehen?</em></>}
      onNext={() => navigate('/funnel/location')} nextDisabled={!answers.when} showPrev={false}>
      <div className="flex flex-col gap-3">
        {OPTIONS.map(o => (
          <button key={o.id} onClick={() => { set({ when: o.id }); }}
            className={`flex items-center gap-4 px-4 py-4 rounded-[var(--radius-card)] border-2 transition-all text-left ${
              answers.when === o.id
                ? 'border-[var(--color-aubergine)] bg-[var(--color-aubergine)] text-white'
                : 'border-[var(--color-bg-soft)] bg-white text-[var(--color-aubergine)]'
            }`}>
            <div className={`w-10 h-10 rounded-[var(--radius-icon)] flex items-center justify-center flex-shrink-0 ${
              answers.when === o.id ? 'bg-white/20' : 'bg-[var(--color-bg-soft)]'}`}>
              <i className={`fa-solid ${o.icon} ${answers.when === o.id ? 'text-white' : 'text-[var(--color-lavender)]'}`} />
            </div>
            <div>
              <div className="font-semibold text-sm">{o.label}</div>
              <div className={`text-xs ${answers.when === o.id ? 'text-white/70' : 'text-[var(--color-lavender)]'}`}>{o.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </StepLayout>
  );
}

function StepLocation({ answers, set }: { answers: FunnelAnswers; set: (a: Partial<FunnelAnswers>) => void }) {
  const navigate = useNavigate();
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError]     = useState('');

  async function handleGps() {
    setGpsLoading(true);
    setGpsError('');
    try {
      const coords = await requestGpsPosition();
      const geo    = await reverseGeocode(coords);
      set({ location: geo.displayName, coords });
    } catch (e: any) {
      setGpsError(e.message ?? 'GPS-Fehler');
    } finally {
      setGpsLoading(false);
    }
  }

  return (
    <StepLayout step={2} kicker="Frage 2 von 10"
      question={<>Wo geht's <em className="italic text-[var(--color-amber)]">los?</em></>}
      onNext={() => navigate('/funnel/transport')} nextDisabled={!answers.location.trim()}>
      <div>
        {/* GPS-Button */}
        <button
          onClick={handleGps}
          disabled={gpsLoading}
          className="w-full flex items-center justify-center gap-2 border-2 border-[var(--color-amber)] text-[var(--color-amber)] rounded-[var(--radius-input)] py-3 font-semibold text-sm mb-3 transition-colors hover:bg-[var(--color-amber)]/5 disabled:opacity-50"
        >
          {gpsLoading
            ? <><i className="fa-solid fa-circle-notch fa-spin" /> Standort wird ermittelt…</>
            : <><i className="fa-solid fa-location-crosshairs" /> Aktuellen Standort nutzen</>
          }
        </button>
        {gpsError && <p className="text-xs text-[var(--color-danger)] mb-2 text-center">{gpsError}</p>}

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-[var(--color-bg-soft)]" />
          <span className="text-xs text-[var(--color-lavender-lt)]">oder manuell eingeben</span>
          <div className="flex-1 h-px bg-[var(--color-bg-soft)]" />
        </div>

        <div className="relative">
          <i className="fa-solid fa-location-dot absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-lavender)]" />
          <input
            type="text" value={answers.location}
            onChange={e => set({ location: e.target.value })}
            placeholder="Stadt, Bahnhof oder Adresse"
            className="w-full pl-10 pr-4 py-3.5 rounded-[var(--radius-input)] border-2 border-[var(--color-bg-soft)] bg-white text-[var(--color-aubergine)] text-sm outline-none focus:border-[var(--color-amber)] transition-colors"
          />
        </div>

        {/* Quick options */}
        <div className="flex flex-wrap gap-2 mt-4">
          {['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt'].map(city => (
            <button key={city} onClick={() => set({ location: city })}
              className="text-xs bg-white border border-[var(--color-bg-soft)] rounded-full px-3 py-1.5 text-[var(--color-aubergine)] font-medium shadow-[var(--shadow-card)] active:scale-95 transition-transform">
              {city}
            </button>
          ))}
        </div>
      </div>
    </StepLayout>
  );
}

function StepTransport({ answers, set }: { answers: FunnelAnswers; set: (a: Partial<FunnelAnswers>) => void }) {
  const navigate = useNavigate();
  return (
    <StepLayout step={3} kicker="Frage 3 von 10"
      question={<>Wie bist <em className="italic text-[var(--color-amber)]">du unterwegs?</em></>}
      onNext={() => navigate('/funnel/distance')} nextDisabled={!answers.transport}>
      <div className="flex flex-col gap-3">
        {MOBILITY.map(m => (
          <button key={m.id} onClick={() => set({ transport: m.id as Transport })}
            className={`flex items-center gap-4 px-4 py-3.5 rounded-[var(--radius-card)] border-2 transition-all text-left ${
              answers.transport === m.id
                ? 'border-[var(--color-aubergine)] bg-[var(--color-aubergine)] text-white'
                : 'border-[var(--color-bg-soft)] bg-white text-[var(--color-aubergine)]'
            }`}>
            <div className={`w-10 h-10 rounded-[var(--radius-icon)] flex items-center justify-center flex-shrink-0 ${
              answers.transport === m.id ? 'bg-white/20' : 'bg-[var(--color-bg-soft)]'}`}>
              <i className={`fa-solid ${m.icon} ${answers.transport === m.id ? 'text-white' : 'text-[var(--color-lavender)]'}`} />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">{m.label}</div>
              {m.sublabel && (
                <div className={`text-xs ${answers.transport === m.id ? 'text-white/70' : 'text-[var(--color-lavender)]'}`}>{m.sublabel}</div>
              )}
            </div>
            {m.co2free && (
              <span className="text-[10px] font-bold bg-[#d4edda] text-[var(--color-success-dark)] px-2 py-0.5 rounded-full flex-shrink-0">
                Klimaneutral
              </span>
            )}
          </button>
        ))}
      </div>
    </StepLayout>
  );
}

function StepDistance({ answers, set }: { answers: FunnelAnswers; set: (a: Partial<FunnelAnswers>) => void }) {
  const navigate = useNavigate();
  const min = answers.distanceMin;
  const label = min < 60 ? `${min} Minuten` : `${(min / 60).toFixed(1).replace('.0', '')} Std`;
  return (
    <StepLayout step={4} kicker="Frage 4 von 10"
      question={<>Wie weit <em className="italic text-[var(--color-amber)]">darf's sein?</em></>}
      onNext={() => navigate('/funnel/budget')}>
      <div>
        <div className="text-center mb-8">
          <div className="font-display font-bold text-5xl text-[var(--color-aubergine)] mb-1">{label}</div>
          <p className="text-sm text-[var(--color-lavender)]">vom Startpunkt entfernt</p>
        </div>
        <input type="range" min="10" max="300" step="10"
          value={min} onChange={e => set({ distanceMin: Number(e.target.value) })}
          className="w-full accent-[#F99039] h-2 cursor-pointer"
          style={{ accentColor: 'var(--color-amber)' }}
        />
        <div className="flex justify-between text-xs text-[var(--color-lavender-lt)] mt-1">
          <span>10 Min</span>
          <span>5 Std</span>
        </div>
      </div>
    </StepLayout>
  );
}

function StepBudget({ answers, set }: { answers: FunnelAnswers; set: (a: Partial<FunnelAnswers>) => void }) {
  const navigate = useNavigate();
  const OPTIONS: { id: BudgetOption; label: string; sub: string; icon: string }[] = [
    { id: 'kostenlos', label: 'Kostenlos',  sub: 'Am besten umsonst',         icon: 'fa-hand-holding-heart' },
    { id: 'günstig',   label: 'Günstig',    sub: 'Bis ca. 15 €',              icon: 'fa-coins' },
    { id: 'moderat',   label: 'Moderat',    sub: '15 – 40 € kein Problem',    icon: 'fa-wallet' },
    { id: 'egal',      label: 'Egal',       sub: 'Hauptsache es lohnt sich',  icon: 'fa-gem' },
  ];
  return (
    <StepLayout step={5} kicker="Frage 5 von 10"
      question={<>Was darf's <em className="italic text-[var(--color-amber)]">kosten?</em></>}
      onNext={() => navigate('/funnel/vibe/1')} nextDisabled={!answers.budget}>
      <div className="grid grid-cols-2 gap-3">
        {OPTIONS.map(o => (
          <button key={o.id} onClick={() => set({ budget: o.id as BudgetOption })}
            className={`flex flex-col items-start gap-2 p-4 rounded-[var(--radius-card)] border-2 transition-all text-left ${
              answers.budget === o.id
                ? 'border-[var(--color-aubergine)] bg-[var(--color-aubergine)] text-white'
                : 'border-[var(--color-bg-soft)] bg-white text-[var(--color-aubergine)]'
            }`}>
            <i className={`fa-solid ${o.icon} text-lg ${answers.budget === o.id ? 'text-[var(--color-amber)]' : 'text-[var(--color-lavender)]'}`} />
            <div>
              <div className="font-bold text-sm">{o.label}</div>
              <div className={`text-[11px] ${answers.budget === o.id ? 'text-white/70' : 'text-[var(--color-lavender)]'}`}>{o.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </StepLayout>
  );
}

// Vibe images — use beautiful Unsplash photos for each zone transition
const VIBE_IMAGES: Record<string, string[]> = {
  'stadtNatur': [
    'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&auto=format&fit=crop&q=70',  // Stadt
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&auto=format&fit=crop&q=70',  // Natur
  ],
  'adrenalinKultur': [
    'https://images.unsplash.com/photo-1527522883525-97119bfce82d?w=600&auto=format&fit=crop&q=70',  // Adrenalin
    'https://images.unsplash.com/photo-1599839619722-39751411ea63?w=600&auto=format&fit=crop&q=70',  // Kultur
  ],
  'genussBewegung': [
    'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=600&auto=format&fit=crop&q=70',  // Genuss
    'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&auto=format&fit=crop&q=70',     // Bewegung
  ],
  'bekanntGeheim': [
    'https://images.unsplash.com/photo-1569152811536-fb47aced8409?w=600&auto=format&fit=crop&q=70',  // Bekannt
    'https://images.unsplash.com/photo-1518176258769-f227c798150e?w=600&auto=format&fit=crop&q=70',  // Geheim
  ],
};

function StepVibe({ answers, set, vibeIdx }: { answers: FunnelAnswers; set: (a: Partial<FunnelAnswers>) => void; vibeIdx: number }) {
  const navigate = useNavigate();
  const axis = VIBE_AXES[vibeIdx];
  const val = answers.vibe[vibeIdx];
  const imgs = VIBE_IMAGES[axis.key];
  // blend: 0 = left image, 100 = right image
  const rightAlpha = val / 100;
  const activeLabel = val < 40 ? `„${axis.left}"` : val > 60 ? `„${axis.right}"` : 'Beides';

  const updateVibe = (v: number) => {
    const next = [...answers.vibe] as [number, number, number, number];
    next[vibeIdx] = v;
    set({ vibe: next });
  };

  const step = vibeIdx + 1;
  const nextPath = vibeIdx < 3 ? `/funnel/vibe/${vibeIdx + 2}` : '/funnel/social';

  return (
    <StepLayout
      step={5 + step} kicker={`Frage ${5 + step} von 10`}
      question={<>Worauf hast du <em className="italic text-[var(--color-amber)]">Lust?</em></>}
      onNext={() => navigate(nextPath)}>
      {/* Image zone */}
      <div className="relative rounded-2xl overflow-hidden aspect-[4/3] mb-6">
        <img src={imgs[0]} alt={axis.left}  className="absolute inset-0 w-full h-full object-cover" />
        <img src={imgs[1]} alt={axis.right} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-100"
          style={{ opacity: rightAlpha }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-4">
          <div className="text-white/70 text-xs">{axis.left} oder {axis.right}?</div>
          <div className="font-display italic text-white text-xl font-bold">{activeLabel}</div>
        </div>
      </div>

      {/* Slider */}
      <div className="flex items-center justify-between text-sm font-medium text-[var(--color-aubergine)] mb-2">
        <span>{axis.left}</span>
        <span>{axis.right}</span>
      </div>
      <input type="range" min="0" max="100" step="1"
        value={val} onChange={e => updateVibe(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: 'var(--color-amber)' }}
      />
    </StepLayout>
  );
}

function StepSocial({ answers, set }: { answers: FunnelAnswers; set: (a: Partial<FunnelAnswers>) => void }) {
  const navigate = useNavigate();
  const OPTIONS: { id: SocialOption; label: string; sub: string; icon: string }[] = [
    { id: 'allein',      label: 'Ich bin alleine',          sub: 'Me, myself & I',                icon: 'fa-person' },
    { id: 'freunde',     label: 'Mit Freunden',             sub: 'Die ganze Crew dabei',          icon: 'fa-users' },
    { id: 'date',        label: 'Date',                     sub: 'Zu zweit auf Entdeckungsreise', icon: 'fa-heart' },
    { id: 'neue-leute',  label: 'Neue Leute kennenlernen',  sub: 'Opt-in, gegenseitig & anonym',  icon: 'fa-user-plus' },
  ];
  return (
    <StepLayout step={10} kicker="Frage 10 von 10"
      question={<>Mit wem <em className="italic text-[var(--color-amber)]">bist du unterwegs?</em></>}
      nextLabel="Geheimtrips finden"
      onNext={() => navigate('/funnel/loading')} nextDisabled={!answers.social}>
      <div className="flex flex-col gap-3">
        {OPTIONS.map(o => (
          <button key={o.id} onClick={() => set({ social: o.id as SocialOption, meetPeople: o.id === 'neue-leute' })}
            className={`flex items-center gap-4 px-4 py-3.5 rounded-[var(--radius-card)] border-2 transition-all text-left ${
              answers.social === o.id
                ? 'border-[var(--color-aubergine)] bg-[var(--color-aubergine)] text-white'
                : 'border-[var(--color-bg-soft)] bg-white text-[var(--color-aubergine)]'
            }`}>
            <div className={`w-10 h-10 rounded-[var(--radius-icon)] flex items-center justify-center flex-shrink-0 ${
              answers.social === o.id ? 'bg-white/20' : 'bg-[var(--color-bg-soft)]'}`}>
              <i className={`fa-solid ${o.icon} ${answers.social === o.id ? 'text-white' : 'text-[var(--color-lavender)]'}`} />
            </div>
            <div>
              <div className="font-semibold text-sm">{o.label}</div>
              <div className={`text-xs ${answers.social === o.id ? 'text-white/70' : 'text-[var(--color-lavender)]'}`}>{o.sub}</div>
            </div>
          </button>
        ))}
        {answers.social === 'neue-leute' && (
          <p className="text-xs text-[var(--color-lavender)] px-1 bg-[var(--color-bg-soft)] rounded-xl p-3">
            Du siehst Reisende, die ähnliche Orte am selben Tag besuchen wollen. Nur wenn beide Seiten Opt-in gegeben haben.
          </p>
        )}
      </div>
    </StepLayout>
  );
}

function StepLoading() {
  const navigate = useNavigate();
  const { setFunnelAnswers } = useAppStore();

  // Simulate loading, then go to results
  useState(() => {
    const t = setTimeout(() => navigate('/results', { replace: true }), 2000);
    return () => clearTimeout(t);
  });

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[var(--color-aubergine)] px-8 text-center gap-6">
      <div className="w-16 h-16 rounded-2xl bg-[var(--color-amber)]/20 flex items-center justify-center">
        <i className="fa-solid fa-compass text-[var(--color-amber)] text-3xl fa-spin" />
      </div>
      <div>
        <h2 className="font-display font-bold text-white text-2xl mb-2">Auf der Suche…</h2>
        <p className="text-white/60 text-sm">Wir finden die besten Geheimtrips für dich.</p>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-2 h-2 rounded-full bg-[var(--color-amber)] animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Funnel page ─────────────────────────────────────────────────────────

export function FunnelPage() {
  const [answers, setAnswers] = useState<FunnelAnswers>(DEFAULT);
  const { setFunnelAnswers } = useAppStore();

  const set = useCallback((partial: Partial<FunnelAnswers>) => {
    setAnswers(prev => {
      const next = { ...prev, ...partial };
      setFunnelAnswers(next);
      return next;
    });
  }, [setFunnelAnswers]);

  const props = { answers, set };

  return (
    <Routes>
      <Route index             element={<StepWhen {...props} />} />
      <Route path="when"       element={<StepWhen {...props} />} />
      <Route path="location"   element={<StepLocation {...props} />} />
      <Route path="transport"  element={<StepTransport {...props} />} />
      <Route path="distance"   element={<StepDistance {...props} />} />
      <Route path="budget"     element={<StepBudget {...props} />} />
      <Route path="vibe/:idx"  element={<VibeWrapper {...props} />} />
      <Route path="social"     element={<StepSocial {...props} />} />
      <Route path="loading"    element={<StepLoading />} />
    </Routes>
  );
}

function VibeWrapper(props: { answers: FunnelAnswers; set: (a: Partial<FunnelAnswers>) => void }) {
  const { idx } = useParams<{ idx: string }>();
  const vibeIdx = Math.max(0, Math.min(3, parseInt(idx ?? '1') - 1));
  return <StepVibe {...props} vibeIdx={vibeIdx} />;
}
