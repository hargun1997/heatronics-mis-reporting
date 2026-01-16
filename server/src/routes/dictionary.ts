import { Router } from 'express';

const router = Router();

// In-memory storage (can be replaced with database later)
let dictionaryEntries: DictionaryEntry[] = getDefaultDictionaryEntries();

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
  createdAt: string;
  updatedAt: string;
}

// Get all dictionary entries
router.get('/', (req, res) => {
  const { category, search } = req.query;

  let filtered = [...dictionaryEntries];

  if (category && typeof category === 'string') {
    filtered = filtered.filter(e => e.category.toLowerCase() === category.toLowerCase());
  }

  if (search && typeof search === 'string') {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(e =>
      e.name.toLowerCase().includes(searchLower) ||
      e.description.toLowerCase().includes(searchLower) ||
      e.tags.some(t => t.toLowerCase().includes(searchLower))
    );
  }

  res.json(filtered);
});

// Get categories
router.get('/categories', (req, res) => {
  const categories = [...new Set(dictionaryEntries.map(e => e.category))];
  res.json(categories);
});

// Get single entry
router.get('/:id', (req, res) => {
  const entry = dictionaryEntries.find(e => e.id === req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  res.json(entry);
});

// Create new entry
router.post('/', (req, res) => {
  const newEntry: DictionaryEntry = {
    ...req.body,
    id: `entry-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  dictionaryEntries.push(newEntry);
  res.status(201).json(newEntry);
});

// Update entry
router.put('/:id', (req, res) => {
  const index = dictionaryEntries.findIndex(e => e.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Entry not found' });
  }

  dictionaryEntries[index] = {
    ...dictionaryEntries[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };

  res.json(dictionaryEntries[index]);
});

// Delete entry
router.delete('/:id', (req, res) => {
  const index = dictionaryEntries.findIndex(e => e.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Entry not found' });
  }

  dictionaryEntries.splice(index, 1);
  res.status(204).send();
});

// Default dictionary entries
function getDefaultDictionaryEntries(): DictionaryEntry[] {
  return [
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
      tags: ['amazon', 'marketplace', 'ecommerce', 'sales'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
      tags: ['flipkart', 'marketplace', 'ecommerce', 'sales'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'rev-website',
      category: 'Revenue',
      subcategory: 'Direct Sales',
      name: 'Website Sales',
      description: 'Direct sales through company website (D2C).',
      bookingInstructions: 'Book under Sales - Website. Full GST responsibility on us.',
      tallyLedger: 'Sales - Website',
      gstTreatment: 'Full GST on all sales. Issue tax invoice for B2B.',
      examples: ['Prepaid Orders', 'COD Orders', 'Subscription Orders'],
      tags: ['website', 'd2c', 'direct', 'sales'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    // Cost Categories
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
      tags: ['purchase', 'raw material', 'manufacturing', 'cogs'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
      tags: ['packaging', 'materials', 'cogs'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
      tags: ['rent', 'facility', 'operating', 'expense'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
      tags: ['salary', 'wages', 'employee', 'payroll'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    // Marketing Expenses
    {
      id: 'exp-ads-amazon',
      category: 'Marketing',
      subcategory: 'Marketplace Advertising',
      name: 'Amazon Ads',
      description: 'Amazon PPC advertising and sponsored products.',
      bookingInstructions: 'Book under Advertising - Amazon. Deducted from settlements.',
      tallyLedger: 'Advertisement - Amazon',
      gstTreatment: 'IGST @ 18% charged by Amazon. Input credit available.',
      examples: ['Sponsored Products', 'Sponsored Brands', 'Sponsored Display'],
      tags: ['amazon', 'advertising', 'ppc', 'marketing'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'exp-ads-meta',
      category: 'Marketing',
      subcategory: 'Digital Advertising',
      name: 'Meta (Facebook/Instagram) Ads',
      description: 'Advertising on Facebook and Instagram platforms.',
      bookingInstructions: 'Book under Advertising - Meta. Payment via credit card/prepaid.',
      tallyLedger: 'Advertisement - Meta',
      gstTreatment: 'IGST @ 18% under RCM. Pay GST and claim input.',
      examples: ['Facebook Ads', 'Instagram Ads', 'Reels Boost'],
      tags: ['facebook', 'instagram', 'meta', 'advertising', 'marketing'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
      tags: ['commission', 'marketplace', 'fees', 'channel'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
      tags: ['shipping', 'delivery', 'courier', 'logistics', 'freight'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

export default router;
