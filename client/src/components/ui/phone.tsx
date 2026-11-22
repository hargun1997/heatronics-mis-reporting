// Phone parts (MOBILE-BRIEF 22 Nov 2026, GUIDE.md "Phones"): small kit pieces so every page behaves the same below 640 px.
//   • ScrollBox        — a sideways scroll box for wide tables: edge fade + "Swipe for more" under it while more hides.
//   • FilterSheet      — on phones ONE "Filters" button (with the count of changed filters) that opens a bottom sheet;
//                        from 640 px up the filters show inline as before.
//   • SheetGrab        — the grab handle of a bottom sheet (overlays.tsx).
//   Hooks (useIsPhone, useScrollFade, useSwipeDown) live in components/shell/usePhone.ts.
import React, { useRef, useState } from 'react';
import { useIsPhone, useScrollFade } from '../shell/usePhone';
import { SlidersHorizontal } from 'lucide-react';
import { Modal } from './overlays';
import { cx } from '../shell/cx';

/** A wide table's box: scrolls sideways inside itself (never the page), fades at the edge that hides columns, and says
 *  "Swipe for more" under it on phones until the person scrolls to the end. Keep the first column sticky in the table. */
export function ScrollBox({ children, label = 'Table, scroll sideways for more', className }: { children: React.ReactNode; label?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const more = useScrollFade(ref);
  return (
    <div className="min-w-0">
      {/* Focusable so keyboard users can scroll it too (axe scrollable-region-focusable). */}
      <div ref={ref} tabIndex={0} role="region" aria-label={label} className={cx('scroll-fade overflow-x-auto', className)}>{children}</div>
      {more && <p className="mt-1 text-right text-xs font-medium text-slate-500 sm:hidden" aria-hidden>Swipe for more →</p>}
    </div>
  );
}

/** Filters: inline from 640 px up; on phones one "Filters" button + a bottom sheet. `keep` stays inline on phones too
 *  (at most one control: the period or a search box). Changes apply at once; "Apply" closes the sheet. */
export function FilterSheet({ children, keep, count = 0, title = 'Filters', className, desktop }: {
  children: React.ReactNode; keep?: React.ReactNode; count?: number; title?: string; className?: string;
  /** What shows from 640 px up, when it is not simply `keep` then `children` (e.g. another order). */
  desktop?: React.ReactNode;
}) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  if (!phone) return <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>{desktop ?? <>{keep}{children}</>}</div>;
  return (
    <div className="flex items-center gap-2">
      {keep && <div className="min-w-0 flex-1">{keep}</div>}
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className={cx('inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500', !keep && 'w-full justify-center')}>
        <SlidersHorizontal className="h-4 w-4" aria-hidden />{title}
        {count > 0 && <span className="rounded-full bg-slate-900 px-1.5 text-xs font-semibold tabular-nums text-white">{count}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}
        footer={<button type="button" onClick={() => setOpen(false)} className="btn-brand inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold">Apply</button>}>
        <div className="flex flex-col gap-4 [&_select]:w-full [&_select]:min-h-11">{children}</div>
      </Modal>
    </div>
  );
}

