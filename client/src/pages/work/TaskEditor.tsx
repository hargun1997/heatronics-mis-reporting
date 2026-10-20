// Task editor: title, area, role, owners, the "When is it due?" schedule
// builder, how-to link, notes and references. Used for add and edit.

import { useMemo, useState } from 'react';
import { CheckIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getHandbook } from '../../data/handbook/handbook';
import { addDays, describe, occurrences, ordinal, parseYmd, todayIST, ymd } from '../../data/work/schedule';
import type { TeamMember, WorkTask } from '../../data/work/workClient';
import { CADENCES, MN, WD, handbookAnchors, periodLabel } from './taskModel';
import { Avatar, btnGhost, btnPrimary, input, lbl } from './ui';

const scheduleSel = 'min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[14px] font-medium text-slate-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

function DaySelect({ value, onChange }: { value?: number; onChange: (n: number) => void }) {
  return (
    <select className={scheduleSel} value={value ?? 1} onChange={(e) => onChange(Number(e.target.value))} aria-label="Day of month">
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
        <option key={d} value={d}>
          {d === 31 ? 'last day' : ordinal(d)}
        </option>
      ))}
    </select>
  );
}

/** "When is it due?" — a sentence-style schedule picker with the next due dates. */
function ScheduleBuilder({ f, set }: { f: Partial<WorkTask>; set: (p: Partial<WorkTask>) => void }) {
  const cad = f.cadence ?? 'monthly';
  const today = todayIST();
  const spec = { ...f, cadence: cad } as WorkTask;
  const next = occurrences(spec, today, ymd(addDays(parseYmd(today), 800))).slice(0, 4);
  const pad = (n: number) => String(n).padStart(2, '0');
  const oneTimeDate =
    f.dueDate ?? (f.dueMonth ? `${today.slice(0, 4)}-${pad(f.dueMonth)}-${pad(Math.min(f.dueDay ?? 1, 28))}` : '');
  const sel = scheduleSel;
  const chip = (on: boolean) =>
    `min-h-[40px] rounded-lg border px-3 text-[14px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'}`;

  return (
    <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-900">When is it due?</legend>
      <div className="flex flex-wrap gap-1.5">
        {CADENCES.map((c) => (
          <button
            key={c.v}
            type="button"
            onClick={() =>
              set(
                c.v === 'one-time' && !f.dueDate
                  ? { cadence: c.v, dueDate: ymd(addDays(parseYmd(today), 7)) }
                  : c.v === 'monthly' && !f.dueDay
                    ? { cadence: c.v, dueDay: 1 }
                    : { cadence: c.v },
              )
            }
            className={chip(cad === c.v)}
          >
            {c.l}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px] text-slate-950">
        {cad === 'daily' && <span className="font-medium">Every working day, Monday to Saturday.</span>}
        {cad === 'weekly' && (
          <>
            <span className="font-medium">Every</span>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button key={d} type="button" onClick={() => set({ dueWeekday: d })} className={chip((f.dueWeekday ?? 1) === d)}>
                {WD[d % 7]}
              </button>
            ))}
          </>
        )}
        {cad === 'monthly' && (
          <>
            <span className="font-medium">Every month {f.startDay ? 'from the' : 'on the'}</span>
            {f.startDay ? (
              <>
                <DaySelect value={f.startDay} onChange={(n) => set({ startDay: n })} />
                <span className="font-medium">to the</span>
              </>
            ) : null}
            <DaySelect value={f.dueDay} onChange={(n) => set({ dueDay: n })} />
            <button
              type="button"
              onClick={() => set({ startDay: f.startDay ? (null as unknown as undefined) : Math.max(1, (f.dueDay ?? 2) - 1) })}
              className="text-sm font-semibold text-brand-700 hover:underline"
            >
              {f.startDay ? 'Single day' : '+ Make it a range'}
            </button>
          </>
        )}
        {(cad === 'quarterly' || cad === 'half-yearly') && (
          <>
            <span className="font-medium">On the</span>
            <DaySelect value={f.dueDay} onChange={(n) => set({ dueDay: n })} />
            <span className="font-medium">of</span>
            <div className="flex flex-wrap gap-1">
              {MN.slice(1).map((m, i) => {
                const cur = f.months?.length ? f.months : cad === 'quarterly' ? [1, 4, 7, 10] : [4, 10];
                const on = cur.includes(i + 1);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set({ months: on ? cur.filter((x) => x !== i + 1) : [...cur, i + 1].sort((a, b) => a - b) })}
                    className={`w-12 ${chip(on)}`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {cad === 'yearly' && (
          <>
            <span className="font-medium">Every year on</span>
            <select className={sel} value={f.dueDay ?? 31} onChange={(e) => set({ dueDay: Number(e.target.value) })} aria-label="Day">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select className={sel} value={f.dueMonth ?? 3} onChange={(e) => set({ dueMonth: Number(e.target.value) })} aria-label="Month">
              {MN.slice(1).map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </>
        )}
        {cad === 'one-time' && (
          <>
            <span className="font-medium">Once, on</span>
            <input className={sel} type="date" value={oneTimeDate} onChange={(e) => set({ dueDate: e.target.value || undefined })} aria-label="Due date" />
          </>
        )}
      </div>

      {cad === 'monthly' && (
        <label className="mt-3 flex items-center gap-2 text-[14px] text-slate-800">
          <input type="checkbox" checked={!!f.arrears} onChange={(e) => set({ arrears: e.target.checked })} className="h-4 w-4 rounded border-slate-400 text-brand-600" />
          It’s for the previous month (e.g. September’s report, due on the {ordinal(f.dueDay ?? 1)} of October)
        </label>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-[14px]">
        <span className="font-semibold text-slate-950">{describe(spec)}</span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-700">Next due:</span>
        {next.length ? (
          next.map((o) => (
            <span key={o.due} className="rounded-md bg-white px-2 py-0.5 text-[14px] text-slate-900 ring-1 ring-slate-300">
              {periodLabel(o.due)}
            </span>
          ))
        ) : (
          <span className="text-amber-700">no upcoming date</span>
        )}
        <label className="ml-auto flex items-center gap-2 text-slate-700">
          Remind from
          <select className={sel} value={f.remindDaysBefore ?? 2} onChange={(e) => set({ remindDaysBefore: Number(e.target.value) })}>
            {[0, 1, 2, 3, 5, 7, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'the due day' : `${n} day${n > 1 ? 's' : ''} before`}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}

export function TaskEditor({
  task,
  members,
  areas,
  onSave,
  onDelete,
  onCancel,
  bare,
}: {
  /** Inside a modal: no card border. */
  bare?: boolean;
  task?: WorkTask;
  members: TeamMember[];
  areas: string[];
  onSave: (t: Partial<WorkTask>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<Partial<WorkTask>>(
    () => task ?? { title: '', area: areas[0] ?? 'General', cadence: 'monthly', dueDay: 10, ownerIds: [], remindDaysBefore: 2, active: true },
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const anchors = useMemo(handbookAnchors, []);
  const set = (p: Partial<WorkTask>) => setF((x) => ({ ...x, ...p }));
  const cad = f.cadence ?? 'monthly';

  const submit = async () => {
    setBusy(true);
    setMsg('');
    try {
      await onSave(f);
      setMsg('Saved');
      if (!task) onCancel?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={bare ? 'space-y-4' : 'space-y-4 rounded-lg border border-slate-200 bg-white p-4'}>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className={lbl}>Task</label>
          <input className={input} value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. File GSTR-1" />
        </div>
        <div>
          <label className={lbl}>Area</label>
          <input className={input} list="task-areas" value={f.area ?? ''} onChange={(e) => set({ area: e.target.value })} />
          <datalist id="task-areas">
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className={lbl}>Role</label>
        <p className="-mt-0.5 mb-1.5 text-sm text-slate-600">e.g. Accountant, CA, HR. Separate several with “/”. Used by the head filter and Who does what.</p>
        <input className={input} value={f.roleLabel ?? ''} onChange={(e) => set({ roleLabel: e.target.value })} placeholder="e.g. CA / Accounts Manager" />
      </div>

      <div>
        <label className={lbl}>Owners</label>
        <div className="flex flex-wrap gap-1.5">
          {members.length ? (
            members.map((m) => {
              const on = f.ownerIds?.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => set({ ownerIds: on ? f.ownerIds!.filter((x) => x !== m.id) : [...(f.ownerIds ?? []), m.id] })}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                    on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Avatar m={m} size="h-6 w-6 text-[11px]" />
                  {m.name}
                  {on && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
                </button>
              );
            })
          ) : (
            <span className="text-sm text-slate-600">Add people in Settings (People & reminders) first.</span>
          )}
        </div>
      </div>

      <ScheduleBuilder f={f} set={set} />

      <div>
        <label className={lbl}>How to do it (Accounts Handbook section)</label>
        <select className={input} value={f.howTo ?? ''} onChange={(e) => set({ howTo: e.target.value })}>
          <option value="">— none —</option>
          {getHandbook().collections.map((c) => (
            <optgroup key={c.slug} label={c.title}>
              {anchors
                .filter((x) => x.a.collection === c)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.a.title}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div>
        <label className={lbl}>Notes</label>
        <textarea className={input} rows={2} value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
        {(f.form || f.authority || f.penalty) && (
          <p className="mt-1.5 text-sm text-slate-600">
            {[f.form && `Form: ${f.form}`, f.authority && `Authority: ${f.authority}`, f.penalty && `Penalty: ${f.penalty}`].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <div>
        <label className={lbl}>References</label>
        <p className="-mt-0.5 mb-1.5 text-sm text-slate-600">Handbook sections, MIS pages or portals. Shown on the task and in emails.</p>
        <div className="space-y-1.5">
          {(f.links ?? []).map((l, i) => (
            <div key={i} className="flex gap-1.5">
              <input
                className={`${input} w-2/5`}
                value={l.label}
                placeholder="Label"
                onChange={(e) => set({ links: f.links!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
              />
              <input
                className={input}
                value={l.url}
                placeholder="/handbook#c7 or https://…"
                onChange={(e) => set({ links: f.links!.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })}
              />
              <button
                type="button"
                onClick={() => set({ links: f.links!.filter((_, j) => j !== i) })}
                className="flex w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Remove reference"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set({ links: [...(f.links ?? []), { label: '', url: '' }] })}
            className="inline-flex min-h-[36px] items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add reference
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="mr-auto text-sm text-slate-600">{describe({ cadence: cad, ...f } as WorkTask)}</span>
        {msg && <span className={`text-sm ${msg === 'Saved' ? 'text-emerald-700' : 'text-rose-700'}`}>{msg}</span>}
        {task && onDelete && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete “${task.title}” and its history?`)) void onDelete(task.id);
            }}
            className={`${btnGhost} hover:!bg-rose-50 hover:!text-rose-700`}
          >
            <TrashIcon className="h-4 w-4" /> Delete
          </button>
        )}
        {task && (
          <label className="flex min-h-[40px] items-center gap-1.5 px-1 text-sm text-slate-700">
            <input type="checkbox" checked={f.active !== false} onChange={(e) => set({ active: e.target.checked })} className="rounded text-brand-600" />
            Active
          </label>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className={btnGhost}>
            Cancel
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void submit()} className={btnPrimary}>
          {busy ? 'Saving…' : task ? 'Save' : 'Add task'}
        </button>
      </div>
    </div>
  );
}
