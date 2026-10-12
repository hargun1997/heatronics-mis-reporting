// ----------------------------------------------------------------------------
// Connector registry — one entry per live source.
//
// Tally and Shopify are wired end to end. The other nine are scaffolded: they
// declare exactly the credentials their auth needs and store them, but their
// monthly pull is not built yet, so fetchPeriod throws NotImplementedError and
// the UI shows "saved · pull pending". This lets the tokens be entered and the
// console be complete now, with each pull filled in as it is built and
// validated against a real month — the same path the file adapters took.
// ----------------------------------------------------------------------------

import type { ConnectorDef, CredentialField, ConnectorGroup, Credentials, FetchMode } from './types.js';
import { NotImplementedError } from './types.js';
import tally from './sources/tally.js';
import shopify from './sources/shopify.js';

interface ScaffoldSpec {
  id: string;
  label: string;
  group: ConnectorGroup;
  fetchMode: FetchMode;
  note: string;
  credentialFields: CredentialField[];
}

/** Build a credentials-only connector whose pull is not wired yet. */
function scaffold(spec: ScaffoldSpec): ConnectorDef {
  const required = spec.credentialFields.filter((f) => !f.optional).map((f) => f.key);
  return {
    ...spec,
    implemented: false,
    async test(creds: Credentials) {
      const missing = required.filter((k) => !(creds[k] || '').trim());
      if (missing.length > 0) {
        return { ok: false, detail: `Missing: ${missing.join(', ')}.` };
      }
      return {
        ok: true,
        detail: 'Credentials saved. Live verification and monthly pull for this source are not wired yet.',
      };
    },
    async fetchPeriod(): Promise<never> {
      throw new NotImplementedError(spec.label);
    },
  };
}

const amazon = scaffold({
  id: 'amazon',
  label: 'Amazon Seller Central',
  group: 'marketplace',
  fetchMode: 'api',
  note: 'Amazon SP-API. The month lives in the finance/settlement reports; advertising is a separate Ads API. Pull feeds SkuRow[] and a net-revenue cross-check.',
  credentialFields: [
    { key: 'lwaClientId', label: 'LWA client ID', type: 'text', placeholder: 'amzn1.application-oa2-client.…', help: 'Login with Amazon app client ID from the SP-API app.' },
    { key: 'lwaClientSecret', label: 'LWA client secret', type: 'password' },
    { key: 'refreshToken', label: 'Refresh token', type: 'password', placeholder: 'Atzr|…', help: 'From authorising the SP-API app on the seller account.' },
    { key: 'marketplaceId', label: 'Marketplace ID', type: 'text', placeholder: 'A21TJRUUN4KGV', optional: true, help: 'India = A21TJRUUN4KGV.' },
    { key: 'region', label: 'Region endpoint', type: 'text', placeholder: 'eu-west-1', optional: true, help: 'India sits on the EU endpoint (eu-west-1).' },
  ],
});

const flipkart = scaffold({
  id: 'flipkart',
  label: 'Flipkart Seller',
  group: 'marketplace',
  fetchMode: 'api',
  note: 'Flipkart Seller API. Client-credentials OAuth (app id + secret → token). Pull feeds SkuRow[] and settlement/commission cross-checks.',
  credentialFields: [
    { key: 'appId', label: 'Application ID', type: 'text', help: 'Flipkart Seller API app credentials.' },
    { key: 'appSecret', label: 'Application secret', type: 'password' },
  ],
});

const blinkit = scaffold({
  id: 'blinkit',
  label: 'Blinkit (Quick Commerce)',
  group: 'marketplace',
  fetchMode: 'file',
  note: 'Blinkit has no open pull API — the month comes from the payout ZIP (order-charges workbook). Credentials here are for a brand-portal token if/when one is available; otherwise use the payout upload.',
  credentialFields: [
    { key: 'apiToken', label: 'Brand portal token', type: 'password', optional: true, help: 'Optional — leave blank and use the payout ZIP upload.' },
  ],
});

const shiprocket = scaffold({
  id: 'shiprocket',
  label: 'Shiprocket',
  group: 'logistics',
  fetchMode: 'api',
  note: 'Shiprocket API. Email + password mint a JWT. Pull feeds freight outward and RTO; it carries no SKU, so it lands on freight, not products.',
  credentialFields: [
    { key: 'email', label: 'API user email', type: 'text', help: 'A dedicated Shiprocket API user is recommended.' },
    { key: 'password', label: 'API user password', type: 'password' },
  ],
});

const delhivery = scaffold({
  id: 'delhivery',
  label: 'Delhivery',
  group: 'logistics',
  fetchMode: 'api',
  note: 'Delhivery API. Token per client/warehouse. Pull feeds outbound freight billing and RTO/NDR.',
  credentialFields: [
    { key: 'apiToken', label: 'API token', type: 'password', help: 'Delhivery One → Settings → API.' },
    { key: 'clientName', label: 'Client / warehouse name', type: 'text', optional: true },
  ],
});

const easebuzz = scaffold({
  id: 'easebuzz',
  label: 'Easebuzz',
  group: 'payments',
  fetchMode: 'api',
  note: 'Easebuzz payment gateway. Merchant key + salt. Pull feeds payment-gateway fees and cash/settlement reconciliation against D2C.',
  credentialFields: [
    { key: 'merchantKey', label: 'Merchant key', type: 'text' },
    { key: 'salt', label: 'Salt', type: 'password' },
    { key: 'env', label: 'Environment', type: 'text', placeholder: 'prod', optional: true, help: 'prod or test. Default prod.' },
  ],
});

const snapmint = scaffold({
  id: 'snapmint',
  label: 'Snapmint (BNPL)',
  group: 'payments',
  fetchMode: 'file',
  note: 'Snapmint BNPL. Public pull API is thin — settlement comes by report/webhook. Pull feeds revenue-by-tender, subvention and finance cost.',
  credentialFields: [
    { key: 'merchantId', label: 'Merchant ID', type: 'text' },
    { key: 'apiKey', label: 'API key', type: 'password', optional: true },
  ],
});

const shopflo = scaffold({
  id: 'shopflo',
  label: 'Shopflo (Checkout)',
  group: 'payments',
  fetchMode: 'api',
  note: 'Shopflo checkout. API key/secret or webhook. Pull feeds revenue-by-tender, COD, discounts and checkout fees.',
  credentialFields: [
    { key: 'apiKey', label: 'API key', type: 'text' },
    { key: 'apiSecret', label: 'API secret', type: 'password' },
  ],
});

const tranzact = scaffold({
  id: 'tranzact',
  label: 'Tranzact (ERP / BOM)',
  group: 'book',
  fetchMode: 'api',
  note: 'Tranzact ERP. Pull feeds BomCost[] (standard cost per finished good) and stock movement — the per-unit COGS behind SKU margin.',
  credentialFields: [
    { key: 'apiToken', label: 'API token', type: 'password', help: 'Tranzact → Settings → API access.' },
  ],
});

// Display order: book of record first, then marketplaces, D2C, logistics, payments.
export const CONNECTORS: ConnectorDef[] = [
  tally,
  tranzact,
  amazon,
  flipkart,
  blinkit,
  shopify,
  shiprocket,
  delhivery,
  easebuzz,
  shopflo,
  snapmint,
];

const BY_ID = new Map(CONNECTORS.map((c) => [c.id, c]));

export function getConnector(id: string): ConnectorDef | undefined {
  return BY_ID.get(id);
}
