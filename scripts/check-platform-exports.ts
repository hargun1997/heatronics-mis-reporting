// ----------------------------------------------------------------------------
// Dry-run the ingest adapters over real export files, without the browser.
//
//   npx tsx scripts/check-platform-exports.ts <file> [<file> ...]
//
// For each file it prints which adapter claimed it and how confidently, what it
// extracted, every figure worth holding against Tally, and every complaint. Use
// it when a platform changes an export and you want to know what broke before
// opening the dashboard — or to sanity-check a month's files in one command.
//
// It reads; it writes nothing. Point it at the real downloads.
// ----------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { ADAPTERS, claimAdapter } from '../client/src/data/monthClose/adapterRegistry';
import { computeSku } from '../client/src/data/monthClose/skuRollup';
import { emptySession, type CostBasis, type MonthCloseSession, type UploadedSource } from '../client/src/data/monthClose/schema';

const rs = (n: number) =>
  `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: npx tsx scripts/check-platform-exports.ts <file> [<file> ...]');
  process.exit(2);
}

const sources: UploadedSource[] = [];

for (const file of files) {
  const name = path.basename(file);
  console.log(`\n=== ${name}`);

  if (!fs.existsSync(file)) {
    console.log('  file not found');
    continue;
  }

  const workbook = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const claim = claimAdapter(workbook, name);

  if (!claim) {
    const best = ADAPTERS.map((a) => ({ kind: a.kind, score: a.sniff(workbook, name) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => `${s.kind} ${s.score.toFixed(2)}`)
      .join(', ');
    console.log(`  no adapter claimed it. Closest: ${best}`);
    continue;
  }

  console.log(`  adapter   ${claim.adapter.label} (confidence ${claim.confidence.toFixed(2)})`);
  const result = claim.adapter.parse({ workbook, sourceId: name, file: { name } as File });

  const skuRows = result.skuRows ?? [];
  const bomCosts = result.bomCosts ?? [];
  const parts = [
    skuRows.length ? `${skuRows.length} product rows` : '',
    bomCosts.length ? `${bomCosts.length} BOM costs` : '',
    result.nodes.length ? `${result.nodes.length} ledger rows` : '',
  ].filter(Boolean);
  console.log(`  extracted ${parts.join(', ') || 'nothing'}`);

  if (skuRows.length > 0) {
    const revenue = skuRows.reduce((s, r) => s + r.revenue, 0);
    const fees = skuRows.reduce((s, r) => s + r.fees, 0);
    const keys = new Set(skuRows.map((r) => r.key));
    const byTitle = skuRows.filter((r) => r.keyKind === 'title');
    console.log(`            ${rs(revenue)} revenue, ${rs(fees)} fees, ${keys.size} distinct keys`);
    if (byTitle.length > 0) {
      console.log(
        `            ${byTitle.length} row(s) keyed on product title (${rs(
          byTitle.reduce((s, r) => s + r.revenue, 0),
        )}) — no variant SKU on the order`,
      );
    }
  }

  for (const c of result.crossChecks ?? []) {
    console.log(`  check     ${c.label.padEnd(60)} ${rs(c.amount).padStart(12)}${c.against ? `  → ${c.against}` : ''}`);
  }
  for (const w of result.warnings) console.log(`  warning   ${w}`);

  sources.push({
    id: name,
    label: name,
    kind: claim.adapter.kind,
    method: 'xlsx',
    addedAt: new Date(0).toISOString(),
    nodes: result.nodes,
    skuRows,
    bomCosts,
    crossChecks: result.crossChecks ?? [],
    warnings: result.warnings,
  });
}

// ---- What the SKU layer makes of them together -----------------------------

if (sources.some((s) => s.skuRows.length > 0)) {
  for (const basis of ['legacy', 'hcore'] as CostBasis[]) {
    const session: MonthCloseSession = { ...emptySession('check', 'check'), sources, costBasis: basis };
    const sku = computeSku(session);

    console.log(`\n=== SKU rollup on the ${basis === 'hcore' ? 'current hCore-*' : 'legacy HTR-*'} cost basis`);
    console.log(
      `  ${sku.aggregates.length} products · ${rs(sku.totalRevenue)} revenue · ${rs(sku.totalFees)} fees · ` +
        `${sku.costBook.count} finished goods priced`,
    );

    if (sku.unmapped.length > 0) {
      const revenue = sku.unmapped.reduce((s, r) => s + r.revenue, 0);
      console.log(`  UNMAPPED  ${sku.unmapped.length} rows, ${rs(revenue)}`);
      const seen = new Set<string>();
      for (const r of sku.unmapped) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        console.log(`            ${r.platform} "${r.key}"${r.name ? ` — ${r.name.slice(0, 50)}` : ''}`);
      }
    }
    if (sku.uncosted.length > 0) {
      console.log(
        `  UNCOSTED  ${sku.uncosted.length} products, ${rs(sku.uncosted.reduce((s, a) => s + a.revenue, 0))}: ` +
          sku.uncosted.map((a) => `${a.fgId} ${a.deckName}`).join(', '),
      );
    }
    if (sku.unconfirmed.length > 0) {
      console.log(
        `  UNCONFIRMED ${sku.unconfirmed.length} products: ` +
          sku.unconfirmed.map((a) => `${a.fgId} → ${a.deckName}`).join(', '),
      );
    }

    console.log(
      `\n  ${'product'.padEnd(18)}${'ch'.padEnd(8)}${'units'.padStart(7)}${'revenue'.padStart(12)}` +
        `${'fees'.padStart(10)}${'cogs'.padStart(11)}${'CM1'.padStart(11)}${'CM1%'.padStart(8)}`,
    );
    for (const a of sku.aggregates) {
      const cm1 = a.contribution;
      console.log(
        `  ${a.deckName.slice(0, 17).padEnd(18)}${a.channel.slice(0, 7).padEnd(8)}${String(a.units).padStart(7)}` +
          `${rs(a.revenue).padStart(12)}${rs(a.fees).padStart(10)}` +
          `${(a.cogs === null ? '—' : rs(a.cogs)).padStart(11)}` +
          `${(cm1 === null ? '—' : rs(cm1)).padStart(11)}` +
          `${(cm1 === null || !a.revenue ? '—' : `${((cm1 / a.revenue) * 100).toFixed(1)}%`).padStart(8)}`,
      );
    }
    const totalCm1 = sku.aggregates.reduce((s, a) => s + (a.contribution ?? 0), 0);
    console.log(
      `  ${'TOTAL'.padEnd(26)}${String(sku.totalUnits).padStart(7)}${rs(sku.totalRevenue).padStart(12)}` +
        `${rs(sku.totalFees).padStart(10)}${(sku.totalCogs === null ? '—' : rs(sku.totalCogs)).padStart(11)}` +
        `${rs(totalCm1).padStart(11)}`,
    );
  }
}
