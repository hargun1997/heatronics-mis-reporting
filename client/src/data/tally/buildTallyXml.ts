// ---------------------------------------------------------------------------
// Tally Prime XML builder for the Expense Booking pipeline.
//
// Takes the operator's queue (Purchase-Services / Purchase-Capital bookings)
// and produces a single XML file Tally Prime can import via:
//   Gateway of Tally → Import → Vouchers → File path → Import.
//
// Conventions used:
// - Date format YYYYMMDD (no separators) — Tally's only accepted form.
// - Amount signs follow Tally's "deemed positive" rule:
//     ISDEEMEDPOSITIVE=No  → credit side of the voucher  → AMOUNT = +value
//     ISDEEMEDPOSITIVE=Yes → debit side of the voucher   → AMOUNT = -value
// - Bill reference uses the vendor's invoice number (per locked decision).
// - Voucher number is OMITTED so Tally Prime auto-numbers per series.
// - Voucher types restricted to Purchase-Services and Purchase-Capital.
//   Any subsequent stages (e.g. monthly prepaid amortisation Journals) are
//   intentionally skipped — those are booked manually outside this tool.
// - Cost centre allocation is added only to expense lines, not to GST/TDS
//   lines (those are tax-handling, not P&L allocations).
// ---------------------------------------------------------------------------

import type { TallyMaster } from './useTallyMaster';

// Local copies of the scenario / advice shapes — kept here so the builder is
// independent of the page module.
export interface BookingLine {
  dr_or_cr: 'Dr' | 'Cr';
  ledger: string;
  amount: number | null;
  notes?: string;
}

export interface BookingStage {
  step: number;
  title: string;
  when: string;
  voucherType: string;
  costCentre?: string | null;
  lines: BookingLine[];
  notes?: string | null;
}

export interface ExpenseAdvice {
  summary: string;
  stages: BookingStage[];
  invoiceExtract?: {
    vendor?: string;
    gstin?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    amount?: number;
    gstAmount?: number;
    currency?: string;
  } | null;
}

export interface QueueItemForExport {
  id: string;
  answers: {
    party?: string;
    costCentre?: string;
  };
  advice: ExpenseAdvice;
}

export interface BuildOptions {
  companyName?: string;
  defaultCostCentre?: string; // fallback when nothing is set; "HO" per locked decisions
  fallbackDate?: string; // YYYY-MM-DD; used when invoice date is missing
}

export interface ExportError {
  itemId: string;
  vendor?: string;
  reason: string;
}

export interface ExportSummary {
  xml: string;
  vouchersExported: number;
  itemsSkipped: ExportError[];
  stagesSkipped: { itemId: string; voucherType: string; step: number }[];
  warnings: string[];
}

const ALLOWED_VOUCHER_TYPES = new Set(['Purchase-Services', 'Purchase-Capital']);
const TAX_GROUPS_LOWER = ['duties & taxes', 'duties and taxes'];

// Standard XML special-character escape.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// YYYY-MM-DD -> YYYYMMDD. Falls back to today if input is invalid.
function tallyDate(input?: string, fallback?: string): string {
  const s = input || fallback || '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  // ultimate fallback: today
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function fmtAmount(n: number): string {
  // Two decimals; Tally is lenient but consistent precision avoids surprises.
  return n.toFixed(2);
}

// Walk the master's group hierarchy and decide if a ledger is a tax line
// (Input GST / Output GST / TDS Payable etc.). Tax lines do not get cost
// centre allocations.
function isTaxLedger(ledgerName: string, master: TallyMaster): boolean {
  const ledger = master.ledgers?.find((l) => l.name === ledgerName);
  if (!ledger) return false;
  const groupByName = new Map((master.groups || []).map((g) => [g.name, g]));
  let cursor: string | null | undefined = ledger.group;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (TAX_GROUPS_LOWER.includes(cursor.toLowerCase())) return true;
    cursor = groupByName.get(cursor)?.parent;
  }
  return false;
}

// Look up a cost centre's category from the master so the XML allocation
// element can reference it. Defaults to "Channel" if unknown — that's the
// only category we use for expenses per the locked decisions.
function costCentreCategory(name: string, master: TallyMaster): string {
  const cc = master.costCentres?.find((c) => c.name === name);
  return cc?.category || 'Channel';
}

