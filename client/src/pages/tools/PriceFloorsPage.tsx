// Amazon price floors — lowest Amazon price per SKU that still leaves the target margin.
// Product cost comes from production.heatronics.in; Amazon economics from the
// Seller Central "Revenue and fees" report uploaded here.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { HeaderMore, PageHeader } from '../../components/ui/PageHeader';
import { KpiTile } from '../../components/ui/KpiTile';
import { BTN, BTN_PRIMARY, ErrorBox, InfoTip, Panel } from '../../components/ui/states';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Modal } from '../../components/ui/overlays';
import {
  DEFAULT_GLOBAL,
  DEFAULT_SETTINGS,
  SELLER_CENTRAL_REPORTS,
  buyGstOf,
  costIn,
  grossCost,
  assumptionsLine,
  bandAdvice,
  bandLine,
  isFbm,
  isFirstParty,
  routeTag,
  unsellOf,
  waterfallRows,
  withSpecs,
  detailLines,
  groupLines,
  marginOf,
  mergeReport,
  pct,
  returnRate,
  rs,
  solve,
  type CostIn,
  type CostsSnapshot,
  type FeeReport,
  type FloorSettings,
  type FloorSku,
  type BandAdvice,
  type ProductCost,
} from '../../utils/priceFloors';
import { FeeReportError, parseFeeReport } from '../../utils/sellerCentralFees';

interface ReportMeta { id: string; fileName: string; uploadedAt: string; uploadedBy: string | null; skus: number }
interface ApiState { settings: FloorSettings | null; costs: CostsSnapshot | null; reports: ReportMeta[] }
/** GET /api/price-floors/live: the fee-report shape built from Ops' stored Amazon data (last 30 full days). */
interface LiveSnap { report: (FeeReport & { live: { from: string; to: string; notes: string[]; feesGst: 'itemised' | 'assumed' } }) | null; at: string; error: string | null }

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m?: string) => (m ? `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}` : '—');
/** Which overheads month and pace Production used, with a few ₹ per unit examples. */
const convLine = (c: NonNullable<CostsSnapshot['conversion']>) => {
  const lakh = (v: number) => `₹${(v / 100000).toFixed(2)} L`;
  const pace = c.pace === 'actual' && c.floorDays ? `÷ ${Math.round(c.floorDays * 10) / 10} floor-days of real output` : '÷ 26 days ÷ units a day';
  const ex = (c.types || []).filter((t) => t.perUnit).slice(0, 3).map((t) => `${t.type} ₹${Math.round(t.perUnit!)}`).join(' · ');
  return (
    <>
      Overheads {lakh(c.total)} ({monthName(c.overheadsMonth)}) {pace}{ex ? ` · ${ex}` : ''}. Change them in Production, Settings, Overheads &amp; pace.
    </>
  );
};

async function api<T>(url: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(url, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `Request failed (${res.status})`);
  return j as T;
}

/** cost = product cost incl. the GST paid on materials; c = the split solve() needs. */
interface Row { x: FloorSku; p: ProductCost | null; c: CostIn | null; cost: number | null }

