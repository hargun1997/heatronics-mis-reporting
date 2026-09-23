// ----------------------------------------------------------------------------
// Ledger → close-line mapping.
//
// This is the file that stops July's mapping work being redone every month.
// Each entry says "this Tally ledger feeds this line of the cascade"; anything
// not listed surfaces in the dashboard as a blocking review item rather than
// being guessed, because a silently mis-bucketed ledger is the one error that
// still foots and so never trips the reconciliation.
//
// Seeded from the Jul-2026 close. Add to it by closing a month — the dashboard
// writes new decisions back here as part of the emitted patch.
// ----------------------------------------------------------------------------

import type { LedgerNode } from './schema';

/** Lowercase, collapse whitespace, drop punctuation Tally varies between exports. */
export function normaliseLedger(name: string): string {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9%&/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Seed map. Keys are normalised ledger names; values are close-line keys.
 *
 * Rollup groups are mapped too, so a month can be closed off the P&L screen
 * alone when no drill-down is needed — `pickNodes` prefers the deepest mapped
 * node on each branch and never double-counts a parent with its children.
 */
export const SEED_LEDGER_MAP: Record<string, string> = {
  // ---- Revenue -------------------------------------------------------------
  'd2c sales': 'rev_d2c',
  'shopify sales': 'rev_d2c',
  'ecommerce sales': 'rev_amazon',
  'amazon sales': 'rev_amazon',
  'oem sales': 'rev_oem',
  'offline sales': 'rev_offline',
  'quick commerce sales': 'rev_blinkit',
  'blinkit sales': 'rev_blinkit',
  'export sales': 'rev_export',
  'stock transfers internal': 'rev_str',
  'stock transfers': 'rev_str',

  // ---- COGM ----------------------------------------------------------------
  'raw material purchases': 'cogm_rm',
  'stock transfer inward': 'cogm_str_in',
  'stock transfer': 'cogm_str_in',
  'factory overheads': 'cogm_factory',
  'manufacturing costs': 'cogm_mfg',
  'job work charges': 'cogm_mfg',
  'manufacturing wages': 'cogm_mfg',
  'additional charges - purchase': 'cogm_mfg',
  'inward freight': 'cogm_freight_in',
  'opening stock': 'cogm_open',
  'closing stock': 'cogm_close',

  // ---- Channel & fulfilment ------------------------------------------------
  'channel fees & commissions': 'ff_channel_fees',
  'amazon channel fees': 'ff_channel_fees',
  'blinkit channel fees': 'ff_channel_fees',
  'd2c fees': 'ff_channel_fees',
  'freight charges shiprocket': 'ff_channel_fees',
  'shipping charges': 'ff_shipping',
  'freight outward exp - porter/transport': 'ff_freight_out',
  'freight outward exp porter/transport': 'ff_freight_out',

  // ---- Marketing -----------------------------------------------------------
  'sales & marketing': 'sm_total',
  'd2c marketing': 'sm_total',
  'ecommerce marketing': 'sm_total',
  'google ads direct': 'sm_total',
  'meta ads direct': 'sm_total',
  'media buying agency - google/fb': 'sm_total',

  // ---- Platform / brand ----------------------------------------------------
  'content creation - agency': 'pf_platform',
  'brand investment': 'pf_platform',

  // ---- Opex ----------------------------------------------------------------
  'employee cost - indirect net': 'op_payroll',
  'employee cost - indirect': 'op_payroll',
  'employee cost - debit total': 'op_payroll',
  'employee cost': 'op_payroll',
  'professional fees': 'op_professional',
  'admin & general expenses': 'op_admin',
  'after-sales & warranty': 'op_warranty',
  'staff welfare': 'op_welfare',
  'bank charges': 'op_bank',
  'financial adjustments net': 'op_finadj',
  'financial adjustments': 'op_finadj',
  'indirect incomes': 'op_other_income',
  'other income': 'op_other_income',

  // ---- Below EBITDA --------------------------------------------------------
  'finance costs': 'nl_nonoperating',
  'finance cost': 'nl_nonoperating',
  'depreciation': 'nl_nonoperating',
  'depreciation & amortisation': 'nl_nonoperating',
  'business development expenses': 'nl_fundraising',

  // ---- Structural rows that are never a line -------------------------------
  'sales accounts': 'ignore',
  'purchase accounts': 'ignore',
  'direct expenses': 'ignore',
  'indirect expenses': 'ignore',
};

/**
 * Rollups, totals and check rows. These are matched by pattern rather than by
 * exact name because the wording drifts between exports ("TOTAL COGS" one
 * month, "Total Cost of Goods Sold" the next) and a missed total is worse than
 * a missed ledger — it double-counts silently instead of raising a blocker.
 */
// Matched against the NORMALISED name, which has already had punctuation
// stripped — so these must not rely on colons or capitals.
export const IGNORE_PATTERNS: RegExp[] = [
  /^total\b/,
  /^gross (sales|profit)\b/,
  /^net external sales\b/,
  /^nett? (profit|loss)\b/,
  /^check\b/,
  /^variance\b/,
  /\bsubtotal\b/,
  // "Less: ..." rows on the P&L screen restate something already listed above
  // them, so taking both would double count. "Add: ..." rows are the opposite —
  // they introduce a ledger (Indirect Incomes) that appears nowhere else — and
  // are handled by the prefix retry in lookupLedger instead.
  /^less\b/,
];

/**
 * Ledgers whose sign in Tally is the opposite of how the cascade wants them.
 *
 * Tally prints indirect income and credit balances negative inside an expense
 * group; the cascade wants every cost as a positive magnitude. Anything listed
 * here is negated on the way in.
 */
export const SIGN_FLIPPED_LINES = new Set(['op_other_income']);

export interface MapLookup {
  /** Close line key, or null when nothing in the map matches. */
  lineKey: string | null;
  /** True when the hit came from this month's overrides rather than the seed. */
  fromOverride: boolean;
}

/**
 * Resolve one ledger node to a close line. Overrides are keyed on the full
 * path so the same leaf name under two groups can go to different lines.
 */
export function lookupLedger(
  node: LedgerNode,
  overrides: Record<string, string>,
  map: Record<string, string> = SEED_LEDGER_MAP,
): MapLookup {
  const pathKey = [...node.path, node.name].map(normaliseLedger).join(' > ');
  if (overrides[pathKey]) return { lineKey: overrides[pathKey], fromOverride: true };

  const own = normaliseLedger(node.name);
  if (overrides[own]) return { lineKey: overrides[own], fromOverride: true };
  if (map[own]) return { lineKey: map[own], fromOverride: false };

  // "Add: Indirect Incomes" is the same ledger as "Indirect Incomes"; the P&L
  // screen just prefixes it to show the arithmetic.
  const stripped = own.replace(/^add /, '');
  if (stripped !== own) {
    if (overrides[stripped]) return { lineKey: overrides[stripped], fromOverride: true };
    if (map[stripped]) return { lineKey: map[stripped], fromOverride: false };
  }

  if (IGNORE_PATTERNS.some((re) => re.test(own))) return { lineKey: 'ignore', fromOverride: false };

  return { lineKey: null, fromOverride: false };
}

export interface PickedNode {
  node: LedgerNode;
  lineKey: string;
  fromOverride: boolean;
}

export interface PickResult {
  picked: PickedNode[];
  /** Nodes with no mapping. These block the close until assigned. */
  unmapped: LedgerNode[];
}

/**
 * Choose which nodes actually feed the cascade.
 *
 * A Tally tree carries each amount at every level, so summing blindly triple
 * counts. The rule: take a node when it maps to a line and none of its
 * descendants map to a *different* line. That lets `Channel Fees & Commissions`
 * stand in for its ten Amazon children, while `Manufacturing Costs` still
 * collapses its three children onto the one line they all share.
 */
export function pickNodes(
  nodes: LedgerNode[],
  overrides: Record<string, string>,
  map: Record<string, string> = SEED_LEDGER_MAP,
): PickResult {
  const resolved = nodes.map((node) => ({ node, ...lookupLedger(node, overrides, map) }));

  const picked: PickedNode[] = [];
  const unmapped: LedgerNode[] = [];

  for (let i = 0; i < resolved.length; i++) {
    const { node, lineKey, fromOverride } = resolved[i];

    if (lineKey === null) {
      // Only complain about leaves and about groups whose children are all
      // unmapped too — an unmapped rollup over mapped children is harmless.
      const kids = descendantsOf(resolved, i);
      if (kids.length === 0 || kids.every((k) => k.lineKey === null)) {
        if (node.isLeaf || kids.length === 0) unmapped.push(node);
      }
      continue;
    }

    if (lineKey === 'ignore') continue;

    const kids = descendantsOf(resolved, i);
    const supersededByChildren =
      kids.length > 0 &&
      kids.some((k) => k.lineKey !== null && k.lineKey !== 'ignore' && k.lineKey !== lineKey);

    if (supersededByChildren) continue;

    picked.push({ node, lineKey, fromOverride });

    // Skip the whole subtree — its value is already inside this node.
    i += kids.length;
  }

  return { picked, unmapped };
}

/** Contiguous run of deeper-indented rows immediately after index `i`. */
function descendantsOf<T extends { node: LedgerNode }>(rows: T[], i: number): T[] {
  const base = rows[i].node.depth;
  const out: T[] = [];
  for (let j = i + 1; j < rows.length && rows[j].node.depth > base; j++) out.push(rows[j]);
  return out;
}
