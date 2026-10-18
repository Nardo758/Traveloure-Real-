/**
 * LG-2 Ask 1 (ledger `2026-10-18-lg2-open-coord-review`; migration 391): pull untrustworthy item → open place links out
 * of routing into `itinerary_item_open_coords_review`. The open places themselves are never moved.
 *
 *   npx tsx scripts/open-coord-review.ts                     # dry run: counts only, nothing written
 *   npx tsx scripts/open-coord-review.ts --apply             # pull every flagged link into review
 *   npx tsx scripts/open-coord-review.ts --restore <reviewId> --by <name>   # put one checked link back (once)
 *
 * Output is COUNTS ONLY (links checked, pulled by reason) — no place names or coordinates. Refuses to run
 * without the admin setting `open_coord_max_drift_m` (no code fallback).
 */
import {
  loadMaxDriftM,
  pullOpenCoordLink,
  OPEN_COORD_MAX_DRIFT_SETTING,
  OPEN_COORD_REVIEW_REASONS,
  planOpenCoordReview,
  restoreOpenCoordLink,
} from "../server/services/routing/open-coord-review.service";

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
};

async function main(): Promise<void> {
  const by = arg("--by") ?? "open-coord-review script";
  const restoreId = arg("--restore");
  if (restoreId) {
    console.log(JSON.stringify(await restoreOpenCoordLink(restoreId, by)));
    return;
  }
  const maxDriftM = await loadMaxDriftM();
  if (maxDriftM == null) {
    console.error(`REFUSED: platform setting ${OPEN_COORD_MAX_DRIFT_SETTING} is missing or not a positive number. Nothing read or written.`);
    process.exitCode = 1;
    return;
  }
  const apply = process.argv.includes("--apply");
  const { checked, pull } = await planOpenCoordReview(maxDriftM);
  const byReason = Object.fromEntries(OPEN_COORD_REVIEW_REASONS.map((r) => [r, pull.filter((p) => p.reason === r).length]));
  if (!apply) {
    console.log(`DRY RUN — nothing written. ${OPEN_COORD_MAX_DRIFT_SETTING} = ${maxDriftM}.`);
    console.log(JSON.stringify({ checked, toPull: pull.length, byReason }, null, 2));
    return;
  }
  let pulled = 0;
  let skipped = 0;
  for (const p of pull) {
    const r = await pullOpenCoordLink(p, by);
    if (r.pulled) pulled += 1;
    else skipped += 1;
  }
  console.log(`APPLIED. ${OPEN_COORD_MAX_DRIFT_SETTING} = ${maxDriftM}.`);
  console.log(JSON.stringify({ checked, pulled, skippedAlreadyGone: skipped, byReason }, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 100));
