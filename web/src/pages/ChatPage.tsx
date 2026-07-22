import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { Avatar } from '../components/ui/Avatar.js';
import { messagesApi, type ChatMessage, type ChatPartner } from '../services/api.js';
import { useMessageSocket } from '../store/useMessageSocket.js';
import type { Place } from '../types/index.js';

interface Props {
  /** Eingebettet im Entdecken-Overlay: ID kommt als Prop, nicht aus der URL. */
  userId?: number;
  /** Ohne AppShell rendern — das Overlay bringt den Rahmen mit. */
  embedded?: boolean;
}

/** Verlauf mit einer Person — Text und verschickte Orte in einem Strang. */
export function ChatPage({ userId, embedded }: Props = {}) {
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const other = userId ?? Number(paramId);
  const [partner, setPartner]   = useState<ChatPartner | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [places, setPlaces]     = useState<Record<string, Place>>({});
  const [draft, setDraft]       = useState('');
  const [busy, setBusy]         = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function load(scroll = true) {
    const d = await messagesApi.thread(other).catch(() => null);
    if (!d) { setMessages([]); return; }
    setPartner(d.partner); setMessages(d.messages); setPlaces(d.places);
    if (scroll) setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 50);
  }
  useEffect(() => { load(); }, [other]); // eslint-disable-line

  /**
   * Live statt Nachfragen: Der Server meldet neue Nachrichten über den offenen Kanal.
   * Betrifft sie diesen Verlauf, laden wir ihn neu — damit sind Ortskacheln und die
   * Lesebestätigung gleich mit dabei, ohne die Antwort hier nachzubauen.
   */
  useEffect(() => useMessageSocket.getState().subscribe(ev => {
    if (ev.type !== 'message') return;
    if (ev.from !== other && ev.to !== other) return;
    load(true);
  }), [other]); // eslint-disable-line

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft('');
    try { await messagesApi.send(other, { text }); await load(); }
    catch (e) { setDraft(text); alert((e as Error).message ?? 'Konnte nicht gesendet werden.'); }
    setBusy(false);
  }

  const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  const time = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const body = (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ minHeight: embedded ? '100%' : 'calc(100dvh - 180px)' }}>
        <div className="flex-1 px-4 py-4 flex flex-col gap-2">
          {messages === null ? (
            <div className="flex justify-center py-16 text-[var(--color-lavender-lt)]">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-[var(--color-lavender)]">
              <i className="fa-regular fa-comments text-4xl mb-3 opacity-30 block" />
              <p className="text-sm">Noch keine Nachrichten. Schreib den ersten Satz.</p>
            </div>
          ) : messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || day(prev.createdAt) !== day(m.createdAt);
            const place = m.placeId ? places[m.placeId] : null;
            return (
              <div key={m.id}>
                {newDay && (
                  <p className="text-center text-[11px] text-[var(--color-lavender-lt)] my-3">{day(m.createdAt)}</p>
                )}
                <div className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${m.fromMe ? 'text-white' : 'bg-white text-[var(--color-body)] shadow-[var(--shadow-card)]'}`}
                    style={m.fromMe ? { background: 'var(--color-aubergine)' } : undefined}>
                    {place && (
                      <button onClick={() => navigate(`/ort/${place.id}`)}
                        className="block w-full text-left mb-1.5 rounded-xl overflow-hidden bg-black/10 active:scale-[0.99] transition-transform">
                        <img src={place.hero} alt="" className="w-full h-28 object-cover" />
                        <span className="block px-2.5 py-2">
                          <span className={`block text-sm font-semibold ${m.fromMe ? 'text-white' : 'text-[var(--color-aubergine)]'}`}>{place.name}</span>
                          <span className={`block text-[11px] ${m.fromMe ? 'text-white/70' : 'text-[var(--color-lavender)]'}`}>{place.region}</span>
                        </span>
                      </button>
                    )}
                    {m.placeId && !place && (
                      <p className={`text-xs italic ${m.fromMe ? 'text-white/70' : 'text-[var(--color-lavender)]'}`}>Dieser Ort ist nicht mehr verfügbar.</p>
                    )}
                    {m.text && <p className="text-sm leading-snug whitespace-pre-wrap">{m.text}</p>}
                    <p className={`text-[10px] mt-0.5 text-right ${m.fromMe ? 'text-white/50' : 'text-[var(--color-lavender-lt)]'}`}>{time(m.createdAt)}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Eingabe — klebt unten über der Navigationsleiste */}
        <div className="sticky bottom-0 px-4 py-3 flex items-end gap-2"
          style={{ background: 'var(--color-bg)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Nachricht schreiben…"
            className="flex-1 resize-none bg-white border border-[var(--color-bg-soft)] rounded-2xl px-3.5 py-2.5 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)] max-h-32" />
          <button onClick={send} disabled={busy || !draft.trim()} aria-label="Senden"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform"
            style={{ background: 'var(--color-amber)' }}>
            <i className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'}`} />
          </button>
        </div>
    </div>
  );

  // Eingebettet bringt das Overlay Kopf und Rahmen mit — dann ohne AppShell.
  return embedded ? body : <AppShell showBack title={partner?.name ?? 'Nachrichten'}>{body}</AppShell>;
}
