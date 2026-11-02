// Per-browser shell preferences (localStorage, every access in try/catch: private windows and blocked
// storage just fall back to defaults). Pins + recents + theme are conveniences, never data.
import { useCallback, useEffect, useState } from 'react';

export const K = { collapsed: 'mis.nav.collapsed', theme: 'mis.theme', pins: 'mis.nav.pins', recents: 'mis.nav.recents' } as const;
export const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
export interface Saved { href: string; label: string; context?: string | null }
const EVT = 'mis:prefs';

function readList(k: string): Saved[] {
  try {
    const v = JSON.parse(store.get(k) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.href === 'string' && typeof x.label === 'string') : [];
  } catch { return []; }
}
function writeList(k: string, list: Saved[]) {
  store.set(k, JSON.stringify(list));
  try { window.dispatchEvent(new Event(EVT)); } catch { /* ignore */ }
}

export const MAX_PINS = 8;
export const MAX_RECENTS = 8;

/** Pinned pages (sidebar top + palette). */
export function usePins() {
  const [pins, set] = useState<Saved[]>(() => readList(K.pins));
  useEffect(() => {
    const r = () => set(readList(K.pins));
    window.addEventListener(EVT, r); window.addEventListener('storage', r);
    return () => { window.removeEventListener(EVT, r); window.removeEventListener('storage', r); };
  }, []);
  const isPinned = useCallback((href: string) => pins.some((p) => p.href === href), [pins]);
  const toggle = useCallback((s: Saved) => {
    const cur = readList(K.pins);
    writeList(K.pins, cur.some((p) => p.href === s.href) ? cur.filter((p) => p.href !== s.href) : [...cur, s].slice(-MAX_PINS));
  }, []);
  return { pins, isPinned, toggle };
}

/** Recently opened pages (palette, newest first). */
export function useRecents() {
  const [recents, set] = useState<Saved[]>(() => readList(K.recents));
  useEffect(() => {
    const r = () => set(readList(K.recents));
    window.addEventListener(EVT, r);
    return () => window.removeEventListener(EVT, r);
  }, []);
  return recents;
}
export function pushRecent(s: Saved) {
  const cur = readList(K.recents).filter((p) => p.href !== s.href);
  writeList(K.recents, [s, ...cur].slice(0, MAX_RECENTS));
}

export type Theme = 'system' | 'light' | 'dark';
// Light unless someone picks Dark (or System) with the theme button.
function readTheme(): Theme { const t = store.get(K.theme); return t === 'dark' || t === 'system' ? t : 'light'; }
/** Applied before React renders (main.tsx) so there is no flash. */
export function applyStoredTheme() {
  const t = readTheme();
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const apply = useCallback((n: Theme) => {
    if (n === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = n;
    store.set(K.theme, n);
    setTheme(n);
    try { window.dispatchEvent(new Event(EVT)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    const r = () => setTheme(readTheme());
    window.addEventListener(EVT, r);
    return () => window.removeEventListener(EVT, r);
  }, []);
  const next = useCallback(() => apply(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'), [apply, theme]);
  return { theme, next, set: apply };
}
