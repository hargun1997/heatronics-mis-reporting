// ============================================================================
// PEOPLE & REMINDERS — settings for the Tasks page: the people who own tasks,
// the heads (functions) used to filter tasks, who covers each role, and the
// daily reminder email (time, recipients, Zoho connection, test, preview).
// Replaces the old Ownership page.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Cog6ToothIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '../../components/ui/PageHeader';
import { getWork, saveHeads, type Head, type WorkState } from '../../data/work/workClient';
import { EmailPreview, RemindersCard, RolesCard, TeamCard } from './TasksPage';

const field = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

const roleTokens = (label?: string) =>
  (label ?? '')
    .replace(/\([^)]*\)/g, '')
    .split(/\s*(?:\/|,|&|\band\b)\s*/i)
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);

export function TasksSettingsPage() {
  const [state, setState] = useState<WorkState | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const { hash } = useLocation();

  const load = useCallback(async () => {
    try {
      setState(await getWork());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.');
    }
  }, []);
  useEffect(() => {
    getWork()
      .then(setState)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load.'));
  }, []);

  useEffect(() => {
    if (!state || !hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    return () => clearTimeout(t);
  }, [state, hash]);

  return (
    <div className="tasks-ui pb-16">
      <PageHeader
        title="People & reminders"
        description="Who owns tasks, the heads you filter by, who covers each role, and the daily reminder email."
        icon={<Cog6ToothIcon className="h-6 w-6" />}
        crumbs={[{ label: 'Tasks', to: '/tasks' }, { label: 'People & reminders' }]}
        actions={
          <Link to="/tasks" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-brand-300">
            ← Back to tasks
          </Link>
        }
      />
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
        {!state ? (
          <p className="py-16 text-center text-sm text-slate-600">Loading…</p>
        ) : !state.seededAt ? (
          <p className="py-16 text-center text-sm text-slate-600">
            Open <Link to="/tasks" className="font-medium text-brand-700 hover:underline">Tasks &amp; owners</Link> once first to set up the task list.
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <section id="people" className="scroll-mt-24">
                <SectionTitle title="People" sub="Add the people who do the work. They can then be picked as owners on any task and get the reminder emails." />
                <TeamCard state={state} me="" onChanged={load} onError={setError} />
              </section>
              <section id="heads" className="scroll-mt-24">
                <SectionTitle title="Heads" sub="The function buttons at the top of the Tasks page (HR, CA, Accounts…). A task falls under a head by its role or its area." />
                <HeadsCard state={state} onSaved={load} onError={setError} />
              </section>
            </div>
            <div className="space-y-6">
              <section id="roles" className="scroll-mt-24">
                <SectionTitle title="Who does what" sub="Pick who covers each role; tasks with no owner are assigned from their role automatically." />
                <RolesCard state={state} onChanged={load} onError={setError} defaultOpen />
              </section>
              <section id="emails" className="scroll-mt-24">
                <SectionTitle title="Daily reminder email" sub="Sent from hargun@heatronics.in for tasks not ticked by the send time." />
                <RemindersCard state={state} onRan={load} onPreview={() => setPreview(true)} />
              </section>
            </div>
            {preview && (
              <div className="lg:col-span-2">
                <EmailPreview onClose={() => setPreview(false)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-2 px-1">
      <h2 className="font-display text-base font-bold text-slate-950">{title}</h2>
      <p className="text-[13px] text-slate-600">{sub}</p>
    </div>
  );
}

/** Add, rename, edit and delete heads; each head = roles + areas. */
function HeadsCard({ state, onSaved, onError }: { state: WorkState; onSaved: () => Promise<void>; onError: (s: string) => void }) {
  const [heads, setHeads] = useState<Head[]>(state.heads);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const areas = useMemo(() => [...new Set(state.tasks.map((t) => t.area))].sort(), [state.tasks]);
  const dirty = JSON.stringify(heads) !== JSON.stringify(state.heads);

  const count = (h: Head) => {
    const roles = h.roles.map((r) => r.toLowerCase());
    return state.tasks.filter((t) => h.areas.includes(t.area) || roleTokens(t.roleLabel).some((r) => roles.includes(r))).length;
  };
  const set = (i: number, p: Partial<Head>) => setHeads((hs) => hs.map((h, j) => (j === i ? { ...h, ...p } : h)));

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await saveHeads(heads.filter((h) => h.name.trim()));
      await onSaved();
      setMsg('Saved.');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save heads.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <ul className="divide-y divide-slate-100">
        {heads.map((h, i) => (
          <li key={h.id} className="space-y-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <input className={`${field} font-semibold`} value={h.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Head name, e.g. CA / Audit" aria-label="Head name" />
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[13px] tabular-nums text-slate-600" title="Tasks under this head">
                {count(h)}
              </span>
              <button
                type="button"
                onClick={() => setHeads((hs) => hs.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Delete ${h.name || 'head'}`}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <input
              className={`${field} text-[13px]`}
              value={h.roles.join(', ')}
              onChange={(e) => set(i, { roles: e.target.value.split(',').map((r) => r.trim()).filter((r, k, a) => r || k === a.length - 1) })}
              placeholder="Roles, comma-separated — e.g. CA, Statutory Auditor"
              aria-label="Roles"
            />
            <div className="flex flex-wrap gap-1">
              {areas.map((a) => {
                const on = h.areas.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set(i, { areas: on ? h.areas.filter((x) => x !== a) : [...h.areas, a] })}
                    className={`rounded-full border px-2 py-0.5 text-[12px] font-medium ${on ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={() => setHeads((hs) => [...hs, { id: `h-${Date.now().toString(36)}`, name: '', roles: [], areas: [] }])}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          <PlusIcon className="h-4 w-4" /> Add head
        </button>
        <span className="ml-auto text-[13px] text-emerald-700">{msg}</span>
        {dirty && (
          <button type="button" onClick={() => setHeads(state.heads)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            <XMarkIcon className="h-4 w-4" /> Undo
          </button>
        )}
        <button type="button" disabled={!dirty || busy} onClick={() => void save()} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? 'Saving…' : 'Save heads'}
        </button>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">
        Tip: to put a task under “CA / Audit”, add “CA” to its Role / head field (task → Details &amp; owners).
      </p>
    </div>
  );
}

export default TasksSettingsPage;
