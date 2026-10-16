/**
 * AUTH-1 Finding B — a new password-reset request revokes every earlier link, and issuing and using a
 * link lock the account in the same order (server/services/password-reset-tokens.service.ts).
 * The proposal's five reset cases, R1–R5. Fix 3 (the neutral sign-up response) is not built, so this
 * file carries no sign-up cases.
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
const { and, eq, isNull } = await import("drizzle-orm");
const { users, passwordResetTokens } = await import("../../shared/models/auth");
const {
  issuePasswordResetToken, consumePasswordResetToken, hashAuthToken, _resetTokenTestHooks,
} = await import("../services/password-reset-tokens.service");
const { getSession } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");

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
