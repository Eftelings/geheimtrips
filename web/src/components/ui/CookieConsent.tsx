import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export interface ConsentState {
  necessary: true;         // immer true
  functional: boolean;     // localStorage, Zustand-Persist
  analytics: boolean;      // zukünftig: Matomo/Plausible
}

const STORAGE_KEY = 'gt_cookie_consent';

export function getCookieConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentState;
  } catch { return null; }
}

export function setCookieConsent(state: ConsentState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [functional, setFunctional] = useState(true);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    // Nur zeigen wenn noch kein Consent gegeben
    if (!getCookieConsent()) {
      // Kurze Verzögerung damit die App zuerst lädt
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  function accept(all: boolean) {
    setCookieConsent({ necessary: true, functional: all || functional, analytics: all || analytics });
    setVisible(false);
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] p-4 md:p-6"
      style={{ animation: 'gtSlideUp 0.3s cubic-bezier(0.32,0.72,0,1)' }}
    >
      <div className="max-w-2xl mx-auto bg-[var(--color-aubergine)] text-white rounded-2xl shadow-[var(--shadow-raised)] p-4 md:p-5">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-2xl flex-shrink-0">🍪</span>
          <div className="flex-1">
            <p className="font-semibold text-sm mb-1">Wir nutzen Cookies</p>
            <p className="text-white/70 text-xs leading-relaxed">
              Technisch notwendige Cookies sichern deinen Login. Funktionale Cookies merken dir deine Einstellungen und gespeicherten Orte. Weitere Infos in unserer{' '}
              <Link to="/legal?tab=datenschutz" className="underline text-[var(--color-amber)]" onClick={() => setVisible(false)}>
                Datenschutzerklärung
              </Link>.
            </p>
          </div>
        </div>

        {/* Detail-Einstellungen */}
        {showDetails && (
          <div
            className="border border-white/20 rounded-xl p-3 mb-3 flex flex-col gap-2.5"
            style={{ animation: 'gtFade 0.2s ease' }}
          >
            {[
              { key: 'necessary', label: 'Notwendig', desc: 'Login-Session, Sicherheit', forced: true, value: true },
              { key: 'functional', label: 'Funktional', desc: 'Gespeicherte Orte, Einstellungen, Sprachpräferenzen', forced: false, value: functional },
              { key: 'analytics', label: 'Analyse', desc: 'Anonyme Nutzungsstatistiken (zukünftig)', forced: false, value: analytics },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{item.label}</div>
                  <div className="text-[10px] text-white/60">{item.desc}</div>
                </div>
                <button
                  disabled={item.forced}
                  onClick={() => {
                    if (item.key === 'functional') setFunctional(v => !v);
                    if (item.key === 'analytics') setAnalytics(v => !v);
                  }}
                  className={`flex-shrink-0 w-10 h-5 rounded-full relative transition-colors ${
                    item.value ? 'bg-[var(--color-amber)]' : 'bg-white/20'
                  } disabled:opacity-60`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${item.value ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => accept(true)}
            className="flex-1 bg-[var(--color-amber)] text-white font-bold py-2.5 rounded-xl text-sm shadow-[var(--shadow-amber)]"
          >
            Alle akzeptieren
          </button>
          <button
            onClick={() => accept(false)}
            className="flex-1 bg-white/15 text-white font-semibold py-2.5 rounded-xl text-sm"
          >
            Nur notwendige
          </button>
          <button
            onClick={() => setShowDetails(d => !d)}
            className="bg-white/10 text-white/70 font-medium py-2.5 px-3 rounded-xl text-xs"
          >
            {showDetails ? 'Weniger' : 'Anpassen'}
          </button>
        </div>
      </div>
    </div>
  );
}
