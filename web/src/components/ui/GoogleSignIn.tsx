import { useEffect, useRef, useState } from 'react';

/**
 * „Mit Google anmelden" über Google Identity Services.
 *
 * Der Knopf liefert ein signiertes ID-Token, das unsere API prüft — kein Redirect und
 * kein Client Secret. Ohne VITE_GOOGLE_CLIENT_ID rendert die Komponente nichts, dann
 * bleibt nur die Anmeldung mit E-Mail und Passwort.
 */
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
export const googleEnabled = !!CLIENT_ID;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google-Anmeldung konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

export function GoogleSignIn({ onCredential, text = 'signin_with' }: {
  onCredential: (credential: string) => void;
  /** „signin_with" = Mit Google anmelden · „signup_with" = Mit Google registrieren */
  text?: 'signin_with' | 'signup_with';
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Der Callback darf nicht veralten: Google hält die Funktion aus initialize() fest.
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID) return;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !boxRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (res: { credential?: string }) => { if (res.credential) cb.current(res.credential); },
        });
        window.google.accounts.id.renderButton(boxRef.current, {
          type: 'standard', theme: 'outline', size: 'large', shape: 'pill',
          text, logo_alignment: 'center', width: boxRef.current.clientWidth || 320,
        });
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [text]);

  if (!CLIENT_ID) return null;
  if (failed) return null;   // stiller Rückfall auf E-Mail + Passwort
  return <div ref={boxRef} className="flex justify-center [&>div]:!w-full" />;
}
