// ----------------------------------------------------------------------------
// Connectors — browser-side client for the /api/connectors surface.
//
// Credentials only ever travel outward: the status the UI shows comes from the
// `connected` flag, never from reading values back. A sync returns the same
// UploadedSource shape the file adapters produce, so the result drops straight
// into a month-close session.
// ----------------------------------------------------------------------------

import type { SourceKind, UploadedSource } from './schema';

export interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  help?: string;
  optional?: boolean;
}

export type FetchMode = 'api' | 'xmlhttp' | 'webhook' | 'file';
export type ConnectorMode = 'live-api' | 'manual-upload';
export type ConnectorGroup = 'book' | 'marketplace' | 'd2c' | 'logistics' | 'payments' | 'marketing';

export interface ConnectorInfo {
  id: string;
  label: string;
  group: ConnectorGroup;
  fetchMode: FetchMode;
  /** How this source is fed today — 'live-api' or 'manual-upload'. */
  mode: ConnectorMode;
  bookOfRecord: boolean;
  implemented: boolean;
  note: string | null;
  credentialFields: CredentialField[];
  connected: boolean;
  /** True when one or more fields are supplied via service environment variables. */
  viaEnv?: boolean;
}

/** The durable env-var name for a connector field: CONNECTOR_<ID>_<FIELD>. */
export function envVarName(connectorId: string, fieldKey: string): string {
  return `CONNECTOR_${connectorId.toUpperCase()}_${fieldKey.toUpperCase()}`;
}

export interface TestResult {
  ok: boolean;
  detail: string;
}

/** The server omits id/addedAt; the client assigns them on adoption. */
interface ConnectorSourcePayload extends Omit<UploadedSource, 'id' | 'addedAt'> {
  kind: SourceKind;
}

export interface SyncResult {
  sources: UploadedSource[];
  warnings: string[];
}

async function asJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body;
}

export interface StoreStatus {
  backend: 'secret-manager' | 'local-file';
  durable: boolean;
  project: string;
  serviceAccount: string;
  secretManagerError: string | null;
  grantHint: string | null;
}

export async function listConnectors(): Promise<{ store: StoreStatus; connectors: ConnectorInfo[] }> {
  return asJson(await fetch('/api/connectors'));
}

/** Re-probe the store after granting the service account Secret Manager access. */
export async function refreshStore(): Promise<{ store: StoreStatus }> {
  return asJson(await fetch('/api/connectors/refresh-store', { method: 'POST' }));
}

export async function saveCredentials(
  id: string,
  credentials: Record<string, string>,
): Promise<void> {
  await asJson(
    await fetch(`/api/connectors/${id}/credentials`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials }),
    }),
  );
}

export async function clearCredentials(id: string): Promise<void> {
  await asJson(await fetch(`/api/connectors/${id}/credentials`, { method: 'DELETE' }));
}

export async function testConnector(id: string): Promise<TestResult> {
  // test returns a 502 body with {ok:false} on failure — read it either way.
  const res = await fetch(`/api/connectors/${id}/test`, { method: 'POST' });
  const body = (await res.json().catch(() => ({}))) as Partial<TestResult>;
  return { ok: Boolean(body.ok), detail: body.detail || `Test failed (${res.status}).` };
}

export async function syncConnector(id: string, periodKey: string): Promise<SyncResult> {
  const res = await fetch(`/api/connectors/${id}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ periodKey }),
  });
  const raw = await asJson<{ sources: ConnectorSourcePayload[]; warnings: string[] }>(res);

  // Stamp id + addedAt so each source is a complete UploadedSource.
  const stamp = Date.now();
  const sources: UploadedSource[] = raw.sources.map((s, i) => ({
    ...s,
    id: `conn-${id}-${stamp}-${i}`,
    addedAt: new Date().toISOString(),
  }));
  return { sources, warnings: raw.warnings };
}

export const GROUP_LABEL: Record<ConnectorGroup, string> = {
  book: 'Book of record',
  marketplace: 'Marketplaces',
  d2c: 'D2C',
  marketing: 'Advertising',
  logistics: 'Logistics',
  payments: 'Payments & checkout',
};

export const FETCH_MODE_LABEL: Record<FetchMode, string> = {
  api: 'Live API',
  xmlhttp: 'XML / HTTP',
  webhook: 'Webhook',
  file: 'File / report',
};

export const MODE_LABEL: Record<ConnectorMode, string> = {
  'live-api': 'Live API',
  'manual-upload': 'Manual upload',
};
