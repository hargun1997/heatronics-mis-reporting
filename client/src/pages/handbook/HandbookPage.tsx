// ----------------------------------------------------------------------------
// Accounts Handbook — the one accounting knowledge base in the app.
//
// One page, one URL (/handbook). The home shows search, the daily/monthly
// task shortcuts and the topic cards. Opening a topic or an article swaps the
// page to the reader in place (no popup) — it behaves like separate pages
// (topic list → article → next article, back, breadcrumb, nested sidebar,
// "Handbook home") but the URL never changes and nothing reloads. Every article body
// stays mounted once opened, so going back to one is instant.
//
// Old links (/handbook/<topic>/<article>, /handbook#<section>, /guide/sop/…)
// still work: they open the right article in the reader and the address bar
// settles back to /handbook.
//
// Content comes only from client/src/content/handbook/handbook.html (also the
// shareable artifact); collections.ts decides the structure.
// ----------------------------------------------------------------------------

import { memo, useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SopVisual } from '../../components/ui/SopVisual';
import {
  HANDBOOK_BASE,
  getHandbook,
  handbookHref,
  type HbArticle,
  type HbCollection,
} from '../../data/handbook/handbook';
import { QUICK_TASKS, type CollectionAccent } from '../../data/handbook/collections';
import { TEAM_VISUALS } from '../../data/handbook/teamVisuals';
import { HandbookSearch } from './HandbookSearch';
import { HandbookOpenContext } from './handbookNav';
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

const TILE: Record<CollectionAccent, string> = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  rose: 'bg-rose-50 text-rose-700 ring-rose-100',
};
const BAR: Record<CollectionAccent, string> = {
  brand: 'from-brand-400 to-brand-600',
  emerald: 'from-emerald-400 to-emerald-600',
  violet: 'from-violet-400 to-violet-600',
  amber: 'from-amber-400 to-amber-500',
  sky: 'from-sky-400 to-sky-600',
  rose: 'from-rose-400 to-rose-600',
};

function Icon({ paths, className = 'h-5 w-5' }: { paths: string[]; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      {paths.map((d) => (
        <path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />
      ))}
    </svg>
  );
}

