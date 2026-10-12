// ----------------------------------------------------------------------------
// Credential store — where live-source tokens live, server-side only.
//
// Secret Manager is used automatically whenever the app runs on GCP and can
// reach it: the project is auto-detected (env var or the metadata server), and
// a Save creates/updates one secret per connector (heatronics-connector-<id>)
// over the API — no manual env vars, no console work per token. The ONE thing
// that cannot be automated is granting the runtime service account permission
// to manage secrets: a service cannot grant itself IAM. So when Secret Manager
// is not yet accessible the store falls back to a temporary /tmp file (the only
// writable path on Cloud Run) and reports the exact service account + role to
// grant, after which it upgrades itself with no redeploy.
//
// Nothing here ever returns to the browser. The routes expose only whether a
// connector has credentials, never the values.
// ----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Credentials } from './types.js';

const LOCAL_FILE =
  process.env.CONNECTOR_STORE_FILE ||
  path.join(os.tmpdir(), 'heatronics-connector-credentials.json');

const SECRET_PREFIX = 'heatronics-connector-';
const secretName = (id: string) => `${SECRET_PREFIX}${id}`;

interface Backend {
  get(id: string): Promise<Credentials | null>;
  set(id: string, creds: Credentials): Promise<void>;
  remove(id: string): Promise<void>;
}

// ---- Local file backend ----------------------------------------------------

const fileBackend: Backend = {
  async get(id) {
    const all = await readFile();
    return all[id] ?? null;
  },
  async set(id, creds) {
    const all = await readFile();
    all[id] = creds;
    await writeFile(all);
  },
  async remove(id) {
    const all = await readFile();
    delete all[id];
    await writeFile(all);
  },
};

async function readFile(): Promise<Record<string, Credentials>> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, 'utf8');
    return JSON.parse(raw) as Record<string, Credentials>;
  } catch {
    return {};
  }
}

async function writeFile(all: Record<string, Credentials>): Promise<void> {
  await fs.writeFile(LOCAL_FILE, JSON.stringify(all, null, 2), { mode: 0o600 });
}

// ---- GCP metadata detection ------------------------------------------------
//
// On Cloud Run the project id and the runtime service account are available
// from the metadata server, so neither has to be configured by hand.

async function metadata(suffix: string): Promise<string> {
  try {
    const res = await fetch(`http://metadata.google.internal/computeMetadata/v1/${suffix}`, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) return (await res.text()).trim();
  } catch {
    // Not on GCP, or metadata unreachable — treat as absent.
  }
  return '';
}

async function detectProject(): Promise<string> {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    (await metadata('project/project-id'))
  );
}

async function detectServiceAccount(): Promise<string> {
  return metadata('instance/service-accounts/default/email');
}

// ---- Secret Manager backend ------------------------------------------------
//
// The SDK is imported lazily so the server starts without the package or GCP
// credentials present.

function secretManagerBackend(project: string): Backend {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let clientPromise: Promise<any> | null = null;
  const getClient = async () => {
    if (!clientPromise) {
      clientPromise = import('@google-cloud/secret-manager').then(
        (m) => new m.SecretManagerServiceClient(),
      );
    }
    return clientPromise;
  };

  const parent = `projects/${project}`;

  return {
    async get(id) {
      const client = await getClient();
      const name = `${parent}/secrets/${secretName(id)}/versions/latest`;
      try {
        const [version] = await client.accessSecretVersion({ name });
        const payload = version.payload?.data?.toString();
        return payload ? (JSON.parse(payload) as Credentials) : null;
      } catch (err: unknown) {
        if (isNotFound(err)) return null; // no credentials saved yet
        throw err;
      }
    },
    async set(id, creds) {
      const client = await getClient();
      const secretId = secretName(id);
      try {
        await client.createSecret({
          parent,
          secretId,
          secret: { replication: { automatic: {} } },
        });
      } catch (err: unknown) {
        if (!isAlreadyExists(err)) throw err; // already exists → just add a version
      }
      await client.addSecretVersion({
        parent: `${parent}/secrets/${secretId}`,
        payload: { data: Buffer.from(JSON.stringify(creds), 'utf8') },
      });
    },
    async remove(id) {
      const client = await getClient();
      try {
        await client.deleteSecret({ name: `${parent}/secrets/${secretName(id)}` });
      } catch (err: unknown) {
        if (!isNotFound(err)) throw err;
      }
    },
  };
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 5;
}
function isAlreadyExists(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 6;
}
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---- Backend resolution ----------------------------------------------------

