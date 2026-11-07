// Step 1: upload the CIB payee export → parsed in the browser → saved on the server (full numbers, shown masked).
import { useMemo, useRef, useState } from 'react';
import { isActive, maskAccount, type PayeeList } from '../../data/payments/payees';
import { readPayeeWorkbook } from '../../data/payments/workbook';
import { Note, Num, btnSecondary, input } from './shared';
import { fmtWhen } from './util';

export function PayeesSection({ list, onSaved }: { list: PayeeList | null; onSaved: (l: PayeeList) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string; extra?: string[] } | null>(null);
  const [q, setQ] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const payees = useMemo(() => list?.payees ?? [], [list]);
  const active = payees.filter(isActive).length;

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return payees.filter((p) => (!activeOnly || isActive(p)) && (!t || `${p.name} ${p.shortName} ${p.ifsc ?? ''} ${p.account.slice(-4)}`.toLowerCase().includes(t)));
  }, [payees, q, activeOnly]);

  async function onFile(f: File) {
    setBusy(true);
    setMsg(null);
    try {
      const r = readPayeeWorkbook(new Uint8Array(await f.arrayBuffer()));
      if (!r.payees.length) { setMsg({ tone: 'error', text: r.warnings[0] ?? 'No payees found in this file.' }); return; }
      const res = await fetch('/api/payments/payees', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ payees: r.payees, fileName: f.name }),
      });
      const body = await res.json();
      if (!res.ok) { setMsg({ tone: 'error', text: body.error ?? `Save failed (${res.status})` }); return; }
      onSaved(body as PayeeList);
      const extra = [...r.warnings, ...(r.skipped.length ? [`${r.skipped.length} row(s) skipped: ${[...new Set(r.skipped.map((s) => s.reason))].join(', ')}.`] : [])];
      setMsg({ tone: extra.length ? 'warn' : 'ok', text: `Saved ${r.payees.length} payees (${r.payees.filter(isActive).length} Active).`, extra });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Could not read the file.' });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>In ICICI CIB open <b>Manage Bene</b> and download the list (Excel).</li>
        <li>Upload that file here. It replaces the saved list.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={file} type="file" accept=".xls,.xlsx" className="sr-only" id="payee-file" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <label htmlFor="payee-file" className={`${btnSecondary} cursor-pointer`} aria-disabled={busy}>{busy ? 'Reading…' : 'Upload payee list (.xls / .xlsx)'}</label>
        {list?.savedAt && <span className="text-sm text-slate-600">Saved list from {fmtWhen(list.savedAt)}{list.fileName ? ` · ${list.fileName}` : ''}</span>}
      </div>
      {msg && (
        <Note tone={msg.tone}>
          {msg.text}
          {msg.extra?.map((x) => <span key={x} className="block">{x}</span>)}
        </Note>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Num label="Payees saved" value={payees.length} />
        <Num label="Active" value={active} sub="Only these can be paid" />
        <Num label="Not active" value={payees.length - active} />
      </div>

      {payees.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input className={`${input} max-w-xs`} placeholder="Search name, IFSC, last 4 digits" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search payees" />
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5 accent-accent-600" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
              Active only
            </label>
            <span className="text-sm text-slate-500">{shown.length} shown</span>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Short name</th><th className="px-3 py-2">Bank</th><th className="px-3 py-2">Account</th><th className="px-3 py-2">IFSC</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody>
                {shown.slice(0, 400).map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                    <td className="px-3 py-2 text-slate-600">{p.shortName}</td>
                    <td className="px-3 py-2 text-slate-600">{p.bankType}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{maskAccount(p.account)}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{p.ifsc ?? <span className="text-slate-400">none</span>}</td>
                    <td className="px-3 py-2">{isActive(p) ? <span className="text-emerald-700">Active</span> : <span className="text-amber-700">{p.status || 'Unknown'}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
