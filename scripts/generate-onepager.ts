/**
 * generate-onepager.ts — Phase 4 · STEP 4.4 authoring tool. Generates ONE real recruitment
 * one-pager draft PDF for a market from live data, and prints an honest pre-review summary of
 * what the page shows and what stays dark — so the ⚑ check-A event probe and the §13 absences
 * are visible BEFORE the PDF is opened.
 *
 * This is the generation entry for Leon's HARD STOP review (R32/4.4): it produces a DRAFT-watermarked
 * artifact and nothing more. It NEVER approves, distributes, or renders un-watermarked — external use
 * stays locked behind the review. Approval is a separate, audited admin action (demand-onepager.admin.ts).
 *
 * STANDALONE authoring tool — never imported by the server. It reuses the SAME service the admin
 * `POST /:market/generate` route uses (`generateOnepagerDraft`), so the byte-for-byte output matches
 * the route (determinism gate). No computation lives here (L6): it reads the model and renders it.
 *
 * REQUIRES a database — run WHERE `DATABASE_URL` points at the target data (a Replit workspace),
 * not inside a network-isolated agent sandbox. The rollup, forward events, history weeks and market
 * geography are all live reads.
 *
 * USAGE:
 *   npx tsx scripts/generate-onepager.ts [marketSlug] [--out <path>]
 *
 * EXAMPLE (the 4.4 Kyoto draft):
 *   npx tsx scripts/generate-onepager.ts kyoto --out scratch/kyoto-onepager-draft.pdf
 *
 * Defaults: marketSlug=kyoto, out=scratch/<slug>-onepager-draft.pdf
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../server/db";
import { travelPulseCalendarEvents } from "@shared/schema";
import { getMarketByKey } from "../server/services/trend-engine/operating-markets";
import { generateOnepagerDraft } from "../server/services/demand-onepager.service";
import { DEMAND_WINDOW_DAYS } from "../server/config/demand-floors.config";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * ⚑ check-A — the SAME forward-event probe the R33 spotlight uses (fetchForwardEvents), surfaced
 * so a run can SEE whether Kyoto has ingested dated events before the PDF is opened. An empty result
 * is the honest reason the spotlight ships dark (self-unlocking when events are ingested), not a bug.
 */
async function checkForwardEvents(marketName: string, now: Date) {
  const today = isoDay(now);
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + DEMAND_WINDOW_DAYS);
  const rows = await db
    .select({
      name: travelPulseCalendarEvents.eventName,
      start: travelPulseCalendarEvents.startDate,
      end: travelPulseCalendarEvents.endDate,
    })
    .from(travelPulseCalendarEvents)
    .where(
      and(
        eq(sql`lower(${travelPulseCalendarEvents.city})`, marketName.toLowerCase()),
        gte(travelPulseCalendarEvents.startDate, today),
        lte(travelPulseCalendarEvents.startDate, isoDay(horizon)),
      ),
    );
  return { today, horizon: isoDay(horizon), rows };
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
  // Positional slug = first non-flag arg that isn't the value consumed by --out.
  const consumed = outIdx >= 0 ? new Set([outIdx, outIdx + 1]) : new Set<number>();
  const slug = args.find((a, i) => !a.startsWith("--") && !consumed.has(i)) ?? "kyoto";
  const marketName = getMarketByKey(slug)?.cityName ?? slug;
  const outPath = out ?? `scratch/${slug}-onepager-draft.pdf`;
  const now = new Date();

  console.log(`\n=== Partner Demand · 4.4 one-pager DRAFT — ${marketName} (${slug}) ===`);
  console.log(`generated: ${now.toISOString()}\n`);

  // ⚑ check-A event probe (printed regardless of variant, so absence is explicit).
  const chk = await checkForwardEvents(marketName, now);
  console.log(`⚑ check-A — forward events for "${marketName}" in [${chk.today} … ${chk.horizon}] (${DEMAND_WINDOW_DAYS}d):`);
  if (chk.rows.length === 0) {
    console.log(`   (none) — R33 spotlight ships DARK. §13 honest absence, self-unlocking when events are ingested.\n`);
  } else {
    for (const r of chk.rows) {
      console.log(`   • ${r.name}  ${r.start}${r.end && r.end !== r.start ? `–${r.end}` : ""}`);
    }
    console.log("");
  }

  const draft = await generateOnepagerDraft(slug);
  if (!draft) {
    console.log(
      `NO ARTIFACT — ${marketName} does not clear the public floor for any figure class (R30/R31).\n` +
        `A page cannot be generated. This is the floor deciding, not an error.\n`,
    );
    process.exit(0);
  }

  const { model, pdf } = draft;
  const h = model.hero;
  console.log(`variant: ${model.variant}`);
  console.log(`hero:    ${h.headline}`);
  console.log(`         ${h.subline}  (N=${h.strictCount} planned trips)`);
  console.log(`windows: ${model.windowsTotal} floor-cleared forward window(s)`);
  console.log(`spotlight (R33): ${model.eventSpotlight ? `"${model.eventSpotlight.eventName}" ${model.eventSpotlight.start}–${model.eventSpotlight.end}` : "dark (no qualifying event window)"}`);
  console.log(`trend (R34):     ${model.trendBlock ? "shown" : "dark (below TREND_MIN_WEEKS of history)"}`);
  console.log(`gap pairing (R35): ${model.gapPairing ? "shown" : "dark (no property-coverage read / floor)"}`);
  console.log(`month range: ${model.monthRange}`);

  const dir = dirname(outPath);
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, pdf);
  console.log(`\n✅ DRAFT written: ${outPath}  (${(pdf.length / 1024).toFixed(1)} KB, DRAFT watermark)\n`);
  console.log(`This is a DRAFT for review only. External use stays locked behind the HARD STOP.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("generate-onepager failed:", err);
  process.exit(1);
});
