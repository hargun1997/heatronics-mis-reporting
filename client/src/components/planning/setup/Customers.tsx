// Setup → D2C customers & seasonality (docs/planning/ONE-SETUP.md §2.4): the customer model's inputs (mode, the
// learned cohort rates and AOVs, the Shopify history refresh), D2C discounts, and the seasonality heatmap editor.
// The "Plan by year" table, the base check and the history chart are output views (outputs/ProductsCustomers.tsx).

import { useEffect, useMemo, useState } from 'react';
import type { D2CModel } from '../../../data/planning/engine';
import {
  MON, SEASON_ORDER, applyStoredHistory, avgYear, isNewerHistory, learnFromStored, peakMonth, resetSkuSeason, resetToLearned,
  seasonEdit, seasonRows, seasonTint, setD2CField, setDiscountPct, setSeason, summary, top3Share, applyShopifyDiscount,
  type HistoryJob, type StoredHistory,
} from '../../../data/planning/setup/customers';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { int, pct } from '../fmt';
import { NumInput } from '../inputs';
import { Flag, Note, Row, SubHead, btn, ensureFx } from './shared';
import type { SetupSectionDef, SetupSectionProps } from './types';

export { summary };

const ghost = 'rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800';
type HistoryAnswer = { history: StoredHistory | null; job: HistoryJob };

