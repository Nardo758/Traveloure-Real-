/**
 * The storefront booking panel's rules (client/src/lib/storefront-booking-panel.ts).
 * Each test names the claim the panel would make if the rule broke — every one is a §13 claim.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advisorStanding,
  formatPanelPrice,
  formatPlanWindow,
  leadTimeLine,
  lowestListedPrice,
  planChipText,
  planContextLine,
  resolvePanelKind,
  responseTimeFigure,
  sharedCancellationLabel,
  sharedLeadTimeHours,
  shareConversationSubject,
  summarizeBookingModes,
  type PanelService,
  type PanelTrip,
} from "../storefront-booking-panel";

const svc = (over: Partial<PanelService> = {}): PanelService => ({ id: "s", price: "85", showPrice: true, bookingMode: "request", ...over });

test("P1 lowest price: hidden, missing, zero and negative prices are never the 'From' price", () => {
  assert.equal(
    lowestListedPrice([
      svc({ price: "40", showPrice: false }),
      svc({ price: null }),
      svc({ price: "0" }),
      svc({ price: "-5" }),
      svc({ price: "abc" }),
      svc({ price: "145" }),
      svc({ price: "85" }),
    ]),
    85,
  );
  assert.equal(lowestListedPrice([svc({ price: "0" }), svc({ showPrice: false })]), null, "no shown positive price ⇒ no 'From' line, never $0");
  assert.equal(lowestListedPrice([]), null);
  assert.equal(formatPanelPrice(85), "$85");
  assert.equal(formatPanelPrice(42.5), "$42.50");
});

test("P2 booking modes: hidden listings say nothing; one kind is 'every', two kinds is 'some'", () => {
  assert.equal(summarizeBookingModes([svc({ bookingMode: "instant" }), svc({ bookingMode: "hidden" })]), "instant");
  assert.equal(summarizeBookingModes([svc({ bookingMode: "request" })]), "request");
  assert.equal(summarizeBookingModes([svc({ bookingMode: "instant" }), svc({ bookingMode: "request" })]), "mixed");
  assert.equal(summarizeBookingModes([svc({ bookingMode: "hidden" })]), null);
  assert.equal(summarizeBookingModes([]), null);
});

test("P3 lead time and cancellation are stated only when EVERY listing agrees", () => {
  assert.equal(sharedLeadTimeHours([svc({ leadTimeHours: 24 }), svc({ leadTimeHours: 24 })]), 24);
  assert.equal(sharedLeadTimeHours([svc({ leadTimeHours: 24 }), svc({ leadTimeHours: 48 })]), null);
  assert.equal(sharedLeadTimeHours([svc({ leadTimeHours: 24 }), svc({ leadTimeHours: null })]), null, "a listing that states none is not agreement");
  assert.equal(sharedLeadTimeHours([svc({ leadTimeHours: 0 })]), null);
  assert.equal(leadTimeLine(24), "Book at least 24 hours ahead.");
  assert.equal(leadTimeLine(48), "Book at least 2 days ahead.");
  assert.equal(leadTimeLine(1), "Book at least 1 hour ahead.");

  assert.match(sharedCancellationLabel([svc({ cancellationPolicyType: "flexible" }), svc({ cancellationPolicyType: "flexible" })]) ?? "", /^Flexible/);
  assert.equal(sharedCancellationLabel([svc({ cancellationPolicyType: "flexible" }), svc({ cancellationPolicyType: "strict" })]), null);
  assert.equal(sharedCancellationLabel([svc({ cancellationPolicyType: "flexible" }), svc({ cancellationPolicyType: null })]), null);
  assert.equal(sharedCancellationLabel([svc({ cancellationPolicyType: "made_up" })]), null, "an off-vocabulary value is never rendered as a policy");
});

test("P4 response time: formatted once, and a bare number is refused", () => {
  assert.equal(responseTimeFigure("within_2_hours"), "Within 2 hours");
  assert.equal(responseTimeFigure("Usually within a day"), "Usually within a day");
  assert.equal(responseTimeFigure("2"), null, "a unitless '2' is a raw field, not a promise");
  assert.equal(responseTimeFigure(""), null);
  assert.equal(responseTimeFigure(null), null);
});

const trip = (over: Partial<PanelTrip> = {}): PanelTrip => ({
  id: "t1",
  destination: "Jaipur",
  startDate: "2026-11-08",
  endDate: "2026-11-11",
  datesConfirmedAt: "2026-09-01T00:00:00Z",
  ...over,
});

test("P5 plan line: dates appear only when the traveler chose them (Locked Decision 30)", () => {
  assert.equal(planContextLine(trip()), "Your plan · Jaipur · Nov 8–11");
  assert.equal(planContextLine(trip({ datesConfirmedAt: null })), "Your plan · Jaipur", "a placeholder window is never shown as theirs");
  assert.equal(planContextLine(trip({ destination: "  " })), "Your plan · Nov 8–11");
  assert.equal(formatPlanWindow("2026-11-28", "2026-12-02"), "Nov 28 – Dec 2");
  assert.equal(formatPlanWindow("2026-11-08", "2026-11-08"), "Nov 8");
  assert.equal(formatPlanWindow("2026-11-08T00:00:00.000Z", "2026-11-11T00:00:00.000Z"), "Nov 8–11", "an ISO day is read as that calendar day, no timezone shift");
  assert.equal(formatPlanWindow(null, "2026-11-11"), null);
  assert.equal(planChipText(trip({ destination: "Porto", startDate: "2026-10-03", endDate: "2026-10-06" })), "Porto · Oct 3–6");
  assert.equal(planChipText(trip({ destination: null, datesConfirmedAt: null })), null);
});

test("P6 advisor standing is matched by HANDLE and read from the server's status", () => {
  const rows = [
    { handle: "someone-else", status: "accepted" },
    { handle: "Jaipur-Local", status: "pending" },
  ];
  assert.equal(advisorStanding(rows, "jaipur-local"), "pending");
  assert.equal(advisorStanding([{ handle: "jaipur-local", status: "accepted" }], "jaipur-local"), "on_plan");
  assert.equal(advisorStanding([{ handle: "jaipur-local", status: "assigned" }], "jaipur-local"), "on_plan");
  assert.equal(advisorStanding([{ handle: "jaipur-local", status: "rejected" }], "jaipur-local"), "none");
  assert.equal(advisorStanding([{ handle: null, status: "accepted" }], "jaipur-local"), "none", "a handle-less row is never this expert");
  assert.equal(advisorStanding(null, "jaipur-local"), "none");
});

test("P7 panel kind: sharing is offered only for a plan the viewer was shown to own", () => {
  const base = { isProvider: false, isOwnStorefront: false, acceptsPlanShares: true, ownedTrip: null, standing: "none" as const };
  assert.equal(resolvePanelKind({ ...base, isOwnStorefront: true, isProvider: true }), "hidden", "an owner sees no panel on their own page");
  assert.equal(resolvePanelKind({ ...base, isProvider: true, ownedTrip: trip() }), "provider");
  assert.equal(resolvePanelKind(base), "expert_start", "no resolved plan ⇒ start one, never 'share'");
  assert.equal(resolvePanelKind({ ...base, ownedTrip: trip() }), "expert_share");
  assert.equal(resolvePanelKind({ ...base, ownedTrip: trip(), standing: "pending" }), "expert_pending");
  assert.equal(resolvePanelKind({ ...base, ownedTrip: trip(), standing: "on_plan" }), "expert_on_plan");
  // The platform's reserved concierge account (or an unapproved expert profile) cannot be invited
  // onto a plan; its storefront gets the booking panel, never a share the server would refuse.
  assert.equal(resolvePanelKind({ ...base, acceptsPlanShares: false }), "provider");
  assert.equal(resolvePanelKind({ ...base, acceptsPlanShares: false, ownedTrip: trip() }), "provider");
});

test("P8 the conversation subject names the plan and nothing else", () => {
  assert.equal(shareConversationSubject(trip()), "My plan for Jaipur");
  assert.equal(shareConversationSubject(trip({ destination: null })), "My plan");
});
