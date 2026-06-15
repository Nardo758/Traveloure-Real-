import express, { type Request, Response, NextFunction, RequestHandler } from "express";
import crypto from "crypto";
import { createServer, request as httpRequest } from "http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { runMigrations } from "./migrations/run-migrations";
import { seedCategories } from "./seed-categories";
import { seedExperienceTypes } from "./seed-experience-types";
import { seedExpertServices, seedCustomServices, seedMockExperts, seedProviderServices } from "./seed-expert-services";
import { seedDestinationCalendar } from "./seed-destination-calendar";
import { seedExperienceTemplateTabs } from "./seeds/experience-template-tabs.seed";
import { seedTravelPulseData } from "./seed-travelpulse";
import { seedCityNeighborhoods } from "./seeds/city-neighborhoods.seed";
import { seedPopularCitiesContent } from "./seeds/popular-cities-content.seed";
import { seedMajorCitiesBackfill } from "./seeds/major-cities-backfill.seed";
import { seedPhaseDKyotoVendors } from "./seeds/phase-d-kyoto-vendors.seed";
import { seedRoleScopedTemplates } from "./seeds/role-scoped-templates.seed";
import { seedTripOwnership } from "./seeds/trip-ownership.seed";
import { seedE2EAccounts } from "./seeds/e2e-test-accounts.seed";
import { grokDiscoveryService } from "./services/grok-discovery.service";
import { setupWebSocket } from "./websocket";
import { cacheSchedulerService } from "./services/cache-scheduler.service";
import { bookingExpiryScheduler } from "./services/booking-expiry-scheduler.service";
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

// Build-identity endpoint — lets CI confirm it is talking to the correct artifact.
// GIT_COMMIT is injected by the CI workflow; falls back to "dev" locally.
app.get("/api/version", (_req: Request, res: Response) => {
  res.json({
    sha: process.env.GIT_COMMIT ?? "dev",
    env: process.env.NODE_ENV ?? "development",
  });
});

