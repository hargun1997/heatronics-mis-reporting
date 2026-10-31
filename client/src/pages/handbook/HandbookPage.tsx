// ----------------------------------------------------------------------------
// Accounts Handbook — the one accounting knowledge base in the app.
//
// One page, one URL (/handbook). Built for "how do I do X?" in a few seconds:
//
//   Home    search first, then today's jobs (every day / every month), then
//           the topics as compact cards that open in place.
//   Reader  slim contents on the left (can be hidden), the article in a
//           readable column, "On this page" on the right when there is room.
//           Every section of an article folds (chevron on its heading, plus
//           Expand all / Collapse all). Compact density starts them folded,
//           so an article first reads as an outline.
//
// Moving around never changes the URL or reloads (Hargun's rule): topic →
// article → next article, Back, breadcrumb and "Handbook" all swap the view in
// place, and every opened article body stays mounted so returning is instant.
//
// Old links (/handbook/<topic>/<article>, /handbook#<section>, /guide/sop/…)
// still work: they open the right article in the reader and the address bar
// settles back to /handbook.
//
// Content comes only from client/src/content/handbook/handbook.html (also the
// shareable artifact); collections.ts decides the structure. Folding is a
// presentation layer over that HTML (fold.ts) — nothing in it is changed.
// ----------------------------------------------------------------------------

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ListBulletIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { SopVisual } from '../../components/ui/SopVisual';
import { useDensity } from '../../hooks/useDensity';
import {
  HANDBOOK_BASE,
  getHandbook,
  handbookHref,
  type HbArticle,
  type HbCollection,
} from '../../data/handbook/handbook';
import { QUICK_TASKS } from '../../data/handbook/collections';
import { TEAM_VISUALS } from '../../data/handbook/teamVisuals';
import { HandbookSearch } from './HandbookSearch';
import { HandbookOpenContext } from './handbookNav';
import { allFolds, enhanceArticle, getFold } from './fold';
import './handbook.generated.css';
import './handbook.ui.css';

// ---------------------------------------------------------------------------
// Reader state
// ---------------------------------------------------------------------------

interface View {
  c: HbCollection;
  a?: HbArticle;
  /** Section id to scroll to inside the article. */
  anchor?: string;
  /** Bumps on every open so re-opening the same anchor still scrolls. */
  n: number;
}

type OpenFn = (v: Omit<View, 'n'>) => void;

