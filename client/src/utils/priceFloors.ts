// ----------------------------------------------------------------------------
// Amazon price floors — the lowest GST-inclusive Amazon.in price per SKU that
// still breaks even, from the product's full cost (materials + conversion,
// read from production.heatronics.in) and the SKU's Amazon economics (from the
// Seller Central "Revenue and fees" report uploaded here).
//
// GST is inverted: we sell at 5% and buy almost everything at 18% (materials,
// Amazon fees, ads). So every purchase is counted with its 18% GST, and the 5%
// GST on the sale is paid out of those input credits, costing nothing extra
// unless the credits fall short. Credit left over is lost (not refunded).
// ----------------------------------------------------------------------------

export interface FloorSku {
  asin: string;
  name: string;
  sku: string;
  /** Tranzact finished good whose cost is used, e.g. FG-0039. */
  item: string;
  asp: number; // average selling price incl. GST
  sold: number; // units shipped in the report period
  returned: number; // units refunded in the report period
  fba: number; // FBA fulfilment fee per unit
  admin: number; // refund admin fee per return
  refPct: number; // referral fee above the band, share of the GST-inclusive price
  tacos: number | null; // actual ad spend ÷ sales in the report period
  inbound: number | null; // inbound transport + placement per unit sent in, when the report charged it
  reportId: string | null; // report the numbers last came from
}

export interface FloorGlobal {
  gst: number;
  band: number; // referral starts and the closing fee steps up at this price
  closeLo: number;
  closeHi: number;
  placement: number; // inbound placement per unit sent in
  transport: number; // inbound transport per unit sent in
  storage: number; // storage per unit sold
  removal: number; // removal fee per unsellable return
  minSample: number; // below this many units sold, use the average return rate
  margin: number; // target profit as a share of the GST-inclusive selling price
  buyGst: number; // GST paid on materials, Amazon fees and ads (input credit)
}

export interface FloorSettings {
  global: FloorGlobal;
  skus: FloorSku[];
  updatedAt: string | null;
  updatedBy: string | null;
  /** Seller Central page where the Revenue and fees report is downloaded. */
  reportUrl?: string;
}

export interface ProductCost {
  item: string;
  name: string;
  bom: string;
  material: number | null;
  conversion: number | null;
  cost: number | null;
  chg1: number | null;
}

export interface CostsSnapshot {
  month: string;
  generated: string;
  data_to: string;
  conversion: { overheadsMonth: string; carried: boolean; total: number; units: number | null; basis: string; alloc: string } | null;
  products: ProductCost[];
  fetchedAt: string;
  source: string;
  error?: string | null;
}

export interface FeeReport {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string | null;
  rows: ParsedSkuRow[];
  totals: { sales: number; units: number; refunds: number; ads: number };
  observed: Partial<Pick<FloorGlobal, 'placement' | 'transport' | 'storage'>>;
}

/** One ASIN's economics as read from a Seller Central fee report. */
export interface ParsedSkuRow {
  asin: string;
  name: string;
  sku: string;
  sold: number;
  returned: number;
  sales: number;
  asp: number | null;
  fba: number | null;
  admin: number | null;
  refPct: number | null;
  closing: number | null;
  inbound: number | null;
  ads: number;
  tacos: number | null;
}

export const DEFAULT_GLOBAL: FloorGlobal = {
  gst: 0.05,
  band: 1000,
  closeLo: 35.4,
  closeHi: 64.9,
  placement: 0,
  transport: 19.89,
  storage: 23.03,
  removal: 11.8,
  minSample: 30,
  margin: 0.08,
  buyGst: 0.18,
};

const s = (asin: string, name: string, sku: string, item: string, asp: number, sold: number, returned: number, fba: number, admin: number, refPct: number): FloorSku => ({
  asin, name, sku, item, asp, sold, returned, fba, admin, refPct, tacos: null, inbound: null, reportId: null,
});

/** Starting point until the first report is uploaded (Seller Central fee report, 14 Oct 2026). */
export const SELLER_CENTRAL_REPORTS = 'https://sellercentral.amazon.in/';

