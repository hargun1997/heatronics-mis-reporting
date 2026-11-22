// FreshnessPill: how old one source is, said the same way on every page (UI pass, 22 Nov 2026).
// For Tally, pass the server's `reachedAt` (connectors/tally/freshness.ts): the newest successful read of the P&L
// poll, the masters or a Day Book. Words come from `ago()`, the same words the Fix list uses. Extra sources and notes
// go in the popover (SourceChip).
import { SourceChip, type SourceItem } from './SourceChip';

import { TALLY_STALE_H } from './sourceAgo';

export function FreshnessPill({ label, asOf, staleAfterH = TALLY_STALE_H, note, more = [], notes = [] }: {
  label: string; asOf: string | null | undefined; staleAfterH?: number; note?: string; more?: SourceItem[]; notes?: string[];
}) {
  return <SourceChip items={[{ label, asOf: asOf ?? null, staleAfterH, note }, ...more]} notes={notes} />;
}
