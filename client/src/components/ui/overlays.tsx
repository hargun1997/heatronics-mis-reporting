// ----------------------------------------------------------------------------
// Overlay layer — the redesign's three layering primitives:
//   • Drawer  — a record's full detail; slides in over a dimmed canvas.
//   • Modal   — a focused decision; centered, blocks the page until resolved.
//   • Popover — a light anchored layer (filter, menu); dismiss on outside click.
// All portal to <body>, trap Escape, and restore scroll on close.
// ----------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const iconX = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
  </svg>
);

function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

// ---------------------------------------------------------------------------
// Drawer
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
  children: React.ReactNode;
}

export function Drawer({
  open, onClose, title, subtitle, icon, badges, footer, side = 'right', width = 460, children,
}: DrawerProps) {
  useDismiss(open, onClose);
  if (!open) return null;

  const sideCls = side === 'right'
    ? 'right-0 shadow-drawer animate-drawer-in-right'
    : 'left-0 shadow-drawer-left animate-drawer-in-left';

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-scrim/45 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        className={`absolute top-0 bottom-0 ${sideCls} bg-white flex flex-col max-w-[calc(100vw-2rem)]`}
        style={{ width }}
      >
        {(title || icon) && (
          <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-200">
            {icon && (
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
                {icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {subtitle && (
                <div className="text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-slate-400">{subtitle}</div>
              )}
              {title && <div className="font-display text-lg font-bold text-slate-900 tracking-tight truncate">{title}</div>}
              {badges && <div className="flex flex-wrap gap-1.5 mt-2">{badges}</div>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            >
              {iconX}
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-slate-200 px-5 py-3.5 bg-slate-50/60">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, subtitle, icon, footer, width = 520, children }: ModalProps) {
  useDismiss(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim/45 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full bg-white rounded-2xl shadow-overlay overflow-hidden animate-scale-in max-h-[calc(100vh-2rem)] flex flex-col"
        style={{ maxWidth: width }}
      >
        {(title || icon) && (
          <div className="flex items-start gap-3 px-6 py-4 border-b border-slate-200">
            {icon && (
              <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center flex-shrink-0">
                {icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {title && <div className="font-display text-lg font-bold text-slate-900 tracking-tight">{title}</div>}
              {subtitle && <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              {iconX}
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="border-t border-slate-200 px-6 py-3.5 bg-slate-50/60 flex items-center justify-end gap-2.5">
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
}

export function Popover({ button, children, align = 'right', width = 288, buttonClassName, buttonLabel, closeOnSelect }: PopoverProps) {
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
        aria-haspopup="dialog"
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
          role="dialog"
          aria-label={buttonLabel}
          onClick={closeOnSelect ? (e) => { if ((e.target as HTMLElement).closest('button, a')) setOpen(false); } : undefined}
          onBlur={(e) => {
            // Focus left the panel: close it and go back to the button, so keyboard order stays the same.
            if (!panel.current?.contains(e.relatedTarget as Node) && e.relatedTarget !== btn.current && e.relatedTarget) {
              setOpen(false);
              btn.current?.focus();
            }
          }}
          className="fixed z-[110] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-popover animate-pop-in"
          style={{ width: Math.min(width, window.innerWidth - 16), top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxH, visibility: pos ? 'visible' : 'hidden' }}
        >
          {children}
        </div>,
        document.body,
      )}
    </div>
  );
}
