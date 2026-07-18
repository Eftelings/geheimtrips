import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { discoverApi } from '../services/api.js';
import { AvatarUpload } from '../components/ui/AvatarUpload.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { MOBILITY } from '../types/index.js';
import type { Transport } from '../types/index.js';

const COMPANIONS = [
  { id: 'allein',   label: 'Allein',           icon: 'fa-person' },
  { id: 'partner',  label: 'Zu zweit / Date',  icon: 'fa-heart' },
  { id: 'freunde',  label: 'Mit Freunden',     icon: 'fa-users' },
  { id: 'familie',  label: 'Familie & Kinder', icon: 'fa-children' },
];

const GENDERS = ['Weiblich', 'Männlich', 'Divers', 'Keine Angabe'];
const DEFAULT_YEAR = 2000;

export function OnboardingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editMode = params.get('edit') === '1';
  const { user, updateUser } = useAuthStore();

  const [step, setStep] = useState(0);
  const [transports, setTransports] = useState<Transport[]>([]);      // Mehrfachauswahl
  const [companions, setCompanions] = useState<string[]>([]);
  const [meetPeople, setMeetPeople] = useState(false);
  const [locationConsent, setLocationConsent] = useState(true);       // standardmäßig an
  const [gender, setGender] = useState<string | null>(null);
  const [birthYear, setBirthYear] = useState<number>(DEFAULT_YEAR);
  const [saving, setSaving] = useState(false);

  // Bestehende Angaben laden (Profil ist jederzeit anpassbar)
  useEffect(() => {
    if (user) setMeetPeople(!!user.meetPeopleEnabled);
    discoverApi.prefs().then(p => {
      if (!p.exists) return;
      if (p.transports?.length) setTransports(p.transports as Transport[]);
      else if (p.transport) setTransports([p.transport as Transport]);
      if (p.companions) setCompanions(p.companions);
      if (p.locationConsent !== undefined) setLocationConsent(p.locationConsent);
      if (p.gender) setGender(p.gender);
      if (p.birthYear) setBirthYear(p.birthYear);
    }).catch(() => {});
  }, [user]);

  // Standort-Einwilligung umschalten → Browser-Prompt direkt auslösen, wenn aktiviert
  function toggleLocation(next: boolean) {
    setLocationConsent(next);
    if (next) navigator.geolocation?.getCurrentPosition(() => {}, () => {}, { timeout: 8000 });
  }

  const steps = [
    { title: 'Wie bist du meistens unterwegs?', sub: 'Mehrfachauswahl möglich — damit wir wissen, was für dich erreichbar ist.' },
    { title: 'Mit wem bist du unterwegs?',      sub: 'Mehrfachauswahl möglich — das hilft uns bei den Vorschlägen.' },
    { title: 'Dürfen wir wissen, wo du bist?',  sub: 'Nur um Orte in deiner Nähe zu finden — nie für etwas anderes.' },
    { title: 'Fast geschafft — magst du uns noch etwas verraten?', sub: 'Optional. Hilft uns, Vorschläge für Menschen wie dich zu verbessern.' },
  ];

  const canNext =
    step === 0 ? transports.length > 0 :
    step === 1 ? companions.length > 0 : true;

  async function finish() {
    setSaving(true);
    try {
      await discoverApi.savePrefs({
        transports,
        transport: transports[0] ?? undefined,
        companions,
        locationConsent,
        gender,
        birthYear: birthYear || null,
      });
      if (user && meetPeople !== user.meetPeopleEnabled) {
        await updateUser({ meetPeopleEnabled: meetPeople }).catch(() => {});
      }
      if (locationConsent) {
        navigator.geolocation?.getCurrentPosition(() => {}, () => {}, { timeout: 5000 });
      }
      navigate(editMode ? '/profile' : '/swipe?calibrate=1', { replace: true });
    } finally { setSaving(false); }
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-md mx-auto w-full px-5 pt-8 pb-10 flex-1 flex flex-col">

        {/* Kopf */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-aubergine)' }}>
            <i className="fa-solid fa-compass text-white" />
          </div>
          <div>
            <p className="font-display font-bold text-[var(--color-aubergine)] leading-none">
              {editMode ? 'Entdecker-Profil anpassen' : 'Wir wollen dich kennenlernen'}
            </p>
            <p className="text-[11px] text-[var(--color-lavender)] mt-0.5">…um dir genau den richtigen Ort vorzuschlagen.</p>
          </div>
        </div>

        {/* Fortschritt */}
        <div className="flex gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full transition-colors"
              style={{ background: i <= step ? 'var(--color-amber)' : 'var(--color-bg-soft)' }} />
          ))}
        </div>

        <h1 className="font-display font-bold text-2xl text-[var(--color-aubergine)] leading-tight mb-1">{steps[step].title}</h1>
        <p className="text-sm text-[var(--color-lavender)] mb-6">{steps[step].sub}</p>

        <div className="flex-1">
          {/* Schritt 0 — Verkehrsmittel (Mehrfachauswahl) */}
          {step === 0 && (
            <div className="flex flex-col gap-2">
              {MOBILITY.map(m => {
                const on = transports.includes(m.id);
                return (
                  <button key={m.id}
                    onClick={() => setTransports(prev => on ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${on ? 'border-[var(--color-amber)] bg-[#FFF4EB]' : 'border-[var(--color-bg-soft)] bg-white'}`}>
                    <i className={`fa-solid ${m.icon} text-lg w-6 text-center`} style={{ color: on ? 'var(--color-amber)' : 'var(--color-lavender)' }} />
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-[var(--color-aubergine)]">{m.label}</p>
                      {m.sublabel && <p className="text-xs text-[var(--color-lavender)]">{m.sublabel}</p>}
                    </div>
                    {on && <i className="fa-solid fa-circle-check text-[var(--color-amber)]" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Schritt 1 — Begleitung + Meet-People-Toggle */}
          {step === 1 && (
            <div className="flex flex-col gap-2">
              {COMPANIONS.map(c => {
                const on = companions.includes(c.id);
                return (
                  <button key={c.id}
                    onClick={() => setCompanions(prev => on ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${on ? 'border-[var(--color-amber)] bg-[#FFF4EB]' : 'border-[var(--color-bg-soft)] bg-white'}`}>
                    <i className={`fa-solid ${c.icon} text-lg w-6 text-center`} style={{ color: on ? 'var(--color-amber)' : 'var(--color-lavender)' }} />
                    <p className="font-semibold text-sm text-[var(--color-aubergine)] flex-1">{c.label}</p>
                    {on && <i className="fa-solid fa-circle-check text-[var(--color-amber)]" />}
                  </button>
                );
              })}

              {/* Zusatz: neue Leute kennenlernen (Toggle) */}
              <button onClick={() => setMeetPeople(v => !v)}
                className={`flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all mt-1 ${meetPeople ? 'border-[var(--color-aubergine)] bg-[#F1ECF4]' : 'border-dashed border-[var(--color-lavender-lt)] bg-white'}`}>
                <i className="fa-solid fa-handshake text-lg w-6 text-center mt-0.5" style={{ color: meetPeople ? 'var(--color-aubergine)' : 'var(--color-lavender)' }} />
                <div className="flex-1">
                  <p className="font-semibold text-sm text-[var(--color-aubergine)]">Ich freue mich, neue Leute kennenzulernen</p>
                  <p className="text-xs text-[var(--color-lavender)] mt-0.5 leading-relaxed">
                    Schlag mir andere vor, die bei einem Geheimtrip auch offen für neue Bekanntschaften sind.
                  </p>
                </div>
                <div className="w-11 h-6 rounded-full relative transition-colors flex-shrink-0 mt-0.5"
                  style={{ background: meetPeople ? 'var(--color-aubergine)' : 'var(--color-bg-soft)' }}>
                  <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all" style={{ left: meetPeople ? 'auto' : '2px', right: meetPeople ? '2px' : 'auto' }} />
                </div>
              </button>
            </div>
          )}

          {/* Schritt 2 — Standort (Toggle, standardmäßig an) */}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              <div className={`p-4 rounded-2xl border-2 transition-all ${locationConsent ? 'border-[var(--color-amber)] bg-[#FFF4EB]' : 'border-[var(--color-bg-soft)] bg-white'}`}>
                <div className="flex items-center gap-3">
                  <i className="fa-solid fa-location-crosshairs text-lg w-6 text-center" style={{ color: locationConsent ? 'var(--color-amber)' : 'var(--color-lavender)' }} />
                  <p className="font-semibold text-sm text-[var(--color-aubergine)] flex-1">Standort verwenden</p>
                  <button onClick={() => toggleLocation(!locationConsent)}
                    className="w-12 h-6 rounded-full relative transition-colors flex-shrink-0"
                    style={{ background: locationConsent ? 'var(--color-amber)' : 'var(--color-bg-soft)' }}>
                    <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all" style={{ left: locationConsent ? 'auto' : '2px', right: locationConsent ? '2px' : 'auto' }} />
                  </button>
                </div>
                <p className="text-xs text-[var(--color-lavender)] mt-2 leading-relaxed">
                  {locationConsent
                    ? '„Was kann ich JETZT um mich herum entdecken?" — das kannst du jederzeit wieder ändern.'
                    : 'Du musst deinen Start-Ort oder die Region dann jedes Mal selbst eingeben.'}
                </p>
              </div>
            </div>
          )}

          {/* Schritt 3 — Demografie + Swipe-Hinweis */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              {user && (
                <div className="flex items-center gap-4">
                  <AvatarUpload name={user.name} src={user.avatarUrl} size={64}
                    onUploaded={url => updateUser({ avatarUrl: url })} />
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-aubergine)]">Profilbild (optional)</p>
                    <p className="text-xs text-[var(--color-lavender)]">Tippe aufs Bild, um ein Foto hochzuladen.</p>
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2">Geschlecht (optional)</p>
                <div className="flex flex-wrap gap-2">
                  {GENDERS.map(g => (
                    <button key={g} onClick={() => setGender(gender === g ? null : g)}
                      className={`px-3.5 py-2 rounded-full text-xs font-semibold border-2 transition-all ${gender === g ? 'border-[var(--color-amber)] bg-[#FFF4EB] text-[var(--color-aubergine)]' : 'border-[var(--color-bg-soft)] bg-white text-[var(--color-lavender)]'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2">Geburtsjahr (optional)</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setBirthYear(y => Math.max(1920, y - 1))}
                    className="w-11 h-11 rounded-2xl bg-white border-2 border-[var(--color-bg-soft)] text-lg font-bold text-[var(--color-aubergine)] active:scale-95 transition-transform">−</button>
                  <div className="flex-1 text-center border-2 border-[var(--color-bg-soft)] rounded-2xl py-2.5">
                    <span className="font-display font-bold text-xl text-[var(--color-aubergine)]">{birthYear}</span>
                  </div>
                  <button onClick={() => setBirthYear(y => Math.min(2020, y + 1))}
                    className="w-11 h-11 rounded-2xl bg-white border-2 border-[var(--color-bg-soft)] text-lg font-bold text-[var(--color-aubergine)] active:scale-95 transition-transform">+</button>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className="px-5 py-3.5 rounded-2xl text-sm font-semibold text-[var(--color-lavender)] bg-white border border-[var(--color-bg-soft)]">
              Zurück
            </button>
          )}
          <button
            disabled={!canNext || saving}
            onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : finish()}
            className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white shadow-[var(--shadow-amber)] disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--color-amber)' }}>
            {saving ? <i className="fa-solid fa-circle-notch fa-spin" />
              : step < steps.length - 1 ? 'Weiter'
              : editMode ? 'Speichern' : 'Los geht’s — zeig mir Orte!'}
          </button>
        </div>
        {!editMode && (
          // Überspringen betrifft nur DIESE Seite — nicht den ganzen Prozess. Auf der letzten Seite
          // (optionale Angaben) schließt es ab und führt zur Kalibrierung, statt alles wegzuwerfen.
          <button onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : finish()}
            className="text-center text-xs text-[var(--color-lavender-lt)] mt-4">
            Diese Frage überspringen
          </button>
        )}
      </div>
    </div>
  );
}
