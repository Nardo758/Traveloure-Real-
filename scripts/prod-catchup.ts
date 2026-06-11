/**
 * Production ledger catch-up — #28 Part B.
 * Usage: tsx scripts/prod-catchup.ts
 *
 * For a prod DB that already has migrations applied outside the ledger system
 * (e.g., Drizzle snapshots + manual DDL for 052–063) but whose schema_migrations
 * table is incomplete or absent.
 *
 * Safety gates (both run before any write):
 *   1. Same-rate money gate: verifies GET /api/booking-fee-config == resolveCommissionRates
 *      for every known fee context. If display ≠ charge for any context, the catch-up
 *      is aborted — the fee config must be correct before stamping migrations as done.
 *   2. Reports which files would be newly stamped (dry-run preview printed to stdout).
 *
 * Then non-destructively stamps ALL MIGRATION_FILES not yet in the ledger.
 * ON CONFLICT DO NOTHING — never re-executes any DDL.
 *
 * Requires DATABASE_URL pointing to prod.
 * Requires BASE_URL pointing to the running prod server (for the money gate HTTP check).
 * Example:
 *   DATABASE_URL=postgres://... BASE_URL=https://yourapp.replit.app \
 *     tsx scripts/prod-catchup.ts
 */
import { catchupProductionLedger } from "../server/migrations/run-migrations";
import { resolveCommissionRates, feeConfigFromRates } from "../server/services/commission";
import { pool } from "../server/db";
import { MIGRATION_FILES } from "../server/migrations/migration-files";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

const GATE_CONTEXTS: Array<{ category: string; expertId?: string | null }> = [
  { category: "default" },
  { category: "activities" },
  { category: "dining" },
  { category: "provider_commission_percent" },
];

async function runSameRateGate(): Promise<void> {
  console.log("[prod-catchup] Running same-rate money gate...");
  let failures = 0;

  for (const ctx of GATE_CONTEXTS) {
    const expected = feeConfigFromRates(await resolveCommissionRates(ctx));
    const qs = new URLSearchParams();
    qs.set("category", ctx.category);
    if (ctx.expertId) qs.set("expertId", ctx.expertId);

    let actual: any;
    try {
      const resp = await fetch(`${BASE_URL}/api/booking-fee-config?${qs.toString()}`);
      if (!resp.ok) {
        console.error(`[prod-catchup] Gate FAIL: ${ctx.category} → HTTP ${resp.status}`);
        failures++;
        continue;
      }
      actual = await resp.json();
    } catch (e: any) {
      console.error(`[prod-catchup] Gate FAIL: ${ctx.category} → ${e?.message ?? e}`);
      failures++;
      continue;
    }

    const platformMatch = actual.platform_fee_percent === expected.platform_fee_percent;
    const expertMatch = actual.expert_share_percent === expected.expert_share_percent;

    if (platformMatch && expertMatch) {
      console.log(
        `[prod-catchup] Gate OK: ${ctx.category} — ` +
        `display(${actual.platform_fee_percent}/${actual.expert_share_percent}) == charge`,
      );
    } else {
      console.error(
        `[prod-catchup] Gate FAIL: ${ctx.category} — ` +
        `display(${actual.platform_fee_percent}/${actual.expert_share_percent}) ≠ ` +
        `charge(${expected.platform_fee_percent}/${expected.expert_share_percent})`,
      );
      failures++;
    }
  }

  if (failures > 0) {
    throw new Error(
      `Same-rate money gate failed (${failures} context(s) mismatch). ` +
      `Fix fee config parity before stamping the migration ledger.`,
    );
  }
  console.log("[prod-catchup] Same-rate gate PASSED.\n");
}

async function main() {
  // 1. Same-rate money gate — abort if display ≠ charge for any context
  await runSameRateGate();

  // 2. Dry-run preview: show what would be stamped
  console.log("[prod-catchup] Files registered in MIGRATION_FILES:");
  MIGRATION_FILES.forEach((f, i) => console.log(`  ${String(i + 1).padStart(3, " ")}. ${f}`));
  console.log(`\n[prod-catchup] Total: ${MIGRATION_FILES.length} files will be stamped (ON CONFLICT DO NOTHING).\n`);

  // 3. Stamp all files non-destructively
  const result = await catchupProductionLedger();

  console.log("\n[prod-catchup] Catch-up complete:");
  if (result.stamped.length > 0) {
    console.log(`  Newly stamped (${result.stamped.length}):`);
    result.stamped.forEach((f) => console.log(`    + ${f}`));
  } else {
    console.log("  Newly stamped: (none — ledger was already fully recorded)");
  }
  console.log(`  Already recorded: ${result.alreadyRecorded.length}`);
  console.log(
    `\n  Ledger is now ${MIGRATION_FILES.length}/${MIGRATION_FILES.length} complete.`,
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[prod-catchup] FATAL:", err?.message ?? err);
    try { await pool.end(); } catch {}
    process.exit(1);
  });
