// ----------------------------------------------------------------------------
// Live MIS export modals — Excel (the legacy deck's sheet pick-list + options,
// plus the Live-only extras) and PDF (section + period picker, as the retired
// MIS-tracking export had).
// ----------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { Modal } from '../ui';
import type { LiveDeckData } from '../../data/misDeck/liveDeck';
import { aggregatePeriods, type Granularity } from '../../data/misDeck/liveAnalytics';
import { exportLiveMis, liveSheetCount, LIVE_EXPORT_EVERYTHING, type LiveExportOptions } from '../../utils/liveMisExport';
import { downloadLivePdf, type PdfSection } from '../../utils/liveMisPdf';

type SheetKey = Exclude<keyof LiveExportOptions, 'granularities' | 'blendCogm' | 'mergeChannels'>;
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
];
const GRANS: { id: Granularity; label: string }[] = [
  { id: 'month', label: 'Monthly P&L' }, { id: 'quarter', label: 'Quarterly P&L' }, { id: 'year', label: 'FY P&L' },
];

const chip = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs border transition-colors ${on ? 'bg-brand-50 text-brand-700 border-brand-200 font-medium' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`;
const btnPrimary = 'px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-40';
const btnGhost = 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800';

export function LiveExcelModal({ deck, open, onClose, blended, merged }: {
  deck: LiveDeckData; open: boolean; onClose: () => void; blended: boolean; merged: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [o, setO] = useState<LiveExportOptions>(() => ({ ...LIVE_EXPORT_EVERYTHING, blendCogm: blended, mergeChannels: merged }));
  const n = liveSheetCount(o);
  const run = async (opts: LiveExportOptions) => {
    setBusy(true);
    try { await exportLiveMis(deck, opts); setTimeout(onClose, 300); }
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
        <button type="button" disabled={busy} onClick={() => void run({ ...LIVE_EXPORT_EVERYTHING, blendCogm: o.blendCogm, mergeChannels: o.mergeChannels })}
          className="w-full text-left rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-4 py-3 disabled:opacity-60">
          <span className="block font-semibold">Export Everything</span>
          <span className="block text-xs text-white/80">Every month, quarter and FY, channel P&amp;L, SKU × channel, orders, repeats, discounts, COGM / OpEx detail, marketing, units and SKU cells</span>
        </button>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-slate-400"><div className="flex-1 h-px bg-slate-200" />or pick what you want<div className="flex-1 h-px bg-slate-200" /></div>
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
            <input type="checkbox" className="mt-1" checked={o.blendCogm} onChange={() => setO({ ...o, blendCogm: !o.blendCogm })} />
            <span><span className="font-medium text-slate-800">Blend COGM to FY rate</span>
              <span className="block text-xs text-slate-500">Smooths month-to-month COGM booking noise on the P&amp;L sheets; full FYs unchanged. COGM Detail stays actual.</span></span>
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
];

export function LivePdfModal({ deck, open, onClose, blended, merged }: {
  deck: LiveDeckData; open: boolean; onClose: () => void; blended: boolean; merged: boolean;
}) {
  const years = useMemo(() => aggregatePeriods(deck.months, deck.completeness, 'year'), [deck]);
  const [sections, setSections] = useState<PdfSection[]>(['trends', 'fyPnl']);
  const [fyKeys, setFyKeys] = useState<string[]>(() => years.slice(-1).map((y) => y.key));
  const [monthKeys, setMonthKeys] = useState<string[]>(() => deck.periods.slice(-1));
  const [busy, setBusy] = useState(false);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const run = () => {
    setBusy(true);
    try { downloadLivePdf(deck, { sections, fyKeys, monthKeys, blendCogm: blended, mergeChannels: merged }); setTimeout(onClose, 300); }
    catch (e) { console.error('PDF export failed', e); alert('Failed to build the PDF. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} width={600} title="Export PDF" subtitle="A printable report built from the Live MIS"
      footer={<>
        <span className="mr-auto text-xs text-slate-500">{blended ? 'Blended' : 'Actual'} COGM · {merged ? 'continuous' : 'as-booked'} channels</span>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="button" disabled={busy || sections.length === 0} onClick={run} className={btnPrimary}>{busy ? 'Building…' : 'Download PDF'}</button>
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
              <button type="button" className="text-[11px] text-brand-600" onClick={() => setMonthKeys([...deck.periods])}>Select all</button>
              <button type="button" className="text-[11px] text-slate-500" onClick={() => setMonthKeys([])}>Clear</button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {deck.periods.map((k) => <button key={k} type="button" className={chip(monthKeys.includes(k))} onClick={() => setMonthKeys(toggle(monthKeys, k))}>{k}</button>)}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
