// ----------------------------------------------------------------------------
// Data Sources — the connector console.
//
// One card per live source. Each stores its own credentials server-side (never
// in the browser), proves them with Test, and pulls one month with Sync. A
// successful sync can be sent straight to the open month-close session, where
// it joins anything dropped in by file and runs the same cascade and gates.
//
// The redesign moves credential entry into a side Drawer: the grid stays a
// calm status board, and configuring a source opens its detail over a dimmed
// canvas — the Salesforce record-drawer pattern.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AutoPullPanel, CoveragePanel } from '../../components/ingest/IngestWorkspace';
import { IngestStepper } from '../../components/ingest/IngestStepper';
import { PageHeader } from '../../components/ui/PageHeader';
import { Drawer } from '../../components/ui/overlays';
import { StatusPill, type PillTone } from '../../components/ui/StatusPill';
import {
  clearCredentials,
  envVarName,
  FETCH_MODE_LABEL,
  GROUP_LABEL,
  listConnectors,
  refreshStore,
  saveCredentials,
  testConnector,
  type ConnectorGroup,
  type ConnectorInfo,
  type StoreStatus,
} from '../../data/monthClose/connectorsClient';
import { slotsFor } from '../../data/ingest/catalog';
import { listIngestReports } from '../../data/ingest/ingestClient';
import type { IngestReportMeta } from '../../data/ingest/types';
import { listSlotSources, slotKey, type SlotSourceInfo } from '../../data/ingest/slotSources';


const GROUP_ORDER: ConnectorGroup[] = ['book', 'marketplace', 'd2c', 'marketing', 'logistics', 'payments'];

const iconPlug = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

/** Append pulled sources into the month-close session localStorage. */

/** The status read of a connector → tone + label for the pill. */
function statusOf(c: ConnectorInfo): { tone: PillTone; label: string } {
  if (!c.connected) return { tone: 'neutral', label: 'Not connected' };
  if (!c.implemented) return { tone: 'warning', label: `Saved · pull pending${c.viaEnv ? ' · env' : ''}` };
  return { tone: 'positive', label: `Connected${c.viaEnv ? ' · env' : ''}` };
}

