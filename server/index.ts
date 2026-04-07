import express, { type Request, Response, NextFunction, RequestHandler } from "express";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedCategories } from "./seed-categories";
import { seedExperienceTypes } from "./seed-experience-types";
import { seedExpertServices, seedCustomServices, seedMockExperts, seedProviderServices } from "./seed-expert-services";
import { seedDestinationCalendar } from "./seed-destination-calendar";
import { seedExperienceTemplateTabs } from "./seeds/experience-template-tabs.seed";
import { seedTravelPulseData } from "./seed-travelpulse";
import { setupWebSocket } from "./websocket";
import { cacheSchedulerService } from "./services/cache-scheduler.service";
import {
  logger,
  httpLogger,
  createHealthRouter,
  createMetricsRouter,
  metricsMiddleware,
  globalErrorHandler,
  notFoundHandler,
  generalRateLimiter,
  aiRateLimiter,
  searchRateLimiter,
  authRateLimiter,
} from "./infrastructure";

const app = express();
const httpServer = createServer(app);

setupWebSocket(httpServer);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-serve-static-core" {
  interface Request {
    id?: string;
  }
}

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
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf;
    },
  }) as RequestHandler,
);

app.use(express.urlencoded({ extended: false }) as RequestHandler);

app.use(metricsMiddleware() as RequestHandler);

app.use("/api", generalRateLimiter as RequestHandler);
app.use("/api/ai", aiRateLimiter as RequestHandler);
app.use("/api/search", searchRateLimiter as RequestHandler);
app.use("/api/hotels", searchRateLimiter as RequestHandler);
app.use("/api/flights", searchRateLimiter as RequestHandler);
app.use("/api/activities", searchRateLimiter as RequestHandler);
app.use("/api/auth", authRateLimiter as RequestHandler);

export function log(message: string, source = "express") {
  logger.info({ source }, message);
}

// Readiness state for database seeding
let seedingComplete = false;
let seedingStartTime: number | null = null;
let seedingDurationMs: number | null = null;

export function isSeedingComplete(): boolean {
  return seedingComplete;
}

export function getSeedingStatus(): { complete: boolean; durationMs: number | null } {
  return { complete: seedingComplete, durationMs: seedingDurationMs };
}

// Readiness endpoint for checking if seeding is complete
app.get("/api/ready", (_req: Request, res: Response) => {
  const status = getSeedingStatus();
  if (status.complete) {
    res.json({ ready: true, seedingDurationMs: status.durationMs });
  } else {
    res.status(503).json({ ready: false, message: "Database seeding in progress" });
  }
});

// Run database seeding in background (non-blocking)
async function runDatabaseSeeding() {
  seedingStartTime = Date.now();
  logger.info("Database seeding started");

  try {
    const result = await seedCategories();
    if (result.created > 0) {
      logger.info({ count: result.created }, "Seeded new service categories");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed categories");
  }

  try {
    const expResult = await seedExperienceTypes();
    if (expResult.created > 0) {
      logger.info({ count: expResult.created }, "Seeded new experience types");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed experience types");
  }

  try {
    await seedExperienceTemplateTabs();
  } catch (err) {
    logger.error({ err }, "Failed to seed experience template tabs");
  }

  try {
    await seedExpertServices();
  } catch (err) {
    logger.error({ err }, "Failed to seed expert services");
  }

  try {
    await seedCustomServices();
  } catch (err) {
    logger.error({ err }, "Failed to seed custom services");
  }

  try {
    await seedMockExperts();
  } catch (err) {
    logger.error({ err }, "Failed to seed mock experts");
  }

  try {
    await seedProviderServices();
  } catch (err) {
    logger.error({ err }, "Failed to seed provider services");
  }

  try {
    await seedDestinationCalendar();
  } catch (err) {
    logger.error({ err }, "Failed to seed destination calendar");
  }

  try {
    const travelPulseResult = await seedTravelPulseData();
    if (travelPulseResult.created > 0) {
      logger.info({ count: travelPulseResult.created }, "Seeded TravelPulse XAI data");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed TravelPulse data");
  }
  
  seedingDurationMs = Date.now() - seedingStartTime;
  seedingComplete = true;
  logger.info({ durationMs: seedingDurationMs }, "Database seeding complete");
}

(async () => {
  await registerRoutes(httpServer, app);

  // Set up frontend serving before error handlers
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Error handlers must come after Vite so SPA routes are served first
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  const port = parseInt(process.env.PORT || "5000", 10);

  process.on("SIGTERM", () => {
    httpServer.close(() => {
      logger.info("Server closed on SIGTERM");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000);
  });
  process.on("SIGINT", () => {
    httpServer.close(() => {
      logger.info("Server closed on SIGINT");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000);
  });

  async function tryListen(retriesLeft: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = async (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && retriesLeft > 0) {
          logger.warn({ port }, `Port ${port} in use — killing stale listener and retrying`);
          httpServer.removeListener("error", onError);
          try {
            const { execSync } = await import("child_process");
            execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore" });
          } catch {}
          await new Promise(r => setTimeout(r, 800));
          resolve(tryListen(retriesLeft - 1));
        } else if (err.code === "EADDRINUSE") {
          logger.error({ port }, `Port ${port} still in use after retry — giving up`);
          process.exit(1);
        } else {
          reject(err);
        }
      };

      httpServer.once("error", onError);
      httpServer.listen({ port, host: "0.0.0.0" }, () => {
        httpServer.removeListener("error", onError);
        logger.info({ port }, "Server started");

        // Start cache scheduler
        cacheSchedulerService.start();
        logger.info("Cache scheduler started");

        // One-time admin promotion
        import("./db").then(({ pool }) => {
          pool.query("UPDATE users SET role = 'admin' WHERE email = 'm.dixon5030@gmail.com' AND role != 'admin'")
            .then((res: any) => { if (res.rowCount > 0) logger.info("Promoted m.dixon5030@gmail.com to admin"); })
            .catch((err: any) => logger.error({ err }, "Admin promotion query failed"));
        }).catch(() => {});

        // Run database seeding in background AFTER server is listening
        runDatabaseSeeding().catch(err => {
          logger.error({ err }, "Background seeding failed");
        });

        resolve();
      });
    });
  }

  await tryListen(3);
})();
