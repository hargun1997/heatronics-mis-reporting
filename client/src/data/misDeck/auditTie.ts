// ----------------------------------------------------------------------------
// Published history tied to the AUDITED financial statements (10 Nov 2026, audit recon).
//
// The workbook months (MIS-Sheet_FINAL_channels.xlsx) tie to the audited accounts at company level after these
// year-end entries, applied once at read time in publishedBasis (every reader takes PUBLISHED_MONTHS):
//
//  • FY24-25: the workbook costs raw material at a flat 30.97 % of revenue every month. The audited consumption (to the
//    audited closing stock) is lower: "Audit true-up: material" in Mar 2025 (an opex line, positive = less cost, so it
//    sits below CM3 and channels / SKU cells keep their own cost). Other income and tax are booked in March too.
//  • FY25-26: other income was netted into opex with no line: it now shows as its own "Other income" opex line (opex total
//    unchanged). A small material + finance-cost true-up and the deferred-tax credit in Mar 2026. Jan–Mar 2026
//    inter-branch transfers set to the books and the gross → returns → GST build-up made to foot to the restated net.
//  • Dec 2023 – Mar 2024 (4 months of FY23-24): the workbook charged the whole year's depreciation in Mar 2024. Only 4/12
//    of it belongs to these months; it is spread over them (the other 8/12 belongs to Apr–Nov 2023, not in the MIS).
//
// Tax sits inside Non-operating as its own line ("Tax (incl. deferred)"), so Net income = profit after tax; the rest of
// Non-operating (interest, depreciation, true-up of finance cost) is one line per month. All amounts ₹, rounded to the rupee.
// ----------------------------------------------------------------------------

import type { MonthlyMIS, SalesChannel } from './misDeckData';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const AUDIT_TRUE_UP_LINE = 'Audit true-up: material (audit adjustment)';
export const AUDIT_FINANCE_LINE = 'Audit true-up: finance cost (audit adjustment)';
export const OTHER_INCOME_LINE = 'Other income';
export const TAX_LINE = 'Tax (incl. deferred)';
export const NON_OP_LINE = 'Interest & depreciation';

/** One audited year's year-end entries on the published months. */
export interface AuditYear {
  fy: string;
  /** Year-end month the entries are booked in. */
  month: string;
  /** Material true-up (₹): positive = the audited consumption is lower than the workbook (EBITDA up). */
  materialTrueUp: number;
  /** Finance-cost true-up (₹): positive = more finance cost than the workbook. */
  financeTrueUp: number;
  /** Other income (₹). */
  otherIncome: number;
  /** true = already inside the workbook's opex total (only the line is added); false = new income (opex goes down). */
  otherIncomeInOpex: boolean;
  /** Current + deferred tax (₹): positive = charge, negative = credit. */
  tax: number;
  /** Inter-branch transfers per the books for these months (₹), spread over them in proportion to the workbook's. */
  interBranch?: { months: string[]; total: number };
  note: string;
}

export const AUDIT_YEARS: AuditYear[] = [
  {
    fy: 'FY24-25', month: '2025-03',
    // audited material consumption ex inter-branch is ₹11,70,367 below the workbook's 30.97 % proxy; + ₹1,604 revenue rounding
    materialTrueUp: 1_171_971, financeTrueUp: 0,
    otherIncome: 27_660, otherIncomeInOpex: false,
    tax: 295_085,
    note: 'FY24-25 trued up to the audited accounts in Mar 2025 (audit adjustment): material ₹11.72 L less (workbook used a flat 30.97 % material rate), other income ₹0.28 L, tax ₹2.95 L.',
  },
  {
    fy: 'FY25-26', month: '2026-03',
    materialTrueUp: -8_997, financeTrueUp: 5_215,
    otherIncome: 146_730, otherIncomeInOpex: true,
    tax: -86_458,
    interBranch: { months: ['2026-01', '2026-02', '2026-03'], total: 1_193_198 },
    note: 'FY25-26 tied to the audited accounts in Mar 2026 (audit adjustment): other income ₹1.47 L shown on its own line, deferred-tax credit ₹0.86 L, material / finance cost true-up ₹0.14 L.',
  },
];

