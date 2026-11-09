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

export interface CashEvent {
  id: string; kind: 'equity' | 'debtDrawn' | 'debtRepaid'; month: number; amount: number; note: string;
  /** The sheet's venture-debt draw: replaced by the venture-debt terms in `fx.ventureDebt` when those are on. */
  venture?: boolean;
}

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
  /** volume / price / COGS are placeholders, not founder-confirmed numbers */
  placeholder?: boolean;
  /** Growth builder (used only when `plan.growth.on`): the product family it belongs to */
  category?: ProductCategory;
  /** made on our own line (counts against production capacity); topicals / nutraceuticals default to contract-made */
  inHouse?: boolean;
  /** one-off launch cost (formulation, licences, trials, launch campaign) in the launch month, ₹ */
  launchCost?: number;
  /** one-off tooling / moulds capex in the launch month, ₹ */
  launchCapex?: number;
  /** marketing on top of the channel ad lines, as % of this product's revenue (category building) */
  marketingPct?: number;
  /** a Growth-builder line: scaled by "Solve for the target" / the revenue path */
  growthLine?: boolean;
  /** consumables: share of a month's buyers who buy again the month after (Growth builder) */
  repeatPct?: number;
  /** month-on-month retention of those repeat buyers (0.9 = 10% drop off each month) */
  repeatDecay?: number;
  /** Growth builder: month this product starts on each online channel (default its launch month); before it, that channel sells none */
  chStart?: Partial<Record<Channel, number>>;
  /** Growth builder: extra growth a year on a channel from its start (its share grows; 0.2 = +20 % a year) */
  chGrowth?: Partial<Record<Channel, number>>;
  /** Growth builder: month this product enters GT / MT / pharmacy outlets (default its launch month) */
  retailStart?: number;
  /** Growth builder: NEW-buyer units per FY typed by hand (e.g. { FY29: 24000 }); a year set here replaces launch + ramp for that year
   *  (spread evenly over its months on sale × the product's season), and the revenue-path push leaves it alone */
  unitsByFy?: Record<string, number>;
  /** Growth builder: this product's own costs (one-off launch / tooling, monthly fixed, % of its revenue) */
  expenses?: ProductExpense[];
}

/** A product's own cost line. `month` defaults to the product's launch month; `group` to the natural plan group for the kind. */
export interface ProductExpense {
  id: string;
  label: string;
  kind: 'oneoff' | 'capex' | 'monthly' | 'pct';
  /** ₹ (oneoff / capex / monthly) or a share of the product's revenue (pct, 0.05 = 5 %) */
  amount: number;
  month?: number;
  /** last month (monthly / pct); null = to the end */
  end?: number | null;
  /** monthly: rise a year from its start */
  growthPct?: number;
  group?: string;
}
export const EXPENSE_GROUP: Record<ProductExpense['kind'], string> = {
  oneoff: 'Product Development & Launch', capex: 'New Product Tooling & Moulds', monthly: 'Product Running Costs', pct: 'Performance Marketing',
};

/** A product family (user-defined). Products in it inherit any field they leave unset. */
export interface CategoryDef {
  id: string;
  name: string;
  cogsPct?: number | null;
  marketingPct?: number;
  repeatPct?: number;
  repeatDecay?: number;
  inHouse?: boolean;
  /** default channel mix for new products in it (sums to 1) */
  split?: Record<Channel, number>;
  seasonRef?: string;
  note?: string;
}
/** A product with its category's defaults filled in where it left a field unset (pure). */
export function resolveProduct(p: NewProduct, cats: CategoryDef[] | undefined): NewProduct {
  const c = cats?.find((x) => x.id === p.category);
  if (!c) return p;
  return {
    ...p,
    cogsPct: p.cogsPct ?? c.cogsPct ?? null,
    marketingPct: p.marketingPct ?? c.marketingPct,
    repeatPct: p.repeatPct ?? c.repeatPct,
    repeatDecay: p.repeatDecay ?? c.repeatDecay,
    inHouse: p.inHouse ?? c.inHouse,
    seasonRef: p.seasonRef ?? c.seasonRef,
  };
}

/** A category id: the built-in device / topical / nutra / other, or one the founder adds (Growth builder → Products). */
export type ProductCategory = string;
export const CATEGORY_NAMES: Record<string, string> = {
  device: 'Devices', topical: 'Topicals', nutra: 'Nutraceuticals', other: 'Other',
};

