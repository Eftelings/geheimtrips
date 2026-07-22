import { useEffect, useState } from 'react';
import { BottomSheet } from './BottomSheet.js';
import { Avatar } from './Avatar.js';
import { friendsApi, messagesApi } from '../../services/api.js';
import type { Friend } from '../../types/index.js';

/**
 * Einen Ort weitergeben: entweder direkt ins Postfach einer Freundin oder eines
 * Freundes, oder als Link über den System-Dialog. Der Weg über das Postfach ist
 * der schnellere — deshalb steht er oben.
 */
export function SendPlaceSheet({ placeId, placeName, shortText, onClose, onShared }: {
  placeId: string;
  placeName: string;
  shortText?: string;
  onClose: () => void;
  /** Wird nach dem System-Teilen gerufen (Zähler hochsetzen). */
  onShared?: () => void;
}) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [note, setNote]       = useState('');
  const [sent, setSent]       = useState<number[]>([]);
  const [busy, setBusy]       = useState<number | null>(null);
  const [error, setError]     = useState('');

  useEffect(() => { friendsApi.list().then(setFriends).catch(() => setFriends([])); }, []);

  async function send(f: Friend) {
    setBusy(f.id); setError('');
    try {
      await messagesApi.send(f.id, { placeId, text: note.trim() || undefined });
      setSent(s => [...s, f.id]);
    } catch (e) { setError((e as Error).message ?? 'Konnte nicht gesendet werden.'); }
    setBusy(null);
  }

  function shareLink() {
    const url = `${location.origin}/ort/${placeId}`;
    if (navigator.share) {
      navigator.share({ title: placeName, text: shortText, url }).then(() => onShared?.()).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(() => { onShared?.(); onClose(); }).catch(() => {});
    }
  }

  return (
    <BottomSheet open onClose={onClose} title={`„${placeName}" weitergeben`}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2">
            An Freund:innen schicken
          </p>
          {friends === null ? (
            <div className="flex justify-center py-6 text-[var(--color-lavender-lt)]"><i className="fa-solid fa-circle-notch fa-spin" /></div>
          ) : friends.length === 0 ? (
            <p className="text-sm text-[var(--color-lavender)] py-2">
              Du hast noch keine Freund:innen auf Geheimtrips — teile den Ort so lange als Link.
            </p>
          ) : (
            <>
              <input value={note} onChange={e => setNote(e.target.value)} maxLength={300}
                placeholder="Ein Wort dazu (optional)"
                className="w-full mb-2.5 border border-[var(--color-bg-soft)] rounded-xl px-3 h-10 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)]" />
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto no-scrollbar">
                {friends.map(f => {
                  const done = sent.includes(f.id);
                  return (
                    <div key={f.id} className="flex items-center gap-3 bg-[var(--color-bg)] rounded-2xl p-2">
                      <Avatar name={f.name} src={f.avatarUrl} size={38} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-aubergine)] truncate">{f.name}</p>
                        <p className="text-[11px] text-[var(--color-lavender)] truncate">@{f.handle}</p>
                      </div>
                      <button onClick={() => send(f)} disabled={done || busy === f.id}
                        className={`text-xs font-bold px-3 h-8 rounded-full flex-shrink-0 transition-colors ${
                          done ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' : 'bg-[var(--color-amber)] text-white'}`}>
                        {busy === f.id ? <i className="fa-solid fa-circle-notch fa-spin" />
                          : done ? <><i className="fa-solid fa-check mr-1" />Gesendet</>
                          : 'Senden'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {error && <p className="text-xs text-[var(--color-danger)] mt-2">{error}</p>}
        </div>

        <button onClick={shareLink}
          className="w-full flex items-center justify-center gap-2 bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] font-bold py-3 rounded-xl text-sm">
          <i className="fa-solid fa-arrow-up-from-bracket" />Als Link teilen
        </button>
      </div>
    </BottomSheet>
  );
}
