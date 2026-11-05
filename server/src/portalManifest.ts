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
