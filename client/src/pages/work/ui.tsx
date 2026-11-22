// Small shared pieces for the Tasks pages: page header, avatar, checkbox,
// collapsible section, and field styles.

import { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Check as CheckIcon, ChevronDown as ChevronDownIcon } from 'lucide-react';
import type { TeamMember } from '../../data/work/workClient';
import { readFold, writeFold } from '../../hooks/useDensity';
import { avatarTone, initials } from './taskModel';
import { buttonClass } from '../../components/ui/Button';

export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2';

/** One-line page header: title + subtitle on the left, actions on the right. */
/** The Tasks pages use the shared page header (same title row, About popover and gutters as every page). */
export function TasksHeader({ title, sub, status, help, children }: { title: string; sub?: string; back?: { to: string; label: string }; status?: React.ReactNode; help?: React.ReactNode; children?: React.ReactNode }) {
  return <PageHeader title={title} description={sub} status={status} help={help} actions={children} />;
}

export function Avatar({ m, size = 'h-6 w-6 text-xs' }: { m: TeamMember; size?: string }) {
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
        <h2 className={`text-sm font-semibold ${tone === 'late' ? 'text-red-700' : 'text-slate-900'}`}>{title}</h2>
        {meta != null && <span className="text-sm text-slate-500">{meta}</span>}
      </button>
      {isOpen && <div className="mt-1.5">{children}</div>}
    </section>
  );
}

export const card = 'rounded-xl border border-slate-200 bg-white';
export const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';
export const lbl = 'mb-1 block text-sm font-semibold text-slate-800';
export const btnPrimary = buttonClass('primary');
export const btnSecondary = buttonClass('secondary');
export const btnGhost = buttonClass('secondary');
