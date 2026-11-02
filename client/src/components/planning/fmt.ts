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
  A: '#f59e0b', D: '#fe4705', F: '#3b82f6', G: '#10b981', P: '#8b5cf6',
};
export const money = (v: number, d = 2) => (v < 0 ? '−' : '') + '₹' + cr(Math.abs(v), d) + ' Cr';
