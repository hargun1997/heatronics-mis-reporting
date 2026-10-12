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
  /** Tally vision output — the P&L ledger rows, bottom line and period. */
  ledgerRows?: unknown[];
  nettProfit?: number | null;
  period?: string | null;
}

/** One committed report's full extracted payload, tagged with where it sits. */
export interface ExtractedReport {
  connectorId: string;
  slotId: string;
  periodKey: string; // YYYY-MM
  payload: ExtractedPayload;
}

export interface RawFile {
  base64: string;
  mimeType: string;
  name: string;
}

export interface CommitInput extends Omit<IngestReportMeta, 'savedAt' | 'ingestedAt' | 'rawExt'> {
  /** One or more raw files (a report can be several screenshots). */
  rawFiles: RawFile[];
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
const extOf = (name: string) => (name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');

export async function saveReport(input: CommitInput): Promise<IngestReportMeta> {
  const r = await resolveStore();
  const prefix = prefixFor(input.connectorId, input.slotId, input.periodKey);
  const files = input.rawFiles.length ? input.rawFiles : [];
  const rawExt = files[0] ? extOf(files[0].name) : 'bin';

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

  // Overwrite: clear the slot first so stale raws from a prior upload can't linger.
  await r.backend.deletePrefix(prefix);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    await r.backend.put(`${prefix}raw-${i + 1}.${extOf(f.name)}`, Buffer.from(f.base64, 'base64'), f.mimeType || 'application/octet-stream');
  }
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

/**
 * Every committed report's FULL extracted payload, tagged with its
 * connector/slot/period (parsed from the object key). Unlike listExtractedFacts
 * (which keeps only `facts`), this preserves bomCosts, ledgerRows, nettProfit
 * and period — everything the live-MIS cascade needs to rebuild a month.
 */
export async function readAllExtracted(): Promise<ExtractedReport[]> {
  const r = await resolveStore();
  const keys = (await r.backend.list('ingest/')).filter((k) => k.endsWith('/extracted.json'));
  const reports = await Promise.all(
    keys.map(async (k) => {
      // ingest/{connectorId}/{slotId}/{periodKey}/extracted.json
      const parts = k.split('/');
      if (parts.length !== 5) return null;
      const [, connectorId, slotId, periodKey] = parts;
      const text = await r.backend.getText(k);
      if (!text) return null;
      try {
        const payload = JSON.parse(text) as ExtractedPayload;
        return { connectorId, slotId, periodKey, payload } satisfies ExtractedReport;
      } catch {
        return null;
      }
    }),
  );
  return reports.filter((x): x is ExtractedReport => x !== null);
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

// ---- Claude API usage / cost tracking --------------------------------------
//
// Every Claude response reports exact token usage; we price each call at the
// model's published rates and append one small record per call under
// usage/{IST-date}/, so "spend today" is a sum over a day's prefix. Append-only
// avoids read-modify-write races across Cloud Run instances.

interface Rate { input: number; output: number; cacheRead: number; cacheWrite: number } // $ per 1M tokens
const RATES: Record<string, Rate> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.25, cacheWrite: 6.25 },
};
const rateFor = (model: string): Rate => RATES[model] ?? RATES['claude-opus-5-5'];

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function usageCostUsd(model: string, u: TokenUsage): number {
  const r = rateFor(model);
  const cost =
    ((u.input_tokens ?? 0) * r.input +
      (u.output_tokens ?? 0) * r.output +
      (u.cache_read_input_tokens ?? 0) * r.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * r.cacheWrite) /
    1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

/** IST calendar date (the business day in India) as YYYY-MM-DD. */
function istDate(d = new Date()): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

interface UsageRecord {
  model: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  at: string;
}

/** Record one Claude call's usage. Fire-and-forget; never throws to the caller. */
export async function recordApiUsage(model: string, feature: string, u: TokenUsage): Promise<void> {
  try {
    const rec: UsageRecord = {
      model,
      feature,
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      costUsd: usageCostUsd(model, u),
      at: new Date().toISOString(),
    };
    const day = istDate();
    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const r = await resolveStore();
    await r.backend.putText(`usage/${day}/${id}.json`, JSON.stringify(rec));
  } catch {
    /* usage tracking must never break an AI call */
  }
}

export interface DayUsage {
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byFeature: Record<string, { calls: number; costUsd: number }>;
  models: string[];
}

/** Per-day usage for the last `days` IST days (most recent first). */
export async function usageByDay(days = 7): Promise<DayUsage[]> {
  const r = await resolveStore();
  const wanted = new Set<string>();
  for (let i = 0; i < days; i++) wanted.add(istDate(new Date(Date.now() - i * 86400000)));
  const keys = (await r.backend.list('usage/')).filter((k) => {
    const day = k.split('/')[1];
    return k.endsWith('.json') && wanted.has(day);
  });
  const byDay = new Map<string, DayUsage>();
  await Promise.all(
    keys.map(async (k) => {
      const text = await r.backend.getText(k);
      if (!text) return;
      let rec: UsageRecord;
      try { rec = JSON.parse(text) as UsageRecord; } catch { return; }
      const day = k.split('/')[1];
      let d = byDay.get(day);
      if (!d) {
        d = { date: day, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, byFeature: {}, models: [] };
        byDay.set(day, d);
      }
      d.calls += 1;
      d.inputTokens += rec.inputTokens + rec.cacheReadTokens + rec.cacheWriteTokens;
      d.outputTokens += rec.outputTokens;
      d.costUsd = Math.round((d.costUsd + rec.costUsd) * 1e6) / 1e6;
      const f = (d.byFeature[rec.feature] ??= { calls: 0, costUsd: 0 });
      f.calls += 1;
      f.costUsd = Math.round((f.costUsd + rec.costUsd) * 1e6) / 1e6;
      if (!d.models.includes(rec.model)) d.models.push(rec.model);
    }),
  );
  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
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
