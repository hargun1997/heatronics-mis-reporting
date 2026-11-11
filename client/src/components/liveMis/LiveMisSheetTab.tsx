// ----------------------------------------------------------------------------
// Live MIS → P&L: the MIS sheet itself — the company / channel P&L in the
// standard MIS format (₹ Lac, months of an FY + FY total), built on the live
// months. Two toolbar switches (founder, 5 Nov 2026): Show ₹ Lac | % of net
// revenue, and Basis Actual | Normalised (COGM = BOM cost of units sold +
// factory overhead, Tally's purchase-timing difference as the "Stock build /
// drawdown" memo line under GM% — the SAME switch drives the margin ladder and
// the detailed P&L below it). "Download (this format)" writes exactly what is
// shown; Import Excel round-trips a ₹ download. Rows below a month's
// completeness level are blank, never 0.
// ----------------------------------------------------------------------------

import { useMemo, useRef, useState } from 'react';
import { BTN } from '../ui/states';
import { SegmentedControl } from '../ui';
import { useStatements } from './useStatements';
import { MIS_SHEET_ROWS, MIS_SHEET_ROWS_NORMALISED, type MisEntity, type MisPoint } from '../../data/misDeck/misSheet';
import type { LiveDeckData } from '../../data/misDeck/liveDeck';
import type { MonthlyMIS } from '../../data/misDeck/misDeckData';
import { liveFiscalYears } from '../../data/misDeck/liveViews';
// misFormatExport (xlsx-js-style) is imported on download / import, not with the page.
import type { ImportedMis } from '../../utils/misFormatExport';
import { liveMisFormatSource, misSourceWithCash } from '../../utils/liveMisSource';
import { BASIS_OPTIONS, CogmBasisNote, Fold, Note, useLiveView } from './shared';

