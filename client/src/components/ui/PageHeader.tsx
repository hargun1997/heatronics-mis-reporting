// Page template (design-system/heatronics-mis/MASTER.md "Page template", simplified 11 Nov 2026):
// title · status pill · actions (one primary) · About (i) popover, then ONE sentence, then optional underline tabs.
// Owner / cadence / job, "How this works" and Pin live in the About popover, not on the page. Breadcrumbs show only for
// pages that are not in the sidebar. `crumbs` / `accent` / `icon` are still accepted from older pages and ignored.
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Info, MoreHorizontal, Pin } from 'lucide-react';
import { NAV, PAGE_OWNER, breadcrumbsFor, whereIs } from '../../nav/config';
import { usePins } from '../shell/prefs';
import { cx } from '../shell/cx';
import { Popover } from './overlays';

interface Crumb { label: string; to?: string }
export interface PageTab { id: string; label: string; count?: number | null }

interface PageHeaderProps {
  title: string;
  /** One sentence, 25 words at most. */
  description?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  /** Status pill next to the title (data age, state). */
  status?: React.ReactNode;
  accent?: string;
  /** "How this works": shown in the About popover. Short lines or a list. */
  help?: React.ReactNode;
  /** Underline tabs under the title. */
  tabs?: PageTab[];
  tab?: string;
  onTab?: (id: string) => void;
}

export function PageTabs({ tabs, value, onChange, label = 'Views' }: { tabs: PageTab[]; value?: string; onChange?: (id: string) => void; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mb-px flex gap-1 overflow-x-auto print:hidden">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange?.(t.id)}
            className={cx('inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500',
              on ? 'border-accent-500 font-semibold text-stone-900' : 'border-transparent text-stone-600 hover:text-stone-900')}>
            {t.label}
            {t.count != null && t.count > 0 && <span className="rounded-full bg-stone-100 px-1.5 text-xs font-semibold tabular-nums text-stone-700">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({ title, description, actions, status, help, tabs, tab, onTab }: PageHeaderProps) {
  const path = useLocation().pathname;
  const w = whereIs(path);
  const hiddenPage = !!w && !!NAV.find((s) => s.id === w.section.id)?.hidden;
  const trail = hiddenPage ? breadcrumbsFor(path).map((c) => ({ label: c.label, to: c.href })) : [];
  const { isPinned, toggle } = usePins();
  const pinned = isPinned(path);
  const owner = w ? PAGE_OWNER[w.page.id] : undefined;
  // About (i): next to the title on phones (so it never sits alone on a row), at the end of the actions from sm up.
  const about = (owner || help || w) ? (
<Popover align="right" width={320} buttonLabel={`About ${title}`}
                buttonClassName="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                button={<Info className="h-[18px] w-[18px]" aria-hidden />}>
                <div className="space-y-3 p-4 text-sm text-stone-700" data-testid="page-owner">
                  {owner && (
                    <dl className="space-y-1.5">
                      <div className="flex gap-2"><dt className="w-20 shrink-0 text-stone-500">Owner</dt><dd className="font-medium text-stone-900">{owner.person ? `${owner.person} (${owner.role})` : owner.role}</dd></div>
                      <div className="flex gap-2"><dt className="w-20 shrink-0 text-stone-500">How often</dt><dd>{owner.cadence}</dd></div>
                      <div className="flex gap-2"><dt className="w-20 shrink-0 text-stone-500">What to do</dt><dd>{owner.job}</dd></div>
                    </dl>
                  )}
                  {help && <div className="space-y-1.5 border-t border-stone-200 pt-3 text-[13px] leading-5 text-stone-600 [&_li]:ml-4 [&_li]:list-decimal">{help}</div>}
                  {w && (
                    <button type="button" aria-pressed={pinned} onClick={() => toggle({ href: path, label: w.page.label, context: w.section.label })}
                      className="inline-flex min-h-11 sm:min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-stone-200 px-3 text-sm font-medium text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
                      <Pin className={cx('h-4 w-4', pinned && 'fill-current text-accent-600')} aria-hidden />{pinned ? 'Remove from pinned' : 'Pin to sidebar'}
                    </button>
                  )}
                </div>
              </Popover>
  ) : null;

  return (
    <div className="bg-transparent">
    <div className={cx(tabs && 'border-b border-stone-200')}>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        {trail.length > 0 && (
          <nav aria-label="Breadcrumb" className="print:hidden">
            <ol className="flex flex-wrap items-center gap-x-1 text-[13px] text-stone-600">
              {trail.map((c, i) => {
                const last = i === trail.length - 1;
                return (
                  <li key={`${c.label}-${i}`} className="flex min-h-[24px] items-center gap-1">
                    {c.to ? <Link to={c.to} className="rounded px-0.5 hover:text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">{c.label}</Link>
                      : <span aria-current={last ? 'page' : undefined}>{c.label}</span>}
                    {!last && <ChevronRight className="h-3.5 w-3.5 text-stone-400" aria-hidden />}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-[22px] font-[650] leading-7 tracking-[-0.015em] text-stone-900">{title}</h1>
            {status}
            {about && <span className="sm:hidden print:hidden">{about}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {actions}
            {about && <span className="hidden sm:inline-flex">{about}</span>}
          </div>
        </div>
        {description && <p className="mt-0.5 max-w-[80ch] text-sm leading-5 text-stone-600">{description}</p>}
        {tabs && <div className="mt-2"><PageTabs tabs={tabs} value={tab} onChange={onTab} /></div>}
      </div>
    </div>
    {/* One gap under the header on every page (with or without tabs), so bodies never add their own top padding. */}
    <div className="h-4" aria-hidden />
    </div>
  );
}

/** The page column under the header: same width and gutters on every page. */
export function PageBody({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cx('mx-auto space-y-4 px-4 pb-10 sm:px-6 lg:px-8', wide ? 'max-w-none' : 'max-w-7xl', className)}>{children}</div>;
}

/** Secondary header buttons: in the row from `sm` up; behind a "More" (…) menu on phones, so the header never wraps
 *  into 3 rows. Pass plain buttons (they render in both places). */
export function HeaderMore({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="hidden sm:contents">{children}</div>
      <div className="sm:hidden">
        <Popover align="right" width={240} buttonLabel="More actions" closeOnSelect
          buttonClassName="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          button={<MoreHorizontal className="h-5 w-5" aria-hidden />}>
          <div className="flex flex-col gap-1 p-2 [&>*]:w-full [&>*]:justify-start">{children}</div>
        </Popover>
      </div>
    </>
  );
}
