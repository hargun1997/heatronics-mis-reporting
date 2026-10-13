// ----------------------------------------------------------------------------
// Data Issues — a cross-month health scan of everything uploaded. Catches the
// things that are each individually valid to store but don't make sense across
// months: flat inventory (closing == opening), a cost centre that dropped to
// zero, a channel that stopped earning, a missing month, a big revenue swing.
//
// The scan runs server-side over the committed store (GET /api/issues) so it's
// the same logic a daily scheduler would run. "Ask Claude to review" sends the
// findings + the live P&L to the model for a plain-English second opinion.
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import { Markdown } from '../../components/ui/Markdown';
import { fetchIssues, type AnomalyScanResult, type Issue, type IssueSeverity } from '../../data/issues/issuesClient';
import { buildLiveMisContext } from '../../data/chat/misContext';
import { chatStatus, sendChat } from '../../data/chat/chatClient';
import { loadLiveDeck, type LiveDeckData } from '../../data/misDeck/liveDeck';

const iconShield = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 3h.01" />
  </svg>
);

const SEV: Record<IssueSeverity, { label: string; dot: string; chip: string; ring: string }> = {
  high: { label: 'High', dot: 'bg-rose-500', chip: 'text-rose-700 bg-rose-50 border-rose-200', ring: 'border-l-rose-400' },
  medium: { label: 'Medium', dot: 'bg-amber-500', chip: 'text-amber-700 bg-amber-50 border-amber-200', ring: 'border-l-amber-400' },
  low: { label: 'Low', dot: 'bg-slate-400', chip: 'text-slate-600 bg-slate-50 border-slate-200', ring: 'border-l-slate-300' },
};

export function IssuesPage() {
  const [data, setData] = useState<AnomalyScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deck, setDeck] = useState<LiveDeckData | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchIssues());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
    loadLiveDeck().then(setDeck).catch(() => setDeck(null));
    chatStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);

  const grouped = useMemo(() => {
    const g: Record<IssueSeverity, Issue[]> = { high: [], medium: [], low: [] };
    for (const i of data?.issues ?? []) g[i.severity].push(i);
    return g;
  }, [data]);

  const total = data?.issues.length ?? 0;

  const askClaude = async () => {
    if (reviewing || configured === false || !data) return;
    setReviewing(true); setReviewError(null); setReview(null);
    try {
      const { context } = buildLiveMisContext(deck);
      const list = data.issues.map((i) => `- [${i.severity.toUpperCase()}] ${i.period} — ${i.title}: ${i.detail}`).join('\n');
      const prompt =
        'Below are automated data-quality findings from the MIS, plus the live P&L for context. ' +
        'For each finding, say in one or two lines whether it looks like a real problem or an expected pattern, ' +
        'and what to check or upload to resolve it. Then give a short overall read on data health. ' +
        'Be concrete and cite months/numbers.\n\nFINDINGS:\n' + (list || '(none)');
      setReview(await sendChat(context, [{ role: 'user', content: prompt }]));
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Data Issues"
        accent="brand"
        icon={iconShield}
        description="A cross-month health scan of everything uploaded — flat inventory, a cost centre gone to zero, a channel that stopped earning, missing months, big swings."
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Data Issues' },
        ]}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void run()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 text-white text-sm font-medium px-3.5 py-2 hover:bg-brand-600 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5 9a7 7 0 0112-3m2 9a7 7 0 01-12 3" /></svg>
            )}
            Run scan now
          </button>
          <button
            onClick={() => void askClaude()}
            disabled={reviewing || configured === false || loading || total === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 text-sm font-medium px-3.5 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title={configured === false ? 'Claude API key not set on the server' : 'Ask Claude to review these findings'}
          >
            <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Ask Claude to review
          </button>
          {data && (
            <span className="text-[11px] text-slate-400">
              Scanned {new Date(data.scannedAt).toLocaleString('en-IN')} · {data.monthsCovered.length} month{data.monthsCovered.length === 1 ? '' : 's'} covered
            </span>
          )}
        </div>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        {!loading && !error && total === 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-8 text-center">
            <div className="text-emerald-700 font-semibold">No issues found</div>
            <p className="text-sm text-emerald-700/80 mt-1">Every uploaded month looks internally consistent across the rules we check.</p>
          </div>
        )}

        {total > 0 && (
          <div className="flex gap-2">
            {(['high', 'medium', 'low'] as IssueSeverity[]).map((s) => grouped[s].length > 0 && (
              <span key={s} className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full border px-2.5 py-1 ${SEV[s].chip}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${SEV[s].dot}`} />{grouped[s].length} {SEV[s].label.toLowerCase()}
              </span>
            ))}
          </div>
        )}

        {(['high', 'medium', 'low'] as IssueSeverity[]).map((s) => grouped[s].length > 0 && (
          <div key={s} className="space-y-2">
            {grouped[s].map((i) => (
              <div key={i.id} className={`rounded-xl border border-slate-200 border-l-4 ${SEV[s].ring} bg-white px-4 py-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 border ${SEV[s].chip}`}>{SEV[s].label}</span>
                  <span className="text-[11px] text-slate-400">{i.category}</span>
                  <span className="ml-auto text-[11px] text-slate-400 tabular-nums">{i.period}</span>
                </div>
                <div className="text-sm font-medium text-slate-800">{i.title}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{i.detail}</div>
              </div>
            ))}
          </div>
        ))}

        {(reviewing || review || reviewError) && (
          <SectionCard title="Claude’s review" description="A plain-English second opinion on the findings above.">
            {reviewing && (
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                Reading the findings and the P&amp;L…
              </div>
            )}
            {reviewError && <p className="text-xs text-rose-700">{reviewError}</p>}
            {review && !reviewing && <Markdown text={review} />}
          </SectionCard>
        )}

        <p className="text-[10px] text-slate-400">
          The scan reads the committed store across all months. The same check can run automatically every day once a scheduler and
          mailer are configured — see the deploy notes.
        </p>
      </div>
    </>
  );
}
