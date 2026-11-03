// Amazon stock valuation for a month end (founder, 3 Nov 2026: the accountant enters opening + closing stock in Tally from it).
// Units = Ops' Inventory Ledger summary (Amazon's own daily balance per FC × FNSKU × disposition, `amz_ledger_daily_fc_latest`,
// our brand seller account only — Supernode's stock is theirs, invoiced at dispatch) on the month's last day (closing) and the
// previous month's last day (opening). Value = units × Production's cost for the month (material ex-GST + conversion), matched by
// FG code from the Amazon SKU map. Pure (runs in the browser; the server only returns ledger rows + costs: /api/stock/amazon). READ ONLY.

export interface LedgerRow { date: string; msku: string; asin: string; disposition: string; units: number; inTransit: number }
export interface CostRow { item: string; name: string; material: number | null; conversion: number | null }
export interface StockLine {
  fg: string | null; name: string; mskus: string[];
  sellable: number; unsellable: number; inTransit: number; units: number;
  material: number | null; conversion: number | null; unitCost: number | null; value: number | null;
}
export interface StockSide { date: string | null; lines: StockLine[]; units: number; value: number; unvalued: number; exact: boolean }
export interface StockValuation { month: string; opening: StockSide; closing: StockSide; costMonth: string | null; warnings: string[] }

export const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const prevMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const norm = (s: string) => s.trim().toUpperCase();
/** "VW-H1GL-KTOZ- hcore Knee" → "VW-H1GL-KTOZ" (Amazon MSKUs sometimes carry a name suffix; same rule as the old Amazon → Tranzact tool). */
export const skuCode = (raw: string) => { const t = String(raw ?? '').trim(); return t.match(/^[A-Za-z0-9]{2}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}/)?.[0] ?? t; };

/** One side (a single date's balances) valued at cost. Sellable + unsellable both count as stock; units in transit between FCs too. */
export function valueSide(rows: LedgerRow[], date: string | null, wantedEnd: string, skuToFg: Record<string, string>, costs: CostRow[]): StockSide {
  const cost = new Map(costs.map((c) => [norm(c.item), c]));
  const fgMap = new Map(Object.entries(skuToFg).map(([k, v]) => [norm(k), v]));
  const by = new Map<string, StockLine>();
  for (const r of rows) {
    if (r.date !== date) continue;
    const fg = fgMap.get(norm(r.msku)) ?? fgMap.get(norm(skuCode(r.msku))) ?? null;
    const key = fg ?? `sku:${r.msku}`;
    const c = fg ? cost.get(norm(fg)) : undefined;
    const l = by.get(key) ?? { fg, name: c?.name || r.msku, mskus: [], sellable: 0, unsellable: 0, inTransit: 0, units: 0, material: c?.material ?? null, conversion: c?.conversion ?? null, unitCost: null, value: null };
    if (!l.mskus.includes(r.msku)) l.mskus.push(r.msku);
    if (/^sellable$/i.test(r.disposition)) l.sellable += r.units; else l.unsellable += r.units;
    l.inTransit += r.inTransit;
    by.set(key, l);
  }
  const lines = [...by.values()].map((l) => {
    const units = l.sellable + l.unsellable + l.inTransit;
    const unitCost = l.material == null ? null : l.material + (l.conversion ?? 0);
    return { ...l, units, unitCost, value: unitCost == null ? null : Math.round(units * unitCost * 100) / 100 };
  }).filter((l) => l.units !== 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.name.localeCompare(b.name));
  return {
    date, lines, exact: date === wantedEnd,
    units: lines.reduce((s, l) => s + l.units, 0),
    value: Math.round(lines.reduce((s, l) => s + (l.value ?? 0), 0)),
    unvalued: lines.filter((l) => l.value == null).reduce((s, l) => s + l.units, 0),
  };
}

/** Newest date ≤ `end` and within the month of `end` that the ledger holds. */
export function pickDate(dates: string[], end: string): string | null {
  const start = `${end.slice(0, 7)}-01`;
  return dates.filter((d) => d >= start && d <= end).sort().pop() ?? null;
}

export function buildValuation(month: string, rows: LedgerRow[], skuToFg: Record<string, string>, costs: CostRow[], costMonth: string | null): StockValuation {
  const dates = [...new Set(rows.map((r) => r.date))];
  const closeEnd = monthEnd(month), openEnd = monthEnd(prevMonth(month));
  const closeDate = pickDate(dates, closeEnd), openDate = pickDate(dates, openEnd);
  const opening = valueSide(rows, openDate, openEnd, skuToFg, costs);
  const closing = valueSide(rows, closeDate, closeEnd, skuToFg, costs);
  const warnings: string[] = [];
  if (!closeDate) warnings.push(`No Amazon ledger balance stored for ${month} yet (Ops loads it a day or two after the day).`);
  else if (!closing.exact) warnings.push(`Closing uses ${closeDate}: Amazon's balance for ${closeEnd} isn't in yet.`);
  if (!openDate) warnings.push(`No balance stored for ${prevMonth(month)}'s last day: opening is blank (Ops keeps ~120 days).`);
  else if (!opening.exact) warnings.push(`Opening uses ${openDate}, not ${openEnd}.`);
  if (closing.unvalued) warnings.push(`${closing.unvalued} closing units have no cost (SKU not in the FG map or no Production cost): value them by hand.`);
  if (costMonth && costMonth !== month) warnings.push(`Costs are Production's ${costMonth} (no costs for ${month} yet).`);
  return { month, opening, closing, costMonth, warnings };
}

/** Tranzact "Physical Stock Reconciliation" rows for the Amazon warehouse: SELLABLE units per FG (what the old Amazon → Tranzact
 *  tool built from a downloaded ledger), priced at Tranzact's default price from the FG master. */
export function tranzactRows(s: StockSide, master: Record<string, { itemName: string; unit: string; defaultPrice: number }>):
  { rows: { itemId: string; itemName: string; uom: string; physicalStock: number; price: number; comment: string }[]; missing: string[] } {
  const rows: { itemId: string; itemName: string; uom: string; physicalStock: number; price: number; comment: string }[] = [];
  const missing: string[] = [];
  for (const l of [...s.lines].sort((a, b) => (a.fg ?? '').localeCompare(b.fg ?? ''))) {
    if (!l.fg) { missing.push(...l.mskus); continue; }
    const m = master[l.fg];
    if (!m) { missing.push(l.fg); continue; }
    rows.push({ itemId: l.fg, itemName: m.itemName, uom: m.unit, physicalStock: l.sellable, price: m.defaultPrice, comment: `Amazon FBA Stock | SKU(s): ${l.mskus.join(', ')} | Ledger: ${s.date ?? ''}` });
  }
  return { rows, missing };
}
