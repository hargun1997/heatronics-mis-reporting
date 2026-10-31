// ----------------------------------------------------------------------------
// Shared integration secrets — the same Secret Manager entries Ops
// (heatronics-ops) and the other *.heatronics.in services read.
//
// Every Heatronics Cloud Run service runs as the project's default compute
// account, which already has secretAccessor on these. So the MIS picks them up
// with no setup: a connector that has nothing saved on the Connectors page
// fills its fields from here. Precedence (lowest → highest):
//   value saved on the Connectors page  <  shared secret  <  CONNECTOR_<ID>_<FIELD> env
//
// Values never leave the server; the routes only report whether a field is set.
// A missing or unreadable secret just leaves that field blank.
// ----------------------------------------------------------------------------

import type { Credentials } from './types.js';

/** connector id → credential field → Secret Manager secret name (or a fixed default). */
const SHARED: Record<string, Record<string, { secret?: string; fallback?: string }>> = {
  amazon: {
    lwaClientId: { secret: 'spapi-lwa-client-id' },
    lwaClientSecret: { secret: 'spapi-lwa-client-secret' },
    refreshToken: { secret: 'spapi-refresh-token-in' },
  },
  amazonads: {
    clientId: { secret: 'adsapi-lwa-client-id' },
    clientSecret: { secret: 'adsapi-lwa-client-secret' },
    refreshToken: { secret: 'adsapi-refresh-token-in' },
  },
  googleads: {
    developerToken: { secret: 'google-ads-developer-token' },
    clientId: { secret: 'google-ads-client-id' },
    clientSecret: { secret: 'google-ads-client-secret' },
    refreshToken: { secret: 'google-ads-refresh-token' },
    // Ops' Setup default for the Heatronics Google Ads account; the secret overrides it.
    customerId: { secret: 'google-ads-customer-id', fallback: '4927002413' },
    loginCustomerId: { secret: 'google-ads-login-customer-id' },
  },
  meta: {
    accessToken: { secret: 'meta-access-token' },
    adAccountId: { secret: 'meta-ad-account-id' },
  },
  flipkart: {
    appId: { secret: 'flipkart-app-id' },
    appSecret: { secret: 'flipkart-app-secret' },
  },
  shiprocket: {
    email: { secret: 'shiprocket-email' },
    password: { secret: 'shiprocket-password' },
  },
};

/** Which connectors can be fed from shared secrets (for the console badge). */
export const hasSharedSource = (id: string) => id in SHARED;

const META = 'http://metadata.google.internal/computeMetadata/v1';
const FALLBACK_PROJECT = 'gen-lang-client-0101319357';

async function metadata(path: string): Promise<Response | null> {
  try {
    return await fetch(`${META}/${path}`, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(1500) });
  } catch {
    return null; // not on GCP
  }
}

let tok: { value: string; exp: number } | null = null;
async function accessToken(): Promise<string | null> {
  if (process.env.GCP_ACCESS_TOKEN) return process.env.GCP_ACCESS_TOKEN; // local testing only
  if (tok && Date.now() < tok.exp - 60_000) return tok.value;
  const r = await metadata('instance/service-accounts/default/token');
  if (!r?.ok) return null;
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  tok = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 300) * 1000 };
  return tok.value;
}

let project: string | null = null;
async function projectId(): Promise<string> {
  if (project) return project;
  const env = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (env) return (project = env);
  const r = await metadata('project/project-id');
  if (r?.ok) return (project = (await r.text()).trim());
  return (project = FALLBACK_PROJECT);
}

const cache = new Map<string, { v: string | null; at: number }>();
const TTL_MS = 5 * 60_000; // a rotated secret is picked up within 5 min, no redeploy

/** Read one shared secret: env NAME_IN_CAPS first, then Secret Manager (latest). Null when absent. */
export async function sharedSecret(name: string): Promise<string | null> {
  const env = process.env[name.toUpperCase().replace(/-/g, '_')];
  if (env) return env;
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  let v: string | null = null;
  const t = await accessToken();
  if (t) {
    try {
      const r = await fetch(
        `https://secretmanager.googleapis.com/v1/projects/${await projectId()}/secrets/${name}/versions/latest:access`,
        { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(5000) },
      );
      if (r.ok) {
        const j = (await r.json()) as { payload?: { data?: string } };
        v = j.payload?.data ? Buffer.from(j.payload.data, 'base64').toString('utf8').trim() || null : null;
      }
    } catch {
      v = null;
    }
  }
  cache.set(name, { v, at: Date.now() });
  return v;
}

/** The fields this connector can fill from shared secrets right now. */
export async function sharedCredentials(id: string): Promise<Credentials> {
  const spec = SHARED[id];
  if (!spec) return {};
  const entries = await Promise.all(
    Object.entries(spec).map(async ([field, s]) => [field, s.secret ? await sharedSecret(s.secret) : null, s.fallback] as const),
  );
  // Fixed defaults only count once at least one real secret exists, so an
  // unconfigured source still reads as "not connected".
  if (!entries.some(([, v]) => v)) return {};
  const out: Credentials = {};
  for (const [field, v, fallback] of entries) {
    const val = v || fallback;
    if (val) out[field] = val;
  }
  return out;
}
