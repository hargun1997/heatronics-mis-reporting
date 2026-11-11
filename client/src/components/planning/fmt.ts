import type { Channel } from '../../data/planning/engine';

export const cr = (v: number, d = 2) => {
  const x = v / 1e7;
  if (Math.abs(x) < 0.005) return '0';
  return (x < 0 ? '−' : '') + Math.abs(x).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const lakh = (v: number) => {
  const x = v / 1e5;
  if (Math.abs(x) < 0.05) return '–';
  return (x < 0 ? '−' : '') + Math.abs(x).toLocaleString('en-IN', { maximumFractionDigits: 1 });
};
export const pct = (v: number, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + '%' : '–');
export const int = (v: number) => Math.round(v).toLocaleString('en-IN');
export const tone = (v: number) => (v < 0 ? 'text-rose-600' : 'text-slate-900');

export const CH_COLOR: Record<Channel, string> = {
  // Ember chart palette (theme tokens): Amazon = the one heat series, the rest obsidian tints.
  A: 'rgb(var(--chart-heat))', D: 'rgb(var(--chart-ink))', F: 'rgb(var(--chart-3))', G: 'rgb(var(--chart-2))', P: 'rgb(var(--chart-4))',
};
export const money = (v: number, d = 2) => (v < 0 ? '−' : '') + '₹' + cr(Math.abs(v), d) + ' Cr';
