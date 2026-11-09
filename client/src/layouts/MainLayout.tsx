// App shell (design-system/heatronics-mis/MASTER.md): the dark Ops-style sidebar (components/shell/AppNav,
// menu from nav/config.ts), ⌘K palette, and the page. Records each opened page for the palette's "Recent".
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppNav } from '../components/shell/AppNav';
import { CommandPalette } from '../components/shell/CommandPalette';
import { ShellContext } from '../components/shell/ShellContext';
import { pushRecent } from '../components/shell/prefs';
import { whereIs } from '../nav/config';

// The chats pull in the Live MIS deck / the handbook: loaded after the shell, in their own chunks.
const FloatingChat = lazy(() => import('../components/chat/FloatingChat').then((m) => ({ default: m.FloatingChat })));
const SopChat = lazy(() => import('../components/chat/SopChat').then((m) => ({ default: m.SopChat })));

function PageLoading() {
  return <div role="status" aria-live="polite" className="p-6 text-sm text-slate-500">Loading…</div>;
}

export function MainLayout() {
  const path = useLocation().pathname;
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
  }, [path]);

  return (
    <ShellContext.Provider value={shell}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-card">Skip to content</a>
      <AppNav />
      <div className="app-content min-h-screen bg-stone-50 text-stone-900">
        <main id="main" tabIndex={-1} className="min-w-0 focus:outline-none">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CommandPalette />
      <Suspense fallback={null}>{path.startsWith('/handbook') ? <SopChat /> : <FloatingChat />}</Suspense>
    </ShellContext.Provider>
  );
}
