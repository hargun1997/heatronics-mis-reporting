// ----------------------------------------------------------------------------
// Data readiness (ingest layer) — page 2 of the pipeline.
//
// Pull everything, then for each source see the steps it ran, the raw data it
// returned, and — for an uploaded file — the file preview and exactly what was
// extracted. This is the "is the data ready, and is it right?" page: lineage
// between raw input and the facts that feed the MIS views.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import { inr } from '../../components/mis-deck/charts';
import { fetchFacts, type FactsResponse, type SourceStatus } from '../../data/liveMis/client';
import type { DailyFact } from '../../data/liveMis/facts';
import {
  clearUpload,
  loadUploads,
  parseUpload,
  saveUpload,
  uploadedFacts,
  UPLOAD_PARSERS,
  type UploadRecord,
  type UploadStore,
} from '../../data/liveMis/uploadParsers';

const iconLayers = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4m-16 5l8 4 8-4" />
  </svg>
);

function iso(d: Date): string { return d.toISOString().slice(0, 10); }

export function IngestPage() {
  const today = iso(new Date());
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(today);
  const [data, setData] = useState<FactsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadStore>(() => loadUploads());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchFacts(from, to));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pull failed.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  // Group every fact (live + uploaded, within range) by its source. A source
  // with an upload uses the upload, not the API — the settlement file is the
  // richer truth, so letting both through would double-count that source.
  const factsBySource = useMemo(() => {
    const up = uploadedFacts(uploads).filter((f) => f.date >= from && f.date <= to);
    const uploaded = new Set(Object.keys(uploads));
    const all = [...(data?.facts ?? []).filter((f) => !uploaded.has(f.source)), ...up];
    const by = new Map<string, DailyFact[]>();
    for (const f of all) (by.get(f.source) ?? by.set(f.source, []).get(f.source)!).push(f);
    for (const arr of by.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
    return by;
  }, [data, uploads, from, to]);

  const uploadList = Object.values(uploads);

  return (
    <>
      <PageHeader
        title="Data readiness"
        accent="emerald"
        icon={iconLayers}
        description="Pull every source, then inspect what came in — the steps each connector ran, the raw data extracted, and for uploads, the file and what was read from it."
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Data readiness' },
        ]}
        actions={
          <button
            onClick={() => void load()}
            disabled={loading}
            className="px-2.5 py-1 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {loading ? 'Pulling…' : 'Pull all'}
          </button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <SectionCard title="Range" description="The window to pull and inspect.">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs text-slate-500">
              <span className="block mb-0.5">From</span>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-0.5">To</span>
              <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
            </label>
          </div>
        </SectionCard>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        <UploadReport onUpload={setUploads} />

        {/* Live API sources */}
        {data?.sources.map((s) => (
          <ApiSourceCard key={s.id} source={s} facts={factsBySource.get(s.id) ?? []} />
        ))}

        {/* Uploaded sources */}
        {uploadList.map((u) => (
          <UploadSourceCard
            key={u.sourceId}
            rec={u}
            facts={factsBySource.get(u.sourceId) ?? []}
            onRemove={() => setUploads(clearUpload(u.sourceId))}
          />
        ))}

        {data && data.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
            {data.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
          </div>
        )}
      </div>
    </>
  );
}

// ---- Shared bits -----------------------------------------------------------

