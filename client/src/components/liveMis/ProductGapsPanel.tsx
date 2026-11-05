// Live MIS → products that need a decision: sales no product map knows (B2B Tranzact items, Meta product ids) and
// products that sell with no BOM. Each row shows the ₹ and the closest match by name; one click confirms it
// (stored: POST /api/mis/product-map) and the deck reloads. Nothing is applied until confirmed.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LiveDeckData } from '../../data/misDeck/liveDeck';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const btn = 'rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

export function ProductGapsPanel({ gaps, onChanged }: { gaps: NonNullable<LiveDeckData['productGaps']>; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Collapsed by default (founder, 5 Nov 2026: the list was pushing the MIS below the fold); the same items sit in Tasks → Fix.
  const [open, setOpen] = useState(false);
  const um = gaps.unmapped, nb = gaps.noBom.filter((b) => !b.proxyConfirmed);
  if (!um.length && !nb.length) return null;
  const save = async (id: string, body: object) => {
    setBusy(id); setErr(null);
    try {
      const r = await fetch('/api/mis/product-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `${r.status}`);
      onChanged();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const norm = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return (
    <section aria-label="Products needing a decision" className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <h3 className="text-sm font-semibold text-slate-900">Products needing a decision</h3>
        <span className="text-slate-600">
          {um.length ? <>{um.length} unmapped item{um.length === 1 ? '' : 's'} ({inr(um.reduce((s, u) => s + u.revenue, 0))} of sales)</> : null}
          {um.length && nb.length ? ' · ' : ''}
          {nb.length ? <>{nb.length} product{nb.length === 1 ? '' : 's'} with no BOM ({inr(nb.reduce((s, b) => s + b.revenue, 0))}, margin estimated)</> : null}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Link to="/tasks?view=fix" className="font-medium text-accent-700 hover:underline">Also in Tasks → Fix</Link>
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={btn}>{open ? 'Hide' : 'Review here'}</button>
        </span>
      </div>
      {open && <p className="text-xs text-slate-600">Each row shows the closest product by name; one click confirms the mapping (nothing is applied until confirmed). Until then an unmapped item is left out of product margins and a no-BOM product is costed from its closest product, never at 100%.</p>}
      {err && <p role="alert" className="text-xs text-rose-700">{err}</p>}
      {open && um.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th className="py-1 pr-2">Item</th><th className="pr-2">From</th><th className="pr-2 text-right">Sales</th><th>Closest products (confirm one)</th></tr></thead>
          <tbody>{um.slice(0, 40).map((u) => (
            <tr key={`${u.platform}|${u.key}`} className="border-t border-amber-100 align-top">
              <td className="py-1 pr-2 text-slate-800">{u.name}<span className="block text-[11px] text-slate-400">{u.key}</span></td>
              <td className="pr-2 text-slate-600">{u.kind === 'meta' ? 'Meta' : u.kind === 'b2b' ? 'B2B / Tranzact' : u.platform}</td>
              <td className="pr-2 text-right tabular-nums">{inr(u.revenue)}</td>
              <td className="space-x-1 space-y-1">{u.suggestions.length ? u.suggestions.map((s) => (
                <button key={s.fgId} type="button" disabled={busy !== null} className={btn} title={`${s.tranzactName} · match ${Math.round(s.score * 100)}%`}
                  onClick={() => void save(`${u.platform}|${u.key}`, { sku: { [`${u.platform}:${norm(u.key)}`]: s.fgId } })}>
                  {s.deckName} <span className="text-slate-400">{Math.round(s.score * 100)}%</span></button>))
                : <span className="text-slate-400">No close match — map it in Month close.</span>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      {open && nb.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th className="py-1 pr-2">No BOM for</th><th className="pr-2 text-right">Sales</th><th>Use the BOM of</th></tr></thead>
          <tbody>{nb.slice(0, 40).map((b) => (
            <tr key={b.fgId} className="border-t border-amber-100">
              <td className="py-1 pr-2 text-slate-800">{b.fgId} · {b.deckName}</td>
              <td className="pr-2 text-right tabular-nums">{inr(b.revenue)}</td>
              <td>{b.suggested ? (
                <button type="button" disabled={busy !== null} className={btn} onClick={() => void save(b.fgId, { bomProxy: { [b.fgId]: b.suggested!.fgId } })}>
                  {b.suggested.deckName} ({b.suggested.fgId}) <span className="text-slate-400">{Math.round(b.suggested.score * 100)}%</span></button>
              ) : <span className="text-slate-400">No close costed product — add the BOM in Tranzact.</span>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </section>
  );
}
