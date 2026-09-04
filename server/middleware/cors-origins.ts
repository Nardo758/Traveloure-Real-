/**
 * cors-origins.ts — the CORS origin decision, as ONE pure function.
 *
 * Audit finding 13 (ledger `2026-09-03-security-9-11-13`).
 *
 * THE DEFECT: `server/index.ts` reflected the caller's Origin when
 * `_corsAllowedOrigins.has(origin) || _corsAllowedOrigins.size === 0` — i.e. an EMPTY allowlist
 * meant "allow everyone", and the allowlist was built from `REPLIT_DOMAINS` alone, which is empty
 * on every non-Replit deployment (a shape CLAUDE.md §11 says is now supported). Paired with an
 * unconditional `Access-Control-Allow-Credentials: true`, an allowlist that has failed open is a
 * credentialed wildcard — the one combination the CORS spec itself forbids. The blast radius was
 * bounded by the session cookie's `sameSite: "lax"`, so this was defence-in-depth that had failed
 * open rather than a live session-theft path; it is still the wrong default.
 *
 * THE POSTURE HERE IS DENY-BY-DEFAULT. An unknown origin gets NO `Access-Control-Allow-Origin`
 * header at all, at any allowlist size. `*` is never emitted, with or without credentials.
 *
 * WHAT IS ALLOWED, and where each source comes from — all server-derived, never client-supplied:
 *
 *   1. SAME ORIGIN. `<scheme>://<host>` of the request itself. This is what keeps the platform's
 *      own production domain working with zero configuration, and it is safe by construction: in
 *      the cross-site attack this header exists to stop, the browser sets `Host` to the victim
 *      site and `Origin` to the attacker's, so the two cannot match. A non-browser client can spoof
 *      `Host`, but a non-browser client carries no ambient cookies and needs no CORS header. The
 *      scheme is read from `X-Forwarded-Proto` when the app sits behind the platform's TLS
 *      terminator, and falls back to the connection's own scheme.
 *   2. `CORS_ALLOWED_ORIGINS` — an explicit comma-separated list of full origins
 *      (`https://www.traveloure.com,https://traveloure.com`). This is the knob for a deployment
 *      that serves the API on a different host from the app, and for any non-Replit host.
 *   3. `APP_BASE_URL` — the canonical app URL the email rail already derives links from
 *      (`server/services/email.service.ts`). If it is set, its origin is ours by definition.
 *   4. `REPLIT_DOMAINS` / `REPLIT_DEV_DOMAIN` — the Replit-hosted dev/preview/deploy domains, the
 *      original (and previously only) source. Preserved verbatim, http and https, so no origin
 *      that worked before this change stops working.
 *   5. LOCALHOST / 127.0.0.1 / [::1] on any port — ONLY when the boot is not production-strict
 *      (`isProdStrictEnv`, the repo's single production predicate; see
 *      `server/middleware/test-only-endpoint.ts` for the same reuse). This covers dev and every CI
 *      gate that boots the production bundle on loopback with `ALLOW_TEST_ACCOUNTS=1`. Those runs
 *      are same-origin anyway (rule 1), so this is redundancy, not the load-bearing path.
 *
 * Pure and env-injected, so `server/__tests__/cors-allowlist.test.ts` proves every case without
 * booting the server.
 */
import type { Request, Response, NextFunction } from "express";
import { isProdStrictEnv } from "../utils/stripe-key-policy";

/** Normalize to a bare scheme://host[:port], lowercased. Returns null for anything unparseable. */
export function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function addOrigin(set: Set<string>, value: string | undefined | null): void {
  const normalized = normalizeOrigin(value);
  if (normalized) set.add(normalized);
}

/**
 * The static, env-derived allowlist. Same-origin and the localhost rule are decided per request in
 * `resolveCorsAllowOrigin` and are deliberately NOT baked in here (they depend on the request).
 */
export function buildCorsAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const allowed = new Set<string>();

  for (const entry of (env.CORS_ALLOWED_ORIGINS || "").split(",")) {
    addOrigin(allowed, entry);
  }

  addOrigin(allowed, env.APP_BASE_URL);

  // REPLIT_DOMAINS / REPLIT_DEV_DOMAIN carry bare HOSTNAMES, not origins.
  const replitHosts = [
    ...(env.REPLIT_DOMAINS || "").split(","),
    env.REPLIT_DEV_DOMAIN || "",
  ];
  for (const raw of replitHosts) {
    const host = raw.trim();
    if (!host) continue;
    addOrigin(allowed, `https://${host}`);
    addOrigin(allowed, `http://${host}`);
  }

  return allowed;
}

/** Loopback origins, allowed only outside a production-strict boot. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
}

export interface CorsRequestShape {
  /** The request's own Origin header, if any. */
  origin?: string;
  /** The request's Host header (`req.headers.host`). */
  host?: string;
  /** The connection scheme the app sees (`req.protocol`). */
  protocol?: string;
  /** `X-Forwarded-Proto`, when a TLS terminator sits in front. */
  forwardedProto?: string;
}

/**
 * The origin to echo in `Access-Control-Allow-Origin`, or null to send NO such header.
 * Never returns `"*"`.
 */
export function resolveCorsAllowOrigin(
  req: CorsRequestShape,
  allowlist: Set<string>,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const origin = normalizeOrigin(req.origin);
  if (!origin) return null;

  // 1. Same origin as the request itself.
  if (req.host) {
    const scheme = (req.forwardedProto || req.protocol || "https").split(",")[0].trim().toLowerCase();
    const self = normalizeOrigin(`${scheme === "http" ? "http" : "https"}://${req.host}`);
    if (self && self === origin) return origin;
  }

  // 2-4. The env-derived allowlist.
  if (allowlist.has(origin)) return origin;

  // 5. Loopback, outside a production-strict boot only.
  if (!isProdStrictEnv(env) && isLoopbackOrigin(origin)) return origin;

  return null;
}

/**
 * The API CORS middleware itself. `server/index.ts` mounts this at `/api`; the test suite mounts
 * the SAME function, so there is exactly one implementation of the header policy.
 *
 * - `Vary: Origin` on every response, allowed or not, so a shared cache cannot serve one origin's
 *   decision to another.
 * - `Access-Control-Allow-Origin` ONLY for an allowed origin, echoed exactly — never `*`.
 * - `Access-Control-Allow-Credentials` ONLY alongside an allowed origin.
 * - A preflight is answered 204 either way; without an allow-origin header the browser refuses the
 *   real request, which is the deny.
 */
export function createCorsMiddleware(env: NodeJS.ProcessEnv = process.env) {
  const allowlist = buildCorsAllowlist(env);
  return function corsMiddleware(req: Request, res: Response, next: NextFunction) {
    res.setHeader("Vary", "Origin");
    const allowOrigin = resolveCorsAllowOrigin(
      {
        origin: req.headers.origin as string | undefined,
        host: req.headers.host,
        protocol: req.protocol,
        forwardedProto: req.headers["x-forwarded-proto"] as string | undefined,
      },
      allowlist,
      env,
    );
    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}
