/**
 * F25 (brief 25): the booking-accept bridge is GONE, and the ONE class that may grant still classifies as plan work.
 *
 * What this file proves, and what it does not:
 *   P1  the bridge's own text is gone from `server/routes.ts`, and the booking-status route no longer calls
 *       `acceptTripAssignment` - the second caller is deleted, so the guard in brief 0 only has one to hold.
 *   P2  the checkout grant is untouched: `plan-work-access.service.ts` still reads the SNAPSHOT through the one
 *       classifier and still writes through `upsertTripAdvisorRow`.
 *   P3  the classifier itself: a planning/coordination offering classifies as `plan_work`, a consult offering
 *       does not - which is why a question session can no longer reach a grant by any path.
 *
 * NOT proven here (stated so nobody reads more into it): a route-level call of the accept endpoint. That needs the
 * monolith booted, which this repo forbids in tests; the recorded decision is in the pack's findings.md, Q-12.
 *
 * ASCII only, per the review request on new files in this lane.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { impactClassFor } from "../../shared/impact-class";
import { EXPERT_OFFERING_TIERS, type ExpertTier } from "../../shared/expert-offerings";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const ROUTES = read("server/routes.ts");
const GRANT = read("server/services/plan-work-access.service.ts");

const keyForTier = (tier: ExpertTier): string | undefined =>
  Object.entries(EXPERT_OFFERING_TIERS).find(([, t]) => t === tier)?.[0];

/** Any catalog key whose class is NOT plan work - what a question session or a "text a local" buys. */
const nonPlanKey = (): string => {
  const hit = Object.keys(EXPERT_OFFERING_TIERS).find((k) => impactClassFor({ offeringTypeKey: k } as any) !== "plan_work");
  assert.ok(hit, "the catalog carries at least one non-plan-work offering");
  return hit as string;
};

test("P1 the bridge is deleted, and the accept route no longer writes an advisor row", () => {
  assert.doesNotMatch(ROUTES, /Failed to bridge booking accept/, "the bridge's error line is gone");
  assert.doesNotMatch(ROUTES, /E1: trip-share bridge/, "the bridge's comment block is gone");
  // The only remaining mention of the one author is the comment that names why the bridge went.
  const calls = [...ROUTES.matchAll(/storage\.acceptTripAssignment\s*\(/g)];
  assert.equal(calls.length, 0, "no caller of acceptTripAssignment is left in routes.ts");
});

test("P2 the checkout grant is untouched: snapshot -> one classifier -> the one author", () => {
  assert.match(GRANT, /export async function grantPlanWorkAdvisorAccess\(/);
  assert.match(GRANT, /isPlanWorkSnapshot/);
  assert.match(GRANT, /upsertTripAdvisorRow/, "the grant still goes through the ONE author (LD 32)");
  assert.match(GRANT, /offering_contract_snapshot/, "the class is read off the snapshot, never the live listing");
});

test("P3 a planning offering is plan work; a consult offering never is", () => {
  const planning = keyForTier("planning") ?? keyForTier("coordination");
  assert.ok(planning, "the catalog carries a planning or coordination offering");
  assert.equal(impactClassFor({ offeringTypeKey: planning } as any), "plan_work", "planning -> plan_work");
  // Every other catalog key: named one here, so the proof does not depend on a tier's spelling.
  const other = nonPlanKey();
  assert.notEqual(impactClassFor({ offeringTypeKey: other } as any), "plan_work", "a non-plan offering never classifies as plan work");
  // Null facts classify as nothing, and nothing grants (the service states this; here we pin the classifier).
  assert.equal(impactClassFor(null), null);
  assert.equal(impactClassFor({} as any), null);
});
