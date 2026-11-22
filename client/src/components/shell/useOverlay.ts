// Shared overlay behaviour for EVERY overlay in the MIS (GUIDE.md "Modal and drawer"): Esc closes the top overlay only,
// Tab stays inside, page scroll is locked, focus goes to `initialFocus` (else the panel) on open and back to the opener
// on close. Overlays stack: a modal may open over a drawer, and only the top one answers Esc and Tab.
import { useEffect, useRef, type RefObject } from 'react';

const stack: symbol[] = [];
/** Open popovers / menus: they sit above every overlay, so Esc closes them first. */
export const popovers = { open: 0 };
let lockCount = 0;
let savedOverflow = '';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useOverlay(open: boolean, panel: RefObject<HTMLElement | null>, onClose: () => void, opts: { initialFocus?: RefObject<HTMLElement | null> } = {}) {
  const close = useRef(onClose);
  close.current = onClose;
  const initial = opts.initialFocus;
  useEffect(() => {
    if (!open) return;
    const id = Symbol('overlay');
    stack.push(id);
    const before = document.activeElement as HTMLElement | null;
    if (lockCount++ === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    const t = window.setTimeout(() => {
      const target = initial?.current
        ?? panel.current?.querySelector<HTMLElement>('[data-autofocus]')
        ?? panel.current;
      target?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return; // only the top overlay answers
      if (e.key === 'Escape') { if (popovers.open > 0) return; e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      const inside = panel.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (--lockCount === 0) document.body.style.overflow = savedOverflow;
      if (before && document.contains(before)) before.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** True while any kit overlay is open (Popover uses it to step aside for Esc). */
export function overlayDepth(): number { return stack.length; }
