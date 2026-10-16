/**
 * LW-1-0 (ledger `2026-10-15-lw1-0-oauth-email-merge`): a first-time social sign-in whose email matches an
 * existing account is merged into it ONLY on an explicit verified-email signal, NEVER into an admin account,
 * and a refused merge creates no second account. Merges and refusals are logged by user id only.
 *
 * Run with:
 *   npx tsx --test server/__tests__/oauth-email-merge.test.ts
 *
 * M1 — Replit, `email_verified: true`, non-admin owner → merged into the owner (its id is the session's
 *      account); no new account; logged by id, never the email.
 * M2 — Replit, no / false / string "true" `email_verified` → refused with EMAIL_SIGN_IN_REQUIRED; the owner
 *      is not touched and no account is created; the refusal log names the owner id, never the email.
 * M3 — Replit, `email_verified: true`, ADMIN owner → refused, untouched; Facebook onto an admin → refused.
 * M4 — Facebook (no verified-email signal) onto a non-admin owner → refused, untouched, no account; the
 *      Facebook identity's OWN account with the same email still signs in as itself.
 * M5 — the pure rule: privileged before verified; only boolean true counts.
 *
 * Same stubbing strategy as registration-flag-gate.test.ts: authStorage methods are monkey-patched, the
 * registration flag read is stubbed open, and fetch is disabled.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "../db.js";
import { authStorage } from "../replit_integrations/auth/storage.js";
import { invalidatePlatformFlagCache } from "../services/platform-flags.js";
import { upsertUser } from "../replit_integrations/auth/replitAuth.js";
import { facebookVerify } from "../replit_integrations/auth/facebookAuth.js";
import {
  decideEmailMerge,
  oidcEmailVerified,
  EMAIL_SIGN_IN_REQUIRED,
  EMAIL_SIGN_IN_REQUIRED_MESSAGE,
} from "../replit_integrations/auth/email-merge.js";

const origExecute = (db as any).execute;
const origGetUser = authStorage.getUser;
const origGetUserByEmail = authStorage.getUserByEmail;
const origUpsertUser = authStorage.upsertUser;
const origUpdateUser = authStorage.updateUser;
const origFetch = global.fetch;
const origLog = console.log;
const origWarn = console.warn;

const EMAIL = "victim-owner@traveloure-qa.test";
let logs: string[] = [];
let updated: string[] = [];
let created: string[] = [];

before(() => {
  // platform-flags is the only db.execute caller here: registration stays OPEN, so a refusal can only
  // come from the merge rule.
  (db as any).execute = async () => ({ rows: [{ setting_value: "true" }] });
  (global as any).fetch = async () => { throw new Error("network disabled in test"); };
});

after(() => {
  (db as any).execute = origExecute;
  authStorage.getUser = origGetUser;
  authStorage.getUserByEmail = origGetUserByEmail;
  authStorage.upsertUser = origUpsertUser;
  authStorage.updateUser = origUpdateUser;
  (global as any).fetch = origFetch;
  console.log = origLog;
  console.warn = origWarn;
});

beforeEach(() => {
  invalidatePlatformFlagCache();
  logs = [];
  updated = [];
  created = [];
  console.log = (...a: any[]) => { logs.push(a.map(String).join(" ")); };
  console.warn = (...a: any[]) => { logs.push(a.map(String).join(" ")); };
  authStorage.updateUser = async (id: string) => { updated.push(id); return { id, email: EMAIL, isSuspended: false } as any; };
  authStorage.upsertUser = async (u: any) => { created.push(u.id); return { ...u, isSuspended: false } as any; };
});

function owner(role: string, id = "owner-1") {
  return { id, email: EMAIL, role, isSuspended: false, firstName: "Owner", profileImageUrl: "owner.png" };
}

function noEmailInLogs() {
  for (const line of logs) assert.ok(!line.includes(EMAIL), `log line carries the email: ${line}`);
}

describe("M1 — Replit with a verified email merges into a non-admin owner", () => {
  it("returns the owner's id, creates nothing, logs by id only", async () => {
    authStorage.getUser = async () => undefined as any;
    authStorage.getUserByEmail = async () => owner("user") as any;

    const accountId = await upsertUser({ sub: "replit-sub-1", email: EMAIL, email_verified: true });
    assert.equal(accountId, "owner-1");
    assert.deepEqual(updated, ["owner-1"]);
    assert.deepEqual(created, []);
    assert.ok(logs.some((l) => l.includes("replit-sub-1") && l.includes("owner-1")), "merge is logged by id");
    noEmailInLogs();
  });
});

describe("M2 — Replit without an explicit verified-email claim is refused", () => {
  for (const [label, claim] of [["absent", undefined], ["false", false], ['the string "true"', "true"]] as const) {
    it(`email_verified ${label} → EMAIL_SIGN_IN_REQUIRED, owner untouched, no account`, async () => {
      authStorage.getUser = async () => undefined as any;
      authStorage.getUserByEmail = async () => owner("user") as any;
      const claims: any = { sub: "replit-sub-2", email: EMAIL };
      if (claim !== undefined) claims.email_verified = claim;

      await assert.rejects(() => upsertUser(claims), new RegExp(EMAIL_SIGN_IN_REQUIRED));
      assert.deepEqual(updated, []);
      assert.deepEqual(created, []);
      assert.ok(logs.some((l) => l.includes("email_not_verified") && l.includes("owner-1")), "refusal logged by id");
      noEmailInLogs();
    });
  }
});

describe("M3 — never into an admin account", () => {
  it("Replit with a verified email onto an admin → refused, untouched", async () => {
    authStorage.getUser = async () => undefined as any;
    authStorage.getUserByEmail = async () => owner("admin", "admin-1") as any;

    await assert.rejects(
      () => upsertUser({ sub: "replit-sub-3", email: EMAIL, email_verified: true }),
      new RegExp(EMAIL_SIGN_IN_REQUIRED),
    );
    assert.deepEqual(updated, []);
    assert.deepEqual(created, []);
    assert.ok(logs.some((l) => l.includes("privileged_account") && l.includes("admin-1")));
    noEmailInLogs();
  });

  it("Facebook onto an admin → refused, untouched", async () => {
    authStorage.getUser = async () => undefined as any;
    authStorage.getUserByEmail = async () => owner("admin", "admin-1") as any;
    let result: any;
    await facebookVerify("tok", "rtok", { id: "777", displayName: "X", emails: [{ value: EMAIL }], photos: [] } as any,
      (err, user, info) => { result = { err, user, info }; });
    assert.equal(result.err, null);
    assert.equal(result.user, false);
    assert.equal(result.info.code, EMAIL_SIGN_IN_REQUIRED);
    assert.deepEqual(updated, []);
    assert.deepEqual(created, []);
    noEmailInLogs();
  });
});

describe("M4 — Facebook carries no verified-email signal, so it never merges", () => {
  const profile: any = { id: "888", displayName: "Fb User", emails: [{ value: EMAIL }], photos: [], name: { givenName: "Fb" } };

  it("a first-time Facebook sign-in onto a non-admin owner is refused with the sign-in message", async () => {
    authStorage.getUser = async () => undefined as any;
    authStorage.getUserByEmail = async () => owner("user") as any;
    let result: any;
    await facebookVerify("tok", "rtok", profile, (err, user, info) => { result = { err, user, info }; });
    assert.equal(result.err, null);
    assert.equal(result.user, false);
    assert.equal(result.info.code, EMAIL_SIGN_IN_REQUIRED);
    assert.equal(result.info.message, EMAIL_SIGN_IN_REQUIRED_MESSAGE);
    assert.deepEqual(updated, []);
    assert.deepEqual(created, [], "no second account for the same email");
    assert.ok(logs.some((l) => l.includes("email_not_verified") && l.includes("owner-1")));
    noEmailInLogs();
  });

  it("the Facebook identity's own account with that email still signs in as itself", async () => {
    const own = { id: "fb_888", email: EMAIL, role: "user", isSuspended: false, firstName: "Fb" };
    authStorage.getUser = async (id: string) => (id === "fb_888" ? own : undefined) as any;
    authStorage.getUserByEmail = async () => own as any;
    let result: any;
    await facebookVerify("tok", "rtok", profile, (err, user) => { result = { err, user }; });
    assert.equal(result.err, null);
    assert.equal(result.user?.claims?.sub, "fb_888");
    assert.deepEqual(updated, []);
  });
});

describe("M5 — the pure rule", () => {
  it("privileged before verified; only boolean true is a signal", () => {
    assert.deepEqual(decideEmailMerge({ emailVerified: true, owner: { role: "admin" } }), { merge: false, reason: "privileged_account" });
    assert.deepEqual(decideEmailMerge({ emailVerified: false, owner: { role: "admin" } }), { merge: false, reason: "privileged_account" });
    assert.deepEqual(decideEmailMerge({ emailVerified: false, owner: { role: "user" } }), { merge: false, reason: "email_not_verified" });
    assert.deepEqual(decideEmailMerge({ emailVerified: true, owner: { role: "travel_expert" } }), { merge: true });
    assert.equal(oidcEmailVerified({ email_verified: true }), true);
    assert.equal(oidcEmailVerified({ email_verified: "true" }), false);
    assert.equal(oidcEmailVerified({}), false);
    assert.equal(oidcEmailVerified(null), false);
  });
});
