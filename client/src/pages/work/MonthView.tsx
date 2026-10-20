// Month calendar: every task on the day it falls due (daily tasks listed once
// above the grid).

import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { describe, occurrences, parseYmd } from '../../data/work/schedule';
import type { TeamMember, WorkState, WorkTask } from '../../data/work/workClient';
import { MN, ownerNames, periodLabel } from './taskModel';
import { focusRing } from './ui';

/** Month calendar: every task on the day it falls due (daily tasks listed once above the grid). */
export function MonthView({
  state,
  matches,
  today,
  memberById,
  onOpenTask,
}: {
  state: WorkState;
  matches: (t: WorkTask) => boolean;
  today: string;
  memberById: Map<string, TeamMember>;
  onOpenTask: (id: string) => void;
}) {
  const [ym, setYm] = useState(() => today.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const first = `${ym}-01`;
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${ym}-${String(daysIn).padStart(2, '0')}`;
  const tasks = state.tasks.filter((t) => t.active && matches(t));
  const daily = tasks.filter((t) => t.cadence === 'daily');
  const byDay = new Map<string, { t: WorkTask; period: string; done: boolean }[]>();
  for (const t of tasks) {
    if (t.cadence === 'daily') continue;
    for (const o of occurrences(t, first, last)) {
      const done = !!state.done[t.id]?.[o.period] || !!state.autoDone[t.id]?.includes(o.period);
      byDay.set(o.due, [...(byDay.get(o.due) ?? []), { t, period: o.period, done }]);
    }
  }
  const lead = (parseYmd(first).getUTCDay() + 6) % 7; // Monday-first grid
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setYm(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    setPicked(null);
  };
  const total = [...byDay.values()].reduce((a, l) => a + l.length, 0);
  const pickedList = picked ? byDay.get(picked) ?? [] : [];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 sm:px-4">
        <button type="button" onClick={() => shift(-1)} className={`flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 ${focusRing}`} aria-label="Previous month">
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <h2 className="min-w-[110px] text-center text-[15px] font-semibold text-slate-950">
          {MN[m]} {y}
        </h2>
        <button type="button" onClick={() => shift(1)} className={`flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 ${focusRing}`} aria-label="Next month">
          <ChevronRightIcon className="h-5 w-5" />
        </button>
        {ym !== today.slice(0, 7) && (
          <button type="button" onClick={() => setYm(today.slice(0, 7))} className={`min-h-[40px] rounded px-2 text-sm font-semibold text-brand-700 hover:underline ${focusRing}`}>
            Today
          </button>
        )}
        <span className="ml-auto text-sm text-slate-600">{total} tasks this month</span>
      </div>
      {daily.length > 0 && (
        <div className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700 sm:px-4">
          <span className="font-medium text-slate-900">Every working day:</span> {daily.map((t) => t.title).join(' · ')}
        </div>
      )}
      <div className="grid grid-cols-7 border-b border-slate-200 text-center text-[12px] font-medium text-slate-600">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} className="min-h-[56px] border-b border-r border-slate-100 bg-slate-50/60 sm:min-h-[96px]" />;
          const list = byDay.get(d) ?? [];
          const isToday = d === today;
          const open = list.filter((x) => !x.done);
          const late = d < today && open.length > 0;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setPicked(picked === d ? null : d)}
              aria-label={`${periodLabel(d)}: ${list.length} task${list.length === 1 ? '' : 's'}`}
              className={`min-h-[56px] min-w-0 border-b border-r border-slate-100 p-1 text-left align-top transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 sm:min-h-[96px] sm:p-1.5 ${picked === d ? 'bg-brand-50/60 ring-2 ring-inset ring-brand-300' : ''}`}
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-1">
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] font-medium tabular-nums ${
                    isToday ? 'bg-brand-500 text-white' : late ? 'text-rose-700' : 'text-slate-900'
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
                {list.length > 0 && (
                  <span className={`text-[12px] font-medium ${late ? 'text-rose-700' : 'text-slate-600'}`}>
                    {open.length ? open.length : <span className="text-emerald-700">done</span>}
                    <span className="hidden sm:inline">{open.length ? ' open' : ''}</span>
                  </span>
                )}
              </div>
              <div className="hidden space-y-0.5 sm:block">
                {list.slice(0, 3).map((x) => (
                  <div
                    key={x.t.id + x.period}
                    className={`truncate rounded px-1 py-0.5 text-[12px] leading-tight ${
                      x.done ? 'text-slate-500 line-through' : late ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-900'
                    }`}
                    title={x.t.title}
                  >
                    {x.t.title}
                  </div>
                ))}
                {list.length > 3 && <div className="px-1 text-[12px] font-medium text-slate-600">+{list.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="border-t border-slate-200 bg-slate-50/70 px-3 py-3 sm:px-4">
          <h3 className="mb-2 text-[15px] font-semibold text-slate-950">Due {periodLabel(picked)}</h3>
          {pickedList.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {pickedList.map((x) => (
                <li key={x.t.id + x.period}>
                  <button type="button" onClick={() => onOpenTask(x.t.id)} className={`flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 ${focusRing}`}>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${x.done ? 'bg-emerald-500' : picked < today ? 'bg-rose-500' : 'bg-brand-500'}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[15px] font-medium ${x.done ? 'text-slate-500 line-through' : 'text-slate-950'}`}>{x.t.title}</span>
                      <span className="block truncate text-sm text-slate-600">
                        {ownerNames(x.t.ownerIds, memberById) || 'No owner'} · {describe(x.t)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">Nothing due this day.</p>
          )}
        </div>
      )}
    </div>
  );
}
