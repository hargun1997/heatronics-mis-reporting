import React from 'react';
import { Link } from 'react-router-dom';

interface ToolCard {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  color: string;
  stats?: string;
}

const tools: ToolCard[] = [
  {
    title: 'Accounting Dictionary',
    description: 'Reference guide for expense categories, booking instructions, and GST treatment for all business transactions.',
    path: '/dictionary',
    color: 'bg-purple-500',
    stats: '25+ Categories',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    )
  },
  {
    title: 'Accounts Checklist',
    description: 'Track daily, weekly, and monthly accounting tasks. Never miss a GST filing or TDS payment deadline.',
    path: '/checklist',
    color: 'bg-green-500',
    stats: '15+ Tasks',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )
  },
  {
    title: 'MIS Calculator',
    description: 'Generate P&L MIS reports from Balance Sheet and Journal entries. Auto-classify expenses and calculate margins.',
    path: '/mis-calculator',
    color: 'bg-blue-500',
    stats: 'P&L Reports',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    )
  }
];

const quickStats = [
  { label: 'This Month GST', value: 'GSTR-3B Due', date: '20th Jan', status: 'pending' },
  { label: 'TDS Payment', value: 'Challan Due', date: '7th Jan', status: 'completed' },
  { label: 'Bank Reconciliation', value: 'Up to date', date: 'Today', status: 'completed' },
  { label: 'Vendor Payments', value: '5 Pending', date: 'This Week', status: 'warning' }
];

export function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold">Welcome to Heatronics Accounting Dashboard</h1>
        <p className="mt-2 text-blue-100">
          Manage your accounting tasks, track compliance, and generate financial reports all in one place.
        </p>
        <div className="mt-4 flex gap-4">
          <Link
            to="/mis-calculator"
            className="px-4 py-2 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors"
          >
            Start MIS Report
          </Link>
          <Link
            to="/checklist"
            className="px-4 py-2 bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
          >
            View Checklist
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickStats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{stat.label}</span>
              <span className={`
                w-2 h-2 rounded-full
                ${stat.status === 'completed' ? 'bg-green-500' : ''}
                ${stat.status === 'pending' ? 'bg-yellow-500' : ''}
                ${stat.status === 'warning' ? 'bg-orange-500' : ''}
              `} />
            </div>
            <div className="mt-2">
              <div className="text-lg font-semibold text-gray-800">{stat.value}</div>
              <div className="text-xs text-gray-400">{stat.date}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tool Cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Accounting Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <Link
              key={tool.path}
              to={tool.path}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all hover:border-gray-300 group"
            >
              <div className="flex items-start gap-4">
                <div className={`${tool.color} p-3 rounded-lg text-white group-hover:scale-110 transition-transform`}>
                  {tool.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                    {tool.title}
                  </h3>
                  {tool.stats && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                      {tool.stats}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-600">{tool.description}</p>
              <div className="mt-4 flex items-center text-blue-600 text-sm font-medium">
                <span>Open Tool</span>
                <svg className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Deadlines */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Upcoming Deadlines
          </h3>
          <div className="space-y-3">
            {[
              { task: 'GSTR-1 Filing', date: '11th of every month', type: 'GST' },
              { task: 'GSTR-3B Filing', date: '20th of every month', type: 'GST' },
              { task: 'TDS Payment', date: '7th of every month', type: 'TDS' },
              { task: 'TDS Return (Quarterly)', date: '31st Jul / Oct / Jan / May', type: 'TDS' },
              { task: 'Advance Tax', date: '15th Jun / Sep / Dec / Mar', type: 'Income Tax' }
            ].map((deadline, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <div className="text-sm font-medium text-gray-700">{deadline.task}</div>
                  <div className="text-xs text-gray-400">{deadline.date}</div>
                </div>
                <span className={`
                  text-xs px-2 py-1 rounded
                  ${deadline.type === 'GST' ? 'bg-blue-100 text-blue-700' : ''}
                  ${deadline.type === 'TDS' ? 'bg-purple-100 text-purple-700' : ''}
                  ${deadline.type === 'Income Tax' ? 'bg-green-100 text-green-700' : ''}
                `}>
                  {deadline.type}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Quick Links
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'GST Portal', url: 'https://www.gst.gov.in/', icon: '🔗' },
              { label: 'Income Tax Portal', url: 'https://www.incometax.gov.in/', icon: '🔗' },
              { label: 'TRACES (TDS)', url: 'https://www.tdscpc.gov.in/', icon: '🔗' },
              { label: 'MCA Portal', url: 'https://www.mca.gov.in/', icon: '🔗' },
              { label: 'Amazon Seller', url: 'https://sellercentral.amazon.in/', icon: '📦' },
              { label: 'Flipkart Seller', url: 'https://seller.flipkart.com/', icon: '📦' }
            ].map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <span>{link.icon}</span>
                <span className="text-sm text-gray-700">{link.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
