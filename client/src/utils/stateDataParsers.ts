// State Data Parsers
// Wrapper functions that parse files and store in state data store

import {
  StateName,
  StateBalanceSheet,
  StateSalesRegister,
  StatePurchaseRegister,
  StateJournalRegister,
  SalesRegisterEntry,
  PurchaseRegisterEntry,
  JournalEntry
} from '../types/stateData';

import {
  storeBalanceSheet,
  storeSalesRegister,
  storePurchaseRegister,
  storeJournalRegister
} from '../services/stateDataStore';

import { parseBalanceSheetPDF } from './pdfParser';
import * as XLSX from 'xlsx';

// ============================================
// BALANCE SHEET PARSER
// ============================================

export async function parseAndStoreBalanceSheet(
  file: File,
  month: string,
  state: StateName
): Promise<StateBalanceSheet> {
  const pdfResult = await parseBalanceSheetPDF(file);

  const bs: StateBalanceSheet = {
    openingStock: pdfResult.openingStock,
    closingStock: pdfResult.closingStock,
    purchases: pdfResult.purchases,
    grossSales: pdfResult.grossSales,
    netProfit: pdfResult.netProfit,
    netLoss: pdfResult.netLoss,
    netProfitLoss: pdfResult.netProfit - pdfResult.netLoss
  };

  storeBalanceSheet(month, state, bs);
  return bs;
}

// ============================================
// SALES REGISTER PARSER
// ============================================

// Channel detection patterns
const CHANNEL_PATTERNS: { channel: string; patterns: RegExp[] }[] = [
  {
    channel: 'Amazon',
    patterns: [/amazon/i, /amz/i]
  },
  {
    channel: 'Blinkit',
    patterns: [/blinkit/i, /grofers/i]
  },
  {
    channel: 'D2C',
    patterns: [/shopify/i, /website/i, /d2c/i, /direct/i, /online/i]
  },
  {
    channel: 'Offline',
    patterns: [/retail/i, /distributor/i, /wholesale/i, /dealer/i]
  }
];

function detectChannel(partyName: string): string {
  const lower = partyName.toLowerCase();
  for (const { channel, patterns } of CHANNEL_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        return channel;
      }
    }
  }
  return 'Other';
}

function isStockTransfer(partyName: string): boolean {
  return /heatronics/i.test(partyName);
}

function extractHeatronicsEntity(partyName: string): string {
  // Extract which Heatronics entity (e.g., "Heatronics UP" -> "UP")
  const match = partyName.match(/heatronics\s*(\w+)/i);
  return match ? match[1].toUpperCase() : 'Unknown';
}

export async function parseAndStoreSalesRegister(
  file: File,
  month: string,
  state: StateName
): Promise<StateSalesRegister> {
  const data = await readExcelFile(file);

  const entries: SalesRegisterEntry[] = [];
  const revenueByChannel: Record<string, number> = {};
  let totalRevenue = 0;
  const stockTransfers: { toEntity: string; amount: number }[] = [];
  let totalStockTransfers = 0;
  let sgst = 0, cgst = 0, igst = 0, roundOffs = 0;

  // Find header row and column indices
  const headers = findHeaders(data);
  const colIndices = {
    date: findColumnIndex(headers, ['date', 'invoice date', 'bill date']),
    party: findColumnIndex(headers, ['party', 'party name', 'customer', 'buyer']),
    amount: findColumnIndex(headers, ['amount', 'total', 'invoice amount', 'net amount', 'value']),
    sgst: findColumnIndex(headers, ['sgst', 'state gst']),
    cgst: findColumnIndex(headers, ['cgst', 'central gst']),
    igst: findColumnIndex(headers, ['igst', 'integrated gst']),
    roundOff: findColumnIndex(headers, ['round', 'round off', 'rounding'])
  };

  console.log(`[SR Parser] Found columns:`, colIndices);

  // Skip header row and parse data rows
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const party = String(row[colIndices.party] || '').trim();
    if (!party) continue;

    const amount = parseNumber(row[colIndices.amount]);
    const rowSGST = parseNumber(row[colIndices.sgst]);
    const rowCGST = parseNumber(row[colIndices.cgst]);
    const rowIGST = parseNumber(row[colIndices.igst]);
    const rowRoundOff = parseNumber(row[colIndices.roundOff]);

    // Accumulate GST and round offs
    sgst += rowSGST;
    cgst += rowCGST;
    igst += rowIGST;
    roundOffs += rowRoundOff;

    const isTransfer = isStockTransfer(party);
    const channel = isTransfer ? 'Stock Transfer' : detectChannel(party);

    const entry: SalesRegisterEntry = {
      date: String(row[colIndices.date] || ''),
      party,
      channel,
      amount,
      sgst: rowSGST,
      cgst: rowCGST,
      igst: rowIGST,
      isStockTransfer: isTransfer,
      toEntity: isTransfer ? extractHeatronicsEntity(party) : undefined
    };

    entries.push(entry);

    if (isTransfer) {
      stockTransfers.push({ toEntity: entry.toEntity!, amount });
      totalStockTransfers += amount;
    } else {
      // Revenue by channel (excluding stock transfers)
      revenueByChannel[channel] = (revenueByChannel[channel] || 0) + amount;
      totalRevenue += amount;
    }
  }

  const sr: StateSalesRegister = {
    entries,
    revenueByChannel,
    totalRevenue,
    stockTransfers,
    totalStockTransfers,
    sgst,
    cgst,
    igst,
    roundOffs
  };

  storeSalesRegister(month, state, sr);
  return sr;
}

