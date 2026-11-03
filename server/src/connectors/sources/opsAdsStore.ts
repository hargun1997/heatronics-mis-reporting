// ----------------------------------------------------------------------------
// Amazon Ads from Ops' stored reports (BigQuery dataset `ops`, asia-south1).
//
// Ops (ops.heatronics.in) already pulls the same reporting-v3 reports every day
// (spAdvertisedProduct → ads_sp_product, sbCampaigns → ads_sb_campaign,
// sdCampaigns → ads_sd_campaign; one row per profile × day × ad, each load
// replacing its profile + date range, so plain sums are correct). Reading them
// avoids waiting on Amazon to prepare a fresh month-long report, which can sit
// "pending" for hours. Same Cloud Run identity as Ops, so no secret.
//
// READ ONLY: one SELECT through jobs.query (asserted: no DML / DDL).
// ----------------------------------------------------------------------------

import type { AdvertisedProductRow } from '../slots/map/ads.js';

const META = 'http://metadata.google.internal/computeMetadata/v1';
const SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly';
const PROJECT = 'gen-lang-client-0101319357';
const DATASET = process.env.OPS_BQ_DATASET || 'ops';
const LOCATION = 'asia-south1';

export function assertSelectOnly(sql: string): void {
  const s = sql.replace(/--[^\n]*/g, ' ').trim();
  if (!/^(with|select)\b/i.test(s) || /\b(insert|update|delete|merge|create|drop|alter|truncate|grant|revoke|call|export|load)\b/i.test(s)) {
    throw new Error('Blocked: only a SELECT may be sent to BigQuery.');
  }
}

let tok: { value: string; exp: number } | null = null;
async function bqToken(): Promise<string> {
  if (process.env.GCP_ACCESS_TOKEN) return process.env.GCP_ACCESS_TOKEN; // local testing only
  if (tok && Date.now() < tok.exp - 60_000) return tok.value;
  let r: Response | null = null;
  try {
    r = await fetch(`${META}/instance/service-accounts/default/token?scopes=${encodeURIComponent(SCOPE)}`, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    r = null;
  }
  if (!r?.ok) throw new Error('Not on Cloud Run — no service-account token for BigQuery.');
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  tok = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 300) * 1000 };
  return tok.value;
}

/** One read-only SELECT against Ops' BigQuery dataset (shared by every Ops-store reader). */
export async function opsQuery(sql: string, params: Record<string, string>): Promise<Record<string, string | null>[]> {
  assertSelectOnly(sql);
  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await bqToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      location: LOCATION,
      timeoutMs: 30_000,
      defaultDataset: { projectId: PROJECT, datasetId: DATASET },
      parameterMode: 'NAMED',
      queryParameters: Object.entries(params).map(([name, value]) => ({ name, parameterType: { type: 'STRING' }, parameterValue: { value } })),
    }),
    signal: AbortSignal.timeout(40_000),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`BigQuery ${res.status}: ${String(j?.error?.message || '').slice(0, 200)}`);
  if (!j.jobComplete) throw new Error('BigQuery did not finish in 30 s.');
  const names: string[] = (j.schema?.fields || []).map((f: any) => f.name);
  return (j.rows || []).map((r: any) => Object.fromEntries(names.map((n, i) => [n, r.f[i]?.v ?? null])));
}

export interface OpsAdsMonth {
  spRows: AdvertisedProductRow[];
  channel: { SB: number; SD: number };
  /** Last day each table holds (any month), null = table empty. */
  through: { SP: string | null; SB: string | null; SD: string | null };
  profiles: number;
}

/** The month's SP advertised-product rows and SB / SD spend, as Ops stored them. */
export async function opsAdsMonth(from: string, to: string): Promise<OpsAdsMonth> {
  const p = { from, to };
  const [sp, tot, thr] = await Promise.all([
    opsQuery(
      `SELECT CAST(date AS STRING) AS date, sku, asin, SUM(cost) AS cost
         FROM ads_sp_product WHERE date BETWEEN DATE(@from) AND DATE(@to) GROUP BY 1, 2, 3`, p),
    opsQuery(
      `SELECT 'SB' AS t, SUM(cost) AS cost, COUNT(DISTINCT profile_id) AS n FROM ads_sb_campaign WHERE date BETWEEN DATE(@from) AND DATE(@to)
       UNION ALL SELECT 'SD', SUM(cost), COUNT(DISTINCT profile_id) FROM ads_sd_campaign WHERE date BETWEEN DATE(@from) AND DATE(@to)
       UNION ALL SELECT 'SP', SUM(cost), COUNT(DISTINCT profile_id) FROM ads_sp_product WHERE date BETWEEN DATE(@from) AND DATE(@to)`, p),
    opsQuery(
      `SELECT 'SP' AS t, CAST(MAX(date) AS STRING) AS d FROM ads_sp_product
       UNION ALL SELECT 'SB', CAST(MAX(date) AS STRING) FROM ads_sb_campaign
       UNION ALL SELECT 'SD', CAST(MAX(date) AS STRING) FROM ads_sd_campaign`, {}),
  ]);
  const by = (rows: Record<string, string | null>[], k: string) => rows.find((r) => r.t === k);
  return {
    spRows: sp.map((r) => ({ date: r.date ?? undefined, advertisedSku: r.sku ?? undefined, advertisedAsin: r.asin ?? undefined, cost: Number(r.cost) || 0 })),
    channel: { SB: Number(by(tot, 'SB')?.cost) || 0, SD: Number(by(tot, 'SD')?.cost) || 0 },
    through: { SP: by(thr, 'SP')?.d ?? null, SB: by(thr, 'SB')?.d ?? null, SD: by(thr, 'SD')?.d ?? null },
    profiles: Math.max(...tot.map((r) => Number(r.n) || 0), 0),
  };
}
