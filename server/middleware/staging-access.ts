/**
 * STAGING ACCESS GATE — launch checklist item 12 (decision-maker §9 rulings, Nov 8, 2026: "Access gate: basic auth";
 * ledger `2026-11-09-staging-item12-seeds`).
 *
 * ACTIVE ONLY WHEN `ENVIRONMENT=staging` (exact, case-insensitive). Everywhere else this is a no-op — production does
 * not carry that value, and `ENVIRONMENT=PROD` can never reach the gated branch.
 *
 * On staging:
 *   · every response carries `X-Robots-Tag: noindex, nofollow`, and `GET /robots.txt` answers `Disallow: /`;
 *   · every request needs HTTP basic auth matching `STAGING_BASIC_AUTH_USER` / `STAGING_BASIC_AUTH_PASSWORD`;
 *   · FAIL CLOSED: if either is unset the gate answers 503 to everything it guards — an open-mode deployment with a
 *     missing credential is a public sign-up hole, not an open door.
 *
 * EXEMPT, each with its reason (the list is the whole of it):
 *   · `/health`, `/health/ready`, `/health/live`, `/api/health`, `/api/ready` — uptime and readiness probes;
 *   · Stripe / Resend webhooks — they cannot answer a challenge and are signature-verified by their own handlers;
 *   · `GET /` from a NON-browser (no `text/html` in Accept) — the deployment's startup probe hits `/` and must get its
 *     200 (`server/index.ts` pre-binds for exactly that probe). A browser navigation sends `text/html` and is gated.
 *
 * THE GATE COOKIE (ledger `2026-11-09-staging-gate-cookie`). A browser re-sends cached basic credentials up front only for
 * paths under the one it first authenticated on, so other same-origin requests go out bare, take a 401 challenge and are
 * retried — the intermittent 401s on `/api/*`. A request that passes basic auth on a NON-exempt path therefore also gets
 * `stg_gate` = `<expiry>.<HMAC-SHA256(key, LABEL + "." + expiry)>`, key = HMAC-SHA256(STAGING_BASIC_AUTH_PASSWORD,
 * "stg_gate"): HttpOnly, Secure, SameSite=Lax, Path=/, 12 h. The gate accepts valid basic auth OR a valid unexpired
 * cookie. No shared state, so every instance verifies it alike; rotating the password invalidates every cookie.
 * Every 401 is logged at warn with the instance id, the path and the reason — never a header, cookie or Secret value.
 */
import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../infrastructure/logger";
import { stagingAuthDiagnostics } from "../replit_integrations/auth/staging-auth-diagnostics";

export const STAGING_GATE_COOKIE = "stg_gate";
export const STAGING_GATE_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
const STAGING_GATE_COOKIE_LABEL = "stg_gate.v1";

/** Same nonce-suffixed process identity as auth diagnostics; hostname:pid can collide across containers. */
export const STAGING_GATE_INSTANCE_ID = stagingAuthDiagnostics.instance;

export type StagingChallengeReason = "no_authorization_header" | "credentials_mismatch" | "malformed_or_wrong_scheme";
export type StagingCookieState = "absent" | "invalid" | "expired" | "valid";

export function stagingAccessActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ENVIRONMENT ?? "").trim().toLowerCase() === "staging";
}

const EXEMPT_EXACT = new Set(["/health", "/health/ready", "/health/live", "/api/health", "/api/ready", "/api/webhooks", "/api/bookings/webhooks/stripe"]);

/** Pure: is this request outside the gate? */
export function stagingAccessExempt(req: { method: string; path: string; accept?: string | null }): boolean {
  if (EXEMPT_EXACT.has(req.path)) return true;
  if (req.path.startsWith("/api/webhooks/")) return true;
  if (req.method === "GET" && req.path === "/" && !(req.accept ?? "").includes("text/html")) return true;
  return false;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function gateCookieKey(password: string): Buffer {
  return crypto.createHmac("sha256", password).update(STAGING_GATE_COOKIE).digest();
}

function gateCookieMac(password: string, expiry: number): string {
  return crypto.createHmac("sha256", gateCookieKey(password)).update(`${STAGING_GATE_COOKIE_LABEL}.${expiry}`).digest("hex");
}

/** Pure: the cookie value for an expiry (unix seconds). */
export function signStagingGateCookie(password: string, expiry: number): string {
  return `${expiry}.${gateCookieMac(password, expiry)}`;
}

/** Pure: is this cookie value one this password signed, and still unexpired at `nowSeconds`? */
export function verifyStagingGateCookie(value: string | null | undefined, password: string, nowSeconds: number): StagingCookieState {
  if (!value) return "absent";
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(value);
  if (!m || !password) return "invalid";
  const expiry = Number(m[1]);
  if (!safeEqual(m[2], gateCookieMac(password, expiry))) return "invalid";
  // An expiry further out than one Max-Age was not minted by this gate.
  if (expiry > nowSeconds + STAGING_GATE_COOKIE_MAX_AGE_SECONDS) return "invalid";
  return expiry > nowSeconds ? "valid" : "expired";
}

/** Pure: the `stg_gate` value from a Cookie header (no cookie-parser runs this early). */
export function readStagingGateCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === STAGING_GATE_COOKIE) return part.slice(eq + 1).trim();
  }
  return null;
}

