// Enhanced Balance Sheet Parser
// Extracts ALL line items from Trading Account + P&L Account
// and maps them to MIS categories using accountMapping

import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import {
  BalanceSheetLineItem,
  EnhancedBalanceSheetData,
  TradingAccountData,
  PLAccountData,
  BalanceSheetParseResult,
  createEmptyTradingAccount,
  createEmptyPLAccount,
  createEmptyEnhancedBalanceSheet
} from '../types/balanceSheet';
import { MISHead } from '../types/misTracking';
import { mapAccountToMISBySection, normalizeAccountName, isSpecialAccount } from './accountMapping';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Generate unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Parse Indian number format (1,23,456.78 or 71,36,568.33)
function parseIndianNumber(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[\s,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

// Extract numbers from a line
function extractNumbersFromLine(line: string): number[] {
  const numbers = line.match(/[\d,]+\.?\d*/g);
  if (!numbers) return [];
  return numbers.map(n => parseIndianNumber(n)).filter(n => n > 0);
}

// Extract the FIRST significant number from a line
// In Busy PDFs, lines often have: Account Name    Amount    Subtotal
// We want the first number (actual amount), not the rightmost (subtotal)
function extractAmountFromLine(line: string): number {
  const numbers = extractNumbersFromLine(line);
  if (numbers.length === 0) return 0;

  // Get the FIRST significant number (ignore small numbers < 100)
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] > 100) {
      return numbers[i];
    }
  }
  return numbers[0];
}

// Extract the FIRST significant number from a line (for multi-line continuations)
// This is needed because continuation lines often have: amount   subtotal
// and we want the first amount, not the rightmost subtotal
function extractFirstAmountFromLine(line: string): number {
  const numbers = extractNumbersFromLine(line);
  if (numbers.length === 0) return 0;

  // Get the first significant number (ignore small numbers < 100)
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] > 100) {
      return numbers[i];
    }
  }
  return numbers[0];
}

// Extract account name from a line (text before the numbers)
function extractAccountName(line: string): string {
  // First, handle PDF column bleeding - split on pipe and take first part only
  // This handles cases like "AMAZON LOGISTICS EXP. | By Nett Loss"
  let cleaned = line.split('|')[0].trim();

  // Also remove any "By ..." suffix that indicates credit side bleeding through
  // Match " By " followed by common credit-side items
  cleaned = cleaned.replace(/\s+By\s+(Nett?\s*(Profit|Loss)|Gross\s*Profit|Sales?|Closing).*$/i, '').trim();

  // Remove "To " or "By " prefix
  cleaned = cleaned.replace(/^(to|by)\s+/i, '').trim();
  // Normalize multiple spaces to single space BEFORE removing numbers
  cleaned = cleaned.replace(/\s+/g, ' ');
  // Remove numbers and keep only text
  cleaned = cleaned.replace(/[\d,]+\.?\d*/g, '').trim();
  // Remove trailing special characters
  cleaned = cleaned.replace(/[|\-:]+\s*$/g, '').trim();
  return cleaned;
}

// Check if line is a section header or PDF artifact to skip
function isSectionHeader(line: string): boolean {
  const lower = line.toLowerCase();
  return /trading\s*account/i.test(lower) ||
         /profit\s*(&|and)?\s*loss/i.test(lower) ||
         /balance\s*sheet/i.test(lower) ||
         /d\s*e\s*b\s*i\s*t/i.test(lower) ||
         /c\s*r\s*e\s*d\s*i\s*t/i.test(lower) ||
         /total/i.test(lower) ||
         /from\s+\d+-\d+-\d+/i.test(lower) ||
         // PDF page transition artifacts
         /cont['']?d\.?\s*(on)?\s*page/i.test(lower) ||
         /continued\s*(on)?\s*page/i.test(lower) ||
         /^page\s*[;:]/i.test(lower) ||
         // Spaced out headers like "P R O F I T & L O S S"
         /p\s+r\s+o\s+f\s+i\s+t/i.test(lower) ||
         /a\s+c\s+c\s+o\s+u\s+n\s+t/i.test(lower) ||
         // Other page artifacts
         /^\s*page\s*\d+/i.test(lower) ||
         /^\s*-+\s*$/i.test(lower);  // Horizontal lines
}