// ============================================
// PURCHASE REGISTER PARSER
// ============================================

export async function parseAndStorePurchaseRegister(
  file: File,
  month: string,
  state: StateName
): Promise<StatePurchaseRegister> {
  const data = await readExcelFile(file);

  const entries: PurchaseRegisterEntry[] = [];
  const purchasesByCategory: Record<string, number> = {};
  let totalPurchases = 0;
  let sgst = 0, cgst = 0, igst = 0, roundOffs = 0;

  // Find header row and column indices
  const headers = findHeaders(data);
  const colIndices = {
    date: findColumnIndex(headers, ['date', 'invoice date', 'bill date']),
    party: findColumnIndex(headers, ['party', 'party name', 'supplier', 'vendor']),
    category: findColumnIndex(headers, ['category', 'type', 'item', 'description']),
    amount: findColumnIndex(headers, ['amount', 'total', 'invoice amount', 'net amount', 'value']),
    sgst: findColumnIndex(headers, ['sgst', 'state gst']),
    cgst: findColumnIndex(headers, ['cgst', 'central gst']),
    igst: findColumnIndex(headers, ['igst', 'integrated gst']),
    roundOff: findColumnIndex(headers, ['round', 'round off', 'rounding'])
  };

  console.log(`[PR Parser] Found columns:`, colIndices);

  // Skip header row and parse data rows
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const party = String(row[colIndices.party] || '').trim();
    if (!party) continue;

    const amount = parseNumber(row[colIndices.amount]);
    const category = String(row[colIndices.category] || 'General').trim();
    const rowSGST = parseNumber(row[colIndices.sgst]);
    const rowCGST = parseNumber(row[colIndices.cgst]);
    const rowIGST = parseNumber(row[colIndices.igst]);
    const rowRoundOff = parseNumber(row[colIndices.roundOff]);

    // Accumulate GST and round offs
    sgst += rowSGST;
    cgst += rowCGST;
    igst += rowIGST;
    roundOffs += rowRoundOff;

    const entry: PurchaseRegisterEntry = {
      date: String(row[colIndices.date] || ''),
      party,
      category,
      amount,
      sgst: rowSGST,
      cgst: rowCGST,
      igst: rowIGST
    };

    entries.push(entry);
    purchasesByCategory[category] = (purchasesByCategory[category] || 0) + amount;
    totalPurchases += amount;
  }

  const pr: StatePurchaseRegister = {
    entries,
    purchasesByCategory,
    totalPurchases,
    sgst,
    cgst,
    igst,
    roundOffs
  };

  storePurchaseRegister(month, state, pr);
  return pr;
}

// ============================================
// JOURNAL REGISTER PARSER
// ============================================

// Skip patterns - these are tracked separately, not as expenses
const GST_PATTERN = /\b(sgst|cgst|igst|gst)\b/i;
const TDS_PATTERN = /\btds\b/i;
const ROUND_OFF_PATTERN = /round\s*(off|ed)?/i;
const BANK_PATTERN = /\b(bank|cash|icici|hdfc|sbi|axis|kotak|yes\s*bank)\b/i;
const AMAZON_B2B_PATTERN = /amazon.*sale.*cash|amazon.*central|amazon.*maharashtra|amazon.*karnatak|amazon.*haryana|amazon.*telangana|amazone/i;

