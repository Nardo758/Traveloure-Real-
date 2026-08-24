import { Router, Request, Response } from "express";
import client from "prom-client";

const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const activeConnections = new client.Gauge({
  name: "active_connections",
  help: "Number of active connections",
  registers: [register],
});

export const databaseQueryDuration = new client.Histogram({
  name: "database_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "table"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

export const externalApiCalls = new client.Counter({
  name: "external_api_calls_total",
  help: "Total number of external API calls",
  labelNames: ["service", "status"],
  registers: [register],
});

export const externalApiDuration = new client.Histogram({
  name: "external_api_duration_seconds",
  help: "Duration of external API calls in seconds",
  labelNames: ["service"],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const circuitBreakerState = new client.Gauge({
  name: "circuit_breaker_state",
  help: "Circuit breaker state (0=closed, 1=half-open, 2=open)",
  labelNames: ["name"],
  registers: [register],
});

export const cacheHits = new client.Counter({
  name: "cache_hits_total",
  help: "Total number of cache hits",
  labelNames: ["cache_type"],
  registers: [register],
});

export const cacheMisses = new client.Counter({
  name: "cache_misses_total",
  help: "Total number of cache misses",
  labelNames: ["cache_type"],
  registers: [register],
});

export const aiRequestDuration = new client.Histogram({
  name: "ai_request_duration_seconds",
  help: "Duration of AI API requests in seconds",
  labelNames: ["provider", "operation"],
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

export const aiTokensUsed = new client.Counter({
  name: "ai_tokens_used_total",
  help: "Total number of AI tokens used",
  labelNames: ["provider", "type"],
  registers: [register],
});

export function metricsMiddleware() {
  return (req: Request, res: Response, next: () => void) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path;
      const labels = {
        method: req.method,
        route: route,
        status_code: res.statusCode.toString(),
      };

      httpRequestDuration.observe(labels, duration);
      httpRequestTotal.inc(labels);
    });

    next();
  };
}

export function createMetricsRouter(): Router {
  const router = Router();

  router.get("/metrics", async (_req: Request, res: Response) => {
    try {
      res.set("Content-Type", register.contentType);
      const metrics = await register.metrics();
      res.end(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to collect metrics" });
    }
  });

  return router;
}

export { register };
