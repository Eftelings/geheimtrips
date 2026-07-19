import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { BrandLogo } from '../components/ui/BrandLogo.js';
import { authApi } from '../services/api.js';
import { useAuthStore } from '../store/useAuthStore.js';

// Landeseite für den Bestätigungslink aus der Anmelde-Mail (/e-mail-bestaetigen?token=…).
export function EmailVerifyPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const hydrate = useAuthStore(s => s.hydrate);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(token ? 'loading' : 'error');
  const [error, setError]   = useState(token ? '' : 'Dieser Link ist ungültig oder unvollständig.');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;   // React StrictMode ruft Effekte doppelt auf — Token nur einmal einlösen
    (async () => {
      try {
        await authApi.verifyEmail(token);
        // Falls auf diesem Gerät eingeloggt: Nutzerobjekt auffrischen, damit die Beitrags-Sperre fällt.
        await hydrate().catch(() => {});
        setStatus('success');
      } catch (e) {
        setError((e as Error).message || 'Link ungültig oder abgelaufen.');
        setStatus('error');
      }
    })();
  }, [token, hydrate]);

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

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/15 mt-4 text-center">
          {status === 'loading' && (
            <>
              <i className="fa-solid fa-circle-notch fa-spin text-[var(--color-amber)] text-3xl mb-4" />
              <p className="text-white/80 text-sm">Wir bestätigen deine Anmeldung…</p>
            </>
          )}

          {status === 'success' && (
            <>
              <i className="fa-solid fa-circle-check text-[var(--color-amber)] text-4xl mb-4" />
              <h1 className="font-display font-bold text-white text-xl mb-2">E-Mail bestätigt!</h1>
              <p className="text-white/75 text-sm mb-5">
                Danke — deine Anmeldung ist bestätigt. Du kannst jetzt eigene Geheimtrips einreichen und bewerten.
              </p>
              <button onClick={() => navigate('/', { replace: true })}
                className="w-full bg-[var(--color-amber)] text-white font-bold py-3 rounded-[var(--radius-input)] shadow-[var(--shadow-amber)] text-sm">
                Weiter zur App
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <i className="fa-solid fa-circle-exclamation text-[#ff9980] text-4xl mb-4" />
              <h1 className="font-display font-bold text-white text-xl mb-2">Bestätigung fehlgeschlagen</h1>
              <p className="text-white/75 text-sm mb-5">{error}</p>
              <p className="text-white/60 text-xs">
                Melde dich an und fordere in deinem{' '}
                <Link to="/profil" className="text-[var(--color-amber)] underline">Profil</Link>{' '}
                eine neue Bestätigungs-Mail an.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
