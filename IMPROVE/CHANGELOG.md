# MIS changelog

Newest first. One line per merged PR: what changed for the person using it.

## 10 Nov 2026 (run 3: MIS fault hunt, 10 audit rounds + audited-books tie)
Ten audit rounds (new MIS vs legacy MIS, a decider each round) found the faults below; every fix was tested, reviewed by a separate agent and merged.
- **#411 Tied to the audited accounts:** FY24-25 and FY25-26 net revenue, gross margin, EBITDA, profit before and after tax now equal the audited statements (FY25 within ₹2k of workbook rounding, FY26 within ₹100). FY25 material true-up −₹11.70 L (EBITDA ₹27.2 L → ₹39.2 L); new Other income, Tax and Net income lines; Jan–Mar 26 inter-branch to the books; Dec 23–Mar 24 labelled a 4-month year.
- **#410 Product level:** unmapped sales get a "Not mapped" row; modelled units marked ≈; FY = sum of months; D2C GM FY24-25 100 % → 62.7 %; product fees + ads no longer ₹56 L above the P&L; no made-up "Other revenue" reason in Why it moved; plan vs actual uses each month's Amazon ordered ÷ settled units.
- **#409 Channel splits:** MIS Sheet and Channels tab show the same channel P&L (FY25-26 B2B GM 60.4 % / 20.7 % → 28.1 %); years sum their months; marketplace fees never land on B2B / GT; leftover marketing no longer on Blinkit; channels and SKU cells foot to the company (499 mismatches → 16, all pre-existing display blanks).
- **#408 MIS Sheet + periods:** legacy payroll ₹1.16 Cr and professional fees ₹22.8 L on their own lines; EBITDA burn FY25-26 33.97 L → 0.97 L; "Last 12 months" ends at the last complete month; YTD = financial year; plan vs actual leaves out half-booked months.
- **#407 Server books + cash:** Today / MCP / CEO summary: TB sales exclude stock transfers (+₹93 L removed), sales & marketing no longer dropped (₹1.18 Cr), direct expenses not counted twice (₹64.5 L), cash lasts counts the overdraft (4.1 → 0.8 months on the test book), runway page gets cash / OD / debtors, empty Tally answers never overwrite a good copy.
- **#406 Tranzact:** cancelled invoices skipped (may explain the Oct ₹2.2 L B2B gap), accessory lines count as sales, charge lines dropped with ₹ shown, day-first upload dates, seven new sales ledgers mapped (internal transfers = stock transfer).
- **#405 Feeds + pulls:** Amazon wide ranges work; stale live sources show as Fix items; every close slot checked for every open month; daily auto-pull of last month's automatic slots (needs secret `mis-auto-pull-token`).
- **#404 Month completeness:** Oct 26 no longer counted full with Amazon ₹0 (shows "no data", named on the close panel); Nov stops showing ₹0; ready-to-close needs closing stock posted; Amazon ex-GST estimate 5 % (was 18 %).
- **#403 Normalised COGM:** includes manufacturing cost and inward freight (₹40.7 L Apr–Sep); no-BOM sales costed, never a 100 % margin.
- **#402 Marketing by spend:** ads no longer charged to B2B / GT (₹49 L FY25, ₹32 L FY26); report fees capped at Tally.
- **#401 History:** Amazon Dec 23–Sep 24 (₹1.01 Cr) shows as Amazon, not B2B; legacy channels ex-GST (sum to net revenue); chat reads the deck.

## 10 Nov 2026 (run 2)
- **#399 Live feed:** partial Ads / Flipkart data is pulled again after 5 min (was 24 h), no source can hold the Live MIS load more than 25 s, and a failed or partial feed shows on Tasks → Fix and Today instead of a silent empty page.
- **#398 Owners + sources:** every sidebar page shows who runs it, how often and what to do; the Source chip ("Tally books · 3 h ago", tap for details) replaces the freshness line on Today; the status is a header chip, not a banner.
- **#397 Accessibility + phones:** text readable in light and dark (axe serious issues 1,116 → 0), no text under 12 px on phones, no pages cut off at 390 px, every input labelled, one primary button per screen.
- **#396 Cash runway** (`/accounts/cash-runway`, Accounts):
  - net cash projected 13 weeks ahead in three cases (usual, worst month, best month);
  - shows the week cash goes below zero and the week it reaches the overdraft limit;
  - the overdraft limit is set on the page;
  - MCP `mis_get_cash_runway`.
  - Reviewed twice: overdraft and loans counted once, GST not double-counted.
- **#395 Code health:** pages load on demand (first download 1.16 MB → 88 kB gzipped), Excel / PDF libraries load on click, lint errors 0, 57 unused files removed, plan engine ~2.5× faster, a "page failed to load" screen with Reload, and safe asset caching.
- **#394 Today** (`/today`, first in the sidebar):
  - what needs you, high first;
  - 5 numbers: net cash, months of cash, sales, to fix, late tasks;
  - what changed since the last saved day, and what's coming up;
  - saves one small snapshot a day;
  - MCP `mis_get_morning_brief`.

## 9 Nov 2026 (run 1 and earlier tonight)
- **#393 Plan vs actual** (Planning): the 5-year plan as the budget; MCP `mis_get_plan_vs_actual`.
- **#392 Why it moved** (Live MIS → Overview): an EBITDA bridge vs last month and last year, in plain words; MCP `mis_get_margin_bridge`.
- **#391** IMPROVE/BACKLOG.md started.
- **#389 TDS planning** (`/accounts/tds`) from the stored Tally Day Books.
- **#388 Security:** every route behind login (tested), SSRF guards, store-key checks.
- **#387** CI on every PR.
- **#386 Price floors v2:** ₹999 band, FBM courier, unsellable returns, 1P.

## Open PRs at the end of run 2
None from this run.
