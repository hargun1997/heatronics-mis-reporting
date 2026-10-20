import { useState, type ReactNode } from 'react';
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
import { readFold, useDensity, writeFold } from '../hooks/useDensity';
import { HeatronicsMark } from '../components/HeatronicsLogo';
import { ClaudeStatusPill } from '../components/ClaudeStatusPill';
import { Drawer } from '../components/ui/overlays';
import { FloatingChat } from '../components/chat/FloatingChat';
import { SopChat } from '../components/chat/SopChat';

// ---- nav model -------------------------------------------------------------

interface NavLeaf {
  path: string;
  label: string;
  icon: ReactNode;
  match?: (p: string) => boolean;
  muted?: boolean;       // old pages — quieter
}
interface NavSection {
  label: string;
  collapsedByDefault?: boolean;
  items: NavLeaf[];
}

const ico = (d: string | string[]) => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
  </svg>
);

// The deck is the base /reporting/mis route; the sub-pages below have their own.
const isDeck = (p: string) =>
  p.startsWith('/reporting/mis') &&
  !['/live', '/close', '/connectors', '/ingest', '/rulebook', '/insights', '/chat', '/issues', '/ownership', '/send'].some((s) => p.startsWith('/reporting/mis' + s));

const I = {
  tasks: ico(['M9 11l3 3 8-8', 'M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9']),
  book: ico(['M4 19.5A2.5 2.5 0 016.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z']),
  booking: ico(['M4 5h16v14H4z', 'M4 9h16', 'M9 9v10', 'M13 13h4M13 16h4']),
  live: ico('M3 12h4l3 8 4-16 3 8h4'),
  upload: ico(['M12 15V3', 'M8 7l4-4 4 4', 'M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2']),
  issues: ico(['M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z', 'M12 8v4m0 3h.01']),
  send: ico(['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z']),
  ai: ico(['M13 3l2.2 6.8L22 12l-6.8 2.2L13 21l-2.2-6.8L4 12l6.8-2.2z']),
  sources: ico(['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z']),
  rules: ico(['M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z', 'M8 8h8M8 12h8M8 16h5']),
  people: ico(['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8z', 'M23 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75']),
  tools: ico(['M14 7l3 3-8 8H6v-3z', 'M4 20h16']),
  close: ico('M20 6L9 17l-5-5'),
  deck: ico(['M4 5h16v14H4z', 'M4 10h16', 'M10 5v14']),
};

