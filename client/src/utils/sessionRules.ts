// Pure rule for sessionGuard.ts (tested in server/test/sweepBatch1.test.ts).
/** Pure: reload for a 401 from our own API, at most once a minute (the portal gate then sends the person to log in). */
export function shouldReload(status: number, url: string, origin: string, lastReloadAt: number | null, now: number): boolean {
  if (status !== 401) return false;
  let u: URL;
  try { u = new URL(url, origin); } catch { return false; }
  if (u.origin !== origin || !u.pathname.startsWith('/api/')) return false;
  return lastReloadAt == null || now - lastReloadAt > 60_000;
}

