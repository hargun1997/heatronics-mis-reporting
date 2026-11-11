// The sub-tab a plan view shows, kept per viewer in localStorage (a convenience only). Pass 2, 11 Nov 2026.
import { useEffect, useState } from 'react';

const KEY = 'planning-subtabs-v1';
function read(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, string>; } catch { return {}; }
}

export function useSubTab<T extends string>(view: string, ids: readonly T[], first: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { const s = read()[view] as T | undefined; return s && ids.includes(s) ? s : first; });
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), [view]: v })); } catch { /* storage off: not kept */ } }, [view, v]);
  return [v, setV];
}