// Check if this is a sub-item line (indented, part of a group)
function isSubItem(line: string): boolean {
  // Lines that start with significant whitespace or don't have "To"/"By" prefix
  return /^\s{4,}/.test(line) || (!/^(to|by)\s+/i.test(line.trim()) && !isSectionHeader(line));
}

// ============================================
// SECTION DETECTION
// ============================================

type Section = 'trading' | 'pl' | 'unknown';
type Side = 'debit' | 'credit' | 'unknown';

function detectSection(line: string, currentSection: Section): Section {
  const lower = line.toLowerCase();
  // Trading Account patterns - including "Trading A/c"
  if (/t\s*r\s*a\s*d\s*i\s*n\s*g\s*a\s*c\s*c\s*o\s*u\s*n\s*t/i.test(lower) ||
      /trading\s*(account|a\/?c)/i.test(lower)) {
    return 'trading';
  }
  // Profit & Loss Account patterns - including "Profit & Loss A/c", "P&L"
  if (/p\s*r\s*o\s*f\s*i\s*t\s*(&|and)?\s*l\s*o\s*s\s*s/i.test(lower) ||
      /profit\s*(&|and)?\s*loss\s*(account|a\/?c)/i.test(lower) ||
      /p\s*&?\s*l\s*(account|a\/?c)/i.test(lower)) {
    return 'pl';
  }
  return currentSection;
}

function detectSide(line: string, currentSide: Side): Side {
  const lower = line.toLowerCase();
  if (/d\s*e\s*b\s*i\s*t/i.test(lower)) {
    return 'debit';
  }
  if (/c\s*r\s*e\s*d\s*i\s*t/i.test(lower)) {
    return 'credit';
  }
  // "To" prefix indicates debit, "By" prefix indicates credit
  if (/^to\s+/i.test(line.trim())) {
    return 'debit';
  }
  if (/^by\s+/i.test(line.trim())) {
    return 'credit';
  }
  return currentSide;
}

// ============================================
// SPECIAL ITEM DETECTION
// ============================================

interface SpecialItemResult {
  isSpecial: boolean;
  type?: 'opening_stock' | 'closing_stock' | 'gross_profit' | 'net_profit' | 'net_loss' | 'sales' | 'purchase';
}

function detectSpecialItem(accountName: string): SpecialItemResult {
  const lower = accountName.toLowerCase().trim();
  // Also clean pipes and special chars for matching
  const cleaned = lower.replace(/[|;:]/g, '').trim();

  if (/opening\s*stock/i.test(lower)) {
    return { isSpecial: true, type: 'opening_stock' };
  }
  if (/closing\s*stock/i.test(lower)) {
    return { isSpecial: true, type: 'closing_stock' };
  }
  if (/gross\s*profit/i.test(lower)) {
    return { isSpecial: true, type: 'gross_profit' };
  }
  if (/nett?\s*profit/i.test(lower) && !/gross/i.test(lower)) {
    return { isSpecial: true, type: 'net_profit' };
  }
  if (/nett?\s*loss/i.test(lower)) {
    return { isSpecial: true, type: 'net_loss' };
  }
  // Sales - match "Sales", "Sale", "| Sales", etc. but NOT "Sales Return" or "Sales Tax"
  if (/^[\s|;:]*sales?[\s|;:]*$/i.test(lower) || /^[\s|;:]*sales?[\s|;:]*$/i.test(cleaned)) {
    return { isSpecial: true, type: 'sales' };
  }
  // Also catch "By Sale" or just account names that are purely "Sales"
  if (cleaned === 'sale' || cleaned === 'sales') {
    return { isSpecial: true, type: 'sales' };
  }
  if (/^purchase$/i.test(cleaned)) {
    return { isSpecial: true, type: 'purchase' };
  }

  return { isSpecial: false };
}

// ============================================
// LINE ITEM EXTRACTION
// ============================================

