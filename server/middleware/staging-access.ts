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
 */
import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

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

/** Pure: the gate's answer for one request. */
export function stagingAccessDecision(
  req: { method: string; path: string; accept?: string | null; authorization?: string | null },
  env: NodeJS.ProcessEnv = process.env,
): "pass" | "challenge" | "misconfigured" {
  if (!stagingAccessActive(env) || stagingAccessExempt(req)) return "pass";
  const user = env.STAGING_BASIC_AUTH_USER ?? "";
  const pass = env.STAGING_BASIC_AUTH_PASSWORD ?? "";
  if (!user || !pass) return "misconfigured";
  const header = req.authorization ?? "";
  if (!header.startsWith("Basic ")) return "challenge";
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 0) return "challenge";
  const ok = safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass);
  return ok ? "pass" : "challenge";
}

export function stagingAccessGate(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!stagingAccessActive(env)) return next();
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (req.method === "GET" && req.path === "/robots.txt") {
      res.type("text/plain").send("User-agent: *\nDisallow: /\n");
      return;
    }
    const decision = stagingAccessDecision(
      { method: req.method, path: req.path, accept: req.headers.accept ?? null, authorization: req.headers.authorization ?? null },
      env,
    );
    if (decision === "pass") return next();
    if (decision === "misconfigured") {
      res.status(503).type("text/plain").send("Staging access is not configured.");
      return;
    }
    res.setHeader("WWW-Authenticate", 'Basic realm="Traveloure staging", charset="UTF-8"');
    res.status(401).type("text/plain").send("Authentication required.");
  };
}
