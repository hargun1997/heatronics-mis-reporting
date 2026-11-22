// ----------------------------------------------------------------------------
// Overlay layer (GUIDE.md "Modal and drawer", "Menus, tips and toasts"); the ONE place that builds overlays:
//   • Drawer  — a record's full detail; slides in over a dimmed canvas.
//   • Modal   — a focused decision; centered, blocks the page until resolved.
//   • Popover — a light anchored layer (filter, menu); dismiss on outside click.
// All portal to <body>. Drawer and Modal use useOverlay (Esc, focus trap, focus return, scroll lock, stacking).
// Confirm, prompt and Toast live in feedback.tsx; Menu = <Popover kind="menu">.
// ----------------------------------------------------------------------------

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { popovers, useOverlay } from '../shell/useOverlay';
import { useSwipeDown } from '../shell/usePhone';


const iconX = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
  </svg>
);

// ---------------------------------------------------------------------------
// Drawer (GUIDE.md "Modal and drawer"): row detail, long forms, "Show all". 420 or 720 wide, floats 12 from the edge;
// a bottom sheet on phones. Esc and the scrim close it. Focus moves in, stays in and goes back to the opener.
// ---------------------------------------------------------------------------

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badges?: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'right' | 'left';
  width?: number;
  /** Screen-reader name when there is no visible title. */
  label?: string;
  children: React.ReactNode;
}

/** The grab handle at the top of a bottom sheet (phones only). */
export function SheetGrab() {
  return <div className="flex justify-center pb-1 pt-2 sm:hidden" aria-hidden><span className="h-1 w-10 rounded-full bg-slate-300" /></div>;
}

const CLOSE_BTN = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';

