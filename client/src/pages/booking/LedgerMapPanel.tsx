// ----------------------------------------------------------------------------
// Ledger map — the right-hand panel of the Booking assistant. Searchable list
// of vendor → ledger rules; each row edits in place (no modal). Saving writes
// the whole map to /api/booking-assistant/map, which the chat reads on every
// turn, so an edit here changes the next answer.
// ----------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TO_CONFIRM, type ExpenseMapRow } from '../../data/bookingAssistant/bookingClient';

type Filter = 'all' | 'needs-info' | 'confirmed';

interface Props {
  rows: ExpenseMapRow[] | null;
  loadError: string | null;
  saving: boolean;
  saveError: string | null;
  savedAt: string | null;
  onSave: (rows: ExpenseMapRow[]) => Promise<boolean>;
  onAsk: (question: string) => void;
}

const EMPTY: ExpenseMapRow = {
  id: '',
  vendor: '',
  keywords: [],
  ledger: TO_CONFIRM,
  voucherType: '',
  gst: '',
  tds: '',
  notes: '',
  anchor: '',
  status: 'needs-info',
};

export function LedgerMapPanel({ rows, loadError, saving, saveError, savedAt, onSave, onAsk }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExpenseMapRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const all = useMemo(() => rows ?? [], [rows]);
  const needsInfo = all.filter((r) => r.status === 'needs-info').length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return [r.vendor, r.ledger, r.voucherType, r.gst, r.tds, r.notes, r.suggestion ?? '', r.party ?? '', r.evidence ?? '', ...r.keywords]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [all, query, filter]);

  const startEdit = (r: ExpenseMapRow) => {
    setEditing(r.id);
    setDraft({ ...r, keywords: [...r.keywords] });
    setConfirmDelete(null);
  };
  const startNew = () => {
    const id = `new-${Date.now().toString(36)}`;
    setEditing(id);
    setDraft({ ...EMPTY, id });
    setFilter('all');
    setQuery('');
  };
  const cancel = () => {
    setEditing(null);
    setDraft(null);
  };
  const commit = async () => {
    if (!draft || !draft.vendor.trim()) return;
    const ledger = draft.ledger.trim() || TO_CONFIRM;
    const row: ExpenseMapRow = {
      ...draft,
      vendor: draft.vendor.trim(),
      ledger,
      status: ledger === TO_CONFIRM ? 'needs-info' : draft.status,
    };
    const exists = all.some((r) => r.id === row.id);
    const next = exists ? all.map((r) => (r.id === row.id ? row : r)) : [...all, row];
    if (await onSave(next)) cancel();
  };
  const remove = async (id: string) => {
    if (await onSave(all.filter((r) => r.id !== id))) {
      setConfirmDelete(null);
      cancel();
    }
  };

  const isNewDraft = draft && editing && !all.some((r) => r.id === editing);

  return (
    <section aria-label="Ledger map" className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-card">
      <header className="border-b border-slate-200 px-4 pb-3 pt-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-[#0b1220]">Ledger map</h2>
          <span className="text-[13px] text-slate-600 tabular-nums">{all.length} vendors</span>
          {needsInfo > 0 && (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-semibold text-amber-900 tabular-nums">
              {needsInfo} need Hargun
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] leading-snug text-slate-600">
          Hargun’s vendor → ledger rules. The assistant follows confirmed rows exactly.
        </p>
        <div className="mt-3 flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search the ledger map</span>
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vendor, ledger, keyword…"
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-[13px] text-[#0b1220] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            />
          </label>
          <button
            type="button"
            onClick={startNew}
            className="rounded-lg border border-slate-300 px-2.5 text-[13px] font-medium text-[#0b1220] hover:border-brand-400 hover:text-brand-700"
          >
            + Add
          </button>
        </div>
        <div className="mt-2 flex gap-1" role="tablist" aria-label="Filter rows">
          {(
            [
              ['all', 'All'],
              ['needs-info', 'Needs info'],
              ['confirmed', 'Confirmed'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={`rounded-md px-2 py-1 text-[12.5px] font-medium ${
                filter === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-[#0b1220]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError && <p className="m-4 rounded-lg bg-rose-50 p-3 text-[13px] text-rose-800">Couldn’t load the map: {loadError}</p>}
        {!rows && !loadError && <p className="p-4 text-[13px] text-slate-600">Loading the map…</p>}

        {isNewDraft && draft && (
          <RowEditor draft={draft} setDraft={setDraft} onCancel={cancel} onSave={commit} saving={saving} isNew />
        )}

        <ul className="divide-y divide-slate-100">
          {shown.map((r) =>
            editing === r.id && draft ? (
              <li key={r.id}>
                <RowEditor
                  draft={draft}
                  setDraft={setDraft}
                  onCancel={cancel}
                  onSave={commit}
                  saving={saving}
                  onDelete={() => setConfirmDelete(r.id)}
                  confirmingDelete={confirmDelete === r.id}
                  onConfirmDelete={() => void remove(r.id)}
                  onCancelDelete={() => setConfirmDelete(null)}
                />
              </li>
            ) : (
              <li key={r.id} className="group px-4 py-3 hover:bg-slate-50/70">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[14px] font-semibold text-[#0b1220]">{r.vendor}</span>
                      {r.status === 'out-of-scope' ? (
                        <span className="rounded bg-slate-100 px-1.5 py-px text-[11.5px] font-semibold text-slate-700 ring-1 ring-slate-200">Not in scope for now</span>
                      ) : r.status === 'needs-info' ? (
                        <span className="rounded bg-amber-100 px-1.5 py-px text-[11.5px] font-semibold text-amber-900">Needs info</span>
                      ) : (
                        <span className="rounded bg-emerald-50 px-1.5 py-px text-[11.5px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
                          {r.evidence ? 'Confirmed · from books' : 'Confirmed'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[13px] text-slate-600">
                      <span className="inline-block w-6 font-semibold text-slate-500">Dr</span>
                      {r.ledger === TO_CONFIRM ? (
                        <span className="font-medium text-amber-900">ledger to confirm</span>
                      ) : (
                        r.ledger.split(' · ').map((l, li) => (
                          <span key={li} className="mb-0.5 mr-1 inline-block rounded bg-slate-100 px-1 font-mono text-[12px] font-medium text-[#0b1220]">{l}</span>
                        ))
                      )}
                    </div>
                    {r.party && (
                      <div className="mt-0.5 text-[13px] text-slate-600">
                        <span className="inline-block w-6 font-semibold text-slate-500">Cr</span>
                        <span className="font-mono text-[12.5px] font-medium text-[#0b1220]">{r.party}</span>
                      </div>
                    )}
                    {r.status === 'needs-info' && r.suggestion && (
                      <div className="mt-0.5 text-[12.5px] text-slate-600">
                        Closest in Tally: <span className="font-mono text-[12px] text-slate-800">{r.suggestion}</span>
                      </div>
                    )}
                    <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-slate-600">
                      {r.voucherType && <Fact k="Voucher" v={r.voucherType} />}
                      {r.gst && <Fact k="GST" v={r.gst} />}
                      {r.tds && <Fact k="TDS" v={r.tds} />}
                    </dl>
                    {r.notes && <p className="mt-1 text-[12.5px] leading-snug text-slate-600">{r.notes}</p>}
                    {r.subRules && r.subRules.length > 0 && (
                      <div className="mt-1.5 rounded-md border border-slate-200 px-2 py-1.5">
                        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Rules by document</div>
                        <ul className="mt-1 space-y-1">
                          {r.subRules.map((s, si) => (
                            <li key={si} className="text-[12.5px] leading-snug text-slate-700">
                              <span className="font-semibold text-[#0b1220]">{s.when}</span> → {s.then}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {r.link && (
                      <div className="mt-1.5 text-[12.5px] leading-snug">
                        <a href={r.link} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">
                          Download invoices ↗
                        </a>
                        {r.linkNote && <span className="text-slate-600"> — {r.linkNote}</span>}
                      </div>
                    )}
                    {r.evidence && (
                      <details className="mt-1.5 rounded-md bg-slate-50 px-2 py-1 text-[12.5px] text-slate-700">
                        <summary className="cursor-pointer font-medium text-[#0b1220]">Evidence from the books</summary>
                        <p className="mt-1 font-mono text-[12px] leading-relaxed text-slate-800">{r.evidence}</p>
                      </details>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                      {r.anchor && (
                        <Link to={`/handbook#${r.anchor}`} className="font-medium text-brand-700 hover:underline">
                          Handbook ↗
                        </Link>
                      )}
                      <button type="button" onClick={() => onAsk(`How do I book a ${r.vendor} invoice?`)} className="font-medium text-slate-700 hover:text-brand-700">
                        Ask about this
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    aria-label={`Edit ${r.vendor}`}
                    className="rounded-md border border-transparent px-2 py-1 text-[12.5px] font-medium text-slate-600 hover:border-slate-300 hover:text-[#0b1220]"
                  >
                    Edit
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
        {rows && shown.length === 0 && !isNewDraft && (
          <p className="p-4 text-[13px] text-slate-600">No rows match. Clear the search or add the vendor.</p>
        )}
      </div>

      <footer className="border-t border-slate-200 py-2.5 pl-4 pr-20 text-[12.5px] text-slate-600">
        {saveError ? (
          <span className="text-rose-700">Save failed: {saveError}</span>
        ) : saving ? (
          'Saving…'
        ) : savedAt ? (
          <>Saved {new Date(savedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</>
        ) : (
          'Changes save to the server for everyone.'
        )}
      </footer>
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 max-w-full gap-1">
      <dt className="flex-shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 break-words text-slate-800">{v}</dd>
    </div>
  );
}

interface EditorProps {
  draft: ExpenseMapRow;
  setDraft: (r: ExpenseMapRow) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  isNew?: boolean;
  onDelete?: () => void;
  confirmingDelete?: boolean;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
}

function RowEditor({ draft, setDraft, onCancel, onSave, saving, isNew, onDelete, confirmingDelete, onConfirmDelete, onCancelDelete }: EditorProps) {
  const set = <K extends keyof ExpenseMapRow>(k: K, v: ExpenseMapRow[K]) => setDraft({ ...draft, [k]: v });
  // Kept as raw text while typing, so a half-written line isn't dropped.
  const [subRulesText, setSubRulesText] = useState(() => (draft.subRules ?? []).map((s) => `${s.when} → ${s.then}`).join('\n'));
  const field = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[13px] text-[#0b1220] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30';
  const label = 'block text-[12px] font-medium text-slate-700';
  return (
    <form
      className="space-y-2.5 border-l-[3px] border-brand-500 bg-brand-50/40 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="text-[12px] font-semibold uppercase tracking-wide text-brand-800">{isNew ? 'New vendor rule' : `Editing · ${draft.vendor}`}</div>
      <label className={label}>
        Vendor / category
        <input className={field} value={draft.vendor} onChange={(e) => set('vendor', e.target.value)} required autoFocus />
      </label>
      <label className={label}>
        Match keywords <span className="font-normal text-slate-500">(comma-separated)</span>
        <input className={field} value={draft.keywords.join(', ')} onChange={(e) => set('keywords', e.target.value.split(',').map((k) => k.trim()).filter(Boolean))} />
      </label>
      <label className={label}>
        Dr ledger(s) <span className="font-normal text-slate-500">(exact Tally names, or “To confirm”)</span>
        <input className={`${field} font-mono`} value={draft.ledger} onChange={(e) => set('ledger', e.target.value)} />
      </label>
      <label className={label}>
        Cr / party ledger <span className="font-normal text-slate-500">(collection or vendor ledger)</span>
        <input className={`${field} font-mono`} value={draft.party ?? ''} onChange={(e) => set('party', e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          Voucher type
          <input className={field} value={draft.voucherType} onChange={(e) => set('voucherType', e.target.value)} placeholder="e.g. Purchase-Services" />
        </label>
        <label className={label}>
          TDS section
          <input className={field} value={draft.tds} onChange={(e) => set('tds', e.target.value)} placeholder="e.g. 194J @ 10%" />
        </label>
      </div>
      <label className={label}>
        GST treatment
        <input className={field} value={draft.gst} onChange={(e) => set('gst', e.target.value)} placeholder="e.g. Input IGST 18% / RCM" />
      </label>
      <label className={label}>
        Notes
        <textarea className={`${field} min-h-[56px]`} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      <label className={label}>
        Evidence from the books <span className="font-normal text-slate-500">(an example voucher)</span>
        <textarea className={`${field} min-h-[56px] font-mono`} value={draft.evidence ?? ''} onChange={(e) => set('evidence', e.target.value)} />
      </label>
      <label className={label}>
        Invoice download link
        <input className={field} type="url" value={draft.link ?? ''} onChange={(e) => set('link', e.target.value)} placeholder="https://…" />
      </label>
      <label className={label}>
        What to download there
        <input className={field} value={draft.linkNote ?? ''} onChange={(e) => set('linkNote', e.target.value)} />
      </label>
      <label className={label}>
        Rules by document <span className="font-normal text-slate-500">(one per line: when → then)</span>
        <textarea
          className={`${field} min-h-[56px]`}
          value={subRulesText}
          onChange={(e) => {
            setSubRulesText(e.target.value);
            set(
              'subRules',
              e.target.value
                .split('\n')
                .map((line) => {
                  const i = line.indexOf('→');
                  return i < 0 ? null : { when: line.slice(0, i).trim(), then: line.slice(i + 1).trim() };
                })
                .filter((x): x is { when: string; then: string } => !!x && !!x.when && !!x.then),
            );
          }}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          Handbook anchor
          <input className={`${field} font-mono`} value={draft.anchor} onChange={(e) => set('anchor', e.target.value)} placeholder="c27-shopflo" />
        </label>
        <label className={label}>
          Status
          <select className={field} value={draft.status} onChange={(e) => set('status', e.target.value as ExpenseMapRow['status'])}>
            <option value="confirmed">Confirmed</option>
            <option value="needs-info">Needs info</option>
            <option value="out-of-scope">Not in scope for now</option>
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving || !draft.vendor.trim()} className="rounded-md bg-brand-500 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save row'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100">
          Cancel
        </button>
        {onDelete && !confirmingDelete && (
          <button type="button" onClick={onDelete} className="ml-auto text-[12.5px] font-medium text-rose-700 hover:underline">
            Delete
          </button>
        )}
        {confirmingDelete && (
          <span className="ml-auto flex items-center gap-2 text-[12.5px] text-rose-800">
            Delete this rule?
            <button type="button" onClick={onConfirmDelete} className="font-semibold hover:underline">Yes</button>
            <button type="button" onClick={onCancelDelete} className="text-slate-600 hover:underline">No</button>
          </span>
        )}
      </div>
    </form>
  );
}
