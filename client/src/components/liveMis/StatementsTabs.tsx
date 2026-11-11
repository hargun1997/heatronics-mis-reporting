// Live MIS → Balance Sheet and Cash Flow tabs: month-end statements from Tally's stored Trial Balances
// (GET /api/tally/statements, built by data/statements/statements.ts). Months appear as Tally is reached.
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { OTHER_WARN_INR, type BalanceSheet, type BsLine, type CashFlow } from '../../data/statements/statements';
import { useStatements, type Resp } from './useStatements';

/** ₹ lakh, 2 decimals; negatives with a real minus sign; below ₹500 shows as 0.00 (never "-0.00"). */
const lakh = (n: number | null | undefined) => {
  if (n == null || !isFinite(n)) return '–';
  const v = Math.abs(n) < 500 ? 0 : n / 1e5;
  const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `−${s}` : s;
};
const neg = (n: number | null | undefined) => (n != null && n <= -500 ? 'text-red-700' : '');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (p: string) => `${MON[Number(p.slice(5)) - 1]} ${p.slice(2, 4)}`;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

function Empty({ data, what }: { data: Resp | null; what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
      <p className="font-medium text-slate-800">No Trial Balance stored yet{what ? `: no ${what}` : ''}.</p>
      <p className="mt-1 max-w-2xl mx-auto">
        The MIS copies Tally's month-end Trial Balance whenever TallyPrime is open on the cloud machine (last reached {when(data?.lastOkAt)});
        the scheduled copy runs from the 15th of each month, so before that: open TallyPrime, then{' '}
        <Link className="underline underline-offset-2" to="/reporting/mis/connectors#tally">Setup → Tally → Pull</Link>.
        {data && !data.connected && <> The Tally host isn't set yet: add it on that card first.</>}
      </p>
    </div>
  );
}

function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="text-xs font-semibold text-amber-800">Check in Tally ({items.length})</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">{items.map((w) => <li key={w}>{w}</li>)}</ul>
    </div>
  );
}

