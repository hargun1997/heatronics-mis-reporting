// ----------------------------------------------------------------------------
// IngestStepper — the five-stage flow for ONE report slot:
//   ① Upload → ② AI checks → ③ Review → ④ Save → ⑤ Ingest into MIS
// A fail blocks Save; warnings require an explicit acknowledge. Re-uploading an
// already-ingested slot overwrites it (same connector+slot+period on the server).
// ----------------------------------------------------------------------------

import { useState, type DragEvent } from 'react';
import { inr } from '../mis-deck/charts';
import { Modal } from '../ui/overlays';
import { commitReportMonths, monthBreakdown, restageTallyMonth, runChecks } from '../../data/ingest/ingestClient';
import type { IngestReportMeta, ReportSlot, StagedUpload } from '../../data/ingest/types';

const iconSteps = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

/** The export help modal: the saved-report link (if any) + detailed raw steps + how to download. */
function ExportHelpModal({ slot, open, onClose }: { slot: ReportSlot; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} width={580} icon={iconSteps}
      title={slot.label} subtitle="How to export this report"
      footer={<button onClick={onClose} className="px-3.5 py-1.5 text-sm font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-900">Done</button>}>
      {slot.exportUrl ? (
        <a href={slot.exportUrl.url} target="_blank" rel="noopener noreferrer"
          className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border border-brand-200 bg-brand-50 hover:bg-brand-100 transition-colors mb-4">
          <div>
            <div className="text-sm font-semibold text-brand-800">{slot.exportUrl.label}</div>
            <div className="text-xs text-brand-700/80 mt-0.5">Fastest — opens the export screen. Set the month, then Export.</div>
          </div>
          <span className="text-brand-600 text-lg leading-none" aria-hidden>↗</span>
        </a>
      ) : (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-4">
          No saved-report link yet — follow the raw steps below. (We add a one-click link per source as its export URL is confirmed.)
        </p>
      )}

      <h4 className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Steps</h4>
      <ol className="space-y-2.5">
        {slot.exportSteps.map((t, i) => (
          <li key={i} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
        <span className="font-medium text-slate-600">Download &amp; upload:</span> accepts {slot.accept} — CSV or Excel are both fine, and you don't need to clean junk header rows. Download the file, then come back here and tap “Upload file”.
      </div>
      {slot.note && <p className="text-xs text-slate-500 mt-3"><span className="font-medium text-slate-600">What we do with it:</span> {slot.note}</p>}
    </Modal>
  );
}

/** Shown while a Claude-backed connector (Tally / Shopflo) is being read. */
function AiWorking({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500" />
      </span>
      <span className="font-medium">Claude is working</span>
      <span className="text-violet-500">— {label}</span>
    </div>
  );
}

/** Small static marker that a slot is read by AI (Claude). */
function AiBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden /> Claude reads this
    </span>
  );
}

