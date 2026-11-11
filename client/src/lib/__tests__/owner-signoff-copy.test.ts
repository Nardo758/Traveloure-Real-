/**
 * Slice 0 (ledger `2026-11-10-slice0-staff-roles`) — the admin screens say "Sent for owner sign-off" only when the
 * server says the approval is waiting, and the copy is exactly the approved wording (Leon, Nov 11, 2026, PR #1979).
 *
 * Run: npx tsx --test client/src/lib/__tests__/owner-signoff-copy.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  LISTING_AWAITING_OWNER_DESCRIPTION,
  OWNER_SIGNOFF_TITLE,
  PROVIDER_AWAITING_OWNER_DESCRIPTION,
  isAwaitingOwnerSignoff,
  readApprovalOutcome,
} from "../owner-signoff-copy";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("OS1 the approved copy, verbatim", () => {
  assert.equal(OWNER_SIGNOFF_TITLE, "Sent for owner sign-off");
  assert.equal(LISTING_AWAITING_OWNER_DESCRIPTION, "It goes live once the owner approves it.");
  assert.equal(PROVIDER_AWAITING_OWNER_DESCRIPTION, "The provider is approved once the owner confirms.");
});

test("OS2 waiting only on the server's own 202 + flag; anything else is not waiting", () => {
  assert.equal(isAwaitingOwnerSignoff(202, { awaitingOwnerSignoff: true }), true);
  assert.equal(isAwaitingOwnerSignoff(200, { awaitingOwnerSignoff: true }), false);
  assert.equal(isAwaitingOwnerSignoff(202, {}), false);
  assert.equal(isAwaitingOwnerSignoff(202, { awaitingOwnerSignoff: "true" }), false);
  assert.equal(isAwaitingOwnerSignoff(202, null), false);
  assert.equal(isAwaitingOwnerSignoff(200, { id: "svc-1", approvalStatus: "approved" }), false);
});

test("OS3 a response is read without consuming it, and an unreadable body is not waiting", async () => {
  const waiting = new Response(JSON.stringify({ awaitingOwnerSignoff: true }), { status: 202 });
  assert.deepEqual(await readApprovalOutcome(waiting), { awaitingOwnerSignoff: true });
  assert.deepEqual(await waiting.json(), { awaitingOwnerSignoff: true }, "the body is still readable");
  assert.deepEqual(await readApprovalOutcome(new Response(JSON.stringify({ id: "x" }), { status: 200 })), { awaitingOwnerSignoff: false });
  assert.deepEqual(await readApprovalOutcome(new Response("not json", { status: 202 })), { awaitingOwnerSignoff: false });
});

test("OS4 both approval screens read the outcome and show the waiting copy only on it", () => {
  const services = read("client/src/pages/admin/service-approvals.tsx");
  assert.match(services, /readApprovalOutcome\(await apiRequest\("POST", `\/api\/admin\/provider-services\/\$\{id\}\/approve`/);
  assert.match(services, /if \(outcome\.awaitingOwnerSignoff\) toast\(\{ title: OWNER_SIGNOFF_TITLE, description: LISTING_AWAITING_OWNER_DESCRIPTION \}\)/);
  const providers = read("client/src/pages/admin/providers.tsx");
  assert.match(providers, /readApprovalOutcome\(await apiRequest\("PATCH", `\/api\/admin\/provider-applications\/\$\{id\}\/status`/);
  assert.match(providers, /variables\.status === "approved" && outcome\.awaitingOwnerSignoff/);
  assert.match(providers, /PROVIDER_AWAITING_OWNER_DESCRIPTION/);
  // The strings live in one place.
  for (const src of [services, providers]) assert.doesNotMatch(src, /Sent for owner sign-off/);
});
