import express from "express";
import { createServer } from "node:http";
import type { Request, Response, RequestHandler } from "express";

async function startHarness(): Promise<void> {
  if (!process.env.DATABASE_URL || process.env.PROD_DATABASE_URL) {
    throw new Error("Provide the development DATABASE_URL and leave PROD_DATABASE_URL unset.");
  }
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    throw new Error("Set JOURNEY_DB_WRITES_OK=1 to opt in to fixture writes on the development database.");
  }

  process.env.NODE_ENV = "test";
  process.env.ENVIRONMENT = "TEST";
  process.env.SESSION_SECRET = "synthetic-verification-gate-harness-session-secret";
  process.env.SESSION_COOKIE_INSECURE = "1";
  process.env.STRIPE_SECRET_KEY = "sk_test_verification_gate_harness_only";

  for (const key of [
    "REPL_ID",
    "META_APP_ID",
    "META_APP_SECRET",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "TAVILY_API_KEY",
    "GOOGLE_MAPS_API_KEY",
    "PERSONA_API_KEY",
    "PERSONA_TEMPLATE_ID",
    "SENDGRID_API_KEY",
    "RESEND_API_KEY",
    "STRIPE_IDENTITY_WEBHOOK_SECRET",
    "STRIPE_CONNECT_WEBHOOK_SECRET",
    "STRIPE_WEBHOOK_SECRET",
  ]) {
    delete process.env[key];
  }

  const [
    { registerRoutes },
    { travelPulseScheduler },
    {
      createHealthRouter,
      createMetricsRouter,
      metricsMiddleware,
      notFoundHandler,
      globalErrorHandler,
      generalRateLimiter,
      aiRateLimiter,
      adminRateLimiter,
      searchRateLimiter,
      authRateLimiter,
    },
    {
      queryCounterMiddleware,
    },
    { internalJobsLimiter },
  ] = await Promise.all([
    import("../../routes"),
    import("../../services/travelpulse-scheduler.service"),
    import("../../infrastructure"),
    import("../../utils/queryCounter"),
    import("../../middleware/internal-jobs-limiter"),
  ]);

  const app = express();
  const server = createServer(app);
  app.use((req: Request, _res: Response, next) => {
    req.id = (req.headers["x-request-id"] as string) || `verification-harness-${Date.now()}`;
    next();
  });
  app.use(createHealthRouter());
  app.use(createMetricsRouter());
  app.use(express.json({
    limit: "10mb",
    verify: (req: any, _res: any, body: Buffer) => {
      (req as Request & { rawBody?: Buffer }).rawBody = body;
    },
  }) as RequestHandler);
  app.use(express.urlencoded({ extended: false }) as RequestHandler);
  app.use(metricsMiddleware() as RequestHandler);
  app.use("/api", generalRateLimiter as RequestHandler);
  app.use("/api/ai", aiRateLimiter as RequestHandler);
  app.use("/api/admin", adminRateLimiter as RequestHandler);
  app.use("/api/admin", queryCounterMiddleware as RequestHandler);
  app.use("/api/search", searchRateLimiter as RequestHandler);
  app.use("/api/hotels", searchRateLimiter as RequestHandler);
  app.use("/api/flights", searchRateLimiter as RequestHandler);
  app.use("/api/activities", searchRateLimiter as RequestHandler);
  app.use("/api/auth", authRateLimiter as RequestHandler);
  app.use("/internal", internalJobsLimiter as RequestHandler);

  await registerRoutes(server, app);
  // registerRoutes owns this one legacy scheduler start. Stop its five-minute delayed
  // timer immediately; no worker scheduler from server/index.ts is imported or started.
  await travelPulseScheduler.stop();
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  const port = Number(process.env.VERIFICATION_HARNESS_PORT ?? "4317");
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Verification harness did not bind a TCP loopback address");
  }
  console.log(`VERIFICATION_HARNESS_READY_PORT=${address.port}`);

  const shutdown = async () => {
    await travelPulseScheduler.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  };
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
}

void startHarness().catch((error) => {
  console.error("Could not start verification gate harness:", error);
  process.exitCode = 1;
});