/**
 * Audit RC-2 — "Add to Plan" silently became a trip-less "add to cart" (ledger
 * `2026-09-24-rc2-add-to-plan`).
 *
 * The ruling: a signed-in member with no plan in hand PICKS a plan or STARTS one, and nothing goes
 * to a trip-less cart for them; a guest keeps the guest cart and the words say so. D1–D6 pin the
 * pure decision; A1–A3 the active-plan rule; B1–B2 the shared item body; S1–S6 are source pins on
 * the three surfaces, each of which fails on the pre-RC-2 code.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  addButtonLabel,
  decideAddTarget,
  GUEST_CART_SAVED_NOTE,
  isActivePlan,
  listingPlanItemBody,
} from "../add-target";
import { ADD_TO_CART_LABEL, ADD_TO_PLAN_LABEL } from "../plan-vocabulary";

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

test("D1: a plan in hand wins, whoever is asking", () => {
  assert.equal(decideAddTarget({ targetTripId: "t1", signedIn: true, authLoading: false }), "plan");
  assert.equal(decideAddTarget({ targetTripId: "t1", signedIn: false, authLoading: true }), "plan");
});

test("D2: a signed-in member with no plan is asked to PICK — never the cart", () => {
  assert.equal(decideAddTarget({ targetTripId: "", signedIn: true, authLoading: false }), "pick");
  assert.equal(decideAddTarget({ targetTripId: null, signedIn: true, authLoading: false }), "pick");
});

test("D3: a definitive guest keeps the guest cart (LD 39's fallback)", () => {
  assert.equal(decideAddTarget({ targetTripId: "", signedIn: false, authLoading: false }), "guest_cart");
});

test("D4: auth unanswered is HELD, never guessed guest or member (§13)", () => {
  assert.equal(decideAddTarget({ targetTripId: "", signedIn: false, authLoading: true }), "wait");
});

test("D5: only a guest's button says Cart", () => {
  assert.equal(addButtonLabel("guest_cart"), ADD_TO_CART_LABEL);
  for (const t of ["plan", "pick", "wait"] as const) assert.equal(addButtonLabel(t), ADD_TO_PLAN_LABEL);
});

test("D6: the guest note names the cart and what it takes to plan it", () => {
  assert.match(GUEST_CART_SAVED_NOTE, /cart/i);
  assert.match(GUEST_CART_SAVED_NOTE, /sign in/i);
  assert.match(GUEST_CART_SAVED_NOTE, /plan/i);
});

test("A1: a plan behind the member is not offered; one ahead or under way is", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  assert.equal(isActivePlan({ startDate: "2026-08-01", endDate: "2026-08-05" }, now), false);
  assert.equal(isActivePlan({ startDate: "2026-10-01", endDate: "2026-10-05" }, now), true);
  assert.equal(isActivePlan({ startDate: "2026-09-20", endDate: "2026-09-30" }, now), true);
});

test("A2: an UNDATED plan is offered, never hidden (§13)", () => {
  assert.equal(isActivePlan({ startDate: null, endDate: null }, new Date()), true);
});

test("A3: a final plan still ahead is offered", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  assert.equal(isActivePlan({ startDate: "2026-11-01", endDate: "2026-11-03", finalVersion: 2 }, now), true);
});

test("B1: the listing body is the plan-item rail's shape", () => {
  const b = listingPlanItemBody({ id: "s1", serviceName: "Tea ceremony", price: 80, location: "Kyoto" });
  assert.equal(b.providerServiceId, "s1");
  assert.equal(b.title, "Tea ceremony");
  assert.equal(b.estimatedCost, "80");
  assert.equal(b.locationName, "Kyoto");
  assert.equal(b.dayNumber, 1);
});

test("B2: the stored 'Unknown' location is ABSENCE, never a place (§13)", () => {
  const b = listingPlanItemBody({ id: "s1", serviceName: "Tour", location: "Unknown" });
  assert.notEqual(b.locationName, "Unknown");
});

test("S1: the Discover grid no longer writes a trip-less server cart row", () => {
  const src = code("pages/discover.tsx");
  assert.doesNotMatch(src, /apiRequest\("POST", "\/api\/cart"/);
  assert.match(src, /decideAddTarget\(/);
  assert.match(src, /<PlanPickerDialog/);
});

test("S2: the Discover grid's label comes from the decision, and the guest toast is honest", () => {
  const src = code("pages/discover.tsx");
  assert.match(src, /addLabelText=\{addButtonLabel\(addTarget\)\}/);
  assert.match(src, /GUEST_CART_SAVED_NOTE/);
  assert.doesNotMatch(src, /title: "Saved!"/);
});

test("S3: a picked plan is BOUND as the current plan before the add (the ruling)", () => {
  for (const rel of ["pages/discover.tsx", "pages/service-detail.tsx", "components/add-to-experience-dialog.tsx"]) {
    assert.match(code(rel), /syncActiveTripToContext\(plan\)/, rel);
  }
});

test("S4: the service page asks which plan instead of adding to a trip-less cart", () => {
  const src = code("pages/service-detail.tsx");
  assert.match(src, /decideAddTarget\(\{ targetTripId, signedIn: true, authLoading: false \}\) === "pick"/);
  assert.match(src, /<PlanPickerDialog/);
});

test("S5: the city-feed dialog has no trip-less cart write and uses the ONE picker", () => {
  const src = code("components/add-to-experience-dialog.tsx");
  assert.doesNotMatch(src, /"\/api\/cart"/);
  assert.match(src, /<PlanPickerList/);
  assert.doesNotMatch(src, /new Date\(t\.endDate\)/, "no private date filter beside isActivePlan");
});

test("S6: 'Start a new plan' goes through the ONE planning modal and hands the finish back", () => {
  const src = code("components/plan-picker.tsx");
  assert.match(src, /usePlanning\(\)/);
  assert.match(src, /onFinish: \(_branch, plan\) =>/);
  assert.match(src, /return false;/);
  assert.doesNotMatch(src, /destination:/, "the door passes no invented destination (LD 42 D13)");
});
