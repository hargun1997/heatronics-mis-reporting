// Live MIS → P&L → Marketing efficiency: MER and CAC per period. Campaign, ad set and creative detail is in Ops
// (founder, 25 Nov 2026: one place for each number), so each ad platform links there.
import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../ui/DataTable';
import { Note } from './shared';
import { inrShort } from '../../utils/money';
import type { PeriodAgg } from '../../data/misDeck/liveAnalytics';
import { efficiencyCols, newBuyersMap, OPS_AD_LINKS, type EfficiencyCol } from '../../data/misDeck/marketingEfficiency';

type HistoryAnswer = { history: { asOf?: string; history?: { month: string; newCustomers: number }[] } | null };

interface MetricRow { key: string; label: string; strong?: boolean; value: (c: EfficiencyCol) => string }

const times = (v: number | null) => (v == null ? 'No data' : `${v.toFixed(1)}×`);
const inr = (v: number | null) => (v == null ? 'No data' : inrShort(v));
const count = (v: number | null) => (v == null ? 'No data' : Math.round(v).toLocaleString('en-IN'));

const ROWS: MetricRow[] = [
  { key: 'mer', label: 'MER (net sales ÷ marketing)', strong: true, value: (c) => times(c.mer) },
  { key: 'mkt', label: 'Marketing (all)', value: (c) => inr(c.marketing) },
  { key: 'dmer', label: 'Website MER (website sales ÷ Google + Meta)', value: (c) => times(c.d2cMer) },
  { key: 'd2cads', label: 'Google + Meta spend', value: (c) => inr(c.d2cAds) },
  { key: 'cac', label: 'CAC (Google + Meta ÷ new buyers)', strong: true, value: (c) => inr(c.cac) },
  { key: 'new', label: 'New website buyers', value: (c) => count(c.newBuyers) },
];

export function MarketingEfficiency({ periods }: { periods: PeriodAgg[] }) {
  const [hist, setHist] = useState<HistoryAnswer['history'] | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch('/api/planning/history').then((r) => (r.ok ? r.json() : null)).then((j: HistoryAnswer | null) => { if (live) setHist(j?.history ?? null); }).catch(() => { if (live) setHist(null); });
    return () => { live = false; };
  }, []);
  const cols = useMemo(() => efficiencyCols(periods, newBuyersMap(hist ?? null)), [periods, hist]);
  const columns: Column<MetricRow>[] = [
    { key: 'label', label: 'Measure', main: true, cell: (r) => <span className={r.strong ? 'font-semibold text-slate-900' : ''}>{r.label}</span> },
    ...cols.map((c) => ({ key: c.key, label: c.label, num: true, cell: (r: MetricRow) => r.value(c) })),
  ];
  const platforms = Object.entries(OPS_AD_LINKS);
  return (
    <div className="space-y-3">
      <DataTable label="Marketing efficiency" columns={columns} rows={ROWS} rowKey={(r) => r.key} limit={0} minWidth={Math.max(560, 260 + cols.length * 96)} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-slate-600">
        <span>Ad detail by campaign and creative is in Ops:</span>
        {platforms.map(([name, href]) => (
          <a key={name} href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 sm:min-h-0 items-center font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">{name.replace(/ \(.*\)$/, '')}</a>
        ))}
        <Note compact label="How these are counted">
          <p>MER = net sales ÷ all marketing booked in Tally (Sales and marketing).</p>
          <p className="mt-2">Website MER and CAC use Google and Meta spend only. Months before the live reports have no split, so they show No data.</p>
          <p className="mt-2">New buyers = first orders on the website from the Shopify history{hist?.asOf ? ` (taken ${hist.asOf.slice(0, 10)})` : ''}. The month the history was taken in is not counted. Refresh it in 5-year plan → Setup → D2C customers.</p>
        </Note>
      </div>
    </div>
  );
}
