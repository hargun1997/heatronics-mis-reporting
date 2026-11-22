// Tally health → Chart of accounts: every group, sub-group and ledger as ONE cascading tree (closing balances from the
// newest stored Trial Balance). Since 22 Nov 2026 the hanging ledgers show in that tree only (they were a second table
// above it): the tree opens on "Hanging" when there are any, each hanging row says where it moves, the why sits behind
// an "i". The hanging ledgers — on a parent group that has sub-groups, in a carry-over / old
// group, with no group, or in another channel's group — each with where it should move and why. READ ONLY: the move is
// made by hand in TallyPrime. Server: GET /api/tally/books/chart (server/src/connectors/tally/chart.ts).
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { cx } from '../../components/shell/cx';
import { Empty, ErrorBox, InfoTip, Loading } from '../../components/ui/states';
import { StatusPill } from '../../components/ui/StatusPill';
import { SegmentedControl } from '../../components/ui/SegmentedControl';

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
  const [mode, setMode] = useState<'hanging' | 'all' | null>(null); // null = Hanging when there are any
  const [kind, setKind] = useState<HangKind | 'all'>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/tally/books/chart').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `${r.status}`); setData(j); }).catch((e) => setErr(e.message));
  }, []);

  const hang = useMemo(() => new Map((data?.hanging ?? []).map((h) => [h.ledger, h])), [data]);
  const ql = q.trim().toLowerCase();
  const onlyHanging = (mode ?? ((data?.hanging.length ?? 0) > 0 ? 'hanging' : 'all')) === 'hanging';
  const isShown = (name: string) => { const h = hang.get(name); return !!h && (kind === 'all' || h.kind === kind); };
  const match = (n: Node): boolean => (n.kind === 'ledger' ? (!onlyHanging || isShown(n.name)) && (!ql || n.name.toLowerCase().includes(ql)) : n.children.some(match) || (!onlyHanging && !!ql && n.name.toLowerCase().includes(ql)));
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
        <li key={path} className={cx('flex items-center gap-2 py-1 pr-3 text-label', h && 'bg-amber-50')} style={{ paddingLeft: 12 + depth * 18 }}>
          <span className="min-w-0 flex-1 truncate text-slate-800">{n.name}</span>
          {h && <>
            <span className="shrink-0 text-xs text-slate-700">{h.suggest ? <>Move to <b className="font-semibold text-slate-900">{h.suggest.group}</b></> : 'Pick the group by hand'}</span>
            {h.suggest?.confidence === 'medium' && <StatusPill toneName="neutral" size="sm" className="shrink-0">Check</StatusPill>}
            <InfoTip label={`Why ${n.name} is hanging`} align="right">
              <p><b>{KIND[h.kind]}.</b> {h.why}</p>
              {h.suggest && <p>{h.suggest.why}. Path: {h.suggest.path}</p>}
            </InfoTip>
          </>}
          <span className="w-36 shrink-0 text-right tabular-nums text-slate-500">{amt(n.closing)}</span>
        </li>
      );
    }
    const isOpen = filtering || open.has(path);
    return (
      <li key={path}>
        <button type="button" onClick={() => toggle(path)} aria-expanded={isOpen}
          className="flex w-full items-center gap-2 py-1.5 pr-3 text-left text-label hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" style={{ paddingLeft: 6 + depth * 18 }}>
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
          {isOpen ? <FolderOpen className="h-4 w-4 shrink-0 text-accent-600" aria-hidden /> : <Folder className="h-4 w-4 shrink-0 text-accent-600" aria-hidden />}
          <span className={cx('min-w-0 flex-1 truncate', depth === 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-800')}>{n.name}</span>
          {n.hanging > 0 && <StatusPill toneName="warning" size="sm" className="shrink-0">{n.hanging} hanging</StatusPill>}
          <span className="shrink-0 text-xs text-slate-500">{n.ledgers} ledger{n.ledgers === 1 ? '' : 's'}</span>
          <span className="w-36 shrink-0 text-right tabular-nums text-slate-600">{amt(n.closing)}</span>
        </button>
        {isOpen && n.children.length > 0 && <ul>{n.children.map((c) => render(c, `${path}/${c.name}`, depth + 1))}</ul>}
      </li>
    );
  };

  const nHang = data.hanging.length;
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-card" aria-labelledby="tree-h">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
        <h2 id="tree-h" className="text-sm font-semibold text-slate-900">Chart of accounts <span className="ml-1 font-normal text-slate-600">{data.summary.groups} groups · {data.summary.ledgers} ledgers{data.tbPeriod ? ` · closings ${data.tbPeriod}` : ' · no closings'}</span></h2>
        <SegmentedControl size="sm" aria-label="Ledgers to show" value={onlyHanging ? 'hanging' : 'all'} onChange={(v) => setMode(v as 'hanging' | 'all')}
          options={[{ id: 'hanging', label: `Hanging ${nHang}` }, { id: 'all', label: 'All ledgers' }]} />
        <InfoTip label="How to move a ledger">
          <ol className="list-decimal space-y-1 pl-4">
            <li>In TallyPrime, press Alt+G. Select Alter → Ledger.</li>
            <li>Pick the ledger. Change <b>Under</b> to the group in “Move to”.</li>
            <li>Press Ctrl+A to save. Old vouchers move with the ledger.</li>
            <li>Select Pull Tally now on this page.</li>
          </ol>
          <p>The MIS never writes to Tally.</p>
        </InfoTip>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a group or ledger" aria-label="Find in chart" className="min-h-11 sm:min-h-9 w-full max-w-xs rounded-lg border border-slate-300 px-3 text-sm" />
        {!onlyHanging && <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => expandAll(true)} className="min-h-11 sm:min-h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">Expand all</button>
          <button type="button" onClick={() => expandAll(false)} className="min-h-11 sm:min-h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">Collapse</button>
        </div>}
      </div>
      {onlyHanging && nHang > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-3 py-2">
          {(['all', 'channel_mismatch', 'no_group', 'catch_all', 'legacy'] as const).map((k) => {
            const n = k === 'all' ? nHang : data.summary!.byKind[k];
            if (k !== 'all' && !n) return null;
            return <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
              className={cx('min-h-11 sm:min-h-8 rounded-full border px-3 text-xs', kind === k ? 'border-accent-500 bg-accent-50 font-medium text-accent-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
              {k === 'all' ? 'All' : KIND[k]} {n}</button>;
          })}
        </div>
      )}
      {onlyHanging && nHang === 0
        ? <p className="px-4 py-6 text-center text-sm text-slate-600">No hanging ledgers. Each ledger is in its correct group.</p>
        : <ul className="max-h-[60vh] overflow-auto py-1">{data.tree.map((n) => render(n, n.name, 0))}</ul>}
    </section>
  );
}
