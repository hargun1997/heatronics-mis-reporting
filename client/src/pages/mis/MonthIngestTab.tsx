import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SectionCard } from '../../components/ui/Card';
import { inr } from '../../components/mis-deck/charts';
import { computeClose, type Blocker, type ComputedClose } from '../../data/monthClose/compute';
import { emitClose } from '../../data/monthClose/emit';
import { checkVisionAvailable, ingestFile } from '../../data/monthClose/ingestClient';
import { normaliseLedgerPath } from '../../data/monthClose/ledgerMap';
import { PRODUCTS, normaliseSku } from '../../data/monthClose/skuMap';
import { costBasisImpact } from '../../data/monthClose/skuRollup';
import { INGESTABLE_ROWS } from '../../data/misDeck/feedSources';
import {
  CLOSE_GROUPS,
  SOURCE_KINDS,
  emptySession,
  manualProvenance,
  type CostBasis,
  type MonthCloseSession,
  type SourceKind,
  type UploadedSource,
} from '../../data/monthClose/schema';

// ----------------------------------------------------------------------------
// Month ingest — drop the month's files in, review what was read, emit the close.
//
// The flow is deliberately a gate rather than a button. Three things stop an
// emit, each of which cost a round of rework on the July close:
//
//   an unmapped ledger   — silently mis-bucketing still foots, so it would
//                          never be caught by the reconciliation
//   an unconfirmed read  — anything lifted off a screenshot, because a misread
//                          digit is invisible downstream
//   an unexplained gap   — the cascade must tie to Tally's own bottom line
//
// Everything else is advisory and shown, not enforced.
// ----------------------------------------------------------------------------

const STORAGE_KEY = 'heatronics.monthClose.session';

