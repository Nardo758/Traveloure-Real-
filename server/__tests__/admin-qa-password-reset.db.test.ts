/**
 * Real HTTP + PostgreSQL proof, PRIVATE LOCAL DATABASE ONLY.
 * No real credentials, provider calls, recipient delivery or production sessions.
 */
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.NODE_ENV !== "test" || url.hostname !== "127.0.0.1"
  || !url.pathname.startsWith("/qa_admin_reset")) {
  throw new Error("QA reset proof requires its dedicated local disposable database");
}
delete process.env.RESEND_API_KEY;
process.env.EMAIL_SENDS_ENABLED = "false";
process.env.QA_ACCOUNT_EMAIL_DOMAIN = "traveloure-qa.test";
const { db, pool, backgroundPool } = await import("../db");
const { users, passwordResetTokens } = await import("../../shared/models/auth");
const { accessAuditLogs } = await import("../../shared/schema");
const { eq } = await import("drizzle-orm");
const { hashPassword } = await import("../replit_integrations/auth/emailAuth");
const { verifyLoginCredential } = await import("../services/login-credentials.service");
const { issuePasswordResetToken, consumePasswordResetToken, resetQaPasswordAsAdmin } =
  await import("../services/password-reset-tokens.service");
const { _passwordChangedNoticeTestHooks } = await import("../services/email.service");
const { default: router } = await import("../routes/admin.routes");

const fixtureIds: string[] = [];
const sessionIds: string[] = [];
const notices: Record<string, any>[] = [];
let server: http.Server;
let base: string;
const Store = connectPgSimple(session);
const store = new Store({ pool, tableName: "sessions", createTableIfMissing: true, pruneSessionInterval: false });
const secret = () => crypto.randomBytes(24).toString("base64url");
let admin: Awaited<ReturnType<typeof account>>;
let target: Awaited<ReturnType<typeof account>>;