interface Resolved {
  backend: Backend;
  name: 'secret-manager' | 'local-file';
  project: string;
  serviceAccount: string;
  /** Set when Secret Manager was expected but is not usable yet. */
  secretManagerError?: string;
}

let resolvedPromise: Promise<Resolved> | null = null;

function resolveStore(): Promise<Resolved> {
  if (!resolvedPromise) {
    resolvedPromise = (async () => {
      const [project, serviceAccount] = await Promise.all([detectProject(), detectServiceAccount()]);
      if (project) {
        const sm = secretManagerBackend(project);
        try {
          // Read probe: NOT_FOUND means we can reach Secret Manager (just no
          // secret yet); a permission / API-disabled error throws and we fall back.
          await sm.get('__healthprobe__');
          return { backend: sm, name: 'secret-manager' as const, project, serviceAccount };
        } catch (err) {
          return {
            backend: fileBackend,
            name: 'local-file' as const,
            project,
            serviceAccount,
            secretManagerError: errMsg(err),
          };
        }
      }
      return { backend: fileBackend, name: 'local-file' as const, project: '', serviceAccount };
    })();
  }
  return resolvedPromise;
}

/** Forget the cached resolution so a newly granted permission is picked up
 *  without a redeploy (the next op re-probes). */
export function refreshStore(): void {
  resolvedPromise = null;
}

// ---- Public API ------------------------------------------------------------

export async function getCredentials(id: string): Promise<Credentials | null> {
  return (await resolveStore()).backend.get(id);
}

export async function saveCredentials(id: string, creds: Credentials): Promise<void> {
  const r = await resolveStore();
  try {
    await r.backend.set(id, creds);
  } catch (err) {
    // Read access but no write permission (needs roles/secretmanager.admin):
    // downgrade this session to the temp file so the save still succeeds, and
    // record why, so the UI can show the one grant that makes it durable.
    if (r.name === 'secret-manager') {
      r.backend = fileBackend;
      r.name = 'local-file';
      r.secretManagerError = errMsg(err);
      await fileBackend.set(id, creds);
      return;
    }
    throw err;
  }
}

export async function removeCredentials(id: string): Promise<void> {
  return (await resolveStore()).backend.remove(id);
}

/**
 * Credentials provided as environment variables on the service — an alternative
 * durable home that needs no IAM grant. Naming: CONNECTOR_<ID>_<FIELD>, e.g.
 * CONNECTOR_SHOPIFY_CLIENTID. Env always wins over the stored value.
 */
export function envCredentials(id: string, fieldKeys: string[]): Credentials {
  const out: Credentials = {};
  for (const key of fieldKeys) {
    const envName = `CONNECTOR_${id.toUpperCase()}_${key.toUpperCase()}`;
    const v = process.env[envName];
    if (v != null && v !== '') out[key] = v;
  }
  return out;
}

export async function getEffectiveCredentials(
  id: string,
  fieldKeys: string[],
): Promise<Credentials> {
  const stored = (await getCredentials(id)) ?? {};
  return { ...stored, ...envCredentials(id, fieldKeys) };
}

export interface StoreStatus {
  /** Which store is actually in use right now. */
  backend: 'secret-manager' | 'local-file';
  /** True when saves persist across restarts and redeploys. */
  durable: boolean;
  project: string;
  serviceAccount: string;
  /** Why Secret Manager is not active, when it was expected. */
  secretManagerError: string | null;
  /** The one-line grant that makes the store durable, when applicable. */
  grantHint: string | null;
}

export async function storeStatus(): Promise<StoreStatus> {
  const r = await resolveStore();
  const durable = r.name === 'secret-manager';
  let grantHint: string | null = null;
  if (!durable && r.project && r.serviceAccount) {
    grantHint =
      `gcloud projects add-iam-policy-binding ${r.project} ` +
      `--member=serviceAccount:${r.serviceAccount} --role=roles/secretmanager.admin`;
  }
  return {
    backend: r.name,
    durable,
    project: r.project,
    serviceAccount: r.serviceAccount,
    secretManagerError: r.secretManagerError ?? null,
    grantHint,
  };
}
