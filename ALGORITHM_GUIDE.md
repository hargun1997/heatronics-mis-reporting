# MIS Calculation Algorithm Guide

This document provides a comprehensive explanation of how the MIS (Management Information System) calculation engine works, from file parsing to final P&L generation.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Flow Architecture](#2-data-flow-architecture)
3. [File Parsing](#3-file-parsing)
4. [Transaction Classification](#4-transaction-classification)
5. [MIS Calculation Engine](#5-mis-calculation-engine)
6. [Multi-Month Aggregation](#6-multi-month-aggregation)
7. [Balance Sheet Reconciliation](#7-balance-sheet-reconciliation)
8. [Data Storage](#8-data-storage)

---

## 1. Overview

The MIS system generates Profit & Loss statements by:
1. Parsing input files (Sales Register, Journal, Purchase Register, Balance Sheet)
2. Auto-classifying journal transactions into MIS expense categories
3. Aggregating revenue from sales data by channel
4. Calculating margins (Gross, CM1, CM2, CM3, EBITDA, EBT, Net Income)
5. Reconciling MIS values against Balance Sheet data

### Key Data Structures

```typescript
// Core MIS Record structure
interface MISRecord {
  period: { month: number; year: number };
  periodKey: string;  // "YYYY-MM" format
  states: IndianState[];  // States included in this MIS

  // Revenue Section
  revenue: RevenueData;

  // Cost & Expenses
  cogm: COGMData;
  channelFulfillment: ChannelFulfillmentData;
  salesMarketing: SalesMarketingData;
  platformCosts: PlatformCostsData;
  operatingExpenses: OperatingExpensesData;
  nonOperating: NonOperatingData;

  // Calculated Margins
  grossMargin: number;
  cm1: number;  // Contribution Margin 1
  cm2: number;  // Contribution Margin 2
  cm3: number;  // Contribution Margin 3
  ebitda: number;
  ebt: number;  // Earnings Before Tax
  netIncome: number;

  // Balance Sheet (for reconciliation)
  balanceSheet?: AggregatedBalanceSheetData;

  // Classification data
  classifiedTransactions: ClassifiedTransaction[];
  unclassifiedCount: number;
}
```

---

## 2. Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INPUT FILES                                      │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────────┤
│ Sales Register  │ Journal Vouchers│ Purchase Register│ Balance Sheet          │
│ (Excel)         │ (Excel)         │ (Excel)          │ (PDF/Excel)            │
└────────┬────────┴────────┬────────┴────────┬─────────┴───────────┬───────────┘
         │                 │                  │                     │
         ▼                 ▼                  ▼                     ▼
┌────────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────────────┐
│parseSalesReg() │ │parseJournal() │ │parsePurchase()│ │parseBalanceSheet()  │
│                │ │               │ │               │ │ (PDF or Excel)      │
└────────┬───────┘ └───────┬───────┘ └───────┬───────┘ └──────────┬──────────┘
         │                 │                  │                    │
         ▼                 ▼                  │                    │
┌────────────────┐ ┌───────────────┐         │                    │
│StateSalesData  │ │Transaction[]  │         │                    │
│- salesByChannel│ │               │         │                    │
│- returnsByChnnl│ └───────┬───────┘         │                    │
│- taxesByChannel│         │                  │                    │
└────────┬───────┘         ▼                  │                    │
         │         ┌───────────────┐          │                    │
         │         │classifyTrans()│          │                    │
         │         │(Pattern Match)│          │                    │
         │         └───────┬───────┘          │                    │
         │                 │                  │                    │
         │                 ▼                  │                    │
         │         ┌───────────────┐          │                    │
         │         │aggregateByHead│          │                    │
         │         │extractMISAmts │          │                    │
         │         └───────┬───────┘          │                    │
         │                 │                  │                    │
         ▼                 ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           calculateMIS()                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 1. Aggregate Revenue from Sales Data                                 │    │
│  │ 2. Classify Journal Transactions → Expense Categories                │    │
│  │ 3. Extract Amounts by MIS Head/Subhead                               │    │
│  │ 4. Populate COGM, Channel, Marketing, Platform, Operating, Non-Op    │    │
│  │ 5. Calculate Margins (see Section 5)                                 │    │
│  │ 6. Aggregate Balance Sheet Data for Reconciliation                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MISRecord                                       │
│  - Complete P&L with all margins                                            │
│  - Balance Sheet data for reconciliation                                    │
│  - Classified transactions for audit trail                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. File Parsing

### 3.1 Sales Register Parser

**File:** `client/src/utils/misTrackingParser.ts` → `parseSalesRegister()`

**Purpose:** Extract gross sales, returns, taxes by channel from Tally Sales Register export.

**Input:** Excel file with columns:
- Date, Vch/Bill No, Account (party name), Total Amount, Sale Amount, IGST, CGST, SGST

**Algorithm:**

```
1. READ Excel file into array of rows
2. FIND header row (search for "Account" or "Party" column)
3. FOR each data row:
   a. GET account/party name
   b. SKIP if cancelled or total row
   c. GET amount from "Total Amount" column
   d. GET tax amounts (IGST + CGST + SGST)

   e. DETECT channel from party name:
      - "blinkit" or "grofers" → Blinkit
      - "amazon" → Amazon
      - "shiprocket" → Website (D2C)
      - else → Offline & OEM

   f. DETECT if stock transfer (contains "heatronics"):
      - Extract destination state from name

   g. CATEGORIZE transaction:
      - IF stock transfer → Add to stockTransfers
      - ELIF negative amount → Add to returns[channel]
      - ELSE → Add to sales[channel], taxes[channel]

4. RETURN StateSalesData with:
   - grossSales, returns, stockTransfers
   - salesByChannel, returnsByChannel, taxesByChannel
   - lineItems for audit
```

**Channel Detection Logic:**

| Pattern in Party Name | Channel |
|----------------------|---------|
| `blinkit`, `grofers`, `blink commerce` | Blinkit |
| `amazon` | Amazon |
| `shiprocket`, `ship rocket` | Website (D2C) |
| (default) | Offline & OEM |

**Stock Transfer Detection:**
- Any party name containing "heatronics" is treated as inter-state stock transfer
- These are excluded from revenue calculations

---

### 3.2 Journal Parser

**File:** `client/src/utils/misTrackingParser.ts` → `parseJournal()`

**Purpose:** Extract expense transactions from Tally Journal export.

**Input:** Excel file with columns:
- Date, Vch/Bill No, GST Nature, Account, Debit, Credit, Notes

**Algorithm:**

```
1. READ Excel file into array of rows
2. SKIP first 3 rows (headers)
3. FOR each data row:
   a. HANDLE multi-line entries (rows with null Date = continuation)
   b. GET account name, debit, credit amounts
   c. SKIP if both debit and credit are 0
   d. CREATE Transaction object:
      {
        id: generateId(),
        date, vchBillNo, gstNature,
        account, debit, credit, notes,
        status: 'unclassified',
        state
      }

4. RETURN Transaction[] array
```

---

### 3.3 Purchase Register Parser

**File:** `client/src/utils/misTrackingParser.ts` → `parsePurchaseRegister()`

**Purpose:** Extract total purchases (currently used for reference only, not directly in MIS).

**Algorithm:**

```
1. READ Excel file
2. SEARCH for "Total" or "Grand Total" row
3. EXTRACT purchase total from amount column
4. RETURN { totalPurchases, itemCount }
```

---

### 3.4 Balance Sheet Parser

**File:** `client/src/utils/misTrackingParser.ts` → `parseBalanceSheet()`
**File:** `client/src/utils/pdfParser.ts` → `parseBalanceSheetPDF()`

**Purpose:** Extract key P&L figures for reconciliation.

**Supports:** PDF and Excel formats

**Extracted Fields:**
- Opening Stock
- Closing Stock
- Purchases
- Gross Sales / Net Sales
- Gross Profit
- Net Profit / Net Loss

**PDF Parsing Algorithm:**

```
1. LOAD PDF using pdfjs-dist
2. FOR each page:
   a. EXTRACT text content
   b. GROUP text items by Y-position to preserve line structure
   c. SORT lines top-to-bottom

3. SEARCH for patterns in extracted text:
   - "opening stock", "stock at beginning" → openingStock
   - "closing stock", "stock at end" → closingStock
   - "purchases", "cost of materials" → purchases
   - "gross sales", "total sales" → grossSales
   - "net sales", "revenue (net)" → netSales
   - "gross profit" → grossProfit
   - "net profit", "profit for the year" → netProfit
   - "net loss", "nett loss", "loss to be adjusted" → netLoss

4. FOR each pattern match:
   - FIND numeric value on same line or next line
   - PARSE Indian number format (1,23,456.78)

5. CALCULATE netProfitLoss:
   - IF netProfit > 0 → positive value
   - ELIF netLoss > 0 → negative value

6. RETURN StateBalanceSheetData
```

---

## 4. Transaction Classification

**File:** `client/src/utils/misClassifier.ts`

**Purpose:** Auto-classify journal transactions into MIS expense categories using pattern matching.

### 4.1 MIS Head Structure

```
A. Revenue         → Website, Amazon, Blinkit, Offline & OEM
B. Returns         → Website, Amazon, Blinkit, Offline & OEM
C. Discounts       → Website, Amazon, Blinkit, Offline & OEM
D. Taxes           → Website, Amazon, Blinkit, Offline & OEM
E. COGM            → Raw Materials, Mfg Wages, Contract Wages, Transport,
                     Factory Rent, Factory Electricity, Maintenance, Job Work
F. Channel & Fulfillment → Amazon Fees, Blinkit Fees, D2C Fees
G. Sales & Marketing     → Facebook Ads, Google Ads, Amazon Ads,
                           Blinkit Ads, Agency Fees
H. Platform Costs        → Shopify, Wati, Shopflo subscriptions
I. Operating Expenses    → Salaries, Miscellaneous, Legal/CA, CRM, Admin
J. Non-Operating         → Interest, Depreciation, Amortization, Tax
X. Exclude               → Personal Expenses
Z. Ignore                → GST, TDS, Bank Transfers, Inter-company
```

### 4.2 Classification Algorithm

```
1. LOAD learned patterns (user patterns + system patterns)
2. FOR each transaction:
   a. GET account name

   b. TRY user patterns first (high priority):
      FOR each user pattern:
        IF regex.test(accountName):
          RETURN { head, subhead, confidence: 'high' }

   c. TRY system patterns:
      FOR each system pattern:
        IF regex.test(accountName):
          RETURN { head, subhead, confidence: 'medium' }

   d. IF no match → mark as unclassified

3. RETURN { classified[], unclassified[], stats }
```

### 4.3 Example System Patterns

| Pattern | Head | Subhead |
|---------|------|---------|
| `AMAZON.*LOGISTICS` | F. Channel & Fulfillment | Amazon Fees |
| `SHIPROCKET` | F. Channel & Fulfillment | D2C Fees |
| `FACEBOOK\|META PLATFORMS` | G. Sales & Marketing | Facebook Ads |
| `SHOPIFY` | H. Platform Costs | Shopify Subscription |
| `SALARY\|ESI.*EMPLOYER` | I. Operating Expenses | Salaries (Admin, Mgmt) |
| `DEPRECIATION` | J. Non-Operating | Less: Depreciation |
| `GST.*INPUT\|GST.*OUTPUT` | Z. Ignore | GST Input/Output |

---

## 5. MIS Calculation Engine

**File:** `client/src/utils/misCalculator.ts` → `calculateMIS()`

### 5.1 Revenue Calculation

```
INPUT: StateSalesData from all selected states

STEP 1: Aggregate by channel (Website, Amazon, Blinkit, Offline & OEM)
  FOR each state:
    grossRevenue[channel] += state.salesByChannel[channel]
    returns[channel] += state.returnsByChannel[channel]
    taxes[channel] += state.taxesByChannel[channel]

STEP 2: Calculate totals
  totalGrossRevenue = SUM(grossRevenue[all channels])
  totalReturns = SUM(returns[all channels])
  totalTaxes = SUM(taxes[all channels])
  totalStockTransfers = SUM(stockTransfers)
  totalDiscounts = 0  // Currently not tracked

STEP 3: Calculate net revenue
  totalRevenue = totalGrossRevenue - totalReturns - totalDiscounts
  netRevenue = totalRevenue - totalTaxes
```

**Formula:**
```
Net Revenue = Gross Revenue - Returns - Discounts - Taxes
            = (Total Sales with GST) - (Returns) - (GST Component)
```

### 5.2 Expense Aggregation

```
INPUT: ClassifiedTransaction[] from journal

STEP 1: Group by head and subhead
  FOR each transaction:
    head = transaction.misHead
    subhead = transaction.misSubhead
    amount = transaction.debit OR transaction.credit

    aggregation[head].subheadTotals[subhead] += amount
    aggregation[head].total += amount

STEP 2: Extract specific amounts for MIS structure
  cogm.rawMaterialsInventory = getSubheadTotal('E. COGM', 'Raw Materials & Inventory')
  cogm.manufacturingWages = getSubheadTotal('E. COGM', 'Manufacturing Wages')
  ... (repeat for all subheads)
```

### 5.3 Margin Calculations

**The P&L Waterfall:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  A. Gross Revenue (with GST)                                        │
│  - B. Returns                                                       │
│  - C. Discounts                                                     │
│  = Total Revenue                                                    │
│  - D. Taxes (GST)                                                   │
│  ═══════════════════════════════════════════════════════════════════│
│  = NET REVENUE                                                      │
│  - E. COGM (Cost of Goods Manufactured)                             │
│  ═══════════════════════════════════════════════════════════════════│
│  = GROSS MARGIN                                                     │
│  - F. Channel & Fulfillment Costs                                   │
│  ═══════════════════════════════════════════════════════════════════│
│  = CM1 (Contribution Margin 1)                                      │
│  - G. Sales & Marketing                                             │
│  ═══════════════════════════════════════════════════════════════════│
│  = CM2 (Contribution Margin 2)                                      │
│  - H. Platform Costs                                                │
│  ═══════════════════════════════════════════════════════════════════│
│  = CM3 (Contribution Margin 3)                                      │
│  - I. Operating Expenses                                            │
│  ═══════════════════════════════════════════════════════════════════│
│  = EBITDA                                                           │
│  - J. Interest, Depreciation, Amortization                          │
│  ═══════════════════════════════════════════════════════════════════│
│  = EBT (Earnings Before Tax)                                        │
│  - J. Income Tax                                                    │
│  ═══════════════════════════════════════════════════════════════════│
│  = NET INCOME                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**JavaScript Implementation:**

```typescript
// Net Revenue (base for all calculations)
const netRevenue = record.revenue.netRevenue;

// STEP 1: Gross Margin
record.grossMargin = netRevenue - record.cogm.totalCOGM;
record.grossMarginPercent = (record.grossMargin / netRevenue) * 100;

// STEP 2: CM1 = Gross Margin - Channel & Fulfillment
record.cm1 = record.grossMargin - record.channelFulfillment.total;
record.cm1Percent = (record.cm1 / netRevenue) * 100;

// STEP 3: CM2 = CM1 - Sales & Marketing
record.cm2 = record.cm1 - record.salesMarketing.total;
record.cm2Percent = (record.cm2 / netRevenue) * 100;

// STEP 4: CM3 = CM2 - Platform Costs
record.cm3 = record.cm2 - record.platformCosts.total;
record.cm3Percent = (record.cm3 / netRevenue) * 100;

// STEP 5: EBITDA = CM3 - Operating Expenses
record.ebitda = record.cm3 - record.operatingExpenses.total;
record.ebitdaPercent = (record.ebitda / netRevenue) * 100;

// STEP 6: EBT = EBITDA - (Interest + Depreciation + Amortization)
record.ebt = record.ebitda - record.nonOperating.totalIDA;
record.ebtPercent = (record.ebt / netRevenue) * 100;

// STEP 7: Net Income = EBT - Income Tax
record.netIncome = record.ebt - record.nonOperating.incomeTax;
record.netIncomePercent = (record.netIncome / netRevenue) * 100;
```

### 5.4 Balance Sheet Data Aggregation

```
FOR each selected state:
  IF state has balanceSheetData:
    aggregated.openingStock += state.balanceSheetData.openingStock
    aggregated.closingStock += state.balanceSheetData.closingStock
    aggregated.purchases += state.balanceSheetData.purchases
    aggregated.grossSales += state.balanceSheetData.grossSales
    aggregated.netSales += state.balanceSheetData.netSales
    aggregated.grossProfit += state.balanceSheetData.grossProfit
    aggregated.netProfitLoss += state.balanceSheetData.netProfitLoss

// Calculate COGS from Balance Sheet formula
aggregated.calculatedCOGS = openingStock + purchases - closingStock
```

---

## 6. Multi-Month Aggregation

**File:** `client/src/components/mis-tracking/MISMonthlyView.tsx` → `aggregateMISRecords()`

**Purpose:** Combine multiple monthly MIS records into an aggregate view.

### 6.1 Algorithm

```
INPUT: MISRecord[] (array of monthly records)

IF records.length == 0: RETURN null
IF records.length == 1: RETURN records[0]

STEP 1: Sort records by period (chronologically)
  sorted = records.sort((a, b) => a.periodKey.localeCompare(b.periodKey))

STEP 2: Initialize aggregated record
  aggregated = createEmptyMISRecord(first.period)
  aggregated.periodKey = `${first.periodKey}_to_${last.periodKey}`

STEP 3: Sum all numeric fields
  FOR each record in sorted:
    // Revenue
    FOR each channel:
      aggregated.revenue.grossRevenue[channel] += record.grossRevenue[channel]
      aggregated.revenue.returns[channel] += record.returns[channel]
      aggregated.revenue.taxes[channel] += record.taxes[channel]

    // COGM
    aggregated.cogm.rawMaterialsInventory += record.cogm.rawMaterialsInventory
    ... (all COGM fields)

    // Expenses
    aggregated.channelFulfillment.total += record.channelFulfillment.total
    aggregated.salesMarketing.total += record.salesMarketing.total
    ... (all expense categories)

    // Margins (sum absolute values)
    aggregated.grossMargin += record.grossMargin
    aggregated.cm1 += record.cm1
    aggregated.cm2 += record.cm2
    aggregated.cm3 += record.cm3
    aggregated.ebitda += record.ebitda
    aggregated.ebt += record.ebt
    aggregated.netIncome += record.netIncome

STEP 4: Recalculate percentages (based on total net revenue)
  netRevenue = aggregated.revenue.netRevenue
  aggregated.grossMarginPercent = (aggregated.grossMargin / netRevenue) * 100
  aggregated.cm1Percent = (aggregated.cm1 / netRevenue) * 100
  ... (all percent fields)

STEP 5: Aggregate Balance Sheet data (special handling)
  // Opening Stock = FIRST month's opening stock
  // Closing Stock = LAST month's closing stock
  // Purchases, Sales, Profit/Loss = SUMMED across all months

  FOR each record in sorted:
    IF record.balanceSheet exists:
      IF first BS record:
        bsAggregated.openingStock = record.balanceSheet.openingStock

      // Always update closing to latest
      bsAggregated.closingStock = record.balanceSheet.closingStock

      // Sum cumulative values
      bsAggregated.purchases += record.balanceSheet.purchases
      bsAggregated.netSales += record.balanceSheet.netSales
      bsAggregated.netProfitLoss += record.balanceSheet.netProfitLoss

  // Recalculate COGS for aggregated period
  bsAggregated.calculatedCOGS = openingStock + purchases - closingStock

RETURN aggregated
```

### 6.2 Balance Sheet Aggregation Special Rules

| Field | Aggregation Rule |
|-------|------------------|
| Opening Stock | First month's value |
| Closing Stock | Last month's value |
| Purchases | Sum of all months |
| Gross Sales | Sum of all months |
| Net Sales | Sum of all months |
| Gross Profit | Sum of all months |
| Net Profit/Loss | Sum of all months |
| Calculated COGS | Opening (first) + Total Purchases - Closing (last) |

---

## 7. Balance Sheet Reconciliation

**File:** `client/src/components/mis-tracking/MISMonthlyView.tsx` → `ReconciliationSection`

**Purpose:** Compare MIS calculated values against Balance Sheet data for 3 key metrics.

### 7.1 Why Only 3 Metrics?

MIS and Balance Sheet classify direct vs indirect expenses differently, so only these metrics are directly comparable:

1. **Net Sales** (Revenue)
2. **COGS** (Cost of Goods Sold)
3. **Net Profit/Loss**

### 7.2 Reconciliation Calculations

```
// Net Sales Comparison
MIS Net Revenue vs BS Net Sales
variance = ((MIS - BS) / BS) * 100

// COGS Comparison
MIS COGM vs BS Calculated COGS
BS COGS = Opening Stock + Purchases - Closing Stock
variance = ((MIS - BS) / BS) * 100

// Net Profit/Loss Comparison
MIS Net Income vs BS Net Profit/Loss
variance = ((MIS - BS) / BS) * 100
```

### 7.3 Variance Thresholds

| Variance | Status |
|----------|--------|
| < 5% | Match (Green) |
| >= 5% | Review Required (Yellow) |

---

## 8. Data Storage

**File:** `client/src/utils/googleSheetsStorage.ts`

### 8.1 Storage Structure

Currently uses localStorage with this structure:

```typescript
interface MISStorageData {
  version: string;
  lastUpdated: string;
  periods: MISRecord[];        // All saved MIS periods
  learnedPatterns: LearnedPattern[];  // Classification patterns
}
```

### 8.2 Storage Operations

| Operation | Function | Description |
|-----------|----------|-------------|
| Load all data | `loadMISData()` | Returns full MISStorageData |
| Save MIS record | `saveMISRecord()` | Upserts a single period |
| Get MIS record | `getMISRecord(periodKey)` | Retrieves specific period |
| Delete record | `deleteMISRecord(periodKey)` | Removes a period |
| Get patterns | `getLearnedPatterns()` | Returns classification patterns |
| Save pattern | `saveLearnedPattern()` | Adds/updates a pattern |

### 8.3 Cache Management

Upload data is cached separately for quick page loads:

```typescript
// Upload data cache key
const UPLOAD_DATA_KEY = 'heatronics_mis_upload_data';

// Cached data includes:
- Period key
- State upload data (files, parsed status, parsed data)
- Timestamp
```

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `client/src/types/misTracking.ts` | Type definitions for all MIS data structures |
| `client/src/utils/misTrackingParser.ts` | File parsers (Sales, Journal, Purchase, BS) |
| `client/src/utils/pdfParser.ts` | PDF Balance Sheet parser |
| `client/src/utils/misClassifier.ts` | Transaction classification engine |
| `client/src/utils/misCalculator.ts` | Main MIS calculation engine |
| `client/src/utils/googleSheetsStorage.ts` | Data persistence layer |
| `client/src/components/mis-tracking/MISMonthlyView.tsx` | Monthly view with aggregation & reconciliation |
| `client/src/pages/MISTrackingNew.tsx` | Main MIS tracking page |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01 | Initial algorithm documentation |
| 1.1 | 2024-01 | Added Balance Sheet reconciliation (3 key metrics) |
| 1.2 | 2024-01 | Added multi-month BS aggregation |