export function Drawer({
  open, onClose, title, subtitle, icon, badges, footer, side = 'right', width = 460, label, children,
}: DrawerProps) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  useOverlay(open, panel, onClose);
  const swipe = useSwipeDown(panel, onClose);
  if (!open) return null;

  const sideCls = side === 'right'
    ? 'sm:right-3 sm:animate-drawer-in-right'
    : 'sm:left-3 sm:animate-drawer-in-left';

  return createPortal(
    <div className="fixed inset-0 z-drawer">
      <div className="absolute inset-0 bg-scrim/40 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        className={`absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-pop outline-none animate-sheet-in sm:inset-x-auto sm:bottom-3 sm:top-3 sm:max-h-none sm:w-[var(--dw)] sm:max-w-[calc(100vw-1.5rem)] sm:rounded-xl ${sideCls}`}
        style={{ ['--dw' as string]: `${width}px` }}
      >
        <div {...swipe}>
        <SheetGrab />
        {(title || icon) && (
          <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 max-sm:pt-2">
            {icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {title && <h2 id={titleId} className="truncate text-lg font-semibold text-slate-900">{title}</h2>}
              {subtitle && <div className="mt-0.5 text-label text-slate-500">{subtitle}</div>}
              {badges && <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className={CLOSE_BTN}>{iconX}</button>
          </div>
        )}
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-slate-200 px-5 py-3.5">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Modal (GUIDE.md "Modal and drawer"): a decision or a short form. 400, 520 or 720 wide; a bottom sheet on phones.
// Esc closes; the scrim closes it too unless `dirty` (unsaved input). Footer: Cancel, then the main button last.
// ---------------------------------------------------------------------------

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  /** Unsaved input: a click on the scrim does not close it. */
  dirty?: boolean;
  label?: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, subtitle, icon, footer, width = 520, dirty, label, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, panel, onClose);
  const swipe = useSwipeDown(panel, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-scrim/40 animate-fade-in" onClick={dirty ? undefined : onClose} aria-hidden="true" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-pop outline-none animate-sheet-in sm:max-h-[calc(100vh-2rem)] sm:max-w-[var(--mw)] sm:rounded-xl sm:animate-scale-in"
        style={{ ['--mw' as string]: `${width}px` }}
      >
        <div {...swipe}>
        <SheetGrab />
        {(title || icon) && (
          <div className="flex items-start gap-3 border-b border-slate-200 px-6 py-4 max-sm:px-5 max-sm:pt-2">
            {icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {title && <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>}
              {subtitle && <div className="mt-0.5 text-label text-slate-500">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className={CLOSE_BTN}>{iconX}</button>
          </div>
        )}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 max-sm:px-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-200 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Popover — anchored, non-blocking. `button` is the trigger content (plain
// content or an element, never a nested <button>).
// ---------------------------------------------------------------------------

interface PopoverProps {
  button: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: number;
  buttonClassName?: string;
  buttonLabel?: string;
  /** Close after a button or link inside the panel is selected (menus). */
  closeOnSelect?: boolean;
  /** 'menu' = a list of actions (role menu, ↑ ↓ move between items); default 'dialog' = a note or a small form. */
  kind?: 'dialog' | 'menu';
}

export function Popover({ button, children, align = 'right', width = 288, buttonClassName, buttonLabel, closeOnSelect, kind = 'dialog' }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  // The panel renders in a portal with fixed coordinates, so a scroll area (drawer, table) never clips it.
  // It opens below the button, or above when there is more room there, and stays inside the window.
  const place = React.useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth, vh = window.innerHeight, gap = 8, edge = 8;
    const w = Math.min(width, vw - edge * 2);
    let left = align === 'right' ? b.right - w : b.left;
    left = Math.max(edge, Math.min(left, vw - w - edge));
    const below = vh - b.bottom - gap - edge, above = b.top - gap - edge;
    const h = panel.current?.offsetHeight ?? 0;
    const up = h > below && above > below;
    const maxH = Math.max(160, up ? above : below);
    const top = up ? Math.max(edge, b.top - gap - Math.min(h, maxH)) : b.bottom + gap;
    setPos({ top, left, maxH });
  }, [align, width]);

  useEffect(() => {
    if (!open) return;
    popovers.open++;
    let raf2 = 0;
    const raf = requestAnimationFrame(() => { place(); raf2 = requestAnimationFrame(place); }); // 2nd pass: the panel has its height
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // close the popover only, not the drawer or modal under it
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      popovers.open--;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        ref={btn}
        type="button"
        aria-haspopup={kind}
        aria-expanded={open}
        aria-label={buttonLabel}
        onClick={() => { setPos(null); setOpen((o) => !o); }}
        onKeyDown={(e) => {
          // Tab from the button goes into the panel (it sits at the end of <body>).
          if (open && e.key === 'Tab' && !e.shiftKey && panel.current) {
            const first = panel.current.querySelector<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (first) { e.preventDefault(); first.focus(); }
          }
        }}
        className={buttonClassName}
      >
        {button}
      </button>
      {open && createPortal(
        <div
          ref={panel}
          role={kind}
          aria-label={buttonLabel}
          onKeyDown={kind === 'menu' ? (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
            if (!items.length) return;
            e.preventDefault();
            const i = items.indexOf(document.activeElement as HTMLElement);
            items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
          } : undefined}
          onClick={closeOnSelect ? (e) => { if ((e.target as HTMLElement).closest('button, a')) setOpen(false); } : undefined}
          onBlur={(e) => {
            // Focus left the panel: close it and go back to the button, so keyboard order stays the same.
            if (!panel.current?.contains(e.relatedTarget as Node) && e.relatedTarget !== btn.current && e.relatedTarget) {
              setOpen(false);
              btn.current?.focus();
            }
          }}
          className="fixed z-pop overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-pop animate-pop-in"
          style={{ width: Math.min(width, window.innerWidth - 16), top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxH, visibility: pos ? 'visible' : 'hidden' }}
        >
          {children}
        </div>,
        document.body,
      )}
    </div>
  );
}
