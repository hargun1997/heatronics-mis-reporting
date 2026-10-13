// ----------------------------------------------------------------------------
// AI Insights — on-demand analysis of the live MIS, plus Ask the MIS (chat).
// Both are grounded in the live deck (published history + the live months with
// their completeness), so the AI never treats a provisional EBITDA as real.
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import { Markdown } from '../../components/ui/Markdown';
import { buildLiveMisContext } from '../../data/chat/misContext';
import { chatStatus, sendChat, type ChatMessage } from '../../data/chat/chatClient';
import { getUsage, usd, type UsageResponse } from '../../data/chat/usageClient';
import { loadLiveDeck, type LiveDeckData } from '../../data/misDeck/liveDeck';
import { monthLabel } from '../../data/misDeck/liveAnalytics';

const iconSpark = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

interface Preset { id: string; label: string; blurb: string; prompt: string; }
const PRESETS: Preset[] = [
  {
    id: 'profitability', label: 'Profitability review', blurb: 'Margin ladder, cost levers',
    prompt: 'Give a profitability review. Walk the margin ladder (Gross Margin %, CM1, CM2 %, EBITDA %, Net Income %) across the recent months, call out the trend with specific numbers, and name the two or three biggest cost levers. Use the PUBLISHED_HISTORY for anything below CM2; for live months, only use lines their completeness level makes real.',
  },
  {
    id: 'channels', label: 'Channel performance', blurb: 'Mix, growth, contribution',
    prompt: 'Analyse channel performance: net-revenue mix and how it is shifting, which channels are growing or shrinking month over month, and which carry the best and worst contribution. Be specific with numbers and months.',
  },
  {
    id: 'whatchanged', label: 'What changed', blurb: 'Latest month vs prior',
    prompt: 'What changed in the most recent complete month versus the prior few months? Walk down the P&L and call out the notable movements (revenue, COGM, fees, marketing, OPEX) with numbers, and say what drove each.',
  },
  {
    id: 'risks', label: 'Risks & actions', blurb: 'Top risks, recommendations',
    prompt: 'Identify the top risks visible in these numbers, then give 3–5 concrete, prioritised recommendations to improve profitability. For each, note the expected direction of impact and which line it moves.',
  },
];

export function AiInsightsPage() {
  const [deck, setDeck] = useState<LiveDeckData | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);

  useEffect(() => {
    loadLiveDeck().then(setDeck).catch(() => setDeck(null));
    chatStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
    getUsage(7).then(setUsage).catch(() => {});
  }, []);

  const { context, throughLabel } = useMemo(() => buildLiveMisContext(deck), [deck]);

  return (
    <>
      <PageHeader
        title="AI Insights"
        accent="brand"
        icon={iconSpark}
        description={`On-demand analysis of the MIS and a chat to ask anything — grounded in the live P&L (through ${throughLabel}). The AI reasons over the numbers; it can't change anything.`}
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'AI Insights' },
        ]}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {configured === false && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The Claude API key isn't set on the server, so analysis and chat can't run. Set <span className="font-mono">ANTHROPIC_API_KEY</span> on the service.
          </div>
        )}
        {deck && (
          <p className="text-[11px] text-slate-400">
            {deck.completeThrough
              ? <>Analysing the MIS, fully closed through <span className="text-emerald-700 font-medium">{monthLabel(deck.completeThrough)}</span>{deck.periods.length ? ` · ${deck.periods.length} live month${deck.periods.length === 1 ? '' : 's'}` : ''}.</>
              : 'Analysing the published history plus any live months uploaded so far.'}
          </p>
        )}

        <SpendCard usage={usage} />
        <Analysis context={context} configured={configured} />
        <AskChat context={context} configured={configured} />
      </div>
    </>
  );
}

// ---- Claude API spend ------------------------------------------------------

