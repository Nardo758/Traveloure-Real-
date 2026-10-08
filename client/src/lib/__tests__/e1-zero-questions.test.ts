/**
 * LANE E1 — THE ZERO-QUESTION START (ledger `2026-10-08-e1-zero-questions`; decision-maker, Oct 7–8, 2026).
 *
 *   Z1  the mint body: dates OPTIONAL — neither ⇒ admitted; one without the other ⇒ refused (§13)
 *   Z2  the one client mint door: only an explicit `datesOptional` mints with no dates, and sends NO date key
 *   Z3  the start-page mint: city only, the experiences door, then the occasion through its one rail;
 *       a failed occasion PATCH still opens the plan and says so
 *   Z4  the guest record: the occasion and the city, nothing the page did not ask; it replays through the
 *       start-page mint, never the modal
 *   Z5  the server's placeholder is ONE day, the mint day in the plan's zone; a dated body is certified and a
 *       dateless one is not
 *   Z6  "Who's coming?": an empty field is never sent; the pets pair is R340's kind + count
 *   Z7  the dates gate: a placeholder window blocks Draft / Optimize / Trip Pass / travel options until set
 *   Z8  leg compute skips a plan whose dates nobody chose; a re-date runs it again
 *
 * Run: npx tsx --test client/src/lib/__tests__/e1-zero-questions.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tripMintBodySchema, tripPetCountSchema, tripPetKindSchema } from "@shared/schema";
import { checkSlipPrecondition, mintTripSlip } from "../trip-slip";
import { isStartPageRecord, mintStartPagePlan, startPageDestination, startPageGuestRecord } from "../start-page-plan";
import { datesGateBlocks, datesPanelCanSave, partyPanelBody } from "../../components/plan/SlipAnchorPanels";
import { planDatesGateLine } from "@shared/plan-dates";
import { placeholderMintDay } from "../../../../server/services/trip-placeholder-dates";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const BASE = { title: "Kyoto trip", destination: "Kyoto, Japan" };

describe("Z1–Z2 the mint", () => {
  it("Z1 the mint body admits neither date or both, never one", () => {
    assert.equal(tripMintBodySchema.safeParse(BASE).success, true);
    assert.equal(tripMintBodySchema.safeParse({ ...BASE, startDate: "2027-04-10", endDate: "2027-04-12" }).success, true);
    assert.equal(tripMintBodySchema.safeParse({ ...BASE, startDate: "2027-04-10" }).success, false);
    assert.equal(tripMintBodySchema.safeParse({ ...BASE, endDate: "2027-04-12" }).success, false);
  });

  it("Z2 only an explicit datesOptional mints with no dates, and no date key is sent", async () => {
    assert.equal(checkSlipPrecondition({ destination: "Kyoto, Japan" })?.reason, "dates_missing", "the default still refuses");
    assert.equal(checkSlipPrecondition({ destination: "Kyoto, Japan" }, { datesOptional: true }), null);
    assert.equal(checkSlipPrecondition({ destination: "Kyoto, Japan", startDate: "2027-04-10" }, { datesOptional: true })?.reason, "dates_missing");
    let sent: any = null;
    const out = await mintTripSlip({ destination: "Kyoto, Japan" }, async (b) => ((sent = b), { id: "t1" }), { datesOptional: true });
    assert.deepEqual(out, { ok: true, tripId: "t1" });
    assert.ok(!("startDate" in sent) && !("endDate" in sent), JSON.stringify(sent));
  });
});

describe("Z3–Z4 the start page", () => {
  const A = { experienceSlug: "travel", city: "Kyoto", country: "Japan" };

  it("Z3 mints the city only, through the experiences door, then sets the occasion", async () => {
    let body: any = null;
    const patched: string[] = [];
    const out = await mintStartPagePlan(A, {
      post: async (b) => ((body = b), { id: "t9" }),
      patchOccasion: async (id, slug) => void patched.push(`${id}:${slug}`),
    });
    assert.deepEqual(out, { ok: true, tripId: "t9", occasionSaved: true });
    assert.equal(body.destination, "Kyoto, Japan");
    assert.deepEqual(body.entry, { door: "experiences", occasionSource: "asked", finish: "myself" });
    assert.ok(!("startDate" in body));
    assert.deepEqual(patched, ["t9:travel"]);
    const failed = await mintStartPagePlan(A, { post: async () => ({ id: "t10" }), patchOccasion: async () => { throw new Error("x"); } });
    assert.deepEqual(failed, { ok: true, tripId: "t10", occasionSaved: false }, "the plan exists and is opened; the miss is said");
    const page = read("client/src/pages/experiences.tsx");
    assert.match(page, /setLocation\(planLandingPath\(outcome\.tripId, "myself", START_PAGE_DOOR\)\)/);
    assert.match(page, /setLocation\(GUEST_MAP_PATH\)/);
  });

  it("Z4 the guest record holds what the page asked and nothing else; it replays through the start mint", () => {
    const r = startPageGuestRecord(A);
    assert.equal(r.branch, "myself");
    assert.equal(r.door, "experiences");
    assert.deepEqual(r.answers.stops, [startPageDestination(A)]);
    assert.equal(r.answers.occasionSlug, "travel");
    for (const k of ["startDate", "endDate", "adults", "kids"] as const) assert.equal(r.answers[k], "", k);
    assert.equal(isStartPageRecord(r), true);
    assert.equal(isStartPageRecord({ door: "hero", branch: "myself" }), false);
    assert.equal(isStartPageRecord({ door: "experiences", branch: "ai" }), false);
    const ctx = read("client/src/contexts/PlanningContext.tsx");
    assert.match(ctx, /if \(isStartPageRecord\(record\)\) \{\s*void replayStartPageRecord\(record\);\s*return;/);
  });
});

describe("Z5 the server placeholder", () => {
  it("is one day, the mint day in the plan's own zone; a dated body is certified", () => {
    const now = new Date("2026-10-08T20:30:00Z"); // 05:30 on Oct 9 in Kyoto
    assert.equal(placeholderMintDay("Kyoto, Japan", now), "2026-10-09");
    assert.equal(placeholderMintDay("Atlantis", now), "2026-10-08", "outside the eight ⇒ read in UTC");
    const route = read("server/routes.ts");
    assert.match(route, /const datesChosenByTraveler = !!\(sanitizedInput\.startDate && sanitizedInput\.endDate\);/);
    assert.match(route, /placeholderDay \? \{ startDate: placeholderDay, endDate: placeholderDay \} : \{\}/);
    assert.match(read("shared/routes.ts"), /input: tripMintBodySchema,/);
  });
});

describe("Z6 who's coming", () => {
  it("sends only what was answered; pets are a kind and a count (R340)", () => {
    assert.equal(partyPanelBody({ adults: "", kids: "", petKind: "", petCount: "" }), null);
    assert.deepEqual(partyPanelBody({ adults: "2", kids: "", petKind: "", petCount: "" }), { adults: 2 });
    assert.deepEqual(partyPanelBody({ adults: "2", kids: "0", petKind: " dog ", petCount: "1" }), { adults: 2, kids: 0, petKind: "dog", petCount: 1 });
    assert.equal(tripPetKindSchema.safeParse("x".repeat(61)).success, false);
    assert.equal(tripPetCountSchema.safeParse(21).success, false);
    assert.equal(tripPetCountSchema.safeParse(null).success, true);
    const occ = read("server/routes/trips.routes.ts");
    assert.match(occ, /petKind: tripPetKindSchema,\s*petCount: tripPetCountSchema,/);
    assert.match(read("shared/schema.ts"), /petKind: true,\s*petCount: true,\s*\}\)\.extend\(\{/, "the mint denylist omits both (§19)");
  });
});

describe("Z7 the dates gate", () => {
  it("blocks only a placeholder window, and every gated action goes through it", () => {
    assert.equal(datesGateBlocks(false), true);
    assert.equal(datesGateBlocks(true), false);
    assert.equal(datesGateBlocks(undefined), false, "a payload before the field is not gated");
    assert.deepEqual(datesPanelCanSave("2027-04-12", "2027-04-10"), { ok: false, inverted: true });
    assert.match(planDatesGateLine("Optimize"), /^Optimize needs your dates/);
    const rail = read("client/src/components/plancard/SlipRail.tsx");
    assert.match(rail, /<DatesGate trip=\{trip\} action="Draft it with AI"/);
    assert.match(rail, /<DatesGate trip=\{trip\} action="Optimize"/);
    assert.match(read("client/src/components/plancard/TripPassCard.tsx"), /<DatesGate trip=\{trip \?\? \{ id: tripId \}\} action="The Trip Pass"/);
    assert.match(read("client/src/components/plan/LegSheet.tsx"), /props\.open && !needsDates &&/);
  });
});

describe("Z8 leg compute", () => {
  it("skips a plan whose dates nobody chose, and a re-date re-runs it", () => {
    assert.match(read("server/services/routing/plan-legs-engine.service.ts"), /if \(!trip\.datesConfirmedAt\) return \{ skipped: "dates_not_confirmed" \};/);
    assert.match(read("server/routes.ts"), /if \(sanitizedInput\.startDate \|\| sanitizedInput\.endDate\) enqueuePlanLegRecompute\(req\.params\.id\);/);
  });
});
