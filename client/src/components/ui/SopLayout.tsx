import React from 'react';
import { PageHeader } from './PageHeader';
import { Pill } from './Card';
import { Disclosure } from './Disclosure';

export interface SopStep {
  title: string;
  body: string;
}

export interface SopExample {
  title: string;
  scenario: string;
  voucherType: string;
  journal: { side: 'Dr' | 'Cr'; ledger: string; amount?: string; note?: string }[];
  note?: string;
}

export interface SopSpec {
  title: string;
  description: string;
  accent: 'brand' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose';
  operateIn: 'Tally' | 'Tranzact' | 'Both';
  voucherTypes: { name: string; billSeries?: string }[];
  ledgerMapping: { role: string; ledger: string }[];
  steps: SopStep[];
  examples: SopExample[];
  clearing?: string;
  gotchas?: string[];
  icon?: React.ReactNode;
}

export function SopLayout({ spec }: { spec: SopSpec }) {
  return (
    <>
      <PageHeader
        title={spec.title}
        description={spec.description}
        accent={spec.accent}
        icon={spec.icon}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Where to operate */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Where to operate</span>
            <Pill color={spec.operateIn === 'Tally' ? 'emerald' : spec.operateIn === 'Tranzact' ? 'brand' : 'violet'}>
              {spec.operateIn}
            </Pill>
            {spec.voucherTypes.map((v) => (
              <Pill key={v.name} color="slate">
                {v.name}{v.billSeries ? ` · ${v.billSeries}` : ''}
              </Pill>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Voucher type(s)</div>
              <ul className="mt-1 space-y-1 text-slate-700">
                {spec.voucherTypes.map((v) => (
                  <li key={v.name}>
                    <span className="font-medium">{v.name}</span>
                    {v.billSeries && <span className="text-slate-500"> · {v.billSeries}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Key ledger mapping</div>
              <ul className="mt-1 space-y-1 text-slate-700">
                {spec.ledgerMapping.map((l) => (
                  <li key={l.role}>
                    <span className="text-slate-500">{l.role}:</span> <span className="font-medium">{l.ledger}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Step-by-step</h3>
          <ol className="mt-4 space-y-3">
            {spec.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-medium text-slate-900">{s.title}</div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Examples */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Examples with real data</h3>
          <p className="mt-1 text-xs text-slate-500">Click any scenario to expand the journal entry and notes.</p>
          <div className="mt-4 space-y-2">
            {spec.examples.map((ex, i) => (
              <Disclosure
                key={i}
                title={ex.title}
                subtitle={ex.scenario}
                badge={<Pill color="slate" size="xs">{ex.voucherType}</Pill>}
                defaultOpen={i === 0}
              >
                <JournalTable lines={ex.journal} />
                {ex.note && (
                  <p className="mt-3 text-xs text-slate-500 italic">{ex.note}</p>
                )}
              </Disclosure>
            ))}
          </div>
        </div>

        {/* Clearing */}
        {spec.clearing && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-5">
            <h3 className="text-sm font-semibold text-slate-900">Clearing & reconciliation</h3>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">{spec.clearing}</p>
          </div>
        )}

        {/* Gotchas */}
        {spec.gotchas && spec.gotchas.length > 0 && (
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-5">
            <h3 className="text-sm font-semibold text-slate-900">Gotchas</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {spec.gotchas.map((g, i) => (
                <li key={i} className="flex items-start gap-2">
                  <svg className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                  </svg>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

export function JournalTable({ lines }: { lines: { side: 'Dr' | 'Cr'; ledger: string; amount?: string; note?: string }[] }) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
          <tr>
            <th className="text-left px-3 py-2 font-medium w-14">Dr / Cr</th>
            <th className="text-left px-3 py-2 font-medium">Ledger</th>
            <th className="text-right px-3 py-2 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((l, i) => (
            <tr key={i}>
              <td className={`px-3 py-2 font-semibold ${l.side === 'Dr' ? 'text-brand-700' : 'text-emerald-700'}`}>{l.side}</td>
              <td className="px-3 py-2 text-slate-700">
                {l.ledger}
                {l.note && <span className="block text-[10px] text-slate-400 italic mt-0.5">{l.note}</span>}
              </td>
              <td className="px-3 py-2 text-right currency text-slate-900 font-medium">{l.amount || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
