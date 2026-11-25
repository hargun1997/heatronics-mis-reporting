// App shell (design-system/heatronics-mis/MASTER.md): the dark Ops-style sidebar (components/shell/AppNav,
// menu from nav/config.ts), ⌘K palette, and the page. Records each opened page for the palette's "Recent".
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppNav } from '../components/shell/AppNav';
import { CommandPalette } from '../components/shell/CommandPalette';
import { ShellContext } from '../components/shell/ShellContext';
import { pushRecent } from '../components/shell/prefs';
import { PageErrorBoundary } from '../components/shell/PageErrorBoundary';
import { Skeleton } from '../components/ui/states';
import { whereIs } from '../nav/config';
import { pageAllowed, useHtxPages } from '../components/shell/useHtxPages';

// The chats pull in the Live MIS deck / the handbook: loaded after the shell, in their own chunks.
const FloatingChat = lazy(() => import('../components/chat/FloatingChat').then((m) => ({ default: m.FloatingChat })));
const SopChat = lazy(() => import('../components/chat/SopChat').then((m) => ({ default: m.SopChat })));

/** While a page's chunk loads: a thin bar at the top (the click landed) and a skeleton in the page's shape, not text. */
function PageLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <div className="route-bar fixed left-0 right-0 top-0 z-toast h-0.5 bg-cta" aria-hidden />
      <div className="mx-auto max-w-page px-4 py-6 sm:px-6">
        <div className="mb-6 h-7 w-48 animate-pulse rounded bg-stone-200" />
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-stone-200" />)}</div>
        <Skeleton lines={6} />
      </div>
    </div>
  );
}

export function MainLayout() {
  const path = useLocation().pathname;
  const pages = useHtxPages();
  const blocked = !pageAllowed(pages, whereIs(path)?.page.id);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const shell = useMemo(() => ({ paletteOpen, openPalette, closePalette }), [paletteOpen, openPalette, closePalette]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const w = whereIs(path);
    if (w) pushRecent({ href: path, label: w.page.label, context: w.section.label });
    document.title = w ? `${w.page.label} · Heatronics MIS` : 'Heatronics MIS';
    // A new page opens at the top (it used to keep the last page's scroll position).
    window.scrollTo(0, 0);
  }, [path]);

  return (
    <ShellContext.Provider value={shell}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-toast focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-card">Skip to content</a>
      <AppNav />
      <div className="app-content min-h-screen bg-stone-50 text-stone-900">
        {/* pb-12 + PageBody pb-10 = 88 px: the floating chat button (48 high, 20 from the bottom) never covers the last row. */}
        <main id="main" tabIndex={-1} className="min-w-0 pb-12 focus:outline-none print:pb-0">
          <PageErrorBoundary key={path}>
            <Suspense fallback={<PageLoading />}>
              {blocked ? (
                <div className="mx-auto max-w-md p-6">
                  <h1 className="text-lg font-semibold text-stone-900">You cannot open this page</h1>
                  <p className="mt-2 text-sm text-stone-600">Ask Hargun to give your team this page on portal.heatronics.in.</p>
                </div>
              ) : <Outlet />}
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>
      <CommandPalette />
      <Suspense fallback={null}>{path.startsWith('/handbook') ? <SopChat /> : (path.startsWith('/reporting/mis/insights') || path.startsWith('/booking-assistant')) ? null /* pages with their own chat get no second one */ : <FloatingChat />}</Suspense>
    </ShellContext.Provider>
  );
}
