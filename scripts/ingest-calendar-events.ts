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
 */

import { runCalendarIngest } from "../server/services/travelpulse-calendar-ingest.service";

async function main() {
  const args = process.argv.slice(2);
  const includeHolidays = args.includes("--with-holidays");
  const windowIdx = args.indexOf("--window-days");
  const windowDays = windowIdx >= 0 ? Number(args[windowIdx + 1]) : undefined;

  console.log(
    `[calendar-ingest] starting — festivals (offline)${includeHolidays ? " + Nager.Date holidays (⚑ live)" : ""}`,
  );

  const result = await runCalendarIngest({ includeHolidays, windowDays });

  console.log(`[calendar-ingest] inserted=${result.inserted} skipped=${result.skipped}`);
  console.log(`[calendar-ingest] by source:`, result.bySource);
  console.log(`[calendar-ingest] done.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[calendar-ingest] FAILED:", err);
    process.exit(1);
  });
