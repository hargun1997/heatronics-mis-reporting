// Server copy of client/src/data/statements/statements.ts (the server's rootDir is src/, so it cannot import the client file).
// KEEP BYTE-IDENTICAL from the first dashed banner line down: the client builds the Live Balance Sheet / Cash Flow with it, the
// CEO summary v2 (ceoSummaryV2.ts) uses this copy. server/test/ceoSummaryV2.test.ts compares the two files.
// ----------------------------------------------------------------------------
// Live Balance Sheet + Cash Flow, built from Tally's stored month-end copies (READ ONLY, server/src/connectors/tally):
//   • the Trial Balance at month end, asked from 1 April (closing Dr / Cr per primary group, its children right after it),
//   • the month's P&L copy (closing stock at month end, depreciation of the month, Nett Profit as a cross-check),
//   • Tally's masters (`parents`: group / ledger → parent group), when stored.
// Pure; tested in server/test/statements.test.ts.
//
// Balance Sheet (Schedule-III-like, Tally's own groups):
//   Equity = Capital Account + Profit & Loss A/c (retained) + profit of the FY to date
//   Liabilities = Loans (Liability) + Current Liabilities (+ Suspense / Branch, shown when present)
//   Assets = Fixed Assets + Investments + Current Assets (cash & bank split out) + Closing Stock + Misc. Expenses
//   FY profit to date = −(Σ P&L groups, Dr − Cr, incl. Opening Stock) − (any stock line the TB carries under Current
//   Assets / Stock-in-Hand: Tally's TB shows the OPENING stock, never the closing) + Closing Stock from the P&L copy. It is
//   FY-to-date because the TB is asked from 1 April (tb.ts, basis "fy-to-date"). A TB that doesn't tie leaves a
//   "Difference in Trial Balance" line so the sides still show what Tally holds.
//   Exploded children can be sub-groups (Bank Accounts, Sundry Debtors, Duties & Taxes …) AND their ledgers: with the
//   masters a ledger inside a listed sub-group is nested under it, never counted twice; without them a sub-group row
//   followed by rows that add up to it is taken as that sub-group and its ledgers.
// Cash Flow (indirect, month m vs m−1): profit of the month + depreciation − Δ working capital (current assets other
//   than cash & bank, incl. stock) + Δ current liabilities; investing = −(Δ fixed assets + depreciation) − Δ investments;
//   financing = Δ capital + Δ loans (bank OD / CC included); retained = Δ Profit & Loss A/c other than April's
//   carry-forward of last FY's profit; other = the rest (Δ suspense / misc / branch / TB difference). Their sum = Δ cash &
//   bank exactly, because the BS ties to the TB; "other" has its own line and a warning when it isn't small.
// ----------------------------------------------------------------------------

export interface TbRowIn { name: string; level: 'group' | 'ledger'; debit: number; credit: number }
export interface StatementMonthIn {
  period: string; // YYYY-MM
  asOf: string | null;
  /** `basis` = 'fy-to-date' when Tally was asked from 1 April (tb.ts); null / absent = an older month-start copy. */
  tb: { rows: TbRowIn[]; difference: number; basis?: string | null } | null;
  /** Closing stock at month end (positive), from the month's P&L copy. */
  closingStock: number | null;
  /** Depreciation booked in the month (positive). */
  depreciation: number;
  /** The month's Nett Profit from the P&L copy (cross-check). */
  nettProfit: number | null;
}
/** Tally masters: group / ledger name → its parent group. */
export type Parents = Record<string, string>;

