// KpiTile — the redesign's headline stat tile: an uppercase label, a large
// tabular value, an optional delta (direction-coloured) and an optional
// sparkline. `tone` tints the whole tile for a line that needs attention.

import React from 'react';

export type KpiTone = 'default' | 'warning' | 'critical';
export type DeltaDir = 'up' | 'down' | 'flat';

interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  delta?: { dir: DeltaDir; text: string; good?: boolean };
  spark?: number[];
  sparkColor?: string;
  tone?: KpiTone;
}

const toneWrap: Record<KpiTone, string> = {
  default:  'border-slate-200 bg-white',
  warning:  'border-amber-200 bg-amber-50/40',
  critical: 'border-rose-200 bg-rose-50/40',
};

const toneValue: Record<KpiTone, string> = {
  default:  'text-slate-900',
  warning:  'text-amber-700',
  critical: 'text-rose-700',
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const w = 120;
  const h = 28;
  const pts = data
    .map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / span) * (h - 4) - 2}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-2.5 block" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KpiTile({ label, value, unit, sub, delta, spark, sparkColor = '#2563EB', tone = 'default' }: KpiTileProps) {
  const deltaColor = !delta
    ? ''
    : delta.good === undefined
      ? 'text-slate-500'
      : delta.good
        ? 'text-emerald-700'
        : 'text-rose-700';
  const arrow = delta?.dir === 'up' ? '▲' : delta?.dir === 'down' ? '▼' : '▶';

  return (
    <div className={`rounded-2xl border p-4 ${toneWrap[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-display font-extrabold tabular-nums mt-2 text-[26px] leading-none ${toneValue[tone]}`}>
        {value}
        {unit && <span className="text-base font-bold text-slate-400 ml-1">{unit}</span>}
      </div>
      {(delta || sub) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {delta && <span className={`font-bold ${deltaColor}`}>{arrow} {delta.text}</span>}
          {sub && <span className="text-slate-400">{sub}</span>}
        </div>
      )}
      {spark && <Sparkline data={spark} color={sparkColor} />}
    </div>
  );
}
