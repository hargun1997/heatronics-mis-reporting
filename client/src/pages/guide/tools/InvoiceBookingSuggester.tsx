import { useMemo, useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Pill } from '../../../components/ui/Card';
import { JournalTable } from '../../../components/ui/SopLayout';
import {
  CHANNELS,
  TxnType,
  Mode,
  PaymentMode,
  SuggesterInput,
  suggest,
} from '../../../data/guide/suggester';

const iconTool = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

const ALL_TXN_TYPES: TxnType[] = ['Sales', 'Purchase', 'Expense', 'Banking', 'Capital Goods', 'Job Work'];

export function InvoiceBookingSuggester() {
  const [txnType, setTxnType] = useState<TxnType>('Sales');
  const [mode, setMode] = useState<Mode>('B2C');
  const [channelId, setChannelId] = useState<string>('amazon');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Prepaid');
  const [party, setParty] = useState('');
  const [hsn, setHsn] = useState('');
  const [gstRate, setGstRate] = useState(18);
  const [amount, setAmount] = useState<number>(1180);
  const [intraState, setIntraState] = useState(true);

  // Filter channels by transaction type
  const availableChannels = useMemo(
    () => CHANNELS.filter((c) => c.supports.includes(txnType)),
    [txnType]
  );

  // Keep channelId valid when txnType changes
  const effectiveChannelId = availableChannels.some((c) => c.id === channelId)
    ? channelId
    : availableChannels[0]?.id || '';

  const channel = CHANNELS.find((c) => c.id === effectiveChannelId);
  const availableModes = channel?.modes || ['B2C'];
  const effectiveMode = availableModes.includes(mode) ? mode : availableModes[0];

  const input: SuggesterInput = {
    txnType,
    mode: effectiveMode,
    channelId: effectiveChannelId,
    paymentMode: channel?.id === 'shopify' ? paymentMode : undefined,
    party: party.trim() || undefined,
    hsn: hsn.trim() || undefined,
    gstRate,
    amount,
    intraState,
  };

  const result = suggest(input);

  return (
    <>
      <PageHeader
        title="Invoice Booking Suggester"
        description="Pick the transaction details and we'll tell you which system to book in, the voucher type, the bill series, the ledger mapping, and the full journal entry — including the clearing-account flow."
        accent="amber"
        icon={iconTool}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Input panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">Transaction details</h3>

            <div className="mt-4 space-y-3">
              <Field label="Transaction type">
                <select
                  value={txnType}
                  onChange={(e) => setTxnType(e.target.value as TxnType)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                >
                  {ALL_TXN_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>

              <Field label="Channel">
                <select
                  value={effectiveChannelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                >
                  {availableChannels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>

              {availableModes.length > 1 && (
                <Field label="Mode">
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white">
                    {availableModes.map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          effectiveMode === m ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {channel?.id === 'shopify' && (
                <Field label="Payment mode">
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white">
                    {(['Prepaid', 'COD', 'Credit'] as PaymentMode[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPaymentMode(p)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          paymentMode === p ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {p === 'Credit' ? 'Prepaid (Snapmint)' : p === 'Prepaid' ? 'Prepaid (Easebuzz)' : p}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              <Field label="Party / Vendor / Customer (optional)">
                <input
                  type="text"
                  placeholder={txnType === 'Sales' ? 'e.g. Blinkit Commerce Pvt Ltd' : 'e.g. ABC Materials Pvt Ltd'}
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </Field>

              <Field label="HSN / SAC (optional)">
                <input
                  type="text"
                  placeholder="e.g. 8481"
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </Field>

              {txnType !== 'Banking' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (incl. tax)">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    />
                  </Field>
                  <Field label="GST %">
                    <select
                      value={gstRate}
                      onChange={(e) => setGstRate(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    >
                      {[0, 5, 12, 18, 28].map((r) => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              {txnType !== 'Banking' && (
                <Field label="Place of supply">
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white">
                    <button
                      onClick={() => setIntraState(true)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        intraState ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Intra-state (CGST + SGST)
                    </button>
                    <button
                      onClick={() => setIntraState(false)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        !intraState ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Inter-state (IGST)
                    </button>
                  </div>
                </Field>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-medium text-slate-700 mb-1">About this suggester</p>
            <p>
              The rules below encode what the finance team has configured as the canonical bookings for each
              channel & txn type. The goal is to remove ambiguity when a new operator is booking an invoice.
              This is guidance, not a replacement for judgement — when in doubt, check with accounts.
            </p>
          </div>
        </div>

        {/* Output panel */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Recommendation</h3>
              <Pill color={result.system === 'Tally' ? 'emerald' : 'brand'}>Book in {result.system}</Pill>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <Cell label="Voucher type" value={result.voucherType} />
              <Cell label="Bill series" value={result.billSeries || '—'} mono />
              <Cell label="Master ledger" value={result.masterLedger} />
              {result.counterParty && <Cell label="Counter-party" value={result.counterParty} />}
              {result.bank && <Cell label="Settles to" value={result.bank} />}
              <Cell label="GST ledgers" value={result.gstLedgers.length > 0 ? result.gstLedgers.join(' · ') : '—'} />
            </div>
          </div>

          {result.journal.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-900">Journal entry</h3>
              <p className="mt-1 text-xs text-slate-500">As the plugin would UPSERT it into Tally.</p>
              <div className="mt-3">
                <JournalTable lines={result.journal} />
              </div>
            </div>
          )}

          {result.clearingExplanation && (
            <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-5">
              <h3 className="text-sm font-semibold text-slate-900">Clearing account flow</h3>
              <p className="mt-2 text-sm text-slate-700 leading-relaxed">{result.clearingExplanation}</p>
            </div>
          )}

          {result.notes.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-900">Notes</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                {result.notes.map((n, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2 w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm font-medium text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}
