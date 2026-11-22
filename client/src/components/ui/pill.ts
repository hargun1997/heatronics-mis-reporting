// Pill tones and the look for a pill that is a button or popover trigger. The pill component is StatusPill.tsx.

// GUIDE.md "Status and pills": every status shows a sign and a word. ✓ good · ! watch · × act now · • not read / off.
export const PILL_SIGN: Record<PillTone, string> = { positive: '✓', warning: '!', critical: '×', info: '•', neutral: '•', brand: '•' };

export type PillTone = 'positive' | 'warning' | 'critical' | 'info' | 'neutral' | 'brand';

export const PILL_TONE: Record<PillTone, { wrap: string; dot: string; hover: string }> = {
  positive: { wrap: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-600', hover: 'hover:bg-emerald-100' },
  warning:  { wrap: 'bg-amber-50 text-amber-800 border-amber-200',       dot: 'bg-amber-600',   hover: 'hover:bg-amber-100' },
  critical: { wrap: 'bg-red-50 text-red-800 border-red-200',             dot: 'bg-red-600',     hover: 'hover:bg-red-100' },
  info:     { wrap: 'bg-slate-100 text-slate-700 border-slate-200',      dot: 'bg-slate-500',   hover: 'hover:bg-slate-200' },
  neutral:  { wrap: 'bg-slate-100 text-slate-700 border-slate-200',      dot: 'bg-slate-400',   hover: 'hover:bg-slate-200' },
  // heat marks only the active item (GUIDE.md "Colour"), so a brand pill is quiet grey with dark text.
  brand:    { wrap: 'bg-white text-slate-900 border-slate-300',          dot: 'bg-slate-900',   hover: 'hover:bg-slate-100' },
};

/** Classes for a pill that is itself a button or a popover trigger (44px tall on phones). */
export function pillClass(tone: PillTone = 'neutral', extra = ''): string {
  const t = PILL_TONE[tone];
  return `inline-flex min-h-11 sm:min-h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold ${t.wrap} ${t.hover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${extra}`.trim();
}

