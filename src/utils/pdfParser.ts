import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export interface BalanceSheetPDFResult {
  openingStock: number;
  closingStock: number;
  sales: number;
  netProfit: number;
  rawText: string;
  errors: string[];
}

// Parse number from text with various formats
function extractNumber(text: string): number {
  // Match patterns like "1,23,456.78" or "123456.78" or "1,234,567"
  const matches = text.match(/[\d,]+\.?\d*/g);
  if (!matches) return 0;

  // Find the largest number (usually the relevant one)
  let maxNum = 0;
  for (const match of matches) {
    const cleaned = match.replace(/,/g, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }
  return maxNum;
}

// Search for a pattern and extract the number following it
function findValueAfterPattern(text: string, patterns: string[]): number {
  for (const pattern of patterns) {
    const regex = new RegExp(pattern + '[\\s:]*([\\d,]+\\.?\\d*)', 'i');
    const match = text.match(regex);
    if (match && match[1]) {
      return extractNumber(match[1]);
    }
  }
  return 0;
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

        // Extract text from all pages
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ');
          fullText += pageText + '\n';
        }

        // Search for key values
        const openingStock = findValueAfterPattern(fullText, [
          'opening stock',
          'opening inventory',
          'stock at beginning',
          'beginning inventory'
        ]);

        const closingStock = findValueAfterPattern(fullText, [
          'closing stock',
          'closing inventory',
          'stock at end',
          'ending inventory'
        ]);

        const sales = findValueAfterPattern(fullText, [
          'total sales',
          'gross sales',
          'revenue from operations',
          'sales revenue'
        ]);

        const netProfit = findValueAfterPattern(fullText, [
          'net profit',
          'profit for the year',
          'profit after tax',
          'net income'
        ]);

        resolve({
          openingStock,
          closingStock,
          sales,
          netProfit,
          rawText: fullText,
          errors
        });
      } catch (error) {
        reject(new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read PDF file'));
    reader.readAsArrayBuffer(file);
  });
}
