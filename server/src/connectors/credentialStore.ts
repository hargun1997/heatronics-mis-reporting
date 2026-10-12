// ----------------------------------------------------------------------------
// Credential store — where live-source tokens live, server-side only.
//
// Two backends, chosen at runtime:
//   Secret Manager  when GOOGLE_CLOUD_PROJECT is set (Cloud Run). One secret
//                   per connector, named heatronics-connector-<id>, holding a
//                   JSON blob of that connector's fields.
//   local file      otherwise. A single gitignored JSON file for dev.
//
// Nothing here ever returns to the browser. The routes expose only whether a
// connector has credentials, never the values.
// ----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Credentials } from './types.js';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || '';
const LOCAL_FILE =
  process.env.CONNECTOR_STORE_FILE ||
  path.join(process.cwd(), '.connector-credentials.json');

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

// ---- Secret Manager backend ------------------------------------------------
//
// Imported lazily so the server starts (and dev runs) without the package or
// GCP credentials present.

function secretManagerBackend(): Backend {
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

  const parent = `projects/${PROJECT}`;

  return {
    async get(id) {
      const client = await getClient();
      const name = `${parent}/secrets/${secretName(id)}/versions/latest`;
      try {
        const [version] = await client.accessSecretVersion({ name });
        const payload = version.payload?.data?.toString();
        return payload ? (JSON.parse(payload) as Credentials) : null;
      } catch (err: unknown) {
        // NOT_FOUND (code 5) just means no credentials saved yet.
        if (isNotFound(err)) return null;
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
        // ALREADY_EXISTS (code 6) is fine — we just add a new version.
        if (!isAlreadyExists(err)) throw err;
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

// ---- Public API ------------------------------------------------------------

const backend: Backend = PROJECT ? secretManagerBackend() : fileBackend;

export function storeBackendName(): 'secret-manager' | 'local-file' {
  return PROJECT ? 'secret-manager' : 'local-file';
}

export function getCredentials(id: string): Promise<Credentials | null> {
  return backend.get(id);
}

/**
 * Credentials provided as environment variables on the service, which are the
 * durable home on Cloud Run: they survive restarts and redeploys (unlike the
 * local-file fallback) and can be backed by a Secret Manager secret.
 *
 * Naming: CONNECTOR_<ID>_<FIELD>, uppercased — e.g. CONNECTOR_SHOPIFY_CLIENTID,
 * CONNECTOR_SHOPIFY_CLIENTSECRET, CONNECTOR_SHOPIFY_SHOPDOMAIN.
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

/**
 * The credentials a connector should actually use: the stored values with any
 * environment-variable values layered on top. Env wins, so a value set on the
 * service is the source of truth and cannot be clobbered by a stale UI save.
 */
export async function getEffectiveCredentials(
  id: string,
  fieldKeys: string[],
): Promise<Credentials> {
  const stored = (await backend.get(id)) ?? {};
  return { ...stored, ...envCredentials(id, fieldKeys) };
}

export async function hasCredentials(id: string): Promise<boolean> {
  const creds = await backend.get(id);
  return Boolean(creds && Object.keys(creds).length > 0);
}

export function saveCredentials(id: string, creds: Credentials): Promise<void> {
  return backend.set(id, creds);
}

export function removeCredentials(id: string): Promise<void> {
  return backend.remove(id);
}
