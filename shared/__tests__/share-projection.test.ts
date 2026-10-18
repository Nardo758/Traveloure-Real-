/**
 * FD-4 (ledger `2026-10-18-fd4-share-projection`): the pure share projection and the free-draft gem context.
 * The HTTP half over every share rail is server/__tests__/share-local-projection.http.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freeDraftGemContext,
  legIsShareable,
  localCountEntry,
  localFieldsIn,
  partitionShareStops,
  projectVariantPlanForShare,
  sharePublicTest,
} from "../share-projection";
import { isFreeDraftEligible } from "../content-tiers";

test("SP1: a day's count is present only above zero", () => {
  assert.deepEqual(localCountEntry(0), {});
  assert.deepEqual(localCountEntry(2), { localCount: 2 });
});

test("SP2: a variant item is public only through a public plan row; an unlinked or untagged one is not", () => {
  const isPublic = sharePublicTest(
    [
      { id: "v1", sourceItemId: "i1" },
      { id: "v2", sourceItemId: "i2" },
      { id: "v3", sourceItemId: null },
    ],
    new Set(["i1"]),
  );
  assert.equal(isPublic("v1"), true);
  assert.equal(isPublic("i1"), true);
  assert.equal(isPublic("v2"), false);
  assert.equal(isPublic("v3"), false);
  assert.equal(isPublic("unknown"), false);
});

test("SP3: a leg is shown only when both ends are shown; a missing end hides it", () => {
  const isPublic = (id: string) => id === "a" || id === "b";
  assert.equal(legIsShareable({ fromActivityId: "a", toActivityId: "b" }, isPublic), true);
  assert.equal(legIsShareable({ fromActivityId: "a", toActivityId: "x" }, isPublic), false);
  assert.equal(legIsShareable({ fromActivityId: null, toActivityId: "b" }, isPublic), false);
});

test("SP4: projecting a plan keeps public stops and legs and counts the rest per day", () => {
  const plan: any = {
    days: [
      { dayNumber: 1, activities: [{ id: "a" }, { id: "b" }, { id: "x" }], transports: [
        { id: "l1", fromActivityId: "a", toActivityId: "b" },
        { id: "l2", fromActivityId: "b", toActivityId: "x" },
      ] },
      { dayNumber: 2, activities: [{ id: "a2" }], transports: [] },
    ],
    legs: [
      { id: "l1", fromActivityId: "a", toActivityId: "b" },
      { id: "l2", fromActivityId: "b", toActivityId: "x" },
    ],
  };
  const { plan: out, hidden } = projectVariantPlanForShare(plan, (id) => id === "a" || id === "b");
  assert.deepEqual(out.days[0].activities.map((a: any) => a.id), ["a", "b"]);
  assert.deepEqual(out.days[0].transports.map((l: any) => l.id), ["l1"]);
  assert.deepEqual(out.days[1].activities, []);
  assert.deepEqual(out.legs.map((l: any) => l.id), ["l1"]);
  assert.deepEqual([...hidden.entries()], [[1, 1], [2, 1]]);
  assert.equal(partitionShareStops([{ id: "q" }], () => false).hidden, 1);
});

test("SP5: the free-draft gem context takes public, live gems only and carries three fields", () => {
  const ctx = freeDraftGemContext(
    [
      { placeName: "Public Gem", description: "p", gemScore: 7, sourceClass: "public", insight: "nope" },
      { placeName: "Local Gem", description: "l", gemScore: 9, sourceClass: "local" },
      { placeName: "Untagged Gem", description: "u", gemScore: 8, sourceClass: null },
    ],
    (g) => isFreeDraftEligible(g as any),
  );
  assert.deepEqual(ctx, [{ name: "Public Gem", description: "p", gemScore: 7 }]);
  assert.deepEqual(freeDraftGemContext(undefined, () => true), []);
});

test("SP6: the leak check finds a local field carrying a value at any depth, and ignores empty ones", () => {
  assert.deepEqual(localFieldsIn({ a: [{ b: { expertNote: "x" } }] }), ["expertNote"]);
  assert.deepEqual(localFieldsIn({ expertNotes: null, expertTravelerNote: "", insight: undefined }), []);
});