// Ordered by how often people use them: everyday work first, MIS next,
// one-time setup folded away at the bottom.
const SECTIONS: NavSection[] = [
  {
    label: 'My work',
    items: [
      { path: '/tasks', label: 'Tasks', icon: I.tasks, match: (p) => p === '/tasks' || p === '/tasks/' },
      { path: '/handbook', label: 'Accounts Handbook', icon: I.book, match: (p) => p.startsWith('/guide') || p.startsWith('/handbook') },
      { path: '/booking-assistant', label: 'Booking assistant', icon: I.booking, match: (p) => p.startsWith('/booking-assistant') },
    ],
  },
  {
    label: 'MIS report',
    items: [
      { path: '/reporting/mis/live', label: 'Live MIS', icon: I.live, match: (p) => p.startsWith('/reporting/mis/live') },
      { path: '/reporting/mis/ingest', label: 'Upload data', icon: I.upload, match: (p) => p.startsWith('/reporting/mis/ingest') },
      { path: '/reporting/mis/issues', label: 'Data issues', icon: I.issues, match: (p) => p.startsWith('/reporting/mis/issues') },
      { path: '/reporting/mis/send', label: 'Send report', icon: I.send, match: (p) => p.startsWith('/reporting/mis/send') },
      { path: '/reporting/mis/insights', label: 'AI insights', icon: I.ai, match: (p) => p.startsWith('/reporting/mis/insights') || p.startsWith('/reporting/mis/chat') },
    ],
  },
  {
    label: 'Setup',
    collapsedByDefault: true,
    items: [
      { path: '/tasks/settings', label: 'People & reminders', icon: I.people, match: (p) => p.startsWith('/tasks/settings') },
      { path: '/reporting/mis/connectors', label: 'Data sources', icon: I.sources, match: (p) => p.startsWith('/reporting/mis/connectors') },
      { path: '/reporting/mis/rulebook', label: 'Data rulebook', icon: I.rules, match: (p) => p.startsWith('/reporting/mis/rulebook') },
      { path: '/tools', label: 'Tools', icon: I.tools, match: (p) => p.startsWith('/tools') },
      { path: '/reporting/mis/close', label: 'Month close (old)', muted: true, icon: I.close, match: (p) => p.startsWith('/reporting/mis/close') },
      { path: '/reporting/mis', label: 'MIS deck (old)', muted: true, icon: I.deck, match: isDeck },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);

const chevron = (open: boolean) => (
  <svg className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
  </svg>
);

function Leaf({ it, active, onNavigate, mini }: { it: NavLeaf; active: boolean; onNavigate?: () => void; mini?: boolean }) {
  const base =
    'group relative flex items-center gap-3 rounded-lg text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ' +
    (mini ? 'h-10 w-10 justify-center mx-auto ' : 'h-10 px-3 ') +
    (active
      ? 'bg-brand-50 text-brand-800 font-semibold'
      : it.muted
        ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100');
  const iconCls = active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600';
  return (
    <NavLink
      to={it.path}
      end={it.path === '/reporting/mis'}
      className={base}
      onClick={onNavigate}
      title={mini ? it.label : undefined}
      aria-label={mini ? it.label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {active && !mini && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand-500" aria-hidden="true" />}
      <span className={iconCls}>{it.icon}</span>
      {!mini && <span className="truncate">{it.label}</span>}
    </NavLink>
  );
}

function Section({ section, path, onNavigate }: { section: NavSection; path: string; onNavigate?: () => void }) {
  const key = 'nav:' + section.label;
  const inside = section.items.some((it) => it.match?.(path));
  const [open, setOpen] = useState(() => readFold(key, !section.collapsedByDefault));
  const shown = open || inside;
  const toggle = () => {
    const next = !shown;
    setOpen(next);
    writeFold(key, next);
  };
  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={shown}
        className="flex h-8 w-full items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {section.label}
        <span className="ml-auto text-slate-400">{chevron(shown)}</span>
      </button>
      {shown && (
        <div className="mt-0.5 space-y-0.5">
          {section.items.map((it) => (
            <Leaf key={it.path} it={it} active={it.match?.(path) ?? false} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function RailNav({ path, onNavigate, mini }: { path: string; onNavigate?: () => void; mini?: boolean }) {
  if (mini) {
    return (
      <nav className="py-4 space-y-1" aria-label="Main">
        {SECTIONS.map((section, i) => (
          <div key={section.label} className="space-y-1">
            {i > 0 && <div className="mx-4 my-2 border-t border-slate-200" />}
            {section.items
              .filter((it) => !it.muted)
              .map((it) => (
                <Leaf key={it.path} it={it} active={it.match?.(path) ?? false} mini />
              ))}
          </div>
        ))}
      </nav>
    );
  }
  return (
    <nav className="px-3 py-4 space-y-4" aria-label="Main">
      {SECTIONS.map((section) => (
        <Section key={section.label} section={section} path={path} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function CompactToggle() {
  const [density, setDensity] = useDensity();
  const on = density === 'compact';
  return (
    <button
      type="button"
      onClick={() => setDensity(on ? 'comfortable' : 'compact')}
      aria-pressed={on}
      title={on ? 'Compact view on — click for roomy view' : 'Switch to compact view'}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
        on ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        {on ? <path d="M4 6h16M4 10h16M4 14h16M4 18h16" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
      </svg>
      <span className="hidden sm:inline">Compact</span>
    </button>
  );
}

export function MainLayout() {
  const location = useLocation();
  const path = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mini, setMini] = useState(() => readFold('nav:rail-mini', false));
  const toggleMini = () => {
    setMini((m) => {
      writeFold('nav:rail-mini', !m);
      return !m;
    });
  };

  const activeLabel = ALL_ITEMS.find((it) => it.match?.(path))?.label ?? 'Heatronics MIS';

  return (
    <div className="min-h-screen text-slate-900 flex flex-col app-ground">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="h-14 px-3 sm:px-4 flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            onClick={toggleMini}
            aria-label={mini ? 'Expand menu' : 'Collapse menu'}
            title={mini ? 'Expand menu' : 'Collapse menu'}
            className="hidden lg:flex w-10 h-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>

          <Link to="/" className="flex items-center gap-2.5 rounded-lg hover:opacity-80 transition-opacity">
            <span className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center">
              <HeatronicsMark className="h-4 w-auto text-white" />
            </span>
            <span className="font-display font-bold text-[16px] hidden sm:block tracking-tight">Heatronics MIS</span>
          </Link>

          <span className="lg:hidden truncate text-sm font-medium text-slate-600">{activeLabel}</span>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:block"><ClaudeStatusPill /></span>
            <span className="md:hidden"><ClaudeStatusPill compact /></span>
            <CompactToggle />
            <span className="hidden sm:flex w-9 h-9 rounded-full bg-slate-900 text-white text-xs font-semibold items-center justify-center" aria-hidden="true">HG</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside
          className={`hidden lg:block flex-shrink-0 border-r border-slate-200 bg-white sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto transition-[width] duration-200 ${
            mini ? 'w-[64px]' : 'w-[232px]'
          }`}
        >
          <RailNav path={path} mini={mini} />
        </aside>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} side="left" width={288} title="Menu">
        <RailNav path={path} onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      {path.startsWith('/handbook') ? <SopChat /> : <FloatingChat />}
    </div>
  );
}
