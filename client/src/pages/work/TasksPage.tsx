// ============================================================================
// TASKS & OWNERS — one page for all recurring work: what is due, who owns it,
// how to do it (the Accounts Handbook section, shown in place) and the email
// reminders that chase owners until it is ticked. Replaces the old
// "Tasks & Compliance" and "Ownership" pages (kept under Legacy).
// ============================================================================

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowTopRightOnSquareIcon,
  BellAlertIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardDocumentCheckIcon,
  CloudArrowUpIcon,
  LinkIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { PageHeader } from '../../components/ui/PageHeader';
import { getHandbook, type HbArticle } from '../../data/handbook/handbook';
import { addDays, describe, diffDays, lookbackDays, occurrences, parseYmd, todayIST, ymd, type Cadence } from '../../data/work/schedule';
import {
  deleteMember,
  deleteTask,
  getWork,
  importSeed,
  runWorkReminders,
  saveMember,
  saveSettings,
  saveRouting,
  previewReminders,
  connectMail,
  sendTestMail,
  type ReminderSettings,
  type DraftEmail,
  saveTask,
  setTaskDone,
  type ReminderRun,
  type TeamMember,
  type WorkState,
  type WorkTask,
} from '../../data/work/workClient';
import { buildSeed } from '../../data/work/seed';
import '../handbook/handbook.generated.css';
import '../handbook/handbook.ui.css';

// --- helpers -----------------------------------------------------------------

const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CADENCES: { v: Cadence; l: string }[] = [
  { v: 'daily', l: 'Daily' },
  { v: 'weekly', l: 'Weekly' },
  { v: 'monthly', l: 'Monthly' },
  { v: 'quarterly', l: 'Quarterly' },
  { v: 'half-yearly', l: 'Half-yearly' },
  { v: 'yearly', l: 'Yearly' },
  { v: 'one-time', l: 'One-time' },
];

const readLS = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

function periodLabel(p: string): string {
  if (p === 'once') return 'One-time';
  if (/^\d{4}$/.test(p)) return p;
  if (/^\d{4}-W\d{2}$/.test(p)) return `Week ${Number(p.slice(6))}`;
  if (/^\d{4}-\d{2}$/.test(p)) return `${MN[Number(p.slice(5))]} ${p.slice(0, 4)}`;
  const d = parseYmd(p);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MN[d.getUTCMonth() + 1]}`;
}

function dueLabel(due: string, today: string): { text: string; tone: string } {
  const n = diffDays(due, today);
  const d = parseYmd(due);
  const date = `${d.getUTCDate()} ${MN[d.getUTCMonth() + 1]}`;
  if (n < 0) return { text: `${-n} day${n < -1 ? 's' : ''} late · ${date}`, tone: 'text-rose-600' };
  if (n === 0) return { text: 'Due today', tone: 'text-brand-700' };
  if (n === 1) return { text: 'Tomorrow', tone: 'text-amber-700' };
  if (n < 7) return { text: `${WD[d.getUTCDay()]} ${date}`, tone: 'text-slate-600' };
  return { text: date, tone: 'text-slate-500' };
}

const AVATAR_TONES = ['bg-brand-100 text-brand-800', 'bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800'];
const tone = (id: string) => AVATAR_TONES[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

function Avatar({ m, size = 'h-6 w-6 text-[10px]' }: { m: TeamMember; size?: string }) {
  return (
    <span title={`${m.name} · ${m.email}`} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white ${size} ${tone(m.id)}`}>
      {initials(m.name)}
    </span>
  );
}

/** First anchor id of each handbook article (for the "How to" picker). */
function handbookAnchors(): { id: string; a: HbArticle }[] {
  const seen = new Set<HbArticle>();
  const out: { id: string; a: HbArticle }[] = [];
  for (const [id, a] of getHandbook().idToArticle) {
    if (seen.has(a)) continue;
    seen.add(a);
    out.push({ id, a });
  }
  return out;
}

// --- agenda ------------------------------------------------------------------

interface Item {
  task: WorkTask;
  period: string;
  due: string;
  done: boolean;
  auto: boolean;
}

type Group = 'overdue' | 'today' | 'week' | 'later';
const GROUPS: { key: Group; title: string; hint: string }[] = [
  { key: 'overdue', title: 'Overdue', hint: 'Past the due date and not ticked' },
  { key: 'today', title: 'Today', hint: '' },
  { key: 'week', title: 'Next 7 days', hint: '' },
  { key: 'later', title: 'Coming up', hint: 'Next 5 weeks' },
];

const trackingStart = (state: WorkState, today: string) => (state.seededAt ? todayIST(new Date(state.seededAt)) : today);

function buildAgenda(state: WorkState, today: string): Item[] {
  const out: Item[] = [];
  const t0 = parseYmd(today);
  // Nothing before the tracker was set up counts as overdue (its status is unknown).
  const start = trackingStart(state, today);
  for (const task of state.tasks) {
    if (!task.active) continue;
    const isDone = (p: string) => !!state.done[task.id]?.[p];
    const isAuto = (p: string) => !!state.autoDone[task.id]?.includes(p);
    let from = ymd(addDays(t0, -lookbackDays(task.cadence)));
    if (from < start) from = start;
    const occ = occurrences(task, from, ymd(addDays(t0, 35)));
    let future = 0;
    for (const o of occ) {
      const done = isDone(o.period) || isAuto(o.period);
      if (o.due < today) {
        if (!done) out.push({ task, period: o.period, due: o.due, done, auto: false });
      } else if (o.due === today) {
        out.push({ task, period: o.period, due: o.due, done, auto: isAuto(o.period) });
      } else if (task.cadence !== 'daily' && future++ === 0) {
        // only the next occurrence of each task, so the list stays short
        out.push({ task, period: o.period, due: o.due, done, auto: isAuto(o.period) });
      }
    }
  }
  return out.sort((a, b) => (a.due === b.due ? a.task.title.localeCompare(b.task.title) : a.due < b.due ? -1 : 1));
}

const groupOf = (due: string, today: string): Group => {
  const n = diffDays(due, today);
  return n < 0 ? 'overdue' : n === 0 ? 'today' : n <= 7 ? 'week' : 'later';
};

