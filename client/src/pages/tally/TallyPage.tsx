// Tally health — what the MIS reads from Tally (READ ONLY): issues found in the stored books with how to fix each in
// TallyPrime, the chart of accounts (groups → sub-groups → ledgers, hanging ledgers and where to move them), "Ask about Tally" (Claude grounded in the books), and the ledger list / vouchers to look things up.
// Server: /api/tally/books/* (server/src/routes/tally.ts).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ChevronDown, Info, Loader2, RefreshCw, Send } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Markdown } from '../../components/ui/Markdown';
import { cx } from '../../components/shell/cx';
import { LedgerRulesCard } from './LedgerRulesCard';
import { ChartTab } from './ChartTab';

type Severity = 'error' | 'warn' | 'info';
interface Sample { date?: string; type?: string; number?: string; party?: string; ledger?: string; amount?: number; detail: string }
interface Issue { id: string; severity: Severity; title: string; why: string; fix: string; count: number; samples: Sample[] }
interface Health { periods: string[]; vouchers: number; ledgers: number; issues: Issue[]; mastersAt: string | null }
interface BooksStatus { connected: boolean; mastersAt: string | null; ledgers: number; months: Record<string, string>; lastTryAt: string | null; lastError: string | null; warnings: string[] }
interface Ledger { name: string; group: string; primary: string; gstin: string; registration: string; state: string; tds: string; vouchers: number }
interface Line { ledger: string; amount: number }
interface Voucher { guid: string; date: string; type: string; number: string; party: string; reference: string; narration: string; lines: Line[]; inventory: { item: string; qty: number | null }[] }

const icon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9" /></svg>;
const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const SEV: Record<Severity, { label: string; cls: string; Icon: typeof Info }> = {
  error: { label: 'Fix', cls: 'border-red-200 bg-red-50 text-red-800', Icon: AlertCircle },
  warn: { label: 'Check', cls: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle },
  info: { label: 'Tidy', cls: 'border-slate-200 bg-slate-100 text-slate-700', Icon: Info },
};
const btn = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-50';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${r.status}`);
  return j as T;
}

type Tab = 'issues' | 'chart' | 'ask' | 'ledgers' | 'vouchers' | 'rules';
const TABS: Tab[] = ['issues', 'chart', 'ask', 'ledgers', 'vouchers', 'rules'];

