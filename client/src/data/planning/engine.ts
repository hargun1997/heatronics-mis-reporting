// ----------------------------------------------------------------------------
// 5-year planner engine — a port of the Google Sheet "Heatronics Projection and
// Deployment Plan" (Revenue Planning → Expense Calendar → P&L → Cash Flow &
// Fundraise), extended from 18 months to Mar-31 (FY27–FY31) with levers.
//
// Pure functions, no I/O. server/test/planning.test.ts proves that with the levers
// at their neutral values the first 18 months give the sheet's own numbers.
//
// Month index m is 1-based: m = 1 is the plan's startMonth (Oct-26).
// B = months in the imported base (18). Months after B are the extension:
//   • units  = the same month a year earlier × (1 + that channel's growth for the FY)
//   • a cost line marked "repeat" runs as it did in the same calendar month of the
//     base's last 12 months (Apr-27 → Mar-28), so seasonal rates (peak COGS, peak
//     ROAS, winter campaigns) carry on every year; fixed amounts get inflation.
// ----------------------------------------------------------------------------

export type Channel = 'A' | 'D' | 'F' | 'G' | 'P';
export const CHANNELS: Channel[] = ['A', 'D', 'F', 'G', 'P'];
export const CHANNEL_NAMES: Record<Channel, string> = {
  A: 'Amazon', D: 'D2C', F: 'Flipkart', G: 'General Trade', P: 'Physio / Clinic',
};

export type Section = 'revex' | 'opex' | 'capex' | 'finex';

export interface Sku { id: string; name: string; asp: number }

/** A cost line, same grammar as the sheet's Expense Calendar. */
export interface ExpenseLine {
  id: string;
  name: string;
  section: Section;
  group: string;
  /** Monthly | Quarterly | One Time | Annual | % of Revenue | % of Amazon Rev | % of D2C Rev |
   *  % of Flipkart Rev | % of GT Rev | % of Physio Rev | ROAS on Amazon | ROAS on D2C | ROAS on Flipkart */
  type: string;
  amount: number;
  start: number;
  /** null = runs to the end of the horizon */
  end: number | null;
  theme?: string | null;
  milestone?: string | null;
  /** After the base, repeat the base's last 12 months for this line (default: all but one-offs). */
  repeat?: boolean;
  /** Switched off in this scenario. */
  off?: boolean;
}

export interface CashInputs {
  outputGst: number; inputGstGoods: number; inputGstServices: number; refundLagMonths: number;
  gstWriteOffPct: number; gmStandard: number; inventoryDays: number; openingInventory: number;
  receivableDays: number; payableDays: number; interestRate: number; openingDebt: number;
  /** interest rate from a month onwards (each step holds until the next) */
  interestSteps: { month: number; rate: number }[];
  openingCash: number; contingencyPct: number; taxRate: number;
}

export interface CashEvent { id: string; kind: 'equity' | 'debtDrawn' | 'debtRepaid'; month: number; amount: number; note: string }

/** A product added in the planner (e.g. topicals) — not in the sheet's unit grid. */
export interface NewProduct {
  id: string;
  name: string;
  on: boolean;
  asp: number;
  launchMonth: number;
  /** units a month at launch, all channels */
  launchUnits: number;
  /** month-on-month growth for the first 12 months after launch */
  rampPct: number;
  /** year-on-year growth after the first 12 months */
  steadyPct: number;
  /** share of units by channel, sums to 1 */
  split: Record<Channel, number>;
  /** this product's own raw-material cost as % of its revenue (else the plan's COGS % lines apply) */
  cogsPct: number | null;
  /** seasonality to apply: 'flat', or a SKU id whose curve it borrows */
  seasonRef?: string;
}

/** One month of D2C order history (aggregates only — no customer data). */
export interface D2CHistoryMonth {
  month: string; // YYYY-MM
  newCustomers: number;
  repeatOrders: number;
  newSales: number;
  repeatSales: number;
}

/**
 * D2C as customers: new buyers × AOV, plus repeat orders from everyone who bought before.
 * Repeat orders in a month = season(month) × boost × (
 *     sameMonth × new buyers this month
 *   + nextMonth × new buyers last month
 *   + monthly   × new buyers 2–11 months ago
 *   + yearly × fade^(years−1) × new buyers 12+ months ago )
 * The rates are learned from Shopify order history (see history.ts) and can be overridden.
 */
