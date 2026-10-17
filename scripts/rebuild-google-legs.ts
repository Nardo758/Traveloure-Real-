/**
 * 9b-b — rebuild every Google-sourced leg through OSRM (9b spec v1.0 §6 9b-b; ledger
 * `2026-10-16-9b-b-legs-off-google`). DRY RUN BY DEFAULT: prints the five counts and the plans and Optimize
 * versions it would touch, and writes nothing.
 *
 *   npx tsx scripts/rebuild-google-legs.ts            # dry run — counts + targets, nothing written
 *   npx tsx scripts/rebuild-google-legs.ts --apply    # rebuild; refuses unless the adapter is OSRM
 *
 * --apply needs TRAVEL_TIME_SERVICE_ENABLED=1, OSRM_ENABLED=1 and OSRM_BASE_URL. It is idempotent (a second
 * run finds nothing to rebuild) and DELETES NOTHING: a confirmed Google leg is superseded, never deleted, and the
 * matrix and `travel_from_previous` are only counted. Deletion is its own PR, after "delete approved — Leon".
 * Against production it is run by Replit; this session never holds a production database URL.
 */
import { countGoogleRouteData, googleRebuildTargets, rebuildGoogleRouteData } from "../server/services/routing/google-legs-rebuild.service";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (!apply) {
    const counts = await countGoogleRouteData();
    const targets = await googleRebuildTargets();
    console.log("DRY RUN — nothing written.");
    console.log(JSON.stringify({ counts, plansToRebuild: targets.tripIds.length, versionsToRebuild: targets.variantIds.length, targets }, null, 2));
    return;
  }
  const report = await rebuildGoogleRouteData({ dryRun: false });
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  });
