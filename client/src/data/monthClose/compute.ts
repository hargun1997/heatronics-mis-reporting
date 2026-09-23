// ----------------------------------------------------------------------------
// Month close — the cascade.
//
// Pure and deterministic: ledger nodes in, a MonthlyMIS-shaped result plus a
// reconciliation out. No I/O, no React, so it can be pinned by a fixture test
// (scripts/verify-month-close.ts reproduces the committed Jul-2026 close from
// its ledgers and fails the build if a number moves).
//
// Two conventions carried over from the June and July closes, both of which
// cost a round of back-and-forth when they were implicit:
//
//   Stock transfers are contra. They are stripped from both Sales and
//   Purchases, because they are the same rupees moving between our own
//   locations. The two legs rarely tie to the paisa, and that asymmetry is a
//   named reconciling item rather than something to bury.
//
//   Stock movement is Opening − Closing, and it belongs inside COGM. A flat
//   Closing = Opening — which is what Tally prints before stock is valued —
//   makes COGM look like pure purchases and flatters gross margin, so the
//   dashboard flags it.
// ----------------------------------------------------------------------------

import type { MonthlyMIS, SalesChannel } from '../misDeck/misDeckData';
import {
  CLOSE_LINES,
  RECONCILE_TOLERANCE,
  type Bucket,
  type FieldValue,
  type LedgerNode,
  type MonthCloseSession,
} from './schema';
import { pickNodes, SEED_LEDGER_MAP, type PickedNode } from './ledgerMap';

export interface LineTotal {
  lineKey: string;
  label: string;
  bucket: Bucket;
  /** Sum as Tally prints it — debits positive. */
  amount: number;
  /** Signed effect on profit: costs negative, income positive. */
  effect: number;
  contributors: PickedNode[];
  /** True when every contributing figure has been confirmed by a human. */
  verified: boolean;
}

export type BlockerKind = 'unmapped' | 'unverified' | 'reconcile' | 'missing' | 'anomaly';

export interface Blocker {
  kind: BlockerKind;
  message: string;
  /** Ledger path or line key the blocker attaches to. */
  ref?: string;
  /** Anomalies are advisory; everything else stops the emit. */
  advisory?: boolean;
}

export interface ReconcileItem {
  label: string;
  amount: number;
  explanation: string;
}

export interface Reconciliation {
  /** Net income the cascade produced. */
  computedNet: number;
  /** Nett Profit/Loss as the Tally P&L screen prints it, when supplied. */
  tallyNett: number | null;
  /** computedNet − tallyNett. */
  difference: number | null;
  /** Structural differences the engine can name and justify. */
  items: ReconcileItem[];
  /** Difference left after the named items. Must be within tolerance. */
  residual: number | null;
  ok: boolean;
}

