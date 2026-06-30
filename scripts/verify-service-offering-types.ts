/**
 * Catalog invariant guard: the service_offering_types table must contain
 * at least MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS active rows whose
 * category_key is NOT an event-planner category.
 *
 * Root cause: task migrations have twice silently deactivated or deleted
 * these rows (fixed by migrations 038 and 095). This script runs in the
 * service-offering-types-gate CI workflow and exits non-zero the moment the
 * count falls below the threshold, so the regression is caught in CI rather
 * than silently breaking the /earn page.
 *
 * The check is HTTP-based (hits /api/offering-types/services) so it runs
 * against the same endpoint the /earn frontend consumes — no schema drift.
 *
 * Run standalone:  BASE_URL=http://localhost:5000 npx tsx scripts/verify-service-offering-types.ts
 * Expected outcome: exits 0 when count ≥ MIN; exits 1 otherwise.
 *
 * Relevant files:
 *  - server/migrations/095_restore_service_provider_offering_types.sql
 *  - client/src/pages/earn.tsx
 *  - client/src/lib/earn-roles.ts
 */

import { EVENT_CATEGORY_KEYS } from "../client/src/lib/earn-roles";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/**
 * Minimum number of active service_provider-category offerings that must
 * exist in service_offering_types. Migration 095 seeds 47 core rows across
 * 10 categories; 30 is a safe lower bound that would catch any bulk
 * deactivation while tolerating deliberate future pruning of individual rows.
 *
 * If you intentionally reduce the catalog below this floor, update this
 * constant (with a comment) alongside the migration that removes the rows.
 */
const MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS = 30;

interface OfferingTypeRow {
  offering_type_key: string;
  category_key: string;
  display_name: string;
  is_active?: boolean;
}

async function main(): Promise<void> {
  console.log(
    `[verify-service-offering-types] Checking ${BASE_URL}/api/offering-types/services …\n`
  );

  let rows: OfferingTypeRow[];
  try {
    const resp = await fetch(`${BASE_URL}/api/offering-types/services`);
    if (!resp.ok) {
      console.error(
        `[verify-service-offering-types] FAIL — HTTP ${resp.status} from /api/offering-types/services`
      );
      process.exit(1);
    }
    rows = await resp.json();
  } catch (err: any) {
    console.error(
      `[verify-service-offering-types] FAIL — request error: ${err?.message ?? err}`
    );
    process.exit(1);
  }

  if (!Array.isArray(rows)) {
    console.error(
      `[verify-service-offering-types] FAIL — expected array, got ${typeof rows}`
    );
    process.exit(1);
  }

  console.log(
    `  Total rows returned by /api/offering-types/services: ${rows.length}`
  );

  // The API already filters to is_active=true rows; filter out event-planner
  // and affiliate (aff_*) categories to isolate the service_provider partition.
  const eventCategorySet = new Set<string>(EVENT_CATEGORY_KEYS as readonly string[]);
  const serviceProviderRows = rows.filter(
    (r) =>
      !eventCategorySet.has(r.category_key) &&
      !r.category_key.startsWith("aff_")
  );

  const count = serviceProviderRows.length;
  console.log(`  Active service_provider-category offerings: ${count}`);
  console.log(`  Required minimum: ${MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS}`);

  if (count < MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS) {
    console.error(
      `\n[verify-service-offering-types] FAIL — only ${count} active service_provider offering(s) found;` +
        ` expected at least ${MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS}.`
    );
    console.error(
      "\nThis likely means a migration silently deactivated or deleted rows from"
    );
    console.error(
      "service_offering_types. The /earn page will show \"No offerings published yet.\""
    );
    console.error("for the Service Provider track until the rows are restored.");
    console.error(
      "\nTo fix: re-run migration 095_restore_service_provider_offering_types.sql"
    );
    console.error(
      "or write a new migration that re-activates the missing rows with"
    );
    console.error("ON CONFLICT (offering_type_key) DO UPDATE SET is_active = true.");
    console.error(
      "\nIf you intentionally reduced the catalog below the floor, increment"
    );
    console.error(
      "MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS in scripts/verify-service-offering-types.ts."
    );

    // Print summary of what is missing by category
    const byCategory: Record<string, number> = {};
    for (const r of serviceProviderRows) {
      byCategory[r.category_key] = (byCategory[r.category_key] ?? 0) + 1;
    }
    console.error("\n  Active service_provider categories present:");
    for (const [cat, n] of Object.entries(byCategory)) {
      console.error(`    ${cat}: ${n} offering(s)`);
    }

    process.exit(1);
  }

  // Summarise by category so the log is useful even on PASS
  const byCategory: Record<string, number> = {};
  for (const r of serviceProviderRows) {
    byCategory[r.category_key] = (byCategory[r.category_key] ?? 0) + 1;
  }
  console.log("\n  Breakdown by category:");
  for (const [cat, n] of Object.entries(byCategory)) {
    console.log(`    ${cat}: ${n} offering(s)`);
  }

  console.log(
    `\n[verify-service-offering-types] PASS — ${count} active service_provider offering(s) ≥ ${MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS}. /earn is safe.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[verify-service-offering-types] Unexpected error:", err?.message ?? err);
  process.exit(1);
});
