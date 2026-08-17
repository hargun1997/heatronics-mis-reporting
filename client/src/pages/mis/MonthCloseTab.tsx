import { useMemo, useState } from 'react';
import { SectionCard } from '../../components/ui/Card';
import { inr, pctStr } from '../../components/mis-deck/charts';
import { seriesFor, type PeriodMIS } from '../../data/misDeck/analytics';

// ----------------------------------------------------------------------------
// Month Close — intake + consolidation to a full monthly P&L, plus forward ARR.
//
// Everything platform-sourced closes the month to CM2; the rest (opex → net
// income) comes from Tally. Enter costs as POSITIVE magnitudes — the cascade
// subtracts them. Nothing is persisted; use "Copy P&L column" to paste the
// finalised month into the MIS workbook.
// ----------------------------------------------------------------------------

type Sign = 'rev' | 'cost';
interface Line { key: string; label: string; source: string; sign: Sign; hint?: string }
interface Group { title: string; blurb: string; lines: Line[] }

const GROUPS: Group[] = [
  {
    title: '1 · Revenue by channel',
    blurb: 'Net sales (after returns) per channel.',
    lines: [
      { key: 'rev_amazon', label: 'Amazon net sales', source: 'Amazon Seller Central → Payments summary / Sales per SKU', sign: 'rev' },
      { key: 'rev_d2c', label: 'D2C / Shopify net sales', source: 'Shopify → Analytics → Sales by product (Net sales)', sign: 'rev' },
      { key: 'rev_blinkit', label: 'Blinkit net sales', source: 'Blinkit seller panel → Settlement summary (sales)', sign: 'rev' },
      { key: 'rev_offline', label: 'Offline net sales', source: 'Tally / sales register', sign: 'rev' },
      { key: 'rev_oem', label: 'OEM net sales', source: 'Tally / sales register', sign: 'rev' },
    ],
  },
  {
    title: '2 · COGM (cost of goods + factory)',
    blurb: 'Real product cost + factory/conversion. Factory defaults to 10% of net revenue if left blank.',
    lines: [
      { key: 'cogs', label: 'COGS (product cost)', source: 'Tranzact inventory value / cost sheet (units × unit cost)', sign: 'cost' },
      { key: 'factory', label: 'Factory / conversion cost', source: 'Tally (or leave blank = 10% of net revenue)', sign: 'cost', hint: 'blank → 10% of net revenue' },
    ],
  },
  {
    title: '3 · Channel & Fulfilment → CM1',
    blurb: 'Marketplace fees, shipping and payment/checkout costs per channel.',
    lines: [
      { key: 'cf_amazon', label: 'Amazon fees (referral + FBA)', source: 'Amazon Payments summary', sign: 'cost' },
      { key: 'cf_d2c', label: 'D2C fulfilment (Shiprocket + Shopflo + gateway)', source: 'Shiprocket / Shopflo / gateway invoices', sign: 'cost' },
      { key: 'cf_blinkit', label: 'Blinkit fulfilment', source: 'Blinkit settlement (fulfilment + taxes)', sign: 'cost' },
    ],
  },
  {
    title: '4 · Sales & Marketing → CM2',
    blurb: 'Ad spend per platform. Use the same figures the ad exports total to.',
    lines: [
      { key: 'ad_meta', label: 'Meta ads (D2C)', source: 'Meta Ads → spend by campaign (full export)', sign: 'cost' },
      { key: 'ad_google', label: 'Google ads (D2C)', source: 'Google Ads → spend by campaign (all types)', sign: 'cost' },
      { key: 'ad_amazon', label: 'Amazon ads', source: 'Amazon Ads console → Total cost', sign: 'cost' },
      { key: 'ad_blinkit', label: 'Blinkit ads', source: 'Blinkit settlement (ads)', sign: 'cost' },
      { key: 'ad_other', label: 'Other / brand marketing', source: 'Tally', sign: 'cost' },
    ],
  },
  {
    title: '5 · Below CM2 — from Tally',
    blurb: 'Platform/other, opex and below-the-line. Screenshots from Tally are fine — just key the totals.',
    lines: [
      { key: 'platform', label: 'Platform / other operating costs', source: 'Tally', sign: 'cost' },
      { key: 'op_rent', label: 'Rent & utilities', source: 'Tally', sign: 'cost' },
      { key: 'op_salary', label: 'Salary cost', source: 'Tally', sign: 'cost' },
      { key: 'op_corp', label: 'Corporate overheads', source: 'Tally', sign: 'cost' },
      { key: 'op_fx', label: 'Foreign exchange (if any)', source: 'Tally', sign: 'cost' },
      { key: 'op_damaged', label: 'Damaged goods written off', source: 'Tally', sign: 'cost' },
      { key: 'op_baddebt', label: 'Bad debts written off', source: 'Tally', sign: 'cost' },
      { key: 'bl_da', label: 'Depreciation & amortisation', source: 'Tally', sign: 'cost' },
      { key: 'bl_onetime', label: 'One-time expenses', source: 'Tally', sign: 'cost' },
      { key: 'bl_intinc', label: 'Interest income', source: 'Tally', sign: 'rev' },
      { key: 'bl_intexp', label: 'Interest expense', source: 'Tally', sign: 'cost' },
      { key: 'bl_tax', label: 'Taxes', source: 'Tally', sign: 'cost' },
    ],
  },
];

