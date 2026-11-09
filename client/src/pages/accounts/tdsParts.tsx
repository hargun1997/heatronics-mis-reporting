// Pieces shared by the TDS planning page (/accounts/tds) and the "Pay last month's TDS" task's live panel.
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { SECTIONS, dateLabel, type TdsReport } from '../../data/tds/tds';
import { inr } from '../../data/tds/useTds';

export function NoDayBook({ month }: { month: string }) {
  return (
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <b>Tally Day Book for {month} not copied yet.</b> Open TallyPrime, then go to <a className="font-semibold underline" href="/tally">Tally health</a> → <b>Pull Tally now</b>.
    </div>
  );
}

/** The big number: what to deposit and by when. */
export function PayHeadline({ r }: { r: TdsReport }) {
  const tone = r.overdue ? 'border-red-200 bg-red-50' : 'border-accent-200 bg-accent-50';
  return (
    <div className={`rounded-xl border px-4 py-4 sm:px-5 ${tone}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{r.overdue ? 'Late — pay now' : `Pay by ${dateLabel(r.dueDate)}`}</div>
      <div className="mt-1 text-[32px] font-semibold leading-10 text-slate-900">{inr(r.totals.balance)}</div>
      <div className="mt-1 text-sm text-slate-700">
        TDS deducted in {r.monthLabel}: {inr(r.totals.deducted)} · already paid {inr(r.totals.paid)}
        {r.totals.interest > 0 && <> · <span className="font-semibold text-red-700">interest about {inr(r.totals.interest)}</span></>}
      </div>
    </div>
  );
}

export function PayTable({ r }: { r: TdsReport }) {
  if (!r.pay.length) return <p className="text-sm text-slate-600">No TDS was deducted in {r.monthLabel} (no voucher credits a TDS ledger).</p>;
  return (
    <>
    {/* Phones: one card per challan, the amount to pay on the right. */}
    <ul className="space-y-2 sm:hidden">
      {r.pay.map((p) => (
        <li key={`${p.section}-${p.head}`} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2">
          <div className="min-w-0 flex-1 text-sm">
            <div><span className="font-semibold text-slate-900">{p.section}</span> <span className="text-slate-600">{p.label}</span></div>
            <div className="text-xs text-slate-600">Head <span className="font-mono">{p.head}</span> · deducted {inr(p.deducted)} · paid {inr(p.paid)}</div>
          </div>
          <div className="text-right text-base font-semibold tabular-nums text-slate-900">{inr(p.balance)}</div>
        </li>
      ))}
      <li className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold"><span>Total to pay</span><span className="tabular-nums">{inr(r.totals.balance)}</span></li>
    </ul>
    <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead className="bg-slate-50 text-left text-xs text-slate-600">
          <tr>
            <th className="px-3 py-2 font-semibold">Section</th>
            <th className="px-3 py-2 font-semibold">Challan head</th>
            <th className="px-3 py-2 text-right font-semibold">Deducted</th>
            <th className="px-3 py-2 text-right font-semibold">Paid</th>
            <th className="px-3 py-2 text-right font-semibold">To pay</th>
          </tr>
        </thead>
        <tbody>
          {r.pay.map((p) => (
            <tr key={`${p.section}-${p.head}`} className="border-t border-slate-100">
              <td className="px-3 py-2"><span className="font-semibold text-slate-900">{p.section}</span> <span className="text-slate-600">{p.label}</span></td>
              <td className="px-3 py-2 text-slate-700"><span className="font-mono">{p.head}</span> · {p.headLabel}</td>
              <td className="px-3 py-2 text-right tabular-nums">{inr(p.deducted)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">{inr(p.paid)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{inr(p.balance)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 bg-slate-50">
            <td className="px-3 py-2 font-semibold" colSpan={2}>Total</td>
            <td className="px-3 py-2 text-right font-semibold tabular-nums">{inr(r.totals.deducted)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{inr(r.totals.paid)}</td>
            <td className="px-3 py-2 text-right font-semibold tabular-nums">{inr(r.totals.balance)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    </>
  );
}

export function DeducteeList({ r }: { r: TdsReport }) {
  const secs = r.sections;
  const [open, setOpen] = useState<string | null>(secs[0]?.section ?? null);
  if (!secs.length) return <p className="text-sm text-slate-600">Nothing deducted this month.</p>;
  return (
    <div className="space-y-2">
      {secs.map((s) => {
        const rows = r.deductees.filter((d) => d.section === s.section);
        const isOpen = open === s.section;
        return (
          <div key={s.section} className="rounded-lg border border-slate-200">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.section)}
              className="flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-slate-900">{s.section}</span> <span className="text-sm text-slate-600">{s.label}</span>
                <span className="block text-xs text-slate-600">{s.deductees} {s.deductees === 1 ? 'party' : 'parties'} · paid to them {inr(s.gross)}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">{inr(s.deducted)}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {isOpen && (
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="w-full min-w-[620px] text-[13px]">
                  <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr>
                    <th className="px-3 py-1.5 font-semibold">Party</th><th className="px-3 py-1.5 font-semibold">PAN</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Paid to them</th><th className="px-3 py-1.5 text-right font-semibold">TDS</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Rate</th><th className="px-3 py-1.5 font-semibold">Check</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.party} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-1.5 text-slate-900">{d.party}<span className="block text-xs text-slate-500">{d.entries} {d.entries === 1 ? 'bill' : 'bills'} · this FY {inr(d.fyGross)}</span></td>
                        <td className="px-3 py-1.5 font-mono text-xs">{d.pan || <span className="font-sans text-red-700">missing</span>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{inr(d.gross)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{inr(d.tds)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{d.ratePct == null ? '—' : `${d.ratePct}%`}<span className="block text-xs text-slate-500">std {SECTIONS[d.section].rates.map((x) => `${x.pct}%`).join(' / ') || '—'}</span></td>
                        <td className="px-3 py-1.5 text-xs">{d.flags.length ? <ul className="space-y-0.5 text-amber-800">{d.flags.map((f) => <li key={f}>{f}</li>)}</ul> : <span className="text-emerald-700">OK</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FlagList({ r }: { r: TdsReport }) {
  if (!r.flags.length) return <p className="text-sm text-emerald-700">Nothing to check: rates and PANs look right.</p>;
  const tone = { high: 'border-red-200 bg-red-50 text-red-800', medium: 'border-amber-200 bg-amber-50 text-amber-800', low: 'border-slate-200 bg-slate-50 text-slate-700' } as const;
  const tag = { high: 'Fix', medium: 'Check', low: 'Note' } as const;
  return (
    <ol className="space-y-2">
      {r.flags.map((f, i) => (
        <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${tone[f.severity]}`}><span className="mr-1 font-semibold">{i + 1}. {tag[f.severity]}:</span>{f.text}</li>
      ))}
    </ol>
  );
}

