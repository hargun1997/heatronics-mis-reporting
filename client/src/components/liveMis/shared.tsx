// ----------------------------------------------------------------------------
// Live MIS — shared view plumbing: the page-level view context (channel
// naming, COGM basis Actual|Normalised), foldable sections that respect the global compact
// density, and the small toggles / badges every Live tab uses. Direction is
// carried by the arrow, not by red/green (the legacy deck's rule).
// ----------------------------------------------------------------------------

/* eslint-disable react-refresh/only-export-components */
import { Children, createContext, isValidElement, useContext, useState, type ReactElement, type ReactNode } from 'react';
import { ChevronDownIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { Popover } from '../ui/overlays';
import { readFold, writeFold } from '../../hooks/useDensity';
import { CHANNEL_COLORS, CHART, pctSigned } from '../mis-deck/format';
import type { CompletenessLevel } from '../../data/misDeck/liveDeck';
import { channelName } from '../../data/misDeck/liveViews';

// ---- View context ----------------------------------------------------------

export type CogmBasis = 'actual' | 'normalised';

export interface LiveView {
  /** Continuous channel taxonomy (OEM→B2B, Offline→GT) is on. */
  merged: boolean;
  /** COGM basis: 'actual' (as booked in Tally) or 'normalised' (BOM cost of units sold + factory overhead). */
  basis: CogmBasis;
  setBasis: (b: CogmBasis) => void;
  /** The normalised basis's explanation + which months stay as booked (normaliseLiveMonths().note). */
  basisNote: string;
}

const LiveViewCtx = createContext<LiveView>({ merged: true, basis: 'actual', setBasis: () => {}, basisNote: '' });
export const LiveViewProvider = LiveViewCtx.Provider;
export function useLiveView(): LiveView & { chName: (ch: string) => string; chColor: (ch: string) => string } {
  const v = useContext(LiveViewCtx);
  return { ...v, chName: (ch) => channelName(ch, v.merged), chColor: (ch) => channelColor(ch, v.merged) };
}

// Channel colours: the legacy palette plus the channels it doesn't name. With
// the continuous taxonomy on, B2B (OEM) keeps OEM's blue and GT (Offline)
// keeps Offline's violet so the history reads as one line.
const EXTRA: Record<string, string> = { Flipkart: CHART.c4, GT: CHART.c3, B2B: CHART.c2 };
export function channelColor(ch: string, merged: boolean): string {
  if (merged && ch === 'B2B') return CHANNEL_COLORS.OEM;
  if (merged && ch === 'GT') return CHANNEL_COLORS.Offline;
  return CHANNEL_COLORS[ch] ?? EXTRA[ch] ?? CHART.cmp;
}
export const VERTICAL_COLORS: Record<string, string> = {
  D2C: CHART.ink, Ecommerce: CHART.heat, 'Quick Commerce': CHART.c4, GT: CHART.c3, B2B: CHART.c2, Export: CHART.c5, Company: CHART.cmp,
};

// ---- Foldable section (Tasks / Handbook style) -----------------------------

/**
 * A titled, foldable block. Remembers open/closed per browser; in the global
 * compact density sections used to start folded; now every section starts open (legacy parity).
 */
export function Fold({
  id, title, meta, actions, children,
}: {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  /** Kept for callers; every section now starts open. */
  secondary?: boolean;
  /** Short label when this block is one view inside <Views>. */
  tab?: string;
  children: ReactNode;
}) {
  const key = `livemis:${id}`;
  // Every section starts open (as the legacy deck showed everything); a fold the viewer chose is remembered.
  const [open, setOpen] = useState(() => readFold(key, true));
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
          {meta != null && <p className="sm:hidden text-xs sm:text-[11px] text-slate-400 mb-2">{meta}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

// ---- One card, many views (simplification, 11 Nov 2026) ---------------------
//
// Wrap a stack of <Fold> blocks in <Views>: the page shows ONE of them at a time, picked with pills, in place of a
// long column of charts. Each Fold keeps its id / title / meta / actions; `tab` gives the short pill label.

type FoldProps = { id: string; title: ReactNode; meta?: ReactNode; actions?: ReactNode; tab?: string; children: ReactNode };

export function Views({ id, label = 'View', children }: { id: string; label?: string; children: ReactNode }) {
  const folds = Children.toArray(children).filter((c): c is ReactElement<FoldProps> => isValidElement(c) && !!(c.props as Partial<FoldProps>).id);
  const key = `livemis:views:${id}`;
  const [pick, setPick] = useState<string>(() => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } });
  if (folds.length === 0) return null;
  const cur = folds.find((f) => f.props.id === pick) ?? folds[0];
  const choose = (v: string) => { setPick(v); try { localStorage.setItem(key, v); } catch { /* private mode */ } };
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-3 py-2">
        <div role="group" aria-label={label} className="flex max-w-full flex-wrap gap-1">
          {folds.map((f) => {
            const on = f === cur;
            return (
              <button key={f.props.id} type="button" aria-pressed={on} onClick={() => choose(f.props.id)}
                className={`min-h-11 sm:min-h-8 rounded-full border px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500 ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'}`}>
                {f.props.tab ?? f.props.title}
              </button>
            );
          })}
        </div>
        {cur.props.meta != null && <span className="hidden min-w-0 flex-1 truncate text-xs text-slate-500 lg:inline">{cur.props.meta}</span>}
        {cur.props.actions && <div className="ml-auto flex flex-wrap items-center gap-2">{cur.props.actions}</div>}
      </div>
      <div className="px-3 py-3 sm:px-4">{cur.props.children}</div>
    </section>
  );
}

