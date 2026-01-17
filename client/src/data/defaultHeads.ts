import { Heads } from '../types';

export const DEFAULT_HEADS: Heads = {
  "A. Revenue": {
    subheads: ["Amazon", "Website", "Blinkit", "Offline/OEM"],
    type: "credit"
  },
  "B. Stock Transfer": {
    subheads: ["Maharashtra", "Telangana", "Karnataka", "Haryana", "Other"],
    type: "debit"
  },
  "C. Returns": {
    subheads: ["Amazon", "Website", "Blinkit", "Offline/OEM"],
    type: "debit"
  },
  "D. Discounts": {
    subheads: ["Channel Discounts", "Promotional Discounts"],
    type: "debit"
  },
  "E. Taxes (GST)": {
    subheads: ["CGST", "SGST", "IGST"],
    type: "calculated"
  },
  "F. COGM": {
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
  "G. Channel & Fulfillment": {
    subheads: ["Amazon Fees", "Blinkit Fees", "D2C Fees (Shiprocket/PG)"],
    type: "debit"
  },
  "H. Sales & Marketing": {
    subheads: ["Facebook Ads", "Google Ads", "Amazon Ads", "Blinkit Ads", "Agency Fees"],
    type: "debit"
  },
  "I. Platform Costs": {
    subheads: ["Shopify", "Wati", "Shopflo", "Other SaaS"],
    type: "debit"
  },
  "J. Operating Expenses": {
    subheads: [
      "Salaries (Admin)",
      "Miscellaneous",
      "Legal & CA",
      "Platform/Software Costs",
      "Admin Expenses"
    ],
    type: "debit"
  },
  "K. Non-Operating": {
    subheads: ["Interest", "Depreciation", "Taxes"],
    type: "debit"
  },
  "X. Exclude (Personal)": {
    subheads: ["Personal Expenses", "Owner Withdrawals"],
    type: "exclude"
  }
};

export const HEAD_ORDER = [
  "A. Revenue",
  "B. Stock Transfer",
  "C. Returns",
  "D. Discounts",
  "E. Taxes (GST)",
  "F. COGM",
  "G. Channel & Fulfillment",
  "H. Sales & Marketing",
  "I. Platform Costs",
  "J. Operating Expenses",
  "K. Non-Operating",
  "X. Exclude (Personal)"
];

export const HEAD_COLORS: { [key: string]: string } = {
  "A. Revenue": "bg-green-100 text-green-800",
  "B. Stock Transfer": "bg-amber-100 text-amber-800",
  "C. Returns": "bg-red-100 text-red-800",
  "D. Discounts": "bg-orange-100 text-orange-800",
  "E. Taxes (GST)": "bg-purple-100 text-purple-800",
  "F. COGM": "bg-blue-100 text-blue-800",
  "G. Channel & Fulfillment": "bg-indigo-100 text-indigo-800",
  "H. Sales & Marketing": "bg-pink-100 text-pink-800",
  "I. Platform Costs": "bg-cyan-100 text-cyan-800",
  "J. Operating Expenses": "bg-yellow-100 text-yellow-800",
  "K. Non-Operating": "bg-gray-100 text-gray-800",
  "X. Exclude (Personal)": "bg-red-200 text-red-900"
};
