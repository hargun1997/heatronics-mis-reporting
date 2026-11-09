// Shared formatters and chart palette for the MIS deck charts (./charts.tsx) and the Live MIS views.

// ============================================================================
// Formatters
// ============================================================================

/** Format INR compactly: ₹1.23 Cr / ₹4.56 L / ₹789. */
export function inr(value: number, opts: { sign?: boolean } = {}): string {
  const sign = value < 0 ? '-' : opts.sign && value > 0 ? '+' : '';
  const a = Math.abs(value);
  let body: string;
  if (a >= 1e7) body = `₹${(a / 1e7).toFixed(2)} Cr`;
  else if (a >= 1e5) body = `₹${(a / 1e5).toFixed(2)} L`;
  else if (a >= 1e3) body = `₹${(a / 1e3).toFixed(1)}k`;
  else body = `₹${Math.round(a)}`;
  return sign + body;
}

/** Format INR in lakhs always (for axis ticks). */
export function inrLakh(value: number): string {
  return `${(value / 1e5).toFixed(value >= 1e7 ? 0 : 1)}L`;
}

/** Format a fraction as a percentage. */
export function pctStr(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !isFinite(value)) return '–';
  return `${(value * 100).toFixed(digits)}%`;
}

export function pctSigned(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !isFinite(value)) return '–';
  const s = value > 0 ? '+' : '';
  return `${s}${(value * 100).toFixed(digits)}%`;
}

// ============================================================================
// Palette
// ============================================================================

// Channel palette — one hue per channel, distinct in hue AND lightness, kept
// off brand orange (reserved for actions). Mirrors tailwind `channel.*`.
export const CHANNEL_COLORS: Record<string, string> = {
  OEM: '#2563EB',     // blue
  D2C: '#0E7490',     // cyan-700
  Amazon: '#D97706',  // amber-600
  Offline: '#7C3AED', // violet
  Blinkit: '#475569', // slate-600
  Export: '#DB2777',  // pink-600
};

// Neutral, categorical palette — deliberately avoids red/green value signalling.
export const SERIES_COLORS = ['#2563EB', '#0E7490', '#D97706', '#7C3AED', '#475569', '#DB2777'];
