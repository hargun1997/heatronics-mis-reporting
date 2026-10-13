// ----------------------------------------------------------------------------
// Ownership — who owns which monthly upload, and chasing them when it's late.
//
// Add team members (name + email), then create assignments: a report someone
// must upload each month by a due day, with one or more owners. Link an
// assignment to an upload slot and "done" is read straight from the committed
// store — so the nagging stops the moment the file lands. "Send reminders now"
// emails each owner their outstanding list; a daily scheduler hitting
// /api/ownership/reminders/run makes it "every day until done".
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import { ALL_SLOTS } from '../../data/ingest/catalog';
import {
  getOverview, saveMember, deleteMember, saveAssignment, deleteAssignment, setDone, runReminders,
  type Overview, type Assignment, type OutstandingItem, type ReminderRun,
} from '../../data/ownership/ownershipClient';

const iconUsers = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-3.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2-5.24" />
  </svg>
);
const monthName = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MN[m] ?? m} ${y}`;
};

export function OwnershipPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<ReminderRun | null>(null);

  const load = async () => {
    try { setData(await getOverview()); } catch (e) { setError(e instanceof Error ? e.message : 'Load failed.'); }
  };
  useEffect(() => { void load(); }, []);

  const outstandingByAssignment = useMemo(() => {
    const m = new Map<string, OutstandingItem>();
    for (const o of data?.outstanding ?? []) m.set(o.assignmentId, o);
    return m;
  }, [data]);

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); } finally { setBusy(false); }
  };

  const sendNow = async () => {
    setBusy(true); setError(null);
    try { setLastRun(await runReminders()); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Send failed.'); } finally { setBusy(false); }
  };

  // Assign (or unassign) a report to a person from the person's side. Upserts a
  // slot-linked assignment and adds/removes this member as an owner; an
  // assignment left with no owners is removed.
  const toggleReport = (memberId: string, connectorId: string, slotId: string, slotLabel: string, checked: boolean) =>
    wrap(async () => {
      const existing = (data?.assignments ?? []).find((a) => a.connectorId === connectorId && a.slotId === slotId);
      if (checked) {
        if (existing) {
          if (!existing.ownerIds.includes(memberId)) await saveAssignment({ ...existing, ownerIds: [...existing.ownerIds, memberId] });
        } else {
          await saveAssignment({ label: slotLabel, connectorId, slotId, dueDay: 7, ownerIds: [memberId], active: true });
        }
      } else if (existing) {
        const owners = existing.ownerIds.filter((o) => o !== memberId);
        if (owners.length === 0) await deleteAssignment(existing.id);
        else await saveAssignment({ ...existing, ownerIds: owners });
      }
    });

  return (
    <>
      <PageHeader
        title="Ownership & Reminders"
        accent="brand"
        icon={iconUsers}
        description="Assign each monthly upload to its owners with a due day. Owners get a daily email reminder until the file is in."
        crumbs={[{ label: 'Reporting', to: '/reporting' }, { label: 'MIS Reporting', to: '/reporting/mis' }, { label: 'Ownership' }]}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        {data && <MailerBanner mailer={data.mailer} />}

        {data && (
          <AssignmentsCard
            data={data}
            outstanding={outstandingByAssignment}
            busy={busy}
            onSave={(a) => wrap(() => saveAssignment(a))}
            onDelete={(id) => wrap(() => deleteAssignment(id))}
            onToggleDone={(id, period, done) => wrap(() => setDone(id, period, done))}
            onSendNow={sendNow}
          />
        )}

        {lastRun && <RunSummary run={lastRun} />}

        {data && (
          <TeamCard
            members={data.members}
            assignments={data.assignments}
            busy={busy}
            onSave={(m) => wrap(() => saveMember(m))}
            onDelete={(id) => wrap(() => deleteMember(id))}
            onToggleReport={toggleReport}
          />
        )}
      </div>
    </>
  );
}

function MailerBanner({ mailer }: { mailer: Overview['mailer'] }) {
  if (mailer.configured) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        Email is live via <b>{mailer.provider}</b>, sending from <span className="font-mono">{mailer.from}</span>. Reminders will be delivered.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      No email provider is configured, so reminders run in <b>preview mode</b> — you'll see exactly who would be emailed, but nothing is sent.
      Set <span className="font-mono">RESEND_API_KEY</span> + <span className="font-mono">MAIL_FROM</span> (or Mailgun) on the server to turn it on.
    </div>
  );
}

// ---- Assignments -----------------------------------------------------------

const BLANK: Partial<Assignment> = { label: '', ownerIds: [], dueDay: 7, active: true };

function AssignmentsCard({
  data, outstanding, busy, onSave, onDelete, onToggleDone, onSendNow,
}: {
  data: Overview;
  outstanding: Map<string, OutstandingItem>;
  busy: boolean;
  onSave: (a: Partial<Assignment>) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string, period: string, done: boolean) => void;
  onSendNow: () => void;
}) {
  const [draft, setDraft] = useState<Partial<Assignment> | null>(null);
  const memberName = (id: string) => data.members.find((m) => m.id === id)?.name ?? '—';
  const period = data.servicePeriod;

  return (
    <SectionCard
      title="Report assignments"
      description={`Each row is a monthly upload. Status is for the current collection period — ${monthName(period)}.`}
      actions={
        <button onClick={onSendNow} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium px-3 py-1.5 hover:bg-brand-600 disabled:opacity-50">
          Send reminders now
        </button>
      }
    >
      {data.assignments.length === 0 && !draft && (
        <p className="text-sm text-slate-400 mb-3">No assignments yet. Add the reports your team is responsible for each month.</p>
      )}

      <div className="space-y-2">
        {data.assignments.map((a) => {
          const o = outstanding.get(a.id);
          const done = !o;
          return (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">{a.label}</span>
                    {!a.active && <span className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">paused</span>}
                    {a.active && (done
                      ? <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">in for {monthName(period)}</span>
                      : o!.status === 'overdue'
                        ? <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">{o!.daysLate}d overdue</span>
                        : <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">due in {-o!.daysLate}d</span>)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Owners: {a.ownerIds.length ? a.ownerIds.map(memberName).join(', ') : <span className="text-amber-600">none assigned</span>}
                    {' · '}due day {a.dueDay}
                    {a.connectorId && a.slotId && <> · linked to <span className="font-mono">{a.connectorId}/{a.slotId}</span> (auto-done on upload)</>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {a.active && !done && (
                    <button onClick={() => onToggleDone(a.id, period, true)} disabled={busy}
                      className="text-[11px] text-emerald-700 hover:underline disabled:opacity-50">mark done</button>
                  )}
                  {a.active && done && a.manualDone[period] && (
                    <button onClick={() => onToggleDone(a.id, period, false)} disabled={busy}
                      className="text-[11px] text-slate-400 hover:underline disabled:opacity-50">undo</button>
                  )}
                  <button onClick={() => setDraft(a)} className="text-[11px] text-slate-500 hover:underline">edit</button>
                  <button onClick={() => onDelete(a.id)} disabled={busy} className="text-[11px] text-rose-600 hover:underline disabled:opacity-50">delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {draft ? (
        <AssignmentForm
          draft={draft} members={data.members} busy={busy}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSubmit={() => { onSave(draft); setDraft(null); }}
        />
      ) : (
        <button onClick={() => setDraft({ ...BLANK })} className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium">+ Add assignment</button>
      )}
    </SectionCard>
  );
}

function AssignmentForm({
  draft, members, busy, onChange, onCancel, onSubmit,
}: {
  draft: Partial<Assignment>;
  members: Overview['members'];
  busy: boolean;
  onChange: (d: Partial<Assignment>) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const toggleOwner = (id: string) => {
    const owners = new Set(draft.ownerIds ?? []);
    if (owners.has(id)) owners.delete(id); else owners.add(id);
    onChange({ ...draft, ownerIds: [...owners] });
  };
  const slotValue = draft.connectorId && draft.slotId ? `${draft.connectorId}::${draft.slotId}` : '';
  return (
    <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/30 p-3.5 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">Report / task</span>
          <input value={draft.label ?? ''} onChange={(e) => onChange({ ...draft, label: e.target.value })}
            placeholder="e.g. Amazon settlement report"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40" />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">Due day of month (of the following month)</span>
          <input type="number" min={1} max={28} value={draft.dueDay ?? 7} onChange={(e) => onChange({ ...draft, dueDay: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40" />
        </label>
      </div>

      <div>
        <span className="text-[11px] font-medium text-slate-500">Owners (one or more)</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {members.length === 0 && <span className="text-xs text-amber-600">Add a team member below first.</span>}
          {members.map((m) => {
            const on = (draft.ownerIds ?? []).includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggleOwner(m.id)}
                className={`text-xs rounded-full border px-2.5 py-1 ${on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">Link to upload slot (optional — auto-marks done)</span>
          <select value={slotValue}
            onChange={(e) => {
              const [connectorId, slotId] = e.target.value.split('::');
              onChange({ ...draft, connectorId: connectorId || undefined, slotId: slotId || undefined });
            }}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400/40">
            <option value="">— not linked —</option>
            {ALL_SLOTS.map((s) => (
              <option key={`${s.connectorId}::${s.slotId}`} value={`${s.connectorId}::${s.slotId}`}>{s.connectorId} — {s.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 mt-5">
          <input type="checkbox" checked={draft.active !== false} onChange={(e) => onChange({ ...draft, active: e.target.checked })} />
          <span className="text-xs text-slate-600">Active (send reminders)</span>
        </label>
      </div>

      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={busy || !((draft.label ?? '').trim())}
          className="rounded-lg bg-brand-500 text-white text-sm font-medium px-3 py-1.5 hover:bg-brand-600 disabled:opacity-50">Save</button>
        <button onClick={onCancel} className="rounded-lg border border-slate-200 text-sm px-3 py-1.5 text-slate-600 hover:bg-slate-50">Cancel</button>
      </div>
    </div>
  );
}

// ---- Team ------------------------------------------------------------------

// Catalog upload slots grouped by connector, for the per-person report checklist.
const SLOTS_BY_CONNECTOR = (() => {
  const g = new Map<string, { connectorId: string; slotId: string; label: string }[]>();
  for (const s of ALL_SLOTS) {
    const arr = g.get(s.connectorId) ?? [];
    arr.push({ connectorId: s.connectorId, slotId: s.slotId, label: s.label });
    g.set(s.connectorId, arr);
  }
  return [...g.entries()];
})();

function TeamCard({
  members, assignments, busy, onSave, onDelete, onToggleReport,
}: {
  members: Overview['members'];
  assignments: Assignment[];
  busy: boolean;
  onSave: (m: { name: string; email: string }) => void;
  onDelete: (id: string) => void;
  onToggleReport: (memberId: string, connectorId: string, slotId: string, slotLabel: string, checked: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const add = () => { if (name.trim() && email.trim()) { onSave({ name: name.trim(), email: email.trim() }); setName(''); setEmail(''); } };

  // Which (connectorId, slotId) a member owns, from the slot-linked assignments.
  const ownsSlot = (memberId: string, connectorId: string, slotId: string) =>
    assignments.some((a) => a.connectorId === connectorId && a.slotId === slotId && a.ownerIds.includes(memberId));
  const reportCount = (memberId: string) =>
    assignments.filter((a) => a.ownerIds.includes(memberId)).length;

  return (
    <SectionCard title="Team members" description="People who can own an upload. Open a person to tick the reports they're responsible for.">
      <div className="space-y-2">
        {members.map((m) => {
          const open = openId === m.id;
          return (
            <div key={m.id} className="rounded-lg border border-slate-100 bg-white">
              <div className="flex items-center gap-3 px-3 py-2">
                <span className="text-sm font-medium text-slate-700">{m.name}</span>
                <span className="text-xs text-slate-400">{m.email}</span>
                <span className="text-[10px] text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5">{reportCount(m.id)} report{reportCount(m.id) === 1 ? '' : 's'}</span>
                <button onClick={() => setOpenId(open ? null : m.id)} className="ml-auto text-[11px] text-brand-600 hover:underline">
                  {open ? 'done' : 'assign reports'}
                </button>
                <button onClick={() => onDelete(m.id)} disabled={busy} className="text-[11px] text-rose-600 hover:underline disabled:opacity-50">remove</button>
              </div>
              {open && (
                <div className="border-t border-slate-100 px-3 py-3 bg-slate-50/40">
                  <p className="text-[11px] text-slate-500 mb-2">Tick each report <b>{m.name}</b> is responsible to upload each month. Reminders go out until it's in.</p>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                    {SLOTS_BY_CONNECTOR.map(([connectorId, slots]) => (
                      <div key={connectorId}>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{connectorId}</div>
                        <div className="space-y-1">
                          {slots.map((s) => {
                            const on = ownsSlot(m.id, s.connectorId, s.slotId);
                            return (
                              <label key={`${s.connectorId}::${s.slotId}`} className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                                <input type="checkbox" checked={on} disabled={busy}
                                  onChange={(e) => onToggleReport(m.id, s.connectorId, s.slotId, s.label, e.target.checked)}
                                  className="mt-0.5" />
                                <span>{s.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {members.length === 0 && <p className="text-sm text-slate-400">No team members yet — add one below.</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40" />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com" className="mt-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40" />
        </label>
        <button onClick={add} disabled={busy || !name.trim() || !email.trim()} className="rounded-lg bg-slate-800 text-white text-sm px-3 py-1.5 hover:bg-slate-900 disabled:opacity-50">Add member</button>
      </div>
    </SectionCard>
  );
}

function RunSummary({ run }: { run: ReminderRun }) {
  const sent = run.emails.filter((e) => e.sent).length;
  const dry = run.emails.filter((e) => e.dryRun).length;
  const failed = run.emails.filter((e) => !e.sent && !e.dryRun).length;
  return (
    <SectionCard title="Last reminder run" description={`${monthName(run.servicePeriod)} · ${new Date(run.runDate).toLocaleString('en-IN')}`}>
      <div className="text-xs text-slate-600 mb-2">
        {run.emails.length === 0
          ? 'Nothing outstanding — no reminders needed.'
          : <>{sent > 0 && <span className="text-emerald-700 font-medium">{sent} sent</span>}
             {dry > 0 && <span className="text-amber-700 font-medium">{sent > 0 ? ' · ' : ''}{dry} previewed (email not configured)</span>}
             {failed > 0 && <span className="text-rose-700 font-medium"> · {failed} failed</span>}</>}
      </div>
      <div className="space-y-1">
        {run.emails.map((e, i) => (
          <div key={i} className="text-[11px] flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${e.sent ? 'bg-emerald-500' : e.dryRun ? 'bg-amber-400' : 'bg-rose-500'}`} />
            <span className="text-slate-600">{e.to.join(', ')}</span>
            {e.error && <span className="text-rose-600">— {e.error}</span>}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