// ---- Top-level tab section (Live MIS five-tab layout, founder 5 Nov 2026) ---
//
// Each Live MIS tab is a stack of these: a card with a title, a one-line meta
// and a chevron; the body renders only when open. Open / closed is remembered
// per section in ONE localStorage key (`mis-live-folds-v1`, a JSON map), so a
// reset is one key. Defaults come from the caller (first section of a tab open).

const SECTION_KEY = 'mis-live-folds-v1';
function readSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? (v as Record<string, boolean>) : {};
  } catch { return {}; }
}
function writeSection(id: string, open: boolean) {
  try { localStorage.setItem(SECTION_KEY, JSON.stringify({ ...readSections(), [id]: open })); } catch { /* private mode */ }
}

export function Section({ id, title, meta, defaultOpen = false, actions, children }: {
  id: string;
  title: ReactNode;
  /** One line under the title: what the section holds / its scope. */
  meta?: ReactNode;
  defaultOpen?: boolean;
  /** Shown in the header while open (toggles, small buttons). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readSections()[id] ?? defaultOpen);
  const flip = () => { setOpen(!open); writeSection(id, !open); };
  const bodyId = `section-${id}`;
  return (
    <section className="rounded-xl border border-slate-200 bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <h2 className="flex min-w-0 flex-1"><button type="button" onClick={flip} aria-expanded={open} aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left rounded-lg -mx-1 px-1 py-1 hover:bg-slate-50 focus-visible:ring-2 ring-accent-500 outline-none">
          <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? '' : '-rotate-90'}`} aria-hidden />
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
            <span className="text-[15px] font-semibold leading-6 text-slate-900">{title}</span>
            {meta != null && <span className="min-w-0 truncate text-xs text-slate-500">{meta}</span>}
          </span>
        </button></h2>
        {open && actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {open && <div id={bodyId} className="border-t border-slate-200 px-4 py-4">{children}</div>}
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
          className={`px-2.5 py-1 min-h-10 sm:min-h-0 text-xs font-medium rounded-md transition-colors whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
            value === o.id ? 'bg-white font-semibold text-slate-900 shadow-soft' : 'text-slate-500 hover:text-slate-800'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const BASIS_OPTIONS: { id: CogmBasis; label: string }[] = [{ id: 'actual', label: 'Actual' }, { id: 'normalised', label: 'Normalised' }];

/** The COGM basis switch (Actual | Normalised) as header pills — the one switch the P&L and Overview headline share. */
export function CogmBasisToggle() {
  const { basis, setBasis } = useLiveView();
  return <Pills label="COGM basis" value={basis} onChange={setBasis} options={BASIS_OPTIONS} />;
}

/** One-line explanation of the Normalised basis + the months kept as booked. Shown only when Normalised is on. */
export function CogmBasisNote() {
  const { basis, basisNote } = useLiveView();
  if (basis !== 'normalised' || !basisNote) return null;
  return <span data-testid="basis-note"><Note label="What Normalised means">{basisNote}</Note></span>;
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
      className="inline-flex items-center px-1.5 py-0.5 rounded border text-xs sm:text-[11px] font-medium bg-brand-50 text-brand-700 border-brand-100">Published</span>;
  }
  const b = LEVEL_BADGE[level];
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-xs sm:text-[11px] font-medium ${b.cls}`}>{b.label}</span>;
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

/** A note about a chart or table. It opens from a small "Note" button so the page shows numbers, not paragraphs. */
export function Note({ children, label = 'Note' }: { children: ReactNode; label?: string }) {
  return (
    <Popover align="left" width={360}
      buttonClassName="inline-flex min-h-11 sm:min-h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      button={<><InformationCircleIcon className="h-4 w-4" aria-hidden />{label}</>}>
      <div className="max-h-[60vh] overflow-y-auto p-3.5 text-[13px] leading-5 text-slate-700">{children}</div>
    </Popover>
  );
}

/** Table shell: scrolls in its own box (never the page) with a sticky first column. */
export function TableBox({ children, label = 'Table, scroll sideways for more' }: { children: ReactNode; label?: string }) {
  // Focusable so keyboard users can scroll it too (axe scrollable-region-focusable).
  return <div tabIndex={0} role="region" aria-label={label} className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">{children}</div>;
}
