// ----------------------------------------------------------------------------
// Live MIS — the month's close status, its ties to Tally, and "Close & lock".
//
// Only a manually locked month (or frozen legacy history) counts as closed for
// the MIS's "complete through" floor. A month is "ready to close" only when
// nothing blocks it (monthCompleteness.ts: full Tally, ties within 1%, closing
// stock posted, reports in, month over); otherwise the panel lists the exact
// blockers. Soft blockers (a tie gap, a report) can still be locked with a
// written reason (kept in the audit trail); hard ones cannot.
// ----------------------------------------------------------------------------

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../ui/overlays';
import { BTN, BTN_PRIMARY } from '../ui/states';
import { Note } from './shared';
import { inr } from '../mis-deck/format';
import { monthLabel } from '../../data/misDeck/liveAnalytics';
import { setMonthLock, type PeriodCompleteness } from '../../data/misDeck/liveDeck';
import { TIE_LIMIT_PCT, type ChannelTie } from '../../data/misDeck/closeTies';
import { gstRateLabel } from '../../data/misDeck/gstBasis';

const BASIS_TXT: Record<NonNullable<ChannelTie['netBasis']>, string> = {
  reported: 'ex-GST as reported',
  booked: 'as booked (settlement / invoice)',
  estimated: `estimated ex-GST (${gstRateLabel()})`,
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
  const blockers = comp.closeBlockers ?? [];
  // Soft blockers only (tie gap, a report) on a full Tally month: lockable, but only with a written reason.
  const canOverride = !comp.ready && comp.level === 'full' && comp.hasTally && blockers.length > 0 && blockers.every((b) => !b.hard);
  const needReason = breach || canOverride;

  const run = async (action: 'lock' | 'unlock', text?: string) => {
    setBusy(true); setError(null);
    const r = await setMonthLock(periodKey, action === 'lock'
      ? { action, worstResidualPct: tie?.worstResidualPct ?? null, overrideReason: needReason ? text : undefined }
      : { action, reason: text });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Could not save.'); return; }
    setAsking(null); setReason('');
    onChanged();
  };
  const onLock = () => (needReason ? setAsking('lock') : void run('lock'));

  const n = blockers.length;
  const status = legacy ? { tone: 'bg-slate-100 text-slate-700 border-slate-200', text: 'Locked (old history)' }
    : lock ? { tone: 'bg-emerald-50 text-emerald-800 border-emerald-200', text: `Locked by ${lock.lockedBy}${lock.verifiedUser ? '' : ' (name not verified)'}, ${when(lock.lockedAt)}` }
    : comp.ready ? { tone: 'bg-brand-50 text-brand-700 border-brand-100', text: 'Ready to lock' }
    : { tone: 'bg-amber-50 text-amber-800 border-amber-200', text: n ? `${n} to fix before lock` : comp.hasTally ? 'Tally has no sales for this month' : 'No Tally P&L for this month' };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-semibold text-slate-900">{monthLabel(periodKey)}</span>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.tone}`}>{status.text}</span>
        {tie && (
          <button type="button" onClick={() => setOpen(true)} className="min-h-11 sm:min-h-8 rounded-md px-1.5 text-xs font-medium text-brand-600 hover:underline">
            Check with Tally{tie.worstResidualPct !== null ? ` (largest difference ${tie.worstResidualPct.toFixed(1)}%)` : ''}
          </button>
        )}
        {(comp.bom || comp.factoryBasis || comp.exGstEstimated || lock?.overrideReason) && (
          <Note label="Cost basis">
            {lock?.overrideReason && <p>Locked with open items. Reason: {lock.overrideReason}</p>}
            {comp.exGstEstimated && <p>Sales without GST are an estimate for {comp.exGstEstimated.sources.join(', ')}: sales ÷ {(1 + comp.exGstEstimated.ratePct / 100).toFixed(2)} (GST {comp.exGstEstimated.ratePct}%).</p>}
            {comp.bom && <p>Cost of goods uses {comp.bom.note}.</p>}
            {comp.factoryBasis && <p>{comp.factoryBasis === 'tally' ? 'Factory overhead is the amount in Tally.' : 'Factory overhead is 10% of revenue. Tally has no amount for this month.'}</p>}
          </Note>
        )}
        <span className="sm:ml-auto flex gap-2">
          {!legacy && lock && (
            <button type="button" disabled={busy} onClick={() => setAsking('unlock')} className={BTN}>Unlock</button>
          )}
          {!legacy && !lock && comp.ready && (
            <button type="button" disabled={busy} onClick={onLock} className={BTN_PRIMARY}>Lock {monthLabel(periodKey)}</button>
          )}
          {!legacy && !lock && canOverride && (
            <button type="button" disabled={busy} onClick={onLock} className={BTN}>Lock with a reason</button>
          )}
        </span>
      </div>

      {!legacy && !lock && n > 0 && (
        <ol className="list-decimal space-y-0.5 pl-5 text-[13px] text-slate-700">
          {blockers.slice(0, 3).map((b, i) => (
            <li key={i}><span className={b.hard ? 'text-amber-700 font-medium' : 'text-slate-800'}>{b.text}</span> <span className="text-slate-500">{b.fix}</span></li>
          ))}
          {n > 3 && <li className="list-none"><Link to="/tasks?view=fix" className="font-medium text-brand-600 hover:underline">{n - 3} more in Tasks, Fix list</Link></li>}
        </ol>
      )}
      {error && <p role="alert" className="text-red-700">{error}</p>}

      <Modal open={!!asking} onClose={() => { setAsking(null); setReason(''); }}
        title={asking === 'lock' ? `Lock ${monthLabel(periodKey)} with open items?` : `Unlock ${monthLabel(periodKey)}?`}
        footer={<>
          <button type="button" onClick={() => { setAsking(null); setReason(''); }} className={BTN}>Cancel</button>
          <button type="button" disabled={busy || (asking === 'lock' && !reason.trim())} onClick={() => asking && void run(asking, reason)} className={BTN_PRIMARY}>
            {asking === 'lock' ? `Lock ${monthLabel(periodKey)}` : `Unlock ${monthLabel(periodKey)}`}
          </button>
        </>}>
        <div className="space-y-3 text-sm text-slate-700">
          {asking === 'lock'
            ? <><p>Open items: {blockers.map((b) => b.text).join(' ') || tie?.breaches.join('; ')}</p><p>Write the reason. The reason stays in the lock record.</p></>
            : <p>This month and each later month will not be locked. You can write a reason.</p>}
          <label className="block text-xs font-medium text-slate-600">Reason{asking === 'lock' ? ' (necessary)' : ''}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900" />
          </label>
          {error && <p role="alert" className="text-red-700">{error}</p>}
        </div>
      </Modal>

      {tie && (
        <Modal open={open} onClose={() => setOpen(false)} title={`${monthLabel(periodKey)}: check with Tally`} width={860}
          subtitle={`A difference above ${TIE_LIMIT_PCT}% of net revenue (${inr(tie.netRevenue)}) needs a reason before lock.`}>
          <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-3 font-medium">Tie</th>
                <th className="py-1 pr-3 font-medium text-right">Reports, no GST</th>
                <th className="py-1 pr-3 font-medium text-right">Sales with GST</th>
                <th className="py-1 pr-3 font-medium text-right">Tally, no GST</th>
                <th className="py-1 pr-3 font-medium text-right">Difference</th>
                <th className="py-1 font-medium text-right">% of net revenue</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-t border-slate-100">
                <td className="py-1 pr-3 text-slate-700">Net profit: MIS and Tally</td>
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
                    <span className="block text-xs sm:text-[11px] text-slate-400">{c.sources.length ? `${c.sources.join(', ')} · ${c.netBasis ? BASIS_TXT[c.netBasis] : ''}` : 'No connected report. Tally only.'}</span>
                  </td>
                  <td className="py-1 pr-3 text-right">{c.net === null ? '–' : inr(c.net)}</td>
                  <td className="py-1 pr-3 text-right">{c.gmv === null ? '–' : inr(c.gmv)}</td>
                  <td className="py-1 pr-3 text-right">{inr(c.tally)}</td>
                  <td className="py-1 pr-3 text-right">{c.residual === null ? '–' : inr(c.residual, { sign: true })}</td>
                  <td className="py-1 text-right">{c.judged === false ? 'Not checked (estimate)' : pctOf(c.residual, tie.netRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">Tally books sales without GST and after returns. Reports count sales on the order date. Thus timing and returns cause a difference.</p>
        </Modal>
      )}
    </div>
  );
}

function pctOf(v: number | null, base: number): string {
  if (v === null || !base) return '–';
  return `${((Math.abs(v) / Math.abs(base)) * 100).toFixed(1)}%`;
}