function extractLineItem(
  line: string,
  section: Section,
  side: Side,
  lineIndex: number
): BalanceSheetLineItem | null {
  // Skip section headers and empty lines
  if (isSectionHeader(line) || !line.trim()) {
    return null;
  }

  // Skip if section or side is unknown
  if (section === 'unknown' || side === 'unknown') {
    return null;
  }

  const accountName = extractAccountName(line);
  const amount = extractAmountFromLine(line);

  // Skip if no account name or amount
  if (!accountName || accountName.length < 2 || amount <= 0) {
    return null;
  }

  // Skip "Total" lines
  if (/^total$/i.test(accountName.trim())) {
    return null;
  }

  // Validation: "Rounded Off" should never be > 1000, if it is, it's a parsing error
  if (/round.*off/i.test(accountName) && amount > 1000) {
    console.log(`[extractLineItem] Skipping suspicious "Rounded Off" with large amount: ${amount}`);
    return null;
  }

  const normalized = normalizeAccountName(accountName);
  const special = detectSpecialItem(accountName);

  // Create line item (section and side are narrowed after the 'unknown' check above)
  const item: BalanceSheetLineItem = {
    id: generateId(),
    accountName,
    normalizedName: normalized,
    amount,
    section: section as 'trading' | 'pl',
    side: side as 'debit' | 'credit',
    isSpecial: special.isSpecial,
    specialType: special.type
  };

  // Apply MIS mapping if not a special item - USE SECTION-AWARE MAPPING
  if (!special.isSpecial && !isSpecialAccount(accountName)) {
    const mapping = mapAccountToMISBySection(accountName, section as 'trading' | 'pl');
    item.head = mapping.head;
    item.subhead = mapping.subhead;
    item.type = mapping.type;
    item.plLine = mapping.plLine;
  }

  return item;
}

// ============================================
// PDF PARSING
// ============================================

export async function parseBalanceSheetPDFEnhanced(file: File): Promise<BalanceSheetParseResult> {
  try {
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;

    const allLines: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log(`[Enhanced BS Parser] Parsing PDF with ${pdf.numPages} pages`);

    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // Group text items by y-position
      const items = textContent.items as { str: string; transform: number[] }[];
      const lineMap = new Map<number, { x: number; text: string }[]>();

      for (const item of items) {
        if ('str' in item && item.str.trim()) {
          const y = Math.round(item.transform[5] / 3) * 3;
          const x = item.transform[4];
          if (!lineMap.has(y)) {
            lineMap.set(y, []);
          }
          lineMap.get(y)!.push({ x, text: item.str });
        }
      }

      // Sort by y-position (descending) and x-position (ascending)
      const sortedLines = Array.from(lineMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, items]) => {
          return items.sort((a, b) => a.x - b.x).map(i => i.text).join(' ');
        });

      allLines.push(...sortedLines);
    }

    console.log(`[Enhanced BS Parser] Extracted ${allLines.length} lines from PDF`);

    // Parse all line items
    const result = parseAllLineItems(allLines, errors, warnings);

    return {
      success: true,
      data: result,
      errors,
      warnings
    };
  } catch (error) {
    console.error('[Enhanced BS Parser] PDF parsing error:', error);
    return {
      success: false,
      errors: [`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: []
    };
  }
}

// ============================================
// EXCEL PARSING
// ============================================

export async function parseBalanceSheetExcelEnhanced(file: File): Promise<BalanceSheetParseResult> {
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false
    }) as unknown[][];

    const errors: string[] = [];
    const warnings: string[] = [];

    // Convert to lines for parsing
    const allLines: string[] = jsonData.map(row => {
      return row.map(cell => String(cell || '')).join(' ');
    });

    console.log(`[Enhanced BS Parser] Extracted ${allLines.length} lines from Excel`);

    // Parse all line items
    const result = parseAllLineItems(allLines, errors, warnings);

    return {
      success: true,
      data: result,
      errors,
      warnings
    };
  } catch (error) {
    console.error('[Enhanced BS Parser] Excel parsing error:', error);
    return {
      success: false,
      errors: [`Failed to parse Excel: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: []
    };
  }
}

// ============================================
// HELPER FOR MULTI-LINE ENTRIES
// ============================================

function createLineItemFromParts(
  accountName: string,
  amount: number,
  section: Section,
  side: Side,
  lineIndex: number
): BalanceSheetLineItem | null {
  if (section === 'unknown' || side === 'unknown') {
    return null;
  }

  // Validation: "Rounded Off" should never be > 1000, if it is, it's a parsing error
  if (/round.*off/i.test(accountName) && amount > 1000) {
    console.log(`[createLineItemFromParts] Skipping suspicious "Rounded Off" with large amount: ${amount}`);
    return null;
  }

  const normalized = normalizeAccountName(accountName);
  const special = detectSpecialItem(accountName);

  const item: BalanceSheetLineItem = {
    id: generateId(),
    accountName,
    normalizedName: normalized,
    amount,
    section: section as 'trading' | 'pl',
    side: side as 'debit' | 'credit',
    isSpecial: special.isSpecial,
    specialType: special.type
  };

  // Apply MIS mapping if not a special item - USE SECTION-AWARE MAPPING
  if (!special.isSpecial && !isSpecialAccount(accountName)) {
    const mapping = mapAccountToMISBySection(accountName, section as 'trading' | 'pl');
    item.head = mapping.head;
    item.subhead = mapping.subhead;
    item.type = mapping.type;
    item.plLine = mapping.plLine;
  }

  return item;
}

