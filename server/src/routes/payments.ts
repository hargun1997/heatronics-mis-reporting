// ----------------------------------------------------------------------------
// Bulk payments (ICICI) — records only, signed in (htxGate). The tool PREPARES upload files in the browser; nothing
// here calls a bank or moves money. Stored in the ingest objectStore:
//   payments/payees            the CIB payee list (parsed in the browser) — FULL account numbers, needed for the files
//   payments/batches-index     one summary line per saved batch
//   payments/batch-<id>        one batch (rows, debit account, date, who / when)
//   GET  /api/payments/payees            → PayeeList (full numbers go to the signed-in page only)
//   PUT  /api/payments/payees  {payees, fileName}
//   GET  /api/payments/batches           → {batches: summaries}
//   GET  /api/payments/batches/:id       → one batch
//   POST /api/payments/batches {…}       → saved batch
// Account numbers are never logged (errors carry only counts / field names).
// ----------------------------------------------------------------------------

import { Router, type Request } from 'express';
import { readJson, writeJson } from '../ingest/objectStore.js';

const PAYEES_KEY = 'payments/payees';
const INDEX_KEY = 'payments/batches-index';
const batchKey = (id: string) => `payments/batch-${id}`;

export const MAX_PAYEES = 5000;
export const MAX_BATCH_ROWS = 1000;
const MODES = new Set(['FT', 'NEFT', 'RTGS', 'IMPS']);
const ACC = /^\d{6,20}$/;
const PAYEE_ACC = /^[A-Z0-9]{6,20}$/; // some banks' accounts hold letters
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ID = /^PB\d{6}[A-Z0-9]{4}$/;

export interface StoredPayee { id: string; name: string; shortName: string; bankType: string; account: string; ifsc: string | null; status: string; activatedAt: string }
export interface StoredPayeeList { payees: StoredPayee[]; savedAt: string; fileName: string; by?: string; byVerified?: boolean }
export interface StoredBatchRow { payeeId: string; name: string; account: string; ifsc: string | null; amountPaise: number; mode: string; remark: string }
export interface StoredBatch {
  id: string; createdAt: string; by: string; byVerified: boolean; debitAccount: string; date: string;
  formatId: string; rows: StoredBatchRow[]; count: number; totalPaise: number; note?: string;
}
export type BatchSummary = Omit<StoredBatch, 'rows' | 'debitAccount'> & { debitLast4: string };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Check + clean a payee list from the page. Throws a message without any account number in it. */
export function cleanPayees(body: unknown): { payees: StoredPayee[]; fileName: string } {
  const b = (body ?? {}) as { payees?: unknown; fileName?: unknown };
  if (!Array.isArray(b.payees)) throw new Error('payees must be a list');
  if (b.payees.length > MAX_PAYEES) throw new Error(`At most ${MAX_PAYEES} payees`);
  let bad = 0;
  const payees: StoredPayee[] = [];
  for (const raw of b.payees as Record<string, unknown>[]) {
    const account = str(raw?.account, 20).toUpperCase();
    const name = str(raw?.name, 120);
    const ifscRaw = str(raw?.ifsc, 11).toUpperCase();
    if (!name || !PAYEE_ACC.test(account)) { bad++; continue; }
    payees.push({
      id: str(raw.id, 60) || `${account}|${ifscRaw}`,
      name,
      shortName: str(raw.shortName, 60),
      bankType: str(raw.bankType, 40),
      account,
      ifsc: IFSC.test(ifscRaw) ? ifscRaw : null,
      status: str(raw.status, 30) || 'Unknown',
      activatedAt: str(raw.activatedAt, 40),
    });
  }
  if (bad) throw new Error(`${bad} payee(s) have no name or a bad account number`);
  return { payees, fileName: str(b.fileName, 120) };
}

