// Phone hooks (MOBILE-BRIEF 22 Nov 2026, GUIDE.md "Phones"), shared by the kit parts in components/ui/phone.tsx:
//   • useIsPhone     — true below 640 px (Tailwind's `sm`).
//   • useScrollFade  — a sideways scroller gets a soft edge fade where more content hides; its open item scrolls in.
//   • useSwipeDown   — swipe a bottom sheet down to close it (Drawer, Modal).
import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const PHONE_Q = '(max-width: 639px)';

export function useIsPhone(): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_Q).matches;
  const [phone, setPhone] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(PHONE_Q);
    const on = () => setPhone(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return phone;
}

/** Sets data-fade="l" / "r" / "l r" on a sideways scroller (CSS in index.css draws the fade), and scrolls the element that
 *  matches `active` (e.g. `[aria-selected="true"]`) into view when `dep` changes. Returns true while content hides right. */
export function useScrollFade(ref: RefObject<HTMLElement | null>, opts: { active?: string; dep?: unknown } = {}): boolean {
  const [right, setRight] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const l = el.scrollLeft > 2;
      const r = max > 2 && el.scrollLeft < max - 2;
      const v = [l && 'l', r && 'r'].filter(Boolean).join(' ');
      if (v) el.setAttribute('data-fade', v); else el.removeAttribute('data-fade');
      setRight(r);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => { el.removeEventListener('scroll', update); ro?.disconnect(); };
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !opts.active) return;
    const a = el.querySelector<HTMLElement>(opts.active);
    if (!a || el.scrollWidth <= el.clientWidth) return;
    const box = el.getBoundingClientRect(), r = a.getBoundingClientRect();
    if (r.left < box.left || r.right > box.right) el.scrollLeft += r.left - box.left - 16;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.dep, opts.active]);
  return right;
}

/** Swipe a bottom sheet down to close it (phones only). Attach `bind` to the grab area (handle + header). */
export function useSwipeDown(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  const start = useRef<number | null>(null);
  const dy = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => {
    if (typeof window !== 'undefined' && !window.matchMedia(PHONE_Q).matches) return;
    start.current = e.touches[0].clientY; dy.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (start.current == null || !panel.current) return;
    dy.current = Math.max(0, e.touches[0].clientY - start.current);
    panel.current.style.setProperty('transform', `translateY(${dy.current}px)`);
  };
  const onTouchEnd = () => {
    if (start.current == null || !panel.current) return;
    start.current = null;
    panel.current.style.removeProperty('transform');
    if (dy.current > 80) onClose();
  };
  return { onTouchStart, onTouchMove, onTouchEnd };
}