const LAC = 1e5;
const fmtLac = (v: number | null) => (v === null || !isFinite(v) ? '–' : (v / LAC).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtCount = (v: number | null, dp = 0) => (v === null || !isFinite(v) ? '–' : v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const fmtPct = (v: number | null) => (v === null || !isFinite(v) ? '–' : `${(v * 100).toFixed(1)}%`);

export type SheetShow = 'lac' | 'pct';

export function LiveMisSheetTab({ deck, normalisedMonths }: {
  deck: LiveDeckData;
  /** The deck's months on the normalised COGM basis (null until computed); used when Basis = Normalised. */
  normalisedMonths: MonthlyMIS[] | null;
}) {
  const { merged, chName, basis, setBasis } = useLiveView();
  const normalised = basis === 'normalised' && !!normalisedMonths;
  const rows = normalised ? MIS_SHEET_ROWS_NORMALISED : MIS_SHEET_ROWS;
  const src = useMemo(
    () => ({ ...liveMisFormatSource(normalised ? { ...deck, months: normalisedMonths! } : deck, merged), rows }),
    [deck, normalisedMonths, normalised, merged, rows],
  );
  const fys = useMemo(() => liveFiscalYears(deck.months), [deck]);
  const defaultFy = useMemo(() => {
    for (let i = fys.length - 1; i >= 0; i--) if (fys[i].months.length >= 6) return i;
    return fys.length - 1;
  }, [fys]);
  const [fyIdx, setFyIdx] = useState<number | null>(null);
  const [entity, setEntity] = useState<MisEntity>('company');
  const [show, setShow] = useState<SheetShow>('lac');
  const [imported, setImported] = useState<ImportedMis | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stmts = useStatements();
  if (!fys.length) return <p className="text-sm text-slate-400 py-6 text-center">No months yet.</p>;
  const fy = fys[Math.min(fyIdx ?? defaultFy, fys.length - 1)];
  // Cash rows (opening / closing cash, equity raised, burn, runway) from Tally's month-end balance sheets (company only).
  const flows = stmts.built?.flows ?? [];
  const cashSrc = misSourceWithCash(src, flows);
  const fyKeys = fy.months.map((m) => m.key);
  const total = cashSrc.point(fyKeys, entity);
  const columns = [
    ...fy.months.map((m) => ({ label: m.label, point: cashSrc.point([m.key], entity) })),
    // Cash rows over the months that have them, named in the header ("cash Oct–Nov") when not every month does.
    { label: `${fy.name} Total${total.cashMonths ? ` (cash ${total.cashMonths})` : ''}`, point: total },
  ];
  const entities: { id: MisEntity; label: string }[] = [{ id: 'company', label: 'Company (All)' }, ...src.channels.map((c) => ({ id: c, label: chName(c) }))];
  const pct = show === 'pct';
  // % view: every P&L ₹ row ÷ that column's Net Revenue; ratio rows, counts and cash rows (₹ Lac) stay as they are.
  const cellText = (row: (typeof rows)[number], point: MisPoint) => {
    const raw = row.get(point);
    if (row.pct) return fmtPct(raw);
    if (row.count) return fmtCount(raw, row.decimals);
    if (!pct || row.cash) return fmtLac(raw);
    const nr = point.netRevenue;
    return raw === null || !nr ? '–' : fmtPct(raw / nr);
  };
  const unit = pct ? '% of Net Revenue' : 'INR Lac';
  const onDownload = async () => {
    const source = {
      ...misSourceWithCash(src, flows),
      percent: pct,
      title: `HEATRONICS LIVE MIS · Company P&L (${pct ? '% of net revenue' : '₹ Lac'}${normalised ? ', normalised COGM' : ''})`,
      fileName: `Heatronics_Live_MIS_Sheet_${pct ? 'pct' : 'lac'}_${normalised ? 'normalised' : 'actual'}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    };
    const { downloadMisFormat } = await import('../../utils/misFormatExport');
    downloadMisFormat(source);
  };

  const onImport = async (file: File) => {
    setImportError(null);
    try {
      const { parseMisFormat } = await import('../../utils/misFormatExport');
      const parsed = parseMisFormat(await file.arrayBuffer());
      if (!parsed || parsed.rows.length === 0) { setImportError('Could not find a "P&L Summary" block in that file. Use a workbook exported from here.'); return; }
      setImported(parsed);
    } catch {
      setImportError('Failed to read that file. Please upload a valid .xlsx exported from here.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="text-xs text-slate-500">
          <span className="block mb-1">Entity</span>
          <select value={entity} onChange={(e) => setEntity(e.target.value as MisEntity)} aria-label="Entity"
            className="px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700">
            {entities.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          <span className="block mb-1">Fiscal year</span>
          <select value={Math.min(fyIdx ?? defaultFy, fys.length - 1)} onChange={(e) => setFyIdx(Number(e.target.value))} aria-label="Fiscal year"
            className="px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700">
            {fys.map((f, i) => <option key={f.key} value={i}>{f.name}</option>)}
          </select>
        </label>
        <div className="text-xs text-slate-500">
          <span className="block mb-1">Show</span>
          <SegmentedControl size="sm" aria-label="Show" value={show} onChange={setShow}
            options={[{ id: 'lac', label: '₹ Lac' }, { id: 'pct', label: '% of net revenue' }]} />
        </div>
        <div className="text-xs text-slate-500">
          <span className="block mb-1">Basis</span>
          <SegmentedControl size="sm" aria-label="COGM basis" value={basis} onChange={setBasis} options={BASIS_OPTIONS} />
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <button type="button" onClick={() => void onDownload()} className={BTN}>Download this sheet</button>
          <button type="button" onClick={() => fileRef.current?.click()} className={BTN}>Upload Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = ''; }} />
        </div>
      </div>
      {importError && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{importError}</div>}

      <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs whitespace-nowrap">
          <caption className="sr-only">MIS · {entities.find((e) => e.id === entity)?.label} · {fy.name} · {unit}</caption>
          <thead>
            <tr className="text-xs sm:text-[11px] text-slate-400 border-b border-slate-200">
              <th className="py-1.5 px-3 text-left font-medium sticky left-0 bg-white">Particulars in {unit}</th>
              {columns.map((c) => <th key={c.label} className="py-1.5 px-2 text-right font-medium text-slate-600">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} data-row={row.memo ? 'stock-variance' : undefined} className={`border-b border-slate-50 ${row.bold ? 'font-semibold text-slate-800' : row.pct || row.memo ? 'text-slate-500 italic' : 'text-slate-600'}`}>
                <td className="py-1 px-3 text-left sticky left-0 bg-white">{row.label}</td>
                {columns.map((c, ci) => (
                  <td key={c.label} className={`py-1 px-2 text-right tabular-nums ${ci === columns.length - 1 ? 'font-medium bg-slate-50/60' : ''}`}>
                    {cellText(row, c.point)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CogmBasisNote />
      <Note>
        {pct ? 'Every P&L ₹ line is shown as a % of that column’s Net Revenue; ratio rows (GM%, CM1% …), counts (Qty, Runway) and the cash rows (cash, funding, burn: ₹ Lac) are unchanged. ' : 'Costs positive, margins signed. '}
        {normalised ? 'Stock build / drawdown is a signed memo line (material only: positive = Tally charged more material than was sold; factory, manufacturing and inward freight stay in COGM), outside the cascade: EBITDA + Σ memo = EBITDA as booked. ' : ''}
        Cash rows (company only) come from Tally’s month-end Balance Sheets: burn = opening + equity raised − closing, runway =
        closing cash ÷ (3 × the last 3 months’ average burn), in quarters; blank until both month ends are stored (FY total: the months
        that have them, named in the column header). EBITDA Burn for a total = the period’s EBITDA loss (0 when it made a profit),
        not the sum of its loss months. Payroll = payroll and salary ledgers, Professional Fee = professional fees and Legal &amp; CA;
        blank when the month has no such line. Other blank rows aren’t tracked (Channel Margin, SS Claim) or aren’t real yet
        for that month (below its completeness level). Gross revenue, returns and GST come from the months whose source carries
        them (the published MIS); live-built months leave them blank. Qty = actual connector orders where every month reports
        them, else estimated (net revenue ÷ AOV). Channel columns use the MIS-anchored split; Brand Investment = Platform &amp;
        Payment; OpEx under Other Expense. Discounts = the Shopify promo feed. Import Excel reads a ₹ Lac download.
      </Note>

      {imported && (
        <Fold id="ms-imported" title="Imported MIS (P&L Summary)" meta="Parsed from the uploaded workbook: round-trips with a ₹ Lac download"
          actions={<button type="button" onClick={() => setImported(null)} className="text-xs text-slate-500 hover:text-slate-800">Clear</button>}>
          <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="text-xs sm:text-[11px] text-slate-400 border-b border-slate-200">
                  <th className="py-1.5 px-3 text-left font-medium sticky left-0 bg-white">Particulars</th>
                  {imported.columns.map((c, i) => <th key={`${c}-${i}`} className="py-1.5 px-2 text-right font-medium text-slate-600">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {imported.rows.map((r, ri) => (
                  <tr key={`${r.label}-${ri}`} className="border-b border-slate-50 text-slate-600">
                    <td className="py-1 px-3 text-left sticky left-0 bg-white">{r.label}</td>
                    {r.values.map((v, vi) => <td key={vi} className="py-1 px-2 text-right tabular-nums">{v === null ? '–' : r.pct ? `${(v * 100).toFixed(1)}%` : v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Fold>
      )}
    </div>
  );
}
