// ============================================================================
// MAILER — a tiny, dependency-free email sender used by reminders and reports.
//
// It talks to a transactional-email HTTP API over fetch (no SMTP library, so
// nothing new to install and nothing to break a Cloud Build). Two providers
// are supported via env vars; pick whichever you have:
//
//   Resend  — RESEND_API_KEY, MAIL_FROM            (https://resend.com)
//   Mailgun — MAILGUN_API_KEY, MAILGUN_DOMAIN, MAIL_FROM
//
// With neither configured the mailer is in DRY-RUN: sendEmail() returns
// { sent:false, dryRun:true } without erroring, so the UI can show exactly
// what WOULD be sent. That keeps the whole feature usable before email is
// wired, and makes the "set this secret" step obvious.
// ============================================================================

export interface MailMessage {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

export interface MailResult {
  sent: boolean;
  dryRun: boolean;
  provider: 'resend' | 'mailgun' | 'none';
  to: string[];
  error?: string;
}

export interface MailerStatus {
  configured: boolean;
  provider: 'resend' | 'mailgun' | 'none';
  from: string | null;
}

const from = () => process.env.MAIL_FROM || process.env.SMTP_FROM || '';

function provider(): 'resend' | 'mailgun' | 'none' {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) return 'mailgun';
  return 'none';
}

export function mailerStatus(): MailerStatus {
  const p = provider();
  return { configured: p !== 'none' && Boolean(from()), provider: p, from: from() || null };
}

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export async function sendEmail(msg: MailMessage): Promise<MailResult> {
  const to = msg.to.map((t) => t.trim()).filter(Boolean);
  const p = provider();
  const sender = from();

  if (to.length === 0) return { sent: false, dryRun: true, provider: p, to, error: 'No recipients.' };
  if (p === 'none' || !sender) {
    return { sent: false, dryRun: true, provider: 'none', to };
  }

  try {
    if (p === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: sender, to, subject: msg.subject, html: msg.html, text: msg.text ?? stripHtml(msg.html) }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { sent: true, dryRun: false, provider: 'resend', to };
    }
    // Mailgun — form-encoded.
    const domain = process.env.MAILGUN_DOMAIN as string;
    const body = new URLSearchParams();
    body.set('from', sender);
    to.forEach((t) => body.append('to', t));
    body.set('subject', msg.subject);
    body.set('html', msg.html);
    body.set('text', msg.text ?? stripHtml(msg.html));
    const auth = Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64');
    const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Mailgun ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { sent: true, dryRun: false, provider: 'mailgun', to };
  } catch (err) {
    return { sent: false, dryRun: false, provider: p, to, error: err instanceof Error ? err.message : 'Send failed.' };
  }
}
