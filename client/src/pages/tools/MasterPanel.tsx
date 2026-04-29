import { useRef, useState } from 'react';
import type { MasterState } from '../../data/tally/useTallyMaster';
import type { ReduceStats } from '../../data/tally/reduceTallyExport';

type Tab = 'active' | 'replace' | 'reset';

export function MasterPanel({ state }: { state: MasterState }) {
  const hasMaster = !!state.master;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  const [savedFlash, setSavedFlash] = useState<ReduceStats | null>(null);

  const m = state.master;
  const ledgerCount = m?.ledgers?.length || 0;
  const voucherCount = m?.voucherTypes?.length || 0;
  const ccCount = m?.costCentres?.length || 0;
  const isOverride = state.source === 'override';

  function flash(stats: ReduceStats) {
    setSavedFlash(stats);
    setTimeout(() => setSavedFlash(null), 2400);
    setTab('active');
    setOpen(true);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            Tally master
            {!state.loading && hasMaster && (
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                  isOverride ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isOverride ? 'Overridden' : 'Bundled'}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            {state.loading
              ? 'Loading…'
              : hasMaster
                ? `${ledgerCount} ledgers · ${voucherCount} voucher types · ${ccCount} cost centres`
                : 'Not loaded — upload your Tally master to get started'}
            {savedFlash && (
              <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-emerald-100 text-emerald-800">
                Override loaded · {savedFlash.ledgers} ledgers
              </span>
            )}
          </div>
        </div>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform flex-shrink-0 ml-2 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          <div className="flex gap-1 px-2 sm:px-3 pt-2 pb-0">
            {(['active', 'replace', 'reset'] as Tab[]).map((t) => {
              const disabled =
                (!hasMaster && t !== 'replace') || (t === 'reset' && !isOverride);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={disabled}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tab === t
                      ? 'bg-slate-900 text-white'
                      : disabled
                        ? 'text-slate-300 cursor-not-allowed'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t === 'active'
                    ? 'Active'
                    : t === 'replace'
                      ? isOverride
                        ? 'Replace override'
                        : 'Override'
                      : 'Revert to bundled'}
                </button>
              );
            })}
          </div>

          <div className="p-4 sm:p-5">
            {tab === 'active' && hasMaster && <ActiveTab state={state} />}
            {tab === 'replace' && <ReplaceTab state={state} onLoaded={flash} />}
            {tab === 'reset' && hasMaster && (
              <ResetTab
                onReset={() => {
                  state.clear();
                  setTab('replace');
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------

function ActiveTab({ state }: { state: MasterState }) {
  const m = state.master;
  if (!m) return null;
  return (
    <div className="space-y-3 text-xs">
      {state.sourceLabel && <KV k="Source" v={state.sourceLabel} />}
      {m.company && <KV k="Company" v={m.company} />}
      {m.generatedAt && <KV k="Reduced" v={new Date(m.generatedAt).toLocaleString()} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Groups" n={m.groups?.length || 0} />
        <Stat label="Ledgers" n={m.ledgers?.length || 0} />
        <Stat label="Voucher types" n={m.voucherTypes?.length || 0} />
        <Stat label="Cost centres" n={m.costCentres?.length || 0} />
      </div>
      <details className="rounded-lg border border-slate-200">
        <summary className="px-3 py-1.5 cursor-pointer text-slate-700">View ledgers</summary>
        <div className="max-h-48 overflow-auto px-3 py-2 space-y-0.5">
          {(m.ledgers || []).map((l) => (
            <div key={l.name} className="flex justify-between gap-2">
              <span className="text-slate-900 truncate">{l.name}</span>
              <span className="text-slate-500 truncate">{l.group || '—'}</span>
            </div>
          ))}
        </div>
      </details>
      <details className="rounded-lg border border-slate-200">
        <summary className="px-3 py-1.5 cursor-pointer text-slate-700">View voucher types</summary>
        <div className="max-h-48 overflow-auto px-3 py-2 space-y-0.5">
          {(m.voucherTypes || []).map((v) => (
            <div key={v.name} className="flex justify-between gap-2">
              <span className="text-slate-900 truncate">{v.name}</span>
              <span className="text-slate-500 truncate">{v.parent || '—'}</span>
            </div>
          ))}
        </div>
      </details>
      <details className="rounded-lg border border-slate-200">
        <summary className="px-3 py-1.5 cursor-pointer text-slate-700">View cost centres</summary>
        <div className="max-h-48 overflow-auto px-3 py-2 space-y-0.5">
          {(m.costCentres || []).map((c) => (
            <div key={`${c.category}-${c.name}`} className="flex justify-between gap-2">
              <span className="text-slate-900 truncate">{c.name}</span>
              <span className="text-slate-500 truncate">{c.category || '—'}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// --------------------------------------------------------------------------

function ReplaceTab({
  state,
  onLoaded,
}: {
  state: MasterState;
  onLoaded: (stats: ReduceStats) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const stats = await state.loadFromFile(file);
      onLoaded(stats);
    } catch {
      // error is set on state.error, surfaced inline
    } finally {
      setBusy(false);
    }
  }

  function handlePaste() {
    if (!pasteText.trim()) return;
    setBusy(true);
    try {
      const stats = state.loadFromText(pasteText);
      onLoaded(stats);
      setPasteText('');
    } catch {
      // error is set on state.error
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-xs">
      <p className="text-slate-600">
        Override the bundled master with your own export. Pick the JSON your
        Tally Prime exports (Gateway → Display More Reports → Masters → JSON
        Export). The file may be UTF-16 — that's fine. Reduction runs in this
        browser; the override is saved to{' '}
        <code className="bg-slate-100 px-1 rounded">localStorage</code> and never
        leaves your device. Click <em>Revert to bundled</em> any time to drop
        the override.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-white py-4 text-slate-600 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
      >
        {busy ? 'Reducing…' : 'Pick a Tally export JSON'}
      </button>
      <div className="text-center text-[10px] uppercase tracking-wider text-slate-400">or paste</div>
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder='Paste raw Tally export {"tallymessage":[…]} or a slim master JSON'
        rows={5}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[11px]"
      />
      <button
        type="button"
        disabled={busy || !pasteText.trim()}
        onClick={handlePaste}
        className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-medium py-2"
      >
        Reduce and load
      </button>
      {state.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
          {state.error}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------

function ResetTab({ onReset }: { onReset: () => void }) {
  return (
    <div className="space-y-3 text-xs">
      <p className="text-slate-600">
        Drop the local override and go back to the master that ships with the
        app. The override JSON is removed from this browser; nothing is sent
        anywhere.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="w-full rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium py-2"
      >
        Revert to bundled master
      </button>
    </div>
  );
}

// --------------------------------------------------------------------------

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">{k}</span>
      <span className="text-slate-900 truncate">{v}</span>
    </div>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 tabular-nums">{n}</div>
    </div>
  );
}
