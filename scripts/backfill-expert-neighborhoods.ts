/**
 * One-time backfill: populate expert_neighborhoods for already-approved local experts.
 *
 * Going forward, `storage.updateLocalExpertFormStatus(id, 'approved')` captures an
 * expert's self-declared neighborhoods into expert_neighborhoods automatically. But
 * experts approved BEFORE that hook existed have no rows, so the feed's localExpert
 * enrichment + "Ask about <neighborhood>" routing are starved for them. This applies
 * the exact same capture (storage.captureExpertNeighborhoods) to every approved form.
 *
 * Idempotent: capture inserts with ON CONFLICT DO NOTHING, so re-running is harmless.
 * Read-only where it can't match (unmatched neighborhood names are skipped, never
 * fabricated).
 *
 * Usage:  npx tsx scripts/backfill-expert-neighborhoods.ts
 */
import { db } from "../server/db";
import { storage } from "../server/storage";
import { localExpertForms } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const forms = await db.select().from(localExpertForms).where(eq(localExpertForms.status, "approved"));
  console.log(`[backfill] ${forms.length} approved local-expert form(s) to process`);

  let expertsWithRows = 0;
  let totalRows = 0;
  let skippedNoMatch = 0;

  for (const form of forms) {
    try {
      const captured = await storage.captureExpertNeighborhoods(form as any);
      if (captured > 0) {
        expertsWithRows += 1;
        totalRows += captured;
        console.log(`[backfill]   ${form.userId} (${form.city ?? "?"}): +${captured} neighborhood(s)`);
      } else {
        skippedNoMatch += 1;
      }
    } catch (err: any) {
      console.error(`[backfill]   FAILED for form ${form.id} (${form.userId}):`, err?.message || err);
    }
  }

  console.log(
    `[backfill] done — ${expertsWithRows} expert(s) linked, ${totalRows} row(s) captured, ` +
      `${skippedNoMatch} with no matchable neighborhood (unchanged).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
