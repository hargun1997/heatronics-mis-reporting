// Responses go out gzipped when the browser asks (Live MIS loaded 1.2 MB of raw JSON before this).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.K_SERVICE = 'heatronics-mis-test';
delete process.env.HTX_GATE;
const { default: app } = await import('../src/app.js');

function get(port: number, path: string, enc?: string): Promise<{ status: number; encoding?: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    http.get({ port, path, headers: enc ? { 'accept-encoding': enc } : {} }, (res) => {
      let bytes = 0;
      res.on('data', (c: Buffer) => { bytes += c.length; });
      res.on('end', () => resolve({ status: res.statusCode || 0, encoding: res.headers['content-encoding'] as string | undefined, bytes }));
    }).on('error', reject);
  });
}

test('JSON is gzipped when asked, plain when not', async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const plain = await get(port, '/.well-known/portal.json');
    const gz = await get(port, '/.well-known/portal.json', 'gzip');
    assert.equal(plain.status, 200);
    assert.equal(plain.encoding, undefined);
    assert.ok(plain.bytes > 1024, `manifest is ${plain.bytes} bytes`);
    assert.equal(gz.encoding, 'gzip');
    assert.ok(gz.bytes < plain.bytes / 2, `${gz.bytes} vs ${plain.bytes}`);
  } finally { server.close(); }
});
