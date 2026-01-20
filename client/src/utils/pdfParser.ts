import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export interface BalanceSheetPDFResult {
  openingStock: number;
  closingStock: number;
  grossSales: number;
  netSales: number;  // Net of discounts and GST
  revenueDiscounts: number;
  gstOnSales: number;
  netProfit: number;  // Positive for profit
  netLoss: number;    // Positive for loss
  purchases: number;
  grossProfit: number;
  rawText: string;
  errors: string[];
  extractedLines: ExtractedLine[];  // For debugging/display
}

export interface ExtractedLine {
  label: string;
  value: number;
  source: string;
}

// Parse Indian number format (1,23,456.78 or 71,36,568.33)
function parseIndianNumber(text: string): number {
  if (!text) return 0;
  // Remove all spaces and commas, handle Indian format
  const cleaned = text.replace(/[\s,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Extract the rightmost number from a line (usually the amount in Busy format)
function extractAmountFromLine(line: string): number {
  // Find all numbers in the line
  const numbers = line.match(/[\d,]+\.?\d*/g);
  if (!numbers || numbers.length === 0) return 0;

  // Get the rightmost significant number (last one that's > 0)
  for (let i = numbers.length - 1; i >= 0; i--) {
    const val = parseIndianNumber(numbers[i]);
    if (val > 100) { // Ignore small numbers that might be percentages or serial numbers
      return val;
    }
  }

  // Fallback to last number
  return parseIndianNumber(numbers[numbers.length - 1]);
}

// Find a section in the text (Trading Account, P&L, etc.)
function findSection(lines: string[], sectionPatterns: RegExp[]): { startIndex: number; endIndex: number } {
  let startIndex = -1;
  let endIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    for (const pattern of sectionPatterns) {
      if (pattern.test(line)) {
        startIndex = i;
        break;
      }
    }
    if (startIndex >= 0) break;
  }

  // Find where section ends (next major section header or end of file)
  if (startIndex >= 0) {
    const nextSectionPatterns = [
      /profit\s*(&|and)\s*loss/i,
      /balance\s*sheet/i,
      /schedule/i,
      /notes\s*to/i
    ];

    for (let i = startIndex + 5; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      for (const pattern of nextSectionPatterns) {
        if (pattern.test(line) && i > startIndex + 10) {
          endIndex = i;
          break;
        }
      }
      if (endIndex < lines.length) break;
    }
  }

  return { startIndex, endIndex };
}

// ============================================
// BUSY SOFTWARE SPECIFIC PARSER
// ============================================

interface TradingAccountData {
  openingStock: number;
  purchases: number;
  directExpenses: number;
  grossProfit: number;
  grossSales: number;
  closingStock: number;
  extractedLines: ExtractedLine[];
}

interface PLAccountData {
  grossProfit: number;
  netProfit: number;
  netLoss: number;
  extractedLines: ExtractedLine[];
}

// Helper: Look for amount on current line or next few lines
function findAmountWithLookahead(lines: string[], currentIndex: number, maxLookahead: number = 3): { amount: number; sourceLine: string } {
  // First try current line
  const currentLine = lines[currentIndex];
  let amount = extractAmountFromLine(currentLine);
  if (amount > 0) {
    return { amount, sourceLine: currentLine.trim() };
  }

  // Look ahead for amount on subsequent lines
  for (let j = 1; j <= maxLookahead && (currentIndex + j) < lines.length; j++) {
    const nextLine = lines[currentIndex + j];
    // Stop if we hit another section header or "To"/"By" label
    if (/^(to|by)\s+/i.test(nextLine.trim())) break;
    if (/trading|profit.*loss|balance/i.test(nextLine)) break;

    amount = extractAmountFromLine(nextLine);
    if (amount > 0) {
      return { amount, sourceLine: `${currentLine.trim()} -> ${nextLine.trim()}` };
    }
  }

  return { amount: 0, sourceLine: currentLine.trim() };
}

// Parse Trading Account section from Busy PDF
function parseTradingAccount(lines: string[]): TradingAccountData {
  const result: TradingAccountData = {
    openingStock: 0,
    purchases: 0,
    directExpenses: 0,
    grossProfit: 0,
    grossSales: 0,
    closingStock: 0,
    extractedLines: []
  };

  // Find Trading Account section
  const tradingPatterns = [
    /t\s*r\s*a\s*d\s*i\s*n\s*g\s*a\s*c\s*c\s*o\s*u\s*n\s*t/i,
    /trading\s*account/i
  ];

  const { startIndex, endIndex } = findSection(lines, tradingPatterns);

  if (startIndex < 0) {
    console.log('Trading Account section not found');
    return result;
  }

  console.log(`Found Trading Account at line ${startIndex}, parsing until ${endIndex}`);

  // Parse lines within Trading Account section
  for (let i = startIndex; i < endIndex && i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    // DEBIT SIDE (To Opening Stock, To Purchase, etc.)

    // Opening Stock: "To Opening Stock" followed by amount
    if (/to\s*opening\s*stock/i.test(line) || /opening\s*stock/i.test(line)) {
      const { amount, sourceLine } = findAmountWithLookahead(lines, i);
      if (amount > 0 && result.openingStock === 0) {
        result.openingStock = amount;
        result.extractedLines.push({
          label: 'Opening Stock',
          value: amount,
          source: `Trading A/c: ${sourceLine}`
        });
        console.log(`Found Opening Stock: ${amount} from "${sourceLine}"`);
      }
    }

    // Purchases: "To Purchase" or "Purchase" (but not "Purchases of Fixed Assets")
    if ((/to\s*purchase\b/i.test(line) || /^\s*purchase\b/i.test(line)) &&
        !/fixed\s*asset/i.test(line) && !/purchase.*of/i.test(lineLower)) {
      console.log(`[PURCHASE MATCH] Line ${i}: "${line.substring(0, 100)}"`);
      const { amount, sourceLine } = findAmountWithLookahead(lines, i);
      console.log(`[PURCHASE AMOUNT] Extracted amount: ${amount} from "${sourceLine.substring(0, 100)}"`);
      if (amount > 0 && result.purchases === 0) { // Take first match only
        result.purchases = amount;
        result.extractedLines.push({
          label: 'Purchases',
          value: amount,
          source: `Trading A/c: ${sourceLine}`
        });
        console.log(`[PURCHASE SET] Setting purchases = ${amount}`);
      } else {
        console.log(`[PURCHASE SKIP] Skipped - amount=${amount}, result.purchases=${result.purchases}`);
      }
    }

    // Gross Profit: "To Gross Profit"
    if (/to\s*gross\s*profit/i.test(line)) {
      const { amount, sourceLine } = findAmountWithLookahead(lines, i);
      if (amount > 0) {
        result.grossProfit = amount;
        result.extractedLines.push({
          label: 'Gross Profit (Trading)',
          value: amount,
          source: `Trading A/c: ${sourceLine}`
        });
        console.log(`Found Gross Profit (debit): ${amount} from "${sourceLine}"`);
      }
    }

    // CREDIT SIDE (By Sale, By Closing Stock)

    // Sales: "By Sale" or "Sales" - look for amount on same line OR next lines
    if (/by\s*sale\b/i.test(line) || /^\s*sales\s*$/i.test(line)) {
      const { amount, sourceLine } = findAmountWithLookahead(lines, i);
      if (amount > 0 && result.grossSales === 0) {
        result.grossSales = amount;
        result.extractedLines.push({
          label: 'Gross Sales',
          value: amount,
          source: `Trading A/c: ${sourceLine}`
        });
        console.log(`Found Sales: ${amount} from "${sourceLine}"`);
      }
    }

    // Closing Stock: "By Closing Stock" - look for amount on same line OR next lines
    if (/by\s*closing\s*stock/i.test(line) || /closing\s*stock/i.test(line)) {
      console.log(`[CLOSING MATCH] Line ${i}: "${line.substring(0, 100)}"`);
      const { amount, sourceLine } = findAmountWithLookahead(lines, i);
      console.log(`[CLOSING AMOUNT] Extracted amount: ${amount} from "${sourceLine.substring(0, 100)}"`);
      if (amount > 0 && result.closingStock === 0) {
        result.closingStock = amount;
        console.log(`[CLOSING SET] Setting closingStock = ${amount}`);
        result.extractedLines.push({
          label: 'Closing Stock',
          value: amount,
          source: `Trading A/c: ${sourceLine}`
        });
        console.log(`Found Closing Stock: ${amount} from "${sourceLine}"`);
      }
    }
  }

  return result;
}

// Parse Profit & Loss Account section from Busy PDF
function parsePLAccount(lines: string[]): PLAccountData {
  const result: PLAccountData = {
    grossProfit: 0,
    netProfit: 0,
    netLoss: 0,
    extractedLines: []
  };

  // Find P&L section
  const plPatterns = [
    /p\s*r\s*o\s*f\s*i\s*t\s*(&|and)?\s*l\s*o\s*s\s*s/i,
    /profit\s*(&|and)?\s*loss\s*account/i,
    /p\s*&\s*l\s*account/i
  ];

  const { startIndex, endIndex } = findSection(lines, plPatterns);

  if (startIndex < 0) {
    console.log('P&L Account section not found');
    return result;
  }

  console.log(`Found P&L Account at line ${startIndex}, parsing until ${endIndex}`);

  // Parse lines within P&L section
  for (let i = startIndex; i < endIndex && i < lines.length; i++) {
    const line = lines[i];

    // Gross Profit: "By Gross Profit"
    if (/by\s*gross\s*profit/i.test(line)) {
      const { amount, sourceLine } = findAmountWithLookahead(lines, i);
      if (amount > 0 && result.grossProfit === 0) {
        result.grossProfit = amount;
        result.extractedLines.push({
          label: 'Gross Profit (P&L)',
          value: amount,
          source: `P&L A/c: ${sourceLine}`
        });
        console.log(`Found Gross Profit (P&L): ${amount} from "${sourceLine}"`);
      }
    }

    // Net Loss: "By Nett Loss" or "By Net Loss"
    if (/by\s*nett?\s*loss/i.test(line) || /nett?\s*loss/i.test(line)) {
      const { amount, sourceLine } = findAmountWithLookahead(lines, i);
      if (amount > 0 && result.netLoss === 0) {
        result.netLoss = amount;
        result.extractedLines.push({
          label: 'Net Loss',
          value: amount,
          source: `P&L A/c: ${sourceLine}`
        });
        console.log(`Found Net Loss: ${amount} from "${sourceLine}"`);
      }
    }

    // Net Profit: "By Nett Profit" or "By Net Profit"
    if (/by\s*nett?\s*profit/i.test(line) || /nett?\s*profit\b/i.test(line)) {
      const { amount, sourceLine } = findAmountWithLookahead(lines, i);
      if (amount > 0 && !/gross/i.test(line) && result.netProfit === 0) { // Exclude "Gross Profit"
        result.netProfit = amount;
        result.extractedLines.push({
          label: 'Net Profit',
          value: amount,
          source: `P&L A/c: ${sourceLine}`
        });
        console.log(`Found Net Profit: ${amount} from "${sourceLine}"`);
      }
    }
  }

  return result;
}

// Fallback: Search entire document for values if section parsing fails
function fallbackSearch(lines: string[], extractedLines: ExtractedLine[]): {
  openingStock: number;
  closingStock: number;
  purchases: number;
  grossSales: number;
  grossProfit: number;
  netProfit: number;
  netLoss: number;
} {
  const result = {
    openingStock: 0,
    closingStock: 0,
    purchases: 0,
    grossSales: 0,
    grossProfit: 0,
    netProfit: 0,
    netLoss: 0
  };

  for (const line of lines) {
    const amount = extractAmountFromLine(line);
    if (amount <= 0) continue;

    // Opening Stock
    if (result.openingStock === 0 && /opening\s*stock/i.test(line)) {
      result.openingStock = amount;
      extractedLines.push({ label: 'Opening Stock (fallback)', value: amount, source: line.trim() });
    }

    // Closing Stock - prefer "By Closing Stock" over "Stock-in-hand"
    if (result.closingStock === 0 && /closing\s*stock/i.test(line)) {
      result.closingStock = amount;
      extractedLines.push({ label: 'Closing Stock (fallback)', value: amount, source: line.trim() });
    }

    // Purchases
    if (result.purchases === 0 && /\bpurchase\b/i.test(line) && !/fixed/i.test(line)) {
      result.purchases = amount;
      extractedLines.push({ label: 'Purchases (fallback)', value: amount, source: line.trim() });
    }

    // Sales
    if (result.grossSales === 0 && /\bsale\b/i.test(line) && !/discount/i.test(line)) {
      result.grossSales = amount;
      extractedLines.push({ label: 'Sales (fallback)', value: amount, source: line.trim() });
    }

    // Gross Profit
    if (result.grossProfit === 0 && /gross\s*profit/i.test(line)) {
      result.grossProfit = amount;
      extractedLines.push({ label: 'Gross Profit (fallback)', value: amount, source: line.trim() });
    }

    // Net Loss
    if (result.netLoss === 0 && /nett?\s*loss/i.test(line)) {
      result.netLoss = amount;
      extractedLines.push({ label: 'Net Loss (fallback)', value: amount, source: line.trim() });
    }

    // Net Profit
    if (result.netProfit === 0 && /nett?\s*profit/i.test(line) && !/gross/i.test(line)) {
      result.netProfit = amount;
      extractedLines.push({ label: 'Net Profit (fallback)', value: amount, source: line.trim() });
    }
  }

  return result;
}

export async function parseBalanceSheetPDF(file: File): Promise<BalanceSheetPDFResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const pdf = await pdfjsLib.getDocument({ data }).promise;

        let fullText = '';
        const allLines: string[] = [];
        const errors: string[] = [];

        console.log(`Parsing PDF with ${pdf.numPages} pages`);

        // Extract text from all pages with better formatting
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          // Group text items by their y-position to preserve line structure
          const items = textContent.items as { str: string; transform: number[] }[];
          const lineMap = new Map<number, { x: number; text: string }[]>();

          for (const item of items) {
            if ('str' in item && item.str.trim()) {
              // Round y-position to group items on same line (within 3px)
              const y = Math.round(item.transform[5] / 3) * 3;
              const x = item.transform[4];
              if (!lineMap.has(y)) {
                lineMap.set(y, []);
              }
              lineMap.get(y)!.push({ x, text: item.str });
            }
          }

          // Sort by y-position (descending for top-to-bottom)
          // Within each line, sort by x-position (left to right)
          const sortedLines = Array.from(lineMap.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([, items]) => {
              return items.sort((a, b) => a.x - b.x).map(i => i.text).join(' ');
            });

          allLines.push(...sortedLines);
          fullText += sortedLines.join('\n') + '\n';
        }

        console.log(`Extracted ${allLines.length} lines from PDF`);

        // Parse Trading Account section (for Opening Stock, Purchases, Closing Stock, Sales)
        const tradingData = parseTradingAccount(allLines);

        // Parse P&L Account section (for Gross Profit, Net Profit/Loss)
        const plData = parsePLAccount(allLines);

        // Combine extracted lines
        const extractedLines: ExtractedLine[] = [
          ...tradingData.extractedLines,
          ...plData.extractedLines
        ];

        // Use Trading Account data, fallback to P&L for gross profit
        let openingStock = tradingData.openingStock;
        let closingStock = tradingData.closingStock;
        let purchases = tradingData.purchases;
        let grossSales = tradingData.grossSales;
        let grossProfit = tradingData.grossProfit || plData.grossProfit;
        let netProfit = plData.netProfit;
        let netLoss = plData.netLoss;

        // If Trading Account parsing failed, use fallback search
        if (openingStock === 0 && closingStock === 0 && purchases === 0) {
          console.log('Trading Account parsing incomplete, using fallback search');
          const fallback = fallbackSearch(allLines, extractedLines);
          openingStock = openingStock || fallback.openingStock;
          closingStock = closingStock || fallback.closingStock;
          purchases = purchases || fallback.purchases;
          grossSales = grossSales || fallback.grossSales;
          grossProfit = grossProfit || fallback.grossProfit;
          netProfit = netProfit || fallback.netProfit;
          netLoss = netLoss || fallback.netLoss;
        }

        // Calculate net sales (for Busy, it's same as gross sales since GST is separate)
        const netSales = grossSales;

        // Log final results
        console.log('=== PDF Parsing Results ===');
        console.log('Opening Stock:', openingStock);
        console.log('Purchases:', purchases);
        console.log('Closing Stock:', closingStock);
        console.log('Gross Sales:', grossSales);
        console.log('Gross Profit:', grossProfit);
        console.log('Net Profit:', netProfit);
        console.log('Net Loss:', netLoss);
        console.log('===========================');

        resolve({
          openingStock,
          closingStock,
          grossSales,
          netSales,
          revenueDiscounts: 0,
          gstOnSales: 0,
          netProfit,
          netLoss,
          purchases,
          grossProfit,
          rawText: fullText,
          errors,
          extractedLines
        });
      } catch (error) {
        console.error('PDF parsing error:', error);
        reject(new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read PDF file'));
    reader.readAsArrayBuffer(file);
  });
}
