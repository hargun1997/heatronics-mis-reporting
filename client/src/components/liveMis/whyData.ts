import { useEffect, useMemo } from 'react';
import type { LiveDeckData } from '../../data/misDeck/liveDeck';
import type { PeriodAgg } from '../../data/misDeck/liveAnalytics';
import { buildBridge, comparisonKeys, type BridgeResult } from '../../data/misDeck/bridge';

export interface WhyData {
  /** The selected single month, if any. */
  selectedKey: string | null;
  results: { previous: BridgeResult | null; lastYear: BridgeResult | null };
}

/** Both comparisons for one month; null when there is no month to compare with. */
export function useWhyData(
  selected: PeriodAgg | undefined, actual: PeriodAgg[], normalised: PeriodAgg[], deck: LiveDeckData | null,
): WhyData {
  return useMemo(() => {
    const key = selected && selected.members.length === 1 ? selected.members[0] : null;
    if (!key || !deck) return { selectedKey: key, results: { previous: null, lastYear: null } };
    const keys = actual.map((p) => p.key);
    const { previous, lastYear } = comparisonKeys(keys, key);
    const by = (list: PeriodAgg[], k: string) => list.find((p) => p.key === k);
    const run = (other: string | null): BridgeResult | null => {
      const cur = by(actual, key), base = other ? by(actual, other) : undefined;
      if (!cur || !base) return null;
      return buildBridge({ base, cur, baseNorm: by(normalised, base.key), curNorm: by(normalised, cur.key), cells: deck.skuCells });
    };
    return { selectedKey: key, results: { previous: run(previous), lastYear: run(lastYear) } };
  }, [selected, actual, normalised, deck]);
}

/** The folded section's one-line summary: the top 3 reasons. */
export function whySummary(d: WhyData): string {
  const r = d.results.previous;
  if (!d.selectedKey) return 'Pick one month to see why profit moved.';
  if (!r) return 'No earlier month to compare with.';
  if (r.status !== 'ok') return 'Not enough data yet.';
  return r.reasons.length ? r.reasons.map((x, i) => `${i + 1}. ${x.text}`).join('  ·  ') : 'Little changed.';
}


/** What the server keeps: the pure bridge output only (no bars, no raw rows). */
function slim(r: BridgeResult | null) {
  if (!r || r.status !== 'ok') return r;
  const { bars: _bars, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

/** Saves the computed bridge for the MCP tool (POST /api/mis/bridge). Fire-and-forget; the server skips unchanged content. */
export function useSaveBridge(d: WhyData, enabled: boolean): void {
  const body = useMemo(() => (d.selectedKey && enabled && (d.results.previous || d.results.lastYear)
    ? JSON.stringify({ month: d.selectedKey, previous: slim(d.results.previous), lastYear: slim(d.results.lastYear) }) : null), [d, enabled]);
  useEffect(() => {
    if (!body) return;
    const t = setTimeout(() => {
      fetch('/api/mis/bridge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => { /* snapshot is optional */ });
    }, 1500);
    return () => clearTimeout(t);
  }, [body]);
}
