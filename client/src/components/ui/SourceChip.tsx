// SourceChip — every number says where it comes from and when it last updated (founder, 9 Nov 2026).
// A small pill ("Tally · 3 h ago") that opens a popover listing each source, its time and any notes.
// Notes live here, not in banners. Amber when any source is older than its `staleAfterH`.
import { useState } from 'react';
import { Database } from 'lucide-react';
import { ago } from './sourceAgo';
import { Popover } from './overlays';

export interface SourceItem { label: string; asOf: string | null; staleAfterH?: number; note?: string }

const isStale = (s: SourceItem, now: number) => !s.asOf || (s.staleAfterH != null && now - Date.parse(s.asOf) > s.staleAfterH * 3_600_000);

export function SourceChip({ items, notes = [] }: { items: SourceItem[]; notes?: string[] }) {
  const [now] = useState(() => Date.now());
  const stale = items.some((s) => isStale(s, now));
  const first = items[0];
  return (
    <Popover
      align="left"
      width={300}
      buttonLabel={`${first ? `${first.label}, updated ${ago(first.asOf, now)}${stale ? ', old' : ''}` : 'Sources'}. Where these numbers come from`}
      buttonClassName={`inline-flex min-h-[44px] sm:min-h-[32px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${stale ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
      button={<><Database className="h-3.5 w-3.5" aria-hidden />{first ? `${first.label} · ${ago(first.asOf, now)}${stale ? ' · old' : ''}` : 'Sources'}{items.length > 1 ? ` +${items.length - 1}` : ''}</>}
    >
      <div className="p-3 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Where these numbers come from</p>
        <ul className="space-y-1.5">
          {items.map((s) => (
            <li key={s.label} className="flex items-start justify-between gap-3">
              <span className="text-slate-800">{s.label}{s.note && <span className="block text-xs text-slate-600">{s.note}</span>}</span>
              <span className={`shrink-0 text-xs ${isStale(s, now) ? 'text-amber-800' : 'text-slate-600'}`}>{ago(s.asOf, now)}</span>
            </li>
          ))}
        </ul>
        {notes.length > 0 && <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-700">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      </div>
    </Popover>
  );
}
