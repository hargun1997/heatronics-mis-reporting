import { AccountPattern } from '../types';

export const DEFAULT_PATTERNS: AccountPattern[] = [
  // Revenue patterns
  { pattern: "SHIPROCKET.*CASH SALE", head: "A. Revenue", subhead: "Website/D2C" },
  { pattern: "AMAZON SALE.*CASH SALE", head: "A. Revenue", subhead: "Amazon" },
  { pattern: "BLINKIT|BLINK COMMERCE", head: "A. Revenue", subhead: "Blinkit" },
  { pattern: "HEATRONICS MEDICAL DEVICES P\\. L", head: "A. Revenue", subhead: "Offline/OEM" },

  // Channel & Fulfillment patterns
  { pattern: "AMAZON.*LOGISTICS", head: "F. Channel & Fulfillment", subhead: "Amazon Fees" },
  { pattern: "Storage Fee|SHIPPING FEE|Return Fee|Commission Income", head: "F. Channel & Fulfillment", subhead: "Amazon Fees" },
  { pattern: "PLATFORM FEE", head: "F. Channel & Fulfillment", subhead: "Amazon Fees" },
  { pattern: "AMAZON SELLER SERVICES", head: "F. Channel & Fulfillment", subhead: "Amazon Fees" },
  { pattern: "SHIPROCKET PRIVATE LIMITED", head: "F. Channel & Fulfillment", subhead: "D2C Fees (Shiprocket/PG)" },
  { pattern: "EASEBUZZ", head: "F. Channel & Fulfillment", subhead: "D2C Fees (Shiprocket/PG)" },

  // Marketing patterns
  { pattern: "FACEBOOK|META", head: "G. Sales & Marketing", subhead: "Facebook Ads" },
  { pattern: "GOOGLE INDIA", head: "G. Sales & Marketing", subhead: "Google Ads" },
  { pattern: "Advertisement.*Publicity", head: "G. Sales & Marketing", subhead: "Amazon Ads" },
  { pattern: "SOCIAL MEDIA MARKETING", head: "G. Sales & Marketing", subhead: "Agency Fees" },
  { pattern: "Branding.*Packaging|STUDIO SIX|LEMON.*COMPANY", head: "G. Sales & Marketing", subhead: "Agency Fees" },
  { pattern: "QUANTSCALE", head: "G. Sales & Marketing", subhead: "Agency Fees" },

  // COGM patterns
  { pattern: "JOB WORK", head: "E. COGM", subhead: "Contract/Job Work" },
  { pattern: "D\\.N\\. LED|KIRTI LIGHT", head: "E. COGM", subhead: "Contract/Job Work" },
  { pattern: "FREIGHT|JAGDAMBA|NITCO|PORTER", head: "E. COGM", subhead: "Inbound Transport" },
  { pattern: "Office Rent|^NEXIA$", head: "E. COGM", subhead: "Factory Rent" },
  { pattern: "Electricity|WATER.*ECLECTRICITY", head: "E. COGM", subhead: "Factory Electricity" },
  { pattern: "POWER BACKUP|MAINTENANCE|CONSUMABLE", head: "E. COGM", subhead: "Factory Maintenance" },

  // Manufacturing wages (specific employees)
  { pattern: "PAWAN SHARMA", head: "E. COGM", subhead: "Manufacturing Wages" },
  { pattern: "OM PAL SINGH", head: "E. COGM", subhead: "Manufacturing Wages" },
  { pattern: "RAGHUVEER", head: "E. COGM", subhead: "Manufacturing Wages" },
  { pattern: "Ram Nivash", head: "E. COGM", subhead: "Manufacturing Wages" },
  { pattern: "Ram Jatan", head: "E. COGM", subhead: "Manufacturing Wages" },
  { pattern: "HIMANSHU PANDEY", head: "E. COGM", subhead: "Manufacturing Wages" },
  { pattern: "RENU DEVI", head: "E. COGM", subhead: "Manufacturing Wages" },
  { pattern: "PRITEE DEVI", head: "E. COGM", subhead: "Manufacturing Wages" },

  // Operating expenses
  { pattern: "Salary|ESI.*EMPLOYER", head: "I. Operating Expenses", subhead: "Salaries (Admin)" },
  { pattern: "SHAILABH KUMAR", head: "I. Operating Expenses", subhead: "Salaries (Admin)" },
  { pattern: "Satendra kumar", head: "I. Operating Expenses", subhead: "Salaries (Admin)" },
  { pattern: "AVANISH KUMAR(?!.*EXP)", head: "I. Operating Expenses", subhead: "Salaries (Admin)" },
  { pattern: "PRABHASH CHANDRA", head: "I. Operating Expenses", subhead: "Salaries (Admin)" },
  { pattern: "VIVEKA NAND", head: "I. Operating Expenses", subhead: "Salaries (Admin)" },
  { pattern: "ASHISH KUMAR QC", head: "I. Operating Expenses", subhead: "Salaries (Admin)" },
  { pattern: "SHUBHI GUPTA", head: "I. Operating Expenses", subhead: "Salaries (Admin)" },
  { pattern: "DANIYAL", head: "I. Operating Expenses", subhead: "Salaries (Admin)" },

  // Miscellaneous
  { pattern: "Travelling|Miscellaneous|STAFF WELFARE", head: "I. Operating Expenses", subhead: "Miscellaneous" },
  { pattern: "AVANISH KUMAR.*EXP", head: "I. Operating Expenses", subhead: "Miscellaneous" },

  // Legal & CA
  { pattern: "LEGAL.*PROFESSIONAL|ACCOUNTING.*RETURN|JITIN|CA SAURABH|Sahas", head: "I. Operating Expenses", subhead: "Legal & CA" },

  // Admin expenses
  { pattern: "OFFICE EXPENSE|Printing.*Stationery|Bank Charge|COMMUNICATION|COURIER", head: "I. Operating Expenses", subhead: "Admin Expenses" },

  // Platform costs
  { pattern: "SHOPFLO|WATI|LEARNYM", head: "H. Platform Costs", subhead: "Other SaaS" },
  { pattern: "SHOPIFY", head: "H. Platform Costs", subhead: "Shopify" },

  // Ignore patterns (non-P&L)
  { pattern: "GST.*INPUT|GST.*OUTPUT|CGST|SGST|IGST", head: "Z. Ignore (Non-P&L)", subhead: "GST Input/Output" },
  { pattern: "TDS.*", head: "Z. Ignore (Non-P&L)", subhead: "TDS" },
  { pattern: "TCS.*", head: "Z. Ignore (Non-P&L)", subhead: "GST Input/Output" },
  { pattern: "DEFERRED", head: "Z. Ignore (Non-P&L)", subhead: "GST Input/Output" },
  { pattern: "CENTRAL BANK|HDFC BANK|AXIS BANK", head: "Z. Ignore (Non-P&L)", subhead: "Bank Transfers" },
  { pattern: "^Cash$", head: "Z. Ignore (Non-P&L)", subhead: "Bank Transfers" },
  { pattern: "DIRECTOR LOAN|HARLEEN CHAWLA", head: "Z. Ignore (Non-P&L)", subhead: "Inter-company" },

  // Exclude patterns (personal)
  { pattern: "DIWALI EXP|MLG SONS", head: "X. Exclude (Personal)", subhead: "Personal Expenses" }
];

export function getRecommendation(accountName: string, patterns: AccountPattern[]): { head: string; subhead: string } | null {
  for (const { pattern, head, subhead } of patterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(accountName)) {
        return { head, subhead };
      }
    } catch {
      // Skip invalid regex patterns
      continue;
    }
  }
  return null;
}
