/**
 * AUTH-1 Finding B — a new password-reset request revokes every earlier link, and issuing and using a
 * link lock the account in the same order (server/services/password-reset-tokens.service.ts).
 * The proposal's five reset cases, R1–R5.
 *
 * AUTH-1 fix 3b — the neutral sign-up response (shared/registration-neutral.ts), N1–N6: a new and an
 * existing address get the same 202 and body, with no id, email or session; only a new address writes
 * anything; a lost unique-email race is a duplicate and any other fault is a 500; the pre-existing
 * session is left alone; both paths hash the password once. Needs traveler sign-up OPEN (CI opens it).
 *
 * DISPOSABLE DB ONLY: refuses anything but a local database. Every row it writes it creates and deletes.
 * Transport stubbed: RESEND_API_KEY is removed for the run, so no email leaves the process.
 *
 *   NODE_ENV=test SESSION_COOKIE_INSECURE=1 npx tsx --test --test-force-exit server/__tests__/auth-three-defects.db.test.ts
 */
import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import passport from "passport";

delete process.env.RESEND_API_KEY;
process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { db, pool } = await import("../db");
const { and, eq, inArray, isNull } = await import("drizzle-orm");
const { users, passwordResetTokens } = await import("../../shared/models/auth");
const {
  issuePasswordResetToken, consumePasswordResetToken, hashAuthToken, _resetTokenTestHooks,
} = await import("../services/password-reset-tokens.service");
const { getSession } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth, isEmailUniqueViolation } = await import("../replit_integrations/auth/emailAuth");
const { emailVerificationTokens } = await import("../../shared/models/auth");
const { emailOutbox } = await import("../../shared/schema");
const { REGISTRATION_NEUTRAL_CODE, REGISTRATION_NEUTRAL_MESSAGE } = await import("../../shared/registration-neutral");
const { sql } = await import("drizzle-orm");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  const r = await pool.query("SELECT inet_server_addr()::text AS addr");
  const addr: string | null = r.rows[0]?.addr ?? null;
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; } })();
  const ok = (host !== null && DISPOSABLE_HOSTS.has(host)) || addr === null || DISPOSABLE_HOSTS.has(addr.split("/")[0]);
  if (!ok) throw new Error(`auth-three-defects refuses a non-local database (${host ?? "unknown host"})`);
}

