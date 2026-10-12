// ----------------------------------------------------------------------------
// Ingestion object store — durable home for uploaded reports and the facts
// extracted from them. Mirrors credentialStore.ts: a Cloud Storage bucket is
// used automatically whenever the app runs on GCP and can reach one (project +
// service account auto-detected, bucket auto-created once), and otherwise the
// store falls back to a temporary directory and reports the exact grant that
// makes it durable, upgrading itself with no redeploy.
//
// Each report occupies a deterministic prefix — one per connector + slot +
// period — so re-uploading the same month cleanly OVERWRITES the previous file
// and its extracted facts. A single addressable slot means no duplicates and
// no double-counting in the run-rate.
//
//   ingest/{connectorId}/{slotId}/{periodKey}/raw.<ext>      the raw report
//   ingest/{connectorId}/{slotId}/{periodKey}/extracted.json facts / ledger rows
//   ingest/{connectorId}/{slotId}/{periodKey}/meta.json      the report record
// ----------------------------------------------------------------------------

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const LOCAL_DIR = process.env.INGEST_STORE_DIR || path.join(os.tmpdir(), 'heatronics-ingest');
const GCS_LOCATION = process.env.INGEST_BUCKET_LOCATION || 'europe-west1';

/** What a committed report records (stored as meta.json). */
export interface IngestReportMeta {
  connectorId: string;
  slotId: string;
  slotLabel: string;
  periodKey: string; // YYYY-MM
  fileName: string;
  mimeType: string;
  rawExt: string;
  rowCount: number;
  /** Latest date in the extracted facts, if any (YYYY-MM-DD). */
  through: string | null;
  warnings: string[];
  checks: { passed: number; warned: number; failed: number };
  savedAt: string;
  ingestedAt: string | null;
}

/** The extracted payload the client commits alongside the raw file. */
export interface ExtractedPayload {
  facts?: unknown[];
  nodes?: unknown[];
  skuRows?: unknown[];
  crossChecks?: unknown[];
  bomCosts?: unknown[];
}

export interface CommitInput extends Omit<IngestReportMeta, 'savedAt' | 'ingestedAt' | 'rawExt'> {
  rawBase64: string;
  extracted: ExtractedPayload;
}

// ---- Low-level backend abstraction -----------------------------------------

interface Backend {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  putText(key: string, text: string): Promise<void>;
  getText(key: string): Promise<string | null>;
  list(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<void>;
}

// ---- Local directory backend -----------------------------------------------

const toPath = (key: string) => path.join(LOCAL_DIR, ...key.split('/'));

const fileBackend: Backend = {
  async put(key, data) {
    const p = toPath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  },
  async putText(key, text) {
    await fileBackend.put(key, Buffer.from(text, 'utf8'), 'application/json');
  },
  async getText(key) {
    try {
      return await fs.readFile(toPath(key), 'utf8');
    } catch {
      return null;
    }
  },
  async list(prefix) {
    const root = LOCAL_DIR;
    const out: string[] = [];
    async function walk(dir: string) {
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const key = path.relative(root, full).split(path.sep).join('/');
          if (key.startsWith(prefix)) out.push(key);
        }
      }
    }
    await walk(root);
    return out;
  },
  async deletePrefix(prefix) {
    await fs.rm(toPath(prefix), { recursive: true, force: true });
  },
};

// ---- GCP detection (same metadata probes as credentialStore) ---------------

async function metadata(suffix: string): Promise<string> {
  try {
    const res = await fetch(`http://metadata.google.internal/computeMetadata/v1/${suffix}`, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) return (await res.text()).trim();
  } catch {
    /* not on GCP */
  }
  return '';
}
async function detectProject(): Promise<string> {
  return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || (await metadata('project/project-id'));
}
async function detectServiceAccount(): Promise<string> {
  return metadata('instance/service-accounts/default/email');
}

// ---- GCS backend (SDK imported lazily, like the Secret Manager one) ---------

function gcsBackend(bucketName: string): { backend: Backend; ensure: () => Promise<void> } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bucketPromise: Promise<any> | null = null;
  const getBucket = async () => {
    if (!bucketPromise) {
      bucketPromise = import('@google-cloud/storage').then(async (m) => {
        const storage = new m.Storage();
        const bucket = storage.bucket(bucketName);
        const [exists] = await bucket.exists();
        if (!exists) await storage.createBucket(bucketName, { location: GCS_LOCATION });
        return bucket;
      });
    }
    return bucketPromise;
  };

  const backend: Backend = {
    async put(key, data, contentType) {
      const b = await getBucket();
      await b.file(key).save(data, { contentType, resumable: false });
    },
    async putText(key, text) {
      const b = await getBucket();
      await b.file(key).save(Buffer.from(text, 'utf8'), { contentType: 'application/json', resumable: false });
    },
    async getText(key) {
      const b = await getBucket();
      try {
        const [buf] = await b.file(key).download();
        return buf.toString('utf8');
      } catch {
        return null;
      }
    },
    async list(prefix) {
      const b = await getBucket();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [files] = await b.getFiles({ prefix });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return files.map((f: any) => f.name as string);
    },
    async deletePrefix(prefix) {
      const b = await getBucket();
      await b.deleteFiles({ prefix, force: true });
    },
  };
  // A read probe that also creates the bucket if needed.
  const ensure = async () => {
    const b = await getBucket();
    await b.getFiles({ maxResults: 1 });
  };
  return { backend, ensure };
}

