import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  external?: boolean;
  matcher?: (pathname: string) => boolean;
}

const DATA_INSIGHTS_URL = 'https://digistex4u.github.io/heatronics_dashbaord/';

const navItems: NavItem[] = [
  {
    path: '/reporting/mis',
    label: 'MIS',
    matcher: (p) => p.startsWith('/reporting') || p.startsWith('/mis'),
  },
  {
    path: '/tools',
    label: 'Tools',
    matcher: (p) => p.startsWith('/tools'),
  },
  {
    path: DATA_INSIGHTS_URL,
    label: 'Data / Insights',
    external: true,
  },
];

const baseNavClass = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors';

const externalIcon = (
  <svg className="inline-block h-3 w-3 ml-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

export function MainLayout() {
  const location = useLocation();

  const isActive = (item: NavItem) =>
    !item.external && (item.matcher ? item.matcher(location.pathname) : location.pathname.startsWith(item.path));

  const renderItem = (item: NavItem, extra = '') => {
    const cls = (active: boolean) =>
      `${baseNavClass} ${extra} ${active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;
    if (item.external) {
      return (
        <a key={item.path} href={item.path} target="_blank" rel="noreferrer" className={cls(false)}>
          {item.label}{externalIcon}
        </a>
      );
    }
    return (
      <NavLink key={item.path} to={item.path} className={cls(isActive(item))}>
        {item.label}
      </NavLink>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo / Home Button */}
            <Link
              to="/"
              className="flex items-center gap-2 text-slate-900 hover:text-brand-600 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-600 rounded-lg flex items-center justify-center shadow-soft">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="font-semibold text-base hidden sm:block tracking-tight">Heatronics</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => renderItem(item))}
            </nav>

            {/* Right side quick links (desktop) */}
            <div className="hidden md:flex items-center gap-1 text-xs">
              <span className="text-slate-400">MIS v2.1</span>
            </div>

            {/* Mobile label */}
            <div className="flex items-center gap-2 md:hidden">
              <span className="text-sm font-medium text-slate-700">
                {navItems.find((n) => isActive(n))?.label || 'Home'}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden border-t border-slate-200">
          <nav className="flex overflow-x-auto px-2 py-2 gap-1 no-scrollbar">
            {navItems.map((item) => renderItem(item, 'whitespace-nowrap flex-shrink-0'))}
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
