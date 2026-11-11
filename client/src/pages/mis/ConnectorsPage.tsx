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
import { KeyRound } from 'lucide-react';
import { PageHeader, PageBody } from '../../components/ui/PageHeader';
import { Drawer, Popover } from '../../components/ui/overlays';
import { BTN, Empty, ErrorBox, Loading, Panel } from '../../components/ui/states';
import { StatusPill, type PillTone } from '../../components/ui/StatusPill';
import {
  clearCredentials,
  envVarName,
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

/** Append pulled sources into the month-close session localStorage. */

/** The status read of a connector → tone + label for the pill. */
function statusOf(c: ConnectorInfo): { tone: PillTone; label: string } {
  if (!c.connected) return { tone: 'neutral', label: 'Not connected' };
  if (!c.implemented) return { tone: 'neutral', label: 'Upload only' };
  return { tone: 'positive', label: 'Connected' };
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
const FEED_LABEL: Record<Feed, string> = { api: 'API', claude: 'Claude task', manual: 'Manual upload' };
const FEED_TONE: Record<Feed, PillTone> = { api: 'info', claude: 'brand', manual: 'warning' };
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
      setError(e instanceof Error ? e.message : 'Could not load the sources. Try again.');
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
      className={'min-h-11 sm:min-h-8 rounded-full border px-3 text-xs font-semibold ' + (filter === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900')}>
      {label} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );

  return (
    <PageBody>
      <div className="grid gap-4 lg:grid-cols-2">
        <CoveragePanel reports={reports} connectors={connectors} />
        <AutoPullPanel sources={sources} onDone={reloadReports} />
      </div>

      {error && <ErrorBox onRetry={() => void reload()}>{error}</ErrorBox>}

      <Panel flush title="Sources" count={connectors.length}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {chip('all', 'All', connectors.length)}
            {FEED_ORDER.map((f) => chip(f, FEED_LABEL[f], count(f)))}
            {store && (
              <Popover align="right" width={380} buttonLabel="Where the passwords are kept"
                buttonClassName={`inline-flex min-h-11 sm:min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold ${store.durable ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
                button={<><KeyRound className="h-3.5 w-3.5" aria-hidden />{store.durable ? 'Passwords: safe store' : 'Passwords: temporary'}</>}>
                <div className="space-y-2 p-4 text-[13px] text-slate-700">
                  {store.durable ? <p>Passwords are in Secret Manager. They stay after a restart.</p> : <>
                    <p className="font-semibold text-slate-900">A restart removes the saved passwords.</p>
                    {store.grantHint ? <>
                      <p>1. Run this command 1 time in Cloud Shell.</p>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-slate-100 p-2 font-mono text-xs">{store.grantHint}</pre>
                      <p>2. Select Check again.</p>
                      {store.secretManagerError && <p className="text-amber-700">Secret Manager error: {store.secretManagerError}</p>}
                    </> : <p>This server is not on Google Cloud. Set the passwords as environment variables. Each source shows the names.</p>}
                    <button type="button" onClick={async () => { setRechecking(true); try { const r = await refreshStore(); setStore(r.store); } finally { setRechecking(false); } }}
                      disabled={rechecking} className={BTN}>{rechecking ? 'Checking…' : 'Check again'}</button>
                  </>}
                </div>
              </Popover>
            )}
          </div>
        }>
        {loading ? <div className="p-4"><Loading /></div> : shown.length === 0 ? <div className="p-4"><Empty title="No source of this type" /></div> : (
          <ul>
            {GROUP_ORDER.filter((g) => grouped[g]?.length).map((g) => (
              <li key={g}>
                <h3 className="border-b border-slate-200 bg-slate-100 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600">{GROUP_LABEL[g]}</h3>
                <ul className="divide-y divide-slate-100">
                  {grouped[g].map((c) => (
                    <ConnectorCard key={c.id} connector={c} feed={feeds.get(c.id)!} sources={sources} latest={latest}
                      open={openId === c.id} setOpen={(o) => setOpenId(o ? c.id : null)} onChanged={reload} onCommitted={reloadReports} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageBody>
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
      setMsg({ kind: 'ok', text: 'Saved.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not save. Try again.' });
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
      <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 hover:bg-slate-50">
        <Monogram label={connector.label} />
        <div className="min-w-0 flex-1 basis-48">
          <h4 className="truncate text-sm font-semibold text-slate-900">{connector.label}</h4>
          <p className="truncate text-xs text-slate-600" title={lines.map((l) => l.slot.label).join(', ')}>
            {lines.length ? lines.map(({ slot, got }) => `${slot.label}${got ? ` (${got.periodKey})` : ''}`).join(' · ') : connector.note ?? 'No monthly report'}
          </p>
        </div>
        <StatusPill toneName={FEED_TONE[feed]} className="whitespace-nowrap">{FEED_LABEL[feed]}</StatusPill>
        <span className="w-36 text-right">{hasCreds ? <StatusPill toneName={status.tone} dot>{status.label}</StatusPill> : <span className="text-xs text-slate-500">No login</span>}</span>
        <button type="button"
          onClick={() => { setOpen(true); setMsg(null); }}
          className={BTN + ' w-24'}
        >
          {feed === 'manual' ? 'Upload' : connector.connected || !hasCreds ? 'Open' : 'Connect'}
        </button>
      </li>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width={slots.length ? 640 : 440}
        icon={<Monogram label={connector.label} />}
        subtitle={GROUP_LABEL[connector.group]}
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
                  try { await clearCredentials(connector.id); await onChanged(); setMsg({ kind: 'ok', text: 'Removed.' }); }
                  finally { setBusy(null); }
                }}
                disabled={busy !== null}
                aria-label="Remove the saved login"
                className="px-3 py-2.5 text-sm font-semibold rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
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
              <div className="text-xs sm:text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Upload each month</div>
              {manualSlots.map((x) => <IngestStepper key={x.slotId} slot={x} existing={latest.get(slotKey(connector.id, x.slotId))} onCommitted={onCommitted} source={sources.get(slotKey(connector.id, x.slotId))} />)}
            </div>
          )}
          {autoSlots.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs sm:text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Automatic reports</div>
              <p className="text-[12px] text-slate-500">Pull all saves these reports. Upload the file only if the pull fails.</p>
              {autoSlots.map((x) => <IngestStepper key={x.slotId} slot={x} existing={latest.get(slotKey(connector.id, x.slotId))} onCommitted={onCommitted} source={sources.get(slotKey(connector.id, x.slotId))} />)}
            </div>
          )}

          {hasCreds && <div>
            <div className="text-xs sm:text-[11px] font-extrabold uppercase tracking-wide text-slate-400 mb-2.5">Login</div>
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
                  {f.help && <span className="text-xs sm:text-[11px] text-slate-400">{f.help}</span>}
                </label>
              ))}
            </div>
            <p className="text-xs sm:text-[11px] text-slate-400 mt-2">An empty field keeps its saved value. The page does not show saved passwords.</p>
          </div>}

          {hasCreds && <details className="text-xs sm:text-[11px] text-slate-500">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-medium">
              Environment variable names
            </summary>
            <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-0.5 font-mono">
              <p className="font-sans text-slate-500 mb-1.5">
                Set these on the Cloud Run service. They stay after a restart. They replace the values saved here.
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
        description="Connect each source 1 time. Then pull or upload the reports for each month."
        help={<>
          <p>API: the MIS pulls the report.</p>
          <p>Claude task: a scheduled Claude task gets the report.</p>
          <p>Manual upload: download the file from the source. Then upload it here each month.</p>
          <p>A missing report shows in Tasks, Fix list.</p>
        </>}
        actions={<Link to="/tasks/settings" className={BTN}>People and reminders</Link>}
      />
      <ConnectionsView />
    </>
  );
}
