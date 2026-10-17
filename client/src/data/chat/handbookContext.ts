// ----------------------------------------------------------------------------
// Handbook context pack — a compact, high-signal knowledge base distilled from
// the Heatronics Accounts Handbook (now folded into the Accounting SOPs under
// /guide/sop). It grounds the SOP clarification chat so Claude answers from how the books
// are actually wired, not from generic accounting knowledge. Keep it in sync
// with the handbook when the handbook changes.
//
// Section ids (used for "see §…" references) match the handbook anchors:
//   S0–S7  the setup (how everything is wired)
//   c1–c9  how the books are built
//   c13    operating calendar   c14 daily   c15 weekly   c16 monthly   c17 quarterly
//   c18    tools & menus        c19 plugin settings
//   c10    month-end close      c11 findings   c12 queries for the CA
//   c20–c24 reference (links, control-account map, terms, FAQ, evidence)
// ----------------------------------------------------------------------------

export const HANDBOOK_CONTEXT = `
COMPANY: Heatronics Medical Devices Pvt Ltd — D2C orthopedic heat-therapy devices, India. FY 2026-27.
The handbook is written for the CA and the accountant. It explains how the books are built: which system creates each entry, the journal it posts, the control account it lands in, and how each account is reconciled. Part II has every operating task step by step with screenshots.

=== THE SETUP: HOW EVERYTHING IS WIRED (Part 0, §S0–S7) ===
Data starts in five outside systems plus the banks, crosses one of four "bridges", becomes a voucher inside Tally, and lands in a control ledger. Cash arriving in the bank clears that control ledger.

Four bridges:
1. TranZact Chrome plugin — pushes approved Tranzact documents straight into Tally as vouchers. Needs Tally open. (§S1)
2. tally-integration.in (the plugin vendor website) — holds API keys, mapping rules, and uploaded Amazon reports. Two workspaces: Store/Gateway (Shopify, Easebuzz direct API) and Marketplace (Amazon uploaded Excel reports). (§S2)
3. eCom2Tally plugin inside Tally (the .tcp add-on) — actually creates the vouchers via its menu options. Option 3 = Shopify/Easebuzz API (daily); Option 2 = Amazon file import (monthly); Option 5 = Courier COD reports from S:\\Custom Uploads (Shiprocket, Snapmint, monthly). (§S3)
4. Tally On Cloud File Manager + Tally Banking — upload report/bank files to the Tally server and import/reconcile. (§S5, §S6)

Bill-wise matching (§S4) is the idea the whole D2C/Amazon setup depends on: a sale opens a bill under a reference; a payout clears the bill with the SAME reference. If references differ, the sale stays open (Dr) and an unmatched credit appears — the ledger total can look fine while ageing is wrong. Examples: Shopify COD ref "HTR-{{order_number}}-D2C" must equal the Shiprocket remittance "id"; Shopify prepaid "pg:" tag must equal Easebuzz "bank_transaction_id".

CONTROL LEDGERS (each is opened by a sale/voucher and cleared by a bank receipt):
- Party ledgers (customers, suppliers, TDS)
- Shopify Prepaid Receivable, Shopify COD Receivable
- Easebuzz Collection A/c, ShipRocket Collection, Snapmint collection
- Amazon chain: Amazon Seller A/c → Amazon Settlement → Amazon Bank Transfer → bank
- Banks: Central Bank of India (Operating/CC), ICICI, HDFC

KEY SETTINGS (changed only by Hargun, not the accountant):
- Tranzact Accounting Rules map sales ledgers by document series (B2C, OEM, GT Dealer/Retailer/CNF, MT, Physio, Blinkit, Internal Transfer); purchases: service bills → Job Work Charges, goods → RM Purchases.
- Chrome plugin: Tally 3.0 ticked, Direct Integration, "Check TDL & Duplicate Vouchers" = Yes. It sends Sales, Purchase, Credit Note, Debit Note, Journal (NOT PV/RV/SM).
- Ledger names must match Tally EXACTLY, or near-duplicate ledgers get created (e.g. "IGST 5.00%" vs "IGST Output - 5%").

KNOWN ISSUES / GOTCHAS:
- Every import is effectively one-time: assume it does NOT dedupe. Running the same dates/file twice can double-book.
- Confirmed Easebuzz pagination bug (April settlements came only partly) — likely cause of the Easebuzz gap.
- Imports default to Tally's current date. If Tally's top-bar date is wrong (it once read 6-Dec-2026 on 17-Oct), every import form defaults to the wrong month. ALWAYS check Tally's date is today before any import (Alt+F2 to set).

=== OPERATING CALENDAR (§c13) ===
Every working day: D1 (Tranzact → Tally), D2 (Shopify then Easebuzz for yesterday).
Every Monday: W1 weekly checks.
By Day 3: daily work caught up to month end.
By Day 5: Amazon, Shiprocket, Snapmint imported (M1–M3).
By Day 7: TDS paid for last month (M5).
By Day 10: GSTR-1 data to the CA, due 11th (M5).
By Day 12: HDFC, ICICI, Central Bank reconciled (M5).
By Day 15: platform invoices booked + Amazon expense JV (M4).
By Day 20: clearing ledgers checked, GSTR-3B, close (M5).
Quarterly: 26Q, Form 16A to Amazon (Q, §c17).

=== DAILY TASKS (§c14) ===
D1 · Tranzact → Tally (~10 min). Done when Pending and Approved both read 0 on Document Approval AND Journal Entry.
  1. Split TDS on every service bill (job work = 2%, on value before GST; field starts at 0 — never save at 0).
  2. Approve everything pending (documents + TDS journals). Rejected? Fix in Tranzact and approve again — never type into Tally by hand.
  3. Open Tally On Cloud, then the TranZact Chrome plugin (status must read Connected).
  4. Send Voucher Data → Direct Integration (not Excel).
  5. Push all five voucher types one at a time: Sales → Purchase → Credit Note → Debit Note → Journal. Refresh, select all, Send to Tally, Update TZ Status.
  6. Check: Pending = 0, Approved = 0 on both tabs.
D2 · Shopify orders, then Easebuzz payouts (~5 min). Done when yesterday's orders and payouts are in Tally.
  - Option 3: Shopify-Orders first (Platform Type Online-Store), dates = yesterday/yesterday.
  - Then Easebuzz (Platform Type Payment-Gateway), SAME dates. Easebuzz runs second because payouts can only clear orders already in Tally.
  - NEVER fetch the same Easebuzz dates twice (double-books payouts). If a day looks short, check Day Book (voucher type Journal, that date) first.

=== WEEKLY CHECKS (§c15) — every Monday, ~15 min (recommended control) ===
- Tally date = today.
- Easebuzz payout count: last week's journals vs the Easebuzz dashboard settlement list — same count, same amounts, no repeats.
- Tranzact rejects cleared; Suspense reviewed.

=== MONTHLY TASKS (§c16) ===
M1 · Amazon: four reports, by Day 5. Download MTR-B2C, MTR-B2B, STR; request Settlement (Transaction) report; upload all four on the plugin site; import with option 2 one file type at a time. Check Amazon Seller A/c / Amazon Settlement / Amazon Bank end-of-month balances.
M2 · Shiprocket COD remittances, by Day 5. Download COD remittance report; save as "YYYY-MM_Mon_Shiprocket_COD_AWB.xls" (don't edit contents); upload to Custom Uploads; import with option 5; book freight invoices (COD + prepaid) and tie out — total booked should equal Total Deductions from COD.
M3 · Snapmint settlements, by Day 5. Report arrives by email; save per Custom Uploads convention; upload; import with option 5.
M4 · Platform invoices + Amazon expense JV, by Day 15. Book each platform invoice as Purchase-Expense (base→fee ledger, GST→Input GST, credit the platform's control ledger; Amazon ads also carry TDS). Pass the Amazon expense JV. Match every invoice to GSTR-2B — if missing from 2B there's no ITC, tell Hargun.
M5 · Banks, statutory dates, close, Day 7–20.
  - Import & reconcile 3 banks (HDFC, ICICI, Central Bank). Central Bank file: column headings must be on ROW 14.
  - Statutory: 7th TDS paid for last month; 10th GSTR-1 data to CA (due 11th); 20th GSTR-3B.
  - Check every clearing ledger is cleared.

=== QUARTERLY (§c17) ===
- 26Q (TDS return) by 31 Jul / 31 Oct / 31 Jan / 31 May. Late filing means Amazon won't refund the TDS on ads.
- Form 16A → upload to Seller Central once generated.
- TDS refunds from Amazon: check they arrived in settlements; older than 6 months → raise a Seller Central case.

WHEN THINGS BREAK (§c17): wrong December dates → fix Tally date (Alt+F2); plugin stuck Connecting → open Tally first then Reconnect; Shiprocket/Snapmint import fails → check file in Custom Uploads, dates, exact sheet name, retyped file name; Easebuzz payouts missing → check Day Book, re-fetch only the missing day; order stuck in receivable → option 8 Order-wise settlement report, tell Hargun; rejected Tranzact doc → fix in Tranzact; new .tcp → give to Hargun (filed in 03_Tally_Plugins/eCom2Tally).

=== CLOSE, FINDINGS, QUERIES (§c10–c12) ===
Month-end close ties out each control/clearing ledger and reconciles banks. There are documented findings and proposed adjustments, and a list of open queries for the CA (e.g. the Easebuzz gap).

GUIDANCE FOR ANSWERS:
- You are a clarification assistant for the ACCOUNTANT and the CA. Explain the handbook's actual procedure, not generic textbook accounting.
- Always cite the handbook section ("see §c14 D1", "§S4 bill-wise matching", etc.) so the reader can open it.
- All amounts are Indian Rupees (₹).
- If something is not covered in the handbook, say so plainly and suggest asking Hargun rather than inventing a step.
- Rules and plugin settings are changed only by Hargun — never tell the accountant to change a mapping rule or plugin setting themselves.
`.trim();
