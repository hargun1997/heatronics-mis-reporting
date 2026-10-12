// ----------------------------------------------------------------------------
// Amazon Ads connector — Sponsored Ads spend.
//
// Separate from Seller SP-API: its own LWA app and profile. The connection and
// profile lookup are wired; the daily-spend pull uses the v3 reporting API,
// which is asynchronous (request report → poll → download a gzipped file), and
// is the next step — so fetchFacts is not wired yet.
// ----------------------------------------------------------------------------

import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import { NotImplementedError } from '../types.js';

// India Advertising sits on the EU endpoint, like Seller SP-API.
const REGION_HOSTS: Record<string, string> = {
  na: 'https://advertising-api.amazon.com',
  eu: 'https://advertising-api-eu.amazon.com',
  fe: 'https://advertising-api-fe.amazon.com',
};

async function lwaToken(creds: Credentials): Promise<string> {
  const clientId = (creds.clientId || '').trim();
  const clientSecret = (creds.clientSecret || '').trim();
  const refreshToken = (creds.refreshToken || '').trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Amazon Ads needs clientId, clientSecret and refreshToken.');
  }
  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Amazon LWA failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('Amazon LWA returned no access_token.');
  return body.access_token;
}

const amazonAds: ConnectorDef = {
  id: 'amazonads',
  label: 'Amazon Ads',
  group: 'marketing',
  fetchMode: 'api',
  mode: 'live-api',
  implemented: false,
  credentialFields: [
    { key: 'clientId', label: 'LWA client ID', type: 'text', placeholder: 'amzn1.application-oa2-client.…' },
    { key: 'clientSecret', label: 'LWA client secret', type: 'password' },
    { key: 'refreshToken', label: 'Refresh token', type: 'password', placeholder: 'Atzr|…' },
    { key: 'profileId', label: 'Profile ID', type: 'text', help: 'The advertising profile for the marketplace (from the profiles call).' },
    { key: 'region', label: 'Region', type: 'text', placeholder: 'eu', optional: true, help: 'na / eu / fe. India = eu. Default eu.' },
  ],
  note: 'Sponsored Ads spend → Sales & Marketing and MER/ROAS. Connection + profile lookup are wired; the daily-spend pull (async v3 reporting API) is the next step.',

  async test(creds: Credentials): Promise<TestResult> {
    const token = await lwaToken(creds);
    const host = REGION_HOSTS[(creds.region || 'eu').trim().toLowerCase()] ?? REGION_HOSTS.eu;
    const res = await fetch(`${host}/v2/profiles`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Amazon-Advertising-API-ClientId': (creds.clientId || '').trim(),
      },
    });
    if (res.ok) {
      const profiles = (await res.json()) as { profileId?: number }[];
      return { ok: true, detail: `Connected — ${profiles.length} advertising profile(s) visible.` };
    }
    return { ok: false, detail: `Amazon Ads returned ${res.status}.` };
  },

  async fetchPeriod(): Promise<FetchResult> {
    throw new NotImplementedError('Amazon Ads');
  },
};

export default amazonAds;