const FACTORY_RATE = 0.10;

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(/[, ₹]/g, ''));
  return isFinite(n) ? n : 0;
}

// ---- Forward ARR: last-6-month blended (YoY + annualised MoM), projected 12m ----
function monthKeyStep(sortKey: number, steps: number): number {
  // sortKey = year*100 + month
  let y = Math.floor(sortKey / 100);
  let m = sortKey % 100 + steps;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return y * 100 + m;
}

interface ArrResult {
  ttm: number; momAnnual: number; yoy: number | null; blended: number;
  forwardArr: number; proj: { key: number; val: number }[];
  latestLabel: string;
}

function computeArr(months: PeriodMIS[]): ArrResult | null {
  const pts = months
    .map((m) => ({ key: m.sortKey, v: Math.max(0, m.netRevenue), label: m.label }))
    .sort((a, b) => a.key - b.key);
  if (pts.length < 7) return null;
  const bySort = new Map(pts.map((p) => [p.key, p.v]));

  // Annualised MoM: geometric mean of the last 6 month-over-month ratios.
  const momPts = pts.slice(-7);
  const ratios: number[] = [];
  for (let i = 1; i < momPts.length; i++) if (momPts[i - 1].v > 0) ratios.push(momPts[i].v / momPts[i - 1].v);
  const momGeo = ratios.length ? Math.pow(ratios.reduce((a, b) => a * b, 1), 1 / ratios.length) : 1;
  const momAnnual = Math.pow(momGeo, 12) - 1;

  // YoY: average of the last 6 same-month-last-year ratios (needs ≥18 months).
  const last6 = pts.slice(-6);
  const yoyRatios: number[] = [];
  for (const p of last6) { const prev = bySort.get(p.key - 100); if (prev && prev > 0) yoyRatios.push(p.v / prev); }
  const yoy = yoyRatios.length ? yoyRatios.reduce((a, b) => a + b, 0) / yoyRatios.length - 1 : null;

  const blended = yoy !== null ? (momAnnual + yoy) / 2 : momAnnual;

  // Project next 12 months: same-month-last-year × (1 + blended) to keep seasonality;
  // fall back to compounding the latest month where no prior-year month exists.
  const lastKey = pts[pts.length - 1].key;
  const lastV = pts[pts.length - 1].v;
  const gMonthly = Math.pow(1 + blended, 1 / 12) - 1;
  let forwardArr = 0; const proj: { key: number; val: number }[] = [];
  for (let i = 1; i <= 12; i++) {
    const k = monthKeyStep(lastKey, i);
    const base = bySort.get(monthKeyStep(k, -12));
    const val = base !== undefined ? base * (1 + blended) : lastV * Math.pow(1 + gMonthly, i);
    forwardArr += val; proj.push({ key: k, val });
  }
  const ttm = pts.slice(-12).reduce((s, p) => s + p.v, 0);
  return { ttm, momAnnual, yoy, blended, forwardArr, proj, latestLabel: pts[pts.length - 1].label };
}

