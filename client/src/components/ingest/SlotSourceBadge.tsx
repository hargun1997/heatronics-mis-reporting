// How a close report slot is fed — one badge + one line (API / sheet / Claude task / manual upload).

import type { SlotSourceInfo, SlotSourceKind } from '../../data/ingest/slotSources';

const STYLE: Record<SlotSourceKind, { label: string; cls: string; dot: string }> = {
  api: { label: 'Automatic · API', cls: 'bg-slate-50 text-slate-800 border-slate-200', dot: 'bg-slate-500' },
  sheet: { label: 'Automatic · Sheet', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  claude_task: { label: 'Claude task', cls: 'bg-slate-50 text-slate-800 border-slate-200', dot: 'bg-slate-500' },
  upload: { label: 'Manual upload', cls: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
};

export function SlotSourceBadge({ info }: { info: Pick<SlotSourceInfo, 'source' | 'via'> }) {
  const s = STYLE[info.source];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-1.5 py-0.5 rounded border ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
      {info.source !== 'upload' && <span className="font-normal opacity-80">· {info.via}</span>}
    </span>
  );
}
