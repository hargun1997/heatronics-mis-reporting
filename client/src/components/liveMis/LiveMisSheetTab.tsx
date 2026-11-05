// ----------------------------------------------------------------------------
// Live MIS → P&L: the MIS sheet itself — the company / channel P&L in the
// standard MIS format (₹ Lac, months of an FY + FY total), built on the live
// months. Two toolbar switches (founder, 5 Nov 2026): Show ₹ Lac | % of net
// revenue, and Basis Actual | Blended (the FY-blended COGM restatement the old
// Profitability tab used — the SAME switch drives the margin ladder and the
// detailed P&L below it). "Download (this format)" writes exactly what is
// shown; Import Excel round-trips a ₹ download. Rows below a month's
// completeness level are blank, never 0.
// ----------------------------------------------------------------------------

import { useMemo, useRef, useState } from 'react';
import { SegmentedControl } from '../ui';
import { useStatements } from './useStatements';
import { misCashRows } from '../../data/statements/statements';
import { MIS_SHEET_ROWS, type MisEntity, type MisPoint } from '../../data/misDeck/misSheet';
import type { LiveDeckData } from '../../data/misDeck/liveDeck';
import type { MonthlyMIS } from '../../data/misDeck/misDeckData';
import { liveFiscalYears } from '../../data/misDeck/liveViews';
import { downloadMisFormat, parseMisFormat, type ImportedMis } from '../../utils/misFormatExport';
import { liveMisFormatSource, misSourceWithCash } from '../../utils/liveMisExport';
import { BlendNote, Fold, Note, useLiveView } from './shared';

const LAC = 1e5;
const fmtLac = (v: number | null) => (v === null || !isFinite(v) ? '–' : (v / LAC).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtCount = (v: number | null, dp = 0) => (v === null || !isFinite(v) ? '–' : v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const fmtPct = (v: number | null) => (v === null || !isFinite(v) ? '–' : `${(v * 100).toFixed(1)}%`);

export type SheetShow = 'lac' | 'pct';

export function LiveMisSheetTab({ deck, blendedMonths }: {
  deck: LiveDeckData;
  /** The deck's months restated to FY-blended COGM (null until computed); used when Basis = Blended. */
  blendedMonths: MonthlyMIS[] | null;
}) {
  const { merged, chName, blended, setBlended } = useLiveView();
  const useBlend = blended && !!blendedMonths;
  const src = useMemo(
    () => liveMisFormatSource(useBlend ? { ...deck, months: blendedMonths! } : deck, merged),
    [deck, blendedMonths, useBlend, merged],
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
  const withCash = (keys: string[], point: MisPoint): MisPoint => {
    if (entity !== 'company') return point;
    const rows = keys.map((k) => misCashRows(flows, k));
    if (rows.some((r) => !r)) return point;
    const rs = rows as NonNullable<(typeof rows)[number]>[];
    return { ...point, openingCash: rs[0].openingCash, closingCash: rs[rs.length - 1].closingCash, funding: rs.reduce((a, r) => a + r.funding, 0), cashBurn: rs.reduce((a, r) => a + r.cashBurn, 0), runway: rs[rs.length - 1].runway };
  };
  const columns = [
    ...fy.months.map((m) => ({ label: m.label, point: withCash([m.key], src.point([m.key], entity)) })),
    { label: `${fy.name} Total`, point: withCash(fy.months.map((m) => m.key), src.point(fy.months.map((m) => m.key), entity)) },
  ];
  const entities: { id: MisEntity; label: string }[] = [{ id: 'company', label: 'Company (All)' }, ...src.channels.map((c) => ({ id: c, label: chName(c) }))];
  const pct = show === 'pct';
  // % view: every ₹ row ÷ that column's Net Revenue; ratio rows and counts stay as they are.
  const cellText = (row: (typeof MIS_SHEET_ROWS)[number], point: MisPoint) => {
    const raw = row.get(point);
    if (row.pct) return fmtPct(raw);
    if (row.count) return fmtCount(raw, row.decimals);
    if (!pct) return fmtLac(raw);
    const nr = point.netRevenue;
    return raw === null || !nr ? '–' : fmtPct(raw / nr);
  };
  const unit = pct ? '% of Net Revenue' : 'INR Lac';
  const onDownload = () => downloadMisFormat({
    ...misSourceWithCash(src, flows),
    percent: pct,
    title: `HEATRONICS LIVE MIS · Company P&L (${pct ? '% of net revenue' : '₹ Lac'}${useBlend ? ', blended COGM' : ''})`,
    fileName: `Heatronics_Live_MIS_Sheet_${pct ? 'pct' : 'lac'}_${useBlend ? 'blended' : 'actual'}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  });

  const onImport = async (file: File) => {
    setImportError(null);
    try {
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
          <SegmentedControl size="sm" aria-label="COGM basis" value={blended ? 'blended' : 'actual'} onChange={(v) => setBlended(v === 'blended')}
            options={[{ id: 'actual', label: 'Actual' }, { id: 'blended', label: 'Blended' }]} />
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <button type="button" onClick={onDownload}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50">Download (this format)</button>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50">Import Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = ''; }} />
        </div>
      </div>
      {importError && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{importError}</div>}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs whitespace-nowrap">
          <caption className="sr-only">MIS · {entities.find((e) => e.id === entity)?.label} · {fy.name} · {unit}</caption>
          <thead>
            <tr className="text-[10px] text-slate-400 border-b border-slate-200">
              <th className="py-1.5 px-3 text-left font-medium sticky left-0 bg-white">Particulars in {unit}</th>
              {columns.map((c) => <th key={c.label} className="py-1.5 px-2 text-right font-medium text-slate-600">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {MIS_SHEET_ROWS.map((row) => (
              <tr key={row.label} className={`border-b border-slate-50 ${row.bold ? 'font-semibold text-slate-800' : row.pct ? 'text-slate-500 italic' : 'text-slate-600'}`}>
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
      <BlendNote />
      <Note>
        {pct ? 'Every ₹ line is shown as a % of that column’s Net Revenue; ratio rows (GM%, CM1% …) and counts (Qty, Runway) are unchanged. ' : 'Costs positive, margins signed. '}
        Cash rows (company only) come from Tally’s month-end Balance Sheets: burn = opening + equity raised − closing, runway =
        closing cash ÷ (3 × the last 3 months’ average burn), in quarters; blank until both month ends are stored (FY total: every
        month). Other blank rows aren’t tracked (Channel Margin, SS Claim, Payroll / Professional Fee split) or aren’t real yet
        for that month (below its completeness level). Gross revenue, returns and GST come from the months whose source carries
        them (the published MIS); live-built months leave them blank. Qty = actual connector orders where every month reports
        them, else estimated (net revenue ÷ AOV). Channel columns use the MIS-anchored split; Brand Investment = Platform &amp;
        Payment; OpEx under Other Expense. Discounts = the Shopify promo feed. Import Excel reads a ₹ Lac download.
      </Note>

      {imported && (
        <Fold id="ms-imported" title="Imported MIS (P&L Summary)" meta="Parsed from the uploaded workbook — round-trips with a ₹ Lac download"
          actions={<button type="button" onClick={() => setImported(null)} className="text-xs text-slate-500 hover:text-slate-800">Clear</button>}>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="text-[10px] text-slate-400 border-b border-slate-200">
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