export interface D2CModel {
  mode: 'units' | 'cohorts';
  /** Jan..Dec index, mean 1 */
  season: number[];
  sameMonth: number;
  nextMonth: number;
  monthly: number;
  yearly: number;
  yearlyFade: number;
  /** scale every repeat rate (loyalty, hCoins, reminders): 1 = as learned */
  repeatBoost: number;
  /** realised order value (after returns / RTO), ₹ incl. GST */
  aovNew: number;
  aovRepeat: number;
  history: D2CHistoryMonth[];
  source: string;
  asOf: string;
  /** how the rates were set: 'learned' from history, or 'edited' */
  fit: { r2: number | null; note: string };
}

export interface Levers {
  /** Horizon in months from startMonth (54 = Oct-26 → Mar-31). */
  horizon: number;
  /** Year-on-year unit growth by channel for each FY after the base, e.g. { FY29: {A: .5, …} }. */
  growth: Record<string, Record<Channel, number>>;
  /** Stretch / shrink the 18-month unit plan per channel (1 = as planned). */
  baseVolume: Record<Channel, number>;
  /** Price change per year after the base. */
  aspGrowthPct: number;
  /** Raw-material % of revenue moves by this many points per year after the base (−0.005 = 0.5 pt cheaper). */
  cogsDeltaPerYear: number;
  /** ROAS gets this much better (or worse, negative) per year after the base. */
  roasGainPct: number;
  /** Inflation on fixed costs per year after the base. */
  inflationPct: number;
  /** Extra growth in people cost (salaries, factory payroll, benefits) per year after the base. */
  teamGrowthPct: number;
  /** If > 0: after the base, brand + creative spend = this % of revenue instead of the fixed lines. */
  brandPctOfRevenue: number;
  /** 'sheet' = tax each profitable month (as the sheet); 'fy' = per FY with losses carried forward. */
  taxMode: 'sheet' | 'fy';
  /** Apr–Sep '26 actuals (₹), so FY27 shows the whole year. */
  fy27H1Revenue: number;
  fy27H1Ebitda: number;
  /** After the base: 'plan' = repeat the sheet's last-year month shape; 'history' = last FY's total × growth spread by each SKU's seasonality. */
  seasonShape?: 'plan' | 'history';
}

/** The sheet's Business Plan + Overview: words, milestones and the few inputs they hold. */
export interface BusinessPlan {
  assumptions: { id: string; assumption: string; value: string; basis: string }[];
  risks: { id: string; risk: string; mitigation: string }[];
  /** themes & milestones; a cost line tagged with a milestone counts as deployment against it */
  themes: { id: string; theme: string; milestone: string; month: number }[];
  team: string;
  /** contingency buffer on the 12-month peak deficit (the 18-month one is cash.contingencyPct) */
  contingency12: number;
  /** revenue of the 3 months a year before the 12M exit (Jul–Sep '26 actual), for Exit ARR */
  exitPriorL3M: number;
  exitGrowthCap: number;
}

export interface Plan {
  version: 1;
  name: string;
  source?: string;
  startMonth: string; // YYYY-MM
  channels: Channel[];
  skus: Sku[];
  /** base unit grid: units[m][sku][channel] = [lastYear, missed, growth] */
  units: number[][][][];
  groups: { name: string; section: Section }[];
  lines: ExpenseLine[];
  cash: CashInputs;
  events: CashEvent[];
  products: NewProduct[];
  levers: Levers;
  /** Jan..Dec seasonality index per SKU id (mean 1), learned from last year's actual units */
  skuSeason: Record<string, number[]>;
  d2c: D2CModel;
  business: BusinessPlan;
}

// ---- calendar helpers ------------------------------------------------------------

export function monthLabel(startMonth: string, m: number): string {
  const [y, mo] = startMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + (m - 1), 1));
  return d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) + '-' + String(d.getUTCFullYear()).slice(2);
}

/** Calendar month of m, 0 = Jan. */
export function calOf(startMonth: string, m: number): number {
  const [, mo] = startMonth.split('-').map(Number);
  return (mo - 1 + (m - 1)) % 12;
}

/** Normalise 12 numbers to mean 1 (flat if they are all zero). */
export function toIndex(v: number[]): number[] {
  const mean = v.reduce((a, x) => a + x, 0) / 12;
  return mean > 0 ? v.map((x) => x / mean) : Array(12).fill(1);
}

