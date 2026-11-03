// Read-only SELECTs on Ops' BigQuery dataset (`ops`, asia-south1) with the Cloud Run identity (scope bigquery.readonly) —
// the same access opsAdsStore.ts uses. Every query passes assertSelectOnly.
import { assertSelectOnly } from './opsAdsStore.js';

const META = 'http://metadata.google.internal/computeMetadata/v1';
const SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly';
const PROJECT = 'gen-lang-client-0101319357';
const DATASET = process.env.OPS_BQ_DATASET || 'ops';
const LOCATION = 'asia-south1';

let tok: { value: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (process.env.GCP_ACCESS_TOKEN) return process.env.GCP_ACCESS_TOKEN; // local testing only
  if (tok && Date.now() < tok.exp - 60_000) return tok.value;
  let r: Response | null = null;
  try {
    r = await fetch(`${META}/instance/service-accounts/default/token?scopes=${encodeURIComponent(SCOPE)}`, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2000) });
  } catch { r = null; }
  if (!r?.ok) throw new Error('Not on Cloud Run — no service-account token for BigQuery.');
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  tok = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 300) * 1000 };
  return tok.value;
}

export async function opsQuery(sql: string, params: Record<string, string> = {}): Promise<Record<string, string | null>[]> {
  assertSelectOnly(sql);
  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: sql, useLegacySql: false, location: LOCATION, timeoutMs: 30_000,
      defaultDataset: { projectId: PROJECT, datasetId: DATASET }, parameterMode: 'NAMED',
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
