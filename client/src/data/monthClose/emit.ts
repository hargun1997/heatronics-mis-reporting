// ----------------------------------------------------------------------------
// Month close — emit.
//
// Turns a reviewed close into the three artefacts a month has always needed:
//
//   1. the MonthlyMIS entry for misDeckData.ts
//   2. the markdown writeup, in the house format used by June and July
//   3. the ledger-map additions this month taught us
//
// All three go out together so the diff that lands the numbers also lands the
// mapping decisions behind them, and next month starts with both.
// ----------------------------------------------------------------------------

import type { MonthlyMIS } from '../misDeck/misDeckData';
import { toMonthlyMIS, type ComputedClose } from './compute';
import { normaliseLedger } from './ledgerMap';
import { renderSkuAdditions } from './skuMap';
import { CLOSE_LINES, type MonthCloseSession } from './schema';

export interface EmitResult {
  /** Pretty-printed MonthlyMIS object, ready to paste into MONTHLY_MIS. */
  entryTs: string;
  /** The month's writeup. */
  markdown: string;
  /** New ledger-map entries, as a TS fragment to merge into SEED_LEDGER_MAP. */
  mapAdditionsTs: string;
  /** New SKU-map entries, as a TS fragment to merge into SEED_SKU_MAP. */
  skuAdditionsTs: string;
  /**
   * SkuCell rows for skuChannelPnl.ts, or null when they cannot honestly be
   * produced — see `skuBlockedReason`.
   */
  skuCellsTs: string | null;
  skuBlockedReason: string | null;
  /** Suggested file name for the writeup, e.g. "July-2026-PnL.md". */
  markdownFileName: string;
  entry: MonthlyMIS;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** ₹ with Indian grouping, losses in brackets — the convention in the writeups. */
function rs(n: number, dp = 0): string {
  const v = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return n < 0 ? `(${v})` : v;
}

function lac(n: number): string {
  const v = Math.abs(n / 100000).toFixed(2);
  return n < 0 ? `(${v})` : v;
}

function pct(n: number, base: number): string {
  if (!base) return '';
  const p = (n / base) * 100;
  const s = `${Math.abs(p).toFixed(1)}%`;
  return p < 0 ? `−${s}` : s;
}

/** Render the entry the way the committed months are formatted: 2-space JSON. */
function renderEntry(entry: MonthlyMIS): string {
  return JSON.stringify(entry, null, 2)
    .split('\n')
    .map((l, i) => (i === 0 ? l : `  ${l}`))
    .join('\n');
}

export function emitClose(
  session: MonthCloseSession,
  c: ComputedClose,
  restatedNote?: string,
): EmitResult {
  const entry = toMonthlyMIS(session, c, restatedNote);
  const [yearStr, monthStr] = session.periodKey.split('-');
  const monthName = MONTHS[Number(monthStr) - 1] ?? session.periodLabel;

  const sku = renderSkuCells(session, c);

  return {
    entry,
    entryTs: renderEntry(entry),
    markdown: renderMarkdown(session, c, monthName, yearStr, restatedNote),
    mapAdditionsTs: renderMapAdditions(session),
    skuAdditionsTs: renderSkuAdditions(session.skuOverrides ?? {}),
    skuCellsTs: sku.ts,
    skuBlockedReason: sku.blockedReason,
    markdownFileName: `${monthName}-${yearStr}-PnL.md`,
  };
}

/**
 * SkuCell rows for skuChannelPnl.ts.
 *
 * `oth` is the channel fee the platform export reported for that product, and
 * `con` is the contribution left after cost and fees — matching how the
 * existing 767 cells are built.
 *
 * COGS is the honest problem: no platform export carries it, and the FG master
 * holds selling prices, not unit costs. So rather than emit a zero that reads
 * as 100% margin, this refuses until a COGS basis is set on the session, and
 * says why.
 */
function renderSkuCells(
  session: MonthCloseSession,
  c: ComputedClose,
): { ts: string | null; blockedReason: string | null } {
  const { sku } = c;

  if (!sku.hasSkuSources) {
    return { ts: null, blockedReason: 'No platform exports were supplied, so there is nothing to emit.' };
  }
  if (sku.unmapped.length > 0) {
    return {
      ts: null,
      blockedReason: `${sku.unmapped.length} platform row(s) have SKUs that are not in the map. Assign them first.`,
    };
  }
  if (sku.unconfirmed.length > 0) {
    return {
      ts: null,
      blockedReason:
        `${sku.unconfirmed.length} product mapping(s) are inferred from the Tranzact naming convention ` +
        'rather than confirmed. Confirm them first — a wrong product moves revenue between products ' +
        'while the month still totals correctly.',
    };
  }
  if (session.skuCogsPct === null || !Number.isFinite(session.skuCogsPct)) {
    return {
      ts: null,
      blockedReason:
        'No COGS basis is set. Platform exports carry revenue, units and fees but never cost, and the ' +
        'FG master holds selling prices rather than unit costs — so per-SKU COGS cannot be derived from ' +
        'the files. Set a COGS % of revenue, or supply a cost sheet.',
    };
  }

  const pct = session.skuCogsPct;
  const rows = sku.aggregates.map((a) => {
    const cogs = Math.round(a.revenue * pct * 100) / 100;
    const con = Math.round((a.revenue - cogs - a.fees) * 100) / 100;
    return (
      `  { m: "${session.periodKey}", ch: "${a.channel}", p: "${a.deckName}", ` +
      `rev: ${a.revenue}, cogs: ${cogs}, oth: ${a.fees}, con: ${con}, u: ${a.units} },`
    );
  });

  const ts =
    `// ${session.periodLabel} — emitted by the month ingest dashboard.\n` +
    `// COGS applied at ${(pct * 100).toFixed(1)}% of revenue (no per-SKU cost source available).\n` +
    rows.join('\n') +
    '\n';

  return { ts, blockedReason: null };
}

function renderMapAdditions(session: MonthCloseSession): string {
  const entries = Object.entries(session.overrides);
  if (entries.length === 0) return '// No new ledgers this month — the seed map covered everything.\n';

  const lines = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ledger, lineKey]) => {
      const label = CLOSE_LINES[lineKey]?.label ?? lineKey;
      // Overrides may be keyed on a full path; the map keys on the leaf name.
      const key = ledger.includes(' > ') ? ledger.split(' > ').pop()! : ledger;
      return `  '${normaliseLedger(key)}': '${lineKey}', // ${label}`;
    });

  return `// Learned closing ${session.periodLabel} — merge into SEED_LEDGER_MAP.\n${lines.join('\n')}\n`;
}