// ============================================
// MAIN PARSING LOGIC
// ============================================

function parseAllLineItems(
  lines: string[],
  errors: string[],
  warnings: string[]
): EnhancedBalanceSheetData {
  const result = createEmptyEnhancedBalanceSheet();
  const tradingAccount = createEmptyTradingAccount();
  const plAccount = createEmptyPLAccount();

  let currentSection: Section = 'unknown';
  let currentSide: Side = 'unknown';
  let lastParentAccount = '';
  let sectionSwitchCount = 0;
  let linesProcessed = 0;
  let pendingAccountName = ''; // For multi-line entries where name is on one line and amount on next

  console.log('[parseAllLineItems] Starting to parse', lines.length, 'lines');

  // DEBUG: Log ALL lines containing amazon or logistics
  console.log('[DEBUG] ===== AMAZON/LOGISTICS LINE SCAN =====');
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (/amazon|logistics/i.test(lower)) {
      console.log(`[DEBUG] Line ${i}: "${lines[i]}"`);
      console.log(`[DEBUG]   - Account name: "${extractAccountName(lines[i])}"`);
      console.log(`[DEBUG]   - Amount: ${extractAmountFromLine(lines[i])}`);
      console.log(`[DEBUG]   - Numbers: ${extractNumbersFromLine(lines[i]).join(', ')}`);
    }
  }
  console.log('[DEBUG] ===== END AMAZON/LOGISTICS SCAN =====');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // DEBUG: Extra logging for amazon/logistics lines
    if (/amazon|logistics/i.test(line.toLowerCase())) {
      console.log(`[DEBUG-LOOP] Processing line ${i}: "${trimmed.substring(0, 80)}"`);
      console.log(`[DEBUG-LOOP]   - Current section: ${currentSection}, side: ${currentSide}`);
      console.log(`[DEBUG-LOOP]   - Pending account: "${pendingAccountName}"`);
    }

    // Update section and side
    const prevSection: Section = currentSection;
    currentSection = detectSection(line, currentSection);
    currentSide = detectSide(line, currentSide);

    if (currentSection !== prevSection) {
      sectionSwitchCount++;
      console.log(`[parseAllLineItems] Section changed at line ${i}: ${prevSection} -> ${currentSection}`);
      console.log(`[parseAllLineItems] Line content: "${trimmed.substring(0, 80)}..."`);
    }

    // Skip if we haven't found a section yet
    if (currentSection === 'unknown') continue;

    linesProcessed++;

    // Check if this line is just an amount (continuation of previous account name)
    const lineAccountName = extractAccountName(line);

    // For continuation lines, use extractFirstAmountFromLine to get the item amount (not the subtotal)
    // For regular lines, use extractAmountFromLine which gets the rightmost number
    const lineAmount = pendingAccountName ? extractFirstAmountFromLine(line) : extractAmountFromLine(line);

    // If we have a pending account name and this line has an amount but little/no text
    // Also be more lenient for important accounts (amazon, etc.) that often have parsing issues
    const isImportantPending = pendingAccountName && /amazon|logistics|shipping|storage/i.test(pendingAccountName);
    const isContinuationLine = pendingAccountName && lineAmount > 0 && (
      !lineAccountName ||
      lineAccountName.length < 3 ||
      (isImportantPending && lineAccountName.length < 15)  // More lenient for important accounts
    );

    if (isContinuationLine) {
      // This is a continuation line - create item with pending name and FIRST amount (not subtotal)
      console.log(`[parseAllLineItems] Multi-line continuation detected:`);
      console.log(`  - Pending account: "${pendingAccountName}"`);
      console.log(`  - Line content: "${trimmed.substring(0, 60)}..."`);
      console.log(`  - All numbers in line: ${extractNumbersFromLine(line).join(', ')}`);
      console.log(`  - First amount selected: ${lineAmount}`);

      const multiLineItem = createLineItemFromParts(pendingAccountName, lineAmount, currentSection, currentSide, i);
      pendingAccountName = '';

      if (multiLineItem) {
        console.log(`[parseAllLineItems] Multi-line item created: "${multiLineItem.accountName}" = ${multiLineItem.amount}`);

        // Add to appropriate section (same logic as regular items below)
        // In Trading Account: only DEBIT side items are expenses (COGM)
        // CREDIT side items are Sales/Revenue - skip them
        if (!multiLineItem.isSpecial) {
          if (currentSection === 'trading') {
            // Only add DEBIT side items to directExpenses (COGM)
            if (currentSide === 'debit') {
              tradingAccount.directExpenses.push(multiLineItem);
              tradingAccount.debitTotal += multiLineItem.amount;
              result.allLineItems.push(multiLineItem);
            } else {
              // Credit side in Trading = Sales/Revenue, not expenses
              tradingAccount.creditTotal += multiLineItem.amount;
              console.log(`[parseAllLineItems] Skipping credit-side Trading item (not an expense): "${multiLineItem.accountName}"`);
            }
          } else if (currentSection === 'pl') {
            if (multiLineItem.type === 'other_income') {
              plAccount.otherIncome.push(multiLineItem);
            } else {
              plAccount.indirectExpenses.push(multiLineItem);
            }
            if (currentSide === 'debit') {
              plAccount.debitTotal += multiLineItem.amount;
            } else {
              plAccount.creditTotal += multiLineItem.amount;
            }
            result.allLineItems.push(multiLineItem);
          }
        }
      }
      continue;
    }

    // Extract line item normally
    const item = extractLineItem(line, currentSection, currentSide, i);

    // DEBUG: Log what happened to amazon/logistics entries
    if (/amazon|logistics/i.test(line.toLowerCase())) {
      if (item) {
        console.log(`[DEBUG-LOOP] ✓ Item created: "${item.accountName}" = ${item.amount}, head: ${item.head}`);
      } else {
        console.log(`[DEBUG-LOOP] ✗ No item created for amazon/logistics line`);
        console.log(`[DEBUG-LOOP]   - lineAccountName: "${lineAccountName}" (length: ${lineAccountName.length})`);
        console.log(`[DEBUG-LOOP]   - lineAmount: ${lineAmount}`);
        console.log(`[DEBUG-LOOP]   - Will set pending: ${lineAccountName && lineAccountName.length >= 3 && lineAmount === 0}`);
      }
    }

    if (!item) {
      // Check if this line has an account name but no amount (might be multi-line)
      if (lineAccountName && lineAccountName.length >= 3 && lineAmount === 0) {
        // Check if it looks like an expense account (not a header)
        if (!isSectionHeader(line) && !/^to\s+(opening|closing|purchase|gross|expenses)/i.test(trimmed)) {
          pendingAccountName = lineAccountName;
          console.log(`[parseAllLineItems] Pending multi-line account: "${pendingAccountName}"`);
        }
      }
      continue;
    }

    // Clear pending if we got a valid item
    pendingAccountName = '';

    // Handle special items (Opening Stock, Closing Stock, etc.)
    if (item.isSpecial) {
      switch (item.specialType) {
        case 'opening_stock':
          tradingAccount.openingStock = item.amount;
          break;
        case 'closing_stock':
          tradingAccount.closingStock = item.amount;
          break;
        case 'sales':
          tradingAccount.sales = item.amount;
          break;
        case 'purchase':
          tradingAccount.purchases = item.amount;
          break;
        case 'gross_profit':
          if (currentSection === 'trading') {
            tradingAccount.grossProfit = item.amount;
          } else {
            plAccount.grossProfit = item.amount;
          }
          break;
        case 'net_profit':
          plAccount.netProfitLoss = item.amount;
          break;
        case 'net_loss':
          plAccount.netProfitLoss = -item.amount;
          break;
      }
      continue;
    }

    // Add to appropriate section
    // In Trading Account: only DEBIT side items are expenses (COGM)
    // CREDIT side items are Sales/Revenue - skip them
    if (currentSection === 'trading') {
      // Only add DEBIT side items to directExpenses (COGM)
      if (currentSide === 'debit') {
        tradingAccount.directExpenses.push(item);
        tradingAccount.debitTotal += item.amount;
      } else {
        // Credit side in Trading = Sales/Revenue, not expenses
        tradingAccount.creditTotal += item.amount;
        console.log(`[parseAllLineItems] Skipping credit-side Trading item (not an expense): "${item.accountName}"`);
        continue; // Don't add to allLineItems
      }
    } else if (currentSection === 'pl') {
      if (item.type === 'other_income') {
        plAccount.otherIncome.push(item);
      } else {
        plAccount.indirectExpenses.push(item);
      }
      if (currentSide === 'debit') {
        plAccount.debitTotal += item.amount;
      } else {
        plAccount.creditTotal += item.amount;
      }
    }

    // Add to all line items
    result.allLineItems.push(item);
  }

  // Assign results
  result.tradingAccount = tradingAccount;
  result.plAccount = plAccount;

  console.log('[parseAllLineItems] After parsing loop:');
  console.log(`  - Section switches detected: ${sectionSwitchCount}`);
  console.log(`  - Total line items extracted: ${result.allLineItems.length}`);
  console.log(`  - Trading direct expenses: ${tradingAccount.directExpenses.length}`);
  console.log(`  - P&L indirect expenses: ${plAccount.indirectExpenses.length}`);

  // Log first 5 extracted items for debugging
  for (const item of result.allLineItems.slice(0, 5)) {
    console.log(`  - Item: "${item.accountName}" = ${item.amount} (section: ${item.section}, head: ${item.head || 'NONE'})`);
  }

  // Separate mapped and unmapped items
  for (const item of result.allLineItems) {
    if (item.head) {
      result.mappedItems.push(item);
    } else if (!item.isSpecial) {
      result.unmappedItems.push(item);
      warnings.push(`Unmapped account: ${item.accountName}`);
    }
  }

  // Aggregate by head/subhead
  result.aggregatedByHead = aggregateByHead(result.mappedItems);

  // Calculate totals
  result.totalExpenses = result.mappedItems
    .filter(item => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0);

  result.totalIgnored = result.mappedItems
    .filter(item => item.head === 'Z. Ignore')
    .reduce((sum, item) => sum + item.amount, 0);

  result.totalExcluded = result.mappedItems
    .filter(item => item.head === 'X. Exclude')
    .reduce((sum, item) => sum + item.amount, 0);

  // Validation
  result.tradingBalanceDiff = Math.abs(tradingAccount.debitTotal - tradingAccount.creditTotal);
  result.plBalanceDiff = Math.abs(plAccount.debitTotal - plAccount.creditTotal);
  result.isBalanced = result.tradingBalanceDiff < 1 && result.plBalanceDiff < 1;

  console.log('[Enhanced BS Parser] Parsing complete:', {
    tradingItems: tradingAccount.directExpenses.length,
    plItems: plAccount.indirectExpenses.length,
    mappedItems: result.mappedItems.length,
    unmappedItems: result.unmappedItems.length,
    openingStock: tradingAccount.openingStock,
    closingStock: tradingAccount.closingStock,
    purchases: tradingAccount.purchases,
    sales: tradingAccount.sales,
    grossProfit: tradingAccount.grossProfit,
    netProfitLoss: plAccount.netProfitLoss
  });

  return result;
}

