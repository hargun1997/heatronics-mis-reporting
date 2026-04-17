import React from 'react';
import { Link } from 'react-router-dom';

interface FlowCard {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  color: string;
}

const flowCards: FlowCard[] = [
  {
    title: 'MIS Reporting',
    description: 'Upload documents, generate P&L reports, and track trends across months.',
    path: '/mis-tracking',
    color: 'blue',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )
  },
  {
    title: 'Task Tracker',
    description: 'Manage daily, weekly, and monthly accounting tasks.',
    path: '/task-tracker',
    color: 'emerald',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )
  },
  {
    title: 'Warranty Management',
    description: 'Track warranty cases, manage duplicates, and monitor shipments.',
    path: '/warranty',
    color: 'orange',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    )
  },
  {
    title: 'Business Guide',
    description: 'Reference guide for expense categories and accounting practices.',
    path: '/business-guide',
    color: 'violet',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    )
  }
];

interface ToolItem {
  id: string;
  name: string;
  description: string;
}

const toolItems: ToolItem[] = [
  {
    id: 'amazon-to-tranzact',
    name: 'Amazon Inventory → Tranzact',
    description: 'Convert Amazon FBA Inventory Report into a Tranzact Bulk Manual Adjustment file',
  },
];

const colorClasses: Record<string, { bg: string; border: string; icon: string; text: string; hover: string }> = {
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    icon: 'bg-blue-500/20 text-blue-400',
    text: 'text-blue-400',
    hover: 'hover:border-blue-500/40 hover:bg-blue-500/15'
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    icon: 'bg-emerald-500/20 text-emerald-400',
    text: 'text-emerald-400',
    hover: 'hover:border-emerald-500/40 hover:bg-emerald-500/15'
  },
  violet: {
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    icon: 'bg-violet-500/20 text-violet-400',
    text: 'text-violet-400',
    hover: 'hover:border-violet-500/40 hover:bg-violet-500/15'
  },
  orange: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    icon: 'bg-orange-500/20 text-orange-400',
    text: 'text-orange-400',
    hover: 'hover:border-orange-500/40 hover:bg-orange-500/15'
  }
};

export function Dashboard() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Welcome Header */}
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-semibold text-slate-100">Heatronics Dashboard</h1>
        <p className="mt-2 text-slate-400 text-sm">
          Accounting, compliance, and financial reporting
        </p>
      </div>

      {/* Flow Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {flowCards.map((card) => {
          const colors = colorClasses[card.color];

          return (
            <Link
              key={card.path}
              to={card.path}
              className={`
                group relative rounded-xl border p-5 transition-all duration-200
                ${colors.bg} ${colors.border} ${colors.hover}
              `}
            >
              {/* Icon */}
              <div className={`
                w-10 h-10 rounded-lg flex items-center justify-center mb-4
                ${colors.icon}
              `}>
                {card.icon}
              </div>

              {/* Content */}
              <h3 className="font-medium text-slate-100 mb-1">{card.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{card.description}</p>

              {/* Arrow */}
              <div className={`
                absolute top-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity
                ${colors.text}
              `}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Tools Section */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">Tools</h2>
        <p className="text-sm text-slate-400 mb-4">Data transformation and conversion utilities</p>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <label htmlFor="tool-dropdown" className="block text-sm font-medium text-slate-300 mb-2">
            Select a tool
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              id="tool-dropdown"
              className="flex-1 sm:max-w-xs bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
              defaultValue="amazon-to-tranzact"
            >
              {toolItems.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.name}
                </option>
              ))}
            </select>
            <Link
              to="/tools"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
              </svg>
              Open Tool
            </Link>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {toolItems[0].description}
          </p>
        </div>
      </div>
    </div>
  );
}
