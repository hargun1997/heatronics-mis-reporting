import { useEffect, useState } from 'react';
import { NavCard } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import {
  ALL_CATEGORIES,
  CATEGORY_META,
  ComplianceCategory,
  ComplianceCategoryKey,
} from '../../data/compliance/types';
import {
  currentYearMonth,
  getAllProgress,
  isDueInMonth,
  loadCategory,
  parseYearMonth,
} from '../../data/compliance/storage';

const iconCalendar = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

interface CategoryStats {
  dueThisMonth: number;
  doneThisMonth: number;
  total: number;
}

export function ComplianceHome() {
  const [stats, setStats] = useState<Partial<Record<ComplianceCategoryKey, CategoryStats>>>({});

  useEffect(() => {
    let cancelled = false;
    const ym = currentYearMonth();
    const { year, month } = parseYearMonth(ym);
    const progress = getAllProgress();

    (async () => {
      const results = await Promise.all(
        ALL_CATEGORIES.map(async (cat): Promise<[ComplianceCategoryKey, CategoryStats] | null> => {
          try {
            const data: ComplianceCategory = await loadCategory(cat);
            const due = data.items.filter((i) => isDueInMonth(i, year, month));
            const done = due.filter((i) => progress[i.id]?.[ym]?.completed).length;
            return [cat, { dueThisMonth: due.length, doneThisMonth: done, total: data.items.length }];
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      const next: Partial<Record<ComplianceCategoryKey, CategoryStats>> = {};
      results.forEach((r) => {
        if (r) next[r[0]] = r[1];
      });
      setStats(next);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const ym = currentYearMonth();
  const { year, month } = parseYearMonth(ym);
  const monthLabel = new Date(year, month - 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <PageHeader title="Compliance" accent="amber" icon={iconCalendar} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Current month banner */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-amber-50 to-white p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
              Current period
            </div>
            <div className="text-lg font-semibold text-slate-900">{monthLabel}</div>
          </div>
          <TotalsBadge stats={stats} />
        </div>

        {/* Category cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ALL_CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat];
            const s = stats[cat];
            const badge = s ? `${s.doneThisMonth}/${s.dueThisMonth} this month` : undefined;
            return (
              <NavCard
                key={cat}
                to={`/compliance/${cat}`}
                title={meta.name}
                description={meta.blurb}
                icon={iconCalendar}
                accent={meta.accent}
                badge={badge}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

function TotalsBadge({
  stats,
}: {
  stats: Partial<Record<ComplianceCategoryKey, CategoryStats>>;
}) {
  const totals = Object.values(stats).reduce(
    (a, s) => {
      if (!s) return a;
      return { due: a.due + s.dueThisMonth, done: a.done + s.doneThisMonth };
    },
    { due: 0, done: 0 }
  );
  const pct = totals.due === 0 ? 0 : Math.round((totals.done / totals.due) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">This month</div>
        <div className="text-sm font-semibold text-slate-900">
          {totals.done} / {totals.due} done
        </div>
      </div>
      <div className="w-28 h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
          aria-label={`${pct}% complete`}
        />
      </div>
    </div>
  );
}
