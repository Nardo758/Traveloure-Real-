/**
 * Registration kill switch (platform_settings.new_user_registration_enabled)
 * — coverage across all three signup paths.
 *
 * Run with:
 *   npx tsx --test server/__tests__/registration-flag-gate.test.ts
 *
 * Coverage:
 * (A) Email register (POST /api/auth/register) → 403 when flag is 'false'.
 * (B) Replit OIDC upsertUser → throws REGISTRATION_DISABLED for a first-time
 *     user when flag is 'false'.
 * (C) Replit OIDC upsertUser → existing account still logs in when flag is 'false'.
 * (D) Facebook verify → done(null, false, {message}) for a first-time fb user
 *     when flag is 'false'.
 * (E) Facebook verify → existing fb account still logs in when flag is 'false'.
 *
 * Strategy:
 * – db.execute is monkey-patched so platform-flags reads return a controlled
 *   value ('false'), and the flag cache is invalidated between tests.
 * – authStorage methods are monkey-patched on the shared object.
 * – Route handlers are captured from a fake Express app object.
 * – global.fetch is stubbed so fetchInstagramData never hits the network.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "../db.js";
import { authStorage } from "../replit_integrations/auth/storage.js";
import { invalidatePlatformFlagCache } from "../services/platform-flags.js";
import { setupEmailAuth } from "../replit_integrations/auth/emailAuth.js";
import { upsertUser } from "../replit_integrations/auth/replitAuth.js";
import { facebookVerify } from "../replit_integrations/auth/facebookAuth.js";

// ─── patches ──────────────────────────────────────────────────────────────────

const origExecute = (db as any).execute;
const origGetUser = authStorage.getUser;
const origGetUserByEmail = authStorage.getUserByEmail;
const origUpsertUser = authStorage.upsertUser;
const origFetch = global.fetch;

let flagValue = "false";

before(() => {
  (db as any).execute = async (query: any) => {
    // platform-flags is the only db.execute caller exercised by these tests.
    return { rows: [{ setting_value: flagValue }] };
  };
  // fetchInstagramData must not hit the network.
  (global as any).fetch = async () => {
    throw new Error("network disabled in test");
  };
});

after(() => {
  (db as any).execute = origExecute;
  authStorage.getUser = origGetUser;
  authStorage.getUserByEmail = origGetUserByEmail;
  authStorage.upsertUser = origUpsertUser;
  (global as any).fetch = origFetch;
});

beforeEach(() => {
  invalidatePlatformFlagCache();
  flagValue = "false";
});

// ─── mock req/res ─────────────────────────────────────────────────────────────

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return res;
}

// ─── (A) email register ───────────────────────────────────────────────────────

describe("email register path", () => {
  it("returns 403 when new_user_registration_enabled = 'false'", async () => {
    const routes: Record<string, Function> = {};
    const fakeApp: any = { post: (p: string, h: Function) => { routes[p] = h; }, get: () => {} };
    setupEmailAuth(fakeApp);
    const handler = routes["/api/auth/register"];
    assert.ok(handler, "register route registered");

    const res = mockRes();
    await handler(
      { body: { email: "new@test.com", password: "password123", firstName: "A", lastName: "B" } },
      res
    );
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /registration is temporarily disabled/i);
  });
});

// ─── (B)+(C) Replit OIDC ─────────────────────────────────────────────────────

describe("Replit OIDC path", () => {
  it("throws REGISTRATION_DISABLED for a first-time user when flag is off", async () => {
    authStorage.getUser = async () => undefined as any;
    authStorage.getUserByEmail = async () => undefined as any;
    authStorage.upsertUser = async () => { throw new Error("should not create a user"); };

    await assert.rejects(
      () => upsertUser({ sub: "new-oidc-user", email: "oidc-new@test.com", first_name: "N" }),
      /REGISTRATION_DISABLED/
    );
  });

  it("allows an existing account to log in when flag is off", async () => {
    const existing = { id: "existing-oidc", email: "old@test.com", isSuspended: false };
    authStorage.getUser = async () => existing as any;
    authStorage.upsertUser = async () => existing as any;

    await assert.doesNotReject(() =>
      upsertUser({ sub: "existing-oidc", email: "old@test.com" })
    );
  });
});

// ─── (D)+(E) Facebook ────────────────────────────────────────────────────────

describe("Facebook path", () => {
  const profile: any = {
    id: "12345",
    displayName: "Test User",
    emails: [{ value: "fb-user@test.com" }],
    photos: [],
    name: { givenName: "Test", familyName: "User" },
  };

  it("rejects a first-time Facebook user when flag is off", async () => {
    authStorage.getUserByEmail = async () => undefined as any;
    authStorage.getUser = async () => undefined as any;
    authStorage.upsertUser = async () => { throw new Error("should not create a user"); };

    let result: { err: any; user: any; info: any } | undefined;
    await facebookVerify("tok", "rtok", profile, (err, user, info) => {
      result = { err, user, info };
    });
    assert.ok(result, "done was called");
    assert.equal(result!.err, null);
    assert.equal(result!.user, false);
    assert.match(result!.info.message, /registration is temporarily disabled/i);
  });

  it("allows an existing Facebook account to log in when flag is off", async () => {
    const existingFb = { id: "fb_12345", email: "fb-user@test.com", isSuspended: false, firstName: "Test" };
    authStorage.getUserByEmail = async () => undefined as any;
    authStorage.getUser = async () => existingFb as any;
    authStorage.upsertUser = async () => existingFb as any;

    let result: { err: any; user: any } | undefined;
    await facebookVerify("tok", "rtok", profile, (err, user) => {
      result = { err, user };
    });
    assert.ok(result, "done was called");
    assert.equal(result!.err, null);
    assert.ok(result!.user && result!.user.claims?.sub === "fb_12345", "session user returned");
  });
});
