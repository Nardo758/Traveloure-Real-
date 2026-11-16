/**
 * E10 follow-up (architect's ruling, Nov 16 2026): the picker STATES the active-plan order instead of
 * inheriting it from the server's `ORDER BY updated_at DESC`.
 *
 * `preselectAddPlan` takes the FIRST row that fits, so before this the preselected plan was an
 * implementation detail of the API's ordering. The picker now sorts with `byMostRecentlyUpdated`
 * (`client/src/lib/active-plan.ts`) first. Behaviour today is unchanged; the rule is explicit, and a
 * caller-side reorder or a mocked list can no longer move the preselect silently.
 *
 * R4b-2 stands: the picker always asks, one open plan included. This file does not test a bypass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { byMostRecentlyUpdated } from "../active-plan";
import { preselectAddPlan, type OpenPlanRef } from "../trip-target";

const plan = (id: string, updatedAt: string, city = "Kyoto"): OpenPlanRef & { updatedAt: string } => ({
  id,
  city,
  startDate: "2026-11-01",
  endDate: "2026-11-30",
  updatedAt,
});

test("two fitting plans given oldest-first preselect the NEWER one", () => {
  // Deliberately oldest-first, the order a caller or a cached list could hand us.
  const oldestFirst = [plan("old", "2026-11-01T00:00:00.000Z"), plan("new", "2026-11-15T00:00:00.000Z")];
  const ordered = byMostRecentlyUpdated(oldestFirst);
  assert.deepEqual(ordered.map((p) => p.id), ["new", "old"], "newest first");
  // Both fit the item, so the FIRST fitting row is the decision - and it must be the newer plan.
  const picked = preselectAddPlan(ordered, { city: "Kyoto", isEvent: false });
  assert.deepEqual(picked, { kind: "plan", tripId: "new" });
});

test("removing that sort makes this fail: the unsorted list preselects the older plan", () => {
  const oldestFirst = [plan("old", "2026-11-01T00:00:00.000Z"), plan("new", "2026-11-15T00:00:00.000Z")];
  // The defect this lane removes, demonstrated: unsorted input preselects "old".
  assert.deepEqual(preselectAddPlan(oldestFirst, { city: "Kyoto", isEvent: false }), { kind: "plan", tripId: "old" });
});

test("the picker applies byMostRecentlyUpdated to its rows BEFORE preselectAddPlan", () => {
  const src = fs.readFileSync("client/src/components/plan-picker.tsx", "utf8");
  assert.match(src, /import \{ byMostRecentlyUpdated \} from "@\/lib\/active-plan"/, "the one order is imported");
  const orderedAt = src.indexOf("const plans = byMostRecentlyUpdated(");
  const preselectAt = src.indexOf("preselectAddPlan(plans.map(toOpenPlanRef), item)");
  assert.ok(orderedAt > 0, "the list is ordered by the shared rule");
  assert.ok(preselectAt > orderedAt, "and it is ordered BEFORE the preselect reads the first fit");
});

test("R4b-2 still stands: the picker asks with one plan, and no door was changed", () => {
  const src = fs.readFileSync("client/src/components/plan-picker.tsx", "utf8");
  assert.doesNotMatch(src, /plans\.length === 1/, "no single-plan auto-select was introduced");
  // The rule lives in trip-target and its absence of a single-plan branch is pinned elsewhere;
  // this assertion keeps the picker from growing one.
});
