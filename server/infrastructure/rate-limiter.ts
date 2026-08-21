import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  handler?: (req: Request, res: Response) => void;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class InMemoryRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    // .unref() so this housekeeping timer never by itself holds the event loop open.
    // Without it the process cannot exit on its own — which surfaces as hanging test
    // runs and a delayed graceful shutdown, not as a user-visible bug. The sweep is
    // pure cache eviction; there is nothing to finish before exit.
    this.cleanupInterval.unref?.();
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.store.entries());
    for (const [key, entry] of entries) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  increment(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || existing.resetTime < now) {
      const entry = { count: 1, resetTime: now + windowMs };
      this.store.set(key, entry);
      return entry;
    }

    existing.count += 1;
    return existing;
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

const limiterStore = new InMemoryRateLimiter();

export function createRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req) => req.ip || "unknown",
    skip = () => false,
    handler = (req, res) => {
      res.status(429).json({
        error: "Too Many Requests",
        message: `Rate limit exceeded. Try again in ${Math.ceil(windowMs / 1000)} seconds.`,
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skip(req)) {
      next();
      return;
    }

    const key = keyGenerator(req);
    const { count, resetTime } = limiterStore.increment(key, windowMs);
    const remaining = Math.max(0, maxRequests - count);

    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(resetTime / 1000).toString());

    if (count > maxRequests) {
      logger.warn(
        { ip: req.ip, path: req.path, count, limit: maxRequests },
        "Rate limit exceeded"
      );
      handler(req, res);
      return;
    }

    next();
  };
}

/**
 * Is this request coming from loopback (127.0.0.1 / ::1 / ::ffff:127.0.0.1)?
 * Loopback is not spoofable from off-box: it is the socket's real peer address,
 * not a header. (Express only derives `req.ip` from X-Forwarded-For when
 * `trust proxy` is enabled, and even then the leftmost hop is a public address.)
 */
function isLoopback(req: Request): boolean {
  const ip = req.ip ?? "";
  return ip === "127.0.0.1" || ip === "::1" || ip.endsWith(":127.0.0.1");
}

/**
 * THE CI ESCAPE HATCH — one predicate, used by every limiter a CI gate can trip.
 *
 * CI Playwright gates drive hundreds of same-IP localhost requests per run (every
 * page load fans out many /api calls from 127.0.0.1, and the journey suite mints a
 * fresh registered user per test), which trips per-IP caps and 429s late tests.
 * The harness sets RATE_LIMIT_LOOPBACK_SKIP=1 to exempt loopback ONLY.
 * NEVER set this in production.
 *
 * WHY THIS IS SHARED (Journey Wave 1 fix): `authRateLimiter` used to gate its
 * loopback exemption on `NODE_ENV !== "production"` instead of reading this flag.
 * The journey-suite workflow boots the PRODUCTION bundle with NODE_ENV=production
 * (that is the point — it tests the real bundle) and dutifully sets
 * RATE_LIMIT_LOOPBACK_SKIP=1, which the auth limiter then ignored. Result: the
 * 11th POST /api/auth/register in a run got a 429 carrying the limiter's full
 * fifteen-minute retry-after, and
 * every journey after it failed inside registerUser. A documented escape hatch
 * that only half the limiters honour is worse than none — so it lives here once.
 */
function loopbackSkip(req: Request): boolean {
  return process.env.RATE_LIMIT_LOOPBACK_SKIP === "1" && isLoopback(req);
}

export const generalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: (req) => `general:${req.ip || "unknown"}`,
  skip: loopbackSkip,
});

export const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyGenerator: (req) => `ai:${req.ip || "unknown"}`,
});

export const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyGenerator: (req) => `search:${req.ip || "unknown"}`,
});

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyGenerator: (req) => `auth:${req.ip || "unknown"}:${req.path}`,
  skip: (req) => {
    if (req.method === "GET") return true;
    // Loopback in a non-production boot (dev + the dev-mode E2E gates).
    if (process.env.NODE_ENV !== "production" && isLoopback(req)) return true;
    // Loopback in a PRODUCTION-bundle CI boot (journey-suite): the same documented
    // escape hatch every other limiter honours. Without this the 10-per-15-minutes
    // cap 429s POST /api/auth/register partway through a suite run. See loopbackSkip.
    return loopbackSkip(req);
  },
});

export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  keyGenerator: (req) => `strict:${req.ip || "unknown"}:${req.path}`,
  skip: (req) => (process.env.NODE_ENV !== "production" && isLoopback(req)) || loopbackSkip(req),
});

export const adminRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyGenerator: (req) => `admin:${req.ip || "unknown"}`,
});

export const heavyReadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyGenerator: (req) => `heavy:${req.ip || "unknown"}`,
});

export const leadRoutingRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyGenerator: (req) => `lead:${req.ip || "unknown"}`,
});
