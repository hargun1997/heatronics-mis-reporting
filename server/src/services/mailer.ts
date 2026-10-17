// ============================================================================
// MAILER — one email sender for reminders, task summaries and reports.
//
// Providers, first match wins:
//   SMTP    — Zoho Mail (default for Heatronics). Password from env SMTP_PASS
//             or saved from the app (Tasks → Reminders → Connect email),
//             stored in the config store and never sent back to the browser.
//             Defaults: smtp.zoho.in:465 (SSL), user contact@heatronics.in,
//             from "Hargun <hargun@heatronics.in>" (an alias of that mailbox).
//             Override with SMTP_HOST / SMTP_PORT / SMTP_USER / MAIL_FROM.
//   Resend  — RESEND_API_KEY, MAIL_FROM
//   Mailgun — MAILGUN_API_KEY, MAILGUN_DOMAIN, MAIL_FROM
//
// With none configured the mailer is in DRY-RUN: sendEmail() returns
// { sent:false, dryRun:true } without erroring, so the UI can show exactly
// what WOULD be sent.
// ============================================================================

import nodemailer from 'nodemailer';
import { readJson, writeJson } from '../ingest/objectStore.js';

export interface MailMessage {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
}

export type Provider = 'smtp' | 'resend' | 'mailgun' | 'none';

export interface MailResult {
  sent: boolean;
  dryRun: boolean;
  provider: Provider;
  to: string[];
  error?: string;
}

export interface MailerStatus {
  configured: boolean;
  provider: Provider;
  from: string | null;
  /** SMTP only: where the settings come from. */
  source?: 'env' | 'app';
  host?: string;
  user?: string;
}

/** SMTP settings saved from the app (config store key "mail-config"). */
interface StoredSmtp {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
  updatedAt?: string;
}

const DEFAULTS = { host: 'smtp.zoho.in', port: 465, user: 'contact@heatronics.in', from: 'Hargun <hargun@heatronics.in>' };

let stored: StoredSmtp = {};
let loadedAt = 0;
/** Re-read saved settings at most once a minute (other instances may have saved). */
const ensureLoaded = async () => {
  if (Date.now() - loadedAt > 60_000) await refreshMailConfig();
};

/** Load the saved SMTP settings (cached; call before reading status). */
export async function refreshMailConfig(): Promise<void> {
  try {
    stored = await readJson<StoredSmtp>('mail-config', {});
  } catch {
    stored = {};
  }
  loadedAt = Date.now();
}

/**
 * Save SMTP settings from the app — only after Zoho accepts the login, so a
 * wrong password never replaces a working one.
 */
export async function saveMailConfig(input: StoredSmtp): Promise<{ status: MailerStatus; check: { ok: boolean; error?: string } }> {
  await refreshMailConfig();
  if (input.pass === '-') {
    stored = { ...stored, pass: undefined, updatedAt: new Date().toISOString() };
    await writeJson('mail-config', stored);
    return { status: mailerStatus(), check: { ok: true } };
  }
  const next: StoredSmtp = {
    host: input.host?.trim() || stored.host,
    port: Number(input.port) || stored.port,
    user: input.user?.trim() || stored.user,
    pass: input.pass?.trim() || stored.pass,
    from: input.from?.trim() || stored.from,
    updatedAt: new Date().toISOString(),
  };
  if (!next.pass) return { status: mailerStatus(), check: { ok: false, error: 'Enter the app password.' } };
  try {
    await nodemailer
      .createTransport({
        host: next.host || DEFAULTS.host,
        port: next.port || DEFAULTS.port,
        secure: (next.port || DEFAULTS.port) === 465,
        auth: { user: next.user || DEFAULTS.user, pass: next.pass },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
      })
      .verify();
  } catch (err) {
    return { status: mailerStatus(), check: { ok: false, error: err instanceof Error ? err.message : 'Login failed.' } };
  }
  await writeJson('mail-config', next);
  stored = next;
  transport = null;
  return { status: mailerStatus(), check: { ok: true } };
}

function smtp() {
  const envPass = process.env.SMTP_PASS;
  const pass = envPass || stored.pass;
  if (!pass) return null;
  return {
    source: (envPass ? 'env' : 'app') as 'env' | 'app',
    host: process.env.SMTP_HOST || stored.host || DEFAULTS.host,
    port: Number(process.env.SMTP_PORT) || stored.port || DEFAULTS.port,
    user: process.env.SMTP_USER || stored.user || DEFAULTS.user,
    pass,
    from: process.env.MAIL_FROM || process.env.SMTP_FROM || stored.from || DEFAULTS.from,
  };
}

const apiFrom = () => process.env.MAIL_FROM || process.env.SMTP_FROM || '';

function provider(): Provider {
  if (smtp()) return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) return 'mailgun';
  return 'none';
}

/** Status (uses the cached saved settings; await ensureMailConfig() first for a fresh read). */
export const ensureMailConfig = ensureLoaded;

export function mailerStatus(): MailerStatus {
  const p = provider();
  if (p === 'smtp') {
    const s = smtp()!;
    return { configured: true, provider: p, from: s.from, source: s.source, host: s.host, user: s.user };
  }
  return { configured: p !== 'none' && Boolean(apiFrom()), provider: p, from: apiFrom() || (p === 'none' ? DEFAULTS.from : null) };
}

const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|h\d|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();

let transport: nodemailer.Transporter | null = null;
let transportKey = '';

function smtpTransport(s: NonNullable<ReturnType<typeof smtp>>) {
  const key = `${s.host}|${s.port}|${s.user}|${s.pass}`;
  if (!transport || key !== transportKey) {
    transport = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.port === 465,
      auth: { user: s.user, pass: s.pass },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });
    transportKey = key;
  }
  return transport;
}

/** Check the SMTP login without sending anything. */
export async function verifyMailer(): Promise<{ ok: boolean; error?: string }> {
  await ensureLoaded();
  const s = smtp();
  if (!s) return { ok: provider() !== 'none', error: provider() === 'none' ? 'Email is not connected.' : undefined };
  try {
    await smtpTransport(s).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'SMTP login failed.' };
  }
}

export async function sendEmail(msg: MailMessage): Promise<MailResult> {
  await ensureLoaded();
  const to = msg.to.map((t) => t.trim()).filter(Boolean);
  const cc = (msg.cc ?? []).map((t) => t.trim()).filter((t) => t && !to.includes(t));
  const p = provider();
  const text = msg.text ?? stripHtml(msg.html);

  if (to.length === 0) return { sent: false, dryRun: true, provider: p, to, error: 'No recipients.' };
  if (p === 'none' || (p !== 'smtp' && !apiFrom())) return { sent: false, dryRun: true, provider: 'none', to };

  try {
    if (p === 'smtp') {
      const s = smtp()!;
      await smtpTransport(s).sendMail({ from: s.from, to, cc: cc.length ? cc : undefined, subject: msg.subject, html: msg.html, text });
      return { sent: true, dryRun: false, provider: 'smtp', to };
    }
    if (p === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: apiFrom(), to, cc: cc.length ? cc : undefined, subject: msg.subject, html: msg.html, text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { sent: true, dryRun: false, provider: 'resend', to };
    }
    // Mailgun — form-encoded.
    const domain = process.env.MAILGUN_DOMAIN as string;
    const body = new URLSearchParams();
    body.set('from', apiFrom());
    to.forEach((t) => body.append('to', t));
    cc.forEach((t) => body.append('cc', t));
    body.set('subject', msg.subject);
    body.set('html', msg.html);
    body.set('text', text);
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