export interface ComputedClose {
  lines: Record<string, LineTotal>;
  netByChannel: Partial<Record<SalesChannel, number>>;
  netRevenue: number;
  /** Signed, MonthlyMIS convention: costs negative. */
  cogmLines: Record<string, number>;
  cogm: number;
  grossMargin: number;
  channelFulfillment: number;
  cm1: number;
  salesMarketing: number;
  cm2: number;
  platformCosts: number;
  cm3: number;
  opexLines: Record<string, number>;
  opex: number;
  ebitda: number;
  nonOperating: number;
  costOfFundraising: number;
  netIncome: number;
  stockMovement: number;
  reconciliation: Reconciliation;
  blockers: Blocker[];
  unmapped: LedgerNode[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Labels used in the emitted cogmLines / opexLines, matching the committed months. */
const COGM_LABELS: Record<string, string> = {
  cogm_rm: 'Raw Material Purchases',
  cogm_factory: 'Factory Overheads',
  cogm_mfg: 'Manufacturing Costs (job work, wages, addl. charges)',
  cogm_freight_in: 'Inward Freight',
};

const OPEX_LABELS: Record<string, string> = {
  op_payroll: 'Payroll (Employee Cost – Indirect)',
  op_professional: 'Professional Fees',
  op_admin: 'Admin & General Expenses',
  op_warranty: 'After-Sales & Warranty',
  op_welfare: 'Staff Welfare',
  op_bank: 'Bank Charges',
  op_finadj: 'Financial Adjustments (net)',
  op_other_income: 'Other Income (Indirect Incomes)',
};

/**
 * Income-like buckets keep Tally's sign; expense-like buckets are negated so
 * that `effect` is always "what this did to profit".
 */
function effectOf(bucket: Bucket, amount: number): number {
  switch (bucket) {
    case 'revenue':
    case 'otherIncome':
      return amount;
    case 'contra':
    case 'ignore':
      return 0;
    default:
      return -amount;
  }
}

export function computeClose(
  session: MonthCloseSession,
  map: Record<string, string> = SEED_LEDGER_MAP,
): ComputedClose {
  const allNodes = session.sources.flatMap((s) => s.nodes);
  const { picked, unmapped } = pickNodes(allNodes, session.overrides, map);

  // ---- Fold contributors onto lines ---------------------------------------
  const lines: Record<string, LineTotal> = {};

  const addTo = (lineKey: string, amount: number, contributor?: PickedNode, verified = true) => {
    const def = CLOSE_LINES[lineKey];
    if (!def) return;
    const existing = lines[lineKey];
    if (existing) {
      existing.amount = r2(existing.amount + amount);
      existing.effect = r2(existing.effect + effectOf(def.bucket, amount));
      if (contributor) existing.contributors.push(contributor);
      existing.verified = existing.verified && verified;
    } else {
      lines[lineKey] = {
        lineKey,
        label: def.label,
        bucket: def.bucket,
        amount: r2(amount),
        effect: r2(effectOf(def.bucket, amount)),
        contributors: contributor ? [contributor] : [],
        verified,
      };
    }
  };

  for (const p of picked) {
    addTo(p.lineKey, p.node.amount, p, p.node.provenance.verified);
  }

  // Manual entry wins over anything ingested for the same line — it is the
  // override of last resort and the user has seen both.
  for (const [lineKey, fv] of Object.entries(session.manual)) {
    const def = CLOSE_LINES[lineKey];
    if (!def) continue;
    lines[lineKey] = {
      lineKey,
      label: def.label,
      bucket: def.bucket,
      amount: r2(fv.value),
      effect: r2(effectOf(def.bucket, fv.value)),
      contributors: [],
      verified: fv.provenance.verified,
    };
  }

  const amt = (k: string) => lines[k]?.amount ?? 0;

  // ---- Revenue -------------------------------------------------------------
  const netByChannel: Partial<Record<SalesChannel, number>> = {};
  for (const line of Object.values(lines)) {
    if (line.bucket !== 'revenue') continue;
    const ch = CLOSE_LINES[line.lineKey]?.channel;
    if (!ch) continue;
    netByChannel[ch] = r2((netByChannel[ch] ?? 0) + line.amount);
  }
  const netRevenue = r2(Object.values(netByChannel).reduce((s, v) => s + (v ?? 0), 0));

  // ---- COGM ----------------------------------------------------------------
  const stockMovement = r2(amt('cogm_open') - amt('cogm_close'));

  const cogmLines: Record<string, number> = {};
  for (const [key, label] of Object.entries(COGM_LABELS)) {
    if (lines[key]) cogmLines[label] = r2(-amt(key));
  }
  if (amt('cogm_open') !== 0 || amt('cogm_close') !== 0) {
    cogmLines['Stock movement (Opening − Closing)'] = r2(-stockMovement);
  }
  const cogm = r2(-Object.values(cogmLines).reduce((s, v) => s + v, 0));
  cogmLines['TOTAL COGM'] = r2(-cogm);

  const grossMargin = r2(netRevenue - cogm);

  // ---- Contribution ladder -------------------------------------------------
  const sumBucket = (b: Bucket) =>
    r2(Object.values(lines).filter((l) => l.bucket === b).reduce((s, l) => s + l.amount, 0));

  const channelFulfillment = sumBucket('fulfillment');
  const cm1 = r2(grossMargin - channelFulfillment);

  const salesMarketing = sumBucket('marketing');
  const cm2 = r2(cm1 - salesMarketing);

  const platformCosts = sumBucket('platform');
  const cm3 = r2(cm2 - platformCosts);

  // ---- Opex ----------------------------------------------------------------
  const opexLines: Record<string, number> = {};
  for (const [key, label] of Object.entries(OPEX_LABELS)) {
    if (lines[key]) opexLines[label] = r2(lines[key].effect);
  }
  const opex = r2(-Object.values(opexLines).reduce((s, v) => s + v, 0));
  opexLines['TOTAL OPERATING EXPENSES'] = r2(-opex);

  const ebitda = r2(cm3 - opex);

  const nonOperating = sumBucket('nonOperating');
  const costOfFundraising = sumBucket('fundraising');
  const netIncome = r2(ebitda - nonOperating - costOfFundraising);

  // ---- Reconciliation ------------------------------------------------------
  const reconciliation = reconcile(netIncome, session.anchor.nettProfit, lines);

  // ---- Blockers ------------------------------------------------------------
  const blockers = collectBlockers({
    lines,
    unmapped,
    reconciliation,
    netRevenue,
    stockMovement,
    hasClosingStock: lines['cogm_close'] !== undefined,
  });

  return {
    lines,
    netByChannel,
    netRevenue,
    cogmLines,
    cogm,
    grossMargin,
    channelFulfillment,
    cm1,
    salesMarketing,
    cm2,
    platformCosts,
    cm3,
    opexLines,
    opex,
    ebitda,
    nonOperating,
    costOfFundraising,
    netIncome,
    stockMovement,
    reconciliation,
    blockers,
    unmapped,
  };
}

/**
 * Tie the cascade back to Tally's own bottom line.
 *
 * The cascade and Tally legitimately differ by the stock-transfer asymmetry:
 * we strip both legs, Tally nets them, and the two legs are booked from
 * different documents so they seldom match exactly. That gap is named. Anything
 * beyond it is unexplained and blocks the close.
 */
function reconcile(
  computedNet: number,
  anchor: FieldValue | null,
  lines: Record<string, LineTotal>,
): Reconciliation {
  const strSales = lines['rev_str']?.amount ?? 0;
  const strPurchase = lines['cogm_str_in']?.amount ?? 0;

  const items: ReconcileItem[] = [];
  const strAsymmetry = r2(strPurchase - strSales);
  if (strAsymmetry !== 0) {
    items.push({
      label: 'Stock-transfer asymmetry',
      amount: strAsymmetry,
      explanation:
        `Inward ${fmt(strPurchase)} against internal sales ${fmt(strSales)}. Both legs are ` +
        'stripped from the cascade; Tally nets them, so the difference lands here.',
    });
  }

  if (!anchor) {
    return { computedNet, tallyNett: null, difference: null, items, residual: null, ok: false };
  }

  const difference = r2(computedNet - anchor.value);
  const named = r2(items.reduce((s, i) => s + i.amount, 0));
  const residual = r2(difference - named);

  return {
    computedNet,
    tallyNett: anchor.value,
    difference,
    items,
    residual,
    ok: Math.abs(residual) <= RECONCILE_TOLERANCE,
  };
}

function collectBlockers(ctx: {
  lines: Record<string, LineTotal>;
  unmapped: LedgerNode[];
  reconciliation: Reconciliation;
  netRevenue: number;
  stockMovement: number;
  hasClosingStock: boolean;
}): Blocker[] {
  const out: Blocker[] = [];

  for (const node of ctx.unmapped) {
    out.push({
      kind: 'unmapped',
      ref: [...node.path, node.name].join(' > '),
      message: `"${node.name}" (${fmt(node.amount)}) is not in the ledger map. Assign it a line before closing.`,
    });
  }

  for (const line of Object.values(ctx.lines)) {
    if (line.verified) continue;
    out.push({
      kind: 'unverified',
      ref: line.lineKey,
      message: `${line.label} — ${fmt(line.amount)} was read off an image and has not been confirmed.`,
    });
  }

  if (ctx.netRevenue === 0) {
    out.push({ kind: 'missing', message: 'No revenue lines were found. Add the Tally P&L or enter channel revenue.' });
  }

  if (ctx.reconciliation.tallyNett === null) {
    out.push({
      kind: 'missing',
      message: "Enter Tally's own Nett Profit / Loss so the close can be tied back to it.",
    });
  } else if (!ctx.reconciliation.ok) {
    out.push({
      kind: 'reconcile',
      message:
        `${fmt(ctx.reconciliation.residual ?? 0)} of the gap to Tally is unexplained. ` +
        'Either a ledger is mis-bucketed or one is missing.',
    });
  }

  // Advisory: the flat-stock trap that flattered July's first pass.
  if (ctx.hasClosingStock && ctx.stockMovement === 0) {
    out.push({
      kind: 'anomaly',
      advisory: true,
      ref: 'cogm_close',
      message:
        'Closing stock equals opening stock — Tally prints this before stock is valued. ' +
        'Gross margin is overstated until the real closing figure is entered.',
    });
  }

  const payroll = ctx.lines['op_payroll'];
  if (payroll && payroll.amount < 0) {
    out.push({
      kind: 'anomaly',
      advisory: true,
      ref: 'op_payroll',
      message:
        `Payroll is a net credit of ${fmt(Math.abs(payroll.amount))}. That is a reversal or a ` +
        'wrongly-signed entry — drill into the group summary and take the debit total.',
    });
  }

  return out;
}

function fmt(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Project a computed close into the shape misDeckData.ts stores. */
export function toMonthlyMIS(
  session: MonthCloseSession,
  c: ComputedClose,
  restated?: string,
): MonthlyMIS {
  const [yearStr, monthStr] = session.periodKey.split('-');
  return {
    key: session.periodKey,
    label: session.periodLabel,
    month: Number(monthStr),
    year: Number(yearStr),
    netByChannel: c.netByChannel,
    grossByChannel: {},
    returnsByChannel: {},
    totalGrossRevenue: 0,
    totalReturns: 0,
    totalTaxes: 0,
    netRevenue: c.netRevenue,
    interBranch: 0,
    turnover: 0,
    grossMargin: c.grossMargin,
    cm1: c.cm1,
    cm2: c.cm2,
    cm3: c.cm3,
    ebitda: c.ebitda,
    netIncome: c.netIncome,
    cogm: c.cogm,
    channelFulfillment: c.channelFulfillment,
    salesMarketing: c.salesMarketing,
    platformCosts: c.platformCosts,
    opex: c.opex,
    nonOperating: c.nonOperating,
    costOfFundraising: c.costOfFundraising,
    cogmLines: c.cogmLines,
    opexLines: c.opexLines,
    ...(restated ? { restated } : {}),
  };
}
