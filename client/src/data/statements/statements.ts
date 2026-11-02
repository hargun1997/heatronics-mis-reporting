// ----------------------------------------------------------------------------
// Live Balance Sheet + Cash Flow, built from Tally's stored month-end copies (READ ONLY, server/src/connectors/tally):
//   • the Trial Balance at month end (closing Dr / Cr per primary group, its children right after it),
//   • the month's P&L copy (closing stock at month end, depreciation of the month).
// Pure; tested in server/test/statements.test.ts.
//
// Balance Sheet (Schedule-III-like, Tally's own groups):
//   Equity = Capital Account + Profit & Loss A/c (retained) + profit of the FY to date
//   Liabilities = Loans (Liability) + Current Liabilities (+ Suspense / Branch, shown when present)
//   Assets = Fixed Assets + Investments + Current Assets (cash & bank split out) + Closing Stock + Misc. Expenses
//   FY profit to date = −(Σ P&L groups, Dr − Cr, incl. Opening Stock) + Closing Stock. A TB that doesn't tie leaves a
//   "Difference in Trial Balance" line so the sides still show what Tally holds.
// Cash Flow (indirect, month m vs m−1): profit of the month + depreciation − Δ working capital (current assets other
//   than cash & bank, incl. stock) + Δ current liabilities; investing = −(Δ fixed assets + depreciation) − Δ investments;
//   financing = Δ capital + Δ loans (bank OD / CC included); other = Δ suspense / misc / branch. Their sum = Δ cash & bank
//   exactly, because the BS ties to the TB.
// ----------------------------------------------------------------------------

export interface TbRowIn { name: string; level: 'group' | 'ledger'; debit: number; credit: number }
export interface StatementMonthIn {
  period: string; // YYYY-MM
  asOf: string | null;
  tb: { rows: TbRowIn[]; difference: number } | null;
  /** Closing stock at month end (positive), from the month's P&L copy. */
  closingStock: number | null;
  /** Depreciation booked in the month (positive). */
  depreciation: number;
  /** The month's Nett Profit from the P&L copy (cross-check). */
  nettProfit: number | null;
}