/** Growth builder: people, capacity, capex, rounds and stores layered on top of the plan. */
export type Dept = 'factory' | 'corporate' | 'sales' | 'marketing' | 'tech' | 'store';
export const DEPT_NAMES: Record<Dept, string> = {
  factory: 'Factory', corporate: 'Corporate & ops', sales: 'Sales', marketing: 'Marketing', tech: 'R&D & tech', store: 'Stores',
};
export interface Hire {
  id: string; role: string; dept: Dept; count: number; month: number; end: number | null; monthlyCtc: number; on?: boolean;
  /** headcount that grows with the business: at least `count`, else one person per `every` of the metric
   *  (revenue = ₹ Cr of annualised revenue last month; outlets = GT / MT / pharmacy outlets live, or one type's; units = units sold last month) */
  scale?: { by: 'revenue' | 'outlets' | 'units'; every: number; type?: string };
}
/** Overheads: a site (warehouse / office: sq ft × rent, running cost, deposit, fit-out), a fixed monthly cost, or a % of revenue. */
export interface Overhead {
  id: string; name: string; on: boolean; kind: 'site' | 'fixed' | 'pct'; group: string; month: number; end: number | null;
  /** fixed: ₹ a month; pct: share of revenue (list) */
  amount: number;
  /** a year, from its start (rent escalation, price rise) */
  growthPct: number;
  sqft?: number; rentPerSqft?: number; runningPerMonth?: number; depositMonths?: number; fitout?: number;
}
/** How "Fund the gap" sizes rounds. */
export interface FundingRules { buffer: number; runwayMonths: number; minRound: number; preMoneyMultiple: number; feePct: number; earliestAfterSeed: number }
export interface CapacityBlock { id: string; name: string; on: boolean; month: number; leadMonths: number; unitsPerMonth: number; capex: number; monthlyOpex: number }
export interface CapexItem { id: string; name: string; on: boolean; group: string; month: number; amount: number }
export interface FundRound { id: string; name: string; on: boolean; month: number; amount: number; preMoney: number; feePct: number; confirmed: boolean }
export interface StorePlan {
  on: boolean;
  /** stores opened in a month (cumulative count is the sum) */
  openings: { month: number; count: number }[];
  /** revenue per store per month once mature (₹, incl. GST like every price in the plan) */
  matureRevenue: number;
  /** months for a new store to reach mature revenue (linear) */
  rampMonths: number;
  capexPerStore: number; rentPerStore: number; staffPerStore: number; staffCtc: number; otherOpexPerStore: number;
}
/** Offline distribution for the new lines: general trade, modern trade, pharmacy chains. */
export interface RetailType {
  id: string; name: string; on: boolean;
  /** outlets added in a month (cumulative count is the sum) */
  outlets: { month: number; add: number }[];
  /** months for a new outlet to reach its full offtake (linear) */
  rampMonths: number;
  /** units per outlet per month at full offtake, per product family (split evenly over that family's live lines) */
  units: Record<ProductCategory, number>;
  /** distributor + retailer margin off the list price (we invoice the rest) */
  tradeMarginPct: number;
  /** schemes / promotions, % of what we invoice (a revenue deduction) */
  schemePct: number;
  /** one-off listing / onboarding fee per new outlet, ₹ */
  listingFee: number;
  /** field force / merchandising cost per outlet per month, ₹ */
  servicePerOutlet: number;
}
export interface GrowthPlan {
  on: boolean;
  /** revenue target per FY (P&L revenue), e.g. { FY28: 30 Cr, … }; "Solve the path" sets `push` to meet it */
  path?: Record<string, number>;
  /** multiplier on the growth lines' new buyers in each FY (set by the path solver; 1 = as entered) */
  push?: Record<string, number>;
  retail?: RetailType[];
  overheads?: Overhead[];
  funding?: FundingRules;
  /** exit ARR target (₹): last 3 months' revenue × 4 at the end of the horizon */
  targetArr: number;
  /** in-house production capacity today, units a month (all devices) */
  baseCapacity: number;
  /** salary increment a year for growth hires */
  incrementPct: number;
  /** employer PF / ESI / insurance on top of CTC */
  benefitsPct: number;
  /** one-off hiring cost as a share of a year's CTC */
  recruitPct: number;
  /** pre-money of the ₹8 Cr seed, for the dilution table (placeholder until agreed) */
  seedPreMoney: number;
  hires: Hire[];
  capacity: CapacityBlock[];
  capex: CapexItem[];
  rounds: FundRound[];
  stores: StorePlan;
  note: string;
  /** product families with the defaults their products inherit (Products tab); absent = the four built-in names, no defaults */
  categories?: CategoryDef[];
}
/** Cost groups the Growth builder adds (present in plans that switch it on). */
export const GROWTH_GROUPS: { name: string; section: Section }[] = [
  { name: 'Retail Stores', section: 'opex' },
  { name: 'Store Fit-out', section: 'capex' },
  { name: 'Product Running Costs', section: 'opex' },
];

/** One month of D2C order history (aggregates only — no customer data). */
export interface D2CHistoryMonth {
  month: string; // YYYY-MM
  newCustomers: number;
  repeatOrders: number;
  newSales: number;
  repeatSales: number;
  /** Shopify total_discounts of the month's orders (₹, same orders as new/repeat sales); absent in older history */
  discounts?: number;
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
  /** discounts ÷ (sales + discounts) over the last 12 months of Shopify history that carry discounts; null = not measured yet */
  discountPct?: number | null;
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

/**
 * Founder decisions (Nov 2026) as switches. `sheetParity: true` ignores every switch below (they are all
 * in their legacy position), which is what makes Base reproduce the Projection & Deployment Plan sheet for
 * M1–M18 (server/test/planning.test.ts). Items with `confirmed: false` are placeholders, not agreed terms.
 */
export interface PlanFx {
  sheetParity: boolean;
  /** 1. services GST that cannot be set off is expensed (a cost line under CM1), not carried as an asset */
  gstServicesAsCost: boolean;
  /** 1. P&L revenue, EBITDA basis: false = GMV incl. GST as the sheet; true = ex-GST (GMV is still shown) */
  revenueExGst: boolean;
  /** 2. General Trade revenue is booked at net realisation (list price less the distributor margin) */
  gtNetRealisation: boolean;
  /** 3. the seed round as a funding event (equity) */
  seed: { on: boolean; amount: number; month: number; feePct: number; confirmed: boolean; note: string };
  /** 4. opening position at the plan start; `source` says where the numbers came from */
  opening: {
    on: boolean; cash: number; receivables: number; payables: number; inventory: number; gstAsset: number;
    debt: number; accumulatedLosses: number; source: 'sheet' | 'tally' | 'manual'; asOf: string | null; note: string;
  };
  /** 5. venture debt with its own terms (replaces the sheet's venture draw event) */
  ventureDebt: {
    on: boolean; amount: number; drawMonth: number; rate: number; moratoriumMonths: number; tenorMonths: number;
    feePct: number; confirmed: boolean;
  };
  /** 5. interest on a negative cash balance (an overdraft facility), separate from equity and from term debt */
  overdraft: { on: boolean; rate: number; confirmed: boolean };
  /** 7. D2C discounts / coupons as % of D2C list revenue, learned from Shopify total_discounts */
  d2cDiscount: { on: boolean; pct: number; source: 'shopify' | 'manual' | 'placeholder'; asOf: string | null };
  /** 9. depreciation of NEW capex booked once, straight-line from the month after the spend (the sheet's flat D&A lines stay for the opening assets, without inflation) */
  depreciationOnce: { on: boolean; lifeYears: number };
  /** 8. per-SKU volume and price tweaks (hGo, hPulse, …) */
  skuTweaks: Record<string, { volume: number; asp: number | null }>;
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
  /** founder decisions; absent in plans saved before them (= sheet parity) */
  fx?: PlanFx;
  /** Growth builder; absent / off = the plan as before (never applied in sheet-parity mode) */
  growth?: GrowthPlan;
}


export const LEGACY_FX: PlanFx = {
  sheetParity: true,
  gstServicesAsCost: false,
  revenueExGst: false,
  gtNetRealisation: false,
  seed: { on: false, amount: 0, month: 1, feePct: 0, confirmed: false, note: '' },
  opening: { on: false, cash: 0, receivables: 0, payables: 0, inventory: 0, gstAsset: 0, debt: 0, accumulatedLosses: 0, source: 'sheet', asOf: null, note: '' },
  ventureDebt: { on: false, amount: 0, drawMonth: 1, rate: 0, moratoriumMonths: 0, tenorMonths: 1, feePct: 0, confirmed: false },
  overdraft: { on: false, rate: 0, confirmed: false },
  d2cDiscount: { on: false, pct: 0, source: 'placeholder', asOf: null },
  depreciationOnce: { on: false, lifeYears: 5 },
  skuTweaks: {},
};

/** The switches the engine actually uses: all legacy under sheet parity or in a plan saved before they existed. */
export function resolveFx(plan: Pick<Plan, 'fx'>): PlanFx {
  return plan.fx && !plan.fx.sheetParity ? plan.fx : LEGACY_FX;
}

/** Debt drawn by month n: the sheet's draw events, with the venture draw replaced by the fx terms when those are on. */
export function debtDrawnBy(plan: Plan, n: number): number {
  const v = resolveFx(plan).ventureDebt;
  const events = plan.events.filter((e) => e.kind === 'debtDrawn' && e.month <= n && !(v.on && e.venture)).reduce((a, e) => a + e.amount, 0);
  return events + (v.on && v.drawMonth <= n ? v.amount : 0);
}

/** Cash the plan starts with (the opening position when on, else the sheet's input). */
export function openingCashOf(plan: Plan): number {
  const fx = resolveFx(plan);
  return fx.opening.on ? fx.opening.cash : plan.cash.openingCash;
}

// ---- calendar helpers ------------------------------------------------------------

// monthLabel / fyOf run for every month of every runPlan (the solvers call runPlan hundreds of times), and
// toLocaleString builds an Intl formatter per call — so both are memoised on (startMonth, m). Same output.
const MONTH_LABELS = new Map<string, string>();
export function monthLabel(startMonth: string, m: number): string {
  const key = startMonth + '|' + m;
  let v = MONTH_LABELS.get(key);
  if (v === undefined) {
    const [y, mo] = startMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + (m - 1), 1));
    v = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) + '-' + String(d.getUTCFullYear()).slice(2);
    MONTH_LABELS.set(key, v);
  }
  return v;
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
const FY_OF = new Map<string, string>();
export function fyOf(startMonth: string, m: number): string {
  const key = startMonth + '|' + m;
  let v = FY_OF.get(key);
  if (v === undefined) {
    const [y, mo] = startMonth.split('-').map(Number);
    const abs = y * 12 + (mo - 1) + (m - 1);
    const yr = Math.floor(abs / 12), mon = abs % 12; // mon 0 = Jan
    v = 'FY' + String((mon >= 3 ? yr + 1 : yr) % 100).padStart(2, '0');
    FY_OF.set(key, v);
  }
  return v;
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
  /** GMV: gross sales incl. GST, after the GT net-realisation netting, before deductions */
  gmv: number;
  /** revenue ex-GST (= taxable turnover) */
  revenueExGst: number;
  /** GT distributor margin netted out of revenue (net-realisation mode; 0 otherwise) */
  gtMarginNetted: number;
  /** D2C discounts / coupons deducted from the lever (0 when the lever is off) */
  d2cDiscounts: number;
  /** services GST that could not be set off, expensed in CM1 */
  gstServicesCost: number;
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
  /** term debt owed to banks (opening + sheet events) and venture debt, end of month; `debt` is their sum */
  bankDebt: number;
  ventureBalance: number;
  ventureInterest: number;
  overdraftInterest: number;
  /** negative closing cash = overdraft drawn */
  overdraft: number;
  /** cumulative operating cash flow less scheduled venture principal repayments (what the Ask is sized on) */
  cumulativeNeed: number;
  /** Growth builder (zeros when it is off) */
  storeRevenue: number;
  stores: number;
  /** people added by the Growth builder (not the sheet's payroll lines) */
  growthHeadcount: number;
  /** in-house units vs capacity (units a month); utilisation 0 when no capacity is set */
  inHouseUnits: number;
  capacity: number;
  utilisation: number;
  /** equity from Growth-builder rounds this month */
  roundEquity: number;
  /** offline distribution (Growth builder): what we invoice, by type, and live outlets by type */
  retailRevenue: number;
  retailByType: Record<string, number>;
  outlets: Record<string, number>;
  /** repeat units of consumable lines this month */
  repeatUnits: number;
}

