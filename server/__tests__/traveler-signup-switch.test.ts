/**
 * LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`): the traveler sign-up switch on the EMAIL path, the
 * Ready-Made purchase gate and the pure rules. (The Replit and Facebook paths join after LW-1-0, #1462, merges —
 * Phase 0 sanction: LW-1b does not touch those two files until then.)
 *
 * Run with:
 *   npx tsx --test server/__tests__/traveler-signup-switch.test.ts
 *
 * S1 — the mode is read FAIL CLOSED: 'open' opens; a missing row, any other value or a read error is 'waitlist'.
 * S2 — email register, waitlist mode: a traveler is refused 403 TRAVELER_WAITLIST with redirectTo
 *      /<launch market>?blocked=1 (no email in it), before the existing-email check; supply intent passes.
 * S3 — email register, open mode: a traveler passes.
 * S4 — the QA code: a matching code passes a waitlist-mode traveler; a wrong code, an absent code and an UNSET
 *      secret all refuse; the comparison is over digests (length mismatch never throws).
 * S5 — existing accounts always sign in: POST /api/auth/login never consults the switch.
 * S6 — the Ready-Made purchase gate: waitlist mode refuses a traveler and passes an admin and a QA-tagged account;
 *      open mode passes everyone.
 * S7 — the pure rules (decideFirstTimeSignup, normalizeSignupIntent, waitlistBlockedPath).
 * S8 — Replit OIDC: a first-time traveler is refused in waitlist mode and passes in open mode; a first-time supply
 *      sign-up passes in waitlist mode; an existing account signs in in waitlist mode.
 * S9 — Facebook: the same four cases, and a new Facebook account records authProvider "facebook".
 * S10 — the session stash: intent and a same-site return path survive; an open redirect, a stale stash and a
 *      missing stash read as a traveler with no return path; taking the return path clears the stash.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db } from "../db.js";
import { invalidatePlatformFlagCache, getTravelerSignupMode, getLaunchMarketSlug } from "../services/platform-flags.js";
import { setupEmailAuth } from "../replit_integrations/auth/emailAuth.js";
import { qaSignupCodeMatches } from "../services/qa-signup-code.js";
import { authStorage } from "../replit_integrations/auth/storage.js";
import { upsertUser } from "../replit_integrations/auth/replitAuth.js";
import { facebookVerify } from "../replit_integrations/auth/facebookAuth.js";
import { stashSignupIntent, readSignupIntent, takeStashedReturnTo } from "../replit_integrations/auth/signup-intent-stash.js";
import { OAUTH_STATE_TTL_MS } from "../utils/oauth-state.js";
import { decideWaitlistPurchase } from "../services/waitlist-purchase-gate.js";
import {
  TRAVELER_WAITLIST,
  decideFirstTimeSignup,
  normalizeSignupIntent,
  parseTravelerSignupMode,
  waitlistBlockedPath,
} from "../../shared/launch-signup.js";

// ─── settings stub: platform-flags reads `platform_settings` through db.execute ─────────────────────────────

const origExecute = (db as any).execute;
const origSelect = (db as any).select;
const origQaCode = process.env.QA_SIGNUP_CODE;
const origGetUser = authStorage.getUser;
const origGetUserByEmail = authStorage.getUserByEmail;
const origUpsertUser = authStorage.upsertUser;
const origFetch = global.fetch;

let settings: Record<string, string | null> = {};
let readThrows = false;
let selectCalls = 0;

function boundKey(query: any): string | null {
  const chunks: unknown[] = query?.queryChunks ?? [];
  const hit = chunks.find((c) => typeof c === "string" && (c in settings || c.endsWith("_mode") || c.endsWith("_slug") || c.endsWith("_enabled")));
  return typeof hit === "string" ? hit : null;
}

before(() => {
  (db as any).execute = async (query: any) => {
    if (readThrows) throw new Error("db down");
    const key = boundKey(query);
    const value = key ? settings[key] : undefined;
    return { rows: value === undefined || value === null ? [] : [{ setting_value: value }] };
  };
  // The existing-email check is the first thing after the gate: answering it with an existing account makes the
  // handler stop with 400 "already exists" — proof the request got PAST the gate without creating anything.
  (db as any).select = () => {
    selectCalls += 1;
    const chain: any = { from: () => chain, where: () => chain, limit: () => chain, then: (f: any) => Promise.resolve([{ id: "existing" }]).then(f) };
    return chain;
  };
});

after(() => {
  authStorage.getUser = origGetUser;
  authStorage.getUserByEmail = origGetUserByEmail;
  authStorage.upsertUser = origUpsertUser;
  (global as any).fetch = origFetch;
  (db as any).execute = origExecute;
  (db as any).select = origSelect;
  if (origQaCode === undefined) delete process.env.QA_SIGNUP_CODE;
  else process.env.QA_SIGNUP_CODE = origQaCode;
});

beforeEach(() => {
  invalidatePlatformFlagCache();
  settings = { new_user_registration_enabled: "true", launch_market_slug: "kyoto", traveler_signup_mode: "waitlist" };
  readThrows = false;
  selectCalls = 0;
  delete process.env.QA_SIGNUP_CODE;
});

// ─── capture the email handlers ─────────────────────────────────────────────────────────────────────────────

const handlers: Record<string, any> = {};
setupEmailAuth({
  post: (path: string, h: any) => { handlers[`POST ${path}`] = h; },
  get: (path: string, h: any) => { handlers[`GET ${path}`] = h; },
} as any);

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return res;
}

async function register(extra: Record<string, unknown> = {}) {
  const res = mockRes();
  await handlers["POST /api/auth/register"](
    { body: { email: "new-traveler@traveloure-qa.test", password: "longenough1", firstName: "N", lastName: "T", ...extra }, session: {} },
    res,
  );
  return res;
}

describe("S1 — the mode is read fail closed", () => {
  it("only the stored value 'open' opens", async () => {
    settings.traveler_signup_mode = "open";
    assert.equal(await getTravelerSignupMode(), "open");
    for (const v of [null, "OPEN", "waitlist", "", "closed"]) {
      invalidatePlatformFlagCache();
      settings.traveler_signup_mode = v;
      assert.equal(await getTravelerSignupMode(), "waitlist", `value ${JSON.stringify(v)}`);
    }
  });
  it("a read error is waitlist, and the launch market reads as null rather than a guess", async () => {
    readThrows = true;
    assert.equal(await getTravelerSignupMode(), "waitlist");
    assert.equal(await getLaunchMarketSlug(), null);
  });
});

describe("S2 — email register in waitlist mode", () => {
  it("refuses a traveler with TRAVELER_WAITLIST and the launch market's waitlist path, before any account read", async () => {
    const res = await register();
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, TRAVELER_WAITLIST);
    assert.equal(res.body.redirectTo, "/kyoto?blocked=1");
    assert.ok(!JSON.stringify(res.body).includes("traveloure-qa.test"), "the refusal carries no email");
    assert.equal(selectCalls, 0, "refused before the existing-email check");
  });
  it("lets a supply sign-up past the gate", async () => {
    const res = await register({ intent: "supply" });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /already exists/);
    assert.equal(selectCalls, 1);
  });
  it("an unknown intent is a traveler", async () => {
    const res = await register({ intent: "provider" });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, TRAVELER_WAITLIST);
  });
  it("with no launch market stated, the redirect is the home page — never a guessed city", async () => {
    settings.launch_market_slug = null;
    const res = await register();
    assert.equal(res.body.redirectTo, "/");
  });
});

describe("S3 — email register in open mode", () => {
  it("lets a traveler past the gate", async () => {
    settings.traveler_signup_mode = "open";
    const res = await register();
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /already exists/);
  });
});

describe("S4 — the QA code", () => {
  it("a matching code passes a waitlist-mode traveler", async () => {
    process.env.QA_SIGNUP_CODE = "qa-secret-123";
    const res = await register({ qaCode: "qa-secret-123" });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /already exists/);
  });
  it("a wrong code, an absent code and an unset secret all refuse", async () => {
    process.env.QA_SIGNUP_CODE = "qa-secret-123";
    assert.equal((await register({ qaCode: "qa-secret-12" })).statusCode, 403);
    assert.equal((await register({})).statusCode, 403);
    delete process.env.QA_SIGNUP_CODE;
    assert.equal((await register({ qaCode: "" })).statusCode, 403);
    assert.equal((await register({ qaCode: "anything" })).statusCode, 403);
  });
  it("the comparison never throws on a length mismatch and never matches an empty secret", () => {
    assert.equal(qaSignupCodeMatches("a", "a-much-longer-secret"), false);
    assert.equal(qaSignupCodeMatches("", ""), false);
    assert.equal(qaSignupCodeMatches(undefined, "x"), false);
    assert.equal(qaSignupCodeMatches("x", "x"), true);
  });
});

describe("S5 — existing accounts always sign in", () => {
  it("POST /api/auth/login never consults the switch", async () => {
    let modeRead = false;
    const prev = (db as any).execute;
    (db as any).execute = async (q: any) => {
      if (boundKey(q) === "traveler_signup_mode") modeRead = true;
      return prev(q);
    };
    (db as any).select = () => {
      const chain: any = { from: () => chain, where: () => chain, limit: () => chain, then: (f: any) => Promise.resolve([]).then(f) };
      return chain;
    };
    const res = mockRes();
    await handlers["POST /api/auth/login"]({ body: { email: "someone@traveloure-qa.test", password: "x" }, session: {} }, res);
    (db as any).execute = prev;
    assert.notEqual(res.statusCode, 403);
    assert.equal(modeRead, false);
  });
});

describe("S6 — the Ready-Made purchase gate", () => {
  const qaDomain = "traveloure-qa.test";
  it("waitlist mode refuses a traveler, passes an admin and a QA-tagged account", () => {
    assert.deepEqual(decideWaitlistPurchase({ mode: "waitlist", user: { role: "user", email: "t@example.com" }, qaDomain }), { allowed: false, code: TRAVELER_WAITLIST });
    assert.deepEqual(decideWaitlistPurchase({ mode: "waitlist", user: { role: "admin", email: "a@example.com" }, qaDomain }), { allowed: true });
    assert.deepEqual(decideWaitlistPurchase({ mode: "waitlist", user: { role: "user", email: "q@traveloure-qa.test" }, qaDomain }), { allowed: true });
    assert.deepEqual(decideWaitlistPurchase({ mode: "waitlist", user: { role: "user", email: "q@traveloure-qa.test" }, qaDomain: undefined }), { allowed: false, code: TRAVELER_WAITLIST });
    assert.deepEqual(decideWaitlistPurchase({ mode: "waitlist", user: null, qaDomain }), { allowed: false, code: TRAVELER_WAITLIST });
  });
  it("open mode passes everyone", () => {
    assert.deepEqual(decideWaitlistPurchase({ mode: "open", user: { role: "user", email: "t@example.com" }, qaDomain }), { allowed: true });
  });
});

describe("S7 — the pure rules", () => {
  it("decides, normalises and builds the path", () => {
    assert.deepEqual(decideFirstTimeSignup({ mode: "open", intent: "traveler", qaCodeValid: false }), { allowed: true });
    assert.deepEqual(decideFirstTimeSignup({ mode: "waitlist", intent: "supply", qaCodeValid: false }), { allowed: true });
    assert.deepEqual(decideFirstTimeSignup({ mode: "waitlist", intent: "traveler", qaCodeValid: true }), { allowed: true });
    assert.deepEqual(decideFirstTimeSignup({ mode: "waitlist", intent: "traveler", qaCodeValid: false }), { allowed: false, code: TRAVELER_WAITLIST });
    assert.equal(normalizeSignupIntent("supply"), "supply");
    assert.equal(normalizeSignupIntent("SUPPLY"), "traveler");
    assert.equal(normalizeSignupIntent(undefined), "traveler");
    assert.equal(parseTravelerSignupMode("open"), "open");
    assert.equal(parseTravelerSignupMode(undefined), "waitlist");
    assert.equal(waitlistBlockedPath("kyoto"), "/kyoto?blocked=1");
    assert.equal(waitlistBlockedPath("../evil"), "/");
    assert.equal(waitlistBlockedPath(null), "/");
  });
});

describe("S8 — Replit OIDC", () => {
  let created: any[] = [];
  beforeEach(() => {
    created = [];
    (global as any).fetch = async () => { throw new Error("network disabled in test"); };
    authStorage.getUser = async () => undefined as any;
    authStorage.getUserByEmail = async () => undefined as any;
    authStorage.upsertUser = async (u: any) => { created.push(u); return { ...u, isSuspended: false } as any; };
  });
  it("waitlist mode refuses a first-time traveler and creates nothing", async () => {
    await assert.rejects(() => upsertUser({ sub: "r-new-1" }), new RegExp(TRAVELER_WAITLIST));
    assert.equal(created.length, 0);
  });
  it("waitlist mode lets a first-time supply sign-up through", async () => {
    assert.equal(await upsertUser({ sub: "r-new-2" }, { intent: "supply" }), "r-new-2");
    assert.equal(created.length, 1);
  });
  it("open mode lets a first-time traveler through", async () => {
    settings.traveler_signup_mode = "open";
    assert.equal(await upsertUser({ sub: "r-new-3" }), "r-new-3");
  });
  it("an existing account signs in in waitlist mode", async () => {
    authStorage.getUser = async () => ({ id: "r-old", isSuspended: false }) as any;
    assert.equal(await upsertUser({ sub: "r-old" }), "r-old");
  });
});

describe("S9 — Facebook", () => {
  const profile: any = { id: "4242", displayName: "F B", emails: [{ value: "fb-new@traveloure-qa.test" }], photos: [], name: { givenName: "F" } };
  let created: any[] = [];
  beforeEach(() => {
    created = [];
    (global as any).fetch = async () => { throw new Error("network disabled in test"); };
    authStorage.getUser = async () => undefined as any;
    authStorage.getUserByEmail = async () => undefined as any;
    authStorage.upsertUser = async (u: any) => { created.push(u); return { ...u, isSuspended: false } as any; };
  });
  async function verify(intent?: "supply") {
    let out: any;
    await facebookVerify("t", "r", profile, (err, user, info) => { out = { err, user, info }; }, intent ? { intent } : {});
    return out;
  }
  it("waitlist mode refuses a first-time traveler and creates nothing", async () => {
    const out = await verify();
    assert.equal(out.user, false);
    assert.equal(out.info.code, TRAVELER_WAITLIST);
    assert.ok(!JSON.stringify(out.info).includes("@"), "the refusal carries no email");
    assert.equal(created.length, 0);
  });
  it("waitlist mode lets a first-time supply sign-up through, recorded as a Facebook account", async () => {
    const out = await verify("supply");
    assert.equal(out.user?.claims?.sub, "fb_4242");
    assert.equal(created[0]?.authProvider, "facebook");
  });
  it("open mode lets a first-time traveler through", async () => {
    settings.traveler_signup_mode = "open";
    const out = await verify();
    assert.equal(out.user?.claims?.sub, "fb_4242");
  });
  it("an existing Facebook account signs in in waitlist mode", async () => {
    authStorage.getUser = async (id: string) => (id === "fb_4242" ? { id, email: "x@y.z", isSuspended: false } : undefined) as any;
    const out = await verify();
    assert.equal(out.user?.claims?.sub, "fb_4242");
  });
});

describe("S10 — the session stash", () => {
  it("carries intent and a same-site return path, and taking it clears it", () => {
    const req: any = { query: { intent: "supply", returnTo: "/become-expert?type=local_expert" }, session: {} };
    stashSignupIntent(req, 1_000);
    assert.equal(readSignupIntent(req, 2_000), "supply");
    assert.equal(takeStashedReturnTo(req, 2_000), "/become-expert?type=local_expert");
    assert.equal(readSignupIntent(req, 2_000), "traveler");
    assert.equal(takeStashedReturnTo(req, 2_000), null);
  });
  it("an open redirect is dropped, an unknown intent is a traveler, a stale stash reads as nothing", () => {
    const req: any = { query: { intent: "admin", returnTo: "//evil.example/x" }, session: {} };
    stashSignupIntent(req, 1_000);
    assert.equal(readSignupIntent(req, 1_000), "traveler");
    assert.equal(takeStashedReturnTo(req, 1_000), null);
    const stale: any = { query: { intent: "supply", returnTo: "/x" }, session: {} };
    stashSignupIntent(stale, 0);
    assert.equal(readSignupIntent(stale, OAUTH_STATE_TTL_MS + 1), "traveler");
    assert.equal(readSignupIntent({ session: {} }, 0), "traveler");
  });
});
