/**
 * NIGHTLY PARTNER-DEMAND ROLLUP — 2B (DECISIONS.md ledger 2026-08-18-partner-demand-2b).
 *
 * Recomputes the two demand metrics (unmet_demand_slip, slip_funnel) into partner_demand_rollup,
 * REPLACE-BY-DATE (idempotent). Registered in server/index.ts the SAME way
 * server/jobs/availabilityMaterializationSweep.ts is: a first pass shortly after boot, then
 * `setInterval` every 24h. All demand math lives in the ONE L6 module
 * server/services/demand-rollup.service.ts (R16 synthetic-trip filter applied there); this file is
 * only the scheduled-run wrapper and its logging.
 */
import { logger } from "../infrastructure/logger";
import { computeAndStoreDemandRollup } from "../services/demand-rollup.service";

export async function runDemandRollup(): Promise<void> {
  try {
    const rows = await computeAndStoreDemandRollup();
    logger.info({ rows }, "[demand-rollup] nightly rollup complete");
  } catch (err) {
    logger.error({ err }, "[demand-rollup] nightly rollup failed");
  }
}
