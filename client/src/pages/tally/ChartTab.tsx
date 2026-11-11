// Tally health → Chart of accounts: every group, sub-group and ledger as one cascading tree (closing balances from the
// newest stored Trial Balance), and the hanging ledgers — on a parent group that has sub-groups, in a carry-over / old
// group, with no group, or in another channel's group — each with where it should move and why. READ ONLY: the move is
// made by hand in TallyPrime. Server: GET /api/tally/books/chart (server/src/connectors/tally/chart.ts).
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { cx } from '../../components/shell/cx';
import { Empty, ErrorBox, InfoTip, Loading } from '../../components/ui/states';

type HangKind = 'catch_all' | 'legacy' | 'no_group' | 'channel_mismatch';
interface Node { name: string; kind: 'group' | 'ledger'; closing: number | null; ledgers: number; hanging: number; children: Node[] }
interface Hanging { ledger: string; group: string; primary: string; kind: HangKind; why: string; closing: number | null; suggest: { group: string; path: string; why: string; confidence: 'high' | 'medium' } | null }
interface Chart { tree: Node[]; hanging: Hanging[]; emptyGroups: string[]; summary: { groups: number; ledgers: number; hanging: number; byKind: Record<HangKind, number> } | null; mastersAt: string | null; tbPeriod: string | null }

const KIND: Record<HangKind, string> = { catch_all: 'On a parent group', legacy: 'Carry-over / old group', no_group: 'No group', channel_mismatch: "Other channel's group" };
const amt = (n: number | null) => (n === null ? '' : `${n < 0 ? 'Cr' : 'Dr'} ₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`);