/** Indian FY of month m, e.g. "FY27" for Apr-26 … Mar-27. */
export function fyOf(startMonth: string, m: number): string {
  const [y, mo] = startMonth.split('-').map(Number);
  const abs = y * 12 + (mo - 1) + (m - 1);
  const yr = Math.floor(abs / 12), mon = abs % 12; // mon 0 = Jan
  return 'FY' + String((mon >= 3 ? yr + 1 : yr) % 100).padStart(2, '0');
}

// ---- results ---------------------------------------------------------------------

export interface MonthResult {
  m: number;
  label: string;
  fy: string;
  units: number;
  unitsBySku: Record<string, number>;
  revenueByChannel: Record<Channel, number>;
  revenueBySku: Record<string, number>;
  grossRevenue: number;
  /** D2C customer view (cohort mode; zeros in units mode) */
  d2cNewCustomers: number;
  d2cRepeatOrders: number;
  d2cNewRevenue: number;
  d2cRepeatRevenue: number;
  /** expense per group name (positive = cost) */
  groups: Record<string, number>;
  /** expense per line id */
  lines: Record<string, number>;
  revenueDeductions: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  gstWrittenOff: number;
  cm1: number; cm2: number; cm3: number;
  opex: number;
  ebitda: number;
  da: number;
  ebit: number;
  interest: number;
  banking: number;
  fundraiseCosts: number;
  pbt: number;
  tax: number;
  pat: number;
  capex: number;
  // cash — GST schedule (inverted duty)
  taxableTurnover: number;
  outputGst: number;
  itcGoods: number;
  itcServices: number;
  gstSetOffServices: number;
  gstSetOffGoods: number;
  gstClaimable: number;
  gstStuck: number;
  gstAsset: number;
  gstRefund: number;
  stdCogs: number;
  inventory: number;
  inventoryPurchase: number;
  receivables: number;
  payables: number;
  nwc: number;
  nwcChange: number;
  debt: number;
  netCashFlow: number;
  cumulativeCash: number;
  equity: number;
  debtNet: number;
  closingCash: number;
}

export interface YearResult {
  fy: string;
  months: number;
  units: number;
  revenue: number;
  revenueByChannel: Record<Channel, number>;
  d2cNewCustomers: number;
  d2cRepeatOrders: number;
  d2cNewRevenue: number;
  d2cRepeatRevenue: number;
  grossProfit: number;
  cm3: number;
  ebitda: number;
  pat: number;
  capex: number;
  netCashFlow: number;
  closingCash: number;
  endDebt: number;
  /** plan revenue + the H1 actuals entered (FY27 only) */
  revenueWithActuals: number;
  ebitdaWithActuals: number;
}

export interface PlanResult {
  months: MonthResult[];
  years: YearResult[];
  peakDeficit: number;
  peakDeficitMonth: number;
  fundingRequired: number;
  debtDrawnTotal: number;
  equityRequired: number;
  equityPlanned: number;
  minClosingCash: number;
  minClosingCashMonth: number;
  base: number;
}

const zeroCh = (): Record<Channel, number> => ({ A: 0, D: 0, F: 0, G: 0, P: 0 });

/** Groups whose lines are purchases of goods (ITC refundable) — the sheet's H3 + H8. */
const GOODS_GROUPS = new Set(['Raw Material & Packaging', 'Inward Logistics']);
/** Groups that carry input GST on services & capex — the sheet's row 11. */
const SERVICE_GROUPS = new Set([
  'Manufacturing Overhead', 'Channel Commission', 'Fulfilment & Delivery', 'Payment & Collection',
  'Performance Marketing', 'Marketing Production & Creative', 'Brand Marketing', 'Recruitment & Training',
  'Product Development & Launch', 'Rent & Facilities', 'Utilities & Power', 'Repairs & Maintenance',
  'Compliance & Certification', 'Technology & Software', 'Professional Fees', 'Travel & Communication',
  'Office & Administration',
]);
const COGS_GROUPS = ['Raw Material & Packaging', 'Inward Logistics', 'Factory Payroll', 'Manufacturing Overhead'];
const PEOPLE_GROUPS = new Set(['Factory Payroll', 'Corporate Salaries', 'Employee Benefits & Statutory']);
const BRAND_GROUPS = new Set(['Brand Marketing', 'Marketing Production & Creative']);
const OPEX_PL_EXCLUDE = new Set(['Depreciation & Amortisation']);
const RM_GROUP = 'Raw Material & Packaging';