export const DEFAULT_SETTINGS: FloorSettings = {
  global: DEFAULT_GLOBAL,
  reportUrl: SELLER_CENTRAL_REPORTS,
  updatedAt: null,
  updatedBy: null,
  skus: [
    { ...s('B0CZK16SYF', 'hCore X Lite', 'GT-91UJ-JD7N', 'FG-0039', 649.7, 131, 33, 19.29, 103.67, 0.1), inbound: 14.43 },
    { ...s('B0CZK44ZDP', 'hCore X-L Lite', 'HB-QQ6J-D6E0', 'FG-0038', 956.26, 182, 21, 24.95, 125.2, 0.1), inbound: 38.11 },
    s('B0CZJYTVK7', 'hCore X', 'OW-MZO9-R7TJ', 'FG-0036', 997.91, 12, 3, 16.72, 129.8, 0.1),
    s('B0CWXDVHZ2', 'hCore X-L', 'Q6-0JD4-RPXK', 'FG-0037', 803.68, 45, 2, 20.06, 129.8, 0.1),
    s('B0CZJZ3MJ5', 'hCore Knee', 'VW-H1GL-KTOZ', 'FG-0040', 1515.37, 94, 25, 18.57, 136.4, 0.0981),
    s('B0DF587RSS', 'hCore Neck', 'NR-1Z7Q-AC90', 'FG-0041', 2316.56, 53, 8, 24.96, 137.7, 0.096),
    s('B0CZL5RZ7H', 'hCore Foot Warmer', 'JC-TKTL-00CB', 'FG-0042', 2141.49, 39, 5, 23.96, 141.6, 0.1031),
    s('B0D1DYB98D', 'hCore Bed Warmer Solo', 'S9-IVOI-793Z', 'FG-0044', 2829.03, 22, 4, 34.33, 129.8, 0.1064),
    s('B0DNZG4HYR', 'hCore Rest', 'BP-E09Z-J064', 'FG-0043', 2468.38, 4, 0, 43.66, 129.8, 0.1363),
    s('B0DNZLR3XN', 'hCore Bed Warmer Double', 'AE-LLV7-K2VT', 'FG-0045', 5677.14, 5, 1, 35.9, 129.8, 0.0936),
  ],
};

export const COLS: { label: string; u: number | null }[] = [
  { label: 'No returns', u: null },
  { label: 'All resellable', u: 0 },
  { label: '25% unsellable', u: 0.25 },
  { label: '50% unsellable', u: 0.5 },
  { label: 'All unsellable', u: 1 },
];
export const TACOS = [0, 0.05, 0.1, 0.15, 0.2, 0.25];

export function avgReturn(st: FloorSettings) {
  const sold = st.skus.reduce((a, x) => a + x.sold, 0);
  return sold ? st.skus.reduce((a, x) => a + x.returned, 0) / sold : 0.18;
}

export function returnRate(x: FloorSku, st: FloorSettings) {
  return !x.sold || x.sold < st.global.minSample ? avgReturn(st) : x.returned / x.sold;
}

export interface Lines {
  cost: number;
  fba: number;
  placement: number;
  transport: number;
  storage: number;
  referral: number;
  closing: number;
  returns: number;
  unsellable: number;
  ads: number;
  gst: number; // GST still to pay on the sale after input credits (0 while credits cover it)
  margin: number;
  credit: number; // input GST left over after paying the sale GST: lost, already inside the costs
  outGst: number; // GST on the sale (5%)
  inGst: number; // GST inside the costs (18%)
}

/** Same lines grouped the way the page shows them. */
export interface Groups { cost: number; amazon: number; returns: number; ads: number; gst: number; margin: number }
export const groupLines = (l: Lines): Groups => ({
  cost: l.cost,
  amazon: l.fba + l.placement + l.transport + l.storage + l.referral + l.closing,
  returns: l.returns + l.unsellable,
  ads: l.ads,
  gst: l.gst,
  margin: l.margin,
});

/** Target margin from settings; older saved settings have none. */
export const marginOf = (st: FloorSettings) => (Number.isFinite(st.global.margin) ? st.global.margin : DEFAULT_GLOBAL.margin);
export const buyGstOf = (st: FloorSettings) => (Number.isFinite(st.global.buyGst) ? st.global.buyGst : DEFAULT_GLOBAL.buyGst);

/** Product cost split as production reports it: materials (before GST) and conversion (overheads, no GST). */
export interface CostIn { material: number; conversion: number }
export const costIn = (p: ProductCost | null | undefined): CostIn | null =>
  p?.cost == null ? null : { material: p.material ?? p.cost - (p.conversion ?? 0), conversion: p.conversion ?? 0 };
/** Product cost with the GST paid on materials. */
export const grossCost = (c: CostIn, st: FloorSettings) => c.material * (1 + buyGstOf(st)) + c.conversion;

/**
 * Lowest GST-inclusive price that leaves `margin` (share of the price) after product cost,
 * Amazon fees, returns, ads and any GST not covered by input credits. margin = 0 gives break-even.
 */
