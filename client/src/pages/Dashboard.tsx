import React from 'react';
import { Link } from 'react-router-dom';

interface FlowCard {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  gradient: string;
  badge?: string;
  external?: boolean;
}

const flowCards: FlowCard[] = [
  {
    title: 'MIS Reporting',
    description: 'Upload bank statements, sales registers, and journals. Auto-classify transactions and generate P&L reports with trends analysis.',
    path: '/mis-tracking',
    gradient: 'from-blue-500 to-blue-700',
    badge: 'Primary',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )
  },
  {
    title: 'Task Tracker',
    description: 'Manage daily, weekly, and monthly accounting tasks. Track recurring compliance deadlines and ad-hoc tasks with reminders.',
    path: '/task-tracker',
    gradient: 'from-green-500 to-green-700',
    badge: 'New',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )
  },
  {
    title: 'Business Guide',
    description: 'Reference guide for expense categories, GST treatment, booking instructions, and accounting best practices.',
    path: '/business-guide',
    gradient: 'from-purple-500 to-purple-700',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    )
  },
  {
    title: 'MIS Sheet',
    description: 'Open the master Google Sheet for direct data entry, viewing historical MIS data, and task tracking.',
    path: 'https://docs.google.com/spreadsheets/d/1CgClltIfhvQMZ9kxQ2MqfcebyZzDoZdg6i2evHAo3JI/edit',
    gradient: 'from-emerald-500 to-emerald-700',
    external: true,
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }
];

const quickStats = [
  { label: 'GSTR-3B', value: 'Due 20th', status: 'pending' },
  { label: 'TDS Payment', value: 'Due 7th', status: 'completed' },
  { label: 'GSTR-1', value: 'Due 11th', status: 'pending' },
  { label: 'Reconciliation', value: 'Up to date', status: 'completed' }
];

export function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome to Heatronics</h1>
        <p className="mt-2 text-gray-600">
          Manage your accounting, track compliance, and generate financial reports.
        </p>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {quickStats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{stat.label}</span>
              <span className={`
                w-2 h-2 rounded-full
                ${stat.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500'}
              `} />
            </div>
            <div className="mt-1 text-lg font-semibold text-gray-800">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Main Flow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {flowCards.map((card) => {
          const CardWrapper = card.external ? 'a' : Link;
          const cardProps = card.external
            ? { href: card.path, target: '_blank', rel: 'noopener noreferrer' }
            : { to: card.path };

          return (
            <CardWrapper
              key={card.path}
              {...cardProps as any}
              className="group relative bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl transition-all duration-300 hover:border-gray-300"
            >
              {/* Gradient Header */}
              <div className={`bg-gradient-to-r ${card.gradient} p-6 text-white`}>
                <div className="flex items-start justify-between">
                  <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                    {card.icon}
                  </div>
                  {card.badge && (
                    <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-medium backdrop-blur-sm">
                      {card.badge}
                    </span>
                  )}
                  {card.external && (
                    <svg className="h-5 w-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  )}
                </div>
                <h3 className="mt-4 text-xl font-bold">{card.title}</h3>
              </div>

              {/* Card Body */}
              <div className="p-6">
                <p className="text-gray-600 text-sm leading-relaxed">{card.description}</p>
                <div className="mt-4 flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700">
                  <span>{card.external ? 'Open Sheet' : 'Get Started'}</span>
                  <svg className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </CardWrapper>
          );
        })}
      </div>

      {/* Quick Reference Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Deadlines */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Monthly Deadlines
          </h3>
          <div className="space-y-3">
            {[
              { task: 'TDS Payment', date: '7th', type: 'TDS' },
              { task: 'GSTR-1 Filing', date: '11th', type: 'GST' },
              { task: 'GSTR-3B Filing', date: '20th', type: 'GST' },
              { task: 'PF/ESI Payment', date: '15th', type: 'Payroll' }
            ].map((deadline, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">{deadline.task}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{deadline.date}</span>
                  <span className={`
                    text-xs px-2 py-0.5 rounded
                    ${deadline.type === 'GST' ? 'bg-blue-100 text-blue-700' : ''}
                    ${deadline.type === 'TDS' ? 'bg-purple-100 text-purple-700' : ''}
                    ${deadline.type === 'Payroll' ? 'bg-green-100 text-green-700' : ''}
                  `}>
                    {deadline.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Quick Links
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'GST Portal', url: 'https://www.gst.gov.in/' },
              { label: 'Income Tax', url: 'https://www.incometax.gov.in/' },
              { label: 'TRACES', url: 'https://www.tdscpc.gov.in/' },
              { label: 'MCA Portal', url: 'https://www.mca.gov.in/' },
              { label: 'Amazon Seller', url: 'https://sellercentral.amazon.in/' },
              { label: 'Flipkart Seller', url: 'https://seller.flipkart.com/' }
            ].map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span className="text-sm text-gray-700">{link.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
