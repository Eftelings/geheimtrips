import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { BrandLogo } from '../components/ui/BrandLogo.js';
import { authApi } from '../services/api.js';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Das Passwort muss mindestens 6 Zeichen haben.'); return; }
    if (password !== confirm) { setError('Die Passwörter stimmen nicht überein.'); return; }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError((err as Error).message ?? 'Link ungültig oder abgelaufen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col px-6 py-8"
      style={{ background: 'radial-gradient(120% 80% at 50% 0%, #4a3268, #34254c 48%, #251539)' }}>
      <div className="w-full max-w-md mx-auto flex flex-col">

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-[var(--radius-icon)] flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #F99039, #34254c)' }}>
            <i className="fa-solid fa-compass text-white text-lg" />
          </div>
          <BrandLogo />
        </div>

        <h1 className="font-display font-bold text-white text-2xl leading-tight mb-2" style={{ letterSpacing: '-0.02em' }}>
          Neues Passwort vergeben
        </h1>

        {!token ? (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/15 mt-4">
            <p className="text-white/80 text-sm">
              Dieser Link ist ungültig. Fordere auf der{' '}
              <Link to="/" className="text-[var(--color-amber)] underline">Anmeldeseite</Link> einen neuen an.
            </p>
          </div>
        ) : done ? (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/15 mt-4">
            <p className="text-white text-sm mb-4">
              <i className="fa-solid fa-circle-check text-[var(--color-amber)] mr-2" />
              Dein Passwort wurde geändert. Du kannst dich jetzt einloggen.
            </p>
            <button onClick={() => navigate('/', { replace: true })}
              className="w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-[var(--radius-input)] shadow-[var(--shadow-amber)] text-sm">
              Zum Login
            </button>
          </div>
        ) : (
          <>
            <p className="text-white/70 text-sm mb-5">Wähle ein neues Passwort für dein Konto.</p>
            <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/15 flex flex-col gap-3">
              <input
                type="password" placeholder="Neues Passwort" value={password}
                onChange={e => setPassword(e.target.value)} required autoFocus
                className="w-full bg-white/15 border border-white/20 rounded-[var(--radius-input)] px-4 py-2.5 text-white placeholder-white/50 text-sm outline-none focus:border-[var(--color-amber)] transition-colors"
              />
              <input
                type="password" placeholder="Passwort wiederholen" value={confirm}
                onChange={e => setConfirm(e.target.value)} required
                className="w-full bg-white/15 border border-white/20 rounded-[var(--radius-input)] px-4 py-2.5 text-white placeholder-white/50 text-sm outline-none focus:border-[var(--color-amber)] transition-colors"
              />
              {error && <p className="text-[#ff9980] text-xs text-center">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-[var(--radius-input)] shadow-[var(--shadow-amber)] transition-opacity disabled:opacity-60 text-sm">
                {loading ? 'Speichern…' : 'Passwort ändern'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
