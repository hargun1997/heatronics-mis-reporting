// ----------------------------------------------------------------------------
// Accounts Handbook — the one accounting knowledge base in the app.
//
// Renders client/src/content/handbook/handbook.html (single source, also the
// shareable artifact) natively inside the app: a nested Parts → Chapters →
// Sections navigator with full-text search on the left, one chapter per route
// (/handbook/:chapter) with previous/next, and the team's uploaded screenshot
// slots under the chapter they belong to. The old /guide/sop/* SOP pages
// redirect into the matching chapter (see App.tsx).
// ----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { NavCard } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/overlays';
import { SopVisual } from '../../components/ui/SopVisual';
import {
  HANDBOOK_BASE,
  getHandbook,
  handbookHref,
  type HbChapter,
} from '../../data/handbook/handbook';
import { TEAM_VISUALS } from '../../data/handbook/teamVisuals';
import { TOPIC_GROUPS } from '../../data/handbook/topics';
import { HandbookSearch } from './HandbookSearch';
import './handbook.generated.css';

const bookIcon = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
);

const chevron = (open: boolean) => (
  <svg className={`h-3 w-3 transition-transform ${open ? '' : '-rotate-90'}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
  </svg>
);

// ---------------------------------------------------------------------------
// Navigator
// ---------------------------------------------------------------------------

function HandbookNav({
  current,
  activeSub,
  onNavigate,
}: {
  current?: HbChapter;
  activeSub?: string;
  onNavigate?: () => void;
}) {
  const hb = getHandbook();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [current?.id]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-200/70">
        <Link
          to={HANDBOOK_BASE}
          onClick={onNavigate}
          className="flex items-center gap-2 px-1 font-display font-bold text-[15px] text-slate-900 hover:text-brand-700"
        >
          <span className="w-7 h-7 rounded-lg bg-brand-gradient text-white flex items-center justify-center">{bookIcon}</span>
          Accounts Handbook
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain p-2 pb-10" aria-label="Handbook contents">
        {hb.parts.map((p) => {
            const isClosed = closed[p.id] && current?.partId !== p.id;
            return (
              <div key={p.id} className="mt-1">
                <button
                  type="button"
                  onClick={() => setClosed((c) => ({ ...c, [p.id]: !c[p.id] }))}
                  aria-expanded={!isClosed}
                  className="w-full flex items-start gap-1.5 rounded-lg px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                >
                  <span className="mt-[3px]">{chevron(!isClosed)}</span>
                  <span>
                    {p.eyebrow} · {p.title}
                  </span>
                </button>
                {!isClosed && (
                  <ul className="space-y-0.5">
                    {p.chapters.map((c) => {
                      const active = current?.id === c.id;
                      return (
                        <li key={c.id}>
                          <Link
                            ref={active ? activeRef : undefined}
                            to={`${HANDBOOK_BASE}/${c.slug}`}
                            onClick={onNavigate}
                            aria-current={active ? 'page' : undefined}
                            className={`flex gap-2 rounded-lg px-2.5 py-1.5 text-[13.5px] leading-snug ${
                              active ? 'bg-brand-50 text-brand-800 font-semibold' : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span className={`font-mono text-[11.5px] min-w-[24px] pt-px ${active ? 'text-brand-700' : 'text-slate-400'}`}>{c.no}</span>
                            <span>{c.title}</span>
                          </Link>
                          {active && c.subs.length > 0 && (
                            <ul className="ml-9 my-1 border-l border-slate-200">
                              {c.subs.map((s) => (
                                <li key={s.id}>
                                  <Link
                                    to={`${HANDBOOK_BASE}/${c.slug}#${s.id}`}
                                    onClick={onNavigate}
                                    className={`block -ml-px border-l-2 px-3 py-1 text-[12.5px] leading-snug ${
                                      activeSub === s.id
                                        ? 'border-brand-500 text-brand-700 font-medium'
                                        : 'border-transparent text-slate-500 hover:text-slate-800'
                                    }`}
                                  >
                                    {s.title}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content: in-handbook links (#c16, #s3 …) route to the right chapter.
// ---------------------------------------------------------------------------

function useHandbookLinks() {
  const navigate = useNavigate();
  return (e: React.MouseEvent<HTMLElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    e.preventDefault();
    const id = href.slice(1);
    const ch = getHandbook().idToChapter.get(id);
    if (id === 'c0' || !ch) {
      navigate(HANDBOOK_BASE);
      return;
    }
    navigate(ch.id === id ? `${HANDBOOK_BASE}/${ch.slug}` : `${HANDBOOK_BASE}/${ch.slug}#${id}`);
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function HandbookPage() {
  const { chapter: slug } = useParams();
  const location = useLocation();
  const hb = getHandbook();
  const ch = slug ? hb.bySlug.get(slug) : undefined;
  const [drawer, setDrawer] = useState(false);
  const [activeSub, setActiveSub] = useState<string | undefined>();
  const contentRef = useRef<HTMLDivElement>(null);
  const onContentClick = useHandbookLinks();

  // Jump to the #section, or to the top when the chapter changes.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) {
      // Screenshots above the target load lazily and shift the layout, so
      // settle the jump a couple of times.
      const go = () => document.getElementById(id)?.scrollIntoView({ block: 'start' });
      requestAnimationFrame(go);
      const t1 = window.setTimeout(go, 250);
      const t2 = window.setTimeout(go, 800);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [slug, location.hash]);

  // Scroll-spy: highlight the section being read.
  useEffect(() => {
    if (!ch) return;
    const onScroll = () => {
      let cur: string | undefined;
      for (const s of ch.subs) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top < 140) cur = s.id;
      }
      setActiveSub(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ch]);

  if (slug && !ch) return <Navigate to={HANDBOOK_BASE} replace />;
  // Deep link by section id, e.g. /handbook#c16-m2-shiprocket (used by task references).
  if (!slug && location.hash.length > 1 && hb.idToChapter.has(location.hash.slice(1))) {
    return <HandbookRedirect anchor={location.hash.slice(1)} />;
  }

  const idx = ch ? hb.chapters.indexOf(ch) : -1;
  const prev = idx > 0 ? hb.chapters[idx - 1] : undefined;
  const next = ch ? hb.chapters[idx + 1] : hb.chapters[0];
  const part = ch ? hb.parts.find((p) => p.id === ch.partId) : undefined;
  const visuals = ch ? TEAM_VISUALS[ch.id] ?? [] : [];

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Desktop navigator */}
      <aside className="hidden xl:block w-[284px] flex-shrink-0 border-r border-slate-200/70 bg-white/70 backdrop-blur-xl sticky top-14 self-start h-[calc(100vh-3.5rem)]">
        <HandbookNav current={ch} activeSub={activeSub} />
      </aside>

      <div className="flex-1 min-w-0">
        {/* Compact bar: contents button below xl + where you are */}
        <div className="sticky top-14 z-30 flex items-center gap-3 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl px-4 sm:px-6 h-11">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="xl:hidden inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" d="M4 6h16M4 12h10M4 18h16" />
            </svg>
            Contents
          </button>
          <div className="min-w-0 truncate text-xs text-slate-500">
            <Link to={HANDBOOK_BASE} className="hover:text-slate-800">Accounts Handbook</Link>
            {part && <span> › {part.eyebrow}</span>}
            {ch && (
              <span className="text-slate-800 font-medium"> › {ch.no} {ch.title}</span>
            )}
            {ch && activeSub && (
              <span> › {ch.subs.find((s) => s.id === activeSub)?.title}</span>
            )}
          </div>
          {ch && (
            <div className="ml-auto w-44 sm:w-72 flex-shrink-0">
              <HandbookSearch />
            </div>
          )}
        </div>

        {!ch ? (
          <>
            <PageHeader
              title="Accounts Handbook"
              description="How Heatronics' books are built and run: every system, the voucher it posts, the control ledger it lands in, the daily and monthly tasks with screenshots, the open findings and the FAQ. One source for the accountant and the CA."
              crumbs={[{ label: 'Accounts Handbook' }]}
              accent="brand"
              icon={bookIcon}
            />
            <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-10">
              <HandbookSearch size="large" />

              {TOPIC_GROUPS.map((g) => {
                const icon = (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    {g.icon.map((d) => (
                      <path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />
                    ))}
                  </svg>
                );
                return (
                  <section key={g.heading}>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{g.heading}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {g.topics.map((t) => (
                        <NavCard
                          key={t.anchor}
                          to={handbookHref(t.anchor)}
                          title={t.title}
                          description={t.description}
                          icon={icon}
                          accent={g.accent}
                          badge={hb.idToChapter.get(t.anchor)?.no}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}

              <div
                className="hb hb-cover rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-card"
                onClick={onContentClick}
                dangerouslySetInnerHTML={{ __html: hb.coverHtml }}
              />

              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">All chapters</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {hb.parts.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">{p.eyebrow}</div>
                      <div className="mt-0.5 font-display text-lg font-extrabold text-slate-900">{p.title}</div>
                      {p.blurb && <p className="mt-1 text-sm text-slate-500">{p.blurb}</p>}
                      <ul className="mt-3 divide-y divide-slate-100">
                        {p.chapters.map((c) => (
                          <li key={c.id}>
                            <Link to={`${HANDBOOK_BASE}/${c.slug}`} className="flex gap-3 py-2 text-sm text-slate-700 hover:text-brand-700">
                              <span className="font-mono text-xs text-brand-700 min-w-[26px] pt-0.5">{c.no}</span>
                              <span>{c.title}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="max-w-[1040px] mx-auto px-4 sm:px-6 py-8 space-y-6">
            <div ref={contentRef} className="hb" onClick={onContentClick} dangerouslySetInnerHTML={{ __html: ch.html }} />

            {visuals.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                <h3 className="font-semibold text-slate-900">Team screenshots</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Upload a current screen for any slot; it replaces the previous one for everyone.
                </p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visuals.map((v) => (
                    <SopVisual key={v.key} placeholderKey={v.key} label={v.label} />
                  ))}
                </div>
              </section>
            )}

            <nav className="grid grid-cols-2 gap-3" aria-label="Chapter navigation">
              {prev ? (
                <Link to={`${HANDBOOK_BASE}/${prev.slug}`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-card">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">← Previous</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-800">{prev.no} · {prev.title}</div>
                </Link>
              ) : <span />}
              {next && (
                <Link to={`${HANDBOOK_BASE}/${next.slug}`} className="rounded-xl border border-slate-200 bg-white p-4 text-right hover:border-brand-300 hover:shadow-card">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">Next →</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-800">{next.no} · {next.title}</div>
                </Link>
              )}
            </nav>
          </div>
        )}
      </div>

      <Drawer open={drawer} onClose={() => setDrawer(false)} side="left" width={320} title="Contents">
        <div className="-m-4 h-[calc(100vh-4rem)]">
          <HandbookNav current={ch} activeSub={activeSub} onNavigate={() => setDrawer(false)} />
        </div>
      </Drawer>
    </div>
  );
}

/** Redirects an old SOP / guide route to the handbook section that replaced it. */
export function HandbookRedirect({ anchor }: { anchor: string }) {
  const hb = getHandbook();
  const ch = hb.idToChapter.get(anchor);
  if (!ch || anchor === 'c0') return <Navigate to={HANDBOOK_BASE} replace />;
  return <Navigate to={ch.id === anchor ? `${HANDBOOK_BASE}/${ch.slug}` : `${HANDBOOK_BASE}/${ch.slug}#${anchor}`} replace />;
}
