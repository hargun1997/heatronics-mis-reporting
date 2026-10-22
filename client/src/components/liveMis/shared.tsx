// ----------------------------------------------------------------------------
// Live MIS — shared view plumbing: the page-level view context (channel
// naming, Actual|Blended), foldable sections that respect the global compact
// density, and the small toggles / badges every Live tab uses. Direction is
// carried by the arrow, not by red/green (the legacy deck's rule).
// ----------------------------------------------------------------------------

/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { readFold, writeFold, useDensity } from '../../hooks/useDensity';
import { CHANNEL_COLORS, pctSigned } from '../mis-deck/charts';
import type { CompletenessLevel } from '../../data/misDeck/liveDeck';
import { blendRatesNote, channelName } from '../../data/misDeck/liveViews';

// ---- View context ----------------------------------------------------------

export interface LiveView {
  /** Continuous channel taxonomy (OEM→B2B, Offline→GT) is on. */
  merged: boolean;
  /** FY-blended COGM is on (else actual). */
  blended: boolean;
  setBlended: (b: boolean) => void;
  /** Per-FY blended GM% rates (legacy keys "FY 2025-26"). */
  rates: Map<string, number>;
}

const LiveViewCtx = createContext<LiveView>({ merged: true, blended: false, setBlended: () => {}, rates: new Map() });
export const LiveViewProvider = LiveViewCtx.Provider;
export function useLiveView(): LiveView & { chName: (ch: string) => string; chColor: (ch: string) => string } {
  const v = useContext(LiveViewCtx);
  return { ...v, chName: (ch) => channelName(ch, v.merged), chColor: (ch) => channelColor(ch, v.merged) };
}

// Channel colours: the legacy palette plus the channels it doesn't name. With
// the continuous taxonomy on, B2B (OEM) keeps OEM's blue and GT (Offline)
// keeps Offline's violet so the history reads as one line.
const EXTRA: Record<string, string> = { Flipkart: '#1D4ED8', GT: '#0F766E', B2B: '#9333EA' };
export function channelColor(ch: string, merged: boolean): string {
  if (merged && ch === 'B2B') return CHANNEL_COLORS.OEM;
  if (merged && ch === 'GT') return CHANNEL_COLORS.Offline;
  return CHANNEL_COLORS[ch] ?? EXTRA[ch] ?? '#94a3b8';
}
export const VERTICAL_COLORS: Record<string, string> = {
  D2C: '#0E7490', Ecommerce: '#D97706', 'Quick Commerce': '#475569', GT: '#7C3AED', B2B: '#2563EB', Export: '#DB2777', Company: '#94a3b8',
};

// ---- Foldable section (Tasks / Handbook style) -----------------------------

/**
 * A titled, foldable block. Remembers open/closed per browser; in the global
 * compact density, secondary sections (`secondary`) start folded.
 */
export function Fold({
  id, title, meta, actions, secondary = false, children,
}: {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  secondary?: boolean;
  children: ReactNode;
}) {
  const [density] = useDensity();
  const key = `livemis:${id}`;
  const [open, setOpen] = useState(() => readFold(key, !(secondary && density === 'compact')));
  const flip = () => { setOpen(!open); writeFold(key, !open); };
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2.5">
        <button type="button" onClick={flip} aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left rounded-md hover:bg-slate-50 -mx-1 px-1 py-0.5">
          <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? '' : '-rotate-90'}`} />
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          {meta != null && <span className="hidden sm:inline text-xs text-slate-400 truncate">{meta}</span>}
        </button>
        {open && actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {open && (
        <div className="border-t border-slate-100 px-3 sm:px-4 py-3">
          {meta != null && <p className="sm:hidden text-[11px] text-slate-400 mb-2">{meta}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

// ---- Toggles ---------------------------------------------------------------

/** Compact pill toggle (slate track, white chip) — used inside section headers. */
export function Pills<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label?: string;
}) {
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            value === o.id ? 'bg-white text-brand-700 shadow-soft' : 'text-slate-500 hover:text-slate-800'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BlendToggle() {
  const { blended, setBlended } = useLiveView();
  return (
    <Pills label="COGM basis" value={blended ? 'b' : 'a'} onChange={(v) => setBlended(v === 'b')}
      options={[{ id: 'a', label: 'Actual' }, { id: 'b', label: 'Blended' }]} />
  );
}

/** Explains the Blended view and lists the per-FY rates. Shown when Blended is on. */
export function BlendNote() {
  const { blended, rates } = useLiveView();
  if (!blended) return null;
  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-slate-600">
      <span className="font-medium text-brand-700">Blended COGM (FY-level).</span> COGM is booked on purchase/consumption
      timing, so monthly gross margin is noisy. This view restates each month’s COGM to its fiscal year’s revenue-weighted
      GM% (in proportion to that month’s revenue) and cascades the change through CM1–Net Income; channel, marketing,
      platform, opex and non-operating stay as booked. Full fiscal years are unchanged. Only months whose COGM is real
      (to CM2 or a full close) are blended or used for the rate.
      <span className="block mt-1 text-slate-500">Blended GM% by FY: {blendRatesNote(rates) || '—'}</span>
    </div>
  );
}

// ---- Badges & chips --------------------------------------------------------

const LEVEL_BADGE: Record<CompletenessLevel, { label: string; cls: string }> = {
  full: { label: 'Full close', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  contribution: { label: 'To CM2', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  topline: { label: 'Top line', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/** Completeness badge. `published` marks a month shown from the published static MIS. */
export function LevelBadge({ level, published }: { level: CompletenessLevel; published?: boolean }) {
  if (published && level === 'full') {
    return <span title="From the published MIS — no full live close for this month yet"
      className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium bg-brand-50 text-brand-700 border-brand-100">Published</span>;
  }
  const b = LEVEL_BADGE[level];
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${b.cls}`}>{b.label}</span>;
}

/** ▲/▼ growth, coloured brand (up) / slate (down) — never red/green. */
export function Delta({ value, suffix }: { value: number | null | undefined; suffix?: string }) {
  if (value == null || !isFinite(value)) return <span className="text-slate-400">–</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${up ? 'text-brand-700' : 'text-slate-500'}`}>
      {up ? '▲' : '▼'} {pctSigned(value)}{suffix}
    </span>
  );
}

/** Growth vs another period — only when both cover the same number of months (fair frames). */
export function fairGrowth(cur: { v: number; n: number }, other: { v: number; n: number } | null | undefined): number | null {
  if (!other || other.n !== cur.n || !other.v) return null;
  return (cur.v - other.v) / Math.abs(other.v);
}

/** Small "muted" placeholder for a number that isn't real yet. */
export const ND = <span className="text-slate-300">—</span>;

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-slate-400">{children}</p>;
}

/** Table shell: scrolls in its own box (never the page) with a sticky first column. */
export function TableBox({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">{children}</div>;
}
