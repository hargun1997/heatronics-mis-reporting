// Tally health → "Ledger rules": which Tally ledgers feed Quick Commerce / Flipkart sales, Brand investment and Cost of
// fundraising (seed map + editable name-pattern rules), what matched, and what still needs the founder's eye.
// Rules: GET/PUT /api/tally/ledger-rules (stored as data). Matching: client/src/data/monthClose/ledgerRules.ts. Read only.
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_LEDGER_RULES, RULE_LINES, exactNameRule, ledgerRulesReport, sanitizeRules, type LedgerRule, type RuleLine } from '../../data/monthClose/ledgerRules';
import { exactLineOf } from '../../data/monthClose/ledgerMap';

interface Wire { rules: LedgerRule[] | null; ledgers: { name: string; group: string; primary: string }[]; pnl: { period: string; rows: { name: string; amount: number }[] }[]; narrations: { date: string; type: string; number: string; ledger: string; amount: number; narration: string }[]; mastersAt: string | null }
const inr = (n: number | null) => (n == null ? '' : `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`);
const label = (l: RuleLine) => RULE_LINES.find((x) => x.id === l)!.label;
const btn = 'rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

export function LedgerRulesCard() {
  const [w, setW] = useState<Wire | null>(null);
  const [rules, setRules] = useState<LedgerRule[]>(DEFAULT_LEDGER_RULES);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/tally/ledger-rules')
      .then((r) => r.json() as Promise<Wire>)
      .then((j) => { setW(j); setRules(j.rules?.length ? j.rules : DEFAULT_LEDGER_RULES); })
      .catch((e) => setMsg(e.message));
  }, []);

  const rep = useMemo(() => {
    if (!w) return null;
    const latest = w.pnl[w.pnl.length - 1];
    const fromMasters = w.ledgers.map((l) => ({ name: l.name, group: l.primary || l.group }));
    const fromPnl = (latest?.rows ?? []).map((r) => ({ name: r.name, amount: r.amount }));
    const amount = new Map(fromPnl.map((r) => [r.name.toLowerCase(), r.amount]));
    return ledgerRulesReport([...fromMasters.map((l) => ({ ...l, amount: amount.get(l.name.toLowerCase()) })), ...fromPnl], w.narrations, rules, (n) => exactLineOf(n));
  }, [w, rules]);

  const save = async (next: LedgerRule[], note: string) => {
    const { rules: clean } = sanitizeRules(next);
    const r = await fetch('/api/tally/ledger-rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: clean }) });
    if (!r.ok) { setMsg((await r.json().catch(() => ({}))).error || 'Could not save.'); return; }
    setRules(clean); setMsg(`${note} Reload Live MIS to see it in the numbers.`);
  };
  if (!w || !rep) return <p className="text-sm text-slate-500">{msg ?? 'Loading…'}</p>;
  const stale = !w.ledgers.length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Which Tally ledgers feed each MIS line. The seed map is exact; the rules below catch ledgers booked under other names. Read only: nothing here changes Tally.
        {stale && <span className="text-amber-800"> No ledger master stored yet (Pull Tally now): matching uses the latest P&amp;L rows only.</span>}</p>
      {msg && <p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{msg}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {RULE_LINES.map((l) => {
          const hits = rep.matched.filter((m) => m.line === l.id);
          return (
            <div key={l.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">{l.label} <span className="font-normal text-slate-500">· {hits.length} ledger{hits.length === 1 ? '' : 's'}{rep.byLine[l.id].total ? ` · ${inr(rep.byLine[l.id].total)}` : ''}</span></p>
              {hits.length === 0 ? <p className="text-xs text-amber-800">No ledger matched. {l.id === 'rev_blinkit' ? 'Quick Commerce will read 0.' : ''}</p>
                : <ul className="mt-1 space-y-0.5 text-xs text-slate-700">{hits.slice(0, 8).map((m) => <li key={m.name}>{m.name} <span className="text-slate-400">({m.via === 'map' ? 'seed map' : m.ruleId})</span> {inr(m.amount)}</li>)}</ul>}
            </div>);
        })}
      </div>
      <Review title="Sales ledgers no revenue line claims" empty="None: every sales ledger is placed.">
        {rep.unmatchedSales.slice(0, 40).map((u) => (
          <li key={u.name} className="flex flex-wrap items-center gap-2"><span className="text-slate-800">{u.name}</span><span className="text-slate-400">{u.group} {inr(u.amount ?? null)}</span>
            {(['rev_blinkit', 'rev_flipkart'] as RuleLine[]).map((l) => <button key={l} type="button" className={btn} onClick={() => void save([...rules, exactNameRule(u.name, l)], `${u.name} now feeds ${label(l)}.`)}>→ {label(l)}</button>)}</li>))}
      </Review>
      <Review title="Cost ledgers that may be brand investment or fundraising" empty="No candidates.">
        {rep.candidates.map((c) => (
          <li key={c.name} className="flex flex-wrap items-center gap-2"><span className="text-slate-800">{c.name}</span><span className="text-slate-400">{inr(c.amount ?? null)}</span>
            <button type="button" className={btn} onClick={() => void save([...rules, exactNameRule(c.name, c.line)], `${c.name} now feeds ${label(c.line)}.`)}>Yes → {label(c.line)}</button></li>))}
      </Review>
      <Review title="Voucher narrations that mention brand / fundraising (listed only: a ledger is never split by narration)" empty="None in the stored months.">
        {rep.narrations.map((n, i) => <li key={i} className="text-slate-700">{n.date} · {n.type} {n.number} · {n.ledger} · {inr(n.amount)} · <span className="text-slate-500">{n.narration}</span> <span className="text-slate-400">→ {label(n.line)}?</span></li>)}
      </Review>
      <details className="rounded-xl border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">Rule table ({rules.length})</summary>
        <ul className="mt-2 space-y-1 text-xs">{rules.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            <input type="checkbox" aria-label={`${r.id} enabled`} checked={r.enabled !== false} onChange={() => void save(rules.map((x, j) => (j === i ? { ...x, enabled: x.enabled === false } : x)), `${r.id} updated.`)} />
            <b>{label(r.line)}</b><code className="break-all text-slate-600">{r.pattern.slice(0, 120)}</code>{r.note && <span className="text-slate-400">{r.note}</span>}
            <button type="button" className={btn} onClick={() => void save(rules.filter((_, j) => j !== i), `${r.id} removed.`)}>Remove</button>
          </li>))}</ul>
        <button type="button" className={`${btn} mt-2`} onClick={() => void save(DEFAULT_LEDGER_RULES, 'Defaults restored.')}>Restore defaults</button>
      </details>
    </div>
  );
}

function Review({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {children.length ? <ul className="mt-1 space-y-1 text-xs">{children}</ul> : <p className="text-xs text-slate-500">{empty}</p>}
    </div>
  );
}