export function Section({ plan, update, result }: SetupSectionProps) {
  const d = plan.d2c;
  // Local copy of planMode (data/planning/setup/mode.ts belongs to the Starting point agent): sheet parity ignores plan.fx.
  const parity = !plan.fx || plan.fx.sheetParity;
  const disc = plan.fx?.d2cDiscount;

  // ---- Shopify history (the MIS's own refresh; aggregates only) ----
  const [stored, setStored] = useState<StoredHistory | null>(null);
  const [job, setJob] = useState<HistoryJob>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/planning/history').then((x) => x.json()).then((j: HistoryAnswer) => { setStored(j.history); setJob(j.job); }).catch(() => {});
  }, []);

  // keep polling while a refresh runs (also after a page reload)
  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = window.setInterval(() => {
      fetch('/api/planning/history').then((x) => x.json()).then((j: HistoryAnswer) => {
        setJob(j.job); if (j.job?.status !== 'running') setStored(j.history);
      }).catch(() => {});
    }, 4000);
    return () => window.clearInterval(t);
  }, [job?.status]);

  const refresh = async () => {
    setErr('');
    setJob({ status: 'running', startedAt: new Date().toISOString() });
    try {
      const res = await fetch('/api/planning/history/refresh', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Refresh failed (${res.status})`);
      setJob(j.job); if (j.history) setStored(j.history);
    } catch (e) { setErr((e as Error).message); setJob(null); }
  };

  const learned = useMemo(() => (stored ? learnFromStored(stored) : null), [stored]);
  const newer = isNewerHistory(stored, d);
  const set = <K extends keyof D2CModel>(k: K, v: D2CModel[K]) => update((p) => setD2CField(p, k, v));

  const cohortsOn = d.mode === 'cohorts';
  const lastFy = result.years[result.years.length - 1];
  const rows = seasonRows(plan);

  return (
    <div className="space-y-5">
      {/* ---- D2C customers ---- */}
      <div className="space-y-2.5">
        <SubHead>D2C customers</SubHead>
        <Note>D2C revenue = new buyers × AOV + repeat orders from everyone who bought before. In the sheet's months, new buyers are back-solved from its D2C revenue; from FY29 they grow with the D2C growth lever and repeats build on top.</Note>
        <Row label="Model" hint="Customers: new buyers × AOV + repeats by cohort. Units: the sheet's unit grid as typed.">
          <SegmentedControl size="sm" value={d.mode} onChange={(v) => update((p) => { p.d2c.mode = v; })}
            options={[{ id: 'cohorts', label: 'Customers' }, { id: 'units', label: 'Units' }]} aria-label="D2C model" />
        </Row>

        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          <div className="min-w-0 flex-1">
            <div><b className="text-slate-800">Learned from:</b> {d.source} · as of {d.asOf}{d.fit.r2 != null && <> · fits history at R² {d.fit.r2.toFixed(2)}</>}</div>
            <div className="mt-0.5 text-slate-500">{d.fit.note}</div>
            {stored && (
              <div className="mt-1 text-slate-500">
                Last Shopify refresh: {int(stored.orders)} orders, {int(stored.customers)} buyers, as of {stored.asOf}
                {stored.skipped.outlier > 0 && ` · ${stored.skipped.outlier} order(s) over ₹2 lakh skipped`}
              </div>
            )}
            {err && <div className="mt-1 text-rose-600">{err}</div>}
            {job?.status === 'failed' && <div className="mt-1 text-rose-600">Refresh failed: {job.error}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {newer && stored && learned && (
              <button type="button" onClick={() => update((p) => applyStoredHistory(p, stored, learned))} className={btn}>
                Use Shopify cohorts ({stored.asOf})
              </button>
            )}
            <button type="button" onClick={refresh} disabled={job?.status === 'running'} className={btn}>
              {job?.status === 'running' ? 'Reading Shopify orders…' : 'Refresh from Shopify orders'}
            </button>
            <button type="button" onClick={() => update((p) => resetToLearned(p, stored))} className={ghost}>Reset to learned</button>
          </div>
        </div>

        <div className={`grid gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 ${cohortsOn ? '' : 'pointer-events-none opacity-50'}`}>
          <Row label="Same-month 2nd order" hint="Share of new buyers who order again that month (× season: higher in winter)">
            <NumInput unit="pct" value={d.sameMonth} min={0} max={1} width="w-16" title="Same-month repeat" disabled={!cohortsOn} onChange={(v) => set('sameMonth', v)} />
          </Row>
          <Row label="Next-month reorder" hint="Share reordering the month after">
            <NumInput unit="pct" value={d.nextMonth} min={0} max={1} width="w-16" title="Next-month repeat" disabled={!cohortsOn} onChange={(v) => set('nextMonth', v)} />
          </Row>
          <Row label="Months 2–11, per month" hint={`≈ ${pct(avgYear(d.monthly), 1)} of buyers over that year`}>
            <NumInput unit="pct" value={d.monthly} min={0} max={0.2} width="w-16" title="Monthly repeat 2-11" disabled={!cohortsOn} onChange={(v) => set('monthly', v)} />
          </Row>
          <Row label="Year 2+, per month" hint={`Winter re-buys, replacements. ≈ ${pct(avgYear(d.yearly), 1)} a year, fading each year`}>
            <NumInput unit="pct" value={d.yearly} min={0} max={0.2} width="w-16" title="Yearly repeat" disabled={!cohortsOn} onChange={(v) => set('yearly', v)} />
          </Row>
          <Row label="Yearly fade" hint="Year-3 rate = year-2 × this, and so on">
            <NumInput unit="x" value={d.yearlyFade} min={0} max={1.5} step={0.05} width="w-16" title="Yearly fade" disabled={!cohortsOn} onChange={(v) => set('yearlyFade', v)} />
          </Row>
          <Row label="Repeat boost" hint="Scales every repeat rate: loyalty (hCoins), reminders, bundles. 1× = as learned">
            <NumInput unit="x" value={d.repeatBoost} min={0} max={5} step={0.1} width="w-16" title="Repeat boost" disabled={!cohortsOn} onChange={(v) => update((p) => { p.d2c.repeatBoost = v; })} />
          </Row>
          <Row label="AOV: new buyers" hint="At order time, before returns (sheet basis). Grows with the price lever.">
            <NumInput value={d.aovNew} min={0} width="w-24" title="AOV new" disabled={!cohortsOn} onChange={(v) => set('aovNew', v)} />
          </Row>
          <Row label="AOV: repeat orders">
            <NumInput value={d.aovRepeat} min={0} width="w-24" title="AOV repeat" disabled={!cohortsOn} onChange={(v) => set('aovRepeat', v)} />
          </Row>
        </div>
        {cohortsOn && lastFy && (
          <Note>
            {lastFy.fy}: ~{int(lastFy.d2cNewCustomers / (lastFy.months || 1))} new buyers a month · repeats {pct(lastFy.d2cRepeatRevenue / ((lastFy.d2cNewRevenue + lastFy.d2cRepeatRevenue) || 1), 0)} of D2C ₹ (detail under Products &amp; customers).
          </Note>
        )}
      </div>

      {/* ---- D2C discounts & coupons (plan.fx.d2cDiscount) ---- */}
      <div className="space-y-2.5">
        <SubHead>D2C discounts &amp; coupons</SubHead>
        <div className={parity ? 'opacity-50' : ''}>
          <Row label={<>Discounts as % of D2C list revenue{disc?.source === 'placeholder' && <Flag>Placeholder</Flag>}</>}
            hint={`Taken off list revenue; AOV is grossed up so they are not counted twice.${d.discountPct != null ? ` Shopify says ${pct(d.discountPct)}.` : ''}`}>
            <input type="checkbox" aria-label="D2C discounts on" checked={disc?.on ?? false} disabled={parity}
              onChange={(e) => update((p) => { ensureFx(p).d2cDiscount.on = e.target.checked; })} className="h-4 w-4 accent-brand-600" />
            <NumInput unit="pct" value={disc?.pct ?? 0} min={0} max={0.5} width="w-14" title="D2C discount %" disabled={parity}
              onChange={(x) => update((p) => setDiscountPct(ensureFx(p), x))} />
            {d.discountPct != null && (
              <button type="button" disabled={parity} onClick={() => update((p) => { ensureFx(p); applyShopifyDiscount(p); })}
                className="text-xs sm:text-[11px] font-semibold text-brand-700 hover:underline disabled:no-underline">Use Shopify's</button>
            )}
          </Row>
        </div>
        {parity && <Note>Sheet parity: discounts are not in the numbers (Starting point → My plan).</Note>}
        {!parity && disc && disc.source !== 'placeholder' && <Note>{disc.source === 'shopify' ? `From Shopify total_discounts${disc.asOf ? `, as of ${disc.asOf}` : ''}.` : 'Typed in.'}</Note>}
      </div>

      {/* ---- Seasonality ---- */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubHead>Seasonality</SubHead>
          <button type="button" onClick={() => update((p) => resetSkuSeason(p))} className={ghost} title="Every product's curve back to last year's actual units (the sheet)">Reset products</button>
        </div>
        <Note>Each month's share of a normal month (1.0 = average). Products: last year's actual units, all channels (Oct-25 → Sep-26, from the sheet). D2C: new buyers on Shopify. Click a cell to change it. Which shape FY29+ follows is set under Assumptions.</Note>
        <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
          <table className="text-[12px] tabular-nums">
            <thead>
              <tr className="text-xs sm:text-[11px] text-slate-500">
                <th className="pr-3 text-left font-semibold">Product</th>
                {SEASON_ORDER.map((i) => <th key={i} className="w-12 px-0.5 text-center font-semibold">{MON[i]}</th>)}
                <th className="pl-3 text-right font-semibold">Peak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const peak = peakMonth(row.v);
                const top3 = top3Share(row.v);
                return (
                  <tr key={row.id} className={row.kind === 'd2c' ? 'border-t-2 border-slate-200' : ''}>
                    <td className="whitespace-nowrap py-0.5 pr-3 text-slate-700">{row.name}</td>
                    {SEASON_ORDER.map((i) => {
                      const v = row.v[i] ?? 1;
                      return (
                        <td key={i} className="relative px-0.5 py-0.5">
                          <span aria-hidden="true" className="pointer-events-none absolute inset-0.5 rounded bg-brand-600" style={{ opacity: seasonTint(v) }} />
                          <input
                            type="number" step="0.1" min="0" aria-label={`${row.name} ${MON[i]}`}
                            defaultValue={v.toFixed(2)} key={v.toFixed(3)}
                            onBlur={(e) => { const x = seasonEdit(e.target.value, v); if (x != null) update((p) => setSeason(p, row, i, x)); }}
                            className={`relative w-12 rounded border-0 bg-transparent px-1 py-1 text-center text-xs sm:text-[11.5px] font-semibold outline-none focus:ring-2 focus:ring-brand-300 ${v > 2 ? 'text-white' : 'text-slate-900'}`}
                          />
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap pl-3 text-right text-slate-500" title="Share of the year's volume in the top 3 months">{MON[peak]} · top-3 {pct(top3, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Note>Products with little history (hGo, hBoots, hPulse) borrow the whole range's curve. Values don't need to average 1: the planner uses them as typed. New products pick the curve they follow under Products &amp; categories.</Note>
      </div>
    </div>
  );
}

export const SECTION: SetupSectionDef = {
  id: 'customers',
  title: 'D2C customers & seasonality',
  blurb: 'New buyers × AOV + repeats by cohort (learned from Shopify), discounts, and each product\'s month-by-month shape.',
  Section,
  summary,
};
