import { useState, type ReactNode } from 'react';
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
import { HeatronicsMark } from '../components/HeatronicsLogo';
import { Drawer } from '../components/ui/overlays';

const DATA_INSIGHTS_URL = 'https://heatronics-dashboard-portfolio.vercel.app/';

// ---- nav model -------------------------------------------------------------

interface NavLeaf {
  path: string;
  label: string;
  icon: ReactNode;
  match: (p: string) => boolean;
}
interface NavSection {
  label: string;
  items: NavLeaf[];
}

const ico = (d: string | string[]) => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
  </svg>
);

// The deck is the base /reporting/mis route; the sub-pages below have their own.
const isDeck = (p: string) =>
  p.startsWith('/reporting/mis') &&
  !['/live', '/close', '/connectors', '/ingest', '/chat'].some((s) => p.startsWith('/reporting/mis' + s));

const SECTIONS: NavSection[] = [
  {
    label: 'Reporting',
    items: [
      { path: '/reporting/mis/live', label: 'Live MIS', icon: ico('M3 12h4l3 8 4-16 3 8h4'), match: (p) => p.startsWith('/reporting/mis/live') },
      { path: '/reporting/mis', label: 'MIS deck', icon: ico(['M4 5h16v14H4z', 'M4 10h16', 'M10 5v14']), match: isDeck },
      { path: '/reporting/mis/close', label: 'Month close', icon: ico('M20 6L9 17l-5-5'), match: (p) => p.startsWith('/reporting/mis/close') },
    ],
  },
  {
    label: 'Data pipeline',
    items: [
      { path: '/reporting/mis/connectors', label: 'Data sources', icon: ico(['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z']), match: (p) => p.startsWith('/reporting/mis/connectors') },
      { path: '/reporting/mis/ingest', label: 'Data readiness', icon: ico(['M12 15V3', 'M8 7l4-4 4 4', 'M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2']), match: (p) => p.startsWith('/reporting/mis/ingest') },
      { path: '/reporting/mis/chat', label: 'Ask the MIS', icon: ico('M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'), match: (p) => p.startsWith('/reporting/mis/chat') },
    ],
  },
  {
    label: 'Govern',
    items: [
      { path: '/compliance', label: 'Compliance', icon: ico('M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z'), match: (p) => p.startsWith('/compliance') || p.startsWith('/tracker') },
      { path: '/task-tracker', label: 'Task tracker', icon: ico(['M9 11l3 3 8-8', 'M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9']), match: (p) => p.startsWith('/task-tracker') },
      { path: '/tools', label: 'Tools', icon: ico(['M14 7l3 3-8 8H6v-3z', 'M4 20h16']), match: (p) => p.startsWith('/tools') },
      { path: '/guide', label: 'Guide & SOPs', icon: ico(['M4 5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2z', 'M8 12h8M8 16h5']), match: (p) => p.startsWith('/guide') },
    ],
  },
];

const externalIcon = (
  <svg className="inline-block h-3 w-3 ml-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

function RailNav({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav className="px-3 py-4 space-y-5">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <div className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
            {section.label}
          </div>
          <div className="space-y-0.5">
            {section.items.map((it) => {
              const active = it.match(path);
              return (
                <NavLink
                  key={it.path}
                  to={it.path}
                  onClick={onNavigate}
                  className={
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-semibold transition-colors ' +
                    (active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
                  }
                >
                  <span className={active ? 'text-brand-600' : 'text-slate-400'}>{it.icon}</span>
                  {it.label}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function MainLayout() {
  const location = useLocation();
  const path = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeLabel =
    SECTIONS.flatMap((s) => s.items).find((it) => it.match(path))?.label ?? 'Heatronics MIS';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top bar */}
      <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-40">
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
            <span className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-sm">
              <HeatronicsMark className="h-4 w-auto text-white" />
            </span>
            <span className="font-display font-bold text-[17px] hidden sm:block tracking-tight">Heatronics</span>
            <span className="text-[10px] font-semibold text-slate-400 tracking-[0.12em] uppercase border-l border-slate-200 pl-2.5 hidden sm:block">MIS</span>
          </Link>

          {/* Mobile: current section label */}
          <span className="lg:hidden ml-auto text-sm font-semibold text-slate-700">{activeLabel}</span>

          {/* Desktop: right-side links */}
          <div className="hidden lg:flex items-center gap-4 ml-auto">
            <a
              href={DATA_INSIGHTS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              Data / Insights{externalIcon}
            </a>
            <span className="text-[11px] font-semibold text-slate-400 border border-slate-200 rounded-md px-2 py-0.5">MIS v2.3</span>
            <span className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center" aria-hidden="true">HG</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Desktop rail */}
        <aside className="hidden lg:block w-60 flex-shrink-0 border-r border-slate-200 bg-white sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto">
          <RailNav path={path} />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile nav drawer (reuses the design-system Drawer) */}
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} side="left" width={288} title="Navigate">
        <RailNav path={path} onNavigate={() => setMobileOpen(false)} />
      </Drawer>
    </div>
  );
}