export function MonthIngestTab() {
  const [session, setSession] = useState<MonthCloseSession>(() => loadSession());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visionReady, setVisionReady] = useState<boolean | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkVisionAvailable().then(setVisionReady);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Private mode or quota — the session just will not survive a reload.
    }
  }, [session]);

  const computed = useMemo(() => computeClose(session), [session]);

  // The P&L close does not depend on the SKU layer, so the two gates are
  // separate: an unassigned SKU withholds the SKU cells, not the month.
  const blocking = computed.blockers.filter((b) => !b.advisory && b.scope !== 'sku');
  const skuBlocking = computed.blockers.filter((b) => !b.advisory && b.scope === 'sku');
  const advisory = computed.blockers.filter((b) => b.advisory);
  const canEmit = blocking.length === 0 && Boolean(session.periodKey && session.periodLabel);

  // ---- File handling -------------------------------------------------------

  const addFiles = useCallback(
    async (files: FileList | File[], kind?: SourceKind) => {
      setError(null);
      for (const file of Array.from(files)) {
        setBusy(`Reading ${file.name}…`);
        try {
          // Dropping on a row IS the declaration of what the file is, so it
          // beats sniffing; the shared zone still guesses.
          const outcome = await ingestFile(file, kind);
          setSession((s) => ({
            ...s,
            sources: [...s.sources, outcome.source],
            anchor: outcome.suggestedAnchor && !s.anchor.nettProfit
              ? { nettProfit: outcome.suggestedAnchor }
              : s.anchor,
          }));
        } catch (err) {
          setError(err instanceof Error ? err.message : `Could not read ${file.name}.`);
        } finally {
          setBusy(null);
        }
      }
    },
    [],
  );

  const removeSource = (id: string) =>
    setSession((s) => ({ ...s, sources: s.sources.filter((x) => x.id !== id) }));

  // ---- Review actions ------------------------------------------------------

  const verifyAll = (sourceId?: string) =>
    setSession((s) => ({
      ...s,
      sources: s.sources.map((src) =>
        sourceId && src.id !== sourceId
          ? src
          : { ...src, nodes: src.nodes.map((n) => ({ ...n, provenance: { ...n.provenance, verified: true } })) },
      ),
      anchor: s.anchor.nettProfit
        ? { nettProfit: { ...s.anchor.nettProfit, provenance: { ...s.anchor.nettProfit.provenance, verified: true } } }
        : s.anchor,
    }));

  const verifyLine = (lineKey: string) =>
    setSession((s) => {
      const line = computed.lines[lineKey];
      const ids = new Set(line?.contributors.map((c) => nodeId(c.node)) ?? []);
      return {
        ...s,
        sources: s.sources.map((src) => ({
          ...src,
          nodes: src.nodes.map((n) =>
            ids.has(nodeId(n)) ? { ...n, provenance: { ...n.provenance, verified: true } } : n,
          ),
        })),
      };
    });

  const assign = (ledgerPath: string, lineKey: string) =>
    setSession((s) => ({ ...s, overrides: { ...s.overrides, [normaliseLedgerPath(ledgerPath)]: lineKey } }));

  /** ref is "sku:<platform>:<key>" or "fg:<FG-id>". */
  const assignSku = (ref: string, fgId: string) =>
    setSession((s) => {
      if (ref.startsWith('fg:')) {
        // Confirming an inferred FG → deck-name mapping for this month.
        return { ...s, skuOverrides: { ...s.skuOverrides, [ref.slice(3)]: fgId } };
      }
      const [, platform, ...rest] = ref.split(':');
      const key = rest.join(':');
      return { ...s, skuOverrides: { ...s.skuOverrides, [`${platform}:${normaliseSku(key)}`]: fgId } };
    });

  const setCostBasis = (basis: CostBasis | null) => setSession((s) => ({ ...s, costBasis: basis }));

  const setManual = (lineKey: string, raw: string) =>
    setSession((s) => {
      const next = { ...s.manual };
      const n = parseFloat(raw.replace(/[, ₹]/g, ''));
      if (!raw.trim() || !Number.isFinite(n)) delete next[lineKey];
      else next[lineKey] = { value: n, provenance: manualProvenance() };
      return { ...s, manual: next };
    });

  const setAnchor = (raw: string) =>
    setSession((s) => {
      const n = parseFloat(raw.replace(/[, ₹()]/g, ''));
      if (!raw.trim() || !Number.isFinite(n)) return { ...s, anchor: { nettProfit: null } };
      const negative = /^\(|-/.test(raw.trim());
      return { ...s, anchor: { nettProfit: { value: negative ? -Math.abs(n) : n, provenance: manualProvenance() } } };
    });

  const copy = (what: string, text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(what);
        window.setTimeout(() => setCopied(null), 1800);
      },
      () => setError('Clipboard blocked — select the text and copy it by hand.'),
    );
  };

  const reset = () => {
    if (!window.confirm('Discard this month and start over? Uploaded sources and every override will be lost.')) return;
    setSession(emptySession());
    setError(null);
  };

  // ---- Render --------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Month ingest</h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Drop the month's Tally export or screenshots in. Everything read is checked against Tally's own bottom line
            before it can be emitted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={session.periodLabel}
            onChange={(e) => {
              const label = e.target.value;
              setSession((s) => ({ ...s, periodLabel: label, periodKey: keyFromLabel(label) || s.periodKey }));
            }}
            placeholder="Month e.g. Aug 2026"
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button onClick={reset} className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <SourcesCard
            sources={session.sources}
            busy={busy}
            visionReady={visionReady}
            onPick={() => fileInput.current?.click()}
            onDrop={addFiles}
            onRemove={removeSource}
            onVerifySource={verifyAll}
          />
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".xlsx,.xlsm,.xls,.csv,.tsv,image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {blocking.length > 0 && (
            <BlockersCard
              blockers={blocking}
              computed={computed}
              onAssign={assign}
              onVerifyLine={verifyLine}
              onVerifyAll={() => verifyAll()}
            />
          )}

          {(computed.sku.hasSkuSources || skuBlocking.length > 0) && (
            <SkuCard
              computed={computed}
              blockers={skuBlocking}
              costBasis={session.costBasis}
              onAssignSku={assignSku}
              onCostBasis={setCostBasis}
            />
          )}

          <LinesCard computed={computed} session={session} onManual={setManual} />
        </div>

        <div className="space-y-4">
          <CascadeCard computed={computed} label={session.periodLabel} />
          <ReconcileCard computed={computed} session={session} onAnchor={setAnchor} />
          <CrossChecksCard sources={session.sources} computed={computed} />
          {advisory.length > 0 && <AdvisoryCard blockers={advisory} />}
          <EmitCard
            canEmit={canEmit}
            blockingCount={blocking.length}
            session={session}
            computed={computed}
            copied={copied}
            onCopy={copy}
          />
        </div>
      </div>
    </div>
  );
}

// ---- Cards -----------------------------------------------------------------

