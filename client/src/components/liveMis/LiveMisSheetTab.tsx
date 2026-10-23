// ----------------------------------------------------------------------------
// Live MIS — "MIS Sheet": the company / channel P&L in the standard MIS format
// (₹ Lac, months of an FY + FY total), built on the live months. Same rows,
// download and import round-trip as the legacy deck's MIS Sheet; rows below a
// month's completeness level are blank, never 0.
// ----------------------------------------------------------------------------

import { useMemo, useRef, useState } from 'react';
import { MIS_SHEET_ROWS, type MisEntity } from '../../data/misDeck/misSheet';
import type { LiveDeckData } from '../../data/misDeck/liveDeck';
import { liveFiscalYears } from '../../data/misDeck/liveViews';
import { downloadMisFormat, parseMisFormat, type ImportedMis } from '../../utils/misFormatExport';
import { liveMisFormatSource } from '../../utils/liveMisExport';
import { Fold, Note, useLiveView } from './shared';

const LAC = 1e5;
const fmtLac = (v: number | null) => (v === null || !isFinite(v) ? '–' : (v / LAC).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtCount = (v: number | null) => (v === null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('en-IN'));
const fmtPct = (v: number | null) => (v === null || !isFinite(v) ? '–' : `${(v * 100).toFixed(1)}%`);

export function LiveMisSheetTab({ deck }: { deck: LiveDeckData }) {
  const { merged, chName } = useLiveView();
  const src = useMemo(() => liveMisFormatSource(deck, merged), [deck, merged]);
  const fys = useMemo(() => liveFiscalYears(deck.months), [deck]);
  const defaultFy = useMemo(() => {
    for (let i = fys.length - 1; i >= 0; i--) if (fys[i].months.length >= 6) return i;
    return fys.length - 1;
  }, [fys]);
  const [fyIdx, setFyIdx] = useState<number | null>(null);
  const [entity, setEntity] = useState<MisEntity>('company');
  const [imported, setImported] = useState<ImportedMis | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!fys.length) return <p className="text-sm text-slate-400 py-6 text-center">No months yet.</p>;
  const fy = fys[Math.min(fyIdx ?? defaultFy, fys.length - 1)];
  const columns = [
    ...fy.months.map((m) => ({ label: m.label, point: src.point([m.key], entity) })),
    { label: `${fy.name} Total`, point: src.point(fy.months.map((m) => m.key), entity) },
  ];
  const entities: { id: MisEntity; label: string }[] = [{ id: 'company', label: 'Company (All)' }, ...src.channels.map((c) => ({ id: c, label: chName(c) }))];

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
      <div className="flex flex-wrap items-center gap-2">
        <select value={entity} onChange={(e) => setEntity(e.target.value as MisEntity)} aria-label="Entity"
          className="px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700">
          {entities.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <select value={Math.min(fyIdx ?? defaultFy, fys.length - 1)} onChange={(e) => setFyIdx(Number(e.target.value))} aria-label="Fiscal year"
          className="px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700">
          {fys.map((f, i) => <option key={f.key} value={i}>{f.name}</option>)}
        </select>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <button type="button" onClick={() => downloadMisFormat(src)}
            className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700">Download (this format)</button>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50">Import Excel</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = ''; }} />
        </div>
      </div>
      {importError && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{importError}</div>}

      <Fold id="ms-sheet" title={`MIS · ${entities.find((e) => e.id === entity)?.label} · ${fy.name}`} meta="Particulars in ₹ Lac · costs positive, margins signed">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-[10px] text-slate-400 border-b border-slate-200">
                <th className="py-1.5 px-3 text-left font-medium sticky left-0 bg-white">Particulars in INR Lac</th>
                {columns.map((c) => <th key={c.label} className="py-1.5 px-2 text-right font-medium text-slate-600">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {MIS_SHEET_ROWS.map((row) => (
                <tr key={row.label} className={`border-b border-slate-50 ${row.bold ? 'font-semibold text-slate-800' : row.pct ? 'text-slate-500 italic' : 'text-slate-600'}`}>
                  <td className="py-1 px-3 text-left sticky left-0 bg-white">{row.label}</td>
                  {columns.map((c, ci) => {
                    const raw = row.get(c.point);
                    return (
                      <td key={c.label} className={`py-1 px-2 text-right tabular-nums ${ci === columns.length - 1 ? 'font-medium bg-slate-50/60' : ''}`}>
                        {row.pct ? fmtPct(raw) : row.count ? fmtCount(raw) : fmtLac(raw)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Fold>
      <Note>
        Blank rows aren’t tracked (Channel Margin, SS Claim, Payroll / Professional Fee split, cash &amp; runway) or aren’t real yet
        for that month (below its completeness level). Gross revenue, returns and GST come from the months whose source carries
        them (the published MIS); live-built months leave them blank. Qty = actual connector orders where every month reports
        them, else estimated (net revenue ÷ AOV). Channel columns use the MIS-anchored split; Brand Investment = Platform &amp;
        Payment; OpEx under Other Expense. Discounts = the Shopify promo feed.
      </Note>

      {imported && (
        <Fold id="ms-imported" title="Imported MIS (P&L Summary)" meta="Parsed from the uploaded workbook — round-trips with the download above"
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
