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
  | 'legal'
  | 'mca'
  | 'iso'
  | 'hr'
  | 'investors'
  | 'admin';

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

/** "2026-04" style key used for monthly progress buckets. */
export type YearMonth = string;

export interface ProgressEntry {
  completed: boolean;
  completedAt?: string;
  note?: string;
}

/** progress[itemId][yearMonth] = entry */
export type ProgressMap = Record<string, Record<YearMonth, ProgressEntry>>;

export const CATEGORY_META: Record<
  ComplianceCategoryKey,
  { name: string; accent: 'brand' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose'; blurb: string }
> = {
  accounts: {
    name: 'Accounts',
    accent: 'brand',
    blurb: 'GST, TDS, income tax, TCS — the finance team\u2019s statutory to-do.',
  },
  legal: {
    name: 'Legal',
    accent: 'rose',
    blurb: 'Licenses, contracts, trademarks, litigation.',
  },
  mca: {
    name: 'MCA / ROC',
    accent: 'violet',
    blurb: 'Companies Act filings, board meetings, statutory registers.',
  },
  iso: {
    name: 'ISO / QMS',
    accent: 'sky',
    blurb: 'Internal audits, MRM, document control, calibration.',
  },
  hr: {
    name: 'HR & Payroll',
    accent: 'emerald',
    blurb: 'Payroll, PF/ESI, appraisals, policy refresh.',
  },
  investors: {
    name: 'Investors',
    accent: 'amber',
    blurb: 'Monthly updates, board decks, cap table, FEMA.',
  },
  admin: {
    name: 'Admin',
    accent: 'brand',
    blurb: 'Office, insurance, utilities, vehicles, backups.',
  },
};

export const ALL_CATEGORIES: ComplianceCategoryKey[] = [
  'accounts',
  'legal',
  'mca',
  'iso',
  'hr',
  'investors',
  'admin',
];
