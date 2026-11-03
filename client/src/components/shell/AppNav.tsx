// Global navigation — a port of Ops' components/ui/AppNav.tsx (design-system/heatronics-mis/MASTER.md
// "Layout & navigation"). Reads nav/config.ts, the one source of truth. Two levels only: section → page.
//   Top: brand, collapse, "Search or jump to… ⌘K". Then Pinned (localStorage) and every section (Admin included) in one
//   scrolling list, the current page scrolled into view; at the bottom only Claude status + Compact + Theme.
//   Issues carries a live open count.
// Desktop: fixed 248 px dark rail, collapsible to a 64 px icon rail (tooltips + sr-only labels).
// < 1024 px: top bar (Menu, brand, Search) + the same list in a modal drawer (focus trapped, Esc closes,
// focus returns to the Menu button). Keyboard: ↑ / ↓ move between items, Home / End jump.
import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Pin, Rows3, Search, Sun, X } from 'lucide-react';
import { HOME, sidebarSections, whereIs, type NavPage } from '../../nav/config';
import { NAV_ICON } from './navIcons';
import { K, store, usePins, useTheme } from './prefs';
import { useShell } from './ShellContext';
import { useOverlay } from './useOverlay';
import { cx } from './cx';
import { useDensity } from '../../hooks/useDensity';
import { ClaudeStatusPill } from '../ClaudeStatusPill';
import { useIssueCount } from '../../data/issues/useIssueCount';

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nav-accent focus-visible:ring-offset-2 focus-visible:ring-offset-nav-bg';
const isMac = () => { try { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent); } catch { return false; } };

