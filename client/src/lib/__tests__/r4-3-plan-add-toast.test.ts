/**
 * R4-3 — the plan-add toast: its lifetime, and the three actions beside it.
 *
 * The 8 s ruling (Leon, QA round 3) is `PLAN_ADD_TOAST_MS` in `client/src/config/toast.config.ts`,
 * and all three plan-add calls must pass it — never a literal, so the number lives in one place.
 *
 * "View plan" is the EXISTING approved string (`ADD_COPY.viewPlan`) and it is offered on EVERY add toast
 * (Leon, Nov 16 2026: no guest exception). A signed-in add opens `/plans/:tripId`; a guest add opens
 * `/plans/new` ? the guest plan's own page (`GUEST_PLAN_PATH`, App.tsx -> GuestPlanMapPage). An earlier
 * version of this file pinned the opposite on the false premise that a guest plan had no page.
 *
 * NOTE (honest scope): this test pins the WIRING, not the observed 6.3 s. The measured close is not
 * reproduced by anything this file can see — see the PR body for what was ruled out and what is next.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PLAN_ADD_TOAST_MS } from "../../config/toast.config";
import { ADD_COPY } from "../add-to-plan";
import { addToastViewPlanHref, GUEST_PLAN_PATH } from "../plan-landing";

const HOST = fs.readFileSync("client/src/components/plan/PlanAddFeedbackHost.tsx", "utf8");

test("R4-3: the three plan-add calls all pass PLAN_ADD_TOAST_MS, never a literal", () => {
  assert.ok(PLAN_ADD_TOAST_MS >= 8000, `the ruling is at least 8 s, got ${PLAN_ADD_TOAST_MS}`);
  const calls = HOST.match(/duration:\s*[^,\n]+,/g) ?? [];
  assert.equal(calls.length, 3, `exactly three plan-add toasts carry a duration; found ${calls.length}`);
  for (const c of calls) assert.match(c, /duration:\s*PLAN_ADD_TOAST_MS,/, c);
  // A literal at a call site would silently drift from the config.
  assert.doesNotMatch(HOST, /duration:\s*\d{3,}/, "no numeric literal at a call site");
});

test("R4-3: the added toast carries Undo, Change day and View plan (the existing string)", () => {
  const actions = HOST.match(/function addedActions[\s\S]*?\r?\n}\r?\n/);
  assert.ok(actions, "addedActions is present");
  assert.match(actions[0], /data-testid="toast-added-undo"/);
  assert.match(actions[0], /data-testid="toast-added-change-day"/);
  assert.match(actions[0], /data-testid="toast-added-view-plan"/);
  assert.match(actions[0], /\{ADD_COPY\.viewPlan\}/, "the action's label is the approved string");
  assert.equal(ADD_COPY.viewPlan, "View plan", "the string is the one Leon approved");

  // Every toast carries it: the guest href is a constant, the signed-in href is the plan page.
  assert.match(HOST, /addToastViewPlanHref/, "the mapping is the pure helper, not an inline ternary");
  assert.doesNotMatch(HOST, /rail\.kind === "guest" \? null/, "no guest exception remains");
});

test("R4-3: a guest rail opens the guest plan page and a signed-in rail its plan", () => {
  assert.equal(addToastViewPlanHref({ kind: "guest", tripId: "t-guest" }), GUEST_PLAN_PATH);
  assert.equal(GUEST_PLAN_PATH, "/plans/new");
  assert.equal(addToastViewPlanHref({ kind: "signed_in", tripId: "t1" }), "/plans/t1");
  assert.equal(addToastViewPlanHref({ kind: "signed_in", tripId: "a b/c" }), "/plans/a%20b%2Fc", "the id is encoded");
});