export function PriceFloorsPage() {
  const [state, setState] = useState<ApiState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tacos, setTacos] = useState<string>('0.1');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [picker, setPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api<ApiState>('/api/price-floors'));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Live Amazon fees, prices, units and returns from Ops (no upload): merged into the settings once per new report.
  const [live, setLive] = useState<LiveSnap | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const loadLive = useCallback(async (force = false) => {
    setLiveBusy(true);
    try { setLive(await api<LiveSnap>(`/api/price-floors/live${force ? '?force=1' : ''}`)); }
    catch (e) { setLive({ report: null, at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) }); }
    finally { setLiveBusy(false); }
  }, []);
  useEffect(() => { void loadLive(); }, [loadLive]);
  useEffect(() => {
    const rep = live?.report;
    if (!state || !rep?.rows.length) return;
    const cur = state.settings || DEFAULT_SETTINGS;
    const fresh = rep.rows.some((r) => r.sold && cur.skus.find((x) => x.asin === r.asin)?.reportId !== rep.id);
    if (!fresh) return;
    const merged = mergeReport(cur, rep).settings;
    setState((st) => (st ? { ...st, settings: merged } : st));
    api<{ settings: FloorSettings }>('/api/price-floors/settings', { settings: merged, by: 'live' })
      .then((r) => setState((st) => (st ? { ...st, settings: r.settings } : st)))
      .catch(() => { /* the merged numbers still show; saved on the next load */ });
  }, [live, state]);

  const settings = state?.settings || DEFAULT_SETTINGS;
  const costs = state?.costs || null;
  // what the prices use: the saved settings plus storage / freight per SKU from Production's product specs
  const calc = useMemo(() => withSpecs(settings, costs?.specs), [settings, costs]);
  const products = useMemo(() => (costs?.products || []) as ProductCost[], [costs]);
  const rows: Row[] = useMemo(
    () => calc.skus.map((x) => {
      const p = products.find((q) => q.item === x.item) || null;
      const c = costIn(p);
      return { x, p, c, cost: c ? grossCost(c, settings) : null };
    }),
    [calc, settings, products],
  );

  const refreshCosts = async () => {
    setBusy('costs');
    try {
      const r = await api<{ costs: CostsSnapshot }>('/api/price-floors/costs/refresh', {});
      setState((s) => (s ? { ...s, costs: r.costs } : s));
      setNote(r.costs.error ? { tone: 'bad', text: `Couldn't refresh costs: ${r.costs.error}` } : { tone: 'good', text: `Costs refreshed from the production portal (${monthName(r.costs.month)}).` });
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const t = Number(tacos);
  const m = marginOf(settings);
  const priced = rows.filter((r) => r.cost != null);
  const u = unsellOf(settings);
  const below = priced.filter((r) => solve(r.x, calc, r.c!, u, t).price > r.x.asp);
  const g = settings.global;
  const saveGlobal = async (patch: Partial<FloorSettings['global']>, what: string) => {
    const next = { ...settings, global: { ...settings.global, ...patch } };
    setState((st) => (st ? { ...st, settings: next } : st));
    try {
      const r = await api<{ settings: FloorSettings }>('/api/price-floors/settings', { settings: next });
      setState((st) => (st ? { ...st, settings: r.settings } : st));
      setNote({ tone: 'good', text: `${what} saved.` });
    } catch (e) {
      setNote({ tone: 'bad', text: `Couldn't save: ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  const unmapped = rows.filter((r) => !r.p);

  const [modal, setModal] = useState<null | 'settings' | 'reports' | 'upload'>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const rep = live?.report;
  const latest = state?.reports[0];

  return (
    <>
      <PageHeader
        title="Price floors"
        description="The lowest Amazon price for each product that gives your target margin."
        help={
          <ol className="list-decimal space-y-1 pl-4">
            <li>Select the ad spend you expect.</li>
            <li>Read the Action column for each product.</li>
            <li>Select a product to see its cost waterfall.</li>
            <li>Select Download report to get the PDF.</li>
          </ol>
        }
        actions={
          <>
            <HeaderMore>
              <button type="button" onClick={() => setModal('settings')} className={BTN}>Settings</button>
              <button type="button" onClick={() => setModal('reports')} className={BTN}>Fee reports</button>
            </HeaderMore>
            <button type="button" onClick={() => setPicker(true)} className={BTN_PRIMARY}>Download report</button>
          </>
        }
      />
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-10 sm:px-6 lg:px-8">
        {loadError && <ErrorBox onRetry={() => void load()}>Unable to load the price floors: {loadError}</ErrorBox>}
        {note && <Banner tone={note.tone} onClose={() => setNote(null)}>{note.text}</Banner>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            label="Selling below target"
            value={priced.length ? <span className={below.length ? 'text-rose-700' : 'text-emerald-700'}>{below.length} of {priced.length}</span> : '—'}
            sub={`At ${fmtPct(m)} margin, ${Math.round(t * 100)}% ads`}
          />
          <KpiTile
            label="Product costs"
            value={costs?.month ? monthName(costs.month) : <span className="text-slate-600">Not loaded</span>}
            sub={
              <span className="flex flex-wrap items-center gap-x-2">
                {costs?.error ? <span className="text-rose-700">Last refresh failed</span> : <span>Updated {when(costs?.fetchedAt)}</span>}
                <button type="button" onClick={refreshCosts} disabled={busy === 'costs'} className="min-h-11 font-semibold text-accent-700 hover:underline disabled:opacity-60 sm:min-h-7">
                  {busy === 'costs' ? 'Refreshing…' : 'Refresh'}
                </button>
                <InfoTip label="About product costs">
                  <p>Cost = materials + {fmtPct(buyGstOf(settings))} GST + conversion, from production.heatronics.in.</p>
                  <p>{costs?.conversion ? convLine(costs.conversion) : 'Production has no overheads, so the costs are materials only.'}</p>
                  {costs?.error && <p className="text-rose-700">Last refresh failed: {costs.error}{costs.month ? '. The page shows the last good costs.' : ''}</p>}
                </InfoTip>
              </span>
            }
          />
          <KpiTile
            label="Amazon fees"
            value={rep ? 'Live' : latest ? when(latest.uploadedAt) : liveBusy && !live ? 'Loading…' : 'Starting values'}
            sub={
              <span className="flex flex-wrap items-center gap-x-2">
                <span>{rep ? `Last 30 days, ${rep.rows.length} products` : latest ? 'From an uploaded report' : 'From the 14 Oct fee report'}</span>
                <button type="button" onClick={() => setModal('upload')} className="min-h-11 font-semibold text-accent-700 hover:underline sm:min-h-7">Upload</button>
                {rep && <button type="button" onClick={() => void loadLive(true)} disabled={liveBusy} className="min-h-11 font-semibold text-accent-700 hover:underline disabled:opacity-60 sm:min-h-7">{liveBusy ? 'Refreshing…' : 'Refresh'}</button>}
                <InfoTip label="About Amazon fees">
                  {rep ? (
                    <>
                      <p>Live from Amazon through Ops, {rep.live.from.slice(5)} to {rep.live.to.slice(5)}: {rep.rows.length} products, {rep.totals.units.toLocaleString('en-IN')} units, {rs(rep.totals.sales)} sales.</p>
                      {rep.live.notes.map((n) => <p key={n}>{n}</p>)}
                      <p>Updated {when(live?.at)}.</p>
                    </>
                  ) : (
                    <p>Live fees are not available{live?.error ? ` (${live.error})` : ''}. Upload a fee report from Seller Central.</p>
                  )}
                  {live?.error && rep && <p className="text-amber-800">Last refresh failed ({live.error}). The page shows the copy from {when(live.at)}.</p>}
                </InfoTip>
              </span>
            }
          />
          <KpiTile
            label="Products with a cost"
            value={<span className={unmapped.length && products.length ? 'text-amber-700' : 'text-slate-900'}>{rows.length - unmapped.length} of {rows.length}</span>}
            sub={!products.length ? 'Waiting for product costs' : unmapped.length ? 'Link the rest in Settings' : 'All products have a cost'}
          />
        </div>

        <Panel title="Pricing guide" count={rows.length} flush
          action={<InfoTip label="What the prices include" align="right">
            <p>Prices include {assumptionsLine(settings)}.</p>
            <p>{u ? `${fmtPct(u)} of returns cannot be resold (lost unit + removal fee counted).` : 'All returns are resold.'} Change it in Settings.</p>
            <p>FBM products pay a courier for each order. They pay no FBA fees.</p>
            <p>Do not sell below break-even.</p>
          </InfoTip>}>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div className="overflow-x-auto">
              <SegmentedControl
                size="sm"
                aria-label="Ad spend"
                value={tacos}
                onChange={setTacos}
                options={[0, 0.05, 0.1, 0.15, 0.2].map((v) => ({ id: String(v), label: `${Math.round(v * 100)}% ads` }))}
              />
            </div>
            <PctInput key={`m${m}`} label="Target margin" value={m} onSave={(v) => saveGlobal({ margin: v }, `Target margin ${fmtPct(v)}`)} />
            <PctInput
              key={`r${g.reseller}${g.resellerOn}`}
              label="3P margin"
              value={g.reseller ?? DEFAULT_GLOBAL.reseller}
              on={g.resellerOn !== false}
              onToggle={(on) => saveGlobal({ resellerOn: on }, on ? '3P margin on' : '3P margin off')}
              onSave={(v) => saveGlobal({ reseller: v }, `3P margin ${fmtPct(v)}`)}
            />
            <PctInput
              key={`p${g.packing}${g.packingOn}`}
              label="Packing"
              value={g.packing ?? DEFAULT_GLOBAL.packing}
              on={g.packingOn !== false}
              onToggle={(on) => saveGlobal({ packingOn: on }, on ? 'Packing on' : 'Packing off')}
              onSave={(v) => saveGlobal({ packing: v }, `Packing ${fmtPct(v)}`)}
            />
            <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={g.stuckOn !== false} onChange={(e) => saveGlobal({ stuckOn: e.target.checked }, e.target.checked ? 'GST stuck counted' : 'GST stuck ignored')} />
              Count GST stuck on fees and ads
            </label>
          </div>
          <SummaryTable rows={rows} settings={calc} t={t} hasCosts={products.length > 0} onOpen={(r) => r.c && setDetail(r)} />
        </Panel>
      </div>

      <Modal open={modal === 'settings'} onClose={() => setModal(null)} title="Settings" subtitle={settings.updatedAt ? `Last saved ${when(settings.updatedAt)}` : 'Starting values from the 14 Oct fee report'} width={1100}>
        <SettingsEditor settings={settings} products={products} onSaved={(s) => setState((st) => (st ? { ...st, settings: s } : st))} setNote={setNote} />
      </Modal>
      <Modal open={modal === 'reports'} onClose={() => setModal(null)} title="Uploaded fee reports" subtitle={state?.reports.length ? `${state.reports.length} saved, newest ${when(state.reports[0].uploadedAt)}` : 'None yet'} width={640}>
        <History reports={state?.reports || []} onDeleted={(id) => setState((st) => (st ? { ...st, reports: st.reports.filter((r) => r.id !== id) } : st))} />
      </Modal>
      <Modal open={modal === 'upload'} onClose={() => setModal(null)} title="Upload a fee report" subtitle="Live fees come from Ops. Upload a report only when live fees are missing or wrong." width={560}>
        <UploadCard state={state} settings={settings} onSaved={(s, r) => {
          setState((st) => (st ? { ...st, settings: s, reports: [r, ...st.reports.filter((x) => x.id !== r.id)] } : st));
          setModal(null);
        }} setNote={setNote} />
      </Modal>
      {detail?.c && (
        <Modal open onClose={() => setDetail(null)} title={`${detail.x.name} · ${routeTag(detail.x, calc)}`} subtitle={`Selling at ${rs(detail.x.asp)} · ${Math.round(t * 100)}% ads`} width={620}>
          <SkuDetail r={detail} settings={calc} t={t} />
        </Modal>
      )}
      {picker && <DownloadPicker
        open
        onClose={() => setPicker(false)}
        rows={rows}
        onDownload={async (skus) => {
          const { downloadFloorsReport } = await import('../../utils/priceFloorsExport'); // jspdf: loaded on click
          const r = downloadFloorsReport({ skus, settings: calc, products, costs, feeReport: state?.reports[0] || null, tacos: t });
          setPicker(false);
          setNote({ tone: r.written ? 'good' : 'bad', text: r.written ? `PDF downloaded for ${r.written} product${r.written > 1 ? 's' : ''}.` : 'None of the selected products has a cost yet. The report is empty.' });
        }}
      />}
    </>
  );
}

function Banner({ tone, children, onClose }: { tone: 'good' | 'bad'; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
      <span className="flex-1">{children}</span>
      {onClose && <button type="button" onClick={onClose} className="font-semibold" aria-label="Dismiss">×</button>}
    </div>
  );
}

function UploadCard({ state, settings, onSaved, setNote }: {
  state: ApiState | null;
  settings: FloorSettings;
  onSaved: (s: FloorSettings, r: ReportMeta) => void;
  setNote: (n: { tone: 'good' | 'bad'; text: string } | null) => void;
}) {
  const [preview, setPreview] = useState<{ rep: FeeReport; next: FloorSettings; updated: string[]; added: string[] } | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const latest = state?.reports[0];
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setNote(null);
    try {
      const rep = await parseFeeReport(f, null);
      const m = mergeReport(settings, rep);
      setPreview({ rep, next: m.settings, updated: m.updated, added: m.added });
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof FeeReportError ? e.message : `Couldn't read that file: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await api<{ settings: FloorSettings; report: ReportMeta }>('/api/price-floors/report', { report: preview.rep, settings: preview.next });
      onSaved(r.settings, r.report);
      setNote({ tone: 'good', text: `Fee report saved: ${preview.updated.length} SKUs refreshed${preview.added.length ? `, ${preview.added.length} new (link them to a product in Settings)` : ''}.` });
      setPreview(null);
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col">
      {preview ? (
        <>
          <div className="text-sm text-slate-700">
            <b>{preview.rep.fileName}</b>: {preview.rep.rows.length} products, {preview.rep.totals.units.toLocaleString('en-IN')} units, {rs(preview.rep.totals.sales)} sales.
            {' '}{preview.updated.length} match your SKUs{preview.added.length ? `, ${preview.added.length} are new` : ''}.
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            <button type="button" onClick={save} disabled={busy} className={BTN_PRIMARY}>
              {busy ? 'Saving…' : 'Use this report'}
            </button>
            <button type="button" onClick={() => setPreview(null)} className="h-11 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">{latest ? `Last upload: ${latest.fileName}, ${when(latest.uploadedAt)}.` : 'No upload yet. The page uses the 14 Oct fee report.'}</p>
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void onFile(e.dataTransfer.files?.[0]); }}
            className={`mt-auto flex min-h-[64px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-2 text-center text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-brand-400 ${drag ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-brand-300 bg-brand-50/40 text-brand-700 hover:bg-brand-50'}`}
          >
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
            {busy ? 'Reading…' : drag ? 'Drop the file here' : 'Drop the fee report here, or select a file'}
          </label>
          <a
            href={settings.reportUrl || SELLER_CENTRAL_REPORTS}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            Open Seller Central to download it ↗
          </a>
          <ol className="list-decimal space-y-0.5 pl-5 text-xs text-slate-600">
            <li>In Seller Central, open Reports, Revenue and fees.</li>
            <li>Select all ASINs and download the .xlsx file.</li>
            <li>Drop the file in the box above.</li>
          </ol>
        </>
      )}
    </div>
  );
}

const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`;
/** v as a share of the price, e.g. "53%". */
const share = (v: number, price: number) => (price > 0 && Number.isFinite(price) && Number.isFinite(v) ? `${Math.round((v / price) * 100)}%` : '—');

/** Target margin, typed as a percent; saves on Enter or when the field loses focus. */
/** A percent input that saves on Enter or blur, with an optional on/off switch. */
function PctInput({ label, value, onSave, on, onToggle }: { label: string; value: number; onSave: (v: number) => void; on?: boolean; onToggle?: (on: boolean) => void }) {
  const [v, setV] = useState(String(Math.round(value * 1000) / 10));
  const off = on === false;
  const commit = () => {
    const n = Number(v.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 60) { setV(String(Math.round(value * 1000) / 10)); return; }
    if (Math.abs(n / 100 - value) > 1e-9) onSave(n / 100);
  };
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-1 ${off ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
      {onToggle && (
        <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={!off} onChange={(e) => onToggle(e.target.checked)} aria-label={`Include ${label}`} />
      )}
      <label className={`flex items-center gap-2 text-[14px] font-semibold ${off ? 'text-slate-400' : 'text-slate-700'}`}>
        {label}
        <span className="relative">
          <input
            inputMode="decimal"
            disabled={off}
            aria-label={`${label}, percent of net sales`}
            className="h-10 w-[4.5rem] rounded-lg border border-slate-200 bg-white pl-2.5 pr-6 text-right text-[14px] tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100"
            value={v}
            onChange={(e) => setV(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">%</span>
        </span>
      </label>
    </div>
  );
}

const LEVELS = [0.05, 0.1, 0.15];
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** What to do with today's price, given the price needed at the selected ad spend. */
function ActionCell({ need, asp, band }: { need: number | null; asp: number; band?: BandAdvice | null }) {
  if (need == null || !Number.isFinite(need) || !asp) return <span className="text-slate-400">—</span>;
  if (band?.priceAtBelow) {
    return <span className="font-semibold text-brand-700">Price at {rs(band.below)}<span className="block text-xs font-normal">keeps {rs(band.belowMargin)} a unit, more than {rs(asp)}</span></span>;
  }
  return need > asp
    ? <span className="font-semibold text-rose-700">Raise to {rs(need)}</span>
    : <span className="font-semibold text-emerald-700">OK<span className="block text-xs font-normal">can drop up to {share(asp - need, asp)}</span></span>;
}

/** Lowest price at the target margin for each ad-spend level, per product. */
function SummaryTable({ rows, settings, t, hasCosts, onOpen }: { rows: Row[]; settings: FloorSettings; t: number; hasCosts: boolean; onOpen: (r: Row) => void }) {
  const u = unsellOf(settings);
  const out = rows.map((r) => {
    const prices = r.c ? LEVELS.map((lv) => solve(r.x, settings, r.c!, u, lv).price) : null;
    const ft = r.c ? solve(r.x, settings, r.c, u, t).price : null;
    const be = r.c ? solve(r.x, settings, r.c, u, t, 0).price : null;
    const band = r.c ? bandAdvice(r.x, settings, r.c, u, t) : null;
    return { ...r, prices, ft, be, band };
  });
  const cell = (p: number, asp: number, on: boolean) =>
    `px-3 py-3 text-right tabular-nums ${p > asp ? 'bg-rose-50 text-rose-700' : on ? 'bg-brand-50 font-bold text-slate-900' : 'text-slate-700'}`;
  return (
    <>
      <ul className="divide-y divide-slate-100 md:hidden">
        {out.map((r) => (
          <li key={r.x.asin} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <button type="button" onClick={() => onOpen(r)} disabled={!r.c} className="min-h-11 text-left text-[14px] font-semibold text-slate-900 hover:text-accent-700 disabled:hover:text-slate-900">{r.x.name} <span className="text-xs font-normal text-slate-600">{routeTag(r.x, settings)}</span></button>
              <span className="tabular-nums text-[15px] font-bold">{rs(r.ft)}</span>
            </div>
            {r.prices ? (
              <div className="mt-1 text-[13px] tabular-nums text-slate-500">
                {LEVELS.map((lv, i) => `${Math.round(lv * 100)}% ads ${rs(r.prices![i])}`).join(' · ')}
              </div>
            ) : (
              <div className="mt-1 text-[13px] text-slate-500">{hasCosts ? 'Not linked to a product cost' : 'Costs not loaded'}</div>
            )}
            <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-slate-500">
              <span>Selling at {rs(r.x.asp)} · don't go below {rs(r.be)}</span>
              <ActionCell need={r.ft} asp={r.x.asp} band={r.band} />
            </div>
          </li>
        ))}
      </ul>
      <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="hidden overflow-x-auto md:block">
        <table className="w-full text-[14px]">
          <thead className="bg-slate-50 text-left text-[12px] text-slate-500">
            <tr>
              <th className="py-3 pl-5 pr-3 font-semibold">Product</th>
              <th className="px-3 py-3 text-right font-semibold">Selling at today</th>
              <th className="px-3 py-3 text-right font-semibold">Don't go below</th>
              {LEVELS.map((lv) => <th key={lv} className={`px-3 py-3 text-right font-semibold ${same(lv, t) ? 'text-brand-700' : ''}`}>At {Math.round(lv * 100)}% ads</th>)}
              <th className="py-3 pl-3 pr-5 text-right font-semibold">Action ({Math.round(t * 100)}% ads)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {out.map((r) => (
              <tr key={r.x.asin} className="hover:bg-slate-50">
                <td className="py-2.5 pl-5 pr-3">
                  <button type="button" onClick={() => onOpen(r)} disabled={!r.c} className="text-left font-semibold text-slate-900 hover:text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:hover:no-underline disabled:hover:text-slate-900">{r.x.name}</button>
                  {!r.p && hasCosts && <span className="ml-2 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">not linked</span>}
                  <span className="block text-xs text-slate-600">
                    {routeTag(r.x, settings)} · returns {pct(returnRate(r.x, settings))} · actual ads {pct(r.x.tacos)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{rs(r.x.asp)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{rs(r.be)}</td>
                {LEVELS.map((lv, i) => (
                  <td key={lv} className={r.prices ? cell(r.prices[i], r.x.asp, same(lv, t)) : 'px-3 py-3 text-right text-slate-400'}>
                    {r.prices ? rs(r.prices[i]) : '—'}
                    {r.prices && r.prices[i] > r.x.asp && <span className="sr-only"> (above today's price)</span>}
                  </td>
                ))}
                <td className="py-3 pl-3 pr-5 text-right tabular-nums"><ActionCell need={r.ft} asp={r.x.asp} band={r.band} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SkuDetail({ r, settings, t }: { r: Row; settings: FloorSettings; t: number }) {
  const u = unsellOf(settings);
  const res = solve(r.x, settings, r.c!, u, t);
  const g = groupLines(res.lines, res.price);
  const d = detailLines(res.lines, r.x, settings, r.c!);
  const band = bandAdvice(r.x, settings, r.c!, u, t);
  return (
    <div>
      <p className="mb-2 text-sm"><span className="text-slate-600">Lowest price at {Math.round(t * 100)}% ads: </span><span className="font-semibold tabular-nums text-slate-900">{rs(res.price)}</span></p>
      <p className={`mt-1 text-[14px] ${band.priceAtBelow ? 'font-semibold text-brand-700' : 'text-slate-600'}`}>
        {bandLine(band)}.{band.priceAtBelow ? ` Price at ${rs(band.below)}: it earns more than today's ${rs(r.x.asp)}.` : ''}
        <span className="block text-xs text-slate-600">No referral fee below {rs(band.deadFrom)}. From {rs(band.deadFrom)}, Amazon adds {pct(r.x.refPct)} referral and the higher closing fee.</span>
      </p>
      {isFbm(r.x) && <p className="mt-1 text-xs text-slate-500">Ships FBM (Production specs): courier ₹{settings.global.fbmPerKg ?? DEFAULT_GLOBAL.fbmPerKg}/kg × {r.x.chargeKg ?? '—'} kg, min ₹{settings.global.fbmMin ?? DEFAULT_GLOBAL.fbmMin}, instead of FBA fee, storage and freight to FC.</p>}
      <table className="mt-2 w-full max-w-md text-[14px]">
        <thead className="text-right text-[12px] text-slate-500">
          <tr><th className="py-1.5 text-left font-semibold">Per unit, {Math.round(t * 100)}% ads</th><th className="py-1.5 font-semibold">₹</th><th className="py-1.5 font-semibold">% of net sales</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {waterfallRows(settings, r.x).map(({ k, label, sign }) => (
            <Fragment key={k}>
              <tr className={sign === '=' || k === 'price' ? 'font-semibold text-slate-900' : 'text-slate-700'}>
                <td className="py-2"><span className="mr-1.5 inline-block w-3 text-slate-400">{sign}</span>{label}{k === 'saleGst' ? ` ${fmtPct(settings.global.gst)}` : ''}</td>
                <td className="py-2 text-right tabular-nums">{rs(g[k])}</td>
                <td className="py-2 text-right tabular-nums text-slate-500">{k === 'price' || k === 'saleGst' ? '' : share(g[k], g.net)}</td>
              </tr>
              {(d[k] || []).map(([name, v]) => (
                <tr key={k + name} className="text-[14px] text-slate-500">
                  <td className="py-1.5 pl-8">{name}</td>
                  <td className="py-1.5 text-right tabular-nums">{rs(v)}</td>
                  <td className="py-1.5 text-right tabular-nums">{share(v, g.net)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">Costs are before GST. {settings.global.stuckOn === false ? 'All input GST (materials, Amazon fees, ads) is taken as refunded, so no GST is a cost.' : `GST stuck = the part of the ${fmtPct(buyGstOf(settings))} GST on Amazon fees, ads and packing the 5% sale GST can't use; GST on materials comes back as the inverted-duty refund.`}</p>
    </div>
  );
}

type NumKey = Exclude<keyof FloorSettings['global'], 'resellerOn' | 'packingOn' | 'stuckOn' | 'ownPays3p'>;
const GLOBAL_FIELDS: [NumKey, string, string][] = [
  ['margin', 'Target margin', '% of net sales (price without GST), after all costs'],
  ['gst', 'GST on our sale', '% charged to the customer'],
  ['buyGst', 'GST on purchases', '% on materials, Amazon fees and ads'],
  ['reseller', 'Reseller margin', '% of net sales kept by the 3P seller'],
  ['packing', 'Packing', '% of net sales, before GST'],
  ['placement', 'Inbound placement', '₹ per unit. Used when a SKU has no freight value'],
  ['transport', 'Freight to FC (ATS)', '₹ per unit. Used when a SKU has no freight value. Own transport uses the ATS rate'],
  ['storage', 'Storage', '₹ per unit sold. Used when a SKU has no storage value (by box size)'],
  ['closeLo', 'Closing fee below band', '₹'],
  ['closeHi', 'Closing fee above band', '₹'],
  ['band', 'Referral starts at', '₹ price'],
  ['removal', 'Removal fee', '₹ per unsellable return'],
  ['minSample', 'Average return rate below', 'units sold'],
  ['unsell', "Share of returns that can't be resold, %", '% of returns lost (unit + removal fee). The pricing guide uses it'],
  ['fbmPerKg', 'FBM courier ₹ per kg', '₹ per chargeable kg incl. GST, for FBM products'],
  ['fbmMin', 'FBM courier minimum', '₹ per order incl. GST'],
];
const PCT_FIELDS = new Set<NumKey>(['margin', 'gst', 'buyGst', 'reseller', 'packing', 'unsell']);
const SKU_FIELDS: [keyof FloorSku, string][] = [
  ['asp', 'Avg price ₹'],
  ['sold', 'Units sold'],
  ['returned', 'Returned'],
  ['fba', 'FBA fee ₹'],
  ['admin', 'Refund admin ₹'],
  ['refPct', 'Referral %'],
];
const inputCls = 'mt-1 block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[14px] tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200';

function SettingsEditor({ settings, products, onSaved, setNote }: {
  settings: FloorSettings;
  products: ProductCost[];
  onSaved: (s: FloorSettings) => void;
  setNote: (n: { tone: 'good' | 'bad'; text: string } | null) => void;
}) {
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(settings), [settings]);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const num = (v: string) => Number(v.replace(/[^\d.]/g, '')) || 0;
  const setSku = (i: number, k: keyof FloorSku, v: string | number | boolean | null) => setS({ ...s, skus: s.skus.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ settings: FloorSettings }>('/api/price-floors/settings', { settings: s });
      onSaved(r.settings);
      setNote({ tone: 'good', text: 'Settings saved.' });
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="space-y-5">
        <label className="block max-w-2xl text-[13px] font-semibold text-slate-600">
          Seller Central link for the fee report
          <input className={inputCls.replace('tabular-nums', '')} value={s.reportUrl || ''} placeholder={SELLER_CENTRAL_REPORTS} onChange={(e) => setS({ ...s, reportUrl: e.target.value.trim() })} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Paste the address of the Revenue and fees report page. The upload window opens it.</span>
        </label>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {GLOBAL_FIELDS.map(([k, label, unit]) => (
            <label key={k} className="block text-[13px] font-semibold text-slate-600">
              {label}
              <input
                inputMode="decimal"
                className={inputCls}
                value={PCT_FIELDS.has(k) ? Math.round((k === 'margin' ? marginOf(s) : k === 'buyGst' ? buyGstOf(s) : (s.global[k] ?? DEFAULT_GLOBAL[k] ?? 0)) * 1000) / 10 : (s.global[k] ?? DEFAULT_GLOBAL[k] ?? '')}
                onChange={(e) => setS({ ...s, global: { ...s.global, [k]: PCT_FIELDS.has(k) ? num(e.target.value) / 100 : num(e.target.value) } })}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">{unit}</span>
            </label>
          ))}
        </div>
        <label className="flex min-h-[44px] max-w-2xl items-center gap-3 text-[14px] font-semibold text-slate-700">
          <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={s.global.ownPays3p !== false} onChange={(e) => setS({ ...s, global: { ...s.global, ownPays3p: e.target.checked } })} />
          Own-brand sales pay 3P margin
          <span className="text-xs font-normal text-slate-500">When off, we sell every SKU (1P), unless you tick a SKU below.</span>
        </label>
        {s.skus.map((x, i) => (
          <fieldset key={x.asin} className="rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-[14px] font-bold text-slate-900">{x.name} <span className="font-normal text-slate-500">· {x.asin}</span></legend>
            <label className="mb-2 flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-500"
                checked={isFirstParty(x, s)}
                onChange={(e) => setSku(i, 'firstParty', e.target.checked === (s.global.ownPays3p === false) ? null : e.target.checked)}
              />
              Sold by us (1P): no 3P margin
              {x.firstParty != null && <span className="text-xs font-normal text-slate-500">(set for this product)</span>}
            </label>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-10">
              <label className="col-span-2 block text-[12px] font-semibold text-slate-500">
                Product in Tranzact
                <select className={inputCls} value={x.item} onChange={(e) => setSku(i, 'item', e.target.value)}>
                  {!products.some((p) => p.item === x.item) && <option value={x.item}>{x.item || 'Pick a product'}</option>}
                  {products.map((p) => <option key={p.item} value={p.item}>{p.name} ({p.item})</option>)}
                </select>
              </label>
              <label className="block text-[12px] font-semibold text-slate-500">
                Freight to FC ₹/unit (ATS)
                <input
                  inputMode="decimal"
                  placeholder={`avg ₹${s.global.placement + s.global.transport}`}
                  className={inputCls}
                  value={x.inbound ?? ''}
                  onChange={(e) => setSku(i, 'inbound', e.target.value.trim() === '' ? (null as unknown as number) : num(e.target.value))}
                />
              </label>
              <label className="block text-[12px] font-semibold text-slate-500">
                Storage ₹/unit
                <input
                  inputMode="decimal"
                  placeholder={`avg ₹${s.global.storage}`}
                  className={inputCls}
                  value={x.storage ?? ''}
                  onChange={(e) => setSku(i, 'storage', e.target.value.trim() === '' ? (null as unknown as number) : num(e.target.value))}
                />
              </label>
              {SKU_FIELDS.map(([k, label]) => (
                <label key={k} className="block text-[12px] font-semibold text-slate-500">
                  {label}
                  <input
                    inputMode="decimal"
                    className={inputCls}
                    value={k === 'refPct' ? Math.round(x.refPct * 10000) / 100 : (x[k] as number)}
                    onChange={(e) => setSku(i, k, k === 'refPct' ? num(e.target.value) / 100 : num(e.target.value))}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={!dirty || busy} className="h-11 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save settings'}
          </button>
          {dirty && <button type="button" onClick={() => setS(settings)} className="h-11 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Undo changes</button>}
          <p className="text-xs text-slate-500">Referral % is a % of the price with GST. It applies from the band price up. Amazon fees include their GST. Materials and ads get the purchase GST added.</p>
        </div>
      </div>
    </div>
  );
}

function History({ reports, onDeleted }: { reports: ReportMeta[]; onDeleted: (id: string) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div>
      {reports.length ? (
        <ul className="divide-y divide-slate-100 pt-1">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-800">{r.fileName}</span>
                <span className="text-xs text-slate-500">{when(r.uploadedAt)} · {r.skus} products</span>
              </span>
              {confirm === r.id ? (
                <span className="flex items-center gap-2 text-xs">
                  Remove this report from the history? The settings do not change.
                  <button type="button" className="h-9 rounded-lg bg-rose-600 px-3 font-semibold text-white" onClick={async () => { await api(`/api/price-floors/report/${r.id}`, undefined, 'DELETE'); onDeleted(r.id); setConfirm(null); }}>Remove</button>
                  <button type="button" className="h-9 rounded-lg px-2 font-semibold text-slate-600" onClick={() => setConfirm(null)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100" onClick={() => setConfirm(r.id)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">No reports yet. Upload a Seller Central fee report to start the history.</p>
      )}
    </div>
  );
}

function DownloadPicker({ open, onClose, rows, onDownload }: { open: boolean; onClose: () => void; rows: Row[]; onDownload: (skus: FloorSku[]) => void }) {
  const withCost = rows.filter((r) => r.cost != null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(withCost.map((r) => r.x.asin)));
  const all = picked.size === withCost.length && withCost.length > 0;
  const toggle = (a: string) => setPicked((p) => { const n = new Set(p); if (n.has(a)) n.delete(a); else n.add(a); return n; });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Download price floors report"
      subtitle="Pick the products to include. You get a PDF: the pricing guide on page 1, then a waterfall for each product."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-500">{picked.size} of {withCost.length} picked</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button
              type="button"
              disabled={!picked.size}
              onClick={() => onDownload(rows.filter((r) => picked.has(r.x.asin)).map((r) => r.x))}
              className="h-11 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Download PDF
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-1">
        <label className="flex min-h-[44px] items-center gap-3 rounded-lg px-2 font-semibold text-slate-900 hover:bg-slate-50">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={all} onChange={() => setPicked(all ? new Set() : new Set(withCost.map((r) => r.x.asin)))} />
          All products
        </label>
        <div className="border-t border-slate-100" />
        {rows.map((r) => (
          <label key={r.x.asin} className={`flex min-h-[44px] items-center gap-3 rounded-lg px-2 text-sm ${r.cost == null ? 'text-slate-400' : 'text-slate-800 hover:bg-slate-50'}`}>
            <input type="checkbox" className="h-4 w-4 accent-brand-500" disabled={r.cost == null} checked={picked.has(r.x.asin)} onChange={() => toggle(r.x.asin)} />
            <span className="flex-1">{r.x.name}</span>
            <span className="text-xs text-slate-500">{r.cost == null ? 'no cost yet' : rs(r.cost)}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
