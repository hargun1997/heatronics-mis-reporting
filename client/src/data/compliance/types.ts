export type ComplianceFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'half-yearly'
  | 'yearly'
  | 'one-time';

export type ComplianceCategoryKey =
  | 'accounts'
  | 'admin'
  | 'banking'
  | 'hr'
  | 'investors'
  | 'qc'
  | 'roc';

export interface ComplianceItem {
  /** Stable identifier. Kept stable across edits so progress tracking survives renames. */
  id: string;
  title: string;
  description?: string;
  /** Statutory form name, e.g. "GSTR-1", "Form 24Q". */
  form?: string;
  frequency: ComplianceFrequency;
  /** Day of month (1-31). Optional for daily/weekly/one-time. */
  dueDay?: number;
  /** Specific month (1-12) — used with "yearly". */
  dueMonth?: number;
  /** Specific months (1-12) — used with quarterly/half-yearly. */
  months?: number[];
  /** Who is responsible. */
  owner?: string;
  /** Authority / regulator (Income Tax, GSTN, RBI etc.). */
  authority?: string;
  /** Penalty / interest for non-compliance. */
  penalty?: string;
  /** Any additional notes. */
  notes?: string;
}

export interface ComplianceCategory {
  category: ComplianceCategoryKey;
  name: string;
  description: string;
  version: number;
  updatedAt: string;
  items: ComplianceItem[];
}

/**
 * Progress keys distinguish granularity:
 *   Monthly: "YYYY-MM"              (e.g. "2026-04")
 *   Weekly : "YYYY-MM-W<1-5>"      (e.g. "2026-04-W2")
 *   Daily  : "YYYY-MM-DD"           (e.g. "2026-04-15")
 */
export type PeriodKey = string;

/** Legacy alias retained for compatibility. */
export type YearMonth = PeriodKey;

export interface ProgressEntry {
  completed: boolean;
  completedAt?: string;
  note?: string;
}

/** progress[itemId][periodKey] = entry */
export type ProgressMap = Record<string, Record<PeriodKey, ProgressEntry>>;

export const CATEGORY_META: Record<
  ComplianceCategoryKey,
  { name: string; accent: 'brand' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose'; blurb: string }
> = {
  accounts: {
    name: 'Accounts',
    accent: 'brand',
    blurb: 'GST, TDS, income tax, TCS \u2014 the finance team\u2019s statutory to-do.',
  },
  admin: {
    name: 'Admin',
    accent: 'amber',
    blurb: 'Office, insurance, utilities, vehicles, backups.',
  },
  banking: {
    name: 'Banking',
    accent: 'sky',
    blurb: 'Bank reconciliations, FD renewals, signatories, OD/LC.',
  },
  hr: {
    name: 'HR',
    accent: 'emerald',
    blurb: 'Payroll, PF/ESI, appraisals, policy refresh, POSH.',
  },
  investors: {
    name: 'Investors',
    accent: 'violet',
    blurb: 'Monthly updates, board decks, cap table, FEMA.',
  },
  qc: {
    name: 'QC',
    accent: 'rose',
    blurb: 'Inspection, calibration, NC/CAR, audits, supplier quality.',
  },
  roc: {
    name: 'ROC',
    accent: 'violet',
    blurb: 'Companies Act filings, board meetings, statutory registers.',
  },
};

export const ALL_CATEGORIES: ComplianceCategoryKey[] = [
  'accounts',
  'admin',
  'banking',
  'hr',
  'investors',
  'qc',
  'roc',
];
