// ----------------------------------------------------------------------------
// Work routes — the unified Tasks page: recurring tasks, owners, completions
// and reminders in one place.
//
//   GET    /api/work                   tasks + done + auto-done + team + mailer
//   POST   /api/work/tasks             create/update a task
//   DELETE /api/work/tasks/:id
//   POST   /api/work/tasks/:id/done    { period, done, by?, note? }
//   POST   /api/work/import            one-time seed { tasks, done, force? }
//   GET    /api/work/reminders/preview what the next reminder run would send
//   POST   /api/work/reminders/run     email owners (daily via Cloud Scheduler)
//
// Team members are the shared people list (/api/ownership/members).
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { readWork, saveTask, deleteTask, setDone, importSeed, autoDone, openItems } from '../services/workStore.js';
import { runWorkReminders } from '../services/workReminders.js';
import { listMembers } from '../services/ownershipStore.js';
import { mailerStatus } from '../services/mailer.js';

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
    const [doc, members] = await Promise.all([readWork(), listMembers()]);
    res.json({ ...doc, autoDone: await autoDone(doc.tasks), members, mailer: mailerStatus() });
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

router.get(
  '/reminders/preview',
  h(async (_req, res) => {
    const items = await openItems();
    res.json({ items: items.map((i) => ({ taskId: i.task.id, title: i.task.title, period: i.period, due: i.due, late: i.late, ownerIds: i.task.ownerIds })) });
  }),
);

router.post('/reminders/run', h(async (req, res) => res.json(await runWorkReminders(baseUrl(req)))));

export default router;
