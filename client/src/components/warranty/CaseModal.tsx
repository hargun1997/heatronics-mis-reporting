import React, { useEffect, useMemo, useState } from 'react';
import {
  WarrantyCase,
  WarrantyStatus,
  WARRANTY_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  computeTicketAge,
  formatDate,
} from '../../types/warranty';
import {
  addWarrantyCase,
  updateWarrantyCase,
} from '../../utils/warrantyStorage';
import {
  findCustomerHistory,
  findPotentialDuplicates,
} from '../../utils/warrantyDuplicateDetector';

interface CaseModalProps {
  mode: 'create' | 'edit';
  existingCase?: WarrantyCase;
  allCases: WarrantyCase[];
  onClose: () => void;
  onSaved: () => void;
}

type FormState = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  productName: string;
  serialNumber: string;
  purchaseDate: string;
  issueDescription: string;
  status: WarrantyStatus;
  rejectionReason: string;
  notes: string;
};

function caseToForm(c?: WarrantyCase): FormState {
  return {
    customerName: c?.customerName || '',
    customerPhone: c?.customerPhone || '',
    customerEmail: c?.customerEmail || '',
    productName: c?.productName || '',
    serialNumber: c?.serialNumber || '',
    purchaseDate: c?.purchaseDate || '',
    issueDescription: c?.issueDescription || '',
    status: c?.status || 'new',
    rejectionReason: c?.rejectionReason || '',
    notes: c?.notes || '',
  };
}

