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

function isBypassRequest(req: Request): boolean {
  const bypassKey = process.env.RATE_LIMIT_BYPASS_KEY;
  if (!bypassKey) return false;
  return req.headers["x-test-token"] === bypassKey;
}

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
    if (isBypassRequest(req) || skip(req)) {
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
});

function getAiKey(req: Request): string {
  const user = (req as any).user;
  const userId = user?.claims?.sub ?? user?.id;
  if (userId) return `ai:user:${userId}`;
  return `ai:ip:${req.ip || "unknown"}`;
}

export const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyGenerator: getAiKey,
  handler: (req, res) => {
    res.status(429).json({
      error: "AI rate limit exceeded",
      message: "You've made too many AI requests. Please wait a minute before trying again.",
      retryAfter: 60,
    });
  },
});

export const aiHourlyRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 200,
  keyGenerator: (req) => {
    const user = (req as any).user;
    const userId = user?.claims?.sub ?? user?.id;
    if (userId) return `ai:hourly:user:${userId}`;
    return `ai:hourly:ip:${req.ip || "unknown"}`;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: "AI hourly limit exceeded",
      message: "You've reached your hourly AI request limit. Please try again in an hour.",
      retryAfter: 3600,
    });
  },
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
  skip: (req) => req.method === "GET",
});

export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  keyGenerator: (req) => `strict:${req.ip || "unknown"}`,
});
