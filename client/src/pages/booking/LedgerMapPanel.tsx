// ----------------------------------------------------------------------------
// Ledger map — the right-hand panel of the Booking assistant. Searchable list
// of vendor → ledger rules; each row edits in place (no modal). Saving writes
// the whole map to /api/booking-assistant/map, which the chat reads on every
// turn, so an edit here changes the next answer.
// ----------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TO_CONFIRM, type ExpenseMapRow } from '../../data/bookingAssistant/bookingClient';
import { Modal } from '../../components/ui/overlays';
import { BTN, BTN_PRIMARY, InfoTip } from '../../components/ui/states';

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
  const [viewing, setViewing] = useState<string | null>(null);

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
    setViewing(null);
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
  const viewRow = viewing ? all.find((r) => r.id === viewing) ?? null : null;

  return (
    <section aria-label="Ledger map" className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-card">
      <header className="border-b border-slate-200 px-4 pb-3 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Ledger map</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">{all.length}</span>
          <InfoTip label="About the ledger map"><p>Vendor → ledger rules from Hargun. The assistant follows each confirmed row exactly.</p><p>A change here goes to the next answer, for everyone.</p></InfoTip>
          {needsInfo > 0 && (
            <span className="ml-auto rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-800">{needsInfo} need Hargun</span>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search the ledger map</span>
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Vendor, ledger or keyword"
              className="min-h-11 sm:min-h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-500" />
          </label>
          <button type="button" onClick={startNew} className={BTN}>Add vendor</button>
        </div>
        <div className="mt-2 flex gap-1" role="group" aria-label="Filter rows">
          {([['all', 'All'], ['needs-info', 'Needs info'], ['confirmed', 'Confirmed']] as const).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
              className={`min-h-11 sm:min-h-8 rounded-md px-2.5 text-[12.5px] font-medium ${filter === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError && <p className="m-4 rounded-lg bg-rose-50 p-3 text-[13px] text-rose-800">Couldn’t load the map: {loadError}</p>}
        {!rows && !loadError && <p role="status" className="p-4 text-[13px] text-slate-600">Loading the map…</p>}

        <ul className="divide-y divide-slate-100">
          {shown.map((r) => {
            const ledgers = r.ledger === TO_CONFIRM ? [] : r.ledger.split(' · ');
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setViewing(r.id)} aria-label={`Open ${r.vendor}`}
                  className="block w-full px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[14px] font-semibold text-slate-900">{r.vendor}</span>
                    <StatusTag r={r} />
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-slate-600">
                    <span className="font-semibold text-slate-500">Dr </span>
                    {ledgers.length ? <><span className="font-mono text-slate-900">{ledgers[0]}</span>{ledgers.length > 1 ? ` +${ledgers.length - 1}` : ''}</> : <span className="font-medium text-amber-800">Ledger to confirm</span>}
                    {r.voucherType ? ` · ${r.voucherType}` : ''}{r.tds ? ` · ${r.tds.split(' ')[0]}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {rows && shown.length === 0 && !isNewDraft && (
          <p className="p-4 text-[13px] text-slate-600">No rows match. Clear the search, or add the vendor.</p>
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
          'Changes save for everyone.'
        )}
      </footer>
      {viewRow && !editing && (
        <Modal open onClose={() => setViewing(null)} title={viewRow.vendor} subtitle={<StatusTag r={viewRow} />} width={620}
          footer={<>
            <button type="button" className={BTN} onClick={() => { setViewing(null); onAsk(`How do I book a ${viewRow.vendor} invoice?`); }}>Ask about this</button>
            <button type="button" className={BTN} onClick={() => startEdit(viewRow)}>Edit</button>
          </>}>
          <RowDetail r={viewRow} />
        </Modal>
      )}
      {editing && draft && (
        <Modal open onClose={cancel} title={isNewDraft ? 'New vendor rule' : `Edit ${draft.vendor}`} width={620}>
          {isNewDraft ? (
            <RowEditor draft={draft} setDraft={setDraft} onCancel={cancel} onSave={commit} saving={saving} isNew />
          ) : (
            <RowEditor draft={draft} setDraft={setDraft} onCancel={cancel} onSave={commit} saving={saving}
              onDelete={() => setConfirmDelete(editing)} confirmingDelete={confirmDelete === editing}
              onConfirmDelete={() => void remove(editing)} onCancelDelete={() => setConfirmDelete(null)} />
          )}
          {saveError && <p role="alert" className="mt-2 text-sm text-red-700">Could not save: {saveError}</p>}
        </Modal>
      )}
    </section>
  );
}

function StatusTag({ r }: { r: ExpenseMapRow }) {
  if (r.status === 'out-of-scope') return <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-px text-xs font-semibold text-slate-700">Not in scope</span>;
  if (r.status === 'needs-info') return <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-px text-xs font-semibold text-amber-800">Needs info</span>;
  return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-px text-xs font-semibold text-emerald-800">{r.evidence ? 'Confirmed · from books' : 'Confirmed'}</span>;
}

function RowDetail({ r }: { r: ExpenseMapRow }) {
  return (
    <div className="space-y-3 text-[13px] text-slate-700">
      <div>
        <p className="text-xs font-semibold text-slate-600">Dr ledger(s)</p>
        {r.ledger === TO_CONFIRM ? <p className="font-medium text-amber-800">Ledger to confirm</p> : (
          <p className="mt-1">{r.ledger.split(' · ').map((l, li) => <span key={li} className="mb-1 mr-1 inline-block rounded bg-slate-100 px-1.5 font-mono text-[12px] font-medium text-slate-900">{l}</span>)}</p>
        )}
        {r.status === 'needs-info' && r.suggestion && <p className="mt-1 text-slate-600">Closest in Tally: <span className="font-mono text-slate-900">{r.suggestion}</span></p>}
      </div>
      {r.party && <div><p className="text-xs font-semibold text-slate-600">Cr / party ledger</p><p className="font-mono text-slate-900">{r.party}</p></div>}
      <dl className="grid gap-2 sm:grid-cols-3">
        <Fact k="Voucher" v={r.voucherType || 'Not set'} />
        <Fact k="GST" v={r.gst || 'Not set'} />
        <Fact k="TDS" v={r.tds || 'Not set'} />
      </dl>
      {r.notes && <p className="leading-snug">{r.notes}</p>}
      {r.subRules && r.subRules.length > 0 && (
        <div className="rounded-md border border-slate-200 px-3 py-2">
          <p className="text-xs font-semibold text-slate-600">Rules by document</p>
          <ul className="mt-1 space-y-1">{r.subRules.map((x, i) => <li key={i}><span className="font-semibold text-slate-900">{x.when}</span> → {x.then}</li>)}</ul>
        </div>
      )}
      {r.link && <p><a href={r.link} target="_blank" rel="noreferrer" className="font-semibold text-accent-700 hover:underline">Download invoices ↗</a>{r.linkNote && <span className="text-slate-600">: {r.linkNote}</span>}</p>}
      {r.evidence && (
        <details className="rounded-md bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer font-medium text-slate-900">Example from the books</summary>
          <p className="mt-1 font-mono text-[12px] leading-relaxed text-slate-800">{r.evidence}</p>
        </details>
      )}
      {r.anchor && <Link to={`/handbook#${r.anchor}`} className="inline-block font-medium text-accent-700 hover:underline">Open in the Handbook ↗</Link>}
      {r.keywords.length > 0 && <p className="text-xs text-slate-600">Match words: {r.keywords.join(', ')}</p>}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-slate-600">{k}</dt>
      <dd className="min-w-0 break-words text-slate-900">{v}</dd>
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

function RowEditor({ draft, setDraft, onCancel, onSave, saving, onDelete, confirmingDelete, onConfirmDelete, onCancelDelete }: EditorProps) {
  const set = <K extends keyof ExpenseMapRow>(k: K, v: ExpenseMapRow[K]) => setDraft({ ...draft, [k]: v });
  // Kept as raw text while typing, so a half-written line isn't dropped.
  const [subRulesText, setSubRulesText] = useState(() => (draft.subRules ?? []).map((s) => `${s.when} → ${s.then}`).join('\n'));
  const field = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-500';
  const label = 'block text-[12px] font-medium text-slate-700';
  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
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
        <button type="submit" disabled={saving || !draft.vendor.trim()} className={BTN_PRIMARY}>
          {saving ? 'Saving…' : 'Save row'}
        </button>
        <button type="button" onClick={onCancel} className={BTN}>
          Cancel
        </button>
        {onDelete && !confirmingDelete && (
          <button type="button" onClick={onDelete} className="ml-auto min-h-11 sm:min-h-8 rounded-md px-2 text-[12.5px] font-medium text-rose-700 hover:bg-rose-50">
            Delete
          </button>
        )}
        {confirmingDelete && (
          <span className="ml-auto flex items-center gap-2 text-[12.5px] text-rose-800">
            Delete this rule?
            <button type="button" onClick={onConfirmDelete} className="min-h-11 sm:min-h-8 rounded-md px-2 font-semibold hover:bg-rose-50">Delete rule</button>
            <button type="button" onClick={onCancelDelete} className="min-h-11 sm:min-h-8 rounded-md px-2 text-slate-600 hover:bg-slate-100">Keep</button>
          </span>
        )}
      </div>
    </form>
  );
}
