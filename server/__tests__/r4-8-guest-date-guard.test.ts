/**
 * R4-8 part 2 — the guest rail refuses a reversed window with the SAME code as the signed-in rail.
 *
 * Two facts are pinned here:
 *
 *  1. The guest body schema ALREADY refuses a reversed PAIR (`guest-plan.service.ts`) — that refusal is
 *     the existing sentence "End date must be on or after start date", so no new copy was needed. What
 *     it did not give was a stable code: the route answered the generic `invalid_body`.
 *  2. The route now merges the body over the stored plan and asks `tripDateRangeRefusal`, so a body
 *     that moves only ONE end is judged against the end already stored, and the answer is
 *     `{ code: "end_before_start", message }` — identical to `PATCH /api/trips/:id`.
 *
 * This is a wiring pin rather than an HTTP test: the handler needs a guest session, a database row and
 * the `guestOnly` gate. The RULE itself is covered behaviourally in `shared/__tests__/trip-date-range`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ROUTE = fs.readFileSync("server/routes/guest-plans.routes.ts", "utf8");
const SERVICE = fs.readFileSync("server/services/guest-plan.service.ts", "utf8");

test("R4-8: the guest body schema already refuses a reversed pair, with the existing sentence", () => {
  assert.match(SERVICE, /b\.endDate >= b\.startDate/, "the pair is compared");
  assert.match(SERVICE, /"End date must be on or after start date"/, "the existing message, no new copy");
});

test("R4-8: the guest PATCH merges over the stored plan and answers end_before_start", () => {
  const handler = ROUTE.match(/router\.patch\("\/api\/guest-plans\/current"[\s\S]*?\n\}\);/);
  assert.ok(handler, "the guest PATCH handler is present");
  const body = handler[0];
  assert.match(body, /readGuestPlan\(/, "the stored plan is read before the write");
  assert.match(body, /parsed\.data\.startDate \?\? stored\?\.plan\?\.startDate/, "the start merges over the row");
  assert.match(body, /parsed\.data\.endDate \?\? stored\?\.plan\?\.endDate/, "the end merges over the row");
  assert.match(body, /tripDateRangeRefusal\(nextStart, nextEnd\)/, "the ONE shared rule decides");
  assert.match(body, /res\.status\(400\)\.json\(refusal\)/, "the refusal is the 400 body, code included");
  // The generic code must not win for a reversed window: the check runs before the write.
  assert.ok(
    body.indexOf("tripDateRangeRefusal") < body.indexOf("updateGuestPlan"),
    "the guard runs before the write",
  );
});
