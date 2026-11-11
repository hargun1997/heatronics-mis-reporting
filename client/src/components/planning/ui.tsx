// Small pieces the 5-year plan's output views share (simplification pass 2, 11 Nov 2026): one card with the "how it is
// made" text behind an "i", and sub-tabs inside a view so each view fits about 2 screens. Read only: no plan inputs here.
import type { ReactNode } from 'react';
import { InfoTip, Panel } from '../ui/states';
import { SegmentedControl } from '../ui/SegmentedControl';

/** The one card of the plan views: title, optional count / action, and the explanation in an InfoTip. */
export function PlanCard({ title, count, info, action, children, flush, className }: {
  title: ReactNode; count?: number | null; info?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean; className?: string;
}) {
  return (
    <Panel title={title} count={count} flush={flush} className={className}
      action={(info || action) ? <div className="flex flex-wrap items-center gap-2">{action}{info && <InfoTip align="right">{info}</InfoTip>}</div> : undefined}>
      {children}
    </Panel>
  );
}

export function SubTabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) {
  return <SegmentedControl size="sm" value={value} onChange={onChange} options={options} aria-label={label} />;
}

/** A KPI tile for the plan views (number first, one short line under it). */
export function Stat({ label, value, sub, bad }: { label: string; value: string; sub?: ReactNode; bad?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border px-4 py-3 shadow-card ${bad ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tracking-[-0.02em] tabular-nums ${bad ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-600">{sub}</div>}
    </div>
  );
}
