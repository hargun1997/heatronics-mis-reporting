// TDS planning (/accounts/tds, founder 9 Nov 2026): what TDS to deposit for a month, per section, from the stored Tally Day
// Book (READ ONLY); deductees, flags, the quarter's 26Q / 24Q working, an Excel download and how to pay and file.
// Layout (simplification pass 2): 4 numbers, then ONE view picked by the header tabs (Pay · Check · Parties · Quarter).
// "How to pay and file" opens in a modal. Engine: data/tds/tds.ts · export: data/tds/tdsFormats.ts · data: GET /api/tds.
import { useState } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { HeaderMore, PageBody, PageHeader } from '../../components/ui/PageHeader';
import { KpiTile } from '../../components/ui/KpiTile';
import { Modal } from '../../components/ui/overlays';
import { BTN, ErrorBox, InfoTip, Loading, Panel } from '../../components/ui/states';
import { addMonths, dateLabel, monthLabel } from '../../data/tds/tds';
import { downloadTds, inr, lastMonth, useTds } from '../../data/tds/useTds';
import { DeducteeList, FlagList, HowTo, NoDayBook, PayTable } from './tdsParts';

type View = 'pay' | 'check' | 'who' | 'quarter';

export function TdsPage() {
  const [month, setMonth] = useState(lastMonth);
  const [view, setView] = useState<View>('pay');
  const [howOpen, setHowOpen] = useState(false);
  const { report: r, error, loading } = useTds(month);
  const high = r?.flags.filter((f) => f.severity === 'high').length ?? 0;
  const q = r?.quarter;
  const ok = !!r?.haveMonth;

  const tabs = ok ? [
    { id: 'pay', label: 'What to pay' },
    { id: 'check', label: 'Check', count: r!.flags.length },
    { id: 'who', label: 'Parties', count: r!.deductees.length },
    ...(q ? [{ id: 'quarter', label: `Quarter ${q.label}` }] : []),
  ] : undefined;

  return (
    <>
      <PageHeader
        title="TDS"
        description="The TDS to pay for 1 month, by section, from the Tally Day Book."
        status={ok ? (r!.overdue
          ? <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800">Late</span>
          : <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Due {dateLabel(r!.dueDate)}</span>) : undefined}
        help={ok && r!.notes.length ? <ul className="space-y-1">{r!.notes.map((n) => <li key={n} className="!list-disc">{n}</li>)}</ul> : undefined}
        tabs={tabs} tab={view} onTab={(id) => setView(id as View)}
        actions={<>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="sr-only sm:not-sr-only">Month</span>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month of deduction"
              className="min-h-11 sm:min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" />
          </label>
          <HeaderMore>
            <button type="button" className={BTN} onClick={() => setHowOpen(true)}>How to pay</button>
            <button type="button" className={BTN} disabled={!ok} onClick={() => r && void downloadTds(r)}>
              <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />Download Excel
            </button>
          </HeaderMore>
        </>}
      />
      <PageBody>
        {error && <ErrorBox>{error}</ErrorBox>}
        {loading && !r && <Loading label="Reading the Tally Day Book" />}
        {r && !r.haveMonth && <NoDayBook month={monthLabel(month)} />}
        {r && ok && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile label={r.overdue ? 'Late: pay now' : `Pay by ${dateLabel(r.dueDate)}`} value={inr(r.totals.balance)} tone={r.overdue ? 'critical' : 'default'}
                sub={r.totals.interest > 0 ? <span className="font-semibold text-red-700">Interest about {inr(r.totals.interest)}</span> : `For ${r.monthLabel}`} />
              <KpiTile label="TDS deducted" value={inr(r.totals.deducted)} sub={`${r.entries.length} bills · ${r.deductees.length} parties`} />
              <KpiTile label="Already paid" value={inr(r.totals.paid)} sub={r.haveNextMonth ? `Challans in ${monthLabel(addMonths(r.month, 1))}` : `${monthLabel(addMonths(r.month, 1))} not in the books yet`} />
              <KpiTile label="To check" value={String(r.flags.length)} tone={high ? 'warning' : 'default'} sub={high ? `${high} to fix` : 'Nothing serious'} />
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
                action={<InfoTip label="About the quarter list" align="right">
                  <p>Download Excel. Open the sheet <b>26Q prep</b>. It has 1 row for each bill, in the order the RPU asks.</p>
                  <p>The page fills the challan BSR and serial when the Tally narration has them.</p>
                </InfoTip>}>
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
