import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { Avatar } from '../components/ui/Avatar.js';
import { messagesApi, type ChatMessage, type ChatPartner, type LiveShare } from '../services/api.js';
import { BottomSheet } from '../components/ui/BottomSheet.js';
import { mediaApi } from '../services/api.js';
import { isOpenNow, HOUR_DAYS } from '../data/detailQuestions.js';
import type { WeekHours } from '../data/detailQuestions.js';
import { useMessageSocket } from '../store/useMessageSocket.js';
import type { Place } from '../types/index.js';

/**
 * Oeffnungsstatus fuer einen geteilten Ort — der eigentliche Gewinn daran, dass es
 * unsere Plattform ist: Wer einen Tipp bekommt, sieht sofort, ob sich der Weg gerade
 * lohnt. Ohne hinterlegte Zeiten geben wir nichts aus, statt etwas zu behaupten.
 */
function openingNote(place: Place): { text: string; tone: 'open' | 'soon' | 'closed' } | null {
  const answers = ((place.attributes as Record<string, unknown> | undefined)?.answers ?? {}) as Record<string, unknown>;
  const raw = answers.opening_hours;
  const hours = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as (WeekHours & { alwaysOpen?: boolean }) : null;
  if (!hours) return null;
  if (hours.alwaysOpen) return { text: 'Rund um die Uhr geöffnet', tone: 'open' };

  const open = isOpenNow(hours);
  if (open === null) return null;

  const now = new Date();
  const key = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'][now.getDay()];
  const today = hours[key];
  const label = HOUR_DAYS.find(([k]) => k === key)?.[1] ?? '';
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  const cur = now.getHours() * 60 + now.getMinutes();

  if (open && today?.close) {
    const left = toMin(today.close) - cur;
    // „Schließt bald" ist die Information, die wirklich zaehlt — eine Stunde vorher.
    if (left > 0 && left <= 60) return { text: `Schließt in ${left} Min (${today.close} Uhr)`, tone: 'soon' };
    return { text: `Jetzt geöffnet bis ${today.close} Uhr`, tone: 'open' };
  }
  if (!open) {
    if (today?.open && !today.closed && toMin(today.open) > cur) {
      return { text: `Geschlossen — öffnet ${label} um ${today.open} Uhr`, tone: 'closed' };
    }
    return { text: 'Gerade geschlossen', tone: 'closed' };
  }
  return null;
}

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
  const [live, setLive]         = useState<LiveShare[]>([]);
  const [locSheet, setLocSheet] = useState(false);
  const [locBusy, setLocBusy]   = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const watchRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgBusy, setImgBusy] = useState(false);

  const myShare    = live.find(l => l.mine && new Date(l.expiresAt) > new Date());
  const theirShare = live.find(l => !l.mine && new Date(l.expiresAt) > new Date());

  /** Position einmal holen — Fehler sind hier häufig (kein Zugriff, kein Signal). */
  const currentPosition = () => new Promise<GeolocationPosition>((res, rej) => {
    if (!navigator.geolocation) { rej(new Error('Dein Gerät gibt den Standort nicht her.')); return; }
    navigator.geolocation.getCurrentPosition(res, e => rej(new Error(
      e.code === e.PERMISSION_DENIED ? 'Standortzugriff ist nicht erlaubt.' : 'Standort konnte nicht ermittelt werden.',
    )), { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  });

  /** Einzelner Pin: bleibt als Nachricht im Verlauf stehen. */
  async function sendPin() {
    setLocBusy(true);
    try {
      const p = await currentPosition();
      await messagesApi.send(other, { lat: p.coords.latitude, lng: p.coords.longitude });
      setLocSheet(false);
      await load();
    } catch (e) { alert((e as Error).message); }
    setLocBusy(false);
  }

  /**
   * Live-Freigabe starten. Danach verfolgt das Gerät die Position und schiebt sie nach —
   * gedrosselt auf 15 Sekunden bzw. 25 Meter, sonst kostet es Akku und Datenvolumen,
   * ohne dass man auf der Karte einen Unterschied sähe.
   */
  async function startLive(minutes: number) {
    setLocBusy(true);
    try {
      const p = await currentPosition();
      const r = await messagesApi.live(other, { lat: p.coords.latitude, lng: p.coords.longitude, minutes });
      setLive(l => [...l.filter(x => !x.mine), {
        userId: -1, mine: true, lat: p.coords.latitude, lng: p.coords.longitude,
        updatedAt: new Date().toISOString(), expiresAt: r.expiresAt,
      }]);
      setLocSheet(false);
      startWatch();
    } catch (e) { alert((e as Error).message); }
    setLocBusy(false);
  }

  function startWatch() {
    if (watchRef.current != null || !navigator.geolocation) return;
    let lastSent = 0;
    let lastPos: { lat: number; lng: number } | null = null;
    const meters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    watchRef.current = navigator.geolocation.watchPosition(pos => {
      const now = Date.now();
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const far = !lastPos || meters(lastPos, next) > 25;
      if (now - lastSent < 15000 && !far) return;
      lastSent = now; lastPos = next;
      messagesApi.live(other, next).catch(() => stopWatch());   // Freigabe abgelaufen → aufhören
    }, () => { /* kein Signal → beim nächsten Mal wieder */ }, { enableHighAccuracy: true, maximumAge: 10000 });
  }
  function stopWatch() {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
  }
  async function stopLive() {
    stopWatch();
    setLive(l => l.filter(x => !x.mine));
    await messagesApi.liveStop(other).catch(() => {});
  }

  // Läuft beim Öffnen schon eine eigene Freigabe (anderes Gerät, Neuladen), weiterverfolgen.
  useEffect(() => { if (myShare) startWatch(); }, [!!myShare]); // eslint-disable-line
  useEffect(() => () => stopWatch(), []);

  async function load(scroll = true) {
    const d = await messagesApi.thread(other).catch(() => null);
    if (!d) { setMessages([]); return; }
    setPartner(d.partner); setMessages(d.messages); setPlaces(d.places); setLive(d.live ?? []);
    if (scroll) setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 50);
  }
  useEffect(() => { load(); }, [other]); // eslint-disable-line

  /**
   * Live statt Nachfragen: Der Server meldet neue Nachrichten über den offenen Kanal.
   * Betrifft sie diesen Verlauf, laden wir ihn neu — damit sind Ortskacheln und die
   * Lesebestätigung gleich mit dabei, ohne die Antwort hier nachzubauen.
   */
  useEffect(() => useMessageSocket.getState().subscribe(ev => {
    if (ev.type === 'message') {
      if (ev.from !== other && ev.to !== other) return;
      load(true);
      return;
    }
    // Standort des Gegenübers wandert — nur den Punkt ersetzen, nicht den Verlauf neu laden.
    if (ev.type === 'live' && ev.from === other) {
      setLive(l => [...l.filter(x => x.mine), {
        userId: other, mine: false, lat: ev.lat, lng: ev.lng,
        updatedAt: new Date().toISOString(), expiresAt: ev.expiresAt,
      }]);
    }
    if (ev.type === 'live_stop' && ev.from === other) setLive(l => l.filter(x => x.mine));
  }), [other]); // eslint-disable-line

  /** Bild verschicken — erst hochladen, dann als Nachricht anhaengen. */
  async function sendImage(file: File) {
    setImgBusy(true);
    try {
      const { url } = await mediaApi.upload(file);
      await messagesApi.send(other, { imageUrl: url });
      await load();
    } catch (e) { alert((e as Error).message ?? 'Bild konnte nicht gesendet werden.'); }
    setImgBusy(false);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft('');
    try { await messagesApi.send(other, { text }); await load(); }
    catch (e) { setDraft(text); alert((e as Error).message ?? 'Konnte nicht gesendet werden.'); }
    setBusy(false);
  }

  /** Restlaufzeit einer Freigabe in Worten — „noch 12 Min" liest sich besser als eine Uhrzeit. */
  const minutesLeft = (iso: string) => {
    const min = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
    return min >= 60 ? `${Math.floor(min / 60)} Std ${min % 60} Min` : `${min} Min`;
  };
  const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  const time = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const body = (
    <div className="relative max-w-2xl mx-auto flex flex-col flex-1"
      style={embedded ? { height: '100%' } : { minHeight: 'calc(100dvh - 180px)' }}>
        {/* Titelbild der Person als Hintergrund — stark aufgehellt, damit der Text
            lesbar bleibt und das Bild nur als Anmutung wirkt. */}
        {partner?.coverUrl && (
          <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
            <img src={partner.coverUrl} alt="" className="w-full h-full object-cover"
              style={{ objectPosition: `${(partner.coverCropX ?? 0.5) * 100}% ${(partner.coverCropY ?? 0.5) * 100}%` }} />
            {/* Gleichmaessiger Schleier ueber das ganze Overlay: das Titelbild bleibt als
                Anmutung erkennbar, Text und Blasen liegen aber auf ruhigem Grund. */}
            <div className="absolute inset-0" style={{ background: 'rgba(251,249,252,0.94)' }} />
          </div>
        )}

        {/* Wer schreibt hier mit — Bild und Name bleiben beim Scrollen oben stehen */}
        {partner && (
          /* Kein Schleier hier — der Kopf steht direkt auf dem Titelbild. Links bleibt
             Platz fuer den Zurueck-Knopf des Overlays, sonst laege er auf dem Bild. */
          <div className="sticky top-0 z-20 flex items-center gap-3 pb-2.5 pr-4"
            style={{ paddingLeft: embedded ? 60 : 16, paddingTop: embedded ? 20 : 10 }}>
            <button onClick={() => navigate(`/u/${partner.id}`)} className="flex items-center gap-3 min-w-0 active:scale-[0.99] transition-transform">
              <span className="rounded-full" style={{ boxShadow: '0 0 0 2px rgba(255,255,255,.9)' }}>
                <Avatar name={partner.name} src={partner.avatarUrl} size={36}
                  cropX={partner.avatarCropX} cropY={partner.avatarCropY} zoom={partner.avatarZoom} />
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-sm font-bold truncate text-[var(--color-aubergine)]">{partner.name}</span>
                <span className="block text-[11px] truncate text-[var(--color-lavender)]">@{partner.handle}</span>
              </span>
            </button>
          </div>
        )}

        <div className={`relative z-10 flex-1 px-4 py-4 flex flex-col gap-2 ${embedded ? 'overflow-y-auto no-scrollbar' : ''}`}>
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
                    {place && (() => {
                      const note = openingNote(place);
                      const tone = note?.tone === 'open' ? 'var(--color-success)'
                                 : note?.tone === 'soon' ? 'var(--color-amber)' : '#e05858';
                      return (
                        <button onClick={() => navigate(`/ort/${place.id}`)}
                          className="block w-full text-left mb-1.5 rounded-xl overflow-hidden bg-black/10 active:scale-[0.99] transition-transform">
                          <img src={place.hero} alt="" className="w-full h-28 object-cover" />
                          <span className="block px-2.5 py-2">
                            <span className={`block text-sm font-semibold ${m.fromMe ? 'text-white' : 'text-[var(--color-aubergine)]'}`}>{place.name}</span>
                            <span className={`block text-[11px] ${m.fromMe ? 'text-white/70' : 'text-[var(--color-lavender)]'}`}>{place.region}</span>
                            {/* Live-Angabe: der Vorteil der eigenen Plattform */}
                            {note && (
                              <span className="flex items-center gap-1.5 mt-1">
                                <span style={{ width: 7, height: 7, borderRadius: 99, background: tone, flexShrink: 0 }} />
                                <span className={`text-[11px] font-semibold ${m.fromMe ? 'text-white/90' : 'text-[var(--color-aubergine)]'}`}>{note.text}</span>
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })()}
                    {m.imageUrl && (
                      <img src={m.imageUrl} alt="" loading="lazy"
                        onClick={() => window.open(m.imageUrl!, '_blank', 'noopener')}
                        className="w-full max-h-72 object-cover rounded-xl mb-1 cursor-pointer" />
                    )}
                    {m.placeId && !place && (
                      <p className={`text-xs italic ${m.fromMe ? 'text-white/70' : 'text-[var(--color-lavender)]'}`}>Dieser Ort ist nicht mehr verfügbar.</p>
                    )}
                    {m.lat != null && m.lng != null && (
                      <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`, '_blank', 'noopener')}
                        className={`flex items-center gap-2 mb-1 rounded-xl px-2.5 py-2 w-full text-left ${m.fromMe ? 'bg-white/10' : 'bg-[var(--color-bg)]'}`}>
                        <i className="fa-solid fa-location-dot" style={{ color: 'var(--color-amber)' }} />
                        <span className={`text-sm font-semibold ${m.fromMe ? 'text-white' : 'text-[var(--color-aubergine)]'}`}>Standort</span>
                        <i className={`fa-solid fa-arrow-up-right-from-square text-[10px] ml-auto ${m.fromMe ? 'text-white/50' : 'text-[var(--color-lavender-lt)]'}`} />
                      </button>
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

        {/* Laufende Freigaben — eigene zum Beenden, fremde als Hinweis */}
        {(myShare || theirShare) && (
          <div className="sticky bottom-[76px] px-4 pb-1 flex flex-col gap-1.5">
            {myShare && (
              <div className="flex items-center gap-2 rounded-2xl px-3 py-2 text-white text-xs"
                style={{ background: 'var(--color-aubergine)' }}>
                <i className="fa-solid fa-location-crosshairs" />
                <span className="flex-1">Du teilst deinen Standort — noch {minutesLeft(myShare.expiresAt)}</span>
                <button onClick={stopLive} className="font-bold underline">Beenden</button>
              </div>
            )}
            {theirShare && (
              <div className="flex items-center gap-2 rounded-2xl px-3 py-2 text-xs bg-white shadow-[var(--shadow-card)]">
                <i className="fa-solid fa-location-crosshairs" style={{ color: 'var(--color-amber)' }} />
                <span className="flex-1 text-[var(--color-aubergine)]">
                  {partner?.name ?? 'Dein Gegenüber'} teilt gerade den Standort — noch {minutesLeft(theirShare.expiresAt)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Eingabe — klebt unten über der Navigationsleiste */}
        <div className="sticky bottom-0 z-20 px-3 pt-2.5 flex items-end gap-1.5"
          style={{ background: '#fff', boxShadow: '0 -6px 18px rgba(52,37,76,0.06)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}>
          <button onClick={() => setLocSheet(true)} aria-label="Standort teilen" title="Standort teilen"
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
            style={{ background: 'var(--color-amber)', color: 'white' }}>
            <i className="fa-solid fa-location-dot text-sm" />
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={imgBusy} aria-label="Bild senden" title="Bild senden"
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: 'var(--color-bg-soft)', color: 'var(--color-aubergine)' }}>
            <i className={`fa-solid ${imgBusy ? 'fa-circle-notch fa-spin' : 'fa-plus'} text-sm`} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) sendImage(f); }} />
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Nachricht schreiben…"
            className="flex-1 resize-none bg-white border border-[var(--color-bg-soft)] rounded-2xl px-3.5 py-2.5 text-sm text-[var(--color-aubergine)] outline-none focus:border-[var(--color-amber)] max-h-32" />
          <button onClick={send} disabled={busy || !draft.trim()} aria-label="Senden"
            className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform"
            style={{ background: 'var(--color-aubergine)' }}>
            <i className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'}`} />
          </button>
        </div>
      {/* Standort teilen — einmalig oder auf Zeit */}
      {locSheet && (
        <BottomSheet open onClose={() => setLocSheet(false)} title="Standort teilen">
          <div className="flex flex-col gap-3">
            <button onClick={sendPin} disabled={locBusy}
              className="w-full flex items-center gap-3 rounded-2xl border border-[var(--color-bg-soft)] bg-white p-3.5 text-left disabled:opacity-50">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-amber)', color: 'white' }}>
                <i className="fa-solid fa-location-dot text-sm" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-[var(--color-aubergine)]">Aktuellen Standort senden</span>
                <span className="block text-xs text-[var(--color-lavender)]">Bleibt als Pin im Verlauf stehen.</span>
              </span>
            </button>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-lavender)] mb-2">
                Live teilen — endet von selbst
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[[15, '15 Min'], [60, '1 Stunde'], [480, '8 Stunden']].map(([min, label]) => (
                  <button key={String(min)} onClick={() => startLive(min as number)} disabled={locBusy}
                    className="rounded-2xl border border-[var(--color-bg-soft)] bg-white py-3 text-sm font-semibold text-[var(--color-aubergine)] disabled:opacity-50">
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[var(--color-lavender)] mt-2 leading-relaxed">
                Deine Position geht nur an {partner?.name ?? 'diese Person'} und wird alle paar Sekunden
                aktualisiert. Du kannst jederzeit vorzeitig beenden.
              </p>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );

  // Eingebettet bringt das Overlay Kopf und Rahmen mit — dann ohne AppShell.
  return embedded ? body : <AppShell showBack title={partner?.name ?? 'Nachrichten'}>{body}</AppShell>;
}
