// ============================================================================
// TASKS — one page for all recurring work. Primary job: "what do I need to do
// now, and tick it off". Everything else (schedule, how-to, owners, reminders,
// history) sits one click away in the task's panel, the Filters popover, the
// folded daily-email strip, or Settings (People & reminders).
//
// Pieces: taskModel.ts (agenda + filters), TasksToolbar, Agenda (To do view +
// daily email strip), MonthView, AllTasks, TaskPanel, TaskEditor,
// SettingsCards (used by TasksSettingsPage), ui.tsx (shared bits).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Cog6ToothIcon, ExclamationCircleIcon, PlusIcon, UserCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Modal } from '../../components/ui/overlays';
import { diffDays, todayIST } from '../../data/work/schedule';
import { deleteTask, deleteTasks, getWork, importSeed, saveTask, setTaskDone, type TeamMember, type WorkState, type WorkTask } from '../../data/work/workClient';
import { buildSeed } from '../../data/work/seed';
import { useDensity } from '../../hooks/useDensity';
import { Agenda, DailyEmailStrip } from './Agenda';
import { AllTasks } from './AllTasks';
import { MonthView } from './MonthView';
import { EmailPreview } from './SettingsCards';
import { TaskEditor } from './TaskEditor';
import { KINDS, NO_FILTERS, buildAgenda, inHead, readLS, unownedTasks, writeLS, type Filters, type Item, type View, type Who } from './taskModel';
import { TasksToolbar } from './TasksToolbar';
import { TasksHeader, btnPrimary, focusRing } from './ui';