export interface YearResult {
  fy: string;
  months: number;
  units: number;
  revenue: number;
  gmv: number;
  revenueExGst: number;
  gstServicesCost: number;
  d2cDiscounts: number;
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
  storeRevenue: number;
  retailRevenue: number;
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
  /** equity from Growth-builder rounds within the horizon */
  roundsEquity: number;
  /** seed equity in the plan (fx) and what the Ask needs after it */
  seedEquity: number;
  fxActive: boolean;
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
const DA_GROUP = 'Depreciation & Amortisation';
const OPEX_PL_EXCLUDE = new Set([DA_GROUP]);
/** The sheet's "Fundraise Cost - Current Round (5% of raise)": follows the seed amount when the seed is on. */
const SEED_FEE_LINE = 'e378';
/** The GT distributor margin: Channel Commission lines charged as % of GT revenue. */
const isGtMarginLine = (l: Pick<ExpenseLine, 'group' | 'type'>) => l.group === 'Channel Commission' && l.type === '% of GT Rev';
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
  const fx = resolveFx(plan);
  const parity = !!plan.fx?.sheetParity;
  const taxMode = parity ? 'sheet' : L.taxMode;
  const G = !parity && plan.growth?.on ? plan.growth : null;
  // Growth builder: every product with its category's defaults filled in (Products tab cascade)
  const products = G ? plan.products.map((p) => resolveProduct(p, G.categories)) : plan.products;
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
  // first month (1-based, within the base) a SKU sells on a channel; Infinity = never
  const firstSale: number[][] = plan.skus.map((_, s) => CHANNELS.map((__, c) => {
    for (let m = 1; m <= B; m++) { const cell = plan.units[m - 1][s][c]; if (cell[0] + cell[1] + cell[2] > 0) return m; }
    return Infinity;
  }));
  const tweakVol = (s: number) => fx.skuTweaks[plan.skus[s].id]?.volume ?? 1;
  const aspOf = (s: number) => fx.skuTweaks[plan.skus[s].id]?.asp ?? plan.skus[s].asp;
  const prevFyTotal = (fy: string, s: number, c: number): number => {
    const prev = 'FY' + String(Number(fy.slice(2)) - 1).padStart(2, '0');
    const all = fyMonths.get(prev) ?? [];
    // a SKU launched part-way through that year is annualised over the months it was on sale
    // (not over the whole year: that made late launches such as hPulse almost vanish)
    const ms = all.filter((mm) => mm >= firstSale[s][c]);
    if (!ms.length) return 0;
    const sum = ms.reduce((a, mm) => a + u[mm - 1][s][c], 0);
    return (sum * 12) / ms.length; // a part year is annualised
  };
  const dBefore: number[] = []; // D2C unit-revenue of month m by the old rule (year-ago × growth) …
  const dNow: number[] = [];    // … and with late launches kept at run-rate; their ratio scales new D2C buyers after the base
  const ciD = CHANNELS.indexOf('D');
  for (let m = 1; m <= H; m++) {
    const row: number[][] = [];
    let dOld = 0, dNew = 0;
    for (let s = 0; s < nSku; s++) {
      const per: number[] = [];
      for (let c = 0; c < CHANNELS.length; c++) {
        const ch = CHANNELS[c];
        let oldRule: number | null = null;
        if (m <= B) {
          const cell = plan.units[m - 1][s][c];
          per.push((cell[0] + cell[1] + cell[2]) * (L.baseVolume[ch] ?? 1) * tweakVol(s));
        } else {
          const fy = fyOf(plan.startMonth, m);
          const g = L.growth[fy]?.[ch] ?? 0;
          if (L.seasonShape === 'history') {
            // last FY's total for this SKU × channel, grown, spread by the SKU's seasonality
            const prev = prevFyTotal(fy, s, c);
            const idx = plan.skuSeason?.[plan.skus[s].id]?.[calOf(plan.startMonth, m)] ?? 1;
            per.push((prev / 12) * (1 + g) * idx);
          } else if (m - 12 < firstSale[s][c] && firstSale[s][c] <= B) {
            // launched within the base's last year, so the month a year ago was before launch: keep the
            // run-rate of its last base month (re-shaped by season) until a year-ago month exists
            const sk = plan.skuSeason?.[plan.skus[s].id];
            const ratio = sk ? (sk[calOf(plan.startMonth, m)] ?? 1) / (sk[calOf(plan.startMonth, B)] || 1) : 1;
            per.push(u[B - 1][s][c] * ratio);
            oldRule = u[m - 13][s][c] * (1 + g);
          } else {
            per.push(u[m - 13][s][c] * (1 + g));
          }
        }
        if (c === ciD && m > B) { dNew += per[c] * plan.skus[s].asp; dOld += (oldRule ?? per[c]) * plan.skus[s].asp; }
      }
      row.push(per);
    }
    u.push(row);
    dBefore.push(dOld); dNow.push(dNew);
  }

