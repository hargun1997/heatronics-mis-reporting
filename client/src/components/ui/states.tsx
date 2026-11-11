// One look for loading, error and empty on every page, plus InfoTip (a note behind an "i") and ShowAll (a long list
// shows its first rows; the rest opens in a modal). Simplification pass, 11 Nov 2026.
import React, { useState } from 'react';
import { AlertTriangle, Info, Inbox, Loader2 } from 'lucide-react';
import { Modal, Popover } from './overlays';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{label}…
    </div>
  );
}

export function ErrorBox({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {onRetry && <button type="button" onClick={onRetry} className="min-h-11 sm:min-h-9 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-800 hover:bg-red-50">Try again</button>}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
      <Inbox className="h-5 w-5 text-slate-400" aria-hidden />
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {hint && <p className="max-w-[52ch] text-sm text-slate-600">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A note behind an "i": use it in place of a paragraph under a chart, table or tile. */
export function InfoTip({ children, label = 'How this number is made', align = 'left', width = 320 }: { children: React.ReactNode; label?: string; align?: 'left' | 'right'; width?: number }) {
  return (
    <Popover align={align} width={width} buttonLabel={label}
      buttonClassName="inline-flex h-11 w-11 sm:h-7 sm:w-7 items-center justify-center rounded-md align-middle text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      button={<Info className="h-4 w-4" aria-hidden />}>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3.5 text-[13px] font-normal normal-case leading-5 tracking-normal text-slate-700">{children}</div>
    </Popover>
  );
}

/** Shows the first `max` items; "Show all N" opens the full list in a modal. */
export function ShowAll<T>({ items, max = 5, title, render, className, width = 760 }: {
  items: T[]; max?: number; title: string; render: (item: T, index: number) => React.ReactNode; className?: string; width?: number;
}) {
  const [open, setOpen] = useState(false);
  const head = items.slice(0, max);
  return (
    <>
      <div className={className}>{head.map(render)}</div>
      {items.length > max && (
        <button type="button" onClick={() => setOpen(true)}
          className="mt-2 inline-flex min-h-11 sm:min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
          Show all {items.length}
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={`${title} (${items.length})`} width={width}>
        <div className={className}>{items.map(render)}</div>
      </Modal>
    </>
  );
}

/** Button looks: one primary per screen (BTN_PRIMARY), the rest secondary. 44px on phones. */
export const BTN = 'inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';
export const BTN_PRIMARY = 'inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 rounded-lg bg-cta px-3.5 text-sm font-semibold text-on-cta hover:bg-cta-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2';

/** A titled card: title · count · action on one row, then the content. The one section card for every page. */
export function Panel({ title, count, action, children, className = '', flush }: {
  title: React.ReactNode; count?: number | null; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-card ${className}`}>
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-1.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {title}
          {count != null && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">{count}</span>}
        </h2>
        {action}
      </div>
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

/** Ember numbered step: obsidian circle with the number, then the content. */
export function StepNo({ n }: { n: number }) {
  return <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold tabular-nums text-white">{n}</span>;
}
