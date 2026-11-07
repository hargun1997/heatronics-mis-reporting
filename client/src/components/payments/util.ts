// Browser helpers for the Bulk payments page (localStorage with try/catch, dates).

export function readLocal(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}
export function writeLocal(key: string, v: string): void {
  try { localStorage.setItem(key, v); } catch { /* private mode */ }
}

export const fmtWhen = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
