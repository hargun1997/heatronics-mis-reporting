// ----------------------------------------------------------------------------
// Booking assistant — the accountant asks "which ledger / which voucher / how
// do I cut this entry?" and gets a clear answer grounded in:
//   · Hargun's expense → ledger map (right panel, editable here),
//   · the Accounts Handbook (sent as context, like the handbook chat),
//   · booking history (ingested Tally reports + a saved Day Book export),
//   · the Tally master ledger list, and
//   · whatever invoice / report is attached to the question.
// Since 23 Nov 2026 the server also reads the invoice first (vendor, GSTIN, amounts), finds the party in the live Tally
// masters and its past vouchers in the stored Day Books, and checks every ledger of the answer against the masters.
// The page shows that as an "Invoice read" card and a "Based on" line above the answer. Phones: the Photo button opens
// the back camera; photos are shrunk to 2000 px JPEG before they are sent.
// Left: the conversation. Right: the ledger map. Everything is in-page.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { dayLabel, inrFull } from '../../utils/money';
import { PageHeader } from '../../components/ui/PageHeader';
import { Popover } from '../../components/ui/overlays';
import { BTN, BTN_PRIMARY } from '../../components/ui/states';
import { Markdown } from '../../components/ui/Markdown';
import { handbookChatContext } from '../../data/handbook/handbook';
import { useTallyMaster } from '../../data/tally/useTallyMaster';
import {
  AssistantError,
  clearHistory,
  fileToAttachment,
  getMap,
  getStatus,
  saveHistory,
  saveMap,
  sendBookingChat,
  tallyLedgersForPrompt,
  type AnswerMeta,
  type AssistantStatus,
  type BookingMessage,
  type InvoiceRead,
  type ChatAttachment,
  type ExpenseMapRow,
} from '../../data/bookingAssistant/bookingClient';
import { LedgerMapPanel } from './LedgerMapPanel';
import { StatusPill } from '../../components/ui/StatusPill';
import { pillClass } from '../../components/ui/pill';

const STARTERS = [
  { q: 'Which ledger for a Google Ads invoice?', hint: 'Ledger, GST, TDS' },
  { q: 'How do I book the Amazon monthly fees with TDS and TCS?', hint: 'Full voucher' },
  { q: 'We paid a vendor an advance of ₹50,000 in October. The bill of ₹59,000 with GST came in November. Give each entry.', hint: 'A case: several entries' },
  { q: 'A new software tool bills us in USD every month. Do we need a new ledger? Give the ledger settings.', hint: 'New ledger' },
];

const CHAT_LS_KEY = 'heatronics.booking-assistant.chat.v1';

