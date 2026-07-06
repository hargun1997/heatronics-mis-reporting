import { useState } from 'react';
import {
  exportDeckToExcel,
  exportEverythingToExcel,
  type DeckExportOptions,
} from '../../utils/deckExcelExport';
import type { Granularity } from '../../data/misDeck/analytics';

interface DeckExportModalProps {
  onClose: () => void;
}

const iconExcel = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

interface Toggle {
  key: keyof Omit<DeckExportOptions, 'granularities'>;
  title: string;
  desc: string;
}

const SHEET_TOGGLES: Toggle[] = [
  { key: 'includeSummary', title: 'Summary', desc: 'Headline KPIs and a financial-year summary table' },
  { key: 'includeChannelRevenue', title: 'Channel Revenue', desc: 'Net revenue and mix % per sales channel, by month' },
  { key: 'includeCogmDetail', title: 'COGM Detail', desc: 'Cost-of-goods-manufactured line items, month by month' },
  { key: 'includeOpexDetail', title: 'OpEx Detail', desc: 'Operating-expense line items, month by month' },
  { key: 'includeRawData', title: 'All Data (raw)', desc: 'Flat one-row-per-month dump of every field — easy to pivot/filter' },
];

const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: 'month', label: 'Monthly P&L' },
  { id: 'quarter', label: 'Quarterly P&L' },
  { id: 'year', label: 'FY P&L' },
];

export function DeckExportModal({ onClose }: DeckExportModalProps) {
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<DeckExportOptions>({
    includeSummary: true,
    granularities: ['month', 'quarter', 'year'],
    includeChannelRevenue: true,
    includeCogmDetail: true,
    includeOpexDetail: true,
    includeRawData: true,
    blendCogm: true,
  });

  const toggleSheet = (key: Toggle['key']) =>
    setOpts((o) => ({ ...o, [key]: !o[key] }));

  const toggleGran = (g: Granularity) =>
    setOpts((o) => ({
      ...o,
      granularities: o.granularities.includes(g)
        ? o.granularities.filter((x) => x !== g)
        : [...o.granularities, g],
    }));

  const sheetCount =
    (opts.includeSummary ? 1 : 0) +
    opts.granularities.length +
    (opts.includeChannelRevenue ? 1 : 0) +
    (opts.includeCogmDetail ? 1 : 0) +
    (opts.includeOpexDetail ? 1 : 0) +
    (opts.includeRawData ? 1 : 0);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setTimeout(onClose, 400);
    } catch (err) {
      console.error('Excel export failed:', err);
      alert('Failed to export Excel file. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Export to Excel</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Download the MIS data as a styled, multi-sheet workbook
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Export everything */}
          <button
            onClick={() => run(exportEverythingToExcel)}
            disabled={busy}
            className="w-full flex items-center gap-3 p-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors text-left"
          >
            <span className="shrink-0">{iconExcel}</span>
            <span className="flex-1">
              <span className="block font-semibold">Export Everything</span>
              <span className="block text-sm text-emerald-50">
                The entire dataset — every month, quarter and FY, all channels, COGM &amp; OpEx detail, plus a raw data sheet
              </span>
            </span>
          </button>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex-1 h-px bg-slate-200" />
            OR PICK WHAT YOU WANT
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Granularity for P&L */}
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="font-medium text-slate-800 mb-1">P&amp;L cascade sheets</div>
            <div className="text-sm text-slate-500 mb-3">
              Full P&amp;L (Net Revenue → COGM → margins → EBITDA → Net Income). Choose the periods.
            </div>
            <div className="flex flex-wrap gap-2">
              {GRANULARITIES.map((g) => {
                const on = opts.granularities.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGran(g.id)}
                    className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                      on
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>

            {/* COGM basis */}
            <label className="mt-3 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={opts.blendCogm}
                onChange={() => setOpts((o) => ({ ...o, blendCogm: !o.blendCogm }))}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-800">Blend COGM to FY rate</span>
                <span className="block text-slate-500">
                  Smooths month-to-month COGM booking noise (e.g. Apr'26 19% / May'26 84% → the FY rate). Off = actual
                  as-booked. COGM Detail &amp; All Data always stay actual.
                </span>
              </span>
            </label>
          </div>

          {/* Sheet toggles */}
          <div className="space-y-2">
            {SHEET_TOGGLES.map((t) => (
              <label
                key={t.key}
                className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={opts[t.key]}
                  onChange={() => toggleSheet(t.key)}
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  <span className="block font-medium text-slate-800">{t.title}</span>
                  <span className="block text-sm text-slate-500">{t.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            {sheetCount > 0 ? `${sheetCount} sheet${sheetCount !== 1 ? 's' : ''} selected` : 'Nothing selected'}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">
              Cancel
            </button>
            <button
              onClick={() => run(() => exportDeckToExcel(opts))}
              disabled={busy || sheetCount === 0}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                busy || sheetCount === 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {busy ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Exporting…
                </>
              ) : (
                <>
                  {iconExcel}
                  Export Selected
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeckExportModal;
