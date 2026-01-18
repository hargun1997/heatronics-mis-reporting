import React from 'react';

export function BusinessGuide() {
  const sections = [
    {
      title: 'Expense Categories',
      description: 'Learn how to categorize different types of business expenses for accurate accounting.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      status: 'coming-soon'
    },
    {
      title: 'GST Treatment Guide',
      description: 'Understand ITC eligibility, GST rates, and how to handle GST for different transactions.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      status: 'coming-soon'
    },
    {
      title: 'Booking Instructions',
      description: 'Step-by-step instructions on how to book common business transactions in Tally.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      status: 'coming-soon'
    },
    {
      title: 'Compliance Calendar',
      description: 'Important tax filing dates and compliance deadlines throughout the year.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      status: 'coming-soon'
    },
    {
      title: 'Vendor Management',
      description: 'Best practices for vendor payments, credit terms, and reconciliation.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      status: 'coming-soon'
    },
    {
      title: 'E-commerce Accounting',
      description: 'Special considerations for Amazon, Flipkart, and D2C channel accounting.',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      status: 'coming-soon'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Business Guide</h1>
        <p className="text-slate-400 text-sm mt-1">
          Reference materials and guides for accounting and business operations
        </p>
      </div>

      {/* Coming Soon Banner */}
      <div className="bg-gradient-to-r from-violet-500/20 to-violet-600/20 rounded-xl border border-violet-500/30 p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-violet-500/20 rounded-lg">
            <svg className="h-6 w-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Work in Progress</h2>
            <p className="mt-1 text-sm text-slate-400">
              We're building comprehensive guides to help you manage your business accounting better.
              Check back soon for detailed documentation on each topic.
            </p>
          </div>
        </div>
      </div>

      {/* Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((section, index) => (
          <div
            key={index}
            className="bg-slate-800/50 rounded-lg border border-slate-700 p-4 opacity-70"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-slate-700/50 rounded-lg text-slate-400">
                {section.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-slate-300">{section.title}</h3>
                  <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                    Soon
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{section.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Suggestion Box */}
      <div className="mt-6 bg-slate-800/30 rounded-lg border border-slate-700 p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-1">Have a suggestion?</h3>
        <p className="text-xs text-slate-500">
          If there's a specific topic or guide you'd like us to add, please let us know.
          We're constantly improving this resource based on your feedback.
        </p>
      </div>
    </div>
  );
}
