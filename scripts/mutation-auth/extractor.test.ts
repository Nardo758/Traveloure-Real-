import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractMountedMutations } from "./extractor.ts";

test("follows mounted imported routers and normalizes paths", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-auth-"));
  fs.writeFileSync(path.join(dir, "routes.ts"), `import child from "./child"; app.use("/api", child); app.post("/api/direct/", requireAuth, () => {});`);
  fs.writeFileSync(path.join(dir, "child.ts"), `router.post("/widgets/:id/", isExpert, () => {}); router.get("/widgets", () => {});`);
  const result = extractMountedMutations(path.join(dir, "routes.ts"), dir);
  assert.equal(result.mutations.length, 2);
  assert.deepEqual(result.mutations.map((m) => [m.method, m.path]), [["POST", "/api/direct"], ["POST", "/api/widgets/:id"]]);
  assert.equal(result.mutations[1].expectedRoles[0], "expert");
});

test("resolves named re-exports used by authentication registration helpers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-auth-reexport-"));
  fs.mkdirSync(path.join(dir, "auth"));
  fs.writeFileSync(path.join(dir, "routes.ts"), `import { setupEmailAuth } from "./auth"; setupEmailAuth(app);`);
  fs.writeFileSync(path.join(dir, "auth/index.ts"), `export { setupEmailAuth } from "./email";`);
  fs.writeFileSync(path.join(dir, "auth/email.ts"), `export function setupEmailAuth(app: unknown) { app.post("/api/auth/login/", () => {}); }`);
  const result = extractMountedMutations(path.join(dir, "routes.ts"), dir);
  assert.equal(result.mutations.length, 1);
  assert.equal(result.mutations[0].rawPath, "/api/auth/login/");
  assert.equal(result.mutations[0].effectivePath, "/api/auth/login");
});

/*
 * THE NUMBERS BELOW WERE WRONG FROM BIRTH, AND THAT — NOT DRIFT — IS WHY THEY
 * WENT TEN MONTHS WITHOUT BEING NOTICED.
 *
 * This file was added by PR #973 asserting 587 raw / 578 unique. The manifest
 * generated THAT SAME DAY already said 597 / 588, so the suite never passed
 * once. It also runs in NO workflow, and `check-test-files-wired.cjs` does not
 * scan `scripts/`, so nothing ever went red: a test that cannot pass and cannot
 * be seen is indistinguishable from one that does not exist.
 *
 * Since that day the mounted graph has grown by exactly ONE route —
 * `POST /api/memberships/checkout` (`payments.routes.ts`, ledger
 * `2026-09-21-membership-checkout`) — taking it to 598 / 589. So updating these
 * numbers blesses one reviewed, ratified addition and corrects a ten-count
 * birth defect. It is not a drift detector being silenced.
 *
 * 2026-09-23 (ledger `2026-09-23-phase1-security`, board task #502): +3 reviewed routes, the
 * invited person's side of an EA link — `POST /api/me/ea-invitations/:id/accept`,
 * `POST /api/me/ea-invitations/:id/decline` and `DELETE /api/me/ea-links/:id` (`ea.routes.ts`).
 * An EA used to attach any account by email with no consent; linking now requires the person to
 * accept from their own session. 598 / 589 → 601 / 592; user-data 200 → 203; session-self
 * 303 → 306 (each acts only on a row addressed to the session's own email or account).
 *
 * 2026-09-24 (ledger `2026-09-24-out-of-band-refund-blocks-mint`, board task #1288): +1 reviewed
 * route, `POST /api/admin/bookings/:bookingId/out-of-band-refund/clear` (`admin.routes.ts`) — an
 * admin clears a refund-outside-the-platform mark with a required note (decision-maker, Sep 24).
 * Behind the §2 blanket admin guard and probed by the live admin suite. 601 / 592 → 602 / 593;
 * admin 148 → 149; admin-role 148 → 149.
 *
 * 2026-09-24 (PR #1066, lost-chargeback guard; decision-maker Sep 24): +1 reviewed route,
 * `POST /api/admin/bookings/:bookingId/lost-chargeback/reconcile` (`admin.routes.ts`) — the
 * ledger-only way to close a lost chargeback, which sends no money. Behind the §2 blanket admin
 * guard and probed by the live admin suite. 602 / 593 → 603 / 594; admin 149 → 150; admin-role
 * 149 → 150.
 *
 * 2026-09-24 (Phase 3 launch-gap batch, ledger `2026-09-24-phase3-launch-gaps-1`): +2 reviewed
 * routes. `POST /api/provider/services/:id/gallery-photo` (board #159; owner-gated in the handler,
 * the cover-photo rail's twin) is user-data; `POST /api/analytics/recruitment-click` (board #323;
 * a fire-and-forget beacon with a strict allowlist and no identity from the body) is other.
 * 603 / 594 → 605 / 596; user-data 203 → 204; other 210 → 211; session-self 306 → 308.
 *
 * 2026-09-24 (phone push, Locked Decision 53, ledger `2026-09-24-web-push`): +3 reviewed routes,
 * `POST` + `DELETE /api/push/subscriptions` and `POST /api/push/test` (`push.routes.ts`). Each acts
 * only on the SESSION account's own device rows (`.strict()` bodies, no identity in the body), so
 * session-self/other is the right class. 605 / 596 → 608 / 599; other 211 → 214; session-self
 * 308 → 311.
 *
 * 2026-09-24 (executive-assistant plans, Locked Decision 52 (C), ledger
 * `2026-09-24-ea-plans-for-executive`): +1 reviewed route, `POST /api/ea/clients/:id/trips`
 * (`ea.routes.ts`), behind the same `/api/ea` role guard as every other EA route, so it classes
 * with them (admin / admin-role). The owner comes from the EA's own accepted relationship row,
 * never the body. 608 / 599 → 609 / 600; admin 150 → 151; admin-role 150 → 151.
 *
 * 2026-09-24 (live help, Locked Decision 54, ledger `2026-09-24-live-chat-qa-sessions`): +2 reviewed
 * routes (`live-help.routes.ts`). `PUT /api/me/available-now` writes only the SESSION earner's own
 * switch (`.strict()` `{ on }`, no identity or time in the body) — user-data / session-self.
 * `POST /api/qa-sessions/:bookingId/start` stamps a Q&A Session on a booking the session user is
 * the traveler or seller of; a stranger and a non-Q&A booking are one 404 in the service
 * (`server/__tests__/live-help.db.test.ts` Q1), and it classes with its booking-lifecycle peers
 * (`accept-deliverable`, `request-revision`, component cancel — all session-self) — other /
 * session-self. 609 / 600 → 611 / 602; user-data 204 → 205; other 214 → 215; session-self
 * 311 → 313.
 *
 * Board #329 (ledger `2026-09-24-saved-places-plan-and-share`, migration 324) adds two routes in the
 * already-mounted `saved-items.routes.ts`: `POST /api/saved-items/shares` shares ONE city of the
 * SESSION user's own saved places (`.strict()` `{ city }`, no identity in the body) and
 * `DELETE /api/saved-items/shares/:shareId` stops the session user's own link (the UPDATE carries
 * `user_id = session` in its WHERE; not yours is one 404 —
 * `server/__tests__/saved-place-shares.db.test.ts` S5). Both user-data / session-self.
 * 611 / 602 → 613 / 604; user-data 205 → 207; session-self 313 → 315.
 *
 * RC-10 (ledger `2026-09-25-rc10-profile-photo`) mounts `profile-photo.routes.ts` with two
 * session-scoped writes: `POST /api/me/profile-photo` uploads the SESSION user's own photo (raw
 * bytes, no identity in the body or path — the actor is the session) and
 * `DELETE /api/me/profile-photo` NULLs the session user's own column (anonymous is 401 on both —
 * `server/__tests__/profile-photo.db.test.ts` R1). The public `GET /api/avatars/:file` proxy is a
 * read and is not a mutation. Both user-data / session-self. 613 / 604 → 615 / 606; user-data
 * 207 → 209; session-self 315 → 317.
 *
 * THE COUNTS ARE THE POINT: they exist so a route appearing or vanishing from
 * the mounted graph fails here. Now that the file is wired into CI, changing a
 * number is a decision that needs its reason stated, exactly as this one does.
 */