export function CaseModal({ mode, existingCase, allCases, onClose, onSaved }: CaseModalProps) {
  const [form, setForm] = useState<FormState>(caseToForm(existingCase));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live duplicate/history detection as user types
  const customerHistory = useMemo(() => {
    const phone = form.customerPhone.trim();
    const email = form.customerEmail.trim();
    const history: WarrantyCase[] = [];
    if (phone.replace(/\D/g, '').length >= 10) {
      history.push(...findCustomerHistory(phone, allCases));
    }
    if (email.includes('@')) {
      const byEmail = findCustomerHistory(email, allCases);
      for (const c of byEmail) {
        if (!history.find(h => h.id === c.id)) history.push(c);
      }
    }
    return history.filter(c => c.id !== existingCase?.id);
  }, [form.customerPhone, form.customerEmail, allCases, existingCase?.id]);

  const potentialDuplicates = useMemo(() => {
    if (!form.customerPhone.trim() || !form.productName.trim()) return [];
    const probe: WarrantyCase = {
      id: existingCase?.id || '__new__',
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerEmail: form.customerEmail || undefined,
      productName: form.productName,
      issueDescription: form.issueDescription,
      status: form.status,
      createdAt: existingCase?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return findPotentialDuplicates(probe, allCases, 40);
  }, [form, allCases, existingCase]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    if (!form.customerName.trim()) { setError('Customer name is required'); return; }
    if (!form.customerPhone.trim()) { setError('Customer phone is required'); return; }
    if (!form.productName.trim()) { setError('Product name is required'); return; }
    if (!form.issueDescription.trim()) { setError('Issue description is required'); return; }

    setSaving(true);
    try {
      const payload = {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        customerEmail: form.customerEmail.trim() || undefined,
        productName: form.productName.trim(),
        serialNumber: form.serialNumber.trim() || undefined,
        purchaseDate: form.purchaseDate || undefined,
        issueDescription: form.issueDescription.trim(),
        status: form.status,
        rejectionReason: form.rejectionReason.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };

      if (mode === 'create') {
        await addWarrantyCase(payload);
      } else if (existingCase) {
        await updateWarrantyCase(existingCase.id, payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const showRejectionReason = form.status === 'rejected';

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-start sm:items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl my-4 sm:my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              {mode === 'create' ? 'New Warranty Case' : 'Edit Warranty Case'}
            </h2>
            {existingCase && (
              <p className="text-xs text-slate-500 mt-0.5">
                ID: {existingCase.id} · Age: {computeTicketAge(existingCase)}d
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 max-h-[calc(100vh-12rem)] overflow-hidden">
          {/* Left: Form (2 cols) */}
          <div className="lg:col-span-2 p-6 overflow-y-auto">
            {error && (
              <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Customer Section */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Customer</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Name" required>
                    <input
                      type="text"
                      value={form.customerName}
                      onChange={e => set('customerName', e.target.value)}
                      className={inputCls}
                      placeholder="e.g. Rajesh Kumar"
                    />
                  </Field>
                  <Field label="Phone" required>
                    <input
                      type="tel"
                      value={form.customerPhone}
                      onChange={e => set('customerPhone', e.target.value)}
                      className={inputCls}
                      placeholder="10-digit number"
                    />
                  </Field>
                  <Field label="Email" className="sm:col-span-2">
                    <input
                      type="email"
                      value={form.customerEmail}
                      onChange={e => set('customerEmail', e.target.value)}
                      className={inputCls}
                      placeholder="optional"
                    />
                  </Field>
                </div>
              </div>

              {/* Product Section */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Product</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Product Name" required className="sm:col-span-2">
                    <input
                      type="text"
                      value={form.productName}
                      onChange={e => set('productName', e.target.value)}
                      className={inputCls}
                      placeholder="e.g. Heatronics Water Heater 25L"
                    />
                  </Field>
                  <Field label="Serial Number">
                    <input
                      type="text"
                      value={form.serialNumber}
                      onChange={e => set('serialNumber', e.target.value)}
                      className={inputCls}
                      placeholder="optional"
                    />
                  </Field>
                  <Field label="Purchase Date">
                    <input
                      type="date"
                      value={form.purchaseDate}
                      onChange={e => set('purchaseDate', e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>

              {/* Case Section */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Case</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Issue Description" required className="sm:col-span-2">
                    <textarea
                      value={form.issueDescription}
                      onChange={e => set('issueDescription', e.target.value)}
                      className={`${inputCls} min-h-[80px] resize-y`}
                      placeholder="Describe the issue reported by the customer..."
                    />
                  </Field>
                  <Field label="Status">
                    <select
                      value={form.status}
                      onChange={e => set('status', e.target.value as WarrantyStatus)}
                      className={inputCls}
                    >
                      {WARRANTY_STATUSES.map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    {existingCase && existingCase.status !== form.status && (
                      <p className="text-xs text-amber-400 mt-1">
                        Status change will auto-record the date
                      </p>
                    )}
                  </Field>
                  {showRejectionReason && (
                    <Field label="Rejection Reason">
                      <input
                        type="text"
                        value={form.rejectionReason}
                        onChange={e => set('rejectionReason', e.target.value)}
                        className={inputCls}
                        placeholder="e.g. Out of warranty period"
                      />
                    </Field>
                  )}
                  <Field label="Notes" className="sm:col-span-2">
                    <textarea
                      value={form.notes}
                      onChange={e => set('notes', e.target.value)}
                      className={`${inputCls} min-h-[60px] resize-y`}
                      placeholder="Internal notes, shipment details, etc."
                    />
                  </Field>
                </div>
              </div>

              {/* Lifecycle timeline for existing cases */}
              {existingCase && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Lifecycle</h3>
                  <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-xs space-y-1">
                    <LifecycleRow label="Created" date={existingCase.createdAt} color="text-slate-300" />
                    {existingCase.approvedAt && <LifecycleRow label="Approved" date={existingCase.approvedAt} color="text-emerald-400" />}
                    {existingCase.rejectedAt && <LifecycleRow label="Rejected" date={existingCase.rejectedAt} color="text-red-400" />}
                    {existingCase.shippedAt && <LifecycleRow label="Shipped" date={existingCase.shippedAt} color="text-violet-400" />}
                    {existingCase.completedAt && <LifecycleRow label="Completed" date={existingCase.completedAt} color="text-slate-300" />}
                    <LifecycleRow label="Last updated" date={existingCase.updatedAt} color="text-slate-500" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Customer history + duplicates */}
          <div className="border-t lg:border-t-0 lg:border-l border-slate-700 bg-slate-900/40 p-6 overflow-y-auto">
            {/* Potential Duplicates */}
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <span>⚠ Potential Duplicates</span>
                {potentialDuplicates.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded text-[10px]">
                    {potentialDuplicates.length}
                  </span>
                )}
              </h3>
              {potentialDuplicates.length === 0 ? (
                <p className="text-xs text-slate-500">No duplicates detected.</p>
              ) : (
                <div className="space-y-2">
                  {potentialDuplicates.slice(0, 5).map(({ case_, score }) => (
                    <MiniCaseCard key={case_.id} case_={case_} score={score} highlight="amber" />
                  ))}
                </div>
              )}
            </div>

            {/* Customer History */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <span>Customer History</span>
                {customerHistory.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px]">
                    {customerHistory.length}
                  </span>
                )}
              </h3>
              {customerHistory.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {form.customerPhone.trim() || form.customerEmail.trim()
                    ? 'No past cases for this customer.'
                    : 'Enter phone or email to see customer history.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {customerHistory.slice(0, 10).map(c => (
                    <MiniCaseCard key={c.id} case_={c} highlight="slate" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-700 bg-slate-800/80">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Create Case' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helper components
// ============================================================

const inputCls =
  'w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-400 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function LifecycleRow({ label, date, color }: { label: string; date: string; color: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}:</span>
      <span className={color}>{formatDate(date)}</span>
    </div>
  );
}

function MiniCaseCard({
  case_,
  score,
  highlight,
}: {
  case_: WarrantyCase;
  score?: number;
  highlight: 'amber' | 'slate';
}) {
  const sc = STATUS_COLORS[case_.status];
  const borderCls = highlight === 'amber' ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-700 bg-slate-800/50';
  return (
    <div className={`border ${borderCls} rounded-lg p-2 text-xs`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-medium text-slate-100 truncate">{case_.customerName}</span>
        {score !== undefined && (
          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px] font-semibold whitespace-nowrap">
            {score}% match
          </span>
        )}
      </div>
      <div className="text-slate-400 truncate">{case_.productName}</div>
      <div className="flex items-center justify-between mt-1">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${sc.bg} ${sc.text} text-[10px]`}>
          <span className={`w-1 h-1 rounded-full ${sc.dot}`} />
          {STATUS_LABELS[case_.status]}
        </span>
        <span className="text-slate-500 text-[10px]">{formatDate(case_.createdAt)}</span>
      </div>
    </div>
  );
}
