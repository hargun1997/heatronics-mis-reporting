// ----------------------------------------------------------------------------
// Booking assistant — the accountant asks "which ledger / which voucher / how
// do I cut this entry?" and gets a clear answer grounded in:
//   · Hargun's expense → ledger map (right panel, editable here),
//   · the Accounts Handbook (sent as context, like the handbook chat),
//   · booking history (ingested Tally reports + a saved Day Book export),
//   · the Tally master ledger list, and
//   · whatever invoice / report is attached to the question.
// Left: the conversation. Right: the ledger map. Everything is in-page.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
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
  type AssistantStatus,
  type BookingMessage,
  type ChatAttachment,
  type ExpenseMapRow,
} from '../../data/bookingAssistant/bookingClient';
import { LedgerMapPanel } from './LedgerMapPanel';

const STARTERS = [
  { q: 'Which ledger for a Google Ads invoice?', hint: 'Ledger + GST + TDS' },
  { q: 'How do I book the Amazon monthly fees with TDS and TCS?', hint: 'Full voucher' },
  { q: 'Shiprocket weekly bill — which voucher?', hint: 'Voucher type' },
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

const iconBook = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4z M4 9h16 M9 9v10 M13 13h4 M13 16h4" />
  </svg>
);
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

  useEffect(() => persistChat(messages), [messages]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [messages, loading]);

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
      const { reply, dropped } = await sendBookingChat(thread, handbookChatContext(), tallyLedgersForPrompt(tally.master));
      const note = dropped.length ? `\n\nNot read (too large or unsupported): ${dropped.join(', ')}.` : '';
      setMessages((m) => [...m, { role: 'assistant', content: reply + note }]);
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
      setHistoryNote(`Saved “${saved.fileName}” as booking history (${saved.chars.toLocaleString('en-IN')} chars). Every answer now checks it.`);
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
    <div className="tasks-ui min-h-full bg-[#f7f6f3]">
      <PageHeader
        title="Booking assistant"
        description="Ask which ledger, which voucher and how to cut the entry. Answers follow Hargun’s ledger map, the Accounts Handbook and past bookings — and say “to confirm” when they can’t be sure."
        icon={iconBook}
        crumbs={[{ label: 'Guides' }, { label: 'Booking assistant' }]}
        actions={
          <Link to="/tools/expense-booking" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-[#0b1220] hover:border-brand-400 hover:text-brand-700">
            Tally XML export tool →
          </Link>
        }
      />

      {/* Mobile: switch between the two panes */}
      <div className="mx-auto mt-3 flex max-w-[1500px] gap-1 px-4 lg:hidden" role="tablist">
        {(['chat', 'map'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={mobileTab === t}
            onClick={() => setMobileTab(t)}
            className={`flex-1 rounded-lg py-2 text-[13.5px] font-semibold ${mobileTab === t ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
          >
            {t === 'chat' ? 'Ask' : `Ledger map${status?.needsInfo ? ` · ${status.needsInfo} need info` : ''}`}
          </button>
        ))}
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 sm:px-6 lg:h-[calc(100vh-15.5rem)] lg:min-h-[620px] lg:grid-cols-[minmax(0,1fr)_400px] lg:px-8">
        {/* ---------------- chat ---------------- */}
        <section
          aria-label="Ask the booking assistant"
          className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} h-[calc(100vh-13rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card lg:flex lg:h-auto lg:min-h-0`}
        >
          <ContextStrip status={status} tallyLabel={tally.master ? `${tally.master.ledgers?.length ?? 0} ledgers · ${tally.source === 'override' ? 'uploaded master' : 'bundled master'}` : tally.loading ? 'loading…' : 'not loaded'} onForget={savedUpload ? forgetHistory : undefined} />

          {notConfigured && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-950">
              <strong className="font-semibold">Claude isn’t connected on this server yet</strong> — questions will return an error until{' '}
              <span className="font-mono">ANTHROPIC_API_KEY</span> is set. The ledger map works now.
            </div>
          )}

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
                    <AssistantTurn text={m.content} />
                  )}
                </li>
              ))}
              {loading && (
                <li className="flex items-center gap-2.5 text-[13.5px] text-slate-700">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  Checking the ledger map, handbook and history…
                </li>
              )}
            </ol>
            <div ref={endRef} />
          </div>

          {/* composer */}
          <div className="border-t border-slate-200 bg-[#fbfaf8] px-3 py-3 sm:px-4">
            {historyNote && <p className="mb-2 text-[12.5px] text-slate-700">{historyNote}</p>}
            {attachError && <p className="mb-2 text-[12.5px] text-rose-700">{attachError}</p>}
            {pending.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pending.map((a) => (
                  <AttachmentChip key={a.id} a={a} onRemove={() => setPending((p) => p.filter((x) => x.id !== a.id))} />
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
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
                className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-[13px] font-medium text-[#0b1220] hover:border-brand-400 hover:text-brand-700"
                title="Attach an invoice (PDF / image) or a Tally export (xlsx / csv / xml)"
              >
                {iconClip}
                <span className="hidden sm:inline">Attach</span>
              </button>
              <label className="flex-1">
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
                  placeholder="e.g. Bitespeed invoice ₹11,800 incl. GST — which ledger and TDS?"
                  className="block max-h-36 min-h-[40px] w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-[14px] leading-snug text-[#0b1220] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                />
              </label>
              <button
                type="button"
                onClick={() => void ask(input)}
                disabled={loading || (!input.trim() && !pending.length)}
                aria-label="Ask"
                className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 text-[13.5px] font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
              >
                Ask {iconSend}
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[12px] text-slate-500">
              <span>Enter to ask · Shift+Enter for a new line · attach invoices or a Tally Day Book</span>
              {messages.length > 0 && (
                <button type="button" onClick={newThread} className="font-medium text-slate-600 hover:text-[#0b1220]">
                  New question
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ---------------- ledger map ---------------- */}
        <div className={`${mobileTab === 'map' ? 'block' : 'hidden'} h-[calc(100vh-13rem)] min-h-[520px] lg:block lg:h-auto lg:min-h-0`}>
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

function ContextStrip({ status, tallyLabel, onForget }: { status: AssistantStatus | null; tallyLabel: string; onForget?: () => void }) {
  const history = status?.history ?? [];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-200 px-4 py-2.5 text-[12.5px] text-slate-700 sm:px-6">
      <span className="font-semibold uppercase tracking-wide text-slate-500">Grounded in</span>
      <Source on label="Ledger map" detail={status ? `${status.mapRows} rows${status.needsInfo ? ` · ${status.needsInfo} need info` : ''}` : '…'} />
      <Source on label="Handbook" detail="full text" />
      <Source on={tallyLabel !== 'not loaded'} label="Tally master" detail={tallyLabel} />
      <Source
        on={history.length > 0}
        label="Booking history"
        detail={history.length ? history.map((h) => h.label).join(' · ') : 'none yet — attach a Day Book'}
      />
      {onForget && (
        <button type="button" onClick={onForget} className="text-slate-500 underline-offset-2 hover:text-rose-700 hover:underline">
          forget saved export
        </button>
      )}
    </div>
  );
}

function Source({ on, label, detail }: { on: boolean; label: string; detail: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-600' : 'bg-slate-300'}`} aria-hidden="true" />
      <span className="font-medium text-[#0b1220]">{label}</span>
      <span className="text-slate-600">{detail}</span>
    </span>
  );
}

function EmptyState({ onAsk, disabled }: { onAsk: (q: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto max-w-2xl py-6">
      <h2 className="text-[19px] font-semibold text-[#0b1220]">What are you booking?</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-slate-700">
        Describe the bill, or attach the invoice. You’ll get the voucher type, the Dr/Cr lines with GST and TDS, a narration to paste,
        and the handbook section it comes from.
      </p>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
        {STARTERS.map((s) => (
          <button
            key={s.q}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(s.q)}
            className="group rounded-xl border border-slate-200 bg-[#fbfaf8] p-3.5 text-left hover:border-brand-400 hover:bg-white disabled:opacity-50"
          >
            <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-brand-700">{s.hint}</span>
            <span className="mt-1 block text-[14px] font-medium leading-snug text-[#0b1220]">{s.q}</span>
          </button>
        ))}
      </div>
      <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-3.5 text-[13px] leading-relaxed text-slate-700">
        <strong className="font-semibold text-[#0b1220]">Tip — give it your history.</strong> Export a Tally <em>Day Book</em> or{' '}
        <em>Ledger Vouchers</em> report to Excel, attach it, and choose <em>Keep as booking history</em>. Every later answer then checks how
        the same vendor was booked before.
      </div>
    </div>
  );
}

function UserTurn({ m, onKeep }: { m: BookingMessage; onKeep: (a: ChatAttachment) => void }) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-slate-900 px-4 py-2.5 text-[14px] leading-relaxed text-white">{m.content}</div>
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

function AssistantTurn({ text }: { text: string }) {
  return (
    <article className="booking-answer rounded-xl border border-slate-200 border-l-[3px] border-l-brand-500 bg-white px-4 py-3 sm:px-5 [&_li]:text-[14px] [&_li]:text-[#1e293b] [&_p]:text-[14px] [&_p]:text-[#1e293b] [&_strong]:text-[#0b1220] [&_h4]:text-[14px] [&_h4]:text-[#0b1220] [&_td]:text-[13.5px] [&_td]:text-[#0b1220]">
      <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-brand-700">Booking advice</div>
      <Markdown text={text} />
      <CopyButton text={text} />
    </article>
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
      className="mt-2 text-[12.5px] font-medium text-slate-600 hover:text-[#0b1220]"
    >
      {copied ? 'Copied' : 'Copy answer'}
    </button>
  );
}

function ErrorTurn({ error, onRetry }: { error: { message: string; code?: string }; onRetry?: () => void }) {
  const noKey = error.code === 'no_api_key';
  return (
    <div className={`rounded-xl border px-4 py-3 ${noKey ? 'border-amber-300 bg-amber-50' : 'border-rose-200 bg-rose-50'}`}>
      <div className={`text-[14px] font-semibold ${noKey ? 'text-amber-950' : 'text-rose-900'}`}>
        {noKey ? 'Claude isn’t connected yet' : 'That didn’t go through'}
      </div>
      <p className={`mt-1 text-[13.5px] leading-relaxed ${noKey ? 'text-amber-950' : 'text-rose-900'}`}>{error.message}</p>
      {noKey && (
        <p className="mt-1.5 text-[13px] text-amber-900">
          Meanwhile: check the ledger map on the right, or open the{' '}
          <Link to="/handbook" className="font-medium underline">Accounts Handbook</Link>.
        </p>
      )}
      {onRetry && !noKey && (
        <button type="button" onClick={onRetry} className="mt-2 rounded-md bg-white px-2.5 py-1 text-[13px] font-medium text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100">
          Try again
        </button>
      )}
    </div>
  );
}

function AttachmentChip({ a, onRemove, onKeep }: { a: ChatAttachment; onRemove?: () => void; onKeep?: () => void }) {
  const tag = a.kind === 'pdf' ? 'PDF' : a.kind === 'image' ? 'IMG' : a.isTallyExport ? 'TALLY' : 'DATA';
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-300 bg-white py-1 pl-1.5 pr-2 text-[12.5px] text-[#0b1220]">
      <span className={`rounded px-1 py-px text-[10.5px] font-bold tracking-wide ${a.kind === 'text' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{tag}</span>
      <span className="max-w-[180px] truncate font-medium" title={a.name}>{a.name}</span>
      <span className="text-slate-500">{a.meta}</span>
      {onKeep && (
        <button type="button" onClick={onKeep} className="font-medium text-brand-700 hover:underline" title="Save this export so every answer checks it">
          Keep as booking history
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${a.name}`} className="text-slate-500 hover:text-rose-700">
          ✕
        </button>
      )}
    </span>
  );
}
