/** Formatters + chart palette shared by the Live MIS views (kept out of charts.tsx so that file only exports components). */

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

// Ember chart palette (design-system/EMBER.md): obsidian series, grey comparison, ONE heat highlight;
// extra categories are obsidian tints. Theme tokens (--chart-*, src/index.css), so light / dark both read.
// Mirrors tailwind `channel.*` / `chart.*`.
export const CHART = {
  ink: 'rgb(var(--chart-ink))', c2: 'rgb(var(--chart-2))', c3: 'rgb(var(--chart-3))', c4: 'rgb(var(--chart-4))',
  c5: 'rgb(var(--chart-5))', cmp: 'rgb(var(--chart-cmp))', heat: 'rgb(var(--chart-heat))',
} as const;
export const CHANNEL_COLORS: Record<string, string> = {
  OEM: CHART.c2,
  D2C: CHART.ink,
  Amazon: CHART.heat, // the biggest channel = the one heat series
  Offline: CHART.c3,
  Blinkit: CHART.c4,
  Export: CHART.c5,
};

// Categorical series: obsidian first, heat third (the usual "watch this one" line), then tints.
export const SERIES_COLORS = [CHART.ink, CHART.c2, CHART.heat, CHART.c3, CHART.c4, CHART.c5];

// Directional bars: obsidian for up, comparison grey for down (no red/green).
export const POS_COLOR = CHART.ink;
export const NEG_COLOR = CHART.cmp;
