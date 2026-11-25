// ----------------------------------------------------------------------------
// Live MIS — shared view plumbing: the page-level view context (channel
// naming, COGM basis Actual|Normalised), foldable sections that respect the global compact
// density, and the small toggles / badges every Live tab uses. Direction is
// carried by the arrow, not by red/green (the legacy deck's rule).
// ----------------------------------------------------------------------------

/* eslint-disable react-refresh/only-export-components */
import { PartBoundary } from '../ui/PartBoundary';
import { Children, createContext, isValidElement, useContext, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown as ChevronDownIcon, Info as InformationCircleIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Popover } from '../ui/overlays';
import { SegmentedControl } from '../ui/SegmentedControl';
import { ScrollBox } from '../ui/phone';
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

// Channel colours: the legacy palette plus the channels it does not name. With
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
  id, title, meta, actions, secondary, children,
}: {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  /** Optional detail (GUIDE.md "Folds"): folds, closed until the viewer opens it. Main content never folds. */
  secondary?: boolean;
  /** Short label when this block is one view inside <Views>. */
  tab?: string;
  children: ReactNode;
}) {
  const key = `livemis:${id}`;
  const [open, setOpen] = useState(() => (secondary ? readFold(key, false) : true));
  const flip = () => { setOpen(!open); writeFold(key, !open); };
  const head = (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      {meta != null && <span className="min-w-0 truncate text-label text-slate-500">{meta}</span>}
    </span>
  );
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
        {secondary ? (
          <button type="button" onClick={flip} aria-expanded={open}
            className="-mx-1 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:min-h-9">
            <ChevronDownIcon className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? '' : '-rotate-90'}`} aria-hidden />
            {head}
          </button>
        ) : <h3 className="flex min-w-0 flex-1">{head}</h3>}
        {open && actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {open && <div className="border-t border-slate-100 px-3 py-3 sm:px-4">{children}</div>}
    </section>
  );
}

// ---- One card, many views (simplification, 11 Nov 2026) ---------------------
//
// Wrap a stack of <Fold> blocks in <Views>: the page shows ONE of them at a time, picked with pills, in place of a
// long column of charts. Each Fold keeps its id / title / meta / actions; `tab` gives the short pill label.

/** Phones: a card head's description goes behind an "i" (never cut with "…"); from 640 px up it shows as text. */
function HeadMeta({ meta, label, cls = 'text-label' }: { meta: ReactNode; label: string; cls?: string }) {
  return (
    <>
      <span className={`hidden min-w-0 flex-1 truncate ${cls} text-slate-500 sm:inline`}>{meta}</span>
      <span className="min-w-0 flex-1 sm:hidden" aria-hidden />
      <span className="max-sm:order-last sm:hidden">
        <Popover align="right" width={300} buttonLabel={`About ${label}`}
          buttonClassName="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          button={<InformationCircleIcon className="h-4 w-4" aria-hidden />}>
          <p className="p-3.5 text-label leading-5 text-slate-700">{meta}</p>
        </Popover>
      </span>
    </>
  );
}

/** A small pill (e.g. the month's close level) that belongs in the card head, not on a row of its own (MOBILE-BRIEF
 *  rule 9). Inside <Sections> / <Views> it moves into the head; elsewhere it renders where it stands. */
const AsideSlot = createContext<HTMLElement | null>(null);
export function SectionAside({ children }: { children: ReactNode }) {
  const slot = useContext(AsideSlot);
  return slot ? createPortal(children, slot) : <div className="flex justify-end">{children}</div>;
}

type FoldProps = { id: string; title: ReactNode; meta?: ReactNode; actions?: ReactNode; tab?: string; children: ReactNode };

export function Views({ id, label = 'View', children }: { id: string; label?: string; children: ReactNode }) {
  const folds = Children.toArray(children).filter((c): c is ReactElement<FoldProps> => isValidElement(c) && !!(c.props as Partial<FoldProps>).id);
  const key = `livemis:views:${id}`;
  const [pick, setPick] = useState<string>(() => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } });
  if (folds.length === 0) return null;
  const cur = folds.find((f) => f.props.id === pick) ?? folds[0];
  const choose = (v: string) => { setPick(v); try { localStorage.setItem(key, v); } catch { /* private mode */ } };
  return (
    <ViewsCard>{(setSlot) => (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-3 py-2 max-sm:flex-nowrap max-sm:gap-x-1">
        {folds.length <= 5 ? (
          <SegmentedControl size="sm" aria-label={label} value={cur.props.id} onChange={choose}
            options={folds.map((f) => ({ id: f.props.id, label: String(f.props.tab ?? f.props.title) }))} />
        ) : (
          <label className="flex items-center gap-2 text-label text-slate-600">
            <span className="sr-only">{label}</span>
            <select value={cur.props.id} onChange={(e) => choose(e.target.value)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm font-medium text-slate-900 sm:min-h-9">
              {folds.map((f) => <option key={f.props.id} value={f.props.id}>{String(f.props.tab ?? f.props.title)}</option>)}
            </select>
          </label>
        )}
        {cur.props.meta != null ? <HeadMeta meta={cur.props.meta} label={String(cur.props.tab ?? cur.props.title)} cls="text-xs" /> : <span className="min-w-0 flex-1" />}
        <span ref={setSlot} className="contents" />
        {cur.props.actions && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{cur.props.actions}</div>}
      </div>
      <div className="px-3 py-3 sm:px-4">{cur.props.children}</div>
    </section>
    )}</ViewsCard>
  );
}

/** Gives a card head a slot element for <SectionAside>. */
function ViewsCard({ children }: { children: (setSlot: (el: HTMLElement | null) => void) => ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return <AsideSlot.Provider value={slot}>{children(setSlot)}</AsideSlot.Provider>;
}

// ---- Top-level tab sections (GUIDE.md "Folds": a page with more than 3 blocks uses section pills, not a stack of folds) ----
//
// Each Live MIS tab holds its blocks as <Section> children of ONE <Sections> card: a view switch in the card head picks the
// block (in the URL as ?sec=<id>, so a link opens the same block; an old #<id> link opens it too). Only the open block renders.
// A <Section> outside <Sections> renders as a plain card (no fold).

export interface SectionProps {
  id: string;
  title: ReactNode;
  /** One line under the title: what the section holds / its scope. */
  meta?: ReactNode;
  /** The block that opens first. */
  defaultOpen?: boolean;
  /** Shown in the card head (toggles, small buttons). */
  actions?: ReactNode;
  children: ReactNode;
}

export function Section({ id, title, meta, actions, children }: SectionProps) {
  return (
    <section id={id} className="min-w-0 rounded-xl border border-slate-200 bg-surface scroll-mt-24">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <h2 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
          <span className="text-section font-semibold text-slate-900">{title}</span>
          {meta != null && <span className="min-w-0 text-label text-slate-500 sm:truncate">{meta}</span>}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="border-t border-slate-200 px-4 py-4"><PartBoundary name={typeof title === 'string' ? title : 'This section'}>{children}</PartBoundary></div>
    </section>
  );
}

export function Sections({ label = 'Section', children }: { label?: string; children: ReactNode }) {
  const items = Children.toArray(children).filter((c): c is ReactElement<SectionProps> => isValidElement(c) && !!(c.props as Partial<SectionProps>).id);
  const [params, setParams] = useSearchParams();
  const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
  const want = params.get('sec') ?? (items.some((i) => i.props.id === hash) ? hash : '');
  const cur = items.find((i) => i.props.id === want) ?? items.find((i) => i.props.defaultOpen) ?? items[0];
  if (!cur) return null;
  const first = items.find((i) => i.props.defaultOpen) ?? items[0];
  const choose = (id: string) => setParams((prev) => {
    const n = new URLSearchParams(prev);
    if (id === first.props.id) n.delete('sec'); else n.set('sec', id);
    return n;
  }, { replace: true });
  const options = items.map((i) => ({ id: i.props.id, label: typeof i.props.title === 'string' ? i.props.title : i.props.id }));
  return (
    <ViewsCard>{(setSlot) => (
    <section id={cur.props.id} className="min-w-0 rounded-xl border border-slate-200 bg-surface scroll-mt-24">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 max-sm:flex-nowrap max-sm:gap-x-1 max-sm:px-3">
        {items.length <= 5 ? (
          <SegmentedControl size="sm" aria-label={label} value={cur.props.id} onChange={choose} options={options} />
        ) : (
          <label className="flex items-center gap-2">
            <span className="sr-only">{label}</span>
            <select value={cur.props.id} onChange={(e) => choose(e.target.value)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm font-medium text-slate-900 sm:min-h-9">
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        )}
        {cur.props.meta != null ? <HeadMeta meta={cur.props.meta} label={options.find((o) => o.id === cur.props.id)?.label ?? ''} /> : <span className="min-w-0 flex-1" />}
        <span ref={setSlot} className="contents" />
        {cur.props.actions && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{cur.props.actions}</div>}
      </div>
      <div className="border-t border-slate-200 px-4 py-4 max-sm:px-3"><PartBoundary key={cur.props.id} name={options.find((o) => o.id === cur.props.id)?.label ?? 'This section'}>{cur.props.children}</PartBoundary></div>
    </section>
    )}</ViewsCard>
  );
}

// ---- Toggles ---------------------------------------------------------------

/** Compact view switch inside section headers: the kit ViewSwitch (white thumb on a grey track). */
export function Pills<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label?: string;
}) {
  return <SegmentedControl size="sm" aria-label={label} value={value} onChange={onChange} options={options} />;
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
  return <span data-testid="basis-note"><Note compact label="What Normalised means">{basisNote}</Note></span>;
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
    return <span title="From the published MIS: no full live close for this month yet"
      className="inline-flex items-center px-1.5 py-0.5 rounded-full border text-xs font-medium bg-white text-slate-700 border-slate-300">Published</span>;
  }
  const b = LEVEL_BADGE[level];
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-xs font-medium ${b.cls}`}>{b.label}</span>;
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

/** Small "muted" placeholder for a number that is not real yet. */
export const ND = <span className="text-slate-400" title="Not read">–</span>;

/** A note about a chart or table. It opens from a small "Note" button so the page shows numbers, not paragraphs. */
export function Note({ children, label = 'Note', compact }: { children: ReactNode; label?: string; compact?: boolean }) {
  return (
    <Popover align="left" width={360}
      buttonClassName="inline-flex min-h-11 sm:min-h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      buttonLabel={compact ? label : undefined}
      button={<><InformationCircleIcon className="h-4 w-4" aria-hidden />{compact ? <span className="max-sm:sr-only">{label}</span> : label}</>}>
      <div className="max-h-[60vh] overflow-y-auto p-3.5 text-label leading-5 text-slate-700">{children}</div>
    </Popover>
  );
}

/** Table shell: scrolls in its own box (never the page) with a sticky first column. */
export function TableBox({ children, label = 'Table, scroll sideways for more' }: { children: ReactNode; label?: string }) {
  // Focusable so keyboard users can scroll it too (axe scrollable-region-focusable).
  return <ScrollBox label={label} className="-mx-3 px-3 sm:mx-0 sm:px-0">{children}</ScrollBox>;
}
