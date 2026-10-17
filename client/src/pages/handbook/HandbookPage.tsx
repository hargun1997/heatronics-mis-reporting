// ----------------------------------------------------------------------------
// Accounts Handbook — the one accounting knowledge base in the app.
//
// Same help-center structure (Home → Collections → Articles), but it behaves
// like ONE page: the shell, the nested sidebar and every article body stay
// mounted, so moving between views is an instant in-place swap — no page
// re-render, no screenshots reloading. URLs still change (/handbook,
// /handbook/:collection, /handbook/:collection/:article) so links, the back
// button and sharing work.
//
// Content comes only from client/src/content/handbook/handbook.html (also the
// shareable artifact); collections.ts decides the structure.
// ----------------------------------------------------------------------------

import { memo, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Drawer } from '../../components/ui/overlays';
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
import './handbook.generated.css';
import './handbook.ui.css';

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

function Tile({ c, size = 'md' }: { c: HbCollection; size?: 'md' | 'lg' }) {
  return (
    <span className={`inline-flex flex-shrink-0 items-center justify-center rounded-xl ring-1 ${TILE[c.accent]} ${size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'}`}>
      <Icon paths={c.icon} className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />
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

/** In-content links (#c16, #s3 …) jump to the article that holds the id. */
function useContentLinks() {
  const navigate = useNavigate();
  return (e: React.MouseEvent<HTMLElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    e.preventDefault();
    navigate(handbookHref(href.slice(1)));
  };
}

// ---------------------------------------------------------------------------
// Left rail: collections (expand in place) → articles
// ---------------------------------------------------------------------------

function Rail({ collection, article, onNavigate }: { collection?: HbCollection; article?: HbArticle; onNavigate?: () => void }) {
  const hb = getHandbook();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => activeRef.current?.scrollIntoView({ block: 'nearest' }), [article?.href]);

  return (
    <nav aria-label="Handbook" className="p-3 pb-12 text-sm">
      <Link
        to={HANDBOOK_BASE}
        onClick={onNavigate}
        className={`mb-3 flex items-center gap-2 rounded-lg px-2 py-1.5 font-display text-[15px] font-bold hover:text-brand-700 ${
          !collection ? 'text-brand-700' : 'text-slate-900'
        }`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient text-white">
          <Icon paths={['M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z']} className="h-4 w-4" />
        </span>
        Accounts Handbook
      </Link>
      <ul className="space-y-0.5">
        {hb.collections.map((c) => {
          const isCurrent = c === collection;
          const expanded = open[c.slug] ?? isCurrent;
          return (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [c.slug]: !expanded }))}
                aria-expanded={expanded}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${
                  isCurrent ? 'bg-slate-100/80 font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-md ${TILE[c.accent]}`}>
                  <Icon paths={c.icon} className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1">{c.title}</span>
                <span className="text-[11px] font-normal text-slate-400">{c.articles.length}</span>
                <span className="text-slate-400">{chevron(expanded)}</span>
              </button>
              {expanded && (
                <ul className="my-1 ml-[22px] border-l border-slate-200 pl-2">
                  {c.articles.map((a) => {
                    const active = a === article;
                    return (
                      <li key={a.href}>
                        <Link
                          ref={active ? activeRef : undefined}
                          to={a.href}
                          onClick={onNavigate}
                          aria-current={active ? 'page' : undefined}
                          className={`-ml-[9px] block border-l-2 py-1.5 pl-3 pr-2 text-[13px] leading-snug ${
                            active ? 'border-brand-500 font-semibold text-brand-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                          }`}
                        >
                          {a.title}
                        </Link>
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
// Home view
// ---------------------------------------------------------------------------

function HomeView() {
  const hb = getHandbook();
  const onClick = useContentLinks();
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const daily = QUICK_TASKS.filter((t) => t.code.startsWith('D'));
  const monthly = QUICK_TASKS.filter((t) => t.code.startsWith('M'));
  const chip = (t: (typeof QUICK_TASKS)[number]) => (
    <Link
      key={t.code}
      to={handbookHref(t.anchor)}
      className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 py-1 pl-1 pr-3 text-[13px] text-slate-700 shadow-soft transition hover:border-brand-300 hover:text-brand-800"
    >
      <span className="rounded-full bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-semibold text-white group-hover:bg-brand-600">{t.code}</span>
      {t.label}
    </Link>
  );

  return (
    <div>
      <section className="hb-hero border-b border-slate-200/70">
        <div className="mx-auto max-w-[1080px] px-4 pb-10 pt-10 sm:px-6 sm:pl-[104px] lg:pt-14">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">Heatronics · Accounts</p>
          <h1 className="mt-2 font-display text-[34px] font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-[42px]">Accounts Handbook</h1>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-slate-600">
            How our books are built and run — every system, the entry it posts, the ledger it lands in, and each daily and monthly task with screenshots.
          </p>
          <div className="mt-7 max-w-2xl">
            <HandbookSearch size="large" />
          </div>
          <div className="mt-6 flex flex-col gap-3 2xl:flex-row 2xl:flex-wrap 2xl:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Every day</span>
              {daily.map(chip)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Every month</span>
              {monthly.map(chip)}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="font-display text-xl font-extrabold tracking-tight text-slate-900">Browse by topic</h2>
          <span className="text-xs text-slate-500">
            {hb.collections.length} topics · {hb.articles.length} articles
          </span>
        </div>
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {hb.collections.map((c) => {
            const all = showAll[c.slug];
            const list = all ? c.articles : c.articles.slice(0, 4);
            return (
              <article key={c.slug} className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card transition hover:shadow-card-lg">
                <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${BAR[c.accent]} opacity-80`} />
                <Link to={c.href} className="flex items-start gap-3.5 p-5 pb-3">
                  <Tile c={c} />
                  <div className="min-w-0">
                    <h3 className="font-display text-[17px] font-bold leading-tight text-slate-900 hover:text-brand-700">{c.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{c.description}</p>
                  </div>
                </Link>
                <ul className="mx-5 border-t border-slate-100 py-2">
                  {list.map((a) => (
                    <li key={a.href}>
                      <Link to={a.href} className="flex items-center gap-2 py-1.5 text-[13.5px] text-slate-700 hover:text-brand-700">
                        <span className="h-1 w-1 flex-shrink-0 rounded-full bg-slate-300" />
                        <span className="truncate">{a.title}</span>
                      </Link>
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
            <div
              className="hb hb-cover rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
              onClick={onClick}
              dangerouslySetInnerHTML={{ __html: hb.coverHtml }}
            />
          </section>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collection view
// ---------------------------------------------------------------------------

function CollectionView({ c }: { c: HbCollection }) {
  return (
    <div className="mx-auto max-w-[880px] px-4 py-10 sm:px-8">
      <div className="flex items-start gap-4">
        <Tile c={c} size="lg" />
        <div>
          <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">{c.title}</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-slate-500">{c.description}</p>
          <p className="mt-2 text-xs font-medium text-slate-400">
            {c.articles.length} article{c.articles.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <ol className="mt-8 space-y-3">
        {c.articles.map((a, i) => (
          <li key={a.href}>
            <Link
              to={a.href}
              className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft transition hover:border-brand-200 hover:shadow-card"
            >
              <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-xs font-semibold text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-700">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15.5px] font-semibold text-slate-900 group-hover:text-brand-700">{a.title}</h2>
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
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Article view
// ---------------------------------------------------------------------------

/**
 * One article body. Memoised and kept mounted once opened (see ArticlePool),
 * so switching back to it is instant and its screenshots never reload.
 */
const ArticleBody = memo(function ArticleBody({ html, onClick }: { html: string; onClick: (e: React.MouseEvent<HTMLElement>) => void }) {
  return <div className="hb" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
});

function OnThisPage({ a, active, compact }: { a: HbArticle; active?: string; compact?: boolean }) {
  if (a.toc.length < 2) return null;
  return (
    <nav aria-label="On this page" className={compact ? 'rounded-xl border border-slate-200 bg-slate-50/60 p-4' : ''}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">On this page</div>
      <ul className={compact ? 'grid gap-x-6 gap-y-1 sm:grid-cols-2' : 'space-y-1 border-l border-slate-200'}>
        {a.toc.map((h) => (
          <li key={h.id}>
            <Link
              to={`${a.href}#${h.id}`}
              className={
                compact
                  ? 'block py-0.5 text-[13px] text-slate-600 hover:text-brand-700'
                  : `-ml-px block border-l-2 py-1 pl-3 text-[12.5px] leading-snug ${
                      active === h.id ? 'border-brand-500 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'
                    }`
              }
            >
              {h.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ArticleView({ a, opened }: { a: HbArticle; opened: HbArticle[] }) {
  const hb = getHandbook();
  const onClick = useContentLinks();
  const [active, setActive] = useState<string | undefined>();
  const c = a.collection;
  const idx = c.articles.indexOf(a);
  const gIdx = hb.articles.indexOf(a);
  const prev = hb.articles[gIdx - 1];
  const next = hb.articles[gIdx + 1];
  const visuals = hb.idToArticle.get(a.chapterId) === a ? TEAM_VISUALS[a.chapterId] ?? [] : [];

  // Scroll-spy for "On this page".
  useEffect(() => {
    const onScroll = () => {
      let cur: string | undefined;
      for (const h of a.toc) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top < 150) cur = h.id;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [a]);

  return (
    <div className="mx-auto flex max-w-[1180px] gap-10 px-4 py-8 sm:px-8">
      <article className="min-w-0 flex-1">
        <header className="mb-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link to={c.href} className="inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-brand-700">
              <span className={`flex h-5 w-5 items-center justify-center rounded ${TILE[c.accent]}`}>
                <Icon paths={c.icon} className="h-3 w-3" />
              </span>
              {c.title}
            </Link>
            <span className="text-slate-300">·</span>
            <span className="text-slate-400">
              {idx + 1} of {c.articles.length}
            </span>
            <TagPill tag={a.tag} />
          </div>
          <h1 className="mt-3 font-display text-[30px] font-extrabold leading-[1.15] tracking-tight text-slate-900">{a.title}</h1>
          {a.summary && <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-slate-500">{a.summary}</p>}
        </header>

        <div className="mb-6 2xl:hidden">
          <OnThisPage a={a} compact />
        </div>

        {/* Every article opened so far stays mounted; only the current one shows. */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-8">
          {opened.map((x) => (
            <div key={x.href} hidden={x !== a}>
              <ArticleBody html={x.html} onClick={onClick} />
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

        <nav className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Previous and next">
          {prev ? (
            <Link to={prev.href} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-card">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">← Previous · {prev.collection.title}</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-800 group-hover:text-brand-700">{prev.title}</div>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={next.href} className="group rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:border-brand-300 hover:shadow-card">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Next · {next.collection.title} →</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-800 group-hover:text-brand-700">{next.title}</div>
            </Link>
          )}
        </nav>

        {c.articles.length > 1 && (
          <section className="mt-8">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">More in {c.title}</h2>
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {c.articles
                .filter((x) => x !== a)
                .map((x) => (
                  <li key={x.href}>
                    <Link to={x.href} className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-700">
                      <span>{x.title}</span>
                      <span className="text-slate-300">{chevronRight}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </article>

      <aside className="hidden w-[220px] flex-shrink-0 2xl:block">
        <div className="sticky top-[136px]">
          <OnThisPage a={a} active={active} />
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page: one persistent shell for every view
// ---------------------------------------------------------------------------

export function HandbookPage() {
  const params = useParams();
  const location = useLocation();
  const hb = getHandbook();
  const [drawer, setDrawer] = useState(false);
  const [opened, setOpened] = useState<HbArticle[]>([]);

  const [cSlug, aSlug] = (params['*'] ?? '').split('/').filter(Boolean);
  const collection = cSlug ? hb.collections.find((x) => x.slug === cSlug) : undefined;
  const article = collection && aSlug ? collection.articles.find((x) => x.slug === aSlug) : undefined;

  // Keep every article the reader has opened mounted (instant back/forth).
  if (article && !opened.includes(article)) setOpened([...opened, article]);

  // Jump to #heading (settling after lazy screenshots load), else to the top.
  const viewKey = article?.href ?? collection?.href ?? HANDBOOK_BASE;
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) {
      window.scrollTo({ top: 0 });
      return;
    }
    const go = () => document.getElementById(id)?.scrollIntoView({ block: 'start' });
    requestAnimationFrame(go);
    const t1 = window.setTimeout(go, 250);
    const t2 = window.setTimeout(go, 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [viewKey, location.hash]);

  // Redirects: /handbook#<id>, older chapter URLs, unknown slugs.
  if (!cSlug) {
    const id = location.hash.slice(1);
    if (id && hb.idToArticle.has(id)) return <Navigate to={handbookHref(id)} replace />;
  } else if (!collection) {
    const legacy = hb.legacySlugs.get(cSlug);
    return <Navigate to={legacy ? handbookHref(location.hash.slice(1) || legacy) : HANDBOOK_BASE} replace />;
  } else if (aSlug && !article) {
    return <Navigate to={collection.href} replace />;
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[272px] flex-shrink-0 self-start overflow-y-auto overscroll-contain border-r border-slate-200/70 bg-white/70 backdrop-blur-xl xl:block">
        <Rail collection={collection} article={article} />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-14 z-30 flex h-12 items-center gap-3 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur-xl sm:px-6">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 xl:hidden"
          >
            <Icon paths={['M4 6h16M4 12h10M4 18h16']} className="h-4 w-4" />
            Browse
          </button>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-xs text-slate-500 sm:flex">
            <Link to={HANDBOOK_BASE} className={`flex-shrink-0 ${collection ? 'hover:text-slate-900' : 'font-medium text-slate-900'}`}>
              Handbook
            </Link>
            {collection && (
              <>
                <span className="text-slate-300">/</span>
                <Link to={collection.href} className={`flex-shrink-0 ${article ? 'hover:text-slate-900' : 'font-medium text-slate-900'}`}>
                  {collection.title}
                </Link>
              </>
            )}
            {article && (
              <>
                <span className="text-slate-300">/</span>
                <span className="truncate font-medium text-slate-900">{article.title}</span>
              </>
            )}
          </nav>
          {collection && (
            <div className="ml-auto w-48 flex-shrink-0 sm:w-80">
              <HandbookSearch />
            </div>
          )}
        </div>

        <div hidden={!!collection}>
          <HomeView />
        </div>
        {collection && !article && <CollectionView c={collection} />}
        {/* Stays mounted after the first article is opened, so returning to any
            article (from a list, the home or back button) is instant. */}
        {opened.length > 0 && (
          <div hidden={!article}>
            <ArticleView a={article ?? opened[opened.length - 1]} opened={opened} />
          </div>
        )}
      </div>

      <Drawer open={drawer} onClose={() => setDrawer(false)} side="left" width={320} title="Browse the handbook">
        <div className="-m-4">
          <Rail collection={collection} article={article} onNavigate={() => setDrawer(false)} />
        </div>
      </Drawer>
    </div>
  );
}

/** Redirects an old SOP / guide route to the handbook article that replaced it. */
export function HandbookRedirect({ anchor }: { anchor: string }) {
  return <Navigate to={handbookHref(anchor)} replace />;
}