function Kpi({ k, v, sub }: { k: string; v: number; sub: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-card">
      <div className="truncate text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-slate-500" title={`${k} · ${sub}`}>{k} · {sub}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${v <= -500 ? 'text-red-700' : 'text-slate-900'}`}>₹{lakh(v)} L</div>
    </div>
  );
}

const th = 'px-2 py-1.5 text-right font-semibold whitespace-nowrap';
const td = 'px-2 py-1 text-right tabular-nums whitespace-nowrap';
const stick = 'sticky left-0 z-[1] bg-white';

export function BalanceSheetTab() {
  const { data, built, err } = useStatements();
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (err) return <p role="alert" className="text-sm text-red-700">Couldn't load the statements: {err}</p>;
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
  const toggle = (key: string) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const section = (title: string, pick: (b: BalanceSheet) => BsLine[], total: (b: BalanceSheet) => number) => (
    <>
      <tr className="bg-slate-50"><td colSpan={sheets.length + 1} className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</td></tr>
      {labels(pick).map((lab) => {
        // Children (sub-groups / ledgers) and, under a sub-group, its own ledgers — in first-seen order across months.
        const kids: string[] = [];
        const grand = new Map<string, string[]>();
        for (const b of sheets) for (const c of value(b, pick, lab)?.children ?? []) {
          if (!kids.includes(c.label)) kids.push(c.label);
          const g = grand.get(c.label) ?? [];
          for (const x of c.children ?? []) if (!g.includes(x.label)) g.push(x.label);
          grand.set(c.label, g);
        }
        const key = `${title}:${lab}`;
        const isOpen = open.has(key);
        const isDiff = /^difference in trial balance$/i.test(lab);
        const child = (b: BalanceSheet, k: string) => value(b, pick, lab)?.children?.find((c) => c.label === k);
        return (
          <Fragment key={lab}>
            <tr className={`border-t border-slate-100 ${isDiff ? 'bg-amber-50' : ''}`}>
              <td className={`${stick} px-2 py-1 text-left text-slate-800 ${isDiff ? 'bg-amber-50' : ''}`}>
                {kids.length ? (
                  <button type="button" aria-expanded={isOpen} onClick={() => toggle(key)}
                    className="inline-flex min-h-[28px] items-center gap-1 text-left hover:text-accent-700"><ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden />{lab}</button>
                ) : <span className="pl-[18px]">{lab}</span>}
              </td>
              {sheets.map((b) => { const v = value(b, pick, lab)?.amount; return <td key={b.period} className={`${td} ${neg(v)}`}>{lakh(v)}</td>; })}
            </tr>
            {isOpen && kids.map((k) => (
              <Fragment key={k}>
                <tr className="text-slate-500">
                  <td className={`${stick} py-0.5 pl-9 pr-2 text-left text-[12px]`}>{k}</td>
                  {sheets.map((b) => { const v = child(b, k)?.amount; return <td key={b.period} className={`${td} text-[12px] ${neg(v)}`}>{lakh(v)}</td>; })}
                </tr>
                {(grand.get(k) ?? []).map((gk) => (
                  <tr key={`${k}/${gk}`} className="text-slate-400">
                    <td className={`${stick} py-0.5 pl-14 pr-2 text-left text-xs sm:text-[11px]`}>{gk}</td>
                    {sheets.map((b) => { const v = child(b, k)?.children?.find((x) => x.label === gk)?.amount; return <td key={b.period} className={`${td} text-xs sm:text-[11px] ${neg(v)}`}>{lakh(v)}</td>; })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
      <tr className="border-t border-slate-300 font-semibold"><td className={`${stick} px-2 py-1 text-left`}>Total {title.toLowerCase()}</td>{sheets.map((b) => <td key={b.period} className={td}>{lakh(total(b))}</td>)}</tr>
    </>
  );
  const sum = (ls: BsLine[]) => ls.reduce((s, l) => s + l.amount, 0);
  const warnings = [...new Set(sheets.flatMap((b) => b.warnings.map((w) => `${label(b.period)}: ${w}`)))];
  const b = sheets[sheets.length - 1];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi k="Cash & bank" v={b.cash} sub={label(b.period)} />
        <Kpi k="Bank OD / CC owed" v={b.bankOd} sub={label(b.period)} />
        <Kpi k="Working capital" v={b.workingCapital} sub={label(b.period)} />
        <Kpi k="Profit, FY to date" v={b.fyProfit} sub={label(b.period)} />
      </div>
      <Warnings items={warnings} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" role="region" tabIndex={0} aria-label="Balance Sheet">
        <table className="w-full text-[13px]">
          <thead><tr className="text-xs text-slate-500"><th className={`${stick} px-2 py-1.5 text-left font-semibold`}>₹ lakh, month end</th>{sheets.map((s) => <th key={s.period} className={th}>{label(s.period)}</th>)}</tr></thead>
          <tbody>
            {section('Equity', (s) => s.equity, (s) => sum(s.equity))}
            {section('Liabilities', (s) => s.liabilities, (s) => sum(s.liabilities))}
            <tr className="border-t-2 border-slate-300 font-semibold"><td className={`${stick} px-2 py-1 text-left`}>Equity + liabilities</td>{sheets.map((s) => <td key={s.period} className={td}>{lakh(s.totalEquityLiabilities)}</td>)}</tr>
            {section('Assets', (s) => s.assets, (s) => s.totalAssets)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        From Tally's Trial Balance at each month end, asked from 1 April (read only); closing stock from that month's P&L replaces the
        opening stock Tally's Trial Balance carries. Click a group to see its sub-groups and ledgers. Latest Tally copy: {when(b.asOf)}.
      </p>
    </div>
  );
}

export function CashFlowTab() {
  const { data, built, err } = useStatements();
  if (err) return <p role="alert" className="text-sm text-red-700">Couldn't load the statements: {err}</p>;
  if (!data) return <p className="py-8 text-center text-sm text-slate-400">Loading…</p>;
  const flows = (built?.flows ?? []).slice(-12);
  if (!flows.length) return <Empty data={data} what="Cash Flow (it needs two month ends in a row)" />;
  type Kind = 'bold' | 'sub' | 'memo' | '';
  const rows: [string, (f: CashFlow) => number | null, Kind][] = [
    ['Profit for the month', (f) => f.profit, ''],
    ['Add: depreciation', (f) => f.depreciation, 'sub'],
    ...flows[0].workingCapital.map((w, i) => [w.label, (f: CashFlow) => f.workingCapital[i].amount, 'sub'] as [string, (f: CashFlow) => number, Kind]),
    ['Cash from operations', (f) => f.operating, 'bold'],
    ['Capital expenditure', (f) => f.capex, 'sub'],
    ['Investments', (f) => f.investments, 'sub'],
    ['Cash from investing', (f) => f.investing, 'bold'],
    ['Equity raised', (f) => f.equity, 'sub'],
    ['Loans & bank OD / CC (net)', (f) => f.loans, 'sub'],
    ['Cash from financing', (f) => f.financing, 'bold'],
    ['Prior-period entries in P&L A/c', (f) => f.retained, 'sub'],
    ['Unexplained (suspense, misc., TB difference)', (f) => f.other, 'sub'],
    ['Net change in cash & bank', (f) => f.netChange, 'bold'],
    ['Opening cash & bank', (f) => f.openingCash, ''],
    ['Closing cash & bank', (f) => f.closingCash, 'bold'],
    ['Memo: profit per the month\'s P&L copy', (f) => f.pnlProfit, 'memo'],
  ];
  const last = flows[flows.length - 1];
  const warnings = [...new Set(flows.flatMap((f) => f.warnings.map((w) => `${label(f.period)}: ${w}`)))];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi k="Cash from operations" v={last.operating} sub={label(last.period)} />
        <Kpi k="Capex" v={last.capex} sub={label(last.period)} />
        <Kpi k="Equity + loans" v={last.financing} sub={label(last.period)} />
        <Kpi k="Net change in cash" v={last.netChange} sub={label(last.period)} />
      </div>
      <Warnings items={warnings} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" role="region" tabIndex={0} aria-label="Cash Flow">
        <table className="w-full text-[13px]">
          <thead><tr className="text-xs text-slate-500"><th className={`${stick} px-2 py-1.5 text-left font-semibold`}>₹ lakh</th>{flows.map((f) => <th key={f.period} className={th}>{label(f.period)}</th>)}<th className={`${th} bg-slate-50`}>Total</th></tr></thead>
          <tbody>
            {rows.map(([lab, get, kind]) => {
              const isBal = /^(opening|closing)/i.test(lab);
              const vals = flows.map(get);
              const total = isBal ? (/^opening/i.test(lab) ? flows[0].openingCash : last.closingCash) : vals.some((v) => v == null) ? null : vals.reduce<number>((s, v) => s + (v ?? 0), 0);
              const isOther = /^unexplained/i.test(lab);
              return (
                <tr key={lab} className={`border-t border-slate-100 ${kind === 'bold' ? 'font-semibold' : ''} ${kind === 'memo' ? 'text-slate-400 italic' : ''}`}>
                  <td className={`${stick} px-2 py-1 text-left ${kind === 'sub' ? 'pl-6 text-slate-600' : kind === 'memo' ? '' : 'text-slate-800'}`}>{lab}</td>
                  {vals.map((v, i) => (
                    <td key={flows[i].period} className={`${td} ${neg(v)} ${isOther && v != null && Math.abs(v) >= OTHER_WARN_INR ? 'bg-amber-50 font-semibold text-amber-800' : ''}`}>{lakh(v)}</td>
                  ))}
                  <td className={`${td} bg-slate-50 ${neg(total)}`}>{lakh(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Indirect method from two month-end Balance Sheets (Tally, read only): profit + depreciation − the change in working capital;
        capex = change in fixed assets + depreciation; financing = change in capital and loans (bank OD / CC included, not netted
        into cash). The sections add up to the change in cash & bank; "Unexplained" should stay near zero (highlighted from
        ₹{OTHER_WARN_INR.toLocaleString('en-IN')}).
      </p>
    </div>
  );
}
