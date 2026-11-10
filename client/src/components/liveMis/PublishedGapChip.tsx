// A quiet chip for the months that were in the published workbook and now come from Tally (10 Nov 2026).
// It says so and lists the ₹ difference per month. A note, not a banner: nothing shows when no month qualifies.
import { Database } from 'lucide-react';
import { Popover } from '../ui/overlays';
import { inr } from '../mis-deck/format';
import { monthLabel } from '../../data/misDeck/liveAnalytics';
import { publishedGapRows } from '../../data/misDeck/publishedBasis';
import type { LiveDeckData } from '../../data/misDeck/liveDeck';

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${inr(Math.abs(v))}`;

export function PublishedGapChip({ deck }: { deck: Pick<LiveDeckData, 'completeness'> }) {
  const rows = publishedGapRows(deck.completeness);
  if (rows.length === 0) return null;
  const span = rows.length === 1 ? monthLabel(rows[0].key) : `${monthLabel(rows[0].key)}–${monthLabel(rows[rows.length - 1].key)}`;
  return (
    <Popover
      align="left"
      width={340}
      buttonLabel={`${span} now from Tally. See the change from the published workbook`}
      buttonClassName="inline-flex min-h-[44px] sm:min-h-[28px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      button={<><Database className="h-3.5 w-3.5" aria-hidden />{span} now from Tally</>}
    >
      <div className="p-3 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Tally vs the earlier published workbook</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Month</th>
              <th className="py-1 px-2 text-right font-medium">Net revenue</th>
              <th className="py-1 pl-2 text-right font-medium">Net profit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-slate-100">
                <td className="py-1 pr-2 text-slate-800">{monthLabel(r.key)}</td>
                <td className="py-1 px-2 text-right tabular-nums text-slate-700">{signed(r.dNetRevenue)}</td>
                <td className="py-1 pl-2 text-right tabular-nums text-slate-700">{signed(r.dNetIncome)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
          These months now come from the Tally books. The numbers show Tally minus the published workbook. The page shows Tally.
        </p>
      </div>
    </Popover>
  );
}