test("current mounted graph parity includes auth helpers and shared api paths", () => {
  const root = process.cwd();
  const result = extractMountedMutations(path.join(root, "server/routes.ts"), root);
  assert.equal(result.mutations.length, 615);
  assert.equal(new Set(result.mutations.map((m) => `${m.method} ${m.effectivePath}`)).size, 606);
  assert.ok(result.mutations.some((m) => m.path === "/api/auth/login" && m.source.endsWith("emailAuth.ts")));
  assert.ok(result.mutations.some((m) => m.path === "/api/trips/:id" && m.method === "PATCH"));
});

test("generated user-facing inventory contains one row per unique endpoint and stable risk totals", () => {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "generated/security/mutation-auth-manifest.json"), "utf8"));
  const markdown = fs.readFileSync(path.join(root, "generated/security/mutation-auth-inventory.md"), "utf8");
  const endpointRows = markdown.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| ---")).slice(1);
  assert.equal(endpointRows.length, 606);
  assert.equal(manifest.rawRegistrationCount, 615);
  assert.equal(manifest.uniqueMethodNormalizedPathCount, 606);
  assert.deepEqual(manifest.categoryTotals, { payments: 31, admin: 151, "user-data": 209, other: 215 });
  // POST /api/trips/:tripId/advisors moved session-self -> resource-owner (ledger
  // 2026-09-23-advisors-rail-takes-a-handle): it verifies trip ownership before any write, which
  // the text heuristic had missed; it is now probed by a real User A -> User B fixture.
  assert.deepEqual(manifest.boundaryTotals, {
    "admin-role": 151, "session-self": 317, "resource-owner": 94,
    signature: 6, "public-or-system": 38, unknown: 0,
  });
  const byEndpoint = new Map(manifest.mutations.map((mutation: any) => [
    `${mutation.method} ${mutation.effectivePath}`, mutation,
  ]));
  assert.equal(byEndpoint.get("POST /api/bookings/process-cart").risk, "payments");
  assert.equal(byEndpoint.get("POST /api/bookings/process-cart").expectedBoundary, "session-self");
  assert.equal(byEndpoint.get("POST /api/coordination-states/:id/pay").expectedBoundary, "resource-owner");
  assert.equal(byEndpoint.get("POST /api/webhooks/stripe").expectedBoundary, "signature");
  assert.equal(byEndpoint.get("POST /api/admin/payouts").risk, "admin");
  assert.equal(byEndpoint.get("POST /api/admin/payouts").expectedBoundary, "admin-role");
  const createTrip = byEndpoint.get("POST /api/trips");
  assert.equal(createTrip.risk, "user-data");
  assert.equal(createTrip.expectedAuth, "public");
  assert.equal(createTrip.expectedBoundary, "public-or-system");
  assert.equal(createTrip.ownershipApplies, false);
});