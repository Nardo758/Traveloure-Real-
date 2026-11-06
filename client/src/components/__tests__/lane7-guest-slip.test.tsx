/**
 * Lane 7 — A-22, as amended by PLAN-1 Phase 3 (ledger `2026-11-06-plan1-phase3-one-planner`): a guest's plan is drawn by
 * THE Trip Slip — `SlipView` in guest mode — and the separate `GuestPlanSlip` is deleted (§18c).
 *
 *   G1  guestSlipData: the guest plan in the slip's own shape — the trip's answers, the days, nothing member-only
 *   G2  the guest page mounts SlipView with `guest`, and GuestPlanSlip is gone
 *   G3  SlipView gates every owner-only surface on the guest mode (no fee line, no booking or plan rail, no ⋯ menu)
 *   G4  a guest's slip reads no member rail: the per-plan reads key on an empty id
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/components/__tests__/lane7-guest-slip.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { guestSlipData, type GuestPlanView } from "@/lib/waitlist-guest-plan";

const view = (datesConfirmed: boolean): GuestPlanView => ({
  plan: {
    id: "t1", title: "Kyoto", destination: "Kyoto, Japan", startDate: "2026-11-11", endDate: "2026-11-13", datesConfirmed,
    adults: 2, kids: null, numberOfTravelers: null, eventType: null, updatedAt: null,
  },
  items: [
    { id: "b", title: "Nishiki Market", description: null, itemType: "activity", dayNumber: 2, locationName: "Nakagyo", latitude: "35.0", longitude: "135.7" },
    { id: "a", title: "Fushimi Inari", description: null, itemType: "activity", dayNumber: 1, locationName: "Fushimi", latitude: null, longitude: null },
  ],
  retentionDays: 30,
} as GuestPlanView);

const read = (p: string) => fs.readFileSync(p, "utf8");
const SLIP = "client/src/components/plancard/SlipView.tsx";

describe("Lane 7 guest slip (PLAN-1 Phase 3)", () => {
  it("G1 guestSlipData carries the plan's answers and days, and no member-only fact", () => {
    const d = guestSlipData(view(false)) as any;
    assert.equal(d.trip.id, "t1");
    assert.equal(d.trip.destination, "Kyoto, Japan");
    assert.equal(d.trip.datesConfirmed, false, "placeholder dates stay placeholders");
    assert.equal(d.trip.adults, 2);
    assert.equal("kids" in d.trip, false, "an unstated answer is omitted, never 0");
    assert.equal(d.trip.travelers, 2);
    assert.equal(d.tripRole, undefined, "a guest has no member role");
    const items = d.days.flatMap((x: any) => x.activities.map((a: any) => [x.dayNum, a.id]));
    assert.deepEqual(items.sort(), [[1, "a"], [2, "b"]]);
    const located = d.days.flatMap((x: any) => x.activities).find((a: any) => a.id === "b");
    assert.equal(located.lat, 35.0);
    assert.equal(guestSlipData(view(true)).trip?.datesConfirmed, true);
  });

  it("G2 the guest page mounts SlipView in guest mode; GuestPlanSlip is deleted", () => {
    const page = read("client/src/pages/guest-plan-map.tsx");
    assert.match(page, /<SlipView\s[\s\S]*?data=\{guestSlipData\(view\)\}[\s\S]*?guest=\{\{/);
    assert.doesNotMatch(page, /GuestPlanSlip|InlineDatesPanel|InlineWhoPanel/);
    assert.equal(fs.existsSync("client/src/components/plan/GuestPlanSlip.tsx"), false);
  });

  it("G3 SlipView gates the owner-only surfaces on guest", () => {
    const s = read(SLIP);
    assert.match(s, /slipView === "list" && !guest \? \(\s*<PlanCostStrip/, "no fee/cost line for a guest");
    assert.match(s, /data\.trip && !guest \? \(\s*<SlipRail/, "no plan rail (expert, engagements, Finish) for a guest");
    assert.match(s, /isPrimary && data\.trip && !guest && <TripCardPrimaryBanner/);
    assert.match(s, /menu=\{\s*data\.trip && !guest \?/, "no header ⋯ menu for a guest");
    assert.match(s, /const isOwner = !isGuest && /);
    assert.match(s, /mode=\{guest \? \{ kind: "guest"/, "the map is the guest's mode of the same MapControlCenter");
  });

  it("G4 a guest's slip reads no member rail", () => {
    const s = read(SLIP);
    assert.match(s, /const tripId = isGuest \? "" : planId;/);
    assert.match(s, /const tripId = guest \? "" : planTripId;/);
    assert.match(s, /if \(!isGuest\) void savePlanView\(/, "a guest's view is never saved to an account");
    assert.match(s, /useOptionSets\(tripId, !isGuest\)/);
  });
});