/**
 * Sources — the month's input catalogue, live.
 *
 * This used to be a drop zone plus a "force the type" dropdown, with the
 * knowledge of which files to fetch and where they come from sitting on a
 * different tab entirely. Documentation you have to go and look up is
 * documentation nobody reads at the moment they need it, so the catalogue is
 * the card now: every expected source is a row, the row says where to pull it
 * from, and dropping the file ticks it off.
 *
 * The type override still exists — sniffing can be wrong — but it belongs on
 * the file it got wrong, not as the first thing on the card.
 */
function SourcesCard(props: {
  sources: UploadedSource[];
  busy: string | null;
  visionReady: boolean | null;
  onPick: () => void;
  onDrop: (files: FileList | File[], kind?: SourceKind) => void;
  onRemove: (id: string) => void;
  onVerifySource: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const landedFor = (kind: SourceKind) => props.sources.filter((s) => s.kind === kind);
  const catalogued = new Set(INGESTABLE_ROWS.map((r) => r.kind));
  const uncatalogued = props.sources.filter((s) => !catalogued.has(s.kind));

  // Book-of-record and essential rows are the month; enhancements sharpen it.
  const required = INGESTABLE_ROWS.filter((r) => r.tier !== 'enhancement' && !r.optional);
  const optional = INGESTABLE_ROWS.filter((r) => r.tier === 'enhancement' || r.optional);
  const have = required.filter((r) => landedFor(r.kind!).length > 0).length;

  return (
    <SectionCard
      title="1 · Sources"
      description="Every file the month needs, where to pull it from, and what has landed. Drop several at once."
      actions={
        <span className={`text-xs tabular-nums ${have === required.length ? 'text-emerald-600' : 'text-slate-400'}`}>
          {have} of {required.length}
        </span>
      }
    >
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files) props.onDrop(e.dataTransfer.files); }}
        onClick={props.onPick}
        className={`rounded-lg border-2 border-dashed px-4 py-5 text-center cursor-pointer transition ${
          over ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
        }`}
      >
        <div className="text-sm text-slate-600">{props.busy ?? 'Drop files here, or click to browse'}</div>
        <div className="text-[10px] text-slate-400 mt-1">
          .xlsx · .csv · screenshots
          {props.visionReady === false && ' — screenshot reading is off (GEMINI_API_KEY not set); use the xlsx export'}
        </div>
      </div>

      <p className="mt-2 text-[10px] text-slate-400 text-center">
        Dropped here, files are identified automatically. Drop one straight onto its row below to say what it is.
      </p>

      <div className="mt-4 space-y-1.5">
        {required.map((row) => (
          <ChecklistRow
            key={`${row.source}:${row.export}`}
            row={row}
            landed={landedFor(row.kind!)}
            onDrop={props.onDrop}
            onRemove={props.onRemove}
            onVerifySource={props.onVerifySource}
          />
        ))}
      </div>

      {(showAll || optional.some((r) => landedFor(r.kind!).length > 0)) && (
        <div className="mt-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 pt-1">Optional — sharpens the detail</div>
          {optional.map((row) => (
            <ChecklistRow
              key={`${row.source}:${row.export}`}
              row={row}
              landed={landedFor(row.kind!)}
              onDrop={props.onDrop}
              onRemove={props.onRemove}
              onVerifySource={props.onVerifySource}
            />
          ))}
        </div>
      )}

      {!showAll && !optional.some((r) => landedFor(r.kind!).length > 0) && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-[11px] text-slate-400 hover:text-slate-600"
        >
          + {optional.length} optional source{optional.length === 1 ? '' : 's'}
        </button>
      )}

      {uncatalogued.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Not in the checklist</div>
          {uncatalogued.map((s) => (
            <LandedFile key={s.id} source={s} onRemove={props.onRemove} onVerifySource={props.onVerifySource} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * One expected source: where it comes from, and whether it has arrived.
 *
 * The row is its own drop target. Dropping a file here declares what it is,
 * which beats sniffing it and removes the need for a separate "force the type"
 * control — the thing you dropped it on IS the type.
 */
function ChecklistRow(props: {
  row: (typeof INGESTABLE_ROWS)[number];
  landed: UploadedSource[];
  onDrop: (files: FileList | File[], kind?: SourceKind) => void;
  onRemove: (id: string) => void;
  onVerifySource: (id: string) => void;
}) {
  const { row, landed } = props;
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const here = landed.length > 0;

  const tone = over
    ? 'border-brand-400 bg-brand-50'
    : here
      ? 'border-emerald-100 bg-emerald-50/40'
      : 'border-slate-100 hover:border-slate-300';

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (e.dataTransfer.files?.length) props.onDrop(e.dataTransfer.files, row.kind);
      }}
      className={`rounded-lg border px-3 py-2 transition-colors ${tone}`}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept=".xlsx,.xlsm,.xls,.csv,.tsv,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void props.onDrop(e.target.files, row.kind);
          e.target.value = '';
        }}
      />

      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 text-xs shrink-0 ${here ? 'text-emerald-600' : 'text-slate-300'}`}>
          {here ? '✓' : '○'}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <button onClick={() => setOpen(!open)} className="text-left flex-1 min-w-0">
              <span className="text-xs font-medium text-slate-700">{row.export}</span>
              <span className="text-[10px] text-slate-400 ml-1.5">{row.source}</span>
              <span className="block text-[11px] text-slate-500 leading-snug">{row.where}</span>
            </button>
            <button
              onClick={() => input.current?.click()}
              className="shrink-0 px-2 py-0.5 rounded border border-slate-200 bg-white text-[10px] text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              {here ? 'Replace' : 'Choose file'}
            </button>
          </div>

          {row.caution && (
            <div className="mt-1 text-[10px] text-amber-700 leading-snug">⚠ {row.caution}</div>
          )}

          {open && (
            <dl className="mt-1.5 space-y-1 text-[10px] text-slate-500 leading-snug">
              <div><dt className="inline font-medium text-slate-600">Columns needed: </dt><dd className="inline">{row.fields}</dd></div>
              <div><dt className="inline font-medium text-slate-600">Feeds: </dt><dd className="inline">{row.feeds}</dd></div>
              <div><dt className="inline font-medium text-slate-600">Self-check: </dt><dd className="inline">{row.check}</dd></div>
            </dl>
          )}

          {landed.map((s) => (
            <LandedFile key={s.id} source={s} compact onRemove={props.onRemove} onVerifySource={props.onVerifySource} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A file that has landed: what it yielded, what it complained about. */
function LandedFile(props: {
  source: UploadedSource;
  compact?: boolean;
  onRemove: (id: string) => void;
  onVerifySource: (id: string) => void;
}) {
  const s = props.source;
  const unverified = s.nodes.filter((n) => !n.provenance.verified).length;
  const yielded =
    s.bomCosts.length > 0
      ? `${s.bomCosts.length} BOM costs`
      : s.skuRows.length > 0
        ? `${s.skuRows.length} product rows`
        : s.nodes.length > 0
          ? `${s.nodes.length} ledger rows`
          : s.crossChecks.length > 0
            ? `${s.crossChecks.length} figures`
            : 'nothing';

  return (
    <div className={props.compact ? 'mt-1.5' : ''}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-600 truncate flex-1" title={s.label}>{s.label}</span>
        <span className="text-[10px] text-slate-400 shrink-0">{yielded}</span>
        <button
          onClick={() => props.onRemove(s.id)}
          className="text-slate-300 hover:text-rose-500 text-xs shrink-0"
          title="Remove this file"
        >
          ×
        </button>
      </div>

      {!props.compact && (
        <div className="text-[10px] text-slate-400">
          read as {SOURCE_KINDS.find((k) => k.kind === s.kind)?.label ?? s.kind}
        </div>
      )}

      {unverified > 0 && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[11px] text-amber-700">
            {unverified} figure{unverified === 1 ? '' : 's'} read from the image, not yet confirmed
          </span>
          <button
            onClick={() => props.onVerifySource(s.id)}
            className="text-[11px] px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 shrink-0"
          >
            I&apos;ve checked these against the screen
          </button>
        </div>
      )}

      {s.warnings.map((w, i) => (
        <div key={i} className="mt-1 text-[10px] text-amber-600 leading-snug">⚠ {w}</div>
      ))}
    </div>
  );
}

function BlockersCard(props: {
  blockers: Blocker[];
  computed: ComputedClose;
  onAssign: (path: string, lineKey: string) => void;
  onVerifyLine: (lineKey: string) => void;
  onVerifyAll: () => void;
}) {
  const unmapped = props.blockers.filter((b) => b.kind === 'unmapped');
  const unverified = props.blockers.filter((b) => b.kind === 'unverified');
  const rest = props.blockers.filter((b) => b.kind !== 'unmapped' && b.kind !== 'unverified');

  return (
    <SectionCard
      title={`2 · Needs you — ${props.blockers.length}`}
      description="Each of these would otherwise land silently. Clear them and the close unlocks."
      actions={
        unverified.length > 1 ? (
          <button
            onClick={props.onVerifyAll}
            className="px-2.5 py-1 rounded-lg text-xs border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          >
            Confirm all {unverified.length} reads
          </button>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {unmapped.map((b) => (
          <div key={b.ref} className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2">
            <div className="text-xs text-slate-700">{b.message}</div>
            <select
              defaultValue=""
              onChange={(e) => e.target.value && props.onAssign(b.ref!, e.target.value)}
              className="mt-1.5 w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white text-slate-600"
            >
              <option value="" disabled>Assign to…</option>
              {CLOSE_GROUPS.map((g) => (
                <optgroup key={g.title} label={g.title}>
                  {g.lines.map((l) => (
                    <option key={l.key} value={l.key}>{l.label}</option>
                  ))}
                </optgroup>
              ))}
              <option value="ignore">— not a P&amp;L line, ignore it —</option>
            </select>
          </div>
        ))}

        {unverified.map((b, i) => (
          <div key={`${i}:${b.ref ?? b.message}`} className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 flex items-center gap-2">
            <span className="text-xs text-slate-700 flex-1">{b.message}</span>
            <button
              onClick={() => props.onVerifyLine(b.ref!)}
              className="text-[11px] px-2 py-0.5 rounded border border-amber-200 bg-white text-amber-700 hover:bg-amber-100 shrink-0"
            >
              Confirm
            </button>
          </div>
        ))}

        {rest.map((b, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {b.message}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}


/**
 * What the platform files say, beside what Tally says.
 *
 * Platform exports are deliberately NOT a second path into the cascade — Tally
 * is the authority, and adding a platform's own fee total to a ledger that
 * already records it would double count. Holding them side by side is what
 * they are good for: July's Amazon settlement came in within 0.18% of Tally's
 * Ecommerce Sales, which is how the file earned its keep.
 */
function CrossChecksCard(props: { sources: UploadedSource[]; computed: ComputedClose }) {
  const checks = props.sources.flatMap((s) => (s.crossChecks ?? []).map((c) => ({ ...c, source: s.label })));
  if (checks.length === 0) return null;

  const lineTotal = (key: string): number | null => {
    const line = props.computed.lines[key];
    return line ? Math.abs(line.amount) : null;
  };

  return (
    <SectionCard
      title="Platform vs Tally"
      description="Held side by side, never added. A wide gap means a missing or duplicated file — not a number to fix."
    >
      <table className="w-full text-xs">
        <tbody>
          {checks.map((c, i) => {
            const tally = c.against ? lineTotal(c.against) : null;
            const gap = tally !== null ? Math.abs(c.amount) - tally : null;
            const wide = gap !== null && tally !== null && tally > 0 && Math.abs(gap) > tally * 0.05;
            return (
              <tr key={`${c.source}-${c.label}-${i}`} className="border-b border-slate-50 align-top">
                <td className="py-1 text-slate-600">
                  {c.label}
                  {c.note && <span className="block text-[10px] text-slate-400 leading-snug">{c.note}</span>}
                </td>
                <td className="py-1 text-right tabular-nums text-slate-700 whitespace-nowrap pl-2">{inr(c.amount)}</td>
                <td className="py-1 text-right tabular-nums whitespace-nowrap pl-2 text-[10px]">
                  {tally === null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className={wide ? 'text-amber-600' : 'text-emerald-600'}>
                      {gap === null || tally === 0 ? '' : `${gap >= 0 ? '+' : '−'}${((Math.abs(gap) / tally) * 100).toFixed(1)}%`}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </SectionCard>
  );
}

function SkuCard(props: {
  computed: ComputedClose;
  blockers: Blocker[];
  costBasis: CostBasis | null;
  onAssignSku: (ref: string, fgId: string) => void;
  onCostBasis: (basis: CostBasis | null) => void;
}) {
  const { sku } = props.computed;
  const productOptions = Object.values(PRODUCTS).sort((a, b) => a.deckName.localeCompare(b.deckName));
  const impact = costBasisImpact(sku);

  return (
    <SectionCard
      title="SKU layer"
      description="Platform rows resolved to products and priced from the Tranzact BOMs. Separate from the P&L close — these gate only the SKU cells."
    >
      {props.blockers.length > 0 && (
        <div className="space-y-2 mb-3">
          {props.blockers.map((b, i) => (
            <div key={`${i}:${b.ref ?? b.message}`} className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2">
              <div className="text-xs text-slate-700">{b.message}</div>
              {b.ref && b.ref !== 'costBasis' && !b.ref.startsWith('cost:') && (
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && props.onAssignSku(b.ref!, e.target.value)}
                  className="mt-1.5 w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white text-slate-600"
                >
                  <option value="" disabled>
                    {b.ref.startsWith('fg:') ? 'Confirm the product…' : 'Assign to a product…'}
                  </option>
                  {productOptions.map((p) => (
                    <option key={p.fgId} value={p.fgId}>
                      {p.deckName} — {p.fgId} ({p.tranzactName})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )}

      {sku.costBook.count > 0 && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-slate-700">Cost basis</span>
            <span className="text-[10px] text-slate-400">{sku.costBook.count} finished goods priced</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
            Tranzact holds the same physical product twice — under the legacy <code>HTR-*</code> item codes and
            under the later <code>hCore-*</code> ones. Nothing in the platform files says which generation a SKU
            means, and their standard costs differ by up to 44%.
          </p>
          <div className="mt-2 flex gap-2">
            {([
              ['legacy', 'Legacy HTR-*'],
              ['hcore', 'Current hCore-*'],
            ] as [CostBasis, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => props.onCostBasis(props.costBasis === value ? null : value)}
                className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                  props.costBasis === value
                    ? 'border-brand-300 bg-brand-50 text-brand-700 font-medium'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
                {impact && (
                  <span className="block text-[10px] font-normal tabular-nums opacity-70">
                    {inr(value === 'legacy' ? impact.legacy : impact.hcore)} COGS
                  </span>
                )}
              </button>
            ))}
          </div>
          {impact && impact.difference !== 0 && (
            <p className="mt-1.5 text-[10px] text-slate-400">
              {inr(Math.abs(impact.difference))} apart on {inr(impact.forkedRevenue)} of revenue. The legacy codes
              are what the committed months use: they reproduce July&apos;s published Amazon COGS to 0.4%.
            </p>
          )}
        </div>
      )}

      {sku.aggregates.length > 0 ? (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="text-left font-medium py-1">Product</th>
                <th className="text-left font-medium py-1">Ch</th>
                <th className="text-right font-medium py-1">Units</th>
                <th className="text-right font-medium py-1">Revenue</th>
                <th className="text-right font-medium py-1">COGS</th>
                <th className="text-right font-medium py-1">Fees</th>
                <th className="text-right font-medium py-1">CM1</th>
              </tr>
            </thead>
            <tbody>
              {sku.aggregates.map((a) => (
                <tr key={`${a.fgId}-${a.channel}`} className="border-b border-slate-50">
                  <td className="py-1 text-slate-700">
                    {a.deckName}
                    {!a.confirmed && <span className="ml-1 text-[9px] px-1 rounded bg-amber-100 text-amber-700">inferred</span>}
                    {a.byTitle && <span className="ml-1 text-[9px] px-1 rounded bg-sky-100 text-sky-700">by title</span>}
                  </td>
                  <td className="py-1 text-slate-500">{a.channel}</td>
                  <td className="py-1 text-right tabular-nums text-slate-500">{a.units || '—'}</td>
                  <td className="py-1 text-right tabular-nums text-slate-700">{inr(a.revenue)}</td>
                  <td
                    className="py-1 text-right tabular-nums text-slate-500"
                    title={a.bomNumber ? `${a.fgId} @ ₹${a.costPerUnit}/unit from ${a.bomNumber}` : undefined}
                  >
                    {a.cogs === null ? <span className="text-rose-500">no BOM</span> : inr(a.cogs)}
                  </td>
                  <td className="py-1 text-right tabular-nums text-slate-500">{a.fees ? inr(a.fees) : '—'}</td>
                  <td className="py-1 text-right tabular-nums text-slate-700">
                    {a.contribution === null ? '—' : inr(a.contribution)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold text-slate-800">
                <td className="py-1.5" colSpan={2}>Total</td>
                <td className="py-1.5 text-right tabular-nums">{sku.totalUnits || '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(sku.totalRevenue)}</td>
                <td className="py-1.5 text-right tabular-nums">{sku.totalCogs === null ? '—' : inr(sku.totalCogs)}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(sku.totalFees)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {inr(sku.aggregates.reduce((t, a) => t + (a.contribution ?? 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">
            Fees are what each platform attributes to the SKU. Shopify reports none and Shiprocket&apos;s freight
            carries no SKU at all, so D2C contribution here is before fulfilment — it is not comparable with
            Amazon&apos;s.
          </p>
        </>
      ) : (
        <div className="text-xs text-slate-500">
          No platform rows resolved yet. Drop an Amazon unified transaction, a Shopify variant export, a Blinkit
          payout workbook or the Tranzact BOM pricing file above.
        </div>
      )}
    </SectionCard>
  );
}

function LinesCard(props: {
  computed: ComputedClose;
  session: MonthCloseSession;
  onManual: (lineKey: string, raw: string) => void;
}) {
  return (
    <SectionCard title="3 · Lines" description="What each line resolved to, and where it came from. Type to override.">
      <div className="space-y-4">
        {CLOSE_GROUPS.map((g) => (
          <div key={g.title}>
            <div className="text-[11px] font-medium text-slate-500 mb-1">{g.title}</div>
            <div className="space-y-1">
              {g.lines.map((l) => {
                const line = props.computed.lines[l.key];
                const manual = props.session.manual[l.key];
                const contributors = line?.contributors ?? [];
                return (
                  <div key={l.key} className="flex items-center gap-3 py-1 border-b border-slate-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700 flex items-center gap-1.5">
                        {l.label}
                        {line && !line.verified && (
                          <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-700">unconfirmed</span>
                        )}
                        {manual && <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-500">manual</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {contributors.length > 0
                          ? `from ${contributors.map((c) => c.node.name).slice(0, 2).join(', ')}${contributors.length > 2 ? ` +${contributors.length - 2}` : ''}`
                          : l.source}
                      </div>
                    </div>
                    <input
                      inputMode="decimal"
                      value={manual ? String(manual.value) : ''}
                      onChange={(e) => props.onManual(l.key, e.target.value)}
                      placeholder={line ? fmtPlain(line.amount) : '—'}
                      className="w-32 px-2 py-1 text-sm text-right rounded border border-slate-200 bg-white text-slate-700 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-200 placeholder:text-slate-400"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function CascadeCard({ computed: c, label }: { computed: ComputedClose; label: string }) {
  const rows: { label: string; value: number; strong?: boolean; cost?: boolean }[] = [
    { label: 'Net Revenue', value: c.netRevenue, strong: true },
    { label: 'Less: COGM', value: -c.cogm, cost: true },
    { label: 'Gross Margin', value: c.grossMargin, strong: true },
    { label: 'Less: Channel & fulfilment', value: -c.channelFulfillment, cost: true },
    { label: 'CM1', value: c.cm1, strong: true },
    { label: 'Less: Sales & marketing', value: -c.salesMarketing, cost: true },
    { label: 'CM2', value: c.cm2, strong: true },
    { label: 'Less: Platform / brand', value: -c.platformCosts, cost: true },
    { label: 'CM3', value: c.cm3, strong: true },
    { label: 'Less: Operating expenses', value: -c.opex, cost: true },
    { label: 'EBITDA', value: c.ebitda, strong: true },
    { label: 'Less: Non-operating', value: -c.nonOperating, cost: true },
    { label: 'Net Income', value: c.netIncome, strong: true },
  ];
  const pct = (v: number) => (c.netRevenue ? `${((v / c.netRevenue) * 100).toFixed(1)}%` : '');

  return (
    <SectionCard title={`P&L · ${label || 'this month'}`} description="Live as sources land.">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={`border-b border-slate-50 ${r.strong ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
              <td className="py-1.5 pr-2">{r.label}</td>
              <td className={`py-1.5 text-right tabular-nums ${r.value < 0 && r.strong ? 'text-rose-600' : ''}`}>{inr(r.value)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums text-[11px] text-slate-400 w-12">{r.strong ? pct(r.value) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

function ReconcileCard(props: {
  computed: ComputedClose;
  session: MonthCloseSession;
  onAnchor: (raw: string) => void;
}) {
  const r = props.computed.reconciliation;
  const anchor = props.session.anchor.nettProfit;

  return (
    <SectionCard title="Reconciliation" description="The cascade must tie to Tally's own bottom line.">
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Tally Nett Profit / Loss</span>
          <input
            inputMode="decimal"
            defaultValue={anchor ? String(anchor.value) : ''}
            onBlur={(e) => props.onAnchor(e.target.value)}
            placeholder="e.g. -351328"
            className="w-32 px-2 py-1 text-sm text-right rounded border border-slate-200 bg-white text-slate-700 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Cascade gives</span>
          <span className="tabular-nums text-slate-700">{inr(r.computedNet)}</span>
        </div>

        {r.items.map((i) => (
          <div key={i.label} className="pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{i.label}</span>
              <span className="tabular-nums text-slate-700">{inr(i.amount)}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{i.explanation}</div>
          </div>
        ))}

        {r.tallyNett !== null && (
          <div className={`mt-1 pt-2 border-t rounded-lg px-2 py-1.5 ${r.ok ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'}`}>
            <div className="flex items-center justify-between">
              <span className={r.ok ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
                {r.ok ? 'Ties' : 'Unexplained'}
              </span>
              <span className="tabular-nums font-semibold">{inr(r.residual ?? 0)}</span>
            </div>
            {!r.ok && (
              <div className="text-[10px] text-rose-600 mt-0.5">
                A ledger is mis-bucketed or missing. Do not circulate until this is nil.
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function AdvisoryCard({ blockers }: { blockers: Blocker[] }) {
  return (
    <SectionCard title="Worth a look" description="Not blocking, but these have bitten before.">
      <div className="space-y-2">
        {blockers.map((b, i) => (
          <div key={i} className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-slate-700">
            {b.message}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function EmitCard(props: {
  canEmit: boolean;
  blockingCount: number;
  session: MonthCloseSession;
  computed: ComputedClose;
  copied: string | null;
  onCopy: (what: string, text: string) => void;
}) {
  const [note, setNote] = useState('');
  const emitted = useMemo(
    () => (props.canEmit ? emitClose(props.session, props.computed, note.trim() || undefined) : null),
    [props.canEmit, props.session, props.computed, note],
  );

  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionCard title="4 · Emit" description="The entry, the writeup and any new ledger mappings.">
      {!props.canEmit ? (
        <div className="text-xs text-slate-500">
          {props.blockingCount > 0
            ? `${props.blockingCount} item${props.blockingCount === 1 ? '' : 's'} above must be cleared first.`
            : 'Name the month to enable the emit.'}
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Restatement note — what changed and why (lands at the top of the writeup)."
            rows={2}
            className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <div className="grid grid-cols-2 gap-2">
            <EmitButton label="MonthlyMIS entry" done={props.copied === 'entry'} onClick={() => props.onCopy('entry', emitted!.entryTs)} />
            <EmitButton label="Ledger map adds" done={props.copied === 'map'} onClick={() => props.onCopy('map', emitted!.mapAdditionsTs)} />
            <EmitButton label="Writeup (copy)" done={props.copied === 'md'} onClick={() => props.onCopy('md', emitted!.markdown)} />
            <EmitButton label="Writeup (.md)" onClick={() => download(emitted!.markdownFileName, emitted!.markdown)} />
            {emitted!.skuCellsTs && (
              <>
                <EmitButton label="SKU cells" done={props.copied === 'sku'} onClick={() => props.onCopy('sku', emitted!.skuCellsTs!)} />
                <EmitButton label="SKU map adds" done={props.copied === 'skumap'} onClick={() => props.onCopy('skumap', emitted!.skuAdditionsTs)} />
              </>
            )}
          </div>
          {emitted!.skuBlockedReason && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
              <span className="font-medium text-slate-700">SKU cells withheld.</span> {emitted!.skuBlockedReason}
            </div>
          )}
          <div className="text-[10px] text-slate-400">
            Paste the entry into <code className="text-slate-500">MONTHLY_MIS</code> in misDeckData.ts, drop the writeup in
            at the repo root, merge the map additions into <code className="text-slate-500">SEED_LEDGER_MAP</code>, then open
            a PR. The deck reads from the committed data, so it goes live on the next deploy.
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function EmitButton({ label, done, onClick }: { label: string; done?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100"
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

// ---- Helpers ---------------------------------------------------------------

function nodeId(n: { name: string; path: string[]; amount: number }): string {
  return `${[...n.path, n.name].join('>')}|${n.amount}`;
}

function fmtPlain(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Aug 2026" → "2026-08". Returns '' when the label is not yet a month. */
function keyFromLabel(label: string): string {
  const m = label.trim().toLowerCase().match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (!m) return '';
  const idx = MONTH_ABBR.indexOf(m[1]);
  if (idx < 0) return '';
  return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
}

function loadSession(): MonthCloseSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySession();
    const parsed = JSON.parse(raw) as MonthCloseSession;
    // Guard against a stored shape from an older build.
    if (!Array.isArray(parsed.sources) || typeof parsed.overrides !== 'object') return emptySession();
    return { ...emptySession(), ...parsed };
  } catch {
    return emptySession();
  }
}
