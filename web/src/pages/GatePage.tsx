import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BrandLogo } from '../components/ui/BrandLogo.js';
import { useAuthStore } from '../store/useAuthStore.js';

export function GatePage() {
  const [tab, setTab]           = useState<'login' | 'register'>('login');
  const [email, setEmail]       = useState('');
  const [password, setPwd]      = useState('');
  const [name, setName]         = useState('');
  const [handle, setHandle]     = useState('');
  const [termsAccepted, setTerms] = useState(false);
  const { login, register, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    try {
      if (tab === 'login') {
        await login(email, password);
        navigate('/', { replace: true });
      } else {
        await register(email, password, name, handle);
        // Neue Nutzer:innen lernen wir erst kennen (Basics + Swipe-Kalibrierung)
        navigate('/onboarding', { replace: true });
      }
    } catch { /* error shown via store */ }
  }

  return (
    <div
      className="min-h-dvh flex flex-col px-6 py-8"
      style={{ background: 'radial-gradient(120% 80% at 50% 0%, #4a3268, #34254c 48%, #251539)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-10 h-10 rounded-[var(--radius-icon)] flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #F99039, #34254c)' }}
        >
          <i className="fa-solid fa-compass text-white text-lg" />
        </div>
        <BrandLogo />
      </div>

      {/* Badge */}
      <div className="inline-flex items-center gap-1.5 self-start bg-white/10 text-white/80 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-6">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-amber)] inline-block" />
        Bald verfügbar · Closed Beta
      </div>

      {/* Hero */}
      <h1 className="font-display font-bold text-white text-3xl leading-tight mb-4" style={{ letterSpacing: '-0.02em' }}>
        Die schönsten Orte stehen in{' '}
        <em className="text-[var(--color-amber)] not-italic">keinem</em>{' '}
        Reiseführer.
      </h1>

      <p className="text-white/70 text-sm mb-6 leading-relaxed">
        Wir bauen das Zuhause für Geheimtipps abseits der Touristenpfade.
        Bald für alle — heute schon für unsere Beta-Crew.
      </p>

      {/* Bullets */}
      <ul className="flex flex-col gap-2.5 mb-8">
        {[
          'Orte, die in keinem Reiseführer stehen',
          'Routen & Trips mit einem Tipp geplant',
          'Community von echten Entdecker:innen',
        ].map(b => (
          <li key={b} className="flex items-center gap-3 text-white/80 text-sm">
            <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-check text-[var(--color-amber)] text-xs" />
            </span>
            {b}
          </li>
        ))}
      </ul>

      {/* Login card */}
      <div
        className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/15"
        style={{ animation: 'gtFade 0.3s ease' }}
      >
        {/* Tab switcher */}
        <div className="flex rounded-xl overflow-hidden mb-4 bg-white/10">
          {(['login', 'register'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); clearError(); }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                tab === t ? 'bg-white text-[var(--color-aubergine)]' : 'text-white/70'
              }`}
            >
              {t === 'login' ? 'Einloggen' : 'Registrieren'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {tab === 'register' && (
            <>
              <input
                type="text" placeholder="Dein Name" value={name}
                onChange={e => setName(e.target.value)} required
                className="w-full bg-white/15 border border-white/20 rounded-[var(--radius-input)] px-4 py-2.5 text-white placeholder-white/50 text-sm outline-none focus:border-[var(--color-amber)] transition-colors"
              />
              <input
                type="text" placeholder="Handle (z.B. lena_entdeckt)" value={handle}
                onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} required
                className="w-full bg-white/15 border border-white/20 rounded-[var(--radius-input)] px-4 py-2.5 text-white placeholder-white/50 text-sm outline-none focus:border-[var(--color-amber)] transition-colors"
              />
            </>
          )}
          <input
            type="email" placeholder="E-Mail" value={email}
            onChange={e => setEmail(e.target.value)} required
            className="w-full bg-white/15 border border-white/20 rounded-[var(--radius-input)] px-4 py-2.5 text-white placeholder-white/50 text-sm outline-none focus:border-[var(--color-amber)] transition-colors"
          />
          <input
            type="password" placeholder="Passwort" value={password}
            onChange={e => setPwd(e.target.value)} required
            className="w-full bg-white/15 border border-white/20 rounded-[var(--radius-input)] px-4 py-2.5 text-white placeholder-white/50 text-sm outline-none focus:border-[var(--color-amber)] transition-colors"
          />

          {/* Terms checkbox — nur bei Registrierung */}
          {tab === 'register' && (
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTerms(e.target.checked)}
                className="mt-0.5 flex-shrink-0 accent-[#F99039] w-4 h-4"
              />
              <span className="text-white/70 text-xs leading-relaxed">
                Ich habe die{' '}
                <Link to="/legal?tab=nutzung" target="_blank" className="text-[var(--color-amber)] underline">
                  Nutzungsbedingungen
                </Link>{' '}
                gelesen und stimme diesen zu. Ich nehme insbesondere zur Kenntnis, dass das Aufsuchen beschriebener Orte auf eigene Gefahr geschieht und es sich um ein Betaprojekt ohne Verfügbarkeitsgarantie handelt.
              </span>
            </label>
          )}

          {error && (
            <p className="text-[#ff9980] text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || (tab === 'register' && !termsAccepted)}
            className="w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-[var(--radius-input)] shadow-[var(--shadow-amber)] transition-opacity disabled:opacity-60 text-sm"
          >
            {loading ? 'Einen Moment…' : tab === 'login' ? 'Einloggen' : 'Konto erstellen'}
          </button>

          {tab === 'login' && (
            <p className="text-center text-white/50 text-xs">
              Demo: lena@example.com / password123
            </p>
          )}
        </form>
      </div>

      {/* Legal link */}
      <div className="mt-auto pt-6 text-center">
        <Link to="/legal?tab=impressum" className="text-white/30 text-xs hover:text-white/50 transition-colors">
          Impressum
        </Link>
      </div>
    </div>
  );
}
