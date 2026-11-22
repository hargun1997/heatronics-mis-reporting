// Shiprocket runs ONLY on the shared Secret Manager values: a password saved on the Connectors page is never
// used (a stale saved copy locked the Shiprocket account every day, Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mis-sr-'));
const file = path.join(dir, 'creds.json');
process.env.CONNECTOR_STORE_FILE = file;
process.env.GCP_ACCESS_TOKEN = '';
delete process.env.GOOGLE_CLOUD_PROJECT;
delete process.env.GCLOUD_PROJECT;
delete process.env.SHIPROCKET_EMAIL;
delete process.env.SHIPROCKET_PASSWORD;
fs.writeFileSync(file, JSON.stringify({
  shiprocket: { email: 'api@example.com', password: 'stale-saved-password' },
  tally: { host: 'tally.example.com' },
}));

const { getEffectiveCredentials } = await import('../src/connectors/credentialStore.js');
const { SHARED_ONLY } = await import('../src/connectors/sharedSecrets.js');

test('Shiprocket is shared-only', () => {
  assert.ok(SHARED_ONLY.has('shiprocket'));
});

test('a Shiprocket password saved on the Connectors page is never used', async () => {
  const creds = await getEffectiveCredentials('shiprocket', ['email', 'password']);
  assert.equal(creds.password, undefined);
  assert.equal(creds.email, undefined);
});

test('the shared secret value is used', async () => {
  process.env.SHIPROCKET_EMAIL = 'api@example.com';
  process.env.SHIPROCKET_PASSWORD = 'current-password';
  try {
    const creds = await getEffectiveCredentials('shiprocket', ['email', 'password']);
    assert.equal(creds.password, 'current-password');
  } finally {
    delete process.env.SHIPROCKET_EMAIL;
    delete process.env.SHIPROCKET_PASSWORD;
  }
});

test('other connectors still use their saved values', async () => {
  const creds = await getEffectiveCredentials('tally', ['host']);
  assert.equal(creds.host, 'tally.example.com');
});
