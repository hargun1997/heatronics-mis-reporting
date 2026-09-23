import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SectionCard } from '../../components/ui/Card';
import { inr } from '../../components/mis-deck/charts';
import { computeClose, type Blocker, type ComputedClose } from '../../data/monthClose/compute';
import { emitClose } from '../../data/monthClose/emit';
import { checkVisionAvailable, ingestFile } from '../../data/monthClose/ingestClient';
import { normaliseLedgerPath } from '../../data/monthClose/ledgerMap';
import { PRODUCTS, normaliseSku } from '../../data/monthClose/skuMap';
import {
  CLOSE_GROUPS,
  SOURCE_KINDS,
  emptySession,
  manualProvenance,
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
  const [forcedKind, setForcedKind] = useState<SourceKind | ''>('');
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
    async (files: FileList | File[]) => {
      setError(null);
      for (const file of Array.from(files)) {
        setBusy(`Reading ${file.name}…`);
        try {
          const outcome = await ingestFile(file, forcedKind || undefined);
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
    [forcedKind],
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

  const setCogsPct = (raw: string) =>
    setSession((s) => {
      const n = parseFloat(raw.replace('%', '').trim());
      return { ...s, skuCogsPct: Number.isFinite(n) ? n / 100 : null };
    });

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
            forcedKind={forcedKind}
            setForcedKind={setForcedKind}
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
              cogsPct={session.skuCogsPct}
              onAssignSku={assignSku}
              onCogsPct={setCogsPct}
            />
          )}

          <LinesCard computed={computed} session={session} onManual={setManual} />
        </div>

        <div className="space-y-4">
          <CascadeCard computed={computed} label={session.periodLabel} />
          <ReconcileCard computed={computed} session={session} onAnchor={setAnchor} />
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

function SourcesCard(props: {
  sources: UploadedSource[];
  busy: string | null;
  visionReady: boolean | null;
  forcedKind: SourceKind | '';
  setForcedKind: (k: SourceKind | '') => void;
  onPick: () => void;
  onDrop: (files: FileList) => void;
  onRemove: (id: string) => void;
  onVerifySource: (id: string) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <SectionCard
      title="1 · Sources"
      description="Tally export or screenshots, plus any platform files. Drop several at once."
      actions={
        <select
          value={props.forcedKind}
          onChange={(e) => props.setForcedKind(e.target.value as SourceKind | '')}
          className="px-2 py-1 text-xs rounded border border-slate-200 bg-white text-slate-600"
        >
          <option value="">Detect type</option>
          {SOURCE_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>{k.label}</option>
          ))}
        </select>
      }
    >
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files) props.onDrop(e.dataTransfer.files); }}
        onClick={props.onPick}
        className={`rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition ${
          over ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
        }`}
      >
        <div className="text-sm text-slate-600">{props.busy ?? 'Drop files here, or click to browse'}</div>
        <div className="text-[10px] text-slate-400 mt-1">
          .xlsx · .csv · screenshots
          {props.visionReady === false && ' — screenshot reading is off (GEMINI_API_KEY not set); use the xlsx export'}
        </div>
      </div>

      {props.sources.length > 0 && (
        <div className="mt-3 space-y-2">
          {props.sources.map((s) => {
            const unverified = s.nodes.filter((n) => !n.provenance.verified).length;
            return (
              <div key={s.id} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-700 truncate flex-1">{s.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                    {SOURCE_KINDS.find((k) => k.kind === s.kind)?.label ?? s.kind}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {/* Platform sources carry product rows, not ledger rows. */}
                    {s.skuRows.length > 0 ? `${s.skuRows.length} SKUs` : `${s.nodes.length} rows`}
                  </span>
                  <button onClick={() => props.onRemove(s.id)} className="text-slate-300 hover:text-rose-500 text-xs">×</button>
                </div>
                {unverified > 0 && (
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-amber-700">
                      {unverified} figure{unverified === 1 ? '' : 's'} read from the image, not yet confirmed
                    </span>
                    <button
                      onClick={() => props.onVerifySource(s.id)}
                      className="text-[11px] px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    >
                      I've checked these against the screen
                    </button>
                  </div>
                )}
                {s.warnings.map((w, i) => (
                  <div key={i} className="mt-1 text-[11px] text-amber-600">⚠ {w}</div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
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

        {unverified.map((b) => (
          <div key={b.ref} className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 flex items-center gap-2">
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


function SkuCard(props: {
  computed: ComputedClose;
  blockers: Blocker[];
  cogsPct: number | null;
  onAssignSku: (ref: string, fgId: string) => void;
  onCogsPct: (raw: string) => void;
}) {
  const { sku } = props.computed;
  const productOptions = Object.values(PRODUCTS).sort((a, b) => a.deckName.localeCompare(b.deckName));

  return (
    <SectionCard
      title="SKU layer"
      description="Platform rows resolved to products. Separate from the P&L close — these gate only the SKU cells."
    >
      {props.blockers.length > 0 && (
        <div className="space-y-2 mb-3">
          {props.blockers.map((b) => (
            <div key={b.ref} className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2">
              <div className="text-xs text-slate-700">{b.message}</div>
              <select
                defaultValue=""
                onChange={(e) => e.target.value && props.onAssignSku(b.ref!, e.target.value)}
                className="mt-1.5 w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white text-slate-600"
              >
                <option value="" disabled>
                  {b.ref?.startsWith('fg:') ? 'Confirm the product…' : 'Assign to a product…'}
                </option>
                {productOptions.map((p) => (
                  <option key={p.fgId} value={p.fgId}>
                    {p.deckName} — {p.fgId} ({p.tranzactName})
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {sku.aggregates.length > 0 ? (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="text-left font-medium py-1">Product</th>
                <th className="text-left font-medium py-1">Ch</th>
                <th className="text-right font-medium py-1">Revenue</th>
                <th className="text-right font-medium py-1">Units</th>
                <th className="text-right font-medium py-1">Fees</th>
              </tr>
            </thead>
            <tbody>
              {sku.aggregates.map((a) => (
                <tr key={`${a.fgId}-${a.channel}`} className="border-b border-slate-50">
                  <td className="py-1 text-slate-700">
                    {a.deckName}
                    {!a.confirmed && <span className="ml-1 text-[9px] px-1 rounded bg-amber-100 text-amber-700">inferred</span>}
                  </td>
                  <td className="py-1 text-slate-500">{a.channel}</td>
                  <td className="py-1 text-right tabular-nums text-slate-700">{inr(a.revenue)}</td>
                  <td className="py-1 text-right tabular-nums text-slate-500">{a.units || '—'}</td>
                  <td className="py-1 text-right tabular-nums text-slate-500">{a.fees ? inr(a.fees) : '—'}</td>
                </tr>
              ))}
              <tr className="font-semibold text-slate-800">
                <td className="py-1.5" colSpan={2}>Total</td>
                <td className="py-1.5 text-right tabular-nums">{inr(sku.totalRevenue)}</td>
                <td className="py-1.5 text-right tabular-nums">{sku.totalUnits || '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(sku.totalFees)}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
            <span className="text-xs text-slate-500 flex-1">
              COGS basis (% of revenue)
              <span className="block text-[10px] text-slate-400">
                No export carries per-SKU cost, and the FG master holds selling prices — so this has to be set by hand.
              </span>
            </span>
            <input
              inputMode="decimal"
              defaultValue={props.cogsPct !== null ? String(Math.round(props.cogsPct * 1000) / 10) : ''}
              onBlur={(e) => props.onCogsPct(e.target.value)}
              placeholder="e.g. 30"
              className="w-20 px-2 py-1 text-sm text-right rounded border border-slate-200 bg-white text-slate-700 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <span className="text-xs text-slate-400">%</span>
          </div>
        </>
      ) : (
        <div className="text-xs text-slate-500">
          No platform rows resolved yet. Drop an Amazon, Shopify, Blinkit or Shiprocket export above.
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
