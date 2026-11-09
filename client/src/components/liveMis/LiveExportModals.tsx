// ----------------------------------------------------------------------------
// Live MIS export modals — Excel (the legacy deck's sheet pick-list + options,
// plus the Live-only extras) and PDF (section + period picker, as the retired
// MIS-tracking export had).
// ----------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { Modal } from '../ui';
import type { LiveDeckData } from '../../data/misDeck/liveDeck';
import { aggregatePeriods, monthLabel, type Granularity } from '../../data/misDeck/liveAnalytics';
// The Excel / PDF builders (xlsx-js-style, jspdf) are imported when a download is clicked, not with the page.
import { liveSheetCount, LIVE_EXPORT_EVERYTHING, type LiveExportOptions } from '../../utils/liveMisSource';
import { useStatements } from './useStatements';
import type { PdfSection } from '../../utils/liveMisPdf';
import type { CogmBasis } from './shared';

type SheetKey = Exclude<keyof LiveExportOptions, 'granularities' | 'normaliseCogm' | 'mergeChannels'>;
const SHEETS: { key: SheetKey; title: string; desc: string }[] = [
  { key: 'includeSummary', title: 'Summary', desc: 'Headline KPIs and a financial-year summary table' },
  { key: 'includeChannelRevenue', title: 'Channel Revenue', desc: 'Net revenue and mix % per channel, by month' },
  { key: 'includeChannelPnl', title: 'Channel P&L + SKU x Channel', desc: 'MIS-anchored channel P&L per FY, and the all-time SKU × channel CM2 matrix with per-channel cascades' },
  { key: 'includeOrders', title: 'Channel Orders', desc: 'Orders per channel per month — actual where connectors report them, else revenue ÷ AOV' },
  { key: 'includeRepeats', title: 'Repeats', desc: 'Repeat-purchase behaviour — Shopify (D2C) & Amazon' },
  { key: 'includeDiscounts', title: 'Discounts', desc: 'Monthly discounts and total sales (storefront)' },
  { key: 'includeCogmDetail', title: 'COGM Detail', desc: 'Cost-of-goods-manufactured ledger lines, month by month' },
  { key: 'includeOpexDetail', title: 'OpEx Detail', desc: 'Operating-expense ledger lines, month by month (Live extra)' },
  { key: 'includeMarketing', title: 'Marketing by Platform', desc: 'S&M split by ad platform for live months (Live extra)' },
  { key: 'includeUnits', title: 'Units', desc: 'Units sold per product per month (Live extra)' },
  { key: 'includeSkuCells', title: 'SKU Cells', desc: 'The raw product × channel × month rows behind every SKU view (Live extra)' },
  { key: 'includeBalanceSheet', title: 'Balance Sheet', desc: 'Month-end Balance Sheet from Tally Trial Balances, last 12 months (Live extra)' },
  { key: 'includeCashFlow', title: 'Cash Flow', desc: 'Indirect cash flow per month from the Balance Sheets (Live extra)' },
  { key: 'includeMisSheet', title: 'MIS Sheet', desc: 'The standard MIS Sheet, company P&L in ₹ Lac with the Tally cash rows (Live extra)' },
];
const GRANS: { id: Granularity; label: string }[] = [
  { id: 'month', label: 'Monthly P&L' }, { id: 'quarter', label: 'Quarterly P&L' }, { id: 'year', label: 'FY P&L' },
];