const PCT_BASE: Record<string, Channel | 'ALL'> = {
  '% of Revenue': 'ALL', '% of Amazon Rev': 'A', '% of D2C Rev': 'D', '% of Flipkart Rev': 'F',
  '% of GT Rev': 'G', '% of Physio Rev': 'P',
};
const ROAS_BASE: Record<string, Channel> = { 'ROAS on Amazon': 'A', 'ROAS on D2C': 'D', 'ROAS on Flipkart': 'F' };

export const LINE_TYPES = ['Monthly', 'Quarterly', 'Annual', 'One Time', ...Object.keys(PCT_BASE), ...Object.keys(ROAS_BASE)];

export function isPctType(t: string) { return t in PCT_BASE; }
export function isRoasType(t: string) { return t in ROAS_BASE; }

/** Default for a line's "repeat after the base" flag. */
export function defaultRepeat(l: Pick<ExpenseLine, 'type' | 'theme' | 'group'>): boolean {
  return l.type !== 'One Time' && l.theme !== 'New Product Development' && l.group !== 'Fundraise Costs';
}

export function runPlan(plan: Plan): PlanResult {
  const L = plan.levers;
  const B = plan.units.length;
  const H = Math.max(B, L.horizon);
  const nSku = plan.skus.length;
  const yearsAfter = (m: number) => (m > B ? Math.ceil((m - B) / 12) : 0);

  // ---- 1. units & revenue --------------------------------------------------------
  // u[m][sku][ch] total units (base levered, then extended)
  const u: number[][][] = [];
  const fyMonths = new Map<string, number[]>(); // FY → its month indices (1-based)
  for (let m = 1; m <= H; m++) {
    const fy = fyOf(plan.startMonth, m);
    if (!fyMonths.has(fy)) fyMonths.set(fy, []);
    fyMonths.get(fy)!.push(m);
  }
  const prevFyTotal = (fy: string, s: number, c: number): number => {
    const prev = 'FY' + String(Number(fy.slice(2)) - 1).padStart(2, '0');
    const ms = fyMonths.get(prev) ?? [];
    if (!ms.length) return 0;
    const sum = ms.reduce((a, mm) => a + u[mm - 1][s][c], 0);
    return (sum * 12) / ms.length; // a part year is annualised
  };
  for (let m = 1; m <= H; m++) {
    const row: number[][] = [];
    for (let s = 0; s < nSku; s++) {
      const per: number[] = [];
      for (let c = 0; c < CHANNELS.length; c++) {
        const ch = CHANNELS[c];
        if (m <= B) {
          const cell = plan.units[m - 1][s][c];
          per.push((cell[0] + cell[1] + cell[2]) * (L.baseVolume[ch] ?? 1));
        } else {
          const fy = fyOf(plan.startMonth, m);
          const g = L.growth[fy]?.[ch] ?? 0;
          if (L.seasonShape === 'history') {
            // last FY's total for this SKU × channel, grown, spread by the SKU's seasonality
            const prev = prevFyTotal(fy, s, c);
            const idx = plan.skuSeason?.[plan.skus[s].id]?.[calOf(plan.startMonth, m)] ?? 1;
            per.push((prev / 12) * (1 + g) * idx);
          } else {
            per.push(u[m - 13][s][c] * (1 + g));
          }
        }
      }
      row.push(per);
    }
    u.push(row);
  }

  // new products: units by month (all channels)
  const productUnits = (p: NewProduct, m: number): number => {
    if (!p.on || m < p.launchMonth) return 0;
    const k = m - p.launchMonth; // 0 at launch
    const season = p.seasonRef && p.seasonRef !== 'flat' ? plan.skuSeason?.[p.seasonRef]?.[calOf(plan.startMonth, m)] ?? 1 : 1;
    if (k < 12) return p.launchUnits * Math.pow(1 + p.rampPct, k) * season;
    const peak = p.launchUnits * Math.pow(1 + p.rampPct, 11);
    return peak * Math.pow(1 + p.steadyPct, (k - 11) / 12) * season;
  };

  // ---- D2C as customers --------------------------------------------------------------
  const D = plan.d2c;
  const cohorts = D?.mode === 'cohorts';
  const [sy, sm] = plan.startMonth.split('-').map(Number);
  const histNew = new Map<number, number>(); // month offset (≤ 0) → new customers before the plan
  for (const h of D?.history ?? []) {
    const [y, mo] = h.month.split('-').map(Number);
    const off = (y * 12 + mo) - (sy * 12 + sm) + 1; // 1 = startMonth
    if (off <= 0) histNew.set(off, h.newCustomers);
  }
  const histMin = Math.min(0, ...histNew.keys());
  const newC: number[] = []; // newC[m] for m ≥ 1
  const newAt = (i: number) => (i >= 1 ? newC[i] ?? 0 : histNew.get(i) ?? 0);
  const newShare: number[] = []; // newShare[m] = new-customer share of D2C revenue (base months)
  /** repeat orders in month m from buyers of earlier months (excludes same-month repeats) */
  const repeatFromEarlier = (m: number): number => {
    let r = D.nextMonth * newAt(m - 1);
    for (let k = 2; k <= 11; k++) r += D.monthly * newAt(m - k);
    for (let k = 12; m - k >= histMin; k++) r += D.yearly * Math.pow(D.yearlyFade, Math.floor(k / 12) - 1) * newAt(m - k);
    return r;
  };

  const months: MonthResult[] = [];
  let gstAssetPrev = 0;
  const refundClaimable: number[] = [];
  let debt = plan.cash.openingDebt;
  let cumulative = 0;
  let cash = plan.cash.openingCash;
  let nwcPrev = plan.cash.openingInventory;
  let invPrev = plan.cash.openingInventory;
  const stdCogs: number[] = [];

  // first pass needs every month's revenue for forward inventory cover, so compute P&L for all months first
  const pre: Omit<MonthResult, 'gstAsset' | 'gstRefund' | 'taxableTurnover' | 'outputGst' | 'itcGoods' | 'itcServices' | 'gstSetOffServices' | 'gstSetOffGoods' | 'gstClaimable' | 'gstStuck' | 'stdCogs' | 'inventory' | 'inventoryPurchase' | 'receivables' | 'payables' | 'nwc' | 'nwcChange' | 'debt' | 'netCashFlow' | 'cumulativeCash' | 'equity' | 'debtNet' | 'closingCash' | 'interest' | 'tax' | 'pbt' | 'pat' | 'gstWrittenOff' | 'cm1' | 'cm2' | 'cm3' | 'ebitda' | 'ebit'>[] = [];

  for (let m = 1; m <= H; m++) {
    const aspF = Math.pow(1 + L.aspGrowthPct, yearsAfter(m));
    const revenueByChannel = zeroCh();
    const revenueBySku: Record<string, number> = {};
    const unitsBySku: Record<string, number> = {};
    let units = 0;
    for (let s = 0; s < nSku; s++) {
      const sku = plan.skus[s];
      let su = 0;
      let sr = 0;
      for (let c = 0; c < CHANNELS.length; c++) {
        const q = u[m - 1][s][c];
        const r = q * sku.asp * aspF;
        revenueByChannel[CHANNELS[c]] += r;
        su += q; sr += r;
      }
      unitsBySku[sku.id] = su; revenueBySku[sku.id] = sr; units += su;
    }
    // D2C: rebuild the channel from customers, keeping the month's SKU mix
    let d2cNewCustomers = 0, d2cRepeatOrders = 0, d2cNewRevenue = 0, d2cRepeatRevenue = 0;
    if (cohorts) {
      const planD = revenueByChannel.D;
      const S = (D.season[calOf(plan.startMonth, m)] ?? 1) * D.repeatBoost;
      const aovN = D.aovNew * aspF, aovR = D.aovRepeat * aspF;
      const earlier = S * repeatFromEarlier(m);
      if (m <= B) {
        // back-solve the new buyers the sheet's D2C revenue needs, given repeats already coming
        newC[m] = Math.max(0, (planD - earlier * aovR) / (aovN + D.sameMonth * S * aovR));
      } else {
        const g = L.growth[fyOf(plan.startMonth, m)]?.D ?? 0;
        newC[m] = newC[m - 12] * (1 + g);
      }
      d2cNewCustomers = newC[m];
      d2cRepeatOrders = earlier + D.sameMonth * S * newC[m];
      d2cNewRevenue = d2cNewCustomers * aovN;
      d2cRepeatRevenue = d2cRepeatOrders * aovR;
      const total = d2cNewRevenue + d2cRepeatRevenue;
      newShare[m] = total > 0 ? d2cNewRevenue / total : 1;
      const f = planD > 0 ? total / planD : 0;
      if (planD > 0 && Math.abs(f - 1) > 1e-12) {
        const ci = CHANNELS.indexOf('D');
        for (let s = 0; s < nSku; s++) {
          const sku = plan.skus[s];
          const q = u[m - 1][s][ci];
          unitsBySku[sku.id] += q * (f - 1);
          revenueBySku[sku.id] += q * sku.asp * aspF * (f - 1);
          units += q * (f - 1);
        }
      } else if (planD <= 0 && total > 0) {
        revenueBySku['d2c-repeat'] = total; // repeat buyers in a month the plan sells nothing on D2C
      }
      revenueByChannel.D = total;
    }

    let ownCogs = 0;
    let ownCogsRevenue = 0;
    for (const p of plan.products) {
      const q = productUnits(p, m);
      if (!q) { unitsBySku[p.id] = 0; revenueBySku[p.id] = 0; continue; }
      let pr = 0;
      for (const ch of CHANNELS) {
        const r = q * (p.split[ch] ?? 0) * p.asp * aspF;
        revenueByChannel[ch] += r; pr += r;
      }
      unitsBySku[p.id] = q; revenueBySku[p.id] = pr; units += q;
      if (p.cogsPct != null) { ownCogs += pr * p.cogsPct; ownCogsRevenue += pr; }
    }
    const grossRevenue = CHANNELS.reduce((a, c) => a + revenueByChannel[c], 0);

    // ---- 2. expense calendar ----------------------------------------------------
    const groups: Record<string, number> = {};
    const lines: Record<string, number> = {};
    const n = yearsAfter(m);
    const brandOverride = m > B && L.brandPctOfRevenue > 0;
    for (const l of plan.lines) {
      if (l.off) { lines[l.id] = 0; continue; }
      const repeat = l.repeat ?? defaultRepeat(l);
      const k = m > B && repeat && l.start <= B ? m - 12 * Math.ceil((m - B) / 12) : m;
      const end = l.end ?? H;
      let v = 0;
      if (!(l.start > k || k > end) && !(brandOverride && BRAND_GROUPS.has(l.group))) {
        const fixedF = m > B ? Math.pow(1 + L.inflationPct, n) * (PEOPLE_GROUPS.has(l.group) ? Math.pow(1 + L.teamGrowthPct, n) : 1) : 1;
        if (l.type === 'Monthly') v = l.amount * fixedF;
        else if (l.type === 'Quarterly') v = (k - l.start) % 3 === 0 ? l.amount * fixedF : 0;
        else if (l.type === 'One Time') v = k === l.start ? l.amount : 0;
        else if (l.type === 'Annual') v = (k - l.start) % 12 === 0 ? l.amount * fixedF : 0;
        else if (l.type in ROAS_BASE) {
          const roas = l.amount * (m > B ? Math.pow(1 + L.roasGainPct, n) : 1);
          let base = revenueByChannel[ROAS_BASE[l.type]];
          if (cohorts && ROAS_BASE[l.type] === 'D' && m > B) {
            // the sheet's ROAS is blended (new + repeat); after the base, ads pay for new buyers only,
            // at the same-month base year's new-buyer share
            const ks = m - 12 * Math.ceil((m - B) / 12);
            const share = newShare[ks] ?? 1;
            base = share > 0 ? d2cNewRevenue / share : base;
          }
          v = roas > 0 ? base / roas : 0;
        } else if (l.type in PCT_BASE) {
          const b = PCT_BASE[l.type];
          let base = b === 'ALL' ? grossRevenue : revenueByChannel[b];
          let rate = l.amount;
          if (l.group === RM_GROUP && b === 'ALL') {
            base -= ownCogsRevenue; // products with their own COGS % carry it separately
            if (m > B) rate = Math.max(0, rate + L.cogsDeltaPerYear * n);
          }
          v = rate * base;
        }
      }
      lines[l.id] = v;
      groups[l.group] = (groups[l.group] ?? 0) + v;
    }
    if (ownCogs) groups[RM_GROUP] = (groups[RM_GROUP] ?? 0) + ownCogs;
    if (brandOverride) groups['Brand Marketing'] = (groups['Brand Marketing'] ?? 0) + grossRevenue * L.brandPctOfRevenue;

    const g = (name: string) => groups[name] ?? 0;
    const revenueDeductions = g('Revenue Deductions');
    const netRevenue = grossRevenue - revenueDeductions;
    const cogs = COGS_GROUPS.reduce((a, x) => a + g(x), 0);
    const grossProfit = netRevenue - cogs;
    const opexGroups = plan.groups.filter((x) => x.section === 'opex' && !OPEX_PL_EXCLUDE.has(x.name));
    const opex = opexGroups.reduce((a, x) => a + g(x.name), 0);
    const capex = plan.groups.filter((x) => x.section === 'capex').reduce((a, x) => a + g(x.name), 0);
    pre.push({
      m, label: monthLabel(plan.startMonth, m), fy: fyOf(plan.startMonth, m), units, unitsBySku,
      revenueByChannel, revenueBySku, grossRevenue, d2cNewCustomers, d2cRepeatOrders, d2cNewRevenue, d2cRepeatRevenue, groups, lines, revenueDeductions, netRevenue, cogs,
      grossProfit, opex, da: g('Depreciation & Amortisation'), banking: g('Banking Charges'),
      fundraiseCosts: g('Fundraise Costs'), capex,
    });
    stdCogs.push(netRevenue * (1 - plan.cash.gmStandard));
  }

  // ---- 3. GST, working capital, debt, tax, cash ----------------------------------
  const c = plan.cash;
  const ev = (kind: CashEvent['kind'], m: number) =>
    plan.events.filter((e) => e.kind === kind && e.month === m).reduce((a, e) => a + e.amount, 0);
  let fyLossPool = 0;
  let fyPbt = 0;

  for (let i = 0; i < H; i++) {
    const p = pre[i];
    const m = i + 1;
    const gg = (name: string) => p.groups[name] ?? 0;

    // GST (inverted duty): goods ITC is refundable (lagged), services/capex ITC only sets off output
    const taxable = p.netRevenue / (1 + c.outputGst);
    const outGst = taxable * c.outputGst;
    const goods = [...GOODS_GROUPS].reduce((a, x) => a + gg(x), 0);
    const itcGoods = goods * c.inputGstGoods;
    const services = [...SERVICE_GROUPS].reduce((a, x) => a + gg(x), 0) + p.capex;
    const itcServices = services * c.inputGstServices;
    const setOffServices = Math.min(itcServices, outGst);
    const setOffGoods = Math.min(itcGoods, outGst - setOffServices);
    const claimable = itcGoods - setOffGoods;
    refundClaimable.push(claimable);
    const refund = m - c.refundLagMonths >= 1 ? refundClaimable[m - c.refundLagMonths - 1] : 0;
    const stuck = itcServices - setOffServices;
    const writtenOff = stuck * c.gstWriteOffPct;
    const gstAsset = gstAssetPrev + claimable + (stuck - writtenOff) - refund;
    gstAssetPrev = gstAsset;

    const cm1 = p.grossProfit - gg('Channel Commission') - writtenOff;
    const cm2 = cm1 - gg('Fulfilment & Delivery') - gg('Payment & Collection');
    const cm3 = cm2 - gg('Performance Marketing');
    const ebitda = cm3 - p.opex;
    const ebit = ebitda - p.da;
    const rate = (c.interestSteps ?? []).filter((x) => x.month <= m).reduce((a, x) => x.rate, c.interestRate);
    const interest = debt * rate / 12;
    const pbt = ebit - interest - p.banking - p.fundraiseCosts;
    let tax = 0;
    if (L.taxMode === 'fy') {
      fyPbt += pbt;
      const fyEnd = i === H - 1 || pre[i + 1].fy !== p.fy;
      if (fyEnd) {
        const fyTaxable = fyPbt - fyLossPool;
        if (fyTaxable > 0) { tax = fyTaxable * c.taxRate; fyLossPool = 0; } else { fyLossPool = -fyTaxable; }
        fyPbt = 0;
      }
    } else {
      tax = Math.max(0, pbt * c.taxRate);
    }
    const pat = pbt - tax;

    // inventory: forward cover on the next (up to) 3 months' COGS at standard margin
    const next = stdCogs.slice(i + 1, i + 4);
    const fwd = next.length ? next.reduce((a, x) => a + x, 0) / next.length : stdCogs[i];
    const inventory = fwd * 3 / 90 * c.inventoryDays;
    const inventoryPurchase = stdCogs[i] + inventory - invPrev;
    invPrev = inventory;
    const receivables = p.grossRevenue / 30 * c.receivableDays;
    const payables = -Math.max(0, inventoryPurchase) / 30 * c.payableDays;
    const nwc = inventory + receivables + payables + gstAsset;
    const nwcChange = nwcPrev - nwc;
    nwcPrev = nwc;

    const drawn = ev('debtDrawn', m), repaid = ev('debtRepaid', m), equity = ev('equity', m);
    const openingDebt = debt;
    debt = openingDebt + drawn - repaid;

    const netCashFlow = ebitda - tax - interest - p.banking - p.fundraiseCosts + nwcChange - p.capex;
    cumulative += netCashFlow;
    cash += netCashFlow + equity + drawn - repaid;

    months.push({
      ...p, gstWrittenOff: writtenOff, cm1, cm2, cm3, ebitda, ebit, interest, pbt, tax, pat,
      taxableTurnover: taxable, outputGst: outGst, itcGoods, itcServices, gstSetOffServices: setOffServices, gstSetOffGoods: setOffGoods,
      gstClaimable: claimable, gstStuck: stuck, stdCogs: stdCogs[i],
      gstAsset, gstRefund: refund, inventory, inventoryPurchase, receivables, payables, nwc, nwcChange,
      debt, netCashFlow, cumulativeCash: cumulative, equity, debtNet: drawn - repaid, closingCash: cash,
    });
  }

  // ---- 4. by FY & fundraise ---------------------------------------------------------
  const years: YearResult[] = [];
  for (const mr of months) {
    let y = years.find((x) => x.fy === mr.fy);
    if (!y) {
      y = { fy: mr.fy, months: 0, units: 0, revenue: 0, revenueByChannel: zeroCh(), d2cNewCustomers: 0, d2cRepeatOrders: 0, d2cNewRevenue: 0, d2cRepeatRevenue: 0, grossProfit: 0, cm3: 0, ebitda: 0, pat: 0, capex: 0, netCashFlow: 0, closingCash: 0, endDebt: 0, revenueWithActuals: 0, ebitdaWithActuals: 0 };
      years.push(y);
    }
    y.d2cNewCustomers += mr.d2cNewCustomers; y.d2cRepeatOrders += mr.d2cRepeatOrders;
    y.d2cNewRevenue += mr.d2cNewRevenue; y.d2cRepeatRevenue += mr.d2cRepeatRevenue;
    y.months++; y.units += mr.units; y.revenue += mr.netRevenue; y.grossProfit += mr.grossProfit;
    y.cm3 += mr.cm3; y.ebitda += mr.ebitda; y.pat += mr.pat; y.capex += mr.capex; y.netCashFlow += mr.netCashFlow;
    y.closingCash = mr.closingCash; y.endDebt = mr.debt;
    for (const ch of CHANNELS) y.revenueByChannel[ch] += mr.revenueByChannel[ch];
  }
  for (const y of years) {
    const h1 = y.fy === fyOf(plan.startMonth, 1) && y.months < 12;
    y.revenueWithActuals = y.revenue + (h1 ? L.fy27H1Revenue : 0);
    y.ebitdaWithActuals = y.ebitda + (h1 ? L.fy27H1Ebitda : 0);
  }

  let peak = 0, peakMonth = 0, minCash = Infinity, minCashMonth = 0;
  for (const mr of months) {
    if (mr.cumulativeCash < peak) { peak = mr.cumulativeCash; peakMonth = mr.m; }
    if (mr.closingCash < minCash) { minCash = mr.closingCash; minCashMonth = mr.m; }
  }
  const peakDeficit = -peak;
  const fundingRequired = peakDeficit * (1 + c.contingencyPct);
  const debtDrawnTotal = plan.events.filter((e) => e.kind === 'debtDrawn' && e.month <= H).reduce((a, e) => a + e.amount, 0);
  const equityPlanned = plan.events.filter((e) => e.kind === 'equity' && e.month <= H).reduce((a, e) => a + e.amount, 0);

  return {
    months, years, peakDeficit, peakDeficitMonth: peakMonth, fundingRequired, debtDrawnTotal,
    equityRequired: fundingRequired - debtDrawnTotal, equityPlanned, minClosingCash: minCash,
    minClosingCashMonth: minCashMonth, base: B,
  };
}

/** Peak cumulative deficit within the first n months (the sheet's 12M / 18M headline). */
export function peakDeficitWithin(r: PlanResult, n: number): number {
  return -Math.min(0, ...r.months.slice(0, n).map((x) => x.cumulativeCash));
}
