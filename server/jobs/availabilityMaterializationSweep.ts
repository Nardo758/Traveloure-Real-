/**
 * DAILY AVAILABILITY-MATERIALIZATION SWEEP — S7 (DECISIONS.md ledger row 102).
 *
 * Extends the rolling 60-day materialization window (S7-Q1 integrator default) for every service
 * that carries at least one weekly availability pattern, so the window keeps advancing for a
 * provider who set their pattern once and never revisits the editor. Registered in server/index.ts
 * the SAME way server/jobs/stripeReconciliation.ts is: a first pass shortly after boot, then
 * `setInterval` every 24h. The actual expansion logic lives in
 * server/services/availability-materializer.service.ts (ADD-ONLY, ON CONFLICT DO NOTHING — see
 * that file's header for the never-clobber guarantee); this file is only the scheduled-run wrapper
 * and its logging.
 */
import { logger } from "../infrastructure/logger";
import { materializeAllServicesWithPatterns } from "../services/availability-materializer.service";

export async function runAvailabilityMaterializationSweep(): Promise<void> {
  try {
    const result = await materializeAllServicesWithPatterns();
    logger.info(
      { ...result },
      "[availability-materializer] daily horizon-extension sweep complete",
    );
  } catch (err) {
    logger.error({ err }, "[availability-materializer] daily horizon-extension sweep failed");
  }
}
