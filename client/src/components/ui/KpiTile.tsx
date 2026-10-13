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
  accent?: string; // top accent-bar colour (defaults to the tone's)
}

const toneWrap: Record<KpiTone, string> = {
  default:  'border-slate-200/80 bg-surface',
  warning:  'border-amber-200 bg-gradient-to-b from-amber-50 to-white',
  critical: 'border-rose-200 bg-gradient-to-b from-rose-50 to-white',
};

const toneValue: Record<KpiTone, string> = {
  default:  'text-slate-900',
  warning:  'text-amber-700',
  critical: 'text-rose-700',
};

const toneAccent: Record<KpiTone, string> = {
  default:  '#fe4705',
  warning:  '#d97706',
  critical: '#dc2626',
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

export function KpiTile({ label, value, unit, sub, delta, spark, sparkColor = '#2563EB', tone = 'default', accent }: KpiTileProps) {
  const deltaColor = !delta
    ? ''
    : delta.good === undefined
      ? 'text-slate-500'
      : delta.good
        ? 'text-emerald-700'
        : 'text-rose-700';
  const arrow = delta?.dir === 'up' ? '▲' : delta?.dir === 'down' ? '▼' : '▶';
  const bar = accent ?? toneAccent[tone];

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 pt-[18px] shadow-card ${toneWrap[tone]}`}>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${bar} 0%, ${bar} 55%, transparent 100%)` }}
      />
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
