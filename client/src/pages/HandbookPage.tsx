// ----------------------------------------------------------------------------
// Accounts Handbook — serves the handbook (client/public/handbook/index.html)
// inside the app with a side "Ask about the handbook" chat panel so the
// accountant and the CA can get clarifications grounded in how the books are
// actually wired. The handbook renders in an iframe (it ships its own styles,
// nav tree and ~30 screenshots); the chat is a React panel beside it.
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HANDBOOK_CONTEXT } from '../data/chat/handbookContext';
import { chatStatus, sendChat, type ChatMessage } from '../data/chat/chatClient';
import { Markdown } from '../components/ui/Markdown';

const HANDBOOK_URL = '/handbook-content/index.html';

const SUGGESTIONS = [
  'Walk me through the daily D1 Tranzact → Tally steps.',
  'How does bill-wise matching clear a Shopify COD order?',
  'What are the statutory dates in the monthly close?',
  'Why must Easebuzz never be fetched for the same dates twice?',
  'Which control ledger does an Amazon sale land in, and how is it cleared?',
];

const iconSend = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const iconChat = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 01-13.5 7.8L3 21l1.2-4.5A9 9 0 1121 12z" />
  </svg>
);

export function HandbookPage() {
  const [chatOpen, setChatOpen] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A reference link like /handbook#c14 should open the handbook scrolled to
  // that section — forward the hash into the iframe src.
  const location = useLocation();
  const iframeSrc = location.hash ? `${HANDBOOK_URL}${location.hash}` : HANDBOOK_URL;

  useEffect(() => {
    chatStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const context = useMemo(() => HANDBOOK_CONTEXT, []);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || loading || configured === false) return;
    setError(null);
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await sendChat(context, next, 'handbook');
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed.');
      setMessages(next);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] min-h-0">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-slate-200 bg-white">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900 truncate">Accounts Handbook</h1>
          <p className="text-[11px] text-slate-400 truncate">
            How the books are built &amp; operated · written for the CA and the accountant
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={HANDBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Open full screen ↗
          </a>
          <button
            onClick={() => setChatOpen((o) => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              chatOpen
                ? 'bg-brand-500 text-white border-brand-500 hover:bg-brand-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {iconChat}
            {chatOpen ? 'Hide chat' : 'Ask a question'}
          </button>
        </div>
      </div>

      {/* Body: handbook + chat */}
      <div className="flex-1 flex min-h-0">
        <iframe
          key={iframeSrc}
          title="Heatronics Accounts Handbook"
          src={iframeSrc}
          className="flex-1 min-w-0 h-full border-0 bg-white"
        />

        {chatOpen && (
          <aside className="w-[min(92vw,380px)] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-slate-100 bg-brand-500/5 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-brand-500 text-white flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 leading-tight">Ask about the handbook</div>
                <div className="text-[10px] text-slate-400 leading-tight">Grounded in the handbook · cites sections · can’t change anything</div>
              </div>
            </div>

            {configured === false && (
              <div className="px-3 py-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100">
                Claude API key isn’t set on the server, so chat can’t run. Set <span className="font-mono">ANTHROPIC_API_KEY</span>.
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="py-2">
                  <p className="text-center text-xs text-slate-400 mb-3">
                    Ask anything about a task, a journal, a control ledger, or a known issue.
                  </p>
                  <div className="space-y-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => void ask(s)}
                        disabled={configured === false}
                        className="block w-full text-left px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-brand-300 disabled:opacity-50"
                      >
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
                    Reading the handbook…
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
                  placeholder={configured === false ? 'Chat unavailable' : 'Ask about the handbook…'}
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
          </aside>
        )}
      </div>
    </div>
  );
}
