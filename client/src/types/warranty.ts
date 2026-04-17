export type WarrantyStatus = 'new' | 'in-progress' | 'approved' | 'rejected' | 'completed' | 'shipped';

export const WARRANTY_STATUSES: WarrantyStatus[] = ['new', 'in-progress', 'approved', 'rejected', 'completed', 'shipped'];

export const STATUS_LABELS: Record<WarrantyStatus, string> = {
  'new': 'New',
  'in-progress': 'In Progress',
  'approved': 'Approved',
  'rejected': 'Rejected',
  'completed': 'Completed',
  'shipped': 'Shipped',
};

export const STATUS_COLORS: Record<WarrantyStatus, { bg: string; text: string; border: string; dot: string }> = {
  'new': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-400' },
  'in-progress': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-400' },
  'approved': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  'rejected': { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-400' },
  'completed': { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30', dot: 'bg-slate-400' },
  'shipped': { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/30', dot: 'bg-violet-400' },
};

export interface WarrantyCase {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  productName: string;
  serialNumber?: string;
  purchaseDate?: string;
  issueDescription: string;
  status: WarrantyStatus;
  createdAt: string;
  updatedAt: string;
  rejectedAt?: string;
  approvedAt?: string;
  completedAt?: string;
  shippedAt?: string;
  rejectionReason?: string;
  notes?: string;
  isDuplicate?: boolean;
  linkedCaseId?: string;
}

export interface WarrantyStorageData {
  version: string;
  lastUpdated: string;
  cases: WarrantyCase[];
}

export function generateWarrantyId(): string {
  return `WC_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function computeTicketAge(c: WarrantyCase): number {
  const start = new Date(c.createdAt).getTime();
  let end: number;
  if (c.status === 'completed' && c.completedAt) {
    end = new Date(c.completedAt).getTime();
  } else if (c.status === 'rejected' && c.rejectedAt) {
    end = new Date(c.rejectedAt).getTime();
  } else if (c.status === 'shipped' && c.shippedAt) {
    end = new Date(c.shippedAt).getTime();
  } else {
    end = Date.now();
  }
  return Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
}

export function formatDate(isoString?: string): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