function SpendCard({ usage }: { usage: UsageResponse | null }) {
  if (!usage) return null;
  const models = [...new Set(usage.days.flatMap((d) => d.models))].join(', ') || 'claude-opus-5-5';
  return (
    <SectionCard
      title="Claude API spend"
      description={`Priced from each response's exact token usage at Opus rates. Days are IST · model: ${models}`}
      actions={
        <div className="text-right text-xs">
          <div className="text-slate-400">today <span className="text-slate-800 font-semibold tabular-nums">{usd(usage.today?.costUsd ?? 0)}</span> · {usage.today?.calls ?? 0} calls</div>
          <div className="text-slate-400">{usage.windowDays}-day <span className="text-slate-700 font-medium tabular-nums">{usd(usage.totalUsd)}</span></div>
        </div>
      }
    >
      {usage.days.length === 0 ? (
        <p className="text-sm text-slate-400">No API calls recorded yet.</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead><tr className="text-[10px] text-slate-400 text-left border-b border-slate-200">
            <th className="py-1 pr-3">Day (IST)</th><th className="py-1 pr-3 text-right">Calls</th>
            <th className="py-1 pr-3 text-right">Tokens in/out</th><th className="py-1 text-right">Cost (USD)</th>
          </tr></thead>
          <tbody>
            {usage.days.map((d) => (
              <tr key={d.date} className="border-b border-slate-50">
                <td className="py-1 pr-3 text-slate-600 tabular-nums">{d.date}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-600">{d.calls}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-400">{d.inputTokens.toLocaleString()} / {d.outputTokens.toLocaleString()}</td>
                <td className="py-1 text-right tabular-nums text-slate-700 font-medium">${d.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

// ---- On-demand analysis ----------------------------------------------------

function Analysis({ context, configured }: { context: string; configured: boolean | null }) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<{ label: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (p: Preset) => {
    if (running || configured === false) return;
    setRunning(p.id); setError(null); setResult(null);
    try {
      const reply = await sendChat(context, [{ role: 'user', content: p.prompt }]);
      setResult({ label: p.label, text: reply });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      setRunning(null);
    }
  };

  return (
    <SectionCard title="On-demand analysis" description="Pick an angle and the AI reads the whole MIS and writes it up.">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => void run(p)} disabled={!!running || configured === false}
            className="group text-left rounded-xl border border-slate-200 px-3 py-2 hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-50 transition-colors">
            <div className="text-sm font-medium text-slate-700 group-hover:text-brand-700">{p.label}</div>
            <div className="text-[11px] text-slate-400">{p.blurb}</div>
          </button>
        ))}
      </div>

      {running && (
        <div className="mt-4 text-sm text-slate-500 flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          Reading the MIS and writing the {PRESETS.find((p) => p.id === running)?.label.toLowerCase()}…
        </div>
      )}
      {error && <p className="mt-3 text-xs text-rose-700">{error}</p>}
      {result && !running && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{result.label}</span>
            <button onClick={() => navigator.clipboard?.writeText(result.text).catch(() => {})}
              className="text-[11px] text-slate-400 hover:text-slate-600">Copy</button>
          </div>
          <Markdown text={result.text} />
        </div>
      )}
    </SectionCard>
  );
}

// ---- Ask the MIS (chat) ----------------------------------------------------

const SUGGESTIONS = [
  'Which channel contributed most to net revenue recently?',
  'How did CM2 % trend over the last few months?',
  'Walk me down the latest complete month’s P&L.',
  'Where is the biggest margin leakage?',
];

function AskChat({ context, configured }: { context: string; configured: boolean | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || loading || configured === false) return;
    setError(null);
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const reply = await sendChat(context, next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed.');
      setMessages(next);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionCard title="Ask the MIS" description="Chat with Claude about the business, grounded in the same numbers.">
      <div className="flex flex-col" style={{ minHeight: '40vh' }}>
        <div className="flex-1 overflow-y-auto space-y-4 pb-3">
          {messages.length === 0 && (
            <div className="text-center text-slate-400 py-8">
              <p className="text-sm mb-3">Ask anything about revenue, margins, channels, costs or the P&amp;L.</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => void ask(s)} disabled={configured === false}
                    className="px-3 py-1.5 text-xs rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-brand-300 disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ' +
                (m.role === 'user' ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm')}>
                {m.role === 'user' ? m.content : <Markdown text={m.content} />}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm">Thinking through the numbers…</div>
            </div>
          )}
          {error && <p className="text-xs text-rose-700 text-center">{error}</p>}
          <div ref={endRef} />
        </div>
        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-end gap-2">
            <textarea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }}
              rows={1} placeholder="Ask about the MIS…  (Enter to send, Shift+Enter for a new line)"
              disabled={loading || configured === false}
              className="flex-1 resize-none px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-brand-400 focus:outline-none disabled:bg-slate-50" />
            <button onClick={() => void ask(input)} disabled={loading || !input.trim() || configured === false}
              className="px-3.5 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40">Send</button>
          </div>
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setError(null); }}
              className="mt-2 text-[11px] text-slate-400 hover:text-slate-600">Clear conversation</button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ---- Minimal markdown renderer (headings, bold, bullets) -------------------

