// Plain SVG charts for the planner: revenue by channel per FY, and the monthly cash curve.

import type { ReactElement } from 'react';
import { CHANNELS, CHANNEL_NAMES, type PlanResult } from '../../data/planning/engine';
import { CH_COLOR, cr } from './fmt';

export function RevenueBars({ r, compare }: { r: PlanResult; compare?: PlanResult | null }) {
  const W = 640, H = 240, padL = 40, padB = 28, padT = 26;
  const years = r.years;
  const max = Math.max(1, ...years.map((y) => y.revenueWithActuals), ...(compare?.years.map((y) => y.revenueWithActuals) ?? [])) / 1e7;
  const nice = Math.ceil(max / 20) * 20 || 20;
  const bw = (W - padL - 10) / years.length;
  const yOf = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Revenue by channel per financial year">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 6} y1={yOf(nice * t)} y2={yOf(nice * t)} stroke="#e2e8f0" />
            <text x={padL - 6} y={yOf(nice * t) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round(nice * t)}</text>
          </g>
        ))}
        {years.map((y, i) => {
          const x = padL + i * bw + bw * 0.2, w = bw * 0.6;
          let acc = (y.revenueWithActuals - y.revenue) / 1e7; // FY27 H1 actuals at the bottom, grey
          const segs: ReactElement[] = [];
          if (acc > 0) segs.push(<rect key="act" x={x} width={w} y={yOf(acc)} height={yOf(0) - yOf(acc)} fill="#cbd5e1"><title>Apr–Sep actuals ₹{acc.toFixed(2)} Cr</title></rect>);
          for (const ch of CHANNELS) {
            const v = y.revenueByChannel[ch] / 1e7;
            if (v <= 0) continue;
            segs.push(<rect key={ch} x={x} width={w} y={yOf(acc + v)} height={yOf(acc) - yOf(acc + v)} fill={CH_COLOR[ch]}><title>{CHANNEL_NAMES[ch]} ₹{v.toFixed(2)} Cr</title></rect>);
            acc += v;
          }
          if (y.storeRevenue > 0) {
            const v = y.storeRevenue / 1e7;
            segs.push(<rect key="stores" x={x} width={w} y={yOf(acc + v)} height={yOf(acc) - yOf(acc + v)} className="text-slate-500" fill="currentColor"><title>Own stores ₹{v.toFixed(2)} Cr</title></rect>);
            acc += v;
          }
          const cmp = compare?.years.find((c) => c.fy === y.fy);
          return (
            <g key={y.fy}>
              {segs}
              {cmp && <line x1={x - 4} x2={x + w + 4} y1={yOf(cmp.revenueWithActuals / 1e7)} y2={yOf(cmp.revenueWithActuals / 1e7)} stroke="#0f172a" strokeWidth="1.5" strokeDasharray="4 3"><title>Compared scenario ₹{cr(cmp.revenueWithActuals)} Cr</title></line>}
              <text x={x + w / 2} y={yOf(acc) - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">{cr(y.revenueWithActuals, 1)}</text>
              <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="#475569">{y.fy}{y.months < 12 ? '*' : ''}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        {CHANNELS.map((ch) => (
          <span key={ch} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CH_COLOR[ch] }} />{CHANNEL_NAMES[ch]}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-300" />Apr–Sep '26 actuals</span>
        {years.some((y) => y.storeRevenue > 0) && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-500" />Own stores</span>}
        {compare && <span>– – compared scenario</span>}
        <span>₹ Cr · *part year</span>
      </figcaption>
    </figure>
  );
}

export function CashCurve({ r, compare }: { r: PlanResult; compare?: PlanResult | null }) {
  const W = 640, H = 220, padL = 40, padB = 24, padT = 12;
  const ms = r.months;
  const series = [ms.map((m) => m.closingCash / 1e7), ms.map((m) => m.cumulativeCash / 1e7)];
  const cmpSeries = compare ? compare.months.map((m) => m.closingCash / 1e7) : [];
  const all = [...series.flat(), ...cmpSeries, 0];
  const lo = Math.floor(Math.min(...all) / 5) * 5, hi = Math.ceil(Math.max(...all) / 5) * 5 || 5;
  const xOf = (i: number) => padL + (W - padL - 8) * (i / Math.max(1, ms.length - 1));
  const yOf = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo || 1));
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cash position by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 6} y1={yOf(t)} y2={yOf(t)} stroke={Math.abs(t) < 1e-9 ? '#94a3b8' : '#e2e8f0'} />
            <text x={padL - 6} y={yOf(t) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{t.toFixed(0)}</text>
          </g>
        ))}
        <line x1={padL} x2={W - 6} y1={yOf(0)} y2={yOf(0)} stroke="#64748b" />
        {ms.map((m, i) => (m.label.startsWith('Apr') ? <text key={m.m} x={xOf(i)} y={H - 6} fontSize="10" fill="#64748b" textAnchor="middle">{m.fy}</text> : null))}
        {r.base < ms.length && <line x1={xOf(r.base - 0.5)} x2={xOf(r.base - 0.5)} y1={padT} y2={H - padB} stroke="#cbd5e1" strokeDasharray="3 3" />}
        {compare && <path d={path(cmpSeries)} fill="none" stroke="#0f172a" strokeWidth="1.25" strokeDasharray="4 3" />}
        <path d={path(series[1])} fill="none" stroke="#94a3b8" strokeWidth="1.5" />
        <path d={path(series[0])} fill="none" stroke="rgb(var(--accent-600))" strokeWidth="2.25" />
        {ms.map((m, i) => m.equity > 0 && (
          <circle key={m.m} cx={xOf(i)} cy={yOf(series[0][i])} r="4" fill="#10b981"><title>{m.label}: equity ₹{cr(m.equity)} Cr</title></circle>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-brand-600" />Closing cash (with raises & debt)</span>
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-slate-400" />Cumulative operating cash flow (what funding must cover)</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Equity in</span>
        <span>Dotted line = end of the 18-month sheet · ₹ Cr</span>
      </figcaption>
    </figure>
  );
}

export function MiniStat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${bad ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200/80 bg-surface'} shadow-card`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tabular-nums ${bad ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