// MIS Head classification based on party/particulars
const MIS_HEAD_PATTERNS: { head: string; patterns: RegExp[] }[] = [
  { head: 'Amazon Fees', patterns: [/amazon.*fee/i, /amazon.*commission/i, /amazon.*charge/i] },
  { head: 'Blinkit Fees', patterns: [/blinkit.*fee/i, /blinkit.*commission/i, /grofers/i] },
  { head: 'D2C Fees', patterns: [/shiprocket/i, /delhivery/i, /bluedart/i, /dtdc/i, /courier/i, /shipping/i, /logistics/i] },
  { head: 'Facebook Ads', patterns: [/facebook/i, /meta\s*ads/i, /fb\s*ads/i] },
  { head: 'Google Ads', patterns: [/google\s*ads/i, /adwords/i] },
  { head: 'Amazon Ads', patterns: [/amazon.*ads/i, /amazon.*marketing/i, /sponsored/i] },
  { head: 'Blinkit Ads', patterns: [/blinkit.*ads/i, /blinkit.*marketing/i] },
  { head: 'Agency Fees', patterns: [/agency/i, /marketing.*agency/i, /digital.*agency/i] },
  { head: 'Salaries', patterns: [/salary/i, /salaries/i, /wages/i, /payroll/i] },
  { head: 'Rent', patterns: [/rent/i, /lease/i, /premises/i] },
  { head: 'Utilities', patterns: [/electricity/i, /water/i, /utility/i, /power/i] },
  { head: 'Professional Fees', patterns: [/professional/i, /legal/i, /consultant/i, /advisory/i, /ca\s*fee/i, /audit/i] },
  { head: 'Travel & Conveyance', patterns: [/travel/i, /conveyance/i, /transport/i, /cab/i, /uber/i, /ola/i] },
  { head: 'Office Expenses', patterns: [/office/i, /stationery/i, /printing/i] },
  { head: 'Repairs & Maintenance', patterns: [/repair/i, /maintenance/i, /amc/i] },
  { head: 'Insurance', patterns: [/insurance/i] },
  { head: 'Interest', patterns: [/interest/i, /finance.*charge/i] },
  { head: 'Depreciation', patterns: [/depreciation/i] }
];

function classifyToMISHead(particulars: string): string {
  const text = particulars.toLowerCase();
  for (const { head, patterns } of MIS_HEAD_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return head;
      }
    }
  }
  return 'Other Expenses';
}

