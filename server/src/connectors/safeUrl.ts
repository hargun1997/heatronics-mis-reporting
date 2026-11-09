// ----------------------------------------------------------------------------
// SSRF guards for the two hosts a signed-in user can type on the Connectors page:
//   - the Tally host (TallyPrime on Thakur Hardsoft's cloud): any public host, http(s) only; never the
//     metadata server, loopback, link-local or private ranges on Cloud Run (loopback is fine in local dev,
//     where Tally may run on the same machine);
//   - the Warranty Manager feed URL (Delhivery slot): https on heatronics.in only, because the call carries
//     the x-feed-token secret and must not be sendable to any other host.
// Hostname checks only: a public name that resolves to a private address (DNS rebinding) is not caught here.
// ----------------------------------------------------------------------------

const onCloudRun = () => Boolean(process.env.K_SERVICE);

function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
}

/** True for hosts a server-side fetch must never reach from Cloud Run. */
export function isInternalHost(hostname: string, opts: { allowLoopback?: boolean } = {}): boolean {
  let h = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  const loopbackName = h === 'localhost' || h.endsWith('.localhost');
  if (h === 'metadata' || h === 'metadata.google.internal' || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h === '' || h === '0.0.0.0' || h === '::') return true;
  if (h.includes(':')) {
    // IPv6 literal: loopback, link-local, unique-local, IPv4-mapped.
    if (h === '::1') return !opts.allowLoopback;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
    if (mapped) return isInternalHost(mapped[1], opts);
    return /^(fe8|fe9|fea|feb|fc|fd)/.test(h) || h.startsWith('::ffff:');
  }
  const v4 = ipv4(h);
  if (!v4) {
    if (/^[0-9.]+$/.test(h) || /^0x/i.test(h)) return true; // odd numeric forms (2130706433, 0x7f.1) — refuse
    return loopbackName ? !opts.allowLoopback : false;
  }
  const [a, b] = v4;
  if (a === 127) return !opts.allowLoopback;
  return a === 0 || a === 10 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** The Tally endpoint (http(s)://host:port) — throws when it points somewhere the server must not call. */
export function assertSafeTallyUrl(url: string): void {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error(`Tally host "${url}" is not a valid address.`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Tally host must be http:// or https://.');
  if (u.username || u.password) throw new Error('Tally host must not carry a user name or password.');
  if (isInternalHost(u.hostname, { allowLoopback: !onCloudRun() })) {
    throw new Error(`Tally host "${u.hostname}" is an internal address — use the Tally cloud machine's public host.`);
  }
}

/** Hosts the warranty feed may live on (the feed request carries the x-feed-token secret). */
export function isAllowedFeedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return h === 'heatronics.in' || h.endsWith('.heatronics.in');
}
