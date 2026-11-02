// Live MIS → Balance Sheet and Cash Flow tabs: month-end statements from Tally's stored Trial Balances
// (GET /api/tally/statements, built by data/statements/statements.ts). Months appear as Tally is reached.
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { BalanceSheet, BsLine, CashFlow } from '../../data/statements/statements';
import { useStatements, type Resp } from './useStatements';

const lakh = (n: number | null | undefined) => (n == null ? '–' : (Math.abs(n) < 500 ? 0 : n / 1e5).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (p: string) => `${MON[Number(p.slice(5)) - 1]} ${p.slice(2, 4)}`;

function Empty({ data, what }: { data: Resp | null; what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
      No {what} yet. It is built from Tally's month-end Trial Balance, which the MIS stores whenever TallyPrime is open on the cloud
      machine (last reached {data?.lastOkAt ? new Date(data.lastOkAt).toLocaleString('en-IN') : 'never'}).{' '}
      {data && !data.connected ? <>Add the Tally host on <Link className="underline" to="/reporting/mis/connectors">Data sources</Link>.</> : <>Open Tally, then press Pull now on the Tally card in <Link className="underline" to="/reporting/mis/connectors">Data sources</Link>.</>}
    </div>
  );
}

const th = 'px-2 py-1.5 text-right font-semibold whitespace-nowrap';
const td = 'px-2 py-1 text-right tabular-nums whitespace-nowrap';

export function BalanceSheetTab() {
  const { data, built, err } = useStatements();
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (err) return <p role="alert" className="text-sm text-red-700">{err}</p>;
  if (!data) return <p className="py-8 text-center text-sm text-slate-400">Loading…</p>;
  const sheets = (built?.sheets ?? []).slice(-12);
  if (!sheets.length) return <Empty data={data} what="Balance Sheet" />;

  // Row labels in order, per section, across every month shown.
  const labels = (pick: (b: BalanceSheet) => BsLine[]) => {
    const out: string[] = [];
    for (const b of sheets) for (const l of pick(b)) if (!out.includes(l.label)) out.push(l.label);
    return out;
  };
  const value = (b: BalanceSheet, pick: (b: BalanceSheet) => BsLine[], lab: string) => pick(b).find((l) => l.label === lab);
  const section = (title: string, pick: (b: BalanceSheet) => BsLine[], total: (b: BalanceSheet) => number) => (
    <>
      <tr className="bg-slate-50"><td colSpan={sheets.length + 1} className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</td></tr>
      {labels(pick).map((lab) => {
        const kids = new Set<string>();
        for (const b of sheets) for (const c of value(b, pick, lab)?.children ?? []) kids.add(c.label);
        const isOpen = open.has(`${title}:${lab}`);
        return (
          <Fragment key={lab}>
            <tr className="border-t border-slate-100">
              <td className="sticky left-0 bg-white px-2 py-1 text-left text-slate-800">
                {kids.size ? (
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(`${title}:${lab}`)) n.delete(`${title}:${lab}`); else n.add(`${title}:${lab}`); return n; })}
                    className="inline-flex items-center gap-1 hover:text-accent-700"><ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden />{lab}</button>
                ) : <span className="pl-[18px]">{lab}</span>}
              </td>
              {sheets.map((b) => <td key={b.period} className={td}>{lakh(value(b, pick, lab)?.amount)}</td>)}
            </tr>
            {isOpen && [...kids].map((k) => (
              <tr key={k} className="text-slate-500">
                <td className="sticky left-0 bg-white py-0.5 pl-9 pr-2 text-left text-[12px]">{k}</td>
                {sheets.map((b) => <td key={b.period} className={`${td} text-[12px]`}>{lakh(value(b, pick, lab)?.children?.find((c) => c.label === k)?.amount)}</td>)}
              </tr>
            ))}
          </Fragment>
        );
      })}
      <tr className="border-t border-slate-300 font-semibold"><td className="sticky left-0 bg-white px-2 py-1 text-left">Total {title.toLowerCase()}</td>{sheets.map((b) => <td key={b.period} className={td}>{lakh(total(b))}</td>)}</tr>
    </>
  );
  const sum = (ls: BsLine[]) => ls.reduce((s, l) => s + l.amount, 0);
  const warnings = [...new Set(sheets.flatMap((b) => b.warnings.map((w) => `${label(b.period)}: ${w}`)))];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(() => { const b = sheets[sheets.length - 1]; return [
          ['Cash & bank', b.cash], ['Bank OD / CC', b.bankOd], ['Working capital', b.workingCapital], ['Profit, FY to date', b.fyProfit],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k} · {label(b.period)}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">₹{lakh(v as number)} L</div>
          </div>)); })()}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" role="region" tabIndex={0} aria-label="Balance Sheet">
        <table className="w-full text-[13px]">
          <thead><tr className="text-xs text-slate-500"><th className="sticky left-0 bg-white px-2 py-1.5 text-left font-semibold">₹ lakh, month end</th>{sheets.map((b) => <th key={b.period} className={th}>{label(b.period)}</th>)}</tr></thead>
          <tbody>
            {section('Equity', (b) => b.equity, (b) => sum(b.equity))}
            {section('Liabilities', (b) => b.liabilities, (b) => sum(b.liabilities))}
            <tr className="border-t-2 border-slate-300 font-semibold"><td className="sticky left-0 bg-white px-2 py-1 text-left">Equity + liabilities</td>{sheets.map((b) => <td key={b.period} className={td}>{lakh(b.totalEquityLiabilities)}</td>)}</tr>
            {section('Assets', (b) => b.assets, (b) => b.totalAssets)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">From Tally's month-end Trial Balance (read only); closing stock from that month's P&L. Click a group to see its sub-groups and ledgers.</p>
      {warnings.length > 0 && <ul className="space-y-1 text-xs text-amber-800">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
    </div>
  );
}