// ============================================
// AGGREGATION
// ============================================

function aggregateByHead(items: BalanceSheetLineItem[]): Record<string, {
  head: MISHead;
  total: number;
  subheads: Record<string, {
    subhead: string;
    total: number;
    items: BalanceSheetLineItem[];
  }>;
}> {
  const result: Record<string, {
    head: MISHead;
    total: number;
    subheads: Record<string, {
      subhead: string;
      total: number;
      items: BalanceSheetLineItem[];
    }>;
  }> = {};

  for (const item of items) {
    if (!item.head || !item.subhead) continue;

    const headKey = item.head;
    const subheadKey = item.subhead;

    // Initialize head if not exists
    if (!result[headKey]) {
      result[headKey] = {
        head: item.head,
        total: 0,
        subheads: {}
      };
    }

    // Initialize subhead if not exists
    if (!result[headKey].subheads[subheadKey]) {
      result[headKey].subheads[subheadKey] = {
        subhead: subheadKey,
        total: 0,
        items: []
      };
    }

    // Add to totals
    result[headKey].total += item.amount;
    result[headKey].subheads[subheadKey].total += item.amount;
    result[headKey].subheads[subheadKey].items.push(item);
  }

  return result;
}

// ============================================
// UNIFIED PARSER
// ============================================

