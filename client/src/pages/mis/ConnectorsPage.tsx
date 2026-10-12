// ----------------------------------------------------------------------------
// Data Sources — the connector console.
//
// One card per live source. Each stores its own credentials server-side (never
// in the browser), proves them with Test, and pulls one month with Sync. A
// successful sync can be sent straight to the open month-close session, where
// it joins anything dropped in by file and runs the same cascade and gates.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import {
  clearCredentials,
  envVarName,
  FETCH_MODE_LABEL,
  GROUP_LABEL,
  listConnectors,
  refreshStore,
  saveCredentials,
  syncConnector,
  testConnector,
  type ConnectorGroup,
  type ConnectorInfo,
  type StoreStatus,
} from '../../data/monthClose/connectorsClient';
import { emptySession, type MonthCloseSession, type UploadedSource } from '../../data/monthClose/schema';

const CLOSE_SESSION_KEY = 'heatronics.monthClose.session';
const DEFAULT_PERIOD = '2026-08'; // the next month to close after Jul 2026

const GROUP_ORDER: ConnectorGroup[] = ['book', 'marketplace', 'd2c', 'logistics', 'payments'];

const iconPlug = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

/** Append pulled sources into the month-close session localStorage. */
function sendToClose(periodKey: string, sources: UploadedSource[]): number {
  let session: MonthCloseSession;
  try {
    session = JSON.parse(localStorage.getItem(CLOSE_SESSION_KEY) || 'null') as MonthCloseSession;
  } catch {
    session = null as unknown as MonthCloseSession;
  }
  if (!session || typeof session !== 'object') {
    const [y, m] = periodKey.split('-').map(Number);
    const label = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${y}`;
    session = emptySession(periodKey, label);
  }
  session.sources = [...(session.sources ?? []), ...sources];
  localStorage.setItem(CLOSE_SESSION_KEY, JSON.stringify(session));
  return session.sources.length;
}

export function ConnectorsPage() {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [store, setStore] = useState<StoreStatus | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const grouped = useMemo(() => {
    const by: Record<string, ConnectorInfo[]> = {};
    for (const c of connectors) (by[c.group] ??= []).push(c);
    return by;
  }, [connectors]);

  const connectedCount = connectors.filter((c) => c.connected).length;

  return (
    <>
      <PageHeader
        title="Data sources"
        accent="emerald"
        icon={iconPlug}
        description="Connect each system once. Credentials are stored on the server, never in the browser. Sync pulls a month and sends it to the close."
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Data sources' },
        ]}
        actions={
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <Link
              to="/reporting/mis/live"
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Live MIS →
            </Link>
            <span>{connectedCount}/{connectors.length} connected</span>
            {store && (
              <span
                className={
                  'px-1.5 py-0.5 rounded ' +
                  (store.durable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
                }
              >
                {store.durable ? 'Secret Manager · durable' : 'temporary store'}
              </span>
            )}
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <SectionCard
          title="Month to sync"
          description="Which month a Sync pulls. Set it before pulling; it also labels what is sent to the close."
        >
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200"
            />
            <span className="text-xs text-slate-400">Pulls 1–end of the selected month.</span>
          </div>
        </SectionCard>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
        )}

        {store && !store.durable && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 space-y-2">
            <p className="font-medium">⚠ Tokens are saved to a temporary store and will be cleared on restart or redeploy.</p>
            {store.grantHint ? (
              <>
                <p>
                  To make saves permanent automatically (no env vars, no per-token work), grant this service account
                  permission to manage secrets — <span className="font-medium">once</span>. A service can't grant itself
                  access, so this is the one manual step. Run it in Cloud Shell, then click Re-check:
                </p>
                <pre className="bg-amber-100 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">{store.grantHint}</pre>
                {store.secretManagerError && (
                  <p className="text-amber-700">Secret Manager said: {store.secretManagerError}</p>
                )}
              </>
            ) : (
              <p>
                This server isn't running on GCP (or the project couldn't be detected), so Secret Manager isn't
                available. Set credentials as environment variables instead — each connector's drawer shows the names.
              </p>
            )}
            <button
              onClick={async () => {
                setRechecking(true);
                try {
                  const r = await refreshStore();
                  setStore(r.store);
                } finally {
                  setRechecking(false);
                }
              }}
              disabled={rechecking}
              className="px-2.5 py-1 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-40"
            >
              {rechecking ? 'Re-checking…' : 'Re-check store'}
            </button>
          </div>
        )}

        {loading && <p className="text-sm text-slate-400">Loading connectors…</p>}

        {GROUP_ORDER.filter((g) => grouped[g]?.length).map((g) => (
          <div key={g}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{GROUP_LABEL[g]}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped[g].map((c) => (
                <ConnectorCard key={c.id} connector={c} period={period} onChanged={reload} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ConnectorCard({
  connector,
  period,
  onChanged,
}: {
  connector: ConnectorInfo;
  period: string;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const dot = connector.connected
    ? connector.implemented ? 'bg-emerald-500' : 'bg-amber-400'
    : 'bg-slate-300';
  const statusText = connector.connected
    ? `${connector.implemented ? 'Connected' : 'Saved · pull pending'}${connector.viaEnv ? ' · env' : ''}`
    : 'Not connected';

  const save = async () => {
    setBusy('save'); setMsg(null);
    try {
      await saveCredentials(connector.id, draft);
      setDraft({});
      setOpen(false);
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

  const sync = async () => {
    setBusy('sync'); setMsg(null);
    try {
      const r = await syncConnector(connector.id, period);
      const n = r.sources.reduce(
        (acc, s) => ({
          nodes: acc.nodes + s.nodes.length,
          sku: acc.sku + s.skuRows.length,
          xc: acc.xc + s.crossChecks.length,
        }),
        { nodes: 0, sku: 0, xc: 0 },
      );
      const total = sendToClose(period, r.sources);
      const parts = [
        n.nodes && `${n.nodes} ledger rows`,
        n.sku && `${n.sku} SKU rows`,
        n.xc && `${n.xc} cross-checks`,
      ].filter(Boolean).join(', ');
      setMsg({
        kind: r.warnings.length ? 'warn' : 'ok',
        text: `Pulled ${parts || 'no rows'} → sent to close (${total} sources). ` +
          (r.warnings.length ? `⚠ ${r.warnings[0]}` : ''),
      });
      await onChanged();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Sync failed.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            <h4 className="text-sm font-semibold text-slate-800">{connector.label}</h4>
          </div>
          <span className="text-[11px] text-slate-400">{statusText}</span>
        </div>
        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-500 whitespace-nowrap">
          {FETCH_MODE_LABEL[connector.fetchMode]}
        </span>
      </div>

      {connector.note && <p className="text-[11px] leading-snug text-slate-500">{connector.note}</p>}

      <div className="flex flex-wrap gap-2 mt-auto pt-1">
        <button
          onClick={() => setOpen(!open)}
          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          {connector.connected ? 'Update token' : 'Configure token'}
        </button>
        <button
          onClick={test}
          disabled={!connector.connected || busy !== null}
          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          {busy === 'test' ? 'Testing…' : 'Test'}
        </button>
        <button
          onClick={sync}
          disabled={!connector.connected || !connector.implemented || busy !== null}
          title={!connector.implemented ? 'Monthly pull for this source is not wired yet' : undefined}
          className="px-2.5 py-1 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {busy === 'sync' ? 'Syncing…' : 'Sync month'}
        </button>
      </div>

      {msg && (
        <p
          className={
            'text-[11px] leading-snug ' +
            (msg.kind === 'ok' ? 'text-emerald-700' : msg.kind === 'warn' ? 'text-amber-700' : 'text-rose-700')
          }
        >
          {msg.text}
        </p>
      )}

      {open && (
        <div className="border-t border-slate-100 pt-3 space-y-2.5">
          {connector.credentialFields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[11px] font-medium text-slate-600">
                {f.label}{f.optional && <span className="text-slate-400 font-normal"> (optional)</span>}
              </span>
              <input
                type={f.type === 'password' ? 'password' : 'text'}
                placeholder={f.placeholder}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                className="mt-0.5 w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 font-mono"
                autoComplete="off"
              />
              {f.help && <span className="text-[10px] text-slate-400">{f.help}</span>}
            </label>
          ))}
          <details className="text-[10px] text-slate-500">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
              Durable option: set as environment variables instead
            </summary>
            <div className="mt-1.5 rounded-lg bg-slate-50 border border-slate-200 p-2 space-y-0.5 font-mono">
              <p className="font-sans text-slate-500 mb-1">
                Set these on the Cloud Run service (value, or a Secret Manager reference). They survive restarts and redeploys and take precedence over anything saved here.
              </p>
              {connector.credentialFields.map((f) => (
                <div key={f.key}>{envVarName(connector.id, f.key)}{f.optional ? '  (optional)' : ''}</div>
              ))}
            </div>
          </details>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={save}
              disabled={busy !== null}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-40"
            >
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            {connector.connected && (
              <button
                onClick={async () => {
                  setBusy('clear');
                  try { await clearCredentials(connector.id); await onChanged(); setMsg({ kind: 'ok', text: 'Credentials removed.' }); }
                  finally { setBusy(null); }
                }}
                disabled={busy !== null}
                className="px-2.5 py-1 text-xs rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
              >
                Remove
              </button>
            )}
            <span className="text-[10px] text-slate-400">Blank fields are left unchanged; passwords are never shown back.</span>
          </div>
        </div>
      )}
    </div>
  );
}
