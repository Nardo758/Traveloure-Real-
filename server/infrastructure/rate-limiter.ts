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

export const generalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyGenerator: (req) => `general:${req.ip || "unknown"}`,
  skip: (req) => {
    // CI Playwright gates drive hundreds of same-IP localhost requests per
    // minute (every page load fans out many /api calls from 127.0.0.1), which
    // trips this per-IP cap and 429s late tests. The harness sets
    // RATE_LIMIT_LOOPBACK_SKIP=1 to exempt loopback only. NEVER set this in
    // production.
    if (process.env.RATE_LIMIT_LOOPBACK_SKIP === "1") {
      const ip = req.ip ?? "";
      if (ip === "127.0.0.1" || ip === "::1" || ip.endsWith(":127.0.0.1")) return true;
    }
    return false;
  },
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
  maxRequests: 20,
  keyGenerator: (req) => `auth:${req.ip || "unknown"}:${req.path}`,
  skip: (req) => {
    if (req.method === "GET") return true;
    // Skip for loopback in non-production (E2E tests run from localhost)
    if (process.env.NODE_ENV !== "production") {
      const ip = req.ip ?? "";
      if (ip === "127.0.0.1" || ip === "::1" || ip.endsWith(":127.0.0.1")) return true;
    }
    return false;
  },
});

export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  keyGenerator: (req) => `strict:${req.ip || "unknown"}`,
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
