/**
 * internal-jobs-limiter.ts — rate limit + failed-auth lockout for /internal/*.
 *
 * Lane: internal-jobs-hardening, L1. Finding F3.
 *
 * Every other rate limiter in this app mounts on an `/api…` prefix
 * (server/index.ts), but the machine-to-machine job runners are registered at a BARE `/internal`
 * (server/routes.ts, `app.use(internalRoutes)`). So `/internal/*` was the only session-less
 * surface on the app with NO rate limit at all: unlimited guesses at INTERNAL_JOB_SECRET, no
 * lockout, no alerting — guarding "release earnings" and "auto-complete bookings". The repository
 * is public, so the workflow file also publishes every internal route name; the guessing target
 * was never a secret.
 *
 * Two independent caps, checked in this order:
 *   1. LOCKOUT — 10 consecutive 401s from one IP locks that IP out for an hour. A correct secret
 *      resets the streak, so a healthy cron never approaches it while a guesser is stopped after
 *      ten tries. Checked BEFORE the rate cap so a guesser cannot spend a fresh window walking
 *      the space 30 attempts at a time.
 *   2. RATE CAP — 30 requests / 15 minutes / IP. The real cron's busiest bucket is 3 routes every
 *      15 minutes, so this is ~10x headroom for the legitimate caller.
 *
 * The guard's SEMANTICS are untouched (L1): 503-while-unconfigured and 401-on-wrong-secret still
 * come from requireInternalSecret in the router. This middleware only decides whether a request
 * gets to ask. It is deliberately mounted in server/index.ts BEFORE the router rather than inside
 * internal.routes.ts, so `internal-jobs-auth.http.test.ts` — which mounts the bare router and
 * fires 30 deliberate 401s — keeps passing unmodified.
 *
 * NO LOOPBACK ESCAPE HATCH, on purpose: unlike the /api limiters, nothing in CI drives /internal
 * from loopback at volume, and RATE_LIMIT_LOOPBACK_SKIP here would disable the lockout in exactly
 * the environment where these tests need it live.
 *
 * KNOWN LIMIT (pre-existing, not introduced here): the app does not set Express `trust proxy`, so
 * `req.ip` is the socket peer. Behind a platform proxy every caller can share one bucket. That is
 * true of every limiter in this codebase; changing it is a platform-wide decision, filed rather
 * than made here.
 */
import type { Request, Response, NextFunction } from "express";
import { logger } from "../infrastructure/logger";

export const INTERNAL_WINDOW_MS = 15 * 60 * 1000;
export const INTERNAL_MAX_REQUESTS = 30;
export const INTERNAL_AUTH_FAILURE_THRESHOLD = 10;
export const INTERNAL_LOCKOUT_MS = 60 * 60 * 1000;

interface IpState {
  /** Rolling request count for the rate cap. */
  count: number;
  /** When the rate-cap window resets. */
  resetTime: number;
  /** Consecutive 401s; any non-401 response clears it. */
  authFailures: number;
  /** Epoch ms until which this IP is locked out, or 0. */
  lockedUntil: number;
}

const state = new Map<string, IpState>();

// Housekeeping only — unref'd so it never holds the event loop open (same reasoning as
// InMemoryRateLimiter's sweep in infrastructure/rate-limiter.ts).
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(state.entries())) {
    if (entry.resetTime < now && entry.lockedUntil < now && entry.authFailures === 0) {
      state.delete(key);
    }
  }
}, 60_000);
sweep.unref?.();

function keyFor(req: Request): string {
  return `internal:${req.ip || "unknown"}`;
}

function entryFor(key: string, now: number): IpState {
  const existing = state.get(key);
  if (!existing) {
    const fresh: IpState = { count: 0, resetTime: now + INTERNAL_WINDOW_MS, authFailures: 0, lockedUntil: 0 };
    state.set(key, fresh);
    return fresh;
  }
  if (existing.resetTime < now) {
    existing.count = 0;
    existing.resetTime = now + INTERNAL_WINDOW_MS;
  }
  return existing;
}

function tooMany(res: Response, retryAfterSec: number, message: string): void {
  res.setHeader("Retry-After", String(retryAfterSec));
  res.status(429).json({
    error: "Too Many Requests",
    message,
    retryAfter: retryAfterSec,
  });
}

export function internalJobsLimiter(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = keyFor(req);
  const entry = entryFor(key, now);

  // (1) Lockout wins over everything, including a request that would pass the rate cap.
  if (entry.lockedUntil > now) {
    const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
    logger.warn({ ip: req.ip, path: req.path, retryAfter }, "[internal-jobs] locked out — repeated auth failures");
    tooMany(res, retryAfter, "Locked out after repeated authentication failures.");
    return;
  }

  // (2) Rate cap.
  entry.count += 1;
  res.setHeader("X-RateLimit-Limit", String(INTERNAL_MAX_REQUESTS));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, INTERNAL_MAX_REQUESTS - entry.count)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetTime / 1000)));
  if (entry.count > INTERNAL_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    logger.warn(
      { ip: req.ip, path: req.path, count: entry.count, limit: INTERNAL_MAX_REQUESTS },
      "[internal-jobs] rate limit exceeded",
    );
    tooMany(res, retryAfter, "Rate limit exceeded for internal job endpoints.");
    return;
  }

  // (3) Observe the outcome so consecutive auth failures can trip the lockout. Reading the status
  // on 'finish' is what lets this stay OUTSIDE the router: the guard's own 401/503 semantics are
  // never touched, only counted.
  res.on("finish", () => {
    const live = state.get(key);
    if (!live) return;
    if (res.statusCode === 401) {
      live.authFailures += 1;
      if (live.authFailures >= INTERNAL_AUTH_FAILURE_THRESHOLD && live.lockedUntil <= Date.now()) {
        live.lockedUntil = Date.now() + INTERNAL_LOCKOUT_MS;
        logger.error(
          { ip: req.ip, failures: live.authFailures, lockoutMinutes: INTERNAL_LOCKOUT_MS / 60000 },
          "[internal-jobs] locking out IP after consecutive authentication failures",
        );
      }
    } else if (res.statusCode !== 429) {
      // A correct secret (or a 503 while unconfigured) clears the streak; a 429 is not an outcome
      // of an authentication attempt and must not reset a guesser's counter.
      live.authFailures = 0;
    }
  });

  next();
}

/** Test seam — clears all per-IP state. Never called in production. */
export function __resetInternalJobsLimiter(): void {
  state.clear();
}
