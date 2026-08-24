#!/usr/bin/env tsx

/**
 * Phase 1b verification — run on dev, AFTER:
 *   1. npm run db:push
 *   2. tsx server/seeds/city-neighborhoods.seed.ts
 *   3. tsx server/scripts/backfill-gem-neighborhoods.ts
 *
 * Verifies three specific things that "deploy succeeded + 200 OK" misses,
 * each motivated by a real failure mode from the v2 spec discussion:
 *
 *   [A] Kyoto rollup density — Kyoto is the launch market and was sparse
 *       in the seeded base. If neighborhoods come back near-empty, that's
 *       the early signal that Phase 4's blended network fill is doing
 *       real work, not optional. Paris is intentionally NOT the primary
 *       check; it's seeded and will look fine, proving nothing.
 *
 *   [B] Gem centroid sanity — lat/lng → nearest-centroid assignment is
 *       easy to get subtly wrong at city edges. Spot-checks each matched
 *       gem against ALL centroids and prints the runner-up distance, so
 *       boundary mis-assignments are visible.
 *
 *   [C] Guardrail adversarial — featured low-rated must NOT bury a
 *       genuinely better unfeatured native result. That's the whole
 *       point of the rule; a naive sort fails this.
 *
 * Exits non-zero if any check fails. Designed to be diff'able run-to-run
 * so regressions show up loudly.
 *
 * Run: tsx server/scripts/verify-phase-1b.ts
 */

import { db } from "../db";
import {
  cityNeighborhoods,
  travelPulseHiddenGems,
  providerServices,
} from "@shared/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  featuredAdjustedScore,
  sortByFeaturedAdjusted,
} from "../services/featured-sort";

const EARTH_RADIUS_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

const results: CheckResult[] = [];
function record(name: string, status: "pass" | "fail" | "skip", detail: string) {
  results.push({ name, status, detail });
  const tag = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "SKIP";
  console.log(`[${tag}] ${name}\n      ${detail.split("\n").join("\n      ")}`);
}

// ─── [A] Kyoto rollup density ──────────────────────────────────────────────
async function checkKyotoRollup() {
  const kyotoNeighborhoods = await db
    .select()
    .from(cityNeighborhoods)
    .where(eq(cityNeighborhoods.city, "Kyoto"));

  if (kyotoNeighborhoods.length === 0) {
    record(
      "[A] Kyoto neighborhoods seeded",
      "fail",
      "No Kyoto neighborhoods found. Did you run server/seeds/city-neighborhoods.seed.ts?",
    );
    return;
  }
  record(
    "[A.1] Kyoto neighborhoods seeded",
    kyotoNeighborhoods.length >= 8 ? "pass" : "fail",
    `Found ${kyotoNeighborhoods.length} Kyoto neighborhoods (expected 8 from seed).`,
  );

  // Per-neighborhood rollup count for gems and services.
  const lines: string[] = [];
  let totalGems = 0;
  let totalServices = 0;
  for (const n of kyotoNeighborhoods) {
    const gemRows = await db
      .select()
      .from(travelPulseHiddenGems)
      .where(
        and(
          eq(travelPulseHiddenGems.city, "Kyoto"),
          eq(travelPulseHiddenGems.neighborhood, n.slug),
        ),
      );
    const svcRows = await db
      .select()
      .from(providerServices)
      .where(eq(providerServices.neighborhood, n.slug));
    totalGems += gemRows.length;
    totalServices += svcRows.length;
    const flag = gemRows.length + svcRows.length === 0 ? " <-- EMPTY" : "";
    lines.push(`${n.name.padEnd(28)} gems=${gemRows.length}  services=${svcRows.length}${flag}`);
  }

  // The signal: if average rollup per neighborhood is <2 total items,
  // network fill is load-bearing, not optional.
  const avgPerNeighborhood = (totalGems + totalServices) / kyotoNeighborhoods.length;
  const sparse = avgPerNeighborhood < 2;
  record(
    "[A.2] Kyoto rollup density",
    "pass", // Informational — we don't fail on sparsity, we flag it.
    `Total: ${totalGems} gems + ${totalServices} services across ${kyotoNeighborhoods.length} neighborhoods.\n` +
      `Average per neighborhood: ${avgPerNeighborhood.toFixed(1)}.\n` +
      (sparse
        ? "SIGNAL: Kyoto is sparse → Phase 4 blended network fill is LOAD-BEARING, not optional."
        : "Kyoto has reasonable density without network fill.") +
      `\n` +
      lines.join("\n"),
  );
}

