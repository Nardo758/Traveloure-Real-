/**
 * THE FREE AI DRAFT RUNS ONLY ON AN EMPTY SLIP — the decisions, and the coverage of the writers.
 *
 * CLAUDE.md Locked Decision 41 (b)/(c); ledger `2026-09-05-draft-only-on-empty` and
 * `2026-09-05-draft-cost-tracking-and-tier`.
 *
 * WHY THIS IS PURE. The predicate needs a database for exactly one thing — counting a trip's
 * `itinerary_items` rows — and everything it DECIDES is arithmetic and copy. Those live in
 * `ai-draft-eligibility.pure.ts` (the `trip-destinations.pure.ts` precedent) and keep their proof
 * in an environment with no `DATABASE_URL`. The static half below reads the repo's own source, so
 * it needs no database either.
 *
 * WHAT THESE HOLD:
 *   P1  a NULL/absent tripId is always eligible — there is no slip to overwrite.
 *   P2  a trip with zero items is eligible (`empty_slip`).
 *   P3  ONE item refuses — and the refusal names the trip, so the client can link to it.
 *   P4  EVERY STATUS COUNTS: a purchased/checkout/expert row makes the slip non-empty exactly as
 *       a plain in_planning AI row does. The count is a bare COUNT(*), never the rebuild guard's
 *       deletable predicate — the two predicates answer different questions.
 *   P5  the refusal BODY is the one shape the client routes on, and its copy claims no price.
 *   P6  the second layer's typed error carries the trip and the count, and is recognisable.
 *   P7  the SKETCH predicate: all-draft ⇒ true; one non-draft row ⇒ false; EMPTY ⇒ false (an
 *       empty plan is not a sketch — §13).
 *   S1  STATIC: every enumerated writer calls the predicate in its own module.
 *   S2  STATIC: the exempt Plus scheduler really does pass `tripId: null` — the reason its
 *       exemption states. An exemption is a claim, and this is the claim being checked.
 *   S3  STATIC: the free draft's model is read from the env-configurable constant, and the PAID
 *       optimizer's is NOT that constant (LD 41 (c) — the cost knob never reaches the paid rail).
 *
 * Run: npx tsx --test server/__tests__/ai-draft-eligibility.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AI_DRAFT_REFUSAL_ERROR,
  AI_DRAFT_REFUSAL_MESSAGE,
  AI_DRAFT_REFUSAL_STATUS,
  aiDraftRefusalBody,
  AiDraftSlipHasItemsError,
  decideAiDraftEligibility,
  isAiDraftSlipHasItemsError,
  isUntouchedAiDraftFromCounts,
} from "../services/ai-draft-eligibility.pure";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const TRIP = "11111111-2222-3333-4444-555555555555";

describe("LD 41 (b) — eligibility decisions", () => {
  it("P1 a new trip (no tripId) is always eligible", () => {
    for (const absent of [null, undefined, ""]) {
      const v = decideAiDraftEligibility(absent as any, 0);
      assert.equal(v.eligible, true);
      assert.equal(v.eligible && v.reason, "new_trip");
    }
  });

  it("P2 an empty slip is eligible", () => {
    const v = decideAiDraftEligibility(TRIP, 0);
    assert.equal(v.eligible, true);
    assert.equal(v.eligible && v.reason, "empty_slip");
  });

  it("P3 one item refuses, and the refusal names the trip", () => {
    const v = decideAiDraftEligibility(TRIP, 1);
    assert.equal(v.eligible, false);
    assert.equal(!v.eligible && v.reason, AI_DRAFT_REFUSAL_ERROR);
    assert.equal(!v.eligible && v.itemCount, 1);
    assert.equal(!v.eligible && v.tripId, TRIP);
    assert.equal(!v.eligible && v.optimizeHint, true);
  });

  it("P4 every status counts — the caller's number is a bare COUNT(*), so any row refuses", () => {
    // The predicate sees ONE number. What P4 really pins is that the SQL behind it filters
    // nothing: a purchased row and an in_planning row are the same input here, and the source
    // must not have grown a status/origin/routing filter.
    const sql = read("server/services/ai-draft-eligibility.ts");
    const countStmt = sql.slice(sql.indexOf("export async function countTripItineraryItems"));
    const stmt = countStmt.slice(0, countStmt.indexOf("}"));
    assert.match(stmt, /COUNT\(\*\)/);
    assert.match(stmt, /WHERE trip_id = /);
    for (const forbidden of ["routing_status", "origin", "status", "itineraryItemRebuildDeletable"]) {
      assert.ok(
        !stmt.includes(forbidden),
        `countTripItineraryItems must not filter on ${forbidden} — "empty" means no rows at all`,
      );
    }
    // And the decision itself refuses whatever the number is, as long as it is positive.
    for (const n of [1, 3, 42]) {
      assert.equal(decideAiDraftEligibility(TRIP, n).eligible, false);
    }
  });

  it("P5 the refusal body is the one shape the client routes on, and claims no price", () => {
    const refusal = decideAiDraftEligibility(TRIP, 4);
    assert.equal(refusal.eligible, false);
    if (refusal.eligible) return;
    const body = aiDraftRefusalBody(refusal);
    assert.deepEqual(body, {
      error: "slip_has_items",
      message: AI_DRAFT_REFUSAL_MESSAGE,
      optimize: true,
      itemCount: 4,
      tripId: TRIP,
    });
    assert.equal(AI_DRAFT_REFUSAL_STATUS, 409);
    // §13: the copy may say the DRAFT is free — it is — but must make NO claim about what
    // Optimize costs, in either direction: the pay gate decides, and a Trip Pass or the 24h
    // free-re-run window can make Optimize cost nothing. So the scan is over the sentence that
    // mentions Optimize, plus a global ban on a currency figure.
    assert.ok(!AI_DRAFT_REFUSAL_MESSAGE.includes("$"), "refusal copy must name no amount");
    const aboutOptimize = AI_DRAFT_REFUSAL_MESSAGE.slice(
      AI_DRAFT_REFUSAL_MESSAGE.indexOf("Optimize"),
    ).toLowerCase();
    for (const word of ["free", "pay", "paid", "charge", "cost", "price", "upgrade"]) {
      assert.ok(
        !aboutOptimize.includes(word),
        `refusal copy must make no claim about what Optimize costs; found "${word}"`,
      );
    }
  });

  it("P6 the second layer's error is typed, carries the facts, and is recognisable", () => {
    const err = new AiDraftSlipHasItemsError(TRIP, 7);
    assert.equal(isAiDraftSlipHasItemsError(err), true);
    assert.equal(isAiDraftSlipHasItemsError(new Error("something else")), false);
    assert.equal(err.tripId, TRIP);
    assert.equal(err.itemCount, 7);
    assert.equal(err.code, AI_DRAFT_REFUSAL_ERROR);
  });

  it("P7 the sketch predicate: all-draft true, mixed false, EMPTY false", () => {
    assert.equal(isUntouchedAiDraftFromCounts(5, 5), true);
    assert.equal(isUntouchedAiDraftFromCounts(5, 4), false);
    // §13: a plan with nothing in it is not a sketch — never labelled as one.
    assert.equal(isUntouchedAiDraftFromCounts(0, 0), false);
  });
});

/**
 * The writers this lane enumerated. Each entry is a file that writes an AI draft onto a trip, and
 * the marker proving it is THIS writer rather than a same-named neighbour.
 */
