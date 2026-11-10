// ----------------------------------------------------------------------------
// Shared readers over a stored Trial Balance's rows (PURE; tests server/test/tbRows.test.ts). Used by the CEO summary
// v1 / v2 (ceoSummary.ts, ceoSummaryV2.ts) and the cash runway, so every server number reads the TB the same way.
//   - A TB lists each primary group, then its exploded children: sub-groups AND their ledgers (tb.ts). Summing every
//     child counts a sub-group twice, so sums of ledgers use LEAF rows only (masters `parents` when stored, else "a row
//     followed by rows that add up to it is a sub-group").
//   - Stock Transfers (branch / Supernode transfers) sit inside Sales Accounts and Purchase Accounts in Tally. They are
//     not sales: the MIS removes them from both sides (audit round 7 #1, round 10 A5).
//   - A month's books are "complete" only after the month has ended and the copy was taken ≥ 5 days after month end.
// ----------------------------------------------------------------------------

export interface TbRow { name: string; level: 'group' | 'ledger'; debit: number; credit: number }
export type ParentMap = Record<string, string>;

const bal = (r: TbRow) => r.debit - r.credit;

/** Primary groups with the rows Tally listed under each (in order). */
export function tbSections(rows: TbRow[]): { group: TbRow; kids: TbRow[] }[] {
  const out: { group: TbRow; kids: TbRow[] }[] = [];
  for (const r of rows) {
    if (r.level === 'group' || !out.length) out.push({ group: r, kids: [] });
    else out[out.length - 1].kids.push(r);
  }
  return out;
}

/** Ancestors of a name in the masters, nearest first. */
export function chainOf(name: string, parents?: ParentMap): string[] {
  const out: string[] = [];
  let cur = parents?.[name];
  for (let i = 0; cur && i < 20 && !out.includes(cur); i++) { out.push(cur); cur = parents?.[cur]; }
  return out;
}

/** The child rows of one section that are not sub-groups of other listed rows. */
function leavesOf(kids: TbRow[], group: TbRow, parents?: ParentMap): TbRow[] {
  if (!kids.length) return [];
  if (parents && Object.keys(parents).length) {
    const names = new Set(kids.map((k) => k.name));
    const hosts = new Set<string>();
    for (const k of kids) for (const a of chainOf(k.name, parents)) { if (a === group.name) break; if (names.has(a)) hosts.add(a); }
    return kids.filter((k) => !hosts.has(k.name));
  }
  const sum = kids.reduce((s, k) => s + bal(k), 0);
  if (Math.abs(sum - bal(group)) < 1) return kids; // flat: every child is a ledger
  const sub = new Set<number>();
  for (let i = 0; i < kids.length; i++) {
    let run = 0;
    for (let j = i + 1; j < kids.length; j++) { run += bal(kids[j]); if (Math.abs(run - bal(kids[i])) < 1) { sub.add(i); break; } }
  }
  return kids.filter((_, i) => !sub.has(i));
}

/** Every leaf ledger of the TB (no sub-group row whose ledgers are listed too). */
export function tbLeaves(rows: TbRow[], parents?: ParentMap): TbRow[] {
  return tbSections(rows).flatMap((s) => leavesOf(s.kids, s.group, parents));
}

/** Dr − Cr of the leaf ledgers whose name matches `re` (null = none). */
export function leafDr(rows: TbRow[], re: RegExp, parents?: ParentMap): number | null {
  const hit = tbLeaves(rows, parents).filter((r) => re.test(r.name));
  return hit.length ? hit.reduce((a, r) => a + bal(r), 0) : null;
}

/** Dr − Cr of a primary group (null = not listed). */
export function primaryDr(rows: TbRow[], re: RegExp): number | null {
  const hit = rows.filter((r) => r.level === 'group' && re.test(r.name));
  return hit.length ? hit.reduce((a, r) => a + bal(r), 0) : null;
}

/**
 * Dr − Cr of a (sub-)group such as Sundry Debtors / Duties & Taxes, whatever level Tally listed it at: the row itself
 * (once per name), else the sum of the leaf ledgers that sit under it in the masters. null = not in this TB.
 */
export function subTotal(rows: TbRow[], re: RegExp, parents?: ParentMap): number | null {
  const seen = new Set<string>();
  const hit = rows.filter((r) => re.test(r.name) && !seen.has(r.name) && (seen.add(r.name), true));
  if (hit.length) return hit.reduce((a, r) => a + bal(r), 0);
  if (!parents) return null;
  const under = tbLeaves(rows, parents).filter((r) => chainOf(r.name, parents).some((a) => re.test(a)));
  return under.length ? under.reduce((a, r) => a + bal(r), 0) : null;
}

const SALES_GROUP = /^sales accounts$/i;
const STOCK_TRANSFER = /stock transfers?/i;

/**
 * Stock transfers booked inside Sales Accounts (Cr, returned positive): the TB's own leaf ledgers named "Stock
 * Transfer(s)" under the Sales Accounts group. 0 when there are none; null when the TB has no Sales Accounts group.
 */
export function stockTransfers(rows: TbRow[], parents?: ParentMap): number | null {
  const s = tbSections(rows).find((x) => SALES_GROUP.test(x.group.name));
  if (!s) return null;
  const leaves = leavesOf(s.kids, s.group, parents).filter((r) => STOCK_TRANSFER.test(r.name));
  return Math.round(-leaves.reduce((a, r) => a + bal(r), 0) * 100) / 100;
}

/**
 * Sales (positive) and purchases (positive) of a TB with stock transfers taken out of BOTH (the inward leg sits in
 * Purchase Accounts), so gross margin ₹ is unchanged and sales match the MIS (channel ledgers only).
 */
export function salesPurchases(rows: TbRow[], parents?: ParentMap): { sales: number | null; purchases: number | null; stockTransfers: number } {
  const st = stockTransfers(rows, parents) ?? 0;
  const s = primaryDr(rows, SALES_GROUP);
  const p = primaryDr(rows, /^purchase accounts$/i);
  return { sales: s == null ? null : -s - st, purchases: p == null ? null : p - st, stockTransfers: st };
}

/** Month end 23:59:59 IST as epoch ms. */
export const monthEndMs = (p: string) => { const [y, m] = p.split('-').map(Number); return Date.UTC(y, m, 0, 18, 29, 59); };
export const BOOKS_SETTLE_DAYS = 5;

/**
 * Are a month's stored books final enough to count as a whole month? The month has ended (before `today`'s month) and
 * the copy was taken ≥ 5 days after month end. `asOf` null = unknown → counted (older copies carry no date).
 */
export function booksComplete(period: string, asOf: string | null | undefined, today: string): boolean {
  if (period >= today.slice(0, 7)) return false;
  if (!asOf) return true;
  const t = Date.parse(asOf);
  return !Number.isFinite(t) || t >= monthEndMs(period) + BOOKS_SETTLE_DAYS * 86_400_000;
}

/**
 * Lines that are NOT running costs in a P&L copy: sales ledgers ("… Sales", sales returns), income, stock rows,
 * purchases, the Direct / Indirect Expenses GROUP rows (their ledgers are listed too) and totals. "Sales & Marketing"
 * and "After-Sales & Warranty" are costs. Same rule as /api/expenses (routes/expenses.ts).
 */
export const NOT_EXPENSE = /\bsales$|^sales\b(?!\s*(&|and)?\s*(marketing|promotion))|\bsales returns?\b|income|stock|purchase|^direct expenses$|^indirect expenses$|total|nett? (profit|loss)|gross (profit|loss|margin)|interest received|discount received|^check\b/i;
