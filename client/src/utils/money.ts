// The one place that turns numbers into ₹ text on a page (UI pass, 22 Nov 2026). Before this, 17 files had their own
// `inr()` and the same amount showed as "₹1.2 L", "₹1.20 L" or "₹1,20,000" on different pages.
// Export builders (Excel, PDF, Tally XML, ICICI files) keep their own formats: those follow the file spec, not the screen.

/** Short ₹ for tiles, lists and pills: ₹4.67 Cr · ₹1.2 L · ₹61,727. Minus sign is "−". null → "—". */
export function inrShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  return `${s}₹${Math.round(a).toLocaleString('en-IN')}`;
}

/** Full ₹ in Indian grouping for tables and challans: ₹1,20,000. `abs` drops the sign (the column says Dr / Cr). */
export function inrFull(n: number | null | undefined, opts: { abs?: boolean; empty?: string } = {}): string {
  if (n == null || !Number.isFinite(n)) return opts.empty ?? '—';
  const v = Math.round(opts.abs ? Math.abs(n) : n);
  return `${v < 0 ? '−' : ''}₹${Math.abs(v).toLocaleString('en-IN')}`;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-21" → "21 Nov"; "2026-10" → "Oct 2026". Pages never show ISO dates. */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const mon = MON[Number(m[2]) - 1] ?? m[2];
  return m[3] ? `${Number(m[3])} ${mon}` : `${mon} ${m[1]}`;
}