// ---- Backend resolution ----------------------------------------------------

interface Resolved {
  backend: Backend;
  name: 'gcs' | 'local-file';
  bucket: string;
  project: string;
  serviceAccount: string;
  error?: string;
}

let resolvedPromise: Promise<Resolved> | null = null;

function resolveStore(): Promise<Resolved> {
  if (!resolvedPromise) {
    resolvedPromise = (async () => {
      const [project, serviceAccount] = await Promise.all([detectProject(), detectServiceAccount()]);
      const bucket = process.env.INGEST_BUCKET || (project ? `${project}-heatronics-ingest` : '');
      if (project && bucket) {
        const { backend, ensure } = gcsBackend(bucket);
        try {
          await ensure();
          return { backend, name: 'gcs' as const, bucket, project, serviceAccount };
        } catch (err) {
          return { backend: fileBackend, name: 'local-file' as const, bucket, project, serviceAccount, error: errMsg(err) };
        }
      }
      return { backend: fileBackend, name: 'local-file' as const, bucket, project, serviceAccount };
    })();
  }
  return resolvedPromise;
}

export function refreshIngestStore(): void {
  resolvedPromise = null;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---- Keys ------------------------------------------------------------------

const prefixFor = (connectorId: string, slotId: string, periodKey: string) =>
  `ingest/${connectorId}/${slotId}/${periodKey}/`;

// ---- Public API ------------------------------------------------------------

/** Save (overwriting any prior report for the same connector+slot+period). */
export async function saveReport(input: CommitInput): Promise<IngestReportMeta> {
  const r = await resolveStore();
  const prefix = prefixFor(input.connectorId, input.slotId, input.periodKey);
  const rawExt = (input.fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');

  const meta: IngestReportMeta = {
    connectorId: input.connectorId,
    slotId: input.slotId,
    slotLabel: input.slotLabel,
    periodKey: input.periodKey,
    fileName: input.fileName,
    mimeType: input.mimeType,
    rawExt,
    rowCount: input.rowCount,
    through: input.through,
    warnings: input.warnings,
    checks: input.checks,
    savedAt: new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
  };

  // Overwrite: clear the slot first so a changed extension can't orphan an old raw.
  await r.backend.deletePrefix(prefix);
  const rawBuf = Buffer.from(input.rawBase64, 'base64');
  await r.backend.put(`${prefix}raw.${rawExt}`, rawBuf, input.mimeType || 'application/octet-stream');
  await r.backend.putText(`${prefix}extracted.json`, JSON.stringify(input.extracted));
  await r.backend.putText(`${prefix}meta.json`, JSON.stringify(meta));
  return meta;
}

/** Every committed report's metadata, across all connectors and periods. */
export async function listReports(): Promise<IngestReportMeta[]> {
  const r = await resolveStore();
  const keys = (await r.backend.list('ingest/')).filter((k) => k.endsWith('/meta.json'));
  const metas = await Promise.all(
    keys.map(async (k) => {
      const text = await r.backend.getText(k);
      if (!text) return null;
      try {
        return JSON.parse(text) as IngestReportMeta;
      } catch {
        return null;
      }
    }),
  );
  return metas.filter((m): m is IngestReportMeta => m !== null);
}

/** The extracted facts across every ingested report, for the run-rate merge. */
export async function listExtractedFacts(): Promise<unknown[]> {
  const r = await resolveStore();
  const keys = (await r.backend.list('ingest/')).filter((k) => k.endsWith('/extracted.json'));
  const chunks = await Promise.all(
    keys.map(async (k) => {
      const text = await r.backend.getText(k);
      if (!text) return [];
      try {
        const payload = JSON.parse(text) as ExtractedPayload;
        return Array.isArray(payload.facts) ? payload.facts : [];
      } catch {
        return [];
      }
    }),
  );
  return chunks.flat();
}

export async function deleteReport(connectorId: string, slotId: string, periodKey: string): Promise<void> {
  const r = await resolveStore();
  await r.backend.deletePrefix(prefixFor(connectorId, slotId, periodKey));
}

export interface IngestStoreStatus {
  backend: 'gcs' | 'local-file';
  durable: boolean;
  bucket: string;
  project: string;
  serviceAccount: string;
  error: string | null;
  grantHint: string | null;
}

export async function ingestStoreStatus(): Promise<IngestStoreStatus> {
  const r = await resolveStore();
  const durable = r.name === 'gcs';
  let grantHint: string | null = null;
  if (!durable && r.project && r.bucket && r.serviceAccount) {
    grantHint =
      `gcloud storage buckets create gs://${r.bucket} --location=${GCS_LOCATION} --project=${r.project} ; ` +
      `gcloud storage buckets add-iam-policy-binding gs://${r.bucket} ` +
      `--member=serviceAccount:${r.serviceAccount} --role=roles/storage.objectAdmin`;
  }
  return {
    backend: r.name,
    durable,
    bucket: r.bucket,
    project: r.project,
    serviceAccount: r.serviceAccount,
    error: r.error ?? null,
    grantHint,
  };
}