const GATED_WRITERS: Array<{ file: string; writeMarker: string; what: string }> = [
  {
    file: "server/routes.ts",
    writeMarker: "itineraryItemRebuildDeletable()",
    what: "POST /api/trips/:id/generate-itinerary — the Claude Regenerate wipe",
  },
  {
    file: "server/routes/content.routes.ts",
    writeMarker: "saveGeneratedItinerarySnapshot({",
    what: "POST /api/ai/generate-itinerary and POST /api/ai/itineraries/:id/save-as-trip",
  },
  {
    file: "server/services/content-query.service.ts",
    writeMarker: "itineraryItemRebuildDeletable()",
    what: "saveGeneratedItinerarySnapshot itself — the in-transaction second layer",
  },
];

describe("LD 41 — the writers are covered", () => {
  it("S1 every enumerated writer calls the eligibility predicate in its own module", () => {
    for (const w of GATED_WRITERS) {
      const src = read(w.file);
      assert.ok(src.includes(w.writeMarker), `${w.file} no longer looks like the writer it was (${w.what})`);
      const consults =
        src.includes("resolveAiDraftEligibility(") || src.includes("assertAiDraftEligible(");
      assert.ok(consults, `${w.file} writes an AI draft (${w.what}) without consulting the predicate`);
    }
  });

  it("S1b both content.routes handlers refuse, not just one", () => {
    const src = read("server/routes/content.routes.ts");
    const calls = src.match(/resolveAiDraftEligibility\(/g) ?? [];
    assert.ok(
      calls.length >= 2,
      `expected the generate rail AND save-as-trip to each call the predicate; found ${calls.length}`,
    );
  });

  it("S2 the exempt Plus scheduler really does mint a new trip (tripId: null)", () => {
    // Its exemption in scripts/check-ai-draft-eligibility.cjs CLAIMS this. A claim nobody checks
    // is how an exemption quietly stops being true.
    const src = read("server/services/occasion-drafts.service.ts");
    const call = src.slice(src.indexOf("saveGeneratedItinerarySnapshot({"));
    assert.match(call.slice(0, 400), /tripId:\s*null/);
  });

  it("S3 the free draft reads the env-configurable tier; the paid optimizer does not", () => {
    for (const file of ["server/routes.ts", "server/services/grok.service.ts"]) {
      assert.ok(
        read(file).includes("resolveAiDraftModel()"),
        `${file} must choose the draft's model through the one cost-decision constant`,
      );
    }
    const optimizer = read("server/itinerary-optimizer.ts");
    assert.ok(
      !optimizer.includes("resolveAiDraftModel"),
      "the PAID optimizer must never read the free draft's cost knob (LD 41 (c))",
    );
    // And the default really is the cheaper tier, not the optimizer's id.
    const modelModule = read("server/services/ai-draft-model.ts");
    assert.match(modelModule, /AI_DRAFT_MODEL_DEFAULT = "claude-haiku-4-5-20251001"/);
    assert.ok(!modelModule.includes("claude-sonnet"), "the draft default must not be the optimizer's tier");
  });
});
