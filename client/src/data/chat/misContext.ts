// ----------------------------------------------------------------------------
// MIS context pack — serialise the committed MIS into a compact, high-signal
// block that grounds the chat. It's the monthly contribution-margin P&L plus
// the fiscal-year summary; stable across a session so the server can cache it.
// ----------------------------------------------------------------------------

import { MONTHLY_MIS, FY_SUMMARY } from '../misDeck/misDeckData';

const r = (n: number) => Math.round(n);

export interface MisContext {
  context: string;
  throughLabel: string;
}

export function buildMisContext(): MisContext {
  const months = MONTHLY_MIS.map((m) => ({
    month: m.label,
    netRevenue: r(m.netRevenue),
    cogm: r(m.cogm),
    grossMargin: r(m.grossMargin),
    channelFulfillment: r(m.channelFulfillment),
    cm1: r(m.cm1),
    salesMarketing: r(m.salesMarketing),
    cm2: r(m.cm2),
    platformCosts: r(m.platformCosts),
    cm3: r(m.cm3),
    opex: r(m.opex),
    ebitda: r(m.ebitda),
    nonOperating: r(m.nonOperating),
    netIncome: r(m.netIncome),
    netByChannel: Object.fromEntries(Object.entries(m.netByChannel).map(([k, v]) => [k, r(v as number)])),
    ...(m.restated ? { note: m.restated } : {}),
  }));
  const throughLabel = MONTHLY_MIS[MONTHLY_MIS.length - 1]?.label ?? 'latest';

  const context = [
    'Company: Heatronics Medical Devices Pvt Ltd — D2C orthopedic heat-therapy devices, India.',
    `All figures in ₹ (rupees). Monthly contribution-margin P&L, Dec 2023 → ${throughLabel}.`,
    'Each month: netRevenue, cogm (cost of goods manufactured), grossMargin, channelFulfillment, cm1, salesMarketing, cm2, platformCosts, cm3, opex, ebitda, nonOperating, netIncome, and netByChannel (net revenue split by channel). "note" marks a restated month.',
    '',
    'MONTHLY_PNL (JSON):',
    JSON.stringify(months),
    '',
    'FISCAL_YEAR_SUMMARY (JSON):',
    JSON.stringify(FY_SUMMARY),
  ].join('\n');

  return { context, throughLabel };
}
