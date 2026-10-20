// Settings cards for the Tasks pages: people, who does what (role routing),
// the daily reminder email with its Zoho connection, and the email preview.

import { useEffect, useMemo, useState } from 'react';
import { BellAlertIcon, ChevronDownIcon, TrashIcon, UserGroupIcon, UserPlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { diffDays, todayIST } from '../../data/work/schedule';
import {
  connectMail,
  deleteMember,
  previewReminders,
  runWorkReminders,
  saveMember,
  saveRouting,
  saveSettings,
  sendTestMail,
  type DraftEmail,
  type ReminderRun,
  type ReminderSettings,
  type TeamMember,
  type WorkState,
} from '../../data/work/workClient';
import { buildAgenda } from './taskModel';
import { Avatar, input } from './ui';

export function TeamCard({ state, me, onChanged, onError }: { state: WorkState; me: string; onChanged: () => Promise<void>; onError: (s: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayIST();
  const agenda = useMemo(() => buildAgenda(state, today), [state, today]);
  const startEdit = (m: TeamMember) => {
    setEditId(m.id);
    setName(m.name);
    setEmail(m.email);
    setAdding(true);
  };
  const close = () => {
    setAdding(false);
    setEditId(null);
    setName('');
    setEmail('');
  };
  const openCount = (id: string) => agenda.filter((i) => !i.done && i.task.ownerIds.includes(id) && diffDays(i.due, today) <= 7).length;
  const lateCount = (id: string) => agenda.filter((i) => !i.done && i.task.ownerIds.includes(id) && i.due < today).length;
  const loads = (id: string) => state.tasks.filter((t) => t.active && t.ownerIds.includes(id)).length;

  const add = async () => {
    setBusy(true);
    try {
      await saveMember({ id: editId ?? undefined, name: name.trim(), email: email.trim() });
      close();
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
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-[15px] font-semibold text-slate-950">{state.members.length} {state.members.length === 1 ? 'person' : 'people'}</h3>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-[40px] items-center gap-1 rounded px-1 text-sm font-medium text-brand-700 hover:underline">
            <UserPlusIcon className="h-4 w-4" /> Add
          </button>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {state.members.map((m) => (
          <li key={m.id} className="group flex items-center gap-2.5 px-4 py-2.5">
            <Avatar m={m} size="h-8 w-8 text-sm ring-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-950">
                {m.name}
                {m.id === me && <span className="ml-1.5 rounded bg-slate-100 px-1 text-sm font-medium text-slate-600">you</span>}
              </div>
              <div className="truncate text-sm text-slate-500">{m.email}</div>
              <div className="truncate text-sm text-slate-600">
                {loads(m.id)} task{loads(m.id) === 1 ? '' : 's'} · {openCount(m.id)} due this week
                {lateCount(m.id) ? <span className="text-rose-600"> · {lateCount(m.id)} late</span> : null}
              </div>
            </div>
            <button type="button" onClick={() => startEdit(m)} className="min-h-[40px] rounded-lg px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              Edit
            </button>
            <button type="button" onClick={() => void remove(m)} aria-label={`Remove ${m.name}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <TrashIcon className="h-4 w-4" />
            </button>
          </li>
        ))}
        {!state.members.length && !adding && <li className="px-4 py-3 text-sm text-slate-600">Add the people who do the work, so tasks can be assigned and reminders sent.</li>}
      </ul>
      {adding && (
        <div className="space-y-2 border-t border-slate-100 p-4">
          <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={input} placeholder="Email (for reminders)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="button" disabled={busy || !name.trim() || !email.includes('@')} onClick={() => void add()} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {editId ? 'Save' : 'Add person'}
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
export function RolesCard({
  state,
  onChanged,
  onError,
  defaultOpen = false,
  embedded = false,
}: {
  state: WorkState;
  onChanged: () => Promise<void>;
  onError: (s: string) => void;
  defaultOpen?: boolean;
  /** Inside a folding section: always open, no own header. */
  embedded?: boolean;
}) {
  const [openState, setOpen] = useState(defaultOpen);
  const open = embedded || openState;
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
    <div className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen(!open)} className={embedded ? 'hidden' : 'flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left'}>
        <UserGroupIcon className="h-4 w-4 text-brand-600" />
        <h3 className="text-[15px] font-semibold text-slate-950">Who does what</h3>
        <span className="ml-auto text-sm text-slate-600">
          {mapped}/{names.length} roles{unowned ? <span className="text-amber-700"> · {unowned} no owner</span> : null}
        </span>
        <ChevronDownIcon className={`h-4 w-4 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`space-y-2 px-4 py-3 text-sm ${embedded ? '' : 'border-t border-slate-100'}`}>
          {!embedded && (
            <p className="text-sm leading-relaxed text-slate-600">
            Pick who covers each role. Any task with no owner is assigned automatically from its role; tasks you assigned by hand are left alone.
          </p>
          )}
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
                  className="w-32 rounded-lg border border-slate-200 py-1 pl-2 pr-7 text-sm text-slate-800"
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
            <span className="flex-1 text-sm font-medium text-slate-700">Anyone else (unmatched roles)</span>
            <select
              value={r.fallback ?? ''}
              disabled={busy}
              onChange={(e) => void save({ roles: r.roles, fallback: e.target.value })}
              className="w-32 rounded-lg border border-slate-200 py-1 pl-2 pr-7 text-sm font-medium text-slate-800"
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
              className="w-full rounded-lg border border-brand-200 bg-brand-50 py-1.5 text-sm font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-50"
            >
              Assign the {unowned} task{unowned > 1 ? 's' : ''} with no owner
            </button>
          )}
          {note && <p className="text-sm text-emerald-700">{note}</p>}
        </div>
      )}
    </div>
  );
}

export function RemindersCard({ state, onRan, onPreview }: { state: WorkState; onRan: () => Promise<void>; onPreview: () => void }) {
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
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <BellAlertIcon className="h-4 w-4 text-brand-600" />
        <h3 className="text-[15px] font-semibold text-slate-950">Send daily emails</h3>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-slate-600">
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
          <span className="text-sm text-slate-500">India time</span>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={st.includeDueSoon} onChange={(e) => void update({ includeDueSoon: e.target.checked })} className="rounded text-brand-600" />
          Also list what’s coming up in the next few days
        </label>

        <MailConnection state={state} onChanged={onRan} />

        {unowned > 0 && <p className="text-sm text-amber-700">{unowned} active task{unowned > 1 ? 's have' : ' has'} no owner — they only show in the team summary.</p>}
        <div className="text-sm text-slate-600">
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
          <p className="text-sm text-slate-600">
            {run.emails.length} email{run.emails.length === 1 ? '' : 's'}
            {run.emails.some((e) => e.dryRun) ? ' (dry run — not sent)' : ` · ${run.emails.filter((e) => e.sent).length} sent`}
            {run.emails.some((e) => e.error && !e.dryRun) ? ` · failed: ${run.emails.find((e) => e.error && !e.dryRun)!.error}` : ''}
          </p>
        )}
        {err && <p className="text-sm text-rose-600">{err}</p>}
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
        <span className={`text-sm font-semibold ${m.configured ? 'text-emerald-800' : 'text-amber-800'}`}>
          {m.configured
            ? m.provider === 'smtp'
              ? `Email connected · Zoho (${m.user})`
              : `Email connected · ${m.provider}`
            : 'Email not connected — sends are a dry run'}
        </span>
        {m.configured && m.source !== 'env' && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium text-slate-600 hover:text-slate-800">
            Change
          </button>
        )}
      </div>
      {m.source === 'env' && <p className="mt-1 text-sm text-slate-600">Set on the server (Cloud Run settings).</p>}
      {editing && m.source !== 'env' && (
        <div className="mt-2 space-y-2">
          <p className="text-sm leading-relaxed text-slate-600">
            Zoho Mail → My Account → Security → <b>App passwords</b> → generate one named “MIS”, paste it below. Emails go out as Hargun &lt;hargun@heatronics.in&gt; (an alias of this mailbox). The password is stored on the server and never shown again.
          </p>
          <input className={input} value={user} onChange={(e) => setUser(e.target.value)} placeholder="Zoho login (mailbox)" aria-label="Zoho login" />
          <input className={input} type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Zoho app password" aria-label="Zoho app password" />
          <div className="flex justify-end gap-2">
            {m.configured && (
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-2.5 py-1 text-sm text-slate-600 hover:bg-white">
                Cancel
              </button>
            )}
            <button type="button" disabled={busy || !pass.trim()} onClick={() => void connect()} className="rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Checking…' : 'Connect'}
            </button>
          </div>
        </div>
      )}
      {m.configured && !editing && (
        <div className="mt-2 flex gap-1.5">
          <input className={`${input} py-1 text-sm`} value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Send test to" />
          <button type="button" disabled={busy} onClick={() => void test()} className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
            Send test
          </button>
        </div>
      )}
      {msg && <p className={`mt-1.5 text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}

/** In-page preview of today's emails, exactly as they will be sent. */
/** In-page preview of today's emails. `embedded` drops the card frame and header (inside a modal). */
export function EmailPreview({ onClose, embedded }: { onClose: () => void; embedded?: boolean }) {
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
    <section className={embedded ? '-mx-6 -my-5' : 'overflow-hidden rounded-xl border border-slate-200 bg-white'}>
      <div className={embedded ? 'hidden' : 'flex items-center gap-2 border-b border-slate-100 px-4 py-3'}>
        <h2 className="text-[15px] font-semibold text-slate-950">Today’s emails — preview</h2>
        <span className="text-sm text-slate-500">nothing is sent from here</span>
        <button type="button" onClick={onClose} className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Close preview">
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
      {err && <p className="px-4 py-3 text-sm text-rose-600">{err}</p>}
      {!data && !err && <p className="px-4 py-6 text-sm text-slate-600">Building…</p>}
      {data && !data.drafts.length && <p className="px-4 py-6 text-sm text-slate-600">Nothing to send today — no owner has a pending task and no team-summary address is set.</p>}
      {data && d && (
        <>
          <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2">
            {data.drafts.map((x, k) => (
              <button
                key={k}
                type="button"
                onClick={() => setI(k)}
                className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${k === i ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                {x.kind === 'summary' && !/summary/i.test(x.name) ? 'Team summary · ' : ''}
                {x.name} · {x.items}
              </button>
            ))}
          </div>
          <div className="space-y-0.5 border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm text-slate-600">
            <div>
              <span className="inline-block w-14 text-slate-500">From</span>Hargun &lt;hargun@heatronics.in&gt;
            </div>
            <div>
              <span className="inline-block w-14 text-slate-500">To</span>
              {d.to.join(', ')}
            </div>
            <div>
              <span className="inline-block w-14 text-slate-500">Subject</span>
              <b className="font-semibold text-slate-800">{d.subject}</b>
            </div>
          </div>
          <iframe title="Email preview" srcDoc={d.html} sandbox="allow-popups" className="h-[720px] w-full bg-slate-100" />
        </>
      )}
    </section>
  );
}
