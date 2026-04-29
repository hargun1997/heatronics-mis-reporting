import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';

type VendorOrigin = 'Indian' | 'Foreign' | 'Unknown';
type PaymentTiming = 'Advance' | 'Prepaid' | 'OnCredit' | 'PaidNow' | 'Unknown';
type YesNoRcm = 'Yes' | 'No' | 'RCM' | 'Unknown';
type YesNo = 'Yes' | 'No' | 'Unknown';

interface BookingLine {
  dr_or_cr: 'Dr' | 'Cr';
  ledger: string;
  amount: number | null;
  notes?: string;
}

interface ExpenseAdvice {
  summary: string;
  voucherType: string;
  billSeries?: string | null;
  lines: BookingLine[];
  costCentre?: string;
  gstTreatment?: string;
  tdsTreatment?: string;
  followUp?: {
    when: string;
    voucherType: string;
    lines: BookingLine[];
    notes?: string;
  } | null;
  warnings?: string[];
  invoiceExtract?: {
    vendor?: string;
    gstin?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    amount?: number;
    gstAmount?: number;
    currency?: string;
  } | null;
}

interface TallyMaster {
  costCentres?: string[];
  ledgers?: { name: string; group?: string }[];
}

const iconExpense = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h2m4 0h6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
  </svg>
);

