/**
 * onepagerRevalidation.ts — the R32 keep/withdraw arm of the recruitment one-pager lifecycle.
 *
 * R32 calls for a "monthly regeneration job." Because the one-pager PDF is regenerated
 * DETERMINISTICALLY on demand (no blob is stored), there is nothing to periodically re-render — the
 * served artifact is always fresh. So this job's real work is the KEEP/WITHDRAW check: for every
 * approved market, re-evaluate the keep-rule against fresh figures + the current template and withdraw
 * (delete) any approval that no longer holds (market dropped below the public floor, or the layout
 * template was bumped). Running this DAILY rather than monthly is a safe strengthening — a market that
 * falls below floor loses its stale approval within a day, not a month.
 */
import { logger } from "../infrastructure/logger";
import { revalidateOnepagerApprovals } from "../services/demand-onepager.admin";

export async function runOnepagerRevalidation(): Promise<void> {
  try {
    const { checked, withdrawn } = await revalidateOnepagerApprovals();
    if (withdrawn.length > 0) {
      logger.info(`[onepager-revalidate] checked ${checked}, withdrew ${withdrawn.length}: ${withdrawn.join(", ")}`);
    }
  } catch (e) {
    logger.error(`[onepager-revalidate] failed: ${(e as Error).message}`);
  }
}
