// Page template (design-system/heatronics-mis/MASTER.md, as Ops): breadcrumbs (Section › Page, from
// nav/config.ts) · icon + title + pin · one-line purpose · actions. Flat surface, no gradients.
// `crumbs` / `accent` are still accepted from older pages; the menu's breadcrumbs win when the page is in it.
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Pin } from 'lucide-react';
import { breadcrumbsFor, whereIs } from '../../nav/config';
import { usePins } from '../shell/prefs';
import { cx } from '../shell/cx';

interface Crumb { label: string; to?: string }

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  /** Status chip next to the title (data age, issues). */
  status?: React.ReactNode;
  accent?: 'brand' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose';
}

const ICON_TONE: Record<NonNullable<PageHeaderProps['accent']>, string> = {
  brand: 'bg-accent-50 text-accent-600',
  emerald: 'bg-emerald-50 text-emerald-700',
  violet: 'bg-violet-50 text-violet-700',
  amber: 'bg-amber-50 text-amber-700',
  sky: 'bg-blue-50 text-blue-700',
  rose: 'bg-red-50 text-red-700',
};

export function PageHeader({ title, description, crumbs, actions, icon, status, accent = 'brand' }: PageHeaderProps) {
  const path = useLocation().pathname;
  const w = whereIs(path);
  const navCrumbs = breadcrumbsFor(path).map((c) => ({ label: c.label, to: c.href }));
  const trail: Crumb[] = navCrumbs.length ? navCrumbs : (crumbs ?? []).filter((c) => c.to !== '/reporting' && c.to !== '/reporting/mis');
  const { isPinned, toggle } = usePins();
  const pinned = isPinned(path);

  return (
    <div className="border-b border-stone-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {trail.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5 print:hidden">
            <ol className="flex flex-wrap items-center gap-x-1 text-[13px] text-stone-600">
              {trail.map((c, i) => {
                const last = i === trail.length - 1;
                return (
                  <li key={`${c.label}-${i}`} className="flex min-h-[28px] items-center gap-1">
                    {c.to ? <Link to={c.to} className="rounded px-0.5 hover:text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">{c.label}</Link>
                      : <span aria-current={last ? 'page' : undefined} className={last ? 'font-medium text-stone-700' : undefined}>{c.label}</span>}
                    {!last && <ChevronRight className="h-3.5 w-3.5 text-stone-400" aria-hidden />}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-start gap-3">
            {icon && <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5', ICON_TONE[accent])} aria-hidden>{icon}</span>}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1">
                <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.02em] text-stone-900 sm:text-[26px] sm:leading-8">{title}</h1>
                {w && (
                  <button type="button" onClick={() => toggle({ href: path, label: w.page.label, context: w.section.label })}
                    aria-pressed={pinned} aria-label={pinned ? `Unpin ${w.page.label} from the sidebar` : `Pin ${w.page.label} to the sidebar`} title={pinned ? 'Unpin from the sidebar' : 'Pin to the sidebar'}
                    className={cx('inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-lg transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 print:hidden', pinned ? 'text-accent-600' : 'text-stone-400 hover:text-stone-700')}>
                    <Pin className={cx('h-4 w-4', pinned && 'fill-current')} aria-hidden />
                  </button>
                )}
                {status && <span className="ml-1">{status}</span>}
              </div>
              {description && <div className="mt-1 max-w-[80ch] text-sm leading-6 text-stone-600">{description}</div>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