const fixtureIds: string[] = [];
const sessionIds: string[] = [];
async function account(opts: { password?: string | null } = {}) {
  const id = crypto.randomUUID();
  fixtureIds.push(id);
  await db.insert(users).values({
    id, email: `auth1-${id}@traveloure-qa.test`, firstName: "Reset", lastName: "Fixture", role: "user",
    password: opts.password === undefined ? "old-hash" : opts.password,
  } as any);
  return id;
}
async function password(id: string) {
  const [u] = await db.select({ password: users.password }).from(users).where(eq(users.id, id));
  return u?.password;
}
async function unusedTokens(id: string) {
  return db.select({ id: passwordResetTokens.id }).from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, id), isNull(passwordResetTokens.usedAt)));
}
async function session(userId: string) {
  const sid = `auth1-${crypto.randomUUID()}`;
  sessionIds.push(sid);
  await pool.query(`INSERT INTO sessions (sid, sess, expire) VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
    [sid, JSON.stringify({ cookie: {}, passport: { user: { claims: { sub: userId } } } })]);
  return sid;
}
async function sessionExists(sid: string) {
  return (await pool.query(`SELECT 1 FROM sessions WHERE sid = $1`, [sid])).rowCount === 1;
}
function gate() {
  let open!: () => void, entered!: () => void;
  const wait = new Promise<void>(r => { open = r; });
  const reached = new Promise<void>(r => { entered = r; });
  return { open, reached, hook: async () => { entered(); await wait; } };
}

let server: http.Server;
let base = "";
async function post(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as any };
}

describe("AUTH-1 Finding B: reset links", () => {
  before(async () => {
    assert.equal(process.env.NODE_ENV, "test");
    await assertDisposableDb();
    const app = express();
    app.use(express.json());
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());
    passport.serializeUser((user: any, cb) => cb(null, user));
    passport.deserializeUser((user: any, cb) => cb(null, user));
    setupEmailAuth(app);
    server = http.createServer(app);
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterEach(() => {
    delete _resetTokenTestHooks.afterRevoke;
    delete _resetTokenTestHooks.afterAccountLock;
    delete _resetTokenTestHooks.afterPasswordWrite;
  });
  after(async () => {
    await new Promise<void>(r => server?.close(() => r()));
    if (sessionIds.length) await pool.query(`DELETE FROM sessions WHERE sid = ANY($1)`, [sessionIds]);
    for (const id of fixtureIds) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("R1: request A then B — A no longer works, B works once, B's replay fails", async () => {
    const id = await account();
    const a = await issuePasswordResetToken(id);
    const b = await issuePasswordResetToken(id);
    assert.equal(await consumePasswordResetToken(a.raw, "hash-a"), false);
    assert.equal(await password(id), "old-hash");
    assert.equal(await consumePasswordResetToken(b.raw, "hash-b"), true);
    assert.equal(await password(id), "hash-b");
    assert.equal(await consumePasswordResetToken(b.raw, "hash-b2"), false);
    assert.equal(await password(id), "hash-b");
    // The route answers the revoked link with its existing generic message.
    const c = await issuePasswordResetToken(id);
    await issuePasswordResetToken(id);
    const res = await post("/api/auth/reset-password", { token: c.raw, newPassword: "longenough1" });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /invalid or has expired/);
  });

  it("R2: two simultaneous requests leave exactly one usable link — the last to commit", async () => {
    const id = await account();
    const [x, y] = await Promise.all([issuePasswordResetToken(id), issuePasswordResetToken(id)]);
    assert.equal((await unusedTokens(id)).length, 1);
    const [unused] = await db.select({ tokenHash: passwordResetTokens.tokenHash }).from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, id), isNull(passwordResetTokens.usedAt)));
    const winner = hashAuthToken(x.raw) === unused.tokenHash ? x : y;
    const loser = winner === x ? y : x;
    assert.equal(await consumePasswordResetToken(loser.raw, "hash-loser"), false);
    assert.equal(await consumePasswordResetToken(winner.raw, "hash-winner"), true);
    assert.equal(await password(id), "hash-winner");
  });

  it("R3: using an old link while a new one is issued — both orders, no half state, no deadlock", async () => {
    // (a) Use first: it holds the account; the new request waits, then revokes nothing usable.
    const id = await account();
    const old = await issuePasswordResetToken(id);
    const g = gate();
    _resetTokenTestHooks.afterAccountLock = g.hook;
    const using = consumePasswordResetToken(old.raw, "hash-used-first");
    await g.reached;
    delete _resetTokenTestHooks.afterAccountLock;
    const issuing = issuePasswordResetToken(id);
    await new Promise(r => setTimeout(r, 150));
    g.open();
    assert.equal(await using, true);
    const fresh = await issuing;
    assert.equal(await password(id), "hash-used-first");
    assert.equal(await consumePasswordResetToken(fresh.raw, "hash-fresh"), true, "the new link still works");

    // (b) Issue first: it holds the account; the old link waits, then finds itself revoked.
    const id2 = await account();
    const old2 = await issuePasswordResetToken(id2);
    const g2 = gate();
    _resetTokenTestHooks.afterRevoke = g2.hook;
    const issuing2 = issuePasswordResetToken(id2);
    await g2.reached;
    delete _resetTokenTestHooks.afterRevoke;
    const using2 = consumePasswordResetToken(old2.raw, "hash-should-not-land");
    await new Promise(r => setTimeout(r, 150));
    g2.open();
    const fresh2 = await issuing2;
    assert.equal(await using2, false);
    assert.equal(await password(id2), "old-hash");
    assert.equal(await consumePasswordResetToken(fresh2.raw, "hash-fresh2"), true);
  });

  it("R4: a failure part-way through either transaction rolls the whole of it back", async () => {
    // Issuance fails after revoking: the earlier link stays valid and no new link exists.
    const id = await account();
    const earlier = await issuePasswordResetToken(id);
    _resetTokenTestHooks.afterRevoke = async () => { throw new Error("forced issuance failure"); };
    await assert.rejects(issuePasswordResetToken(id), /forced issuance failure/);
    delete _resetTokenTestHooks.afterRevoke;
    assert.equal((await unusedTokens(id)).length, 1);
    // Use fails after the password write: claim, password and sessions all roll back.
    const sid = await session(id);
    _resetTokenTestHooks.afterPasswordWrite = async () => { throw new Error("forced password failure"); };
    await assert.rejects(consumePasswordResetToken(earlier.raw, "hash-rolled-back"), /forced password failure/);
    delete _resetTokenTestHooks.afterPasswordWrite;
    assert.equal(await password(id), "old-hash");
    assert.equal((await unusedTokens(id)).length, 1, "the claim rolled back with the password");
    assert.equal(await sessionExists(sid), true);
    // And the same link then works, ending the session.
    assert.equal(await consumePasswordResetToken(earlier.raw, "hash-final"), true);
    assert.equal(await sessionExists(sid), false);
  });

  it("R5: other accounts are untouched; expiry and the neutral answers stay as they were", async () => {
    const a = await account(), b = await account();
    const bLink = await issuePasswordResetToken(b);
    const bSession = await session(b);
    const aLink = await issuePasswordResetToken(a);
    await issuePasswordResetToken(a);
    assert.equal((await unusedTokens(b)).length, 1, "a new link for A revokes nothing of B's");
    const aSession = await session(a);
    const aLatest = await issuePasswordResetToken(a);
    assert.equal(await consumePasswordResetToken(aLatest.raw, "hash-a"), true);
    assert.equal(await sessionExists(aSession), false);
    assert.equal(await sessionExists(bSession), true, "A's reset ends only A's sessions");
    assert.equal(await password(b), "old-hash");
    assert.equal(await consumePasswordResetToken(aLink.raw, "hash-a-old"), false);
    // An expired link fails even though nothing revoked it.
    await db.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(passwordResetTokens.tokenHash, hashAuthToken(bLink.raw)));
    assert.equal(await consumePasswordResetToken(bLink.raw, "hash-b"), false);
    // Unknown and OAuth-only addresses get the same 200 as a real one, and no link is made for them.
    const oauthOnly = await account({ password: null });
    const known = await post("/api/auth/forgot-password", { email: `auth1-${b}@traveloure-qa.test` });
    const unknown = await post("/api/auth/forgot-password", { email: `auth1-${crypto.randomUUID()}@traveloure-qa.test` });
    const oauth = await post("/api/auth/forgot-password", { email: `auth1-${oauthOnly}@traveloure-qa.test` });
    for (const r of [known, unknown, oauth]) {
      assert.equal(r.status, 200);
      assert.equal(r.body.message, known.body.message);
    }
    assert.equal((await unusedTokens(oauthOnly)).length, 0);
    assert.equal((await unusedTokens(b)).length, 1, "the real request issued one new link for B");
  });
});

// ─── AUTH-1 fix 3b: the neutral sign-up response ─────────────────────────────────────────────────────────────

describe("AUTH-1 fix 3b: neutral registration", () => {
  let app3: http.Server;
  let base3 = "";
  const signupModeKey = "traveler_signup_mode";
  let modeFixture: { table: string; previous: string | null; publicDigest: string | null } | undefined;
  const emails: string[] = [];
  const PASSWORD = "longenough-pass1";
  const origTransaction = (db as any).transaction;
  const origScrypt = crypto.scrypt;
  let scryptCalls = 0;

  function addr(label: string) {
    const e = `auth1-3b-${label}-${crypto.randomUUID()}@traveloure-qa.test`;
    emails.push(e);
    return e;
  }
  async function register(email: string, cookie?: string) {
    const res = await fetch(`${base3}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ email, password: PASSWORD, firstName: "Neutral", lastName: "Fixture" }),
    });
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text), setCookie: res.headers.get("set-cookie") };
  }
  async function login(email: string) {
    const res = await fetch(`${base3}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    return res.headers.get("set-cookie")!.split(";")[0];
  }
  async function whoAmI(cookie: string | null | undefined) {
    const res = await fetch(`${base3}/api/auth/user-probe`, { headers: cookie ? { cookie } : {} });
    return res.status === 200 ? ((await res.json()) as { sub: string | null }).sub : null;
  }
  async function accountsFor(email: string) {
    return db.select().from(users).where(eq(users.email, email));
  }
  async function welcomesFor(userId: string) {
    return db.select({ id: emailOutbox.id }).from(emailOutbox)
      .where(sql`${emailOutbox.emailType} = 'signup_welcome' AND ${emailOutbox.metadata}->>'signupAccountId' = ${userId}`);
  }
  async function verificationTokensFor(userId: string) {
    return db.select({ id: emailVerificationTokens.id }).from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
  }
  /** issueEmailVerification is fire-and-forget after the response: wait (by reads) for its row. */
  async function awaitVerificationToken(userId: string) {
    for (let i = 0; i < 200; i += 1) {
      if ((await verificationTokensFor(userId)).length > 0) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.fail(`no verification token for ${userId}`);
  }

  before(async () => {
    assert.equal(process.env.NODE_ENV, "test");
    await assertDisposableDb();
    const identity = await pool.query("SELECT current_schema() AS schema, current_database() AS database");
    const { schema, database } = identity.rows[0];
    const ownedSchema = typeof schema === "string" && /^automation_msg_[a-f0-9]{16}$/.test(schema);
    // The existing GitHub job owns its local postgres service's public schema.
    // A workspace/shared public schema is never an eligible fixture target.
    const url = new URL(process.env.DATABASE_URL!);
    const ownedCiDatabase = process.env.GITHUB_ACTIONS === "true" && process.env.CI === "true"
      && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
      && url.pathname === "/traveloure" && database === "traveloure" && schema === "public";
    assert.ok(ownedSchema || ownedCiDatabase, "Signup setup requires an owned messaging schema or the dedicated GitHub postgres service");
    const table = `"${schema}"."platform_settings"`;
    const previous = await pool.query(`SELECT setting_value FROM ${table} WHERE setting_key = $1`, [signupModeKey]);
    const publicBefore = ownedSchema
      ? await pool.query("SELECT md5(row_to_json(s)::text) AS digest FROM public.platform_settings s WHERE setting_key = $1", [signupModeKey])
      : null;
    modeFixture = { table, previous: previous.rows[0]?.setting_value ?? null, publicDigest: publicBefore?.rows[0]?.digest ?? null };
    await pool.query(`INSERT INTO ${table} (setting_key, setting_value) VALUES ($1, $2)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`, [signupModeKey, "open"]);
    invalidatePlatformFlagCache(signupModeKey);
    console.log("[auth-fixture] owned signup mode configured: 1");
    (crypto as any).scrypt = (...args: unknown[]) => { scryptCalls += 1; return (origScrypt as any)(...args); };
    const app = express();
    app.use(express.json());
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());
    passport.serializeUser((user: any, cb) => cb(null, user));
    passport.deserializeUser((user: any, cb) => cb(null, user));
    setupEmailAuth(app);
    // Test-only read of who the session says is signed in.
    app.get("/api/auth/user-probe", (req: any, res) => res.json({ sub: req.user?.claims?.sub ?? null }));
    app3 = http.createServer(app);
    await new Promise<void>(r => app3.listen(0, "127.0.0.1", r));
    base3 = `http://127.0.0.1:${(app3.address() as any).port}`;
  });
  afterEach(() => { (db as any).transaction = origTransaction; });
  after(async () => {
    (crypto as any).scrypt = origScrypt;
    try {
      if (app3) await new Promise<void>(r => app3.close(() => r()));
      // Let the fire-and-forget verification/welcome work settle before deleting what it touches.
      await new Promise((r) => setTimeout(r, 300));
      const rows = emails.length ? await db.select({ id: users.id }).from(users).where(inArray(users.email, emails)) : [];
      for (const { id } of rows) {
        await db.delete(emailOutbox).where(sql`${emailOutbox.metadata}->>'signupAccountId' = ${id}`);
        await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));
        await pool.query(`DELETE FROM sessions WHERE sess::text LIKE $1`, [`%${id}%`]);
        await db.delete(users).where(eq(users.id, id));
      }
    } finally {
      if (modeFixture) {
        if (modeFixture.previous === null) {
          await pool.query(`DELETE FROM ${modeFixture.table} WHERE setting_key = $1`, [signupModeKey]);
        } else {
          await pool.query(`UPDATE ${modeFixture.table} SET setting_value = $2 WHERE setting_key = $1`, [signupModeKey, modeFixture.previous]);
        }
        invalidatePlatformFlagCache(signupModeKey);
        if (modeFixture.table !== '"public"."platform_settings"') {
          const publicAfter = await pool.query("SELECT md5(row_to_json(s)::text) AS digest FROM public.platform_settings s WHERE setting_key = $1", [signupModeKey]);
          assert.equal(publicAfter.rows[0]?.digest ?? null, modeFixture.publicDigest, "Shared signup setting must remain unchanged");
          console.log("[auth-fixture] shared signup setting unchanged: 1");
        }
        console.log("[auth-fixture] owned signup mode restored: 1");
      }
    }
  });

  it("N1: a new and an existing address get the same status and body, with no id, email or session", async () => {
    const fresh = addr("n1-new");
    const first = await register(fresh);
    const again = await register(fresh);
    for (const r of [first, again]) {
      assert.equal(r.status, 202, r.text);
      assert.deepEqual(r.body, { code: REGISTRATION_NEUTRAL_CODE, message: REGISTRATION_NEUTRAL_MESSAGE });
      assert.ok(!r.text.includes(fresh), "the body never echoes the address");
      assert.equal(await whoAmI(r.setCookie?.split(";")[0]), null, "registering signs nobody in");
    }
    const [account] = await accountsFor(fresh);
    assert.ok(account, "the new address made an account");
    assert.ok(!first.text.includes(account.id), "the body never carries the user id");
    // The account signs in through the ordinary login.
    assert.equal(await whoAmI(await login(fresh)), account.id);
  });

  it("N2: only a new address writes; a duplicate changes nothing on the existing account", async () => {
    const email = addr("n2");
    await register(email);
    const [before] = await accountsFor(email);
    await awaitVerificationToken(before.id);
    assert.equal((await welcomesFor(before.id)).length, 1, "the new account has one welcome obligation");
    const tokensBefore = (await verificationTokensFor(before.id)).length;

    const dup = await fetch(`${base3}/api/auth/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.toUpperCase(), password: "a-different-pass9", firstName: "Other", lastName: "Name" }),
    });
    assert.equal(dup.status, 202);
    await new Promise((r) => setTimeout(r, 200));
    const after = await accountsFor(email);
    assert.equal(after.length, 1);
    for (const k of ["id", "password", "firstName", "lastName", "role", "emailVerified"] as const) {
      assert.deepEqual(after[0][k], before[k], `duplicate left ${k} unchanged`);
    }
    assert.equal((await welcomesFor(before.id)).length, 1, "no second welcome");
    assert.equal((await verificationTokensFor(before.id)).length, tokensBefore, "no new verification email");
  });

  it("N3: concurrent sign-ups for one new address make one account and one welcome, all answered neutrally", async () => {
    const email = addr("n3");
    const results = await Promise.all(Array.from({ length: 8 }, () => register(email)));
    for (const r of results) {
      assert.equal(r.status, 202, r.text);
      assert.deepEqual(r.body, { code: REGISTRATION_NEUTRAL_CODE, message: REGISTRATION_NEUTRAL_MESSAGE });
    }
    const rows = await accountsFor(email);
    assert.equal(rows.length, 1);
    assert.equal((await welcomesFor(rows[0].id)).length, 1);
  });

  it("N4: a lost unique-email race is a duplicate; any other fault is a 500 and writes nothing", async () => {
    // The race, made deterministic: the insert reports the users.email unique index.
    const raced = addr("n4-race");
    (db as any).transaction = async () => {
      const driver = Object.assign(new Error("duplicate key"), { code: "23505", constraint: "users_email_unique" });
      throw Object.assign(new Error("Failed query"), { cause: driver });
    };
    const r1 = await register(raced);
    assert.equal(r1.status, 202, r1.text);
    assert.deepEqual(r1.body, { code: REGISTRATION_NEUTRAL_CODE, message: REGISTRATION_NEUTRAL_MESSAGE });

    // A different unique index, or any other fault, is not a duplicate sign-up.
    for (const fault of [
      Object.assign(new Error("duplicate key"), { code: "23505", constraint: "users_handle_unique" }),
      new Error("connection reset"),
    ]) {
      const email = addr("n4-fault");
      (db as any).transaction = async () => { throw fault; };
      const r = await register(email);
      assert.equal(r.status, 500, r.text);
      assert.notEqual(r.body.code, REGISTRATION_NEUTRAL_CODE);
      assert.equal((await accountsFor(email)).length, 0);
    }

    // The predicate itself.
    assert.equal(isEmailUniqueViolation({ code: "23505", constraint: "users_email_unique" }), true);
    assert.equal(isEmailUniqueViolation({ message: "x", cause: { code: "23505", constraint: "users_email_unique" } }), true);
    assert.equal(isEmailUniqueViolation({ code: "23505", constraint: "users_handle_unique" }), false);
    assert.equal(isEmailUniqueViolation({ code: "23503", constraint: "users_email_unique" }), false);
    assert.equal(isEmailUniqueViolation(new Error("plain")), false);
    assert.equal(isEmailUniqueViolation(null), false);
  });

  it("N5: a session that existed before registering is left as it was", async () => {
    const existing = addr("n5-signed-in");
    await register(existing);
    const cookie = await login(existing);
    const [me] = await accountsFor(existing);
    const other = addr("n5-other");
    const r = await register(other, cookie);
    assert.equal(r.status, 202);
    assert.equal(r.setCookie, null, "registering does not issue a new session cookie");
    assert.equal(await whoAmI(cookie), me.id, "still signed in as the same account");
  });

  it("N6: a new and an existing address both hash the password once; timings recorded", async () => {
    const email = addr("n6");
    scryptCalls = 0;
    let t = performance.now();
    assert.equal((await register(email)).status, 202);
    const newMs = performance.now() - t;
    const newCalls = scryptCalls;
    scryptCalls = 0;
    t = performance.now();
    assert.equal((await register(email)).status, 202);
    const dupMs = performance.now() - t;
    assert.equal(newCalls, 1, "a new address hashes once");
    assert.equal(scryptCalls, 1, "an existing address hashes once too");
    // Recorded, not asserted: the proposal does not claim constant-time network behaviour.
    console.log(`[auth1-3b] N6 timings: new ${newMs.toFixed(1)} ms, existing ${dupMs.toFixed(1)} ms`);
  });
});
