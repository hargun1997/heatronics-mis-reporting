// Loads both stored P&L copies of each month (poll snapshot + committed close report) for pnlCopies.ts. READ ONLY.
import { listReports, readAllExtracted } from '../../ingest/objectStore.js';
import { committedCopy, type PnlCopy } from './pnlCopies.js';
import { readTallySnapshot } from './snapshots.js';

export interface MonthCopies { period: string; snapshot: PnlCopy | null; committed: PnlCopy | null }

/** Both copies for `periods` (default: every month with a committed Tally P&L). A read failure = that copy null. */
export async function readPnlCopies(periods?: string[]): Promise<MonthCopies[]> {
  const [reports, metas] = await Promise.all([readAllExtracted().catch(() => []), listReports().catch(() => [])]);
  const tally = reports.filter((r) => r.connectorId === 'tally' && r.slotId === 'pnl');
  const savedAt = new Map(metas.filter((m) => m.connectorId === 'tally' && m.slotId === 'pnl').map((m) => [m.periodKey, m.savedAt]));
  const want = periods ?? [...new Set(tally.map((r) => r.periodKey))];
  return Promise.all(want.map(async (period) => {
    const snap = await readTallySnapshot(period).catch(() => null);
    const rep = tally.find((r) => r.periodKey === period);
    return {
      period,
      snapshot: snap ? { nettProfit: snap.nettProfit, ledgerRows: snap.ledgerRows.map((r) => ({ name: r.name, amount: r.amount })), at: snap.asOf } : null,
      committed: rep ? committedCopy(rep.payload, savedAt.get(period) ?? null) : null,
    };
  }));
}
