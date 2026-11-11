// Live Amazon stock valuation on the "Closing stock into Tally" task (founder, 3 Nov 2026): opening (last day of the month
// before) and closing (last day of the task's month) FBA stock per product, valued at Production's cost, ready to enter in Tally.
// Data: GET /api/stock/amazon?month= (Ops ledger balances + Production costs); maths: data/stock/amazonStock.ts (pure).
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { buildValuation, prevMonth, tranzactRows, type CostRow, type LedgerRow, type StockSide } from '../../data/stock/amazonStock';
import { skuToFgMapping } from '../../data/skuToFgMapping';
import { fgMaster } from '../../data/fgMaster';
import { generateTranzactExcel } from '../../utils/amazonToTranzact';
import { periodLabel } from './taskModel';
import { focusRing } from './ui';

interface Api { month: string; rows: LedgerRow[]; costs: CostRow[]; costMonth: string | null; errors: string[]; at: string }
const inr = (n: number | null) => (n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);
const num = (n: number) => n.toLocaleString('en-IN');

export function AmazonStockPanel({ month }: { month: string }) {
  const [data, setData] = useState<Api | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = (force = false) => {
    setBusy(true); setErr(null);
    fetch(`/api/stock/amazon?month=${month}${force ? '&force=1' : ''}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `${r.status}`); setData(j); })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };
  useEffect(() => { load(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = useMemo(() => (data ? buildValuation(month, data.rows, skuToFgMapping, data.costs, data.costMonth) : null), [data, month]);

  const download = async () => {
    if (!v) return;
    const XLSX = await import('xlsx');
    const sheet = (s: StockSide, title: string) => XLSX.utils.aoa_to_sheet([
      [`Amazon FBA stock: ${title} (${s.date ?? 'no balance'})`],
      ['FG', 'Product', 'Amazon SKUs', 'Sellable', 'Unsellable', 'In transit (FC→FC)', 'Units', 'Material ₹/unit (ex-GST)', 'Conversion ₹/unit', 'Cost ₹/unit', 'Value ₹'],
      ...s.lines.map((l) => [l.fg ?? '', l.name, l.mskus.join(', '), l.sellable, l.unsellable, l.inTransit, l.units, l.material, l.conversion, l.unitCost, l.value]),
      [], ['', 'Total', '', '', '', '', s.units, '', '', '', s.value],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(v.closing, `closing ${periodLabel(month)}`), 'Closing');
    XLSX.utils.book_append_sheet(wb, sheet(v.opening, `opening (end of ${periodLabel(prevMonth(month))})`), 'Opening');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes'], ...v.warnings.map((w) => [w]), ['Source: Amazon Inventory Ledger (via Ops) · costs: Production portal']]), 'Notes');
    XLSX.writeFile(wb, `amazon-stock-${month}.xlsx`);
  };

  // Tranzact's Physical Stock Reconciliation file for the Amazon warehouse (replaces the Amazon → Tranzact tool: same columns,
  // SELLABLE units per FG at Tranzact's default price), from the same live month-end balance.
  const tranzactFile = async () => {
    if (!v) return;
    const { rows } = tranzactRows(v.closing, fgMaster);
    const url = URL.createObjectURL(await generateTranzactExcel(rows));
    const a = document.createElement('a'); a.href = url; a.download = `tranzact-amazon-stock-${month}.xlsx`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white" aria-label="Amazon stock valuation">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">Amazon FBA stock · {periodLabel(month)}</h3>
        <span className="text-xs text-slate-500">live from Amazon's own month-end balance, at Production's cost</span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => load(true)} disabled={busy} className={`inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-300 px-2.5 text-sm text-slate-700 hover:bg-slate-50 ${focusRing}`}>
            <ArrowPathIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Refresh</button>
          <button type="button" onClick={() => void download()} disabled={!v} className={`inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-300 px-2.5 text-sm text-slate-700 hover:bg-slate-50 ${focusRing}`}>
            <ArrowDownTrayIcon className="h-4 w-4" />Valuation</button>
          <button type="button" onClick={() => void tranzactFile()} disabled={!v?.closing.lines.length} title="Tranzact → Inventory → Physical Stock Reconciliation upload (Amazon warehouse)" className={`inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-300 px-2.5 text-sm text-slate-700 hover:bg-slate-50 ${focusRing}`}>
            <ArrowDownTrayIcon className="h-4 w-4" />Tranzact file</button>
        </div>
      </div>
      {err && <p className="px-3 py-2 text-sm text-rose-700">{err}</p>}
      {data?.errors.map((e) => <p key={e} className="px-3 pt-2 text-sm text-amber-800">{e}</p>)}
      {!v ? <p className="px-3 py-4 text-sm text-slate-500">{busy ? 'Reading Amazon’s balances…' : ''}</p> : (
        <div className="space-y-3 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Total label={`Opening (${v.opening.date ?? '—'})`} s={v.opening} />
            <Total label={`Closing (${v.closing.date ?? '—'})`} s={v.closing} strong />
          </div>
          {v.warnings.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800">{v.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          {v.closing.lines.length > 0 && (
            <div className="max-h-[50vh] overflow-auto rounded-md border border-slate-100">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr>
                  <th className="px-2 py-1.5 font-semibold">Product</th><th className="px-2 text-right font-semibold">Sellable</th><th className="px-2 text-right font-semibold">Unsellable</th>
                  <th className="px-2 text-right font-semibold">In transit</th><th className="px-2 text-right font-semibold">Cost / unit</th><th className="px-2 text-right font-semibold">Closing value</th><th className="px-2 text-right font-semibold">Opening units</th></tr></thead>
                <tbody>{v.closing.lines.map((l) => {
                  const o = v.opening.lines.find((x) => (x.fg ?? x.name) === (l.fg ?? l.name));
                  return (
                    <tr key={l.fg ?? l.name} className="border-t border-slate-100">
                      <td className="px-2 py-1"><span className="text-slate-900">{l.name}</span> <span className="text-xs text-slate-500">{l.fg ?? 'no FG map'}</span></td>
                      <td className="px-2 text-right tabular-nums">{num(l.sellable)}</td><td className="px-2 text-right tabular-nums">{num(l.unsellable)}</td>
                      <td className="px-2 text-right tabular-nums">{num(l.inTransit)}</td><td className="px-2 text-right tabular-nums">{inr(l.unitCost)}</td>
                      <td className="px-2 text-right font-medium tabular-nums">{inr(l.value)}</td><td className="px-2 text-right tabular-nums text-slate-500">{o ? num(o.units) : '—'}</td>
                    </tr>);
                })}</tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">Brand seller account only (Supernode’s stock is theirs). Unsellable units are still our stock at cost unless written off. Goods on the way to Amazon (shipped, not yet received) are not in Amazon’s balance: add them from open inbound shipments if material.</p>
        </div>
      )}
    </section>
  );
}

function Total({ label, s, strong }: { label: string; s: StockSide; strong?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${strong ? 'border-brand-200 bg-brand-50' : 'border-slate-200'}`}>
      <p className="text-xs text-slate-600">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{inr(s.value)}</p>
      <p className="text-xs text-slate-600">{num(s.units)} units{s.unvalued ? ` · ${num(s.unvalued)} without a cost` : ''}</p>
    </div>
  );
}
