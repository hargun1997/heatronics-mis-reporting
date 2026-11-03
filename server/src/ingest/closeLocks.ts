// ----------------------------------------------------------------------------
// Manual "Close & lock" per month — the only thing that counts a live month as
// closed for the MIS's "complete through" floor. Shared stored state (object
// store, like the planning scenarios), with an audit trail of who / when / why.
//
//   close-locks        { locks: { 'YYYY-MM': MonthLock } }
//   close-locks-audit  { entries: LockAudit[] }   newest last, capped
//
// Pure helpers here (tested); the route in routes/ingest.ts does the I/O.
// ----------------------------------------------------------------------------

export interface MonthLock {
  periodKey: string;
  lockedAt: string;
  lockedBy: string;
  /** True when `lockedBy` came from the portal login rather than the request body. */
  verifiedUser: boolean;
  /** Why the lock went ahead although the month did not tie within 1% of revenue. */
  overrideReason?: string;
  /** Worst residual at lock time, as % of net revenue (for the audit). */
  worstResidualPct?: number | null;
  note?: string;
}

export interface LockAudit {
  at: string;
  by: string;
  verifiedUser: boolean;
  action: 'lock' | 'unlock';
  periodKey: string;
  overrideReason?: string;
  worstResidualPct?: number | null;
  reason?: string;
}

export interface LockStore { locks: Record<string, MonthLock> }
export interface AuditStore { entries: LockAudit[] }

/** A lock needs an override reason when the month's tie breached the 1% rule. */
export const TIE_LIMIT_PCT = 1;

export class LockError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export interface LockRequest {
  action: 'lock' | 'unlock';
  /** Worst |residual| ÷ net revenue in %, computed by the client from the month's tie. */
  worstResidualPct?: number | null;
  overrideReason?: string;
  reason?: string;
  note?: string;
}

export interface Actor { by: string; verified: boolean }

export function applyLockRequest(
  store: LockStore, audit: AuditStore, periodKey: string, req: LockRequest, actor: Actor, now = new Date(),
): { store: LockStore; audit: AuditStore; lock: MonthLock | null } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) throw new LockError('periodKey must be "YYYY-MM".');
  const at = now.toISOString();
  const entries = [...audit.entries];
  const locks = { ...store.locks };

  if (req.action === 'unlock') {
    if (!locks[periodKey]) throw new LockError(`${periodKey} is not locked.`, 409);
    delete locks[periodKey];
    entries.push({ at, by: actor.by, verifiedUser: actor.verified, action: 'unlock', periodKey, reason: req.reason?.trim() || undefined });
    return { store: { locks }, audit: { entries: entries.slice(-500) }, lock: null };
  }

  if (req.action !== 'lock') throw new LockError('action must be "lock" or "unlock".');
  if (locks[periodKey]) throw new LockError(`${periodKey} is already locked (by ${locks[periodKey].lockedBy}). Unlock it first.`, 409);
  const pct = typeof req.worstResidualPct === 'number' && Number.isFinite(req.worstResidualPct) ? req.worstResidualPct : null;
  const override = req.overrideReason?.trim();
  if (pct !== null && Math.abs(pct) > TIE_LIMIT_PCT && !override) {
    throw new LockError(`${periodKey} does not tie to Tally within ${TIE_LIMIT_PCT}% of revenue (worst residual ${pct.toFixed(2)}%). Give a reason to lock anyway.`, 422);
  }
  const lock: MonthLock = {
    periodKey, lockedAt: at, lockedBy: actor.by, verifiedUser: actor.verified,
    ...(override ? { overrideReason: override } : {}),
    worstResidualPct: pct,
    ...(req.note?.trim() ? { note: req.note.trim() } : {}),
  };
  locks[periodKey] = lock;
  entries.push({ at, by: actor.by, verifiedUser: actor.verified, action: 'lock', periodKey, overrideReason: override || undefined, worstResidualPct: pct });
  return { store: { locks }, audit: { entries: entries.slice(-500) }, lock };
}
