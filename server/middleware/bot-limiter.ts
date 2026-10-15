/**
 * bot-limiter.ts — rate limit for /api/bot/* (BOT-1 Phase 1 ruling 1; ledger `2026-10-15-bot1-phase1`).
 *
 * Mounted in server/index.ts beside the /internal limiter, BEFORE the router. The general /api limit still
 * applies on top of it.
 *
 *   1. RATE CAP — keyed by the TOKEN, not the IP (the ruling): the key is the SHA-256 of the Bearer token, the same
 *      digest the router looks the bot up by, so each bot has its own bucket without a database read here. The app
 *      sets no `trust proxy`, so an IP key would put every caller behind the platform proxy in one bucket.
 *   2. LOCKOUT — 10 consecutive 401s from one IP lock that IP out for an hour, so a guesser cannot mint a fresh
 *      bucket per guess. A good token resets the streak.
 */
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../infrastructure/logger";

export const BOT_WINDOW_MS = 15 * 60 * 1000;
export const BOT_MAX_REQUESTS = 120;
export const BOT_AUTH_FAILURE_THRESHOLD = 10;
export const BOT_LOCKOUT_MS = 60 * 60 * 1000;

const buckets = new Map<string, { count: number; resetTime: number }>();
const failures = new Map<string, { streak: number; lockedUntil: number }>();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of Array.from(buckets.entries())) if (v.resetTime < now) buckets.delete(k);
  for (const [k, v] of Array.from(failures.entries())) if (v.lockedUntil < now && v.streak === 0) failures.delete(k);
}, 60_000);
sweep.unref?.();

/** The bucket a request counts against: the token's digest, or the IP when no token was sent. */
export function botLimiterKey(req: Request): string {
  const auth = String(req.headers.authorization ?? "");
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  return m ? `bot:${crypto.createHash("sha256").update(m[1]).digest("hex")}` : `bot-anon:${req.ip || "unknown"}`;
}

export function botLimiter(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const ipKey = `bot-ip:${req.ip || "unknown"}`;
  const fail = failures.get(ipKey);
  if (fail && fail.lockedUntil > now) {
    const retryAfter = Math.ceil((fail.lockedUntil - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Too Many Requests", message: "Locked out after repeated authentication failures.", retryAfter });
    return;
  }
  const key = botLimiterKey(req);
  let b = buckets.get(key);
  if (!b || b.resetTime < now) {
    b = { count: 0, resetTime: now + BOT_WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  res.setHeader("X-RateLimit-Limit", String(BOT_MAX_REQUESTS));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, BOT_MAX_REQUESTS - b.count)));
  if (b.count > BOT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((b.resetTime - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Too Many Requests", message: "Rate limit exceeded for bot endpoints.", retryAfter });
    return;
  }
  res.on("finish", () => {
    const f = failures.get(ipKey) ?? { streak: 0, lockedUntil: 0 };
    if (res.statusCode === 401) {
      f.streak += 1;
      if (f.streak >= BOT_AUTH_FAILURE_THRESHOLD && f.lockedUntil <= Date.now()) {
        f.lockedUntil = Date.now() + BOT_LOCKOUT_MS;
        logger.error({ ip: req.ip, failures: f.streak }, "[bot] locking out IP after consecutive authentication failures");
      }
      failures.set(ipKey, f);
    } else if (f.streak) {
      f.streak = 0;
      failures.set(ipKey, f);
    }
  });
  next();
}

/** Test seam: forget every bucket and lockout. */
export function resetBotLimiterForTests(): void {
  buckets.clear();
  failures.clear();
}