/** FY23-24 in the MIS = Dec 2023 – Mar 2024 only; the workbook put the full year's depreciation in Mar 2024. */
export const PARTIAL_FY_DEPRECIATION = { months: ['2023-12', '2024-01', '2024-02', '2024-03'], bookedIn: '2024-03', yearAmount: 1_388_002 };
const PARTIAL_NOTE = 'Dec 2023 – Mar 2024 is 4 months of FY23-24: depreciation cut to 4/12 of the year (₹4.63 L, spread evenly); the rest belongs to Apr–Nov 2023, not in the MIS.';

/** Jan–Mar 2026 (restated): the build-up foots to the restated net (gross / returns = Σ channels, GST = the gap). */
export function footBuildUp(m: MonthlyMIS): MonthlyMIS {
  if (!m.restated) return m;
  const sum = (o: Partial<Record<SalesChannel, number>>) => Object.values(o).reduce((s: number, v) => s + (v ?? 0), 0);
  const gross = r2(sum(m.grossByChannel)), returns = r2(sum(m.returnsByChannel));
  const net = sum(m.gmvByChannel ?? m.netByChannel);
  if (Math.abs(gross + returns - net) > 2) return m;          // channel rows don't foot themselves: leave as booked
  return {
    ...m, totalGrossRevenue: gross, totalReturns: returns, totalTaxes: r2(m.netRevenue - net),
    turnover: r2(m.netRevenue + m.interBranch),
    restated: 'FY2025-26 Jan–Mar costs allocated to tie to the audited year (31-03-2026)',
  };
}

const withNonOpLines = (m: MonthlyMIS, extra: Record<string, number> = {}): MonthlyMIS => {
  if (m.nonOpLines) return m;
  const lines: Record<string, number> = {};
  if (m.nonOperating) lines[NON_OP_LINE] = -m.nonOperating;
  for (const [k, v] of Object.entries(extra)) if (v) lines[k] = r2((lines[k] ?? 0) + v);
  return Object.keys(lines).length ? { ...m, nonOpLines: lines } : m;
};

/** Book one audited year's year-end entries on its months. Pure; months outside the year are returned as is. */
export function applyAuditYear(months: MonthlyMIS[], y: AuditYear): MonthlyMIS[] {
  const ib = y.interBranch;
  const ibBooked = ib ? months.filter((m) => ib.months.includes(m.key)).reduce((s, m) => s + m.interBranch, 0) : 0;
  return months.map((m) => {
    let out = m;
    if (ib && ib.months.includes(m.key) && ibBooked > 0) {
      const interBranch = r2(m.interBranch * (ib.total / ibBooked));
      out = { ...out, interBranch, turnover: r2(out.netRevenue + interBranch) };
    }
    if (m.key !== y.month) return out;
    const opexDelta = -y.materialTrueUp - (y.otherIncomeInOpex ? 0 : y.otherIncome);   // opex is a positive cost
    const opex = r2(out.opex + opexDelta);
    const ebitda = r2(out.ebitda - opexDelta);
    const preTaxNonOp = r2(out.nonOperating + y.financeTrueUp);
    const nonOperating = r2(preTaxNonOp + y.tax);
    const lines: Record<string, number> = { ...out.opexLines };
    if (y.materialTrueUp) lines[AUDIT_TRUE_UP_LINE] = y.materialTrueUp;
    if (y.otherIncome) lines[OTHER_INCOME_LINE] = r2((lines[OTHER_INCOME_LINE] ?? 0) + y.otherIncome);
    const nonOpLines: Record<string, number> = { ...(out.nonOperating ? { [NON_OP_LINE]: -out.nonOperating } : {}) };
    if (y.financeTrueUp) nonOpLines[AUDIT_FINANCE_LINE] = -y.financeTrueUp;
    if (y.tax) nonOpLines[TAX_LINE] = -y.tax;
    return {
      ...out, opex, ebitda, nonOperating, netIncome: r2(ebitda - nonOperating - (out.costOfFundraising ?? 0)),
      opexLines: lines, nonOpLines, auditNote: y.note,
    };
  });
}

