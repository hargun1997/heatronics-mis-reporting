import { useMemo, useRef, useState } from 'react';
import { SectionCard } from '../ui/Card';
import {
  MIS_SHEET_ROWS,
  MIS_ENTITIES,
  misPoint,
  sumPoints,
  misFiscalYears,
  type MisEntity,
} from '../../data/misDeck/misSheet';
import {
  downloadMisFormat,
  parseMisFormat,
  type ImportedMis,
} from '../../utils/misFormatExport';

const LAC = 1e5;

function fmtLac(v: number | null): string {
  if (v === null || !isFinite(v)) return '–';
  return (v / LAC).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCount(v: number | null): string {
  if (v === null || !isFinite(v)) return '–';
  return Math.round(v).toLocaleString('en-IN');
}
function fmtPct(v: number | null): string {
  if (v === null || !isFinite(v)) return '–';
  return `${(v * 100).toFixed(1)}%`;
}
function fmtRaw(v: number | null): string {
  if (v === null || !isFinite(v)) return '–';
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MisSheetTab() {
  const fiscalYears = useMemo(() => misFiscalYears(), []);
  // Default to the latest fiscal year that has a decent number of months (so the
  // first view isn't a 2-month partial year).
  const defaultFy = useMemo(() => {
    for (let i = fiscalYears.length - 1; i >= 0; i--) if (fiscalYears[i].months.length >= 6) return i;
    return fiscalYears.length - 1;
  }, [fiscalYears]);
  const [fyIdx, setFyIdx] = useState(defaultFy);
  const [entity, setEntity] = useState<MisEntity>('company');
  const [imported, setImported] = useState<ImportedMis | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fy = fiscalYears[Math.min(fyIdx, fiscalYears.length - 1)];
  const monthPoints = fy.months.map((m) => misPoint(m, entity));
  const totalPoint = sumPoints(monthPoints);
  const columns = [
    ...fy.months.map((m, i) => ({ label: m.label, point: monthPoints[i] })),
    { label: `${fy.name} Total`, point: totalPoint },
  ];

  const onImport = async (file: File) => {
    setImportError(null);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseMisFormat(buf);
      if (!parsed || parsed.rows.length === 0) {
        setImportError('Could not find a "P&L Summary" block in that file. Use a workbook exported from here.');
        return;
      }
      setImported(parsed);
    } catch {
      setImportError('Failed to read that file. Please upload a valid .xlsx exported from here.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">MIS Sheet</h2>
          <p className="text-xs text-slate-400">
            Company &amp; channel P&amp;L in the standard MIS format — values in ₹ Lac. Fill reflects what the MIS tracks;
            rows without data are blank.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as MisEntity)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {MIS_ENTITIES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <select
            value={Math.min(fyIdx, fiscalYears.length - 1)}
            onChange={(e) => setFyIdx(Number(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {fiscalYears.map((f, i) => <option key={f.key} value={i}>{f.name}</option>)}
          </select>
          <button
            onClick={downloadMisFormat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download (this format)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Excel
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
          />
        </div>
      </div>

      {importError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{importError}</div>
      )}

      <SectionCard
        title={`MIS · ${MIS_ENTITIES.find((e) => e.id === entity)?.label} · ${fy.name}`}
        description="Particulars in ₹ Lac. Costs are positive magnitudes; contribution margins are signed. Percentages are of net revenue (GM%/CM%/EBITDA%) or of gross revenue (Net Revenue %)."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-4 text-left font-medium sticky left-0 bg-white">Particulars in INR Lac</th>
                {columns.map((c) => (
                  <th key={c.label} className="py-2 px-3 text-right font-medium text-slate-600">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MIS_SHEET_ROWS.map((row) => (
                <tr key={row.label} className={`border-b border-slate-50 ${row.bold ? 'font-semibold text-slate-800' : row.pct ? 'text-slate-500 italic' : 'text-slate-600'}`}>
                  <td className={`py-1.5 pr-4 text-left sticky left-0 bg-white ${row.bold ? 'font-semibold text-slate-800' : ''}`}>{row.label}</td>
                  {columns.map((c, ci) => {
                    const raw = row.get(c.point);
                    const isTotal = ci === columns.length - 1;
                    return (
                      <td key={c.label} className={`py-1.5 px-3 text-right tabular-nums ${isTotal ? 'font-medium bg-slate-50/60' : ''}`}>
                        {row.pct ? fmtPct(raw) : row.count ? fmtCount(raw) : fmtLac(raw)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <p className="text-xs text-slate-400">
        Rows not tracked in the Heatronics MIS are left blank: Channel Margin, SS Claim, Branding is mapped to platform
        costs, opex is shown under Other Expense (Payroll / Professional Fee are not split), and Cash / Funding / Runway
        have no source. Qty is the estimated order count (net revenue ÷ AOV). Discounts are the Shopify (D2C) promo figure
        where available.
      </p>

      {imported && (
        <SectionCard
          title="Imported MIS (P&L Summary)"
          description="Parsed from the uploaded workbook — round-trips with the download above."
          actions={
            <button onClick={() => setImported(null)} className="text-xs text-slate-500 hover:text-slate-800">Clear</button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-200">
                  <th className="py-2 pr-4 text-left font-medium sticky left-0 bg-white">Particulars</th>
                  {imported.columns.map((c, i) => (
                    <th key={`${c}-${i}`} className="py-2 px-3 text-right font-medium text-slate-600">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {imported.rows.map((r, ri) => (
                  <tr key={`${r.label}-${ri}`} className="border-b border-slate-50 text-slate-600">
                    <td className="py-1.5 pr-4 text-left sticky left-0 bg-white">{r.label}</td>
                    {r.values.map((v, vi) => (
                      <td key={vi} className="py-1.5 px-3 text-right tabular-nums">
                        {v === null ? '–' : r.pct ? `${(v * 100).toFixed(1)}%` : fmtRaw(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

export default MisSheetTab;
