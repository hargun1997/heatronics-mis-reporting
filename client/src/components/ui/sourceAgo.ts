/** "3 h ago" / "2 days ago" / "not read yet" — used by SourceChip and anywhere a number shows its age. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return 'not read yet';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'unknown';
  const h = Math.max(0, Math.round((now - t) / 3_600_000));
  if (h < 1) return 'just now';
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
