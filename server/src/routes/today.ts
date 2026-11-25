// ----------------------------------------------------------------------------
// GET /api/today — the Morning brief (schema 1): what needs you, the five numbers, what changed, what is coming.
// Stored data only (Tally summary, open Fix items, open tasks); never calls Tally, Claude or a marketplace.
// Side effect: the first read of each IST day saves ONE small snapshot (morning/snap-<day>) so tomorrow can say what moved.
// Behind htxGate like every API (login only). MCP tool mis_get_morning_brief.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { readJson, writeJson } from '../ingest/objectStore.js';
import { summaryInput, istToday } from '../connectors/tally/ceoSummaryLoad.js';
import { ceoSummary } from '../connectors/tally/ceoSummary.js';
import { ceoSummaryV2 } from '../connectors/tally/ceoSummaryV2.js';
import { openFixItems } from './issues.js';
import { openItems } from '../services/workStore.js';
import { listMembers } from '../services/ownershipStore.js';
import { buildMorningBrief, previousDay, withDay, type FixIn, type MorningSnapshot, type TaskIn } from '../services/morningBrief.js';
import { newest, tallyReachedAt } from '../connectors/tally/freshness.js';

const router = Router();
const INDEX = 'morning/index';
const snapKey = (d: string) => `morning/snap-${d}`;
const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };

type Brief = ReturnType<typeof buildMorningBrief>;
// 60 s cache with in-flight dedupe (one brief per IST day): the brief reads 14 months of books, the Fix list and tasks
// (about 4 to 5 s). Refresh (?fresh=1) always rebuilds.
let memo: { day: string; at: number; p: Promise<Brief> } | null = null;

router.get('/', (req: Request, res: Response) => {
  const fresh = req.query.fresh === '1';
  const day = istToday(Date.now());
  if (fresh || !memo || memo.day !== day || Date.now() - memo.at > 60_000) {
    const p = buildBrief(fresh);
    const entry = { day, at: Date.now(), p };
    memo = entry;
    p.catch(() => { if (memo === entry) memo = null; });
  }
  memo.p.then((brief) => res.set('Cache-Control', 'no-store').json(brief)).catch((err: unknown) => {
    console.error('today route error:', err);
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
  });
});

async function buildBrief(fresh: boolean): Promise<Brief> {
  {
    const now = new Date();
    const today = istToday(now.getTime());
    const [x, fixRaw, taskRaw, members, days] = await Promise.all([
      summaryInput(fresh),
      safe(openFixItems(), []),
      safe(openItems(now), []),
      safe(listMembers(), []),
      safe(readJson<string[]>(INDEX, []), []),
    ]);
    const v1 = ceoSummary(x.months.slice(-14), 13, { parents: x.parents, today: x.today });
    const v2 = ceoSummaryV2(x);
    const name = new Map(members.map((m) => [m.id, m.name]));
    const fix: FixIn[] = fixRaw.map((i) => ({ id: i.id, severity: i.severity, title: i.title, fix: i.fix, href: i.href, area: i.area }));
    const tasks: TaskIn[] = taskRaw.map((o) => ({
      id: `${o.task.id}:${o.period}`, title: o.task.title, area: o.task.area, due: o.due, late: o.late,
      owners: o.task.ownerIds.map((id) => name.get(id)).filter((n): n is string => !!n),
    }));
    const pd = previousDay(days, today);
    const prev = pd ? await safe(readJson<MorningSnapshot | null>(snapKey(pd), null), null) : null;
    const brief = buildMorningBrief({
      today, now: now.toISOString(), balance: v2.balance, months: v1.months, watch: v2.watch, close: v2.close,
      fix, tasks, tallyLastOkAt: newest(x.lastOkAt, await safe(tallyReachedAt(), null)), prev,
    });
    // One snapshot per IST day, written on the first read only (idempotent; a failed write never fails the page).
    if (!days.includes(today)) {
      await safe((async () => { await writeJson(snapKey(today), brief.snapshot); await writeJson(INDEX, withDay(days, today)); })(), undefined);
    }
    return brief;
  }
}

export default router;