  // new products: units by month (all channels)
  const baseProductUnits = (p: NewProduct, m: number): number => {
    if (!p.on || m < p.launchMonth || (p.placeholder && parity)) return 0; // placeholder products stand aside in sheet-parity mode
    const k = m - p.launchMonth; // 0 at launch
    const season = p.seasonRef && p.seasonRef !== 'flat' ? plan.skuSeason?.[p.seasonRef]?.[calOf(plan.startMonth, m)] ?? 1 : 1;
    const typed = G ? p.unitsByFy?.[fyOf(plan.startMonth, m)] : undefined;
    if (typed != null) {
      const onSale = (fyMonths.get(fyOf(plan.startMonth, m)) ?? []).filter((mm) => mm >= p.launchMonth).length || 1;
      return (typed / onSale) * season;
    }
    if (k < 12) return p.launchUnits * Math.pow(1 + p.rampPct, k) * season;
    const peak = p.launchUnits * Math.pow(1 + p.rampPct, 11);
    return peak * Math.pow(1 + p.steadyPct, (k - 11) / 12) * season;
  };
  // Growth builder: the FY push multiplies a growth line's NEW buyers; consumables add repeat orders from earlier buyers
  const pushOf = (p: NewProduct, m: number) => (p.growthLine && G?.push && p.unitsByFy?.[fyOf(plan.startMonth, m)] == null ? G.push[fyOf(plan.startMonth, m)] ?? 1 : 1);
  const unitCache = new Map<string, { tot: number[]; rep: number[] }>();
  const hireCount = new Map<string, number>(); // scaled roles: the most people reached so far
  const unitsOf = (p: NewProduct) => {
    let c = unitCache.get(p.id);
    if (c) return c;
    const nb: number[] = [], tot: number[] = [], rep: number[] = [];
    const rp = G ? p.repeatPct ?? 0 : 0, dk = p.repeatDecay ?? 0;
    let pool = 0; // repeat orders due this month from all earlier buyers
    for (let m = 1; m <= H; m++) {
      nb[m] = baseProductUnits(p, m) * pushOf(p, m);
      const r = pool;
      rep[m] = r; tot[m] = nb[m] + r;
      pool = pool * dk + nb[m] * rp; // next month: survivors of the repeat pool + this month's new buyers' first repeat
    }
    c = { tot, rep }; unitCache.set(p.id, c);
    return c;
  };
  const productUnits = (p: NewProduct, m: number): number => (p.on ? unitsOf(p).tot[m] ?? 0 : 0);
  // offline outlets live by type and month (with ramp) → effective full-offtake outlets
  const retailTypes = G?.retail?.filter((t) => t.on) ?? [];
  const outletsAt = (t: RetailType, m: number) => {
    let live = 0, eff = 0, added = 0;
    for (const o of t.outlets) {
      if (o.month > m || o.add <= 0) continue;
      const age = m - o.month;
      live += o.add; eff += o.add * Math.min(1, (age + 1) / Math.max(1, t.rampMonths));
      if (age === 0) added += o.add;
    }
    return { live, eff, added };
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
  let cumulative = 0;
  let cash = plan.cash.openingCash;
  let nwcPrev = plan.cash.openingInventory;
  let invPrev = plan.cash.openingInventory;
  const stdCogs: number[] = [];

  // first pass needs every month's revenue for forward inventory cover, so compute P&L for all months first
  const pre: Omit<MonthResult, 'gstAsset' | 'gstRefund' | 'taxableTurnover' | 'outputGst' | 'itcGoods' | 'itcServices' | 'gstSetOffServices' | 'gstSetOffGoods' | 'gstClaimable' | 'gstStuck' | 'stdCogs' | 'inventory' | 'inventoryPurchase' | 'receivables' | 'payables' | 'nwc' | 'nwcChange' | 'debt' | 'netCashFlow' | 'cumulativeCash' | 'equity' | 'debtNet' | 'closingCash' | 'bankDebt' | 'ventureBalance' | 'ventureInterest' | 'overdraftInterest' | 'overdraft' | 'cumulativeNeed' | 'roundEquity' | 'interest' | 'tax' | 'pbt' | 'pat' | 'gstWrittenOff' | 'cm1' | 'cm2' | 'cm3' | 'ebitda' | 'ebit'>[] = [];

  for (let m = 1; m <= H; m++) {
    const aspF = Math.pow(1 + L.aspGrowthPct, yearsAfter(m));
    const revenueByChannel = zeroCh();
    const revenueBySku: Record<string, number> = {};
    const unitsBySku: Record<string, number> = {};
    const gtList: Record<string, number> = {}; // GT list revenue per SKU (for net-realisation netting)
    let units = 0;
    for (let s = 0; s < nSku; s++) {
      const sku = plan.skus[s];
      let su = 0;
      let sr = 0;
      for (let c = 0; c < CHANNELS.length; c++) {
        const q = u[m - 1][s][c];
        const r = q * aspOf(s) * aspF;
        revenueByChannel[CHANNELS[c]] += r;
        gtList[sku.id] = (gtList[sku.id] ?? 0) + (CHANNELS[c] === 'G' ? r : 0);
        su += q; sr += r;
      }
      unitsBySku[sku.id] = su; revenueBySku[sku.id] = sr; units += su;
    }
    // D2C: rebuild the channel from customers, keeping the month's SKU mix
    let d2cNewCustomers = 0, d2cRepeatOrders = 0, d2cNewRevenue = 0, d2cRepeatRevenue = 0;
    if (cohorts) {
      const planD = revenueByChannel.D;
      const S = (D.season[calOf(plan.startMonth, m)] ?? 1) * D.repeatBoost;
      // Shopify order values are after discounts; with the discount lever on, the D2C list price is grossed up
      // by the discount % and the discount is deducted below (else it would be taken twice)
      const gross = fx.d2cDiscount.on && fx.d2cDiscount.pct < 0.9 ? 1 / (1 - fx.d2cDiscount.pct) : 1;
      const aovN = D.aovNew * aspF * gross, aovR = D.aovRepeat * aspF * gross;
      const earlier = S * repeatFromEarlier(m);
      if (m <= B) {
        // back-solve the new buyers the sheet's D2C revenue needs, given repeats already coming
        newC[m] = Math.max(0, (planD - earlier * aovR) / (aovN + D.sameMonth * S * aovR));
      } else {
        const g = L.growth[fyOf(plan.startMonth, m)]?.D ?? 0;
        newC[m] = newC[m - 12] * (1 + g) * (dBefore[m - 1] > 0 ? dNow[m - 1] / dBefore[m - 1] : 1);
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
          revenueBySku[sku.id] += q * aspOf(s) * aspF * (f - 1);
          units += q * (f - 1);
        }
      } else if (planD <= 0 && total > 0) {
        revenueBySku['d2c-repeat'] = total; // repeat buyers in a month the plan sells nothing on D2C
      }
      revenueByChannel.D = total;
    }

    let ownCogs = 0;
    let ownCogsRevenue = 0;
    const gAdd: Record<string, number> = {}; // Growth-builder costs, added to the groups after the expense calendar
    const add = (grp: string, v: number) => { if (v) gAdd[grp] = (gAdd[grp] ?? 0) + v; };
    let inHouseUnits = 0, repeatUnits = 0;
    for (const p of products) {
      if (G && p.on && m === p.launchMonth) { add('Product Development & Launch', p.launchCost ?? 0); add('New Product Tooling & Moulds', p.launchCapex ?? 0); }
      const q0 = productUnits(p, m);
      // per-channel factor: the channel's share once it has started, grown by its own rate a year (Growth builder only)
      const fac = CHANNELS.map((ch) => {
        const sh = p.split[ch] ?? 0;
        if (!G || (!p.chStart && !p.chGrowth)) return sh;
        const st = p.chStart?.[ch] ?? p.launchMonth;
        if (m < st) return 0;
        return sh * Math.pow(1 + (p.chGrowth?.[ch] ?? 0), Math.floor((m - st) / 12));
      });
      const facSum = fac.reduce((a, x) => a + x, 0);
      const q = G && (p.chStart || p.chGrowth) ? q0 * facSum : q0;
      if (G && p.on && m >= p.launchMonth) repeatUnits += (unitsOf(p).rep[m] ?? 0) * (p.chStart || p.chGrowth ? facSum : 1);
      if (!q) { unitsBySku[p.id] = 0; revenueBySku[p.id] = 0; continue; }
      if (p.inHouse ?? (p.category ? p.category === 'device' : true)) inHouseUnits += q;
      let pr = 0;
      for (let ci = 0; ci < CHANNELS.length; ci++) {
        const ch = CHANNELS[ci];
        const r = q0 * fac[ci] * p.asp * aspF;
        revenueByChannel[ch] += r; pr += r;
        if (ch === 'G') gtList[p.id] = (gtList[p.id] ?? 0) + r;
      }
      unitsBySku[p.id] = q; revenueBySku[p.id] = pr; units += q;
      if (p.cogsPct != null) { ownCogs += pr * p.cogsPct; ownCogsRevenue += pr; }
      if (G && p.marketingPct) add('Performance Marketing', pr * p.marketingPct);
    }
    // Growth builder: each product's own cost lines
    if (G) for (const p of products) {
      if (!p.on || !p.expenses?.length || (p.placeholder && parity)) continue;
      for (const e of p.expenses) {
        const st = e.month ?? p.launchMonth;
        const grp = e.group || EXPENSE_GROUP[e.kind];
        if (e.kind === 'oneoff' || e.kind === 'capex') { if (m === st) add(grp, e.amount); continue; }
        if (m < st || (e.end != null && m > e.end)) continue;
        if (e.kind === 'monthly') add(grp, e.amount * Math.pow(1 + (e.growthPct ?? 0), Math.floor((m - st) / 12)));
        else add(grp, (revenueBySku[p.id] ?? 0) * e.amount);
      }
    }
    for (let s = 0; s < nSku; s++) inHouseUnits += unitsBySku[plan.skus[s].id] ?? 0; // the core SKUs are made in-house

    // ---- Growth builder: offline distribution of the new lines (GT, MT, pharmacy) ------------
    let retailRevenue = 0;
    const retailByType: Record<string, number> = {}, outlets: Record<string, number> = {};
    for (const t of retailTypes) {
      const o = outletsAt(t, m);
      outlets[t.id] = o.live;
      let inv = 0;
      for (const cat of Object.keys(t.units) as ProductCategory[]) {
        const per = t.units[cat] ?? 0;
        if (!per || !o.eff) continue;
        const live = products.filter((p) => p.on && p.growthLine && (p.category ?? 'other') === cat && m >= (p.retailStart ?? p.launchMonth) && !(p.placeholder && parity));
        if (!live.length) continue;
        for (const p of live) {
          const q = (o.eff * per) / live.length;
          const list = q * p.asp * aspF;
          const r = list * (1 - t.tradeMarginPct);
          inv += r;
          unitsBySku[p.id] = (unitsBySku[p.id] ?? 0) + q; revenueBySku[p.id] = (revenueBySku[p.id] ?? 0) + r; units += q;
          if (p.inHouse ?? p.category === 'device') inHouseUnits += q;
          ownCogs += list * (p.cogsPct ?? 0.3); ownCogsRevenue += r; // material on the list value; kept out of the %-of-revenue RM base
        }
      }
      retailByType[t.id] = inv; retailRevenue += inv;
      add('Revenue Deductions', inv * t.schemePct);
      add('Channel Commission', o.added * t.listingFee);
      add('Fulfilment & Delivery', o.live * t.servicePerOutlet);
    }

    // ---- Growth builder: stores, people, capacity, capex, round fees ---------------------
    let storeRevenue = 0, stores = 0, growthHeadcount = 0, capacity = 0;
    if (G) {
      const st = G.stores;
      if (st.on) {
        for (const o of st.openings) {
          if (o.month > m || o.count <= 0) continue;
          const age = m - o.month; // 0 in the opening month
          const ramp = Math.min(1, (age + 1) / Math.max(1, st.rampMonths));
          storeRevenue += o.count * st.matureRevenue * ramp * aspF;
          stores += o.count;
          if (age === 0) add('Store Fit-out', o.count * st.capexPerStore);
        }
        const inflF = m > B ? Math.pow(1 + L.inflationPct, yearsAfter(m)) : 1;
        add('Retail Stores', stores * (st.rentPerStore + st.otherOpexPerStore) * inflF);
        add('Retail Stores', stores * st.staffPerStore * st.staffCtc * (1 + G.benefitsPct) * Math.pow(1 + G.incrementPct, Math.floor((m - 1) / 12)));
        growthHeadcount += stores * st.staffPerStore;
        if (storeRevenue) revenueBySku['stores'] = storeRevenue;
      }
      const prev = pre[m - 2];
      const liveOutlets = (type?: string) => retailTypes.filter((t) => !type || t.id === type).reduce((a, t) => a + outletsAt(t, m).live, 0);
      for (const h of G.hires) {
        if (h.on === false || m < h.month || (h.end != null && m > h.end)) continue;
        let n = h.count;
        if (h.scale && h.scale.every > 0) {
          const metric = h.scale.by === 'revenue' ? (prev ? (prev.netRevenue * 12) / 1e7 : 0) : h.scale.by === 'outlets' ? liveOutlets(h.scale.type) : prev ? prev.units : 0;
          n = Math.max(h.count, Math.ceil(metric / h.scale.every));
          const before = hireCount.get(h.id) ?? 0;
          if (n > before && m !== h.month) add('Recruitment & Training', (n - before) * h.monthlyCtc * 12 * G.recruitPct);
          hireCount.set(h.id, Math.max(before, n));
          n = Math.max(before, n); // people aren't let go when a metric dips
        }
        if (n <= 0) continue;
        const pay = n * h.monthlyCtc * Math.pow(1 + G.incrementPct, Math.floor((m - h.month) / 12));
        add(h.dept === 'factory' ? 'Factory Payroll' : 'Corporate Salaries', pay);
        add('Employee Benefits & Statutory', pay * G.benefitsPct);
        if (m === h.month) add('Recruitment & Training', n * h.monthlyCtc * 12 * G.recruitPct);
        growthHeadcount += n;
      }
      capacity = G.baseCapacity;
      for (const b of G.capacity) {
        if (!b.on) continue;
        if (m === b.month) add('Plant & Machinery', b.capex);
        if (m >= b.month + b.leadMonths) { capacity += b.unitsPerMonth; add('Manufacturing Overhead', b.monthlyOpex); }
      }
      for (const x of G.capex) if (x.on && m === x.month) add(x.group || 'Plant & Machinery', x.amount);
      for (const o of G.overheads ?? []) {
        if (!o.on || o.kind === 'pct' || m < o.month || (o.end != null && m > o.end)) continue;
        const esc = Math.pow(1 + (o.growthPct ?? 0), Math.floor((m - o.month) / 12));
        if (o.kind === 'site') {
          const rent = (o.sqft ?? 0) * (o.rentPerSqft ?? 0);
          add(o.group || 'Rent & Facilities', rent * esc);
          add('Utilities & Power', (o.runningPerMonth ?? 0) * esc);
          if (m === o.month) { add('Intangibles & Deposits', rent * (o.depositMonths ?? 0)); add('Plant & Machinery', o.fitout ?? 0); }
        } else add(o.group || 'Office & Administration', o.amount * esc);
      }
      for (const r of G.rounds) if (r.on && m === r.month) add('Fundraise Costs', r.amount * r.feePct);
    }
    const listRevenue = CHANNELS.reduce((a, c) => a + revenueByChannel[c], 0) + storeRevenue + retailRevenue; // the base of every %-of-revenue line
    if (G) for (const o of G.overheads ?? []) if (o.on && o.kind === 'pct' && m >= o.month && !(o.end != null && m > o.end)) add(o.group || 'Office & Administration', o.amount * listRevenue);
    const d2cList = revenueByChannel.D;
    let gtMargin = 0;

    // ---- 2. expense calendar ----------------------------------------------------
    const groups: Record<string, number> = {};
    const lines: Record<string, number> = {};
    const n = yearsAfter(m);
    const brandOverride = m > B && L.brandPctOfRevenue > 0;
    const daOnce = fx.depreciationOnce.on;
    for (const l of plan.lines) {
      if (l.off) { lines[l.id] = 0; continue; }
      const repeat = l.repeat ?? defaultRepeat(l);
      const k = m > B && repeat && l.start <= B ? m - 12 * Math.ceil((m - B) / 12) : m;
      const end = l.end ?? H;
      let v = 0;
      if (!(l.start > k || k > end) && !(brandOverride && BRAND_GROUPS.has(l.group))) {
        const fixedF = m > B && !(daOnce && l.group === DA_GROUP) ? Math.pow(1 + L.inflationPct, n) * (PEOPLE_GROUPS.has(l.group) ? Math.pow(1 + L.teamGrowthPct, n) : 1) : 1;
        const amount = fx.seed.on && l.id === SEED_FEE_LINE ? fx.seed.amount * fx.seed.feePct : l.amount;
        if (l.type === 'Monthly') v = amount * fixedF;
        else if (l.type === 'Quarterly') v = (k - l.start) % 3 === 0 ? l.amount * fixedF : 0;
        else if (l.type === 'One Time') v = k === l.start ? amount : 0;
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
          let base = b === 'ALL' ? listRevenue : revenueByChannel[b];
          let rate = l.amount;
          if (l.group === RM_GROUP && b === 'ALL') {
            base -= ownCogsRevenue; // products with their own COGS % carry it separately
            if (m > B) rate = Math.max(0, rate + L.cogsDeltaPerYear * n);
          }
          v = rate * base;
        }
      }
      if (fx.gtNetRealisation && isGtMarginLine(l)) { gtMargin += v; v = 0; }
      lines[l.id] = v;
      groups[l.group] = (groups[l.group] ?? 0) + v;
    }
    // General Trade at net realisation: the distributor's margin comes off revenue instead of sitting in
    // commission. Every %-of-revenue cost line above was sized on list price, so costs don't move.
    if (gtMargin) {
      revenueByChannel.G -= gtMargin;
      const gtTotal = Object.values(gtList).reduce((a, x) => a + x, 0);
      if (gtTotal > 0) for (const id of Object.keys(gtList)) revenueBySku[id] = (revenueBySku[id] ?? 0) - gtMargin * gtList[id] / gtTotal;
    }
    const grossRevenue = CHANNELS.reduce((a, c) => a + revenueByChannel[c], 0) + storeRevenue + retailRevenue;
    // D2C discounts and coupons (Shopify-learned lever) are a revenue deduction on D2C list revenue
    const d2cDiscounts = fx.d2cDiscount.on ? d2cList * fx.d2cDiscount.pct : 0;
    if (d2cDiscounts) groups['Revenue Deductions'] = (groups['Revenue Deductions'] ?? 0) + d2cDiscounts;
    if (ownCogs) groups[RM_GROUP] = (groups[RM_GROUP] ?? 0) + ownCogs;
    if (brandOverride) groups['Brand Marketing'] = (groups['Brand Marketing'] ?? 0) + (listRevenue - gtMargin) * L.brandPctOfRevenue;
    for (const [k, v] of Object.entries(gAdd)) groups[k] = (groups[k] ?? 0) + v;

