// Public API list for the portal's Systems map (portal.heatronics.in/systems), served at
// GET /.well-known/portal.json. Keep it in step with the routes; never put secret names or values here.
export const portalManifest = {
  "schema": 1,
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
    "Tally"
  ]
} as const;
