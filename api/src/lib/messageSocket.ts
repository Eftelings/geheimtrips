import type { WebSocket } from 'ws';
import { jwtVerify } from 'jose';
import { JWT_SECRET } from '../middleware/auth.js';

/**
 * Live-Kanal für Direktnachrichten — hängt am selben WebSocket-Server wie das
 * Geheimquiz, nur an einem anderen Pfad (/api/messages/ws).
 *
 * Warum überhaupt: Ohne Live-Verbindung müsste die App im Sekundentakt nachfragen,
 * ob etwas Neues da ist — Last, die fast immer umsonst entsteht. Hier meldet der
 * Server von sich aus, und zwar nur dann, wenn es wirklich etwas zu melden gibt.
 *
 * Die Anmeldung läuft über das JWT im Query-String: Browser können bei WebSockets
 * keine Header setzen, ein Cookie gibt es nicht (die App arbeitet mit Bearer-Token).
 */

/** Was der Server schickt. `message` = neue Nachricht, `read` = Gegenüber hat gelesen. */
export type SocketEvent =
  | { type: 'message'; from: number; to: number; message: { id: number; text: string | null; placeId: string | null; lat?: number | null; lng?: number | null; imageUrl?: string | null; createdAt: string } }
  | { type: 'read'; by: number }
  // Live-Standort: jede neue Position kommt hier an, bis die Freigabe endet.
  | { type: 'live'; from: number; lat: number; lng: number; expiresAt: string }
  | { type: 'live_stop'; from: number };

// Eine Person kann mehrere Geräte/Tabs offen haben — deshalb ein Set je Nutzer:in.
const sockets = new Map<number, Set<WebSocket>>();

/** Verbindung annehmen: Token prüfen, Socket merken, am Leben halten. */
export async function handleMessageConnection(ws: WebSocket, url: string): Promise<void> {
  let userId: number | null = null;
  try {
    const token = new URL(url, 'http://localhost').searchParams.get('token');
    if (token) {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const id = (payload as { userId?: number }).userId;
      if (typeof id === 'number') userId = id;
    }
  } catch { /* ungültiges Token → gleich schließen */ }

  if (!userId) { ws.close(4001, 'Nicht angemeldet'); return; }

  const set = sockets.get(userId) ?? new Set<WebSocket>();
  set.add(ws);
  sockets.set(userId, set);

  // Herzschlag: Railway und andere Proxys kappen stille Verbindungen nach einigen
  // Minuten. Ein Ping alle 25 Sekunden hält sie offen und erkennt tote Sockets.
  let alive = true;
  ws.on('pong', () => { alive = true; });
  const beat = setInterval(() => {
    if (!alive) { ws.terminate(); return; }
    alive = false;
    try { ws.ping(); } catch { /* Socket schon zu */ }
  }, 25_000);

  const drop = () => {
    clearInterval(beat);
    const s = sockets.get(userId!);
    if (s) { s.delete(ws); if (!s.size) sockets.delete(userId!); }
  };
  ws.on('close', drop);
  ws.on('error', drop);

  try { ws.send(JSON.stringify({ type: 'ready' })); } catch { /* egal */ }
}

/** Ereignis an alle offenen Verbindungen einer Person schicken (falls welche da sind). */
export function pushToUser(userId: number, event: SocketEvent): void {
  const set = sockets.get(userId);
  if (!set?.size) return;
  const payload = JSON.stringify(event);
  for (const ws of set) {
    // readyState 1 = OPEN; alles andere überspringen statt zu werfen.
    if (ws.readyState === 1) { try { ws.send(payload); } catch { /* nächster */ } }
  }
}

/** Nur für Diagnose: wie viele Personen sind gerade verbunden? */
export function connectedUsers(): number { return sockets.size; }
