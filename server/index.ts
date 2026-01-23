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
import { setupWebSocket } from "./websocket";
import { cacheSchedulerService } from "./services/cache-scheduler.service";
import {
  logger,
  createHealthRouter,
  createMetricsRouter,
  metricsMiddleware,
  globalErrorHandler,
  generalRateLimiter,
  aiRateLimiter,
  searchRateLimiter,
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

export function log(message: string, source = "express") {
  logger.info({ source }, message);
}

(async () => {
  await registerRoutes(httpServer, app);
  
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

  app.use(globalErrorHandler);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      logger.info({ port }, "Server started");
      
      cacheSchedulerService.start();
      logger.info("Cache scheduler started");
    },
  );
})();
