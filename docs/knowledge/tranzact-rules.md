# Tranzact → Tally: document series and accounting rules

Read from Tranzact on 3 Nov 2026 (Settings → Documents → Document Number Format; Accounting Integration → Accounting Rules, Ledger Settings).
Code twin: `client/src/data/tranzact/rules.ts` (the parser reads it). Re-check Tranzact when a series is added.

## How Tranzact picks the Tally ledger
Accounting Rules match on **document series only** (address, movement type, tax, category, item and tax % are all blank). Purchases: goods → RM Purchases, service bills → Job Work Charges. Documents go Tranzact → Document Approval → TranZact Chrome plugin → Tally.

## Sales invoice series (format PREFIX/26-27/NNNN, resets every financial year)
| Series | Prefix | Tally sales ledger | In the MIS |
|---|---|---|---|
| OEM Sales | OEM | OEM Sales | B2B |
| GT Dealer | GTD | GT - Dealer Sales | GT |
| GT Retailer | GTR | GT - Retailer Sales | GT |
| GT CNF | GTC | GT - CNF Sales | GT |
| Physio Channel | PHY | Physio Channel Sales | GT |
| MT Sales | MT | MT Sales | GT (for now) |
| B2C | B2C | B2C Offline Sales | GT (for now) |
| Blinkit Sales | BLK | Blinkit Sales | Blinkit payout slot (not counted from Tranzact) |
| Internal Transfer | ITF | Internal Transfer Sales (= Tally Stock Transfers) | NOT revenue |
| Ecommerce 3P | Ecom | none (no accounting rule yet) | NOT revenue (stock to Amazon / marketplaces) |

Credit notes: BLK/CN, GTR/CN, GTD/CN, GTC/CN, MT/CN, PHY/CN, OEM/CN, ITF/CN (+ plain CN). Other series: PO, JW (job work PO), IN (inward), GRN, PI, SQ, OC, CL (challan), SR (sales return), DN, BSF (stock transfer document), PMV / RCV (vouchers), IAP, MAJ, PSR.
Item codes: RM- / SFG- / FG- / REJ- / Service- / EQ-.

## Rules the MIS applies
- Audited-vs-MIS gap = GST + internal stock transfers (founder, 3 Nov 2026): ITF and Ecom invoices, and any invoice billed to an Amazon entity, are stock transfers and are excluded from revenue.
- The register trace shows each excluded total so it can be matched to Tally's Stock Transfers ledger.

## Open points
- BLK/26-27/00007 (31 Oct) is billed to CARE INDIA SURGICALS (a UP surgical dealer, no e-invoice), not Blinkit: probably raised in the wrong series; Tally would book it as Blinkit Sales.
- Ecom series has no accounting rule, so those invoices never reach Tally by the plugin.
- 8 documents were pending approval on 2 Nov (incl. 2 rejected).
