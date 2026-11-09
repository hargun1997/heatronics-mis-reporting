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
   * token or be harmless. EXACT path match (a trailing "/" is tolerated) — never a prefix, so
   * nothing can be hung under an open path. Never put pages here.
   */
  openPaths?: string[];
};

/**
 * Local-dev bypass (Host localhost / 127.0.0.1). Never on Cloud Run: the Host / X-Forwarded-Host headers are
 * sent by the caller, so trusting them there would let anyone skip the login with `X-Forwarded-Host: localhost`.
 * Cloud Run always sets K_SERVICE.
 */
export const onCloudRun = () => Boolean(process.env.K_SERVICE);

/** HTX_GATE=off is for local testing only — ignored on Cloud Run (CLAUDE.md: never there). */
export function gateOff(): boolean {
  return process.env.HTX_GATE === "off" && !onCloudRun();
}

/** Strip a trailing slash; refuse paths a proxy might normalise differently from Express. */
function cleanPath(pathname: string): string | null {
  if (/(^|\/)\.\.?(\/|$)|\/\/|%2e|%2f|%5c|\\/i.test(pathname)) return null;
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

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
  const cache = new Map<string, { at: number; status: number; email?: string }>();
  const open = new Set(["/api/health", "/health", ...openPaths]);

  async function check(token: string): Promise<{ status: number; email?: string }> {
    const hit = cache.get(token);
    if (hit && Date.now() - hit.at < TTL) return hit;
    const r = await fetch(`${HUB}/api/auth/check?portal=${encodeURIComponent(portal)}`, {
      headers: { "x-htx-session": token },
    });
    if (r.status === 200 || r.status === 401 || r.status === 403) {
      if (cache.size > 2000) cache.clear();
      // The portal may name the visitor (Ops forwards it too); used only for the audit trail of month locks.
      let email: string | undefined;
      if (r.status === 200) {
        try {
          const b = (await r.json()) as { email?: unknown; user?: { email?: unknown } };
          const e = b?.email ?? b?.user?.email;
          if (typeof e === "string" && e.includes("@")) email = e.slice(0, 120);
        } catch { /* body is optional */ }
      }
      const entry = { at: Date.now(), status: r.status, email };
      cache.set(token, entry);
      return entry;
    }
    return { status: r.status };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async function gate(req: any, res: any, next: any) {
    const url: string = req.originalUrl || req.url || "/";
    const pathname = url.split("?")[0];
    const reqHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(":")[0];

    const localDev = !onCloudRun() && (reqHost === "localhost" || reqHost === "127.0.0.1");
    const clean = cleanPath(pathname);

    // Machine endpoints first, so cron jobs on the .run.app address keep working. They run without a login;
    // `req.htxAuthed` tells the route whether a signed-in person (not a cron) is calling, so a route can give
    // the full answer to people and a status-only answer to machines.
    if (clean !== null && open.has(clean)) {
      req.htxAuthed = false;
      if (localDev || gateOff()) req.htxAuthed = true;
      else {
        const t = readCookie(req.headers.cookie, COOKIE);
        if (t) {
          try {
            const c = await check(t);
            if (c.status === 200) { req.htxAuthed = true; req.htxUser = c.email; }
          } catch { /* the open path still runs, as a machine call */ }
        }
      }
      return next();
    }
    if (localDev || gateOff()) { req.htxAuthed = true; return next(); }
    if (reqHost.endsWith(".run.app")) return res.redirect(308, `https://${host}${url}`);

    const isApi = pathname.startsWith("/api/");
    const here = `https://${host}${url}`;
    const token = readCookie(req.headers.cookie, COOKIE);

    let status = 401;
    if (token) {
      try {
        const c = await check(token);
        status = c.status;
        req.htxUser = c.email;
      } catch {
        status = 503;
      }
    }
    if (status === 200) { req.htxAuthed = true; return next(); }
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
