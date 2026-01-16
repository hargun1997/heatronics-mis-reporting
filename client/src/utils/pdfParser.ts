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
  netProfit: number;
  purchases: number;
  rawText: string;
  errors: string[];
  extractedLines: ExtractedLine[];  // For debugging/display
}

export interface ExtractedLine {
  label: string;
  value: number;
  source: string;
}

// Parse Indian number format (1,23,456.78)
function parseIndianNumber(text: string): number {
  if (!text) return 0;
  // Remove all spaces and commas, handle Indian format
  const cleaned = text.replace(/[\s,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Extract number that appears after a label on the same line or nearby
function findValueNearPattern(lines: string[], patterns: string[]): { value: number; source: string } {
  for (const pattern of patterns) {
    const regex = new RegExp(pattern, 'i');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (regex.test(line)) {
        // Try to find number in the same line
        const numbers = line.match(/[\d,]+\.?\d*/g);
        if (numbers && numbers.length > 0) {
          // Get the last number on the line (usually the amount)
          for (let j = numbers.length - 1; j >= 0; j--) {
            const val = parseIndianNumber(numbers[j]);
            if (val > 0) {
              return { value: val, source: line.trim() };
            }
          }
        }
        // Check next line if no number found
        if (i + 1 < lines.length) {
          const nextLineNumbers = lines[i + 1].match(/[\d,]+\.?\d*/g);
          if (nextLineNumbers) {
            const val = parseIndianNumber(nextLineNumbers[0]);
            if (val > 0) {
              return { value: val, source: `${line.trim()} -> ${lines[i + 1].trim()}` };
            }
          }
        }
      }
    }
  }
  return { value: 0, source: '' };
}

// More aggressive search for specific P&L items
function searchPLItems(text: string): {
  grossSales: number;
  netSales: number;
  revenueDiscounts: number;
  gstOnSales: number;
  openingStock: number;
  closingStock: number;
  purchases: number;
  netProfit: number;
  extractedLines: ExtractedLine[];
} {
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
  const extractedLines: ExtractedLine[] = [];

  // Search patterns for each field
  const grossSalesResult = findValueNearPattern(lines, [
    'gross sales',
    'total sales',
    'sales \\(gross\\)',
    'revenue from operations',
    'sale of products'
  ]);

  const netSalesResult = findValueNearPattern(lines, [
    'net sales',
    'sales \\(net\\)',
    'net revenue',
    'revenue \\(net\\)',
    'total revenue \\(net\\)'
  ]);

  const revenueDiscountsResult = findValueNearPattern(lines, [
    'revenue discount',
    'sales discount',
    'discount on sales',
    'trade discount',
    'cash discount'
  ]);

  const gstOnSalesResult = findValueNearPattern(lines, [
    'gst on sales',
    'gst collected',
    'output gst',
    'cgst.*sgst.*igst',
    'gst payable'
  ]);

  const openingStockResult = findValueNearPattern(lines, [
    'opening stock',
    'stock at beginning',
    'beginning inventory',
    'opening inventory',
    'stock \\(opening\\)'
  ]);

  const closingStockResult = findValueNearPattern(lines, [
    'closing stock',
    'stock at end',
    'ending inventory',
    'closing inventory',
    'stock \\(closing\\)'
  ]);

  const purchasesResult = findValueNearPattern(lines, [
    'total purchases',
    'purchases',
    'cost of materials',
    'raw material consumed',
    'material purchased'
  ]);

  const netProfitResult = findValueNearPattern(lines, [
    'net profit',
    'profit for the year',
    'profit after tax',
    'net income',
    'profit \\(loss\\) for the period'
  ]);

  // Store extracted lines for debugging
  if (grossSalesResult.value > 0) {
    extractedLines.push({ label: 'Gross Sales', value: grossSalesResult.value, source: grossSalesResult.source });
  }
  if (netSalesResult.value > 0) {
    extractedLines.push({ label: 'Net Sales', value: netSalesResult.value, source: netSalesResult.source });
  }
  if (revenueDiscountsResult.value > 0) {
    extractedLines.push({ label: 'Revenue Discounts', value: revenueDiscountsResult.value, source: revenueDiscountsResult.source });
  }
  if (gstOnSalesResult.value > 0) {
    extractedLines.push({ label: 'GST on Sales', value: gstOnSalesResult.value, source: gstOnSalesResult.source });
  }
  if (openingStockResult.value > 0) {
    extractedLines.push({ label: 'Opening Stock', value: openingStockResult.value, source: openingStockResult.source });
  }
  if (closingStockResult.value > 0) {
    extractedLines.push({ label: 'Closing Stock', value: closingStockResult.value, source: closingStockResult.source });
  }
  if (purchasesResult.value > 0) {
    extractedLines.push({ label: 'Purchases', value: purchasesResult.value, source: purchasesResult.source });
  }
  if (netProfitResult.value > 0) {
    extractedLines.push({ label: 'Net Profit', value: netProfitResult.value, source: netProfitResult.source });
  }

  return {
    grossSales: grossSalesResult.value,
    netSales: netSalesResult.value,
    revenueDiscounts: revenueDiscountsResult.value,
    gstOnSales: gstOnSalesResult.value,
    openingStock: openingStockResult.value,
    closingStock: closingStockResult.value,
    purchases: purchasesResult.value,
    netProfit: netProfitResult.value,
    extractedLines
  };
}

export async function parseBalanceSheetPDF(file: File): Promise<BalanceSheetPDFResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const pdf = await pdfjsLib.getDocument({ data }).promise;

        let fullText = '';
        const errors: string[] = [];

        // Extract text from all pages with better formatting
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          // Group text items by their y-position to preserve line structure
          const items = textContent.items as { str: string; transform: number[] }[];
          const lineMap = new Map<number, string[]>();

          for (const item of items) {
            if ('str' in item && item.str.trim()) {
              // Round y-position to group items on same line
              const y = Math.round(item.transform[5]);
              if (!lineMap.has(y)) {
                lineMap.set(y, []);
              }
              lineMap.get(y)!.push(item.str);
            }
          }

          // Sort by y-position (descending for top-to-bottom)
          const sortedLines = Array.from(lineMap.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([, texts]) => texts.join(' '));

          fullText += sortedLines.join('\n') + '\n';
        }

        // Search for P&L items
        const plItems = searchPLItems(fullText);

        // If netSales is 0 but grossSales exists, calculate it
        let netSales = plItems.netSales;
        if (netSales === 0 && plItems.grossSales > 0) {
          netSales = plItems.grossSales - plItems.revenueDiscounts - plItems.gstOnSales;
          if (netSales < 0) netSales = plItems.grossSales; // Fallback
        }

        resolve({
          openingStock: plItems.openingStock,
          closingStock: plItems.closingStock,
          grossSales: plItems.grossSales,
          netSales: netSales,
          revenueDiscounts: plItems.revenueDiscounts,
          gstOnSales: plItems.gstOnSales,
          netProfit: plItems.netProfit,
          purchases: plItems.purchases,
          rawText: fullText,
          errors,
          extractedLines: plItems.extractedLines
        });
      } catch (error) {
        reject(new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read PDF file'));
    reader.readAsArrayBuffer(file);
  });
}
