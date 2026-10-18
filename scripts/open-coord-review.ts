/**
 * LG-2 Ask 1 (ledger `2026-10-18-lg2-open-coord-review`; migration 391): pull untrustworthy open coordinates out of
 * routing into `open_coord_review`. Moves, never deletes.
 *
 *   npx tsx scripts/open-coord-review.ts                     # dry run: counts only, nothing written
 *   npx tsx scripts/open-coord-review.ts --apply             # move every flagged row (and its item links) to review
 *   npx tsx scripts/open-coord-review.ts --restore <reviewId> --by <name>   # put one reviewed row back
 *
 * Output is COUNTS ONLY (checked, pulled by reason, links moved) — no place names or coordinates. Refuses to run
 * without the admin setting `open_coord_max_drift_m` (no code fallback).
 */
import {
  loadMaxDriftM,
  moveOpenCoordToReview,
  OPEN_COORD_MAX_DRIFT_SETTING,
  OPEN_COORD_REVIEW_REASONS,
  planOpenCoordReview,
  restoreOpenCoordReview,
} from "../server/services/routing/open-coord-review.service";

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
};

async function main(): Promise<void> {
  const by = arg("--by") ?? "open-coord-review script";
  const restoreId = arg("--restore");
  if (restoreId) {
    console.log(JSON.stringify(await restoreOpenCoordReview(restoreId, by)));
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
  let moved = 0;
  let links = 0;
  let skipped = 0;
  for (const p of pull) {
    const r = await moveOpenCoordToReview(p, by);
    if (r.moved) {
      moved += 1;
      links += r.links;
    } else skipped += 1;
  }
  console.log(`APPLIED. ${OPEN_COORD_MAX_DRIFT_SETTING} = ${maxDriftM}.`);
  console.log(JSON.stringify({ checked, moved, linksMoved: links, skippedAlreadyGone: skipped, byReason }, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 100));