export function CashFlowTab() {
  const { data, built, err } = useStatements();
  if (err) return <p role="alert" className="text-sm text-red-700">{err}</p>;
  if (!data) return <p className="py-8 text-center text-sm text-slate-400">Loading…</p>;
  const flows = (built?.flows ?? []).slice(-12);
  if (!flows.length) return <Empty data={data} what="Cash Flow (it needs two months in a row)" />;
  const rows: [string, (f: CashFlow) => number, 'bold' | 'sub' | ''][] = [
    ['Profit for the month', (f) => f.profit, ''],
    ['Add: depreciation', (f) => f.depreciation, 'sub'],
    ...flows[0].workingCapital.map((w, i) => [w.label, (f: CashFlow) => f.workingCapital[i].amount, 'sub'] as [string, (f: CashFlow) => number, 'sub']),
    ['Cash from operations', (f) => f.operating, 'bold'],
    ['Capital expenditure', (f) => f.capex, 'sub'],
    ['Investments', (f) => f.investments, 'sub'],
    ['Cash from investing', (f) => f.investing, 'bold'],
    ['Equity raised', (f) => f.equity, 'sub'],
    ['Loans & bank OD (net)', (f) => f.loans, 'sub'],
    ['Cash from financing', (f) => f.financing, 'bold'],
    ['Other (suspense, P&L A/c transfers, TB difference)', (f) => f.other, 'sub'],
    ['Net change in cash & bank', (f) => f.netChange, 'bold'],
    ['Opening cash & bank', (f) => f.openingCash, ''],
    ['Closing cash & bank', (f) => f.closingCash, 'bold'],
  ];
  const last = flows[flows.length - 1];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['Cash from operations', last.operating], ['Capex', last.capex], ['Equity + loans', last.financing], ['Net change in cash', last.netChange]] as [string, number][]).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k} · {label(last.period)}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${v < 0 ? 'text-red-700' : 'text-slate-900'}`}>₹{lakh(v)} L</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" role="region" tabIndex={0} aria-label="Cash Flow">
        <table className="w-full text-[13px]">
          <thead><tr className="text-xs text-slate-500"><th className="sticky left-0 bg-white px-2 py-1.5 text-left font-semibold">₹ lakh</th>{flows.map((f) => <th key={f.period} className={th}>{label(f.period)}</th>)}<th className={`${th} bg-slate-50`}>Total</th></tr></thead>
          <tbody>
            {rows.map(([lab, get, kind]) => {
              const isBal = /^(opening|closing)/i.test(lab);
              const total = isBal ? (/^opening/i.test(lab) ? flows[0].openingCash : last.closingCash) : flows.reduce((s, f) => s + get(f), 0);
              return (
                <tr key={lab} className={`border-t border-slate-100 ${kind === 'bold' ? 'font-semibold' : ''}`}>
                  <td className={`sticky left-0 bg-white px-2 py-1 text-left ${kind === 'sub' ? 'pl-6 text-slate-600' : 'text-slate-800'}`}>{lab}</td>
                  {flows.map((f) => { const v = get(f); return <td key={f.period} className={`${td} ${v < 0 ? 'text-red-700' : ''}`}>{lakh(v)}</td>; })}
                  <td className={`${td} bg-slate-50`}>{lakh(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Indirect method from two month-end Balance Sheets (Tally, read only): profit + depreciation − the change in working capital; capex = change in fixed assets + depreciation; financing = change in capital and loans. The sections add up to the change in cash & bank.</p>
    </div>
  );
}
