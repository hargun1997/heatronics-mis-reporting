// Live TDS on the "Pay last month's TDS" tasks (calendar v3): the amount per section for the task's month, from the stored
// Tally Day Book. Same engine as /accounts/tds (data/tds/tds.ts).
import { Link } from 'react-router-dom';
import { useTds } from '../../data/tds/useTds';
import { monthLabel } from '../../data/tds/tds';
import { NoDayBook, PayHeadline, PayTable } from '../accounts/tdsParts';

export function TdsTaskPanel({ month }: { month: string }) {
  const { report: r, error, loading } = useTds(month);
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3" aria-label="TDS to pay">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">TDS for {monthLabel(month)}</h3>
        <Link to="/accounts/tds" className="ml-auto text-sm font-medium text-accent-700 hover:underline">Open TDS planning →</Link>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading && !r && <p className="text-sm text-slate-500">Reading the Tally Day Book…</p>}
      {r && !r.haveMonth && <NoDayBook month={monthLabel(month)} />}
      {r && r.haveMonth && (<><PayHeadline r={r} /><PayTable r={r} />
        {r.flags.some((f) => f.severity === 'high') && <p className="text-sm text-red-700">{r.flags.filter((f) => f.severity === 'high').length} things to fix before paying: see the TDS page.</p>}</>)}
    </section>
  );
}
