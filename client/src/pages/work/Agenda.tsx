// "To do" view: Late / Today / This week / Later, each a folding group of
// simple rows (tick box, title, one quiet line). Everything else about a task
// lives in its expanded panel.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellAlertIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { diffDays } from '../../data/work/schedule';
import type { TeamMember, WorkState, WorkTask } from '../../data/work/workClient';
import { readFold, writeFold } from '../../hooks/useDensity';
import { GROUPS, dueLabel, groupOf, hourLabelIST, inTodaysEmail, ownerNames, periodLabel, trackingStart, type Item, type When } from './taskModel';
import { TaskPanel } from './TaskPanel';
import { Avatar, Fold, TickBox, btnSecondary, focusRing } from './ui';

/** Days ahead shown in "Later" before "Show more". */
const LATER_CAP = 14;

function TaskRow({
  item,
  today,
  memberById,
  open,
  compact,
  checks,
  onOpen,
  onToggle,
  children,
}: {
  item: Item;
  today: string;
  memberById: Map<string, TeamMember>;
  open: boolean;
  compact: boolean;
  checks?: string[];
  onOpen: () => void;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const { task, done, auto } = item;
  const due = dueLabel(item.due, today);
  const owners = ownerNames(task.ownerIds, memberById);
  const total = task.checklist?.length ?? 0;
  const ticked = checks?.length ?? 0;
  const dueText = done ? (auto ? 'Done · file uploaded' : 'Done') : due.text;
  const dueCls = done ? 'text-emerald-700' : due.late ? 'font-medium text-rose-700' : '';
  return (
    <li>
      <div className={`flex items-center gap-2 pl-3 sm:gap-3 sm:pl-4 ${compact ? 'min-h-[40px]' : 'min-h-[60px]'}`}>
        <TickBox
          on={done}
          onClick={onToggle}
          disabled={auto}
          small={compact}
          label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
          title={auto ? 'Ticked automatically — the file has been uploaded' : done ? 'Mark not done' : 'Mark done'}
        />
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          className={`flex min-w-0 flex-1 items-center gap-3 self-stretch pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 sm:pr-4 ${compact ? 'py-1' : 'py-2'}`}
        >
          <span className="min-w-0 flex-1">
            <span className={`block text-[15px] font-medium ${open ? '' : 'truncate'} ${done ? 'text-slate-500 line-through' : 'text-slate-950'}`} title={task.title}>
              {task.title}
            </span>
            {!compact && (
              <span className="block truncate text-sm text-slate-600">
                {owners ? owners : <span className="text-slate-500">No owner</span>}
                <span className="text-slate-400"> · </span>
                <span className={dueCls}>{dueText}</span>
              </span>
            )}
          </span>
          {total > 0 && !done && (
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-sm tabular-nums text-slate-700" title={`Checklist: ${ticked} of ${total} ticked`}>
              {ticked}/{total}
            </span>
          )}
          {compact && <span className={`shrink-0 whitespace-nowrap text-sm ${dueCls || 'text-slate-600'}`}>{dueText}</span>}
          <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {children}
    </li>
  );
}

export function Agenda({
  state,
  items,
  today,
  when,
  compact,
  memberById,
  members,
  areas,
  openKey,
  setOpenKey,
  filtered,
  onClearAll,
  onToggle,
  onSave,
  onDelete,
  reload,
}: {
  state: WorkState;
  items: Item[];
  today: string;
  when: When;
  compact: boolean;
  memberById: Map<string, TeamMember>;
  members: TeamMember[];
  areas: string[];
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
  /** Any filter or search active (changes the empty-state wording). */
  filtered: boolean;
  onClearAll?: () => void;
  onToggle: (i: Item) => void;
  onSave: (t: Partial<WorkTask>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [moreLater, setMoreLater] = useState(false);
  const shown = items.filter((i) =>
    when === 'overdue' ? !i.done && i.due < today : when === 'today' ? i.due === today : when === 'week' ? i.due >= today && diffDays(i.due, today) <= 7 : true,
  );
  const start = trackingStart(state, today);

  if (!shown.length)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
        <p className="text-[15px] font-medium text-slate-900">{filtered ? 'Nothing matches these filters.' : 'Nothing due. You’re all caught up.'}</p>
        {filtered && onClearAll && (
          <button type="button" onClick={onClearAll} className="mt-3 inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
            Show everything
          </button>
        )}
      </div>
    );

  return (
    <div className="space-y-5">
      {GROUPS.map((g) => {
        let list = shown.filter((i) => groupOf(i.due, today) === g.key);
        if (!list.length) {
          if (g.key !== 'today' || when) return null;
          return (
            <div key={g.key} className="flex min-h-[40px] items-center gap-2 px-1 text-[15px]">
              <span className="w-4" />
              <span className="font-semibold text-slate-900">Today</span>
              <span className="text-sm text-slate-500">Nothing due today.</span>
            </div>
          );
        }
        const openN = list.filter((i) => !i.done).length;
        const doneN = list.length - openN;
        const hidden = g.key === 'later' && !moreLater ? list.filter((i) => diffDays(i.due, today) > LATER_CAP).length : 0;
        if (hidden) list = list.filter((i) => diffDays(i.due, today) <= LATER_CAP);
        return (
          <Fold
            key={g.key}
            id={`tasks:group:${g.key}`}
            defaultOpen={g.key !== 'later'}
            forceOpen={!!when}
            tone={g.key === 'overdue' ? 'late' : 'default'}
            title={g.title}
            meta={
              <>
                {openN} to do{doneN ? ` · ${doneN} done` : ''}
              </>
            }
          >
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {list.map((i) => {
                const key = `${i.task.id}@${i.period}`;
                const open = openKey === key;
                return (
                  <TaskRow
                    key={key}
                    item={i}
                    today={today}
                    memberById={memberById}
                    compact={compact}
                    open={open}
                    checks={state.checks?.[i.task.id]?.[i.period]}
                    onOpen={() => setOpenKey(open ? null : key)}
                    onToggle={() => onToggle(i)}
                  >
                    {open && <TaskPanel task={i.task} state={state} members={members} areas={areas} onSave={onSave} onDelete={onDelete} period={i.period} reload={reload} />}
                  </TaskRow>
                );
              })}
            </ul>
            {(hidden > 0 || (g.key === 'later' && moreLater)) && (
              <button type="button" onClick={() => setMoreLater(!moreLater)} className={`mt-1 min-h-[40px] rounded-lg px-2 text-sm font-medium text-brand-700 hover:underline ${focusRing}`}>
                {moreLater ? 'Show the next 2 weeks only' : `Show ${hidden} more (next 5 weeks)`}
              </button>
            )}
          </Fold>
        );
      })}
      {diffDays(today, start) < 45 && <p className="px-1 text-sm text-slate-500">Tracking started {periodLabel(start)}. Anything due before that isn’t counted as late.</p>}
    </div>
  );
}

/** Today's reminder email, folded into one line: status and when it goes; open for who gets what. */
export function DailyEmailStrip({ state, agenda, today, onPreview }: { state: WorkState; agenda: Item[]; today: string; onPreview: () => void }) {
  const st = state.settings;
  const [open, setOpen] = useState(() => readFold('tasks:daily-email', false));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const ist = new Date(now + 5.5 * 3_600_000);
  const minsToSend = st.sendHour * 60 - (ist.getUTCHours() * 60 + ist.getUTCMinutes());
  const sentToday = state.lastScheduledDay === today;
  const items = agenda.filter((i) => inTodaysEmail(i, state, today));
  const people = state.members
    .map((m) => {
      const mine = items.filter((i) => i.task.ownerIds.includes(m.id));
      return { m, n: mine.length, late: mine.filter((i) => i.due < today).length, pending: mine.some((i) => i.due <= today) };
    })
    .filter((p) => p.pending);
  const unowned = agenda.filter((i) => !i.done && i.due <= today && !i.task.ownerIds.some((id) => state.members.some((m) => m.id === id))).length;
  const status = !st.enabled ? 'Paused' : !state.mailer.configured ? 'Email not connected' : sentToday ? 'Sent today' : 'Scheduled';
  const warn = st.enabled && !state.mailer.configured;
  const when = !st.enabled
    ? 'Daily emails are switched off.'
    : sentToday
      ? `Sent today${state.lastReminderRun ? ` at ${new Date(state.lastReminderRun.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''} · next tomorrow ${hourLabelIST(st.sendHour)}`
      : minsToSend > 0
        ? `Goes out at ${hourLabelIST(st.sendHour)} (in ${Math.floor(minsToSend / 60) ? `${Math.floor(minsToSend / 60)}h ` : ''}${minsToSend % 60}m)`
        : `Due now (${hourLabelIST(st.sendHour)}) — sends within the hour`;
  const flip = () => {
    setOpen(!open);
    writeFold('tasks:daily-email', !open);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={flip} aria-expanded={open} className={`flex min-h-[48px] w-full items-center gap-2 rounded-xl px-4 py-2 text-left hover:bg-slate-50 ${focusRing}`}>
        <BellAlertIcon className="h-5 w-5 shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-slate-900">Daily reminder email</span>
          <span className="text-slate-600"> · {when}</span>
        </span>
        <span className={`hidden shrink-0 text-sm sm:inline ${warn ? 'font-medium text-amber-800' : 'text-slate-600'}`}>{status}</span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm">
          {warn && <p className="font-medium text-amber-800 sm:hidden">{status}</p>}
          {people.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {people.map((p) => (
                <li key={p.m.id} className="flex items-center gap-2.5">
                  <Avatar m={p.m} size="h-7 w-7 text-[12px]" />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{p.m.name}</span>
                  <span className="text-slate-600">
                    {p.n} task{p.n > 1 ? 's' : ''}
                    {p.late ? <span className="text-rose-700"> · {p.late} late</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-700">Nobody has anything pending today, so no owner emails.</p>
          )}
          {unowned > 0 && (
            <p className="text-slate-700">
              {unowned} due task{unowned > 1 ? 's have' : ' has'} no owner and only appear{unowned > 1 ? '' : 's'} in the team summary.
            </p>
          )}
          <p className="text-slate-600">Team summary goes to {st.summaryTo.join(', ') || <span className="text-amber-800">nobody</span>}.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onPreview} className={btnSecondary}>
              Preview emails
            </button>
            <Link to="/tasks/settings#emails" className={btnSecondary}>
              Email settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
