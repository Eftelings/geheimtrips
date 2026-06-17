export function BrandLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg';
  return (
    <span className={`font-display font-bold tracking-tight text-[var(--color-aubergine)] ${cls}`}>
      Geheimtrips<span className="text-[var(--color-amber)]">.</span>de
    </span>
  );
}