type Stage = 'idle' | 'checking' | 'review' | 'saving' | 'ingested' | 'failed';
const STEPS = ['Upload', 'AI checks', 'Review', 'Save', 'Ingest'] as const;

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-09" → "Sep 2026". */
function monthName(periodKey: string): string {
  const [y, m] = periodKey.split('-');
  return `${MONTH_ABBR[Number(m)] ?? m} ${y}`;
}

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
  const [committedCount, setCommittedCount] = useState<number>(existing ? 1 : 0);
  const [howOpen, setHowOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const wired = slot.kind === 'vision' || slot.kind === 'bom' || slot.kind === 'invoice' || slot.kind === 'tally-xlsx' || Boolean(slot.parserId);
  // These connectors are read by Claude on the server (Tally screenshots, Shopflo
  // invoices), so we surface an "AI is working" indicator while it runs.
  const usesAI = slot.kind === 'vision' || slot.kind === 'invoice';

  const onFiles = async (files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setPicked(list.map((f) => f.name));
    setStage('checking'); setError(null); setStaged(null); setAck(false);
    try {
      const s = await runChecks(slot, list);
      setStaged(s);
      setPeriod(s.periodKey);
      setStage(s.checks.overall === 'fail' ? 'failed' : 'review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed.');
      setStage('failed');
    }
  };
  // Multi-file for screenshots, Tally P&L exports, and plain xlsx/csv reports
  // (drop a year of monthly files, or one multi-month file, in one go). BOM and
  // single invoices stay one-file.
  const multiple = slot.kind === 'vision' || slot.kind === 'tally-xlsx'
    || (slot.kind !== 'bom' && slot.kind !== 'invoice' && Boolean(slot.parserId));
  // Drag-and-drop onto the slot — same path as the file picker. Only accept
  // drops when the slot can take an upload (wired, and not mid-check/save).
  const canDrop = wired && (stage === 'idle' || stage === 'failed' || stage === 'ingested');
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!canDrop) return;
    const files = e.dataTransfer?.files ?? null;
    if (files && files.length > 0) void onFiles(files);
  };
  const uploadLabel = committed ? 'Replace' : slot.kind === 'vision' ? 'Upload screenshot(s)' : slot.kind === 'invoice' ? 'Upload PDF' : slot.kind === 'tally-xlsx' ? 'Upload P&L Excel' : multiple ? 'Upload file(s)' : 'Upload file';

  // Tally P&L Excel can carry several months; changing the period re-stages the
  // chosen month (ledgers, Nett Profit, reconciliation) without re-reading.
  const onPeriod = (v: string) => {
    setPeriod(v);
    if (slot.kind === 'tally-xlsx' && staged?.extracted.tallyMonths?.some((m) => m.period === v)) {
      setStaged(restageTallyMonth(staged, v));
    }
  };
  const tallyMonths = staged?.extracted.tallyMonths;
  // How this upload splits into months. When the months are read from the data
  // (dated facts, or a Tally export's own month columns) the Month input is just
  // an override; when there's nothing dated (BOM, a screenshot) it's required.
  const breakdown = staged ? monthBreakdown(staged, period) : [];
  const autoMonths = breakdown.length > 0 && breakdown[0].basis !== 'single';

  const save = async () => {
    if (!staged) return;
    setStage('saving'); setError(null);
    try {
      const metas = await commitReportMonths(slot, { ...staged, periodKey: period }, period);
      setCommitted(metas[metas.length - 1] ?? null);
      setCommittedCount(metas.length);
      setStage('ingested');
      onCommitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
      setStage('review');
    }
  };

  const hasWarn = staged?.checks.items.some((i) => i.status === 'warn') ?? false;
  // The month is mandatory only when it can't be read from the data — that key is
  // what makes a re-upload overwrite the previous one for that month.
  const periodOk = /^\d{4}-\d{2}$/.test(period);
  const canSave = stage === 'review' && staged?.checks.overall !== 'fail' && (!hasWarn || ack) && (autoMonths || periodOk);
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
            {slot.kind === 'invoice' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">PDF → AI</span>}
            {usesAI && <AiBadge />}
          </div>
          {committed && (
            <p className="text-[11px] text-emerald-700 mt-0.5">
              Ingested · {committedCount > 1 ? `${committedCount} months` : committed.periodKey}{committed.through ? ` · through ${committed.through}` : ''} · {committed.rowCount} rows · {committed.fileName}
            </p>
          )}
        </div>
        {/* Month this upload is for. When the data carries its own dates (facts or
            a Tally export's month columns) the months are read automatically and
            this is just an override; otherwise (BOM, a screenshot) it's required. */}
        <div className="shrink-0 text-right">
          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
            Month {autoMonths ? <span className="text-slate-400 font-normal">(auto)</span> : <span className="text-rose-500">*</span>}
          </label>
          <input type="month" value={period} onChange={(e) => onPeriod(e.target.value)}
            className={`px-2 py-1 rounded-lg border text-xs ${autoMonths || periodOk ? 'border-slate-200' : 'border-rose-300 bg-rose-50'}`} />
          {!autoMonths && !periodOk && <span className="block mt-0.5 text-[10px] text-rose-500">required</span>}
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center px-4 py-3">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <span className={
                'flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold tabular-nums ' +
                (i < active ? 'bg-emerald-500 text-white'
                  : i === active ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-400 border border-slate-200')
              }>{i < active ? '✓' : i + 1}</span>
              <span className={'text-xs font-semibold ' + (i <= active ? 'text-slate-800' : 'text-slate-400')}>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={'flex-1 h-0.5 mx-2 rounded ' + (i < active ? 'bg-emerald-500' : 'bg-slate-200')} />
            )}
          </div>
        ))}
      </div>

      <div
        className={'border-t px-4 py-3 space-y-3 transition-colors ' + (dragging ? 'border-brand-300 bg-brand-50/60' : 'border-slate-100')}
        onDragOver={canDrop ? (e) => { e.preventDefault(); if (!dragging) setDragging(true); } : undefined}
        onDragLeave={canDrop ? (e) => { if (e.currentTarget === e.target) setDragging(false); } : undefined}
        onDrop={canDrop ? onDrop : undefined}
      >
        {/* How to export (button → modal) */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setHowOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            {iconSteps} How to export{slot.exportUrl ? ' · link' : ''}
          </button>
        </div>

        {/* Always-visible drop box — click to browse or drag files onto it. */}
        {wired && (stage === 'idle' || stage === 'failed') && (
          <label
            className={'flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ' +
              (dragging ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50')}>
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            <span className="text-sm font-medium text-slate-700">{dragging ? 'Drop to upload' : uploadLabel}</span>
            <span className="text-[11px] text-slate-500">Drag {multiple ? 'files' : 'a file'} here or click to browse · {slot.accept}</span>
            <input type="file" accept={slot.accept} multiple={multiple} className="hidden" onChange={(e) => void onFiles(e.target.files)} />
          </label>
        )}

        {/* The files picked / dropped — shown as soon as they land. */}
        {picked.length > 0 && stage !== 'ingested' && (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((name, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-[11px] text-slate-700">
                <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l4 4v14H7zM14 3v4h4" />
                </svg>
                <span className="truncate">{name}</span>
              </span>
            ))}
          </div>
        )}

        {!wired && (
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
            The reader for this report is being built — the export steps are ready (tap “How to export”). Upload opens next.
          </p>
        )}

        <ExportHelpModal slot={slot} open={howOpen} onClose={() => setHowOpen(false)} />

        {stage === 'checking' && (
          usesAI
            ? <AiWorking label={slot.kind === 'vision' ? 'reading the screenshot' : 'reading the invoice'} />
            : <p className="text-xs text-slate-500">Running checks through the file…</p>
        )}

        {/* ② AI checks + ③ Review */}
        {(stage === 'review' || stage === 'failed') && staged && (
          <ChecksAndReview staged={staged} />
        )}

        {error && <p className="text-[11px] text-rose-700">{error}</p>}

        {/* ④ Save / ⑤ Ingest (the month lives in the header, auto-filled on upload) */}
        {stage === 'review' && staged && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            {autoMonths ? (
              <p className="text-[11px] text-slate-500">
                {breakdown.length > 1
                  ? <>Will ingest <span className="font-medium text-slate-700">{breakdown.length} months</span>, each filed to its own month: </>
                  : <>Saving into <span className="font-medium text-slate-700">{monthName(breakdown[0].periodKey)}</span> (read from the data). </>}
                {breakdown.length > 1 && (
                  <span className="text-slate-600">{breakdown.map((b) => `${monthName(b.periodKey)} (${b.rowCount})`).join(', ')}. </span>
                )}
                Re-uploading a month overwrites just that month.
              </p>
            ) : (
              <p className="text-[11px] text-slate-500">
                Saving into <span className="font-medium text-slate-700">{periodOk ? monthName(period) : 'the month set above'}</span>.
                {' '}Re-uploading for the same month overwrites the previous file.
              </p>
            )}
            {!autoMonths && !periodOk && (
              <p className="text-[11px] text-rose-500">Set the <span className="font-medium">Month</span> (top right) before saving — required.</p>
            )}
            {tallyMonths && tallyMonths.length > 1 && (
              <p className="text-[10px] text-slate-400">
                Tally export carries {tallyMonths.length} months — all are ingested: {tallyMonths.map((m) => m.periodLabel).join(', ')}
              </p>
            )}
            {hasWarn && (
              <label className="flex items-center gap-2 text-[11px] text-amber-700">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                I've reviewed the warnings above and want to save anyway.
              </label>
            )}
            <button onClick={save} disabled={!canSave}
              className="px-3 py-1.5 text-xs rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40">
              {breakdown.length > 1 ? `Save & ingest ${breakdown.length} months` : 'Save & ingest into MIS'}
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
                <input type="file" accept={slot.accept} multiple={multiple} className="hidden" onChange={(e) => void onFiles(e.target.files)} />
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceSummaryView({ invoice, trace }: { invoice: NonNullable<StagedUpload['extracted']['invoice']>; trace?: string[] }) {
  const money = (n: number | null) => (n == null ? '—' : inr(n));
  const taxable = invoice.taxableAmount ?? 0;
  const tax = invoice.taxAmount ?? 0;
  const fee = Math.round((taxable + tax) * 100) / 100;
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-2 py-0.5 ${strong ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="text-[11px]">
      {invoice.provider && <div className="text-slate-500 mb-1">{invoice.provider}{invoice.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ''}</div>}
      {row('Taxable amount', money(invoice.taxableAmount))}
      {row('GST / IGST', money(invoice.taxAmount))}
      <div className="border-t border-slate-100 my-1" />
      {row('→ Platform & Payment cost', inr(fee), true)}
      {row('TDS withheld (recoverable, excluded)', invoice.amountWithheld ? `(${money(invoice.amountWithheld)})` : '—')}
      {invoice.total != null && row('Invoice total / balance due', money(invoice.total))}
      {(invoice.periodStart || invoice.periodEnd) && (
        <div className="text-slate-400 mt-1">Billing cycle {invoice.periodStart ?? '?'} → {invoice.periodEnd ?? '?'}</div>
      )}
      {trace && trace.length > 0 && (
        <details className="mt-2 text-[10px] text-slate-400">
          <summary className="cursor-pointer hover:text-slate-600">How this was read</summary>
          <ul className="mt-1 space-y-0.5">{trace.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </details>
      )}
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
        {extracted.bomCosts && extracted.bomCosts.length > 0 ? (
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-[10px] text-slate-400 text-left border-b border-slate-200">
                <th className="py-1 pr-2">Finished good</th><th className="py-1 pr-2">BOM</th><th className="py-1 text-right">Cost / unit</th>
              </tr></thead>
              <tbody>
                {extracted.bomCosts.slice(0, 50).map((b, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-0.5 pr-2 text-slate-700 font-medium">{b.fgId}</td>
                    <td className="py-0.5 pr-2 text-slate-500">{b.bomNumber}</td>
                    <td className="py-0.5 text-right tabular-nums">{inr(b.costPerUnit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : extracted.ledgerRows && extracted.ledgerRows.length > 0 ? (
          <div className="max-h-56 overflow-auto text-[11px]">
            {extracted.ledgerRows.slice(0, 40).map((r, i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-slate-50 py-0.5"
                style={{ paddingLeft: `${Math.min(r.depth, 5) * 12}px` }}>
                <span className={`truncate ${r.confidence < 0.9 ? 'text-amber-700' : 'text-slate-600'}`}>{r.name}</span>
                <span className="tabular-nums text-slate-700">{inr(r.amount)}</span>
              </div>
            ))}
          </div>
        ) : extracted.invoice ? (
          <InvoiceSummaryView invoice={extracted.invoice} trace={extracted.trace} />
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
