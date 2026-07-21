interface Props {
  name: string;
  src?: string | null;
  color?: string;
  size?: number;
  className?: string;
  cropX?: number;   // Fokuspunkt 0–1 (object-position) — für runden Ausschnitt
  cropY?: number;
  zoom?: number;    // 1 = formatfüllend, darüber ins Bild hineingezoomt
}

export function Avatar({ name, src, color = '#8A6FB3', size = 36, className = '', cropX = 0.5, cropY = 0.5, zoom = 1 }: Props) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  // Zoom braucht einen eigenen Rahmen: das Bild wird vergrößert, der Kreis schneidet ab.
  // Ursprung = Fokuspunkt, damit beim Zoomen genau die gewählte Stelle stehen bleibt.
  if (src && zoom > 1) return (
    <div style={{ width: size, height: size }} className={`rounded-full overflow-hidden flex-shrink-0 ${className}`}>
      <img src={src} alt={name}
        style={{
          width: size, height: size,
          objectPosition: `${cropX * 100}% ${cropY * 100}%`,
          transform: `scale(${zoom})`, transformOrigin: `${cropX * 100}% ${cropY * 100}%`,
        }}
        className="object-cover" />
    </div>
  );
  if (src) return (
    <img
      src={src} alt={name}
      style={{ width: size, height: size, objectPosition: `${cropX * 100}% ${cropY * 100}%` }}
      className={`rounded-full object-cover flex-shrink-0 ${className}`}
    />
  );
  return (
    <div
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      className={`rounded-full flex items-center justify-center text-white font-bold font-ui flex-shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}
