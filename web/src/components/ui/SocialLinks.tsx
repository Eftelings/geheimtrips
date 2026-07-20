/**
 * Social-Links eines Creator-Profils als runde Icon-Buttons (Instagram, TikTok,
 * Facebook, Snapchat, Website). Handles ohne führendes @; Website mit/ohne https.
 */
export function SocialLinks({ user, className = '' }: {
  user: {
    instagram?: string | null; tiktok?: string | null; website?: string | null;
    facebook?: string | null; snapchat?: string | null;
  };
  className?: string;
}) {
  const h = (v: string) => v.replace(/^@/, '').trim();
  const links = [
    user.instagram && { href: `https://instagram.com/${h(user.instagram)}`,  icon: 'fa-brands fa-instagram', label: 'Instagram' },
    user.tiktok    && { href: `https://tiktok.com/@${h(user.tiktok)}`,        icon: 'fa-brands fa-tiktok',    label: 'TikTok' },
    user.facebook  && { href: `https://facebook.com/${h(user.facebook)}`,     icon: 'fa-brands fa-facebook',  label: 'Facebook' },
    user.snapchat  && { href: `https://snapchat.com/add/${h(user.snapchat)}`, icon: 'fa-brands fa-snapchat',  label: 'Snapchat' },
    user.website   && { href: /^https?:\/\//.test(user.website) ? user.website : `https://${user.website}`, icon: 'fa-solid fa-link', label: 'Website' },
  ].filter(Boolean) as { href: string; icon: string; label: string }[];

  if (!links.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {links.map((l, i) => (
        <a key={i} href={l.href} target="_blank" rel="noreferrer" aria-label={l.label} title={l.label}
          className="w-9 h-9 rounded-full bg-[var(--color-bg-soft)] flex items-center justify-center text-[var(--color-lavender)] hover:text-[var(--color-amber)] hover:bg-[var(--color-amber)]/10 transition-colors">
          <i className={l.icon} />
        </a>
      ))}
    </div>
  );
}
