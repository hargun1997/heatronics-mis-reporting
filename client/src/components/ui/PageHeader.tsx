import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: 'brand' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose';
}

const accentMap: Record<NonNullable<PageHeaderProps['accent']>, string> = {
  brand: 'from-brand-50 to-white',
  emerald: 'from-emerald-50 to-white',
  violet: 'from-violet-50 to-white',
  amber: 'from-amber-50 to-white',
  sky: 'from-sky-50 to-white',
  rose: 'from-rose-50 to-white',
};

const iconBgMap: Record<NonNullable<PageHeaderProps['accent']>, string> = {
  brand: 'bg-brand-100 text-brand-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  sky: 'bg-sky-100 text-sky-700',
  rose: 'bg-rose-100 text-rose-700',
};

export function PageHeader({ title, description, crumbs, actions, icon, accent = 'brand' }: PageHeaderProps) {
  const location = useLocation();
  const derivedCrumbs: Crumb[] = crumbs ?? deriveCrumbs(location.pathname);

  return (
    <div className={`bg-gradient-to-b ${accentMap[accent]} border-b border-slate-200`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {derivedCrumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
            <Link to="/" className="hover:text-slate-700">Home</Link>
            {derivedCrumbs.map((c, i) => (
              <React.Fragment key={i}>
                <span className="text-slate-300">/</span>
                {c.to ? (
                  <Link to={c.to} className="hover:text-slate-700">{c.label}</Link>
                ) : (
                  <span className="text-slate-700 font-medium">{c.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            {icon && (
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBgMap[accent]} flex-shrink-0`}>
                {icon}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{title}</h1>
              {description && (
                <p className="mt-1 text-sm text-slate-600 max-w-3xl">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

function deriveCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return [];
  const labels: Record<string, string> = {
    reporting: 'Reporting',
    tracker: 'Tracker',
    compliance: 'Compliance',
    accounts: 'Accounts',
    legal: 'Legal',
    mca: 'MCA / ROC',
    iso: 'ISO / QMS',
    hr: 'HR & Payroll',
    investors: 'Investors',
    admin: 'Admin',
    guide: 'Guide',
    sop: 'Accounting SOP',
    tools: 'Tools',
    sales: 'Sales SOP',
    purchase: 'Purchase SOP',
    expense: 'Expense SOP',
    banking: 'Banking SOP',
    'capital-goods': 'Capital Goods SOP',
    'job-work': 'Job Work SOP',
    architecture: 'System Architecture',
    ledgers: 'Ledgers & Vouchers',
    'invoice-booking': 'Invoice Booking Suggester',
    'amazon-to-tranzact': 'Amazon → Tranzact',
    'expense-booking': 'Expense Booking',
    'mis-tracking': 'MIS Reporting',
    'task-tracker': 'Task Tracker',
    'business-guide': 'Guide',
  };
  const crumbs: Crumb[] = [];
  let acc = '';
  parts.forEach((p, i) => {
    acc += '/' + p;
    const isLast = i === parts.length - 1;
    crumbs.push({ label: labels[p] || capitalize(p), to: isLast ? undefined : acc });
  });
  return crumbs;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}
