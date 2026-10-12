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
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/45 animate-fade-in" onClick={onClose} aria-hidden="true" />
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
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{subtitle}</div>
              )}
              {title && <div className="font-display text-lg font-bold text-slate-900 tracking-tight truncate">{title}</div>}
              {badges && <div className="flex flex-wrap gap-1.5 mt-2">{badges}</div>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/45 animate-fade-in" onClick={onClose} aria-hidden="true" />
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
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
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
}

export function Popover({ button, children, align = 'right', width = 288, buttonClassName, buttonLabel }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={buttonLabel}
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName}
      >
        {button}
      </button>
      {open && (
        <div
          className={`absolute z-40 mt-2 ${align === 'right' ? 'right-0' : 'left-0'} rounded-xl border border-slate-200 bg-white shadow-popover animate-pop-in`}
          style={{ width }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
