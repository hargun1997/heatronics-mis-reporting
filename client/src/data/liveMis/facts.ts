// ----------------------------------------------------------------------------
// Live run-rate rollup — the browser-side twin of server/connectors/facts.ts.
//
// The server returns a flat DailyFact[]; rolling it up to Daily / Weekly /
// Monthly and slicing by Channel / SKU / SKU×Channel happens here so the
// granularity and dimension toggles are instant and never re-pull the sources.
// Keep this in step with the server copy — same shapes, same period keys.
// ----------------------------------------------------------------------------

export interface DailyFact {
  source: string;
  channel: string;
  date: string;
  sku?: string;
  skuName?: string;
  skuKind?: 'sku' | 'title';
  revenue: number;
  units: number;
  orders: number;
  fees: number;
  spend?: number;
  /** Traffic sources only (Amazon Business Report) — never fed into the P&L. */
  sessions?: number;
  pageViews?: number;
}

export type Granularity = 'day' | 'week' | 'month';
export type Dimension = 'total' | 'channel' | 'sku' | 'sku_channel';

export interface Metrics {
  revenue: number;
  units: number;
  orders: number;
  fees: number;
  spend: number;
  net: number;
  aov: number;
  mer: number;
}

export interface Bucket extends Metrics {
  period: string;
  key: string;
  channel?: string;
  sku?: string;
}

export type MetricKey = keyof Metrics;

function isoWeekKey(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
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

function dimKey(f: DailyFact, dim: Dimension): { key: string; channel?: string; sku?: string } {
  switch (dim) {
    case 'channel':
      return { key: f.channel, channel: f.channel };
    case 'sku':
      return { key: f.skuName || f.sku || '(no sku)', sku: f.sku };
    case 'sku_channel':
      return { key: `${f.channel} · ${f.skuName || f.sku || '(no sku)'}`, channel: f.channel, sku: f.sku };
    default:
      return { key: '' };
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

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

/** Distinct sorted period keys present, for building the run-rate table. */
export function periodsIn(buckets: Bucket[]): string[] {
  return [...new Set(buckets.map((b) => b.period))].sort();
}
