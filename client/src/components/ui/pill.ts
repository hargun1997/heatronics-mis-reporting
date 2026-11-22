// Pill tones and the look for a pill that is a button or popover trigger. The pill component is StatusPill.tsx.

export type PillTone = 'positive' | 'warning' | 'critical' | 'info' | 'neutral' | 'brand';

export const PILL_TONE: Record<PillTone, { wrap: string; dot: string; hover: string }> = {
  positive: { wrap: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-600', hover: 'hover:bg-emerald-100' },
  warning:  { wrap: 'bg-amber-50 text-amber-800 border-amber-200',       dot: 'bg-amber-600',   hover: 'hover:bg-amber-100' },
  critical: { wrap: 'bg-rose-50 text-rose-800 border-rose-200',          dot: 'bg-rose-600',    hover: 'hover:bg-rose-100' },
  info:     { wrap: 'bg-blue-50 text-blue-800 border-blue-200',          dot: 'bg-blue-700',    hover: 'hover:bg-blue-100' },
  neutral:  { wrap: 'bg-slate-100 text-slate-700 border-slate-200',      dot: 'bg-slate-400',   hover: 'hover:bg-slate-200' },
  brand:    { wrap: 'bg-brand-50 text-brand-700 border-brand-100',       dot: 'bg-brand-500',   hover: 'hover:bg-brand-100' },
};

/** Classes for a pill that is itself a button or a popover trigger (44px tall on phones). */
export function pillClass(tone: PillTone = 'neutral', extra = ''): string {
  const t = PILL_TONE[tone];
  return `inline-flex min-h-11 sm:min-h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold ${t.wrap} ${t.hover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${extra}`.trim();
}