/** "How to pay and file" — numbered, simple English. */
export function HowTo() {
  const steps: { title: string; body: ReactNode }[] = [
    { title: 'Pay the TDS (by the 7th; March by 30 April)', body: (
      <ol className="list-[lower-alpha] space-y-1 pl-5">
        <li>Go to <b>incometax.gov.in</b> → <b>e-Pay Tax</b> (log in with the company PAN / TAN).</li>
        <li>Choose <b>challan ITNS 281</b> (TDS / TCS).</li>
        <li>Major head: <b>0020</b> if the party is a company, <b>0021</b> for everyone else. Minor head: <b>200</b> (TDS payable by taxpayer).</li>
        <li>Pick the <b>section</b> and enter the amount from the table above. One challan per section and head.</li>
        <li>Pay by net banking. Save the challan PDF. Write down <b>BSR code, date, challan serial no. (or CIN)</b>.</li>
      </ol>) },
    { title: 'Book the challan in Tally', body: (
      <ol className="list-[lower-alpha] space-y-1 pl-5">
        <li>Payment voucher: <b>Dr</b> the TDS ledger of that section, <b>Cr</b> the bank.</li>
        <li>In the narration write: <b>BSR &lt;7 digits&gt; Challan &lt;5 digits&gt;</b> — this page reads it for the 26Q.</li>
      </ol>) },
    { title: 'Every quarter: file 26Q (and 24Q for salary)', body: (
      <ol className="list-[lower-alpha] space-y-1 pl-5">
        <li>Due: Q1 by <b>31 Jul</b>, Q2 by <b>31 Oct</b>, Q3 by <b>31 Jan</b>, Q4 by <b>31 May</b>.</li>
        <li>Download this page → sheet <b>26Q prep</b>.</li>
        <li>Open the <b>RPU</b> (Return Preparation Utility from Protean / tin-nsdl). Enter the challans, then the deductee rows.</li>
        <li>Check the file with the <b>FVU</b> (File Validation Utility). Fix every error it shows.</li>
        <li>Upload the .fvu file on <b>incometax.gov.in</b> → e-File → TDS → Upload TDS, with DSC or EVC.</li>
        <li>Late fee: ₹200 a day after the due date (capped at the TDS).</li>
      </ol>) },
    { title: 'Send Form 16A to the parties', body: (
      <ol className="list-[lower-alpha] space-y-1 pl-5">
        <li>About 15 days after the return is processed, log in to <b>TRACES</b>.</li>
        <li>Downloads → <b>Form 16A</b> for the quarter. Email each party its certificate.</li>
      </ol>) },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-50 text-sm font-bold text-accent-700">{i + 1}</span>
          <div className="min-w-0 text-sm text-slate-700"><div className="mb-1 font-semibold text-slate-900">{s.title}</div>{s.body}</div>
        </li>
      ))}
    </ol>
  );
}
