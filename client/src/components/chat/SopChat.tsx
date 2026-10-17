// ----------------------------------------------------------------------------
// SOP chat — a floating "Ask about the SOPs" widget shown on the SOP pages.
// Grounded in the same handbook knowledge pack that now backs the SOPs, so the
// accountant and the CA can ask clarifications (it cites the handbook sections
// the SOPs were built from). Reads only; it can't change anything.
// ----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { HANDBOOK_CONTEXT } from '../../data/chat/handbookContext';
import { chatStatus, sendChat, type ChatMessage } from '../../data/chat/chatClient';
import { Markdown } from '../ui/Markdown';

const SUGGESTIONS = [
  'How does a Shopify COD order get cleared?',
  'Walk me through the daily Tranzact → Tally push.',
  'What are the statutory dates in the monthly close?',
  'Why must Easebuzz never be fetched for the same dates twice?',
  'What does the monthly Amazon expense JV do?',
];

const iconChat = (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 01-13.5 7.8L3 21l1.2-4.5A9 9 0 1121 12z" />
  </svg>
);
const iconClose = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const iconSend = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function SopChat() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || loadedOnce) return;
    setLoadedOnce(true);
    chatStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, [open, loadedOnce]);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || loading || configured === false) return;
    setError(null);
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await sendChat(HANDBOOK_CONTEXT, next, 'handbook');
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed.');
      setMessages(next);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Ask about the SOPs'}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 flex items-center justify-center hover:bg-brand-600 hover:scale-105 active:scale-95 transition-all"
      >
        {open ? iconClose : iconChat}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[min(92vw,400px)] h-[min(72vh,620px)] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-brand-500/5 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-brand-500 text-white flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 leading-tight">Ask about the SOPs</div>
              <div className="text-[10px] text-slate-400 leading-tight">Grounded in how the books are wired · cites sections · reads only</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="ml-auto text-slate-400 hover:text-slate-700">{iconClose}</button>
          </div>

          {configured === false && (
            <div className="px-3 py-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100">
              Claude API key isn’t set on the server, so chat can’t run. Set <span className="font-mono">ANTHROPIC_API_KEY</span>.
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="py-4">
                <p className="text-center text-xs text-slate-400 mb-3">Ask about a task, a journal, a control ledger, or a known issue.</p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => void ask(s)} disabled={configured === false}
                      className="block w-full text-left px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-brand-300 disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500 text-white px-3 py-2 text-sm whitespace-pre-wrap'
                  : 'max-w-[92%] rounded-2xl rounded-bl-sm bg-slate-50 border border-slate-100 px-3 py-2'}>
                  {m.role === 'user' ? m.content : <Markdown text={m.content} />}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-slate-50 border border-slate-100 px-3 py-2 text-sm text-slate-400 flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                  Reading the SOPs…
                </div>
              </div>
            )}
            {error && <p className="text-[11px] text-rose-700 px-1">{error}</p>}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-100 p-2.5">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }}
                rows={1}
                placeholder={configured === false ? 'Chat unavailable' : 'Ask about the SOPs…'}
                disabled={configured === false || loading}
                className="flex-1 resize-none max-h-28 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-300 disabled:bg-slate-50"
              />
              <button
                onClick={() => void ask(input)}
                disabled={!input.trim() || loading || configured === false}
                aria-label="Send"
                className="w-9 h-9 flex-shrink-0 rounded-xl bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 disabled:opacity-40"
              >
                {iconSend}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
