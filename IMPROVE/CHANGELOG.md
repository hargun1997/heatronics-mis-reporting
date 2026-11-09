# MIS changelog

Newest first. One line per merged PR: what changed for the person using it.

## 10 Nov 2026 (run 2)
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
- **#398** Owner · how often · job on every page; Source chip; Today status moved from a banner to a header chip.
- **#399** Live feed: partial data re-pulled after 5 min; 25 s cap per source; failed or partial feeds shown on the Fix list.