export type Side = 'equity' | 'liability' | 'asset' | 'pnl' | 'other';
export interface BsLine { label: string; amount: number; children?: { label: string; amount: number }[] }
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
  workingCapital: number; // current assets ex cash + stock − current liabilities
  warnings: string[];
}
export interface CashFlow {
  period: string;
  profit: number;
  depreciation: number;
  workingCapital: { label: string; amount: number }[];
  operating: number;
  capex: number;
  investments: number;
  investing: number;
  equity: number;
  loans: number;
  financing: number;
  other: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fyStartMonth = (p: string) => { const [y, m] = p.split('-').map(Number); return `${m >= 4 ? y : y - 1}-04`; };
const prevMonth = (p: string) => { const [y, m] = p.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

/** Which side of the books a primary group sits on (Tally's 28 reserved groups + common renames). */
export function sideOf(group: string): Side {
  const g = group.toLowerCase();
  if (/capital account|reserves|share capital|^profit\s*&\s*loss a\/?c/.test(g)) return 'equity';
  if (/loans? \(liability\)|secured loans|unsecured loans|bank od|current liabilities|duties|provisions|sundry creditors/.test(g)) return 'liability';
  if (/fixed assets|investments|current assets|misc\.? ?expenses|deposits|loans & advances|sundry debtors|cash|bank accounts|stock-in-hand/.test(g)) return 'asset';
  if (/sales|purchase|direct (income|expense)|indirect (income|expense)|opening stock|income|expense/.test(g)) return 'pnl';
  return 'other'; // Suspense A/c, Branch / Divisions, Difference in opening balances …
}
const isCash = (n: string) => /cash[- ]?in[- ]?hand|^cash\b|bank accounts?$|^bank\b|\bbank\b.*a\/?c|current a\/?c|savings/i.test(n) && !/od|overdraft|\bcc\b|cash credit/i.test(n);
const isOd = (n: string) => /\bod\b|overdraft|\bcc\b|cash credit|bank od/i.test(n);

interface Group { name: string; balance: number; children: { name: string; balance: number }[] } // Dr − Cr
function groupsOf(rows: TbRowIn[]): Group[] {
  const out: Group[] = [];
  for (const r of rows) {
    const bal = r2(r.debit - r.credit);
    if (r.level === 'group' || !out.length) out.push({ name: r.name, balance: bal, children: [] });
    else out[out.length - 1].children.push({ name: r.name, balance: bal });
  }
  return out;
}

export function balanceSheet(m: StatementMonthIn): BalanceSheet | null {
  if (!m.tb) return null;
  const warnings: string[] = [];
  const groups = groupsOf(m.tb.rows);
  const stock = m.closingStock ?? 0;
  if (m.closingStock == null) warnings.push('No closing stock for this month (its P&L copy is missing) — stock and profit are understated.');
  const pnl = groups.filter((g) => sideOf(g.name) === 'pnl');
  const fyProfit = r2(-pnl.reduce((s, g) => s + g.balance, 0) + stock);

  const line = (g: Group, sign: 1 | -1): BsLine => ({
    label: g.name, amount: r2(sign * g.balance),
    ...(g.children.length ? { children: g.children.map((c) => ({ label: c.name, amount: r2(sign * c.balance) })) } : {}),
  });
  const equity: BsLine[] = groups.filter((g) => sideOf(g.name) === 'equity').map((g) => line(g, -1));
  equity.push({ label: 'Profit for the year to date', amount: fyProfit });
  const liabilities = groups.filter((g) => sideOf(g.name) === 'liability').map((g) => line(g, -1));
  const assets = groups.filter((g) => sideOf(g.name) === 'asset').map((g) => line(g, 1));
  assets.push({ label: 'Closing Stock', amount: r2(stock) });
  for (const g of groups.filter((x) => sideOf(x.name) === 'other')) {
    if (g.balance >= 0) assets.push(line(g, 1)); else liabilities.push(line(g, -1));
  }
  const totalA = r2(assets.reduce((s, l) => s + l.amount, 0));
  const diff = r2(totalA - [...equity, ...liabilities].reduce((s, l) => s + l.amount, 0));
  if (Math.abs(diff) >= 1) {
    liabilities.push({ label: 'Difference in Trial Balance', amount: diff });
    warnings.push(`The Trial Balance Tally gave doesn't tie (₹${Math.abs(diff).toLocaleString('en-IN')}): usually opening-balance differences or a voucher saved with a difference. Check Tally's Trial Balance.`);
  }

  const ca = groups.filter((g) => /current assets/i.test(g.name));
  let cash = 0;
  for (const g of ca) for (const c of g.children) if (isCash(c.name)) cash += c.balance;
  if (!ca.some((g) => g.children.length) && ca.length) warnings.push('Current Assets came without its sub-groups — cash & bank could not be split out.');
  let bankOd = 0;
  for (const g of groups.filter((x) => sideOf(x.name) === 'liability')) for (const c of g.children) if (isOd(c.name)) bankOd += -c.balance;
  const caTotal = ca.reduce((s, g) => s + g.balance, 0);
  const cl = groups.filter((g) => /current liabilities|duties|provisions|sundry creditors/i.test(g.name)).reduce((s, g) => s - g.balance, 0);

  if (m.nettProfit != null && m.period.slice(5) === '04' && Math.abs(fyProfit - m.nettProfit) > Math.max(1000, Math.abs(m.nettProfit) * 0.01)) {
    warnings.push(`Profit to date (₹${Math.round(fyProfit).toLocaleString('en-IN')}) differs from April's P&L (₹${Math.round(m.nettProfit).toLocaleString('en-IN')}).`);
  }
  return {
    period: m.period, asOf: m.asOf, equity, liabilities, assets,
    totalEquityLiabilities: r2([...equity, ...liabilities].reduce((s, l) => s + l.amount, 0)), totalAssets: totalA,
    cash: r2(cash), bankOd: r2(bankOd), fyProfit,
    workingCapital: r2(caTotal - cash + stock - cl),
    warnings,
  };
}

const sumBy = (lines: BsLine[], re: RegExp) => lines.filter((l) => re.test(l.label)).reduce((s, l) => s + l.amount, 0);

/** Cash flow of month `cur` from the Balance Sheets at the end of `prev` (the month before) and `cur`. */
export function cashFlow(prev: BalanceSheet, cur: BalanceSheet, depreciation: number): CashFlow {
  const newFy = fyStartMonth(cur.period) === cur.period;
  const profit = r2(newFy ? cur.fyProfit : cur.fyProfit - prev.fyProfit);
  const caEx = (b: BalanceSheet) => sumBy(b.assets, /current assets/i) - b.cash;
  const stock = (b: BalanceSheet) => sumBy(b.assets, /^closing stock$/i);
  const cl = (b: BalanceSheet) => sumBy(b.liabilities, /current liabilities|duties|provisions|sundry creditors/i);
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
  const loans = (b: BalanceSheet) => sumBy(b.liabilities, /loans?|bank od/i);
  const loansD = r2(loans(cur) - loans(prev));
  const netChange = r2(cur.cash - prev.cash);
  const known = operating + capex + investments + equity + loansD;
  // Retained P&L A/c moves only at a year-end transfer; it lands in "other" with suspense / misc / TB differences.
  const other = r2(netChange - known);
  return {
    period: cur.period, profit, depreciation: r2(depreciation), workingCapital: wc, operating,
    capex, investments, investing: r2(capex + investments), equity, loans: loansD, financing: r2(equity + loansD),
    other, netChange, openingCash: prev.cash, closingCash: cur.cash,
  };
}

/** Balance Sheets and Cash Flows for every stored month (a flow needs the month before stored too). */
export function statements(months: StatementMonthIn[]): { sheets: BalanceSheet[]; flows: CashFlow[] } {
  const sorted = [...months].sort((a, b) => a.period.localeCompare(b.period));
  const sheets = sorted.map(balanceSheet).filter((b): b is BalanceSheet => !!b);
  const by = new Map(sheets.map((b) => [b.period, b]));
  const dep = new Map(sorted.map((m) => [m.period, m.depreciation]));
  const flows: CashFlow[] = [];
  for (const b of sheets) {
    const p = by.get(prevMonth(b.period));
    if (p) flows.push(cashFlow(p, b, dep.get(b.period) ?? 0));
  }
  return { sheets, flows };
}

/** MIS Sheet cash rows (₹) for a month: opening / closing cash, equity raised, burn, runway in quarters. */
export function misCashRows(flows: CashFlow[], period: string): { openingCash: number; closingCash: number; funding: number; cashBurn: number; runway: number | null } | null {
  const i = flows.findIndex((f) => f.period === period);
  if (i < 0) return null;
  const f = flows[i];
  const burn = r2(f.openingCash + f.equity - f.closingCash); // cash used in the month other than fresh equity
  const last3 = flows.slice(Math.max(0, i - 2), i + 1).map((x) => x.openingCash + x.equity - x.closingCash);
  const avg = last3.reduce((s, x) => s + x, 0) / last3.length;
  return { openingCash: f.openingCash, closingCash: f.closingCash, funding: f.equity, cashBurn: burn, runway: avg > 0 ? r2(f.closingCash / (avg * 3)) : null };
}
