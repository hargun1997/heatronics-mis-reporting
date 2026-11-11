// Step 3: pick payees + amounts → checks + totals → the bulk payment file (.xlsx + .csv) and a saved batch record.
import { useMemo, useState } from 'react';
import { PAYMENT_FORMAT, PAY_MODES, type PayMode } from '../../data/payments/iciciFormats';
import { isActive, maskAccount, type Payee } from '../../data/payments/payees';
import {
  batchProblems, buildPaymentRows, defaultMode, inr, matchPaste, newBatchId, parseAmount, parsePasteList, rowProblems, totals,
  type BatchRow, type MatchResult,
} from '../../data/payments/batch';
import { downloadPaymentFiles } from '../../data/payments/workbook';
import { Note, btnPrimary, btnSecondary, input } from './shared';
import { Modal } from '../ui/overlays';
import { InfoTip, Panel } from '../ui/states';
import { readLocal, writeLocal } from './util';

const DEBIT_KEY = 'mis.payments.debitAccount';
interface Sel { amount: string; remark: string; mode?: PayMode }
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export function BatchSection({ payees, onSaved }: { payees: Payee[]; onSaved: () => void }) {
  const active = useMemo(() => payees.filter(isActive), [payees]);
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [q, setQ] = useState('');
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [debitAccount, setDebit] = useState(() => readLocal(DEBIT_KEY));
  const [date, setDate] = useState(todayIst);
  const [allRemark, setAllRemark] = useState('');
  const [paste, setPaste] = useState('');
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [ok, setOk] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [tried, setTried] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  const byId = useMemo(() => new Map(payees.map((p) => [p.id, p])), [payees]);
  const rows: BatchRow[] = Object.entries(sel).map(([payeeId, s]) => {
    const amountPaise = parseAmount(s.amount);
    const p = byId.get(payeeId);
    return { payeeId, amountPaise, remark: s.remark, mode: s.mode ?? (p ? defaultMode(p, Number.isFinite(amountPaise) ? amountPaise : 0) : 'NEFT') };
  });
  const rowById = new Map(rows.map((r) => [r.payeeId, r]));
  const t = totals(rows);
  const problems = batchProblems({ debitAccount, date }, rows, payees);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return active.filter((p) => (!onlyPicked || sel[p.id]) && (!s || `${p.name} ${p.shortName} ${p.account.slice(-4)}`.toLowerCase().includes(s)));
  }, [active, q, onlyPicked, sel]);

  const toggle = (p: Payee, on: boolean) => setSel((x) => {
    const n = { ...x };
    if (on) n[p.id] = n[p.id] ?? { amount: '', remark: allRemark };
    else delete n[p.id];
    return n;
  });
  const patch = (id: string, v: Partial<Sel>) => setSel((x) => ({ ...x, [id]: { ...(x[id] ?? { amount: '', remark: allRemark }), ...v } }));

  function applyMatches() {
    if (!matches) return;
    setSel((x) => {
      const n = { ...x };
      matches.forEach((m, i) => {
        const id = m.kind === 'exact' ? m.payee?.id : ok[i];
        if (!id) return;
        n[id] = { ...(n[id] ?? { remark: allRemark }), amount: (m.line.amountPaise / 100).toFixed(2) };
      });
      return n;
    });
    setMatches(null);
    setOk({});
    setPaste('');
    setPasteOpen(false);
  }

  async function makeFile() {
    setTried(true);
    setResult(null);
    if (problems.length) return;
    setBusy(true);
    const id = newBatchId();
    try {
      const out = buildPaymentRows({ debitAccount, date }, rows, payees, id);
      writeLocal(DEBIT_KEY, debitAccount);
      let saved = true;
      try {
        const res = await fetch('/api/payments/batches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ id, debitAccount, date, formatId: PAYMENT_FORMAT.id, rows }),
        });
        if (!res.ok) saved = false;
      } catch { saved = false; }
      downloadPaymentFiles(out, id);
      if (saved) onSaved();
      setResult(saved
        ? { tone: 'ok', text: `Batch ${id} saved: ${t.count} payments, ${inr(t.paise)}. Two files downloaded (.xlsx and .csv).` }
        : { tone: 'warn', text: `Files downloaded, but the batch record did not save. Keep the files; try again later.` });
    } catch (e) {
      setResult({ tone: 'error', text: e instanceof Error ? e.message : 'Could not make the file.' });
    } finally { setBusy(false); }
  }

  if (!payees.length) return <Note tone="info">Upload the payee list in the Payees tab first.</Note>;

  return (
    <Panel title="Make a payment batch" count={t.count || null}
      action={<div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          File layout not confirmed
          <InfoTip label="About the payment file layout" align="right"><p>{PAYMENT_FORMAT.note}</p><p>Run Validate File for Upload in CIB before you upload the file.</p></InfoTip>
        </span>
        <InfoTip label="How to make a batch" align="right">
          <ol className="list-decimal space-y-1 pl-4">
            <li>Type the debit account. Pick the payment date.</li>
            <li>Tick each payee. Type the amount. Or select Paste a list.</li>
            <li>Check the totals. Then select <b>Download payment file</b>.</li>
          </ol>
          <p>Mode: same bank = FT. ₹2 lakh or more = RTGS. All other = NEFT. You can change it.</p>
        </InfoTip>
      </div>}>
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700">Debit account (ours)
          <input className={`${input} mt-1 font-mono`} inputMode="numeric" value={debitAccount} onChange={(e) => setDebit(e.target.value.replace(/\D/g, ''))} placeholder="Account number" aria-describedby="debit-hint" />
          <span id="debit-hint" className="mt-0.5 block text-xs font-normal text-slate-600">Kept on this computer only.</span>
        </label>
        <label className="block text-sm font-medium text-slate-700">Payment date
          <input type="date" className={`${input} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">Remark for new rows
          <span className="mt-1 flex gap-2">
            <input className={input} value={allRemark} maxLength={30} onChange={(e) => setAllRemark(e.target.value)} placeholder="Oct-26 invoices" />
            <button type="button" className={`${btnSecondary} whitespace-nowrap`} onClick={() => setSel((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { ...v, remark: allRemark }])))} disabled={!rows.length}>Apply to all</button>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input className={`${input} max-w-xs`} placeholder="Search payee" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search payees to pay" />
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-5 w-5 accent-accent-600" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} />
          Picked only
        </label>
        <span className="text-sm text-slate-600">{active.length} Active · {payees.length - active.length} not active (hidden)</span>
        <button type="button" className={`${btnSecondary} sm:ml-auto`} onClick={() => setPasteOpen(true)}>Paste a list</button>
      </div>

      <div className="max-h-[400px] overflow-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr><th className="w-10 px-3 py-2"><span className="sr-only">Pick</span></th><th className="px-3 py-2">Payee</th><th className="px-3 py-2">Account</th><th className="w-36 px-3 py-2 text-right">Amount ₹</th><th className="w-28 px-3 py-2">Mode</th><th className="px-3 py-2">Remark</th></tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const s = sel[p.id];
              const r = rowById.get(p.id);
              const errs = r ? rowProblems(r, p) : [];
              return (
                <tr key={p.id} className={`border-t border-slate-100 align-top ${s ? 'bg-accent-50/40' : 'hover:bg-slate-50'}`}>
                  <td className="px-3 py-2"><input type="checkbox" className="mt-2 h-5 w-5 accent-accent-600" checked={!!s} onChange={(e) => toggle(p, e.target.checked)} aria-label={`Pay ${p.name}`} /></td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    {p.shortName && <div className="text-xs text-slate-500">{p.shortName}</div>}
                    {s && tried && errs.length > 0 && <div className="mt-1 text-xs text-red-700">Fix: {errs.join(' · ')}</div>}
                    {s && !tried && errs.length > 0 && Number.isFinite(r?.amountPaise) && <div className="mt-1 text-xs text-red-700">{errs.join(' · ')}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-700">{maskAccount(p.account)}<div className="text-xs text-slate-500">{p.ifsc ?? p.bankType}</div></td>
                  <td className="px-3 py-1.5"><input className={`${input} text-right tabular-nums`} inputMode="decimal" value={s?.amount ?? ''} placeholder="0.00"
                    onChange={(e) => patch(p.id, { amount: e.target.value })} aria-label={`Amount for ${p.name}`} /></td>
                  <td className="px-3 py-1.5">
                    <select className={input} value={r?.mode ?? defaultMode(p, 0)} disabled={!s} onChange={(e) => patch(p.id, { mode: e.target.value as PayMode })} aria-label={`Mode for ${p.name}`}>
                      {PAY_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5"><input className={input} value={s?.remark ?? ''} maxLength={30} disabled={!s} onChange={(e) => patch(p.id, { remark: e.target.value })} aria-label={`Remark for ${p.name}`} /></td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No payees match.</td></tr>}
          </tbody>
        </table>
      </div>

      {tried && problems.length > 0 && <Note tone="error">{problems.join(' · ')}</Note>}
      {result && <Note tone={result.tone}>{result.text}</Note>}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div><dt className="text-xs text-slate-600">Payments</dt><dd className="text-lg font-semibold tabular-nums text-slate-900">{t.count}</dd></div>
          <div><dt className="text-xs text-slate-600">Total</dt><dd className="text-lg font-semibold tabular-nums text-slate-900">{inr(t.paise)}</dd></div>
          <div><dt className="text-xs text-slate-600">By mode</dt><dd className="pt-1 tabular-nums text-slate-900">{PAY_MODES.filter((m) => t.byMode[m].count).map((m) => `${m} ${t.byMode[m].count} · ${inr(t.byMode[m].paise)}`).join('  ·  ') || 'None'}</dd></div>
          <div><dt className="text-xs text-slate-600">Pay on</dt><dd className="pt-1 text-slate-900">{date ? date.split('-').reverse().join('-') : 'Not set'}{debitAccount ? ` · from ${maskAccount(debitAccount)}` : ''}</dd></div>
        </dl>
        <button type="button" className={`${btnPrimary} sm:ml-auto`} onClick={makeFile} disabled={busy}>{busy ? 'Making file…' : 'Download payment file'}</button>
      </div>
    </div>
    <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="Paste a list of names and amounts" width={640}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Copy 2 columns from Excel: name, then amount. Put 1 payee on each line.</p>
          <textarea className={`${input} min-h-[120px] py-2 font-mono`} value={paste} onChange={(e) => { setPaste(e.target.value); setMatches(null); }} aria-label="Names and amounts" />
          <button type="button" className={btnSecondary} disabled={!paste.trim()} onClick={() => { setMatches(matchPaste(parsePasteList(paste), payees)); setOk({}); }}>Match names</button>
          {matches && (
            <div className="space-y-2">
              {matches.map((m, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="min-w-[180px] font-medium text-slate-900">{m.line.name}</span>
                  <span className="tabular-nums text-slate-700">{Number.isFinite(m.line.amountPaise) ? inr(m.line.amountPaise) : '—'}</span>
                  {m.kind === 'exact' && <span className="text-emerald-700">Found: {m.payee?.name}</span>}
                  {m.kind === 'bad_amount' && <span className="text-red-700">Amount not readable</span>}
                  {m.kind === 'none' && <span className="text-red-700">No Active payee with this name</span>}
                  {m.kind === 'fuzzy' && (
                    <span className="flex flex-wrap items-center gap-2 text-amber-800">
                      Is it
                      {[m.payee!, ...(m.others ?? [])].map((p) => (
                        <button key={p.id} type="button" aria-pressed={ok[i] === p.id}
                          className={`min-h-[36px] rounded-lg border px-2 ${ok[i] === p.id ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-slate-200 bg-white text-slate-700'}`}
                          onClick={() => setOk((x) => ({ ...x, [i]: x[i] === p.id ? '' : p.id }))}>{p.name} ({maskAccount(p.account)})</button>
                      ))}
                      ?
                    </span>
                  )}
                </div>
              ))}
              <button type="button" className={btnSecondary} onClick={applyMatches}
                disabled={!matches.some((m, i) => m.kind === 'exact' || ok[i])}>
                Add {matches.filter((m, i) => m.kind === 'exact' || ok[i]).length} matched row(s)
              </button>
            </div>
          )}
        </div>
    </Modal>
    </Panel>
  );
}