function loadChat(): BookingMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as BookingMessage[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function persistChat(messages: BookingMessage[]) {
  try {
    // Drop binary payloads — they would blow the quota and are not needed to reread the thread.
    const slim = messages.map((m) => ({
      ...m,
      attachments: m.attachments?.map((a) => ({ ...a, data: undefined, text: a.text && a.text.length > 20000 ? undefined : a.text })),
    }));
    localStorage.setItem(CHAT_LS_KEY, JSON.stringify(slim.slice(-40)));
  } catch {
    /* quota / private mode — the thread still works in memory */
  }
}

const iconClip = (
  <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
  </svg>
);
const iconSend = (
  <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function BookingAssistantPage() {
  const tally = useTallyMaster();
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [rows, setRows] = useState<ExpenseMapRow[] | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapSaving, setMapSaving] = useState(false);
  const [mapSaveError, setMapSaveError] = useState<string | null>(null);
  const [mapSavedAt, setMapSavedAt] = useState<string | null>(null);

  const [messages, setMessages] = useState<BookingMessage[]>(() => loadChat());
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyNote, setHistoryNote] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'chat' | 'map'>('chat');

  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(() => {
    getStatus().then(setStatus).catch(() => setStatus((s) => s ?? { configured: false, mapRows: 0, needsInfo: 0, history: [] }));
  }, []);

  useEffect(() => {
    refreshStatus();
    getMap()
      .then((d) => {
        setRows(d.rows);
        setMapSavedAt(d.updatedAt);
      })
      .catch((e: unknown) => setMapError(e instanceof Error ? e.message : 'Failed to load.'));
  }, [refreshStatus]);

  useEffect(() => { persistChat(messages); }, [messages]);
  // Braces: newer Chrome returns a Promise from scrollIntoView, and an effect may only return a clean-up function.
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading]);

  const onSaveMap = async (next: ExpenseMapRow[]): Promise<boolean> => {
    setMapSaving(true);
    setMapSaveError(null);
    try {
      const doc = await saveMap(next);
      setRows(doc.rows);
      setMapSavedAt(doc.updatedAt);
      refreshStatus();
      return true;
    } catch (e) {
      setMapSaveError(e instanceof Error ? e.message : 'Save failed.');
      return false;
    } finally {
      setMapSaving(false);
    }
  };

  const onPick = async (files: FileList | null) => {
    if (!files?.length) return;
    setAttachError(null);
    for (const f of Array.from(files)) {
      try {
        const a = await fileToAttachment(f);
        setPending((p) => [...p, a]);
      } catch (e) {
        setAttachError(e instanceof Error ? e.message : `Could not read ${f.name}.`);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    if (photoRef.current) photoRef.current.value = '';
  };

  const ask = async (text: string, atts: ChatAttachment[] = pending, base: BookingMessage[] = messages) => {
    const q = text.trim();
    if ((!q && !atts.length) || loading) return;
    const userMsg: BookingMessage = {
      role: 'user',
      content: q || 'How should I book this? Read the attachment.',
      ...(atts.length ? { attachments: atts } : {}),
    };
    const thread = [...base.filter((m) => !m.error), userMsg];
    setMessages([...base, userMsg]);
    setInput('');
    setPending([]);
    setLoading(true);
    setMobileTab('chat');
    try {
      const { reply, dropped, meta } = await sendBookingChat(thread, handbookChatContext(), tallyLedgersForPrompt(tally.master));
      const note = dropped.length ? `\n\nNot read (too large or unsupported): ${dropped.join(', ')}.` : '';
      setMessages((m) => [...m, { role: 'assistant', content: reply + note, meta }]);
    } catch (e) {
      const err = e instanceof AssistantError ? e : new AssistantError(e instanceof Error ? e.message : 'The assistant failed.');
      setMessages((m) => [...m, { role: 'assistant', content: '', error: { message: err.message, code: err.code } }]);
    } finally {
      setLoading(false);
    }
  };

  const keepAsHistory = async (a: ChatAttachment) => {
    if (!a.text) return;
    setHistoryNote(null);
    try {
      const saved = await saveHistory(a.name, a.text);
      setHistoryNote(`Saved “${saved.fileName}” as booking history (${saved.chars.toLocaleString('en-IN')} characters). Each answer now reads it.`);
      refreshStatus();
    } catch (e) {
      setHistoryNote(e instanceof Error ? `Could not save: ${e.message}` : 'Could not save.');
    }
  };

  const forgetHistory = async () => {
    try {
      await clearHistory();
      setHistoryNote('Saved booking history removed.');
      refreshStatus();
    } catch (e) {
      setHistoryNote(e instanceof Error ? e.message : 'Could not remove.');
    }
  };

  const prefill = (q: string) => {
    setInput(q);
    setMobileTab('chat');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const newThread = () => {
    setMessages([]);
    setPending([]);
    setInput('');
  };

  const notConfigured = status?.configured === false;
  const savedUpload = status?.history.find((h) => h.kind === 'upload');

  return (
    <div className="tasks-ui min-h-full">
      <PageHeader
        title="Book an invoice"
        description="Ask for the ledger, the voucher and the GST of an invoice."
        status={notConfigured ? <StatusPill toneName="warning" size="sm" title="Set ANTHROPIC_API_KEY on the server. The ledger map works.">Claude not connected</StatusPill> : undefined}
        help={<><p>Each answer reads the ledger map, the Accounts Handbook, the live Tally ledgers and groups, and the party’s past vouchers in the stored Tally Day Books (12 months).</p><p>Invoice: select Photo on a phone, or Attach for a PDF. Take the whole page, flat, in good light. Add more pages to the same question.</p><p>A case with no invoice: write what happened. The answer gives each entry in order and any new ledger.</p></>}
        actions={<Link to="/tools/expense-booking" className={BTN}>Tally XML tool</Link>}
      />

      {/* Phones: switch between the two panes */}
      <div className="mx-auto flex max-w-page gap-1 px-4 sm:px-6 lg:hidden" role="group" aria-label="Pane">
        {(['chat', 'map'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={mobileTab === t} onClick={() => setMobileTab(t)}
            className={`min-h-11 flex-1 rounded-lg text-label font-semibold ${mobileTab === t ? 'bg-white font-semibold text-slate-900 ring-1 ring-slate-300' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
            {t === 'chat' ? 'Ask' : `Ledger map${status?.needsInfo ? ` · ${status.needsInfo} need info` : ''}`}
          </button>
        ))}
      </div>

      <div className="mx-auto grid max-w-page gap-4 px-4 py-4 sm:px-6 lg:h-[calc(100vh-7.5rem)] lg:min-h-[560px] lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8 lg:pt-0">
        {/* ---------------- chat ---------------- */}
        <section
          aria-label="Ask the booking assistant"
          className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} h-[calc(100vh-12rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card lg:flex lg:h-auto lg:min-h-0`}
        >
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-1.5">
            <ContextPill status={status} tallyLabel={tally.master ? `${tally.master.ledgers?.length ?? 0} ledgers · ${tally.source === 'override' ? 'uploaded master' : 'bundled master'}` : tally.loading ? 'loading…' : 'not loaded'} onForget={savedUpload ? forgetHistory : undefined} />
            {messages.length > 0 && <button type="button" onClick={newThread} className={BTN}>New question</button>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.length === 0 && !loading && <EmptyState onAsk={(q) => void ask(q)} disabled={loading} />}

            <ol className="space-y-5">
              {messages.map((m, i) => (
                <li key={i}>
                  {m.role === 'user' ? (
                    <UserTurn m={m} onKeep={keepAsHistory} />
                  ) : m.error ? (
                    <ErrorTurn error={m.error} onRetry={i === messages.length - 1 ? () => {
                      const lastUser = messages[messages.length - 2];
                      if (lastUser?.role === 'user') {
                        void ask(lastUser.content, lastUser.attachments?.filter((a) => a.data || a.text) ?? [], messages.slice(0, -2));
                      }
                    } : undefined} />
                  ) : (
                    <AssistantTurn text={m.content} meta={m.meta} />
                  )}
                </li>
              ))}
              {loading && (
                <li className="flex items-center gap-2.5 text-label text-slate-700">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
                  {messages[messages.length - 1]?.attachments?.some((a) => a.kind !== 'text')
                    ? 'Reading the invoice, then the Tally books…'
                    : 'Reading the ledger map, Handbook and Tally books…'}
                </li>
              )}
            </ol>
            <div ref={endRef} />
          </div>

          {/* composer */}
          <div className="border-t border-slate-200 px-3 py-3 sm:px-4">
            {historyNote && <p className="mb-2 text-label text-slate-700">{historyNote}</p>}
            {attachError && <p className="mb-2 text-label text-red-700">{attachError}</p>}
            {pending.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pending.map((a) => (
                  <AttachmentChip key={a.id} a={a} onRemove={() => setPending((p) => p.filter((x) => x.id !== a.id))} />
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void onPick(e.target.files)}
              />
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                className={`${BTN} min-h-11 shrink-0 sm:hidden`}
                aria-label="Take a photo of the invoice"
              >
                <Camera className="h-[18px] w-[18px]" aria-hidden="true" />
                Photo
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,image/*,.xlsx,.xls,.csv,.xml,.txt"
                className="hidden"
                onChange={(e) => void onPick(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={`${BTN} min-h-11 shrink-0`}
                aria-label="Attach an invoice or a Tally export"
                title="Attach an invoice (PDF, image) or a Tally export (xlsx, csv, xml)"
              >
                {iconClip}
                <span className="hidden sm:inline">Attach</span>
              </button>
              <label className="order-first basis-full sm:order-none sm:basis-auto sm:flex-1">
                <span className="sr-only">Your question</span>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void ask(input);
                    }
                  }}
                  rows={1}
                  placeholder="Type the bill, or write a case: what happened and the amounts"
                  className="block max-h-36 min-h-11 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-snug text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </label>
              <button
                type="button"
                onClick={() => void ask(input)}
                disabled={loading || (!input.trim() && !pending.length)}
                className={`${BTN_PRIMARY} ml-auto min-h-11 shrink-0 sm:ml-0`}
              >
                Ask {iconSend}
              </button>
            </div>
            <p className="mt-1.5 hidden text-xs text-slate-600 sm:block">Enter = ask · Shift+Enter = new line</p>
          </div>
        </section>

        {/* ---------------- ledger map ---------------- */}
        <div className={`${mobileTab === 'map' ? 'block' : 'hidden'} h-[calc(100vh-12rem)] min-h-[480px] lg:block lg:h-auto lg:min-h-0`}>
          <LedgerMapPanel
            rows={rows}
            loadError={mapError}
            saving={mapSaving}
            saveError={mapSaveError}
            savedAt={mapSavedAt}
            onSave={onSaveMap}
            onAsk={prefill}
          />
        </div>
      </div>
    </div>
  );
}

// ---- pieces -------------------------------------------------------------------

function ContextPill({ status, tallyLabel, onForget }: { status: AssistantStatus | null; tallyLabel: string; onForget?: () => void }) {
  const history = status?.history ?? [];
  const items = [
    { on: true, label: 'Ledger map', detail: status ? `${status.mapRows} rows${status.needsInfo ? ` · ${status.needsInfo} need info` : ''}` : '…' },
    { on: true, label: 'Handbook', detail: 'Full text' },
    { on: tallyLabel !== 'not loaded', label: 'Tally ledger list', detail: tallyLabel },
    { on: history.length > 0, label: 'Booking history', detail: history.length ? history.map((h) => h.label).join(' · ') : 'None yet. Attach a Day Book.' },
  ];
  const on = items.filter((i) => i.on).length;
  return (
    <Popover align="left" width={320} buttonLabel={`Answers read ${on} of ${items.length} sources`}
      buttonClassName="inline-flex min-h-11 sm:min-h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      button={<><span className={`h-1.5 w-1.5 rounded-full ${on === items.length ? 'bg-emerald-600' : 'bg-amber-500'}`} aria-hidden="true" />Reads {on} of {items.length} sources</>}>
      <ul className="space-y-2 p-3.5 text-label">
        {items.map((i) => (
          <li key={i.label} className="flex items-start gap-2">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${i.on ? 'bg-emerald-600' : 'bg-slate-300'}`} aria-hidden="true" />
            <span><span className="font-medium text-slate-900">{i.label}</span><span className="block text-slate-600">{i.detail}</span></span>
          </li>
        ))}
        {onForget && <li><button type="button" onClick={onForget} className={`${BTN} w-full`}>Remove the saved export</button></li>}
      </ul>
    </Popover>
  );
}

function EmptyState({ onAsk, disabled }: { onAsk: (q: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto max-w-2xl py-6">
      <h2 className="text-lg font-semibold text-slate-900">What do you book?</h2>
      <p className="mt-1 text-sm text-slate-600">Take a photo of the invoice, attach the PDF, or write a case. The answer gives each voucher, the Dr and Cr lines, GST, TDS and any new ledger.</p>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button
            key={s.q}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(s.q)}
            className="group rounded-xl border border-slate-200 bg-white p-3.5 text-left hover:border-accent-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <span className="block text-xs font-semibold text-accent-700">{s.hint}</span>
            <span className="mt-1 block text-sm font-medium leading-snug text-slate-900">{s.q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserTurn({ m, onKeep }: { m: BookingMessage; onKeep: (a: ChatAttachment) => void }) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-md bg-slate-900 px-4 py-2.5 text-sm leading-relaxed text-white">{m.content}</div>
      {m.attachments && m.attachments.length > 0 && (
        <div className="mt-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {m.attachments.map((a) => (
            <AttachmentChip key={a.id} a={a} onKeep={a.kind === 'text' && a.text ? () => onKeep(a) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssistantTurn({ text, meta }: { text: string; meta?: AnswerMeta }) {
  const missing = meta?.ledgerCheck?.missing ?? [];
  return (
    <div className="space-y-2">
      {meta?.invoice && <InvoiceCard inv={meta.invoice} />}
      <article className="booking-answer overflow-x-auto rounded-xl border border-slate-200 border-l-[3px] border-l-accent-500 bg-white px-4 py-3 sm:px-5 [&_li]:text-sm [&_li]:text-slate-800 [&_p]:text-sm [&_p]:text-slate-800 [&_strong]:text-slate-900 [&_h4]:text-sm [&_h4]:text-slate-900 [&_td]:text-label [&_td]:text-slate-900">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-accent-700">Booking advice</span>
          <BooksUsed meta={meta} />
          {meta?.ledgerCheck && meta.ledgerCheck.checked > 0 && (
            missing.length ? (
              <Popover align="left" width={300} buttonLabel={`${missing.length} ledger names not in Tally`}
                buttonClassName={pillClass('warning')}
                button={<>! {missing.length} not in Tally</>}>
                <div className="space-y-2 p-3.5 text-label text-slate-800">
                  <p>These names are not in the Tally ledger list. Check the spelling, or create the ledger first.</p>
                  <ul className="list-disc space-y-0.5 pl-4">{missing.map((n) => <li key={n}>{n}</li>)}</ul>
                </div>
              </Popover>
            ) : (
              <StatusPill toneName="positive" size="sm" dot title="Each ledger in the tables is in the Tally ledger list">Ledgers in Tally</StatusPill>
            )
          )}
        </div>
        <Markdown text={text} />
        <CopyButton text={text} />
      </article>
    </div>
  );
}

const gstOf = (inv: InvoiceRead) => (inv.cgst ?? 0) + (inv.sgst ?? 0) + (inv.igst ?? 0);

/** The figures read from the photo / PDF, and whether they add up. */
function InvoiceCard({ inv }: { inv: InvoiceRead }) {
  const gst = gstOf(inv);
  const parts = [inv.taxable, inv.cgst, inv.sgst, inv.igst].some((v) => typeof v === 'number');
  const sum = (inv.taxable ?? 0) + gst + (inv.tcs ?? 0) + (inv.roundOff ?? 0);
  const adds = typeof inv.total === 'number' && parts ? Math.abs(sum - inv.total) <= 2 : null;
  const cells: [string, string][] = [
    ['Vendor', inv.vendor || 'Not read'],
    ['GSTIN', inv.vendorGstin || 'None'],
    ['Invoice no.', inv.invoiceNo || 'Not read'],
    ['Date', inv.invoiceDate ? dayWithYear(inv.invoiceDate) : 'Not read'],
    ['Taxable', inv.taxable != null ? inrFull(inv.taxable) : 'Not read'],
    [inv.igst ? 'IGST' : 'CGST + SGST', gst ? inrFull(gst) : '₹0'],
    ['Total', inv.total != null ? inrFull(inv.total) : 'Not read'],
  ];
  return (
    <section aria-label="Invoice read" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-slate-700">Invoice read</span>
        {inv.docType && <StatusPill size="sm">{inv.docType}</StatusPill>}
        {adds === true && <StatusPill toneName="positive" size="sm" dot>Adds up</StatusPill>}
        {adds === false && <StatusPill toneName="warning" size="sm" dot title={`Taxable + GST + TCS + round off = ${inrFull(sum)}`}>Does not add up</StatusPill>}
        {inv.reverseCharge && <StatusPill toneName="warning" size="sm">Reverse charge</StatusPill>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {cells.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-slate-600">{k}</dt>
            <dd className="truncate text-label font-medium tabular-nums text-slate-900" title={v}>{v}</dd>
          </div>
        ))}
      </dl>
      {inv.nature && <p className="mt-2 text-label text-slate-700">{inv.nature}</p>}
      {inv.notes && <p className="mt-1 text-label text-amber-800">{inv.notes}</p>}
    </section>
  );
}

/** "2026-11-21" → "21 Nov 2026" (vouchers span a year, so the year shows). */
const dayWithYear = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${dayLabel(iso)} ${iso.slice(0, 4)}` : dayLabel(iso));

/** "Based on: <party>, N past vouchers" with the list behind it. */
function BooksUsed({ meta }: { meta?: AnswerMeta }) {
  const e = meta?.evidence;
  if (!e) return null;
  const n = e.partyVouchers.length;
  const label = e.party
    ? `${e.party.name}: ${n ? `${n} past voucher${n === 1 ? '' : 's'}` : 'no past vouchers'}`
    : meta?.invoice?.vendor ? 'Party not in Tally' : `${e.similar} similar voucher${e.similar === 1 ? '' : 's'}`;
  const tone = e.party ? 'neutral' : meta?.invoice?.vendor ? 'warning' : 'neutral';
  return (
    <Popover align="left" width={360} buttonLabel={`Based on ${label}`} buttonClassName={pillClass(tone)} button={<>{label}</>}>
      <div className="space-y-2 p-3.5 text-label text-slate-800">
        {e.party ? (
          <p>Party ledger <span className="font-semibold">{e.party.name}</span>, found by {e.party.how === 'gstin' ? 'GSTIN' : 'name'}{e.party.gstin ? ` (${e.party.gstin})` : ''}.</p>
        ) : (
          <p>{meta?.invoice?.vendor ? `No party ledger for ${meta.invoice.vendor}. The answer gives a new party ledger.` : 'No party named.'}</p>
        )}
        {e.fy && <p>This financial year: {inrFull(e.fy.total)} in {e.fy.count} bill{e.fy.count === 1 ? '' : 's'}.</p>}
        {n > 0 && (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {e.partyVouchers.map((v) => (
              <li key={`${v.date}-${v.number}`} className="rounded-md bg-slate-50 px-2 py-1">
                <span className="font-medium">{dayWithYear(v.date)} · {v.type} {v.number}</span>
                <span className="block break-words text-xs text-slate-600">{v.line}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-600">
          {e.similar} similar voucher{e.similar === 1 ? '' : 's'} also read.
          {e.periods.length ? ` Day Books ${dayLabel(e.periods[0])} to ${dayLabel(e.periods[e.periods.length - 1])}.` : ' No stored Day Books.'}
        </p>
      </div>
    </Popover>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="mt-2 min-h-11 sm:min-h-8 rounded-md px-1 text-label font-medium text-slate-600 hover:text-slate-900"
    >
      {copied ? 'Copied' : 'Copy answer'}
    </button>
  );
}

function ErrorTurn({ error, onRetry }: { error: { message: string; code?: string }; onRetry?: () => void }) {
  const noKey = error.code === 'no_api_key';
  return (
    <div className={`rounded-xl border px-4 py-3 ${noKey ? 'border-amber-300 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
      <div className={`text-sm font-semibold ${noKey ? 'text-amber-950' : 'text-red-900'}`}>
        {noKey ? 'Claude is not connected' : 'Unable to get an answer'}
      </div>
      <p className={`mt-1 text-label leading-relaxed ${noKey ? 'text-amber-950' : 'text-red-900'}`}>{error.message}</p>
      {noKey && (
        <p className="mt-1.5 text-label text-amber-900">
          Until then, use the ledger map, or open the{' '}
          <Link to="/handbook" className="font-medium underline">Accounts Handbook</Link>.
        </p>
      )}
      {onRetry && !noKey && (
        <button type="button" onClick={onRetry} className="mt-2 min-h-11 sm:min-h-8 rounded-md bg-white px-2.5 text-label font-medium text-red-900 ring-1 ring-red-200 hover:bg-red-100">
          Try again
        </button>
      )}
    </div>
  );
}

function AttachmentChip({ a, onRemove, onKeep }: { a: ChatAttachment; onRemove?: () => void; onKeep?: () => void }) {
  const tag = a.kind === 'pdf' ? 'PDF' : a.kind === 'image' ? 'IMG' : a.isTallyExport ? 'TALLY' : 'DATA';
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-300 bg-white py-1 pl-1.5 pr-2 text-label text-slate-900">
      <span className={`rounded px-1 py-px text-xs font-bold ${a.kind === 'text' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{tag}</span>
      <span className="max-w-[180px] truncate font-medium" title={a.name}>{a.name}</span>
      <span className="text-slate-500">{a.meta}</span>
      {onKeep && (
        <button type="button" onClick={onKeep} className="font-medium text-accent-700 hover:underline" title="Save this export so each answer checks it">
          Keep as booking history
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${a.name}`} className="text-slate-500 hover:text-red-700">
          ✕
        </button>
      )}
    </span>
  );
}
