import "./validate-env";
import app, { installPostRouteHandlers } from "./app";
import { createServer } from "node:http";
import { registerRoutes } from "./routes/routes";
import { setupWebSocket } from "./websocket";
import { getSession } from "./replit_integrations/auth";
import { runMigrations } from "./migrations/run-migrations";
import { storage } from "./storage";
import { grokDiscoveryService } from "./services/grok-discovery.service";
import { cacheSchedulerService } from "./services/cache-scheduler.service";
import { bookingExpiryScheduler } from "./services/booking-expiry-scheduler.service";
import { checkoutClaimSweepScheduler } from "./services/checkout-claim.service";
import { adminDigestScheduler } from "./services/admin-digest-scheduler.service";
import { earningsReleaseScheduler } from "./services/earnings-release-scheduler.service";
import { dmoIngestScheduler } from "./services/dmo-ingest-scheduler.service";
import { stripeConnectReminderScheduler } from "./services/stripe-connect-reminder.service";
import { fxRateRefreshScheduler } from "./services/fx-rate-refresh.service";
import { tripCardHandoverScheduler } from "./services/trip-card-handover-scheduler.service";
import { itineraryGenerationSweepScheduler } from "./services/itinerary-generation-sweep-scheduler.service";
import { emailOutboxScheduler } from "./services/email-outbox.service";
import { runNightlyQA } from "./jobs/nightlyQA";
import { runStripeReconciliation } from "./jobs/stripeReconciliation";
import { runAvailabilityMaterializationSweep } from "./jobs/availabilityMaterializationSweep";
import { runDemandRollup } from "./jobs/demandRollup";
import { runOnepagerRevalidation } from "./jobs/onepagerRevalidation";
import { runBookingAutoCompletion } from "./jobs/bookingAutoCompletion";
import { runDmoExtractionWarmupSweep } from "./jobs/dmoExtractionWarmup";
import { logger } from "./infrastructure";

const port = Number(process.env.PORT || 8080);
const server = createServer(app);

async function start() {
  setupWebSocket(server, getSession());
  logger.info("Running database migrations");
  await runMigrations();
  logger.info("Database migrations complete; registering routes");
  await registerRoutes(server, app);
  logger.info("Routes registered; preparing HTTP listener");
  installPostRouteHandlers();

  server.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startBackgroundWork();
  });
}

async function runDatabaseSeeding() {
  const seedTasks: Array<[string, () => Promise<unknown>]> = [
    ["categories", async () => (await import("./seed-categories")).seedCategories()],
    ["experience types", async () => (await import("./seed-experience-types")).seedExperienceTypes()],
    ["experience template tabs", async () => (await import("./seeds/experience-template-tabs.seed")).seedExperienceTemplateTabs()],
    ["expert services", async () => (await import("./seed-expert-services")).seedExpertServices()],
    ["provider service listings", async () => (await import("./seed-expert-services")).seedProviderServiceListings()],
    ["mock experts", async () => (await import("./seed-expert-services")).seedMockExperts()],
    ["provider services", async () => (await import("./seed-expert-services")).seedProviderServices()],
    ["destination calendar", async () => (await import("./seed-destination-calendar")).seedDestinationCalendar()],
    ["TravelPulse data", async () => (await import("./seed-travelpulse")).seedTravelPulseData()],
    ["city neighborhoods", async () => (await import("./seeds/city-neighborhoods.seed")).seedCityNeighborhoods()],
    ["popular cities content", async () => (await import("./seeds/popular-cities-content.seed")).seedPopularCitiesContent()],
    ["major cities backfill", async () => (await import("./seeds/major-cities-backfill.seed")).seedMajorCitiesBackfill()],
    ["Kyoto vendors", async () => (await import("./seeds/phase-d-kyoto-vendors.seed")).seedPhaseDKyotoVendors()],
    ["DMO sources", async () => (await import("./seeds/dmo-sources.seed")).seedDmoSources()],
    ["Kyoto DMO heritage", async () => (await import("./seeds/dmo-kyoto-heritage.seed")).seedDmoKyotoHeritage()],
    ["role-scoped templates", async () => (await import("./seeds/role-scoped-templates.seed")).seedRoleScopedTemplates()],
    ["trip ownership", async () => (await import("./seeds/trip-ownership.seed")).seedTripOwnership()],
    ["location cache", async () => (await import("./seeds/location-cache.seed")).seedLocationCache()],
  ];
  for (const [name, seed] of seedTasks) {
    try {
      await seed();
    } catch (err) {
      logger.error({ err, seed: name }, "Database seed failed");
    }
  }

  try {
    if (process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_ACCOUNTS === "1") {
      await (await import("./seeds/e2e-test-accounts.seed")).seedE2EAccounts();
    } else {
      await (await import("./seeds/e2e-test-accounts.seed")).purgeE2EAccountsFromProd();
    }
    await storage.backfillAffiliateProviderMetadata();
    await grokDiscoveryService.backfillGemPhotos();
  } catch (err) {
    logger.error({ err }, "Post-seed maintenance failed");
  }
}

function scheduleDaily(task: () => Promise<unknown>, firstDelayMs: number, label: string) {
  setTimeout(() => {
    void task().catch((err) => logger.error({ err }, `${label} failed`));
    setInterval(() => void task().catch((err) => logger.error({ err }, `${label} failed`)), 24 * 60 * 60 * 1000);
  }, firstDelayMs);
}

function startBackgroundWork() {
  cacheSchedulerService.start();
  bookingExpiryScheduler.start();
  checkoutClaimSweepScheduler.start();
  adminDigestScheduler.start();
  earningsReleaseScheduler.start();
  stripeConnectReminderScheduler.start();
  fxRateRefreshScheduler.start();
  tripCardHandoverScheduler.start();
  itineraryGenerationSweepScheduler.start();
  emailOutboxScheduler.start();
  dmoIngestScheduler.start();

  scheduleDaily(runStripeReconciliation, 60 * 60 * 1000, "Stripe reconciliation");
  scheduleDaily(runAvailabilityMaterializationSweep, 90 * 60 * 1000, "Availability materialization");
  scheduleDaily(runDemandRollup, 95 * 60 * 1000, "Demand rollup");
  scheduleDaily(runOnepagerRevalidation, 105 * 60 * 1000, "One-pager revalidation");
  scheduleDaily(runBookingAutoCompletion, 3 * 60 * 1000, "Booking auto-completion");
  setTimeout(() => void runDmoExtractionWarmupSweep().catch((err) => logger.error({ err }, "DMO warmup failed")), 60_000);

  const now = new Date();
  const next2am = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2));
  if (next2am <= now) next2am.setUTCDate(next2am.getUTCDate() + 1);
  setTimeout(() => {
    void runNightlyQA("scheduled").catch((err) => logger.error({ err }, "Nightly QA failed"));
    setInterval(() => void runNightlyQA("scheduled").catch((err) => logger.error({ err }, "Nightly QA failed")), 24 * 60 * 60 * 1000);
  }, next2am.getTime() - now.getTime());

  void runDatabaseSeeding();
}

void start().catch((err) => {
  logger.error({ err }, "Unable to initialize Traveloure API");
  process.exit(1);
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received");
  server.close(async () => {
    try {
      const { pool } = await import("./db");
      await pool.end();
    } finally {
      process.exit(0);
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