export type Side = 'equity' | 'liability' | 'asset' | 'pnl' | 'other';
export interface BsChild { label: string; amount: number; children?: { label: string; amount: number }[] }
export interface BsLine { label: string; amount: number; children?: BsChild[] }
export interface BalanceSheet {
  period: string;
  asOf: string | null;
  equity: BsLine[];
  liabilities: BsLine[];
  assets: BsLine[];
  totalEquityLiabilities: number;
  totalAssets: number;
  cash: number; // cash + bank (Current Assets)
  bankOd: number; // OD / CC under loans (positive = owed)
  fyProfit: number;
  /** Profit & Loss A/c balance (credit positive): profits of earlier years. */
  retained: number;
  /** Stock the TB itself carried as an asset (Tally's opening stock), replaced by the P&L's closing stock. */
  tbStock: number;
  workingCapital: number; // current assets ex cash + stock − current liabilities
  /** No P&L copy (closing stock unknown) and the TB carries no stock: stock, profit and this month's cash flow are not shown. */
  stockUnknown?: boolean;
  warnings: string[];
}
export interface CashFlow {
  period: string;
  profit: number;
  /** The month's Nett Profit from its P&L copy (null when not stored). */
  pnlProfit: number | null;
  depreciation: number;
  workingCapital: { label: string; amount: number }[];
  operating: number;
  capex: number;
  investments: number;
  investing: number;
  equity: number;
  loans: number;
  financing: number;
  /** Movements in Profit & Loss A/c other than April's carry-forward (prior-period entries booked straight to it). */
  retained: number;
  other: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
  /** Net cash = cash & bank − bank OD / CC, at the start / end of the month. */
  openingNetCash: number;
  closingNetCash: number;
  /** When this month's Trial Balance was copied (ISO), when known. */
  asOf: string | null;
  warnings: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const fyStartMonth = (p: string) => { const [y, m] = p.split('-').map(Number); return `${m >= 4 ? y : y - 1}-04`; };
const prevMonth = (p: string) => { const [y, m] = p.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Tally's 28 reserved groups (15 primary + 13 sub-groups) + the rows its Trial Balance adds. */
const RESERVED: Record<string, Side> = {
  'capital account': 'equity', 'reserves & surplus': 'equity', 'profit & loss a/c': 'equity',
  'loans (liability)': 'liability', 'secured loans': 'liability', 'unsecured loans': 'liability', 'bank od a/c': 'liability',
  'bank occ a/c': 'liability', 'current liabilities': 'liability', 'duties & taxes': 'liability', 'provisions': 'liability',
  'sundry creditors': 'liability',
  'fixed assets': 'asset', 'investments': 'asset', 'current assets': 'asset', 'misc. expenses (asset)': 'asset',
  'bank accounts': 'asset', 'cash-in-hand': 'asset', 'deposits (asset)': 'asset', 'loans & advances (asset)': 'asset',
  'stock-in-hand': 'asset', 'sundry debtors': 'asset',
  'sales accounts': 'pnl', 'purchase accounts': 'pnl', 'direct incomes': 'pnl', 'direct expenses': 'pnl',
  'indirect incomes': 'pnl', 'indirect expenses': 'pnl', 'opening stock': 'pnl',
  'branch / divisions': 'other', 'suspense a/c': 'other', 'difference in opening balances': 'other',
};

/** Which side of the books a primary group sits on (Tally's reserved groups exactly, then common renames). */
export function sideOf(group: string): Side {
  const g = norm(group);
  if (RESERVED[g]) return RESERVED[g];
  if (/\(asset\)/.test(g)) return 'asset';
  if (/\(liability\)/.test(g)) return 'liability';
  if (/capital account|reserves|share capital|^profit\s*&\s*loss a\/?c/.test(g)) return 'equity';
  if (/secured loans|unsecured loans|bank o\.?c?c?\.? ?a\/?c|bank od|current liabilities|duties|provisions|sundry creditors/.test(g)) return 'liability';
  if (/fixed assets|investments|current assets|misc\.? ?expenses|deposits|loans & advances|sundry debtors|cash|bank accounts|stock-in-hand/.test(g)) return 'asset';
  if (/sales|purchase|direct (income|expense)|indirect (income|expense)|opening stock|income|expense/.test(g)) return 'pnl';
  return 'other'; // Branch / Divisions, Suspense A/c, Difference in opening balances, unknown → shown by its sign
}

const CASH_GROUP = /^(bank accounts|cash-in-hand|cash in hand)$/i;
const OD_GROUP = /^bank o\.?c?c?\.? ?a\/?c$|^bank od\b/i;
const STOCK = /^(stock[- ]in[- ]hand|opening stock|closing stock)$/i;
/** A ledger named like a bank / cash account (used when the masters don't place it under Bank Accounts / Cash-in-Hand). */
const looksCash = (n: string) => /\bbank\b|\bcash\b/i.test(n) && !/\bo\.?d\b|overdraft|\bcc\b|\bocc\b|cash credit|deposit|\bfds?\b|loan|advance|charges|guarantee|margin/i.test(n);
const looksOd = (n: string) => /\bo\.?d\b|overdraft|\bcc\b|\bocc\b|cash credit|bank od/i.test(n);

interface Node { name: string; balance: number; kids: { name: string; balance: number }[] } // Dr − Cr
interface Group { name: string; balance: number; children: Node[] }

/** Ancestors of a name in the masters, nearest first (stops at a cycle / 20 levels). */
function chain(name: string, parents?: Parents): string[] {
  const out: string[] = [];
  let cur = parents?.[name];
  for (let i = 0; cur && i < 20 && !out.includes(cur); i++) { out.push(cur); cur = parents?.[cur]; }
  return out;
}

const sumBal = (xs: { balance: number }[]) => r2(xs.reduce((s, x) => s + x.balance, 0));

/** Primary groups with their children; a child that sits inside another listed child (a sub-group) is nested under it. */
function groupsOf(rows: TbRowIn[], parents: Parents | undefined, warnings: string[]): Group[] {
  const flat: { name: string; balance: number; children: { name: string; balance: number }[] }[] = [];
  for (const r of rows) {
    const bal = r2(r.debit - r.credit);
    if (r.level === 'group' || !flat.length) flat.push({ name: r.name, balance: bal, children: [] });
    else flat[flat.length - 1].children.push({ name: r.name, balance: bal });
  }
  const haveMasters = !!parents && Object.keys(parents).length > 0;
  return flat.map((g) => {
    const kids = g.children;
    let nodes: Node[] = kids.map((c) => ({ ...c, kids: [] }));
    if (kids.length && haveMasters) {
      // Masters: nest each child under the outermost listed ancestor below the primary group.
      const names = new Set(kids.map((c) => c.name));
      const host = new Map<string, string>();
      for (const c of kids) {
        let h: string | null = null;
        for (const a of chain(c.name, parents)) { if (a === g.name) break; if (names.has(a) && a !== c.name) h = a; }
        if (h) host.set(c.name, h);
      }
      const byName = new Map(nodes.map((n) => [n.name, n]));
      for (const [child, h] of host) byName.get(h)?.kids.push({ name: child, balance: byName.get(child)!.balance });
      nodes = nodes.filter((n) => !host.has(n.name));
    } else if (kids.length && Math.abs(sumBal(kids) - g.balance) >= 1) {
      // No masters: a row followed by rows that add up to it = a sub-group and its ledgers.
      const out: Node[] = [];
      for (let i = 0; i < kids.length; i++) {
        let run = 0, hit = -1;
        for (let j = i + 1; j < kids.length; j++) { run = r2(run + kids[j].balance); if (Math.abs(run - kids[i].balance) < 1) { hit = j; break; } }
        if (hit > i) { out.push({ ...kids[i], kids: kids.slice(i + 1, hit + 1) }); i = hit; } else out.push({ ...kids[i], kids: [] });
      }
      if (Math.abs(sumBal(out) - g.balance) < 1) nodes = out;
    }
    if (nodes.length && Math.abs(sumBal(nodes) - g.balance) >= 1) {
      warnings.push(`${g.name}: the rows Tally listed under it add up to ${inr(sumBal(nodes))}, not ${inr(g.balance)} — a sub-group and its own ledgers may both be listed, so its drill-down and the cash split may be off. Pulling Tally's masters (Tally health page) fixes this.`);
    }
    return { name: g.name, balance: g.balance, children: nodes };
  });
}

const isCl = (n: string) => /current liabilities|duties|provisions|sundry creditors/i.test(n);

export function balanceSheet(m: StatementMonthIn, parents?: Parents): BalanceSheet | null {
  if (!m.tb) return null;
  const warnings: string[] = [];
  const groups = groupsOf(m.tb.rows, parents, warnings);
  const under = (n: { name: string }, re: RegExp) => re.test(n.name) || chain(n.name, parents).some((a) => re.test(a));

  // Stock the TB carries as an asset (Tally: the OPENING stock) comes out; the P&L's closing stock goes in.
  let tbStock = 0;
  for (const g of groups) {
    if (sideOf(g.name) !== 'asset') continue;
    if (STOCK.test(g.name)) { tbStock += g.balance; g.balance = 0; g.children = []; continue; }
    const st = g.children.filter((c) => under(c, STOCK));
    if (!st.length) continue;
    tbStock += sumBal(st);
    g.balance = r2(g.balance - sumBal(st));
    g.children = g.children.filter((c) => !st.includes(c));
  }
  tbStock = r2(tbStock);
  let stock = m.closingStock;
  const stockUnknown = stock == null && !tbStock;
  if (stock == null) {
    stock = tbStock;
    warnings.push(tbStock
      ? 'No closing stock for this month (its P&L copy is missing) — the stock Tally\'s Trial Balance carries (its opening stock) is shown instead, so stock and profit are approximate.'
      : 'Stock unknown for this month (its P&L copy is missing): closing stock is left out, so profit to date is understated by it, and no cash flow is built for this month or the next.');
  }
  if (m.tb.basis !== 'fy-to-date' && m.period.slice(5) !== '04') {
    warnings.push('This Trial Balance copy was taken from the month start (before the FY-to-date fix): profit to date may cover this month only. The next Tally poll takes it again.');
  }
  const pnl = groups.filter((g) => sideOf(g.name) === 'pnl');
  const fyProfit = r2(-pnl.reduce((s, g) => s + g.balance, 0) - tbStock + stock);

  const line = (g: Group, sign: 1 | -1): BsLine => ({
    label: g.name, amount: r2(sign * g.balance),
    ...(g.children.length ? { children: g.children.map((c) => ({
      label: c.name, amount: r2(sign * c.balance),
      ...(c.kids.length ? { children: c.kids.map((k) => ({ label: k.name, amount: r2(sign * k.balance) })) } : {}),
    })) } : {}),
  });
  const equity: BsLine[] = groups.filter((g) => sideOf(g.name) === 'equity').map((g) => line(g, -1));
  equity.push({ label: 'Profit for the year to date', amount: fyProfit });
  const liabilities = groups.filter((g) => sideOf(g.name) === 'liability').map((g) => line(g, -1));
  const assets = groups.filter((g) => sideOf(g.name) === 'asset' && (g.balance !== 0 || g.children.length > 0)).map((g) => line(g, 1));
  if (!stockUnknown) assets.push({ label: 'Closing Stock', amount: r2(stock) });
  for (const g of groups.filter((x) => sideOf(x.name) === 'other')) {
    if (g.balance >= 0) assets.push(line(g, 1)); else liabilities.push(line(g, -1));
  }
  const totalA = r2(assets.reduce((s, l) => s + l.amount, 0));
  const diff = r2(totalA - [...equity, ...liabilities].reduce((s, l) => s + l.amount, 0));
  if (Math.abs(diff) >= 1) {
    liabilities.push({ label: 'Difference in Trial Balance', amount: diff });
    warnings.push(`The Trial Balance Tally gave doesn't tie (₹${Math.abs(diff).toLocaleString('en-IN')}): usually opening-balance differences or a voucher saved with a difference. Check Tally's Trial Balance.`);
  }

  // Cash & bank = Current Assets' Bank Accounts / Cash-in-Hand (sub-groups or their ledgers), or a bank-named ledger
  // filed straight under Current Assets (e.g. "HDFC Bank").
  const ca = groups.filter((g) => /current assets/i.test(g.name));
  const placedElsewhere = (n: Node) => chain(n.name, parents).some((a) => !/current assets/i.test(a));
  const isCash = (n: Node) => under(n, CASH_GROUP) || (!placedElsewhere(n) && looksCash(n.name));
  let cash = 0;
  for (const g of ca) for (const c of g.children) if (isCash(c)) cash += c.balance;
  if (ca.some((g) => g.balance !== 0) && !ca.some((g) => g.children.length)) warnings.push('Current Assets came without its sub-groups — cash & bank could not be split out.');
  // Bank OD / CC = Bank OD A/c (sub-group or its ledgers) or an OD / CC-named ledger under the liabilities.
  let bankOd = 0;
  for (const g of groups.filter((x) => sideOf(x.name) === 'liability')) {
    if (OD_GROUP.test(g.name)) { bankOd += -g.balance; continue; }
    for (const c of g.children) if (under(c, OD_GROUP) || looksOd(c.name)) bankOd += -c.balance;
  }
  const caTotal = ca.reduce((s, g) => s + g.balance, 0);
  const cl = groups.filter((g) => isCl(g.name)).reduce((s, g) => s - g.balance, 0);
  const retained = r2(-groups.filter((g) => /^profit\s*&\s*loss a\/?c/i.test(g.name)).reduce((s, g) => s + g.balance, 0));

  return {
    period: m.period, asOf: m.asOf, equity, liabilities, assets,
    totalEquityLiabilities: r2([...equity, ...liabilities].reduce((s, l) => s + l.amount, 0)), totalAssets: totalA,
    cash: r2(cash), bankOd: r2(bankOd), fyProfit, retained, tbStock,
    workingCapital: r2(caTotal - cash + stock - cl),
    ...(stockUnknown ? { stockUnknown: true } : {}),
    warnings,
  };
}

const sumBy = (lines: BsLine[], re: RegExp) => lines.filter((l) => re.test(l.label)).reduce((s, l) => s + l.amount, 0);
/** "Other" at or above this (₹) is called out: the statement should explain nearly all of the change in cash. */
export const OTHER_WARN_INR = 10_000;

/** Cash flow of month `cur` from the Balance Sheets at the end of `prev` (the month before) and `cur`. */
export function cashFlow(prev: BalanceSheet, cur: BalanceSheet, depreciation: number, pnlProfit: number | null = null): CashFlow {
  const newFy = fyStartMonth(cur.period) === cur.period;
  const profit = r2(newFy ? cur.fyProfit : cur.fyProfit - prev.fyProfit);
  const caEx = (b: BalanceSheet) => sumBy(b.assets, /current assets/i) - b.cash;
  const stock = (b: BalanceSheet) => sumBy(b.assets, /^closing stock$/i);
  const cl = (b: BalanceSheet) => b.liabilities.filter((l) => isCl(l.label)).reduce((s, l) => s + l.amount, 0);
  const wc = [
    { label: 'Receivables, advances & other current assets', amount: r2(-(caEx(cur) - caEx(prev))) },
    { label: 'Inventory', amount: r2(-(stock(cur) - stock(prev))) },
    { label: 'Payables & other current liabilities', amount: r2(cl(cur) - cl(prev)) },
  ];
  const operating = r2(profit + depreciation + wc.reduce((s, x) => s + x.amount, 0));
  const fa = (b: BalanceSheet) => sumBy(b.assets, /fixed assets/i);
  const inv = (b: BalanceSheet) => sumBy(b.assets, /investments/i);
  const capex = r2(-(fa(cur) - fa(prev) + depreciation));
  const investments = r2(-(inv(cur) - inv(prev)));
  // Equity raised = Δ capital only (retained profit moves with the year's profit, not as financing).
  const capital = (b: BalanceSheet) => sumBy(b.equity, /capital account|share capital|reserves/i);
  const equity = r2(capital(cur) - capital(prev));
  const loans = (b: BalanceSheet) => sumBy(b.liabilities, /loans?|bank od|bank o\.?c\.?c/i);
  const loansD = r2(loans(cur) - loans(prev));
  // Profit & Loss A/c: in April Tally carries last FY's profit into it (the profit line already resets with the FY); any
  // other movement is a prior-period entry booked straight to it.
  const retained = r2(cur.retained - prev.retained - (newFy ? prev.fyProfit : 0));
  const netChange = r2(cur.cash - prev.cash);
  const other = r2(netChange - (operating + capex + investments + equity + loansD + retained));
  const warnings: string[] = [];
  if (pnlProfit != null && Math.abs(profit - pnlProfit) > Math.max(1000, Math.abs(pnlProfit) * 0.01)) {
    warnings.push(`Profit from the two Balance Sheets (${inr(profit)}) differs from the month's P&L copy (${inr(pnlProfit)}) by ${inr(profit - pnlProfit)} — usually a voucher back-dated after one copy was taken, or a stock-valuation change. The next Tally poll re-takes recent months.`);
  }
  if (Math.abs(other) >= OTHER_WARN_INR) {
    warnings.push(`${inr(other)} of the change in cash isn't explained by the lines above (Suspense, Misc. Expenses, Branch / Divisions, a Trial Balance difference or a group this builder doesn't classify). Check those balances in Tally.`);
  }
  return {
    period: cur.period, profit, pnlProfit, depreciation: r2(depreciation), workingCapital: wc, operating,
    capex, investments, investing: r2(capex + investments), equity, loans: loansD, financing: r2(equity + loansD),
    retained, other, netChange, openingCash: prev.cash, closingCash: cur.cash,
    openingNetCash: r2(prev.cash - prev.bankOd), closingNetCash: r2(cur.cash - cur.bankOd), asOf: cur.asOf, warnings,
  };
}

/** Balance Sheets and Cash Flows for every stored month (a flow needs the month before stored too, and both stocks known). */
export function statements(months: StatementMonthIn[], parents?: Parents): { sheets: BalanceSheet[]; flows: CashFlow[] } {
  const sorted = [...months].sort((a, b) => a.period.localeCompare(b.period));
  const sheets = sorted.map((m) => balanceSheet(m, parents)).filter((b): b is BalanceSheet => !!b);
  const by = new Map(sheets.map((b) => [b.period, b]));
  const mon = new Map(sorted.map((m) => [m.period, m]));
  const flows: CashFlow[] = [];
  for (const b of sheets) {
    const p = by.get(prevMonth(b.period));
    if (p && !p.stockUnknown && !b.stockUnknown) flows.push(cashFlow(p, b, mon.get(b.period)?.depreciation ?? 0, mon.get(b.period)?.nettProfit ?? null));
  }
  return { sheets, flows };
}

const monthEndMs = (p: string) => { const [y, m] = p.split('-').map(Number); return Date.UTC(y, m, 0, 18, 29, 59); };
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
/** A whole month: ended before `today`'s month, its TB copied ≥ 5 days after month end (unknown date = counted). */
export function flowComplete(f: Pick<CashFlow, 'period' | 'asOf'>, today: string): boolean {
  if (f.period >= today.slice(0, 7)) return false;
  if (!f.asOf) return true;
  const t = Date.parse(f.asOf);
  return !Number.isFinite(t) || t >= monthEndMs(f.period) + 5 * 86_400_000;
}

/**
 * MIS Sheet cash rows (₹) for a month, on NET cash (cash & bank − bank OD / CC), so an overdraft-funded burn shows.
 * Burn = opening + equity raised − closing (net cash used other than fresh equity; term loans drawn reduce it, the OD does
 * not), so Opening + Funding − Burn = Closing. Runway (quarters) = closing net cash ÷ (3 × the average monthly burn over this
 * month and the two calendar months before it, those stored and whole); null when the business isn't burning cash.
 * A running month, or one whose books were copied < 5 days after month end, gives null (not a whole month).
 */
export function misCashRows(flows: CashFlow[], period: string, today: string = istToday()): { openingCash: number; closingCash: number; funding: number; cashBurn: number; runway: number | null } | null {
  const by = new Map(flows.filter((f) => flowComplete(f, today)).map((f) => [f.period, f]));
  const f = by.get(period);
  if (!f) return null;
  const burnOf = (x: CashFlow) => x.openingNetCash + x.equity - x.closingNetCash;
  const win = [period, prevMonth(period), prevMonth(prevMonth(period))].map((p) => by.get(p)).filter((x): x is CashFlow => !!x);
  const avg = win.reduce((s, x) => s + burnOf(x), 0) / win.length;
  const runway = avg > 0 ? r2(Math.max(0, f.closingNetCash) / (avg * 3)) : null;
  return { openingCash: f.openingNetCash, closingCash: f.closingNetCash, funding: f.equity, cashBurn: r2(burnOf(f)), runway };
}
