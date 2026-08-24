/**
 * One-time backfill: enroll already-approved experts' cities into the AI content pipeline.
 *
 * Going forward, approving a local expert auto-enrolls their city into travel_pulse_cities
 * (storage.ensureCityEnrolled) so the daily AI scheduler generates content for it. Experts
 * approved BEFORE that hook existed may sit in a city the pipeline never sees (~21 seeded
 * cities only), leaving that market dark. This enrolls every distinct approved-expert city.
 *
 * Idempotent: ensureCityEnrolled is a case-insensitive check-then-insert, so re-running is
 * harmless. A newly-enrolled city has aiGeneratedAt=NULL → the next scheduler cycle fills it.
 *
 * Usage:  npx tsx scripts/backfill-city-enrollment.ts
 */
import { db } from "../server/db";
import { storage } from "../server/storage";
import { localExpertForms } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const forms = await db.select().from(localExpertForms).where(eq(localExpertForms.status, "approved"));
  console.log(`[city-enroll] ${forms.length} approved local-expert form(s) to check`);

  let enrolled = 0;
  let alreadyPresent = 0;
  let skippedNoCity = 0;

  for (const form of forms) {
    if (!form.city || !form.country) {
      skippedNoCity += 1;
      continue;
    }
    try {
      const created = await storage.ensureCityEnrolled(form.city, form.country);
      if (created) {
        enrolled += 1;
        console.log(`[city-enroll]   + ${form.city}, ${form.country}`);
      } else {
        alreadyPresent += 1;
      }
    } catch (err: any) {
      console.error(`[city-enroll]   FAILED for ${form.city}, ${form.country}:`, err?.message || err);
    }
  }

  console.log(
    `[city-enroll] done — ${enrolled} newly enrolled, ${alreadyPresent} already present, ` +
      `${skippedNoCity} form(s) with no city (skipped). New cities generate content on the next scheduler cycle.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[city-enroll] fatal:", err);
  process.exit(1);
});
