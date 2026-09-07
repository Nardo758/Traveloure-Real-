/**
 * Home's time axis — the PURE builder (`buildUpcomingRows`), provable with no database
 * (ledger `2026-09-07-home-time-axis`; CLAUDE.md Locked Decision 45 (8), §13, §18 rule 1).
 *
 * The rules pinned here are the ones the ruling row states:
 *   U1  a row with no date is OMITTED, never guessed (every kind)
 *   U2  nearest first
 *   U3  the window edge — inside kept, one day past dropped; a day row is kept for its whole day
 *   U4  no `tz` when the plan's timezone is NULL; `tz` present when it carries a usable zone
 *   U5  the occasion row is ABSENT without a fired draft (no generated_at / no trip_id)
 *   U6  the invite tally is OMITTED when there are no invites — never "0 of 0"
 *   U7  the handover is announced only for a plan with no final, and derives from the ONE window
 *   U8  an unpaid booking is dated by the resolved service date; a balance by balance_due_at
 *   U9  item counts appear only when a plan holds items
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { HANDOVER_WINDOW_MS } from "@shared/plan-timing";
import { buildUpcomingRows, planNameOf, type UpcomingInput } from "../upcoming.service";

const NOW = new Date("2026-09-29T09:00:00Z");

function base(overrides: Partial<UpcomingInput> = {}): UpcomingInput {
  return {
    now: NOW,
    windowDays: 60,
    trips: [],
    bookings: [],
    events: [],
    occasionDrafts: [],
    itemCounts: [],
    ...overrides,
  };
}

const kyoto = { id: "t-kyoto", title: "Your Kyoto wedding", destination: "Kyoto, Japan", startDate: "2026-10-02", timezone: "Asia/Tokyo", finalizedAt: null, finalVersion: 2 };
const lisbon = { id: "t-lisbon", title: "My Trip", destination: "Lisbon, Portugal", startDate: "2026-11-14", timezone: null, finalizedAt: null, finalVersion: null };

test("U1: undated rows are omitted — no start, no event day, no service date, no cutoff", () => {
  const rows = buildUpcomingRows(base({
    trips: [{ ...lisbon, startDate: null }],
    events: [{ id: "e1", tripId: lisbon.id, title: "Dinner", eventDate: null, invited: 0, answered: 0 }],
    bookings: [
      { id: "b1", tripId: lisbon.id, status: "payment_pending", serviceName: "Tour", serviceDate: null },
      { id: "b2", tripId: lisbon.id, status: "deposit_paid", balancePaid: false, balanceDueAt: null, serviceName: "Villa" },
    ],
  }));
  assert.deepEqual(rows, []);
});

test("U2: nearest first, across plans", () => {
  const rows = buildUpcomingRows(base({ trips: [lisbon, kyoto] }));
  // Input order is Lisbon first; output is by date: Kyoto starts Oct 2 (it has a final ⇒ no
  // handover row); Lisbon's handover falls on Nov 12, its start on Nov 14.
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.tripId}:${r.date}`), [
    "trip_start:t-kyoto:2026-10-02",
    "handover:t-lisbon:2026-11-12",
    "trip_start:t-lisbon:2026-11-14",
  ]);
});

test("U3: the window edge — a day row on the last day is kept, one past is dropped; today is kept", () => {
  const edge = { ...lisbon, id: "t-edge", startDate: "2026-11-28" };     // NOW + 60d = 2026-11-28
  const past = { ...lisbon, id: "t-past", startDate: "2026-11-29" };
  const today = { ...lisbon, id: "t-today", startDate: "2026-09-29" };
  const yesterday = { ...lisbon, id: "t-yesterday", startDate: "2026-09-28" };
  const rows = buildUpcomingRows(base({ trips: [edge, past, today, yesterday] }));
  const starts = rows.filter((r) => r.kind === "trip_start").map((r) => r.tripId);
  assert.deepEqual(starts, ["t-today", "t-edge"]);
});

test("U4: tz is present only for a plan with a usable zone", () => {
  const rows = buildUpcomingRows(base({ trips: [kyoto, lisbon] }));
  const k = rows.find((r) => r.kind === "trip_start" && r.tripId === kyoto.id)!;
  const l = rows.find((r) => r.kind === "trip_start" && r.tripId === lisbon.id)!;
  assert.equal(k.tz, "Asia/Tokyo");
  assert.equal("tz" in l, false);
  // The unzoned handover degrades to a calendar day (LD 30); the zoned one is an instant.
  const lh = rows.find((r) => r.kind === "handover" && r.tripId === lisbon.id)!;
  assert.equal(lh.dateKind, "day");
  assert.equal(lh.date, "2026-11-12");
  const zoned = buildUpcomingRows(base({ trips: [{ ...kyoto, finalVersion: null }] })).find((r) => r.kind === "handover")!;
  assert.equal(zoned.dateKind, "instant");
  assert.equal(zoned.tz, "Asia/Tokyo");
  assert.equal(zoned.date, "2026-09-29T15:00:00.000Z");
});

test("U5: the occasion row exists ONLY when a draft has fired end to end", () => {
  const draft = { occasionId: "o1", label: "Anniversary", templateKey: "anniversary", cycleKey: "2026-10-14" };
  const none = buildUpcomingRows(base({ occasionDrafts: [
    { ...draft, draftTripId: null, generatedAt: "2026-09-30T00:00:00Z" },
    { ...draft, draftTripId: "t-draft", generatedAt: null },
  ] }));
  assert.equal(none.some((r) => r.kind === "occasion_draft"), false);
  const fired = buildUpcomingRows(base({ occasionDrafts: [{ ...draft, draftTripId: "t-draft", generatedAt: "2026-09-30T00:00:00Z" }] }));
  const row = fired.find((r) => r.kind === "occasion_draft")!;
  assert.ok(row);
  assert.equal(row.date, "2026-10-14");
  assert.equal(row.tripId, "t-draft");
  assert.equal(row.action.href, "/plans/t-draft");
  assert.equal("tz" in row, false);
});

test("U6: the invite tally is omitted at zero invites, present otherwise; time carries the zone only when zoned", () => {
  const rows = buildUpcomingRows(base({
    trips: [kyoto, lisbon],
    events: [
      { id: "e1", tripId: kyoto.id, title: "Ceremony", location: "Shimogamo Shrine", eventDate: "2026-10-03", startTime: "15:00", invited: 24, answered: 18 },
      { id: "e2", tripId: lisbon.id, title: "Dinner", eventDate: "2026-11-15", startTime: "20:00", invited: 0, answered: 0 },
      { id: "e3", tripId: lisbon.id, title: "Brunch", eventDate: "2026-11-16", startTime: null, invited: 0, answered: 0 },
    ],
  }));
  const e1 = rows.find((r) => r.kind === "event" && r.sentence.startsWith("Ceremony"))!;
  assert.equal(e1.sentence, "Ceremony at Shimogamo Shrine, 15:00 Asia/Tokyo. 18 of 24 guests have answered.");
  assert.equal(e1.action.href, "/plans/t-kyoto/guests");
  const e2 = rows.find((r) => r.kind === "event" && r.sentence.startsWith("Dinner"))!;
  assert.equal(e2.sentence, "Dinner, 20:00.");
  assert.equal(e2.action.label, "Open slip");
  assert.equal(/0 of 0|0 guests/.test(e2.sentence), false);
  const e3 = rows.find((r) => r.kind === "event" && r.sentence.startsWith("Brunch"))!;
  assert.equal(e3.sentence, "Brunch."); // NULL start_time is never midnight
  assert.match(e1.source, /no RSVP deadline column/);
});

test("U7: the handover is announced only for a plan with no final, from the ONE window", () => {
  const withFinal = buildUpcomingRows(base({ trips: [kyoto] }));
  assert.equal(withFinal.some((r) => r.kind === "handover"), false);
  const finalizedButNoVersion = buildUpcomingRows(base({ trips: [{ ...kyoto, finalVersion: null, finalizedAt: "2026-09-01T00:00:00Z" }] }));
  assert.equal(finalizedButNoVersion.some((r) => r.kind === "handover"), false);
  const pending = buildUpcomingRows(base({ trips: [{ ...kyoto, finalVersion: null }] }));
  const h = pending.find((r) => r.kind === "handover")!;
  assert.ok(h);
  const hours = HANDOVER_WINDOW_MS / 3_600_000;
  assert.equal(h.sentence, `The Trip Card takes over for Kyoto: the ${hours}-hour handover.`);
  assert.equal(h.source, `derived: trips.start_date − ${hours}h`);
  assert.equal(h.action.href, "/trip/t-kyoto");
  // A final flips the start row's action to the Trip Card; none ⇒ the slip.
  assert.equal(withFinal.find((r) => r.kind === "trip_start")!.action.href, "/trip/t-kyoto");
  assert.equal(pending.find((r) => r.kind === "trip_start")!.action.href, "/plans/t-kyoto");
});

test("U8: an unpaid claim is dated by the resolved service date; a balance by its cutoff; paid balances do not appear", () => {
  const rows = buildUpcomingRows(base({
    trips: [kyoto],
    bookings: [
      { id: "b1", tripId: kyoto.id, status: "payment_pending", serviceName: "Kimono fitting", serviceDate: "2026-09-29" },
      { id: "b2", tripId: kyoto.id, status: "deposit_paid", balancePaid: false, balanceDueAt: "2026-09-30T02:00:00Z", balanceAmount: "2400.00", serviceName: "Reception" },
      { id: "b3", tripId: kyoto.id, status: "deposit_paid", balancePaid: true, balanceDueAt: "2026-09-30T02:00:00Z", serviceName: "Paid already" },
      { id: "b4", tripId: null, status: "payment_pending", serviceName: "Off-plan tour", serviceDate: "2026-10-01" },
      { id: "b5", tripId: kyoto.id, status: "confirmed", serviceName: "Confirmed", serviceDate: "2026-10-01" },
    ],
  }));
  const unpaid = rows.find((r) => r.kind === "booking_unpaid" && r.tripId === kyoto.id)!;
  assert.equal(unpaid.date, "2026-09-29");
  assert.equal(unpaid.source, "service_bookings.status");
  assert.equal(unpaid.action.href, "/plans/t-kyoto");
  const bal = rows.find((r) => r.kind === "balance_due")!;
  assert.equal(bal.sentence, "Reception balance of $2400.00 is due.");
  assert.equal(bal.dateKind, "instant");
  assert.equal(bal.tz, "Asia/Tokyo");
  assert.equal(bal.source, "service_bookings.balance_due_at");
  assert.equal(rows.filter((r) => r.kind === "balance_due").length, 1);
  const offPlan = rows.find((r) => r.kind === "booking_unpaid" && r.tripId === null)!;
  assert.equal(offPlan.planName, "Booking");
  assert.equal(offPlan.action.href, "/bookings");
  assert.equal(rows.some((r) => r.sentence.startsWith("Confirmed")), false);
  // Order: unpaid (Sep 29) → balance (Sep 30 02:00Z) → Kyoto start (Oct 1 15:00Z) → off-plan (Oct 1, unzoned UTC midnight sorts BEFORE Kyoto's zoned midnight)
  assert.deepEqual(rows.map((r) => r.kind), ["booking_unpaid", "balance_due", "booking_unpaid", "trip_start"]);
});

test("U9: item counts appear only when a plan holds items; the plan name prefers a real title", () => {
  const rows = buildUpcomingRows(base({
    trips: [kyoto, lisbon],
    itemCounts: [{ tripId: kyoto.id, inPlanning: 6, withExpert: 0, readyForCheckout: 1, purchased: 2 }],
  }));
  const k = rows.find((r) => r.kind === "trip_start" && r.tripId === kyoto.id)!;
  assert.equal(k.sentence, "Kyoto begins. 9 items: 2 booked, 1 in checkout, 6 planned.");
  const l = rows.find((r) => r.kind === "trip_start" && r.tripId === lisbon.id)!;
  assert.equal(l.sentence, "Lisbon begins.");
  assert.equal(k.planName, "Your Kyoto wedding");
  assert.equal(l.planName, "Lisbon, Portugal"); // "My Trip" is the column default, not a name
  assert.equal(planNameOf({ title: "  ", destination: "Porto" }), "Porto");
});
