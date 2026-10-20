// The expanded task: the facts (schedule, area, period), what it waits on,
// the checklist for this period, then tabs — How to · Details & owners ·
// Reminders · History.

import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowTopRightOnSquareIcon, BellAlertIcon, BookOpenIcon, CloudArrowUpIcon, LinkIcon } from '@heroicons/react/24/outline';
import { getHandbook } from '../../data/handbook/handbook';
import { addDays, describe, occurrences, parseYmd, todayIST, ymd } from '../../data/work/schedule';
import { remindTask, setTaskCheck, type TeamMember, type WorkState, type WorkTask } from '../../data/work/workClient';
import { currentPeriod, hourLabelIST, periodLabel } from './taskModel';
import { TaskEditor } from './TaskEditor';
import { TickBox, btnSecondary, focusRing } from './ui';
import '../handbook/handbook.generated.css';
import '../handbook/handbook.ui.css';

/** "Do after": the tasks this one depends on, with their latest status. */
function DependsOn({ task, state, today }: { task: WorkTask; state: WorkState; today: string }) {
  const deps = (task.dependsOn ?? []).map((id) => state.tasks.find((t) => t.id === id)).filter((t): t is WorkTask => !!t && t.active);
  if (!deps.length) return null;
  const status = (t: WorkTask) => {
    const occ = occurrences(t, ymd(addDays(parseYmd(today), -45)), today);
    const last = occ[occ.length - 1];
    if (!last) return { ok: true, text: 'nothing due yet' };
    const done = !!state.done[t.id]?.[last.period] || !!state.autoDone[t.id]?.includes(last.period);
    return { ok: done, text: `${done ? 'done' : 'not done'} for ${periodLabel(last.period)}` };
  };
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Do this after</h3>
      <ul className="space-y-1">
        {deps.map((t) => {
          const st = status(t);
          return (
            <li key={t.id}>
              <Link to={`/tasks?task=${encodeURIComponent(t.id)}`} className={`inline-flex items-center gap-2 rounded text-sm text-slate-800 hover:text-brand-700 hover:underline ${focusRing}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${st.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="font-medium">{t.title}</span>
                <span className={st.ok ? 'text-emerald-700' : 'text-amber-800'}>· {st.text}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Sub-steps for this period (banks, platforms, vendors…). All ticked → the task is done. */
function Checklist({ task, state, period, reload }: { task: WorkTask; state: WorkState; period: string; reload?: () => Promise<void> }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(state.checks?.[task.id]?.[period] ?? []));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const items = task.checklist ?? [];
  const toggle = async (id: string) => {
    const next = !checked.has(id);
    setBusy(id);
    setErr('');
    setChecked((c) => {
      const n = new Set(c);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
    try {
      const r = await setTaskCheck(task.id, period, id, next);
      setChecked(new Set(r.checks));
      if (r.done && reload) await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Checklist for {periodLabel(period)}</h3>
        <span className="text-sm tabular-nums text-slate-600">
          {checked.size} of {items.length}
        </span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {items.map((c) => {
          const on = checked.has(c.id);
          return (
            <li key={c.id} className="flex items-center gap-3 px-3 py-1.5">
              <TickBox small on={on} disabled={busy === c.id} onClick={() => void toggle(c.id)} label={on ? `Untick ${c.label}` : `Tick ${c.label}`} />
              <span className="min-w-0 flex-1 py-1">
                <span className={`block text-sm font-medium ${on ? 'text-slate-500 line-through' : 'text-slate-950'}`}>{c.label}</span>
                {c.hint && <span className="block text-sm text-slate-600">{c.hint}</span>}
              </span>
              {c.link &&
                (c.link.startsWith('/') ? (
                  <Link to={c.link} className={`shrink-0 rounded text-sm font-semibold text-brand-700 hover:underline ${focusRing}`}>
                    How to
                  </Link>
                ) : (
                  <a href={c.link} target="_blank" rel="noreferrer" className={`shrink-0 rounded text-sm font-semibold text-brand-700 hover:underline ${focusRing}`}>
                    Open
                  </a>
                ))}
            </li>
          );
        })}
      </ul>
      {err && <p className="mt-1 text-sm text-rose-700">{err}</p>}
      <p className="mt-1 text-sm text-slate-500">Tick every item and the task is marked done.</p>
    </div>
  );
}

/** Task-level reminders: who gets emailed, when, last sent; on/off and send now. */
function ReminderStrip({ task, state, members, onSave }: { task: WorkTask; state: WorkState; members: TeamMember[]; onSave: (t: Partial<WorkTask>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const owners = members.filter((m) => task.ownerIds.includes(m.id));
  const on = task.remind !== false;
  const last = state.reminded?.[task.id];
  const days = task.remindDaysBefore ?? 2;
  const hour = hourLabelIST(state.settings.sendHour);
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  const sendNow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await remindTask(task.id);
      const sent = r.emails.filter((e) => e.sent).length;
      const err = r.emails.find((e) => e.error && !e.dryRun)?.error;
      setMsg(
        sent
          ? { ok: true, text: `Sent to ${owners.map((o) => o.name).join(', ')}.` }
          : r.emails.some((e) => e.dryRun)
            ? { ok: false, text: 'Email isn’t connected — nothing was sent (see People & reminders).' }
            : { ok: false, text: err ?? 'Not sent.' },
      );
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Not sent.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2 text-sm">
        <BellAlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <p className="min-w-0 flex-1 text-slate-700">
          {!on ? (
            'Reminders are off for this task.'
          ) : !owners.length ? (
            <>No owner, so it only shows in the team summary. Assign someone in Details &amp; owners.</>
          ) : (
            <>
              Emails <b className="font-semibold text-slate-900">{owners.map((o) => o.name).join(', ')}</b> every day at {hour}, from {days === 0 ? 'the due day' : `${days} day${days > 1 ? 's' : ''} before`}, until ticked.
              <span className="block text-slate-500">
                {last ? `Last sent ${fmt(last)}` : 'Not sent yet'}
                {!state.settings.enabled && <span className="text-amber-800"> · daily emails are paused</span>}
              </span>
            </>
          )}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {on && owners.length > 0 && (
          <button type="button" disabled={busy} onClick={() => void sendNow()} className={btnSecondary}>
            {busy ? 'Sending…' : 'Send reminder now'}
          </button>
        )}
        <button type="button" onClick={() => void onSave({ id: task.id, remind: !on })} className={btnSecondary}>
          {on ? 'Turn reminders off' : 'Turn reminders on'}
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p>}
    </div>
  );
}

/** A reference link: in-app paths stay in the app, others open in a new tab. */
function RefLink({ l }: { l: { label: string; url: string } }) {
  const cls = `inline-flex min-h-[32px] items-center gap-1 rounded-md px-1 text-sm font-medium text-brand-700 hover:underline ${focusRing}`;
  return l.url.startsWith('/') ? (
    <Link to={l.url} className={cls}>
      {l.url.startsWith('/handbook') ? <BookOpenIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
      {l.label}
    </Link>
  ) : (
    <a href={l.url} target="_blank" rel="noreferrer" className={cls}>
      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
      {l.label}
    </a>
  );
}

function HowTo({ task, onPick }: { task: WorkTask; onPick: () => void }) {
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const art = task.howTo ? getHandbook().idToArticle.get(task.howTo) : undefined;

  useLayoutEffect(() => {
    if (!art || !task.howTo || !box.current) return;
    const el = box.current.querySelector<HTMLElement>(`[id="${CSS.escape(task.howTo)}"]`);
    box.current.scrollTop = el && el.offsetTop > 40 ? el.offsetTop - 12 : 0;
  }, [art, task.howTo]);

  if (!art)
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
        No Handbook section linked yet.{' '}
        <button type="button" onClick={onPick} className={`rounded font-medium text-brand-700 hover:underline ${focusRing}`}>
          Link one
        </button>
        {task.description ? <p className="mt-2 text-slate-700">{task.description}</p> : null}
      </div>
    );

  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    e.preventDefault();
    navigate(`/handbook${href}`);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
        <div className="min-w-0 text-sm">
          <span className="text-slate-600">{art.collection.title} · </span>
          <span className="font-semibold text-slate-950">{art.title}</span>
        </div>
        <Link to={`/handbook#${task.howTo}`} className={`inline-flex shrink-0 items-center gap-1 rounded text-sm font-medium text-brand-700 hover:underline ${focusRing}`}>
          Open in Handbook <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </Link>
      </div>
      <div ref={box} className="relative max-h-[520px] overflow-y-auto px-4 py-3">
        <div className="hb" onClick={onClick} dangerouslySetInnerHTML={{ __html: art.html }} />
      </div>
    </div>
  );
}

type Tab = 'how' | 'edit' | 'remind' | 'history';

/** Expanded task panel. */
export function TaskPanel({
  task,
  state,
  members,
  areas,
  onSave,
  onDelete,
  period,
  reload,
}: {
  task: WorkTask;
  state: WorkState;
  members: TeamMember[];
  areas: string[];
  onSave: (t: Partial<WorkTask>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** The period being worked on (agenda row); defaults to the current open one. */
  period?: string;
  reload?: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>(task.howTo ? 'how' : 'edit');
  const today = todayIST();
  const workPeriod = period ?? currentPeriod(task, state, today);
  const history = Object.entries(state.done[task.id] ?? {}).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const byId = new Map(members.map((m) => [m.id, m]));
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    const url = `${window.location.origin}/tasks?task=${encodeURIComponent(task.id)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link', url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const auto = !!(workPeriod && state.autoDone[task.id]?.includes(workPeriod));
  const facts = [describe(task), task.area, workPeriod && `for ${periodLabel(workPeriod)}`, task.roleLabel && `Role: ${task.roleLabel}`].filter(Boolean);
  const tabs: [Tab, string][] = [
    ['how', 'How to do it'],
    ['edit', 'Details & owners'],
    ['remind', 'Reminders'],
    ['history', `History${history.length ? ` (${history.length})` : ''}`],
  ];

  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50/70 px-3 pb-4 pt-3 sm:px-4 sm:pl-[60px]">
      <div className="space-y-1">
        <p className="text-sm text-slate-700">{facts.join(' · ')}</p>
        {task.upload && (
          <p className="inline-flex items-center gap-1.5 text-sm text-slate-700">
            <CloudArrowUpIcon className="h-4 w-4 text-slate-500" />
            {auto ? 'File uploaded — ticked automatically.' : 'Ticks itself when the file is uploaded.'}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3">
          {(task.links ?? []).map((l) => (
            <RefLink key={l.url} l={l} />
          ))}
          <button type="button" onClick={() => void copyLink()} className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-1 text-sm font-medium text-slate-600 hover:text-brand-700 ${focusRing}`}>
            <LinkIcon className="h-4 w-4" />
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      </div>

      {(task.dependsOn?.length ?? 0) > 0 && <DependsOn task={task} state={state} today={today} />}
      {(task.checklist?.length ?? 0) > 0 && workPeriod && <Checklist task={task} state={state} period={workPeriod} reload={reload} />}

      <div>
        <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200">
          {tabs.map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`-mb-px min-h-[40px] shrink-0 border-b-2 px-3 text-sm font-medium ${focusRing} ${
                tab === k ? 'border-brand-500 text-slate-950' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        {tab === 'how' && <HowTo task={task} onPick={() => setTab('edit')} />}
        {tab === 'edit' && <TaskEditor task={task} members={members} areas={areas} onSave={onSave} onDelete={onDelete} />}
        {tab === 'remind' && <ReminderStrip task={task} state={state} members={members} onSave={onSave} />}
        {tab === 'history' &&
          (history.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
              {history.slice(0, 24).map(([p, e]) => (
                <li key={p} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-2">
                  <span className="font-medium text-slate-900">{periodLabel(p)}</span>
                  <span className="text-slate-600">
                    {new Date(e.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    {e.by && byId.get(e.by) ? ` · ${byId.get(e.by)!.name}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">Not ticked yet.</p>
          ))}
      </div>
    </div>
  );
}
