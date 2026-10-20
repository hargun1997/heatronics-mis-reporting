// The one control bar: view switch, whose tasks, search, and a Filters
// popover (head, area, type, due) with an active count and Clear.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdjustmentsHorizontalIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { Head, TeamMember } from '../../data/work/workClient';
import { KINDS, NO_FILTERS, WHENS, type Filters, type View, type Who } from './taskModel';
import { btnGhost, btnPrimary, focusRing } from './ui';

const VIEWS: { v: View; l: string }[] = [
  { v: 'agenda', l: 'To do' },
  { v: 'month', l: 'Calendar' },
  { v: 'all', l: 'All tasks' },
];

const selectCls = `min-h-[40px] w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100`;
const chipCls = (on: boolean) =>
  `min-h-[36px] rounded-full border px-3 text-sm font-medium transition ${focusRing} ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`;

export function TasksToolbar({
  view,
  setView,
  who,
  setWho,
  me,
  members,
  q,
  setQ,
  filters,
  setFilters,
  heads,
  headCounts,
  areas,
}: {
  view: View;
  setView: (v: View) => void;
  who: Who;
  setWho: (w: Who) => void;
  me: string;
  members: TeamMember[];
  q: string;
  setQ: (s: string) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  heads: Head[];
  headCounts: { total: number; by: Map<string, number> };
  areas: string[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const set = (p: Partial<Filters>) => setFilters({ ...filters, ...p });
  const active = [filters.head, filters.area, filters.kind, filters.when].filter(Boolean).length;
  const meName = members.find((m) => m.id === me)?.name;
  const headName = heads.find((h) => h.id === filters.head)?.name;
  const chips: { label: string; clear: () => void }[] = [
    filters.when && { label: WHENS.find((w) => w.k === filters.when)!.l, clear: () => set({ when: '' }) },
    filters.head && headName && { label: headName, clear: () => set({ head: '' }) },
    filters.area && { label: filters.area, clear: () => set({ area: '' }) },
    filters.kind && { label: KINDS.find((k) => k.k === filters.kind)!.l, clear: () => set({ kind: '' }) },
  ].filter((x): x is { label: string; clear: () => void } => !!x);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="View" className="flex w-full rounded-lg bg-slate-200/70 p-1 sm:w-auto">
          {VIEWS.map(({ v, l }) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`min-h-[36px] flex-1 rounded-md px-3.5 text-sm font-medium transition sm:flex-none ${focusRing} ${
                view === v ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <label className="min-w-0 flex-1 sm:max-w-[200px] sm:flex-none">
          <span className="sr-only">Show tasks for</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={selectCls}>
            <option value="all">Everyone</option>
            {me && <option value="mine">Me ({meName?.split(' ')[0]})</option>}
            {members
              .filter((m) => m.id !== me)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            <option value="unassigned">No owner</option>
          </select>
        </label>

        <label className="relative order-last w-full sm:order-none sm:w-auto sm:min-w-[180px] sm:flex-1">
          <span className="sr-only">Search tasks</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks"
            className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <div className="relative" ref={box}>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium ${focusRing} ${
              active ? 'border-slate-900 bg-white text-slate-950' : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400'
            }`}
          >
            <AdjustmentsHorizontalIcon className="h-4 w-4" />
            Filters
            {active > 0 && <span className="rounded-full bg-slate-900 px-1.5 text-[12px] font-semibold leading-5 text-white">{active}</span>}
          </button>
          {open && (
            <div
              role="dialog"
              aria-label="Filters"
              className="fixed inset-x-4 top-24 z-40 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-popover sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[340px]"
            >
              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="f-head" className="text-sm font-semibold text-slate-900">
                      Head
                    </label>
                    <Link to="/tasks/settings#heads" className={`rounded text-sm text-brand-700 hover:underline ${focusRing}`}>
                      Edit heads
                    </Link>
                  </div>
                  <select id="f-head" value={filters.head} onChange={(e) => set({ head: e.target.value })} className={selectCls}>
                    <option value="">All heads ({headCounts.total})</option>
                    {heads.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({headCounts.by.get(h.id) ?? 0})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-area" className="mb-1 block text-sm font-semibold text-slate-900">
                    Area
                  </label>
                  <select id="f-area" value={filters.area} onChange={(e) => set({ area: e.target.value })} className={selectCls}>
                    <option value="">All areas</option>
                    {areas.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold text-slate-900">Type</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {KINDS.map((k) => (
                      <button key={k.k} type="button" aria-pressed={filters.kind === k.k} onClick={() => set({ kind: filters.kind === k.k ? '' : k.k })} className={chipCls(filters.kind === k.k)}>
                        {k.l}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold text-slate-900">Due</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {WHENS.map((w) => (
                      <button
                        key={w.k}
                        type="button"
                        aria-pressed={filters.when === w.k}
                        onClick={() => {
                          set({ when: filters.when === w.k ? '' : w.k });
                          setView('agenda');
                        }}
                        className={chipCls(filters.when === w.k)}
                      >
                        {w.l}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <button type="button" disabled={!active} onClick={() => setFilters(NO_FILTERS)} className={btnGhost}>
                  Clear all
                </button>
                <button type="button" onClick={() => setOpen(false)} className={btnPrimary}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.clear}
              aria-label={`Remove filter ${c.label}`}
              className={`inline-flex min-h-[32px] items-center gap-1 rounded-full bg-slate-200/70 pl-3 pr-2 text-sm text-slate-800 hover:bg-slate-200 ${focusRing}`}
            >
              {c.label}
              <XMarkIcon className="h-4 w-4 text-slate-600" />
            </button>
          ))}
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className={`min-h-[32px] rounded px-2 text-sm font-medium text-slate-600 hover:text-slate-950 ${focusRing}`}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