function renderMarkdown(
  session: MonthCloseSession,
  c: ComputedClose,
  monthName: string,
  year: string,
  restatedNote?: string,
): string {
  const rev = c.netRevenue;
  const loss = c.netIncome < 0;
  const bottomLabel = loss ? 'Net Loss' : 'Net Profit';

  const row = (label: string, v: number, bold = false) => {
    const b = bold ? '**' : '';
    return `| ${b}${label}${b} | ${b}${rs(v)}${b} | ${b}${lac(v)}${b} | ${b}${pct(v, rev)}${b} |`;
  };
  const costRow = (label: string, v: number) =>
    `| ${label} | ${rs(-Math.abs(v))} | ${lac(-Math.abs(v))} | |`;

  const channels = Object.entries(c.netByChannel)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([ch, v]) => `| ${ch} | ${rs(v ?? 0)} |`)
    .join('\n');

  const cogmRows = Object.entries(c.cogmLines)
    .filter(([k]) => k !== 'TOTAL COGM')
    .map(([k, v]) => `| ${k} | ${rs(v)} |`)
    .join('\n');

  const opexRows = Object.entries(c.opexLines)
    .filter(([k]) => k !== 'TOTAL OPERATING EXPENSES')
    .map(([k, v]) => `| ${k} | ${rs(v)} |`)
    .join('\n');

  const recon = c.reconciliation;
  const reconRows = recon.items.map((i) => `| ${i.label} | ${rs(i.amount)} | ${i.explanation} |`).join('\n');

  const sourceList = session.sources
    .map((s) => `\`${s.label}\` (${s.kind}${s.method === 'vision' ? ', read from image and confirmed' : ''})`)
    .join(', ') || 'manual entry';

  const cm2Warning =
    c.cm2 < 0
      ? `\n> **CM2 is negative.** After COGS, logistics and performance ads, ${monthName} does not cover its variable cost.\n`
      : '';

  return `# Heatronics Medical Devices Private Limited — Profit & Loss

**Period:** ${monthName} ${year}
**Basis:** Stock-transfer (STR) ledgers removed from both Sales and Purchases (internal branch transfers eliminated).
**Format:** Contribution-margin P&L (Net Revenue → CM1/CM2/CM3 → EBITDA → ${bottomLabel}), values in ₹ and ₹ Lac.
**Source:** ${sourceList}.

> ${restatedNote ?? `Built from the closed ${session.periodLabel} Tally P&L A/c.`}
${cm2Warning}
---

## P&L Statement

| Line | ₹ | ₹ Lac | % of Rev |
|---|---:|---:|---:|
${row('Net Revenue (external)', rev, true)}
${costRow('COGM (materials, factory, conversion, stock movement)', c.cogm)}
${row('Gross Margin', c.grossMargin, true)}
${costRow('Logistics & channel', c.channelFulfillment)}
${row('CM1', c.cm1, true)}
${costRow('Marketing — performance ads', c.salesMarketing)}
${row('CM2', c.cm2, true)}
${costRow('Brand / platform investment', c.platformCosts)}
${row('CM3', c.cm3, true)}
${costRow('Operating expenses', c.opex)}
${row('EBITDA', c.ebitda, true)}
${costRow('Non-operating (finance, D&A, one-time)', c.nonOperating)}
${costRow('Cost of fundraising', c.costOfFundraising)}
${row(`${bottomLabel} (PBT = PAT)`, c.netIncome, true)}

---

## Revenue by channel

| Channel | ₹ |
|---|---:|
${channels}
| **Net external revenue** | **${rs(rev)}** |

---

## COGM build-up

| Component | ₹ |
|---|---:|
${cogmRows}
| **Total COGM** | **${rs(c.cogmLines['TOTAL COGM'] ?? -c.cogm)}** |

Stock movement is Opening less Closing, so a ${rs(c.stockMovement)} movement ${
    c.stockMovement >= 0 ? 'adds to' : 'relieves'
  } cost of goods made.

---

## Operating expenses

| Ledger | ₹ |
|---|---:|
${opexRows}
| **Total operating expenses** | **${rs(c.opexLines['TOTAL OPERATING EXPENSES'] ?? -c.opex)}** |

---

## Reconciliation to Tally

${
  recon.tallyNett === null
    ? '_No Tally anchor was supplied for this close._'
    : `Tally's own bottom line for the month is **${rs(recon.tallyNett)}**; the cascade gives **${rs(
        recon.computedNet,
      )}**, a difference of **${rs(recon.difference ?? 0)}**.

| Reconciling item | ₹ | Why |
|---|---:|---|
${reconRows || '| _none_ | — | — |'}
| **Residual (unexplained)** | **${rs(recon.residual ?? 0, 2)}** | ${
        Math.abs(recon.residual ?? 0) <= 1 ? 'Within rounding tolerance.' : '**Investigate before circulating.**'
      } |`
}

---

## Notes

${session.notes.trim() || '_None._'}

---

_Generated by the month-close ingest dashboard from ${session.sources.length} source${
    session.sources.length === 1 ? '' : 's'
  }. Every figure above carries provenance in the session that produced it._
`;
}