/** "/handbook/<topic>/<article>#<id>" (or "#<id>" alone) → a reader view. */
function resolve(href: string, n: number): View | null {
  const hb = getHandbook();
  const [path, hash = ''] = href.split('#');
  const rest = path.startsWith(HANDBOOK_BASE) ? path.slice(HANDBOOK_BASE.length) : path;
  const [cSlug, aSlug] = rest.split('/').filter(Boolean);
  if (!cSlug && hash) {
    const a = hb.idToArticle.get(hash);
    return a ? { c: a.collection, a, anchor: a.chapterId === hash ? undefined : hash, n } : null;
  }
  const c = hb.collections.find((x) => x.slug === cSlug);
  if (!c) {
    const legacy = cSlug && hb.legacySlugs.get(cSlug);
    return legacy ? resolve(handbookHref(hash || legacy), n) : null;
  }
  const a = aSlug ? c.articles.find((x) => x.slug === aSlug) : undefined;
  return { c, a, anchor: hash || undefined, n };
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/**
 * Article titles carry a task code ("M1 · Import Amazon reports") or a group
 * word ("Expense · Shopflo"). People read the plain name first: codes become a
 * small muted prefix; group words are dropped inside lists (the topic already
 * says it) and kept, muted, on the article heading.
 */
function splitTitle(t: string): { code?: string; word?: string; name: string } {
  const m = /^([DM]\d+|Weekly|Expense|FAQ) · (.+)$/.exec(t);
  if (!m) return { name: t };
  return /^[DM]\d+$/.test(m[1]) ? { code: m[1], name: m[2] } : { word: m[1], name: m[2] };
}

function Title({ t, preClass = 'text-slate-500', withWord = false }: { t: string; preClass?: string; withWord?: boolean }) {
  const { code, word, name } = splitTitle(t);
  const pre = code ?? (withWord ? word : undefined);
  return (
    <>
      {pre && <span className={`mr-1.5 ${code ? 'font-mono text-[0.78em] font-medium' : 'font-medium'} ${preClass}`}>{pre}</span>}
      {name}
    </>
  );
}

/** "Monthly · M1 · 3rd" → { when: "Monthly", due: "3rd" } (code dropped; it is in the title). */
function readTag(tag?: string) {
  const parts = (tag ?? '')
    .split(' · ')
    .map((p) => p.trim())
    .filter((p) => p && !/^[A-Z]\d+$/.test(p) && !/^(expense|faq)$/i.test(p));
  const when = parts.find((p) => /^(daily|weekly|monthly|quarterly)$/i.test(p));
  const due = parts.filter((p) => p !== when).join(' · ');
  return { when, due };
}

function TopicIcon({ c, className = 'h-5 w-5', active }: { c: HbCollection; className?: string; active?: boolean }) {
  return (
    <svg
      className={`${className} flex-shrink-0 ${active ? 'text-brand-600' : 'text-brand-600/80'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden="true"
    >
      {c.icon.map((d) => (
        <path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />
      ))}
    </svg>
  );
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1';

/** A button that looks like a link — every "page" move is in-place. */
function Go({
  onClick,
  className,
  children,
  current,
  label,
}: {
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
  current?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={`text-left ${focusRing} ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

// ---------------------------------------------------------------------------
// Left contents: topics → articles
// ---------------------------------------------------------------------------

function ReaderNav({ view, open }: { view: View; open: OpenFn }) {
  const hb = getHandbook();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <nav aria-label="Handbook contents" className="px-2.5 pb-10 pt-3 text-sm">
      <ul className="space-y-px">
        {hb.collections.map((c) => {
          const isCurrent = c === view.c;
          const isOpen = expanded[c.slug] ?? isCurrent;
          return (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [c.slug]: !isOpen }))}
                aria-expanded={isOpen}
                className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left ${focusRing} ${
                  isCurrent ? 'font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <TopicIcon c={c} className="h-[18px] w-[18px]" active={isCurrent} />
                <span className="flex-1">{c.title}</span>
                <ChevronDownIcon className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? '' : '-rotate-90'}`} aria-hidden="true" />
              </button>
              {isOpen && (
                <ul className="mb-2 ml-[19px] border-l border-slate-200">
                  {c.articles.map((a) => {
                    const active = a === view.a;
                    return (
                      <li key={a.href}>
                        <Go
                          onClick={() => open({ c, a })}
                          current={active}
                          className={`-ml-px block min-h-[36px] w-full border-l-2 py-2 pl-3.5 pr-2 text-[13.5px] leading-snug ${
                            active
                              ? 'border-brand-500 bg-brand-50/60 font-semibold text-brand-800'
                              : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                          }`}
                        >
                          <Title t={a.title} preClass={active ? 'text-brand-700' : 'text-slate-500'} />
                        </Go>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Topic page: its articles, one per row
// ---------------------------------------------------------------------------

function ArticleRows({ c, open, compact }: { c: HbCollection; open: OpenFn; compact: boolean }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {c.articles.map((a) => {
        const { due } = readTag(a.tag);
        return (
          <li key={a.href}>
            <Go
              onClick={() => open({ c, a })}
              className={`group flex w-full items-center gap-3 px-4 hover:bg-slate-50 ${compact ? 'min-h-[44px] py-2' : 'min-h-[56px] py-3'}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium leading-snug text-slate-900 group-hover:text-brand-700">
                  <Title t={a.title} />
                </span>
                {!compact && a.summary && <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-600">{a.summary}</span>}
              </span>
              {due && <span className="hidden flex-shrink-0 text-xs text-slate-500 sm:block">{due}</span>}
              <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-slate-400 group-hover:text-brand-600" aria-hidden="true" />
            </Go>
          </li>
        );
      })}
    </ul>
  );
}