export type StagingAccessResult =
  | { decision: "pass"; via: "inactive" | "exempt" | "basic" | "cookie" }
  | { decision: "misconfigured" }
  | { decision: "challenge"; reason: StagingChallengeReason; cookie: Exclude<StagingCookieState, "valid"> };

/** Pure: the gate's answer for one request, with how it passed or why it was challenged. */
export function stagingAccessEvaluate(
  req: { method: string; path: string; accept?: string | null; authorization?: string | null; cookie?: string | null },
  env: NodeJS.ProcessEnv = process.env,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): StagingAccessResult {
  if (!stagingAccessActive(env)) return { decision: "pass", via: "inactive" };
  if (stagingAccessExempt(req)) return { decision: "pass", via: "exempt" };
  const user = env.STAGING_BASIC_AUTH_USER ?? "";
  const pass = env.STAGING_BASIC_AUTH_PASSWORD ?? "";
  if (!user || !pass) return { decision: "misconfigured" };
  const header = req.authorization ?? "";
  let reason: StagingChallengeReason;
  if (!header) reason = "no_authorization_header";
  else if (!header.startsWith("Basic ")) reason = "malformed_or_wrong_scheme";
  else {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i < 0) reason = "malformed_or_wrong_scheme";
    else {
      const ok = safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass);
      if (ok) return { decision: "pass", via: "basic" };
      reason = "credentials_mismatch";
    }
  }
  const cookie = verifyStagingGateCookie(readStagingGateCookie(req.cookie), pass, nowSeconds);
  if (cookie === "valid") return { decision: "pass", via: "cookie" };
  return { decision: "challenge", reason, cookie };
}

/** Pure: the gate's answer for one request. */
export function stagingAccessDecision(
  req: { method: string; path: string; accept?: string | null; authorization?: string | null; cookie?: string | null },
  env: NodeJS.ProcessEnv = process.env,
  nowSeconds?: number,
): "pass" | "challenge" | "misconfigured" {
  return stagingAccessEvaluate(req, env, nowSeconds).decision;
}

export function stagingAccessGate(
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = () => Math.floor(Date.now() / 1000),
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!stagingAccessActive(env)) return next();
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (req.method === "GET" && req.path === "/robots.txt") {
      res.type("text/plain").send("User-agent: *\nDisallow: /\n");
      return;
    }
    const nowSeconds = now();
    const result = stagingAccessEvaluate(
      {
        method: req.method,
        path: req.path,
        accept: req.headers.accept ?? null,
        authorization: req.headers.authorization ?? null,
        cookie: req.headers.cookie ?? null,
      },
      env,
      nowSeconds,
    );
    if (result.decision === "pass") {
      if (result.via === "basic") {
        const expiry = nowSeconds + STAGING_GATE_COOKIE_MAX_AGE_SECONDS;
        res.cookie(STAGING_GATE_COOKIE, signStagingGateCookie(env.STAGING_BASIC_AUTH_PASSWORD ?? "", expiry), {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: STAGING_GATE_COOKIE_MAX_AGE_SECONDS * 1000,
          encode: (v: string) => v,
        });
      }
      return next();
    }
    if (result.decision === "misconfigured") {
      res.status(503).type("text/plain").send("Staging access is not configured.");
      return;
    }
    logger.warn(
      { instance: STAGING_GATE_INSTANCE_ID, method: req.method, path: req.path, reason: result.reason, gateCookie: result.cookie },
      "staging gate 401",
    );
    res.setHeader("WWW-Authenticate", 'Basic realm="Traveloure staging", charset="UTF-8"');
    res.status(401).type("text/plain").send("Authentication required.");
  };
}