export async function parseBalanceSheetEnhanced(file: File): Promise<BalanceSheetParseResult> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.pdf')) {
    return parseBalanceSheetPDFEnhanced(file);
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    return parseBalanceSheetExcelEnhanced(file);
  } else {
    return {
      success: false,
      errors: ['Unsupported file format. Please upload PDF or Excel file.'],
      warnings: []
    };
  }
}

// ============================================
// EXTRACTION HELPERS FOR MIS CALCULATOR
// ============================================

/**
 * Extract COGM amounts from enhanced balance sheet data
 * Note: Raw Materials (Opening + Purchases - Closing) should only come from UP
 */
export function extractCOGMFromBalanceSheet(data: EnhancedBalanceSheetData): {
  rawMaterialsInventory: number;
  consumables: number;
  manufacturingWages: number;
  contractWagesMfg: number;
  inboundTransport: number;
  factoryRent: number;
  factoryElectricity: number;
  factoryMaintenance: number;
  jobWork: number;
  qualityTesting: number;
  otherDirectExpenses: number;
} {
  const cogm = data.aggregatedByHead['E. COGM'];
  if (!cogm) {
    return {
      rawMaterialsInventory: 0,
      consumables: 0,
      manufacturingWages: 0,
      contractWagesMfg: 0,
      inboundTransport: 0,
      factoryRent: 0,
      factoryElectricity: 0,
      factoryMaintenance: 0,
      jobWork: 0,
      qualityTesting: 0,
      otherDirectExpenses: 0
    };
  }

  const getSubheadTotal = (subhead: string): number => {
    return cogm.subheads[subhead]?.total || 0;
  };

  return {
    rawMaterialsInventory: getSubheadTotal('Raw Materials & Inventory'),
    consumables: getSubheadTotal('Consumables'),
    manufacturingWages: getSubheadTotal('Manufacturing Wages'),
    contractWagesMfg: getSubheadTotal('Contract Wages (Mfg)'),
    inboundTransport: getSubheadTotal('Inbound Transport'),
    factoryRent: getSubheadTotal('Factory Rent'),
    factoryElectricity: getSubheadTotal('Factory Electricity'),
    factoryMaintenance: getSubheadTotal('Factory Maintenance'),
    jobWork: getSubheadTotal('Job work'),
    qualityTesting: getSubheadTotal('Quality Testing'),
    otherDirectExpenses: getSubheadTotal('Other Direct Expenses')
  };
}

