// ----------------------------------------------------------------------------
// Meta (Facebook/Instagram) Ads connector — daily ad spend via the Insights API.
//
// Feeds the Sales & Marketing line and the MER/ROAS metrics. Account-level
// spend per day is all the MIS needs; campaign/ad detail can be added later.
// ----------------------------------------------------------------------------

import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import { monthBounds } from '../types.js';
import { type ConnectorSource } from '../schema.js';
import type { DailyFact, FactResult } from '../facts.js';

// Same Graph version as Ops (META_GRAPH_VERSION overrides).
const API_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

function account(creds: Credentials): string {
  const raw = (creds.adAccountId || '').trim().replace(/^act_/, '');
  if (!raw) throw new Error('Meta adAccountId is required (the numeric Ad Account ID).');
  return `act_${raw}`;
}
function token(creds: Credentials): string {
  const t = (creds.accessToken || '').trim();
  if (!t) throw new Error('Meta access token is required.');
  return t;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const meta: ConnectorDef = {
  id: 'meta',
  label: 'Meta Ads',
  group: 'marketing',
  fetchMode: 'api',
  mode: 'manual-upload',
  implemented: true,
  credentialFields: [
    {
      key: 'accessToken',
      label: 'Access token',
      type: 'password',
      placeholder: 'EAAB…',
      help: 'A long-lived System User token with ads_read on the ad account.',
    },
    {
      key: 'adAccountId',
      label: 'Ad Account ID',
      type: 'text',
      placeholder: '1234567890',
      help: 'Ads Manager → Account Settings. Numbers only; the act_ prefix is added for you.',
    },
  ],
  note: 'Daily account-level ad spend → Sales & Marketing and MER/ROAS. Long-lived System User token recommended so it does not expire.',

  async test(creds: Credentials): Promise<TestResult> {
    const url = `${BASE}/${account(creds)}?fields=account_id,name&access_token=${encodeURIComponent(token(creds))}`;
    const res = await fetch(url);
    if (res.ok) {
      const b = (await res.json()) as { name?: string };
      return { ok: true, detail: `Connected to ${b.name ?? 'ad account'}.` };
    }
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, detail: body.error?.message || `Meta returned ${res.status}.` };
  },

  async fetchFacts(creds: Credentials, fromISO: string, toISO: string): Promise<FactResult> {
    const facts: DailyFact[] = [];
    const warnings: string[] = [];
    const timeRange = encodeURIComponent(JSON.stringify({ since: fromISO, until: toISO }));
    let url: string | null =
      `${BASE}/${account(creds)}/insights?fields=spend&level=account&time_increment=1` +
      `&time_range=${timeRange}&limit=500&access_token=${encodeURIComponent(token(creds))}`;

    let pages = 0;
    while (url && pages < 50) {
      const res = await fetch(url);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(`Meta insights failed (${res.status}): ${body.error?.message ?? ''}`);
      }
      const body = (await res.json()) as {
        data?: { date_start?: string; spend?: string }[];
        paging?: { next?: string };
      };
      for (const row of body.data ?? []) {
        const date = (row.date_start ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        facts.push({
          source: 'meta',
          channel: 'Meta Ads',
          date,
          revenue: 0,
          units: 0,
          orders: 0,
          fees: 0,
          spend: num(row.spend),
        });
      }
      url = body.paging?.next ?? null;
      pages += 1;
    }
    const dates = facts.map((f) => f.date).sort();
    const trace = [
      `Authenticated to ${account(creds)}`,
      `Called Insights API (account-level, daily) ${fromISO}→${toISO} across ${pages} page(s)`,
      `Extracted ${facts.length} daily spend facts${dates.length ? ` spanning ${dates[0]} → ${dates[dates.length - 1]}` : ''}`,
    ];
    return { facts, warnings, trace };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const { startISO, endISO } = monthBounds(periodKey);
    const { facts, warnings } = await this.fetchFacts!(creds, startISO.slice(0, 10), endISO.slice(0, 10));
    const spend = facts.reduce((a, f) => a + (f.spend ?? 0), 0);
    const source: ConnectorSource = {
      label: `Meta ad spend ${periodKey}`,
      kind: 'adSpend',
      method: 'connector',
      nodes: [],
      skuRows: [],
      bomCosts: [],
      crossChecks: [
        {
          label: 'Meta ad spend',
          amount: Math.round(spend * 100) / 100,
          against: 'sm_total',
          note: 'Holds against the booked Sales & Marketing total.',
        },
      ],
      warnings,
    };
    return { sources: [source], warnings };
  },
};

export default meta;
