// Bulk payments (ICICI) — prepares CIB upload files only. It never calls a bank and never moves money: the accounts
// team uploads the file in ICICI CIB (BizPay360) and a second user authorises there. Formats: data/payments/iciciFormats.ts.
import { useCallback, useEffect, useState } from 'react';
import { PageBody, PageHeader } from '../../components/ui/PageHeader';
import { KpiTile } from '../../components/ui/KpiTile';
import { Modal } from '../../components/ui/overlays';
import { BTN, Empty, ErrorBox, Loading, Panel, StepNo } from '../../components/ui/states';
import { PayeesSection } from '../../components/payments/PayeesSection';
import { NewPayeesSection } from '../../components/payments/NewPayeesSection';
import { BatchSection } from '../../components/payments/BatchSection';
import { downloadPaymentFiles } from '../../data/payments/workbook';
import { btnSecondary } from '../../components/payments/shared';
import { fmtWhen } from '../../components/payments/util';
import { isActive, maskAccount, type Payee, type PayeeList } from '../../data/payments/payees';
import { buildPaymentRows, inr, type BatchRow } from '../../data/payments/batch';
import type { PayMode } from '../../data/payments/iciciFormats';

/** ₹ in L / Cr for a tile (paise in). */
const short = (paise: number) => { const r = paise / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(2)} Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(2)} L` : `₹${Math.round(r).toLocaleString('en-IN')}`; };

type View = 'pay' | 'payees' | 'new' | 'past';

const CIB_PAY = ['Log in to ICICI CIB. Open BizPay360.', 'Open Validate File for Upload. Upload the .xlsx (or .csv). Fix each row it refuses.', 'Open Payment File Upload. Upload the same file.', 'Open File Status Enquiry. Wait until the file shows Processed.', 'A second user opens Authorise Payment, checks the total and authorises.'];
const CIB_NEW = ['In CIB, open Bulk Payee Registration.', 'Upload the Bene_Reg_Format file from the New payees tab.', 'A second user authorises it.', 'Wait for the ICICI cooling period. Pay only when Status = Active.', 'Download the payee list again. Upload it in the Payees tab.'];

interface BatchSummary { id: string; createdAt: string; by: string; byVerified: boolean; date: string; count: number; totalPaise: number; debitLast4: string }
interface StoredBatch extends BatchSummary { debitAccount: string; rows: { payeeId: string; name: string; account: string; ifsc: string | null; amountPaise: number; mode: PayMode; remark: string }[] }

export function BulkPaymentsPage() {
  const [list, setList] = useState<PayeeList | null>(null);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [err, setErr] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  const loadBatches = useCallback(() => {
    fetch('/api/payments/batches', { credentials: 'include' }).then((r) => r.json()).then((b) => setBatches(b.batches ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    fetch('/api/payments/payees', { credentials: 'include' })
      .then(async (r) => { if (!r.ok) throw new Error(`Could not load payees (${r.status})`); return r.json(); })
      .then((l: PayeeList) => setList(l))
      .catch((e) => { setErr(e.message); setList({ payees: [], savedAt: '', fileName: '' }); });
    loadBatches();
  }, [loadBatches]);

  async function again(id: string) {
    const r = await fetch(`/api/payments/batches/${id}`, { credentials: 'include' });
    if (!r.ok) return;
    const b = (await r.json()) as StoredBatch;
    const payees: Payee[] = b.rows.map((x) => ({ id: x.payeeId, name: x.name, shortName: '', bankType: '', account: x.account, ifsc: x.ifsc, status: 'Active', activatedAt: '' }));
    const rows: BatchRow[] = b.rows.map((x) => ({ payeeId: x.payeeId, amountPaise: x.amountPaise, mode: x.mode, remark: x.remark }));
    await downloadPaymentFiles(buildPaymentRows({ debitAccount: b.debitAccount, date: b.date }, rows, payees, b.id), b.id);
  }

  const payees = list?.payees ?? [];
  const active = payees.filter(isActive).length;
  const cur: View = view ?? (payees.length ? 'pay' : 'payees');
  const last = batches[0];

  return (
    <>
      <PageHeader
        title="Bulk payments"
        description="Make the payee file and the payment file for ICICI. This page does not send money."
        status={list && !payees.length ? <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">No payee list</span> : undefined}
        help={<><p>The page makes files only. It never calls the bank.</p><p>You upload the file in ICICI CIB. A second user authorises it there.</p></>}
        tabs={list ? [
          { id: 'pay', label: 'Make a batch' },
          { id: 'payees', label: 'Payees', count: payees.length },
          { id: 'new', label: 'New payees' },
          { id: 'past', label: 'Past batches', count: batches.length },
        ] : undefined}
        tab={cur} onTab={(id) => setView(id as View)}
        actions={<button type="button" className={BTN} onClick={() => setHowOpen(true)}>How to upload in CIB</button>}
      />
      <PageBody className="pt-4">
        {err && <ErrorBox>{err}</ErrorBox>}
        {!list && !err && <Loading />}
        {list && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile label="Payees saved" value={payees.length} sub={list.savedAt ? `List from ${fmtWhen(list.savedAt)}` : 'Upload the list from CIB'} />
              <KpiTile label="Active" value={active} sub="Only these can be paid" />
              <KpiTile label="Not active" value={payees.length - active} tone={payees.length - active > 0 ? 'warning' : 'default'} sub="Wait for ICICI to activate" />
              <KpiTile label="Last batch" value={last ? short(last.totalPaise) : 'None'} sub={last ? `${last.count} payments · ${fmtWhen(last.createdAt)}` : 'No batch made yet'} />
            </div>
            {cur === 'pay' && <BatchSection payees={payees} onSaved={loadBatches} />}
            {cur === 'payees' && <PayeesSection list={list} onSaved={setList} />}
            {cur === 'new' && <NewPayeesSection saved={payees} />}
            {cur === 'past' && (
              <Panel title="Past batches" count={batches.length} flush>
                {batches.length ? (
                  <div tabIndex={0} role="region" aria-label="Past batches, scroll sideways for more" className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-[13px]">
                      <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                        <tr><th className="px-4 py-2">Batch</th><th className="px-3 py-2">Made</th><th className="px-3 py-2">By</th><th className="px-3 py-2">Pay on</th><th className="px-3 py-2 text-right">Payments</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">From</th><th className="px-3 py-2"><span className="sr-only">Files</span></th></tr>
                      </thead>
                      <tbody>
                        {batches.map((b) => (
                          <tr key={b.id} className="border-t border-slate-100">
                            <td className="px-4 py-2 font-mono">{b.id}</td>
                            <td className="px-3 py-2">{fmtWhen(b.createdAt)}</td>
                            <td className="px-3 py-2">{b.by}{!b.byVerified && <span className="text-xs text-slate-600"> (not signed in)</span>}</td>
                            <td className="px-3 py-2">{b.date.split('-').reverse().join('-')}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{b.count}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{inr(b.totalPaise)}</td>
                            <td className="px-3 py-2 font-mono">{maskAccount(b.debitLast4)}</td>
                            <td className="px-3 py-2"><button type="button" className={btnSecondary} onClick={() => again(b.id)}>Download again</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="p-4"><Empty title="No batches yet" hint="Each payment file you download is saved here as a record. The page does not show the bank status." /></div>}
              </Panel>
            )}
          </>
        )}
      </PageBody>
      <Modal open={howOpen} onClose={() => setHowOpen(false)} title="How to upload in ICICI CIB" width={720}>
        <div className="grid gap-6 md:grid-cols-2">
          {([['Payments', CIB_PAY], ['New payees', CIB_NEW]] as const).map(([t, steps]) => (
            <div key={t}>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">{t}</h3>
              <ol className="space-y-2">{steps.map((x, i) => <li key={x} className="flex gap-2.5 text-sm text-slate-700"><StepNo n={i + 1} /><span className="pt-1">{x}</span></li>)}</ol>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
