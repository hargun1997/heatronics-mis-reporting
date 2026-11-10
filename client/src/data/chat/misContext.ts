// ----------------------------------------------------------------------------
// MIS context pack — the grounding block for the chat / AI Insights / Send report.
//
// ONE source: the built Live MIS deck (liveDeck.buildLiveDeck), i.e. the same months the Live MIS page shows —
// locked history on the live basis (channel rows ex-GST, Amazon as Amazon), then the live Tally-backed months.
// Nothing here reads the raw workbook arrays or the stored FY_SUMMARY: the fiscal-year block is summed from the
// deck's months (10 Nov 2026: the stored summary was stale and the raw months disagreed with the screen).
// ----------------------------------------------------------------------------

import { SALES_CHANNELS, type MonthlyMIS, type SalesChannel } from '../misDeck/misDeckData';
import { buildLiveDeck, type LiveDeckData, type PeriodCompleteness } from '../misDeck/liveDeck';

const r = (n: number) => Math.round(n);
const rec = (o: Partial<Record<SalesChannel, number>>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(v as number)]));

export interface MisContext {
  context: string;
  throughLabel: string;
}

type Completeness = Record<string, PeriodCompleteness>;
const sourceOf = (c?: PeriodCompleteness) => (c?.locked ? 'published workbook (locked history)' : c?.published ? 'published workbook' : c?.hasTally ? 'Tally' : 'connectors only');

/** The deck's months as the chat sees them. The deck keeps Cost of Fundraising outside nonOperating on every month. */
export function contextMonths(months: MonthlyMIS[], completeness: Completeness) {
  return months.map((m) => {
    const c = completeness[m.key];
    return {
      key: m.key, month: m.label,
      completeness: c?.level ?? 'topline', // full | contribution | topline
      source: sourceOf(c),
      netRevenue: r(m.netRevenue), cogm: r(m.cogm), grossMargin: r(m.grossMargin),
      channelFulfillment: r(m.channelFulfillment), cm1: r(m.cm1), salesMarketing: r(m.salesMarketing),
      cm2: r(m.cm2), platformCosts: r(m.platformCosts), cm3: r(m.cm3), opex: r(m.opex),
      ebitda: r(m.ebitda),
      nonOperating: r(m.nonOperating),
      ...(m.costOfFundraising ? { costOfFundraising: r(m.costOfFundraising) } : {}),
      netIncome: r(m.netIncome),
      netByChannel: rec(m.netByChannel),
      ...(m.gmvByChannel ? { gmvByChannelInclGst: rec(m.gmvByChannel) } : {}),
      ...(m.marketingByPlatform && Object.keys(m.marketingByPlatform).length
        ? { marketingByPlatform: Object.fromEntries(Object.entries(m.marketingByPlatform).map(([k, v]) => [k, r(v)])) }
        : {}),
      ...(c?.vsPublished ? { vsPublishedWorkbook: { netRevenueChange: r(c.vsPublished.dNetRevenue), netIncomeChange: r(c.vsPublished.dNetIncome) } } : {}),
      ...(m.restated ? { note: m.restated } : {}),
    };
  });
}

export interface FySummaryRow {
  name: string;
  /** Months of the year that have data, e.g. "Dec 2023–Mar 2024" (a year can be part only). */
  months: number; from: string; to: string;
  netRevenue: number;
  netByChannel: Record<string, number>;
  mix: Record<string, number>;
  /** Months whose whole P&L is real (level full); margins below are over those months only, null when there are none. */
  fullPnlMonths: number;
  grossMarginPct: number | null; ebitdaPct: number | null; netIncomePct: number | null;
  ebitda: number | null; netIncome: number | null;
}

