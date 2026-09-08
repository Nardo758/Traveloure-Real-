/**
 * BOOKINGS ARE GROUPED BY PLAN, AND EVERY ROW NAMES ITS SERVICE AND PROVIDER THROUGH AN
 * ALLOWLIST. Ledger `2026-09-07-bookings-by-plan` (Console & AI Concierge brief lane L12,
 * §11.2 finding F10).
 *
 * WHY THESE PINS. Both halves fail silently. A grouping that quietly attaches an unlinked booking
 * to the nearest plan renders perfectly and is a lie about which plan the traveler bought it for.
 * A projection that regresses to a hand-copied object literal also renders perfectly — the sibling
 * route `GET /api/service-bookings` has shipped `provider.profileImage` (not a `users` column) for
 * its whole life, which is exactly the failure an allowlist checked against the schema prevents.
 *
 *   T1  Bookings group by their server-projected plan; the unlinked group is its own group.
 *   T2  Group order: dated plans by start date, undated after them, unlinked always last.
 *   T3  A ready-made purchase joins its plan's group; one whose plan has no bookings comes back
 *       as `unattachedPurchases` rather than becoming a header built from an id (§13).
 *   T4  `planGroupLabel` never invents a destination.
 *   T5  `outstandingBalance` distinguishes "no balance recorded" from "a balance of zero" (§13),
 *       and is a NOTE — the module names no payer and derives no charge.
 *   T6  The server projector's allowlists do NOT name the provider's `users.id` (LD 40) nor any
 *       rate/payout/contact column, and the route composes the row through the projector rather
 *       than a literal.
 *   T7  The projector maps an absent row to `null`, never to `{}`.
 *
 * Pure: no DOM, no DB, no fetch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  groupBookingsByPlan,
  planGroupLabel,
  outstandingBalance,
  UNLINKED_GROUP_KEY,
} from "../bookings-by-plan";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const kyoto = { id: "trip-kyoto", destination: "Kyoto", startDate: "2026-10-01", endDate: "2026-10-08" };
const lisbon = { id: "trip-lisbon", destination: "Lisbon", startDate: "2026-09-10", endDate: "2026-09-14" };
const undated = { id: "trip-undated", destination: "Oaxaca", startDate: null, endDate: null };

test("T1 bookings group by their plan, and an unlinked booking gets its own named group", () => {
  const { groups } = groupBookingsByPlan([
    { id: "b1", trip: kyoto },
    { id: "b2", trip: null },
    { id: "b3", trip: kyoto },
  ]);
  const byKey = new Map(groups.map((g) => [g.key, g]));
  assert.equal(byKey.get("trip-kyoto")!.bookings.map((b) => b.id).join(","), "b1,b3");
  assert.deepEqual(byKey.get(UNLINKED_GROUP_KEY)!.bookings.map((b) => b.id), ["b2"]);
  // The unlinked group carries NO plan — it is never given the nearest one.
  assert.equal(byKey.get(UNLINKED_GROUP_KEY)!.plan, null);
});

test("T2 dated plans sort by start date, undated follow, unlinked is last", () => {
  const { groups } = groupBookingsByPlan([
    { id: "b1", trip: kyoto },
    { id: "b2", trip: null },
    { id: "b3", trip: undated },
    { id: "b4", trip: lisbon },
  ]);
  assert.deepEqual(groups.map((g) => g.key), ["trip-lisbon", "trip-kyoto", "trip-undated", UNLINKED_GROUP_KEY]);
});

test("T3 a ready-made purchase joins its plan's group; an unmatched one is reported, not invented", () => {
  const { groups, unattachedPurchases } = groupBookingsByPlan(
    [{ id: "b1", trip: kyoto }],
    [
      { id: "p1", cloneTripId: "trip-kyoto" },
      { id: "p2", cloneTripId: "trip-nobody" },
      { id: "p3", cloneTripId: null },
    ],
  );
  assert.deepEqual(groups.map((g) => g.key), ["trip-kyoto"]);
  assert.deepEqual(groups[0].purchases.map((p) => p.id), ["p1"]);
  assert.deepEqual(unattachedPurchases.map((p) => p.id), ["p2", "p3"]);
});

test("T4 planGroupLabel names the plan honestly and invents nothing", () => {
  assert.equal(planGroupLabel(null), "Not linked to a plan");
  assert.equal(planGroupLabel(kyoto), "Kyoto");
  assert.equal(planGroupLabel({ id: "t", destination: "  ", title: "Anniversary" }), "Anniversary");
  assert.equal(planGroupLabel({ id: "t", destination: null, title: null }), "Plan");
});

test("T5 outstandingBalance separates 'none recorded' from a real balance", () => {
  assert.equal(outstandingBalance({ balanceAmount: null, balancePaid: false }), null);
  assert.equal(outstandingBalance({ balanceAmount: "0.00", balancePaid: false }), null);
  assert.equal(outstandingBalance({ balanceAmount: "420.00", balancePaid: true }), null);
  assert.equal(outstandingBalance({ balanceAmount: "420.00", balancePaid: false }), 420);
  // The module names no payer and computes no charge — the route stays the authority (§14/§18).
  // Comments are stripped first: this pins the CODE, not the prose that explains the deferral
  // (the header legitimately names `canPayBalance` to say where the decision actually lives).
  const code = read("client/src/lib/bookings-by-plan.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of ["canPayBalance", "payerKind", "fee", "commission", "apiRequest", "fetch("]) {
    assert.ok(!code.includes(forbidden), `bookings-by-plan must not reference ${forbidden}`);
  }
});

test("T6 the server projector allowlists exclude the provider's users.id and every privileged column", () => {
  const scope = read("server/utils/booking-read-scope.ts");
  const providerList = scope.match(/BOOKING_PROVIDER_FIELDS = \[([\s\S]*?)\] as const;/);
  assert.ok(providerList, "BOOKING_PROVIDER_FIELDS must be a literal allowlist");
  const providerFields = providerList![1];
  // LD 40: users.id is INTERNAL; a booking is addressed by bookingId, an earner by handle.
  assert.ok(!/["']id["']/.test(providerFields), "provider allowlist must not name users.id");
  assert.ok(/handle/.test(providerFields));
  for (const forbidden of ["email", "stripe", "password", "commissionOverride", "preferences"]) {
    assert.ok(!new RegExp(forbidden, "i").test(providerFields), `provider allowlist must not name ${forbidden}`);
  }
  const serviceList = scope.match(/BOOKING_SERVICE_FIELDS = \[([\s\S]*?)\] as const;/)![1];
  for (const forbidden of ["revenueShareRate", "price", "serviceFile", "userId"]) {
    assert.ok(!new RegExp(forbidden, "i").test(serviceList), `service allowlist must not name ${forbidden}`);
  }
  // The allowlists are checked against the drizzle tables — that is what makes them true.
  assert.ok(/getTableColumns/.test(scope) && /assertColumns\(/.test(scope));

  // And the route composes through the projector rather than a hand-copied literal.
  const routes = read("server/routes.ts");
  const handler = routes.slice(routes.indexOf('app.get("/api/my-bookings"'));
  const body = handler.slice(0, handler.indexOf("\n  });"));
  for (const fn of ["toBookingService(", "toBookingProvider(", "toBookingTrip("]) {
    assert.ok(body.includes(fn), `/api/my-bookings must project through ${fn}`);
  }
  // §14 read clause: the plan is published only when it is the session user's own.
  assert.ok(/userId === userId|\.userId === userId/.test(body), "the trip must be re-checked against the session user");
});

test("T7 the projector maps an absent row to null, never to an empty object", async () => {
  // Imported dynamically: the module asserts its allowlists against the drizzle tables at load.
  const { toBookingService, toBookingProvider, toBookingTrip } = await import(
    "../../../../server/utils/booking-read-scope"
  );
  for (const project of [toBookingService, toBookingProvider, toBookingTrip]) {
    assert.equal(project(null), null);
    assert.equal(project(undefined), null);
  }
  assert.equal(
    toBookingProvider({ firstName: "Mika", lastName: "Tanaka", handle: "mika", email: "x@y.z" }).email,
    undefined,
  );
});
