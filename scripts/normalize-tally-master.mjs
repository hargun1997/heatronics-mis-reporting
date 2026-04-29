#!/usr/bin/env node
/**
 * Normalize the verbose Tally export at repo-root `Master.json` into a slim
 * JSON the AI Expense Booking tool ships into Gemini's prompt.
 *
 * Run from the repo root:
 *   node scripts/normalize-tally-master.mjs
 *
 * Reads:  Master.json  (UTF-16 LE — that's how Tally exports)
 * Writes: client/public/data/tally/master.json  (UTF-8, slim)
 *
 * Mirrors the in-browser reducer at
 * client/src/data/tally/reduceTallyExport.ts so the bundled file and a
 * freshly-uploaded one produce identical output.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SRC = resolve(REPO_ROOT, 'Master.json');
const DST = resolve(REPO_ROOT, 'client/public/data/tally/master.json');

if (!existsSync(SRC)) {
  console.error(`Source file not found: ${SRC}`);
  process.exit(1);
}

const buf = readFileSync(SRC);
let text;
if (buf[0] === 0xff && buf[1] === 0xfe) {
  text = new TextDecoder('utf-16le').decode(buf.subarray(2));
} else if (buf[0] === 0xfe && buf[1] === 0xff) {
  text = new TextDecoder('utf-16be').decode(buf.subarray(2));
} else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
  text = new TextDecoder('utf-8').decode(buf.subarray(3));
} else {
  text = new TextDecoder('utf-8').decode(buf);
}

const data = JSON.parse(text);
const messages = data.tallymessage || [];

const clean = (s) => (typeof s === 'string' ? s.replace(/[\x00-\x1f]/g, '').trim() : s);
const tname = (m) => clean(m?.metadata?.name || '');
const ttype = (m) => clean(m?.metadata?.type || '');

const groupMap = new Map();
const ledgerMap = new Map();
const voucherTypeMap = new Map();
const costCategorySet = new Set();
const costCentreMap = new Map();
const currencySet = new Set();

for (const m of messages) {
  if (m.isdeleted) continue;
  const name = tname(m);
  if (!name) continue;
  const type = ttype(m);

  switch (type) {
    case 'Group':
      groupMap.set(name, {
        name,
        parent: clean(m.parent) || null,
        isRevenue: m.isrevenue === true,
      });
      break;
    case 'Ledger': {
      const supplyType = clean(m.gsttypeofsupply);
      ledgerMap.set(name, {
        name,
        group: clean(m.parent) || null,
        gst: m.isgstapplicable === true,
        tds: m.istdsapplicable === true,
        ...(supplyType ? { supplyType } : {}),
      });
      break;
    }
    case 'Voucher Type':
      voucherTypeMap.set(name, { name, parent: clean(m.parent) || null });
      break;
    case 'Cost Category':
      costCategorySet.add(name);
      break;
    case 'Cost Centre':
      costCentreMap.set(name, {
        name,
        category: clean(m.category) || null,
        parent: clean(m.parent) || null,
      });
      break;
    case 'Currency':
      currencySet.add(name);
      break;
    default:
      break;
  }
}

const sortByName = (arr) => arr.sort((a, b) => a.name.localeCompare(b.name));

const out = {
  generatedAt: new Date().toISOString(),
  company: 'Heatronics',
  groups: sortByName([...groupMap.values()]),
  ledgers: sortByName([...ledgerMap.values()]),
  voucherTypes: sortByName([...voucherTypeMap.values()]),
  costCategories: [...costCategorySet].sort(),
  costCentres: sortByName([...costCentreMap.values()]),
  currencies: [...currencySet].sort(),
};

mkdirSync(dirname(DST), { recursive: true });
writeFileSync(DST, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(`Wrote ${DST}`);
console.log(
  `  ${out.groups.length} groups · ${out.ledgers.length} ledgers · ${out.voucherTypes.length} voucher types · ${out.costCentres.length} cost centres`
);