/** Fiscal-year totals summed from the deck's own months (April–March). Pure. */
export function fySummaryOf(months: MonthlyMIS[], completeness: Completeness): FySummaryRow[] {
  const groups = new Map<number, MonthlyMIS[]>();
  for (const m of [...months].sort((a, b) => a.key.localeCompare(b.key))) {
    const start = m.month >= 4 ? m.year : m.year - 1;
    groups.set(start, [...(groups.get(start) ?? []), m]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([start, ms]) => {
    const netRevenue = ms.reduce((s, m) => s + m.netRevenue, 0);
    const byCh: Record<string, number> = {};
    for (const ch of SALES_CHANNELS) {
      const v = ms.reduce((s, m) => s + (m.netByChannel[ch] ?? 0), 0);
      if (v) byCh[ch] = v;
    }
    const full = ms.filter((m) => (completeness[m.key]?.level ?? 'topline') === 'full');
    const fr = full.reduce((s, m) => s + m.netRevenue, 0);
    const of = (f: (m: MonthlyMIS) => number) => (full.length && fr ? Math.round((full.reduce((s, m) => s + f(m), 0) / fr) * 1000) / 1000 : null);
    return {
      name: `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`,
      months: ms.length, from: ms[0].label, to: ms[ms.length - 1].label,
      netRevenue: r(netRevenue),
      netByChannel: Object.fromEntries(Object.entries(byCh).map(([k, v]) => [k, r(v)])),
      mix: Object.fromEntries(Object.entries(byCh).map(([k, v]) => [k, netRevenue ? Math.round((v / netRevenue) * 1000) / 1000 : 0])),
      fullPnlMonths: full.length,
      grossMarginPct: of((m) => m.grossMargin), ebitdaPct: of((m) => m.ebitda), netIncomePct: of((m) => m.netIncome),
      ebitda: full.length ? r(full.reduce((s, m) => s + m.ebitda, 0)) : null,
      netIncome: full.length ? r(full.reduce((s, m) => s + m.netIncome, 0)) : null,
    };
  });
}

const SCHEMA_LINE =
  'Each month: key, completeness, source, netRevenue, cogm (cost of goods manufactured), grossMargin, channelFulfillment, cm1, salesMarketing, cm2, platformCosts, cm3, opex, ebitda, nonOperating (interest / D&A / tax, EXCLUDING fundraising), costOfFundraising (one-time capital-raising cost, only when non-zero; netIncome = ebitda − nonOperating − costOfFundraising), netIncome, netByChannel (net revenue by channel, ex-GST; the channels add up to netRevenue), gmvByChannelInclGst (published months only: what customers paid, net of returns, including GST), marketingByPlatform (salesMarketing by ad platform, when available), vsPublishedWorkbook (only on a month that now comes from Tally and was also in the earlier published workbook: change in ₹ vs that workbook). "note" marks a restated month.';

/**
 * Context grounded in the Live MIS deck. `deck` null (still loading / failed) = the published history only,
 * built the same way, so the numbers are the screen's either way.
 */
export function buildLiveMisContext(deck: LiveDeckData | null): MisContext {
  const d = deck ?? buildLiveDeck([]);
  const months = contextMonths(d.months, d.completeness);
  const completeThrough = d.completeThrough ?? null;
  const latest = d.periods[d.periods.length - 1] ?? null;
  const labelFor = (key: string | null): string | null => (key ? (d.months.find((m) => m.key === key)?.label ?? key) : null);
  const throughLabel = labelFor(completeThrough) ?? labelFor(latest) ?? 'latest';

  const context = [
    'Company: Heatronics Medical Devices Pvt Ltd — D2C orthopedic heat-therapy devices, India.',
    'All figures in ₹ (rupees). You are analysing the MIS (Management Information System) P&L, exactly as the Live MIS page shows it (actual / as-booked COGM basis).',
    SCHEMA_LINE,
    '',
    'Each month has a "completeness" level: "full" = the whole P&L is real (published workbook month, or reconciled to Tally); "contribution" = real only through CM2 (OPEX / EBITDA / NetIncome not in yet); "topline" = only net revenue, channel fees and ad spend are real.',
    `Do NOT treat EBITDA / NetIncome of a non-"full" month as real. The MIS is closed and locked through: ${labelFor(completeThrough) ?? 'no month yet'}.`,
    'Channels: Amazon is Amazon in every month (from Dec 2023). OEM and Offline are the older names of B2B and GT; the page shows them together as "B2B (OEM)" and "GT (Offline)".',
    'FISCAL_YEAR_SUMMARY is summed from these same months (April–March). A year can hold only some months: read "months", "from" and "to". Margins there cover only the months with a full P&L ("fullPnlMonths").',
    '',
    'MONTHS (JSON):',
    JSON.stringify(months),
    '',
    'FISCAL_YEAR_SUMMARY (JSON):',
    JSON.stringify(fySummaryOf(d.months, d.completeness)),
  ].join('\n');

  return { context, throughLabel };
}