export async function parseAndStoreJournalRegister(
  file: File,
  month: string,
  state: StateName
): Promise<StateJournalRegister> {
  const data = await readExcelFile(file);

  const entries: JournalEntry[] = [];
  const expenseEntries: JournalEntry[] = [];
  const expensesByHead: Record<string, number> = {};
  let totalExpenses = 0;
  let sgst = 0, cgst = 0, igst = 0, tds = 0, roundOffs = 0;

  // Find header row and column indices
  const headers = findHeaders(data);
  const colIndices = {
    date: findColumnIndex(headers, ['date', 'voucher date', 'txn date']),
    particulars: findColumnIndex(headers, ['particulars', 'description', 'narration', 'account']),
    debit: findColumnIndex(headers, ['debit', 'dr', 'debit amount']),
    credit: findColumnIndex(headers, ['credit', 'cr', 'credit amount'])
  };

  console.log(`[JR Parser] Found columns:`, colIndices);

  // Journal parsing: Group by date, first debit = amount, credit = party
  let currentDate = '';
  let currentDebitAmount = 0;
  let currentDebitParticulars = '';
  let currentCreditParty = '';
  let foundDebit = false;
  let foundCredit = false;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const dateVal = row[colIndices.date];
    const particulars = String(row[colIndices.particulars] || '').trim();
    const debit = parseNumber(row[colIndices.debit]);
    const credit = parseNumber(row[colIndices.credit]);

    if (!particulars && debit === 0 && credit === 0) continue;

    // Check if new date (new entry boundary)
    const dateStr = dateVal ? String(dateVal).trim() : '';
    const isNewEntry = dateStr && dateStr !== currentDate && isValidDate(dateStr);

    if (isNewEntry) {
      // Process previous entry if complete
      if (foundDebit && currentDebitAmount > 0) {
        const entry = createJournalEntry(
          currentDate,
          currentDebitAmount,
          currentDebitParticulars,
          currentCreditParty,
          state
        );
        entries.push(entry);

        // Accumulate based on type
        if (entry.isGST) {
          // Determine which GST type
          if (/sgst/i.test(currentDebitParticulars)) sgst += currentDebitAmount;
          else if (/cgst/i.test(currentDebitParticulars)) cgst += currentDebitAmount;
          else if (/igst/i.test(currentDebitParticulars)) igst += currentDebitAmount;
        } else if (entry.isTDS) {
          tds += currentDebitAmount;
        } else if (entry.isRoundOff) {
          roundOffs += currentDebitAmount;
        } else if (!entry.isSkipped) {
          // Regular expense
          expenseEntries.push(entry);
          expensesByHead[entry.misHead] = (expensesByHead[entry.misHead] || 0) + currentDebitAmount;
          totalExpenses += currentDebitAmount;
        }
      }

      // Reset for new entry
      currentDate = dateStr;
      currentDebitAmount = 0;
      currentDebitParticulars = '';
      currentCreditParty = '';
      foundDebit = false;
      foundCredit = false;
    }

    // Process current row
    if (debit > 0 && !foundDebit) {
      // First debit entry = expense amount
      currentDebitAmount = debit;
      currentDebitParticulars = particulars;
      foundDebit = true;
    } else if (credit > 0 && !foundCredit) {
      // First credit entry = party name
      currentCreditParty = particulars;
      foundCredit = true;
    }
  }

  // Process last entry
  if (foundDebit && currentDebitAmount > 0) {
    const entry = createJournalEntry(
      currentDate,
      currentDebitAmount,
      currentDebitParticulars,
      currentCreditParty,
      state
    );
    entries.push(entry);

    if (entry.isGST) {
      if (/sgst/i.test(currentDebitParticulars)) sgst += currentDebitAmount;
      else if (/cgst/i.test(currentDebitParticulars)) cgst += currentDebitAmount;
      else if (/igst/i.test(currentDebitParticulars)) igst += currentDebitAmount;
    } else if (entry.isTDS) {
      tds += currentDebitAmount;
    } else if (entry.isRoundOff) {
      roundOffs += currentDebitAmount;
    } else if (!entry.isSkipped) {
      expenseEntries.push(entry);
      expensesByHead[entry.misHead] = (expensesByHead[entry.misHead] || 0) + currentDebitAmount;
      totalExpenses += currentDebitAmount;
    }
  }

  const jr: StateJournalRegister = {
    entries,
    expenseEntries,
    expensesByHead,
    totalExpenses,
    sgst,
    cgst,
    igst,
    tds,
    roundOffs
  };

  storeJournalRegister(month, state, jr);
  return jr;
}

function createJournalEntry(
  date: string,
  debitAmount: number,
  debitParticulars: string,
  creditParty: string,
  state: string
): JournalEntry {
  const combined = `${debitParticulars} ${creditParty}`;

  const isGST = GST_PATTERN.test(combined);
  const isTDS = TDS_PATTERN.test(combined);
  const isRoundOff = ROUND_OFF_PATTERN.test(combined);
  const isBank = BANK_PATTERN.test(combined);
  const isAmazonB2B = AMAZON_B2B_PATTERN.test(combined);

  const isSkipped = isBank || isAmazonB2B;
  let skipReason: string | undefined;
  if (isBank) skipReason = 'Bank/Payment entry';
  if (isAmazonB2B) skipReason = 'Amazon B2B (in revenue)';

  // Classify to MIS head (use credit party for classification, but debit particulars as fallback)
  const misHead = isGST || isTDS || isRoundOff || isSkipped
    ? ''
    : classifyToMISHead(creditParty || debitParticulars);

  return {
    date,
    debitAmount,
    debitParticulars,
    creditParty,
    misHead,
    state,
    isGST,
    isTDS,
    isRoundOff,
    isSkipped,
    skipReason
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function readExcelFile(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read Excel file'));
    reader.readAsArrayBuffer(file);
  });
}

function findHeaders(data: unknown[][]): string[] {
  // Find the first row that looks like headers
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;

    const strRow = row.map(c => String(c || '').toLowerCase().trim());
    // Check if this row has header-like content
    if (strRow.some(c => /date|party|amount|debit|credit|particulars/i.test(c))) {
      return strRow;
    }
  }
  // Return first row as fallback
  return (data[0] || []).map(c => String(c || '').toLowerCase().trim());
}

function findColumnIndex(headers: string[], possibleNames: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    for (const name of possibleNames) {
      if (header.includes(name.toLowerCase())) {
        return i;
      }
    }
  }
  return -1;
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/[,\s]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function isValidDate(str: string): boolean {
  // Check if string looks like a date
  return /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/.test(str);
}
