// Small shared pieces for the Bulk payments (ICICI) page: numbered expandable steps, number tiles, notes.
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';
export const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-cta px-5 text-sm font-semibold text-on-cta hover:bg-cta-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';
export const input =
  'min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';

export function Step({ n, title, summary, defaultOpen = false, children, id }: {
  n: number | string; title: string; summary?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode; id: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:px-5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-50 text-base font-bold text-accent-700">{n}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-slate-900">{title}</span>
            {summary && <span className="mt-0.5 block text-sm text-slate-600">{summary}</span>}
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h2>
      {open && <div id={`${id}-body`} className="border-t border-slate-100 px-4 pb-5 pt-4 sm:px-5">{children}</div>}
    </section>
  );
}

export function Num({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-[26px] font-semibold leading-8 text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-600">{sub}</div>}
    </div>
  );
}

export function Note({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'warn' | 'error'; children: React.ReactNode }) {
  const cls = {
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-800',
  }[tone];
  const tag = { info: 'Note', ok: 'Done', warn: 'Check', error: 'Fix' }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>
      <span className="mr-1 font-semibold">{tag}:</span>{children}
    </div>
  );
}
