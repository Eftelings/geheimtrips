import { create } from 'zustand';

/**
 * Live-Verbindung für Direktnachrichten. Eine einzige Verbindung für die ganze App:
 * Postfach, Verlauf und der Punkt in der Navigation hören alle hier mit.
 *
 * Statt im Sekundentakt nachzufragen, meldet sich der Server von selbst. Er hält die
 * Leitung mit einem Ping offen; fällt sie trotzdem (Netzwechsel, Schlafmodus), bauen
 * wir sie mit wachsendem Abstand neu auf — sofort beim ersten Mal, dann langsamer,
 * damit ein kaputter Server nicht im Sekundentakt angerufen wird.
 */
export interface IncomingMessage {
  id: number; text: string | null; placeId: string | null; createdAt: string;
}
export type SocketEvent =
  | { type: 'ready' }
  | { type: 'message'; from: number; to: number; message: IncomingMessage }
  | { type: 'read'; by: number };

type Listener = (e: SocketEvent) => void;

const WS_BASE = import.meta.env.VITE_WS_URL
  ? String(import.meta.env.VITE_WS_URL).replace('/game/ws', '/messages/ws')
  : `${location.protocol.replace('http', 'ws')}//${location.host}/api/messages/ws`;

interface State {
  connected: boolean;
  /** Ungelesene Nachrichten insgesamt — speist den Punkt in der Navigation. */
  unread: number;
  connect: () => void;
  disconnect: () => void;
  setUnread: (n: number) => void;
  subscribe: (fn: Listener) => () => void;
}

let socket: WebSocket | null = null;
let retry = 0;
let retryTimer = 0;
const listeners = new Set<Listener>();

export const useMessageSocket = create<State>((set, get) => ({
  connected: false,
  unread: 0,

  setUnread: (n) => set({ unread: Math.max(0, n) }),

  subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },

  connect: () => {
    const token = localStorage.getItem('gt_token');
    if (!token || socket) return;   // ohne Anmeldung kein Kanal; doppelt verbinden nie

    const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);
    socket = ws;

    ws.onopen = () => { retry = 0; set({ connected: true }); };

    ws.onmessage = (e) => {
      let ev: SocketEvent;
      try { ev = JSON.parse(String(e.data)); } catch { return; }
      // Der Zähler wandert nur nach oben, wenn die Nachricht an MICH ging — was
      // „ich" ist, weiß hier niemand, deshalb entscheidet das die Oberfläche.
      for (const fn of listeners) fn(ev);
    };

    const retryLater = () => {
      socket = null;
      set({ connected: false });
      // 1s, 2s, 4s … höchstens 30s. Kein Wiederaufbau ohne Anmeldung.
      if (!localStorage.getItem('gt_token')) return;
      const wait = Math.min(30_000, 1000 * 2 ** retry++);
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => get().connect(), wait);
    };
    ws.onclose = retryLater;
    ws.onerror = () => { try { ws.close(); } catch { /* schon zu */ } };
  },

  disconnect: () => {
    window.clearTimeout(retryTimer);
    retry = 0;
    const ws = socket;
    socket = null;
    set({ connected: false });
    if (ws) { ws.onclose = null; try { ws.close(); } catch { /* egal */ } }
  },
}));
