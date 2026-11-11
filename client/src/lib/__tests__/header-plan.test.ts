/**
 * Cut-list #1, slice A — the header's plan state matrix, and the 375px budget.
 *
 * The ruled states (brief v3, slice A):
 *   guest, no plan / no cookie ......... Start a plan (today's `newPlan`)
 *   guest, empty plan (0 stops) ........ Start a plan that REOPENS that plan (no `newPlan`)
 *   guest, 1+ stops ................... "Your {city} plan · {n}" + dates or "Add dates", → /plans/{id}
 *   guest, expired / 404 ............... Start a plan (the chip must not survive an expired plan)
 *   signed in .......................... the same chip from the active plan: most recently updated,
 *                                       un-finalized; no count in the list ⇒ no invented number
 *
 *   H1 guest with nothing (and with a failed/expired read) gets Start a plan
 *   H2 guest with an EMPTY plan gets Start a plan that reopens it
 *   H3 guest with stops gets the chip: label, count, dates, and a /plans/{id} link with no ?view=
 *   H4 the city-less label falls back to "Your plan · {n}"
 *   H5 unconfirmed dates read "Add dates"
 *   H6 signed in: most recently updated, un-finalized only
 *   H7 signed in with no count in the list: reopen, never "· 0"
 *   H8 the 375px budget and the two structural facts (one component, two mounts)
 *
 * Run: npx tsx --test client/src/lib/__tests__/header-plan.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  headerCity,
  GUEST_PLAN_HREF,
  HEADER_ADD_DATES_LABEL,
  activeHeaderTrip,
  headerDatesLabel,
  headerDatesTarget,
  headerDatesLine,
  headerPlanLabel,
  headerPlanState,
  type HeaderGuestPlan,
  type HeaderTrip,
} from "../header-plan";

const guest = (over: Partial<HeaderGuestPlan["plan"]> = {}, items = 0): HeaderGuestPlan => ({
  plan: {
    id: "gp-1",
    destination: "Kyoto",
    startDate: "2026-11-12",
    endDate: "2026-11-15",
    datesConfirmed: true,
    ...over,
  },
  items: Array.from({ length: items }, (_, i) => ({ id: `i${i}` })),
});

describe("slice A — the header plan state", () => {
  it("H1 a guest with nothing, or with a failed/expired read, gets Start a plan", () => {
    assert.deepEqual(headerPlanState({ isSignedIn: false, guestStatus: "idle", guestPlan: null, trips: null }), { kind: "start" });
    assert.deepEqual(headerPlanState({ isSignedIn: false, guestStatus: "error", guestPlan: null, trips: null }), { kind: "start" }, "404 / expired");
    assert.deepEqual(headerPlanState({ isSignedIn: false, guestStatus: "loading", guestPlan: guest({}, 3), trips: null }), { kind: "loading" }, "a read in flight claims nothing — and is not Start a plan either (QA round 3, major 5)");
  });

  it("H2 a guest whose plan is EMPTY gets Start a plan that reopens it", () => {
    assert.deepEqual(
      headerPlanState({ isSignedIn: false, guestStatus: "ready", guestPlan: guest({}, 0), trips: null }),
      { kind: "resume", planId: "gp-1", city: "Kyoto", guest: true },
    );
  });

  it("H3 a guest with stops gets the chip", () => {
    const state = headerPlanState({ isSignedIn: false, guestStatus: "ready", guestPlan: guest({}, 2), trips: null });
    assert.deepEqual(state, { kind: "chip", planId: "gp-1", city: "Kyoto", stops: 2, dates: "Nov 12\u201315", guest: true });
    assert.equal(headerPlanLabel(state), "Your Kyoto plan \u00b7 2");
    assert.equal(headerDatesLine(state), "Nov 12\u201315");
    // The label links the slip's Days view — no ?view= (it is the ruled landing). Header fix v2:
    // the link is the Trip Strip's (`trip-strip-plan-link`).
    const STRIP = fs.readFileSync("client/src/components/trip/trip-strip.tsx", "utf8");
    // A GUEST label goes to the guest slip, never /plans/{id}: that is a ProtectedRoute and would
    // sign-in-wall the very traveler the label speaks for. Never /?start=1 either (a new plan).
    assert.equal(GUEST_PLAN_HREF, "/plans/new");
    assert.match(STRIP, /planState\.guest\s*\?\s*GUEST_PLAN_HREF\s*:\s*planningRouteForTrip\(planState\.planId/, "guest → /plans/new, owner → the planning route");
    const hrefLines = STRIP.split("\n").filter((line) => line.includes("GUEST_PLAN_HREF") || line.includes("planningRouteForTrip("));
    for (const line of hrefLines) assert.doesNotMatch(line, /\?view=/, line);
  });

  it("H3b the city is the first comma segment; a read in flight draws nothing (QA round 3, majors 2 and 5)", () => {
    const state = headerPlanState({ isSignedIn: false, guestStatus: "ready", guestPlan: guest({ destination: "Kyoto, Japan" }, 2), trips: null });
    assert.equal(headerPlanLabel(state), "Your Kyoto plan \u00b7 2", "never 'Your Kyoto, Japan plan'");
    assert.equal(headerCity("  Porto , Portugal"), "Porto");
    assert.equal(headerCity(", Japan"), null);
    assert.deepEqual(headerPlanState({ isSignedIn: false, guestStatus: "loading", guestPlan: null, trips: null }), { kind: "loading" });
    assert.deepEqual(headerPlanState({ isSignedIn: true, guestStatus: "idle", guestPlan: null, trips: undefined }), { kind: "loading" });
    assert.deepEqual(headerPlanState({ isSignedIn: true, guestStatus: "idle", guestPlan: null, trips: [] }), { kind: "start" });
    const LAYOUT = fs.readFileSync("client/src/components/layout.tsx", "utf8");
    assert.match(LAYOUT, /const navReservesStart = headerState\.kind === "loading"/, "the nav reserves the slot while loading");
    assert.match(LAYOUT, /headerTripsLoading \? undefined : \(headerTrips \?\? \[\]\)/, "undefined while the list is in flight");
  });

  it("H4 without a city, the label falls back", () => {
    const state = headerPlanState({ isSignedIn: false, guestStatus: "ready", guestPlan: guest({ destination: "  " }, 3), trips: null });
    assert.equal(headerPlanLabel(state), "Your plan \u00b7 3");
  });

  it("H5 unconfirmed dates read Add dates", () => {
    const state = headerPlanState({
      isSignedIn: false,
      guestStatus: "ready",
      guestPlan: guest({ datesConfirmed: false }, 1),
      trips: null,
    });
    assert.equal(headerDatesLine(state), HEADER_ADD_DATES_LABEL);
    assert.equal(HEADER_ADD_DATES_LABEL, "Add dates");
  });

  it("H6 signed in: most recently updated, un-finalized, not finished", () => {
    const trips: HeaderTrip[] = [
      { id: "old", destination: "Kyoto", updatedAt: "2026-11-01T00:00:00Z", itemCount: 4 },
      { id: "newest", destination: "Lisbon", updatedAt: "2026-11-09T00:00:00Z", itemCount: 7 },
      { id: "final", destination: "Osaka", updatedAt: "2026-11-10T00:00:00Z", itemCount: 9, finalizedAt: "2026-11-10T00:00:00Z" },
      { id: "done", destination: "Rome", updatedAt: "2026-11-10T00:00:00Z", itemCount: 2, status: "completed" },
    ];
    // Finality is the ONLY filter: `done` was never finalized, so it is the active plan even though
    // its status says completed (a lifecycle label, not a finality fact).
    assert.equal(activeHeaderTrip(trips)?.id, "done", "the newest UN-FINALIZED plan wins, whatever its status");
    const state = headerPlanState({ isSignedIn: true, guestStatus: "idle", guestPlan: null, trips });
    assert.deepEqual(state, { kind: "chip", planId: "done", city: "Rome", stops: 2, dates: null, guest: false });
    assert.equal(headerPlanLabel(state), "Your Rome plan \u00b7 2");
    assert.equal(headerDatesLine(state), HEADER_ADD_DATES_LABEL, "the list carries no dates ⇒ Add dates, never a guess");
  });

  it("H7 signed in with no count in the list: reopen, never '· 0'", () => {
    const trips: HeaderTrip[] = [{ id: "t1", destination: "Kyoto", updatedAt: "2026-11-09T00:00:00Z" }];
    assert.deepEqual(
      headerPlanState({ isSignedIn: true, guestStatus: "idle", guestPlan: null, trips }),
      { kind: "resume", planId: "t1", city: "Kyoto", guest: false },
    );
    // And a signed-in visitor with nothing gets Start a plan.
    assert.deepEqual(headerPlanState({ isSignedIn: true, guestStatus: "idle", guestPlan: null, trips: [] }), { kind: "start" });
  });

  it("H8 date formatting is deterministic and cannot shift a day", () => {
    assert.equal(headerDatesLabel("2026-11-12", "2026-11-15"), "Nov 12\u201315");
    assert.equal(headerDatesLabel("2026-11-28", "2026-12-03"), "Nov 28 \u2013 Dec 3");
    assert.equal(headerDatesLabel("2026-11-12", "2026-11-12"), "Nov 12", "slice B: a same-day trip is one day");
    assert.equal(headerDatesLabel("nope", "2026-12-03"), null);
  });
});

describe("slice A — the plan state is computed once; header fix v2 renders it in the strip", () => {
  it("the ONE plan state feeds the strip, and the nav draws only the start CTA", () => {
    const LAYOUT = fs.readFileSync("client/src/components/layout.tsx", "utf8");
    assert.doesNotMatch(LAYOUT, /HeaderPlanCTA/, "the nav chip is gone (decision-maker Nov 11, 2026)");
    assert.match(LAYOUT, /const headerState = headerPlanState\(/);
    assert.match(LAYOUT, /<TripStrip planState=\{headerState\} datesTarget=\{headerDates\} signedIn=\{!!user\} \/>/);
    assert.match(LAYOUT, /useGuestPlan\(guestPresent && !user\)/, "the guest read is gated on the presence cookie");
    assert.match(LAYOUT, /hasGuestPresenceCookie\(document\.cookie\)/, "…by the same check shouldClaimGuestPlans uses");
    assert.match(LAYOUT, /useActivePlan\(\)/, "the signed-in plan is the ONE active-plan rule's");
  });

  it("the binding wins over recency, and recency wins otherwise (the one rule)", () => {
    const trips: HeaderTrip[] = [
      { id: "older", destination: "Kyoto", updatedAt: "2026-11-01T00:00:00Z", itemCount: 3 },
      { id: "newer", destination: "Kyoto", updatedAt: "2026-11-10T00:00:00Z", itemCount: 1 },
    ];
    assert.equal(activeHeaderTrip(trips)?.id, "newer");
    assert.equal(activeHeaderTrip(trips, "older")?.id, "older", "an explicit binding wins");
    assert.equal(activeHeaderTrip(trips, "missing")?.id, "newer", "a binding not in the list falls through to recency");
    const state = headerPlanState({ isSignedIn: true, guestStatus: "idle", guestPlan: null, trips, bound: "older" });
    assert.equal(state.kind === "chip" && state.planId, "older");
  });

  it("BETA is its own link, and the ribbon left only the traveler path", () => {
    const LAYOUT = fs.readFileSync("client/src/components/layout.tsx", "utf8");
    // No nested anchors: the logo link closes before the BETA link opens.
    const logoEnd = LAYOUT.indexOf("</Link>", LAYOUT.indexOf('data-testid="link-logo"'));
    const betaLink = LAYOUT.indexOf('data-testid="link-beta"');
    assert.ok(logoEnd > 0 && betaLink > logoEnd, "BETA sits AFTER the logo link closes");
    assert.match(LAYOUT, /href="\/discover\/location\/Kyoto"/, "…and points at the launch surface");
    // The ribbon KEEPS its mount on the marketing pages; the traveler path is what it left.
    assert.match(LAYOUT, /\{showsTicker\(location\) && <CityTickerTape \/>\}/, "the ribbon still mounts");
    const MOUNT = fs.readFileSync("client/src/lib/ticker-mount.ts", "utf8");
    assert.doesNotMatch(MOUNT, /"\/experiences"/, "/experiences is OFF the marketing list");
    for (const marketing of ['"/"', '"/about"', '"/pricing"', '"/how-it-works"', '"/local-experts"', '"/providers"', '"/press"', '"/blog"']) {
      assert.ok(MOUNT.includes(marketing), `${marketing} keeps the ribbon`);
    }
  });
});

describe("slice B — the chip's dates segment re-dates the plan the chip names", () => {
  const guestPlan = { plan: { id: "gp-1", destination: "Kyoto", startDate: "2026-11-11", endDate: "2026-11-11", datesConfirmed: false }, items: [1] };
  it("a guest chip targets the guest plan with its own (unconfirmed) dates", () => {
    const state = headerPlanState({ isSignedIn: false, guestStatus: "ready", guestPlan, trips: null });
    assert.deepEqual(headerDatesTarget(state, { guestPlan, trips: null }), {
      guest: true, planId: "gp-1", startDate: "2026-11-11", endDate: "2026-11-11", datesConfirmed: false,
    });
  });
  it("a signed-in chip targets the active trip; confirmed reads from datesConfirmedAt", () => {
    const trips = [{ id: "t1", destination: "Kyoto", startDate: "2026-11-12", endDate: "2026-11-15", datesConfirmedAt: "2026-11-01", updatedAt: "2026-11-02", itemCount: 2 }];
    const state = headerPlanState({ isSignedIn: true, guestStatus: "idle", guestPlan: null, trips });
    assert.deepEqual(headerDatesTarget(state, { guestPlan: null, trips }), {
      guest: false, planId: "t1", startDate: "2026-11-12", endDate: "2026-11-15", datesConfirmed: true,
    });
  });
  it("no chip, no target", () => {
    assert.equal(headerDatesTarget({ kind: "start" }, { guestPlan: null, trips: null }), null);
  });
});
