import { ComplianceItem } from '../../data/compliance/types';
import { getAllProgress, isDueInMonth, yearMonth } from '../../data/compliance/storage';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Horizontal 12-month selector. Shows completion-ratio dots under each month
 * so the user can scan the year at a glance and click any month to jump to it.
 */
export function MonthStrip({
  year,
  month,
  items,
  onChange,
}: {
  year: number;
  month: number;
  items: ComplianceItem[];
  onChange: (year: number, month: number) => void;
}) {
  const now = new Date();
  const progress = getAllProgress();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <button
          onClick={() => onChange(year - 1, month)}
          className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          &lsaquo; {year - 1}
        </button>
        <div className="text-sm font-semibold text-slate-900">{year}</div>
        <button
          onClick={() => onChange(year + 1, month)}
          className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          {year + 1} &rsaquo;
        </button>
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
        {MONTH_ABBR.map((name, i) => {
          const m = i + 1;
          const isCurrent = year === now.getFullYear() && m === now.getMonth() + 1;
          const isSelected = m === month;
          const ym = yearMonth(year, m);
          const due = items.filter((it) => isDueInMonth(it, year, m));
          const done = due.filter((it) => progress[it.id]?.[ym]?.completed).length;
          const pct = due.length === 0 ? 0 : Math.round((done / due.length) * 100);
          return (
            <button
              key={m}
              onClick={() => onChange(year, m)}
              className={`flex flex-col items-center py-2 rounded-md transition-colors text-[11px] font-medium ${
                isSelected
                  ? 'bg-slate-900 text-white'
                  : isCurrent
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{name}</span>
              {due.length > 0 && (
                <span
                  className={`mt-0.5 text-[9px] ${
                    isSelected
                      ? 'text-white/70'
                      : pct === 100
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }`}
                >
                  {done}/{due.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