/** Check + clean a batch against the saved payees (the stored rows copy name / account / IFSC from the saved list). */
export function cleanBatch(body: unknown, saved: StoredPayee[], who: { by: string; byVerified: boolean }, now = new Date()): StoredBatch {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = str(b.id, 20);
  if (!ID.test(id)) throw new Error('Bad batch id');
  const debitAccount = str(b.debitAccount, 20);
  if (!ACC.test(debitAccount)) throw new Error('Debit account must be 6–20 digits');
  const date = str(b.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bad payment date');
  if (!Array.isArray(b.rows) || !b.rows.length) throw new Error('No rows');
  if (b.rows.length > MAX_BATCH_ROWS) throw new Error(`At most ${MAX_BATCH_ROWS} rows`);
  const byId = new Map(saved.map((p) => [p.id, p]));
  const rows: StoredBatchRow[] = (b.rows as Record<string, unknown>[]).map((r, i) => {
    const p = byId.get(str(r?.payeeId, 60));
    if (!p) throw new Error(`Row ${i + 1}: payee not in the saved list`);
    const amountPaise = Number(r.amountPaise);
    if (!Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise > 1e11) throw new Error(`Row ${i + 1}: bad amount`);
    const mode = str(r.mode, 4);
    if (!MODES.has(mode)) throw new Error(`Row ${i + 1}: bad mode`);
    return { payeeId: p.id, name: p.name, account: p.account, ifsc: p.ifsc, amountPaise, mode, remark: str(r.remark, 60) };
  });
  return {
    id, createdAt: now.toISOString(), ...who, debitAccount, date, formatId: str(b.formatId, 40), rows,
    count: rows.length, totalPaise: rows.reduce((a, r) => a + r.amountPaise, 0), note: str(b.note, 200) || undefined,
  };
}

export const summarise = ({ rows: _r, debitAccount, ...rest }: StoredBatch): BatchSummary => ({ ...rest, debitLast4: debitAccount.slice(-4) });

function who(req: Request): { by: string; byVerified: boolean } {
  const email = (req as unknown as { htxUser?: string }).htxUser;
  if (email) return { by: email, byVerified: true };
  return { by: str((req.body as Record<string, unknown> | undefined)?.by, 60) || 'unknown', byVerified: false };
}

const fail = (res: import('express').Response, e: unknown, code = 400) =>
  res.status(code).json({ error: e instanceof Error ? e.message : 'Error.' });

const router = Router();
const readPayees = () => readJson<StoredPayeeList | null>(PAYEES_KEY, null);

router.get('/payees', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json((await readPayees()) ?? { payees: [], savedAt: '', fileName: '' });
  } catch (e) { fail(res, e, 500); }
});

router.put('/payees', async (req, res) => {
  let clean: ReturnType<typeof cleanPayees>;
  try { clean = cleanPayees(req.body); } catch (e) { return fail(res, e); }
  try {
    const w = who(req);
    const doc: StoredPayeeList = { ...clean, savedAt: new Date().toISOString(), by: w.by, byVerified: w.byVerified };
    await writeJson(PAYEES_KEY, doc);
    res.set('Cache-Control', 'no-store');
    res.json(doc);
  } catch (e) { fail(res, e, 500); }
});

router.get('/batches', async (_req, res) => {
  try { res.json({ batches: await readJson<BatchSummary[]>(INDEX_KEY, []) }); } catch (e) { fail(res, e, 500); }
});

router.get('/batches/:id', async (req, res) => {
  if (!ID.test(req.params.id)) return fail(res, new Error('Bad batch id'));
  try {
    const b = await readJson<StoredBatch | null>(batchKey(req.params.id), null);
    if (!b) return res.status(404).json({ error: 'No such batch' });
    res.set('Cache-Control', 'no-store');
    res.json(b);
  } catch (e) { fail(res, e, 500); }
});

router.post('/batches', async (req, res) => {
  try {
    const saved = (await readPayees())?.payees ?? [];
    let batch: StoredBatch;
    try { batch = cleanBatch(req.body, saved, who(req)); } catch (e) { return fail(res, e); }
    await writeJson(batchKey(batch.id), batch);
    const index = (await readJson<BatchSummary[]>(INDEX_KEY, [])).filter((x) => x.id !== batch.id);
    await writeJson(INDEX_KEY, [summarise(batch), ...index].slice(0, 500));
    res.json(summarise(batch));
  } catch (e) { fail(res, e, 500); }
});

export default router;