export function ChartTab() {
  const [data, setData] = useState<Chart | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyHanging, setOnlyHanging] = useState(false);
  const [kind, setKind] = useState<HangKind | 'all'>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/tally/books/chart').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `${r.status}`); setData(j); }).catch((e) => setErr(e.message));
  }, []);

  const hang = useMemo(() => new Map((data?.hanging ?? []).map((h) => [h.ledger, h])), [data]);
  const list = (data?.hanging ?? []).filter((h) => kind === 'all' || h.kind === kind);
  const ql = q.trim().toLowerCase();
  const match = (n: Node): boolean => (n.kind === 'ledger' ? (!onlyHanging || hang.has(n.name)) && (!ql || n.name.toLowerCase().includes(ql)) : n.children.some(match) || (!onlyHanging && !!ql && n.name.toLowerCase().includes(ql)));
  const filtering = !!ql || onlyHanging;
  const toggle = (path: string) => setOpen((s) => { const n = new Set(s); if (n.has(path)) n.delete(path); else n.add(path); return n; });
  const expandAll = (v: boolean) => {
    if (!v) return setOpen(new Set());
    const all = new Set<string>();
    const walk = (n: Node, p: string) => { if (n.kind === 'group') { all.add(p); n.children.forEach((c) => walk(c, `${p}/${c.name}`)); } };
    data?.tree.forEach((n) => walk(n, n.name));
    setOpen(all);
  };

  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!data) return <Loading label="Reading the chart" />;
  if (!data.summary) return <Empty title="No Tally groups stored yet" hint="Open TallyPrime. Then select Pull Tally now." />;

  const render = (n: Node, path: string, depth: number): React.ReactNode => {
    if (filtering && !match(n)) return null;
    if (n.kind === 'ledger') {
      const h = hang.get(n.name);
      return (
        <li key={path} className={cx('flex items-center gap-2 py-1 pr-3 text-[13px]', h && 'bg-amber-50')} style={{ paddingLeft: 12 + depth * 18 }}>
          <span className="min-w-0 flex-1 truncate text-slate-800">{n.name}</span>
          {h && <span className="shrink-0 rounded-md border border-amber-200 bg-white px-1.5 text-xs text-amber-900" title={h.why}>{KIND[h.kind]}{h.suggest ? ` → ${h.suggest.group}` : ''}</span>}
          <span className="w-36 shrink-0 text-right tabular-nums text-slate-500">{amt(n.closing)}</span>
        </li>
      );
    }
    const isOpen = filtering || open.has(path);
    return (
      <li key={path}>
        <button type="button" onClick={() => toggle(path)} aria-expanded={isOpen}
          className="flex w-full items-center gap-2 py-1.5 pr-3 text-left text-[13px] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" style={{ paddingLeft: 6 + depth * 18 }}>
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
          {isOpen ? <FolderOpen className="h-4 w-4 shrink-0 text-accent-600" aria-hidden /> : <Folder className="h-4 w-4 shrink-0 text-accent-600" aria-hidden />}
          <span className={cx('min-w-0 flex-1 truncate', depth === 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-800')}>{n.name}</span>
          {n.hanging > 0 && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-900">{n.hanging} hanging</span>}
          <span className="shrink-0 text-xs text-slate-500">{n.ledgers} ledger{n.ledgers === 1 ? '' : 's'}</span>
          <span className="w-36 shrink-0 text-right tabular-nums text-slate-600">{amt(n.closing)}</span>
        </button>
        {isOpen && n.children.length > 0 && <ul>{n.children.map((c) => render(c, `${path}/${c.name}`, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white shadow-card" aria-labelledby="hang-h">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <h2 id="hang-h" className="mr-1 text-sm font-semibold text-slate-900">Hanging ledgers</h2>
          <InfoTip label="How to move a ledger">
            <ol className="list-decimal space-y-1 pl-4">
              <li>In TallyPrime, press Alt+G. Select Alter → Ledger.</li>
              <li>Pick the ledger. Change <b>Under</b> to the group in “Move to”.</li>
              <li>Press Ctrl+A to save. Old vouchers move with the ledger.</li>
              <li>Select Pull Tally now on this page.</li>
            </ol>
            <p>The MIS never writes to Tally.</p>
          </InfoTip>
          {(['all', 'channel_mismatch', 'no_group', 'catch_all', 'legacy'] as const).map((k) => {
            const n = k === 'all' ? data.hanging.length : data.summary!.byKind[k];
            if (k !== 'all' && !n) return null;
            return <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
              className={cx('min-h-11 sm:min-h-8 rounded-full border px-3 text-xs', kind === k ? 'border-accent-500 bg-accent-50 font-medium text-accent-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
              {k === 'all' ? 'All' : KIND[k]} {n}</button>;
          })}
        </div>
        {!list.length ? <p className="px-4 py-6 text-center text-sm text-slate-600">No hanging ledgers. Each ledger is in its correct group.</p> : (
          <div className="max-h-[40vh] overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr>
                <th className="px-3 py-2 font-semibold">Ledger</th><th className="px-3 font-semibold">Now under</th><th className="px-3 font-semibold">Move to</th><th className="px-3 font-semibold">Why</th><th className="px-3 text-right font-semibold">Closing</th></tr></thead>
              <tbody>{list.map((h) => (
                <tr key={h.ledger} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-1.5 font-medium text-slate-900">{h.ledger}<div className="text-xs font-normal text-slate-500">{KIND[h.kind]}</div></td>
                  <td className="px-3 py-1.5 text-slate-600">{h.group || '—'}</td>
                  <td className="px-3 py-1.5">{h.suggest
                    ? <><span className="font-medium text-slate-900">{h.suggest.group}</span>{h.suggest.confidence === 'medium' && <span className="ml-1 rounded bg-slate-100 px-1 text-xs text-slate-600">check</span>}<div className="text-xs text-slate-500">{h.suggest.path}</div></>
                    : <span className="text-slate-500">Pick by hand</span>}</td>
                  <td className="px-3 py-1.5 text-slate-600">{h.suggest ? `${h.suggest.why}. ` : ''}<span className="text-slate-500">{h.why}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{amt(h.closing)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-card" aria-labelledby="tree-h">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <h2 id="tree-h" className="text-sm font-semibold text-slate-900">Chart of accounts <span className="ml-1 font-normal text-slate-600">{data.summary.groups} groups · {data.summary.ledgers} ledgers{data.tbPeriod ? ` · closings ${data.tbPeriod}` : ' · no closings'}</span></h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a group or ledger" aria-label="Find in chart" className="min-h-11 sm:min-h-9 w-full max-w-xs rounded-lg border border-slate-300 px-3 text-sm" />
          <label className="flex min-h-11 sm:min-h-9 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyHanging} onChange={(e) => setOnlyHanging(e.target.checked)} className="h-4 w-4" />Only hanging</label>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => expandAll(true)} className="min-h-11 sm:min-h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">Expand all</button>
            <button type="button" onClick={() => expandAll(false)} className="min-h-11 sm:min-h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">Collapse</button>
          </div>
        </div>
        <ul className="max-h-[60vh] overflow-auto py-1">{data.tree.map((n) => render(n, n.name, 0))}</ul>
      </section>
    </div>
  );
}
