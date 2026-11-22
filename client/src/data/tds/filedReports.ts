// The TDS reports the accounts team filed for FY 2026-27 ("Tds Report <month>.xlsx", shared by the founder on
// 22 Nov 2026): block totals only (no party rows: the repo is public). History compares each month's report built
// from Tally with these; a month that differs is flagged. Add a month here when the team files it.
import type { ReportBlockId } from './tdsFormats';

export interface FiledReport {
  month: string;
  /** TDS DEDUCT total of each block, as in the team's file. */
  blocks: Partial<Record<ReportBlockId, number>>;
  /** TOTAL PAYABLE / NET PAYABLE lines of the file (may carry their own adjustments). */
  totalPayable: number;
  netPayable?: number;
  /** Adjustments the team made by hand in the summary (shown with the month). */
  notes?: string[];
}

export const FILED_REPORTS: FiledReport[] = [
  { month: '2026-04', blocks: { professional: 31362.34, rent: 35000, commission: 216.98, others: 48604.02, jobwork: 3412.67 }, totalPayable: 118596 },
  { month: '2026-05', blocks: { professional: 384367.32, rent: 35000, commission: 151.65, others: 45054.88, jobwork: 2851.99 }, totalPayable: 467425.84, netPayable: 466311,
    notes: ['Already paid ₹1,115 taken off (Elite Traders bill 3024, also listed in April).'] },
  { month: '2026-06', blocks: { professional: 174700.33, rent: 35000, commission: 0, others: 26284.95, jobwork: 5962.71 }, totalPayable: 241883,
    notes: ['₹65 extra paid to Facebook in May taken off Advertisement.', 'Commission rows have no amounts in the file.'] },
  { month: '2026-07', blocks: { professional: 27768.29, rent: 35000, commission: 246.26, others: 33287.63, jobwork: 3152.83 }, totalPayable: 99455.01, netPayable: 99455.01 },
  { month: '2026-08', blocks: { professional: 9026.67, rent: 35000, commission: 53.67, others: 22174.33, jobwork: 2313.91 }, totalPayable: 68568.57, netPayable: 68568.57 },
  { month: '2026-09', blocks: { professional: 8008.27, rent: 35000, commission: 35.13, others: 32821.79, jobwork: 3619.68 }, totalPayable: 79484.87, netPayable: 79484.87 },
  { month: '2026-10', blocks: { professional: 12084.94, rent: 35000, commission: 31.01, others: 14004.22, jobwork: 970.75 }, totalPayable: 62090.92, netPayable: 62090.92 },
];

export const filedFor = (month: string) => FILED_REPORTS.find((f) => f.month === month) ?? null;
/** Σ of the filed blocks (before any hand adjustment in the summary). */
export const filedTotal = (f: FiledReport) => Math.round(Object.values(f.blocks).reduce((s, v) => s + (v ?? 0), 0) * 100) / 100;

/** Block by block: built from Tally vs filed. Blocks within ₹1 match (rounding). */
export function compareFiled(built: Record<ReportBlockId, number>, f: FiledReport) {
  const rows = (Object.keys(f.blocks) as ReportBlockId[]).map((id) => {
    const filed = f.blocks[id] ?? 0, tally = built[id] ?? 0;
    return { id, filed, tally, diff: Math.round((tally - filed) * 100) / 100 };
  });
  const diff = Math.round(rows.reduce((s, r) => s + r.diff, 0) * 100) / 100;
  return { rows, diff, matches: rows.every((r) => Math.abs(r.diff) <= 1) };
}