export function solve(x: FloorSku, st: FloorSettings, c: CostIn, unsellable: number | null, tacos: number, margin = marginOf(st)): { price: number; lines: Lines } {
  const g = st.global;
  const b = buyGstOf(st);
  const cost = grossCost(c, st);
  const r = unsellable === null ? 0 : Math.min(returnRate(x, st), 0.9);
  const u = unsellable || 0;
  const k = r / (1 - r);
  const sent = x.inbound ?? g.placement + g.transport;
  const inbound = sent + g.storage;
  const base = cost + x.fba + inbound + k * (x.fba + x.admin) + k * u * (cost + inbound + g.removal);
  const net = 1 / (1 + g.gst);
  const ads = tacos * (1 + b); // ad spend is billed with 18% GST on top
  // ads + margin (+ referral) can eat the whole price: then no price works
  const lo = 1 - ads - margin;
  const hi = lo - x.refPct;
  let price = Infinity;
  let above = false;
  let extra = 0; // sale GST the input credits don't cover
  let inGst = 0;
  let outGst = 0;
  for (let i = 0; i < 30; i++) {
    price = lo > 0 ? (base + extra + g.closeLo) / lo : Infinity;
    above = false;
    if (price >= g.band) {
      price = hi > 0 ? Math.max(g.band, (base + extra + g.closeHi) / hi) : Infinity;
      above = true;
    }
    if (!Number.isFinite(price)) break;
    // Amazon fees (incl. their GST): fulfilment, inbound, storage, referral, closing, wasted on returns, removal
    const amazon = x.fba + inbound + (above ? x.refPct * price + g.closeHi : g.closeLo) + k * (x.fba + x.admin) + k * u * (inbound + g.removal);
    inGst = (amazon * b) / (1 + b) + b * c.material * (1 + k * u) + b * tacos * price;
    outGst = price - price * net;
    const next = Math.max(0, outGst - inGst);
    if (Math.abs(next - extra) < 0.005) { extra = next; break; }
    extra = next;
  }
  const lines: Lines = {
    cost,
    fba: x.fba,
    placement: x.inbound != null ? 0 : g.placement,
    transport: x.inbound != null ? x.inbound : g.transport,
    storage: g.storage,
    referral: above ? x.refPct * price : 0,
    closing: above ? g.closeHi : g.closeLo,
    returns: k * (x.fba + x.admin),
    unsellable: k * u * (cost + inbound + g.removal),
    ads: ads * price,
    gst: extra,
    margin: 0,
    credit: Math.max(0, inGst - outGst),
    outGst,
    inGst,
  };
  const spent = lines.cost + lines.fba + lines.placement + lines.transport + lines.storage + lines.referral + lines.closing + lines.returns + lines.unsellable + lines.ads + lines.gst;
  lines.margin = price - spent;
  return { price, lines };
}

/**
 * Fold a new fee report into the settings: matched ASINs get fresh prices, units,
 * returns and fees (only where the report actually charged that fee); new ASINs
 * are added unmapped; the product mapping is never touched.
 */
export function mergeReport(st: FloorSettings, rep: FeeReport): { settings: FloorSettings; updated: string[]; added: string[] } {
  const updated: string[] = [];
  const added: string[] = [];
  const skus = st.skus.map((x) => ({ ...x }));
  for (const r of rep.rows) {
    if (!r.sold) continue;
    let x = skus.find((k) => k.asin === r.asin);
    if (!x) {
      x = { asin: r.asin, name: r.name.slice(0, 40), sku: r.sku, item: '', asp: 0, sold: 0, returned: 0, fba: 0, admin: 129.8, refPct: 0.1, tacos: null, inbound: null, reportId: null };
      skus.push(x);
      added.push(r.asin);
    } else updated.push(r.asin);
    x.sold = r.sold;
    x.returned = r.returned;
    if (r.asp) x.asp = r.asp;
    if (r.fba != null) x.fba = r.fba;
    if (r.admin != null) x.admin = r.admin;
    if (r.refPct != null) x.refPct = r.refPct;
    if (r.inbound != null) x.inbound = r.inbound;
    x.tacos = r.tacos;
    x.reportId = rep.id;
  }
  const g = { ...st.global };
  for (const k of ['placement', 'transport', 'storage'] as const) {
    const v = rep.observed[k];
    if (v != null && v > 0) g[k] = v;
  }
  return { settings: { ...st, global: g, skus }, updated, added };
}

export const rs = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`);
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
