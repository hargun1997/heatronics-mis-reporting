// Small shared pieces for the Tasks pages: page header, avatar, checkbox,
// collapsible section, and field styles.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import type { TeamMember } from '../../data/work/workClient';
import { readFold, writeFold } from '../../hooks/useDensity';
import { avatarTone, initials } from './taskModel';

export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1';

/** One-line page header: title + subtitle on the left, actions on the right. */
export function TasksHeader({ title, sub, back, children }: { title: string; sub?: string; back?: { to: string; label: string }; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
      {back && (
        <Link to={back.to} className={`mb-2 inline-flex items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-brand-700 ${focusRing}`}>
          <ArrowLeftIcon className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-slate-600">{sub}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

export function Avatar({ m, size = 'h-6 w-6 text-[12px]' }: { m: TeamMember; size?: string }) {
  return (
    <span title={`${m.name} · ${m.email}`} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${size} ${avatarTone(m.id)}`}>
      {initials(m.name)}
    </span>
  );
}

/** Big round-cornered tick box inside a 40px tap target. */
export function TickBox({ on, onClick, disabled, label, title, small }: { on: boolean; onClick: () => void; disabled?: boolean; label: string; title?: string; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on}
      title={title ?? label}
      className={`group -m-2 flex shrink-0 items-center justify-center rounded-lg p-2 disabled:cursor-default ${focusRing} ${small ? 'h-9 w-9' : 'h-10 w-10'}`}
    >
      <span
        className={`flex items-center justify-center rounded-md border-2 transition ${small ? 'h-5 w-5' : 'h-6 w-6'} ${
          on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 bg-white group-hover:border-brand-500 group-disabled:border-slate-300'
        }`}
      >
        {on && <CheckIcon className={small ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={3} />}
      </span>
    </button>
  );
}

/** A section with a clickable header that folds; open/closed is remembered per browser. */
export function Fold({
  id,
  title,
  meta,
  defaultOpen = true,
  forceOpen,
  tone = 'default',
  children,
  className = '',
}: {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  tone?: 'default' | 'late';
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(() => readFold(id, defaultOpen));
  const isOpen = forceOpen || open;
  const flip = () => {
    setOpen(!isOpen);
    writeFold(id, !isOpen);
  };
  return (
    <section className={className}>
      <button
        type="button"
        onClick={flip}
        aria-expanded={isOpen}
        className={`flex min-h-[40px] w-full items-center gap-2 rounded-lg px-1 text-left hover:bg-slate-100/70 ${focusRing}`}
      >
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-500 transition ${isOpen ? '' : '-rotate-90'}`} />
        <h2 className={`text-[15px] font-semibold ${tone === 'late' ? 'text-rose-700' : 'text-slate-900'}`}>{title}</h2>
        {meta != null && <span className="text-sm text-slate-500">{meta}</span>}
      </button>
      {isOpen && <div className="mt-1.5">{children}</div>}
    </section>
  );
}

export const card = 'rounded-xl border border-slate-200 bg-white';
export const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] text-slate-950 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';
export const lbl = 'mb-1 block text-sm font-semibold text-slate-800';
export const btnPrimary = `inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 ${focusRing}`;
export const btnSecondary = `inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-800 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 ${focusRing}`;
export const btnGhost = `inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50 ${focusRing}`;
