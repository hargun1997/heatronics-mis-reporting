import { useState, type ReactNode } from 'react';
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
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
  external?: boolean;
  tag?: string;          // small chip, e.g. "Legacy"
  muted?: boolean;       // set apart (legacy) — quieter by default
  dividerBefore?: boolean;
}
interface NavSection {
  label: string;
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

// Ordered along the data flow: sources → ingestion → MIS → govern → more.
const SECTIONS: NavSection[] = [
  {
    label: 'Data pipeline',
    items: [
      { path: '/reporting/mis/connectors', label: 'Data sources', icon: ico(['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z']), match: (p) => p.startsWith('/reporting/mis/connectors') },
      { path: '/reporting/mis/ingest', label: 'Upload data', icon: ico(['M12 15V3', 'M8 7l4-4 4 4', 'M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2']), match: (p) => p.startsWith('/reporting/mis/ingest') },
      { path: '/reporting/mis/rulebook', label: 'Data rulebook', icon: ico(['M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z', 'M8 8h8M8 12h8M8 16h5']), match: (p) => p.startsWith('/reporting/mis/rulebook') },
    ],
  },
  {
    label: 'MIS',
    items: [
      { path: '/reporting/mis/live', label: 'Live MIS', icon: ico('M3 12h4l3 8 4-16 3 8h4'), match: (p) => p.startsWith('/reporting/mis/live') },
      { path: '/reporting/mis/insights', label: 'AI Insights', icon: ico(['M13 3l2.2 6.8L22 12l-6.8 2.2L13 21l-2.2-6.8L4 12l6.8-2.2z']), match: (p) => p.startsWith('/reporting/mis/insights') || p.startsWith('/reporting/mis/chat') },
      { path: '/reporting/mis/issues', label: 'Data Issues', icon: ico(['M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z', 'M12 8v4m0 3h.01']), match: (p) => p.startsWith('/reporting/mis/issues') },
      { path: '/reporting/mis/send', label: 'Send Report', icon: ico(['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z']), match: (p) => p.startsWith('/reporting/mis/send') },
    ],
  },
  {
    label: 'Tasks',
    items: [
      { path: '/tasks', label: 'Tasks & owners', icon: ico(['M9 11l3 3 8-8', 'M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9']), match: (p) => p === '/tasks' || p === '/tasks/' },
      { path: '/tasks/settings', label: 'People & reminders', icon: ico(['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z']), match: (p) => p.startsWith('/tasks/settings') },
    ],
  },
  {
    label: 'Guides',
    items: [
      { path: '/handbook', label: 'Accounts Handbook', icon: ico(['M4 19.5A2.5 2.5 0 016.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z']), match: (p) => p.startsWith('/guide') || p.startsWith('/handbook') },
    ],
  },
  {
    label: 'More',
    items: [
      { path: '/tools', label: 'Tools', icon: ico(['M14 7l3 3-8 8H6v-3z', 'M4 20h16']), match: (p) => p.startsWith('/tools') },
    ],
  },
];

// Old pages kept reachable, folded away at the bottom of the rail.
const LEGACY: NavLeaf[] = [
  { path: '/reporting/mis/close', label: 'Month close', muted: true, icon: ico('M20 6L9 17l-5-5'), match: (p) => p.startsWith('/reporting/mis/close') },
  { path: '/reporting/mis', label: 'MIS deck', muted: true, icon: ico(['M4 5h16v14H4z', 'M4 10h16', 'M10 5v14']), match: isDeck },
];

const externalArrow = (
  <svg className="w-3 h-3 ml-auto text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M9 7h8v8" />
  </svg>
);

function Leaf({ it, active, onNavigate }: { it: NavLeaf; active: boolean; onNavigate?: () => void }) {
  const base =
    'group flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-colors ' +
    (active
      ? 'bg-gradient-to-r from-brand-50 to-brand-50/30 text-brand-700 font-semibold ring-1 ring-brand-100 shadow-sm'
      : it.muted
        ? 'text-slate-400 font-normal hover:text-slate-700 hover:bg-slate-900/[0.04]'
        : 'text-slate-600 font-medium hover:text-slate-900 hover:bg-slate-900/[0.04]');
  const iconCls = active ? 'text-brand-600' : it.muted ? 'text-slate-300 group-hover:text-slate-400' : 'text-slate-400 group-hover:text-slate-600';
  const inner = (
    <>
      <span className={iconCls}>{it.icon}</span>
      <span className="truncate">{it.label}</span>
      {it.tag && (
        <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
          {it.tag}
        </span>
      )}
      {it.external && externalArrow}
    </>
  );
  if (it.external) {
    return <a href={it.path} target="_blank" rel="noreferrer" className={base} onClick={onNavigate}>{inner}</a>;
  }
  return <NavLink to={it.path} end={it.path === '/reporting/mis'} className={base} onClick={onNavigate}>{inner}</NavLink>;
}

function LegacyGroup({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const inside = LEGACY.some((it) => it.match?.(path));
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('nav:legacy') === 'open';
    } catch {
      return false;
    }
  });
  const shown = open || inside;
  const toggle = () => {
    const next = !shown;
    setOpen(next);
    try {
      localStorage.setItem('nav:legacy', next ? 'open' : 'closed');
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="border-t border-dashed border-slate-200 pt-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={shown}
        className="flex w-full items-center gap-2 rounded-lg px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 hover:text-slate-600"
      >
        Legacy
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] tracking-wider text-slate-400">{LEGACY.length}</span>
        <svg className={`ml-auto h-3.5 w-3.5 transition ${shown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {shown && (
        <div className="space-y-0.5">
          {LEGACY.map((it) => (
            <Leaf key={it.path} it={it} active={it.match?.(path) ?? false} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function RailNav({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav className="px-3 py-5 space-y-6">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {section.label}
          </div>
          <div className="space-y-0.5">
            {section.items.map((it) => (
              <div key={it.path}>
                {it.dividerBefore && <div className="my-2 mx-3 border-t border-dashed border-slate-200" />}
                <Leaf it={it} active={it.match?.(path) ?? false} onNavigate={onNavigate} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <LegacyGroup path={path} onNavigate={onNavigate} />
    </nav>
  );
}

export function MainLayout() {
  const location = useLocation();
  const path = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeLabel =
    [...SECTIONS.flatMap((s) => s.items), ...LEGACY].find((it) => it.match?.(path))?.label ?? 'Heatronics MIS';

  return (
    <div className="min-h-screen text-slate-900 flex flex-col app-ground">
      {/* Top bar — glassy, minimal; links live in the rail. */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
        <div className="h-14 px-4 sm:px-5 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <span className="w-8 h-8 rounded-xl bg-brand-gradient flex items-center justify-center shadow-card">
              <HeatronicsMark className="h-4 w-auto text-white" />
            </span>
            <span className="font-display font-bold text-[17px] hidden sm:block tracking-tight">Heatronics</span>
            <span className="text-[10px] font-medium text-slate-400 tracking-[0.14em] uppercase border-l border-slate-200 pl-2.5 hidden sm:block">MIS</span>
          </Link>

          {/* Mobile: Claude status + the active page label */}
          <div className="lg:hidden ml-auto flex items-center gap-2">
            <ClaudeStatusPill compact />
            <span className="text-sm font-medium text-slate-600">{activeLabel}</span>
          </div>

          <div className="hidden lg:flex items-center gap-3 ml-auto">
            <ClaudeStatusPill />
            <span className="text-[11px] font-medium text-slate-400 border border-slate-200 rounded-md px-2 py-0.5">MIS v2.3</span>
            <span className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center" aria-hidden="true">HG</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Desktop rail — glassy */}
        <aside className="hidden lg:block w-[248px] flex-shrink-0 border-r border-slate-200/70 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto">
          <RailNav path={path} />
        </aside>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile nav drawer (reuses the design-system Drawer) */}
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} side="left" width={288} title="Menu">
        <RailNav path={path} onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      {/* Hanging chat — the handbook gets the handbook-grounded "Ask about the
          handbook" chat; everywhere else gets the MIS data chat. */}
      {path.startsWith('/handbook') ? <SopChat /> : <FloatingChat />}
    </div>
  );
}
