// ============================================================================
// PEOPLE & REMINDERS — settings for the Tasks page: the people who own tasks,
// the heads (functions) used to filter tasks, who covers each role, and the
// daily reminder email (time, recipients, Zoho connection, test, preview).
// Replaces the old Ownership page.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Modal } from '../../components/ui/overlays';
import { getEmailTemplates, getWork, saveHeads, type EmailTemplate, type Head, type WorkState } from '../../data/work/workClient';
import { EmailPreview, RemindersCard, RolesCard, TeamCard } from './SettingsCards';
import { roleTokens } from './taskModel';
import { Fold, TasksHeader, btnGhost, btnPrimary, focusRing } from './ui';

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

export function TasksSettingsPage() {
  const [state, setState] = useState<WorkState | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const { hash } = useLocation();
  const target = hash.slice(1);

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
      <TasksHeader title="People & reminders" sub="Who owns tasks, the heads you filter by, who covers each role, and the daily email." back={{ to: '/tasks', label: 'Tasks' }} />
      <div className="mx-auto max-w-5xl px-4 pt-5 sm:px-6 lg:px-8">
        {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>}
        {!state ? (
          <p className="py-16 text-center text-sm text-slate-600">Loading…</p>
        ) : !state.seededAt ? (
          <p className="py-16 text-center text-sm text-slate-600">
            Open{' '}
            <Link to="/tasks" className={`rounded font-medium text-brand-700 hover:underline ${focusRing}`}>
              Tasks
            </Link>{' '}
            once first to set up the task list.
          </p>
        ) : (
          <div className="space-y-5">
            <Section id="people" title="People" sub="The people who do the work. Pick them as owners on any task; they get the reminder emails." target={target}>
              <TeamCard state={state} me="" onChanged={load} onError={setError} />
            </Section>
            <Section id="roles" title="Who does what" sub="Pick who covers each role. Tasks with no owner are assigned from their role automatically." target={target}>
              <RolesCard state={state} onChanged={load} onError={setError} embedded />
            </Section>
            <Section id="emails" title="Daily reminder email" sub="Sent from hargun@heatronics.in for tasks not ticked by the send time." target={target}>
              <RemindersCard state={state} onRan={load} onPreview={() => setPreview(true)} />
            </Section>
            <Section id="heads" title="Heads" sub="Groups you can filter by on the Tasks page (HR, CA, Accounts…). A task falls under a head by its role or its area." target={target}>
              <HeadsCard state={state} onSaved={load} onError={setError} />
            </Section>
            <Section id="templates" title="Email templates" sub="Every email the Tasks pages send, filled with sample tasks. Nothing is sent from here." target={target} defaultOpen={false}>
              <EmailTemplates />
            </Section>
          </div>
        )}
      </div>
      <Modal open={preview} onClose={() => setPreview(false)} title="Today’s emails" subtitle="A preview — nothing is sent from here." width={900}>
        <EmailPreview embedded onClose={() => setPreview(false)} />
      </Modal>
    </div>
  );
}

/** A folding settings section; opens itself when the URL points at it (#people, #heads…). */
function Section({ id, title, sub, target, defaultOpen = true, children }: { id: string; title: string; sub: string; target: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24">
      <Fold id={`tasks-settings:${id}`} title={title} defaultOpen={defaultOpen} forceOpen={target === id}>
        <p className="mb-2 px-1 text-sm text-slate-600">{sub}</p>
        {children}
      </Fold>
    </div>
  );
}

/** Gallery of every email format, rendered by the server with sample tasks. */
function EmailTemplates() {
  const [list, setList] = useState<EmailTemplate[] | null>(null);
  const [err, setErr] = useState('');
  const [k, setK] = useState(0);
  useEffect(() => {
    getEmailTemplates()
      .then((r) => setList(r.templates))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Could not load the templates.'));
  }, []);
  const t = list?.[k];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {err && <p className="px-4 py-3 text-[14px] text-rose-700">{err}</p>}
      {!list && !err && <p className="px-4 py-6 text-[14px] text-slate-600">Loading…</p>}
      {list && t && (
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
          <ul className="border-b border-slate-200 lg:border-b-0 lg:border-r">
            {list.map((x, i) => (
              <li key={x.key}>
                <button
                  type="button"
                  onClick={() => setK(i)}
                  className={`block w-full border-l-4 px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 ${i === k ? 'border-brand-500 bg-brand-50/60' : 'border-transparent hover:bg-slate-50'}`}
                >
                  <span className="block text-[15px] font-medium text-slate-950">{x.name}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-slate-600">{x.when}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0">
            <div className="space-y-0.5 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800">
              <div>
                <span className="inline-block w-16 font-semibold text-slate-600">From</span>Hargun &lt;hargun@heatronics.in&gt;
              </div>
              <div>
                <span className="inline-block w-16 font-semibold text-slate-600">To</span>
                {t.to || '—'}
              </div>
              <div>
                <span className="inline-block w-16 font-semibold text-slate-600">Subject</span>
                <b className="font-semibold text-slate-950">{t.subject}</b>
              </div>
            </div>
            <iframe title={t.name} srcDoc={t.html} sandbox="allow-popups" className="h-[760px] w-full bg-slate-100" />
          </div>
        </div>
      )}
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
    <div className="rounded-xl border border-slate-200 bg-white">
      <ul className="divide-y divide-slate-100">
        {heads.map((h, i) => (
          <li key={h.id} className="space-y-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <input className={`${field} font-semibold`} value={h.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Head name, e.g. CA / Audit" aria-label="Head name" />
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-sm tabular-nums text-slate-600" title="Tasks under this head">
                {count(h)}
              </span>
              <button
                type="button"
                onClick={() => setHeads((hs) => hs.filter((_, j) => j !== i))}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 ${focusRing}`}
                aria-label={`Delete ${h.name || 'head'}`}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <input
              className={field}
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
                    className={`min-h-[32px] rounded-full border px-3 text-sm font-medium ${focusRing} ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:border-slate-400'}`}
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
          className={`inline-flex min-h-[40px] items-center gap-1 rounded px-1 text-sm font-medium text-brand-700 hover:underline ${focusRing}`}
        >
          <PlusIcon className="h-4 w-4" /> Add head
        </button>
        <span className="ml-auto text-sm text-emerald-700">{msg}</span>
        {dirty && (
          <button type="button" onClick={() => setHeads(state.heads)} className={btnGhost}>
            <XMarkIcon className="h-4 w-4" /> Undo
          </button>
        )}
        <button type="button" disabled={!dirty || busy} onClick={() => void save()} className={btnPrimary}>
          {busy ? 'Saving…' : 'Save heads'}
        </button>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-sm text-slate-600">
        Tip: to put a task under “CA / Audit”, add “CA” to its Role / head field (open the task, then Details &amp; owners).
      </p>
    </div>
  );
}

export default TasksSettingsPage;