function CollectionPanel({ c, open, compact }: { c: HbCollection; open: OpenFn; compact: boolean }) {
  return (
    <div className="mx-auto max-w-[46rem] px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex items-start gap-3">
        <TopicIcon c={c} className="mt-1 h-6 w-6" />
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">{c.title}</h1>
          <p className="mt-1 text-[15.5px] leading-relaxed text-slate-600">{c.description}</p>
        </div>
      </div>
      <div className="mt-6">
        <ArticleRows c={c} open={open} compact={compact} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Article
// ---------------------------------------------------------------------------

/** One article body: memoised and kept mounted once opened (instant return, no image reload). */
const ArticleBody = memo(function ArticleBody({
  a,
  onClick,
}: {
  a: HbArticle;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Add the fold chevrons before the reader scrolls to an anchor (child
  // layout effects run before the parent's effects).
  useLayoutEffect(() => {
    if (!ref.current) return;
    // Fold only when there are at least two sections; one heading is not an outline.
    const ids = a.toc.length > 1 ? a.toc.map((h) => h.id) : [];
    enhanceArticle(ref.current, a.href, ids, document.documentElement.dataset.density !== 'compact');
  }, [a]);
  return <div ref={ref} className="hb" onClick={onClick} dangerouslySetInnerHTML={{ __html: a.html }} />;
});

/** "On this page" — the article's own sections. */
function OnThisPage({ a, active, jump }: { a: HbArticle; active?: string; jump: (id: string) => void }) {
  return (
    <ul className="space-y-px border-l border-slate-200">
      {a.toc.map((h) => (
        <li key={h.id}>
          <Go
            onClick={() => jump(h.id)}
            className={`-ml-px block w-full border-l-2 py-1.5 pl-3 text-[13px] leading-snug ${
              active === h.id ? 'border-brand-500 font-medium text-brand-800' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {h.title}
          </Go>
        </li>
      ))}
    </ul>
  );
}

function ArticlePanel({
  a,
  opened,
  open,
  jump,
  onContentClick,
  activeHeading,
  wide,
}: {
  a: HbArticle;
  opened: HbArticle[];
  open: OpenFn;
  jump: (id: string) => void;
  onContentClick: (e: React.MouseEvent<HTMLElement>) => void;
  activeHeading?: string;
  wide: boolean;
}) {
  const hb = getHandbook();
  const c = a.collection;
  const idx = c.articles.indexOf(a);
  const gIdx = hb.articles.indexOf(a);
  const prev = hb.articles[gIdx - 1];
  const next = hb.articles[gIdx + 1];
  const visuals = hb.idToArticle.get(a.chapterId) === a ? TEAM_VISUALS[a.chapterId] ?? [] : [];
  const { when, due } = readTag(a.tag);
  const hasToc = a.toc.length > 1;
  const foldable = hasToc || /<details/.test(a.html);
  const setAll = (o: boolean) => getFold(a.href)?.setAll(o, true);
  const [otp, setOtp] = useState(false);

  return (
    <div className="flex justify-center gap-10 px-4 py-6 sm:px-8 sm:py-8">
      <article className="hbx-col min-w-0 max-w-[46rem] flex-1">
        <header>
          <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-slate-600">
            <span>{c.title}</span>
            <span aria-hidden="true">·</span>
            <span>
              {idx + 1} of {c.articles.length}
            </span>
            {(when || due) && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-700">{[when, due].filter(Boolean).join(', ')}</span>
              </>
            )}
          </p>
          <h1 className="mt-2 text-[28px] font-bold leading-[1.2] tracking-tight text-slate-900 sm:text-[30px]">
            <Title t={a.title} preClass="text-slate-500" withWord />
          </h1>
          {a.summary && <p className="mt-2 text-[17px] leading-relaxed text-slate-600">{a.summary}</p>}
        </header>

        {foldable && (
          <div className="mt-5 border-y border-slate-200 py-1.5">
            <div className="flex items-center gap-1">
              {hasToc && !wide && (
                <button
                  type="button"
                  onClick={() => setOtp((o) => !o)}
                  aria-expanded={otp}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 ${focusRing}`}
                >
                  <ListBulletIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <span className="hidden min-[400px]:inline">On this page</span>
                  <span className="min-[400px]:hidden">Sections</span>
                  <span className="text-slate-500">({a.toc.length})</span>
                  <ChevronDownIcon className={`h-4 w-4 text-slate-500 transition-transform ${otp ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              )}
              <div className="ml-auto flex items-center">
                <button
                  type="button"
                  onClick={() => setAll(true)}
                  aria-label="Expand all"
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 ${focusRing}`}
                >
                  <ArrowsPointingOutIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Expand<span className="hidden sm:inline"> all</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAll(false)}
                  aria-label="Collapse all"
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 ${focusRing}`}
                >
                  <ArrowsPointingInIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Collapse<span className="hidden sm:inline"> all</span>
                </button>
              </div>
            </div>
            {hasToc && !wide && otp && (
              <div className="pb-2 pl-2 pt-1">
                <OnThisPage
                  a={a}
                  active={activeHeading}
                  jump={(id) => {
                    setOtp(false);
                    jump(id);
                  }}
                />
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          {opened.map((x) => (
            <div key={x.href} hidden={x !== a}>
              <ArticleBody a={x} onClick={onContentClick} />
            </div>
          ))}
        </div>

        {visuals.length > 0 && (
          <details className="group mt-8 rounded-xl border border-slate-200">
            <summary className={`flex min-h-[48px] cursor-pointer list-none items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${focusRing}`}>
              <ChevronRightIcon className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true" />
              Team screenshots ({visuals.length})
              <span className="font-normal text-slate-600">— upload a current screen for any slot</span>
            </summary>
            <div className="grid grid-cols-1 gap-4 border-t border-slate-200 p-4 md:grid-cols-2">
              {visuals.map((v) => (
                <SopVisual key={v.key} placeholderKey={v.key} label={v.label} />
              ))}
            </div>
          </details>
        )}

        <nav className="mt-10 grid grid-cols-1 gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2" aria-label="Previous and next">
          {prev ? (
            <Go
              onClick={() => open({ c: prev.collection, a: prev })}
              className="group flex min-h-[64px] items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:border-brand-300 hover:bg-brand-50/40"
            >
              <ArrowLeftIcon className="h-5 w-5 flex-shrink-0 text-slate-500 group-hover:text-brand-600" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs text-slate-600">Previous</span>
                <span className="block text-[14.5px] font-semibold leading-snug text-slate-900 group-hover:text-brand-700">
                  <Title t={prev.title} withWord />
                </span>
              </span>
            </Go>
          ) : (
            <span className="hidden sm:block" />
          )}
          {next && (
            <Go
              onClick={() => open({ c: next.collection, a: next })}
              className="group flex min-h-[64px] items-center justify-end gap-3 rounded-xl border border-slate-200 px-4 py-3 text-right hover:border-brand-300 hover:bg-brand-50/40"
            >
              <span className="min-w-0">
                <span className="block text-xs text-slate-600">Next{next.collection !== c ? ` · ${next.collection.title}` : ''}</span>
                <span className="block text-[14.5px] font-semibold leading-snug text-slate-900 group-hover:text-brand-700">
                  <Title t={next.title} withWord />
                </span>
              </span>
              <ArrowRightIcon className="h-5 w-5 flex-shrink-0 text-slate-500 group-hover:text-brand-600" aria-hidden="true" />
            </Go>
          )}
        </nav>
      </article>

      {hasToc && wide && (
        <aside className="w-[200px] flex-shrink-0" aria-label="On this page">
          <div className="sticky top-[calc(8.5rem+var(--htx-bar-h,0px))] max-h-[calc(100vh-10rem-var(--htx-bar-h,0px))] overflow-y-auto">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">On this page</div>
            <OnThisPage a={a} active={activeHeading} jump={jump} />
          </div>
        </aside>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screenshot viewer (click any screenshot in an article)
// ---------------------------------------------------------------------------

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Screenshot" className="fixed inset-0 z-[60] flex flex-col bg-slate-900/85 p-3 sm:p-6" onClick={onClose}>
      <div className="flex justify-end">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <XMarkIcon className="h-4 w-4" aria-hidden="true" /> Close
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center pt-3">
        <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg bg-white object-contain shadow-overlay" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The reader (in-page)
// ---------------------------------------------------------------------------

function Reader({
  view,
  opened,
  open,
  back,
  close,
  compact,
}: {
  view: View | null;
  opened: HbArticle[];
  open: OpenFn;
  back: () => void;
  close: () => void;
  compact: boolean;
}) {
  // Contents: shown by default only on wide screens; a drawer below 1024px.
  const [navOpen, setNavOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280);
  const [activeHeading, setActiveHeading] = useState<string | undefined>();
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [wide, setWide] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const isOpen = !!view;

  // Is there room for "On this page" beside the article?
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= 1040));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollToId = useCallback((id: string) => {
    getFold(view?.a?.href ?? '')?.reveal(id);
    const go = () => document.getElementById(id)?.scrollIntoView({ block: 'start' });
    requestAnimationFrame(go);
    // Settle again after lazy screenshots above the target load.
    const t1 = window.setTimeout(go, 250);
    const t2 = window.setTimeout(go, 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [view?.a?.href]);

  // Each open: jump to the section (unfolding it), or to the top.
  useEffect(() => {
    if (!view) return;
    if (!view.anchor) {
      window.scrollTo({ top: 0 });
      return;
    }
    return scrollToId(view.anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Density switch: compact folds every article to an outline; comfortable opens them.
  useEffect(() => {
    for (const f of allFolds()) f.setAll(!compact);
  }, [compact]);

  // Scroll-spy for "On this page".
  const a = view?.a;
  useEffect(() => {
    if (!a) return;
    const onScroll = () => {
      let cur: string | undefined;
      for (const h of a.toc) {
        const el = document.getElementById(h.id);
        if (el && el.offsetParent && el.getBoundingClientRect().top < 170) cur = h.id;
      }
      setActiveHeading(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [a]);

  // Esc closes the contents drawer on small screens.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isDesktop() && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  // Inside the handbook text: links (#c16, #s3 …) open their article here;
  // screenshots open large in the viewer.
  const onContentClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const t = e.target as HTMLElement;
      const img = t.closest('figure img') as HTMLImageElement | null;
      if (img) {
        e.preventDefault();
        setZoom({ src: img.currentSrc || img.src, alt: img.alt });
        return;
      }
      const href = t.closest('a')?.getAttribute('href') || '';
      if (!href.startsWith('#')) return;
      e.preventDefault();
      const v = resolve(handbookHref(href.slice(1)), 0);
      if (v) open(v);
    },
    [open],
  );

  const jump = useCallback(
    (id: string) => {
      if (!isDesktop()) setNavOpen(false);
      scrollToId(id);
    },
    [scrollToId],
  );

  const openFromNav: OpenFn = useCallback(
    (v) => {
      if (!isDesktop()) setNavOpen(false);
      open(v);
    },
    [open],
  );

  const shown = view ?? null;
  const lastArticle = opened[opened.length - 1];
  const barBtn = `inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold ${focusRing}`;

  return (
    <div className={isOpen ? 'min-h-[calc(100vh-3.5rem)] bg-white' : 'hidden'} aria-label="Accounts Handbook reader">
      {/* Bar: Back · breadcrumb · search · contents (sticks under the app header) */}
      <div className="sticky top-[calc(3.5rem+var(--htx-bar-h,0px))] z-30 flex h-14 items-center gap-1.5 border-b border-slate-200 bg-white/95 px-2 backdrop-blur sm:gap-2 sm:px-4">
        <button type="button" onClick={back} className={`${barBtn} border border-slate-200 text-slate-800 hover:bg-slate-50`}>
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
        <button
          type="button"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-controls="hb-contents"
          aria-label="Contents"
          className={`${barBtn} ${navOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          <ListBulletIcon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Contents</span>
        </button>
        {shown && (
          <nav aria-label="Breadcrumb" className="ml-1 flex min-w-0 flex-1 items-center gap-1 text-sm text-slate-600">
            <Go onClick={close} className="flex-shrink-0 rounded px-1 py-1 hover:text-slate-900 hover:underline">
              Handbook
            </Go>
            <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
            <Go
              onClick={() => open({ c: shown.c })}
              className={`min-w-0 truncate rounded px-1 py-1 ${shown.a ? 'hidden flex-shrink-0 hover:text-slate-900 hover:underline sm:block' : 'font-semibold text-slate-900'}`}
            >
              {shown.c.title}
            </Go>
            {shown.a && (
              <>
                <ChevronRightIcon className="hidden h-3.5 w-3.5 flex-shrink-0 text-slate-400 sm:block" aria-hidden="true" />
                <span className="min-w-0 truncate px-1 font-semibold text-slate-900" aria-current="page">
                  {splitTitle(shown.a.title).name}
                </span>
              </>
            )}
          </nav>
        )}
        <div className="ml-auto hidden w-64 flex-shrink-0 md:block xl:w-72">
          <HandbookSearch />
        </div>
      </div>

      <div className="flex">
        {shown && navOpen && (
          <>
            <div className="fixed inset-0 top-28 z-30 bg-slate-900/30 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />
            <aside
              id="hb-contents"
              className="fixed bottom-0 left-0 top-28 z-40 w-[min(300px,85vw)] overflow-y-auto overscroll-contain border-r border-slate-200 bg-white shadow-drawer-left lg:sticky lg:z-0 lg:h-[calc(100vh-7rem)] lg:w-[268px] lg:flex-shrink-0 lg:self-start lg:bg-slate-50/60 lg:shadow-none"
            >
              <ReaderNav view={shown} open={openFromNav} />
            </aside>
          </>
        )}
        <div ref={mainRef} className="min-w-0 flex-1">
          {shown && !shown.a && <CollectionPanel c={shown.c} open={open} compact={compact} />}
          {/* Article panel stays mounted after the first article, so bodies never re-render. */}
          {lastArticle && (
            <div hidden={!shown?.a}>
              <ArticlePanel
                a={shown?.a ?? lastArticle}
                opened={opened}
                open={open}
                jump={jump}
                onContentClick={onContentClick}
                activeHeading={activeHeading}
                wide={wide}
              />
            </div>
          )}
        </div>
      </div>
      {zoom && <Lightbox src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

const EXAMPLES = ['Shopflo invoice', 'bank statement', 'Amazon JV', 'TDS 194C', 'option 5'];

function TodaysJobs({ openHref, compact }: { openHref: (href: string) => void; compact: boolean }) {
  const hb = getHandbook();
  const row = (t: (typeof QUICK_TASKS)[number]) => {
    const art = hb.idToArticle.get(t.anchor);
    const name = art ? splitTitle(art.title).name : t.label;
    const { due } = readTag(art?.tag);
    return (
      <li key={t.code}>
        <Go
          onClick={() => openHref(handbookHref(t.anchor))}
          className={`group flex w-full items-center gap-3 rounded-lg px-3 hover:bg-slate-50 ${compact ? 'min-h-[40px] py-1.5' : 'min-h-[48px] py-2'}`}
        >
          <span className="w-7 flex-shrink-0 font-mono text-xs font-medium text-slate-500">{t.code}</span>
          <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-slate-900 group-hover:text-brand-700">{name}</span>
          {due && <span className="hidden flex-shrink-0 text-xs text-slate-600 sm:block">{due}</span>}
          <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-slate-400 group-hover:text-brand-600" aria-hidden="true" />
        </Go>
      </li>
    );
  };
  const col = (title: string, list: typeof QUICK_TASKS) => (
    <div className="min-w-0">
      <h3 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-600">{title}</h3>
      <ul>{list.map(row)}</ul>
    </div>
  );
  return (
    <div className="grid gap-x-6 gap-y-4 rounded-xl border border-slate-200 bg-white p-2 py-3 md:grid-cols-2">
      {col('Every day', QUICK_TASKS.filter((t) => t.code.startsWith('D')))}
      {col('Every month', QUICK_TASKS.filter((t) => t.code.startsWith('M')))}
    </div>
  );
}

function TopicCard({ c, open, compact }: { c: HbCollection; open: OpenFn; compact: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const n = c.articles.length;
  const id = `hb-topic-${c.slug}`;
  return (
    <div className={`rounded-xl border bg-white ${expanded ? 'border-slate-300' : 'border-slate-200'}`}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={id}
        className={`group flex w-full items-start gap-3 rounded-xl px-4 text-left hover:bg-slate-50 ${focusRing} ${compact ? 'min-h-[44px] items-center py-2' : 'min-h-[64px] py-3.5'}`}
      >
        <TopicIcon c={c} className={compact ? 'h-[18px] w-[18px]' : 'mt-0.5 h-5 w-5'} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-semibold leading-snug text-slate-900">{c.title}</span>
          {!compact && <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-600">{c.description}</span>}
        </span>
        <span className={`flex flex-shrink-0 items-center gap-1.5 text-xs text-slate-600 ${compact ? '' : 'mt-0.5'}`}>
          {n} {n === 1 ? 'article' : 'articles'}
          <ChevronDownIcon className={`h-4 w-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>
      {expanded && (
        <ul id={id} className="border-t border-slate-100 px-2 py-1.5">
          {c.articles.map((a) => (
            <li key={a.href}>
              <Go
                onClick={() => open({ c, a })}
                className="group flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] leading-snug text-slate-800 hover:bg-slate-50 hover:text-brand-700"
              >
                <span className="min-w-0 flex-1">
                  <Title t={a.title} />
                </span>
                <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-slate-400 group-hover:text-brand-600" aria-hidden="true" />
              </Go>
            </li>
          ))}
          <li>
            <Go
              onClick={() => open({ c })}
              className="flex min-h-[40px] w-full items-center rounded-lg px-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-brand-700"
            >
              Open {c.title} as a page
            </Go>
          </li>
        </ul>
      )}
    </div>
  );
}

function Home({ open, openHref, compact }: { open: OpenFn; openHref: (href: string) => void; compact: boolean }) {
  const hb = getHandbook();
  const onCoverClick = (e: React.MouseEvent<HTMLElement>) => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    e.preventDefault();
    openHref(handbookHref(href.slice(1)));
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-white">
      <div className={`mx-auto max-w-[960px] px-4 sm:px-6 ${compact ? 'py-6' : 'py-8 sm:py-12'}`}>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[32px]">Accounts Handbook</h1>
        <p className="mt-1.5 text-[15.5px] text-slate-600">Search for a job, or pick one below.</p>
        <div className="relative z-20 mt-5">
          <HandbookSearch size="large" autoFocus examples={compact ? undefined : EXAMPLES} />
        </div>

        <section className={compact ? 'mt-6' : 'mt-10'} aria-labelledby="hb-jobs">
          <h2 id="hb-jobs" className="mb-3 text-lg font-semibold text-slate-900">
            Regular jobs
          </h2>
          <TodaysJobs openHref={openHref} compact={compact} />
        </section>

        <section className={compact ? 'mt-6' : 'mt-10'} aria-labelledby="hb-topics">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="hb-topics" className="text-lg font-semibold text-slate-900">
              All topics
            </h2>
            <span className="text-xs text-slate-600">
              {hb.collections.length} topics · {hb.articles.length} articles
            </span>
          </div>
          <div className={`grid grid-cols-1 items-start ${compact ? 'gap-2 md:grid-cols-2 xl:grid-cols-3' : 'gap-3 md:grid-cols-2'}`}>
            {hb.collections.map((c) => (
              <TopicCard key={c.slug} c={c} open={open} compact={compact} />
            ))}
          </div>
        </section>

        {hb.coverHtml && (
          <details className="group mt-10 rounded-xl border border-slate-200">
            <summary className={`flex min-h-[48px] cursor-pointer list-none items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${focusRing}`}>
              <ChevronRightIcon className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true" />
              How to use this handbook
            </summary>
            <div className="hb hb-cover border-t border-slate-200 p-5" onClick={onCoverClick} dangerouslySetInnerHTML={{ __html: hb.coverHtml }} />
          </details>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function HandbookPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [density] = useDensity();
  const compact = density === 'compact';
  // Reader history (in-memory, so the URL never changes while reading).
  const [stack, setStack] = useState<View[]>([]);
  const [opened, setOpened] = useState<HbArticle[]>([]);
  const view = stack.length ? stack[stack.length - 1] : null;

  const open = useCallback((v: Omit<View, 'n'>) => {
    setStack((s) => [...s, { ...v, n: Date.now() }]);
    if (v.a) setOpened((o) => (o.includes(v.a!) ? o : [...o, v.a!]));
  }, []);
  const openHref = useCallback(
    (href: string) => {
      const v = resolve(href, 0);
      if (v) open(v);
    },
    [open],
  );
  // Back walks the reader history; from the first page it returns home.
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const close = useCallback(() => setStack([]), []);

  // Returning home lands at the top.
  useEffect(() => {
    if (!view) window.scrollTo({ top: 0 });
  }, [view]);

  // Old links / deep links land here as a URL: open the reader, settle the URL on /handbook.
  const incoming = location.pathname.replace(/\/+$/, '') !== HANDBOOK_BASE || !!location.hash;
  const target = incoming ? resolve(location.pathname + location.hash, 0) : null;
  useEffect(() => {
    if (!incoming) return;
    if (target) open(target);
    navigate(HANDBOOK_BASE, { replace: true, state: { settled: true } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.hash]);
  // Clicking "Accounts Handbook" in the menu while reading (same URL, new
  // history entry) returns to the handbook home.
  const settled = (location.state as { settled?: boolean } | null)?.settled;
  useEffect(() => {
    if (!incoming && !settled) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  if (incoming && !target && location.pathname !== HANDBOOK_BASE) return <Navigate to={HANDBOOK_BASE} replace />;

  return (
    <HandbookOpenContext.Provider value={openHref}>
      <div className={`hbx ${compact ? 'hbx-compact' : ''}`}>
        <div hidden={!!view}>
          <Home open={open} openHref={openHref} compact={compact} />
        </div>
        <Reader view={view} opened={opened} open={open} back={back} close={close} compact={compact} />
      </div>
    </HandbookOpenContext.Provider>
  );
}

/** Redirects an old SOP / guide route to the handbook article that replaced it. */
export function HandbookRedirect({ anchor }: { anchor: string }) {
  return <Navigate to={handbookHref(anchor)} replace />;
}
