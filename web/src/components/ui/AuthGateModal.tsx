import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useAuthGate } from '../../store/useAuthGate.js';
import { authApi } from '../../services/api.js';
import { BrandMark } from './BrandMark.js';
import { BrandLogo } from './BrandLogo.js';
import { Turnstile, turnstileEnabled } from './Turnstile.js';

/**
 * Login-Lightbox: erscheint, wenn ein:e ausgeloggte:r Besucher:in eine Aktion auslöst,
 * die ein Konto braucht (speichern, einreichen, bewerten …). Ausgelöst über useAuthGate.
 *
 * Enthält auch „Passwort vergessen" — dafür gibt es keine eigene Seite mehr.
 */
export function AuthGateModal() {
  const { open, reason, closeGate } = useAuthGate();
  const { login, register, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const [tab, setTab]       = useState<'register' | 'login'>('register');
  const [email, setEmail]   = useState('');
  const [password, setPwd]  = useState('');
  const [name, setName]     = useState('');
  const [handle, setHandle] = useState('');
  const [terms, setTerms]   = useState(false);
  // Passwort vergessen — innerhalb desselben Fensters
  const [forgot, setForgot]         = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  // Bot-Schutz: ohne Schlüssel bleibt der Token leer und wird serverseitig ignoriert
  const [captcha, setCaptcha] = useState('');

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    try {
      if (tab === 'login') {
        await login(email, password);
        closeGate();
      } else {
        await register(email, password, name, handle, false, captcha);
        closeGate();
        navigate('/onboarding');
      }
    } catch { /* Fehler kommt aus dem Store */ }
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setForgotBusy(true);
    // Bewusst immer „gesendet": ob es die Adresse gibt, verrät die Antwort nicht.
    try { await authApi.forgotPassword(email, captcha); } catch { /* still ok */ }
    setForgotBusy(false);
    setForgotSent(true);
  }

  const input = 'w-full bg-[var(--color-bg)] border border-[var(--color-bg-soft)] rounded-xl px-3.5 h-11 text-[var(--color-aubergine)] placeholder:text-[var(--color-lavender-lt)] outline-none focus:border-[var(--color-amber)] text-sm';
  const needsCaptcha = turnstileEnabled && (tab === 'register' || forgot);

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(52,37,76,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={closeGate}>
      <div onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 relative bg-white"
        style={{ boxShadow: '0 -10px 50px rgba(52,37,76,0.28)', animation: 'gtSlideUp 0.28s cubic-bezier(.32,.72,0,1)' }}>
        <button onClick={closeGate} aria-label="Schließen"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[var(--color-bg-soft)] text-[var(--color-lavender)] flex items-center justify-center">
          <i className="fa-solid fa-xmark" />
        </button>

        {/* Bildmarke + Schriftzug — dieselbe Kombination wie im Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <BrandMark size={42} />
          <BrandLogo size="lg" />
        </div>

        {forgot ? (
          /* ── Passwort vergessen ── */
          forgotSent ? (
            <>
              <h2 className="font-display font-bold text-[var(--color-aubergine)] text-xl leading-tight mb-1">E-Mail unterwegs</h2>
              <p className="text-[var(--color-lavender)] text-sm mb-5">
                Falls es ein Konto zu dieser Adresse gibt, liegt gleich ein Link zum Zurücksetzen im Postfach. Er gilt eine Stunde.
              </p>
              <button onClick={() => { setForgot(false); setForgotSent(false); setTab('login'); }}
                className="w-full h-11 rounded-xl bg-[var(--color-amber)] text-white font-bold text-sm">
                Zurück zum Einloggen
              </button>
            </>
          ) : (
            <>
              <h2 className="font-display font-bold text-[var(--color-aubergine)] text-xl leading-tight mb-1">Passwort zurücksetzen</h2>
              <p className="text-[var(--color-lavender)] text-sm mb-4">
                Gib deine E-Mail-Adresse an — wir schicken dir einen Link.
              </p>
              <form onSubmit={sendReset} className="flex flex-col gap-3">
                <input className={input} type="email" placeholder="E-Mail" value={email}
                  onChange={e => setEmail(e.target.value)} required />
                {needsCaptcha && <Turnstile action="reset" onToken={setCaptcha} />}
                <button type="submit" disabled={forgotBusy}
                  className="w-full h-11 rounded-xl bg-[var(--color-amber)] text-white font-bold text-sm disabled:opacity-50">
                  {forgotBusy ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Link senden'}
                </button>
              </form>
              <button type="button" onClick={() => setForgot(false)}
                className="w-full text-center text-[var(--color-lavender)] text-xs mt-3 hover:text-[var(--color-aubergine)]">
                Zurück
              </button>
            </>
          )
        ) : (
          <>
            <h2 className="font-display font-bold text-[var(--color-aubergine)] text-xl leading-tight mb-1">
              {tab === 'register' ? 'Kostenlos mitmachen' : 'Willkommen zurück'}
            </h2>
            <p className="text-[var(--color-lavender)] text-sm mb-4">
              {reason ?? 'Melde dich an, um Geheimtrips zu speichern, zu bewerten und selbst welche zu teilen.'}
            </p>

            {/* Tabs */}
            <div className="flex bg-[var(--color-bg-soft)] rounded-xl p-1 mb-4">
              {(['register', 'login'] as const).map(t => (
                <button key={t} type="button" onClick={() => { setTab(t); clearError(); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    tab === t ? 'bg-white text-[var(--color-aubergine)] shadow-sm' : 'text-[var(--color-lavender)]'}`}>
                  {t === 'register' ? 'Konto erstellen' : 'Einloggen'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              {tab === 'register' && (
                <div className="flex gap-2">
                  <input className={input} placeholder="Vorname" value={name} onChange={e => setName(e.target.value)} required />
                  <input className={input} placeholder="Benutzername" value={handle} onChange={e => setHandle(e.target.value.replace(/\s/g, ''))} required />
                </div>
              )}
              <input className={input} type="email" placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} required />
              <input className={input} type="password" placeholder="Passwort" value={password} onChange={e => setPwd(e.target.value)} required minLength={8} />

              {tab === 'register' && (
                <label className="flex items-start gap-2 text-[var(--color-lavender)] text-xs">
                  <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-0.5 accent-[var(--color-amber)]" required />
                  <span>Ich akzeptiere die Nutzungsbedingungen und Datenschutzerklärung.</span>
                </label>
              )}

              {needsCaptcha && <Turnstile action="register" onToken={setCaptcha} />}

              {error && <p className="text-[var(--color-danger)] text-xs">{error}</p>}

              <button type="submit" disabled={loading || (tab === 'register' && !terms)}
                className="w-full h-11 rounded-xl bg-[var(--color-amber)] text-white font-bold text-sm shadow-[var(--shadow-amber)] disabled:opacity-50 active:scale-[0.99] transition-transform">
                {loading ? <i className="fa-solid fa-circle-notch fa-spin" /> : (tab === 'register' ? 'Konto erstellen' : 'Einloggen')}
              </button>
            </form>

            <button type="button" onClick={() => { clearError(); setForgot(true); setForgotSent(false); }}
              className="w-full text-center text-[var(--color-lavender)] text-xs mt-3 hover:text-[var(--color-aubergine)]">
              Passwort vergessen?
            </button>
          </>
        )}
      </div>
    </div>
  );
}
