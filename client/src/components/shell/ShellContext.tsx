import { createContext, useContext, useSyncExternalStore } from 'react';

export interface Shell { paletteOpen: boolean; openPalette: () => void; closePalette: () => void }
export const ShellContext = createContext<Shell>({ paletteOpen: false, openPalette: () => {}, closePalette: () => {} });
export const useShell = () => useContext(ShellContext);

// The page title for the phone top bar (MOBILE-BRIEF: one top bar on phones = Menu + page title). PageHeader sets it;
// the bar falls back to the sidebar label of the page.
let pageTitle: string | null = null;
const subs = new Set<() => void>();
export function setPageTitle(t: string | null) { pageTitle = t; subs.forEach((f) => f()); }
export function usePageTitle(): string | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => pageTitle, () => null);
}
