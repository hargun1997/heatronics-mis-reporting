// ----------------------------------------------------------------------------
// Work routes — the unified Tasks page: recurring tasks, owners, completions
// and reminders in one place.
//
//   GET    /api/work                   tasks + done + auto-done + team + mailer
//   POST   /api/work/tasks             create/update a task
//   DELETE /api/work/tasks/:id
//   POST   /api/work/tasks/:id/done    { period, done, by?, note? }
//   POST   /api/work/import            one-time seed { tasks, done, force? }
//   POST   /api/work/settings          daily email settings (send hour, summary to)
//   GET    /api/work/reminders/preview today's emails, rendered, not sent
//   POST   /api/work/reminders/run     send now; {scheduled:true} = the hourly
//                                      trigger, sends once a day after the send hour
//   POST   /api/work/mail              connect email (Zoho SMTP password; write-only)
//   POST   /api/work/mail/test         send a test email
//
// Team members are the shared people list (/api/ownership/members).
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { readWork, saveTask, deleteTask, setDone, importSeed, autoDone, saveSettings, claimScheduledRun, DEFAULT_SETTINGS } from '../services/workStore.js';
import { runWorkReminders, buildReminderEmails } from '../services/workReminders.js';
import { listMembers } from '../services/ownershipStore.js';
import { mailerStatus, ensureMailConfig, saveMailConfig, sendEmail } from '../services/mailer.js';

const router = Router();

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('work route error:', err);
    if (!res.headersSent) res.status(400).json({ error: err instanceof Error ? err.message : 'Error.' });
  });
};

/** Public base URL for links in emails (APP_BASE_URL, else the request host). */
const baseUrl = (req: Request) =>
  (process.env.APP_BASE_URL || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

router.get(
  '/',
  h(async (_req, res) => {
    const [doc, members] = await Promise.all([readWork(), listMembers(), ensureMailConfig()]);
    res.json({
      ...doc,
      settings: { ...DEFAULT_SETTINGS, ...(doc.settings ?? {}) },
      autoDone: await autoDone(doc.tasks),
      members,
      mailer: mailerStatus(),
    });
  }),
);

router.post('/tasks', h(async (req, res) => res.json(await saveTask(req.body ?? {}))));

router.delete(
  '/tasks/:id',
  h(async (req, res) => {
    await deleteTask(req.params.id);
    res.json({ ok: true });
  }),
);

router.post(
  '/tasks/:id/done',
  h(async (req, res) => {
    const { period, done, by, note } = req.body ?? {};
    await setDone(req.params.id, String(period), Boolean(done), by ? String(by) : undefined, note ? String(note) : undefined);
    res.json({ ok: true });
  }),
);

router.post(
  '/import',
  h(async (req, res) => {
    const { tasks, done, force } = req.body ?? {};
    res.json(await importSeed(Array.isArray(tasks) ? tasks : [], done ?? {}, Boolean(force)));
  }),
);

router.post('/settings', h(async (req, res) => res.json(await saveSettings(req.body ?? {}))));

router.get(
  '/reminders/preview',
  h(async (req, res) => {
    const { drafts, items, unowned } = await buildReminderEmails(baseUrl(req));
    res.json({ drafts, items: items.length, unowned });
  }),
);

router.post(
  '/reminders/run',
  h(async (req, res) => {
    if (req.body?.scheduled) {
      const claim = await claimScheduledRun();
      if (!claim.ok) return res.json({ skipped: claim.reason, at: new Date().toISOString() });
    }
    res.json(await runWorkReminders(baseUrl(req)));
  }),
);

router.post(
  '/mail',
  h(async (req, res) => {
    const { pass, user, host, port, from } = req.body ?? {};
    const r = await saveMailConfig({ pass, user, host, port, from });
    res.json({ mailer: r.status, check: r.check });
  }),
);

router.post(
  '/mail/test',
  h(async (req, res) => {
    const to = String(req.body?.to ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('Enter an email address to send the test to.');
    const result = await sendEmail({
      to: [to],
      subject: '[Heatronics] Test email from the MIS',
      html: `<p style="font-family:Arial,sans-serif">This is a test from the Heatronics MIS (Tasks &amp; owners). If you can read this, the daily task emails will reach you.</p>`,
    });
    if (!result.sent) throw new Error(result.error || (result.dryRun ? 'Email is not connected yet.' : 'Send failed.'));
    res.json(result);
  }),
);

export default router;
