import { useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile — Bot-Schutz für Registrierung und Passwort-Reset.
 *
 * Ohne VITE_TURNSTILE_SITE_KEY rendert die Komponente nichts und meldet sofort einen
 * leeren Token: lokal und in Installationen ohne Schlüssel bleibt alles wie bisher.
 * Der Server prüft spiegelbildlich nur, wenn TURNSTILE_SECRET gesetzt ist.
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
export const turnstileEnabled = !!SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Turnstile konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

export function Turnstile({ onToken, action }: { onToken: (token: string) => void; action?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!SITE_KEY) { onToken(''); return; }
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !boxRef.current || !window.turnstile) return;
        widget.current = window.turnstile.render(boxRef.current, {
          sitekey: SITE_KEY,
          action,
          theme: 'light',
          callback: (t: string) => onToken(t),
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      })
      .catch(() => { if (alive) { setFailed(true); onToken(''); } });
    return () => {
      alive = false;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!SITE_KEY) return null;
  if (failed) return (
    <p className="text-xs text-[var(--color-lavender)]">Sicherheitsprüfung nicht erreichbar — bitte Seite neu laden.</p>
  );
  return <div ref={boxRef} className="flex justify-center" />;
}
