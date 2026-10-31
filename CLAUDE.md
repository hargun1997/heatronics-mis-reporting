# heatronics-mis-reporting

## Login
Every page and API needs a Heatronics login. server/src/htxGate.ts (mounted in server/src/index.ts) asks the master portal
(`https://portal.heatronics.in/api/auth/check?portal=mis`) whether the visitor's `htx_session`
cookie may open this tool (cached 60s), and otherwise redirects to the portal's login or "no access"
page (APIs get 401/403 JSON). The `.run.app` address redirects to mis.heatronics.in.
Who has access is managed at https://portal.heatronics.in/admin (Hargun only).
Endpoints that skip the login (machine callers with their own token): `/api/work/reminders/run`, `/api/ownership/reminders/run` (cron) and `/api/expenses` (read by production.heatronics.in, own token). Never add pages there.
Set `HTX_GATE=off` only for local testing; never on Cloud Run.


## Live connectors & shared secrets
- `server/src/connectors/sharedSecrets.ts`: connectors fill blank fields from the SAME Secret Manager entries Ops uses
  (project gen-lang-client-0101319357, read with the Cloud Run identity, 5-min cache): Amazon `spapi-lwa-client-id|secret`,
  `spapi-refresh-token-in`; Amazon Ads `adsapi-lwa-client-id|secret`, `adsapi-refresh-token-in`; Google Ads `google-ads-*`
  (customer default 4927002413); Meta `meta-access-token`, `meta-ad-account-id`; Flipkart `flipkart-app-id|secret`;
  Shiprocket `shiprocket-email|password`. Precedence: saved on the Connectors page < shared < `CONNECTOR_<ID>_<FIELD>` env (shared wins so a stale saved token never masks it).
  Never put values in code — this repo is public.
- Amazon Ads (`sources/amazonAds.ts`) and Flipkart (`sources/flipkart.ts`) are ports of Ops' clients and are READ ONLY
  (a guard runs before every request). Amazon Ads reports are async: a pull waits ≤ `AMAZON_ADS_WAIT_MS` (12 s), only asks for days
  Amazon keeps (SP 94 d, SB/SD 59 d) and finishes the rest in the background. Flipkart waits ≤ `FLIPKART_PULL_MS` (20 s),
  newest windows first. Both feed `/api/connectors/facts`, which the Live MIS page awaits on load — keep them fast. Flipkart has no fees in its API — the settlement upload stays for the close.
- API versions: `GOOGLE_ADS_API_VERSION` (default v25), `META_GRAPH_VERSION` (default v25.0), same env names as Ops.
- `/api/connectors/facts` runs every source in parallel. Upload slots stay (`mode: 'manual-upload'`) because the close still
  needs settlement fees and per-product ad splits the APIs don't give.
