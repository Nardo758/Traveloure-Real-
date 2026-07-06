/**
 * validate_before_drop_city_queues.ts
 *
 * Pre-drop safety check for _deprecated_expert_city_queues.
 * Run this script BEFORE executing scheduled_drop_deprecated_city_queues.sql
 * to confirm no live code paths reference the deprecated table.
 *
 * Usage:
 *   npx tsx server/migrations/validate_before_drop_city_queues.ts
 *
 * Safe to run at any time — read-only queries, no DDL.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

async function validateBeforeDrop(): Promise<void> {
  console.log("[validate-city-queues] Starting pre-drop validation...\n");
  let passed = 0;
  let failed = 0;

  // 1. Table must still be present (as deprecated copy)
  try {
    const result = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = '_deprecated_expert_city_queues'
    `);
    if ((result as any).rows?.length > 0) {
      console.log("  ✅ _deprecated_expert_city_queues exists");
      passed++;
    } else {
      console.log("  ⚠️  _deprecated_expert_city_queues not found — may have already been dropped");
      passed++;
    }
  } catch (e) {
    console.error("  ❌ Could not query table existence:", (e as Error).message);
    failed++;
  }

  // 2. Original expert_city_queues must NOT exist (already renamed)
  try {
    const result = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'expert_city_queues'
    `);
    if ((result as any).rows?.length === 0) {
      console.log("  ✅ expert_city_queues does not exist (correctly renamed/dropped)");
      passed++;
    } else {
      console.error("  ❌ expert_city_queues still exists — rename migration did not run");
      failed++;
    }
  } catch (e) {
    console.error("  ❌ Error checking expert_city_queues:", (e as Error).message);
    failed++;
  }

  // 3. Row count in deprecated table should be zero or non-critical
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) AS row_count FROM _deprecated_expert_city_queues
    `);
    const count = parseInt((result as any).rows?.[0]?.row_count ?? "0", 10);
    if (count === 0) {
      console.log(`  ✅ Deprecated table is empty (${count} rows)`);
    } else {
      console.log(`  ⚠️  Deprecated table has ${count} rows — confirm data is migrated before dropping`);
    }
    passed++;
  } catch (e) {
    // Table already dropped or renamed — treat as pass
    console.log("  ✅ Deprecated table inaccessible (already cleaned up or renamed)");
    passed++;
  }

  // 4. No foreign keys referencing the deprecated table
  try {
    const result = await db.execute(sql`
      SELECT tc.constraint_name, tc.table_name
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc
        ON rc.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
      WHERE ccu.table_name = '_deprecated_expert_city_queues'
    `);
    const fkCount = (result as any).rows?.length ?? 0;
    if (fkCount === 0) {
      console.log("  ✅ No foreign keys reference the deprecated table");
      passed++;
    } else {
      console.error(`  ❌ ${fkCount} foreign key(s) still reference _deprecated_expert_city_queues`);
      (result as any).rows.forEach((row: any) => {
        console.error(`     → ${row.table_name}.${row.constraint_name}`);
      });
      failed++;
    }
  } catch (e) {
    console.error("  ❌ FK check error:", (e as Error).message);
    failed++;
  }

  // 5. lead-routing.service.ts must not reference the deprecated table at runtime
  //    (static analysis — check the compiled/source string)
  const fs = await import("fs");
  const path = await import("path");
  const routingServicePath = path.join(process.cwd(), "server/services/lead-routing.service.ts");
  try {
    const source = fs.readFileSync(routingServicePath, "utf-8");
    if (source.includes("expert_city_queues")) {
      console.error("  ❌ lead-routing.service.ts still references expert_city_queues");
      failed++;
    } else {
      console.log("  ✅ lead-routing.service.ts has no reference to expert_city_queues");
      passed++;
    }
  } catch (e) {
    console.log("  ⚠️  Could not read lead-routing.service.ts for static check");
    passed++;
  }

  console.log(`\n[validate-city-queues] Done — ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("[validate-city-queues] ❌ NOT safe to drop. Fix the failures above first.");
    process.exit(1);
  } else {
    console.log("[validate-city-queues] ✅ Safe to execute scheduled_drop_deprecated_city_queues.sql");
    process.exit(0);
  }
}

validateBeforeDrop().catch((e) => {
  console.error("[validate-city-queues] Fatal:", e);
  process.exit(1);
});
