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
