# MIS Classification Tool

A React + TypeScript web application for classifying accounting journal entries into MIS (Management Information System) categories for P&L reporting.

## Features

- **File Upload**: Upload Balance Sheet (PDF/Excel), Journal Vouchers (Excel), and Purchase Ledger (Excel)
- **COGS Calculation**: Automatically calculates Cost of Goods Sold from uploaded files
- **Smart Auto-Classification**: Regex-based pattern matching suggests classifications for common account names
- **Interactive Classification**: Classify each transaction into configurable Heads and Subheads
- **Bulk Operations**: Select multiple transactions and apply classifications in bulk
- **Real-time P&L Preview**: See running totals and P&L summary as you classify
- **Export Options**: Export to Excel or download as image
- **Progress Tracking**: Visual progress bar shows classification completion
- **Auto-save**: Classifications saved to localStorage

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Usage

1. **Upload Files**:
   - Balance Sheet (PDF or Excel) - for Opening/Closing Stock
   - Journal Vouchers (Excel) - main transaction list to classify
   - Purchase Ledger (Excel) - for purchase totals

2. **Review COGS**: The app automatically calculates COGS = Opening Stock + Purchases - Closing Stock

3. **Classify Transactions**:
   - Yellow rows have auto-suggested classifications
   - Click the dropdown to select or change classification
   - Use search/filter to find specific transactions
   - Select multiple rows for bulk classification

4. **Export Report**:
   - Click "View MIS Report" to preview the P&L
   - Use Export button to download Excel or Image

## Keyboard Shortcuts

- `Ctrl+S`: Save progress to localStorage
- `Ctrl+Z`: Undo last action
- `Esc`: Clear selection
- `Tab`: Navigate through fields
- `Enter`: Confirm selection in dropdowns

## Head Structure

The app comes pre-configured with these P&L categories:

- **A. Revenue**: Website/D2C, Amazon, Blinkit, Offline/OEM
- **B. Returns**: Channel-specific returns
- **C. Discounts**: Channel & promotional discounts
- **D. Taxes (GST)**: CGST, SGST, IGST
- **E. COGM**: Raw Materials, Wages, Job Work, Transport, Rent, Utilities
- **F. Channel & Fulfillment**: Amazon/Blinkit/D2C fees
- **G. Sales & Marketing**: Ads (Facebook, Google, Amazon), Agency fees
- **H. Platform Costs**: SaaS subscriptions
- **I. Operating Expenses**: Salaries, Admin, Legal
- **J. Non-Operating**: Interest, Depreciation
- **X. Exclude (Personal)**: Personal expenses to exclude
- **Z. Ignore (Non-P&L)**: GST entries, TDS, Bank transfers

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- xlsx (Excel parsing)
- pdfjs-dist (PDF parsing)
- html2canvas (Image export)
- file-saver (File downloads)

## File Structure

```
src/
├── components/
│   ├── FileUpload.tsx       # File upload dropzones
│   ├── COGSDisplay.tsx      # COGS calculator display
│   ├── SearchBar.tsx        # Search and filter controls
│   ├── TransactionTable.tsx # Main transaction grid
│   ├── HeadsPanel.tsx       # Heads tree sidebar
│   ├── MISPreview.tsx       # P&L report preview
│   ├── ExportButton.tsx     # Export dropdown
│   └── BulkActions.tsx      # Bulk classification bar
├── hooks/
│   ├── useFileParser.ts     # File parsing logic
│   └── useClassifications.ts # Classification state management
├── utils/
│   ├── excelParser.ts       # Excel file parsing
│   ├── pdfParser.ts         # PDF file parsing
│   ├── cogsCalculator.ts    # COGS calculation
│   ├── misGenerator.ts      # MIS report generation
│   └── exportUtils.ts       # Export utilities
├── data/
│   ├── defaultHeads.ts      # Default head configuration
│   └── accountPatterns.ts   # Auto-classification patterns
├── types/
│   └── index.ts             # TypeScript interfaces
└── App.tsx                  # Main application
```
