import crypto from "node:crypto";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import {
  adminRateLimiter,
  aiRateLimiter,
  authRateLimiter,
  createHealthRouter,
  createMetricsRouter,
  generalRateLimiter,
  globalErrorHandler,
  httpLogger,
  metricsMiddleware,
  notFoundHandler,
  searchRateLimiter,
} from "./infrastructure";

const app: Express = express();

app.use((req: Request, _res: Response, next: NextFunction) => {
  req.id = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  next();
});
app.use(httpLogger as unknown as RequestHandler);
app.use(createHealthRouter());
app.use(createMetricsRouter());
app.use(
  express.json({
    limit: "10mb",
    verify: (req: any, _res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);
app.use(express.urlencoded({ extended: false }) as RequestHandler);
app.use(metricsMiddleware() as RequestHandler);

app.use("/api", generalRateLimiter as RequestHandler);
app.use("/api/ai", aiRateLimiter as RequestHandler);
app.use("/api/admin", adminRateLimiter as RequestHandler);
app.use("/api/search", searchRateLimiter as RequestHandler);
app.use("/api/hotels", searchRateLimiter as RequestHandler);
app.use("/api/flights", searchRateLimiter as RequestHandler);
app.use("/api/activities", searchRateLimiter as RequestHandler);
app.use("/api/auth", authRateLimiter as RequestHandler);

const corsAllowedOrigins = new Set(
  (process.env.REPLIT_DOMAINS || "")
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean)
    .flatMap((domain) => [`https://${domain}`, `http://${domain}`]),
);
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && (corsAllowedOrigins.has(origin) || corsAllowedOrigins.size === 0)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/api/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", service: "traveloure-api" });
});

export default app;

export function installPostRouteHandlers() {
  app.use("/api", notFoundHandler);
  app.use(notFoundHandler);
  app.use(globalErrorHandler);
}
