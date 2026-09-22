import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAdminNotificationReach,
  ADMIN_EMAIL_RAILS,
} from "../services/runtime-health.service";

/**
 * H7 ("Admin-notification reach") pure-logic coverage — board #1469.
 *
 * `ADMIN_EMAIL` has three consumers and each no-ops silently when it is unset. Two of them
 * (`dailyAdminDigest`, `admin-digest-scheduler`) read ADMIN_EMAIL and nothing else; the third
 * (`nightlyQA`) falls back to every `role='admin'` row carrying a non-empty email. The whole
 * point of this evaluator is that those are NOT the same fact, so the tests below pin the
 * difference rather than just "unset ⇒ bad".
 *
 * It takes an env snapshot and an injected count, so it never reads live process.env and
 * never touches a database.
 *
 * Run with: npx tsx --test server/__tests__/runtime-health-admin-reach.test.ts
 */

test("H7-1: ADMIN_EMAIL set → nothing is silenced, whatever the admin-user count", () => {
  for (const count of [0, 1, 7, null]) {
    const r = evaluateAdminNotificationReach({ ADMIN_EMAIL: "ops@example.com" }, count);
    assert.equal(r.adminEmailSet, true);
    assert.deepEqual(r.silencedRails, [], `count=${count}`);
    assert.deepEqual(r.unknownRails, [], `count=${count}`);
  }
});

test("H7-2: ADMIN_EMAIL unset but an admin user has an email → the two env-only rails are silent, the nightly one is NOT", () => {
  const r = evaluateAdminNotificationReach({}, 2);
  assert.equal(r.adminEmailSet, false);
  assert.deepEqual(r.silencedRails, [
    ADMIN_EMAIL_RAILS.dailyAdminDigest,
    ADMIN_EMAIL_RAILS.adminDigestScheduler,
  ]);
  assert.ok(
    !r.silencedRails.includes(ADMIN_EMAIL_RAILS.nightlyQaEmail),
    "nightly QA has a DB fallback and must not be reported silent while it has a recipient",
  );
  assert.deepEqual(r.unknownRails, []);
});

test("H7-3: ADMIN_EMAIL unset AND no admin user with an email → all three silent", () => {
  const r = evaluateAdminNotificationReach({}, 0);
  assert.equal(r.silencedRails.length, 3);
  assert.ok(r.silencedRails.includes(ADMIN_EMAIL_RAILS.nightlyQaEmail));
  assert.deepEqual(r.unknownRails, []);
});

test("H7-4 (§13): an unreadable count is UNKNOWN, never zero — the nightly rail is not claimed silent", () => {
  const r = evaluateAdminNotificationReach({}, null);
  assert.equal(r.adminUsersWithEmail, null);
  assert.deepEqual(r.silencedRails, [
    ADMIN_EMAIL_RAILS.dailyAdminDigest,
    ADMIN_EMAIL_RAILS.adminDigestScheduler,
  ]);
  assert.deepEqual(r.unknownRails, [ADMIN_EMAIL_RAILS.nightlyQaEmail]);
});

test("H7-5: a whitespace-only ADMIN_EMAIL is not a recipient", () => {
  const r = evaluateAdminNotificationReach({ ADMIN_EMAIL: "   " }, 0);
  assert.equal(r.adminEmailSet, false);
  assert.equal(r.silencedRails.length, 3);
});

test("H7-6: the rail map names the three real consumers and nothing else", () => {
  assert.deepEqual(Object.values(ADMIN_EMAIL_RAILS).sort(), [
    "server/jobs/dailyAdminDigest.ts",
    "server/jobs/nightlyQA.ts",
    "server/services/admin-digest-scheduler.service.ts",
  ]);
});
