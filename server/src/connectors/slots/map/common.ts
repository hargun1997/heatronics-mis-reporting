// Shared helpers for the slot mappers (pure). Rules copied from the client's
// upload parsers (client/src/data/liveMis/uploadParsers.ts) so an API pull and
// the file it replaces give identical facts — keep them in step.

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[(),₹\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export const str = (v: unknown): string => String(v ?? '').trim();

/** "YYYY-MM" → first / last ISO day of the month. */
export function monthDays(periodKey: string): { first: string; last: string } {
  const [y, m] = periodKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Bad period "${periodKey}" — expected YYYY-MM.`);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first: `${periodKey}-01`, last };
}

/** Today in India, 'YYYY-MM-DD'. */
export const istToday = (now = Date.now()) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);

export const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The month's last day, or today when the month is still running (an export's range end). */
export function rangeEnd(periodKey: string, now = Date.now()): string {
  const { last } = monthDays(periodKey);
  const today = istToday(now);
  return last < today ? last : today;
}

/** Base Amazon MSKU (uploadParsers amazonBaseSku): XX-XXXX-XXXX, name / -FBM suffix stripped. */
export function amazonBaseSku(sku: string): { base: string; name: string } {
  const m = sku.match(/^([A-Za-z0-9]{2}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4})(.*)$/);
  if (!m) return { base: sku.trim(), name: '' };
  const name = m[2].replace(/^[-\s]+/, '').replace(/[-\s]*FBM$/i, '').trim();
  return { base: m[1].toUpperCase(), name };
}

/** Channel of a Shiprocket shipment from its Channel Order Id (uploadParsers shiprocketChannel). */
export function shiprocketChannel(orderId: string): string {
  const s = orderId.toUpperCase();
  if (/D2C|SHOPIFY/.test(s)) return 'D2C';
  if (/AMAZON|AMZ|FB[AM]/.test(s)) return 'Amazon';
  if (/BLINK/.test(s)) return 'Blinkit';
  if (/FLIP/.test(s)) return 'Flipkart';
  return 'D2C';
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * A date cell → 'YYYY-MM-DD' (Indian day-first for numeric strings). Handles a
 * spreadsheet serial (days since 1899-12-30; Google Sheets uses the same epoch),
 * ISO, "12-Oct-2026" / "12 Oct 2026", "12-10-2026" / "12/10/2026" (DD-MM-YYYY)
 * and "2026-10-12 14:33:00". '' when unreadable.
 */
export function isoDay(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86_400_000);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = str(raw);
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s,]+(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return '';
  // Free text ("Oct 1, 2026") parses in local time: read the local calendar day, not the UTC one.
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