function Steps({ trace }: { trace?: string[] }) {
  if (!trace || trace.length === 0) return null;
  return (
    <ol className="space-y-1 text-[11px] text-slate-600">
      {trace.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-4 text-slate-400 tabular-nums">{i + 1}.</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function FactsTable({ facts }: { facts: DailyFact[] }) {
  if (facts.length === 0) return <p className="text-[11px] text-slate-400">No rows extracted for this range.</p>;
  const hasSku = facts.some((f) => f.sku);
  const hasSpend = facts.some((f) => (f.spend ?? 0) !== 0);
  const shown = facts.slice(0, 50);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[10px] text-slate-400 border-b border-slate-200 text-left">
            <th className="py-1 pr-3 font-medium">Date</th>
            <th className="py-1 pr-3 font-medium">Channel</th>
            {hasSku && <th className="py-1 pr-3 font-medium">SKU</th>}
            <th className="py-1 pr-3 font-medium text-right">Revenue</th>
            {hasSpend && <th className="py-1 pr-3 font-medium text-right">Spend</th>}
            <th className="py-1 pr-3 font-medium text-right">Fees</th>
            <th className="py-1 pr-3 font-medium text-right">Units</th>
            <th className="py-1 font-medium text-right">Orders</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((f, i) => (
            <tr key={i} className="border-b border-slate-50">
              <td className="py-1 pr-3 text-slate-600 tabular-nums">{f.date}</td>
              <td className="py-1 pr-3 text-slate-500">{f.channel}</td>
              {hasSku && <td className="py-1 pr-3 text-slate-500 max-w-[180px] truncate" title={f.skuName || f.sku}>{f.skuName || f.sku || '—'}</td>}
              <td className="py-1 pr-3 text-right tabular-nums">{f.revenue ? inr(f.revenue) : '—'}</td>
              {hasSpend && <td className="py-1 pr-3 text-right tabular-nums">{f.spend ? inr(f.spend) : '—'}</td>}
              <td className="py-1 pr-3 text-right tabular-nums">{f.fees ? inr(f.fees) : '—'}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{f.units || '—'}</td>
              <td className="py-1 text-right tabular-nums">{f.orders || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {facts.length > shown.length && (
        <p className="mt-1 text-[10px] text-slate-400">Showing {shown.length} of {facts.length} rows.</p>
      )}
    </div>
  );
}

function ApiSourceCard({ source, facts }: { source: SourceStatus; facts: DailyFact[] }) {
  const status = source.ok
    ? source.count > 0 ? { text: 'live', cls: 'bg-emerald-50 text-emerald-700' } : { text: 'connected · no data', cls: 'bg-slate-100 text-slate-400' }
    : { text: source.error ?? 'not connected', cls: 'bg-slate-100 text-slate-400' };
  return (
    <SectionCard
      title={source.label}
      description={source.through ? `Data through ${source.through} · ${source.count} rows` : undefined}
      actions={<span className={`px-2 py-0.5 rounded text-[11px] ${status.cls}`}>{status.text}</span>}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
        <div>
          <h5 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Steps run</h5>
          {source.ok ? <Steps trace={source.trace} /> : <p className="text-[11px] text-slate-400">Not pulled: {source.error}</p>}
        </div>
        <div>
          <h5 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Data extracted</h5>
          <FactsTable facts={facts} />
        </div>
      </div>
    </SectionCard>
  );
}

function UploadSourceCard({ rec, facts, onRemove }: { rec: UploadRecord; facts: DailyFact[]; onRemove: () => void }) {
  return (
    <SectionCard
      title={rec.label}
      description={`Uploaded ${new Date(rec.uploadedAt).toLocaleString()} · ${rec.rawRows ?? '?'} source rows → ${rec.facts.length} facts`}
      actions={
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[11px] bg-indigo-50 text-indigo-700">uploaded</span>
          <button onClick={onRemove} className="text-[11px] text-slate-400 hover:text-rose-600">remove</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <h5 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Steps — how the file was read</h5>
          <Steps trace={rec.trace} />
        </div>
        {rec.rawPreview && rec.rawPreview.length > 0 && (
          <div>
            <h5 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">File preview (first rows)</h5>
            <div className="overflow-x-auto border border-slate-100 rounded-lg">
              <table className="text-[10px]">
                <tbody>
                  {rec.rawPreview.map((row, i) => (
                    <tr key={i} className={i === 0 ? 'bg-slate-50 font-medium' : ''}>
                      {row.map((c, j) => (
                        <td key={j} className="px-2 py-1 border-b border-slate-50 whitespace-nowrap max-w-[160px] truncate" title={c}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div>
          <h5 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Data extracted</h5>
          <FactsTable facts={facts} />
        </div>
      </div>
    </SectionCard>
  );
}

function UploadReport({ onUpload }: { onUpload: (store: UploadStore) => void }) {
  const [sourceId, setSourceId] = useState(UPLOAD_PARSERS[0]?.sourceId ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const parser = UPLOAD_PARSERS.find((p) => p.sourceId === sourceId);

  const onFile = async (file: File | undefined) => {
    if (!file || !parser) return;
    setBusy(true); setMsg(null);
    try {
      const rec = await parseUpload(parser, file);
      onUpload(saveUpload(rec));
      setMsg({ kind: 'ok', text: `Loaded ${rec.facts.length} days from ${file.name}.` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not read the file.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Upload a report" description="For sources whose financial data has no API (Shiprocket passbook, etc.). Parsed in-browser; the result shows below.">
      <div className="flex flex-wrap items-center gap-2">
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200">
          {UPLOAD_PARSERS.map((p) => <option key={p.sourceId} value={p.sourceId}>{p.label}</option>)}
        </select>
        <label className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
          {busy ? 'Reading…' : 'Choose file'}
          <input type="file" accept={parser?.accept} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {parser && <span className="text-[10px] text-slate-400">{parser.hint}</span>}
      </div>
      {msg && <p className={'mt-1.5 text-[11px] ' + (msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700')}>{msg.text}</p>}
    </SectionCard>
  );
}
