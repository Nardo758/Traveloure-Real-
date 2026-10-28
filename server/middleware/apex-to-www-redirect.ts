/**
 * Row 258. Architect, Oct 27, 2026, 8:10 PM ET: 301 the apex traveloure.com to
 * https://www.traveloure.com at the server edge, one middleware, no cookie change.
 * Amended 8:35 PM ET: the canonical origin is www. Amended 9:10 PM ET: GET and
 * HEAD 301; every other method passes through; `/api/*` is exempt entirely.
 * Bare `/api` is exempt as well as `/api/*`. `/apix` is not.
 *
 * Host is read from the headers, not from `req.hostname`. `app.set("trust proxy", 1)`
 * is set inside setupAuth (replitAuth.ts:177) during registerRoutes, after this
 * middleware is mounted and, at boot, possibly after the first requests.
 * `req.hostname` and `req.protocol` honor `X-Forwarded-*` only once that flag
 * is set. This file does not call `app.set("trust proxy", ...)`.
 *
 * Non-GET and non-HEAD methods pass through untouched: a 301 turns a POST into
 * a GET in browsers, and webhook senders do not follow redirects. The exempt
 * paths pass through for the same reason (bare `/api` and every `/api/*` route, the health and
 * metrics probes, the Apple Pay domain file under `/.well-known/`, and
 * `/internal/` job runners).
 *
 * No cookie change. This middleware sets no cookie and does not touch getSession().
 */
import type { RequestHandler } from "express";
import { SITE_ORIGIN } from "@shared/site-origin";

export const CANONICAL_WWW_ORIGIN = SITE_ORIGIN;
export const APEX_HOST = "traveloure.com" as const;

/** Prefix match includes the trailing slash, so `/apix` and `/internal` are not exempt. */
export const EXEMPT_PREFIXES = ["/api/", "/.well-known/", "/internal/"] as const;
/** Exact match. Bare `/api` is exempt; `/apix` is not. `/healthy` and `/health/x` are not exempt. */
export const EXEMPT_EXACT = ["/api", "/health", "/health/ready", "/health/live", "/metrics"] as const;

function firstCommaValue(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  return raw.split(",")[0];
}

/** Lower-case, trim, drop one trailing `.`, then drop a `:port` suffix. */
function normalizeHost(raw: string): string {
  let host = raw.trim().toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  const port = host.match(/:(\d+)$/);
  if (port) host = host.slice(0, -port[0].length);
  return host;
}

function isExemptPath(pathname: string): boolean {
  if ((EXEMPT_EXACT as readonly string[]).includes(pathname)) return true;
  return EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function apexRedirectTarget(input: {
  method: string;
  originalUrl: string;
  host?: string | string[];
  forwardedHost?: string | string[];
}): string | null {
  const method = input.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;

  // `x-forwarded-host` when the header is present (even if the first value is blank), else `host`.
  const rawHost =
    input.forwardedHost !== undefined
      ? firstCommaValue(input.forwardedHost)
      : firstCommaValue(input.host);
  if (rawHost == null) return null;
  if (normalizeHost(rawHost) !== APEX_HOST) return null;

  // A leading `//` is allowed and stays on www because the origin is a constant.
  // An originalUrl that does not start with `/` (absolute-form) is not redirected.
  if (!input.originalUrl.startsWith("/")) return null;

  const pathname = input.originalUrl.split("?")[0] ?? "";
  if (isExemptPath(pathname)) return null;

  return CANONICAL_WWW_ORIGIN + input.originalUrl;
}

export const apexToWwwRedirect: RequestHandler = (req, res, next) => {
  const target = apexRedirectTarget({
    method: req.method,
    originalUrl: req.originalUrl,
    host: req.headers.host,
    forwardedHost: req.headers["x-forwarded-host"],
  });
  if (target != null) {
    res.redirect(301, target);
    return;
  }
  next();
};