export function TasksPage() {
  const [state, setState] = useState<WorkState | null>(null);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [view, setView] = useState<View>('agenda');
  const [me, setMe] = useState(() => readLS('tasks:me'));
  const [who, setWhoRaw] = useState<Who>(() => (readLS('tasks:me') ? 'mine' : 'all'));
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState(false);
  const [params, setParams] = useSearchParams();
  const [density] = useDensity();
  const compact = density === 'compact';
  const today = todayIST();
  const setWho = useCallback((w: Who) => setWhoRaw(w && w === me ? 'mine' : w), [me]);

  // Links from the daily emails: /tasks?task=<id> opens that task, /tasks?who=<memberId> filters.
  const linkTask = params.get('task');
  const linkWho = params.get('who');
  // Runs whenever a link lands (also in-app ones, e.g. "Do this after"); the
  // params are cleared afterwards, so each link is handled once.
  useEffect(() => {
    if (!state || (!linkTask && !linkWho)) return;
    if (linkWho && state.members.some((m) => m.id === linkWho)) setWho(linkWho);
    if (linkTask && state.tasks.some((t) => t.id === linkTask)) {
      setWhoRaw('all');
      setFilters(NO_FILTERS);
      setQ('');
      setView('all');
      setOpenKey(`all:${linkTask}`);
      setTimeout(() => document.getElementById(`task-${linkTask}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
    setParams({}, { replace: true });
  }, [state, linkTask, linkWho, setParams, setWho]);

  const load = useCallback(async () => {
    try {
      let s = await getWork();
      if (!s.seededAt) {
        setSeeding(true);
        const seed = await buildSeed();
        await importSeed(seed.tasks, seed.done);
        s = await getWork();
      }
      setState(s);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tasks.');
    } finally {
      setSeeding(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const members = useMemo(() => state?.members ?? [], [state]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const areas = useMemo(() => [...new Set((state?.tasks ?? []).map((t) => t.area))].sort(), [state]);
  const { head, area, kind, when } = filters;

  const matchesBase = useCallback(
    (t: WorkTask) => {
      if (kind && !KINDS.find((x) => x.k === kind)!.test(t)) return false;
      if (who === 'mine' && !(me && t.ownerIds.includes(me))) return false;
      if (who === 'unassigned' && t.ownerIds.length) return false;
      if (who !== 'all' && who !== 'mine' && who !== 'unassigned' && !t.ownerIds.includes(who)) return false;
      if (q) {
        const s = q.toLowerCase();
        const hay = `${t.title} ${t.area} ${t.description ?? ''} ${t.roleLabel ?? ''} ${t.form ?? ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    },
    [who, me, q, kind],
  );
  const matches = useCallback(
    (t: WorkTask) => {
      const h = head ? state?.heads?.find((x) => x.id === head) : undefined;
      return (!area || t.area === area) && (!h || inHead(t, h)) && matchesBase(t);
    },
    [area, head, matchesBase, state],
  );
  /** Task count per head under the other filters (for the head selector). */
  const headCounts = useMemo(() => {
    const base = (state?.tasks ?? []).filter((t) => (!area || t.area === area) && matchesBase(t));
    return { total: base.length, by: new Map((state?.heads ?? []).map((h) => [h.id, base.filter((t) => inHead(t, h)).length])) };
  }, [state, area, matchesBase]);

  const agenda = useMemo(() => (state ? buildAgenda(state, today) : []), [state, today]);
  const filtered = useMemo(() => agenda.filter((i) => matches(i.task)), [agenda, matches]);
  const counts = useMemo(
    () => ({
      late: filtered.filter((i) => !i.done && i.due < today).length,
      today: filtered.filter((i) => !i.done && i.due === today).length,
      week: filtered.filter((i) => !i.done && i.due > today && diffDays(i.due, today) <= 7).length,
    }),
    [filtered, today],
  );
  const anyFilter = !!(head || area || kind || when || q || who !== 'all');

  // --- mutations (optimistic, then refresh) ---
  const toggle = async (i: Item) => {
    if (!state) return;
    const next = !state.done[i.task.id]?.[i.period];
    setState((s) => {
      if (!s) return s;
      const m = { ...(s.done[i.task.id] ?? {}) };
      if (next) m[i.period] = { at: new Date().toISOString(), by: me || undefined };
      else delete m[i.period];
      return { ...s, done: { ...s.done, [i.task.id]: m } };
    });
    try {
      await setTaskDone(i.task.id, i.period, next, me || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      void load();
    }
  };

  const onSaveTask = async (t: Partial<WorkTask>) => {
    await saveTask(t);
    await load();
  };
  const onDeleteTasks = async (ids: string[]) => {
    await deleteTasks(ids);
    setOpenKey(null);
    await load();
  };
  const onDeleteTask = async (id: string) => {
    await deleteTask(id);
    setOpenKey(null);
    await load();
  };

  const chooseMe = (id: string) => {
    setMe(id);
    writeLS('tasks:me', id);
    setWhoRaw(id ? 'mine' : 'all');
  };

  const sub = !state
    ? 'What’s due, who does it, and how.'
    : [counts.late ? `${counts.late} late` : '', `${counts.today} due today`, `${counts.week} more this week`].filter(Boolean).join(' · ');

  const header = (
    <TasksHeader title="Tasks" sub={sub}>
      <MePicker me={me} members={members} onMe={chooseMe} />
      <Link
        to="/tasks/settings"
        aria-label="People & reminders settings"
        title="People & reminders"
        className={`flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900 ${focusRing}`}
      >
        <Cog6ToothIcon className="h-5 w-5" />
      </Link>
      <button type="button" onClick={() => setAdding(true)} disabled={!state} className={btnPrimary}>
        <PlusIcon className="h-4 w-4" strokeWidth={2.5} /> Add task
      </button>
    </TasksHeader>
  );

  if (!state) {
    return (
      <div className="tasks-ui pb-16">
        {header}
        <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-slate-600 sm:px-6 lg:px-8">
          {error ? <span className="text-rose-700">{error}</span> : seeding ? 'Setting up — bringing over the tasks from the old Tasks & Compliance and Ownership pages…' : 'Loading tasks…'}
        </div>
      </div>
    );
  }

  const unowned = unownedTasks(state).length;

  return (
    <div className="tasks-ui pb-16">
      {header}

      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-5 sm:px-6 lg:px-8">
        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
            {error}
            <button type="button" onClick={() => setError('')} aria-label="Dismiss" className={`flex h-8 w-8 items-center justify-center rounded ${focusRing}`}>
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        <div>
          <TasksToolbar
            view={view}
            setView={setView}
            who={who}
            setWho={setWho}
            me={me}
            members={members}
            q={q}
            setQ={setQ}
            filters={filters}
            setFilters={setFilters}
            heads={state.heads}
            headCounts={headCounts}
            areas={areas}
          />
        </div>

        {unowned > 0 && who !== 'unassigned' && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
            <ExclamationCircleIcon className="h-5 w-5 shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] text-slate-800 sm:basis-auto">
              {unowned} task{unowned > 1 ? 's have' : ' has'} no owner, so nobody gets reminded.
            </span>
            <button
              type="button"
              onClick={() => {
                setWhoRaw('unassigned');
                setView('all');
              }}
              className={`min-h-[36px] rounded px-1 font-medium text-slate-700 hover:text-slate-950 hover:underline ${focusRing}`}
            >
              Show them
            </button>
            <Link to="/tasks/settings#roles" className={`min-h-[36px] content-center rounded px-1 font-semibold text-brand-700 hover:underline ${focusRing}`}>
              Assign owners
            </Link>
          </div>
        )}

        {view === 'month' ? (
          <MonthView
            state={state}
            matches={matches}
            today={today}
            memberById={memberById}
            onOpenTask={(id) => {
              setView('all');
              setOpenKey(`all:${id}`);
              setTimeout(() => document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
            }}
          />
        ) : view === 'agenda' ? (
          <Agenda
            state={state}
            items={filtered}
            today={today}
            when={when}
            compact={compact}
            memberById={memberById}
            members={members}
            areas={areas}
            openKey={openKey}
            setOpenKey={setOpenKey}
            filtered={anyFilter}
            onClearAll={() => {
              setFilters(NO_FILTERS);
              setQ('');
              setWhoRaw('all');
            }}
            onToggle={(i) => void toggle(i)}
            onSave={onSaveTask}
            onDelete={onDeleteTask}
            reload={load}
          />
        ) : (
          <AllTasks
            state={state}
            matches={matches}
            memberById={memberById}
            openKey={openKey}
            setOpenKey={setOpenKey}
            members={members}
            areas={areas}
            compact={compact}
            onSave={onSaveTask}
            onDelete={onDeleteTask}
            onDeleteMany={onDeleteTasks}
            onReload={load}
          />
        )}

        <div className="pt-4">
          <DailyEmailStrip state={state} agenda={agenda} today={today} onPreview={() => setPreview(true)} />
        </div>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a task" width={760}>
        <TaskEditor bare members={members} areas={areas} onSave={onSaveTask} onCancel={() => setAdding(false)} />
      </Modal>
      <Modal open={preview} onClose={() => setPreview(false)} title="Today’s emails" subtitle="A preview — nothing is sent from here." width={900}>
        <EmailPreview embedded onClose={() => setPreview(false)} />
      </Modal>
    </div>
  );
}

/** "Who are you?" — drives "Me" and who ticked what. */
function MePicker({ me, members, onMe }: { me: string; members: TeamMember[]; onMe: (id: string) => void }) {
  return (
    <label className={`relative flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white pl-2.5 text-sm focus-within:ring-2 focus-within:ring-brand-400 ${me ? 'text-slate-900' : 'text-slate-600'}`}>
      <UserCircleIcon className="h-5 w-5 shrink-0 text-slate-500" />
      <span className="sr-only">Who are you?</span>
      <select value={me} onChange={(e) => onMe(e.target.value)} className="min-h-[38px] max-w-[180px] cursor-pointer appearance-none border-0 bg-transparent py-0 pl-2 pr-8 text-sm font-medium focus:outline-none focus:ring-0">
        <option value="">Who are you?</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default TasksPage;
