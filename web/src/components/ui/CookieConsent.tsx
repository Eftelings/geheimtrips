import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export interface ConsentState {
  necessary: true;         // immer aktiv (Login-Session, Sicherheit)
  functional: boolean;     // gespeicherte Orte/Einstellungen (localStorage)
  analytics: boolean;      // anonyme Statistik (aktuell nicht im Einsatz)
  v: number;               // Consent-Version — bei neuen Zwecken erneut fragen
}

const STORAGE_KEY = 'gt_cookie_consent';
const CONSENT_VERSION = 2;

export function getCookieConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ConsentState;
    if (s.v !== CONSENT_VERSION) return null;   // veraltet → erneut einholen
    return s;
  } catch { return null; }
}

export function setCookieConsent(state: Omit<ConsentState, 'necessary' | 'v'>): void {
  const full: ConsentState = { necessary: true, v: CONSENT_VERSION, ...state };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  // Anderen Teilen der App erlauben, auf Änderungen zu reagieren (z.B. Analytics laden)
  window.dispatchEvent(new CustomEvent('gt-consent', { detail: full }));
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  // Nicht-notwendige Zwecke sind standardmäßig AUS — keine Vorab-Einwilligung (DSGVO/TTDSG).
  const [functional, setFunctional] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true);
  }, []);

  if (!visible) return null;

  function save(state: { functional: boolean; analytics: boolean }) {
    setCookieConsent(state);
    setVisible(false);
  }

  const toggle = (on: boolean) => `flex-shrink-0 w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-[var(--color-amber)]' : 'bg-white/25'} disabled:opacity-60`;
  const knob   = (on: boolean) => `absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? 'right-0.5' : 'left-0.5'}`;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-3 sm:p-5"
      style={{ background: 'rgba(20,12,32,0.55)', backdropFilter: 'blur(4px)' }}
      role="dialog" aria-modal="true" aria-label="Cookie-Einstellungen">
      <div className="w-full max-w-lg bg-[var(--color-aubergine)] text-white rounded-3xl shadow-[var(--shadow-raised)] p-5 md:p-6"
        style={{ animation: 'gtSlideUp 0.3s cubic-bezier(0.32,0.72,0,1)' }}>
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl flex-shrink-0">🍪</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-base mb-1">Datenschutz & Cookies</p>
            <p className="text-white/70 text-[13px] leading-relaxed">
              Wir verwenden nur technisch notwendige Cookies, damit die Seite funktioniert (z.&nbsp;B. dein Login).
              Optionale Cookies helfen uns, gespeicherte Orte zu merken und die Seite zu verbessern. Beim Anzeigen von
              Karten und Bildern werden externe Dienste geladen. Du entscheidest selbst — und kannst deine Wahl jederzeit ändern.
              Mehr in unserer{' '}
              <Link to="/legal?tab=datenschutz" className="underline text-[var(--color-amber)]">Datenschutzerklärung</Link>
              {' '}und im{' '}
              <Link to="/legal?tab=impressum" className="underline text-[var(--color-amber)]">Impressum</Link>.
            </p>
          </div>
        </div>

        {/* Granulare Auswahl */}
        {showDetails && (
          <div className="border border-white/15 rounded-2xl p-3.5 mb-4 flex flex-col gap-3" style={{ animation: 'gtFade 0.2s ease' }}>
            {[
              { key: 'necessary',  label: 'Notwendig',  desc: 'Login-Session & Sicherheit. Immer aktiv.', forced: true,  value: true },
              { key: 'functional', label: 'Funktional', desc: 'Gespeicherte Orte, Filter & Einstellungen.', forced: false, value: functional },
              { key: 'analytics',  label: 'Statistik',  desc: 'Anonyme Nutzungsstatistik (aktuell nicht aktiv).', forced: false, value: analytics },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">{item.label}</div>
                  <div className="text-[11px] text-white/55">{item.desc}</div>
                </div>
                <button disabled={item.forced} aria-pressed={item.value}
                  onClick={() => { if (item.key === 'functional') setFunctional(v => !v); if (item.key === 'analytics') setAnalytics(v => !v); }}
                  className={toggle(item.value)}>
                  <div className={knob(item.value)} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Aktionen — „Ablehnen" ist gleichwertig zu „Akzeptieren" (keine Dark Patterns) */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button onClick={() => save({ functional: false, analytics: false })}
              className="flex-1 bg-white/15 hover:bg-white/20 text-white font-bold py-3 rounded-2xl text-sm transition-colors">
              Ablehnen
            </button>
            {showDetails ? (
              <button onClick={() => save({ functional, analytics })}
                className="flex-1 bg-white/15 hover:bg-white/20 text-white font-bold py-3 rounded-2xl text-sm transition-colors">
                Auswahl speichern
              </button>
            ) : (
              <button onClick={() => setShowDetails(true)}
                className="flex-1 bg-white/15 hover:bg-white/20 text-white font-bold py-3 rounded-2xl text-sm transition-colors">
                Einstellungen
              </button>
            )}
            <button onClick={() => save({ functional: true, analytics: true })}
              className="flex-1 bg-[var(--color-amber)] hover:brightness-110 text-white font-bold py-3 rounded-2xl text-sm transition-all">
              Alle akzeptieren
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
