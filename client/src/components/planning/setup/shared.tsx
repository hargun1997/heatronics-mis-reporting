// Pieces every Setup section uses (docs/planning/ONE-SETUP.md §1). Moved out of the old tab files so there is one of each.
import { useState, type ReactNode } from 'react';
import type { Plan, PlanResult } from '../../../data/planning/engine';
import { applyFounderDecisions } from '../../../data/planning/basePlan';
import { emptyGrowth, ensureGrowthGroups } from '../../../data/planning/growth';
import type { Update } from './types';

export const CR = 1e7;

// ---- class strings -------------------------------------------------------------------------------------------------
export const btn = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
export const rm = 'rounded px-1.5 py-0.5 text-[12px] font-semibold text-slate-400 hover:text-rose-600';
export const txt = 'rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px]';
export const lbl = 'text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-slate-500';
export const th = 'px-2 py-2 text-left text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-slate-500';
export const thr = th.replace('text-left', 'text-right');
export const td = 'px-2 py-1.5';

export const newId = (p: string) => p + Math.random().toString(36).slice(2, 8);
export const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
export const monthsOf = (r: PlanResult) => r.months.map((m) => ({ m: m.m, label: m.label }));

// ---- small components ----------------------------------------------------------------------------------------------
export function MonthSelect({ value, onChange, months, title, allowNone, noneLabel }: {
  value: number | null | undefined; onChange: (m: number | null) => void; months: { m: number; label: string }[]; title: string; allowNone?: boolean; noneLabel?: string;
}) {
  return (
    <select aria-label={title} title={title} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className={txt}>
      {allowNone && <option value="">{noneLabel ?? 'to the end'}</option>}
      {months.map((x) => <option key={x.m} value={x.m}>{x.label}</option>)}
    </select>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" aria-label={label} title={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand-600" />;
}

/** A labelled row: label (+ hint) on the left, the control(s) on the right. */
export function Row({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[13px] text-slate-600">
      <span>{label}{hint && <span className="block text-xs sm:text-[11px] leading-snug text-slate-400">{hint}</span>}</span>
      <span className="flex items-center gap-1.5">{children}</span>
    </label>
  );
}
export const Field = Row;

/** Row with a checkbox on the right. */
export function CheckRow({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: ReactNode; hint?: string }) {
  return <Row label={label} hint={hint}><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-brand-600" /></Row>;
}

export function Flag({ children = 'Terms not confirmed' }: { children?: string }) {
  return <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs sm:text-[11px] font-semibold text-amber-800">{children}</span>;
}

export function SubHead({ children }: { children: ReactNode }) {
  return <h4 className="text-xs sm:text-[11px] font-bold uppercase tracking-wide text-slate-500">{children}</h4>;
}

/** One grey line of explanation / feedback. */
export function Note({ children, tone = 'grey' }: { children: ReactNode; tone?: 'grey' | 'amber' }) {
  return <p className={tone === 'amber' ? 'text-[12px] text-amber-800' : 'text-[12px] text-slate-500'}>{children}</p>;
}

// ---- plan helpers --------------------------------------------------------------------------------------------------
/** Replace the whole plan with fn(plan) through `update` (keeps React's draft semantics). */
export function replacePlan(update: Update, fn: (p: Plan) => Plan): void {
  update((p) => {
    const n = fn(p);
    for (const k of Object.keys(p)) if (!(k in n)) delete (p as unknown as Record<string, unknown>)[k];
    Object.assign(p, n);
  });
}

/** [busy, run]: run(what, fn) shows `what` on the button, lets it repaint, then runs the synchronous fn. */
export function useBusy(): [string | null, (what: string, fn: () => void) => void] {
  const [busy, setBusy] = useState<string | null>(null);
  const run = (what: string, fn: () => void) => {
    setBusy(what);
    window.setTimeout(() => { try { fn(); } finally { setBusy(null); } }, 30);
  };
  return [busy, run];
}

/** The growth layer, created on first use (does NOT change `on` of an existing one). */
export function ensureGrowth(p: Plan): NonNullable<Plan['growth']> {
  p.growth ??= { ...emptyGrowth(), on: true };
  ensureGrowthGroups(p);
  return p.growth;
}

/** The founder decisions, applied on first use. */
export function ensureFx(p: Plan): NonNullable<Plan['fx']> {
  if (!p.fx) applyFounderDecisions(p);
  return p.fx!;
}