export function ExpenseBooking() {
  const [master, setMaster] = useState<TallyMaster | null>(null);
  const [masterErr, setMasterErr] = useState<string | null>(null);

  const [vendorOrigin, setVendorOrigin] = useState<VendorOrigin>('Unknown');
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>('Unknown');
  const [gstApplicable, setGstApplicable] = useState<YesNoRcm>('Unknown');
  const [tdsApplicable, setTdsApplicable] = useState<YesNo>('Unknown');
  const [costCentre, setCostCentre] = useState('');
  const [paidFrom, setPaidFrom] = useState('');
  const [notes, setNotes] = useState('');

  interface Attachment {
    id: string;
    data: string;
    mime: string;
    previewUrl: string;
    fileName: string;
    isPdf: boolean;
  }

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<ExpenseAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/data/tally/master.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Master fetch failed (${r.status})`);
        return r.json();
      })
      .then(setMaster)
      .catch((e) => setMasterErr(e.message || 'Failed to load Tally master'));
  }, []);

  function onPickFiles(files: FileList) {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        const isPdf = mime === 'application/pdf';
        setAttachments((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            data: base64,
            mime,
            previewUrl: result,
            fileName: file.name || (isPdf ? 'document.pdf' : 'photo.jpg'),
            isPdf,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function onSubmit() {
    if (!master) {
      setError('Tally master not loaded yet.');
      return;
    }
    setLoading(true);
    setError(null);
    setAdvice(null);
    try {
      const res = await fetch('/api/expense-booking/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tallyMaster: master,
          answers: {
            vendorOrigin,
            paymentTiming,
            gstApplicable,
            tdsApplicable,
            costCentre: costCentre || undefined,
            paidFrom: paidFrom || undefined,
            notes: notes || undefined,
          },
          attachments: attachments.map((a) => ({ data: a.data, mime: a.mime })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data: ExpenseAdvice = await res.json();
      setAdvice(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader title="Expense Booking" accent="emerald" icon={iconExpense} />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {masterErr && (
          <Banner tone="rose">Tally master could not be loaded: {masterErr}</Banner>
        )}

        {/* 1. Invoice attachments */}
        <Section
          title="1. Invoice"
          subtitle="Optional. Add multiple pages or a PDF — the AI reads them as one document."
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onPickFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <div className="flex flex-col gap-3">
            {attachments.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {attachments.map((a, i) => (
                  <div
                    key={a.id}
                    className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50"
                  >
                    {a.isPdf ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 px-2">
                        <svg className="h-8 w-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-[10px] font-medium uppercase tracking-wider">PDF</span>
                        <span className="text-[10px] truncate w-full text-center px-1">{a.fileName}</span>
                      </div>
                    ) : (
                      <img src={a.previewUrl} alt={`page ${i + 1}`} className="w-full h-full object-cover" />
                    )}
                    <span className="absolute bottom-1 left-1 text-[10px] font-semibold bg-white/90 rounded px-1.5 py-0.5 text-slate-700">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      aria-label="Remove attachment"
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 border border-slate-200 hover:bg-white text-slate-700 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-white py-4 text-sm text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
            >
              {attachments.length === 0 ? 'Take photo / pick image or PDF' : 'Add another page'}
            </button>
          </div>
        </Section>

        {/* 2. Scenario */}
        <Section title="2. Scenario">
          <ChipRow
            label="Vendor origin"
            value={vendorOrigin}
            options={[
              ['Indian', 'Indian'],
              ['Foreign', 'Foreign'],
              ['Unknown', '?'],
            ]}
            onChange={(v) => setVendorOrigin(v as VendorOrigin)}
          />
          <ChipRow
            label="Payment timing"
            value={paymentTiming}
            options={[
              ['PaidNow', 'Paid now'],
              ['Advance', 'Advance'],
              ['Prepaid', 'Prepaid'],
              ['OnCredit', 'On credit'],
              ['Unknown', '?'],
            ]}
            onChange={(v) => setPaymentTiming(v as PaymentTiming)}
          />
          <ChipRow
            label="GST"
            value={gstApplicable}
            options={[
              ['Yes', 'Yes'],
              ['No', 'No'],
              ['RCM', 'RCM'],
              ['Unknown', '?'],
            ]}
            onChange={(v) => setGstApplicable(v as YesNoRcm)}
          />
          <ChipRow
            label="TDS"
            value={tdsApplicable}
            options={[
              ['Yes', 'Yes'],
              ['No', 'No'],
              ['Unknown', '?'],
            ]}
            onChange={(v) => setTdsApplicable(v as YesNo)}
          />
        </Section>

        {/* 3. Hints */}
        <Section title="3. Hints (optional)">
          <Field label="Cost centre">
            <select
              value={costCentre}
              onChange={(e) => setCostCentre(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— let AI decide —</option>
              {(master?.costCentres || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Paid from">
            <select
              value={paidFrom}
              onChange={(e) => setPaidFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— let AI decide —</option>
              {(master?.ledgers || [])
                .filter((l) => l.group === 'Bank Accounts' || l.group === 'Cash-in-hand')
                .map((l) => (
                  <option key={l.name} value={l.name}>{l.name}</option>
                ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything not visible on the invoice"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </Field>
        </Section>

        <button
          onClick={onSubmit}
          disabled={loading || !master}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-medium py-3 text-sm"
        >
          {loading ? 'Asking AI…' : 'Get booking instructions'}
        </button>

        {error && <Banner tone="rose">{error}</Banner>}
        {advice && <AdviceCard advice={advice} />}
      </div>
    </>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
      {children}
    </label>
  );
}

function ChipRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-600 mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, lbl]) => {
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
              }`}
            >
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'rose' | 'amber' | 'emerald'; children: React.ReactNode }) {
  const map: Record<string, string> = {
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm ${map[tone]}`}>{children}</div>;
}

function AdviceCard({ advice }: { advice: ExpenseAdvice }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5 space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
          Booking instruction
        </div>
        <div className="text-sm font-medium text-slate-900 mt-0.5">{advice.summary}</div>
      </div>

      <KV label="Voucher type" value={advice.voucherType} />
      {advice.billSeries && <KV label="Bill series" value={advice.billSeries} />}
      {advice.costCentre && <KV label="Cost centre" value={advice.costCentre} />}

      <LinesTable lines={advice.lines} />

      {advice.gstTreatment && <Note label="GST">{advice.gstTreatment}</Note>}
      {advice.tdsTreatment && <Note label="TDS">{advice.tdsTreatment}</Note>}

      {advice.followUp && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">
            Follow-up entry
          </div>
          <div className="text-xs text-amber-900 mt-0.5">{advice.followUp.when}</div>
          <div className="mt-2">
            <KV label="Voucher" value={advice.followUp.voucherType} />
            <LinesTable lines={advice.followUp.lines} />
            {advice.followUp.notes && (
              <div className="text-xs text-slate-700 mt-2">{advice.followUp.notes}</div>
            )}
          </div>
        </div>
      )}

      {advice.warnings && advice.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">
            Check before posting
          </div>
          <ul className="mt-1 list-disc list-inside text-xs text-amber-900 space-y-0.5">
            {advice.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {advice.invoiceExtract && (
        <details className="rounded-lg border border-slate-200 bg-white p-3">
          <summary className="text-xs font-medium text-slate-700 cursor-pointer">
            Extracted from invoice
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {Object.entries(advice.invoiceExtract).map(([k, v]) =>
              v == null ? null : (
                <div key={k} className="contents">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-900">{String(v)}</span>
                </div>
              )
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-xs uppercase tracking-wider text-slate-500 w-24 flex-shrink-0">
        {label}
      </span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function Note({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-xs">
      <span className="uppercase tracking-wider text-slate-500 font-semibold">{label}: </span>
      <span className="text-slate-700">{children}</span>
    </div>
  );
}

function LinesTable({ lines }: { lines: BookingLine[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
          <tr>
            <th className="text-left px-2 py-1.5 w-10">Dr/Cr</th>
            <th className="text-left px-2 py-1.5">Ledger</th>
            <th className="text-right px-2 py-1.5 w-24">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-2 py-1.5">
                <span
                  className={`inline-block w-6 text-center font-semibold rounded ${
                    l.dr_or_cr === 'Dr'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {l.dr_or_cr}
                </span>
              </td>
              <td className="px-2 py-1.5 text-slate-900">
                {l.ledger}
                {l.notes && <span className="block text-[10px] text-slate-500">{l.notes}</span>}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">
                {l.amount == null ? '—' : l.amount.toLocaleString('en-IN')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