// Validate and normalise one stage into a Voucher XML chunk. Returns either
// the XML string or an error reason.
function buildVoucher(
  item: QueueItemForExport,
  stage: BookingStage,
  master: TallyMaster,
  opts: BuildOptions
): { xml: string } | { error: string } {
  if (!ALLOWED_VOUCHER_TYPES.has(stage.voucherType)) {
    return {
      error: `Voucher type "${stage.voucherType}" is not Purchase-Services or Purchase-Capital`,
    };
  }
  const lines = stage.lines || [];
  if (lines.length < 2) {
    return { error: 'Stage has fewer than 2 ledger lines' };
  }

  // Every line must have an amount we can write.
  for (const l of lines) {
    if (l.amount == null) {
      return { error: `Line for "${l.ledger}" has no amount` };
    }
    if (!l.ledger) return { error: 'Line has no ledger name' };
  }

  // Totals must balance.
  const drTotal = lines.filter((l) => l.dr_or_cr === 'Dr').reduce((s, l) => s + (l.amount || 0), 0);
  const crTotal = lines.filter((l) => l.dr_or_cr === 'Cr').reduce((s, l) => s + (l.amount || 0), 0);
  if (Math.abs(drTotal - crTotal) > 0.01) {
    return {
      error: `Lines don't balance: Dr ${drTotal.toFixed(2)} vs Cr ${crTotal.toFixed(2)}`,
    };
  }

  // Identify the party line — first Cr line that lives under Sundry
  // Creditors / Loans & Advances (i.e. NOT a tax/TDS Cr).
  const crLines = lines.filter((l) => l.dr_or_cr === 'Cr');
  const partyLine =
    crLines.find((l) => !isTaxLedger(l.ledger, master)) || crLines[0];
  const invoiceNumber = item.advice.invoiceExtract?.invoiceNumber || '';
  const date = tallyDate(item.advice.invoiceExtract?.invoiceDate, opts.fallbackDate);
  const vendorForNarration =
    item.advice.invoiceExtract?.vendor || item.answers.party || partyLine.ledger;
  const narrationParts = [stage.title, vendorForNarration, invoiceNumber].filter(Boolean);
  const narration = narrationParts.join(' · ');
  const costCentre =
    stage.costCentre || item.answers.costCentre || opts.defaultCostCentre || 'HO';
  const ccCategory = costCentreCategory(costCentre, master);

  const ledgerEntries: string[] = [];

  for (const l of lines) {
    const amount = l.amount as number;
    const isDeemedPositive = l.dr_or_cr === 'Dr' ? 'Yes' : 'No';
    const signedAmount = l.dr_or_cr === 'Dr' ? -amount : amount;

    const entryParts: string[] = [];
    entryParts.push(`            <LEDGERNAME>${xmlEscape(l.ledger)}</LEDGERNAME>`);
    entryParts.push(`            <ISDEEMEDPOSITIVE>${isDeemedPositive}</ISDEEMEDPOSITIVE>`);
    entryParts.push(`            <AMOUNT>${fmtAmount(signedAmount)}</AMOUNT>`);

    // Bill reference on the party line.
    if (l === partyLine) {
      const billName = invoiceNumber || `EXP-${item.id.slice(-8).toUpperCase()}`;
      entryParts.push(`            <BILLALLOCATIONS.LIST>`);
      entryParts.push(`              <NAME>${xmlEscape(billName)}</NAME>`);
      entryParts.push(`              <BILLTYPE>New Ref</BILLTYPE>`);
      entryParts.push(`              <AMOUNT>${fmtAmount(signedAmount)}</AMOUNT>`);
      entryParts.push(`            </BILLALLOCATIONS.LIST>`);
    }

    // Cost centre allocation on Dr expense lines (skip GST / TDS Dr lines).
    if (l.dr_or_cr === 'Dr' && !isTaxLedger(l.ledger, master)) {
      entryParts.push(`            <CATEGORYALLOCATIONS.LIST>`);
      entryParts.push(`              <CATEGORY>${xmlEscape(ccCategory)}</CATEGORY>`);
      entryParts.push(`              <COSTCENTREALLOCATIONS.LIST>`);
      entryParts.push(`                <NAME>${xmlEscape(costCentre)}</NAME>`);
      entryParts.push(`                <AMOUNT>${fmtAmount(signedAmount)}</AMOUNT>`);
      entryParts.push(`              </COSTCENTREALLOCATIONS.LIST>`);
      entryParts.push(`            </CATEGORYALLOCATIONS.LIST>`);
    }

    ledgerEntries.push(
      `          <ALLLEDGERENTRIES.LIST>\n${entryParts.join('\n')}\n          </ALLLEDGERENTRIES.LIST>`
    );
  }

  const xml = `        <VOUCHER VCHTYPE="${xmlEscape(stage.voucherType)}" ACTION="Create">
          <DATE>${date}</DATE>
          <NARRATION>${xmlEscape(narration)}</NARRATION>
          <VOUCHERTYPENAME>${xmlEscape(stage.voucherType)}</VOUCHERTYPENAME>
          <PARTYLEDGERNAME>${xmlEscape(partyLine.ledger)}</PARTYLEDGERNAME>
${ledgerEntries.join('\n')}
        </VOUCHER>`;

  return { xml };
}

export function buildTallyXml(
  queue: QueueItemForExport[],
  master: TallyMaster,
  opts: BuildOptions = {}
): ExportSummary {
  const company = opts.companyName || 'Heatronics';
  const errors: ExportError[] = [];
  const stagesSkipped: ExportSummary['stagesSkipped'] = [];
  const warnings: string[] = [];
  const voucherChunks: string[] = [];

  for (const item of queue) {
    const stages = item.advice.stages || [];
    if (stages.length === 0) {
      errors.push({
        itemId: item.id,
        vendor: item.advice.invoiceExtract?.vendor,
        reason: 'No stages',
      });
      continue;
    }

    // Only the FIRST stage is exported as a voucher; subsequent stages
    // (prepaid amortisation Journals etc.) are out of scope per the locked
    // decisions and are flagged for manual handling.
    const primary = stages[0];
    if (stages.length > 1) {
      for (let i = 1; i < stages.length; i++) {
        stagesSkipped.push({
          itemId: item.id,
          voucherType: stages[i].voucherType,
          step: stages[i].step,
        });
      }
    }

    if (!item.advice.invoiceExtract?.invoiceNumber) {
      warnings.push(
        `Invoice for "${
          item.advice.invoiceExtract?.vendor || item.answers.party || 'unknown vendor'
        }" has no invoice number — used a generated ref starting "EXP-".`
      );
    }

    const result = buildVoucher(item, primary, master, opts);
    if ('error' in result) {
      errors.push({
        itemId: item.id,
        vendor: item.advice.invoiceExtract?.vendor,
        reason: result.error,
      });
      continue;
    }
    voucherChunks.push(result.xml);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${voucherChunks.join('\n')}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;

  return {
    xml,
    vouchersExported: voucherChunks.length,
    itemsSkipped: errors,
    stagesSkipped,
    warnings,
  };
}