    const g = (name: string) => groups[name] ?? 0;
    const revenueDeductions = g('Revenue Deductions');
    const netRevenue = fx.revenueExGst ? (grossRevenue - revenueDeductions) / (1 + plan.cash.outputGst) : grossRevenue - revenueDeductions;
    const cogs = COGS_GROUPS.reduce((a, x) => a + g(x), 0);
    const grossProfit = netRevenue - cogs;
    const allGroups = G ? [...plan.groups, ...GROWTH_GROUPS.filter((x) => !plan.groups.some((y) => y.name === x.name))] : plan.groups;
    const opexGroups = allGroups.filter((x) => x.section === 'opex' && !OPEX_PL_EXCLUDE.has(x.name));
    const opex = opexGroups.reduce((a, x) => a + g(x.name), 0);
    const capex = allGroups.filter((x) => x.section === 'capex').reduce((a, x) => a + g(x.name), 0);
    pre.push({
      m, label: monthLabel(plan.startMonth, m), fy: fyOf(plan.startMonth, m), units, unitsBySku,
      gmv: grossRevenue, revenueExGst: 0, gtMarginNetted: gtMargin, d2cDiscounts, gstServicesCost: 0,
      revenueByChannel, revenueBySku, grossRevenue, d2cNewCustomers, d2cRepeatOrders, d2cNewRevenue, d2cRepeatRevenue, groups, lines, revenueDeductions, netRevenue, cogs,
      grossProfit, opex, da: g('Depreciation & Amortisation'), banking: g('Banking Charges'),
      fundraiseCosts: g('Fundraise Costs'), capex,
      storeRevenue, stores, growthHeadcount, inHouseUnits, capacity, utilisation: capacity > 0 ? inHouseUnits / capacity : 0,
      retailRevenue, retailByType, outlets, repeatUnits,
    });
    stdCogs.push((listRevenue - revenueDeductions) * (1 - plan.cash.gmStandard)); // physical goods: list price, whatever the P&L basis
  }

  // ---- 3. GST, working capital, debt, tax, cash ----------------------------------
  const c = plan.cash;
  const op = fx.opening.on ? fx.opening : null;
  const vd = fx.ventureDebt;
  // venture debt terms: draw, interest-only moratorium, then equal principal instalments to the end of the tenor
  const vDrawn = (m: number) => (vd.on && m === vd.drawMonth ? vd.amount : 0);
  const vRepaid = (m: number) => {
    if (!vd.on) return 0;
    const first = vd.drawMonth + Math.max(0, vd.moratoriumMonths) + 1, last = vd.drawMonth + Math.max(1, vd.tenorMonths);
    return m >= first && m <= last ? vd.amount / (last - first + 1) : 0;
  };
  // the sheet's draw flagged as the venture facility is replaced by those terms when they are on
  const ev = (kind: CashEvent['kind'], m: number) =>
    plan.events.filter((e) => e.kind === kind && e.month === m && !(vd.on && e.venture)).reduce((a, e) => a + e.amount, 0);
  const seedAt = (m: number) => (fx.seed.on && m === Math.max(1, fx.seed.month) ? fx.seed.amount : 0);
  const roundAt = (m: number) => (G ? G.rounds.filter((r) => r.on && r.month === m).reduce((a, r) => a + r.amount, 0) : 0);
  const capexSoFar: number[] = []; // for depreciation of new capex
  let bankDebt = op ? op.debt : plan.cash.openingDebt;
  let ventureBal = 0;
  let fyLossPool = taxMode === 'fy' && op ? op.accumulatedLosses : 0;
  let fyPbt = 0;
  let cumulativeNeed = 0;
  if (op) {
    cash = op.cash;
    invPrev = op.inventory;
    gstAssetPrev = op.gstAsset;
    nwcPrev = op.inventory + op.receivables - op.payables + op.gstAsset;
  }

  for (let i = 0; i < H; i++) {
    const p = pre[i];
    const m = i + 1;
    const gg = (name: string) => p.groups[name] ?? 0;

    // GST (inverted duty): goods ITC is refundable (lagged), services/capex ITC only sets off output
    const taxable = (p.grossRevenue - p.revenueDeductions) / (1 + c.outputGst);
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
    const writtenOff = stuck * (fx.gstServicesAsCost ? 1 : c.gstWriteOffPct);
    const gstAsset = gstAssetPrev + claimable + (stuck - writtenOff) - refund;
    gstAssetPrev = gstAsset;

    // depreciation: the sheet's lines, or (booked once) those lines without inflation + new capex over its life
    capexSoFar.push(p.capex);
    let da = p.da;
    if (fx.depreciationOnce.on) {
      const months = Math.max(1, fx.depreciationOnce.lifeYears * 12);
      let sched = 0;
      for (let j = Math.max(0, i - months); j < i; j++) sched += capexSoFar[j] / months;
      da = p.da + sched;
    }

    const cm1 = p.grossProfit - gg('Channel Commission') - writtenOff;
    const cm2 = cm1 - gg('Fulfilment & Delivery') - gg('Payment & Collection');
    const cm3 = cm2 - gg('Performance Marketing');
    const ebitda = cm3 - p.opex;
    const ebit = ebitda - da;
    const rate = (c.interestSteps ?? []).filter((x) => x.month <= m).reduce((_a, x) => x.rate, c.interestRate);
    const bankInterest = bankDebt * rate / 12;
    const ventureInterest = ventureBal * vd.rate / 12;
    const overdraftInterest = fx.overdraft.on ? Math.max(0, -cash) * fx.overdraft.rate / 12 : 0;
    const interest = bankInterest + ventureInterest + overdraftInterest;
    const financeFee = vDrawn(m) * vd.feePct;
    const fundraiseCosts = p.fundraiseCosts + financeFee;
    const pbt = ebit - interest - p.banking - fundraiseCosts;
    let tax = 0;
    if (taxMode === 'fy') {
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

    const drawn = ev('debtDrawn', m) + vDrawn(m), repaid = ev('debtRepaid', m) + vRepaid(m), roundEquity = roundAt(m), equity = ev('equity', m) + seedAt(m) + roundEquity;
    bankDebt += ev('debtDrawn', m) - ev('debtRepaid', m);
    ventureBal += vDrawn(m) - vRepaid(m);
    const debt = bankDebt + ventureBal;

    const netCashFlow = ebitda - tax - interest - p.banking - fundraiseCosts + nwcChange - p.capex;
    cumulative += netCashFlow;
    cumulativeNeed += netCashFlow - vRepaid(m);
    cash += netCashFlow + equity + drawn - repaid;

    months.push({
      ...p, da, fundraiseCosts, gstWrittenOff: writtenOff, gstServicesCost: writtenOff, revenueExGst: taxable, cm1, cm2, cm3, ebitda, ebit, interest, pbt, tax, pat,
      taxableTurnover: taxable, outputGst: outGst, itcGoods, itcServices, gstSetOffServices: setOffServices, gstSetOffGoods: setOffGoods,
      gstClaimable: claimable, gstStuck: stuck, stdCogs: stdCogs[i],
      gstAsset, gstRefund: refund, inventory, inventoryPurchase, receivables, payables, nwc, nwcChange,
      debt, netCashFlow, cumulativeCash: cumulative, equity, debtNet: drawn - repaid, closingCash: cash,
      bankDebt, ventureBalance: ventureBal, ventureInterest, overdraftInterest, overdraft: Math.max(0, -cash), cumulativeNeed, roundEquity,
    });
  }

  // ---- 4. by FY & fundraise ---------------------------------------------------------
  const years: YearResult[] = [];
  for (const mr of months) {
    let y = years.find((x) => x.fy === mr.fy);
    if (!y) {
      y = { fy: mr.fy, months: 0, units: 0, revenue: 0, gmv: 0, revenueExGst: 0, gstServicesCost: 0, d2cDiscounts: 0, revenueByChannel: zeroCh(), d2cNewCustomers: 0, d2cRepeatOrders: 0, d2cNewRevenue: 0, d2cRepeatRevenue: 0, grossProfit: 0, cm3: 0, ebitda: 0, pat: 0, capex: 0, netCashFlow: 0, closingCash: 0, endDebt: 0, revenueWithActuals: 0, ebitdaWithActuals: 0, storeRevenue: 0, retailRevenue: 0 };
      years.push(y);
    }
    y.d2cNewCustomers += mr.d2cNewCustomers; y.d2cRepeatOrders += mr.d2cRepeatOrders;
    y.d2cNewRevenue += mr.d2cNewRevenue; y.d2cRepeatRevenue += mr.d2cRepeatRevenue;
    y.months++; y.units += mr.units; y.revenue += mr.netRevenue;
    y.gmv += mr.gmv; y.revenueExGst += mr.revenueExGst; y.gstServicesCost += mr.gstServicesCost; y.d2cDiscounts += mr.d2cDiscounts; y.grossProfit += mr.grossProfit;
    y.cm3 += mr.cm3; y.ebitda += mr.ebitda; y.pat += mr.pat; y.capex += mr.capex; y.netCashFlow += mr.netCashFlow;
    y.closingCash = mr.closingCash; y.endDebt = mr.debt; y.storeRevenue += mr.storeRevenue; y.retailRevenue += mr.retailRevenue;
    for (const ch of CHANNELS) y.revenueByChannel[ch] += mr.revenueByChannel[ch];
  }
  for (const y of years) {
    const h1 = y.fy === fyOf(plan.startMonth, 1) && y.months < 12;
    y.revenueWithActuals = y.revenue + (h1 ? L.fy27H1Revenue : 0);
    y.ebitdaWithActuals = y.ebitda + (h1 ? L.fy27H1Ebitda : 0);
  }

  let peak = 0, peakMonth = 0, minCash = Infinity, minCashMonth = 0;
  for (const mr of months) {
    if (mr.cumulativeNeed < peak) { peak = mr.cumulativeNeed; peakMonth = mr.m; }
    if (mr.closingCash < minCash) { minCash = mr.closingCash; minCashMonth = mr.m; }
  }
  const peakDeficit = -peak;
  // The Ask: peak cash need (operations, interest and scheduled venture repayments) plus contingency, less the cash we start with
  const fundingRequired = Math.max(0, peakDeficit * (1 + c.contingencyPct) - Math.max(0, fx.opening.on ? fx.opening.cash : 0));
  const debtDrawnTotal = debtDrawnBy(plan, H);
  const seedEquity = fx.seed.on && fx.seed.month <= H ? fx.seed.amount : 0;
  const roundsEquity = months.reduce((a, x) => a + x.roundEquity, 0);
  const equityPlanned = plan.events.filter((e) => e.kind === 'equity' && e.month <= H).reduce((a, e) => a + e.amount, 0) + seedEquity + roundsEquity;

  return {
    months, years, peakDeficit, peakDeficitMonth: peakMonth, fundingRequired, debtDrawnTotal,
    equityRequired: fundingRequired - debtDrawnTotal, equityPlanned, minClosingCash: minCash,
    minClosingCashMonth: minCashMonth, base: B, roundsEquity, seedEquity, fxActive: fx !== LEGACY_FX,
  };
}

/** Peak cumulative deficit within the first n months (the sheet's 12M / 18M headline). */
export function peakDeficitWithin(r: PlanResult, n: number): number {
  return -Math.min(0, ...r.months.slice(0, n).map((x) => x.cumulativeNeed));
}
