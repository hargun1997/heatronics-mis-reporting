// Tally health — what the MIS reads from Tally (READ ONLY): issues found in the stored books with how to fix each in
// TallyPrime, the chart of accounts (groups → sub-groups → ledgers, hanging ledgers and where to move them), "Ask about Tally" (Claude grounded in the books), and the ledger list / vouchers to look things up.
// Server: /api/tally/books/* (server/src/routes/tally.ts).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { PageBody, PageHeader } from '../../components/ui/PageHeader';
import { SourceChip } from '../../components/ui/SourceChip';
import { BTN, BTN_PRIMARY } from '../../components/ui/states';
import { Markdown } from '../../components/ui/Markdown';
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

const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${r.status}`);
  return j as T;
}

type Tab = 'chart' | 'ask' | 'ledgers' | 'vouchers' | 'rules';
const TABS: Tab[] = ['chart', 'ask', 'ledgers', 'vouchers', 'rules'];

export function TallyPage() {
  // ?tab= (links from Issues) opens a view
  const [tab, setTab] = useState<Tab>(() => { try { const t = new URLSearchParams(window.location.search).get('tab') as Tab; return TABS.includes(t) ? t : 'chart'; } catch { return 'chart'; } });
  const [status, setStatus] = useState<BooksStatus | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const months = 3; // Tally health checks over the newest 3 stored months (the list itself is in Tasks → Fix)
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
        : `Pulled ${[r.masters ? 'ledgers' : '', ...(r.months || [])].filter(Boolean).join(', ') || 'nothing new'}${r.error ? `: stopped: ${r.error}` : ''}.`);
      await load();
    } catch (e) { setMsg((e as Error).message); } finally { setPulling(false); }
  };

  const stored = Object.keys(status?.months || {}).sort().reverse();
  const counts = { error: 0, warn: 0, info: 0 } as Record<Severity, number>;
  for (const i of health?.issues || []) counts[i.severity] += i.count;

  const notes = [
    ...(stored.length ? [`Day Books stored: ${stored.slice(0, 6).join(', ')}${stored.length > 6 ? ` +${stored.length - 6}` : ''}.`] : ['No Day Book stored yet.']),
    ...(status?.lastError ? [`Last pull stopped: ${status.lastError.slice(0, 160)}`] : []),
    ...(status?.warnings ?? []),
  ];
  const problems = health?.issues.length ?? 0;
  const pill = 'inline-flex min-h-11 sm:min-h-8 items-center rounded-full border px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';

  return (
    <>
      <PageHeader title="Tally health"
        description="The chart of accounts, ledgers and vouchers that the MIS reads from Tally."
        status={<>
          {status && !status.connected && <Link to="/reporting/mis/connectors" className={`${pill} border-amber-200 bg-amber-50 text-amber-800`}>Not connected · open Setup</Link>}
          {problems > 0 && <Link to="/tasks?view=fix" className={`${pill} border-red-200 bg-red-50 text-red-800`} title={`${counts.error} to fix, ${counts.warn} to check`}>{problems} problems · open Fix list</Link>}
        </>}
        help={<><p>The MIS reads Tally. It never writes to Tally.</p><p>Problems found in the books are in Tasks → Fix, with how to fix each.</p><p>Tally answers only while TallyPrime is open on the cloud machine with the company loaded.</p></>}
        tabs={[{ id: 'chart', label: 'Chart of accounts' }, { id: 'ask', label: 'Ask about Tally' }, { id: 'ledgers', label: 'Ledgers', count: status?.ledgers || null }, { id: 'vouchers', label: 'Vouchers' }, { id: 'rules', label: 'Ledger rules' }]}
        tab={tab} onTab={(id) => setTab(id as Tab)}
        actions={<>
          {status && <SourceChip items={[{ label: 'Tally books', asOf: status.mastersAt, staleAfterH: 48, note: `${status.ledgers || 0} ledgers` }, ...stored.slice(0, 1).map((p) => ({ label: `Day Book ${p}`, asOf: status.months[p], staleAfterH: 48 }))]} notes={notes} />}
          <button type="button" onClick={pull} disabled={pulling} className={BTN}>
            {pulling ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}{pulling ? 'Pulling (up to 2 min)…' : 'Pull Tally now'}</button>
        </>} />
      <PageBody>
        {msg && <p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{msg}</p>}
        {tab === 'chart' && <ChartTab />}
        {tab === 'ask' && <Ask />}
        {tab === 'ledgers' && <Ledgers />}
        {tab === 'vouchers' && <Vouchers months={stored} />}
        {tab === 'rules' && <LedgerRulesCard />}
      </PageBody>
    </>
  );
}

const Empty = ({ text }: { text: string }) => <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">{text}</p>;

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
  const examples = ['What do I fix first before I lock the month?', 'How is Shiprocket booked in the last 3 months?', 'Which purchases have no GST input?', 'Why is the Suspense ledger not zero?'];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      {!chat.length && (
        <div className="mb-3 flex flex-wrap gap-2">
          {examples.map((e) => <button key={e} type="button" onClick={() => send(e)} className="min-h-11 sm:min-h-9 rounded-full border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">{e}</button>)}
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
        <input id="tally-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="How is Shiprocket booked?"
          className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
        <button type="submit" disabled={busy || !q.trim()} className={`${BTN_PRIMARY} min-h-11`}><Send className="h-4 w-4" aria-hidden />Ask</button>
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, group or GSTIN" aria-label="Search ledgers" className="min-h-11 sm:min-h-9 w-full max-w-sm rounded-lg border border-slate-300 px-3 text-sm" />
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
        {data && !data.total && <Empty text="No ledgers stored yet. Open TallyPrime, then select Pull Tally now." />}
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
  if (!months.length) return <Empty text="No Day Book stored yet. Open TallyPrime, then select Pull Tally now." />;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Month" className="min-h-11 sm:min-h-9 rounded-lg border border-slate-300 px-2 text-sm">{months.map((m) => <option key={m}>{m}</option>)}</select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search party, ledger, voucher no., narration" aria-label="Search vouchers" className="min-h-11 sm:min-h-9 w-full max-w-sm rounded-lg border border-slate-300 px-3 text-sm" />
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
