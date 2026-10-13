// ----------------------------------------------------------------------------
// Report routes — send the MIS to a saved recipient list.
//
//   GET  /api/report/recipients   saved recipients + mailer status
//   POST /api/report/recipients   { emails: string[] }  save the list
//   POST /api/report/send         { subject, html, recipients? }  send now
//                                 (the client composes the animated deck HTML)
//   POST /api/report/send-monthly scheduler: compose a server summary + send to
//                                 the saved list
//   GET  /api/report/status       mailer status
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { readJson, writeJson, readAllExtracted } from '../ingest/objectStore.js';
import { sendEmail, mailerStatus } from '../services/mailer.js';
import { composeMonthlySummary } from '../services/reportComposer.js';

const router = Router();

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('report route error:', err);
    if (!res.headersSent) res.status(400).json({ error: err instanceof Error ? err.message : 'Error.' });
  });
};

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const cleanEmails = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim().toLowerCase()).filter(isEmail))] : [];

interface RecipientsDoc { emails: string[] }
const getRecipients = () => readJson<RecipientsDoc>('report-recipients', { emails: [] });

const appUrl = () =>
  (process.env.APP_URL || process.env.PUBLIC_URL || '').replace(/\/$/, '') || '';

router.get('/status', h(async (_req, res) => res.json({ mailer: mailerStatus() })));

router.get('/recipients', h(async (_req, res) => {
  const doc = await getRecipients();
  res.json({ emails: doc.emails, mailer: mailerStatus() });
}));

router.post('/recipients', h(async (req, res) => {
  const emails = cleanEmails((req.body ?? {}).emails);
  await writeJson('report-recipients', { emails });
  res.json({ emails });
}));

router.post('/send', h(async (req, res) => {
  const b = (req.body ?? {}) as { subject?: string; html?: string; recipients?: unknown };
  const subject = typeof b.subject === 'string' && b.subject.trim() ? b.subject.trim() : 'Heatronics MIS';
  const html = typeof b.html === 'string' ? b.html : '';
  if (!html) return res.status(400).json({ error: 'No report HTML provided.' });
  let to = cleanEmails(b.recipients);
  if (to.length === 0) to = (await getRecipients()).emails;
  if (to.length === 0) return res.status(400).json({ error: 'No recipients — add some on the Send Report page first.' });
  const result = await sendEmail({ to, subject, html });
  res.json({ result });
}));

router.post('/send-monthly', h(async (_req, res) => {
  const to = (await getRecipients()).emails;
  const reports = await readAllExtracted();
  const composed = await composeMonthlySummary(reports, appUrl(), new Date());
  const result = to.length
    ? await sendEmail({ to, subject: composed.subject, html: composed.html })
    : { sent: false, dryRun: true, provider: 'none' as const, to: [], error: 'No recipients saved.' };
  res.json({ servicePeriod: composed.servicePeriod, result });
}));

export default router;
