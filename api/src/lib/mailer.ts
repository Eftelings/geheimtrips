import nodemailer from 'nodemailer';

// SMTP-Konfiguration über Env-Variablen (z. B. netcup-Postfach):
//   SMTP_HOST, SMTP_PORT (587/465), SMTP_USER, SMTP_PASS, SMTP_FROM
// Ist nichts gesetzt, wird die Mail nur ins Log geschrieben (Dev-Fallback) —
// der jeweilige Ablauf funktioniert trotzdem, ohne dass etwas crasht.
const host = process.env.SMTP_HOST?.trim();
const port = Number(process.env.SMTP_PORT ?? 587);

const transport = host
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implizites TLS, 587 = STARTTLS
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER.trim(), pass: (process.env.SMTP_PASS ?? '').trim() }
        : undefined,
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
