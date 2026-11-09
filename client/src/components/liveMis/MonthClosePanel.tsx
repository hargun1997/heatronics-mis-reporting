// ----------------------------------------------------------------------------
// Live MIS — the month's close status, its ties to Tally, and "Close & lock".
//
// Only a manually locked month (or frozen legacy history) counts as closed for
// the MIS's "complete through" floor. A month with a Tally P&L that booked sales
// is "ready to close"; the tie table shows what the connectors saw against
// Tally's own figures, and locking a month that is off by more than 1% of
// revenue asks for a written reason (kept in the audit trail).
// ----------------------------------------------------------------------------

import { useState } from 'react';
import { inr } from '../mis-deck/format';
import { monthLabel } from '../../data/misDeck/liveAnalytics';
import { setMonthLock, type PeriodCompleteness } from '../../data/misDeck/liveDeck';
import { TIE_LIMIT_PCT, type ChannelTie } from '../../data/misDeck/closeTies';

const BASIS_TXT: Record<NonNullable<ChannelTie['netBasis']>, string> = {
  reported: 'ex-GST as reported',
  booked: 'as booked (settlement / invoice)',
  estimated: 'estimated ex-GST (18%)',
};

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function MonthClosePanel({ periodKey, comp, onChanged }: { periodKey: string; comp: PeriodCompleteness | undefined; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<null | 'lock' | 'unlock'>(null);
  const [reason, setReason] = useState('');
  if (!comp) return null;

  const tie = comp.tie;
  const lock = comp.manualLock;
  const legacy = !!comp.locked;
  const breach = !!tie?.breach;

  const run = async (action: 'lock' | 'unlock', text?: string) => {
    setBusy(true); setError(null);
    const r = await setMonthLock(periodKey, action === 'lock'
      ? { action, worstResidualPct: tie?.worstResidualPct ?? null, overrideReason: breach ? text : undefined }
      : { action, reason: text });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Could not save.'); return; }
    setAsking(null); setReason('');
    onChanged();
  };
  const onLock = () => (breach ? setAsking('lock') : void run('lock'));

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-semibold text-slate-900">{monthLabel(periodKey)} close</span>
        {legacy ? (
          <span className="text-slate-500">Frozen history — closed.</span>
        ) : lock ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
            Closed &amp; locked by {lock.lockedBy}{lock.verifiedUser ? '' : ' (unverified name)'} · {when(lock.lockedAt)}
          </span>
        ) : comp.ready ? (
          <span className="text-brand-700 font-medium">Ready to close — Tally P&amp;L is in with sales booked; not counted as closed until locked.</span>
        ) : (
          <span className="text-amber-700">Not ready to close — {comp.hasTally ? 'Tally booked no sales for this month yet.' : 'waiting for the Tally P&L.'}</span>
        )}
        {tie && (
          <button type="button" onClick={() => setOpen(!open)} className="text-brand-600 hover:underline">
            {open ? 'Hide tie to Tally' : `Tie to Tally${tie.worstResidualPct !== null ? ` · worst ${tie.worstResidualPct.toFixed(1)}%` : ''}`}
          </button>
        )}
        {breach && !lock && <span className="text-amber-700">Over {TIE_LIMIT_PCT}% of revenue: {tie!.breaches.join('; ')}</span>}
        <span className="sm:ml-auto flex gap-2">
          {!legacy && lock && (
            <button type="button" disabled={busy} onClick={() => setAsking('unlock')} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">Unlock</button>
          )}
          {!legacy && !lock && comp.ready && (
            <button type="button" disabled={busy} onClick={onLock} className="px-3 py-1.5 rounded-lg bg-cta text-on-cta font-medium disabled:opacity-50">Close &amp; lock {monthLabel(periodKey)}</button>
          )}
        </span>
      </div>

      {lock?.overrideReason && <p className="text-amber-700">Locked over the 1% limit — reason: {lock.overrideReason}</p>}

      {asking && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <p className="text-slate-700">
            {asking === 'lock'
              ? `This month is off Tally by more than ${TIE_LIMIT_PCT}% of revenue (${tie?.breaches.join('; ')}). Say why it is still closed.`
              : `Unlock ${monthLabel(periodKey)}? It stops counting as closed, and so does every later month. Optional reason:`}
          </p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" placeholder={asking === 'lock' ? 'Reason (required)' : 'Reason'} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || (asking === 'lock' && !reason.trim())} onClick={() => void run(asking, reason)} className="px-3 py-1.5 rounded-lg bg-cta text-on-cta font-medium disabled:opacity-50">
              {asking === 'lock' ? 'Lock anyway' : 'Unlock'}
            </button>
            <button type="button" onClick={() => { setAsking(null); setReason(''); }} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700">Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="text-red-700">{error}</p>}

      {open && tie && (
        <div className="space-y-2 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-3 font-medium">Tie</th>
                <th className="py-1 pr-3 font-medium text-right">Connectors ex-GST</th>
                <th className="py-1 pr-3 font-medium text-right">GMV incl. GST</th>
                <th className="py-1 pr-3 font-medium text-right">Tally (ex-GST)</th>
                <th className="py-1 pr-3 font-medium text-right">Residual</th>
                <th className="py-1 font-medium text-right">% of revenue</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-t border-slate-100">
                <td className="py-1 pr-3 text-slate-700">Net profit — MIS vs Tally’s Nett Profit</td>
                <td className="py-1 pr-3 text-right">{inr(tie.profit.misProfit)}</td>
                <td className="py-1 pr-3 text-right text-slate-300">–</td>
                <td className="py-1 pr-3 text-right">{tie.profit.tallyNett === null ? 'not given' : inr(tie.profit.tallyNett)}</td>
                <td className="py-1 pr-3 text-right">{tie.profit.residual === null ? '–' : inr(tie.profit.residual, { sign: true })}</td>
                <td className="py-1 text-right">{pctOf(tie.profit.residual, tie.netRevenue)}</td>
              </tr>
              {tie.channels.map((c) => (
                <tr key={c.channel} className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-700">
                    {c.channel} sales
                    <span className="block text-[11px] text-slate-400">{c.sources.length ? `${c.sources.join(', ')} · ${c.netBasis ? BASIS_TXT[c.netBasis] : ''}` : 'no connector — Tally only'}</span>
                  </td>
                  <td className="py-1 pr-3 text-right">{c.net === null ? '–' : inr(c.net)}</td>
                  <td className="py-1 pr-3 text-right">{c.gmv === null ? '–' : inr(c.gmv)}</td>
                  <td className="py-1 pr-3 text-right">{inr(c.tally)}</td>
                  <td className="py-1 pr-3 text-right">{c.residual === null ? '–' : inr(c.residual, { sign: true })}</td>
                  <td className="py-1 text-right">{pctOf(c.residual, tie.netRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-slate-500">
            Tally books sales ex-GST and net of returns; connector sales are by order date, so a timing or returns gap shows as a residual.
            Residuals above {TIE_LIMIT_PCT}% of net revenue ({inr(tie.netRevenue)}) ask for a reason before the month can be locked.
          </p>
        </div>
      )}

      {(comp.bom || comp.factoryBasis) && (
        <p className="text-slate-500">
          {comp.bom && <>COGS priced with {comp.bom.exact ? <span className="text-slate-700">{comp.bom.note}</span> : <span className="text-amber-700">{comp.bom.note}</span>}. </>}
          {comp.factoryBasis && (comp.factoryBasis === 'tally' ? 'Factory overhead is Tally’s booked amount.' : 'Factory overhead is the 10%-of-revenue fallback (no Tally actual for this month).')}
        </p>
      )}
    </div>
  );
}

function pctOf(v: number | null, base: number): string {
  if (v === null || !base) return '–';
  return `${((Math.abs(v) / Math.abs(base)) * 100).toFixed(1)}%`;
}
