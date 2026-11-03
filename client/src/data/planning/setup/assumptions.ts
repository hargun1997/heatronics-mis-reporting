// Setup → Assumptions (docs/planning/ONE-SETUP.md §2.2): the pure side — the collapsed summary line and the
// small selectors / mutations the section's inputs share. No React here; server/test/setup-assumptions.test.ts covers it.

import { CHANNELS, resolveFx, type CashInputs, type Plan } from '../engine';

/** The FYs after the 18-month sheet that the growth levers drive. */
export const EXT_FYS = ['FY29', 'FY30', 'FY31'] as const;

/** Local copy of the Plan-basis rule (mode.ts is written by the Starting-point agent; swap when it lands). */
export const planMode = (plan: Pick<Plan, 'fx'>): 'sheet' | 'plan' => (!plan.fx || plan.fx.sheetParity ? 'sheet' : 'plan');

/** Average unit growth across the channels for one FY (the headline lever's value). */
export function avgGrowth(plan: Pick<Plan, 'levers'>, fy: string): number {
  return CHANNELS.reduce((a, c) => a + (plan.levers.growth[fy]?.[c] ?? 0), 0) / CHANNELS.length;
}

/** The headline lever: the same unit growth on every channel for that FY. */
export function setAllGrowth(p: Plan, fy: string, v: number): void {
  p.levers.growth[fy] ??= { A: 0, D: 0, F: 0, G: 0, P: 0 };
  for (const c of CHANNELS) p.levers.growth[fy][c] = v;
}

/** One channel's growth for one FY (creates the FY row when the plan has none). */
export function setChannelGrowth(p: Plan, fy: string, ch: (typeof CHANNELS)[number], v: number): void {
  p.levers.growth[fy] ??= { A: 0, D: 0, F: 0, G: 0, P: 0 };
  p.levers.growth[fy][ch] = v;
}

/** The working-capital / GST / tax / interest inputs of the sheet's Cash Flow & Fundraise tab (the opening values live in Starting point). */
export type CashFieldKey = Exclude<keyof CashInputs, 'openingCash' | 'openingInventory' | 'openingDebt' | 'interestSteps' | 'outputGst' | 'inputGstGoods' | 'inputGstServices'>;
export const CASH_FIELDS: { k: CashFieldKey; label: string; unit: 'pct' | 'num'; hint?: string }[] = [
  { k: 'inventoryDays', label: 'Inventory days', unit: 'num', hint: 'Forward cover on the next 3 months’ COGS' },
  { k: 'gmStandard', label: 'Standard gross margin (for inventory)', unit: 'pct' },
  { k: 'receivableDays', label: 'Receivable days', unit: 'num' },
  { k: 'payableDays', label: 'Payable days', unit: 'num' },
  { k: 'refundLagMonths', label: 'GST refund lag (months)', unit: 'num', hint: 'Goods ITC refund under inverted duty' },
  { k: 'gstWriteOffPct', label: 'Stuck services ITC written off', unit: 'pct', hint: 'Share of non-refundable ITC expensed instead of carried' },
  { k: 'interestRate', label: 'Interest rate (start)', unit: 'pct', hint: 'Rate changes are listed below' },
  { k: 'taxRate', label: 'Tax rate', unit: 'pct' },
  { k: 'contingencyPct', label: 'Contingency on peak deficit', unit: 'pct', hint: '18-month and full-plan ask' },
];

/** A new interest-rate step: the month after the last step (else M13), at the rate in force then. */
export function addInterestStep(p: Plan): void {
  const steps = (p.cash.interestSteps ??= []);
  const last = steps.length ? steps[steps.length - 1] : null;
  steps.push({ month: last ? last.month + 1 : 13, rate: last ? last.rate : p.cash.interestRate });
}

/** The switches the engine really applies: under sheet parity every one is legacy and tax is booked monthly. */
export function effectiveSwitches(plan: Plan): { revenueExGst: boolean; taxByFy: boolean } {
  const sheet = planMode(plan) === 'sheet';
  return { revenueExGst: resolveFx(plan).revenueExGst, taxByFy: !sheet && plan.levers.taxMode === 'fy' };
}

/** "+60%", "−5%", "+0%": whole percent with its sign. */
export const signedPct = (v: number): string => {
  const n = Math.round(v * 100);
  return (n < 0 ? '−' : '+') + Math.abs(n) + '%';
};

/** The collapsed line: `FY29 +60% · FY30 +45% · FY31 +35% · price +0%/yr · inflation 6% · ex-GST P&L · tax by FY` (≤ 90 chars). */
export function summary(plan: Plan): string {
  const L = plan.levers;
  const fx = effectiveSwitches(plan);
  return [
    ...EXT_FYS.map((fy) => `${fy} ${signedPct(avgGrowth(plan, fy))}`),
    `price ${signedPct(L.aspGrowthPct)}/yr`,
    `inflation ${Math.round(L.inflationPct * 100)}%`,
    fx.revenueExGst ? 'ex-GST P&L' : 'GMV P&L',
    fx.taxByFy ? 'tax by FY' : 'tax as sheet',
  ].join(' · ');
}
