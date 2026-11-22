// StatusPill — THE pill (UI pass, 22 Nov 2026: 25 hand-made pills moved here). A status word with an optional dot,
// a count next to a title (CountPill), or the look for a pill that is a button or a popover trigger (pillClass).
// Tones chosen for 4.5:1 text contrast; colour always comes with a word.

import React from 'react';

import { PILL_TONE, type PillTone } from './pill';

export type { PillTone } from './pill';

const SIZE = { md: 'px-2.5 py-0.5', sm: 'px-2 py-px' } as const;

interface StatusPillProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  children: React.ReactNode;
  toneName?: PillTone;
  dot?: boolean;
  size?: keyof typeof SIZE;
}

export function StatusPill({ children, toneName = 'neutral', dot = false, size = 'md', className = '', ...rest }: StatusPillProps) {
  const t = PILL_TONE[toneName];
  return (
    <span {...rest} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border text-xs font-semibold ${SIZE[size]} ${t.wrap} ${className}`}>
      {dot && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}

/** A count beside a title ("Do these first 12"). No border, tabular digits. */
export function CountPill({ n, className = '' }: { n: number | string; className?: string }) {
  return <span className={`rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700 ${className}`}>{n}</span>;
}
