import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BrandLogo } from '../components/ui/BrandLogo.js';
import { useAuthStore } from '../store/useAuthStore.js';

export function GatePage() {
  const [tab, setTab]           = useState<'login' | 'register'>('register');
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
        navigate('/onboarding', { replace: true });
      }
    } catch { /* error shown via store */ }
  }

  return (
    <div
      className="min-h-dvh flex flex-col px-6 py-8"
      style={{ background: 'radial-gradient(120% 80% at 50% 0%, #4a3268, #34254c 48%, #251539)' }}
    >
      <div className="w-full max-w-md mx-auto flex flex-col">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-7">
          <div
            className="w-10 h-10 rounded-[var(--radius-icon)] flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #F99039, #34254c)' }}
          >
            <i className="fa-solid fa-compass text-white text-lg" />
          </div>
          <BrandLogo />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 self-start bg-white/10 text-white/80 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-amber)] inline-block" />
          Closed Beta
        </div>

        {/* Hero */}
        <h1 className="font-display font-bold text-white text-3xl leading-tight mb-4" style={{ letterSpacing: '-0.02em' }}>
          Die schönsten Orte stehen in{' '}
          <em className="text-[var(--color-amber)] not-italic">keinem</em>{' '}
          Reiseführer.
        </h1>

        {/* ── Gründer-Karte: Foto + Geschichte ── */}
        <div className="bg-white/8 backdrop-blur-sm rounded-3xl overflow-hidden border border-white/10 mb-6">
          <img src="/images/founder.jpg" alt="David & Lea" className="w-full h-auto"
            onError={e => { e.currentTarget.style.display = 'none'; }} />
          <div className="p-5">
            <p className="text-[var(--color-amber)] font-bold text-sm mb-2">Hi, wir sind David &amp; Lea 👋</p>
            <p className="text-white/75 text-sm leading-relaxed mb-3">
              Wir lieben es, zu reisen und neue Orte zu entdecken. Aber irgendwann hatten wir den Überblick
              verloren — über all die Orte, die wir noch sehen wollten. Gespeicherte Insta-Reels, die man nie
              wieder ansieht. Überladene Google-Maps-Karten voller Pins.
            </p>
            <p className="text-white/75 text-sm leading-relaxed">
              <strong className="text-white">Geheimtrips.de</strong> löst genau das: Wir lernen dich in ein paar Sekunden
              kennen und schlagen dir <strong className="text-white">genau den richtigen Ort für genau den richtigen Moment</strong> vor.
              In einer Welt voller KI wollen wir dabei menschlich bleiben — echte Orte, echte Erfahrungen, von echten Entdecker:innen.
            </p>
          </div>
        </div>

        {/* Werteversprechen */}
        <ul className="flex flex-col gap-2.5 mb-6">
          {[
            { icon: 'fa-heart-crack',     t: 'Schluss mit Reels, die du speicherst und nie wieder ansiehst' },
            { icon: 'fa-map-location-dot', t: 'Schluss mit überladenen Karten voller Pins' },
            { icon: 'fa-people-group',    t: 'Echte Geheimtipps von echten Menschen — kein anonymer Algorithmus' },
          ].map(b => (
            <li key={b.t} className="flex items-center gap-3 text-white/80 text-sm">
              <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <i className={`fa-solid ${b.icon} text-[var(--color-amber)] text-xs`} />
              </span>
              {b.t}
            </li>
          ))}
        </ul>

        {/* Hinweis: kurzes Kennenlernen */}
        <p className="text-white/55 text-xs leading-relaxed mb-5">
          <i className="fa-solid fa-compass text-[var(--color-amber)] mr-1.5" />
          Beim Start lernen wir dich in <strong className="text-white/80">unter einer Minute</strong> kennen —
          damit deine Vorschläge von Anfang an passen.
        </p>

        {/* Login / Register */}
        <div
          className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/15"
          style={{ animation: 'gtFade 0.3s ease' }}
        >
          <div className="flex rounded-xl overflow-hidden mb-4 bg-white/10">
            {(['register', 'login'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); clearError(); }}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                  tab === t ? 'bg-white text-[var(--color-aubergine)]' : 'text-white/70'
                }`}
              >
                {t === 'register' ? 'Konto erstellen' : 'Einloggen'}
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
              {loading ? 'Einen Moment…' : tab === 'register' ? 'Los geht’s — Konto erstellen' : 'Einloggen'}
            </button>
          </form>
        </div>

        {/* Legal link */}
        <div className="pt-6 text-center">
          <Link to="/legal?tab=impressum" className="text-white/30 text-xs hover:text-white/50 transition-colors">
            Impressum &amp; Datenschutz
          </Link>
        </div>
      </div>
    </div>
  );
}
