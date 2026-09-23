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
 * THE COUNTS ARE THE POINT: they exist so a route appearing or vanishing from
 * the mounted graph fails here. Now that the file is wired into CI, changing a
 * number is a decision that needs its reason stated, exactly as this one does.
 */
test("current mounted graph parity includes auth helpers and shared api paths", () => {
  const root = process.cwd();
  const result = extractMountedMutations(path.join(root, "server/routes.ts"), root);
  assert.equal(result.mutations.length, 598);
  assert.equal(new Set(result.mutations.map((m) => `${m.method} ${m.effectivePath}`)).size, 589);
  assert.ok(result.mutations.some((m) => m.path === "/api/auth/login" && m.source.endsWith("emailAuth.ts")));
  assert.ok(result.mutations.some((m) => m.path === "/api/trips/:id" && m.method === "PATCH"));
});

test("generated user-facing inventory contains one row per unique endpoint and stable risk totals", () => {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "generated/security/mutation-auth-manifest.json"), "utf8"));
  const markdown = fs.readFileSync(path.join(root, "generated/security/mutation-auth-inventory.md"), "utf8");
  const endpointRows = markdown.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| ---")).slice(1);
  assert.equal(endpointRows.length, 589);
  assert.equal(manifest.rawRegistrationCount, 598);
  assert.equal(manifest.uniqueMethodNormalizedPathCount, 589);
  assert.deepEqual(manifest.categoryTotals, { payments: 31, admin: 148, "user-data": 200, other: 210 });
  assert.deepEqual(manifest.boundaryTotals, {
    "admin-role": 148, "session-self": 304, "resource-owner": 93,
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