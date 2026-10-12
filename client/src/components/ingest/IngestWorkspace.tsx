// ----------------------------------------------------------------------------
// IngestWorkspace — a pill per connector (name + freshness dot), select one to
// open its report slots, each with its own upload → checks → review → save →
// ingest stepper. Ingested reports are durable (server store) and overwrite by
// connector+slot+period.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listConnectors, MODE_LABEL, type ConnectorInfo } from '../../data/monthClose/connectorsClient';
import { getIngestStatus, listIngestReports, refreshIngestStore } from '../../data/ingest/ingestClient';
import { slotsFor } from '../../data/ingest/catalog';
import type { IngestReportMeta, IngestStoreStatus } from '../../data/ingest/types';
import { IngestStepper } from './IngestStepper';

type PillStatus = 'fresh' | 'stale' | 'none' | 'live';
const PILL_DOT: Record<PillStatus, string> = {
  fresh: 'bg-emerald-500', stale: 'bg-amber-500', none: 'bg-slate-300', live: 'bg-sky-500',
};

function lastMonth(): string {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function IngestWorkspace() {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [reports, setReports] = useState<IngestReportMeta[]>([]);
  const [store, setStore] = useState<IngestStoreStatus | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [rechecking, setRechecking] = useState(false);

  const reloadReports = useCallback(async () => {
    try { setReports(await listIngestReports()); } catch { /* keep prior */ }
  }, []);

  useEffect(() => {
    listConnectors().then((r) => {
      setConnectors(r.connectors);
      setSelected((cur) => cur || r.connectors[0]?.id || '');
    }).catch(() => {});
    getIngestStatus().then((r) => setStore(r.store)).catch(() => {});
    void reloadReports();
  }, [reloadReports]);

  // Latest report per connector+slot.
  const latest = useMemo(() => {
    const m = new Map<string, IngestReportMeta>();
    for (const r of reports) {
      const k = `${r.connectorId}|${r.slotId}`;
      const cur = m.get(k);
      if (!cur || r.periodKey > cur.periodKey) m.set(k, r);
    }
    return m;
  }, [reports]);

  const target = lastMonth();
  const statusFor = useCallback((c: ConnectorInfo): PillStatus => {
    if (c.mode === 'live-api') return 'live';
    const slots = slotsFor(c.id);
    const required = slots.filter((s) => s.required);
    const hasAny = slots.some((s) => latest.has(`${c.id}|${s.slotId}`));
    if (!hasAny) return 'none';
    const allFresh = required.length > 0 && required.every((s) => {
      const r = latest.get(`${c.id}|${s.slotId}`);
      return r && r.periodKey >= target;
    });
    return allFresh ? 'fresh' : 'stale';
  }, [latest, target]);

  const sel = connectors.find((c) => c.id === selected);
  const selSlots = sel ? slotsFor(sel.id) : [];

  return (
    <div className="space-y-5">
      {/* Store durability banner */}
      {store && !store.durable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 space-y-2">
          <p className="font-medium">⚠ Uploaded reports are saved to a temporary store and will be cleared on restart.</p>
          {store.grantHint ? (
            <>
              <p>To make the ingestion store durable (a Cloud Storage bucket), run this once in Cloud Shell, then Re-check:</p>
              <pre className="bg-amber-100 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">{store.grantHint}</pre>
              {store.error && <p className="text-amber-700">Storage said: {store.error}</p>}
            </>
          ) : <p>This server isn't on GCP, so reports persist only in a temp directory.</p>}
          <button onClick={async () => { setRechecking(true); try { const r = await refreshIngestStore(); setStore(r.store); } finally { setRechecking(false); } }}
            disabled={rechecking}
            className="px-2.5 py-1 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-40">
            {rechecking ? 'Re-checking…' : 'Re-check store'}
          </button>
        </div>
      )}
      {store && store.durable && (
        <p className="text-[11px] text-slate-400">Reports saved durably to Cloud Storage bucket <span className="font-mono">{store.bucket}</span>.</p>
      )}

      {/* Pill bar */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {connectors.map((c) => {
          const st = statusFor(c);
          const active = c.id === selected;
          return (
            <button key={c.id} onClick={() => setSelected(c.id)}
              className={
                'flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm whitespace-nowrap transition-colors ' +
                (active ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50')
              }>
              <span className={`w-2 h-2 rounded-full ${PILL_DOT[st]}`} />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Selected connector detail */}
      {sel && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-800">{sel.label}</h3>
            <span className={'px-1.5 py-0.5 rounded text-[10px] ' + (sel.mode === 'live-api' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700')}>
              {MODE_LABEL[sel.mode]}
            </span>
          </div>

          {sel.mode === 'live-api' ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Pulled automatically via API on the Live MIS page — no upload needed.
              {selSlots.length > 0 && <span className="text-slate-400"> A manual fallback report is available below if ever needed.</span>}
            </div>
          ) : null}

          {selSlots.map((slot) => (
            <IngestStepper
              key={slot.slotId}
              slot={slot}
              existing={latest.get(`${sel.id}|${slot.slotId}`)}
              onCommitted={reloadReports}
            />
          ))}

          {selSlots.length === 0 && (
            <p className="text-sm text-slate-400">No report slots defined for this connector yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