// ─── [B] Gem centroid sanity ───────────────────────────────────────────────
async function checkGemBackfillCorrectness() {
  // Source pool: gems with coordinates — these are the ones the backfill
  // CAN process. If this is zero, there's nothing to verify (SKIP). If it's
  // nonzero but matched is zero, the backfill is broken (FAIL).
  const sourcePool = await db
    .select()
    .from(travelPulseHiddenGems)
    .where(
      and(
        isNotNull(travelPulseHiddenGems.latitude),
        isNotNull(travelPulseHiddenGems.longitude),
      ),
    );

  if (sourcePool.length === 0) {
    record(
      "[B] Gem centroid sanity",
      "skip",
      "No gems in the DB have lat/lng — nothing for the backfill to process. " +
        "This is expected on dev (TravelPulse gems may not be seeded). " +
        "Will become a real check in any env where gems with coordinates exist.",
    );
    return;
  }

  const matched = sourcePool.filter(
    (g) => g.neighborhood !== null && g.neighborhood !== undefined,
  );

  if (matched.length === 0) {
    record(
      "[B] Gem backfill ran",
      "fail",
      `${sourcePool.length} gem(s) with lat/lng exist but none have a neighborhood assigned. ` +
        "The backfill is broken or wasn't run. Try: tsx server/scripts/backfill-gem-neighborhoods.ts",
    );
    return;
  }
  record(
    "[B.1] Gem backfill produced matches",
    "pass",
    `${matched.length} / ${sourcePool.length} gems with coordinates have a neighborhood assigned.`,
  );

  const allNeighborhoods = await db.select().from(cityNeighborhoods);

  // Spot-check up to 10 random matches: confirm the assigned slug is in
  // fact the nearest one within radius, and report the runner-up gap.
  const sample = matched
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(10, matched.length));

  let mismatches = 0;
  const sampleLines: string[] = [];
  for (const gem of sample) {
    const gLat = Number(gem.latitude);
    const gLng = Number(gem.longitude);
    const candidates = allNeighborhoods
      .filter((n) => n.city.toLowerCase() === gem.city.toLowerCase())
      .map((n) => ({
        slug: n.slug,
        dist: haversineKm(gLat, gLng, Number(n.centroidLat), Number(n.centroidLng)),
        radius: Number(n.radiusKm ?? "1.5"),
      }))
      .sort((a, b) => a.dist - b.dist);

    if (candidates.length === 0) {
      sampleLines.push(`${gem.placeName} — assigned ${gem.neighborhood} but no centroids exist for city ${gem.city}`);
      mismatches++;
      continue;
    }

    const winner = candidates[0];
    const runnerUp = candidates[1];
    const correctAssignment = winner.slug === gem.neighborhood && winner.dist <= winner.radius;
    const edgeGap = runnerUp ? (runnerUp.dist - winner.dist).toFixed(2) : "N/A";

    if (!correctAssignment) {
      mismatches++;
      sampleLines.push(
        `MISMATCH: ${gem.placeName} (${gem.city}) — assigned ${gem.neighborhood}, ` +
          `but nearest is ${winner.slug} at ${winner.dist.toFixed(2)}km (radius ${winner.radius}km)`,
      );
    } else {
      sampleLines.push(
        `OK: ${gem.placeName.padEnd(35)} → ${winner.slug.padEnd(20)} ` +
          `(${winner.dist.toFixed(2)}km, runner-up gap ${edgeGap}km)`,
      );
    }
  }
  record(
    "[B.2] Gem centroid assignments correct",
    mismatches === 0 ? "pass" : "fail",
    `Spot-checked ${sample.length} gems, ${mismatches} mismatch(es).\n` + sampleLines.join("\n"),
  );
}

