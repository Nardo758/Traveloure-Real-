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
  GUEST_PLAN_HREF,
  HEADER_ADD_DATES_LABEL,
  activeHeaderTrip,
  headerDatesLabel,
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
    assert.deepEqual(headerPlanState({ isSignedIn: false, guestStatus: "loading", guestPlan: guest({}, 3), trips: null }), { kind: "start" }, "a read in flight claims nothing");
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
    // The chip links the slip's Days view — no ?view= (it is the ruled landing).
    const CTA = fs.readFileSync("client/src/components/HeaderPlanCTA.tsx", "utf8");
    // A GUEST chip goes to the guest slip, never /plans/{id}: that is a ProtectedRoute and would
    // sign-in-wall the very traveler the chip speaks for. Never /?start=1 either (a new plan).
    assert.equal(GUEST_PLAN_HREF, "/plans/new");
    assert.match(CTA, /state\.guest \? GUEST_PLAN_HREF : `\/plans\/\$\{state\.planId\}`/, "guest → /plans/new, owner → /plans/{id}");
    const ctaHrefs = CTA.split("\n").filter((line) => line.includes("GUEST_PLAN_HREF") || line.includes("/plans/${state.planId}") || line.includes("PLAN_START_HREF"));
    for (const line of ctaHrefs) assert.doesNotMatch(line, /\?view=/, line);
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
    assert.equal(headerDatesLabel("nope", "2026-12-03"), null);
  });
});

describe("slice A — the 375px budget and the two mounts", () => {
  it("the chip truncates inside a bounded box", () => {
    const CTA = fs.readFileSync("client/src/components/HeaderPlanCTA.tsx", "utf8");
    assert.match(CTA, /min-w-0/, "it must be allowed to shrink");
    assert.match(CTA, /max-w-\[200px\]/, "…within a real bound");
    assert.match(CTA, /<span className="truncate"/, "the label truncates, the dates never do");
    assert.match(CTA, /className="shrink-0"[\s\S]{0,80}chip-nav-plan-dates/, "the dates keep their width");
  });

  it("ONE component renders both header mounts, so they cannot drift", () => {
    const LAYOUT = fs.readFileSync("client/src/components/layout.tsx", "utf8");
    const mounts = LAYOUT.match(/<HeaderPlanCTA/g) ?? [];
    assert.equal(mounts.length, 2, "desktop nav + phone menu, both this component");
    assert.match(LAYOUT, /variant="desktop"/);
    assert.match(LAYOUT, /variant="mobile"/);
    // The ruled states are computed once and shared.
    assert.match(LAYOUT, /const headerState = headerPlanState\(/);
    assert.match(LAYOUT, /useGuestPlan\(guestPresent && !user\)/, "the guest read is gated on the presence cookie");
    assert.match(LAYOUT, /hasGuestPresenceCookie\(document\.cookie\)/, "…by the same check shouldClaimGuestPlans uses");
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
