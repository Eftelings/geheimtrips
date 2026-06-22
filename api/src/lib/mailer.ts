import nodemailer from 'nodemailer';
import dns from 'node:dns';

// Cloud-Hoster wie Railway haben kein IPv6-Egress. Löst ein Hostname sowohl A (IPv4)
// als auch AAAA (IPv6) auf, wählt Node sonst evtl. IPv6 → „ENETUNREACH"/Timeout.
// IPv4 bevorzugen behebt das für alle ausgehenden Verbindungen.
dns.setDefaultResultOrder('ipv4first');

// ── Versand-Methode ─────────────────────────────────────────────────────────────
// 1) RESEND_API_KEY gesetzt  → Versand über die Resend-HTTP-API (Port 443).
//    Empfohlen auf Railway, da dort ausgehendes SMTP (25/465/587) geblockt ist.
// 2) sonst SMTP_HOST gesetzt → klassisches SMTP (funktioniert lokal / auf Hostern ohne SMTP-Sperre).
// 3) sonst                   → Mail wird nur ins Log geschrieben (Dev-Fallback).
const host = process.env.SMTP_HOST?.trim();
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER?.trim();
const pass = (process.env.SMTP_PASS ?? '').trim();
const RESEND_KEY = process.env.RESEND_API_KEY?.trim();

const transport = host
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implizites TLS, 587 = STARTTLS
      auth: user ? { user, pass } : undefined,
      // Schneller, klarer Fehler statt langem Hängen
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

const FROM = process.env.SMTP_FROM?.trim() || 'Geheimtrips.de <info@geheimtrips.de>';

export type MailProvider = 'resend' | 'smtp' | 'none';
const provider: MailProvider = RESEND_KEY ? 'resend' : transport ? 'smtp' : 'none';

interface MailOpts { to: string; subject: string; html: string; text: string }

async function sendViaResend(opts: MailOpts): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { message?: string; name?: string };
    throw new Error(data.message || data.name || `Resend antwortete mit HTTP ${res.status}`);
  }
}

export async function sendMail(opts: MailOpts): Promise<void> {
  if (provider === 'resend') return sendViaResend(opts);
  if (provider === 'smtp') { await transport!.sendMail({ from: FROM, ...opts }); return; }
  console.log(`[Mail nicht konfiguriert] An: ${opts.to} · Betreff: ${opts.subject}\n${opts.text}\n`);
}

export const mailConfigured = provider !== 'none';

// E-Mail-Adresse für die Diagnose maskieren (nie das volle Postfach/Passwort verraten)
function maskEmail(addr: string): string {
  const [local, domain] = addr.split('@');
  if (!domain) return addr.slice(0, 2) + '…';
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/** Aktueller (maskierter) Mail-Status — für die Admin-Diagnose. */
export function mailStatus() {
  return {
    provider,
    configured: provider !== 'none',
    host:    host ?? null,
    port,
    secure:  port === 465,
    user:    user ? maskEmail(user) : null,
    hasAuth: !!user,
    hasPass: !!pass,
    from:    FROM,
    hasResendKey: !!RESEND_KEY,
  };
}

/** Prüft, ob der gewählte Versandweg grundsätzlich funktioniert (ohne Mail zu senden). */
export async function verifyMail(): Promise<{ ok: boolean; error?: string }> {
  if (provider === 'resend') {
    try {
      // Schlanker Key-Check: gültiger Key → 200, ungültiger → 401.
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${RESEND_KEY}` },
      });
      if (res.ok) return { ok: true };
      if (res.status === 401) return { ok: false, error: 'Resend-API-Key ungültig (401 Unauthorized).' };
      return { ok: false, error: `Resend API antwortete mit HTTP ${res.status}.` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  if (provider === 'smtp') {
    try { await transport!.verify(); return { ok: true }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  }
  return { ok: false, error: 'Kein Versand konfiguriert — setze RESEND_API_KEY (empfohlen) oder SMTP_HOST.' };
}

// Beim Start einmal den Status loggen, damit er klar in den Deploy-Logs steht.
if (provider === 'resend') {
  console.log(`[Mail] Versand über Resend (HTTP API) · from ${FROM}`);
} else if (provider === 'smtp' && transport) {
  transport.verify()
    .then(() => console.log(`[Mail] SMTP bereit · ${host}:${port} (secure=${port === 465}) · from ${FROM}`))
    .catch((e: unknown) =>
      console.error(`[Mail] SMTP-Verbindung FEHLGESCHLAGEN · ${host}:${port}:`, (e as Error).message));
} else {
  console.warn('[Mail] NICHT konfiguriert — Mails werden nur geloggt. Auf Railway: RESEND_API_KEY setzen (SMTP ist dort geblockt).');
}
