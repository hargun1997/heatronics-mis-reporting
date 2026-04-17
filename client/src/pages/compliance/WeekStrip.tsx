import { ComplianceItem } from '../../data/compliance/types';
import { getAllProgress, isDueInWeek, weekKey } from '../../data/compliance/storage';

const WEEK_LABELS = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
const WEEK_RANGES = ['1\u20137', '8\u201314', '15\u201321', '22\u201328', '29\u201331'];

export function WeekStrip({
  year,
  month,
  selectedWeek,
  items,
  onChange,
}: {
  year: number;
  month: number;
  selectedWeek: number;
  items: ComplianceItem[];
  onChange: (week: number) => void;
}) {
  const progress = getAllProgress();
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  const currentWeek = isCurrentMonth ? Math.min(5, Math.floor((today.getDate() - 1) / 7) + 1) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">
        Select week
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {WEEK_LABELS.map((label, i) => {
          const w = i + 1;
          const isSelected = w === selectedWeek;
          const isCurrent = w === currentWeek;
          const wk = weekKey(year, month, w);
          const due = items.filter((it) => isDueInWeek(it, year, month, w));
          const done = due.filter((it) => progress[it.id]?.[wk]?.completed).length;

          return (
            <button
              key={w}
              onClick={() => onChange(w)}
              className={`flex flex-col items-center py-2.5 rounded-lg transition-colors ${
                isSelected
                  ? 'bg-slate-900 text-white'
                  : isCurrent
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-xs font-semibold">{label}</span>
              <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/60' : 'text-slate-400'}`}>
                {WEEK_RANGES[i]}
              </span>
              {due.length > 0 && (
                <span
                  className={`mt-1 text-[10px] font-medium ${
                    isSelected
                      ? 'text-white/70'
                      : done === due.length
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
