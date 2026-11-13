// Tally's error answer must not read as an empty Day Book (14 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tallyLineError } from '../src/connectors/sources/tally.js';

test('company not loaded: the LINEERROR message comes back', () => {
  const t = "<RESPONSE>\r\n <LINEERROR>Could not set &apos;SVCurrentCompany&apos; to &apos;Demo Co&apos;</LINEERROR>\r\n</RESPONSE>";
  assert.match(tallyLineError(t) ?? '', /Could not set .SVCurrentCompany. to .Demo Co./);
});

test('a normal answer has no error', () => {
  assert.equal(tallyLineError('<ENVELOPE><BODY><DATA><TALLYMESSAGE></TALLYMESSAGE></DATA></BODY></ENVELOPE>'), null);
});

test('a big answer is never treated as an error', () => {
  assert.equal(tallyLineError('<ENVELOPE>' + 'x'.repeat(5000) + '<LINEERROR>a</LINEERROR></ENVELOPE>'), null);
});
