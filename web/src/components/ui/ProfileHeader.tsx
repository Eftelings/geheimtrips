import { Avatar } from './Avatar.js';
import { ProfileCounts, type CountItem } from './ProfileCounts.js';

/**
 * Der Profilkopf im Stil einer Ortsseite — geteilt vom öffentlichen Blog und vom
 * persönlichen Profil, damit beide gleich aussehen. Im eigenen Profil kommen kleine
 * Stift-Knöpfe dazu: Titelbild, Profilbild, Name und die Sichtbarkeit der Zahlen.
 */
export interface ProfileHeaderEdit {
  onCover: () => void;
  onAvatar: () => void;
  onName: () => void;
  onCounts: () => void;
  onSettings?: () => void;
  coverBusy?: boolean;
}

const PENCIL = 'rounded-full flex items-center justify-center text-white active:scale-90 transition-transform';
const PENCIL_BG = { background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' };

export function ProfileHeader({
  name, isLocalHero, counts, edit,
  coverUrl, coverCropX = 0.5, coverCropY = 0.5, coverZoom = 1,
  avatarUrl, avatarCropX = 0.5, avatarCropY = 0.5, avatarZoom = 1,
}: {
  name: string;
  isLocalHero?: boolean;
  counts: CountItem[];
  edit?: ProfileHeaderEdit;
  coverUrl?: string | null; coverCropX?: number; coverCropY?: number; coverZoom?: number;
  avatarUrl?: string | null; avatarCropX?: number; avatarCropY?: number; avatarZoom?: number;
}) {
  return (
    <div className="relative">
      {/* Bild + Overlay (geclippt) */}
      <div className="relative h-56 sm:h-64 overflow-hidden sm:rounded-b-3xl">
        {coverUrl
          ? <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
              style={{
                objectPosition: `${coverCropX * 100}% ${coverCropY * 100}%`,
                transform: coverZoom > 1 ? `scale(${coverZoom})` : undefined,
                transformOrigin: `${coverCropX * 100}% ${coverCropY * 100}%`,
              }} />
          : <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #4a3268, #34254c 55%, #251539)' }} />}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, transparent 52%)' }} />

        {/* Titelbild ändern + Einstellungen */}
        {edit && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            {edit.onSettings && (
              <button onClick={edit.onSettings} title="Einstellungen" className={`w-9 h-9 ${PENCIL}`} style={PENCIL_BG}>
                <i className="fa-solid fa-gear text-sm" />
              </button>
            )}
            <button onClick={edit.onCover} disabled={edit.coverBusy} title="Titelbild ändern"
              className={`w-9 h-9 ${PENCIL}`} style={PENCIL_BG}>
              <i className={`fa-solid ${edit.coverBusy ? 'fa-circle-notch fa-spin' : 'fa-camera'} text-sm`} />
            </button>
          </div>
        )}

        {/* Overlay: Badge (wie Hauptkategorie) · Name (wie Ortsname) · Zahlen (wie Ort) */}
        <div className="absolute bottom-0 left-0 right-0 p-5 pr-32">
          {isLocalHero && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5"
              style={{ background: 'rgba(249,144,57,0.92)', color: 'white' }}>
              <i className="fa-solid fa-shield-halved" /> Local Hero
            </span>
          )}
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-white leading-tight"
              style={{ fontSize: 'clamp(1.35rem, 5vw, 1.9rem)', letterSpacing: '-0.01em', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
              {name}
            </h1>
            {edit && (
              <button onClick={edit.onName} title="Namen ändern" className={`w-7 h-7 flex-shrink-0 ${PENCIL}`} style={PENCIL_BG}>
                <i className="fa-solid fa-pen text-[11px]" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <ProfileCounts onImage items={counts} />
            {edit && (
              <button onClick={edit.onCounts} title="Was davon öffentlich ist" className={`w-9 h-9 flex-shrink-0 ${PENCIL}`} style={PENCIL_BG}>
                <i className="fa-solid fa-pen text-[11px]" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rundes Profilbild rechts — genau zur Hälfte im Header, zur Hälfte darunter.
          Der Ring nimmt die Hintergrundfarbe der Seite auf, nicht Weiß. */}
      <div className="absolute right-5 bottom-0 translate-y-1/2 z-10 rounded-full"
        style={{ boxShadow: '0 0 0 5px var(--color-bg), 0 8px 20px rgba(52,37,76,0.22)' }}>
        <Avatar name={name} src={avatarUrl} size={96} cropX={avatarCropX} cropY={avatarCropY} zoom={avatarZoom} />
        {edit && (
          <button onClick={edit.onAvatar} title="Profilbild ändern"
            className={`absolute bottom-0 right-0 w-8 h-8 ${PENCIL}`} style={PENCIL_BG}>
            <i className="fa-solid fa-camera text-[11px]" />
          </button>
        )}
      </div>
    </div>
  );
}
