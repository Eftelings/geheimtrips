import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useAuthGate } from '../../store/useAuthGate.js';

/**
 * Login-Lightbox: erscheint, wenn ein:e ausgeloggte:r Besucher:in eine Aktion auslöst,
 * die ein Konto braucht (speichern, einreichen, bewerten …). Ausgelöst über useAuthGate.
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

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    try {
      if (tab === 'login') {
        await login(email, password);
        closeGate();
      } else {
        await register(email, password, name, handle);
        closeGate();
        navigate('/onboarding');
      }
    } catch { /* Fehler kommt aus dem Store */ }
  }

  const input = 'w-full bg-white/10 border border-white/15 rounded-xl px-3.5 h-11 text-white placeholder:text-white/40 outline-none focus:border-[var(--color-amber)] text-sm';

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,12,32,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={closeGate}>
      <div onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 relative"
        style={{ background: 'radial-gradient(120% 90% at 50% 0%, #4a3268, #34254c 55%, #251539)', animation: 'gtSlideUp 0.28s cubic-bezier(.32,.72,0,1)' }}>
        <button onClick={closeGate} aria-label="Schließen"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 text-white/70 flex items-center justify-center">
          <i className="fa-solid fa-xmark" />
        </button>

        <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, #F99039, #34254c)' }}>
          <i className="fa-solid fa-compass text-white text-lg" />
        </div>
        <h2 className="font-display font-bold text-white text-xl leading-tight mb-1">
          {tab === 'register' ? 'Kostenlos mitmachen' : 'Willkommen zurück'}
        </h2>
        <p className="text-white/60 text-sm mb-4">
          {reason ?? 'Melde dich an, um Geheimtrips zu speichern, zu bewerten und selbst welche zu teilen.'}
        </p>

        {/* Tabs */}
        <div className="flex bg-white/10 rounded-xl p-1 mb-4">
          {(['register', 'login'] as const).map(t => (
            <button key={t} type="button" onClick={() => { setTab(t); clearError(); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t ? 'bg-white text-[var(--color-aubergine)]' : 'text-white/70'}`}>
              {t === 'register' ? 'Konto erstellen' : 'Einloggen'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {tab === 'register' && (
            <div className="flex gap-2">
              <input className={input} placeholder="Vorname" value={name} onChange={e => setName(e.target.value)} required />
              <input className={input} placeholder="@handle" value={handle} onChange={e => setHandle(e.target.value.replace(/\s/g, ''))} required />
            </div>
          )}
          <input className={input} type="email" placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className={input} type="password" placeholder="Passwort" value={password} onChange={e => setPwd(e.target.value)} required minLength={8} />

          {tab === 'register' && (
            <label className="flex items-start gap-2 text-white/70 text-xs">
              <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-0.5" required />
              <span>Ich akzeptiere die Nutzungsbedingungen und Datenschutzerklärung.</span>
            </label>
          )}

          {error && <p className="text-[#ffb4a2] text-xs">{error}</p>}

          <button type="submit" disabled={loading || (tab === 'register' && !terms)}
            className="w-full h-11 rounded-xl bg-[var(--color-amber)] text-white font-bold text-sm disabled:opacity-50 active:scale-[0.99] transition-transform">
            {loading ? <i className="fa-solid fa-circle-notch fa-spin" /> : (tab === 'register' ? 'Konto erstellen' : 'Einloggen')}
          </button>
        </form>

        <button type="button" onClick={() => { closeGate(); navigate('/anmelden'); }}
          className="w-full text-center text-white/40 text-xs mt-3 hover:text-white/70">
          Passwort vergessen?
        </button>
      </div>
    </div>
  );
}
