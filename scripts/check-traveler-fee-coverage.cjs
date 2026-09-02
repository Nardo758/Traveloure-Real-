#!/usr/bin/env node
/**
 * check-traveler-fee-coverage.cjs — traveler-fee completeness gate
 * (ruling 2026-09-02-traveler-fee-applies-everywhere; the invariant close-out).
 *
 * THE INVARIANT: every traveler-charging path resolves the traveler service fee through the ONE
 * band-driven resolver (`resolveTravelerServiceFee`, §8/§14) AND writes it to `fee_ledger` through
 * one of the shared traveler-fee ledger writers — so a covered line lands a `fee_waiver` net-zero
 * pair and an uncovered line lands a `traveler_service_fee` row; never silence. This gate makes
 * "someone unwires the fee from an existing charge path" a RED build instead of a silent revenue
 * hole — the same move as check-money-endpoints / check-itinerary-rebuild-guard.
 *
 * RULE: each MANIFEST file below (the known traveler-charging entry points, ruling classification a)
 * MUST textually reference BOTH `resolveTravelerServiceFee` AND at least one of the ledger writers
 *   recordTravelerServiceFeeLedger | recordLegacyBookingTravelerFeeLedger | recordExpertReviewTravelerFeeLedger
 * or carry an explicit `// traveler-fee-exempt: <reason>` somewhere in the file.
 *
 * STATED NEGATIVE SPACE (ruling 43 / §18d): this gate knows ONLY the four charge-path FILES in the
 * manifest. It does NOT discover a NEW traveler-charging path (that is the money-guard's job on the
 * req.body side and a human review's job), does NOT verify the fee amount/coverage is CORRECT (only
 * that the wiring is present), and does NOT follow the call through a helper it cannot see textually.
 * A path that is deleted from the repo is removed from the manifest in the same change (reviewed).
 *
 * `--self-test` runs committed inline fixtures (§18d: a predicate ships with fixtures) and exits
 * nonzero if the predicate stops catching an unwired path or starts flagging a wired one.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");

// The known traveler-charging paths (ruling 2026-09-02, classification (a)). Each must wire the
// resolver + a ledger writer. `note` documents which path the file is.
const MANIFEST = [
  { file: "server/routes/payments.routes.ts", note: "cart / direct checkout + deposit balance" },
  { file: "server/services/booking.service.ts", note: "legacy bookings rail (process-cart)" },
  { file: "server/services/stripe.service.ts", note: "platform transport" },
  { file: "server/routes/booking-actions.ts", note: "expert review service" },
];

const RESOLVER = "resolveTravelerServiceFee";
const LEDGER_WRITERS = [
  "recordTravelerServiceFeeLedger",
  "recordLegacyBookingTravelerFeeLedger",
  "recordExpertReviewTravelerFeeLedger",
];
const EXEMPT = /\/\/\s*traveler-fee-exempt:/;

/** The predicate, pure over file text so the self-test can exercise it without the filesystem. */
function wiredOrExempt(text) {
  if (EXEMPT.test(text)) return { ok: true, exempt: true };
  const hasResolver = text.includes(RESOLVER);
  const hasWriter = LEDGER_WRITERS.some((w) => text.includes(w));
  return { ok: hasResolver && hasWriter, exempt: false, hasResolver, hasWriter };
}

function selfTest() {
  const failures = [];
  const wired = `const f = await resolveTravelerServiceFee(price); await recordTravelerServiceFeeLedger({});`;
  const legacyWired = `resolveTravelerServiceFee(x); recordLegacyBookingTravelerFeeLedger({});`;
  const missingWriter = `const f = await resolveTravelerServiceFee(price); // charged but never ledgered`;
  const missingResolver = `await recordTravelerServiceFeeLedger({}); // ledgered but no resolver`;
  const exempt = `// traveler-fee-exempt: this file only reads, never charges\nconst x = 1;`;

  if (!wiredOrExempt(wired).ok) failures.push("a fully-wired path must PASS");
  if (!wiredOrExempt(legacyWired).ok) failures.push("the legacy writer must satisfy the rule");
  if (wiredOrExempt(missingWriter).ok) failures.push("a path with no ledger writer must FAIL");
  if (wiredOrExempt(missingResolver).ok) failures.push("a path with no resolver must FAIL");
  if (!wiredOrExempt(exempt).ok) failures.push("an explicit exemption must PASS");

  if (failures.length) {
    console.error("SELF-TEST FAILED (traveler-fee-coverage):");
    for (const f of failures) console.error("  · " + f);
    process.exit(1);
  }
  console.log("traveler-fee-coverage self-test OK (5 fixtures)");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  const failures = [];
  const exemptions = [];
  for (const entry of MANIFEST) {
    const abs = path.join(REPO, entry.file);
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      failures.push(`${entry.file} — MANIFEST file not found (was a charge path moved without updating the gate?)`);
      continue;
    }
    const r = wiredOrExempt(text);
    if (r.exempt) {
      exemptions.push(entry.file);
      continue;
    }
    if (!r.ok) {
      const missing = [];
      if (!r.hasResolver) missing.push(`the resolver \`${RESOLVER}\``);
      if (!r.hasWriter) missing.push(`a ledger writer (${LEDGER_WRITERS.join(" | ")})`);
      failures.push(`${entry.file} (${entry.note}) — missing ${missing.join(" AND ")}.`);
    }
  }

  // Exemptions are REPORTED on every run so a filed exemption never becomes a silent baseline (§18d).
  for (const e of exemptions) console.log(`[traveler-fee-exempt] ${e}`);

  if (failures.length) {
    console.error("FAIL — traveler-fee coverage gate (ruling 2026-09-02-traveler-fee-applies-everywhere):");
    for (const f of failures) console.error("  · " + f);
    console.error(
      "\nEvery traveler-charging path must resolve the fee via `resolveTravelerServiceFee` and write it\n" +
        "to fee_ledger via a shared writer (a covered line nets a fee_waiver leg; an uncovered line a\n" +
        "traveler_service_fee row). Wire it, or carry `// traveler-fee-exempt: <reason>` with review.",
    );
    process.exit(1);
  }
  console.log(
    `traveler-fee coverage gate OK (${MANIFEST.length} charge path(s) wired, ${exemptions.length} exempt).`,
  );
}

main();
