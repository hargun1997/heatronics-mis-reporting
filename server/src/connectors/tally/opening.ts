// Pure: Tally opening balances from the stored ledger masters (books.ts parseLedgers: opening is Dr positive).
// Feeds GET /api/tally/books/opening and MCP mis_get_tally_opening (Busy → Tally tie-out, books cleanup Nov 2026).
import type { TallyLedger } from './books.js';

export interface OpeningRow { ledger: string; group: string; primary: string; side: 'Dr' | 'Cr'; amount: number; gstin: string }
export interface OpeningReport {
  rows: OpeningRow[];
  byPrimary: { primary: string; dr: number; cr: number; net: number; ledgers: number }[];
  totalDr: number;
  totalCr: number;
  /** Dr − Cr. Tally shows anything not zero as "Difference in opening balances". */
  difference: number;
  ledgersWithOpening: number;
  ledgersTotal: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function openingReport(ledgers: TallyLedger[], opts: { q?: string; group?: string; all?: boolean } = {}): OpeningReport {
  const q = (opts.q || '').toLowerCase().trim();
  const g = (opts.group || '').toLowerCase().trim();
  const withBal = ledgers.filter((l) => Math.abs(l.opening || 0) >= 0.005);
  let totalDr = 0, totalCr = 0;
  const prim = new Map<string, { dr: number; cr: number; ledgers: number }>();
  for (const l of withBal) {
    const p = prim.get(l.primary || l.group || '(none)') ?? { dr: 0, cr: 0, ledgers: 0 };
    if (l.opening > 0) { totalDr += l.opening; p.dr += l.opening; } else { totalCr += -l.opening; p.cr += -l.opening; }
    p.ledgers += 1;
    prim.set(l.primary || l.group || '(none)', p);
  }
  const rows = (opts.all ? ledgers : withBal)
    .filter((l) => !q || `${l.name} ${l.group} ${l.gstin}`.toLowerCase().includes(q))
    .filter((l) => !g || l.group.toLowerCase() === g || l.primary.toLowerCase() === g)
    .map((l) => ({ ledger: l.name, group: l.group, primary: l.primary, side: (l.opening >= 0 ? 'Dr' : 'Cr') as 'Dr' | 'Cr', amount: r2(Math.abs(l.opening || 0)), gstin: l.gstin }))
    .sort((a, b) => b.amount - a.amount);
  return {
    rows,
    byPrimary: [...prim.entries()].map(([primary, v]) => ({ primary, dr: r2(v.dr), cr: r2(v.cr), net: r2(v.dr - v.cr), ledgers: v.ledgers })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    totalDr: r2(totalDr),
    totalCr: r2(totalCr),
    difference: r2(totalDr - totalCr),
    ledgersWithOpening: withBal.length,
    ledgersTotal: ledgers.length,
  };
}
