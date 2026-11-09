// ----------------------------------------------------------------------------
// TDS planning feed (GET /api/tds?month=YYYY-MM, routes/tds.ts) — READ ONLY, from the STORED Tally Day Books
// (connectors/tally/bookStore.ts `tally/books-<YYYY-MM>`) + ledger masters. Pure: picks the months the page needs (FY start
// → the month after `month`, and the rest of its quarter), keeps only vouchers that touch a TDS ledger and the masters of the
// ledgers on them. The browser computes the plan (client/src/data/tds/tds.ts buildTds); tests server/test/tds.test.ts.
// ----------------------------------------------------------------------------

import type { TallyLedger, TallyVoucher } from '../connectors/tally/books.js';

export const TDS_NAME = /\bTDS\b|tax\s+deducted/i;

const pad = (n: number) => String(n).padStart(2, '0');
export function addMonths(p: string, n: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** FY April → max(month + 1, the quarter's last month), at most 13 months. */
export function tdsMonths(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const fy = `${m >= 4 ? y : y - 1}-04`;
  const qStart = m >= 4 ? `${y}-${pad(4 + Math.floor((m - 4) / 3) * 3)}` : `${y}-01`;
  const last = [addMonths(month, 1), addMonths(qStart, 2)].sort().pop()!;
  const out: string[] = [];
  for (let p = fy; p <= last && out.length < 13; p = addMonths(p, 1)) out.push(p);
  return out;
}

export interface TdsFeedVoucher { date: string; type: string; number: string; party: string; reference: string; narration: string; cancelled: boolean; optional: boolean; lines: { ledger: string; amount: number }[] }
export interface TdsFeedLedger { name: string; group: string; primary: string; pan: string; taxType: string; tds: string }

export function tdsFeed(vouchers: TallyVoucher[], ledgers: TallyLedger[]): { vouchers: TdsFeedVoucher[]; ledgers: TdsFeedLedger[] } {
  const keep = vouchers.filter((v) => !v.cancelled && v.lines.some((l) => TDS_NAME.test(l.ledger)));
  const names = new Set<string>();
  for (const v of keep) { if (v.party) names.add(v.party); for (const l of v.lines) names.add(l.ledger); }
  return {
    vouchers: keep.map((v) => ({ date: v.date, type: v.type, number: v.number, party: v.party, reference: v.reference, narration: v.narration, cancelled: v.cancelled, optional: v.optional, lines: v.lines })),
    ledgers: ledgers.filter((l) => names.has(l.name)).map((l) => ({ name: l.name, group: l.group, primary: l.primary, pan: l.pan, taxType: l.taxType, tds: l.tds })),
  };
}