const chip = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs border transition-colors ${on ? 'bg-brand-50 text-brand-700 border-brand-200 font-medium' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`;
const btnPrimary = 'px-4 py-2 rounded-lg bg-cta text-on-cta text-sm font-medium hover:bg-cta-hover disabled:opacity-40';
const btnGhost = 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800';

export function LiveExcelModal({ deck, open, onClose, basis, merged }: {
  deck: LiveDeckData; open: boolean; onClose: () => void; basis: CogmBasis; merged: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const stmts = useStatements();
  const [o, setO] = useState<LiveExportOptions>(() => ({ ...LIVE_EXPORT_EVERYTHING, normaliseCogm: basis === 'normalised', mergeChannels: merged }));
  const n = liveSheetCount(o);
  const run = async (opts: LiveExportOptions) => {
    setBusy(true);
    try { const { exportLiveMis } = await import('../../utils/liveMisExport'); await exportLiveMis(deck, opts, stmts.built); setTimeout(onClose, 300); }
    catch (e) { console.error('Live MIS export failed', e); alert('Failed to export the Excel file. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} width={640} title="Export to Excel" subtitle="The Live MIS as a styled, multi-sheet workbook"
      footer={<>
        <span className="mr-auto text-xs text-slate-500">{n ? `${n} sheet${n === 1 ? '' : 's'} selected` : 'Nothing selected'}</span>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={busy || !n} onClick={() => void run(o)} className={btnPrimary}>{busy ? 'Exporting…' : 'Export selected'}</button>
      </>}>
      <div className="space-y-4">
        <button type="button" disabled={busy} onClick={() => void run({ ...LIVE_EXPORT_EVERYTHING, normaliseCogm: o.normaliseCogm, mergeChannels: o.mergeChannels })}
          className="w-full text-left rounded-xl bg-cta hover:bg-cta-hover text-on-cta px-4 py-3 disabled:opacity-60">
          <span className="block font-semibold">Export Everything</span>
          <span className="block text-xs text-white/80">Every month, quarter and FY, channel P&amp;L, SKU × channel, orders, repeats, discounts, COGM / OpEx detail, marketing, units and SKU cells</span>
        </button>
        <div className="flex items-center gap-3 text-xs sm:text-[11px] uppercase tracking-wide text-slate-400"><div className="flex-1 h-px bg-slate-200" />or pick what you want<div className="flex-1 h-px bg-slate-200" /></div>
        <div className="rounded-lg bg-slate-50 p-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-800">P&amp;L cascade sheets</p>
            <p className="text-xs text-slate-500 mb-2">Net Revenue → Net Income, every line with its % of net revenue, a Total column, CoF split from Non-op, scope and completeness rows. Lines below a period’s completeness are blank.</p>
            <div className="flex flex-wrap gap-2">
              {GRANS.map((g) => {
                const on = o.granularities.includes(g.id);
                return <button key={g.id} type="button" className={chip(on)}
                  onClick={() => setO({ ...o, granularities: on ? o.granularities.filter((x) => x !== g.id) : [...o.granularities, g.id] })}>{g.label}</button>;
              })}
            </div>
          </div>
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1" checked={o.normaliseCogm} onChange={() => setO({ ...o, normaliseCogm: !o.normaliseCogm })} />
            <span><span className="font-medium text-slate-800">Normalised COGM</span>
              <span className="block text-xs text-slate-500">P&amp;L and MIS sheets price COGM as units sold × BOM cost + factory overhead; Tally's purchase-timing difference is a "Stock build / drawdown" memo line. Months with no BOM costing stay as booked (noted). COGM Detail stays as booked.</span></span>
          </label>
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1" checked={o.mergeChannels} onChange={() => setO({ ...o, mergeChannels: !o.mergeChannels })} />
            <span><span className="font-medium text-slate-800">Continuous channels</span>
              <span className="block text-xs text-slate-500">Fold OEM into B2B and Offline into GT so channel rows run unbroken across the locked/live seam.</span></span>
          </label>
        </div>
        <div className="space-y-1.5">
          {SHEETS.map((t) => (
            <label key={t.key} className="flex items-start gap-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 px-3 py-2 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={o[t.key]} onChange={() => setO({ ...o, [t.key]: !o[t.key] })} />
              <span><span className="block text-sm font-medium text-slate-800">{t.title}</span><span className="block text-xs text-slate-500">{t.desc}</span></span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

const SECTIONS: { id: PdfSection; title: string; desc: string }[] = [
  { id: 'trends', title: 'Trends overview', desc: 'Net revenue & EBITDA chart and a fiscal-year summary' },
  { id: 'fyPnl', title: 'FY P&L summaries', desc: 'One page per fiscal year: months + FY total' },
  { id: 'months', title: 'Individual months', desc: 'The P&L for the months you pick (+ their total)' },
  { id: 'channels', title: 'Channel mix', desc: 'Channel share of net revenue per fiscal year' },
  { id: 'balanceSheet', title: 'Balance Sheet', desc: 'Month-end Balance Sheet from Tally Trial Balances (last 12 months)' },
  { id: 'cashFlow', title: 'Cash Flow', desc: 'Indirect cash flow per month (last 12 months)' },
  { id: 'misSheet', title: 'MIS Sheet', desc: 'The standard MIS Sheet per fiscal year selected, with the Tally cash rows' },
];

export function LivePdfModal({ deck, open, onClose, basis, merged }: {
  deck: LiveDeckData; open: boolean; onClose: () => void; basis: CogmBasis; merged: boolean;
}) {
  const years = useMemo(() => aggregatePeriods(deck.months, deck.completeness, 'year'), [deck]);
  const [sections, setSections] = useState<PdfSection[]>(['trends', 'fyPnl']);
  const [fyKeys, setFyKeys] = useState<string[]>(() => years.slice(-1).map((y) => y.key));
  const [monthKeys, setMonthKeys] = useState<string[]>(() => deck.periods.slice(-1));
  const [busy, setBusy] = useState(false);
  const stmts = useStatements();
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const run = async () => {
    setBusy(true);
    try { const { downloadLivePdf } = await import('../../utils/liveMisPdf'); downloadLivePdf(deck, { sections, fyKeys, monthKeys, normaliseCogm: basis === 'normalised', mergeChannels: merged }, stmts.built); setTimeout(onClose, 300); }
    catch (e) { console.error('PDF export failed', e); alert('Failed to build the PDF. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} width={600} title="Export PDF" subtitle="A printable report built from the Live MIS"
      footer={<>
        <span className="mr-auto text-xs text-slate-500">{basis === 'normalised' ? 'Normalised' : 'Actual'} COGM · {merged ? 'continuous' : 'as-booked'} channels</span>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={busy || sections.length === 0} onClick={() => void run()} className={btnPrimary}>{busy ? 'Building…' : 'Download PDF'}</button>
      </>}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          {SECTIONS.map((s) => (
            <label key={s.id} className="flex items-start gap-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 px-3 py-2 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={sections.includes(s.id)} onChange={() => setSections(toggle(sections, s.id))} />
              <span><span className="block text-sm font-medium text-slate-800">{s.title}</span><span className="block text-xs text-slate-500">{s.desc}</span></span>
            </label>
          ))}
        </div>
        <div>
          <p className="text-xs font-medium text-slate-700 mb-1.5">Fiscal years <span className="font-normal text-slate-400">(trends, FY P&amp;L, channel mix — none = all)</span></p>
          <div className="flex flex-wrap gap-1.5">
            {years.map((y) => <button key={y.key} type="button" className={chip(fyKeys.includes(y.key))} onClick={() => setFyKeys(toggle(fyKeys, y.key))}>{y.label}</button>)}
          </div>
        </div>
        {sections.includes('months') && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-xs font-medium text-slate-700">Months</p>
              <button type="button" className="text-xs sm:text-[11px] text-brand-600" onClick={() => setMonthKeys([...deck.periods])}>Select all</button>
              <button type="button" className="text-xs sm:text-[11px] text-slate-500" onClick={() => setMonthKeys([])}>Clear</button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {deck.periods.map((k) => <button key={k} type="button" className={chip(monthKeys.includes(k))} onClick={() => setMonthKeys(toggle(monthKeys, k))}>{monthLabel(k)}</button>)}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