// --- page --------------------------------------------------------------------

type Who = 'all' | 'mine' | 'unassigned' | string;
type When = '' | 'overdue' | 'today' | 'week';
type Kind = '' | 'daily' | 'weekly' | 'monthly' | 'periodic' | 'uploads' | 'guide';

const KINDS: { k: Exclude<Kind, ''>; l: string; test: (t: WorkTask) => boolean }[] = [
  { k: 'daily', l: 'Daily', test: (t) => t.cadence === 'daily' },
  { k: 'weekly', l: 'Weekly', test: (t) => t.cadence === 'weekly' },
  { k: 'monthly', l: 'Monthly', test: (t) => t.cadence === 'monthly' },
  { k: 'periodic', l: 'Quarterly & yearly', test: (t) => ['quarterly', 'half-yearly', 'yearly', 'one-time'].includes(t.cadence) },
  { k: 'uploads', l: 'MIS uploads', test: (t) => !!t.upload },
  { k: 'guide', l: 'Has a guide', test: (t) => !!t.howTo },
];
/** Heads (functions) for the top selector: matched on a task's role label, then its area. */
const HEADS: { k: string; l: string; roles: string[]; areas: string[] }[] = [
  { k: 'accounts', l: 'Accounts', roles: ['accountant', 'accounts', 'accounts executive', 'accounts manager', 'mis uploads'], areas: ['Daily & monthly books', 'MIS uploads', 'GST, TDS & tax'] },
  { k: 'ca', l: 'CA / Audit', roles: ['ca', 'chartered accountant', 'statutory auditor', 'auditor', 'tax consultant'], areas: [] },
  { k: 'hr', l: 'HR', roles: ['hr', 'payroll', 'icc'], areas: ['HR & payroll'] },
  { k: 'cs', l: 'CS / ROC', roles: ['company secretary', 'cs'], areas: ['MCA / ROC'] },
  { k: 'legal', l: 'Legal', roles: ['legal'], areas: ['Legal & licences'] },
  { k: 'admin', l: 'Admin', roles: ['admin', 'it', 'logistics', 'hse'], areas: ['Admin'] },
  { k: 'quality', l: 'Quality / ISO', roles: ['mr', 'quality', 'qa', 'plant head', 'purchase'], areas: ['ISO / QMS'] },
  { k: 'founders', l: 'CFO / Founder', roles: ['cfo', 'founder'], areas: ['Investors'] },
];

/** "CFO / Accounts Manager" → ["cfo", "accounts manager"]; drops "(…)". */
const roleTokens = (label?: string) =>
  (label ?? '')
    .replace(/\([^)]*\)/g, '')
    .split(/\s*(?:\/|,|&|\band\b)\s*/i)
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);

const inHead = (t: WorkTask, h: (typeof HEADS)[number]) => {
  return h.areas.includes(t.area) || roleTokens(t.roleLabel).some((r) => h.roles.includes(r));
};

const WHENS: { k: Exclude<When, ''>; l: string }[] = [
  { k: 'overdue', l: 'Overdue' },
  { k: 'today', l: 'Due today' },
  { k: 'week', l: 'Next 7 days' },
];

