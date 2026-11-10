// ----------------------------------------------------------------------------
// Loads what the CEO summary v2 (ceoSummaryV2.ts) needs from the STORED copies only — no Tally call, no connector pull:
//   tally/state, tally/pnl-<m>, tally/tb-<m> (last 26 months, so the same month last FY is there for YoY), tally/masters
//   (parents), close-locks, the committed reports (readAllExtracted: keys + their facts), facts-cache/<source>-<m> for the
//   live revenue sources where no report is committed, tally/ledger-rules. Kept 60 s in instance memory: the MCP tools
//   below share one load. READ ONLY.
// ----------------------------------------------------------------------------
import { readAllExtracted, readJson } from '../../ingest/objectStore.js';
import type { LockStore } from '../../ingest/closeLocks.js';
import { MANUAL_SLOTS } from '../../services/issuesInbox.js';
import { readMasters } from './bookStore.js';
import { readTallyState, readTallyTb } from './snapshots.js';
import { pickPnlCopy } from './pnlCopies.js';
import { readPnlCopies } from './pnlCopiesLoad.js';
import type { Channel, LedgerRuleIn, V2Input, V2MonthIn } from './ceoSummaryV2.js';

/** Live connectors whose facts carry sales (ad / freight / gateway sources carry costs only). */
const REVENUE_SOURCES = ['shopify', 'amazon', 'flipkart'];
const CHANNEL_ALIAS: Record<string, Channel> = { d2c: 'D2C', shopify: 'D2C', amazon: 'Amazon', blinkit: 'Blinkit', flipkart: 'Flipkart', gt: 'GT', b2b: 'B2B', oem: 'B2B', offline: 'GT', export: 'Export' };
const GST_INCLUSIVE_UNSPLIT = new Set(['shopify', 'amazon']);
/** Product GST used to estimate ex-GST from GMV — must equal client data/misDeck/gstBasis.ts DEFAULT_GST_RATE (test-checked). */
export const ASSUMED_GST_RATE = 0.05;

interface FactLike { source?: string; channel?: string; date?: string; revenue?: number; gmv?: number; netExGst?: number }

/** Ex-GST sales per channel, the way the close's tie reads connector facts (client closeTies.connectorSales). */
export function connectorSalesOf(facts: FactLike[], source: string): Partial<Record<Channel, number>> {
  const out: Partial<Record<Channel, number>> = {};
  for (const f of facts) {
    if (!f || typeof f.revenue !== 'number' || !f.revenue) continue;
    const ch = CHANNEL_ALIAS[String(f.channel ?? '').trim().toLowerCase()];
    if (!ch) continue;
    const src = f.source ?? source;
    const net = typeof f.netExGst === 'number' ? f.netExGst : typeof f.gmv === 'number' && GST_INCLUSIVE_UNSPLIT.has(src) ? f.gmv / (1 + ASSUMED_GST_RATE) : f.revenue;
    out[ch] = (out[ch] ?? 0) + net;
  }
  return out;
}

const addMonths = (p: string, n: number) => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
export const istToday = (now = Date.now()) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);

export async function loadSummaryInput(opts: { months?: number; now?: number } = {}): Promise<V2Input & { lastOkAt: string | null }> {
  const now = opts.now ?? Date.now();
  const today = istToday(now);
  const s = await readTallyState();
  const periods = [...new Set([...Object.keys(s.tbMonths ?? {}), ...Object.keys(s.months)])].sort().slice(-(opts.months ?? 26));
  const [months, masters, locks, reports, rulesDoc] = await Promise.all([
    readPnlCopies(periods).then((copies) => Promise.all(periods.map(async (period): Promise<V2MonthIn> => {
      const tb = await readTallyTb(period);
      // The newer of the poll copy and the committed close report (round 7 #10).
      const c = copies.find((x) => x.period === period);
      const pnl = pickPnlCopy(c?.snapshot ?? null, c?.committed ?? null).copy;
      return {
        period,
        tb: tb ? { rows: tb.rows, difference: tb.difference, basis: tb.basis ?? null } : null,
        pnl: pnl ? { nettProfit: pnl.nettProfit, ledgerRows: pnl.ledgerRows } : null,
        pnlAsOf: pnl?.at ?? null, tbAsOf: tb?.asOf ?? null,
      };
    }))),
    readMasters().catch(() => null),
    readJson<LockStore>('close-locks', { locks: {} }).catch(() => ({ locks: {} })),
    readAllExtracted().catch(() => []),
    readJson<{ rules?: LedgerRuleIn[] | null } | null>('tally/ledger-rules', null).catch(() => null),
  ]);
  const parents: Record<string, string> = {};
  for (const g of masters?.groups ?? []) if (g.parent) parents[g.name] = g.parent;
  for (const l of masters?.ledgers ?? []) if (l.group) parents[l.name] = l.group;

  // Connector sales per month: committed facts first; for a revenue source with no committed report that month, the
  // facts-cache copy (written when the Live MIS loaded the month). Months without either are left out (not 0).
  const connectorSales: Record<string, Partial<Record<Channel, number>>> = {};
  const covered = new Set<string>(); // source|period
  const add = (period: string, sales: Partial<Record<Channel, number>>) => {
    const row = (connectorSales[period] ??= {});
    for (const [ch, v] of Object.entries(sales)) if (v != null) row[ch as Channel] = (row[ch as Channel] ?? 0) + v;
  };
  for (const r of reports) {
    const facts = Array.isArray(r.payload?.facts) ? (r.payload.facts as FactLike[]) : [];
    if (!facts.some((f) => typeof f?.revenue === 'number' && f.revenue)) continue;
    covered.add(`${r.connectorId}|${r.periodKey}`);
    add(r.periodKey, connectorSalesOf(facts, r.connectorId));
  }
  const recent = Array.from({ length: 6 }, (_, i) => addMonths(today.slice(0, 7), -i));
  await Promise.all(recent.flatMap((p) => REVENUE_SOURCES.filter((src) => !covered.has(`${src}|${p}`)).map(async (src) => {
    const doc = await readJson<{ facts?: FactLike[] } | null>(`facts-cache/${src}-${p}`, null).catch(() => null);
    if (doc?.facts?.length) add(p, connectorSalesOf(doc.facts, src));
  })));
  for (const row of Object.values(connectorSales)) for (const k of Object.keys(row)) row[k as Channel] = Math.round(row[k as Channel]!);

  return {
    today, months, parents,
    locks: Object.fromEntries(Object.entries(locks.locks ?? {}).map(([k, l]) => [k, { lockedAt: l.lockedAt, lockedBy: l.lockedBy, worstResidualPct: l.worstResidualPct ?? null, overrideReason: l.overrideReason }])),
    committed: reports.map((r) => `${r.connectorId}|${r.slotId}|${r.periodKey}`),
    connectorSales, manualSlots: MANUAL_SLOTS.map((m) => ({ connectorId: m.connectorId, slotId: m.slotId, label: m.label })),
    rules: rulesDoc?.rules ?? null,
    lastOkAt: s.lastOkAt,
  };
}

let cache: { at: number; p: Promise<V2Input & { lastOkAt: string | null }> } | null = null;
/** The same input for every summary route, loaded at most once a minute per instance. */
export function summaryInput(force = false): Promise<V2Input & { lastOkAt: string | null }> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.p;
  const p = loadSummaryInput().catch((e) => { cache = null; throw e; });
  cache = { at: Date.now(), p };
  return p;
}
