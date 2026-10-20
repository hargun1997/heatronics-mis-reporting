// App-wide "compact" density. One switch (in the top bar) that every page can
// read: compact = tighter rows, fewer secondary lines, sections start folded.
// Stored per browser; also mirrored as <html data-density="compact"> so plain
// CSS can react without the hook.

import { useSyncExternalStore } from 'react';

export type Density = 'comfortable' | 'compact';
const KEY = 'ui:density';
const listeners = new Set<() => void>();

function read(): Density {
  try {
    return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

let current: Density = read();
if (typeof document !== 'undefined') document.documentElement.dataset.density = current;

export function setDensity(d: Density) {
  current = d;
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* private mode */
  }
  document.documentElement.dataset.density = d;
  listeners.forEach((l) => l());
}

export function useDensity(): [Density, (d: Density) => void] {
  const d = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => 'comfortable' as Density,
  );
  return [d, setDensity];
}

/** Remembered open/closed state for a foldable section, keyed per page. */
export function readFold(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem('fold:' + key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}
export function writeFold(key: string, open: boolean) {
  try {
    localStorage.setItem('fold:' + key, open ? '1' : '0');
  } catch {
    /* private mode */
  }
}
