// TDS planning (/accounts/tds, founder 9 Nov 2026): what TDS to deposit for a month, per section, from the stored Tally Day
// Book (READ ONLY); deductees, flags, the quarter's 26Q / 24Q working, an Excel download and how to pay and file.
// Layout (simplification pass 2): 4 numbers, then ONE view picked by the header tabs (Pay · Check · Parties · Quarter).
// "How to pay and file" opens in a modal. Engine: data/tds/tds.ts · export: data/tds/tdsFormats.ts · data: GET /api/tds.
// Invoices tab (22 Nov 2026): every supplier bill of the month from Tally, kept across syncs (data/tds/invoices.ts);
// "Sync with Tally" reads the Day Book now; the Excel download works for any month with books.
import { useState } from 'react';
import { Download as ArrowDownTrayIcon } from 'lucide-react';
import { HeaderMore, PageBody, PageHeader } from '../../components/ui/PageHeader';
import { KpiTile } from '../../components/ui/KpiTile';
import { Modal } from '../../components/ui/overlays';
import { BTN, ErrorBox, InfoTip, Loading, Panel } from '../../components/ui/states';
import { addMonths, dateLabel, monthLabel } from '../../data/tds/tds';
import { downloadTds, inr, lastMonth, useTds } from '../../data/tds/useTds';
import { DeducteeList, FlagList, HowTo, NoDayBook, PayTable } from './tdsParts';
import { InvoicesView } from './tdsInvoices';
import { useInvoices, type InvoicesApi } from '../../data/tds/invoices';
import { FreshnessPill } from '../../components/ui/FreshnessPill';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/feedback';
import { StatusPill } from '../../components/ui/StatusPill';

type View = 'pay' | 'check' | 'who' | 'quarter' | 'invoices';

/** IST date and time, "7 Nov 2026, 14:57". */
const istStamp = (iso: string) => {
  const d = new Date(Date.parse(iso) + 5.5 * 3_600_000);
  return `${dateLabel(d.toISOString().slice(0, 10))}, ${d.toISOString().slice(11, 16)}`;
};

/** Tally answers only while TallyPrime is open: say so, show the date of the data, and that it retries by itself. */
function OfflineLine({ api }: { api: InvoicesApi }) {
  const asOf = api.booksAsOf ?? api.reachedAt;
  return (
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="font-semibold">Tally offline, showing last synced data as of {asOf ? istStamp(asOf) : 'no date'}.</span>{' '}
      It tries again every hour until Tally is open{api.waiting.length ? `. Waiting: ${api.waiting.map((w) => w.replace(/\d{4}-\d{2}/, (m) => monthLabel(m))).join(', ')}.` : '.'}
    </div>
  );
}

