// ----------------------------------------------------------------------------
// Shared freshness UI — the connector roster with green/orange/grey dots, the
// per-source mode badge, and the "data live through" headline. Rendered on both
// Live MIS and Upload data so the two never drift.
// ----------------------------------------------------------------------------

import { STATUS_DOT, STATUS_LABEL, type SystemFreshness } from '../../data/liveMis/freshness';
import { MODE_LABEL, type ConnectorMode } from '../../data/monthClose/connectorsClient';

const MODE_BADGE: Record<ConnectorMode, string> = {
  'live-api': 'bg-sky-50 text-sky-700',
  'manual-upload': 'bg-violet-50 text-violet-700',
};

const absDays = (a: string, b: string) => Math.abs(Math.round((Date.parse(b) - Date.parse(a)) / 86400000));

/** The "Data live through <date>" badge — the system floor, for a card's actions slot. */
export function FreshnessHeadline({ fresh }: { fresh: SystemFreshness }) {
  const live = fresh.liveThrough;
  if (!live) return <span className="text-xs text-slate-400">No source has data yet</span>;
  const ok = live >= fresh.target;
  return (
    <span
      className={'text-xs px-2 py-0.5 rounded font-medium ' + (ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}
    >
      Data live through {live}{!ok ? ` · ${absDays(live, fresh.target)}d behind` : ''}
    </span>
  );
}

/** Legend + roster table: one row per connector, dot + mode + status + through-date. */
export function FreshnessTable({
  fresh,
  onRemoveUpload,
}: {
  fresh: SystemFreshness;
  onRemoveUpload?: (id: string) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mb-2">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {fresh.fresh} up to date</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> {fresh.stale} out of sync</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> {fresh.none} not loaded</span>
        <span className="text-slate-400">· up-to-date target {fresh.target}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-400 border-b border-slate-200 text-left">
              <th className="py-1.5 pr-3 font-medium">Source</th>
              <th className="py-1.5 pr-3 font-medium">Mode</th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 pr-3 font-medium text-right">Rows</th>
              <th className="py-1.5 font-medium">Data through</th>
            </tr>
          </thead>
          <tbody>
            {fresh.connectors.map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="py-1.5 pr-3">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${STATUS_DOT[c.status]}`} />
                    <span className="text-slate-700 font-medium">{c.label}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-3">
                  <span className={'px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap ' + MODE_BADGE[c.mode]}>
                    {MODE_LABEL[c.mode]}
                  </span>
                </td>
                <td className="py-1.5 pr-3">
                  <span className={c.status === 'fresh' ? 'text-emerald-700' : c.status === 'stale' ? 'text-amber-700' : 'text-slate-400'}>
                    {STATUS_LABEL[c.status]}
                    {c.status === 'stale' && c.daysBehind ? ` · ${c.daysBehind}d behind` : ''}
                    {c.fedBy === 'upload' ? ' · uploaded' : ''}
                  </span>
                  {c.fedBy === 'upload' && onRemoveUpload && (
                    <button onClick={() => onRemoveUpload(c.id)} className="ml-2 text-[10px] text-slate-400 hover:text-rose-600">remove</button>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{c.rows || '—'}</td>
                <td className="py-1.5">
                  {c.through ? <span className="text-slate-600 tabular-nums">{c.through}</span> : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
