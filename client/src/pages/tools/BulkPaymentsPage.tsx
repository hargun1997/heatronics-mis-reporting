// Bulk payments (ICICI) — prepares CIB upload files only. It never calls a bank and never moves money: the accounts
// team uploads the file in ICICI CIB (BizPay360) and a second user authorises there. Formats: data/payments/iciciFormats.ts.
import { useCallback, useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { PayeesSection } from '../../components/payments/PayeesSection';
import { NewPayeesSection } from '../../components/payments/NewPayeesSection';
import { BatchSection } from '../../components/payments/BatchSection';
import { downloadPaymentFiles } from '../../data/payments/workbook';
import { Note, Step, btnSecondary } from '../../components/payments/shared';
import { fmtWhen } from '../../components/payments/util';
import { isActive, maskAccount, type Payee, type PayeeList } from '../../data/payments/payees';
import { buildPaymentRows, inr, type BatchRow } from '../../data/payments/batch';
import type { PayMode } from '../../data/payments/iciciFormats';

interface BatchSummary { id: string; createdAt: string; by: string; byVerified: boolean; date: string; count: number; totalPaise: number; debitLast4: string }
interface StoredBatch extends BatchSummary { debitAccount: string; rows: { payeeId: string; name: string; account: string; ifsc: string | null; amountPaise: number; mode: PayMode; remark: string }[] }

export function BulkPaymentsPage() {
  const [list, setList] = useState<PayeeList | null>(null);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [err, setErr] = useState('');

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
    downloadPaymentFiles(buildPaymentRows({ debitAccount: b.debitAccount, date: b.date }, rows, payees, b.id), b.id);
  }

  const payees = list?.payees ?? [];
  const active = payees.filter(isActive).length;

  return (
    <>
      <PageHeader
        title="Bulk payments (ICICI)"
        description="Make the ICICI CIB upload files: new payees and bulk payments. This page never sends money; you upload and authorise in CIB."
        icon={<Landmark className="h-5 w-5" aria-hidden />}
      />
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {err && <Note tone="error">{err}</Note>}
        {list && (
          <>
            <Step id="payees" n={1} title="Payees" defaultOpen={!payees.length}
              summary={payees.length ? `${payees.length} saved · ${active} Active · from ${fmtWhen(list.savedAt)}` : 'Upload the payee list from CIB'}>
              <PayeesSection list={list} onSaved={setList} />
            </Step>
            <Step id="newpayees" n={2} title="Add new payees (bulk)" summary="Make the Bulk Payee Registration file">
              <NewPayeesSection saved={payees} />
            </Step>
            <Step id="batch" n={3} title="Make a payment batch" defaultOpen={payees.length > 0} summary="Pick payees and amounts, download the payment file">
              <BatchSection payees={payees} onSaved={loadBatches} />
            </Step>
            <Step id="howto" n={4} title="How to upload in CIB" summary="Step by step, for payments and for new payees">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Payments</h3>
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
                    <li>Log in to ICICI CIB → <b>BizPay360</b>.</li>
                    <li><b>Validate File for Upload</b>: upload the .xlsx (or .csv). Fix any row it rejects.</li>
                    <li><b>Payment File Upload</b>: upload the same file.</li>
                    <li><b>File Status Enquiry</b>: wait until the file shows as processed.</li>
                    <li><b>Authorise Payment</b>: a second user checks the total and authorises.</li>
                  </ol>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">New payees</h3>
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
                    <li>CIB → <b>Bulk Payee Registration</b>.</li>
                    <li>Upload the Bene_Reg_Format file from step 2.</li>
                    <li>A second user authorises it.</li>
                    <li>Wait for ICICI's cooling period. Pay only when <b>Status = Active</b>.</li>
                    <li>Download the payee list again and upload it in step 1.</li>
                  </ol>
                </div>
              </div>
            </Step>
            <Step id="past" n="✓" title="Past batches" summary={batches.length ? `${batches.length} saved (records only, no bank status)` : 'None yet'}>
              {batches.length ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-[13px]">
                    <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <tr><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Made</th><th className="px-3 py-2">By</th><th className="px-3 py-2">Pay on</th><th className="px-3 py-2 text-right">Payments</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">From</th><th className="px-3 py-2"><span className="sr-only">Files</span></th></tr>
                    </thead>
                    <tbody>
                      {batches.map((b) => (
                        <tr key={b.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono">{b.id}</td>
                          <td className="px-3 py-2">{fmtWhen(b.createdAt)}</td>
                          <td className="px-3 py-2">{b.by}{!b.byVerified && <span className="text-xs text-slate-500"> (not signed in)</span>}</td>
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
              ) : <p className="text-sm text-slate-600">Each downloaded payment file is saved here as a record.</p>}
            </Step>
          </>
        )}
      </div>
    </>
  );
}