function Tile({ c, size = 'md' }: { c: HbCollection; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-6 w-6 rounded-md' : 'h-10 w-10';
  const ico = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  return (
    <span className={`inline-flex flex-shrink-0 items-center justify-center rounded-xl ring-1 ${TILE[c.accent]} ${box}`}>
      <Icon paths={c.icon} className={ico} />
    </span>
  );
}

function TagPill({ tag }: { tag?: string }) {
  if (!tag) return null;
  const kind = /daily/i.test(tag)
    ? 'bg-emerald-50 text-emerald-700'
    : /month/i.test(tag)
      ? 'bg-violet-50 text-violet-700'
      : /week/i.test(tag)
        ? 'bg-sky-50 text-sky-700'
        : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${kind}`}>{tag}</span>;
}

const chevronRight = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);
const chevron = (open: boolean) => (
  <svg className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.17 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
  </svg>
);

/** A button that looks like a link — every "page" move is in-place. */
function Go({ onClick, className, children, current }: { onClick: () => void; className?: string; children: React.ReactNode; current?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-current={current ? 'page' : undefined} className={`text-left ${className ?? ''}`}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Nested topic → article list (left side of the reader)
// ---------------------------------------------------------------------------

function ReaderNav({ view, open }: { view: View; open: (v: Omit<View, 'n'>) => void }) {
  const hb = getHandbook();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <nav aria-label="Handbook topics" className="p-3 pb-10 text-sm">
      <ul className="space-y-0.5">
        {hb.collections.map((c) => {
          const isCurrent = c === view.c;
          const isOpen = expanded[c.slug] ?? isCurrent;
          return (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [c.slug]: !isOpen }))}
                aria-expanded={isOpen}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${
                  isCurrent ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Tile c={c} size="sm" />
                <span className="flex-1">{c.title}</span>
                <span className="text-slate-400">{chevron(isOpen)}</span>
              </button>
              {isOpen && (
                <ul className="my-1 ml-[22px] border-l border-slate-200 pl-2">
                  <li>
                    <Go
                      onClick={() => open({ c })}
                      current={isCurrent && !view.a}
                      className={`-ml-[9px] block w-[calc(100%+9px)] border-l-2 py-1.5 pl-3 pr-2 text-[12.5px] ${
                        isCurrent && !view.a ? 'border-brand-500 font-semibold text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      All in {c.title}
                    </Go>
                  </li>
                  {c.articles.map((a) => {
                    const active = a === view.a;
                    return (
                      <li key={a.href}>
                        <Go
                          onClick={() => open({ c, a })}
                          current={active}
                          className={`-ml-[9px] block w-[calc(100%+9px)] border-l-2 py-1.5 pl-3 pr-2 text-[13px] leading-snug ${
                            active ? 'border-brand-500 font-semibold text-brand-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                          }`}
                        >
                          {a.title}
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
// Reader content: a topic's article list, or an article
// ---------------------------------------------------------------------------

function CollectionPanel({ c, open }: { c: HbCollection; open: (v: Omit<View, 'n'>) => void }) {
  return (
    <div className="mx-auto max-w-[820px] px-5 py-8 sm:px-8">
      <div className="flex items-start gap-4">
        <Tile c={c} size="lg" />
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight text-slate-900">{c.title}</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-slate-500">{c.description}</p>
        </div>
      </div>
      <ol className="mt-7 space-y-3">
        {c.articles.map((a, i) => (
          <li key={a.href}>
            <Go
              onClick={() => open({ c, a })}
              className="group flex w-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft transition hover:border-brand-200 hover:shadow-card"
            >
              <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-xs font-semibold text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-700">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15.5px] font-semibold text-slate-900 group-hover:text-brand-700">{a.title}</span>
                  <TagPill tag={a.tag} />
                </div>
                {a.summary && <p className="mt-1 text-sm leading-relaxed text-slate-500">{a.summary}</p>}
                {a.toc.length > 1 && (
                  <p className="mt-2 truncate text-xs text-slate-400">
                    {a.toc
                      .slice(0, 5)
                      .map((h) => h.title)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <span className="mt-1 text-slate-300 group-hover:text-brand-500">{chevronRight}</span>
            </Go>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One article body: memoised and kept mounted once opened (instant return, no image reload). */
const ArticleBody = memo(function ArticleBody({ html, onClick }: { html: string; onClick: (e: React.MouseEvent<HTMLElement>) => void }) {
  return <div className="hb" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
});

function ArticlePanel({
  a,
  opened,
  open,
  onContentClick,
  activeHeading,
}: {
  a: HbArticle;
  opened: HbArticle[];
  open: (v: Omit<View, 'n'>) => void;
  onContentClick: (e: React.MouseEvent<HTMLElement>) => void;
  activeHeading?: string;
}) {
  const hb = getHandbook();
  const c = a.collection;
  const idx = c.articles.indexOf(a);
  const gIdx = hb.articles.indexOf(a);
  const prev = hb.articles[gIdx - 1];
  const next = hb.articles[gIdx + 1];
  const visuals = hb.idToArticle.get(a.chapterId) === a ? TEAM_VISUALS[a.chapterId] ?? [] : [];

  return (
    <div className="mx-auto flex max-w-[1100px] gap-8 px-5 py-7 sm:px-8">
      <article className="min-w-0 flex-1">
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Go onClick={() => open({ c })} className="inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-brand-700">
              <Tile c={c} size="sm" />
              {c.title}
            </Go>
            <span className="text-slate-300">·</span>
            <span className="text-slate-400">
              {idx + 1} of {c.articles.length}
            </span>
            <TagPill tag={a.tag} />
          </div>
          <h1 className="mt-3 font-display text-[28px] font-extrabold leading-[1.15] tracking-tight text-slate-900">{a.title}</h1>
          {a.summary && <p className="mt-2 max-w-3xl text-[15.5px] leading-relaxed text-slate-500">{a.summary}</p>}
        </header>

        {a.toc.length > 1 && (
          <nav aria-label="On this page" className="mb-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 2xl:hidden">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">On this page</div>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {a.toc.map((h) => (
                <li key={h.id}>
                  <Go onClick={() => open({ c, a, anchor: h.id })} className="block py-0.5 text-[13px] text-slate-600 hover:text-brand-700">
                    {h.title}
                  </Go>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
          {opened.map((x) => (
            <div key={x.href} hidden={x !== a}>
              <ArticleBody html={x.html} onClick={onContentClick} />
            </div>
          ))}
        </div>

        {visuals.length > 0 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 className="font-semibold text-slate-900">Team screenshots</h2>
            <p className="mt-1 text-sm text-slate-500">Upload a current screen for any slot; it replaces the previous one for everyone.</p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {visuals.map((v) => (
                <SopVisual key={v.key} placeholderKey={v.key} label={v.label} />
              ))}
            </div>
          </section>
        )}

        <nav className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Previous and next">
          {prev ? (
            <Go onClick={() => open({ c: prev.collection, a: prev })} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-card">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">← Previous · {prev.collection.title}</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-800 group-hover:text-brand-700">{prev.title}</div>
            </Go>
          ) : (
            <span />
          )}
          {next && (
            <Go onClick={() => open({ c: next.collection, a: next })} className="group rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:border-brand-300 hover:shadow-card">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Next · {next.collection.title} →</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-800 group-hover:text-brand-700">{next.title}</div>
            </Go>
          )}
        </nav>
      </article>

      {a.toc.length > 1 && (
        <aside className="hidden w-[210px] flex-shrink-0 2xl:block">
          <div className="sticky top-32">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">On this page</div>
            <ul className="space-y-1 border-l border-slate-200">
              {a.toc.map((h) => (
                <li key={h.id}>
                  <Go
                    onClick={() => open({ c, a, anchor: h.id })}
                    className={`-ml-px block border-l-2 py-1 pl-3 text-[12.5px] leading-snug ${
                      activeHeading === h.id ? 'border-brand-500 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {h.title}
                  </Go>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The reader (in-page)
// ---------------------------------------------------------------------------

function Reader({
  view,
  history,
  opened,
  open,
  back,
  close,
}: {
  view: View | null;
  history: number;
  opened: HbArticle[];
  open: (v: Omit<View, 'n'>) => void;
  back: () => void;
  close: () => void;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string | undefined>();
  const isOpen = !!view;

  // Each open: jump to the section, or to the top (settling after lazy screenshots load).
  useEffect(() => {
    if (!view) return;
    if (!view.anchor) {
      window.scrollTo({ top: 0 });
      return;
    }
    const go = () => document.getElementById(view.anchor!)?.scrollIntoView({ block: 'start' });
    requestAnimationFrame(go);
    const t1 = window.setTimeout(go, 250);
    const t2 = window.setTimeout(go, 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [view]);

  // Scroll-spy for "On this page".
  const a = view?.a;
  useEffect(() => {
    if (!a) return;
    const onScroll = () => {
      let cur: string | undefined;
      for (const h of a.toc) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top < 170) cur = h.id;
      }
      setActiveHeading(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [a]);

  // Links inside the handbook text (#c16, #s3 …) open their article here.
  const onContentClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const link = (e.target as HTMLElement).closest('a');
      const href = link?.getAttribute('href') || '';
      if (!href.startsWith('#')) return;
      e.preventDefault();
      const v = resolve(handbookHref(href.slice(1)), 0);
      if (v) open(v);
    },
    [open],
  );

  const shown = view ?? null;
  const lastArticle = opened[opened.length - 1];

  return (
    <div className={isOpen ? '' : 'hidden'} aria-label="Accounts Handbook reader">
      <div>
        {/* Bar: back · breadcrumb · search · home (sticks under the app header) */}
        <div className="sticky top-14 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur-xl sm:px-4">
          <button
            type="button"
            onClick={back}
            disabled={history < 2}
            aria-label="Back"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
          >
            <Icon paths={['M15 19l-7-7 7-7']} className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setNavOpen((o) => !o)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 lg:hidden"
          >
            Topics
          </button>
          {shown && (
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-slate-500">
              <button type="button" onClick={close} className="hidden flex-shrink-0 hover:text-slate-900 sm:block">
                Handbook
              </button>
              <span className="hidden text-slate-300 sm:block">/</span>
              <button
                type="button"
                onClick={() => open({ c: shown.c })}
                className={`flex-shrink-0 ${shown.a ? 'hover:text-slate-900' : 'font-semibold text-slate-900'}`}
              >
                {shown.c.title}
              </button>
              {shown.a && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="truncate font-semibold text-slate-900">{shown.a.title}</span>
                </>
              )}
            </nav>
          )}
          <div className="ml-auto hidden w-72 md:block">
            <HandbookSearch />
          </div>
          <button
            type="button"
            onClick={close}
            className="ml-2 inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <Icon paths={['M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10']} className="h-4 w-4" />
            <span className="hidden sm:inline">Handbook home</span>
          </button>
        </div>

        <div className="flex">
          {shown && (
            <aside
              className={`${navOpen ? 'block' : 'hidden'} fixed bottom-0 left-0 top-28 z-40 w-72 overflow-y-auto overscroll-contain border-r border-slate-200 bg-white shadow-drawer-left lg:sticky lg:top-28 lg:z-0 lg:block lg:h-[calc(100vh-7rem)] lg:flex-shrink-0 lg:self-start lg:bg-white/70 lg:shadow-none`}
            >
              <ReaderNav
                view={shown}
                open={(v) => {
                  setNavOpen(false);
                  open(v);
                }}
              />
            </aside>
          )}
          <div className="min-w-0 flex-1">
            {shown && !shown.a && <CollectionPanel c={shown.c} open={open} />}
            {/* Article panel stays mounted after the first article, so bodies never re-render. */}
            {lastArticle && (
              <div hidden={!shown?.a}>
                <ArticlePanel a={shown?.a ?? lastArticle} opened={opened} open={open} onContentClick={onContentClick} activeHeading={activeHeading} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function Home({ open, openHref }: { open: (v: Omit<View, 'n'>) => void; openHref: (href: string) => void }) {
  const hb = getHandbook();
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const daily = QUICK_TASKS.filter((t) => t.code.startsWith('D'));
  const monthly = QUICK_TASKS.filter((t) => t.code.startsWith('M'));
  const chip = (t: (typeof QUICK_TASKS)[number]) => (
    <Go
      key={t.code}
      onClick={() => openHref(handbookHref(t.anchor))}
      className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 py-1 pl-1 pr-3 text-[13px] text-slate-700 shadow-soft transition hover:border-brand-300 hover:text-brand-800"
    >
      <span className="rounded-full bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-semibold text-white group-hover:bg-brand-600">{t.code}</span>
      {t.label}
    </Go>
  );
  const onCoverClick = (e: React.MouseEvent<HTMLElement>) => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    e.preventDefault();
    openHref(handbookHref(href.slice(1)));
  };

  return (
    <div>
      <section className="hb-hero border-b border-slate-200/70">
        <div className="mx-auto max-w-[1120px] px-4 pb-10 pt-10 sm:px-6 sm:pl-[104px] lg:pt-14">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">Heatronics · Accounts</p>
          <h1 className="mt-2 font-display text-[34px] font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-[42px]">Accounts Handbook</h1>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-slate-600">
            How our books are built and run — every system, the entry it posts, the ledger it lands in, and each daily and monthly task with screenshots.
          </p>
          <div className="mt-7 max-w-2xl">
            <HandbookSearch size="large" />
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 w-24 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Every day</span>
              {daily.map(chip)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 w-24 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Every month</span>
              {monthly.map(chip)}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="font-display text-xl font-extrabold tracking-tight text-slate-900">Browse by topic</h2>
          <span className="text-xs text-slate-500">
            {hb.collections.length} topics · {hb.articles.length} articles
          </span>
        </div>
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {hb.collections.map((c, i) => {
            const all = showAll[c.slug];
            const list = all ? c.articles : c.articles.slice(0, 4);
            return (
              <article
                key={c.slug}
                className="hb-rise group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card transition hover:shadow-card-lg"
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${BAR[c.accent]} opacity-80`} />
                <Go onClick={() => open({ c })} className="flex items-start gap-3.5 p-5 pb-3">
                  <Tile c={c} />
                  <div className="min-w-0">
                    <span className="block font-display text-[17px] font-bold leading-tight text-slate-900 hover:text-brand-700">{c.title}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-slate-500">{c.description}</span>
                  </div>
                </Go>
                <ul className="mx-5 border-t border-slate-100 py-2">
                  {list.map((a) => (
                    <li key={a.href}>
                      <Go onClick={() => open({ c, a })} className="flex w-full items-center gap-2 py-1.5 text-[13.5px] text-slate-700 hover:text-brand-700">
                        <span className="h-1 w-1 flex-shrink-0 rounded-full bg-slate-300" />
                        <span className="truncate">{a.title}</span>
                      </Go>
                    </li>
                  ))}
                </ul>
                {c.articles.length > 4 ? (
                  <button
                    type="button"
                    onClick={() => setShowAll((s) => ({ ...s, [c.slug]: !all }))}
                    className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-brand-700"
                  >
                    {all ? 'Show fewer' : `Show all ${c.articles.length} articles`}
                    <span className={`transition-transform ${all ? '-rotate-90' : 'rotate-90'}`}>{chevronRight}</span>
                  </button>
                ) : (
                  <div className="border-t border-slate-100 px-5 py-3 text-xs font-semibold text-slate-400">
                    {c.articles.length} article{c.articles.length > 1 ? 's' : ''}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {hb.coverHtml && (
          <section className="mt-12">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">How to use this handbook</h2>
            <div className="hb hb-cover rounded-2xl border border-slate-200 bg-white p-6 shadow-card" onClick={onCoverClick} dangerouslySetInnerHTML={{ __html: hb.coverHtml }} />
          </section>
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
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const close = useCallback(() => setStack([]), []);

  // Old links / deep links land here as a URL: open the reader, settle the URL on /handbook.
  const incoming = location.pathname.replace(/\/+$/, '') !== HANDBOOK_BASE || !!location.hash;
  const target = incoming ? resolve(location.pathname + location.hash, 0) : null;
  useEffect(() => {
    if (!incoming) return;
    if (target) open(target);
    navigate(HANDBOOK_BASE, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.hash]);
  if (incoming && !target && location.pathname !== HANDBOOK_BASE) return <Navigate to={HANDBOOK_BASE} replace />;

  return (
    <HandbookOpenContext.Provider value={openHref}>
      <div hidden={!!view}>
        <Home open={open} openHref={openHref} />
      </div>
      <Reader view={view} history={stack.length} opened={opened} open={open} back={back} close={close} />
    </HandbookOpenContext.Provider>
  );
}

/** Redirects an old SOP / guide route to the handbook article that replaced it. */
export function HandbookRedirect({ anchor }: { anchor: string }) {
  return <Navigate to={handbookHref(anchor)} replace />;
}
