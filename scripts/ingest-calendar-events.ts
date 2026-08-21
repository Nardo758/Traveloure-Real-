/**
 * ingest-calendar-events.ts — Trailhead lane B3 authoring/ops tool.
 *
 * Ingests DATED, REAL, ATTRIBUTED events into travel_pulse_calendar_events so the R33 event
 * spotlight (demand-onepager) and the Discover "event approaching" lens can render for operating
 * markets (Kyoto, Edinburgh). NO LLM-generated events — the offline path expands the committed
 * festival registry (server/data/festival-calendar.json); the ⚑ live path adds Nager.Date public
 * holidays over the network.
 *
 * REQUIRES a database — run WHERE `DATABASE_URL` points at the target data (a Replit workspace),
 * NOT inside a network-isolated agent sandbox. Idempotent (deterministic ids), safe to re-run.
 *
 * USAGE:
 *   npx tsx scripts/ingest-calendar-events.ts                 # offline festivals only
 *   npx tsx scripts/ingest-calendar-events.ts --with-holidays # ⚑ also live-fetch Nager.Date
 *   npx tsx scripts/ingest-calendar-events.ts --window-days 400
 *   npx tsx scripts/ingest-calendar-events.ts --with-holidays --verify   # ⚑ GATE: assert forward-90 Kyoto rows
 *
 * ⚑ Replit GATE (the live proof this lane owes): run the last form against the target DB. It
 * ingests then asserts forward-90 Kyoto rows exist (the exact R33 consumer predicate); a zero
 * count exits non-zero so the gate fails loudly instead of shipping a still-dark spotlight.
 */

import { runCalendarIngest, countForwardEvents } from "../server/services/travelpulse-calendar-ingest.service";

async function main() {
  const args = process.argv.slice(2);
  const includeHolidays = args.includes("--with-holidays");
  const verify = args.includes("--verify");
  const windowIdx = args.indexOf("--window-days");
  const windowDays = windowIdx >= 0 ? Number(args[windowIdx + 1]) : undefined;

  console.log(
    `[calendar-ingest] starting — festivals (offline)${includeHolidays ? " + Nager.Date holidays (⚑ live)" : ""}`,
  );

  const result = await runCalendarIngest({ includeHolidays, windowDays });

  console.log(`[calendar-ingest] inserted=${result.inserted} skipped=${result.skipped}`);
  console.log(`[calendar-ingest] by source:`, result.bySource);

  if (verify) {
    const kyoto90 = await countForwardEvents("kyoto", 90);
    const edinburgh90 = await countForwardEvents("edinburgh", 90);
    console.log(`[calendar-ingest] ⚑ forward-90 rows — kyoto=${kyoto90} edinburgh=${edinburgh90}`);
    if (kyoto90 < 1) {
      console.error(
        "[calendar-ingest] GATE FAILED: zero forward-90 Kyoto rows — R33 spotlight would still be dark.",
      );
      process.exit(2);
    }
    console.log("[calendar-ingest] ⚑ GATE PASSED: forward-90 Kyoto rows present.");
  }

  console.log(`[calendar-ingest] done.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[calendar-ingest] FAILED:", err);
    process.exit(1);
  });
