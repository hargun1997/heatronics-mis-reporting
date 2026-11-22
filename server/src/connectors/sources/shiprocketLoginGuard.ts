// Shiprocket login guard (same file in heatronics-ops, -mis-reporting, -warranty-manager, -packing-hub).
//
// Why: Shiprocket locks the account for a while after a few refused logins. A service that keeps a stale
// password and tries again on every request or every timer locks the account for everyone, every day.
// This guard makes a refused login STOP further logins with the same email + password for 6 hours. A new
// password in the secret (a different fingerprint) is tried at once, so fixing the secret fixes the service.
// Network errors and 5xx answers wait 2 minutes, so an outage is not hammered either.
//
// Pure: no I/O, the clock is injected. The password itself is never stored here, only a short SHA-256
// fingerprint of email + password, kept in memory.

import { createHash } from "node:crypto";

export const REFUSED_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const ERROR_COOLDOWN_MS = 2 * 60 * 1000;

export type LoginBlock = { until: number; status: number; reason: string; fingerprint: string };

/** Short fingerprint of the credentials (never logged, never stored outside this process). */
export function credentialFingerprint(email: string, password: string): string {
  return createHash("sha256").update(`${email.trim().toLowerCase()}\u0000${password}`).digest("hex").slice(0, 16);
}

/** True when Shiprocket refused the credentials (wrong password, locked, blocked): trying again makes it worse. */
export function isRefusedLogin(status: number, message = ""): boolean {
  if ([400, 401, 403, 422, 423, 429].includes(status)) return true;
  return /invalid|incorrect|wrong|locked|lock|blocked|too many/i.test(message);
}

/** Message for a login answer, safe to log: no request body, no password. */
export function safeLoginMessage(status: number, message: unknown): string {
  const text = typeof message === "string" ? message.replace(/\s+/g, " ").slice(0, 160) : "";
  return `Shiprocket login refused (HTTP ${status || "no answer"}${text ? `: ${text}` : ""})`;
}

export class ShiprocketLoginGuard {
  private block: LoginBlock | null = null;
  constructor(private readonly now: () => number = Date.now) {}

  /** The block that applies to these credentials, or null when a login may be tried. */
  blocked(fingerprint: string): LoginBlock | null {
    const b = this.block;
    if (!b) return null;
    if (b.fingerprint !== fingerprint || this.now() >= b.until) {
      this.block = null; // the secret changed, or the wait is over: one new try
      return null;
    }
    return b;
  }

  /** Record a failed login. Refused = 6 h; network error / 5xx = 2 min. */
  failed(fingerprint: string, status: number, message = ""): LoginBlock {
    const refused = isRefusedLogin(status, message);
    this.block = {
      fingerprint,
      status,
      reason: safeLoginMessage(status, message),
      until: this.now() + (refused ? REFUSED_COOLDOWN_MS : ERROR_COOLDOWN_MS),
    };
    return this.block;
  }

  succeeded(): void {
    this.block = null;
  }

  /** Words for an error while blocked (no secret values). */
  static describe(b: LoginBlock): string {
    const until = new Date(b.until).toISOString().replace("T", " ").slice(0, 16);
    return `${b.reason}. Shiprocket logins are paused until ${until} UTC so the account is not locked. ` +
      "Check the Secret Manager secrets shiprocket-email / shiprocket-password; a new value is tried at once.";
  }
}
