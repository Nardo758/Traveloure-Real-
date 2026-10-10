/**
 * FD-1 — free-draft cap, pure rules (ledger `2026-10-09-fd1-free-draft-cap`).
 *
 *   FC1  a paid-tier plan is never a free draft; the owner is charged whoever pressed; QA is exempt
 *   FC2  a guest counts only on a server guest record; no owner and no record ⇒ nobody
 *   FC3  the cap: under the limit allowed, at it refused with the numbers; one per plan refused first
 *   FC4  a released run (our failure) never counts
 *   FC5  §6 copy from the server's numbers; nothing true ⇒ null
 *   FC6  the teaser is counts only, absent when not computed or both zero
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freeDraftSubject, decideFreeDraft, runCounts, freeDraftCopy, localTeaserForDay } from "../free-draft-cap";

test("FC1 — paid tier, owner, QA", () => {
  const base = { rail: "trip" as const, planOwnerId: "owner", planIsPaidTier: false, ownerIsQa: false };
  assert.deepEqual(freeDraftSubject(base), { kind: "user", userId: "owner" });
  assert.equal(freeDraftSubject({ ...base, planIsPaidTier: true }), null);
  assert.equal(freeDraftSubject({ ...base, ownerIsQa: true }), null);
});

test("FC2 — guests only on a server record", () => {
  const base = { rail: "slip" as const, planOwnerId: null, planIsPaidTier: false, ownerIsQa: false };
  assert.equal(freeDraftSubject(base), null);
  assert.deepEqual(freeDraftSubject({ ...base, serverGuestKey: "g1" }), { kind: "guest", guestKey: "g1" });
});

test("FC3 — the cap and one per plan", () => {
  assert.deepEqual(decideFreeDraft({ usedInWindow: 0, planHasCountingRun: false, limit: 3, windowDays: 30 }), { allowed: true, used: 0, limit: 3, remainingAfter: 2 });
  assert.deepEqual(decideFreeDraft({ usedInWindow: 3, planHasCountingRun: false, limit: 3, windowDays: 30 }), { allowed: false, reason: "cap_reached", used: 3, limit: 3, windowDays: 30 });
  assert.deepEqual(decideFreeDraft({ usedInWindow: 0, planHasCountingRun: true, limit: 3, windowDays: 30 }), { allowed: false, reason: "plan_already_drafted" });
});

test("FC4 — a released run never counts", () => {
  assert.equal(runCounts("claimed"), true);
  assert.equal(runCounts("drafted"), true);
  assert.equal(runCounts("released"), false);
  assert.equal(runCounts(null), false);
});

test("FC5 — copy", () => {
  assert.equal(freeDraftCopy({ used: 1, limit: 3 }), "2 of 3 free drafts left this month");
  assert.equal(freeDraftCopy({ used: 3, limit: 3 }), "Free drafts used up — Optimize or get a Trip Pass");
  assert.equal(freeDraftCopy(null), null);
  assert.equal(freeDraftCopy({ used: 0, limit: 0 }), null);
});

test("FC6 — teaser counts only", () => {
  assert.deepEqual(localTeaserForDay({ localPicks: 2, localNotes: 1 }), { localPicks: 2, localNotes: 1 });
  assert.equal(localTeaserForDay({ localPicks: 0, localNotes: 0 }), undefined);
  assert.equal(localTeaserForDay(null), undefined);
  assert.deepEqual(Object.keys(localTeaserForDay({ localPicks: 1, localNotes: 0 })!).sort(), ["localNotes", "localPicks"]);
});

import { localTeasersByDay } from "../free-draft-cap";

test("FC7 — teaser basis: located stops pick their nearest area; gems already on the plan are not counted", () => {
  const hoods = [
    { id: "n1", slug: "gion", name: "Gion", lat: 35.0037, lng: 135.7788 },
    { id: "n2", slug: "arashiyama", name: "Arashiyama", lat: 35.0094, lng: 135.6668 },
  ];
  const out = localTeasersByDay({
    items: [
      { dayNumber: 1, lat: 35.004, lng: 135.778, gemId: "g1" },
      { dayNumber: 2, lat: 35.01, lng: 135.667, gemId: null },
      { dayNumber: 3, lat: null, lng: null, gemId: null },
    ],
    neighbourhoods: hoods,
    gems: [{ id: "g1", neighbourhoodSlug: "gion" }, { id: "g2", neighbourhoodSlug: "gion" }, { id: "g3", neighbourhoodSlug: "Arashiyama" }],
    notes: [{ neighbourhoodId: "n1", neighbourhoodName: null }, { neighbourhoodId: null, neighbourhoodName: "arashiyama" }, { neighbourhoodId: null, neighbourhoodName: "arashiyama" }],
  });
  assert.deepEqual(out.get(1), { localPicks: 1, localNotes: 1 });
  assert.deepEqual(out.get(2), { localPicks: 1, localNotes: 2 });
  assert.equal(out.has(3), false, "a day with no located stop is not computed");
});

test("FC8 — teaser: no neighbourhoods or nothing local ⇒ no key at all", () => {
  assert.equal(localTeasersByDay({ items: [{ dayNumber: 1, lat: 1, lng: 1, gemId: null }], neighbourhoods: [], gems: [], notes: [] }).size, 0);
  const none = localTeasersByDay({
    items: [{ dayNumber: 1, lat: 35, lng: 135, gemId: null }],
    neighbourhoods: [{ id: "n", slug: "x", name: "X", lat: 35, lng: 135 }],
    gems: [], notes: [],
  });
  assert.equal(none.size, 0, "a computed zero is omitted, never shown as '0 local picks'");
});
