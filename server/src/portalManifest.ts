// Public API list for the portal's Systems map (portal.heatronics.in/systems), served at
// GET /.well-known/portal.json. Keep it in step with the routes; never put secret names or values here.
export const portalManifest = {
  "schema": 2,
  "key": "mis",
  "name": "MIS Tool",
  "repo": "hargun1997/heatronics-mis-reporting",
  "exposes": [
    {
      "id": "expenses",
      "method": "GET",
      "path": "/api/expenses?month=YYYY-MM",
      "auth": "token",
      "purpose": "Monthly expense lines from the Tally P&L uploads"
    },
    {
      "id": "plan-vs-actual",
      "method": "GET",
      "path": "/api/planning/vs-actual?scenario=<scenario>",
      "auth": "session",
      "purpose": "Our 5-year plan as the budget: each month from Oct-26 to now, actual vs plan, with year to date and exit ARR pace",
      "mcp": {
        "tool": "mis_get_plan_vs_actual",
        "description": "Call for 'are we on plan / how are we doing against budget': per month from the plan's first month (Oct-26) to now, net revenue, gross margin, CM3, EBITDA and units, actual vs plan with gap ₹ and %, status on_track (within 5%) / behind / ahead, or no data yet (never 0); the month in progress is shown but not counted; plus year to date, 'on pace for FY exit ARR X vs plan Y', and the behind-plan list (biggest ₹ gap first). Actuals are the Live MIS figures last saved from the Planning page (normalised COGM where costed); read actualsAsOf and limits. ₹.",
        "access": "read",
        "input": { "type": "object", "properties": { "scenario": { "type": "string", "description": "'base' (default) or the name or id of a saved scenario (it must have been saved after this feature shipped)" } } },
        "returns": "months[] + ytd + arr + behind[] + scenario + actualsAsOf + limits"
      }
    },
    {
      "id": "price-floors-live",
      "method": "GET",
      "path": "/api/price-floors/live",
      "auth": "session",
      "purpose": "Amazon price floors from Ops' stored fees, prices, units and returns (last 30 days)",
      "mcp": {
        "tool": "mis_get_price_floors",
        "description": "Amazon per-ASIN economics for the last 30 full days: selling price, units, referral / FBA / closing fees, refunds, ad spend, storage. Use for price floors and unit margin questions.",
        "access": "read",
        "returns": "Per-ASIN fee report rows"
      }
    },
    {
      "id": "books-summary",
      "method": "GET",
      "path": "/api/tally/summary",
      "auth": "session",
      "purpose": "Monthly sales, costs, net profit, cash, debtors and creditors from the stored Tally copies",
      "mcp": {
        "tool": "mis_get_summary",
        "description": "Start here for money questions (Cash Overwatch): one row per month (last 13) from Tally: sales (channel ledgers; Stock Transfers taken out of sales and purchases), other income, purchases, direct and indirect expenses, net profit, closing stock, cash and bank, overdraft, net cash, debtors, creditors, loans, GST payable, complete (false = running month or books copied < 5 days after month end: not a whole month); plus fy (FY-to-date sales, gross margin, EBITDA, net profit vs last FY), channels (sales per channel ledger, 6 months, MoM), costs (opex buckets, MoM, % of sales), balance (cash per bank, OD, debtors, creditors, stock, loans, GST), cashflow (last 3 months), close (locked / ready / open, tie, uploads), watch (things to watch with ₹ and a reason), topExpenses. ₹, no adding up needed; null = not in the books yet.",
        "access": "read",
        "returns": "months[] + fy + channels + costs + balance + cashflow[] + close[] + watch[] + topExpenses + notes"
      }
    },
    {
      "id": "channel-pnl",
      "method": "GET",
      "path": "/api/tally/channel-pnl?months=<months>",
      "auth": "session",
      "purpose": "Monthly sales per channel ledger and opex by bucket from the stored Tally P&L copies",
      "mcp": {
        "tool": "mis_get_channel_pnl",
        "description": "Call for 'how did each channel / vertical do in the books' or 'what are we spending on': Tally sales per channel ledger (Amazon, D2C, Flipkart, Blinkit, GT, B2B, Export) per month with MoM and share, and opex by bucket (employee, marketing, channel fees, logistics, rent & factory, professional, finance, depreciation) per month with MoM and % of sales. As booked in Tally. ₹.",
        "access": "read",
        "input": { "type": "object", "properties": { "months": { "type": "integer", "minimum": 2, "maximum": 13, "description": "How many months back (default 6)" } } },
        "returns": "channels{months[], momPct, sharePct} + costs{months[], momPct}"
      }
    },
    {
      "id": "cashflow",
      "method": "GET",
      "path": "/api/tally/cashflow",
      "auth": "session",
      "purpose": "Indirect cash flow of the last 3 months from consecutive stored Trial Balances",
      "mcp": {
        "tool": "mis_get_cashflow",
        "description": "Call for 'where did the cash go' or burn questions: per month (last 3) profit, depreciation, working-capital change, operating / investing / financing / other, net change, opening and closing cash & bank. From Tally's month-end Trial Balances. ₹.",
        "access": "read",
        "returns": "cashflow[] + netCash"
      }
    },
    {
      "id": "balance-sheet",
      "method": "GET",
      "path": "/api/tally/balance-sheet",
      "auth": "session",
      "purpose": "Newest balance sheet figures and FY-to-date P&L from the stored Trial Balance",
      "mcp": {
        "tool": "mis_get_balance_sheet",
        "description": "Call for the cash situation: cash per bank ledger, overdraft, net cash, receivables, payables, inventory, loans, GST net, fixed assets, working capital at the newest Trial Balance; plus fy = FY-to-date sales, COGS, gross margin, EBITDA proxy, net profit and the same for last FY (YoY). ₹; null where the books lack it.",
        "access": "read",
        "returns": "balance + fy{current, lastFy, yoyPct}"
      }
    },
    {
      "id": "close-status",
      "method": "GET",
      "path": "/api/tally/close-status?months=<months>",
      "auth": "session",
      "purpose": "Month-close status per month: lock, tie residual, channel sales vs connectors, missing uploads, Tally copy age",
      "mcp": {
        "tool": "mis_get_close_status",
        "description": "Call for 'is the month closed / are the books tied': per month (last 4) locked | ready | open, who locked and the tie residual %, Tally channel sales vs connector sales gap ₹ per channel, manual uploads still missing, when the Tally P&L copy was taken and whether the Trial Balance ties.",
        "access": "read",
        "input": { "type": "object", "properties": { "months": { "type": "integer", "minimum": 1, "maximum": 12 } } },
        "returns": "close[]"
      }
    },
    {
      "id": "ledger-trend",
      "method": "GET",
      "path": "/api/tally/ledger-trend?ledger=<ledger>",
      "auth": "session",
      "purpose": "Monthly amounts of a Tally P&L ledger across the stored copies",
      "mcp": {
        "tool": "mis_get_ledger_trend",
        "description": "Call when asked about one ledger over time ('how has Cost of Advertising moved', 'rent by month'): every P&L ledger whose name contains the word, monthly amounts (last 13 months) and the total. ₹ as booked.",
        "access": "read",
        "input": { "type": "object", "properties": { "ledger": { "type": "string", "description": "Part of the Tally ledger name" } }, "required": ["ledger"] },
        "returns": "ledgers[{ledger, months[], total}]"
      }
    },
    {
      "id": "expenses-month",
      "method": "GET",
      "path": "/api/tally/expenses?month=<month>",
      "auth": "session",
      "purpose": "Biggest expense ledgers of one month with the month before",
      "mcp": {
        "tool": "mis_get_expenses",
        "description": "Call for 'what did we spend on in <month>': the 25 biggest expense ledgers of that month (default the newest with a Tally copy), each with its bucket and the month before's figure. ₹ as booked.",
        "access": "read",
        "input": { "type": "object", "properties": { "month": { "type": "string", "description": "YYYY-MM" } } },
        "returns": "rows[{ledger, amount, before, bucket}] + total"
      }
    },
    {
      "id": "watchlist",
      "method": "GET",
      "path": "/api/tally/watchlist",
      "auth": "session",
      "purpose": "Things to watch in the books: runway, debtors, creditors, GST, ties, channel drops, copy age, uploads",
      "mcp": {
        "tool": "mis_get_watchlist",
        "description": "Call for 'anything to worry about in the books / cash': rule-based items with severity, ₹ / %, and a one-line reason — cash runway at the last 3 months' outflow, debtors up > 20% MoM, creditors > 2× monthly purchases, GST payable spike, a locked month with a tie breach, a Trial Balance that does not tie, a channel ledger down > 25% MoM, a P&L copy taken too soon after month end or missing, manual uploads missing, Tally vs connector sales gaps.",
        "access": "read",
        "returns": "watch[]"
      }
    },
    {
      "id": "statements",
      "method": "GET",
      "path": "/api/tally/statements",
      "auth": "session",
      "purpose": "Stored Tally trial balances + P&L copies for the Balance Sheet and Cash Flow",
      "mcp": {
        "tool": "mis_get_financials",
        "description": "Company financials from Tally: monthly trial balances (FY to date) and P&L copies (revenue, expense groups, closing stock, depreciation, net profit) for the last 13 months. Use for P&L, balance sheet, cash and burn questions.",
        "access": "read",
        "returns": "Trial balances and P&L copies by month",
        "heavy": true
      }
    },
    {
      "id": "issues-inbox",
      "method": "GET",
      "path": "/api/issues/inbox",
      "auth": "session",
      "purpose": "Accounts issues to fix (Tally health, hanging ledgers, missing uploads, anomalies)",
      "mcp": {
        "tool": "mis_get_accounts_issues",
        "description": "Open accounting problems: Tally health checks, hanging ledgers, trial balance not tying, missing close uploads, MIS anomalies, unmapped products.",
        "access": "read",
        "returns": "Issue items with severity and state"
      }
    },
    {
      "id": "tally-chart",
      "method": "GET",
      "path": "/api/tally/books/chart",
      "auth": "session",
      "purpose": "Tally chart of accounts with closings",
      "mcp": {
        "tool": "mis_get_chart_of_accounts",
        "description": "Tally chart of accounts: groups, sub-groups and ledgers with closing balances from the newest trial balance, plus hanging ledgers and suggested moves.",
        "access": "read",
        "returns": "Account tree with closings",
        "heavy": true
      }
    },
    {
      "id": "plan-scenarios",
      "method": "GET",
      "path": "/api/planning/scenarios",
      "auth": "session",
      "purpose": "Saved 5-year plan scenarios",
      "mcp": {
        "tool": "mis_list_plan_scenarios",
        "description": "Saved 5-year plan scenarios (names, dates, who saved them), e.g. the pain-care plan. The plan's numbers are computed in the MIS page; this lists the scenarios.",
        "access": "read",
        "returns": "Scenario list"
      }
    },
    {
      "id": "work-reminders",
      "method": "POST",
      "path": "/api/work/reminders/run",
      "auth": "open",
      "purpose": "Hourly task reminder emails (GitHub Actions cron)"
    },
    {
      "id": "ownership-reminders",
      "method": "POST",
      "path": "/api/ownership/reminders/run",
      "auth": "open",
      "purpose": "Ownership reminder emails (scheduler)"
    },
    {
      "id": "tally-vouchers",
      "method": "GET",
      "path": "/api/tally/books/vouchers?period=<period>&q=<q>",
      "auth": "session",
      "purpose": "Tally vouchers",
      "mcp": {
        "tool": "mis_get_vouchers",
        "description": "Tally Day Book vouchers for a month (type, number, date, party, narration, ledger lines), filtered by a search word (party, ledger, narration). Up to 400 rows.",
        "access": "read",
        "input": {
          "type": "object",
          "properties": {
            "period": {
              "type": "string",
              "description": "YYYY-MM"
            },
            "q": {
              "type": "string",
              "description": "Search word"
            }
          },
          "required": [
            "period"
          ]
        },
        "returns": "Voucher rows"
      }
    },
    {
      "id": "tally-day",
      "method": "GET",
      "path": "/api/tally/books/day?date=<date>&q=<q>",
      "auth": "session",
      "purpose": "One day of Tally vouchers, read live from Tally",
      "mcp": {
        "tool": "mis_get_tally_day",
        "description": "One day's Tally Day Book read LIVE from Tally (Tally must be open; up to about 80 s), filtered by a search word (voucher number, party, ledger). Use to check a voucher just changed in Tally. Returns status ok / empty (Tally sent nothing: company not open) / down / not_connected.",
        "access": "read",
        "input": {
          "type": "object",
          "properties": {
            "date": {
              "type": "string",
              "description": "YYYY-MM-DD"
            },
            "q": {
              "type": "string",
              "description": "Search word"
            }
          },
          "required": [
            "date"
          ]
        },
        "returns": "Voucher rows of that day"
      }
    },
    {
      "id": "tally-ledgers",
      "method": "GET",
      "path": "/api/tally/books/ledgers?q=<q>",
      "auth": "session",
      "purpose": "Tally ledgers",
      "mcp": {
        "tool": "mis_get_ledgers",
        "description": "Tally ledger masters with their groups and balances, filtered by a search word.",
        "access": "read",
        "input": {
          "type": "object",
          "properties": {
            "q": {
              "type": "string"
            }
          }
        },
        "returns": "Ledger rows"
      }
    },
    {
      "id": "tally-opening",
      "method": "GET",
      "path": "/api/tally/books/opening?q=<q>&group=<group>&all=<all>",
      "auth": "session",
      "purpose": "Tally opening balances per ledger",
      "mcp": {
        "tool": "mis_get_tally_opening",
        "description": "Opening balance (1 April of the current books) of every Tally ledger with Dr / Cr side, group and primary group, biggest first; plus totals by primary group, total Dr, total Cr and the difference (Tally's 'Difference in opening balances'). Use for Busy → Tally tie-outs and 'what did we open X at'. From the stored ledger masters (see asOf).",
        "access": "read",
        "input": {
          "type": "object",
          "properties": {
            "q": { "type": "string", "description": "Search word in ledger name, group or GSTIN" },
            "group": { "type": "string", "description": "Exact group or primary group name, e.g. Sundry Creditors" },
            "all": { "type": "string", "enum": ["1"], "description": "1 = include ledgers with zero opening" }
          }
        },
        "returns": "rows[] (ledger, group, primary, side, amount, gstin) + byPrimary[] + totalDr + totalCr + difference + asOf"
      }
    },
    {
      "id": "tally-tb",
      "method": "GET",
      "path": "/api/tally/books/tb?period=<period>&level=<level>",
      "auth": "session",
      "purpose": "Stored Tally Trial Balance for a month",
      "mcp": {
        "tool": "mis_get_tally_tb",
        "description": "Tally Trial Balance stored for a month (FY start to that month's end): every group and ledger with debit and credit closing, total Dr, total Cr, difference, and which months are stored. Use for closing balances, tie-outs and 'what is X's balance at month end'.",
        "access": "read",
        "input": {
          "type": "object",
          "properties": {
            "period": { "type": "string", "description": "YYYY-MM (default the newest stored month)" },
            "level": { "type": "string", "enum": ["ledger", "group"], "description": "Only ledger rows or only group rows" }
          }
        },
        "returns": "rows[] (name, level, debit, credit) + totals + difference + stored months + asOf"
      }
    },
    {
      "id": "tally-ledger-statement",
      "method": "GET",
      "path": "/api/tally/books/ledger-statement?ledger=<ledger>&from=<from>&to=<to>",
      "auth": "session",
      "purpose": "One Tally ledger's entries with running balance",
      "mcp": {
        "tool": "mis_get_tally_ledger_statement",
        "description": "One Tally ledger's account statement from the stored Day Books: date, voucher type and number, party, reference, narration, the other ledgers, Dr, Cr and running balance (Dr positive), with the 1 April opening when from is April. Use for bank reconciliation, a party's account, loan accounts, 'show me all entries in X'. Lists missing months (Day Book not stored).",
        "access": "read",
        "input": {
          "type": "object",
          "properties": {
            "ledger": {
              "type": "string",
              "description": "Exact or partial ledger name"
            },
            "from": {
              "type": "string",
              "description": "YYYY-MM (default: April of this financial year)"
            },
            "to": {
              "type": "string",
              "description": "YYYY-MM (default: newest stored month)"
            }
          },
          "required": [
            "ledger"
          ]
        },
        "returns": "rows[] + opening + totalDr + totalCr + closing + months + missingMonths"
      }
    },
    {
      "id": "tally-register",
      "method": "GET",
      "path": "/api/tally/books/register?kind=<kind>&from=<from>&to=<to>&class=<class>",
      "auth": "session",
      "purpose": "Purchase / sales register with GST split",
      "mcp": {
        "tool": "mis_get_tally_register",
        "description": "Tally purchase or sales register from the stored Day Books: date, number, party, GSTIN, supplier invoice no. and date, taxable value, IGST, CGST, SGST, cess, TDS, total. Purchases are classed Raw material / Capital goods / Services / Mixed / Unclear from the ledgers used (for GST classification and GSTR-2B / 3B matching), with the reason. Totals by class.",
        "access": "read",
        "input": {
          "type": "object",
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "purchase",
                "sales"
              ],
              "description": "Default purchase"
            },
            "from": {
              "type": "string",
              "description": "YYYY-MM (default: April of this financial year)"
            },
            "to": {
              "type": "string",
              "description": "YYYY-MM (default: newest stored month)"
            },
            "class": {
              "type": "string",
              "enum": [
                "Raw material",
                "Capital goods",
                "Services",
                "Mixed",
                "Unclear"
              ],
              "description": "Only this purchase class"
            }
          }
        },
        "returns": "rows[] + totals + byClass[] + months + missingMonths"
      }
    },
    {
      "id": "tally-tds-check",
      "method": "GET",
      "path": "/api/tally/books/tds-check?from=<from>&to=<to>&min=<min>",
      "auth": "session",
      "purpose": "Expense vouchers: TDS nature vs TDS booked",
      "mcp": {
        "tool": "mis_get_tally_tds_check",
        "description": "TDS check over the stored Day Books: every purchase / journal / payment voucher that books an expense or fixed asset against a party, with the party's TDS nature (ledger master), the expense, the TDS booked on the voucher and the implied rate; flags 'no TDS booked' and 'party has no TDS nature'. Lists, does not judge thresholds: apply 194C / 194J / 194I / 194H / 194Q limits when reading it.",
        "access": "read",
        "input": {
          "type": "object",
          "properties": {
            "from": {
              "type": "string",
              "description": "YYYY-MM (default: April of this financial year)"
            },
            "to": {
              "type": "string",
              "description": "YYYY-MM (default: newest stored month)"
            },
            "min": {
              "type": "integer",
              "minimum": 0,
              "description": "Skip vouchers below this expense ₹"
            }
          }
        },
        "returns": "rows[] + summary + months + missingMonths"
      }
    },
    {
      "id": "tally-stock-items",
      "method": "GET",
      "path": "/api/tally/books/stock-items?q=<q>",
      "auth": "session",
      "purpose": "Tally stock item masters",
      "mcp": {
        "tool": "mis_get_tally_stock_items",
        "description": "Tally stock item masters: name, stock group, unit, HSN and GST rate, with a count of items with no HSN. Use for GST classification and stock / BOM checks.",
        "access": "read",
        "input": {
          "type": "object",
          "properties": {
            "q": {
              "type": "string",
              "description": "Search word in name, group or HSN"
            }
          }
        },
        "returns": "rows[] + total + noHsn + asOf"
      }
    },
    {
      "id": "tally-health",
      "method": "GET",
      "path": "/api/tally/books/health?months=<months>",
      "auth": "session",
      "purpose": "Tally book health",
      "mcp": {
        "tool": "mis_get_books_health",
        "description": "Tally health checks over recent months: wrong groups, missing narrations, odd vouchers, with how to fix each in TallyPrime.",
        "access": "read",
        "input": {
          "type": "object",
          "properties": {
            "months": {
              "type": "integer",
              "minimum": 1,
              "maximum": 12
            }
          }
        },
        "returns": "Checks with fixes"
      }
    },
    {
      "id": "ai-usage",
      "method": "GET",
      "path": "/api/ai/usage?months=<months>",
      "auth": "session",
      "purpose": "This portal's Claude / Gemini API spend per month (its own usage ledger)",
      "mcp": {
        "tool": "mis_get_ai_usage",
        "description": "Use for 'what does the MIS spend on AI / Claude / Gemini': ₹ and US$ per month by vendor, model and purpose, from the portal's own usage ledger. For the whole company use heatronics_spend on the master portal.",
        "access": "read",
        "input": { "type": "object", "properties": { "months": { "type": "integer", "minimum": 1, "maximum": 24, "description": "How many months back, default 6" } } },
        "returns": "months[] newest first with usd / inr / calls and vendors, models, purposes"
      }
    },
    {
      "id": "cash-runway",
      "method": "GET",
      "path": "/api/cash/runway",
      "auth": "session",
      "purpose": "13-week net cash runway in three cases from the stored Tally books, with the day cash goes below zero or hits the overdraft limit",
      "mcp": {
        "tool": "mis_get_cash_runway",
        "description": "Use for 'how long does our cash last', 'when do we hit the overdraft limit', 'will we run out of cash': net cash today, 13 weekly points for the usual / worst-month / best-month cases, the week each case goes below zero or reaches the overdraft limit, and a one-line verdict. Stored books only; moves net cash (bank − overdraft) at the last whole months' pattern (net of new loans; a running month or books copied < 5 days after month end never count). Not a sales forecast.",
        "access": "read",
        "input": { "type": "object", "properties": {} },
        "returns": "status, line, netCash, odLimit, cases[] (perMonth, zeroOn, limitOn, low, end), weeks[] (base, hard, easy)"
      }
    },
    {
      "id": "morning-brief",
      "method": "GET",
      "path": "/api/today",
      "auth": "session",
      "purpose": "The morning page: what needs the founder today, five key numbers, what moved since yesterday, what is due soon",
      "mcp": {
        "tool": "mis_get_morning_brief",
        "description": "Use for 'what needs me today', 'morning brief', 'what changed since yesterday' on the books side: status (act / watch / ok), 5 tiles (net cash, months of cash, sales, items to fix, late tasks), the top things that need you with why and where, what is due soon, and what changed vs the last saved day. Stored data only, no AI.",
        "access": "read",
        "input": { "type": "object", "properties": {} },
        "returns": "status, statusLine, tiles[], needsYou[], dueSoon[], changed[], freshness"
      }
    },
    {
      "id": "margin-bridge",
      "method": "GET",
      "path": "/api/mis/bridge?month=<month>",
      "auth": "session",
      "purpose": "Why the month's EBITDA moved: contribution bridge vs last month and last year, saved by the Live MIS page",
      "mcp": {
        "tool": "mis_get_margin_bridge",
        "description": "Use for 'why did profit / EBITDA move' or 'what changed vs last month': the saved Live MIS bridge for a month: EBITDA change in ₹ lakh split into volume, price and mix, channel mix, returns, BOM cost, stock timing, factory, channel fees, ads (by platform), payment fees and opex, plus the top 3 reasons, vs last month and vs the same month last year. Saved when someone opens Live MIS, so check asOf; null = no bridge saved or not enough data.",
        "access": "read",
        "input": { "type": "object", "properties": { "month": { "type": "string", "description": "YYYY-MM, default the newest saved" } } },
        "returns": "month, asOf, previous{steps[], reasons[], delta} and lastYear{...}; null when none"
      }
    }
  ],
  "consumes": [
    {
      "portal": "portal",
      "api": "auth-check",
      "purpose": "Login check"
    },
    {
      "portal": "production",
      "api": "product-costs",
      "purpose": "Product costs for Amazon price floors"
    },
    {
      "portal": "warranty",
      "api": "delhivery-shipments",
      "purpose": "Delhivery AWBs of the month for the computed freight close slot"
    }
  ],
  "external": [
    "Anthropic",
    "Google Drive / Sheets",
    "Cloud Storage",
    "Secret Manager",
    "Zoho SMTP",
    "Resend",
    "Mailgun",
    "Amazon SP-API",
    "Amazon Ads",
    "Meta Graph",
    "Google Ads",
    "Shopify",
    "Shiprocket",
    "Easebuzz",
    "Delhivery",
    "Tally"
  ]
} as const;