export function TdsPage() {
  const [month, setMonth] = useState(lastMonth);
  const [view, setView] = useState<View>('pay');
  const [howOpen, setHowOpen] = useState(false);
  const { report: r, error, loading } = useTds(month);
  const inv = useInvoices(month);
  const q = r?.quarter;
  const ok = !!r?.haveMonth;
  // A month with no TDS books opens on Invoices (it can still have supplier bills, or none yet).
  const shown: View = ok ? view : 'invoices';

  const tabs = [
    ...(ok ? [
      { id: 'pay', label: 'What to pay' },
      { id: 'check', label: 'Check', count: r!.flags.length },
      { id: 'who', label: 'Parties', count: r!.deductees.length },
      ...(q ? [{ id: 'quarter', label: `Quarter ${q.label}` }] : []),
    ] : []),
    { id: 'invoices', label: 'Invoices', count: inv.api?.summary.bills },
  ];

  const sync = async () => {
    const out = await inv.sync();
    toast(out.ok ? 'Synced with Tally.' : `Tally did not answer. ${out.error ?? ''}`.trim());
  };
  const download = async (working = false) => {
    const done = await downloadTds(month, r, inv.api?.stored ? { rows: inv.api.rows, syncedAt: inv.api.syncedAt } : null, working);
    if (!done) toast(`No Tally Day Book for ${monthLabel(month)}. Select Sync with Tally first.`);
  };

  return (
    <>
      <PageHeader
        title="TDS"
        description="The TDS to pay for 1 month, by section, from the Tally Day Book."
        status={<span className="inline-flex items-center gap-2">
          {ok && (r!.overdue
            ? <StatusPill toneName="critical" size="sm">Late</StatusPill>
            : <StatusPill toneName="neutral" size="sm">Due {dateLabel(r!.dueDate)}</StatusPill>)}
          <FreshnessPill label="Tally" asOf={inv.api?.reachedAt}
            notes={inv.api ? [
              inv.api.syncedAt ? `Bills of this month synced ${inv.api.syncedAt.slice(0, 16).replace('T', ' ')} UTC.` : 'This month is not synced yet.',
              inv.api.sync.lastError ? `Last sync: ${inv.api.sync.lastError}` : 'Last sync worked.',
              'Syncs by itself every day, and in full on the 5th for last month.',
            ] : []} />
        </span>}
        help={ok && r!.notes.length ? <ul className="space-y-1">{r!.notes.map((n) => <li key={n} className="!list-disc">{n}</li>)}</ul> : undefined}
        tabs={tabs} tab={shown} onTab={(id) => setView(id as View)}
        actions={<>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="sr-only sm:not-sr-only">Month</span>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month of deduction"
              className="min-h-11 sm:min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" />
          </label>
          <Button variant="primary" busy={inv.syncing} busyLabel="Syncing" onClick={() => void sync()}>Sync with Tally</Button>
          <HeaderMore>
            <button type="button" className={BTN} onClick={() => setHowOpen(true)}>How to pay</button>
            <button type="button" className={BTN} disabled={loading || inv.loading} onClick={() => void download()}>
              <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />Download TDS report
            </button>
          </HeaderMore>
        </>}
      />
      <PageBody>
        {inv.api?.offline && <OfflineLine api={inv.api} />}
        {error && <ErrorBox>{error}</ErrorBox>}
        {loading && !r && <Loading label="Reading the Tally Day Book" />}
        {shown === 'invoices' && (
          inv.error ? <ErrorBox>{inv.error}</ErrorBox>
            : inv.api ? <InvoicesView api={inv.api} month={month} onSync={() => void sync()} syncing={inv.syncing} />
              : r && !r.haveMonth ? <NoDayBook month={monthLabel(month)} /> : <Loading label="Reading the supplier bills" />
        )}
        {r && ok && shown !== 'invoices' && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <KpiTile label={r.overdue ? 'Late: pay now' : `Pay by ${dateLabel(r.dueDate)}`} value={inr(r.totals.balance)} tone={r.overdue ? 'critical' : 'default'}
                sub={r.totals.interest > 0 ? <span className="font-semibold text-red-700">Interest about {inr(r.totals.interest)}</span> : `For ${r.monthLabel}`} />
              <KpiTile label="TDS deducted" value={inr(r.totals.deducted)} sub={`${r.entries.length} bills · ${r.deductees.length} parties`} />
              <KpiTile label="Already paid" value={inr(r.totals.paid)} sub={r.haveNextMonth ? `Challans in ${monthLabel(addMonths(r.month, 1))}` : `${monthLabel(addMonths(r.month, 1))} not in the books yet`} />
            </div>

            {view === 'pay' && (
              <Panel title="What to pay" action={<span className="text-xs text-slate-600">1 challan for each line</span>}>
                <PayTable r={r} />
              </Panel>
            )}
            {view === 'check' && <Panel title="Check these first" count={r.flags.length}><FlagList r={r} /></Panel>}
            {view === 'who' && (
              <Panel title="Who we deducted from" action={<span className="text-xs text-slate-600">Select a section to see each party</span>}>
                <DeducteeList r={r} />
              </Panel>
            )}
            {view === 'quarter' && q && (
              <Panel title={`Quarter return · ${q.label}`}
                action={<span className="flex items-center gap-2"><button type="button" className={BTN} onClick={() => void download(true)}>
                  <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />Download working file
                </button><InfoTip label="About the quarter list" align="right">
                  <p>Download the working file. Open the sheet <b>26Q prep</b>. It has 1 row for each bill, in the order the RPU asks.</p>
                  <p>The page fills the challan BSR and serial when the Tally narration has them.</p>
                </InfoTip></span>}>
                <div className="space-y-3 text-sm text-slate-700">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <KpiTile label="26Q (not salary)" value={inr(q.tds26)} sub={`${q.q26.length} rows · due ${dateLabel(q.dueDate)}`} />
                    <KpiTile label="24Q (salary)" value={inr(q.tds24)} sub={`${q.q24.length} rows`} />
                    <KpiTile label="Late fee cap" value={inr(q.lateFeeCap)} sub={`₹200 a day after ${dateLabel(q.dueDate)}`} />
                  </div>
                  {q.missingMonths.length > 0 && <p className="text-amber-800">Day Book not in the books for {q.missingMonths.map(monthLabel).join(', ')}. The quarter list is not complete.</p>}
                </div>
              </Panel>
            )}
          </>
        )}
      </PageBody>
      <Modal open={howOpen} onClose={() => setHowOpen(false)} title="How to pay and file TDS" subtitle="Challan 281 → Tally → 26Q / 24Q → Form 16A" width={640}>
        <HowTo />
      </Modal>
    </>
  );
}
