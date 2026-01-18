import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Home' },
  { path: '/mis-tracking', label: 'MIS Reporting' },
  { path: '/classifications', label: 'Classifications' },
  { path: '/task-tracker', label: 'Task Tracker' },
  { path: '/business-guide', label: 'Business Guide' },
];

export function MainLayout() {
  const location = useLocation();

  // Get current page title for mobile
  const currentPage = navItems.find(item =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
  )?.label || 'Home';

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Top Navigation Bar - Thin Layer */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-12">
            {/* Logo / Home Button */}
            <NavLink
              to="/"
              className="flex items-center gap-2 text-slate-100 hover:text-blue-400 transition-colors"
            >
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="font-semibold text-base hidden sm:block">Heatronics</span>
            </NavLink>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `
                    px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${isActive
                      ? 'bg-slate-700 text-blue-400'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                    }
                  `}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* Mobile menu button */}
            <div className="flex items-center gap-2 md:hidden">
              <span className="text-sm font-medium text-slate-300">{currentPage}</span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden border-t border-slate-700">
          <nav className="flex overflow-x-auto px-2 py-2 gap-1 no-scrollbar">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `
                  px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0
                  ${isActive
                    ? 'bg-slate-700 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-700/50'
                  }
                `}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-slate-800 border-t border-slate-700 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-center text-xs text-slate-500">
            Heatronics Accounting Dashboard v2.0
          </p>
        </div>
      </footer>
    </div>
  );
}
