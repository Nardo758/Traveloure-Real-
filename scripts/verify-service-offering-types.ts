/**
 * Catalog invariant guard: the service_offering_types and expert_offering_types
 * tables must contain sufficient active rows for all four /earn tracks:
 *   - service_provider  (service_offering_types, non-event categories)
 *   - event_planner     (service_offering_types, EVENT_CATEGORY_KEYS)
 *   - trip_planner      (expert_offering_types,  TRIP_PLANNER_TIERS)
 *   - local_expert      (expert_offering_types,  LOCAL_EXPERT_TIERS)
 *
 * Root cause: task migrations have twice silently deactivated or deleted
 * service_provider rows (fixed by migrations 038 and 095). The event_planner
 * and expert tracks share the same tables and are equally at risk. This script
 * runs in the service-offering-types-gate CI workflow and exits non-zero the
 * moment any count falls below its threshold, so the regression is caught in
 * CI rather than silently breaking any /earn track.
 *
 * The check is HTTP-based (hits /api/offering-types/services and
 * /api/offering-types/experts) so it runs against the same endpoints the
 * /earn frontend consumes — no schema drift.
 *
 * Run standalone:  BASE_URL=http://localhost:5000 npx tsx scripts/verify-service-offering-types.ts
 * Expected outcome: exits 0 when all counts ≥ their floors; exits 1 otherwise.
 *
 * Relevant files:
 *  - server/migrations/038_phase2_seed_service_offering_types.sql
 *  - server/migrations/039_phase2_seed_expert_offering_types.sql
 *  - server/migrations/095_restore_service_provider_offering_types.sql
 *  - client/src/pages/earn.tsx
 *  - client/src/lib/earn-roles.ts
 */

import { EVENT_CATEGORY_KEYS, TRIP_PLANNER_TIERS, LOCAL_EXPERT_TIERS } from "../client/src/lib/earn-roles";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// ─── Floor constants ──────────────────────────────────────────────────────────
// Each floor is a safe lower bound that catches any bulk deactivation while
// tolerating deliberate future pruning of individual rows. If you intentionally
// reduce the catalog below a floor, update that constant (with a comment)
// alongside the migration that removes the rows.

/**
 * Minimum active service_provider-category rows in service_offering_types.
 * Migration 038 seeds 47 core rows across 10+ non-event categories;
 * migration 095 restores them after a regression. 30 is a safe lower bound.
 */
const MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS = 30;

/**
 * Minimum active event_planner-category rows in service_offering_types.
 * Migration 038 seeds ~26 rows across the 10 EVENT_CATEGORY_KEYS categories
 * (event_coordinator, caterer, florist, officiant, videographer, hair_makeup,
 * av_tech, rentals, entertainment, printing_materials).
 * 8 is a safe lower bound — catches bulk deactivation, tolerates pruning.
 */
const MIN_ACTIVE_EVENT_PLANNER_OFFERINGS = 8;

/**
 * Minimum active trip_planner rows in expert_offering_types.
 * Migration 039 seeds 13 rows across the two TRIP_PLANNER_TIERS
 * (planning: 8 rows, coordination: 5 rows).
 * 8 is a safe lower bound.
 */
const MIN_ACTIVE_TRIP_PLANNER_OFFERINGS = 8;

/**
 * Minimum active local_expert rows in expert_offering_types.
 * Migration 039 seeds 26 rows across the three LOCAL_EXPERT_TIERS
 * (advisory: 12 rows, live_support: 6 rows, specialized: 8 rows).
 * 15 is a safe lower bound.
 */
const MIN_ACTIVE_LOCAL_EXPERT_OFFERINGS = 15;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceOfferingRow {
  offering_type_key: string;
  category_key: string;
  display_name: string;
  is_active?: boolean;
}

