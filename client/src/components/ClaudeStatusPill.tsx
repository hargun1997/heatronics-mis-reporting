// ----------------------------------------------------------------------------
// Claude status pill — a global, always-visible indicator in the top menu bar:
// whether the Claude API is live, and how much it has cost today. Links to AI
// Insights (where Claude is used). Refreshes on mount and every few minutes.
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { chatStatus } from '../data/chat/chatClient';
import { getUsage, usd, type UsageResponse } from '../data/chat/usageClient';

const REFRESH_MS = 180_000; // 3 min

export function ClaudeStatusPill({ compact = false }: { compact?: boolean }) {
  const [live, setLive] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const pull = () => {
      chatStatus().then((s) => alive && setLive(s.configured)).catch(() => alive && setLive(false));
      getUsage(7).then((u) => alive && setUsage(u)).catch(() => {});
    };
    pull();
    const t = setInterval(pull, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const dot = live ? 'bg-emerald-500' : live === false ? 'bg-amber-500' : 'bg-slate-300';
  // Always show today's spend once usage has loaded — even $0.00 — so the menu
  // bar reliably answers "how much have we spent today".
  const spend = usage ? usd(usage.today?.costUsd ?? 0) : null;
  const title = `Claude API ${live == null ? 'checking' : live ? 'live' : 'offline'}` +
    (usage ? ` · AI spend today ${usd(usage.today?.costUsd ?? 0)} (${usage.today?.calls ?? 0} calls) · 7-day ${usd(usage.totalUsd)}` : '');

  return (
    <Link
      to="/reporting/mis/insights"
      title={title}
      className={
        'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/60 hover:bg-slate-50 transition-colors ' +
        (compact ? 'px-2 py-0.5' : 'px-2.5 py-1')
      }
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${live ? 'animate-pulse' : ''}`} />
      {!compact && <span className="text-[11px] font-medium text-slate-600">Claude {live == null ? '…' : live ? 'live' : 'off'}</span>}
      {spend != null && (
        <span className="text-[11px] tabular-nums text-slate-500">
          {compact ? spend : <>· <span className="text-slate-700 font-medium">{spend}</span> today</>}
        </span>
      )}
    </Link>
  );
}