async function account(overrides: Partial<typeof users.$inferInsert> = {}) {
  const password = secret();
  const id = crypto.randomUUID();
  fixtureIds.push(id);
  const [user] = await db.insert(users).values({
    id, email: `${crypto.randomUUID()}@example.test`, role: "user",
    password: await hashPassword(password), emailVerified: new Date(), isTest: true,
    ...overrides,
  }).returning();
  return { ...user, plainPassword: password };
}
async function addSession(userId: string, shape: "id" | "claims") {
  const sid = `qa-reset-${crypto.randomUUID()}`;
  sessionIds.push(sid);
  await new Promise<void>((resolve, reject) => store.set(sid, {
    cookie: { maxAge: 60_000 } as any,
    passport: { user: shape === "id" ? { id: userId } : { claims: { sub: userId } } },
  } as any, (err) => err ? reject(err) : resolve()));
  return sid;
}
async function request(actorId: string | null, body: unknown, targetId = target.id) {
  const response = await fetch(`${base}/api/admin/users/${targetId}/qa-password-reset`, {
    method: "POST", headers: {
      "Content-Type": "application/json", ...(actorId ? { "x-fixture-actor": actorId } : {}),
    }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function passwordMatches(userId: string, password: string) {
  const [row] = await db.select({ password: users.password }).from(users).where(eq(users.id, userId));
  return verifyLoginCredential(password, row?.password ?? null);
}
async function auditCount(userId: string) {
  const r = await pool.query("SELECT count(*)::int n FROM access_audit_logs WHERE target_user_id=$1 AND action='reset_qa_password'", [userId]);
  return r.rows[0].n as number;
}

before(async () => {
  _passwordChangedNoticeTestHooks.enqueueEmail = async (payload) => { notices.push(payload); };
  const app = express();
  app.use(express.json());
  // A test-only session fixture. The actual router's DB-backed auth/admin guards still run.
  app.use((req: any, _res, next) => {
    const actorId = req.get("x-fixture-actor");
    req.isAuthenticated = () => Boolean(actorId);
    req.user = actorId ? { id: actorId } : undefined;
    req.logout = (done: () => void) => done();
    next();
  });
  app.use(router);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
beforeEach(async () => {
  notices.length = 0;
  admin = await account({ role: "admin", isTest: false });
  target = await account();
});
after(async () => {
  delete _passwordChangedNoticeTestHooks.enqueueEmail;
  await pool.query("ALTER TABLE access_audit_logs DROP CONSTRAINT IF EXISTS qa_reset_forced_failure");
  for (const sid of sessionIds) await pool.query("DELETE FROM sessions WHERE sid=$1", [sid]);
  for (const id of fixtureIds) await db.delete(users).where(eq(users.id, id));
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  }
  await store.close();
  await Promise.all([pool.end(), backgroundPool.end()]);
});

describe("QA-only admin credential recovery", { concurrency: false }, () => {
  it("success changes only the target credential, revokes both session shapes and reset links, audits and queues one secret-free notice", async () => {
    const unrelated = await account();
    const oldLink = await issuePasswordResetToken(target.id);
    const ownSessions = await Promise.all([addSession(target.id, "id"), addSession(target.id, "claims")]);
    const otherSession = await addSession(unrelated.id, "id");
    const nextPassword = secret();
    const r = await request(admin.id, { adminPassword: admin.plainPassword, newPassword: nextPassword });
    assert.equal(r.status, 200);
    assert.equal(await passwordMatches(target.id, nextPassword), true);
    assert.equal(await passwordMatches(target.id, target.plainPassword), false);
    assert.equal(await passwordMatches(unrelated.id, unrelated.plainPassword), true);
    assert.equal(await consumePasswordResetToken(oldLink.raw, await hashPassword(secret())), false);
    const sessions = await pool.query("SELECT sid FROM sessions WHERE sid=ANY($1::text[])", [[...ownSessions, otherSession]]);
    assert.deepEqual(sessions.rows.map((row) => row.sid), [otherSession]);
    const [persisted] = await db.select().from(users).where(eq(users.id, target.id));
    for (const key of ["email", "role", "emailVerified", "isTest", "isDeleted", "isSuspended"] as const) {
      assert.deepEqual(persisted[key], target[key]);
    }
    const audits = await db.select().from(accessAuditLogs).where(eq(accessAuditLogs.targetUserId, target.id));
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "reset_qa_password");
    assert.equal(notices.length, 1);
    assert.equal(notices[0].emailType, "password_changed");
    assert.equal(notices[0].metadata.dedupeKey, `password_changed:${audits[0].id}`);
    const publicText = JSON.stringify({ response: r.body, audit: audits[0], notice: notices[0] });
    for (const sensitive of [nextPassword, admin.plainPassword, target.plainPassword, oldLink.raw]) {
      assert.equal(publicText.includes(sensitive), false, "secret must not escape");
    }
    assert.doesNotMatch(notices[0].html + notices[0].text, /href=|https?:\/\//);
  });

  it("refuses logged-out and non-admin callers with no credential, audit or notice change", async () => {
    for (const actor of [null, target.id]) {
      const r = await request(actor, { adminPassword: target.plainPassword, newPassword: secret() });
      assert.ok(r.status === 401 || r.status === 403);
    }
    assert.equal(await passwordMatches(target.id, target.plainPassword), true);
    assert.equal(await auditCount(target.id), 0);
    assert.equal(notices.length, 0);
  });

  it("refuses wrong or absent admin passwords, malformed bodies and unknown targets without writes", async () => {
    for (const body of [
      { adminPassword: secret(), newPassword: secret() },
      { newPassword: secret() },
      { adminPassword: admin.plainPassword, newPassword: "short" },
      { adminPassword: admin.plainPassword, newPassword: secret(), isTest: true },
    ]) {
      const r = await request(admin.id, body);
      assert.ok(r.status === 400 || r.status === 403);
    }
    assert.equal((await request(admin.id, {
      adminPassword: admin.plainPassword, newPassword: secret(),
    }, crypto.randomUUID())).status, 403);
    assert.equal(await passwordMatches(target.id, target.plainPassword), true);
    assert.equal(await auditCount(target.id), 0);
    assert.equal(notices.length, 0);
  });

  it("refuses suspended, deleted and provider-only admins under the service lock", async () => {
    for (const overrides of [{ isSuspended: true }, { isDeleted: true }, { password: null }]) {
      const actor = await account({ role: "admin", ...overrides });
      const result = await resetQaPasswordAsAdmin({
        adminId: actor.id, targetId: target.id,
        adminPassword: actor.plainPassword, hashedPassword: await hashPassword(secret()),
      });
      assert.deepEqual(result, { ok: false });
      assert.equal((await request(actor.id, {
        adminPassword: actor.plainPassword, newPassword: secret(),
      })).status, 403);
    }
    assert.equal(await passwordMatches(target.id, target.plainPassword), true);
    assert.equal(await auditCount(target.id), 0);
    assert.equal(notices.length, 0);
  });

  it("refuses real customers, admin targets, deleted/suspended targets and provider-only targets", async () => {
    for (const overrides of [
      { isTest: false }, { role: "admin" }, { isDeleted: true }, { isSuspended: true },
      { password: null }, { email: null },
    ]) {
      const blocked = await account(overrides);
      assert.equal((await request(admin.id, {
        adminPassword: admin.plainPassword, newPassword: secret(),
      }, blocked.id)).status, 403);
      assert.equal(await auditCount(blocked.id), 0);
      const [persisted] = await db.select({ password: users.password }).from(users).where(eq(users.id, blocked.id));
      assert.equal(persisted.password, blocked.password);
    }
    assert.equal(notices.length, 0);
  });

  it("reuses the configured QA-domain rule without changing test flags", async () => {
    const qa = await account({ isTest: false, email: `${crypto.randomUUID()}@traveloure-qa.test` });
    assert.equal((await request(admin.id, {
      adminPassword: admin.plainPassword, newPassword: secret(),
    }, qa.id)).status, 200);
    const [persisted] = await db.select({ isTest: users.isTest }).from(users).where(eq(users.id, qa.id));
    assert.equal(persisted.isTest, false);
  });

  it("forced audit failure rolls password, link revocation and session deletion back together", async () => {
    const link = await issuePasswordResetToken(target.id);
    const sid = await addSession(target.id, "id");
    const failedPassword = secret();
    await pool.query("ALTER TABLE access_audit_logs ADD CONSTRAINT qa_reset_forced_failure CHECK (action <> 'reset_qa_password') NOT VALID");
    try {
      const r = await request(admin.id, { adminPassword: admin.plainPassword, newPassword: failedPassword });
      assert.equal(r.status, 500);
      assert.deepEqual(r.body, { message: "Password reset could not be confirmed. Check the account before retrying." });
      assert.equal(await passwordMatches(target.id, target.plainPassword), true);
      assert.equal(await passwordMatches(target.id, failedPassword), false);
      assert.equal((await pool.query("SELECT count(*)::int n FROM sessions WHERE sid=$1", [sid])).rows[0].n, 1);
      const [token] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, target.id));
      assert.equal(token.usedAt, null);
      assert.equal(await auditCount(target.id), 0);
      assert.equal(notices.length, 0);
    } finally {
      await pool.query("ALTER TABLE access_audit_logs DROP CONSTRAINT qa_reset_forced_failure");
    }
    assert.equal(await consumePasswordResetToken(link.raw, await hashPassword(secret())), true);
  });

  it("concurrent requests serialize and leave one valid final credential with both commits audited", async () => {
    const passwords = [secret(), secret()];
    const results = await Promise.all(passwords.map((newPassword) => request(admin.id, {
      adminPassword: admin.plainPassword, newPassword,
    })));
    assert.deepEqual(results.map((r) => r.status), [200, 200]);
    const matches = await Promise.all(passwords.map((p) => passwordMatches(target.id, p)));
    assert.equal(matches.filter(Boolean).length, 1);
    assert.equal(await auditCount(target.id), 2);
    assert.equal(notices.length, 2);
    assert.equal(new Set(notices.map((n) => n.metadata.dedupeKey)).size, 2);
    assert.equal(await passwordMatches(target.id, target.plainPassword), false);
  });
});