export function TallyPage() {
  // ?tab= (links from Issues) opens a view
  const [tab, setTab] = useState<Tab>(() => { try { const t = new URLSearchParams(window.location.search).get('tab') as Tab; return TABS.includes(t) ? t : 'issues'; } catch { return 'issues'; } });
  const [status, setStatus] = useState<BooksStatus | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [months, setMonths] = useState(3);
  const [pulling, setPulling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, h] = await Promise.all([api<BooksStatus>('/api/tally/books/status'), api<Health>(`/api/tally/books/health?months=${months}`)]);
    setStatus(s); setHealth(h);
  }, [months]);
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [load]);

  const pull = async () => {
    setPulling(true); setMsg(null);
    try {
      const r = await api<{ status: string; detail?: string; masters?: boolean; months?: string[]; error?: string | null }>('/api/tally/books/pull', { method: 'POST', body: '{}' });
      setMsg(r.status === 'not_connected' ? r.detail || 'Tally is not connected.'
        : r.status === 'down' ? `Tally did not answer: ${r.error}. It only answers while TallyPrime is open on the cloud machine with the company loaded.`
        : `Pulled ${[r.masters ? 'ledgers' : '', ...(r.months || [])].filter(Boolean).join(', ') || 'nothing new'}${r.error ? ` — stopped: ${r.error}` : ''}.`);
      await load();
    } catch (e) { setMsg((e as Error).message); } finally { setPulling(false); }
  };

  const stored = Object.keys(status?.months || {}).sort().reverse();
  const counts = { error: 0, warn: 0, info: 0 } as Record<Severity, number>;
  for (const i of health?.issues || []) counts[i.severity] += i.count;

  return (
    <>
      <PageHeader title="Tally health" icon={icon}
        description="What the MIS reads from Tally (read only — it never writes): problems in the books with how to fix each in TallyPrime, and answers about how things were booked."
        actions={<button type="button" onClick={pull} disabled={pulling} className={btn}>
          {pulling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}{pulling ? 'Pulling from Tally… (up to 2 min)' : 'Pull Tally now'}</button>} />
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
          <span>Ledgers {status?.ledgers ? <b className="text-slate-900">{status.ledgers}</b> : '—'} · taken {ago(status?.mastersAt ?? null)}</span>
          <span>Day Books: {stored.length ? stored.slice(0, 6).map((p) => <span key={p} className="mr-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700" title={`Taken ${ago(status!.months[p])}`}>{p}</span>) : 'none yet'}</span>
          {status && !status.connected && <span className="text-amber-800">Not connected — add the Tally host on <Link className="underline" to="/reporting/mis/connectors">Setup</Link>.</span>}
          {status?.lastError && <span className="text-amber-800" title={status.lastError}>Last pull stopped: {status.lastError.slice(0, 90)}</span>}
        </div>
        {msg && <p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{msg}</p>}
        {status?.warnings?.map((w) => <p key={w} className="text-sm text-amber-800">{w}</p>)}

        <SegmentedControl aria-label="View" value={tab} onChange={setTab} options={[
          { id: 'issues', label: `Issues${health ? ` (${health.issues.length})` : ''}` }, { id: 'chart', label: 'Chart of accounts' }, { id: 'ask', label: 'Ask about Tally' }, { id: 'ledgers', label: 'Ledgers' }, { id: 'vouchers', label: 'Vouchers' }, { id: 'rules', label: 'Ledger rules' }]} />

        {tab === 'issues' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span>Checked {health?.vouchers.toLocaleString('en-IN') ?? 0} vouchers in {health?.periods.join(', ') || 'no stored months'}:</span>
              {(['error', 'warn', 'info'] as Severity[]).map((s) => <span key={s} className={cx('rounded-full border px-2 py-0.5 text-xs font-medium', SEV[s].cls)}>{SEV[s].label} {counts[s]}</span>)}
              <label className="ml-auto flex items-center gap-2">Months
                <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="h-9 rounded-lg border border-slate-200 px-2">
                  {[1, 3, 6, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            {health && !health.periods.length && <Empty text="No Day Book stored yet. Open TallyPrime on the cloud machine with the company loaded, then Pull Tally now." />}
            {health?.periods.length && !health.issues.length ? <Empty text="No issues found in these months." /> : null}
            {health?.issues.map((i) => <IssueCard key={i.id} i={i} />)}
          </div>
        )}
        {tab === 'chart' && <ChartTab />}
        {tab === 'ask' && <Ask />}
        {tab === 'ledgers' && <Ledgers />}
        {tab === 'vouchers' && <Vouchers months={stored} />}
        {tab === 'rules' && <LedgerRulesCard />}
      </div>
    </>
  );
}

const Empty = ({ text }: { text: string }) => <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">{text}</p>;

