import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diagnoseResendKey } from "../services/resend-diagnostic";
import { resendDiagnosticHandler } from "../routes/resend-diagnostic";

// The route's auth helper transitively loads server/db.ts. Keep these tests in
// the DB-backed server suite, not the credential-free shared unit suite.
const key = "re_fixture_not_a_real_credential";

async function runHandler(user: unknown, admin: boolean, fail = false) {
  let calls = 0;
  let status = 200;
  let body: any;
  const headers: Record<string,string> = {};
  const handler = resendDiagnosticHandler({
    isAdmin: async () => admin,
    buildCommit: () => "b".repeat(40),
    diagnose: async () => { calls++; if (fail) throw new Error(key); return diagnoseResendKey(undefined, null); },
  });
  const res = {
    setHeader: (k: string, v: string) => { headers[k] = v; },
    status: (s: number) => { status = s; return res; },
    json: (b: unknown) => { body = b; return res; },
  };
  await handler({user} as any, res as any, () => {});
  return {calls, status, body, headers};
}

test("anonymous and non-admin requests cannot inspect a key or invoke probe", async () => {
  const anonymous = await runHandler(undefined, true);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.calls, 0);
  const user = await runHandler({id: "traveler"}, false);
  assert.equal(user.status, 403);
  assert.equal(user.calls, 0);
});

test("admin responses are no-store and failures are sanitized", async () => {
  const r = await runHandler({id: "admin"}, true);
  assert.equal(r.status, 200);
  assert.equal(r.calls, 1);
  assert.equal(r.headers["Cache-Control"], "no-store");
  const failed = await runHandler({claims:{sub:"admin"}}, true, true);
  assert.equal(failed.status, 500);
  assert.ok(!JSON.stringify(failed.body).includes(key));
});

test("route is explicitly mounted behind authentication and full-admin lookup", () => {
  const src = readFileSync("server/routes/admin.routes.ts", "utf8");
  assert.match(src, /router.post\("\/api\/admin\/system\/email-key-diagnostic", isAuthenticated, resendDiagnosticHandler/);
  const section = src.slice(src.indexOf('router.post("/api/admin/system/email-key-diagnostic"'), src.indexOf('router.post("/api/admin/system/test-email"'));
  assert.ok(section.includes("getFullAdminUser(userId)"));
  assert.ok(section.includes("isAdminRole(user.role)"));
});

test("admin System mounts the no-send diagnostic and UI covers results and failures", () => {
  assert.ok(readFileSync("client/src/pages/admin/system.tsx", "utf8").includes("<ResendKeyDiagnostic />"));
  const ui = readFileSync("client/src/components/admin/ResendKeyDiagnostic.tsx", "utf8");
  for (const expected of ["button-resend-key-diagnostic", "resend-key-diagnostic-result", "result.key.fingerprint", "result.checkedAt", "result.buildCommit", "setResult(null)", "disabled={busy}", 'role="status"', 'apiRequest("POST", "/api/admin/system/email-key-diagnostic")']) assert.ok(ui.includes(expected), expected);
  assert.ok(!ui.includes("<Input"));
});