export function TasksPage() {
  const [state, setState] = useState<WorkState | null>(null);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [view, setView] = useState<'agenda' | 'all'>('agenda');
  const [me, setMe] = useState(() => readLS('tasks:me'));
  const [who, setWho] = useState<Who>(() => (readLS('tasks:me') ? 'mine' : 'all'));
  const [area, setArea] = useState('');
  const [head, setHead] = useState('');
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState(false);
  const [when, setWhen] = useState<When>('');
  const [kind, setKind] = useState<Kind>('');
  const [params, setParams] = useSearchParams();
  const today = todayIST();

  // Links from the daily emails: /tasks?task=<id> opens that task, /tasks?who=<memberId> filters.
  const linkTask = params.get('task');
  const linkWho = params.get('who');
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    if (linked || !state || (!linkTask && !linkWho)) return;
    setLinked(true);
    if (linkWho && state.members.some((m) => m.id === linkWho)) setWho(linkWho);
    if (linkTask && state.tasks.some((t) => t.id === linkTask)) {
      setWho('all');
      setArea('');
      setQ('');
      setView('all');
      setOpenKey(`all:${linkTask}`);
      setTimeout(() => document.getElementById(`task-${linkTask}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
    setParams({}, { replace: true });
  }, [linked, state, linkTask, linkWho, setParams]);

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
    (t: WorkTask) => (!area || t.area === area) && (!head || inHead(t, HEADS.find((h) => h.k === head)!)) && matchesBase(t),
    [area, head, matchesBase],
  );
  /** Task count per head under the other filters (for the head selector). */
  const headCounts = useMemo(() => {
    const base = (state?.tasks ?? []).filter((t) => (!area || t.area === area) && matchesBase(t));
    return { total: base.length, by: new Map(HEADS.map((h) => [h.k, base.filter((t) => inHead(t, h)).length])) };
  }, [state, area, matchesBase]);

  const agenda = useMemo(() => (state ? buildAgenda(state, today) : []), [state, today]);
  const filtered = useMemo(() => agenda.filter((i) => matches(i.task)), [agenda, matches]);
  const shown = useMemo(
    () =>
      filtered.filter((i) =>
        when === 'overdue'
          ? !i.done && i.due < today
          : when === 'today'
            ? i.due === today
            : when === 'week'
              ? i.due >= today && diffDays(i.due, today) <= 7
              : true,
      ),
    [filtered, when, today],
  );
  const pickWhen = (w: When) => {
    setWhen((cur) => (cur === w ? '' : w));
    setView('agenda');
  };
  const anyQuick = !!(when || kind || area || head || q || who !== 'all');

  const stats = useMemo(() => {
    const ym = today.slice(0, 7);
    const doneMonth = Object.values(state?.done ?? {}).reduce((n, m) => n + Object.values(m).filter((e) => e.at.slice(0, 7) === ym).length, 0);
    return {
      overdue: filtered.filter((i) => !i.done && i.due < today).length,
      today: filtered.filter((i) => i.due === today).length,
      todayOpen: filtered.filter((i) => i.due === today && !i.done).length,
      week: filtered.filter((i) => !i.done && i.due > today && diffDays(i.due, today) <= 7).length,
      doneMonth,
    };
  }, [filtered, state, today]);

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
  const onDeleteTask = async (id: string) => {
    await deleteTask(id);
    setOpenKey(null);
    await load();
  };

  const chooseMe = (id: string) => {
    setMe(id);
    writeLS('tasks:me', id);
    if (id) setWho('mine');
  };

  if (!state) {
    return (
      <div>
        <Header me={me} members={[]} onMe={chooseMe} />
        <div className="mx-auto max-w-7xl px-4 py-16 text-center text-sm text-slate-500 sm:px-6 lg:px-8">
          {error ? (
            <span className="text-rose-600">{error}</span>
          ) : seeding ? (
            'Setting up — bringing over the tasks from the old Tasks & Compliance and Ownership pages…'
          ) : (
            'Loading tasks…'
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <Header me={me} members={members} onMe={chooseMe} />

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
            <button type="button" onClick={() => setError('')} aria-label="Dismiss">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? 'rose' : 'slate'} sub={stats.overdue ? 'Needs attention' : 'Nothing late'} active={when === 'overdue'} onClick={() => pickWhen('overdue')} />
          <Stat label="Due today" value={stats.todayOpen} tone="brand" sub={`${stats.today - stats.todayOpen} of ${stats.today} done`} active={when === 'today'} onClick={() => pickWhen('today')} />
          <Stat label="Next 7 days" value={stats.week} tone="amber" sub="Open tasks" active={when === 'week'} onClick={() => pickWhen('week')} />
          <Stat label="Ticked this month" value={stats.doneMonth} tone="emerald" sub={`${MN[Number(today.slice(5, 7))]} ${today.slice(0, 4)}`} />
        </div>

        {diffDays(today, trackingStart(state, today)) < 45 && (
          <p className="mt-3 px-1 text-xs text-slate-500">
            Tracking started {periodLabel(trackingStart(state, today))} — anything due before that isn’t counted as overdue.
          </p>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main column */}
          <div className="min-w-0">
            {/* Toolbar */}
            <div className="z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur lg:sticky lg:top-16">
              {/* Head (function) selector */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                <AreaTab on={!head} label="All heads" n={headCounts.total} onClick={() => setHead('')} />
                {HEADS.map((h) => (
                  <AreaTab key={h.k} on={head === h.k} label={h.l} n={headCounts.by.get(h.k) ?? 0} onClick={() => setHead(head === h.k ? '' : h.k)} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
                  {(['agenda', 'all'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`rounded-md px-3 py-1.5 font-medium transition ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      {v === 'agenda' ? 'What’s due' : 'All tasks'}
                    </button>
                  ))}
                </div>
                <label className="relative min-w-[160px] flex-1">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search tasks, forms, roles…"
                    className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-lg border border-slate-200 py-1.5 pl-2 pr-8 text-sm text-slate-700" aria-label="Area">
                  <option value="">All areas</option>
                  {areas.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip on={who === 'all'} onClick={() => setWho('all')}>
                  Everyone
                </Chip>
                <Chip on={who === 'mine'} onClick={() => setWho('mine')} disabled={!me} title={me ? '' : 'Pick who you are (top right) first'}>
                  Mine
                </Chip>
                <Chip on={who === 'unassigned'} onClick={() => setWho('unassigned')}>
                  No owner
                </Chip>
                <span className="mx-1 w-px self-stretch bg-slate-200" />
                {members.map((m) => (
                  <Chip key={m.id} on={who === m.id} onClick={() => setWho(m.id)}>
                    <Avatar m={m} size="h-4 w-4 text-[8px] ring-0" />
                    {m.name.split(' ')[0]}
                  </Chip>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Quick</span>
                {WHENS.map((w) => (
                  <Chip key={w.k} on={when === w.k} onClick={() => pickWhen(w.k)}>
                    {w.l}
                  </Chip>
                ))}
                <span className="mx-1 w-px self-stretch bg-slate-200" />
                {KINDS.map((x) => (
                  <Chip key={x.k} on={kind === x.k} onClick={() => setKind(kind === x.k ? '' : x.k)}>
                    {x.l}
                  </Chip>
                ))}
                {anyQuick && (
                  <button
                    type="button"
                    onClick={() => {
                      setWhen('');
                      setKind('');
                      setArea('');
                      setHead('');
                      setQ('');
                      setWho('all');
                    }}
                    className="ml-auto text-xs font-medium text-slate-500 hover:text-brand-700"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {preview && <EmailPreview onClose={() => setPreview(false)} />}

            {view === 'agenda' ? (
              <div className="mt-5 space-y-6">
                {GROUPS.map((g) => {
                  const list = shown.filter((i) => groupOf(i.due, today) === g.key);
                  if (!list.length && (g.key !== 'today' || (when && when !== 'today'))) return null;
                  const open = list.filter((i) => !i.done).length;
                  return (
                    <section key={g.key}>
                      <div className="mb-2 flex items-baseline gap-2 px-1">
                        <h2 className={`font-display text-sm font-bold uppercase tracking-wide ${g.key === 'overdue' ? 'text-rose-600' : 'text-slate-800'}`}>{g.title}</h2>
                        <span className="text-xs text-slate-400">
                          {open} open{list.length - open ? ` · ${list.length - open} done` : ''}
                          {g.hint ? ` · ${g.hint}` : ''}
                        </span>
                      </div>
                      {list.length ? (
                        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                          {list.map((i) => {
                            const key = `${i.task.id}@${i.period}`;
                            return (
                              <TaskRow
                                key={key}
                                item={i}
                                today={today}
                                memberById={memberById}
                                open={openKey === key}
                                onOpen={() => setOpenKey(openKey === key ? null : key)}
                                onToggle={() => void toggle(i)}
                              >
                                {openKey === key && (
                                  <TaskPanel task={i.task} state={state} members={members} areas={areas} onSave={onSaveTask} onDelete={onDeleteTask} />
                                )}
                              </TaskRow>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                          Nothing due today{who !== 'all' ? ' for this filter' : ''}. 🎉
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <AllTasks
                state={state}
                matches={matches}
                memberById={memberById}
                openKey={openKey}
                setOpenKey={setOpenKey}
                adding={adding}
                setAdding={setAdding}
                members={members}
                areas={areas}
                onSave={onSaveTask}
                onDelete={onDeleteTask}
              />
            )}
          </div>

          {/* Right rail */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <TeamCard state={state} me={me} onChanged={load} onError={setError} />
            <RolesCard state={state} onChanged={load} onError={setError} />
            <RemindersCard state={state} onRan={load} onPreview={() => setPreview(true)} />
            <Link
              to="/handbook"
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <BookOpenIcon className="h-5 w-5" />
              </span>
              <span className="text-sm">
                <span className="block font-semibold text-slate-900">Accounts Handbook</span>
                <span className="text-slate-500">Every task links to its “how to” section.</span>
              </span>
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}

// --- pieces ------------------------------------------------------------------

function Header({ me, members, onMe }: { me: string; members: TeamMember[]; onMe: (id: string) => void }) {
  return (
    <PageHeader
      title="Tasks & owners"
      description="Everything that has to be done, who does it and how — each task opens its Accounts Handbook section. Owners get a reminder email until it’s ticked."
      icon={<ClipboardDocumentCheckIcon className="h-6 w-6" />}
      crumbs={[{ label: 'Govern' }, { label: 'Tasks & owners' }]}
      actions={
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm">
          <span className="text-slate-500">I am</span>
          <select value={me} onChange={(e) => onMe(e.target.value)} className="border-0 bg-transparent py-0 pl-0 pr-6 font-medium text-slate-800 focus:ring-0">
            <option value="">— pick —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      }
    />
  );
}

function Stat({
  label,
  value,
  sub,
  tone: t,
  active,
  onClick,
}: {
  label: string;
  value: number;
  sub: string;
  tone: 'rose' | 'brand' | 'amber' | 'emerald' | 'slate';
  active?: boolean;
  onClick?: () => void;
}) {
  const bar = { rose: 'bg-rose-500', brand: 'bg-brand-500', amber: 'bg-amber-400', emerald: 'bg-emerald-500', slate: 'bg-slate-300' }[t];
  const txt = { rose: 'text-rose-600', brand: 'text-slate-900', amber: 'text-slate-900', emerald: 'text-slate-900', slate: 'text-slate-900' }[t];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? !!active : undefined}
      title={onClick ? (active ? 'Show everything' : `Show only: ${label.toLowerCase()}`) : undefined}
      className={`relative overflow-hidden rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition disabled:cursor-default ${
        active ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200 enabled:hover:border-slate-300'
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-display text-3xl font-extrabold tabular-nums ${txt}`}>{value}</div>
      <div className="text-xs text-slate-400">{active ? 'Filtered · click to clear' : sub}</div>
    </button>
  );
}

function AreaTab({ on, label, n, onClick }: { on: boolean; label: string; n: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        on ? 'bg-slate-900 text-white' : n ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
      }`}
    >
      {label}
      <span className={`rounded-md px-1.5 text-[11px] tabular-nums ${on ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>{n}</span>
    </button>
  );
}

function Chip({ on, children, onClick, disabled, title }: { on: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

function Owners({ ids, memberById, roleLabel }: { ids: string[]; memberById: Map<string, TeamMember>; roleLabel?: string }) {
  const ms = ids.map((id) => memberById.get(id)).filter((m): m is TeamMember => !!m);
  if (!ms.length)
    return (
      <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        No owner{roleLabel ? <span className="hidden sm:inline"> · {roleLabel}</span> : null}
      </span>
    );
  return (
    <span className="flex -space-x-1.5">
      {ms.map((m) => (
        <Avatar key={m.id} m={m} />
      ))}
    </span>
  );
}

function TaskRow({
  item,
  today,
  memberById,
  open,
  onOpen,
  onToggle,
  children,
}: {
  item: Item;
  today: string;
  memberById: Map<string, TeamMember>;
  open: boolean;
  onOpen: () => void;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const { task, done, auto } = item;
  const due = dueLabel(item.due, today);
  return (
    <li className={open ? 'bg-slate-50/60' : ''}>
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onToggle}
          disabled={auto}
          aria-label={done ? 'Mark not done' : 'Mark done'}
          title={auto ? 'Ticked automatically — the file has been uploaded' : done ? 'Mark not done' : 'Mark done'}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
            done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-brand-500'
          }`}
        >
          {done && <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className={`truncate text-sm font-semibold ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span>{task.area}</span>
            <span className="text-slate-300">·</span>
            <span>{periodLabel(item.period)}</span>
            {task.upload && (
              <span className="inline-flex items-center gap-1 text-sky-700">
                <CloudArrowUpIcon className="h-3.5 w-3.5" />
                {auto ? 'File uploaded' : 'Ticks itself when the file lands'}
              </span>
            )}
            {task.howTo && (
              <span className="inline-flex items-center gap-1 text-brand-700">
                <BookOpenIcon className="h-3.5 w-3.5" />
                How to
              </span>
            )}
          </div>
        </button>
        <span className={`hidden whitespace-nowrap text-xs font-medium sm:block ${done ? 'text-slate-400' : due.tone}`}>{done ? 'Done' : due.text}</span>
        <Owners ids={task.ownerIds} memberById={memberById} roleLabel={task.roleLabel} />
        <button type="button" onClick={onOpen} aria-label={open ? 'Collapse' : 'Expand'} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <ChevronDownIcon className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {children}
    </li>
  );
}

/** A reference link: in-app paths stay in the app, others open in a new tab. */
function RefLink({ l }: { l: { label: string; url: string } }) {
  const cls =
    'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800';
  return l.url.startsWith('/') ? (
    <Link to={l.url} className={cls}>
      {l.url.startsWith('/handbook') ? <BookOpenIcon className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
      {l.label}
    </Link>
  ) : (
    <a href={l.url} target="_blank" rel="noreferrer" className={cls}>
      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
      {l.label}
    </a>
  );
}

/** Expanded task: How to (handbook, in place) · Details & owners · History. */
function TaskPanel({
  task,
  state,
  members,
  areas,
  onSave,
  onDelete,
}: {
  task: WorkTask;
  state: WorkState;
  members: TeamMember[];
  areas: string[];
  onSave: (t: Partial<WorkTask>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'how' | 'edit' | 'history'>(task.howTo ? 'how' : 'edit');
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
  return (
    <div className="border-t border-slate-100 px-3 pb-4 pt-2 sm:px-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
          title="Copy a link that opens this task"
        >
          <LinkIcon className="h-3.5 w-3.5" />
          {copied ? 'Link copied' : 'Copy task link'}
        </button>
        {(task.links ?? []).map((l) => (
          <RefLink key={l.url} l={l} />
        ))}
      </div>
      <div className="mb-3 flex gap-1 text-sm">
        {(
          [
            ['how', 'How to do it'],
            ['edit', 'Details & owners'],
            ['history', `History${history.length ? ` (${history.length})` : ''}`],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 font-medium ${tab === k ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'how' && <HowTo task={task} onPick={() => setTab('edit')} />}
      {tab === 'edit' && <TaskEditor task={task} members={members} areas={areas} onSave={onSave} onDelete={onDelete} />}
      {tab === 'history' &&
        (history.length ? (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
            {history.slice(0, 24).map(([p, e]) => (
              <li key={p} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="font-medium text-slate-800">{periodLabel(p)}</span>
                <span className="text-xs text-slate-500">
                  {new Date(e.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  {e.by && byId.get(e.by) ? ` · ${byId.get(e.by)!.name}` : ''}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Not ticked yet.</p>
        ))}
    </div>
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
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
        No Handbook section linked yet.{' '}
        <button type="button" onClick={onPick} className="font-medium text-brand-700 hover:underline">
          Link one
        </button>
        {task.description ? <p className="mt-2 text-slate-500">{task.description}</p> : null}
      </div>
    );

  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    e.preventDefault();
    navigate(`/handbook${href}`);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-brand-50/50 px-4 py-2">
        <div className="min-w-0 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-brand-700">{art.collection.title}</span>
          <div className="truncate font-semibold text-slate-900">{art.title}</div>
        </div>
        <Link to={`/handbook#${task.howTo}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:text-brand-700">
          Open in Handbook <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div ref={box} className="relative max-h-[560px] overflow-y-auto px-4 py-3">
        <div className="hb" onClick={onClick} dangerouslySetInnerHTML={{ __html: art.html }} />
      </div>
    </div>
  );
}

const input = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';
const lbl = 'mb-1 block text-xs font-medium text-slate-500';

function TaskEditor({
  task,
  members,
  areas,
  onSave,
  onDelete,
  onCancel,
}: {
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
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
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
        <label className={lbl}>Role / head — e.g. Accountant, CA, HR, Company Secretary (separate several with “/”). Drives the head filter and Who does what.</label>
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
                  className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-medium ${
                    on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Avatar m={m} size="h-5 w-5 text-[9px] ring-0" />
                  {m.name}
                  {on && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
                </button>
              );
            })
          ) : (
            <span className="text-sm text-slate-500">Add people under Team (right) first.</span>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={lbl}>Repeats</label>
          <select className={input} value={cad} onChange={(e) => set({ cadence: e.target.value as Cadence })}>
            {CADENCES.map((c) => (
              <option key={c.v} value={c.v}>
                {c.l}
              </option>
            ))}
          </select>
        </div>
        {cad === 'weekly' && (
          <div>
            <label className={lbl}>On</label>
            <select className={input} value={f.dueWeekday ?? 1} onChange={(e) => set({ dueWeekday: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {WD[d % 7]}
                </option>
              ))}
            </select>
          </div>
        )}
        {(cad === 'yearly' || (cad === 'one-time' && !f.dueDate)) && (
          <div>
            <label className={lbl}>Month</label>
            <select className={input} value={f.dueMonth ?? 3} onChange={(e) => set({ dueMonth: Number(e.target.value) })}>
              {MN.slice(1).map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
        {cad !== 'daily' && cad !== 'weekly' && !(cad === 'one-time' && f.dueDate) && (
          <div>
            <label className={lbl}>Due day</label>
            <input className={input} type="number" min={1} max={31} value={f.dueDay ?? ''} onChange={(e) => set({ dueDay: Number(e.target.value) || undefined })} />
          </div>
        )}
        {cad === 'one-time' && (
          <div>
            <label className={lbl}>Or exact date</label>
            <input className={input} type="date" value={f.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || undefined })} />
          </div>
        )}
        <div>
          <label className={lbl}>Remind from</label>
          <select className={input} value={f.remindDaysBefore ?? 2} onChange={(e) => set({ remindDaysBefore: Number(e.target.value) })}>
            {[0, 1, 2, 3, 5, 7, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'On the due day' : `${n} day${n > 1 ? 's' : ''} before`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(cad === 'quarterly' || cad === 'half-yearly') && (
        <div>
          <label className={lbl}>Due in these months</label>
          <div className="flex flex-wrap gap-1">
            {MN.slice(1).map((m, i) => {
              const cur = f.months?.length ? f.months : cad === 'quarterly' ? [1, 4, 7, 10] : [4, 10];
              const on = cur.includes(i + 1);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => set({ months: on ? cur.filter((x) => x !== i + 1) : [...cur, i + 1].sort((a, b) => a - b) })}
                  className={`w-11 rounded-md border py-1 text-xs font-medium ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 text-slate-600'}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {cad === 'monthly' && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={!!f.arrears} onChange={(e) => set({ arrears: e.target.checked })} className="rounded text-brand-600" />
          Done for the previous month (e.g. upload September’s report by 7 October)
        </label>
      )}

      <div>
        <label className={lbl}>How to do it — Accounts Handbook section</label>
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
          <p className="mt-1.5 text-xs text-slate-500">
            {[f.form && `Form: ${f.form}`, f.authority && `Authority: ${f.authority}`, f.penalty && `Penalty: ${f.penalty}`].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <div>
        <label className={lbl}>References — Handbook sections, MIS pages or portals (shown on the task and in emails)</label>
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
                className="shrink-0 rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Remove reference"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set({ links: [...(f.links ?? []), { label: '', url: '' }] })}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add reference
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="mr-auto text-xs text-slate-500">{describe({ cadence: cad, ...f } as WorkTask)}</span>
        {msg && <span className={`text-xs ${msg === 'Saved' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
        {task && onDelete && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete “${task.title}” and its history?`)) void onDelete(task.id);
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          >
            <TrashIcon className="h-4 w-4" /> Delete
          </button>
        )}
        {task && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={f.active !== false} onChange={(e) => set({ active: e.target.checked })} className="rounded text-brand-600" />
            Active
          </label>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {busy ? 'Saving…' : task ? 'Save' : 'Add task'}
        </button>
      </div>
    </div>
  );
}

function AllTasks({
  state,
  matches,
  memberById,
  openKey,
  setOpenKey,
  adding,
  setAdding,
  members,
  areas,
  onSave,
  onDelete,
}: {
  state: WorkState;
  matches: (t: WorkTask) => boolean;
  memberById: Map<string, TeamMember>;
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
  adding: boolean;
  setAdding: (b: boolean) => void;
  members: TeamMember[];
  areas: string[];
  onSave: (t: Partial<WorkTask>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const tasks = state.tasks.filter(matches);
  const byArea = new Map<string, WorkTask[]>();
  for (const t of tasks) byArea.set(t.area, [...(byArea.get(t.area) ?? []), t]);
  const order = [...byArea.keys()].sort();
  // Areas start folded; one area (or a search) shows open. The open task's area stays open.
  const openTaskArea = openKey?.startsWith('all:') ? state.tasks.find((t) => `all:${t.id}` === openKey)?.area : undefined;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const autoOpen = order.length <= 1 || tasks.length <= 20;
  const isOpen = (a: string) => autoOpen || expanded.has(a) || a === openTaskArea;
  const toggleArea = (a: string) =>
    setExpanded((cur) => {
      const n = new Set(cur);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });

  return (
    <div className="mt-5 space-y-6">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-slate-500">
          {tasks.length} task{tasks.length === 1 ? '' : 's'} · {tasks.filter((t) => !t.ownerIds.length).length} without an owner
          {!autoOpen && (
            <button
              type="button"
              onClick={() => setExpanded(expanded.size >= order.length ? new Set() : new Set(order))}
              className="ml-3 font-medium text-brand-700 hover:underline"
            >
              {expanded.size >= order.length ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </span>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">
            <PlusIcon className="h-4 w-4" /> Add task
          </button>
        )}
      </div>
      {adding && <TaskEditor members={members} areas={areas} onSave={onSave} onCancel={() => setAdding(false)} />}
      {order.map((a) => (
        <section key={a}>
          <button
            type="button"
            onClick={() => toggleArea(a)}
            disabled={autoOpen}
            className="mb-2 flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left enabled:hover:bg-white"
          >
            {!autoOpen && <ChevronDownIcon className={`h-4 w-4 text-slate-400 transition ${isOpen(a) ? '' : '-rotate-90'}`} />}
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-slate-800">{a}</h2>
            <span className="text-xs text-slate-400">{byArea.get(a)!.length}</span>
            <span className="ml-auto flex -space-x-1.5">
              {[...new Set(byArea.get(a)!.flatMap((t) => t.ownerIds))]
                .map((id) => memberById.get(id))
                .filter((m): m is TeamMember => !!m)
                .map((m) => (
                  <Avatar key={m.id} m={m} size="h-5 w-5 text-[9px]" />
                ))}
            </span>
          </button>
          {isOpen(a) && <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {byArea.get(a)!.map((t) => {
              const key = `all:${t.id}`;
              const open = openKey === key;
              return (
                <li key={t.id} id={`task-${t.id}`} className={`scroll-mt-24 ${open ? 'bg-slate-50/60' : ''}`}>
                  <button type="button" onClick={() => setOpenKey(open ? null : key)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left sm:px-4">
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-semibold ${t.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{t.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span>{describe(t)}</span>
                        {t.howTo && (
                          <span className="inline-flex items-center gap-1 text-brand-700">
                            <BookOpenIcon className="h-3.5 w-3.5" /> How to
                          </span>
                        )}
                        {t.upload && (
                          <span className="inline-flex items-center gap-1 text-sky-700">
                            <CloudArrowUpIcon className="h-3.5 w-3.5" /> Auto-ticks on upload
                          </span>
                        )}
                      </div>
                    </div>
                    <Owners ids={t.ownerIds} memberById={memberById} roleLabel={t.roleLabel} />
                    <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && <TaskPanel task={t} state={state} members={members} areas={areas} onSave={onSave} onDelete={onDelete} />}
                </li>
              );
            })}
          </ul>}
        </section>
      ))}
      {!order.length && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No tasks match.</p>}
    </div>
  );
}

function TeamCard({ state, me, onChanged, onError }: { state: WorkState; me: string; onChanged: () => Promise<void>; onError: (s: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayIST();
  const agenda = useMemo(() => buildAgenda(state, today), [state, today]);
  const openCount = (id: string) => agenda.filter((i) => !i.done && i.task.ownerIds.includes(id) && diffDays(i.due, today) <= 7).length;
  const lateCount = (id: string) => agenda.filter((i) => !i.done && i.task.ownerIds.includes(id) && i.due < today).length;
  const loads = (id: string) => state.tasks.filter((t) => t.active && t.ownerIds.includes(id)).length;

  const add = async () => {
    setBusy(true);
    try {
      await saveMember({ name: name.trim(), email: email.trim() });
      setName('');
      setEmail('');
      setAdding(false);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not add person.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: TeamMember) => {
    if (!window.confirm(`Remove ${m.name}? Their tasks will have no owner.`)) return;
    try {
      await deleteMember(m.id);
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not remove.');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="font-display text-sm font-bold text-slate-900">Team</h3>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            <UserPlusIcon className="h-4 w-4" /> Add
          </button>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {state.members.map((m) => (
          <li key={m.id} className="group flex items-center gap-2.5 px-4 py-2.5">
            <Avatar m={m} size="h-8 w-8 text-xs ring-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">
                {m.name}
                {m.id === me && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-500">you</span>}
              </div>
              <div className="truncate text-xs text-slate-500">
                {loads(m.id)} task{loads(m.id) === 1 ? '' : 's'} · {openCount(m.id)} due this week
                {lateCount(m.id) ? <span className="text-rose-600"> · {lateCount(m.id)} late</span> : null}
              </div>
            </div>
            <button type="button" onClick={() => void remove(m)} aria-label={`Remove ${m.name}`} className="rounded p-1 text-slate-300 opacity-0 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100">
              <TrashIcon className="h-4 w-4" />
            </button>
          </li>
        ))}
        {!state.members.length && !adding && <li className="px-4 py-3 text-sm text-slate-500">Add the people who do the work, so tasks can be assigned and reminders sent.</li>}
      </ul>
      {adding && (
        <div className="space-y-2 border-t border-slate-100 p-4">
          <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={input} placeholder="Email (for reminders)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="button" disabled={busy || !name.trim() || !email.includes('@')} onClick={() => void add()} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              Add person
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8 am – 10 pm
const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'am' : 'pm'}`;

/** Who does what: each role from the task list → a person. Tasks with no owner get filled automatically. */
function RolesCard({ state, onChanged, onError }: { state: WorkState; onChanged: () => Promise<void>; onError: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const r = state.routing ?? { roles: {} };
  const names = [...new Set([...state.roleNames, ...Object.keys(r.roles)])].sort((a, b) => a.localeCompare(b));
  const unowned = state.tasks.filter((t) => t.active && !t.ownerIds.some((id) => state.members.some((m) => m.id === id))).length;
  const mapped = names.filter((n) => r.roles[n]?.length).length;

  const save = async (next: { roles: Record<string, string[]>; fallback?: string }) => {
    setBusy(true);
    setNote('');
    try {
      const res = await saveRouting({ ...next, apply: true });
      setNote(res.assigned ? `Assigned ${res.assigned} task${res.assigned > 1 ? 's' : ''} that had no owner.` : 'Saved.');
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  const setRole = (role: string, id: string) => {
    const roles = { ...r.roles };
    if (id) roles[role] = [id];
    else delete roles[role];
    void save({ roles, fallback: r.fallback });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <UserGroupIcon className="h-4 w-4 text-brand-600" />
        <h3 className="font-display text-sm font-bold text-slate-900">Who does what</h3>
        <span className="ml-auto text-xs text-slate-500">
          {mapped}/{names.length} roles{unowned ? <span className="text-amber-700"> · {unowned} no owner</span> : null}
        </span>
        <ChevronDownIcon className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm">
          <p className="text-xs leading-relaxed text-slate-500">
            Pick who covers each role. Any task with no owner is assigned automatically from its role; tasks you assigned by hand are left alone.
          </p>
          <ul className="divide-y divide-slate-100">
            {names.map((n) => (
              <li key={n} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-slate-700" title={n}>
                  {n}
                </span>
                <select
                  value={r.roles[n]?.[0] ?? ''}
                  disabled={busy}
                  onChange={(e) => setRole(n, e.target.value)}
                  className="w-32 rounded-lg border border-slate-200 py-1 pl-2 pr-7 text-xs text-slate-800"
                  aria-label={`Who covers ${n}`}
                >
                  <option value="">— default —</option>
                  {state.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 border-t border-slate-100 pt-2">
            <span className="flex-1 text-xs font-medium text-slate-700">Anyone else (unmatched roles)</span>
            <select
              value={r.fallback ?? ''}
              disabled={busy}
              onChange={(e) => void save({ roles: r.roles, fallback: e.target.value })}
              className="w-32 rounded-lg border border-slate-200 py-1 pl-2 pr-7 text-xs font-medium text-slate-800"
              aria-label="Owner for unmatched roles"
            >
              <option value="">— nobody —</option>
              {state.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          {unowned > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ roles: r.roles, fallback: r.fallback })}
              className="w-full rounded-lg border border-brand-200 bg-brand-50 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-50"
            >
              Assign the {unowned} task{unowned > 1 ? 's' : ''} with no owner
            </button>
          )}
          {note && <p className="text-xs text-emerald-700">{note}</p>}
        </div>
      )}
    </div>
  );
}

function RemindersCard({ state, onRan, onPreview }: { state: WorkState; onRan: () => Promise<void>; onPreview: () => void }) {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<ReminderRun | null>(null);
  const [err, setErr] = useState('');
  const [summaryTo, setSummaryTo] = useState(state.settings.summaryTo.join(', '));
  const last = state.lastReminderRun;
  const unowned = state.tasks.filter((t) => t.active && !t.ownerIds.length).length;
  const st = state.settings;

  const update = async (p: Partial<ReminderSettings>) => {
    setErr('');
    try {
      await saveSettings(p);
      await onRan();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const send = async () => {
    if (!window.confirm(state.mailer.configured ? 'Send today’s task emails to every owner now?' : 'Email isn’t connected — this will be a dry run. Continue?')) return;
    setBusy(true);
    setErr('');
    try {
      setRun(await runWorkReminders());
      await onRan();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <BellAlertIcon className="h-4 w-4 text-brand-600" />
        <h3 className="font-display text-sm font-bold text-slate-900">Daily emails</h3>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={st.enabled} onChange={(e) => void update({ enabled: e.target.checked })} className="rounded text-brand-600" />
          {st.enabled ? 'On' : 'Off'}
        </label>
      </div>
      <div className="space-y-3 px-4 py-3 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <span>Send at</span>
          <select value={st.sendHour} onChange={(e) => void update({ sendHour: Number(e.target.value) })} className="rounded-lg border border-slate-200 py-1 pl-2 pr-7 text-sm font-medium text-slate-800">
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">India time</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          Anything not ticked by then is emailed from <b className="font-medium text-slate-700">{state.mailer.from ?? 'hargun@heatronics.in'}</b>: each owner gets their own list (with description, task link and how-to), and the team summary goes to:
        </p>
        <input
          className={input}
          value={summaryTo}
          onChange={(e) => setSummaryTo(e.target.value)}
          onBlur={() => {
            const list = summaryTo.split(/[,\s]+/).filter(Boolean);
            if (list.join(',') !== st.summaryTo.join(',')) void update({ summaryTo: list });
          }}
          placeholder="hargun@heatronics.in"
          aria-label="Team summary goes to"
        />
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={st.includeDueSoon} onChange={(e) => void update({ includeDueSoon: e.target.checked })} className="rounded text-brand-600" />
          Also list what’s coming up in the next few days
        </label>

        <MailConnection state={state} onChanged={onRan} />

        {unowned > 0 && <p className="text-xs text-amber-700">{unowned} active task{unowned > 1 ? 's have' : ' has'} no owner — they only show in the team summary.</p>}
        <div className="text-xs text-slate-500">
          Last sent:{' '}
          {last
            ? `${new Date(last.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · ${last.dryRun ? 'dry run' : `${last.sent} of ${last.recipients} emails sent`}`
            : 'never'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onPreview} className="rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-700 hover:border-slate-300">
            Preview emails
          </button>
          <button type="button" disabled={busy} onClick={() => void send()} className="rounded-lg border border-brand-200 bg-brand-50 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-50">
            {busy ? 'Sending…' : 'Send now'}
          </button>
        </div>
        {run && (
          <p className="text-xs text-slate-600">
            {run.emails.length} email{run.emails.length === 1 ? '' : 's'}
            {run.emails.some((e) => e.dryRun) ? ' (dry run — not sent)' : ` · ${run.emails.filter((e) => e.sent).length} sent`}
            {run.emails.some((e) => e.error && !e.dryRun) ? ` · failed: ${run.emails.find((e) => e.error && !e.dryRun)!.error}` : ''}
          </p>
        )}
        {err && <p className="text-xs text-rose-600">{err}</p>}
      </div>
    </div>
  );
}

/** Email connection: Zoho SMTP as hargun@heatronics.in (password is write-only). */
function MailConnection({ state, onChanged }: { state: WorkState; onChanged: () => Promise<void> }) {
  const m = state.mailer;
  const [editing, setEditing] = useState(!m.configured);
  const [pass, setPass] = useState('');
  const [user, setUser] = useState(m.user ?? 'contact@heatronics.in');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testTo, setTestTo] = useState('hargun@heatronics.in');

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await connectMail({ pass, user });
      setPass('');
      setMsg(r.check.ok ? { ok: true, text: 'Connected — Zoho accepted the login.' } : { ok: false, text: `Not saved — Zoho didn’t accept it: ${r.check.error ?? 'unknown error'}` });
      if (r.check.ok) setEditing(false);
      await onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await sendTestMail(testTo);
      setMsg({ ok: true, text: `Test email sent to ${testTo}.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Test failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${m.configured ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${m.configured ? 'text-emerald-800' : 'text-amber-800'}`}>
          {m.configured
            ? m.provider === 'smtp'
              ? `Email connected · Zoho (${m.user})`
              : `Email connected · ${m.provider}`
            : 'Email not connected — sends are a dry run'}
        </span>
        {m.configured && m.source !== 'env' && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
            Change
          </button>
        )}
      </div>
      {m.source === 'env' && <p className="mt-1 text-[11px] text-slate-500">Set on the server (Cloud Run settings).</p>}
      {editing && m.source !== 'env' && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] leading-relaxed text-slate-600">
            Zoho Mail → My Account → Security → <b>App passwords</b> → generate one named “MIS”, paste it below. Emails go out as Hargun &lt;hargun@heatronics.in&gt; (an alias of this mailbox). The password is stored on the server and never shown again.
          </p>
          <input className={input} value={user} onChange={(e) => setUser(e.target.value)} placeholder="Zoho login (mailbox)" aria-label="Zoho login" />
          <input className={input} type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Zoho app password" aria-label="Zoho app password" />
          <div className="flex justify-end gap-2">
            {m.configured && (
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-white">
                Cancel
              </button>
            )}
            <button type="button" disabled={busy || !pass.trim()} onClick={() => void connect()} className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? 'Checking…' : 'Connect'}
            </button>
          </div>
        </div>
      )}
      {m.configured && !editing && (
        <div className="mt-2 flex gap-1.5">
          <input className={`${input} py-1 text-xs`} value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Send test to" />
          <button type="button" disabled={busy} onClick={() => void test()} className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 disabled:opacity-50">
            Send test
          </button>
        </div>
      )}
      {msg && <p className={`mt-1.5 text-[11px] ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}

/** In-page preview of today's emails, exactly as they will be sent. */
function EmailPreview({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ drafts: DraftEmail[] } | null>(null);
  const [err, setErr] = useState('');
  const [i, setI] = useState(0);
  useEffect(() => {
    previewReminders()
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Could not build the preview.'));
  }, []);
  const d = data?.drafts[i];
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="font-display text-sm font-bold text-slate-900">Today’s emails — preview</h2>
        <span className="text-xs text-slate-400">nothing is sent from here</span>
        <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close preview">
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
      {err && <p className="px-4 py-3 text-sm text-rose-600">{err}</p>}
      {!data && !err && <p className="px-4 py-6 text-sm text-slate-500">Building…</p>}
      {data && !data.drafts.length && <p className="px-4 py-6 text-sm text-slate-500">Nothing to send today — no owner has a pending task and no team-summary address is set.</p>}
      {data && d && (
        <>
          <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2">
            {data.drafts.map((x, k) => (
              <button
                key={k}
                type="button"
                onClick={() => setI(k)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${k === i ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                {x.kind === 'summary' ? '★ ' : ''}
                {x.name} · {x.items}
              </button>
            ))}
          </div>
          <div className="space-y-0.5 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
            <div>
              <span className="inline-block w-14 text-slate-400">From</span>Hargun &lt;hargun@heatronics.in&gt;
            </div>
            <div>
              <span className="inline-block w-14 text-slate-400">To</span>
              {d.to.join(', ')}
            </div>
            <div>
              <span className="inline-block w-14 text-slate-400">Subject</span>
              <b className="font-semibold text-slate-800">{d.subject}</b>
            </div>
          </div>
          <iframe title="Email preview" srcDoc={d.html} sandbox="allow-popups" className="h-[720px] w-full bg-slate-100" />
        </>
      )}
    </section>
  );
}

export default TasksPage;
