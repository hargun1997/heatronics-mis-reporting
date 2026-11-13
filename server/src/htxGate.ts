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
  /**
   * This app's pages for People & teams on portal.heatronics.in/admin (one place for every portal's access; On / Off
   * per page). Served at /.well-known/htx-pages.json. When the portal's check names the pages a person may open,
   * the others are refused (pages: the hub's notice; APIs stay open to anyone who can open the app). `exact` = the
   * path itself only. A path in no page is always open. GET /api/htx/pages tells the browser which pages to show.
   */
  catalog?: HtxCatalog;
};

export type HtxPage = { id: string; name: string; group?: string; paths: string[]; exact?: boolean };
export type HtxCatalog = { portal: string; pages: HtxPage[] };
export type PageGrant = '*' | string[];

/** Longest matching path wins; "/" = the home page only. Same rule as the hub (heatronics-portal lib/auth/directory.ts). */
export function pageOfPath(pathname: string, pages: HtxPage[]): string | null {
  let best: { id: string; len: number } | null = null;
  for (const p of pages) for (const pre of p.paths) {
    const base = pre.length > 1 && pre.endsWith('/') ? pre.slice(0, -1) : pre;
    const hit = base === '/' || p.exact ? pathname === base : pathname === base || pathname.startsWith(base + '/');
    if (hit && (!best || base.length > best.len)) best = { id: p.id, len: base.length };
  }
  return best?.id ?? null;
}

export function parsePages(v: unknown): PageGrant | null {
  const ok = (x: string) => /^[A-Za-z0-9:_./-]{1,80}$/.test(x);
  if (v === '*') return '*';
  if (Array.isArray(v)) return v.map(String).filter(ok);
  return null;
}

export const allowsPage = (g: PageGrant | null | undefined, page: string | null) => !g || page === null || g === '*' || g.includes(page);

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

export function htxGate({ portal, host, openPaths = [], catalog }: Opts) {
  const cache = new Map<string, { at: number; status: number; email?: string; pages?: PageGrant | null }>();
  const open = new Set(["/api/health", "/health", ...openPaths]);
  const published = catalog
    ? JSON.stringify({ schema: 1, portal: catalog.portal, pages: catalog.pages.map(({ id, name, group, paths }) => ({ id, name, ...(group ? { group } : {}), paths })) })
    : null;

  async function check(token: string): Promise<{ status: number; email?: string; pages?: PageGrant | null }> {
    const hit = cache.get(token);
    if (hit && Date.now() - hit.at < TTL) return hit;
    const r = await fetch(`${HUB}/api/auth/check?portal=${encodeURIComponent(portal)}`, {
      headers: { "x-htx-session": token },
    });
    if (r.status === 200 || r.status === 401 || r.status === 403) {
      if (cache.size > 2000) cache.clear();
      // The portal may name the visitor (Ops forwards it too); used only for the audit trail of month locks.
      let email: string | undefined;
      let pages: PageGrant | null = null;
      if (r.status === 200) {
        try {
          const b = (await r.json()) as { email?: unknown; user?: { email?: unknown }; pages?: unknown };
          const e = b?.email ?? b?.user?.email;
          if (typeof e === "string" && e.includes("@")) email = e.slice(0, 120);
          pages = parsePages(b?.pages);
        } catch { /* body is optional */ }
      }
      const entry = { at: Date.now(), status: r.status, email, pages };
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

    // This app's page list for the hub (public: page names and paths only).
    if (published && pathname === "/.well-known/htx-pages.json") {
      return res.status(200).type("application/json").set("Cache-Control", "public, max-age=300").send(published);
    }
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
    if (localDev || gateOff()) {
      req.htxAuthed = true;
      if (pathname === "/api/htx/pages") return res.json({ pages: null });
      return next();
    }
    if (reqHost.endsWith(".run.app")) return res.redirect(308, `https://${host}${url}`);

    const isApi = pathname.startsWith("/api/");
    const here = `https://${host}${url}`;
    const token = readCookie(req.headers.cookie, COOKIE);

    let status = 401;
    let pages: PageGrant | null = null;
    if (token) {
      try {
        const c = await check(token);
        status = c.status;
        req.htxUser = c.email;
        pages = c.pages ?? null;
      } catch {
        status = 503;
      }
    }
    if (status === 200) {
      req.htxAuthed = true;
      req.htxPages = pages;
      if (pathname === "/api/htx/pages") return res.set("Cache-Control", "private, no-store").json({ pages });
      if (catalog && !isApi && pages && pages !== "*") {
        const page = clean === null ? null : pageOfPath(clean, catalog.pages);
        if (!allowsPage(pages, page)) {
          const home = catalog.pages[0];
          const first = page === home?.id ? catalog.pages.find((p) => pages!.includes(p.id))?.paths[0] : undefined;
          if (first && first !== pathname) return res.redirect(302, first);
          return res.redirect(302, `${HUB}/denied?portal=${encodeURIComponent(portal)}&page=${encodeURIComponent(page || "")}`);
        }
      }
      return next();
    }
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
