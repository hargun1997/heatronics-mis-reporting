// StatusPill — a small status/freshness badge with an optional leading dot.
// Tones chosen for 4.5:1 text contrast; positive/critical differ in lightness.

import React from 'react';

export type PillTone = 'positive' | 'warning' | 'critical' | 'info' | 'neutral' | 'brand';

const tone: Record<PillTone, { wrap: string; dot: string }> = {
  positive: { wrap: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-600' },
  warning:  { wrap: 'bg-amber-50 text-amber-800 border-amber-200',       dot: 'bg-amber-600' },
  critical: { wrap: 'bg-rose-50 text-rose-800 border-rose-200',          dot: 'bg-rose-600' },
  info:     { wrap: 'bg-blue-50 text-blue-800 border-blue-200',          dot: 'bg-blue-700' },
  neutral:  { wrap: 'bg-slate-100 text-slate-700 border-slate-200',      dot: 'bg-slate-400' },
  brand:    { wrap: 'bg-brand-50 text-brand-700 border-brand-100',       dot: 'bg-brand-500' },
};

interface StatusPillProps {
  children: React.ReactNode;
  toneName?: PillTone;
  dot?: boolean;
  className?: string;
}

export function StatusPill({ children, toneName = 'neutral', dot = false, className = '' }: StatusPillProps) {
  const t = tone[toneName];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${t.wrap} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}
