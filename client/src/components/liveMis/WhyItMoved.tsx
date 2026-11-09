// "Why it moved" — Live MIS Overview. Month vs the month before (and the same month last year when present):
// a numbered list of reasons, a plain-English top 3, and a waterfall of the steps. Pure view over data/misDeck/bridge.ts.
import { useState } from 'react';
import { moveWords, type Bridge, type BridgeResult } from '../../data/misDeck/bridge';
import type { WhyData } from './whyData';

const L = (lakh: number) => `${lakh > 0 ? '+' : lakh < 0 ? '−' : ''}₹${Math.abs(lakh).toFixed(2)} L`;

function Waterfall({ b }: { b: Bridge }) {
  const vals = b.bars.flatMap((x) => [x.from, x.to, 0]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;
  return (
    <ol className="space-y-1.5" aria-label="Waterfall of steps">
      {b.bars.filter((x) => x.kind === 'total' || Math.abs(x.lakh) >= 0.005).map((x, i) => {
        const left = pos(Math.min(x.from, x.to)), width = Math.max(pos(Math.max(x.from, x.to)) - left, 0.8);
        const tone = x.kind === 'total' ? 'bg-brand-500' : x.kind === 'up' ? 'bg-emerald-500' : 'bg-rose-500';
        const arrow = x.kind === 'total' ? '' : x.kind === 'up' ? '▲ ' : '▼ ';
        return (
          <li key={i} className="grid grid-cols-1 sm:grid-cols-[minmax(0,220px)_1fr_110px] items-center gap-x-3 gap-y-0.5 min-h-[44px]">
            <span className={`text-sm ${x.kind === 'total' ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{x.label}</span>
            <div className="relative h-5 rounded bg-slate-100" role="img" aria-label={`${x.label}: ${L(x.lakh)}`}>
              <div className={`absolute top-0 h-5 rounded ${tone}`} style={{ left: `${left}%`, width: `${width}%` }} />
            </div>
            <span className={`text-sm tabular-nums sm:text-right font-medium ${x.kind === 'down' ? 'text-rose-700' : x.kind === 'up' ? 'text-emerald-700' : 'text-slate-900'}`}>
              {arrow}{x.kind === 'total' ? `₹${x.lakh.toFixed(2)} L` : `${L(x.lakh)} ${x.lakh >= 0 ? 'helps' : 'hurts'}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function BridgeBlock({ r, title }: { r: BridgeResult | null; title: string }) {
  if (!r) return <p className="text-sm text-slate-500">{title}: no month to compare with.</p>;
  if (r.status !== 'ok') return <p className="text-sm text-slate-500">{title}: not enough data. {r.reason}</p>;
  const mv = moveWords(r.deltaLakh);
  const rv = moveWords(r.netRevenue.deltaLakh);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-xs text-slate-500">{r.endLabel}, {r.curLabel} vs {r.baseLabel}</div>
          <div className="text-2xl font-semibold tabular-nums text-slate-900">{mv.arrow} {L(r.deltaLakh)}</div>
          <div className="text-sm text-slate-600">{mv.words} · now ₹{r.endLakh.toFixed(2)} L</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Net revenue</div>
          <div className="text-2xl font-semibold tabular-nums text-slate-900">{rv.arrow} {L(r.netRevenue.deltaLakh)}</div>
          <div className="text-sm text-slate-600">{rv.words}{r.netRevenue.deltaPct !== null ? ` (${r.netRevenue.deltaPct > 0 ? '+' : ''}${r.netRevenue.deltaPct}%)` : ''}</div>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-1">Top reasons</h4>
        {r.reasons.length ? (
          <ol className="list-decimal pl-5 space-y-1 text-base text-slate-800">{r.reasons.map((x, i) => <li key={i}>{x.text}</li>)}</ol>
        ) : <p className="text-sm text-slate-500">No big change in any one line.</p>}
      </div>
      <details className="rounded-xl border border-slate-200 px-3 py-1" open>
        <summary className="cursor-pointer min-h-[44px] flex items-center text-sm font-semibold text-slate-900">Step by step (₹ lakh)</summary>
        <div className="pb-3"><Waterfall b={r} /></div>
      </details>
      <details className="rounded-xl border border-slate-200 px-3 py-1">
        <summary className="cursor-pointer min-h-[44px] flex items-center text-sm font-semibold text-slate-900">Details by line</summary>
        <ol className="list-decimal pl-5 pb-3 space-y-1 text-sm text-slate-700">
          {r.steps.map((s) => (
            <li key={s.id}>{s.label}: <span className="tabular-nums font-medium">{L(s.lakh)}</span>
              {s.parts?.length ? <span className="text-slate-500"> ({s.parts.slice(0, 4).map((p) => `${p.label} ${L(p.lakh)}`).join(', ')})</span> : null}
            </li>
          ))}
        </ol>
      </details>
      {r.notes.length > 0 && <ul className="text-xs text-slate-500 list-disc pl-5">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </div>
  );
}

export function WhyItMoved({ data }: { data: WhyData }) {
  const [cmp, setCmp] = useState<'previous' | 'lastYear'>('previous');
  if (!data.selectedKey) return <p className="text-sm text-slate-500 py-4">Pick one month (not a range) to see why it moved.</p>;
  const hasYear = data.results.lastYear !== null;
  const active = cmp === 'lastYear' && hasYear ? 'lastYear' : 'previous';
  return (
    <div className="space-y-4">
      <div className="inline-flex bg-slate-100 rounded-lg p-0.5" role="group" aria-label="Compare with">
        {(['previous', 'lastYear'] as const).map((k) => (
          <button key={k} type="button" disabled={k === 'lastYear' && !hasYear} aria-pressed={active === k} onClick={() => setCmp(k)}
            className={`min-h-[44px] px-4 rounded-md text-sm ${active === k ? 'bg-white shadow-sm font-semibold text-slate-900' : 'text-slate-600 disabled:text-slate-300'}`}>
            {k === 'previous' ? 'vs last month' : 'vs same month last year'}
          </button>
        ))}
      </div>
      <BridgeBlock r={data.results[active]} title={active === 'previous' ? 'Last month' : 'Last year'} />
    </div>
  );
}
