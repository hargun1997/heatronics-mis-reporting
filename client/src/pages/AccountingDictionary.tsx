import { useState, useEffect } from 'react';

interface DictionaryEntry {
  id: string;
  category: string;
  subcategory: string;
  name: string;
  description: string;
  bookingInstructions: string;
  tallyLedger: string;
  gstTreatment: string;
  examples: string[];
  tags: string[];
}

// Default entries (fallback if API not available)
const defaultEntries: DictionaryEntry[] = [
  // Revenue Categories
  {
    id: 'rev-amazon',
    category: 'Revenue',
    subcategory: 'Marketplace Sales',
    name: 'Amazon Sales',
    description: 'Sales made through Amazon marketplace including FBA and seller fulfilled orders.',
    bookingInstructions: 'Book under Sales - Amazon. GST is collected by Amazon for B2C. Net amount after TCS deduction.',
    tallyLedger: 'Sales - Amazon',
    gstTreatment: 'B2C: Amazon collects GST. B2B: We issue invoice with GST.',
    examples: ['FBA Orders', 'Easy Ship Orders', 'Self-Ship Orders'],
    tags: ['amazon', 'marketplace', 'ecommerce', 'sales']
  },
  {
    id: 'rev-flipkart',
    category: 'Revenue',
    subcategory: 'Marketplace Sales',
    name: 'Flipkart Sales',
    description: 'Sales made through Flipkart marketplace.',
    bookingInstructions: 'Book under Sales - Flipkart. GST treatment similar to Amazon.',
    tallyLedger: 'Sales - Flipkart',
    gstTreatment: 'B2C: Flipkart collects GST. B2B: We issue invoice with GST.',
    examples: ['Flipkart Assured', 'Self-Ship'],
    tags: ['flipkart', 'marketplace', 'ecommerce', 'sales']
  },
  {
    id: 'rev-website',
    category: 'Revenue',
    subcategory: 'Direct Sales',
    name: 'Website Sales (D2C)',
    description: 'Direct sales through company website.',
    bookingInstructions: 'Book under Sales - Website. Full GST responsibility on us.',
    tallyLedger: 'Sales - Website',
    gstTreatment: 'Full GST on all sales. Issue tax invoice for B2B.',
    examples: ['Prepaid Orders', 'COD Orders', 'Subscription Orders'],
    tags: ['website', 'd2c', 'direct', 'sales']
  },
  // Cost of Goods
  {
    id: 'cost-raw-material',
    category: 'Cost of Goods',
    subcategory: 'Raw Materials',
    name: 'Raw Material Purchase',
    description: 'Purchase of raw materials for manufacturing heating products.',
    bookingInstructions: 'Book under Purchase - Raw Materials. Claim GST input credit.',
    tallyLedger: 'Purchase - Raw Materials',
    gstTreatment: 'Input GST credit available. Ensure valid invoice.',
    examples: ['Heating Elements', 'Copper Wire', 'Thermostats', 'Plastic Components'],
    tags: ['purchase', 'raw material', 'manufacturing', 'cogs']
  },
  {
    id: 'cost-packaging',
    category: 'Cost of Goods',
    subcategory: 'Packaging',
    name: 'Packaging Materials',
    description: 'Boxes, labels, inserts, and other packaging materials.',
    bookingInstructions: 'Book under Purchase - Packaging. Claim GST input.',
    tallyLedger: 'Purchase - Packaging',
    gstTreatment: 'Input GST credit available.',
    examples: ['Corrugated Boxes', 'Product Labels', 'Bubble Wrap', 'Tape'],
    tags: ['packaging', 'materials', 'cogs']
  },
  // Channel Costs
  {
    id: 'channel-commission',
    category: 'Channel Costs',
    subcategory: 'Marketplace Fees',
    name: 'Marketplace Commission',
    description: 'Commission charged by marketplaces on sales.',
    bookingInstructions: 'Book under Commission - Marketplace. Auto-deducted from settlements.',
    tallyLedger: 'Commission Expenses',
    gstTreatment: 'IGST @ 18% charged. Input credit available.',
    examples: ['Amazon Referral Fee', 'Flipkart Commission', 'Meesho Commission'],
    tags: ['commission', 'marketplace', 'fees', 'channel']
  },
  {
    id: 'channel-shipping',
    category: 'Channel Costs',
    subcategory: 'Logistics',
    name: 'Shipping & Delivery',
    description: 'Courier and shipping charges for order fulfillment.',
    bookingInstructions: 'Book under Freight Outward. Track by carrier.',
    tallyLedger: 'Freight Outward',
    gstTreatment: 'GST @ 18% on courier services. Input credit available.',
    examples: ['Delhivery', 'Blue Dart', 'Amazon Easy Ship', 'Shiprocket'],
    tags: ['shipping', 'delivery', 'courier', 'logistics', 'freight']
  },
  {
    id: 'channel-storage',
    category: 'Channel Costs',
    subcategory: 'Warehousing',
    name: 'FBA Storage Fees',
    description: 'Amazon FBA warehouse storage and handling charges.',
    bookingInstructions: 'Book under Storage Charges - FBA. Deducted from settlements.',
    tallyLedger: 'Storage Expenses - FBA',
    gstTreatment: 'IGST @ 18% charged by Amazon. Input credit available.',
    examples: ['Monthly Storage', 'Long-term Storage', 'Removal Fees'],
    tags: ['fba', 'storage', 'amazon', 'warehouse']
  },
  // Marketing
  {
    id: 'mkt-amazon-ads',
    category: 'Marketing',
    subcategory: 'Marketplace Advertising',
    name: 'Amazon Ads',
    description: 'Amazon PPC advertising and sponsored products.',
    bookingInstructions: 'Book under Advertising - Amazon. Deducted from settlements.',
    tallyLedger: 'Advertisement - Amazon',
    gstTreatment: 'IGST @ 18% charged by Amazon. Input credit available.',
    examples: ['Sponsored Products', 'Sponsored Brands', 'Sponsored Display'],
    tags: ['amazon', 'advertising', 'ppc', 'marketing']
  },
  {
    id: 'mkt-meta-ads',
    category: 'Marketing',
    subcategory: 'Digital Advertising',
    name: 'Meta (Facebook/Instagram) Ads',
    description: 'Advertising on Facebook and Instagram platforms.',
    bookingInstructions: 'Book under Advertising - Meta. Payment via credit card/prepaid.',
    tallyLedger: 'Advertisement - Meta',
    gstTreatment: 'IGST @ 18% under RCM. Pay GST and claim input.',
    examples: ['Facebook Ads', 'Instagram Ads', 'Reels Boost'],
    tags: ['facebook', 'instagram', 'meta', 'advertising', 'marketing']
  },
  {
    id: 'mkt-google-ads',
    category: 'Marketing',
    subcategory: 'Digital Advertising',
    name: 'Google Ads',
    description: 'Google search and display advertising.',
    bookingInstructions: 'Book under Advertising - Google. Payment via credit card.',
    tallyLedger: 'Advertisement - Google',
    gstTreatment: 'IGST @ 18% under RCM. Pay GST and claim input.',
    examples: ['Search Ads', 'Display Ads', 'YouTube Ads', 'Shopping Ads'],
    tags: ['google', 'advertising', 'ppc', 'marketing']
  },
  // Operating Expenses
  {
    id: 'exp-rent',
    category: 'Operating Expenses',
    subcategory: 'Facility',
    name: 'Office/Warehouse Rent',
    description: 'Monthly rent for office and warehouse space.',
    bookingInstructions: 'Book under Rent Expenses. TDS @ 10% if rent > ₹50,000/month.',
    tallyLedger: 'Rent Expenses',
    gstTreatment: 'GST on commercial rent @ 18%. Input credit available.',
    examples: ['Office Rent', 'Warehouse Rent', 'Godown Rent'],
    tags: ['rent', 'facility', 'operating', 'expense']
  },
  {
    id: 'exp-salary',
    category: 'Operating Expenses',
    subcategory: 'Employee Costs',
    name: 'Salaries & Wages',
    description: 'Employee salaries, wages, and benefits.',
    bookingInstructions: 'Book under Salaries. TDS on salary per income tax slab.',
    tallyLedger: 'Salary Expenses',
    gstTreatment: 'No GST on salaries.',
    examples: ['Monthly Salary', 'Bonus', 'Overtime'],
    tags: ['salary', 'wages', 'employee', 'payroll']
  },
  {
    id: 'exp-utilities',
    category: 'Operating Expenses',
    subcategory: 'Facility',
    name: 'Utilities (Electricity, Water)',
    description: 'Electricity, water, and other utility bills.',
    bookingInstructions: 'Book under respective utility expense account.',
    tallyLedger: 'Electricity Expenses / Water Charges',
    gstTreatment: 'GST @ 18% on electricity (if taxable). Water usually exempt.',
    examples: ['Electricity Bill', 'Water Bill', 'Internet'],
    tags: ['utilities', 'electricity', 'water', 'operating']
  },
  {
    id: 'exp-professional',
    category: 'Operating Expenses',
    subcategory: 'Professional Services',
    name: 'Professional Fees (CA/Legal)',
    description: 'Fees paid to chartered accountants, lawyers, and consultants.',
    bookingInstructions: 'Book under Professional Fees. TDS @ 10% u/s 194J.',
    tallyLedger: 'Professional Fees',
    gstTreatment: 'GST @ 18% on professional services. Input credit available.',
    examples: ['CA Fees', 'Legal Fees', 'Consultant Fees'],
    tags: ['professional', 'ca', 'legal', 'consultant', 'tds']
  }
];

