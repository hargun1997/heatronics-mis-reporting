import { ComplianceItem } from '../../data/compliance/types';
import { getAllProgress, isDueOnDate, dayKey, daysInMonth } from '../../data/compliance/storage';

export function DateStrip({
  year,
  month,
  selectedDay,
  items,
  onChange,
}: {
  year: number;
  month: number;
  selectedDay: number;
  items: ComplianceItem[];
  onChange: (day: number) => void;
}) {
  const total = daysInMonth(year, month);
  const progress = getAllProgress();
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">
        Select date
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: total }, (_, i) => {
          const day = i + 1;
          const isToday = isCurrentMonth && day === today.getDate();
          const isSelected = day === selectedDay;
          const dk = dayKey(year, month, day);
          const due = items.filter((it) => isDueOnDate(it, year, month, day));
          const done = due.filter((it) => progress[it.id]?.[dk]?.completed).length;
          const allDone = due.length > 0 && done === due.length;

          return (
            <button
              key={day}
              onClick={() => onChange(day)}
              className={`flex flex-col items-center py-1.5 rounded-md transition-colors text-[11px] font-medium ${
                isSelected
                  ? 'bg-slate-900 text-white'
                  : isToday
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{day}</span>
              {due.length > 0 && (
                <span
                  className={`mt-0.5 w-1.5 h-1.5 rounded-full ${
                    isSelected
                      ? 'bg-white/60'
                      : allDone
                      ? 'bg-emerald-500'
                      : 'bg-slate-300'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
