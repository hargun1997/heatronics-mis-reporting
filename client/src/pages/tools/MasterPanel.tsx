import { useRef, useState } from 'react';
import type { MasterState } from '../../data/tally/useTallyMaster';

type Tab = 'active' | 'upload' | 'reset';

export function MasterPanel({ state }: { state: MasterState }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const m = state.master;
  const ledgerCount = m?.ledgers?.length || 0;
  const voucherCount = m?.voucherTypes?.length || 0;
  const groupCount = m?.groups?.length || 0;
  const ccCount = m?.costCentres?.length || 0;

  function applyJson(text: string) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Top-level value must be a JSON object');
      }
      if (!Array.isArray(parsed.ledgers) || !Array.isArray(parsed.voucherTypes)) {
        throw new Error('Master must contain "ledgers" and "voucherTypes" arrays');
      }
      state.setOverride(parsed);
      setPasteError(null);
      setPasteText('');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
      setTab('active');
    } catch (e) {
      setPasteError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => applyJson(String(reader.result || ''));
    reader.readAsText(file);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-slate-900">Tally master</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {state.loading
              ? 'Loading…'
              : `${ledgerCount} ledgers · ${voucherCount} voucher types · ${ccCount} cost centres`}
            <span
              className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                state.source === 'override'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {state.source === 'override' ? 'Overridden' : 'Bundled'}
            </span>
            {savedFlash && (
              <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-emerald-100 text-emerald-800">
                Saved
              </span>
            )}
          </div>
        </div>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
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
            {(['active', 'upload', 'reset'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === t
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t === 'active' ? 'Active' : t === 'upload' ? 'Upload override' : 'Reset'}
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-5">
            {tab === 'active' && <ActiveTab state={state} />}
            {tab === 'upload' && (
              <UploadTab
                pasteText={pasteText}
                setPasteText={setPasteText}
                pasteError={pasteError}
                onApply={() => applyJson(pasteText)}
                fileRef={fileRef}
                onFile={onFile}
              />
            )}
            {tab === 'reset' && (
              <ResetTab
                source={state.source}
                onReset={() => {
                  state.clearOverride();
                  setTab('active');
                }}
              />
            )}
          </div>

          {!state.loading && groupCount === 0 && ledgerCount === 0 && (
            <div className="px-4 sm:px-5 pb-4">
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                The active master has no ledgers or groups. The AI cannot ground
                its suggestions until a real master is loaded.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveTab({ state }: { state: MasterState }) {
  const m = state.master;
  if (!m) return <div className="text-xs text-slate-500">No master loaded.</div>;
  return (
    <div className="space-y-3 text-xs">
      <KV k="Source" v={state.source === 'override' ? 'Browser override (localStorage)' : 'Bundled with the app'} />
      {m.company && <KV k="Company" v={m.company} />}
      {m.generatedAt && <KV k="Generated" v={new Date(m.generatedAt).toLocaleString()} />}
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

function UploadTab({
  pasteText,
  setPasteText,
  pasteError,
  onApply,
  fileRef,
  onFile,
}: {
  pasteText: string;
  setPasteText: (s: string) => void;
  pasteError: string | null;
  onApply: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}) {
  return (
    <div className="space-y-3 text-xs">
      <p className="text-slate-600">
        Override the bundled master with your own JSON. The override is saved
        in this browser only (localStorage) — it never leaves your device.
        Schema: <code className="bg-slate-100 px-1 rounded">{`{ groups, ledgers, voucherTypes, costCentres, ... }`}</code>.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-white py-3 text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
      >
        Pick a JSON file
      </button>
      <div className="text-center text-[10px] uppercase tracking-wider text-slate-400">or paste</div>
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder='{ "groups": [...], "ledgers": [...], "voucherTypes": [...], "costCentres": [...] }'
        rows={6}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[11px]"
      />
      {pasteError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
          {pasteError}
        </div>
      )}
      <button
        type="button"
        disabled={!pasteText.trim()}
        onClick={onApply}
        className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-medium py-2"
      >
        Apply override
      </button>
    </div>
  );
}

function ResetTab({
  source,
  onReset,
}: {
  source: 'bundled' | 'override';
  onReset: () => void;
}) {
  if (source === 'bundled') {
    return (
      <div className="text-xs text-slate-600">
        No override is active. The bundled master is in use.
      </div>
    );
  }
  return (
    <div className="space-y-3 text-xs">
      <p className="text-slate-600">
        Drop the local override and go back to the bundled master that ships
        with the app. Your data isn't sent anywhere.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="w-full rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium py-2"
      >
        Clear override and use bundled master
      </button>
    </div>
  );
}

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
