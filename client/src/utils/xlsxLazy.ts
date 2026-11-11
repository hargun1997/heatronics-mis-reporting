// SheetJS (`xlsx`, about 420 kB) loads only when a file is read or written, not with the page.
// Call `await loadXlsx()` at the moment a file is read; sync helpers that run after it use `xlsx()`.
import type * as XLSXNS from 'xlsx';

export type Xlsx = typeof XLSXNS;

let mod: Xlsx | null = null;
let loading: Promise<Xlsx> | null = null;

/** Load SheetJS once. Later calls return the same module. */
export function loadXlsx(): Promise<Xlsx> {
  if (mod) return Promise.resolve(mod);
  loading ??= import('xlsx').then((m) => {
    mod = m as Xlsx;
    return mod;
  });
  return loading;
}

/** The loaded module. Throws when `loadXlsx()` did not run first (a code error, not a user error). */
export function xlsx(): Xlsx {
  if (!mod) throw new Error('Spreadsheet reader not loaded: call loadXlsx() first.');
  return mod;
}
