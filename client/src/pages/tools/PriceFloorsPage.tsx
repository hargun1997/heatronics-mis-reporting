// Amazon price floors — lowest break-even Amazon price per SKU.
// Product cost comes from production.heatronics.in; Amazon economics from the
// Seller Central "Revenue and fees" report uploaded here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, SectionCard } from '../../components/ui/Card';
import { Disclosure } from '../../components/ui/Disclosure';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import {
  COLS,
  DEFAULT_SETTINGS,
  TACOS,
  mergeReport,
  pct,
  returnRate,
  rs,
  solve,
  type CostsSnapshot,
  type FeeReport,
  type FloorSettings,
  type FloorSku,
  type Lines,
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

interface Row { x: FloorSku; p: ProductCost | null; cost: number | null }

export function PriceFloorsPage() {
  const [state, setState] = useState<ApiState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tacos, setTacos] = useState<string>('0.1');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

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
      return { x, p, cost: p?.cost ?? null };
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
  const priced = rows.filter((r) => r.cost != null);
  const below = priced.filter((r) => solve(r.x, settings, r.cost!, 0, t).price > r.x.asp);
  const unmapped = rows.filter((r) => !r.p);

  return (
    <>
      <PageHeader
        title="Amazon price floors"
        description="The lowest Amazon price per product that still breaks even, from production's latest cost and your Amazon fee report."
        icon={icon}
        crumbs={[{ label: 'Tools', to: '/tools' }, { label: 'Amazon price floors' }]}
        actions={
          <button
            type="button"
            onClick={refreshCosts}
            disabled={busy === 'costs'}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === 'costs' ? 'Refreshing…' : 'Refresh costs'}
          </button>
        }
      />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {loadError && <Banner tone="bad">Couldn't load the price floors: {loadError}</Banner>}
        {note && <Banner tone={note.tone} onClose={() => setNote(null)}>{note.text}</Banner>}

        <div className="grid gap-4 md:grid-cols-3">
          <SourceCard
            title="Product costs"
            line={costs?.month ? `${monthName(costs.month)} · materials + conversion` : 'Not loaded yet'}
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
            title="Priced below their floor"
            line={<span className={below.length ? 'text-rose-700' : 'text-emerald-700'}>{below.length} of {priced.length}</span>}
            sub={`At ${Math.round(t * 100)}% ad spend, returns resellable`}
            foot={unmapped.length ? <span className="text-amber-700">{unmapped.length} SKU{unmapped.length > 1 ? 's' : ''} not linked to a product cost</span> : 'Every SKU has a product cost'}
          />
        </div>

        <SectionCard
          title="Floor per product"
          description="Returns at each product's own rate, all resellable. Room = today's average price minus the floor."
          actions={
            <SegmentedControl
              size="sm"
              aria-label="Ad spend"
              value={tacos}
              onChange={setTacos}
              options={[0, 0.05, 0.1, 0.15, 0.2].map((v) => ({ id: String(v), label: `${Math.round(v * 100)}% ads` }))}
            />
          }
          className="overflow-hidden"
        >
          <SummaryTable rows={rows} settings={settings} t={t} />
        </SectionCard>

        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">By product</h2>
          {priced.map((r) => <SkuDetail key={r.x.asin} r={r} settings={settings} />)}
          {!priced.length && <p className="text-sm text-slate-500">No product costs yet. Refresh costs, or link SKUs to products in Settings below.</p>}
        </div>

        <SettingsEditor settings={settings} products={products} onSaved={(s) => setState((st) => (st ? { ...st, settings: s } : st))} setNote={setNote} />
        <History reports={state?.reports || []} onDeleted={(id) => setState((st) => (st ? { ...st, reports: st.reports.filter((r) => r.id !== id) } : st))} />
      </div>
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
          <div className="mt-1.5 text-sm text-slate-600">{latest ? latest.fileName : 'From the 14 Oct fee report. Upload a fresh one to refresh fees, prices and returns.'}</div>
          <label className="mt-auto inline-flex h-11 cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 pt-0 text-sm font-semibold text-white hover:bg-brand-600 focus-within:ring-2 focus-within:ring-brand-400">
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
            {busy ? 'Reading…' : 'Upload fee report'}
          </label>
          <p className="mt-2 text-xs text-slate-500">Seller Central → Reports → Revenue and fees, all ASINs, .xlsx</p>
        </>
      )}
    </Card>
  );
}

