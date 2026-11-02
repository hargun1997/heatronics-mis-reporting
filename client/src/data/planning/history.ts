// D2C history → the planner's customer model (seasonality, repeat rates, AOV).
//
// Two inputs, same fit:
//  • monthly totals (new buyers, repeat orders, sales by type) — the seed below is Shopify's
//    analytics "new vs returning" pulled on 2 Nov 2026; it fits the rates by least squares;
//  • order-level cohorts from the MIS's Shopify refresh (/api/planning/history) — repeat orders
//    by first-purchase month × months since — which measure each rate directly.
// Only aggregates are kept; no customer is stored anywhere.

import { toIndex, type D2CHistoryMonth, type D2CModel } from './engine';

export interface Cohort { month: string; size: number; repeats: number[] } // repeats[k] = repeat orders k months after the first

// Shopify analytics (heatronicss.myshopify.com). Sales = Shopify's average order value × orders, i.e. at
// order time, BEFORE returns / RTO — the same basis as the sheet, which has no returns line (after
// returns D2C realises ~18% less). Jun-26 new and Oct-26 returning AOV are Shopify glitches (a junk
// ₹180 Cr order, reversed) and use the neighbouring month. Nov-24 → Jul-25 are realised totals.
const RAW: [string, number, number, number, number][] = [
  // month, new orders, repeat orders, new sales, repeat sales
  ['2024-11', 4, 1, 2262, 566], ['2024-12', 35, 4, 58189, 6652], ['2025-01', 25, 2, 44341, 3547],
  ['2025-02', 47, 4, 93135, 7926], ['2025-03', 34, 0, 65493, 0], ['2025-04', 0, 3, 0, 3888],
  ['2025-05', 2, 1, 3851, 1925], ['2025-06', 0, 0, 0, 0], ['2025-07', 0, 0, 0, 0],
  ['2025-08', 67, 5, 85016, 6568], ['2025-09', 655, 65, 799015, 82334], ['2025-10', 1644, 189, 2408739, 292284],
  ['2025-11', 2946, 483, 4649150, 817040], ['2025-12', 3468, 652, 5739009, 1139361], ['2026-01', 3148, 588, 4986448, 958960],
  ['2026-02', 2245, 270, 3355146, 440988], ['2026-03', 1457, 167, 2195077, 255323], ['2026-04', 1197, 130, 1789292, 202577],
  ['2026-05', 993, 126, 1511133, 199763], ['2026-06', 615, 84, 1023591, 143918], ['2026-07', 708, 85, 1279331, 160524],
  ['2026-08', 490, 102, 873021, 197117], ['2026-09', 160, 54, 290258, 102802], ['2026-10', 167, 39, 342232, 74246],
];

export const SEED_HISTORY: D2CHistoryMonth[] = RAW.map(([month, n, r, ns, rs]) => ({
  month, newCustomers: n, repeatOrders: r, newSales: ns, repeatSales: rs,
}));
export const SEED_SOURCE = 'Shopify analytics — new vs returning orders and AOV by month (pulled 2 Nov 2026)';
export const SEED_AS_OF = '2026-11-02';

const addMonths = (ym: string, k: number) => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const cal = (ym: string) => Number(ym.slice(5)) - 1;

/**
 * Seasonality: new buyers by calendar month over the busiest 12 consecutive months, as a Jan..Dec
 * index. The busiest window skips spells where acquisition was paused (e.g. Sep–Oct '26), which
 * would otherwise read as "low season".
 */
export function learnSeason(h: D2CHistoryMonth[]): { season: number[]; window: string } {
  let best = -1, at = -1;
  for (let i = 0; i + 12 <= h.length; i++) {
    const t = h.slice(i, i + 12).reduce((a, x) => a + x.newCustomers, 0);
    if (t > best) { best = t; at = i; }
  }
  if (at < 0 || best <= 0) return { season: Array(12).fill(1), window: '' };
  const v = Array(12).fill(0);
  for (const x of h.slice(at, at + 12)) v[cal(x.month)] = x.newCustomers;
  return { season: toIndex(v), window: `${h[at].month} → ${h[at + 11].month}` };
}

function aov(h: D2CHistoryMonth[]) {
  const last = h.slice(-12);
  const ns = last.reduce((a, x) => a + x.newSales, 0), no = last.reduce((a, x) => a + x.newCustomers, 0);
  const rs = last.reduce((a, x) => a + x.repeatSales, 0), ro = last.reduce((a, x) => a + x.repeatOrders, 0);
  return { aovNew: no ? ns / no : 0, aovRepeat: ro ? rs / ro : no ? ns / no : 0 };
}

/** Predicted repeat orders per history month for given rates (same structure as the engine). */
export function predictRepeats(h: D2CHistoryMonth[], p: Pick<D2CModel, 'season' | 'sameMonth' | 'nextMonth' | 'monthly' | 'yearly' | 'yearlyFade'>): number[] {
  return h.map((x, i) => {
    const at = (k: number) => (i - k >= 0 ? h[i - k].newCustomers : 0);
    let r = p.sameMonth * at(0) + p.nextMonth * at(1);
    for (let k = 2; k <= 11; k++) r += p.monthly * at(k);
    for (let k = 12; k <= i; k++) r += p.yearly * Math.pow(p.yearlyFade, Math.floor(k / 12) - 1) * at(k);
    return r * (p.season[cal(x.month)] ?? 1);
  });
}

