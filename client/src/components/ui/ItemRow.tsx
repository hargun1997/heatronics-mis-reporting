// ItemRow — the one numbered row for "things to do" (UI pass, 22 Nov 2026): step disc · title · step 1 · amount ·
// pill · action. Today's "Do these first", the Live MIS lock list and other to-do lists use it, so a Fix item looks
// the same wherever it shows. A Fix how-to is cut to its first step (the full steps open on the item).
import React from 'react';
import { Link } from 'react-router-dom';
import { StepNo } from './states';

export function ItemRow({ n, title, sub, amount, pill, action, href, onClick, compact }: {
  n?: number; title: React.ReactNode; sub?: React.ReactNode; amount?: React.ReactNode; pill?: React.ReactNode;
  action?: React.ReactNode; href?: string; onClick?: () => void; compact?: boolean;
}) {
  const body = (
    <>
      {n != null && <StepNo n={n} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900">{title}</span>
        {sub && <span className="block truncate text-xs text-slate-600" title={typeof sub === 'string' ? sub : undefined}>{sub}</span>}
      </span>
      {amount != null && <span className="shrink-0 text-sm tabular-nums text-slate-700">{amount}</span>}
      {pill && <span className="shrink-0">{pill}</span>}
    </>
  );
  const cls = `flex ${compact ? 'min-h-11 py-1.5' : 'min-h-14 py-2'} items-center gap-3 px-4`;
  const focus = 'hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500';
  return (
    <li className={action ? `${cls} ` : ''}>
      {href ? <Link to={href} className={action ? `flex min-w-0 flex-1 items-center gap-3 ${focus}` : `${cls} ${focus}`}>{body}</Link>
        : onClick ? <button type="button" onClick={onClick} className={`${action ? 'flex min-w-0 flex-1 items-center gap-3' : cls} w-full text-left ${focus}`}>{body}</button>
        : <div className={action ? 'flex min-w-0 flex-1 items-center gap-3' : cls}>{body}</div>}
      {action && <span className="shrink-0">{action}</span>}
    </li>
  );
}
