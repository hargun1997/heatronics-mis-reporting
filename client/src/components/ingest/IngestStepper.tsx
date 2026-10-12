// ----------------------------------------------------------------------------
// IngestStepper — the five-stage flow for ONE report slot:
//   ① Upload → ② AI checks → ③ Review → ④ Save → ⑤ Ingest into MIS
// A fail blocks Save; warnings require an explicit acknowledge. Re-uploading an
// already-ingested slot overwrites it (same connector+slot+period on the server).
// ----------------------------------------------------------------------------

import { useState } from 'react';
import { inr } from '../mis-deck/charts';
import { commitReport, runChecks } from '../../data/ingest/ingestClient';
import type { IngestReportMeta, ReportSlot, StagedUpload } from '../../data/ingest/types';

type Stage = 'idle' | 'checking' | 'review' | 'saving' | 'ingested' | 'failed';
const STEPS = ['Upload', 'AI checks', 'Review', 'Save', 'Ingest'] as const;

function stepIndex(stage: Stage): number {
  switch (stage) {
    case 'idle': return 0;
    case 'checking': return 1;
    case 'review': case 'failed': return 2;
    case 'saving': return 3;
    case 'ingested': return 4;
  }
}

export function IngestStepper({
  slot,
  existing,
  onCommitted,
}: {
  slot: ReportSlot;
  existing?: IngestReportMeta;
  onCommitted: () => void;
}) {
  const [stage, setStage] = useState<Stage>(existing ? 'ingested' : 'idle');
  const [staged, setStaged] = useState<StagedUpload | null>(null);
  const [period, setPeriod] = useState<string>(existing?.periodKey ?? '');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<IngestReportMeta | null>(existing ?? null);

  const wired = slot.kind === 'vision' || Boolean(slot.parserId);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setStage('checking'); setError(null); setStaged(null); setAck(false);
    try {
      const s = await runChecks(slot, file);
      setStaged(s);
      setPeriod(s.periodKey);
      setStage(s.checks.overall === 'fail' ? 'failed' : 'review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed.');
      setStage('failed');
    }
  };

  const save = async () => {
    if (!staged) return;
    setStage('saving'); setError(null);
    try {
      const meta = await commitReport(slot, { ...staged, periodKey: period });
      setCommitted(meta);
      setStage('ingested');
      onCommitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
      setStage('review');
    }
  };

  const hasWarn = staged?.checks.items.some((i) => i.status === 'warn') ?? false;
  const canSave = stage === 'review' && staged?.checks.overall !== 'fail' && (!hasWarn || ack);
  const active = stepIndex(stage);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Slot header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-800">{slot.label}</h4>
            {slot.required
              ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">required</span>
              : <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-400">optional</span>}
            {slot.kind === 'vision' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">screenshot → AI</span>}
          </div>
          {committed && (
            <p className="text-[11px] text-emerald-700 mt-0.5">
              Ingested · {committed.periodKey}{committed.through ? ` · through ${committed.through}` : ''} · {committed.rowCount} rows · {committed.fileName}
            </p>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 px-4 py-2.5 text-[10px]">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <span className={
              'flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-semibold ' +
              (i < active ? 'bg-emerald-500 text-white'
                : i === active ? 'bg-brand-500 text-white'
                : 'bg-slate-100 text-slate-400')
            }>{i < active ? '✓' : i + 1}</span>
            <span className={i <= active ? 'text-slate-600 font-medium' : 'text-slate-300'}>{s}</span>
            {i < STEPS.length - 1 && <span className="w-4 h-px bg-slate-200 mx-0.5" />}
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 px-4 py-3 space-y-3">
        {/* Export steps — always visible */}
        <div>
          <h5 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">How to get this report</h5>
          <ol className="space-y-0.5 text-[11px] text-slate-600">
            {slot.exportSteps.map((t, i) => (
              <li key={i} className="flex gap-2"><span className="text-slate-400 tabular-nums">{i + 1}.</span><span>{t}</span></li>
            ))}
          </ol>
          {slot.note && <p className="text-[10px] text-slate-400 mt-1">{slot.note}</p>}
        </div>

        {/* ① Upload */}
        {!wired ? (
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
            The reader for this report is being built — the steps above are ready. Upload opens next.
          </p>
        ) : (stage === 'idle' || stage === 'failed') && (
          <div className="flex items-center gap-2">
            <label className="px-2.5 py-1.5 text-xs rounded-lg bg-brand-600 text-white hover:bg-brand-700 cursor-pointer">
              {committed ? 'Replace file' : 'Upload file'}
              <input type="file" accept={slot.accept} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            <span className="text-[10px] text-slate-400">{slot.accept}</span>
          </div>
        )}

        {stage === 'checking' && <p className="text-xs text-slate-500">Running checks through the file…</p>}

        {/* ② AI checks + ③ Review */}
        {(stage === 'review' || stage === 'failed') && staged && (
          <ChecksAndReview staged={staged} />
        )}

        {error && <p className="text-[11px] text-rose-700">{error}</p>}

        {/* Period + ④ Save / ⑤ Ingest */}
        {stage === 'review' && staged && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-[11px] text-slate-500">
                <span className="block mb-0.5">Period (month this report belongs to)</span>
                <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-sm" />
              </label>
            </div>
            {hasWarn && (
              <label className="flex items-center gap-2 text-[11px] text-amber-700">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                I've reviewed the warnings above and want to save anyway.
              </label>
            )}
            <button onClick={save} disabled={!canSave}
              className="px-3 py-1.5 text-xs rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40">
              Save &amp; ingest into MIS
            </button>
          </div>
        )}

        {stage === 'saving' && <p className="text-xs text-slate-500">Saving to durable storage and ingesting…</p>}

        {stage === 'ingested' && (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-emerald-700">✓ Saved &amp; ingested.</span>
            {wired && (
              <label className="text-[11px] text-slate-500 underline cursor-pointer hover:text-slate-700">
                Re-upload / overwrite
                <input type="file" accept={slot.accept} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChecksAndReview({ staged }: { staged: StagedUpload }) {
  const { checks, extracted } = staged;
  const dot = (s: string) => s === 'pass' ? 'text-emerald-600' : s === 'warn' ? 'text-amber-600' : 'text-rose-600';
  const mark = (s: string) => s === 'pass' ? '✓' : s === 'warn' ? '!' : '✕';
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h5 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">AI checks</h5>
        <ul className="space-y-1 text-[11px]">
          {checks.items.map((it) => (
            <li key={it.id} className="flex gap-2">
              <span className={`font-bold ${dot(it.status)}`}>{mark(it.status)}</span>
              <span className="text-slate-600"><span className="font-medium text-slate-700">{it.label}</span>{it.detail ? ` — ${it.detail}` : ''}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h5 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Extracted</h5>
        {extracted.ledgerRows && extracted.ledgerRows.length > 0 ? (
          <div className="max-h-56 overflow-auto text-[11px]">
            {extracted.ledgerRows.slice(0, 40).map((r, i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-slate-50 py-0.5"
                style={{ paddingLeft: `${Math.min(r.depth, 5) * 12}px` }}>
                <span className={`truncate ${r.confidence < 0.9 ? 'text-amber-700' : 'text-slate-600'}`}>{r.name}</span>
                <span className="tabular-nums text-slate-700">{inr(r.amount)}</span>
              </div>
            ))}
          </div>
        ) : extracted.facts.length > 0 ? (
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-[10px] text-slate-400 text-left border-b border-slate-200">
                <th className="py-1 pr-2">Date</th><th className="py-1 pr-2 text-right">Revenue</th>
                <th className="py-1 pr-2 text-right">Fees</th><th className="py-1 text-right">Units</th>
              </tr></thead>
              <tbody>
                {extracted.facts.slice(0, 40).map((f, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-0.5 pr-2 tabular-nums text-slate-600">{f.date}</td>
                    <td className="py-0.5 pr-2 text-right tabular-nums">{f.revenue ? inr(f.revenue) : '—'}</td>
                    <td className="py-0.5 pr-2 text-right tabular-nums">{f.fees ? inr(f.fees) : '—'}</td>
                    <td className="py-0.5 text-right tabular-nums">{f.units || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">Nothing extracted.</p>
        )}
        {extracted.rawPreview && extracted.rawPreview.length > 0 && (
          <details className="mt-2 text-[10px] text-slate-400">
            <summary className="cursor-pointer hover:text-slate-600">Raw file preview</summary>
            <div className="mt-1 overflow-x-auto border border-slate-100 rounded">
              <table className="text-[10px]"><tbody>
                {extracted.rawPreview.slice(0, 6).map((row, i) => (
                  <tr key={i} className={i === 0 ? 'bg-slate-50 font-medium' : ''}>
                    {row.map((c, j) => <td key={j} className="px-1.5 py-0.5 border-b border-slate-50 whitespace-nowrap max-w-[120px] truncate" title={c}>{c}</td>)}
                  </tr>
                ))}
              </tbody></table>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