// Run database seeding in background (non-blocking).
// Migrations are intentionally NOT called here — they run before listen() so
// the server never accepts requests with a partially-migrated schema.
async function runDatabaseSeeding() {
  seedingStartTime = Date.now();
  logger.info("Database seeding started");

  // DISABLED: ESO backfill (see architectural decision in CLAUDE.md).
  //
  // Canonical service source: provider_services (not expert_service_offerings).
  // Reason: service_bookings.serviceId and service_reviews.serviceId already FK
  // to provider_services.id. Moving the approval workflow to ESO while leaving
  // transactions in provider_services fragments the booking/review/payment path.
  //
  // Schema changes: migration 011_provider_services_approval_status.sql adds all
  // required columns (approval_status, deliverables, cancellation_policy, etc.)
  //
  // Data migration: migration 012_migrate_expert_custom_services.sql copies
  // expert_custom_services → provider_services with category mapping
  // (expert_service_categories → service_categories by name). Idempotent.
  //
  // TODO (Phase 5): Drop ESO workflow columns (status, submittedAt, deliverables, etc.)
  // in migration 013 after confirming provider_services is stable in prod.
  // ESO will remain as a template/offering source for the signup flow.
  //
  // Previous: await runEsoBackfill();  // REMOVED — contradicted provider_services canonicality

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

  try {
    const neighborhoodResult = await seedCityNeighborhoods();
    if (neighborhoodResult.inserted > 0) {
      logger.info({ count: neighborhoodResult.inserted }, "Seeded city neighborhoods");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed city neighborhoods");
  }

  try {
    const popularCitiesResult = await seedPopularCitiesContent();
    if (popularCitiesResult.gems > 0 || popularCitiesResult.services > 0) {
      logger.info(
        { gems: popularCitiesResult.gems, services: popularCitiesResult.services },
        "Seeded popular cities content (hidden gems + services)",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed popular cities content");
  }

  try {
    const backfillResult = await seedMajorCitiesBackfill();
    if (backfillResult.neighborhoodsPatched > 0 || backfillResult.gemsInserted > 0 || backfillResult.travelerCountsFixed > 0) {
      logger.info(
        {
          neighborhoodsPatched: backfillResult.neighborhoodsPatched,
          gemsInserted: backfillResult.gemsInserted,
          travelerCountsFixed: backfillResult.travelerCountsFixed,
        },
        "Seeded major cities backfill (neighborhood slugs + new gems + traveler counts)",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed major cities backfill");
  }

  try {
    const phaseDResult = await seedPhaseDKyotoVendors();
    if (phaseDResult.vendorsInserted > 0 || phaseDResult.servicesInserted > 0) {
      logger.info(
        { vendors: phaseDResult.vendorsInserted, services: phaseDResult.servicesInserted },
        "Seeded Phase D Kyoto wedding & corporate vendors",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed Phase D Kyoto vendors");
  }

  try {
    const roleTplResult = await seedRoleScopedTemplates();
    if (roleTplResult.inserted > 0) {
      logger.info({ count: roleTplResult.inserted }, "Seeded role-scoped expert service templates");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed role-scoped templates");
  }

  try {
    const ownershipResult = await seedTripOwnership();
    if (ownershipResult.inserted > 0) {
      logger.info({ count: ownershipResult.inserted }, "Seeded trip owner collaborator rows");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed trip ownership collaborators");
  }

  // E2E test accounts — seeded in non-production environments only.
  // ENVIRONMENT=PROD is set in the shared env vars for the deployed app.
  // This guard prevents known-password admin test accounts from being created
  // in the live production database.
  if (process.env.ENVIRONMENT !== "PROD") {
    try {
      await seedE2EAccounts();
      logger.info("E2E test accounts ready (staging/dev)");
    } catch (err) {
      logger.error({ err }, "Failed to seed E2E test accounts");
    }
  }

  seedingDurationMs = Date.now() - seedingStartTime;
  seedingComplete = true;
  logger.info({ durationMs: seedingDurationMs }, "Database seeding complete");
}

(async () => {
  // Run migrations synchronously BEFORE the server accepts any connections.
  // A schema failure here exits the process — no requests land on a broken schema.
  try {
    await runMigrations();
  } catch (err) {
    logger.error({ err }, "FATAL: Database migrations failed — shutting down");
    process.exit(1);
  }

  await registerRoutes(httpServer, app);

  // Proxy /__mockup/* to the mockup sandbox dev server (port 23636)
  // Must be registered after API routes but before Vite's catch-all
  app.use("/__mockup", (req: Request, res: Response) => {
    const options = {
      hostname: "localhost",
      port: 23636,
      path: `/__mockup${req.url}`,
      method: req.method,
      headers: { ...req.headers, host: "localhost:23636" },
    };
    const proxy = httpRequest(options, (upstream) => {
      res.writeHead(upstream.statusCode ?? 200, upstream.headers);
      upstream.pipe(res);
    });
    proxy.on("error", (_err) => {
      if (!res.headersSent) res.status(502).send("Mockup sandbox unavailable");
    });
    proxy.end();
  });

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
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      logger.info({ port }, "Server started");
      
      // Start cache scheduler
      cacheSchedulerService.start();
      logger.info("Cache scheduler started");

      // Start booking expiry scheduler (auto-cancels stale pending_payment bookings)
      bookingExpiryScheduler.start();
      logger.info("Booking expiry scheduler started");
      
      // One-time admin promotion
      import("./db").then(({ pool }) => {
        pool.query("UPDATE users SET role = 'admin' WHERE email = 'm.dixon5030@gmail.com' AND role != 'admin'")
          .then((res: any) => { if (res.rowCount > 0) logger.info("Promoted m.dixon5030@gmail.com to admin"); })
          .catch((err: any) => logger.error({ err }, "Admin promotion query failed"));
      }).catch(() => {});

      // Run database seeding in background AFTER server is listening,
      // then fire-and-forget gem photo backfill so no gems are left without images
      runDatabaseSeeding()
        .then(() => {
          grokDiscoveryService.backfillGemPhotos()
            .then(({ processed, updated, failed }) => {
              if (processed > 0) {
                logger.info({ processed, updated, failed }, "Gem photo backfill complete");
              }
            })
            .catch(err => {
              logger.error({ err }, "Gem photo backfill failed");
            });
        })
        .catch(err => {
          logger.error({ err }, "FATAL: Database migration/seeding failed — shutting down to prevent serving with broken schema");
          process.exit(1);
        });
    },
  );
})();