export function AccountingDictionary() {
  const [entries, setEntries] = useState<DictionaryEntry[]>(defaultEntries);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(null);

  // Try to fetch from API
  useEffect(() => {
    fetch('/api/dictionary')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setEntries(data);
        }
      })
      .catch(() => {
        // Use default entries on error
      });
  }, []);

  // Get unique categories
  const categories = ['all', ...new Set(entries.map(e => e.category))];

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    const matchesSearch = searchTerm === '' ||
      entry.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || entry.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Group by category
  const groupedEntries = filteredEntries.reduce((acc, entry) => {
    if (!acc[entry.category]) {
      acc[entry.category] = [];
    }
    acc[entry.category].push(entry);
    return acc;
  }, {} as Record<string, DictionaryEntry[]>);

  return (
    <div className="flex h-full">
      {/* Main List */}
      <div className={`flex-1 flex flex-col overflow-hidden ${selectedEntry ? 'hidden lg:flex' : ''}`}>
        {/* Search and Filters */}
        <div className="p-4 bg-white border-b border-gray-200 space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search expenses, categories, tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex gap-2 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat === 'all' ? 'All Categories' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Entries List */}
        <div className="flex-1 overflow-auto p-4">
          {Object.entries(groupedEntries).map(([category, categoryEntries]) => (
            <div key={category} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {categoryEntries.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      selectedEntry?.id === entry.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-gray-800">{entry.name}</h4>
                        <p className="text-sm text-gray-500 mt-1">{entry.subcategory}</p>
                      </div>
                      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">{entry.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {entry.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {filteredEntries.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-2">No entries found matching your search.</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedEntry && (
        <div className="w-full lg:w-[500px] bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">{selectedEntry.name}</h3>
            <button
              onClick={() => setSelectedEntry(null)}
              className="p-2 hover:bg-gray-100 rounded-lg lg:hidden"
            >
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-6">
            {/* Category Badge */}
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                {selectedEntry.category}
              </span>
              <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                {selectedEntry.subcategory}
              </span>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Description</h4>
              <p className="text-gray-700">{selectedEntry.description}</p>
            </div>

            {/* Booking Instructions */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-green-800 uppercase mb-2 flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                How to Book
              </h4>
              <p className="text-green-900">{selectedEntry.bookingInstructions}</p>
            </div>

            {/* Tally Ledger */}
            <div>
              <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Tally Ledger</h4>
              <code className="px-3 py-2 bg-gray-100 rounded text-sm block font-mono">
                {selectedEntry.tallyLedger}
              </code>
            </div>

            {/* GST Treatment */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-amber-800 uppercase mb-2 flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                GST Treatment
              </h4>
              <p className="text-amber-900">{selectedEntry.gstTreatment}</p>
            </div>

            {/* Examples */}
            <div>
              <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Examples</h4>
              <div className="flex flex-wrap gap-2">
                {selectedEntry.examples.map((example, i) => (
                  <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm">
                    {example}
                  </span>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Tags</h4>
              <div className="flex flex-wrap gap-2">
                {selectedEntry.tags.map(tag => (
                  <span
                    key={tag}
                    onClick={() => {
                      setSearchTerm(tag);
                      setSelectedEntry(null);
                    }}
                    className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm cursor-pointer hover:bg-blue-200"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
