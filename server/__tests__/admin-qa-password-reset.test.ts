/** Source contracts supplement the real HTTP/database proof; no browser/session impersonation in production. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const routeFile = read("server/routes/admin.routes.ts");
const route = routeFile.slice(routeFile.indexOf('const qaPasswordResetSchema'), routeFile.indexOf('router.post("/api/admin/gems/backfill-photos"'));
const ui = read("client/src/pages/admin/users.tsx");

describe("QA reset request and UI security contracts", () => {
  it("requires authenticated admin guards plus a rate limiter and strict bounded password fields", () => {
    assert.match(route, /isAuthenticated, requireAdminLocal, strictRateLimiter/);
    assert.match(route, /adminPassword: z\.string\(\)\.min\(1\)\.max\(200\)/);
    assert.match(route, /newPassword: z\.string\(\)\.min\(8\)\.max\(200\)/);
    assert.match(route, /\.strict\(\)/);
  });
  it("does not echo passwords or raw failures; existing notice producer runs after the reset transaction", () => {
    assert.doesNotMatch(route, /console\.\w+\([^;]*(?:req\.body|parsed|error|err\b|result)/);
    assert.doesNotMatch(route, /\.json\([^;]*(?:adminPassword|newPassword|hashedPassword)/);
    assert.ok(route.indexOf("await resetQaPasswordAsAdmin") < route.indexOf("await sendPasswordChangedEmail"));
    assert.match(route, /tokenHash: result\.auditId/);
  });
  it("uses the authenticated client request helper without persistent password storage", () => {
    assert.match(ui, /apiRequest\("POST", `\/api\/admin\/users\/\$\{qaPasswordResetUser\.id\}\/qa-password-reset`/);
    assert.doesNotMatch(ui, /(?:localStorage|sessionStorage)\.setItem/);
    assert.match(ui, /autoComplete="current-password"/);
    assert.match(ui, /autoComplete="new-password"/);
    assert.match(ui, /setAdminPassword\(""\)/);
    assert.match(ui, /setNewPassword\(""\)/);
    assert.match(ui, /setConfirmPassword\(""\)/);
    assert.match(ui, /isResettingQaPassword/);
  });
  it("preserves the existing scrypt hasher and ordinary self-service reset entry", () => {
    const auth = read("server/replit_integrations/auth/emailAuth.ts");
    assert.match(auth, /export async function hashPassword/);
    assert.match(auth, /crypto\.randomBytes\(16\)/);
    assert.match(auth, /crypto\.scrypt\(password, salt, 64/);
    assert.match(auth, /app\.post\("\/api\/auth\/reset-password"/);
    assert.match(auth, /consumePasswordResetToken\(token, hashedPassword\)/);
  });
});
