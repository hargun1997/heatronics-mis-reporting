// ----------------------------------------------------------------------------
// MIS Chat — ask Claude about the business with the whole MIS as context.
// The committed monthly P&L is packed into the grounding context and sent with
// each turn; Claude answers grounded in those numbers.
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusPill } from '../../components/ui/StatusPill';
import { buildMisContext } from '../../data/chat/misContext';
import { chatStatus, sendChat, type ChatMessage } from '../../data/chat/chatClient';

const iconChat = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 12h8m-8 4h5m-9 3l2.5-2.5A2 2 0 016 16h11a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v13z" />
  </svg>
);

const SUGGESTIONS = [
  'What was net revenue and net income in July 2026?',
  'How did gross margin % trend over the last 6 months?',
  'Which channel contributed most to net revenue recently?',
  'Why was the latest month a loss? Walk me down the P&L.',
  'Compare CM2 across the last three months.',
];

export function MisChatPage() {
  const { context, throughLabel } = useMemo(() => buildMisContext(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false)); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || loading) return;
    setError(null);
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await sendChat(context, next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed.');
      setMessages(next); // keep the question; let them retry
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Ask the MIS"
        accent="brand"
        icon={iconChat}
        description={`Chat with Claude about the business — grounded in the full monthly P&L (through ${throughLabel}). It reasons over the numbers; it can't change anything.`}
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Ask the MIS' },
        ]}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {configured === false && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The Claude API key isn't set on the server yet, so chat can't run. Set <span className="font-mono">ANTHROPIC_API_KEY</span> on the service.
          </div>
        )}

        <div className="mb-4 flex items-center gap-2">
          <StatusPill toneName="info" dot>Grounded on closed books · through {throughLabel}</StatusPill>
          <span className="text-[11px] text-slate-400">Answers cite the monthly P&amp;L; figures are management, not statutory.</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white flex flex-col shadow-soft" style={{ minHeight: '60vh' }}>
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
            {messages.length === 0 && (
              <div className="py-8">
                <p className="text-center text-sm text-slate-500 mb-5">Ask anything about revenue, margins, channels, costs or the P&amp;L.</p>
                <div className="grid sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => void ask(s)}
                      className="text-left text-[13px] leading-snug text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 hover:bg-brand-50 hover:border-brand-200 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 text-white px-3.5 py-2.5 text-sm">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start gap-3">
                  <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0" aria-hidden="true">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z" /></svg>
                  </span>
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white border border-slate-200 text-slate-800 px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </div>
                </div>
              )
            ))}
            {loading && (
              <div className="flex justify-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <svg className="w-4 h-4 loading-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z" /></svg>
                </span>
                <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl rounded-bl-sm px-4 py-3 text-sm">
                  Thinking through the numbers…
                </div>
              </div>
            )}
            {error && <p className="text-xs text-rose-700 text-center">{error}</p>}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-100 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }}
                rows={1}
                placeholder="Ask about the MIS…  (Enter to send, Shift+Enter for a new line)"
                disabled={loading || configured === false}
                className="flex-1 resize-none px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-400 focus:outline-none disabled:bg-slate-50"
              />
              <button onClick={() => void ask(input)} disabled={loading || !input.trim() || configured === false}
                className="px-3.5 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40">
                Send
              </button>
            </div>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setError(null); }}
                className="mt-2 text-[11px] text-slate-400 hover:text-slate-600">Clear conversation</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