function keyLabel(k: number): string {
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MO[(k % 100) - 1]} '${String(Math.floor(k / 100) % 100).padStart(2, '0')}`;
}

export function MonthCloseTab() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [monthLabel, setMonthLabel] = useState('');
  const [copied, setCopied] = useState(false);
  const set = (k: string, v: string) => { setVals((s) => ({ ...s, [k]: v })); setCopied(false); };

  const c = useMemo(() => {
    const g = (k: string) => num(vals[k]);
    const netRevenue = g('rev_amazon') + g('rev_d2c') + g('rev_blinkit') + g('rev_offline') + g('rev_oem');
    const factory = vals['factory'] ? g('factory') : netRevenue * FACTORY_RATE;
    const cogm = g('cogs') + factory;
    const grossMargin = netRevenue - cogm;
    const cf = g('cf_amazon') + g('cf_d2c') + g('cf_blinkit');
    const cm1 = grossMargin - cf;
    const sm = g('ad_meta') + g('ad_google') + g('ad_amazon') + g('ad_blinkit') + g('ad_other');
    const cm2 = cm1 - sm;
    const platform = g('platform');
    const cm3 = cm2 - platform;
    const opex = g('op_rent') + g('op_salary') + g('op_corp') + g('op_fx') + g('op_damaged') + g('op_baddebt');
    const ebitda = cm3 - opex;
    const belowLine = g('bl_da') + g('bl_onetime') - g('bl_intinc') + g('bl_intexp');
    const pbt = ebitda - belowLine;
    const netIncome = pbt - g('bl_tax');
    return { netRevenue, factory, cogm, grossMargin, cf, cm1, sm, cm2, platform, cm3, opex, ebitda, pbt, netIncome };
  }, [vals]);

  const arr = useMemo(() => computeArr(seriesFor('month')), []);

  const pct = (v: number) => (c.netRevenue > 0 ? pctStr(v / c.netRevenue) : '—');
  const anyInput = c.netRevenue !== 0 || Object.values(vals).some((v) => v);

  const cascade: { label: string; value: number; kind: 'rev' | 'sub' | 'margin' | 'cost'; pctOf?: boolean }[] = [
    { label: 'Net Revenue', value: c.netRevenue, kind: 'rev' },
    { label: 'Less: COGM', value: -c.cogm, kind: 'cost' },
    { label: 'Gross Margin', value: c.grossMargin, kind: 'margin', pctOf: true },
    { label: 'Less: Channel & Fulfilment', value: -c.cf, kind: 'cost' },
    { label: 'CM1', value: c.cm1, kind: 'sub', pctOf: true },
    { label: 'Less: Sales & Marketing', value: -c.sm, kind: 'cost' },
    { label: 'CM2', value: c.cm2, kind: 'margin', pctOf: true },
    { label: 'Less: Platform / other', value: -c.platform, kind: 'cost' },
    { label: 'CM3', value: c.cm3, kind: 'sub', pctOf: true },
    { label: 'Less: Operating expenses', value: -c.opex, kind: 'cost' },
    { label: 'EBITDA', value: c.ebitda, kind: 'margin', pctOf: true },
    { label: 'Less: D&A / one-time / interest', value: -(c.ebitda - c.pbt), kind: 'cost' },
    { label: 'PBT', value: c.pbt, kind: 'sub', pctOf: true },
    { label: 'Less: Taxes', value: -(c.pbt - c.netIncome), kind: 'cost' },
    { label: 'Net Income', value: c.netIncome, kind: 'margin', pctOf: true },
  ];

  const copyColumn = () => {
    const rows = [
      ['Month', monthLabel || '—'],
      ['Net Revenue', c.netRevenue],
      ['COGM', -c.cogm], ['Gross Margin', c.grossMargin],
      ['Channel & Fulfilment', -c.cf], ['CM1', c.cm1],
      ['Sales & Marketing', -c.sm], ['CM2', c.cm2],
      ['Platform / other', -c.platform], ['CM3', c.cm3],
      ['Operating expenses', -c.opex], ['EBITDA', c.ebitda],
      ['D&A / one-time / interest', -(c.ebitda - c.pbt)], ['PBT', c.pbt],
      ['Taxes', -(c.pbt - c.netIncome)], ['Net Income', c.netIncome],
    ];
    const tsv = rows.map((r) => r.join('\t')).join('\n');
    navigator.clipboard?.writeText(tsv).then(() => { setCopied(true); }).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Month Close</h2>
          <p className="text-xs text-slate-400">Enter each platform's numbers + Tally lines → a complete monthly P&amp;L. Costs as positive amounts; the cascade subtracts them.</p>
        </div>
        <input
          value={monthLabel}
          onChange={(e) => { setMonthLabel(e.target.value); setCopied(false); }}
          placeholder="Month e.g. Aug 2026"
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <div className="lg:col-span-2 space-y-4">
          {GROUPS.map((grp) => (
            <SectionCard key={grp.title} title={grp.title} description={grp.blurb}>
              <div className="space-y-1.5">
                {grp.lines.map((ln) => (
                  <div key={ln.key} className="flex items-center gap-3 py-1 border-b border-slate-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700">{ln.label}</div>
                      <div className="text-[10px] text-slate-400 truncate">{ln.source}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-xs ${ln.sign === 'cost' ? 'text-rose-400' : 'text-slate-300'}`}>{ln.sign === 'cost' ? '−' : '+'}</span>
                      <input
                        inputMode="decimal"
                        value={vals[ln.key] ?? ''}
                        onChange={(e) => set(ln.key, e.target.value)}
                        placeholder={ln.hint ?? '0'}
                        className="w-32 px-2 py-1 text-sm text-right rounded border border-slate-200 bg-white text-slate-700 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-200"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>

        {/* Live P&L + ARR */}
        <div className="space-y-4">
          <SectionCard
            title={`P&L · ${monthLabel || 'this month'}`}
            description="Live as you type."
            actions={
              <button
                onClick={copyColumn}
                disabled={!anyInput}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200 disabled:opacity-40 hover:bg-brand-100"
              >
                {copied ? 'Copied ✓' : 'Copy P&L column'}
              </button>
            }
          >
            <table className="w-full text-sm">
              <tbody>
                {cascade.map((r) => {
                  const strong = r.kind === 'margin' || r.kind === 'rev';
                  return (
                    <tr key={r.label} className={`border-b border-slate-50 ${strong ? 'font-semibold text-slate-800' : r.kind === 'sub' ? 'font-medium text-slate-700' : 'text-slate-500'}`}>
                      <td className="py-1.5 pr-2">{r.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{inr(r.value)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums text-[11px] text-slate-400 w-12">{r.pctOf ? pct(r.value) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SectionCard>

          {arr && (
            <SectionCard title="Forward ARR" description="Last-6-month blended growth, projected 12 months.">
              <div className="space-y-2 text-sm">
                <Row label="TTM net revenue" value={inr(arr.ttm)} />
                <Row label="MoM growth (annualised)" value={pctStr(arr.momAnnual)} />
                <Row label="YoY growth (last 6 mo avg)" value={arr.yoy !== null ? pctStr(arr.yoy) : '—'} />
                <Row label="Blended growth" value={pctStr(arr.blended)} strong />
                <div className="pt-2 mt-1 border-t border-slate-100">
                  <div className="text-[11px] text-slate-400">Projected next-12-month revenue (ARR)</div>
                  <div className="text-2xl font-semibold text-brand-700 tabular-nums">{inr(arr.forwardArr)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">From {keyLabel(arr.proj[0].key)} → {keyLabel(arr.proj[11].key)}, seasonality via same-month-last-year × (1 + blended).</div>
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-slate-600">
        <span className="font-medium text-emerald-700">How it fits together.</span> Platforms (Amazon, Shopify, Blinkit) plus the ad
        exports close the month down to <span className="font-medium">CM2</span>; COGM comes from your Tranzact inventory value / cost
        sheet; everything below CM2 (platform, opex, D&amp;A, interest, tax) is keyed from Tally. When the P&amp;L looks right, hit
        <span className="font-medium"> Copy P&amp;L column</span> and paste it as the new month in the MIS workbook. The Forward ARR
        panel is computed from the deck's own monthly history, so it updates once the new month is in.
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'font-medium text-slate-700' : 'text-slate-500'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{value}</span>
    </div>
  );
}