function IssueCard({ i }: { i: Issue }) {
  const [open, setOpen] = useState(false);
  const S = SEV[i.severity];
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
        <span className={cx('mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', S.cls)}><S.Icon className="h-3.5 w-3.5" aria-hidden />{S.label}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{i.title} <span className="font-normal text-slate-500">· {i.count}</span></span>
          <span className="block text-sm text-slate-600">{i.why}</span>
        </span>
        <ChevronDown className={cx('mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-3">
          <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-slate-800"><b>How to fix in Tally:</b> {i.fix}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3 font-semibold">Date</th><th className="pr-3 font-semibold">Voucher</th><th className="pr-3 font-semibold">Party / ledger</th><th className="pr-3 text-right font-semibold">Amount</th><th className="font-semibold">What</th></tr></thead>
              <tbody>
                {i.samples.map((s, k) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-mono text-xs text-slate-600">{s.date || ''}</td>
                    <td className="pr-3 text-slate-700">{[s.type, s.number].filter(Boolean).join(' ')}</td>
                    <td className="pr-3 text-slate-900">{s.party || s.ledger || ''}</td>
                    <td className="pr-3 text-right tabular-nums">{s.amount != null ? inr(s.amount) : ''}</td>
                    <td className="text-slate-600">{s.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {i.count > i.samples.length && <p className="mt-1 text-xs text-slate-500">First {i.samples.length} of {i.count}.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Ask() {
  const [q, setQ] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async (text = q) => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    const history = chat;
    setChat([...chat, { role: 'user', content: text }]); setQ('');
    try {
      const r = await api<{ reply: string }>('/api/tally/books/ask', { method: 'POST', body: JSON.stringify({ question: text, history }) });
      setChat((c) => [...c, { role: 'assistant', content: r.reply }]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const examples = ['What should I fix first before closing the month?', 'How has Shiprocket been booked in the last 3 months?', 'Which purchases are missing GST input?', 'Why is the Suspense ledger not zero?'];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      {!chat.length && (
        <div className="mb-3 flex flex-wrap gap-2">
          {examples.map((e) => <button key={e} type="button" onClick={() => send(e)} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">{e}</button>)}
        </div>
      )}
      <div className="space-y-3">
        {chat.map((m, k) => m.role === 'user'
          ? <p key={k} className="ml-auto max-w-[80%] rounded-xl bg-accent-50 px-3 py-2 text-sm text-slate-900">{m.content}</p>
          : <div key={k} className="max-w-none text-sm text-slate-800"><Markdown text={m.content} /></div>)}
        {busy && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Reading the books…</p>}
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="tally-q">Question about Tally</label>
        <input id="tally-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about a ledger, a vendor, a voucher or an error…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
        <button type="submit" disabled={busy || !q.trim()} className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-cta px-4 text-sm font-semibold text-on-cta hover:bg-cta-hover disabled:opacity-50"><Send className="h-4 w-4" aria-hidden />Ask</button>
      </form>
    </div>
  );
}

function Ledgers() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ total: number; rows: Ledger[] } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { api<{ total: number; rows: Ledger[] }>(`/api/tally/books/ledgers?q=${encodeURIComponent(q)}`).then(setData).catch(() => setData(null)); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex items-center gap-3 border-b border-slate-200 p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, group or GSTIN" aria-label="Search ledgers" className="h-9 w-full max-w-sm rounded-lg border border-slate-300 px-3 text-sm" />
        <span className="text-sm text-slate-500">{data ? `${data.rows.length} of ${data.total}` : ''}</span>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2 font-semibold">Ledger</th><th className="px-3 font-semibold">Group</th><th className="px-3 font-semibold">GSTIN</th><th className="px-3 font-semibold">Registration · state</th><th className="px-3 font-semibold">TDS</th><th className="px-3 text-right font-semibold">Vouchers (3 mo)</th></tr></thead>
          <tbody>{data?.rows.map((l) => (
            <tr key={l.name} className="border-t border-slate-100">
              <td className="px-3 py-1.5 text-slate-900">{l.name}</td><td className="px-3 text-slate-600">{l.group}{l.primary && l.primary !== l.group ? <span className="text-slate-400"> · {l.primary}</span> : null}</td>
              <td className="px-3 font-mono text-xs">{l.gstin}</td><td className="px-3 text-slate-600">{[l.registration, l.state].filter(Boolean).join(' · ')}</td>
              <td className="px-3 text-slate-600">{l.tds}</td><td className="px-3 text-right tabular-nums">{l.vouchers || ''}</td>
            </tr>))}</tbody>
        </table>
        {data && !data.total && <Empty text="No ledgers stored yet — Pull Tally now while TallyPrime is open." />}
      </div>
    </div>
  );
}

function Vouchers({ months }: { months: string[] }) {
  const [period, setPeriod] = useState(months[0] || '');
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ total: number; rows: Voucher[] } | null>(null);
  useEffect(() => {
    if (!period) return;
    const t = setTimeout(() => { api<{ total: number; rows: Voucher[] }>(`/api/tally/books/vouchers?period=${period}&q=${encodeURIComponent(q)}`).then(setData).catch(() => setData(null)); }, 250);
    return () => clearTimeout(t);
  }, [period, q]);
  if (!months.length) return <Empty text="No Day Book stored yet — Pull Tally now while TallyPrime is open." />;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Month" className="h-9 rounded-lg border border-slate-300 px-2 text-sm">{months.map((m) => <option key={m}>{m}</option>)}</select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search party, ledger, voucher no., narration" aria-label="Search vouchers" className="h-9 w-full max-w-sm rounded-lg border border-slate-300 px-3 text-sm" />
        <span className="text-sm text-slate-500">{data ? `${data.rows.length} of ${data.total}` : ''}</span>
      </div>
      <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-auto">
        {data?.rows.map((v) => (
          <li key={v.guid || `${v.type}-${v.number}`} className="px-3 py-2 text-[13px]">
            <div className="flex flex-wrap gap-x-3"><span className="font-mono text-xs text-slate-500">{v.date}</span><span className="font-medium text-slate-900">{v.type} {v.number}</span><span className="text-slate-700">{v.party}</span>{v.reference && <span className="text-slate-500">ref {v.reference}</span>}</div>
            <div className="mt-0.5 text-slate-600">{v.lines.map((l, k) => <span key={k} className="mr-3"><span className={l.amount >= 0 ? 'text-slate-500' : 'text-slate-400'}>{l.amount >= 0 ? 'Dr' : 'Cr'}</span> {l.ledger} <span className="tabular-nums">{inr(l.amount)}</span></span>)}</div>
            {v.narration && <div className="text-xs text-slate-500">{v.narration}</div>}
          </li>))}
      </ul>
    </div>
  );
}