/**
 * Extract Channel & Fulfillment amounts from enhanced balance sheet data
 */
export function extractChannelFromBalanceSheet(data: EnhancedBalanceSheetData): {
  amazonFees: number;
  blinkitFees: number;
  d2cFees: number;
} {
  const channel = data.aggregatedByHead['F. Channel & Fulfillment'];
  if (!channel) {
    return { amazonFees: 0, blinkitFees: 0, d2cFees: 0 };
  }

  return {
    amazonFees: channel.subheads['Amazon Fees']?.total || 0,
    blinkitFees: channel.subheads['Blinkit Fees']?.total || 0,
    d2cFees: channel.subheads['D2C Fees']?.total || 0
  };
}

/**
 * Extract Sales & Marketing amounts from enhanced balance sheet data
 */
export function extractMarketingFromBalanceSheet(data: EnhancedBalanceSheetData): {
  facebookAds: number;
  googleAds: number;
  amazonAds: number;
  blinkitAds: number;
  agencyFees: number;
  advertisingMarketing: number;
} {
  const marketing = data.aggregatedByHead['G. Sales & Marketing'];
  if (!marketing) {
    return { facebookAds: 0, googleAds: 0, amazonAds: 0, blinkitAds: 0, agencyFees: 0, advertisingMarketing: 0 };
  }

  return {
    facebookAds: (marketing.subheads['Facebook Ads']?.total || 0) +
                 (marketing.subheads['Facebook Ads (split-needed)']?.total || 0),
    googleAds: marketing.subheads['Google Ads']?.total || 0,
    amazonAds: marketing.subheads['Amazon Ads']?.total || 0,
    blinkitAds: marketing.subheads['Blinkit Ads']?.total || 0,
    agencyFees: marketing.subheads['Agency Fees']?.total || 0,
    // Include general Advertising & Marketing and Social Media Ads
    advertisingMarketing: (marketing.subheads['Advertising & Marketing']?.total || 0) +
                          (marketing.subheads['Social Media Ads']?.total || 0)
  };
}

