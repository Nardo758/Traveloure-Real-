/**
 * LD 52 read split for the three panels a managing EA was hitting with a silent 403.
 * Suggestions GET includes the managing assistant. Guest PII and Trip Pass purchase stay owner-only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function src(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `slice ${start} → ${end}`);
  return text.slice(from, to);
}

test("suggestions GET admits the managing EA; POST and PATCH do not", () => {
  const routes = src("../routes/booking-actions.ts");
  const get = between(routes, "GET /api/trips/:id/suggestions", "POST /api/trips/:id/suggestions");
  const post = between(routes, "POST /api/trips/:id/suggestions", "PATCH /api/trips/:id/suggestions/:suggestionId");
  const patch = between(routes, "PATCH /api/trips/:id/suggestions/:suggestionId", "function ");
  assert.match(get, /isManagingEaForTrip/);
  assert.doesNotMatch(post, /isManagingEaForTrip/);
  assert.doesNotMatch(patch, /isManagingEaForTrip/);
  assert.match(patch, /isTripOwner/);
});

test("trip pass and the guest roster stay owner-only", () => {
  const pass = src("../routes/trip-pass.routes.ts");
  assert.match(pass, /trip\.userId !== userId/);
  assert.doesNotMatch(pass, /isManagingEaForTrip/);
  const guests = between(src("../routes/guest-invites.ts"), "GET /api/trips/:tripId/guests", "GET /api/events/:experienceId/invites");
  assert.match(guests, /authorizeTripOwnerTier/);
  assert.doesNotMatch(guests, /isManagingEaForTrip/);
});

test("the slip hides owner-only panels from a delegate", () => {
  const view = src("../../client/src/components/plancard/SlipView.tsx");
  assert.match(view, /enabled: !!tripId && data\.tripRole === "owner"/);
  assert.match(view, /canReview=\{isOwner\}/);
  const rail = src("../../client/src/components/plancard/SlipRail.tsx");
  assert.equal((rail.match(/<TripPassCard/g) ?? []).length, 1);
  assert.match(rail, /isOwner \? \([\s\S]*<TripPassCard/);
});
