// ----------------------------------------------------------------------------
// Fact stream — the shape a runtime (DRR/WRR/MRR) MIS rolls up.
//
// A connector's fetchPeriod returns a whole-month rollup, which is right for
// the close. A live run-rate view needs the same numbers resolved to the day
// they happened, so run-rate at Daily / Weekly / Monthly and slices by Channel
// / SKU / SKU×Channel all fall out of one aggregation. That dated row is a
// DailyFact; connectors that can date their data emit a stream of them.
// ----------------------------------------------------------------------------

/** One source's activity on one day, optionally for one SKU. */
export interface DailyFact {
  /** Connector id that produced this, e.g. 'shopify'. */
  source: string;
  /** Sales channel this belongs to, e.g. 'D2C', 'Amazon'. */
  channel: string;
  /** Calendar day the activity happened, 'YYYY-MM-DD'. */
  date: string;
  /** Variant SKU or, when blank upstream, a title key. Omitted for SKU-less costs. */
  sku?: string;
  skuName?: string;
  /** Whether `sku` is a real SKU or a title fallback. */
  skuKind?: 'sku' | 'title';
  revenue: number;
  units: number;
  orders: number;
  /** Channel/fulfilment fees attributable here, always a positive cost. */
  fees: number;
  /** Advertising spend, from the ad-platform connectors. Positive cost. */
  spend?: number;
}

export interface FactResult {
  facts: DailyFact[];
  warnings: string[];
  /** Human-readable steps the connector ran, for the readiness page. */
  trace?: string[];
}

export type Granularity = 'day' | 'week' | 'month';
export type Dimension = 'total' | 'channel' | 'sku' | 'sku_channel';

export interface Metrics {
  revenue: number;
  units: number;
  orders: number;
  fees: number;
  /** Advertising spend. */
  spend: number;
  /** revenue − fees. */
  net: number;
  /** revenue / orders, or 0 when no orders. */
  aov: number;
  /** Marketing efficiency ratio: revenue / spend, or 0 when no spend. */
  mer: number;
}

export interface Bucket extends Metrics {
  /** Period key: 'YYYY-MM-DD' (day), 'YYYY-Www' (ISO week), or 'YYYY-MM' (month). */
  period: string;
  /** Dimension key within the period, e.g. channel name or SKU. '' for total. */
  key: string;
  channel?: string;
  sku?: string;
}

// ---- Period keys -----------------------------------------------------------

/** ISO-8601 week key, e.g. "2026-W32", so weeks sort and group correctly. */
function isoWeekKey(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  // Thursday of this week decides the ISO year.
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3);
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function periodKeyFor(dateISO: string, g: Granularity): string {
  if (g === 'day') return dateISO;
  if (g === 'month') return dateISO.slice(0, 7);
  return isoWeekKey(dateISO);
}

// ---- Rollup ----------------------------------------------------------------

function dimKey(f: DailyFact, dim: Dimension): { key: string; channel?: string; sku?: string } {
  switch (dim) {
    case 'channel':
      return { key: f.channel, channel: f.channel };
    case 'sku':
      return { key: f.sku ?? '(no sku)', sku: f.sku };
    case 'sku_channel':
      return { key: `${f.channel} · ${f.sku ?? '(no sku)'}`, channel: f.channel, sku: f.sku };
    default:
      return { key: '' };
  }
}

/** Aggregate facts into period × dimension buckets, sorted by period then key. */
export function rollup(facts: DailyFact[], g: Granularity, dim: Dimension): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const f of facts) {
    const period = periodKeyFor(f.date, g);
    const d = dimKey(f, dim);
    const id = `${period}||${d.key}`;
    let b = map.get(id);
    if (!b) {
      b = { period, key: d.key, channel: d.channel, sku: d.sku, revenue: 0, units: 0, orders: 0, fees: 0, spend: 0, net: 0, aov: 0, mer: 0 };
      map.set(id, b);
    }
    b.revenue += f.revenue;
    b.units += f.units;
    b.orders += f.orders;
    b.fees += f.fees;
    b.spend += f.spend ?? 0;
  }
  const out = [...map.values()];
  for (const b of out) {
    b.revenue = round(b.revenue);
    b.fees = round(b.fees);
    b.spend = round(b.spend);
    b.net = round(b.revenue - b.fees);
    b.aov = b.orders > 0 ? round(b.revenue / b.orders) : 0;
    b.mer = b.spend > 0 ? round(b.revenue / b.spend) : 0;
  }
  out.sort((a, b) => (a.period === b.period ? a.key.localeCompare(b.key) : a.period.localeCompare(b.period)));
  return out;
}

/** Totals across every fact, for the KPI tiles. */
export function totals(facts: DailyFact[]): Metrics {
  const m: Metrics = { revenue: 0, units: 0, orders: 0, fees: 0, spend: 0, net: 0, aov: 0, mer: 0 };
  for (const f of facts) {
    m.revenue += f.revenue;
    m.units += f.units;
    m.orders += f.orders;
    m.fees += f.fees;
    m.spend += f.spend ?? 0;
  }
  m.revenue = round(m.revenue);
  m.fees = round(m.fees);
  m.spend = round(m.spend);
  m.net = round(m.revenue - m.fees);
  m.aov = m.orders > 0 ? round(m.revenue / m.orders) : 0;
  m.mer = m.spend > 0 ? round(m.revenue / m.spend) : 0;
  return m;
}

const round = (n: number) => Math.round(n * 100) / 100;