/**
 * Extract Platform Costs from enhanced balance sheet data
 */
export function extractPlatformFromBalanceSheet(data: EnhancedBalanceSheetData): {
  shopifySubscription: number;
  watiSubscription: number;
  shopfloSubscription: number;
} {
  const platform = data.aggregatedByHead['H. Platform Costs'];
  if (!platform) {
    return { shopifySubscription: 0, watiSubscription: 0, shopfloSubscription: 0 };
  }

  return {
    shopifySubscription: platform.subheads['Shopify Subscription']?.total || 0,
    watiSubscription: platform.subheads['Wati Subscription']?.total || 0,
    shopfloSubscription: platform.subheads['Shopflo subscription']?.total || 0
  };
}

/**
 * Extract Operating Expenses from enhanced balance sheet data
 */
export function extractOperatingFromBalanceSheet(data: EnhancedBalanceSheetData): {
  salariesAdminMgmt: number;
  miscellaneous: number;
  legalCaExpenses: number;
  platformCostsCRM: number;
  administrativeExpenses: number;
  staffWelfareEvents: number;
  banksFinanceCharges: number;
  otherOperatingExpenses: number;
} {
  const operating = data.aggregatedByHead['I. Operating Expenses'];
  if (!operating) {
    return {
      salariesAdminMgmt: 0,
      miscellaneous: 0,
      legalCaExpenses: 0,
      platformCostsCRM: 0,
      administrativeExpenses: 0,
      staffWelfareEvents: 0,
      banksFinanceCharges: 0,
      otherOperatingExpenses: 0
    };
  }

  return {
    salariesAdminMgmt: (operating.subheads['Salaries (Admin Mgmt)']?.total || 0) +
                       (operating.subheads['Salaries (Admin, Mgmt)']?.total || 0) +
                       (operating.subheads['Salaries Director']?.total || 0),
    miscellaneous: (operating.subheads['Miscellaneous (Travel insurance)']?.total || 0) +
                   (operating.subheads['Miscellaneous (Travel, insurance)']?.total || 0),
    legalCaExpenses: operating.subheads['Legal & CA expenses']?.total || 0,
    platformCostsCRM: (operating.subheads['Platform Costs (CRM, inventory softwares)']?.total || 0) +
                      (operating.subheads['CRM Admin expenses']?.total || 0),
    administrativeExpenses: operating.subheads['Administrative Expenses']?.total || 0,
    staffWelfareEvents: operating.subheads['Staff Welfare & Events']?.total || 0,
    banksFinanceCharges: operating.subheads['Banks & Finance Charges']?.total || 0,
    otherOperatingExpenses: operating.subheads['Other Operating Expenses']?.total || 0
  };
}

/**
 * Extract Non-Operating amounts from enhanced balance sheet data
 */
export function extractNonOperatingFromBalanceSheet(data: EnhancedBalanceSheetData): {
  interestExpense: number;
  depreciation: number;
  amortization: number;
  writeOffs: number;
  incomeTax: number;
} {
  const nonOp = data.aggregatedByHead['J. Non-Operating'];
  if (!nonOp) {
    return { interestExpense: 0, depreciation: 0, amortization: 0, writeOffs: 0, incomeTax: 0 };
  }

  return {
    interestExpense: nonOp.subheads['Less: Interest Expense']?.total || 0,
    depreciation: nonOp.subheads['Less: Depreciation']?.total || 0,
    amortization: nonOp.subheads['Less: Amortization']?.total || 0,
    writeOffs: nonOp.subheads['Write-offs']?.total || 0,
    incomeTax: nonOp.subheads['Less: Income Tax']?.total || 0
  };
}

/**
 * Get ignored and excluded totals
 */
export function getIgnoredExcludedTotals(data: EnhancedBalanceSheetData): {
  ignoredTotal: number;
  excludedTotal: number;
} {
  return {
    ignoredTotal: data.aggregatedByHead['Z. Ignore']?.total || 0,
    excludedTotal: data.aggregatedByHead['X. Exclude']?.total || 0
  };
}
