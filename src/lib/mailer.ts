/**
 * Outgoing email for the API server (password reset links).
 *
 * With `RESEND_API_KEY` and `EMAIL_FROM` set, mail goes out through Resend's
 * HTTP API. Without them (local development) the message is printed to the
 * server log instead, so the reset flow still works end to end.
 *
 * When `DEV_MAILBOX=1` and the server is not in production, the last message
 * sent to each address is also kept in memory and served at
 * `GET /api/dev/mailbox?to=…` so the e2e suite can follow a reset link.
 */

export interface Mail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const devMailbox = new Map<string, Mail>();

export function devMailboxEnabled(): boolean {
  return process.env.DEV_MAILBOX === '1' && process.env.NODE_ENV !== 'production';
}

/** The last message sent to `to` (development mailbox only). */
export function lastMailTo(to: string): Mail | undefined {
  return devMailbox.get(to.toLowerCase());
}

export async function sendMail(mail: Mail): Promise<void> {
  if (devMailboxEnabled()) devMailbox.set(mail.to.toLowerCase(), mail);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.log(`\n[mail] To: ${mail.to}\n[mail] Subject: ${mail.subject}\n${mail.text}\n`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) {
    throw new Error(`Email could not be sent (${res.status}): ${await res.text()}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function passwordResetMail(to: string, name: string, url: string): Mail {
  const greeting = name.trim() ? `Hi ${name.trim()},` : 'Hi,';
  return {
    to,
    subject: 'Reset your Root password',
    text: `${greeting}\n\nSomeone asked to reset the password for your Root account. Open this link to choose a new one:\n\n${url}\n\nThe link works for one hour. If you didn't ask for this, you can ignore this email.`,
    html: `<p>${escapeHtml(greeting)}</p><p>Someone asked to reset the password for your Root account. Open this link to choose a new one:</p><p><a href="${escapeHtml(url)}">Reset your password</a></p><p>The link works for one hour. If you didn't ask for this, you can ignore this email.</p>`,
  };
}