function r2Of(y: number[], yhat: number[]): number {
  const mean = y.reduce((a, x) => a + x, 0) / (y.length || 1);
  const sst = y.reduce((a, x) => a + (x - mean) ** 2, 0);
  const sse = y.reduce((a, x, i) => a + (x - yhat[i]) ** 2, 0);
  return sst > 0 ? 1 - sse / sst : 0;
}

/** Non-negative least squares by trying every subset of columns (3 columns → 7 fits). */
function nnls(X: number[][], y: number[]): number[] {
  const p = X[0]?.length ?? 0;
  let best: { sse: number; c: number[] } | null = null;
  for (let mask = 1; mask < 1 << p; mask++) {
    const cols = [...Array(p).keys()].filter((j) => mask & (1 << j));
    const A = cols.map((a) => cols.map((b) => X.reduce((s, r) => s + r[a] * r[b], 0)));
    const v = cols.map((a) => X.reduce((s, r, i) => s + r[a] * y[i], 0));
    const sol = solve(A, v);
    if (!sol || sol.some((x) => x < 0)) continue;
    const c = Array(p).fill(0);
    cols.forEach((j, i) => { c[j] = sol[i]; });
    const sse = X.reduce((s, r, i) => s + (y[i] - r.reduce((t, x, j) => t + x * c[j], 0)) ** 2, 0);
    if (!best || sse < best.sse) best = { sse, c };
  }
  return best?.c ?? Array(p).fill(0);
}
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    if (Math.abs(M[piv][i]) < 1e-12) return null;
    [M[i], M[piv]] = [M[piv], M[i]];
    for (let r = 0; r < n; r++) if (r !== i) {
      const f = M[r][i] / M[i][i];
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

export interface FitResult {
  season: number[]; sameMonth: number; nextMonth: number; monthly: number; yearly: number; yearlyFade: number;
  aovNew: number; aovRepeat: number; r2: number; note: string;
}

/**
 * Learn the D2C customer model. With order-level cohorts each rate is measured directly
 * (repeat orders ÷ season-weighted buyers who could have made them); without, the three rates are
 * least-squares fitted to the monthly repeat totals. The yearly (12+ months) rate falls back to the
 * months 2–11 rate when no cohort is old enough yet.
 */
export function fitD2C(history: D2CHistoryMonth[], cohorts?: Cohort[]): FitResult {
  const h = history;
  const { season, window } = learnSeason(h);
  const { aovNew, aovRepeat } = aov(h);
  const S = (ym: string) => season[cal(ym)] ?? 1;
  const yearlyFade = 0.8;
  let sameMonth = 0, nextMonth = 0, monthly = 0, yearly: number | null = null;
  let how = '';

  if (cohorts?.length) {
    const last = h[h.length - 1]?.month ?? cohorts[cohorts.length - 1].month;
    const rate = (k0: number, k1: number) => {
      let num = 0, den = 0;
      for (const c of cohorts) for (let k = k0; k <= k1; k++) {
        const ym = addMonths(c.month, k);
        if (ym > last) break;
        num += c.repeats[k] ?? 0;
        den += c.size * S(ym);
      }
      return den > 0 ? num / den : null;
    };
    sameMonth = rate(0, 0) ?? 0;
    nextMonth = rate(1, 1) ?? 0;
    monthly = rate(2, 11) ?? 0;
    yearly = rate(12, 120);
    how = `Measured from ${cohorts.reduce((a, c) => a + c.size, 0).toLocaleString('en-IN')} first-time buyers in ${cohorts.length} monthly cohorts`;
  } else {
    const rows: number[][] = [], y: number[] = [];
    h.forEach((x, i) => {
      if (x.newCustomers + x.repeatOrders === 0) return;
      const at = (k: number) => (i - k >= 0 ? h[i - k].newCustomers : 0);
      let older = 0;
      for (let k = 2; k <= 11; k++) older += at(k);
      const s = S(x.month);
      rows.push([s * at(0), s * at(1), s * older]);
      y.push(x.repeatOrders);
    });
    [sameMonth, nextMonth, monthly] = rows.length >= 6 ? nnls(rows, y) : [0, 0, 0];
    how = `Fitted to ${rows.length} months of new vs repeat orders`;
  }
  const observedYearly = yearly != null;
  const fit = {
    season, sameMonth, nextMonth, monthly, yearly: yearly ?? monthly, yearlyFade,
  };
  const r2 = r2Of(h.map((x) => x.repeatOrders), predictRepeats(h, fit));
  const note = `${how}. Seasonality from new buyers ${window || '(not enough history — flat)'}. ${observedYearly ? 'Year-2 returns measured.' : 'No cohort is a year old in a full season yet, so year-2+ returns assume the months 2–11 rate — set it yourself if you expect more winter re-buys.'}`;
  return { ...fit, aovNew, aovRepeat, r2, note };
}

/** A D2C model from a fit (cohort mode on). */
export function d2cModelFrom(history: D2CHistoryMonth[], f: FitResult, source: string, asOf: string): D2CModel {
  return {
    mode: 'cohorts', season: f.season, sameMonth: f.sameMonth, nextMonth: f.nextMonth, monthly: f.monthly,
    yearly: f.yearly, yearlyFade: f.yearlyFade, repeatBoost: 1, aovNew: Math.round(f.aovNew), aovRepeat: Math.round(f.aovRepeat),
    history, source, asOf, fit: { r2: f.r2, note: f.note },
  };
}
