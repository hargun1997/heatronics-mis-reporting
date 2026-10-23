// Heatronics login gate for Express apps — every page and API needs a portal.heatronics.in login.
// Access rules live in the master portal (https://portal.heatronics.in/admin). This file only asks
// the portal "can this visitor open <portal>?" and caches the answer for 60s.
// Same behaviour as middleware.ts in heatronics-ops / heatronics-production.

type Opts = {
  /** Key this app sends to /api/auth/check (see LOCKED_PORTALS in heatronics-portal). */
  portal: string;
  /** This app's real address. The .run.app address can't see the shared login cookie. */
  host: string;
  /**
   * Machine endpoints (cron jobs, other apps) that skip the login. They must check their own
   * token or be harmless. Prefix match. Never put pages here.
   */
  openPaths?: string[];
};

const HUB = "https://portal.heatronics.in";
const COOKIE = "htx_session";
const TTL = 60_000;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return part.slice(i + 1).trim();
      }
    }
  }
  return null;
}

export function htxGate({ portal, host, openPaths = [] }: Opts) {
  const cache = new Map<string, { at: number; status: number }>();
  const open = ["/api/health", "/health", ...openPaths];

  async function check(token: string): Promise<number> {
    const hit = cache.get(token);
    if (hit && Date.now() - hit.at < TTL) return hit.status;
    const r = await fetch(`${HUB}/api/auth/check?portal=${encodeURIComponent(portal)}`, {
      headers: { "x-htx-session": token },
    });
    if (r.status === 200 || r.status === 401 || r.status === 403) {
      if (cache.size > 2000) cache.clear();
      cache.set(token, { at: Date.now(), status: r.status });
    }
    return r.status;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async function gate(req: any, res: any, next: any) {
    const url: string = req.originalUrl || req.url || "/";
    const pathname = url.split("?")[0];
    const reqHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(":")[0];

    // Machine endpoints first, so cron jobs on the .run.app address keep working.
    if (open.some((p) => pathname === p || pathname.startsWith(p + "/"))) return next();
    if (reqHost === "localhost" || reqHost === "127.0.0.1" || process.env.HTX_GATE === "off") return next();
    if (reqHost.endsWith(".run.app")) return res.redirect(308, `https://${host}${url}`);

    const isApi = pathname.startsWith("/api/");
    const here = `https://${host}${url}`;
    const token = readCookie(req.headers.cookie, COOKIE);

    let status = 401;
    if (token) {
      try {
        status = await check(token);
      } catch {
        status = 503;
      }
    }
    if (status === 200) return next();
    if (status === 503 || (status !== 401 && status !== 403)) {
      return res.status(503).type("text/plain").send("Login service is unavailable. Try again in a minute.");
    }
    if (isApi) {
      return res.status(status).json({ ok: false, error: status === 403 ? "No access" : "Log in first" });
    }
    if (status === 403) return res.redirect(302, `${HUB}/denied?portal=${encodeURIComponent(portal)}`);
    return res.redirect(302, `${HUB}/login?next=${encodeURIComponent(here)}`);
  };
}