interface ExpertOfferingRow {
  offering_type_key: string;
  service_tier: string;
  display_name: string;
  is_active?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printBreakdown(label: string, rows: Array<{ group: string }>): void {
  const byGroup: Record<string, number> = {};
  for (const r of rows) {
    byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
  }
  console.log(`\n  ${label} breakdown:`);
  for (const [g, n] of Object.entries(byGroup)) {
    console.log(`    ${g}: ${n} offering(s)`);
  }
}

function assertFloor(
  label: string,
  count: number,
  floor: number,
  fixHint: string
): boolean {
  console.log(`  Active ${label} offerings: ${count}`);
  console.log(`  Required minimum: ${floor}`);
  if (count < floor) {
    console.error(
      `\n[verify-service-offering-types] FAIL — only ${count} active ${label} offering(s) found;` +
        ` expected at least ${floor}.`
    );
    console.error(fixHint);
    return false;
  }
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[verify-service-offering-types] BASE_URL: ${BASE_URL}\n`);

  let allPassed = true;

  // ── 1. /api/offering-types/services (service_provider + event_planner) ─────
  console.log(`Checking ${BASE_URL}/api/offering-types/services …`);

  let serviceRows: ServiceOfferingRow[];
  try {
    const resp = await fetch(`${BASE_URL}/api/offering-types/services`);
    if (!resp.ok) {
      console.error(
        `[verify-service-offering-types] FAIL — HTTP ${resp.status} from /api/offering-types/services`
      );
      process.exit(1);
    }
    serviceRows = await resp.json();
  } catch (err: any) {
    console.error(
      `[verify-service-offering-types] FAIL — request error: ${err?.message ?? err}`
    );
    process.exit(1);
  }

  if (!Array.isArray(serviceRows)) {
    console.error(
      `[verify-service-offering-types] FAIL — expected array from /api/offering-types/services, got ${typeof serviceRows}`
    );
    process.exit(1);
  }

  console.log(`  Total rows returned: ${serviceRows.length}`);

  const eventCategorySet = new Set<string>(EVENT_CATEGORY_KEYS as readonly string[]);

  // service_provider partition: non-event, non-affiliate categories
  const serviceProviderRows = serviceRows.filter(
    (r) => !eventCategorySet.has(r.category_key) && !r.category_key.startsWith("aff_")
  );
  // event_planner partition: EVENT_CATEGORY_KEYS (non-affiliate by construction)
  const eventPlannerRows = serviceRows.filter((r) => eventCategorySet.has(r.category_key));

  console.log("\n── service_provider track ──");
  const spOk = assertFloor(
    "service_provider",
    serviceProviderRows.length,
    MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS,
    "To fix: re-run migration 095_restore_service_provider_offering_types.sql or write a new\n" +
      "  migration that re-activates the missing rows with\n" +
      "  ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true.\n" +
      "  If you intentionally reduced the catalog below the floor, update\n" +
      "  MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS in scripts/verify-service-offering-types.ts."
  );
  if (!spOk) allPassed = false;
  printBreakdown("service_provider", serviceProviderRows.map((r) => ({ group: r.category_key })));

  console.log("\n── event_planner track ──");
  const epOk = assertFloor(
    "event_planner",
    eventPlannerRows.length,
    MIN_ACTIVE_EVENT_PLANNER_OFFERINGS,
    "To fix: check that migration 038_phase2_seed_service_offering_types.sql ran successfully\n" +
      "  and that no later migration deactivated event-planner category rows.\n" +
      "  If you intentionally reduced the catalog below the floor, update\n" +
      "  MIN_ACTIVE_EVENT_PLANNER_OFFERINGS in scripts/verify-service-offering-types.ts."
  );
  if (!epOk) allPassed = false;
  printBreakdown("event_planner", eventPlannerRows.map((r) => ({ group: r.category_key })));

  // ── 2. /api/offering-types/experts (trip_planner + local_expert) ───────────
  console.log(`\nChecking ${BASE_URL}/api/offering-types/experts …`);

  let expertRows: ExpertOfferingRow[];
  try {
    const resp = await fetch(`${BASE_URL}/api/offering-types/experts`);
    if (!resp.ok) {
      console.error(
        `[verify-service-offering-types] FAIL — HTTP ${resp.status} from /api/offering-types/experts`
      );
      process.exit(1);
    }
    expertRows = await resp.json();
  } catch (err: any) {
    console.error(
      `[verify-service-offering-types] FAIL — request error (experts): ${err?.message ?? err}`
    );
    process.exit(1);
  }

  if (!Array.isArray(expertRows)) {
    console.error(
      `[verify-service-offering-types] FAIL — expected array from /api/offering-types/experts, got ${typeof expertRows}`
    );
    process.exit(1);
  }

  console.log(`  Total rows returned: ${expertRows.length}`);

  const tripPlannerTierSet = new Set<string>(TRIP_PLANNER_TIERS as readonly string[]);
  const localExpertTierSet = new Set<string>(LOCAL_EXPERT_TIERS as readonly string[]);

  const tripPlannerRows = expertRows.filter((r) => tripPlannerTierSet.has(r.service_tier));
  const localExpertRows = expertRows.filter((r) => localExpertTierSet.has(r.service_tier));

  console.log("\n── trip_planner track ──");
  const tpOk = assertFloor(
    "trip_planner",
    tripPlannerRows.length,
    MIN_ACTIVE_TRIP_PLANNER_OFFERINGS,
    "To fix: check that migration 039_phase2_seed_expert_offering_types.sql ran successfully\n" +
      "  and that no later migration deactivated planning/coordination tier rows.\n" +
      "  Affected tiers: " + [...TRIP_PLANNER_TIERS].join(", ") + ".\n" +
      "  If you intentionally reduced the catalog below the floor, update\n" +
      "  MIN_ACTIVE_TRIP_PLANNER_OFFERINGS in scripts/verify-service-offering-types.ts."
  );
  if (!tpOk) allPassed = false;
  printBreakdown("trip_planner", tripPlannerRows.map((r) => ({ group: r.service_tier })));

  console.log("\n── local_expert track ──");
  const leOk = assertFloor(
    "local_expert",
    localExpertRows.length,
    MIN_ACTIVE_LOCAL_EXPERT_OFFERINGS,
    "To fix: check that migration 039_phase2_seed_expert_offering_types.sql ran successfully\n" +
      "  and that no later migration deactivated advisory/live_support/specialized tier rows.\n" +
      "  Affected tiers: " + [...LOCAL_EXPERT_TIERS].join(", ") + ".\n" +
      "  If you intentionally reduced the catalog below the floor, update\n" +
      "  MIN_ACTIVE_LOCAL_EXPERT_OFFERINGS in scripts/verify-service-offering-types.ts."
  );
  if (!leOk) allPassed = false;
  printBreakdown("local_expert", localExpertRows.map((r) => ({ group: r.service_tier })));

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────────");
  if (!allPassed) {
    console.error(
      "[verify-service-offering-types] FAIL — one or more /earn tracks are below their minimum active offering count."
    );
    console.error("The affected track(s) will show \"No offerings published yet.\" on /earn.");
    process.exit(1);
  }

  console.log(
    `[verify-service-offering-types] PASS — all four /earn tracks have sufficient active offerings.\n` +
      `  service_provider : ${serviceProviderRows.length} ≥ ${MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS}\n` +
      `  event_planner    : ${eventPlannerRows.length} ≥ ${MIN_ACTIVE_EVENT_PLANNER_OFFERINGS}\n` +
      `  trip_planner     : ${tripPlannerRows.length} ≥ ${MIN_ACTIVE_TRIP_PLANNER_OFFERINGS}\n` +
      `  local_expert     : ${localExpertRows.length} ≥ ${MIN_ACTIVE_LOCAL_EXPERT_OFFERINGS}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[verify-service-offering-types] Unexpected error:", err?.message ?? err);
  process.exit(1);
});
