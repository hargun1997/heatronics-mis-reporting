import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ShiprocketLoginGuard, credentialFingerprint, isRefusedLogin, safeLoginMessage,
  REFUSED_COOLDOWN_MS, ERROR_COOLDOWN_MS,
} from "../src/connectors/sources/shiprocketLoginGuard.js";

test("a refused login blocks the same credentials for 6 hours", () => {
  let t = 1_000_000;
  const g = new ShiprocketLoginGuard(() => t);
  const fp = credentialFingerprint("api@example.com", "old");
  assert.equal(g.blocked(fp), null);
  g.failed(fp, 400, "Invalid email and password combination");
  assert.ok(g.blocked(fp));
  t += REFUSED_COOLDOWN_MS - 1;
  assert.ok(g.blocked(fp), "still blocked just before 6 h");
  t += 1;
  assert.equal(g.blocked(fp), null, "one new try after 6 h");
});

test("a new password in the secret is tried at once", () => {
  const g = new ShiprocketLoginGuard(() => 0);
  const oldFp = credentialFingerprint("api@example.com", "old");
  g.failed(oldFp, 401, "Unauthorized");
  assert.ok(g.blocked(oldFp));
  assert.equal(g.blocked(credentialFingerprint("api@example.com", "new")), null);
});

test("network errors and 5xx wait 2 minutes only", () => {
  let t = 0;
  const g = new ShiprocketLoginGuard(() => t);
  const fp = credentialFingerprint("a@b.c", "p");
  g.failed(fp, 0, "fetch failed");
  assert.ok(g.blocked(fp));
  t = ERROR_COOLDOWN_MS;
  assert.equal(g.blocked(fp), null);
  g.failed(fp, 503, "Service Unavailable");
  assert.equal(g.blocked(fp)!.until, t + ERROR_COOLDOWN_MS);
});

test("a success clears the block", () => {
  const g = new ShiprocketLoginGuard(() => 0);
  const fp = credentialFingerprint("a@b.c", "p");
  g.failed(fp, 0, "");
  g.succeeded();
  assert.equal(g.blocked(fp), null);
});

test("refused-login detection", () => {
  assert.equal(isRefusedLogin(400), true);
  assert.equal(isRefusedLogin(429), true);
  assert.equal(isRefusedLogin(200, "Your account is temporarily locked"), true);
  assert.equal(isRefusedLogin(500, "Internal error"), false);
  assert.equal(isRefusedLogin(0, "fetch failed"), false);
});

test("messages and fingerprints never carry the password", () => {
  const pw = "S3cret-Value!";
  const fp = credentialFingerprint("a@b.c", pw);
  assert.equal(fp.length, 16);
  assert.ok(!fp.includes(pw));
  const g = new ShiprocketLoginGuard(() => 0);
  const b = g.failed(fp, 400, "Invalid email and password combination");
  const text = ShiprocketLoginGuard.describe(b);
  assert.ok(!text.includes(pw));
  assert.ok(!JSON.stringify(b).includes(pw));
  assert.equal(safeLoginMessage(400, { password: pw }), "Shiprocket login refused (HTTP 400)");
});
