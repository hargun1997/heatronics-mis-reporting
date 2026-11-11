// Small inputs for the planner: numbers typed in the unit people think in
// (%, ₹ lakh, ₹ Cr, units) and stored in the plan's raw unit.

import { useState, type ReactNode } from 'react';
import { InfoTip } from '../ui/states';

type Unit = 'pct' | 'lakh' | 'cr' | 'num' | 'x';
const scale: Record<Unit, number> = { pct: 100, lakh: 1e-5, cr: 1e-7, num: 1, x: 1 };
const suffix: Record<Unit, string> = { pct: '%', lakh: 'L', cr: 'Cr', num: '', x: '×' };

export function NumInput({
  value, onChange, unit = 'num', step, min, max, className = '', width = 'w-20', title, disabled,
}: {
  value: number; onChange: (v: number) => void; unit?: Unit; step?: number; min?: number; max?: number;
  className?: string; width?: string; title?: string; disabled?: boolean;
}) {
  const shown = +(value * scale[unit]).toFixed(unit === 'cr' ? 3 : 2);
  // While typing, keep the raw text; otherwise always show the plan's value.
  const [edit, setEdit] = useState<string | null>(null);
  const text = edit ?? String(shown);
  const commit = (t: string) => {
    setEdit(null);
    const n = Number(t);
    if (!Number.isFinite(n) || t.trim() === '') return;
    let v = n / scale[unit];
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  };
  return (
    <span className={`inline-flex items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-brand-200 ${disabled ? 'opacity-50' : ''} ${className}`}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        disabled={disabled}
        title={title}
        aria-label={title}
        value={text}
        onChange={(e) => setEdit(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
        className={`${width} bg-transparent px-2 py-1 text-right text-[13px] tabular-nums outline-none`}
      />
      {suffix[unit] && <span className="pr-2 text-xs text-slate-400">{suffix[unit]}</span>}
    </span>
  );
}

/** Slider + number box for a headline lever. */
export function Lever({
  label, hint, value, onChange, unit = 'pct', min, max, step,
}: {
  label: string; hint?: ReactNode; value: number; onChange: (v: number) => void; unit?: Unit; min: number; max: number; step: number;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-0.5 text-[13px] font-medium text-slate-700">{label}{hint && <InfoTip label={`About ${label}`} width={300}>{hint}</InfoTip>}</span>
        <NumInput value={value} onChange={onChange} unit={unit} min={min} max={max} step={step * scale[unit]} title={label} />
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-brand-600"
        aria-label={label}
      />
    </div>
  );
}
