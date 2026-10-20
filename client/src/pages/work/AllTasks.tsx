// All tasks: the full list grouped by area (folding sections), with bulk
// select-and-delete. Every row opens the same task panel as the agenda.

import { useState } from 'react';
import { ChevronDownIcon, TrashIcon } from '@heroicons/react/24/outline';
import { describe } from '../../data/work/schedule';
import type { TeamMember, WorkState, WorkTask } from '../../data/work/workClient';
import { readFold, writeFold } from '../../hooks/useDensity';
import { ownerNames } from './taskModel';
import { TaskPanel } from './TaskPanel';
import { btnGhost, btnSecondary, focusRing } from './ui';

export function AllTasks({
  state,
  matches,
  memberById,
  openKey,
  setOpenKey,
  members,
  areas,
  compact,
  onSave,
  onDelete,
  onDeleteMany,
  onReload,
}: {
  state: WorkState;
  matches: (t: WorkTask) => boolean;
  memberById: Map<string, TeamMember>;
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
  members: TeamMember[];
  areas: string[];
  compact: boolean;
  onSave: (t: Partial<WorkTask>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDeleteMany: (ids: string[]) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const tasks = state.tasks.filter(matches);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const toggleSel = (id: string) =>
    setSel((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allShownSelected = tasks.length > 0 && tasks.every((t) => sel.has(t.id));
  const removeSelected = async () => {
    if (!sel.size || !window.confirm(`Delete ${sel.size} task${sel.size > 1 ? 's' : ''} and their history? This can’t be undone.`)) return;
    setDeleting(true);
    try {
      await onDeleteMany([...sel]);
      setSel(new Set());
      setSelecting(false);
    } finally {
      setDeleting(false);
    }
  };
  const byArea = new Map<string, WorkTask[]>();
  // Within an area: daily, weekly, then by day of month, then quarterly / yearly / one-time by date.
  const rank: Record<string, number> = { daily: 0, weekly: 1, monthly: 2, quarterly: 3, 'half-yearly': 4, yearly: 5, 'one-time': 6 };
  const sortKey = (t: WorkTask) =>
    rank[t.cadence] * 10000 +
    (t.cadence === 'weekly' ? (t.dueWeekday ?? 1) : t.cadence === 'yearly' ? (t.dueMonth ?? 3) * 100 + (t.dueDay ?? 31) : t.cadence === 'one-time' ? Number((t.dueDate ?? '9999-12-31').slice(5).replace('-', '')) : (t.dueDay ?? 1));
  for (const t of [...tasks].sort((x, y) => sortKey(x) - sortKey(y) || x.title.localeCompare(y.title))) byArea.set(t.area, [...(byArea.get(t.area) ?? []), t]);
  const order = [...byArea.keys()].sort();
  // Areas start folded (remembered per browser); a short list or the linked task's area shows open.
  const openTaskArea = openKey?.startsWith('all:') ? state.tasks.find((t) => `all:${t.id}` === openKey)?.area : undefined;
  // Seed from every area (not just the ones the current filter shows), so clearing a filter keeps remembered folds.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(state.tasks.map((t) => t.area).filter((a) => readFold(`tasks:area:${a}`, false))));
  const autoOpen = order.length <= 1 || tasks.length <= 20;
  const isOpen = (a: string) => autoOpen || expanded.has(a) || a === openTaskArea;
  const setAll = (open: boolean) => {
    order.forEach((a) => writeFold(`tasks:area:${a}`, open));
    setExpanded(open ? new Set(order) : new Set());
  };
  const toggleArea = (a: string) =>
    setExpanded((cur) => {
      const n = new Set(cur);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      writeFold(`tasks:area:${a}`, n.has(a));
      return n;
    });
  const allOpen = order.every((a) => isOpen(a));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="mr-auto text-sm text-slate-600">
          {tasks.length} task{tasks.length === 1 ? '' : 's'} in {order.length} area{order.length === 1 ? '' : 's'}
        </span>
        {!autoOpen && (
          <button type="button" onClick={() => setAll(!allOpen)} className={btnGhost}>
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}
        {selecting ? (
          <>
            <button type="button" onClick={() => setSel(allShownSelected ? new Set() : new Set(tasks.map((t) => t.id)))} className={btnGhost}>
              {allShownSelected ? 'Clear selection' : `Select all ${tasks.length}`}
            </button>
            <button
              type="button"
              disabled={!sel.size || deleting}
              onClick={() => void removeSelected()}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40 ${focusRing}`}
            >
              <TrashIcon className="h-4 w-4" /> {deleting ? 'Deleting…' : `Delete ${sel.size || ''}`.trim()}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelecting(false);
                setSel(new Set());
              }}
              className={btnGhost}
            >
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setSelecting(true)} className={btnSecondary}>
            Select to delete
          </button>
        )}
      </div>
      {order.map((a) => {
        const list = byArea.get(a)!;
        const open = isOpen(a);
        return (
          <section key={a}>
            <button
              type="button"
              onClick={() => toggleArea(a)}
              disabled={autoOpen}
              aria-expanded={open}
              className={`flex min-h-[40px] w-full items-center gap-2 rounded-lg px-1 text-left enabled:hover:bg-slate-100/70 ${focusRing}`}
            >
              {!autoOpen && <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? '' : '-rotate-90'}`} />}
              <h2 className="text-[15px] font-semibold text-slate-900">{a}</h2>
              <span className="text-sm text-slate-500">{list.length}</span>
            </button>
            {open && (
              <ul className="mt-1.5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {list.map((t) => {
                  const key = `all:${t.id}`;
                  const rowOpen = openKey === key;
                  const owners = ownerNames(t.ownerIds, memberById);
                  return (
                    <li key={t.id} id={`task-${t.id}`} className={`scroll-mt-24 ${sel.has(t.id) ? 'bg-rose-50/60' : ''}`}>
                      <div className="flex items-center">
                        {selecting && (
                          <input
                            type="checkbox"
                            checked={sel.has(t.id)}
                            onChange={() => toggleSel(t.id)}
                            className="ml-4 h-5 w-5 shrink-0 rounded border-slate-400 text-rose-600"
                            aria-label={`Select ${t.title}`}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => (selecting ? toggleSel(t.id) : setOpenKey(rowOpen ? null : key))}
                          aria-expanded={selecting ? undefined : rowOpen}
                          className={`flex w-full min-w-0 items-center gap-3 px-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 ${compact ? 'min-h-[40px] py-1.5' : 'min-h-[56px] py-2.5'}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className={`text-[15px] font-medium ${rowOpen ? '' : 'truncate'} ${t.active ? 'text-slate-950' : 'text-slate-500 line-through'}`}>{t.title}</div>
                            {!compact && (
                              <div className="truncate text-sm text-slate-600">
                                {describe(t)}
                                <span className="sm:hidden"> · {owners || 'No owner'}</span>
                                {!t.active && ' · paused'}
                              </div>
                            )}
                          </div>
                          <span className={`hidden max-w-[40%] shrink-0 truncate text-sm sm:block ${owners ? 'text-slate-700' : 'text-slate-500'}`}>{owners || 'No owner'}</span>
                          <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-500 transition ${rowOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                      {rowOpen && !selecting && <TaskPanel task={t} state={state} members={members} areas={areas} onSave={onSave} onDelete={onDelete} reload={onReload} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      {!order.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">No tasks match.</p>}
    </div>
  );
}