/** A square monogram tile for a source (first two letters of its label). */
function Monogram({ label }: { label: string }) {
  const abbr = label.replace(/[^A-Za-z0-9 ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-extrabold flex-shrink-0">
      {abbr}
    </span>
  );
}


// ---- One classification per connector (founder, 3 Nov 2026: "only three classifications per connector… why 2 sections and duplicates")
type Feed = 'api' | 'claude' | 'manual';
const FEED_LABEL: Record<Feed, string> = { api: 'Connected (API)', claude: 'Automated (Claude)', manual: 'Manual upload' };
const FEED_TONE: Record<Feed, PillTone> = { api: 'info', claude: 'brand', manual: 'warning' };
const FEED_HELP: Record<Feed, string> = {
  api: 'Pulled by the MIS itself (API, Tally or the Tranzact daily sheet).',
  claude: 'Filled by a Claude scheduled task; the MIS reads the result.',
  manual: 'No API or task can fetch it: download it and drop it here each month.',
};
const FEED_ORDER: Feed[] = ['manual', 'claude', 'api'];

/** Manual if any of its close reports is a manual upload, else Claude if a Claude task feeds any, else API. */
function feedOf(c: Pick<ConnectorInfo, 'id' | 'mode'>, sources: Map<string, SlotSourceInfo>): Feed {
  const mine = [...sources.values()].filter((x) => x.connectorId === c.id);
  if (mine.some((x) => x.source === 'upload')) return 'manual';
  if (mine.some((x) => x.source === 'claude_task' || x.claudeTask)) return 'claude';
  if (mine.length) return 'api';
  return c.mode === 'live-api' ? 'api' : 'manual';
}

function ConnectionsView() {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [store, setStore] = useState<StoreStatus | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Map<string, SlotSourceInfo>>(new Map());
  const [reports, setReports] = useState<IngestReportMeta[]>([]);
  const [filter, setFilter] = useState<Feed | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(() => (typeof window !== 'undefined' ? window.location.hash.slice(1) || null : null));

  const reloadReports = useCallback(async () => { try { setReports(await listIngestReports()); } catch { /* keep */ } }, []);
  const reload = useCallback(async () => {
    try {
      const data = await listConnectors();
      setConnectors(data.connectors);
      setStore(data.store);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load connectors.');
    } finally {
      setLoading(false);
    }
    listSlotSources().then((r) => setSources(new Map(r.slots.map((x) => [slotKey(x.connectorId, x.slotId), x])))).catch(() => {});
  }, []);
  useEffect(() => { void reload(); void reloadReports(); }, [reload, reloadReports]);

  const feeds = useMemo(() => new Map(connectors.map((c) => [c.id, feedOf(c, sources)])), [connectors, sources]);
  const count = (f: Feed) => connectors.filter((c) => feeds.get(c.id) === f).length;
  const shown = connectors.filter((c) => filter === 'all' || feeds.get(c.id) === filter);
  const grouped = useMemo(() => {
    const by: Record<string, ConnectorInfo[]> = {};
    for (const c of shown) (by[c.group] ??= []).push(c);
    for (const g of Object.keys(by)) by[g].sort((a, b) => FEED_ORDER.indexOf(feeds.get(a.id)!) - FEED_ORDER.indexOf(feeds.get(b.id)!));
    return by;
  }, [shown, feeds]);

  const latest = useMemo(() => {
    const m = new Map<string, IngestReportMeta>();
    for (const r of reports) { const k = slotKey(r.connectorId, r.slotId); const cur = m.get(k); if (!cur || r.periodKey > cur.periodKey) m.set(k, r); }
    return m;
  }, [reports]);

  const chip = (id: Feed | 'all', label: string, n: number) => (
    <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
      className={'min-h-[36px] rounded-full border px-3 text-sm ' + (filter === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400')}>
      {label} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      <CoveragePanel reports={reports} connectors={connectors} />
      <AutoPullPanel sources={sources} onDone={reloadReports} />

      <div className="flex flex-wrap items-center gap-2">
        {chip('all', 'All', connectors.length)}
        {FEED_ORDER.map((f) => chip(f, FEED_LABEL[f], count(f)))}
        <span className="ml-auto">
          {store && <StatusPill toneName={store.durable ? 'positive' : 'warning'} dot>{store.durable ? 'Credentials: Secret Manager' : 'Credentials: temporary store'}</StatusPill>}
        </span>
      </div>
      {filter !== 'all' && <p className="-mt-2 text-[12px] text-slate-500">{FEED_HELP[filter]}</p>}

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      {store && !store.durable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 space-y-2">
          <p className="font-medium">Tokens are saved to a temporary store and will be cleared on restart or redeploy.</p>
          {store.grantHint ? (
            <>
              <p>Grant this service account permission to manage secrets once (Cloud Shell), then Re-check:</p>
              <pre className="bg-amber-100 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">{store.grantHint}</pre>
              {store.secretManagerError && <p className="text-amber-700">Secret Manager said: {store.secretManagerError}</p>}
            </>
          ) : <p>This server isn't on GCP, so set credentials as environment variables (each drawer shows the names).</p>}
          <button onClick={async () => { setRechecking(true); try { const r = await refreshStore(); setStore(r.store); } finally { setRechecking(false); } }}
            disabled={rechecking} className="px-2.5 py-1 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-40">
            {rechecking ? 'Re-checking…' : 'Re-check store'}
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Loading connectors…</p>}

      {GROUP_ORDER.filter((g) => grouped[g]?.length).map((g) => (
        <div key={g}>
          <h3 className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-400 mb-2.5">{GROUP_LABEL[g]}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grouped[g].map((c) => (
              <ConnectorCard key={c.id} connector={c} feed={feeds.get(c.id)!} sources={sources} latest={latest}
                open={openId === c.id} setOpen={(o) => setOpenId(o ? c.id : null)} onChanged={reload} onCommitted={reloadReports} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConnectorCard({
  connector, feed, sources, latest, open, setOpen, onChanged, onCommitted,
}: {
  connector: ConnectorInfo;
  feed: Feed;
  sources: Map<string, SlotSourceInfo>;
  latest: Map<string, IngestReportMeta>;
  open: boolean;
  setOpen: (o: boolean) => void;
  onChanged: () => Promise<void>;
  onCommitted: () => void;
}) {
  const slots = slotsFor(connector.id);
  const manualSlots = slots.filter((x) => sources.get(slotKey(connector.id, x.slotId))?.source === 'upload');
  const autoSlots = slots.filter((x) => !manualSlots.includes(x));
  const hasCreds = connector.credentialFields.length > 0;
  const lines = slots.map((x) => ({ slot: x, src: sources.get(slotKey(connector.id, x.slotId)), got: latest.get(slotKey(connector.id, x.slotId)) }));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const status = statusOf(connector);

  const save = async () => {
    setBusy('save'); setMsg(null);
    try {
      await saveCredentials(connector.id, draft);
      setDraft({});
      await onChanged();
      setMsg({ kind: 'ok', text: 'Credentials saved.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test'); setMsg(null);
    const r = await testConnector(connector.id);
    setMsg({ kind: r.ok ? 'ok' : 'err', text: r.detail });
    setBusy(null);
  };

  const msgColor = msg?.kind === 'ok' ? 'text-emerald-700' : msg?.kind === 'warn' ? 'text-amber-700' : 'text-rose-700';

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3 hover:shadow-card transition-shadow">
        <div className="flex items-start gap-3">
          <Monogram label={connector.label} />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-slate-800 truncate">{connector.label}</h4>
            <span className="text-[11px] text-slate-400 uppercase tracking-wide">{GROUP_LABEL[connector.group]}</span>
          </div>
          <StatusPill toneName={FEED_TONE[feed]} className="whitespace-nowrap">{FEED_LABEL[feed]}</StatusPill>
        </div>

        {lines.length > 0 ? (
          <ul className="space-y-1 text-[12px] leading-snug text-slate-600">
            {lines.map(({ slot, src, got }) => (
              <li key={slot.slotId}>
                <span className="font-medium text-slate-700">{slot.label}</span>
                {got && <span className="text-emerald-700"> · in for {got.periodKey}</span>}
                {src && <span className="text-slate-500"> · {src.source === 'upload' ? src.line : src.via}</span>}
              </li>
            ))}
          </ul>
        ) : connector.note ? <p className="text-[12px] leading-snug text-slate-500 line-clamp-2">{connector.note}</p> : null}

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 mt-auto">
          {hasCreds ? <StatusPill toneName={status.tone} dot>{status.label}</StatusPill> : <span className="text-[11px] text-slate-400">No login needed</span>}
          <button
            onClick={() => { setOpen(true); setMsg(null); }}
            className={'px-3 py-1.5 text-xs font-semibold rounded-lg ' + (feed === 'manual' ? 'bg-cta text-on-cta hover:bg-cta-hover' : 'border border-slate-300 text-slate-700 hover:bg-slate-50')}
          >
            {feed === 'manual' ? 'Upload' : connector.connected || !hasCreds ? 'Open' : 'Connect'}
          </button>
        </div>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width={slots.length ? 640 : 440}
        icon={<Monogram label={connector.label} />}
        subtitle={`${GROUP_LABEL[connector.group]} · ${FETCH_MODE_LABEL[connector.fetchMode]}`}
        title={connector.label}
        badges={<StatusPill toneName={FEED_TONE[feed]}>{FEED_LABEL[feed]}</StatusPill>}
        footer={!hasCreds ? undefined : 
          <div className="flex items-center gap-2.5">
            <button
              onClick={save}
              disabled={busy !== null}
              className="flex-1 px-3 py-2.5 text-sm font-bold rounded-lg bg-cta text-on-cta hover:bg-cta-hover disabled:opacity-40"
            >
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={test}
              disabled={!connector.connected || busy !== null}
              className="px-3 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {busy === 'test' ? 'Testing…' : 'Test'}
            </button>
            {connector.connected && (
              <button
                onClick={async () => {
                  setBusy('clear');
                  try { await clearCredentials(connector.id); await onChanged(); setMsg({ kind: 'ok', text: 'Credentials removed.' }); }
                  finally { setBusy(null); }
                }}
                disabled={busy !== null}
                aria-label="Remove credentials"
                className="px-3 py-2.5 text-sm font-semibold rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
              >
                Remove
              </button>
            )}
          </div>
        }
      >
        <div className="px-5 py-5 space-y-4">
          {connector.note && <p className="text-[13px] leading-relaxed text-slate-600">{connector.note}</p>}

          {manualSlots.length > 0 && (
            <div className="space-y-3">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Upload each month</div>
              {manualSlots.map((x) => <IngestStepper key={x.slotId} slot={x} existing={latest.get(slotKey(connector.id, x.slotId))} onCommitted={onCommitted} source={sources.get(slotKey(connector.id, x.slotId))} />)}
            </div>
          )}
          {autoSlots.length > 0 && (
            <div className="space-y-3">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Fills automatically</div>
              <p className="text-[12px] text-slate-500">"Pull & save all" at the top saves these. Pull one here, or upload the report by hand only if its pull fails.</p>
              {autoSlots.map((x) => <IngestStepper key={x.slotId} slot={x} existing={latest.get(slotKey(connector.id, x.slotId))} onCommitted={onCommitted} source={sources.get(slotKey(connector.id, x.slotId))} />)}
            </div>
          )}

          {hasCreds && <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2.5">Credentials</div>
            <div className="space-y-3">
              {connector.credentialFields.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-xs font-medium text-slate-600">
                    {f.label}{f.optional && <span className="text-slate-400 font-normal"> (optional)</span>}
                  </span>
                  <input
                    type={f.type === 'password' ? 'password' : 'text'}
                    placeholder={f.placeholder}
                    value={draft[f.key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:border-brand-400 focus:outline-none"
                    autoComplete="off"
                  />
                  {f.help && <span className="text-[11px] text-slate-400">{f.help}</span>}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Blank fields are left unchanged; passwords are never shown back.</p>
          </div>}

          {hasCreds && <details className="text-[11px] text-slate-500">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-medium">
              Durable option: set as environment variables instead
            </summary>
            <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-0.5 font-mono">
              <p className="font-sans text-slate-500 mb-1.5">
                Set these on the Cloud Run service (value, or a Secret Manager reference). They survive restarts and
                redeploys and take precedence over anything saved here.
              </p>
              {connector.credentialFields.map((f) => (
                <div key={f.key}>{envVarName(connector.id, f.key)}{f.optional ? '  (optional)' : ''}</div>
              ))}
            </div>
          </details>}

          {msg && <p className={`text-xs leading-snug ${msgColor}`}>{msg.text}</p>}
        </div>
      </Drawer>
    </>
  );
}

// Setup = one list of every data source, each tagged Connected (API) / Automated (Claude) / Manual upload (founder, 3 Nov 2026).
// Old links ?view=uploads#<connector> still work: the hash opens that connector's drawer.
export function ConnectorsPage() {
  return (
    <>
      <PageHeader
        title="Setup"
        accent="brand"
        icon={iconPlug}
        description="Every data source in one list. Connected (API) and Automated (Claude) fill themselves: one Pull & save for the month. Manual upload is only for the reports nothing can fetch (Flipkart settlement + ads, Blinkit, Snapmint, Shopflo). A missing report shows up in Tasks → Fix."
        actions={<Link to="/reporting/mis/live" className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Live MIS →</Link>}
      />
      <ConnectionsView />
    </>
  );
}
