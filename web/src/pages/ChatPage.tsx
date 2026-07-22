import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { Avatar } from '../components/ui/Avatar.js';
import { messagesApi, type ChatMessage, type ChatPartner } from '../services/api.js';
import type { Place } from '../types/index.js';

/** Verlauf mit einer Person — Text und verschickte Orte in einem Strang. */
export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const other = Number(id);
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
   * Solange der Verlauf offen UND das Fenster sichtbar ist, alle 6 Sekunden nachsehen.
   * Kein Dauerlauf im Hintergrund: liegt das Telefon in der Tasche, ruht die Abfrage.
   * Eine echte Live-Verbindung waere sparsamer, braucht aber einen eigenen Kanal.
   */
  useEffect(() => {
    let timer = 0;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const d = await messagesApi.thread(other).catch(() => null);
      if (!d) return;
      // Nur eingreifen, wenn wirklich etwas dazugekommen ist — sonst flackert die Liste.
      setMessages(prev => (prev && d.messages.length === prev.length ? prev : d.messages));
      setPlaces(d.places);
    };
    const start = () => { window.clearInterval(timer); timer = window.setInterval(tick, 6000); };
    const onVis = () => { if (document.visibilityState === 'visible') { tick(); start(); } else window.clearInterval(timer); };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [other]);

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

  return (
    <AppShell showBack title={partner?.name ?? 'Nachrichten'}>
      <div className="max-w-2xl mx-auto flex flex-col" style={{ minHeight: 'calc(100dvh - 180px)' }}>
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
    </AppShell>
  );
}
