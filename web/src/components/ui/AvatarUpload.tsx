import { useRef, useState } from 'react';
import { Avatar } from './Avatar.js';
import { mediaApi } from '../../services/api.js';

/**
 * Profilbild ändern: zeigt den Avatar mit einem Kamera-Badge; Klick öffnet die
 * Dateiauswahl, lädt hoch (Server optimiert zu WebP) und meldet die URL zurück.
 * Upload braucht Login (mediaApi) → daher beim Registrieren erst im Onboarding.
 */
export function AvatarUpload({ name, src, size = 72, onUploaded, onError }: {
  name: string;
  src?: string | null;
  size?: number;
  onUploaded: (url: string) => void | Promise<void>;
  onError?: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) {
      onError?.('Bitte ein Bild auswählen.');
      return;
    }
    setBusy(true);
    try {
      const { url } = await mediaApi.upload(file);
      await onUploaded(url);
    } catch (err) {
      onError?.((err as Error).message || 'Upload fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
      className="relative flex-shrink-0 rounded-full group active:scale-95 transition-transform"
      style={{ width: size, height: size }} aria-label="Profilbild ändern">
      <Avatar name={name} src={src} size={size} />
      <span className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors">
        {busy && <i className="fa-solid fa-circle-notch fa-spin text-white text-lg" />}
      </span>
      {!busy && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[var(--color-amber)] border-2 border-white flex items-center justify-center"
          style={{ width: size * 0.34, height: size * 0.34 }}>
          <i className="fa-solid fa-camera text-white" style={{ fontSize: size * 0.15 }} />
        </span>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={pick} />
    </button>
  );
}
