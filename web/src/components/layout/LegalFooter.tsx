import { Link } from 'react-router-dom';

export function LegalFooter() {
  return (
    <footer className="mt-auto px-5 py-6 border-t border-[var(--color-bg-soft)] flex flex-wrap justify-center gap-x-4 gap-y-1">
      {[
        ['Impressum',            '/legal?tab=impressum'],
        ['Nutzungsbedingungen',  '/legal?tab=nutzung'],
        ['Datenschutzerklärung', '/legal?tab=datenschutz'],
        ['Wer sind wir?',        '/legal?tab=about'],
        ['Notice & Takedown',    '/legal?tab=notice'],
      ].map(([label, to]) => (
        <Link key={to} to={to} className="text-xs text-[var(--color-lavender-lt)] hover:text-[var(--color-lavender)] transition-colors">
          {label}
        </Link>
      ))}
    </footer>
  );
}