export function AppNav() {
  const path = useLocation().pathname || '/';
  const { openPalette } = useShell();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => store.get(K.collapsed) === '1');
  const [mac] = useState(isMac);
  const { theme, next: nextTheme } = useTheme();
  const [density, setDensity] = useDensity();
  const { pins, toggle: togglePin } = usePins();
  const drawer = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => { document.documentElement.dataset.nav = collapsed ? 'collapsed' : 'open'; }, [collapsed]);
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); setOpen(false); }
  useEffect(() => {
    const t = () => setCollapsed((c) => { store.set(K.collapsed, c ? '0' : '1'); return !c; });
    window.addEventListener('mis:rail', t);
    return () => window.removeEventListener('mis:rail', t);
  }, []);
  useOverlay(open, drawer, () => setOpen(false), { initialFocus: closeBtn });

  const sections = sidebarSections();
  const here = whereIs(path);
  const main = sections;
  const issues = useIssueCount();
  useEffect(() => {
    // the current page always visible in the rail (a long menu used to hide the last tools under the footer)
    const t = setTimeout(() => document.querySelector<HTMLElement>('aside [data-nav-item][aria-current="page"]')?.scrollIntoView({ block: 'nearest' }), 50);
    return () => clearTimeout(t);
  }, [path, collapsed]);
  const toggleRail = () => setCollapsed((c) => { store.set(K.collapsed, c ? '0' : '1'); return !c; });

  const onKey = (e: RKeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-nav-item]')).filter((el) => el.getClientRects().length > 0);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[n]?.focus();
  };

  const row = (p: NavPage, mini: boolean) => {
    const on = here?.page.id === p.id;
    const Icon = NAV_ICON[p.icon];
    return (
      <li key={p.id} className="relative">
        <Link to={p.href} data-nav-item aria-current={on ? 'page' : undefined} title={mini ? p.label : undefined}
          className={cx('group/row relative flex min-h-[44px] items-center gap-3 rounded-lg text-sm transition-colors lg:min-h-[38px]', ring,
            mini ? 'justify-center' : 'px-3',
            on ? 'bg-nav-active font-medium text-nav-strong' : 'text-nav-fg hover:bg-nav-hover hover:text-nav-strong')}>
          {on && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-nav-accent" aria-hidden />}
          <Icon className={cx('h-[18px] w-[18px] shrink-0', on ? 'text-nav-accent' : 'text-nav-muted group-hover/row:text-nav-fg')} aria-hidden />
          {mini ? <span className="sr-only">{p.label}</span> : <span className="min-w-0 flex-1 truncate">{p.label}</span>}
          {p.id === 'issues' && issues && issues.open > 0 && (
            <span className={cx('rounded-full px-1.5 text-xs font-semibold tabular-nums', mini ? 'absolute right-1 top-1 min-w-[18px] text-center leading-[18px]' : 'leading-5',
              issues.high > 0 ? 'bg-red-500 text-white' : 'bg-nav-hover text-nav-strong')} aria-label={`${issues.open} open${issues.high ? `, ${issues.high} high` : ''}`}>{issues.open}</span>
          )}
        </Link>
      </li>
    );
  };

  const footBtn = (mini: boolean, onClick: () => void, icon: React.ReactNode, label: string, value: string, pressed?: boolean) => (
    <button type="button" onClick={onClick} data-nav-item title={mini ? `${label}: ${value}` : undefined} aria-pressed={pressed}
      className={cx('mt-0.5 flex min-h-[44px] w-full items-center gap-3 rounded-lg text-sm text-nav-fg transition-colors hover:bg-nav-hover hover:text-nav-strong lg:min-h-[38px]', ring, mini ? 'justify-center' : 'px-3')}>
      {icon}
      {mini ? <span className="sr-only">{label} {value}, switch</span> : <>
        <span className="flex-1 text-left">{label}<span className="sr-only">:</span></span>
        <span className="rounded-md bg-nav-hover px-1.5 py-0.5 text-xs font-medium capitalize text-nav-fg">{value}</span><span className="sr-only">, switch</span>
      </>}
    </button>
  );

  const themeIcon = theme === 'dark' ? <Moon className="h-[18px] w-[18px] text-nav-muted" aria-hidden /> : theme === 'light' ? <Sun className="h-[18px] w-[18px] text-nav-muted" aria-hidden /> : <Monitor className="h-[18px] w-[18px] text-nav-muted" aria-hidden />;

  const searchBtn = (mini: boolean) => (
    <button type="button" onClick={openPalette} data-nav-item aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'} title={mini ? `Search (${mac ? '⌘' : 'Ctrl '}K)` : undefined}
      className={cx('flex min-h-[44px] w-full items-center gap-2.5 rounded-lg border border-nav-border bg-nav-hover/60 text-sm text-nav-fg transition-colors hover:text-nav-strong lg:min-h-[38px]', ring, mini ? 'justify-center' : 'px-3')}>
      <Search className="h-4 w-4 shrink-0 text-nav-muted" aria-hidden />
      {mini && <span className="sr-only">Search or jump to a page</span>}
      {!mini && <><span className="min-w-0 flex-1 truncate text-left">Search or jump to…</span><kbd className="hidden rounded border border-nav-border px-1.5 font-sans text-xs text-nav-fg lg:inline" aria-hidden>{mac ? '⌘K' : 'Ctrl K'}</kbd></>}
    </button>
  );

  const list = (mini: boolean) => (
    <div onKeyDown={onKey} className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pb-1 pt-1">{searchBtn(mini)}</div>
      <div className={cx('nav-scroll flex-1 space-y-4 px-2 py-2', mini ? 'overflow-visible' : 'overflow-y-auto')}>
        {pins.length > 0 && !mini && (
          <div>
            <h2 className="mb-1 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-nav-muted">Pinned</h2>
            <ul className="space-y-0.5">
              {pins.map((p) => {
                const on = path === p.href.split('?')[0];
                return (
                  <li key={p.href} className="group/pin relative">
                    <Link to={p.href} data-nav-item aria-current={on ? 'page' : undefined}
                      className={cx('flex min-h-[44px] items-center gap-3 rounded-lg px-3 pr-10 text-sm lg:min-h-[36px]', ring, on ? 'bg-nav-active text-nav-strong' : 'text-nav-fg hover:bg-nav-hover hover:text-nav-strong')}>
                      <Pin className="h-3.5 w-3.5 shrink-0 text-nav-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{p.label}{p.context && <span className="text-nav-muted"> · {p.context}</span>}</span>
                    </Link>
                    <button type="button" onClick={() => togglePin(p)} aria-label={`Unpin ${p.label}`}
                      className={cx('absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-nav-muted opacity-0 hover:bg-nav-border hover:text-nav-strong focus-visible:opacity-100 group-hover/pin:opacity-100 max-lg:opacity-100', ring)}>
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {main.map((s) => (
          <div key={s.id}>
            {mini ? <div className="mx-3 mb-2 border-t border-nav-border" aria-hidden /> : <h2 className="mb-1 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-nav-muted">{s.label}</h2>}
            <ul className="space-y-0.5" aria-label={mini ? s.label : undefined}>{s.pages.map((p) => row(p, mini))}</ul>
          </div>
        ))}
      </div>
      <div className="border-t border-nav-border px-2 py-2">
        {mini ? <>
          {footBtn(true, () => setDensity(density === 'compact' ? 'comfortable' : 'compact'), <Rows3 className="h-[18px] w-[18px] text-nav-muted" aria-hidden />, 'Compact', density === 'compact' ? 'on' : 'off', density === 'compact')}
          {footBtn(true, nextTheme, themeIcon, 'Theme', theme)}
        </> : (
          <div className="mt-1 flex items-center gap-1 px-1">
            <ClaudeStatusPill dark />
            <button type="button" onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')} data-nav-item aria-pressed={density === 'compact'}
              title={density === 'compact' ? 'Compact view on' : 'Compact view off'} aria-label="Compact view"
              className={cx('ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-nav-hover hover:text-nav-strong lg:h-9 lg:w-9', ring, density === 'compact' ? 'bg-nav-active text-nav-strong' : 'text-nav-muted')}>
              <Rows3 className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <button type="button" onClick={nextTheme} data-nav-item title={`Theme: ${theme} (click to switch)`} aria-label={`Theme ${theme}, switch`}
              className={cx('inline-flex h-11 w-11 items-center justify-center rounded-lg text-nav-muted hover:bg-nav-hover hover:text-nav-strong lg:h-9 lg:w-9', ring)}>
              {themeIcon}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const brand = (mini: boolean, light = false) => (
    <Link to={HOME} className={cx('inline-flex h-11 min-w-0 items-center gap-2.5 whitespace-nowrap rounded-lg text-[15px] font-semibold tracking-tight', light ? 'text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500' : cx('text-nav-strong', ring), mini ? 'justify-center px-2' : 'px-1')}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-heat-600 shadow-[0_0_0_3px_rgb(var(--heat-600)/0.18)]" aria-hidden><span className="h-2 w-2 rounded-full bg-[#fff]" /></span>
      {mini ? <span className="sr-only">Heatronics MIS</span> : <span>Heatronics <span className={light ? 'text-stone-500' : 'text-nav-muted'}>MIS</span></span>}
    </Link>
  );

  return (
    <>
      <aside className={cx('fixed bottom-0 left-0 top-[var(--htx-bar-h,0px)] z-[80] hidden flex-col border-r border-nav-border bg-nav-bg print:hidden lg:flex', collapsed ? 'w-16' : 'w-[248px]')}>
        <div className={cx('flex h-14 shrink-0 items-center', collapsed ? 'justify-center px-1' : 'justify-between pl-3 pr-1.5')}>
          {!collapsed && brand(false)}
          <button type="button" onClick={toggleRail} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar to icons'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cx('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-nav-muted hover:bg-nav-hover hover:text-nav-strong', ring)}>
            {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden /> : <PanelLeftClose className="h-5 w-5" aria-hidden />}
          </button>
        </div>
        <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">{list(collapsed)}</nav>
      </aside>

      <header className="sticky top-[var(--htx-bar-h,0px)] z-[80] border-b border-stone-200 bg-white/90 backdrop-blur print:hidden lg:hidden">
        <div className="flex h-14 items-center gap-1 px-2 sm:px-4">
          <button type="button" className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="app-menu" aria-haspopup="dialog">
            <Menu className="h-5 w-5" aria-hidden />Menu
          </button>
          {brand(false, true)}
          <div className="ml-auto flex items-center gap-1">
            <span className="max-sm:hidden"><ClaudeStatusPill compact /></span>
            <button type="button" onClick={openPalette} aria-label="Search or jump to a page" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
              <Search className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[95] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" tabIndex={-1} className="absolute inset-0 animate-fade-in bg-scrim/50" onClick={() => setOpen(false)} />
          <div id="app-menu" ref={drawer} tabIndex={-1} className="absolute inset-y-0 left-0 flex w-[86vw] max-w-[320px] flex-col bg-nav-bg shadow-2xl">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-nav-border pl-3 pr-1">
              {brand(false)}
              <button ref={closeBtn} type="button" onClick={() => setOpen(false)} aria-label="Close menu" className={cx('inline-flex h-11 w-11 items-center justify-center rounded-lg text-nav-fg hover:bg-nav-hover', ring)}><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col pt-2">{list(false)}</nav>
          </div>
        </div>
      )}
    </>
  );
}