/** Dec 2023 – Mar 2024: depreciation cut to 4/12 of the year, spread evenly over the 4 months. Pure. */
export function spreadPartialDepreciation(months: MonthlyMIS[]): MonthlyMIS[] {
  const d = PARTIAL_FY_DEPRECIATION;
  const per = d.yearAmount / 12;                        // 4 months × (year ÷ 12) = 4/12 of the year
  return months.map((m) => {
    if (!d.months.includes(m.key)) return m;
    const delta = r2(m.key === d.bookedIn ? per - d.yearAmount : per);
    const nonOperating = r2(m.nonOperating + delta);
    return { ...m, nonOperating, netIncome: r2(m.netIncome - delta), auditNote: PARTIAL_NOTE };
  });
}

/**
 * The published months tied to the audited accounts (see the header). Every published month before the live boundary
 * gets its Non-operating as a line (and Tax as its own line where the audit has it), so a year's EBT and tax read
 * straight off the lines. Pure and idempotent on already-tied months (they carry `nonOpLines`).
 */
export function tieToAudit(months: MonthlyMIS[], before = '2026-04'): MonthlyMIS[] {
  if (months.some((m) => m.key < before && m.nonOpLines)) return months;
  let out = months.map((m) => (m.key < before ? footBuildUp(m) : m));
  out = spreadPartialDepreciation(out);
  for (const y of AUDIT_YEARS) out = applyAuditYear(out, y);
  return out.map((m) => (m.key < before ? withNonOpLines(m) : m));
}

// ---- Views ---------------------------------------------------------------------

/** Tax inside a month's / period's Non-operating lines (charge positive, credit negative); null = no tax line (no data). */
export function taxOf(nonOpLines: Record<string, number> | null | undefined): number | null {
  const tax = Object.entries(nonOpLines ?? {}).filter(([k]) => /\btax/i.test(k));
  return tax.length ? r2(-tax.reduce((s, [, v]) => s + v, 0)) : null;
}

/** "FY23-24 (Dec 23–Mar 24, 4 months)" for a year bucket that starts after its April; else the key. */
export function fyBucketLabel(key: string, members: string[], monthLabel: (k: string) => string): string {
  const m = /^FY(\d\d)-\d\d$/.exec(key);
  if (!m || !members.length) return key;
  const april = `20${m[1]}-04`;
  if (members[0] <= april) return key;
  const n = members.length;
  return `${key} (${monthLabel(members[0])}–${monthLabel(members[n - 1])}, ${n} months)`;
}

/** One line for a year's P&L: the inter-branch transfers the audited revenue carries and the MIS leaves out. null when none. */
export function interBranchNote(label: string, interBranch: number | null | undefined): string | null {
  if (!interBranch || interBranch <= 0) return null;
  return `${label}: audited revenue includes ₹${(interBranch / 1e5).toFixed(2)} L inter-branch transfers; MIS excludes them.`;
}

/** Company lines below EBITDA (MIS sheet): from EBITDA, net income and the Non-operating lines; tax = its own line, null when none. */
export function belowEbitda(ebitda: number, netIncome: number, nonOpLines: Record<string, number> | null | undefined): { nonOperating: number; pbt: number; tax: number | null; netIncome: number } {
  const tax = taxOf(nonOpLines);
  const pbt = r2(netIncome + (tax ?? 0));
  return { nonOperating: r2(ebitda - pbt), pbt, tax, netIncome };
}