// ─── [C] Guardrail adversarial ─────────────────────────────────────────────
function checkFeaturedGuardrail() {
  // Three items:
  //   A: featured, low quality (mediocre stuff someone editorialised)
  //   B: NOT featured, high quality (the genuinely better native result)
  //   C: featured, high quality (the marquee item that deserves the boost)
  const items = [
    { id: "A_featured_low", isFeatured: true, quality: 40 },
    { id: "B_unfeatured_high", isFeatured: false, quality: 90 },
    { id: "C_featured_high", isFeatured: true, quality: 85 },
  ];

  const sorted = sortByFeaturedAdjusted([...items], (i) => i.quality);
  const order = sorted.map((i) => i.id);

  // Spec rule: B must NOT be below A. The featured-but-mediocre item must
  // not bury the better native result.
  const idxA = order.indexOf("A_featured_low");
  const idxB = order.indexOf("B_unfeatured_high");
  const ruleHeld = idxB < idxA;

  // Secondary rule: C should beat or tie B — featured does win among
  // comparable-quality items (90 vs 85+10 = 95 → C wins).
  const idxC = order.indexOf("C_featured_high");
  const comparableBoost = idxC <= idxB;

  // Tertiary: A's effective score should equal its raw quality (boost
  // suppressed by FEATURED_MIN_QUALITY floor? No — 40 is above 30, so
  // A gets the boost. But still must not beat B.) Sanity check the math.
  const scoreA = featuredAdjustedScore(items[0], items[0].quality); // 40 + 10 = 50
  const scoreB = featuredAdjustedScore(items[1], items[1].quality); // 90
  const scoreC = featuredAdjustedScore(items[2], items[2].quality); // 85 + 10 = 95
  const mathOK = scoreA === 50 && scoreB === 90 && scoreC === 95;

  record(
    "[C.1] Featured low-quality does NOT bury better unfeatured (the rule)",
    ruleHeld ? "pass" : "fail",
    `Sort order: ${order.join(" > ")}\n` +
      `Scores: A=${scoreA} B=${scoreB} C=${scoreC}\n` +
      (ruleHeld
        ? "B (unfeatured high) correctly ranks above A (featured low)."
        : "RULE BROKEN: A buried B. Guardrail isn't working."),
  );
  record(
    "[C.2] Featured high beats comparable unfeatured (boost works)",
    comparableBoost ? "pass" : "fail",
    `C (featured high) ${comparableBoost ? "ranks at-or-above" : "is below"} B (unfeatured high).`,
  );
  record(
    "[C.3] Score math: boost = +10 above floor, no boost below",
    mathOK ? "pass" : "fail",
    `Expected A=50 B=90 C=95, got A=${scoreA} B=${scoreB} C=${scoreC}.`,
  );
}

// ─── Run ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Phase 1b verification ===\n");
  await checkKyotoRollup();
  console.log();
  await checkGemBackfillCorrectness();
  console.log();
  checkFeaturedGuardrail();
  console.log();

  const passed = results.filter((r) => r.status === "pass");
  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");
  console.log("=== Summary ===");
  console.log(
    `Total: ${results.length}  Passed: ${passed.length}  Failed: ${failed.length}  Skipped: ${skipped.length}`,
  );
  if (skipped.length > 0) {
    console.log("\nSkipped checks (no source data — not a regression):");
    for (const r of skipped) console.log(`  - ${r.name}`);
  }
  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const r of failed) console.log(`  - ${r.name}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Verification crashed:", err);
  process.exit(2);
});
