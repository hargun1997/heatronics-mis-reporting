// Amazon price floors — lowest Amazon price per SKU that still leaves the target margin.
// Product cost comes from production.heatronics.in; Amazon economics from the
// Seller Central "Revenue and fees" report uploaded here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, SectionCard } from '../../components/ui/Card';
import { Disclosure } from '../../components/ui/Disclosure';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Modal } from '../../components/ui/overlays';
import { downloadFloorsReport } from '../../utils/priceFloorsExport';
import {
  DEFAULT_GLOBAL,
  DEFAULT_SETTINGS,
  SELLER_CENTRAL_REPORTS,
  buyGstOf,
  costIn,
  grossCost,
  WATERFALL,
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
  type ProductCost,
} from '../../utils/priceFloors';
import { FeeReportError, parseFeeReport } from '../../utils/sellerCentralFees';

interface ReportMeta { id: string; fileName: string; uploadedAt: string; uploadedBy: string | null; skus: number }
interface ApiState { settings: FloorSettings | null; costs: CostsSnapshot | null; reports: ReportMeta[] }

const icon = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a2 2 0 011.41.59l7 7a2 2 0 010 2.82l-7 7a2 2 0 01-2.82 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m?: string) => (m ? `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}` : '—');

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

  const settings = state?.settings || DEFAULT_SETTINGS;
  const costs = state?.costs || null;
  const products = useMemo(() => (costs?.products || []) as ProductCost[], [costs]);
  const rows: Row[] = useMemo(
    () => settings.skus.map((x) => {
      const p = products.find((q) => q.item === x.item) || null;
      const c = costIn(p);
      return { x, p, c, cost: c ? grossCost(c, settings) : null };
    }),
    [settings, products],
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
  const below = priced.filter((r) => solve(r.x, settings, r.c!, 0, t).price > r.x.asp);
  const saveMargin = async (v: number) => {
    const next = { ...settings, global: { ...settings.global, margin: v } };
    setState((st) => (st ? { ...st, settings: next } : st));
    try {
      const r = await api<{ settings: FloorSettings }>('/api/price-floors/settings', { settings: next });
      setState((st) => (st ? { ...st, settings: r.settings } : st));
      setNote({ tone: 'good', text: `Target margin set to ${Math.round(v * 1000) / 10}%.` });
    } catch (e) {
      setNote({ tone: 'bad', text: `Couldn't save the margin: ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  const unmapped = rows.filter((r) => !r.p);

  return (
    <>
      <PageHeader
        title="Amazon price floors"
        description="The lowest Amazon price per product that still leaves your target margin, from production's latest cost and your Amazon fee report."
        icon={icon}
        crumbs={[{ label: 'Tools', to: '/tools' }, { label: 'Amazon price floors' }]}
        actions={
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Download report
          </button>
          <button
            type="button"
            onClick={refreshCosts}
            disabled={busy === 'costs'}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === 'costs' ? 'Refreshing…' : 'Refresh costs'}
          </button>
          </div>
        }
      />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {loadError && <Banner tone="bad">Couldn't load the price floors: {loadError}</Banner>}
        {note && <Banner tone={note.tone} onClose={() => setNote(null)}>{note.text}</Banner>}

        <div className="grid gap-4 md:grid-cols-3">
          <SourceCard
            title="Product costs"
            line={costs?.month ? `${monthName(costs.month)} · materials + ${fmtPct(buyGstOf(settings))} GST + conversion` : 'Not loaded yet'}
            sub={
              costs?.error
                ? <span className="text-rose-700">Last refresh failed: {costs.error}{costs.month ? ' (showing the last good costs)' : ''}</span>
                : costs?.conversion
                  ? `Conversion: ₹${Math.round(costs.conversion.total).toLocaleString('en-IN')} overheads over ${costs.conversion.units ? Math.round(costs.conversion.units).toLocaleString('en-IN') : '—'} units (${costs.conversion.basis})`
                  : 'No overheads entered in production, so costs are materials only'
            }
            foot={<>From production.heatronics.in · fetched {when(costs?.fetchedAt)}</>}
          />
          <UploadCard state={state} settings={settings} onSaved={(s, r) => {
            setState((st) => (st ? { ...st, settings: s, reports: [r, ...st.reports.filter((x) => x.id !== r.id)] } : st));
          }} setNote={setNote} />
          <SourceCard
            title="Selling below target"
            line={priced.length ? <span className={below.length ? 'text-rose-700' : 'text-emerald-700'}>{below.length} of {priced.length}</span> : <span className="text-slate-400">—</span>}
            sub={`At ${fmtPct(m)} margin and ${Math.round(t * 100)}% ad spend, returns resellable`}
            foot={!products.length ? 'Waiting for product costs' : unmapped.length ? <span className="text-amber-700">{unmapped.length} SKU{unmapped.length > 1 ? 's' : ''} not linked to a product cost</span> : 'Every SKU has a product cost'}
          />
        </div>

        <SectionCard
          title="Pricing guide"
          description={`Price at ${fmtPct(m)} margin on net sales for each ad spend. Never sell below break-even. Open a product below for its waterfall.`}
          className="overflow-hidden"
        >
          <div className="-mt-1 mb-4 flex flex-wrap items-center gap-3">
            <div className="overflow-x-auto">
              <SegmentedControl
                size="sm"
                aria-label="Ad spend"
                value={tacos}
                onChange={setTacos}
                options={[0, 0.05, 0.1, 0.15, 0.2].map((v) => ({ id: String(v), label: `${Math.round(v * 100)}% ads` }))}
              />
            </div>
            <MarginInput key={m} value={m} onSave={saveMargin} />
          </div>
          <SummaryTable rows={rows} settings={settings} t={t} hasCosts={products.length > 0} />
        </SectionCard>

        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">By product</h2>
          {priced.map((r) => <SkuDetail key={r.x.asin} r={r} settings={settings} t={t} />)}
          {!priced.length && <p className="text-sm text-slate-500">No product costs yet. Refresh costs, or link SKUs to products in Settings below.</p>}
        </div>

        <SettingsEditor settings={settings} products={products} onSaved={(s) => setState((st) => (st ? { ...st, settings: s } : st))} setNote={setNote} />
        <History reports={state?.reports || []} onDeleted={(id) => setState((st) => (st ? { ...st, reports: st.reports.filter((r) => r.id !== id) } : st))} />
      </div>
      {picker && <DownloadPicker
        open
        onClose={() => setPicker(false)}
        rows={rows}
        onDownload={(skus) => {
          const r = downloadFloorsReport({ skus, settings, products, costs, feeReport: state?.reports[0] || null, tacos: t });
          setPicker(false);
          setNote({ tone: r.written ? 'good' : 'bad', text: r.written ? `PDF downloaded for ${r.written} product${r.written > 1 ? 's' : ''}.` : 'None of the picked products has a cost yet, so there was nothing to put in the report.' });
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

function SourceCard({ title, line, sub, foot }: { title: string; line: React.ReactNode; sub: React.ReactNode; foot: React.ReactNode }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 font-display text-xl font-extrabold text-slate-900">{line}</div>
      <div className="mt-1.5 text-sm text-slate-600">{sub}</div>
      <div className="mt-auto pt-3 text-xs text-slate-500">{foot}</div>
    </Card>
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
    <Card className="flex flex-col p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Amazon fees</div>
      {preview ? (
        <>
          <div className="mt-2 text-sm text-slate-700">
            <b>{preview.rep.fileName}</b>: {preview.rep.rows.length} products, {preview.rep.totals.units.toLocaleString('en-IN')} units, {rs(preview.rep.totals.sales)} sales.
            {' '}{preview.updated.length} match your SKUs{preview.added.length ? `, ${preview.added.length} are new` : ''}.
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            <button type="button" onClick={save} disabled={busy} className="h-11 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              {busy ? 'Saving…' : 'Use this report'}
            </button>
            <button type="button" onClick={() => setPreview(null)} className="h-11 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 font-display text-xl font-extrabold text-slate-900">{latest ? when(latest.uploadedAt) : 'Starting values'}</div>
          <div className="mb-3 mt-1.5 text-sm text-slate-600">{latest ? latest.fileName : 'From the 14 Oct fee report. Upload a fresh one to refresh fees, prices and returns.'}</div>
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void onFile(e.dataTransfer.files?.[0]); }}
            className={`mt-auto flex min-h-[64px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-2 text-center text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-brand-400 ${drag ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-brand-300 bg-brand-50/40 text-brand-700 hover:bg-brand-50'}`}
          >
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
            {busy ? 'Reading…' : drag ? 'Drop it here' : 'Drop the fee report here, or click to choose'}
          </label>
          <a
            href={settings.reportUrl || SELLER_CENTRAL_REPORTS}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            Open Seller Central to download it ↗
          </a>
          <p className="text-xs text-slate-500">Reports → Revenue and fees, all ASINs, .xlsx. Change this link in Settings.</p>
        </>
      )}
    </Card>
  );
}

const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`;
/** v as a share of the price, e.g. "53%". */
const share = (v: number, price: number) => (price > 0 && Number.isFinite(price) && Number.isFinite(v) ? `${Math.round((v / price) * 100)}%` : '—');

/** Target margin, typed as a percent; saves on Enter or when the field loses focus. */
function MarginInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(Math.round(value * 1000) / 10));
  const commit = () => {
    const n = Number(v.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 60) { setV(String(Math.round(value * 1000) / 10)); return; }
    if (Math.abs(n / 100 - value) > 1e-9) onSave(n / 100);
  };
  return (
    <label className="flex items-center gap-2 text-[14px] font-semibold text-slate-700">
      Target margin
      <span className="relative">
        <input
          inputMode="decimal"
          aria-label="Target margin, percent of net sales"
          className="h-11 w-20 rounded-lg border border-slate-200 bg-white pl-3 pr-7 text-right text-[14px] tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">%</span>
      </span>
    </label>
  );
}

const LEVELS = [0.05, 0.1, 0.15];
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** What to do with today's price, given the price needed at the selected ad spend. */
function ActionCell({ need, asp }: { need: number | null; asp: number }) {
  if (need == null || !Number.isFinite(need) || !asp) return <span className="text-slate-400">—</span>;
  return need > asp
    ? <span className="font-semibold text-rose-700">Raise to {rs(need)}</span>
    : <span className="font-semibold text-emerald-700">OK<span className="block text-xs font-normal">can drop up to {share(asp - need, asp)}</span></span>;
}

/** Lowest price at the target margin for each ad-spend level, per product. */
function SummaryTable({ rows, settings, t, hasCosts }: { rows: Row[]; settings: FloorSettings; t: number; hasCosts: boolean }) {
  const out = rows.map((r) => {
    const prices = r.c ? LEVELS.map((lv) => solve(r.x, settings, r.c!, 0, lv).price) : null;
    const ft = r.c ? solve(r.x, settings, r.c, 0, t).price : null;
    const be = r.c ? solve(r.x, settings, r.c, 0, t, 0).price : null;
    return { ...r, prices, ft, be };
  });
  const cell = (p: number, asp: number, on: boolean) =>
    `px-3 py-3 text-right tabular-nums ${p > asp ? 'bg-rose-50 text-rose-700' : on ? 'bg-brand-50 font-bold text-slate-900' : 'text-slate-700'}`;
  return (
    <>
      <ul className="-mx-5 -mb-5 divide-y border-t border-slate-100 divide-slate-100 md:hidden">
        {out.map((r) => (
          <li key={r.x.asin} className="px-5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold text-slate-900">{r.x.name}</span>
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
              <ActionCell need={r.ft} asp={r.x.asp} />
            </div>
          </li>
        ))}
      </ul>
      <div className="-mx-5 -mb-5 hidden overflow-x-auto border-t border-slate-100 md:block">
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
                <td className="py-3 pl-5 pr-3">
                  <span className="font-semibold text-slate-900">{r.x.name}</span>
                  {!r.p && hasCosts && <span className="ml-2 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">not linked</span>}
                  <span className="block text-xs text-slate-500">
                    returns {pct(returnRate(r.x, settings))} · actual ads {pct(r.x.tacos)}
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
                <td className="py-3 pl-3 pr-5 text-right tabular-nums"><ActionCell need={r.ft} asp={r.x.asp} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SkuDetail({ r, settings, t }: { r: Row; settings: FloorSettings; t: number }) {
  const res = solve(r.x, settings, r.c!, 0, t);
  const g = groupLines(res.lines, res.price);
  return (
    <Disclosure title={r.x.name} subtitle={`${rs(res.price)} at ${Math.round(t * 100)}% ads · selling at ${rs(r.x.asp)}`}>
      <table className="mt-2 w-full max-w-md text-[14px]">
        <thead className="text-right text-[12px] text-slate-500">
          <tr><th className="py-1.5 text-left font-semibold">Per unit, {Math.round(t * 100)}% ads</th><th className="py-1.5 font-semibold">₹</th><th className="py-1.5 font-semibold">% of net sales</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {WATERFALL.map(({ k, label, sign }) => (
            <tr key={k} className={sign === '=' || k === 'price' ? 'font-semibold text-slate-900' : 'text-slate-600'}>
              <td className="py-2"><span className="mr-1.5 inline-block w-3 text-slate-400">{sign}</span>{label}{k === 'saleGst' ? ` ${fmtPct(settings.global.gst)}` : ''}</td>
              <td className="py-2 text-right tabular-nums">{rs(g[k])}</td>
              <td className="py-2 text-right tabular-nums text-slate-500">{k === 'price' || k === 'saleGst' ? '' : share(g[k], g.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">Costs are before GST. GST stuck = GST paid on purchases ({fmtPct(buyGstOf(settings))}) minus GST on the sale; it can't be used, so it's a cost.</p>
    </Disclosure>
  );
}

const GLOBAL_FIELDS: [keyof FloorSettings['global'], string, string][] = [
  ['margin', 'Target margin', '% of net sales (price without GST), after every cost'],
  ['gst', 'GST on our sale', '% charged to the customer'],
  ['buyGst', 'GST on purchases', '% on materials, Amazon fees and ads'],
  ['reseller', 'Reseller margin', '% of net sales kept by the 3P seller'],
  ['packing', 'Packing', '% of net sales, before GST'],
  ['placement', 'Inbound placement', '₹ per unit, when a SKU has no inbound of its own'],
  ['transport', 'Inbound transport', '₹ per unit, when a SKU has no inbound of its own'],
  ['storage', 'Storage', '₹ per unit sold'],
  ['closeLo', 'Closing fee below band', '₹'],
  ['closeHi', 'Closing fee above band', '₹'],
  ['band', 'Referral starts at', '₹ price'],
  ['removal', 'Removal fee', '₹ per unsellable return'],
  ['minSample', 'Average return rate below', 'units sold'],
];
const PCT_FIELDS = new Set<keyof FloorSettings['global']>(['margin', 'gst', 'buyGst', 'reseller', 'packing']);
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
  const setSku = (i: number, k: keyof FloorSku, v: string | number) => setS({ ...s, skus: s.skus.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
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
    <Disclosure title="Settings: product links and Amazon fee rates" subtitle={settings.updatedAt ? `Last saved ${when(settings.updatedAt)}` : 'Starting values from the 14 Oct fee report'}>
      <div className="space-y-5 pt-2">
        <label className="block max-w-2xl text-[13px] font-semibold text-slate-600">
          Seller Central link for the fee report
          <input className={inputCls.replace('tabular-nums', '')} value={s.reportUrl || ''} placeholder={SELLER_CENTRAL_REPORTS} onChange={(e) => setS({ ...s, reportUrl: e.target.value.trim() })} />
          <span className="mt-1 block text-xs font-normal text-slate-500">Paste the address of the Revenue and fees report page; the upload card opens it.</span>
        </label>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {GLOBAL_FIELDS.map(([k, label, unit]) => (
            <label key={k} className="block text-[13px] font-semibold text-slate-600">
              {label}
              <input
                inputMode="decimal"
                className={inputCls}
                value={PCT_FIELDS.has(k) ? Math.round((k === 'margin' ? marginOf(s) : k === 'buyGst' ? buyGstOf(s) : (s.global[k] ?? DEFAULT_GLOBAL[k])) * 1000) / 10 : s.global[k]}
                onChange={(e) => setS({ ...s, global: { ...s.global, [k]: PCT_FIELDS.has(k) ? num(e.target.value) / 100 : num(e.target.value) } })}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">{unit}</span>
            </label>
          ))}
        </div>
        {s.skus.map((x, i) => (
          <fieldset key={x.asin} className="rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-[14px] font-bold text-slate-900">{x.name} <span className="font-normal text-slate-500">· {x.asin}</span></legend>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-9">
              <label className="col-span-2 block text-[12px] font-semibold text-slate-500">
                Product in Tranzact
                <select className={inputCls} value={x.item} onChange={(e) => setSku(i, 'item', e.target.value)}>
                  {!products.some((p) => p.item === x.item) && <option value={x.item}>{x.item || 'Pick a product'}</option>}
                  {products.map((p) => <option key={p.item} value={p.item}>{p.name} ({p.item})</option>)}
                </select>
              </label>
              <label className="block text-[12px] font-semibold text-slate-500">
                Inbound ₹/unit
                <input
                  inputMode="decimal"
                  placeholder="default"
                  className={inputCls}
                  value={x.inbound ?? ''}
                  onChange={(e) => setSku(i, 'inbound', e.target.value.trim() === '' ? (null as unknown as number) : num(e.target.value))}
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
          <button type="button" onClick={save} disabled={!dirty || busy} className="h-11 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save settings'}
          </button>
          {dirty && <button type="button" onClick={() => setS(settings)} className="h-11 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Undo changes</button>}
          <p className="text-xs text-slate-500">Referral % is of the GST-inclusive price and applies from the band up. Amazon fees include their GST; materials and ads get GST on purchases added.</p>
        </div>
      </div>
    </Disclosure>
  );
}

function History({ reports, onDeleted }: { reports: ReportMeta[]; onDeleted: (id: string) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <Disclosure title="Uploaded fee reports" subtitle={reports.length ? `${reports.length} saved, newest ${when(reports[0].uploadedAt)}` : 'None yet'}>
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
                  Remove from history? Settings stay as they are.
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
        <p className="pt-1 text-sm text-slate-500">Upload a Seller Central fee report to start the history.</p>
      )}
    </Disclosure>
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
              className="h-11 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
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
