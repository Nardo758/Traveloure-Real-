/**
 * Opt-in development integration evidence. No production access, no real sends,
 * no borrowed fixtures. Each loop creates NEW randomized accounts, asserts actual
 * DB rows and invokes the real HTTP routes and outbox pipeline.
 *
 * RUN_AUTH_JOURNEY_DB_TESTS=1 NODE_ENV=test npx tsx --test --test-concurrency=1 server/__tests__/signup-journey.db.test.ts
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import crypto from "node:crypto";
import express from "express";
import session from "express-session";
import passport from "passport";
import type { Server } from "node:http";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { users, emailVerificationTokens } from "@shared/models/auth";
import { emailOutbox } from "@shared/schema";
import { setupEmailAuth } from "../replit_integrations/auth/emailAuth";
import { _outboxTestHooks, deliverQueuedEmail } from "../services/email-outbox.service";
import { completeSignupVerification, issueSignupVerification } from "../services/signup-journey.service";
import { REMINDER_DELAYS, SIGNUP_PUBLIC_RESPONSE } from "../services/signup-email-payloads";
import { reminderIds } from "../automations/messaging/signup-definition";
import type { SendEmailParams } from "../services/email.service";

const enabled = process.env.RUN_AUTH_JOURNEY_DB_TESTS === "1";
if (enabled && process.env.NODE_ENV === "production") throw new Error("Development-only test");
const prefix = `signup-loop-${crypto.randomUUID()}`;
const ids: string[] = [];
const sends: SendEmailParams[] = [];
let failureCount = 0;
let server: Server;
let base: string;
let blockSend: (() => Promise<void>) | undefined;
let startedSend: (() => void) | undefined;

before(async () => {
  if (!enabled) return;
  _outboxTestHooks.sendEmailFn = async (params) => {
    assert.ok(String(params.to).startsWith(prefix), "Do not intercept/send unrelated recipients");
    startedSend?.();
    if (blockSend) await blockSend();
    if (failureCount-- > 0) return { ok: false, error: "intentional-development-failure" };
    sends.push(params);
    return { ok: true, id: `intercepted-${crypto.randomUUID()}` };
  };
  const app = express();
  app.use(express.json());
  app.use(session({ secret: crypto.randomBytes(32).toString("hex"), resave: false, saveUninitialized: false }));
  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));
  app.use(passport.initialize());
  app.use(passport.session());
  setupEmailAuth(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  if (enabled) {
    blockSend = undefined;
    startedSend = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    _outboxTestHooks.sendEmailFn = undefined;
    for (const id of ids) {
      await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'userId'=${id} AND metadata->>'signupJourney'='true'`);
      await db.execute(sql`DELETE FROM funnel_events WHERE user_id=${id}`);
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  }
  await pool.end();
});
async function post(path: string, body: unknown, cookie?: string) {
  const response = await fetch(base + path, {
    method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie") };
}
async function fixture(loop: number, variant: string, withName = true, language?: string) {
  const email = `${prefix}-${loop}-${variant}-${crypto.randomBytes(4).toString("hex")}@example.invalid`;
  const result = await post("/api/auth/register", {
    email, password: "Dev-fixture-only-729!", ...(withName ? { firstName: `Traveler${loop}`, lastName: "Test" } : {}),
    ...(language ? { language } : {}),
  });
  const [user] = await db.select().from(users).where(eq(users.email, email));
  assert.ok(user);
  ids.push(user.id);
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, SIGNUP_PUBLIC_RESPONSE);
  assert.equal(result.cookie, null);
  await eventually(async () => (await rows(user.id)).some((r) => r.emailType === "verify_email" && r.status === "sent"));
  return { user, email, response: result };
}
async function rows(id: string) {
  return db.select().from(emailOutbox).where(sql`metadata->>'userId'=${id} AND metadata->>'signupJourney'='true'`);
}
function rawToken(row: typeof emailOutbox.$inferSelect) {
  const link = row.textBody!.match(/https?:\/\/\S+\/verify-email\?token=([a-f0-9]{64})/);
  assert.ok(link, "Verification row carries the actual link (never printed in evidence)");
  return link[1];
}
async function eventually(predicate: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Development outbox did not reach expected state");
}
function sentFor(email: string, key: string) {
  return sends.filter((s) => s.to === email && s.idempotencyKey === key);
}
async function makeDue(id: number) {
  await db.execute(sql`UPDATE email_outbox SET retry_after=NOW()-INTERVAL '1 second',
    metadata=jsonb_set(metadata,'{dueAt}',to_jsonb((NOW()-INTERVAL '1 second')::text)) WHERE id=${id}`);
}

for (const loop of [1, 2, 3]) {
  test(`loop ${loop}: verify, welcome and existing-account HTTP evidence; fresh identity`, { skip: !enabled }, async () => {
    const f = await fixture(loop, "verification", loop % 2 === 1, loop % 2 === 0 ? "es" : undefined);
    const original = (await rows(f.user.id)).find((r) => r.emailType === "verify_email")!;
    const [oldToken] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, f.user.id));
    assert.ok(oldToken);
    assert.ok(Math.abs(oldToken.expiresAt.getTime() - oldToken.createdAt!.getTime() - 86400000) < 1000);
    assert.equal((await rows(f.user.id)).some((r) => r.emailType === "welcome_email"), false);
    for (let i = 0; i < reminderIds.length; i++) {
      const row = (await rows(f.user.id)).find((r) => (r.metadata as any).automationId === reminderIds[i])!;
      assert.equal(new Date((row.metadata as any).dueAt).getTime(), f.user.createdAt!.getTime() + REMINDER_DELAYS[i]);
      await deliverQueuedEmail(row.id);
      assert.equal((await rows(f.user.id)).find((r) => r.id === row.id)!.status, "pending");
    }

    // Resend burns prior token. Simultaneous resends leave exactly one usable link.
    const login = await post("/api/auth/login", { email: f.email, password: "Dev-fixture-only-729!" });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);
    const resends = await Promise.all([
      post("/api/auth/send-verification", {}, login.cookie.split(";")[0]),
      post("/api/auth/send-verification", {}, login.cookie.split(";")[0]),
    ]);
    assert.deepEqual(resends.map((r) => r.status), [200, 200]);
    assert.equal((await post("/api/auth/verify-email", { token: rawToken(original) })).status, 400);
    const tokens = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, f.user.id));
    assert.equal(tokens.filter((t) => !t.usedAt).length, 1);
    const currentHash = tokens.find((t) => !t.usedAt)!.tokenHash;
    const current = (await rows(f.user.id)).find((r) => (r.metadata as any).tokenHash === currentHash)!;
    if (loop % 2 === 0) assert.equal((current.metadata as any).language, "es");

    // Actually concurrent HTTP requests; only one consumes the token.
    const [a, b] = await Promise.all([
      post("/api/auth/verify-email", { token: rawToken(current) }),
      post("/api/auth/verify-email", { token: rawToken(current) }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 400]);
    await eventually(async () => (await rows(f.user.id)).some((r) => r.emailType === "welcome_email" && r.status === "sent"));
    const [verifiedUser] = await db.select().from(users).where(eq(users.id, f.user.id));
    assert.ok(verifiedUser.emailVerified);
    const welcome = (await rows(f.user.id)).filter((r) => r.emailType === "welcome_email");
    assert.equal(welcome.length, 1);
    assert.ok(welcome[0].sentAt! >= verifiedUser.emailVerified!);
    assert.equal(sentFor(f.email, `welcome:${f.user.id}`).length, 1);
    assert.equal((await rows(f.user.id)).filter((r) => reminderIds.includes((r.metadata as any).automationId)).every((r) => r.status === "cancelled"), true);

    const existing = await post("/api/auth/register", { email: f.email, password: "Different-fixture-928!", firstName: "Different", lastName: "Name" });
    assert.deepEqual(existing, f.response);
    await eventually(async () => (await rows(f.user.id)).some((r) => r.emailType === "already_have_account" && r.status === "sent"));
    const [unchangedUser] = await db.select().from(users).where(eq(users.id, f.user.id));
    assert.equal(unchangedUser.password, f.user.password);
    assert.ok(sends.filter((s) => s.to === f.email).every((s) => s.securityCritical === true));
    console.log(JSON.stringify({ loop, nodes: ["verify_email", "welcome_email", "already_have_account"], userId: f.user.id,
      proof: "24h expiry, prior-token burn, concurrent HTTP single welcome, same signup status/body/no-cookie, reminder cancellation",
      status: "verified in dev, inbox receipt pending" }));
  });

  test(`loop ${loop}: three reminders actually execute; fresh randomized name/language`, { skip: !enabled }, async () => {
    const f = await fixture(loop, "reminders", loop % 2 === 0, loop % 2 === 1 ? "es" : undefined);
    // Existing reminder bodies are snapshotted at signup; resend must not reset deadlines.
    for (const nodeId of reminderIds) {
      const row = (await rows(f.user.id)).find((r) => (r.metadata as any).automationId === nodeId)!;
      await makeDue(row.id);
      await Promise.all([deliverQueuedEmail(row.id), deliverQueuedEmail(row.id)]);
      assert.equal((await rows(f.user.id)).find((r) => r.id === row.id)!.status, "sent");
      assert.equal(sentFor(f.email, (row.metadata as any).idempotencyKey).length, 1);
    }
    assert.equal((await rows(f.user.id)).some((r) => r.emailType === "welcome_email"), false);
    console.log(JSON.stringify({ loop, nodes: ["verify_reminder_1h", "verify_reminder_1d", "verify_reminder_3d"], userId: f.user.id,
      proof: "persisted exact deadlines, not-before guard, due row executes through outbox, overlapping sends deduplicated",
      timing: "due-date advancement in DEVELOPMENT, not wall-clock 3-day wait",
      status: "verified in dev, inbox receipt pending" }));
  });

  test(`loop ${loop}: reminder due exactly as verification races; new identity`, { skip: !enabled }, async () => {
    const f = await fixture(loop, "race", loop % 2 === 1);
    const verification = (await rows(f.user.id)).find((r) => r.emailType === "verify_email")!;
    const reminder = (await rows(f.user.id)).find((r) => r.emailType === "verify_reminder_1h")!;
    await makeDue(reminder.id);
    const [verified] = await Promise.all([
      completeSignupVerification(rawToken(verification)), deliverQueuedEmail(reminder.id),
    ]);
    assert.equal(verified.verified, true);
    if (!verified.verified) throw new Error("Verification lost");
    await deliverQueuedEmail(verified.outboxId);
    const final = await rows(f.user.id);
    assert.ok(["sent", "cancelled"].includes(final.find((r) => r.id === reminder.id)!.status));
    const welcomeIndex = sends.findIndex((s) => s.idempotencyKey === `welcome:${f.user.id}`);
    const reminderIndex = sends.findIndex((s) => s.idempotencyKey === (reminder.metadata as any).idempotencyKey);
    assert.ok(reminderIndex === -1 || reminderIndex < welcomeIndex, "No reminder send after welcome");
    for (const r of final.filter((r) => reminderIds.includes((r.metadata as any).automationId))) {
      await makeDue(r.id);
      await deliverQueuedEmail(r.id);
    }
    assert.equal(sentFor(f.email, `welcome:${f.user.id}`).length, 1);
  });
}

test("expiry refuses token with no welcome; retry and transport-before-verify race are safe", { skip: !enabled }, async () => {
  const expired = await fixture(4, "expired", false);
  const verification = (await rows(expired.user.id)).find((r) => r.emailType === "verify_email")!;
  await db.execute(sql`UPDATE email_verification_tokens SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=${expired.user.id}`);
  assert.equal((await post("/api/auth/verify-email", { token: rawToken(verification) })).status, 400);
  assert.equal((await rows(expired.user.id)).some((r) => r.emailType === "welcome_email"), false);

  const retry = await fixture(4, "retry");
  const v = (await rows(retry.user.id)).find((r) => r.emailType === "verify_email")!;
  const complete = await completeSignupVerification(rawToken(v));
  assert.equal(complete.verified, true);
  if (!complete.verified) throw new Error("Verification failed");
  failureCount = 1;
  await deliverQueuedEmail(complete.outboxId);
  assert.equal((await rows(retry.user.id)).find((r) => r.id === complete.outboxId)!.status, "failed");
  await db.execute(sql`UPDATE email_outbox SET retry_after=NOW() WHERE id=${complete.outboxId}`);
  await Promise.all([deliverQueuedEmail(complete.outboxId), deliverQueuedEmail(complete.outboxId)]);
  assert.equal(sentFor(retry.email, `welcome:${retry.user.id}`).length, 1);

  const inflight = await fixture(4, "inflight");
  const r = (await rows(inflight.user.id)).find((row) => row.emailType === "verify_reminder_1h")!;
  const vt = (await rows(inflight.user.id)).find((row) => row.emailType === "verify_email")!;
  await makeDue(r.id);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { startedSend = resolve; });
  blockSend = () => held;
  const delivery = deliverQueuedEmail(r.id);
  await started;
  startedSend = undefined;
  let verificationFinished = false;
  const completing = completeSignupVerification(rawToken(vt)).then((result) => {
    verificationFinished = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(verificationFinished, false, "Verification waits for reminder's in-flight provider work");
  blockSend = undefined;
  release();
  await delivery;
  const done = await completing;
  assert.equal(done.verified, true);
  if (done.verified) await deliverQueuedEmail(done.outboxId);
  assert.ok(sends.findIndex((s) => s.idempotencyKey === (r.metadata as any).idempotencyKey) <
    sends.findIndex((s) => s.idempotencyKey === `welcome:${inflight.user.id}`));
});