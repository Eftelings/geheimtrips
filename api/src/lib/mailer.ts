import nodemailer from 'nodemailer';
import dns from 'node:dns';

// Cloud-Hoster wie Railway haben kein IPv6-Egress. Löst ein Hostname sowohl A (IPv4)
// als auch AAAA (IPv6) auf, wählt Node sonst evtl. IPv6 → „ENETUNREACH"/Timeout.
// IPv4 bevorzugen behebt das für SMTP (und alle anderen ausgehenden Verbindungen).
dns.setDefaultResultOrder('ipv4first');

// SMTP-Konfiguration über Env-Variablen (z. B. netcup-Postfach):
//   SMTP_HOST, SMTP_PORT (587/465), SMTP_USER, SMTP_PASS, SMTP_FROM
// Ist nichts gesetzt, wird die Mail nur ins Log geschrieben (Dev-Fallback) —
// der jeweilige Ablauf funktioniert trotzdem, ohne dass etwas crasht.
const host = process.env.SMTP_HOST?.trim();
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER?.trim();
const pass = (process.env.SMTP_PASS ?? '').trim();

const transport = host
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implizites TLS, 587 = STARTTLS
      auth: user ? { user, pass } : undefined,
      // Schneller, klarer Fehler statt langem Hängen (IPv4 wird global erzwungen, s.o.)
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

const FROM = process.env.SMTP_FROM?.trim() || 'Geheimtrips.de <info@geheimtrips.de>';

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }) {
  if (!transport) {
    console.log(`[Mail nicht konfiguriert] An: ${opts.to} · Betreff: ${opts.subject}\n${opts.text}\n`);
    return;
  }
  await transport.sendMail({ from: FROM, ...opts });
}

export const mailConfigured = !!transport;

// E-Mail-Adresse für die Diagnose maskieren (nie das volle Postfach/Passwort verraten)
function maskEmail(addr: string): string {
  const [local, domain] = addr.split('@');
  if (!domain) return addr.slice(0, 2) + '…';
  const shown = local.slice(0, 2);
  return `${shown}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/** Aktueller (maskierter) SMTP-Status — für die Admin-Diagnose. */
export function mailStatus() {
  return {
    configured: !!transport,
    host:    host ?? null,
    port,
    secure:  port === 465,
    user:    user ? maskEmail(user) : null,
    hasAuth: !!user,
    hasPass: !!pass,
    from:    FROM,
  };
}

/** Prüft Verbindung + Login beim SMTP-Server, ohne eine Mail zu senden. */
export async function verifyMail(): Promise<{ ok: boolean; error?: string }> {
  if (!transport) {
    return { ok: false, error: 'SMTP ist nicht konfiguriert — SMTP_HOST fehlt.' };
  }
  try {
    await transport.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Beim Start einmal prüfen, damit der Status klar in den Deploy-Logs steht.
if (transport) {
  transport.verify()
    .then(() => console.log(`[Mail] SMTP bereit · ${host}:${port} (secure=${port === 465}) · from ${FROM}`))
    .catch((e: unknown) =>
      console.error(`[Mail] SMTP-Verbindung FEHLGESCHLAGEN · ${host}:${port}:`, (e as Error).message));
} else {
  console.warn('[Mail] SMTP NICHT konfiguriert — Mails werden nur geloggt. Setze SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.');
}
