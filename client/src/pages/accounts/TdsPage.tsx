// TDS planning (/accounts/tds, founder 9 Nov 2026): what TDS to deposit for a month, per section, from the stored Tally Day
// Book (READ ONLY); deductees, flags, the quarter's 26Q / 24Q working, an Excel download and how to pay and file.
// Engine: data/tds/tds.ts · export layout: data/tds/tdsFormats.ts · data: GET /api/tds (server/src/routes/tds.ts).
import { useState } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { ReceiptIndianRupee } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Step, Num } from '../../components/payments/shared';
import { addMonths, dateLabel, monthLabel } from '../../data/tds/tds';
import { downloadTds, inr, lastMonth, tdsBtn as btn, useTds } from '../../data/tds/useTds';
import { DeducteeList, FlagList, HowTo, NoDayBook, PayHeadline, PayTable } from './tdsParts';

export function TdsPage() {
  const [month, setMonth] = useState(lastMonth);
  const { report: r, error, loading } = useTds(month);
  const high = r?.flags.filter((f) => f.severity === 'high').length ?? 0;
  const q = r?.quarter;

  return (
    <>
      <PageHeader
        title="TDS"
        description="The TDS to pay for 1 month, by section, from the Tally Day Book."
        icon={<ReceiptIndianRupee className="h-5 w-5" aria-hidden />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Month of deduction</span>
              <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" />
            </label>
            <button type="button" className={btn} disabled={!r?.haveMonth} onClick={() => r && void downloadTds(r)}>
              <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />Download
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        {loading && !r && <p className="text-sm text-slate-600">Reading the Tally Day Book…</p>}
        {r && !r.haveMonth && <NoDayBook month={monthLabel(month)} />}
        {r && r.haveMonth && (
          <>
            <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
              <PayHeadline r={r} />
              <Num label="TDS deducted" value={inr(r.totals.deducted)} sub={`${r.entries.length} bills · ${r.deductees.length} parties`} />
              <Num label="Already paid" value={inr(r.totals.paid)} sub={r.haveNextMonth ? `challans booked in ${monthLabel(addMonths(r.month, 1))}` : `${monthLabel(addMonths(r.month, 1))} not copied yet`} />
              <Num label="To check" value={String(r.flags.length)} sub={high ? `${high} must be fixed` : 'nothing serious'} />
            </div>

            <Step id="pay" n={1} title="What to pay" defaultOpen summary={`One challan per line · due ${dateLabel(r.dueDate)}`}>
              <PayTable r={r} />
            </Step>
            <Step id="check" n={2} title="Check these first" defaultOpen={high > 0} summary={r.flags.length ? `${r.flags.length} items · ${high} to fix` : 'All fine'}>
              <FlagList r={r} />
            </Step>
            <Step id="who" n={3} title="Who we deducted from" summary="By section: tap a section to see each party">
              <DeducteeList r={r} />
            </Step>
            {q && (
              <Step id="quarter" n={4} title={`Quarter return · ${q.label}`} summary={`26Q due ${dateLabel(q.dueDate)} · TDS ${inr(q.tds26)}${q.tds24 ? ` · 24Q ${inr(q.tds24)}` : ''}`}>
                <div className="space-y-3 text-sm text-slate-700">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Num label="26Q (non-salary)" value={inr(q.tds26)} sub={`${q.q26.length} rows`} />
                    <Num label="24Q (salary)" value={inr(q.tds24)} sub={`${q.q24.length} rows`} />
                    <Num label="Late fee cap" value={inr(q.lateFeeCap)} sub={`₹200 a day after ${dateLabel(q.dueDate)}`} />
                  </div>
                  {q.missingMonths.length > 0 && <p className="text-amber-800">Day Book not copied for {q.missingMonths.map(monthLabel).join(', ')}: the quarter list is not complete yet.</p>}
                  <p>Download → sheet <b>26Q prep</b> has one row per bill in the order the RPU asks. Challan BSR / serial are filled where the Tally narration has them.</p>
                </div>
              </Step>
            )}
          </>
        )}
        <Step id="howto" n={r?.haveMonth ? 5 : 1} title="How to pay and file" defaultOpen={!r?.haveMonth} summary="Challan 281 → Tally → 26Q / 24Q → Form 16A">
          <HowTo />
        </Step>
        {r?.haveMonth && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        )}
      </div>
    </>
  );
}
