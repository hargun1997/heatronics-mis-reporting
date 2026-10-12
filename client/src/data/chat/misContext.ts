// ----------------------------------------------------------------------------
// MIS context pack — serialise the committed MIS into a compact, high-signal
// block that grounds the chat. It's the monthly contribution-margin P&L plus
// the fiscal-year summary; stable across a session so the server can cache it.
// ----------------------------------------------------------------------------

import { MONTHLY_MIS, FY_SUMMARY, type MonthlyMIS } from '../misDeck/misDeckData';
import type { LiveDeckData } from '../misDeck/liveDeck';

const r = (n: number) => Math.round(n);

export interface MisContext {
  context: string;
  throughLabel: string;
}

function serialiseMonths(list: MonthlyMIS[]) {
  return list.map((m) => ({
    month: m.label,
    netRevenue: r(m.netRevenue), cogm: r(m.cogm), grossMargin: r(m.grossMargin),
    channelFulfillment: r(m.channelFulfillment), cm1: r(m.cm1), salesMarketing: r(m.salesMarketing),
    cm2: r(m.cm2), platformCosts: r(m.platformCosts), cm3: r(m.cm3), opex: r(m.opex),
    ebitda: r(m.ebitda), nonOperating: r(m.nonOperating), netIncome: r(m.netIncome),
    netByChannel: Object.fromEntries(Object.entries(m.netByChannel).map(([k, v]) => [k, r(v as number)])),
    ...(m.restated ? { note: m.restated } : {}),
  }));
}

const SCHEMA_LINE =
  'Each month: netRevenue, cogm (cost of goods manufactured), grossMargin, channelFulfillment, cm1, salesMarketing, cm2, platformCosts, cm3, opex, ebitda, nonOperating, netIncome, and netByChannel (net revenue split by channel). "note" marks a restated month.';

export function buildMisContext(): MisContext {
  const months = serialiseMonths([...MONTHLY_MIS]);
  const throughLabel = MONTHLY_MIS[MONTHLY_MIS.length - 1]?.label ?? 'latest';

  const context = [
    'Company: Heatronics Medical Devices Pvt Ltd — D2C orthopedic heat-therapy devices, India.',
    `All figures in ₹ (rupees). Monthly contribution-margin P&L, Dec 2023 → ${throughLabel}.`,
    SCHEMA_LINE,
    '',
    'MONTHLY_PNL (JSON):',
    JSON.stringify(months),
    '',
    'FISCAL_YEAR_SUMMARY (JSON):',
    JSON.stringify(FY_SUMMARY),
  ].join('\n');

  return { context, throughLabel };
}

/**
 * Context grounded in the LIVE deck (durable uploads): the published history
 * plus the live months, each tagged with how complete it is, so the AI knows
 * which lines are reconciled and which are provisional.
 */
export function buildLiveMisContext(deck: LiveDeckData | null): MisContext {
  const history = serialiseMonths([...MONTHLY_MIS]);
  const staticLast = MONTHLY_MIS[MONTHLY_MIS.length - 1]?.key ?? '';

  const liveMonths = (deck?.months ?? []).map((m) => {
    const comp = deck?.completeness[m.key];
    return {
      ...serialiseMonths([m])[0],
      key: m.key,
      completeness: comp?.level ?? 'topline', // full | contribution | topline
      newerThanPublished: m.key > staticLast,
    };
  });

  const completeThrough = deck?.completeThrough ?? null;
  const latestLive = deck?.periods[deck.periods.length - 1] ?? null;
  // Resolve a YYYY-MM key to its human month label via the deck's own months.
  const labelFor = (key: string | null): string | null =>
    key ? (deck?.months.find((m) => m.key === key)?.label ?? key) : null;
  const throughLabel =
    labelFor(completeThrough) ?? labelFor(latestLive) ?? MONTHLY_MIS[MONTHLY_MIS.length - 1]?.label ?? 'latest';

  const context = [
    'Company: Heatronics Medical Devices Pvt Ltd — D2C orthopedic heat-therapy devices, India.',
    'All figures in ₹ (rupees). You are analysing the MIS (Management Information System) P&L.',
    SCHEMA_LINE,
    '',
    'There are two data sets:',
    '1) PUBLISHED_HISTORY — the reconciled monthly P&L from the month close (the published truth).',
    '2) LIVE_MONTHS — months rebuilt live from uploaded source files. Each has a "completeness" level:',
    '   "full" = reconciled to Tally, every line real; "contribution" = real only through CM2 (OPEX/EBITDA/NetIncome not yet in, needs the Tally P&L); "topline" = only net revenue, channel fees and ad spend are real.',
    `   Do NOT treat EBITDA/NetIncome of non-"full" live months as real. The MIS is fully closed through: ${completeThrough ?? 'no month yet'}.`,
    '',
    'PUBLISHED_HISTORY (JSON):',
    JSON.stringify(history),
    '',
    'LIVE_MONTHS (JSON):',
    JSON.stringify(liveMonths),
    '',
    'FISCAL_YEAR_SUMMARY (JSON):',
    JSON.stringify(FY_SUMMARY),
  ].join('\n');

  return { context, throughLabel };
}
