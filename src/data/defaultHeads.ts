import { Heads } from '../types';

export const DEFAULT_HEADS: Heads = {
  "A. Revenue": {
    subheads: ["Website/D2C", "Amazon", "Blinkit", "Offline/OEM"],
    type: "credit"
  },
  "B. Returns": {
    subheads: ["Website Returns", "Amazon Returns", "Blinkit Returns", "Offline Returns"],
    type: "debit"
  },
  "C. Discounts": {
    subheads: ["Channel Discounts", "Promotional Discounts"],
    type: "debit"
  },
  "D. Taxes (GST)": {
    subheads: ["CGST", "SGST", "IGST"],
    type: "calculated"
  },
  "E. COGM": {
    subheads: [
      "Raw Materials & Inventory",
      "Manufacturing Wages",
      "Contract/Job Work",
      "Inbound Transport",
      "Factory Rent",
      "Factory Electricity",
      "Factory Maintenance"
    ],
    type: "debit"
  },
  "F. Channel & Fulfillment": {
    subheads: ["Amazon Fees", "Blinkit Fees", "D2C Fees (Shiprocket/PG)"],
    type: "debit"
  },
  "G. Sales & Marketing": {
    subheads: ["Facebook Ads", "Google Ads", "Amazon Ads", "Blinkit Ads", "Agency Fees"],
    type: "debit"
  },
  "H. Platform Costs": {
    subheads: ["Shopify", "Wati", "Shopflo", "Other SaaS"],
    type: "debit"
  },
  "I. Operating Expenses": {
    subheads: [
      "Salaries (Admin)",
      "Miscellaneous",
      "Legal & CA",
      "Platform/Software Costs",
      "Admin Expenses"
    ],
    type: "debit"
  },
  "J. Non-Operating": {
    subheads: ["Interest", "Depreciation", "Taxes"],
    type: "debit"
  },
  "X. Exclude (Personal)": {
    subheads: ["Personal Expenses", "Owner Withdrawals"],
    type: "exclude"
  },
  "Z. Ignore (Non-P&L)": {
    subheads: ["GST Input/Output", "TDS", "Bank Transfers", "Inter-company"],
    type: "ignore"
  }
};

export const HEAD_ORDER = [
  "A. Revenue",
  "B. Returns",
  "C. Discounts",
  "D. Taxes (GST)",
  "E. COGM",
  "F. Channel & Fulfillment",
  "G. Sales & Marketing",
  "H. Platform Costs",
  "I. Operating Expenses",
  "J. Non-Operating",
  "X. Exclude (Personal)",
  "Z. Ignore (Non-P&L)"
];

export const HEAD_COLORS: { [key: string]: string } = {
  "A. Revenue": "bg-green-100 text-green-800",
  "B. Returns": "bg-red-100 text-red-800",
  "C. Discounts": "bg-orange-100 text-orange-800",
  "D. Taxes (GST)": "bg-purple-100 text-purple-800",
  "E. COGM": "bg-blue-100 text-blue-800",
  "F. Channel & Fulfillment": "bg-indigo-100 text-indigo-800",
  "G. Sales & Marketing": "bg-pink-100 text-pink-800",
  "H. Platform Costs": "bg-cyan-100 text-cyan-800",
  "I. Operating Expenses": "bg-yellow-100 text-yellow-800",
  "J. Non-Operating": "bg-gray-100 text-gray-800",
  "X. Exclude (Personal)": "bg-red-200 text-red-900",
  "Z. Ignore (Non-P&L)": "bg-gray-200 text-gray-600"
};
