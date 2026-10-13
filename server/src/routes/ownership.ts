// ----------------------------------------------------------------------------
// Ownership routes — team members, report-upload assignments, and the reminder
// run. CRUD persists to the config store; the reminder run emails owners their
// outstanding uploads (or dry-runs when no mailer is configured).
//
//   GET    /api/ownership/overview            team + assignments + live status
//   POST   /api/ownership/members             create/update a member
//   DELETE /api/ownership/members/:id
//   POST   /api/ownership/assignments         create/update an assignment
//   DELETE /api/ownership/assignments/:id
//   POST   /api/ownership/assignments/:id/done  { period, done }  manual toggle
//   GET    /api/ownership/outstanding         what's outstanding right now
//   POST   /api/ownership/reminders/run       send the reminder emails (scheduler)
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import {
  listMembers, saveMember, deleteMember,
  listAssignments, saveAssignment, deleteAssignment, setManualDone,
} from '../services/ownershipStore.js';
import { computeOutstanding, runReminders } from '../services/reminderEngine.js';
import { mailerStatus } from '../services/mailer.js';

const router = Router();

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('ownership route error:', err);
    if (!res.headersSent) res.status(400).json({ error: err instanceof Error ? err.message : 'Error.' });
  });
};

router.get('/overview', h(async (_req, res) => {
  const [members, assignments, outstanding] = await Promise.all([
    listMembers(), listAssignments(), computeOutstanding(new Date()),
  ]);
  res.json({ members, assignments, outstanding: outstanding.items, servicePeriod: outstanding.servicePeriod, mailer: mailerStatus() });
}));

router.post('/members', h(async (req, res) => res.json({ member: await saveMember(req.body ?? {}) })));
router.delete('/members/:id', h(async (req, res) => { await deleteMember(req.params.id); res.json({ ok: true }); }));

router.post('/assignments', h(async (req, res) => res.json({ assignment: await saveAssignment(req.body ?? {}) })));
router.delete('/assignments/:id', h(async (req, res) => { await deleteAssignment(req.params.id); res.json({ ok: true }); }));
router.post('/assignments/:id/done', h(async (req, res) => {
  const { period, done } = (req.body ?? {}) as { period?: string; done?: boolean };
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: 'period must be YYYY-MM.' });
  res.json({ assignment: await setManualDone(req.params.id, period, done !== false) });
}));

router.get('/outstanding', h(async (_req, res) => res.json(await computeOutstanding(new Date()))));
router.post('/reminders/run', h(async (_req, res) => res.json(await runReminders(new Date()))));

export default router;