function SummaryTable({ rows, settings, t }: { rows: Row[]; settings: FloorSettings; t: number }) {
  const out = rows.map((r) => {
    const f0 = r.cost != null ? solve(r.x, settings, r.cost, 0, 0).price : null;
    const ft = r.cost != null ? solve(r.x, settings, r.cost, 0, t).price : null;
    return { ...r, f0, ft, room: ft != null && r.x.asp ? r.x.asp - ft : null };
  });
  const room = (v: number | null) =>
    v == null ? <span className="text-slate-400">—</span> : <span className={`font-semibold ${v < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{v < 0 ? `▼ ${rs(-v)} short` : `▲ ${rs(v)}`}</span>;
  return (
    <>
      <ul className="-mx-5 -my-5 divide-y divide-slate-100 md:hidden">
        {out.map((r) => (
          <li key={r.x.asin} className="px-5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-semibold text-slate-900">{r.x.name}</span>
              <span className="tabular-nums text-[15px] font-bold">{rs(r.ft)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-slate-500">
              <span>Selling at {rs(r.x.asp)} · cost {r.cost != null ? rs(r.cost) : 'not linked'}</span>
              {room(r.room)}
            </div>
          </li>
        ))}
      </ul>
      <div className="-mx-5 -my-5 hidden overflow-x-auto md:block">
        <table className="w-full text-[14px]">
          <thead className="bg-slate-50 text-left text-[12px] text-slate-500">
            <tr>
              <th className="py-3 pl-5 pr-3 font-semibold">Product</th>
              <th className="px-3 py-3 text-right font-semibold">Selling at</th>
              <th className="px-3 py-3 text-right font-semibold">Materials</th>
              <th className="px-3 py-3 text-right font-semibold">Conversion</th>
              <th className="px-3 py-3 text-right font-semibold">Return rate</th>
              <th className="px-3 py-3 text-right font-semibold">Actual ads</th>
              <th className="px-3 py-3 text-right font-semibold">Floor, no ads</th>
              <th className="px-3 py-3 text-right font-semibold">Floor at {Math.round(t * 100)}%</th>
              <th className="py-3 pl-3 pr-5 text-right font-semibold">Room</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {out.map((r) => (
              <tr key={r.x.asin} className="hover:bg-slate-50">
                <td className="py-3 pl-5 pr-3">
                  <span className="font-semibold text-slate-900">{r.x.name}</span>
                  {!r.p && <span className="ml-2 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">not linked</span>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{rs(r.x.asp)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{rs(r.p?.material)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{rs(r.p?.conversion)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                  {pct(returnRate(r.x, settings))}
                  {r.x.sold < settings.global.minSample && <span className="ml-1 text-xs text-slate-400">avg</span>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{pct(r.x.tacos)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{rs(r.f0)}</td>
                <td className="px-3 py-3 text-right tabular-nums font-bold">{rs(r.ft)}</td>
                <td className="py-3 pl-3 pr-5 text-right tabular-nums">{room(r.room)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const LINE_ROWS: [keyof Lines, string][] = [
  ['cost', 'Product cost (materials + conversion)'],
  ['fba', 'FBA fulfilment fee'],
  ['placement', 'Inbound placement'],
  ['transport', 'Inbound transport'],
  ['storage', 'Storage'],
  ['referral', 'Referral fee'],
  ['closing', 'Closing fee'],
  ['returns', 'Returns: wasted FBA fee + refund admin'],
  ['unsellable', 'Unsellable returns: lost unit, inbound, removal'],
];

function SkuDetail({ r, settings }: { r: Row; settings: FloorSettings }) {
  const [view, setView] = useState<'grid' | 'cost'>('grid');
  const cost = r.cost!;
  const f10 = solve(r.x, settings, cost, 0, 0.1).price;
  const res = COLS.map((c) => solve(r.x, settings, cost, c.u, 0));
  return (
    <Disclosure
      title={r.x.name}
      subtitle={`Floor ${rs(f10)} at 10% ads · selling at ${rs(r.x.asp)} · cost ${rs(cost)} · returns ${pct(returnRate(r.x, settings))}`}
    >
      <div className="mb-3 mt-2">
        <SegmentedControl size="sm" aria-label="View" value={view} onChange={setView} options={[{ id: 'grid', label: 'By ad spend' }, { id: 'cost', label: 'Cost breakdown' }]} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead className="bg-slate-50 text-right text-[12px] text-slate-500">
            <tr>
              <th className="py-2 pl-3 pr-3 text-left font-semibold">{view === 'grid' ? 'Ad spend' : '₹ per unit sold, no ads'}</th>
              {COLS.map((c) => <th key={c.label} className="px-3 py-2 font-semibold">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view === 'grid'
              ? TACOS.map((tt) => (
                <tr key={tt} className={tt === 0.1 ? 'bg-brand-50 font-semibold' : ''}>
                  <td className="py-2 pl-3 pr-3 tabular-nums">{Math.round(tt * 100)}%</td>
                  {COLS.map((c) => {
                    const p = solve(r.x, settings, cost, c.u, tt).price;
                    const over = p > r.x.asp;
                    return (
                      <td key={c.label} className={`px-3 py-2 text-right tabular-nums ${over ? 'bg-rose-50 text-rose-700' : ''}`}>
                        {rs(p)}{over && <span className="sr-only"> (above today's price)</span>}
                      </td>
                    );
                  })}
                </tr>
              ))
              : (
                <>
                  {LINE_ROWS.map(([k, label]) => (
                    <tr key={k}>
                      <td className="py-2 pl-3 pr-3">{label}</td>
                      {res.map((x, i) => <td key={i} className="px-3 py-2 text-right tabular-nums text-slate-600">{Math.round(x.lines[k]) ? Math.round(x.lines[k]).toLocaleString('en-IN') : '–'}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 pl-3 pr-3">GST on the sale ({pct(settings.global.gst)})</td>
                    {res.map((x, i) => <td key={i} className="px-3 py-2 text-right tabular-nums text-slate-600">{Math.round(x.lines.gst).toLocaleString('en-IN')}</td>)}
                  </tr>
                  <tr className="border-t-2 border-slate-800 bg-brand-50 font-bold">
                    <td className="py-2 pl-3 pr-3">Lowest price, incl. GST</td>
                    {res.map((x, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{rs(x.price)}</td>)}
                  </tr>
                </>
              )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Red cells are above today's price of {rs(r.x.asp)}. Cost = materials {rs(r.p?.material)}{r.p?.conversion ? ` + conversion ${rs(r.p.conversion)}` : ''} for {r.x.item}. ASIN {r.x.asin}.
      </p>
    </Disclosure>
  );
}

const GLOBAL_FIELDS: [keyof FloorSettings['global'], string, string][] = [
  ['placement', 'Inbound placement', '₹ per unit, when a SKU has no inbound of its own'],
  ['transport', 'Inbound transport', '₹ per unit, when a SKU has no inbound of its own'],
  ['storage', 'Storage', '₹ per unit sold'],
  ['closeLo', 'Closing fee below band', '₹'],
  ['closeHi', 'Closing fee above band', '₹'],
  ['band', 'Referral starts at', '₹ price'],
  ['removal', 'Removal fee', '₹ per unsellable return'],
  ['minSample', 'Average return rate below', 'units sold'],
];
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
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {GLOBAL_FIELDS.map(([k, label, unit]) => (
            <label key={k} className="block text-[13px] font-semibold text-slate-600">
              {label}
              <input inputMode="decimal" className={inputCls} value={s.global[k]} onChange={(e) => setS({ ...s, global: { ...s.global, [k]: num(e.target.value) } })} />
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
          <p className="text-xs text-slate-500">Referral % is of the GST-inclusive price and applies from the band up. Amazon fees include their 18% GST.</p>
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
