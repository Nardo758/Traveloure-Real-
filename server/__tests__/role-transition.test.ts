/**
 * role-transition — the single-earning-role matrix and the expert-track review gate.
 *
 * Ledger `2026-09-04-earn-role-safety`. PURE unit test: `server/services/role-transition.ts`
 * imports only `shared/roles.ts`, so nothing here touches a database, a route, or a session.
 *
 * Run: npx tsx --test server/__tests__/role-transition.test.ts
 *
 * What it pins:
 *   Decision 2 — `users.role` is ONE varchar, so a second approval on an account that already
 *   earns under the OTHER family must REFUSE (409), never silently overwrite. Same-family
 *   re-approval, first approval, and the idempotent no-op stay allowed.
 *   Decision 3 — EVERY expert track switch goes through admin review, not just local_expert.
 *
 * Negative space: this file proves the PREDICATE. That the two approval handlers and
 * `updateUserRole` actually call it is a route/db concern — see the comments at each call site
 * (`server/routes/admin.routes.ts`, `server/services/admin-query.service.ts`).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  assertRoleTransitionAllowed,
  expertTrackSwitchRequiresReview,
  isRoleTransitionAllowed,
  roleFamily,
  RoleTransitionError,
} from "../services/role-transition";

/** Asserts the transition is refused AND that the message names the role already held. */
function assertRefused(current: string, next: string) {
  assert.throws(
    () => assertRoleTransitionAllowed(current, next),
    (err: unknown) => {
      assert.ok(err instanceof RoleTransitionError, "must throw RoleTransitionError");
      assert.equal(err.statusCode, 409, "refusal is a 409 conflict, not a 500");
      assert.equal(err.currentRole, current);
      assert.equal(err.attemptedRole, next);
      // The admin has to be told WHICH role blocks the approval — a generic "conflict" is
      // exactly the silence this ruling exists to remove (§13).
      assert.ok(
        err.message.length > 0 && /already an approved/i.test(err.message),
        `message must name the existing role, got: ${err.message}`,
      );
      return true;
    },
    `${current} → ${next} must be refused`,
  );
  assert.equal(isRoleTransitionAllowed(current, next), false);
}

function assertAllowed(current: string | null, next: string) {
  assert.equal(
    isRoleTransitionAllowed(current, next),
    true,
    `${current} → ${next} must be allowed`,
  );
  assert.doesNotThrow(() => assertRoleTransitionAllowed(current, next));
}

// ─── Decision 2: the allow/refuse matrix ─────────────────────────────────────

test("user → service_provider is allowed (a first approval is the normal path)", () => {
  assertAllowed("user", "service_provider");
});

test("user → travel_expert is allowed", () => {
  assertAllowed("user", "travel_expert");
});

test("null role → any earning role is allowed (no role yet ⇒ nothing to protect)", () => {
  assertAllowed(null, "service_provider");
  assertAllowed(null, "executive_assistant");
});

test("travel_expert → local_expert is allowed (same family, re-evaluated by review)", () => {
  assertAllowed("travel_expert", "local_expert");
  assertAllowed("local_expert", "event_planner");
  assertAllowed("expert", "travel_expert");
});

test("local_expert → service_provider is REFUSED", () => {
  assertRefused("local_expert", "service_provider");
});

test("service_provider → event_planner is REFUSED", () => {
  assertRefused("service_provider", "event_planner");
});

test("executive_assistant → travel_expert is REFUSED (EA is its own family)", () => {
  assertRefused("executive_assistant", "travel_expert");
});

test("the expert and provider families are each refused into executive_assistant", () => {
  assertRefused("travel_expert", "executive_assistant");
  assertRefused("service_provider", "executive_assistant");
});

test("the same role again is a no-op, never a 409 (re-approval must stay idempotent)", () => {
  assertAllowed("service_provider", "service_provider");
  assertAllowed("local_expert", "local_expert");
  assertAllowed("executive_assistant", "executive_assistant");
});

test("moving OUT of an earning role is allowed — that is how an account is freed up", () => {
  assertAllowed("service_provider", "user");
  assertAllowed("local_expert", "admin");
  // ...and an admin account is not itself an earning role, so it is not blocked either.
  assertAllowed("admin", "service_provider");
});

test("roleFamily maps the three families and nothing else", () => {
  assert.equal(roleFamily("expert"), "expert");
  assert.equal(roleFamily("travel_expert"), "expert");
  assert.equal(roleFamily("local_expert"), "expert");
  assert.equal(roleFamily("event_planner"), "expert");
  assert.equal(roleFamily("service_provider"), "provider");
  assert.equal(roleFamily("executive_assistant"), "executive_assistant");
  assert.equal(roleFamily("user"), null);
  assert.equal(roleFamily("admin"), null);
  assert.equal(roleFamily(null), null);
  // An unrecognised legacy string is NOT guessed into a family (§13).
  assert.equal(roleFamily("provider"), null, "bare 'provider' is never a stored role");
});

// ─── Decision 3: every expert track switch goes through admin review ─────────

test("every expert track switch requires review — not only local_expert", () => {
  for (const target of ["travel_expert", "local_expert", "event_planner", "executive_assistant"]) {
    for (const current of ["travel_expert", "local_expert", "event_planner", "executive_assistant"]) {
      assert.equal(
        expertTrackSwitchRequiresReview(current, target),
        current !== target,
        `${current} → ${target}`,
      );
    }
  }
});

test("executive_assistant in particular is gated (it grants the /ea/* console)", () => {
  assert.equal(expertTrackSwitchRequiresReview("travel_expert", "executive_assistant"), true);
  assert.equal(expertTrackSwitchRequiresReview("event_planner", "executive_assistant"), true);
});

test("re-saving the CURRENT track is not a switch and needs no review", () => {
  assert.equal(expertTrackSwitchRequiresReview("event_planner", "event_planner"), false);
});

test("an unknown current track requires review rather than being guessed as the default", () => {
  assert.equal(expertTrackSwitchRequiresReview(null, "travel_expert"), true);
  assert.equal(expertTrackSwitchRequiresReview(undefined, "travel_expert"), true);
});
