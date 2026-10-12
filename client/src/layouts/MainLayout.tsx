import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
import { HeatronicsMark } from '../components/HeatronicsLogo';

interface NavLeaf {
  path: string;
  label: string;
  external?: boolean;
  matcher?: (pathname: string) => boolean;
}

interface NavGroup {
  label: string;
  matcher: (pathname: string) => boolean;
  children: NavLeaf[];
}

type NavNode = NavLeaf | NavGroup;
const isGroup = (n: NavNode): n is NavGroup => 'children' in n;

const DATA_INSIGHTS_URL = 'https://heatronics-dashboard-portfolio.vercel.app/';

// The live run-rate surface, its connector console, and the readiness page.
const isLive = (p: string) =>
  p.startsWith('/reporting/mis/live') ||
  p.startsWith('/reporting/mis/connectors') ||
  p.startsWith('/reporting/mis/ingest');

// Primary nav: the legacy deck, and the Live MIS group.
const navNodes: NavNode[] = [
  {
    path: '/reporting/mis',
    label: 'Legacy MIS',
    // The deck and its analysis tabs, but not the live sub-pages below.
    matcher: (p) => (p.startsWith('/reporting') || p.startsWith('/mis')) && !isLive(p),
  },
  {
    label: 'Live MIS',
    matcher: isLive,
    children: [
      { path: '/reporting/mis/connectors', label: 'Data sources' },
      { path: '/reporting/mis/ingest', label: 'Data readiness' },
      { path: '/reporting/mis/live', label: 'Live MIS' },
    ],
  },
];

// Secondary links, shown low-key on the right.
const secondaryLinks: NavLeaf[] = [
  { path: '/tools', label: 'Tools' },
  { path: DATA_INSIGHTS_URL, label: 'Data / Insights', external: true },
];

// Flat list for the mobile bar (the dropdown's children inline).
const mobileItems: NavLeaf[] = navNodes.flatMap((n) =>
  isGroup(n) ? n.children : [n],
);

const baseNavClass = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors';

const externalIcon = (
  <svg className="inline-block h-3 w-3 ml-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

export function MainLayout() {
  const location = useLocation();
  const path = location.pathname;

  const leafActive = (item: NavLeaf) =>
    !item.external && (item.matcher ? item.matcher(path) : path.startsWith(item.path));

  const cls = (active: boolean, extra = '') =>
    `${baseNavClass} ${extra} ${active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;

  const renderLeaf = (item: NavLeaf, extra = '') => {
    if (item.external) {
      return (
        <a key={item.path} href={item.path} target="_blank" rel="noreferrer" className={cls(false, extra)}>
          {item.label}{externalIcon}
        </a>
      );
    }
    return (
      <NavLink key={item.path} to={item.path} className={cls(leafActive(item), extra)}>
        {item.label}
      </NavLink>
    );
  };

  // Desktop dropdown for a group — opens on hover or keyboard focus.
  const renderGroup = (group: NavGroup) => {
    const active = group.matcher(path);
    return (
      <div key={group.label} className="relative group">
        <button type="button" className={`${cls(active)} inline-flex items-center gap-1`}>
          {group.label}
          <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="absolute left-0 top-full pt-1 hidden group-hover:block group-focus-within:block z-50">
          <div className="min-w-[160px] rounded-lg border border-slate-200 bg-white shadow-lg py-1">
            {group.children.map((child) => (
              <NavLink
                key={child.path}
                to={child.path}
                className={({ isActive }) =>
                  `block px-3 py-1.5 text-sm ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`
                }
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const activeLabel =
    navNodes.find((n) => (isGroup(n) ? n.matcher(path) : leafActive(n)))?.label ?? 'Home';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo / Home Button */}
            <Link
              to="/"
              className="flex items-center gap-2.5 text-slate-900 hover:opacity-80 transition-opacity"
            >
              <HeatronicsMark className="h-6 w-auto text-brand-500" />
              <span className="font-display font-bold text-lg hidden sm:block tracking-tight">Heatronics</span>
              <span className="text-[10px] font-medium text-slate-400 hidden sm:block tracking-wide uppercase border-l border-slate-200 pl-2">MIS</span>
            </Link>

            {/* Desktop Navigation: Legacy MIS + the Live MIS dropdown */}
            <nav className="hidden md:flex items-center gap-1">
              {navNodes.map((n) => (isGroup(n) ? renderGroup(n) : renderLeaf(n)))}
            </nav>

            {/* Right side secondary links (desktop): Tools + Data / Insights. */}
            <div className="hidden md:flex items-center gap-3 text-[11px]">
              {secondaryLinks.map((item) =>
                item.external ? (
                  <a key={item.path} href={item.path} target="_blank" rel="noreferrer"
                    className="text-slate-400 hover:text-slate-600 transition-colors">
                    {item.label}{externalIcon}
                  </a>
                ) : (
                  <NavLink key={item.path} to={item.path}
                    className={({ isActive }) =>
                      `transition-colors ${isActive ? 'text-slate-600' : 'text-slate-400 hover:text-slate-600'}`
                    }>
                    {item.label}
                  </NavLink>
                ),
              )}
              <span className="text-slate-300">MIS v2.2</span>
            </div>

            {/* Mobile label */}
            <div className="flex items-center gap-2 md:hidden">
              <span className="text-sm font-medium text-slate-700">{activeLabel}</span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation: dropdown children shown inline */}
        <div className="md:hidden border-t border-slate-200">
          <nav className="flex overflow-x-auto px-2 py-2 gap-1 no-scrollbar">
            {mobileItems.map((item) => renderLeaf(item, 'whitespace-nowrap flex-shrink-0'))}
            {secondaryLinks.map((item) => renderLeaf(item, 'whitespace-nowrap flex-shrink-0'))}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-center text-xs text-slate-500">
            Heatronics Accounting Dashboard · Built for the Finance team
          </p>
        </div>
      </footer>
    </div>
  );
}
