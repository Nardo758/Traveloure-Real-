/**
 * Main-based signup welcome suite. Real transactions, only fresh scoped dev/CI
 * fixtures; transport is intercepted. These IDs are NOT delivered-email evidence.
 * NODE_ENV=test RUN_SIGNUP_WELCOME_DB_TESTS=1 npx tsx --test --test-force-exit ...
 */
import { after, afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { users, emailOutbox } from "../../shared/schema";
import { _outboxTestHooks, _nextRetryAfter, deliverQueuedEmail } from "../services/email-outbox.service";
import { enqueueSignupWelcome, deliverSignupWelcome, welcomeSuppressionReason } from "../services/signup-welcome-outbox.service";
import { resolveSignupQaRecipient } from "../../scripts/verification/signup-qa-recipient";
import { buildWelcomeEmailPayload } from "../services/email.service";

const enabled = process.env.NODE_ENV === "test" && process.env.RUN_SIGNUP_WELCOME_DB_TESTS === "1";
const fixtureIds: string[] = [];
const originalTransport = _outboxTestHooks.sendEmailFn;
const guardAccount = {
  email: "guard@traveloure-qa.test", isDeleted: false, isSuspended: false,
  termsAcceptedAt: new Date(), privacyAcceptedAt: new Date(),
};

describe("signup welcome pure guards and main wiring", () => {
  it("links Browse experts to the public directory rather than the application redirect", () => {
    const payload = buildWelcomeEmailPayload({
      toEmail: "guard@traveloure-qa.test", firstName: "Signup QA",
    });
    const browseHref = payload.html.match(/<a href="([^"]+)"[^>]*>Browse experts<\/a>/)?.[1];
    assert.ok(browseHref, "Welcome email must include the Browse experts link");
    const dashboardHref = payload.html.match(/<a href="([^"]+)"[\s\S]*?>\s*Start Planning\s*<\/a>/)?.[1];
    assert.ok(dashboardHref, "Welcome email must retain the Start Planning link");
    assert.equal(browseHref, new URL("/experts", dashboardHref).href);

    const app = readFileSync("client/src/App.tsx", "utf8");
    const directoryRoute = app.match(/<Route path="\/experts">([\s\S]*?)<\/Route>/)?.[1];
    assert.ok(directoryRoute, "The expert directory must remain a public route");
    assert.match(directoryRoute, /<BrowseShell><ExpertsPage \/><\/BrowseShell>/);
    assert.doesNotMatch(directoryRoute, /<Redirect|<ProtectedRoute/);
  });
  it("permits recorded consent and unchanged recipient", () => {
    assert.equal(welcomeSuppressionReason(guardAccount, guardAccount.email, false), null);
  });
  it("suppresses missing, deleted and suspended accounts", () => {
    assert.ok(welcomeSuppressionReason(undefined, guardAccount.email, false));
    assert.ok(welcomeSuppressionReason({ ...guardAccount, isDeleted: true }, guardAccount.email, false));
    assert.ok(welcomeSuppressionReason({ ...guardAccount, isSuspended: true }, guardAccount.email, false));
  });
  it("suppresses changed email, missing consent and previous delivery", () => {
    assert.ok(welcomeSuppressionReason(guardAccount, "changed@traveloure-qa.test", false));
    assert.ok(welcomeSuppressionReason({ ...guardAccount, termsAcceptedAt: null }, guardAccount.email, false));
    assert.ok(welcomeSuppressionReason({ ...guardAccount, privacyAcceptedAt: null }, guardAccount.email, false));
    assert.ok(welcomeSuppressionReason(guardAccount, guardAccount.email, true));
  });
  it("keeps signup enqueue transactional and removes its direct welcome call", () => {
    const auth = readFileSync("server/replit_integrations/auth/emailAuth.ts", "utf8");
    assert.match(auth, /db\.transaction[\s\S]*enqueueSignupWelcome\(tx, newUser\.id\)/);
    assert.doesNotMatch(auth, /sendWelcomeEmail\s*\(/);
    assert.match(auth, /deliverQueuedEmail\(welcomeId\)/);
  });
  it("retains main itinerary dispatch and provider guards", () => {
    const source = readFileSync("server/services/email-outbox.service.ts", "utf8");
    assert.match(source, /isItineraryFollowup\(current\.emailType\)/);
    assert.match(source, /deliverItineraryFollowup/);
    assert.match(source, /generationNoticeKey/);
    assert.match(source, /itinerary-outbox-\$\{outboxId\}/);
  });
  it("production app send path never imports or reads the QA inbox", () => {
    for (const path of [
      "server/index.ts",
      "server/replit_integrations/auth/emailAuth.ts",
      "server/services/signup-welcome-outbox.service.ts",
      "server/services/email-outbox.service.ts",
      "server/services/email.service.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      assert.doesNotMatch(source, /SIGNUP_QA_TEST_INBOX|signup-qa-(recipient|server)/, path);
    }
  });
  it("production recipient resolution returns the account address without reading the inbox", () => {
    const accountAddress = "guard@traveloure-qa.test";
    const inaccessible = new Proxy({ NODE_ENV: "production" }, {
      get(target, property) {
        if (property === "SIGNUP_QA_TEST_INBOX") throw new Error("Production tried to read the QA inbox");
        return target[property as keyof typeof target];
      },
    });
    assert.equal(resolveSignupQaRecipient(accountAddress, inaccessible), accountAddress);
    assert.equal(resolveSignupQaRecipient(accountAddress, {
      NODE_ENV: "production", SIGNUP_QA_TEST_INBOX: "wrong-recipient@example.org",
    }), accountAddress);
    assert.equal(resolveSignupQaRecipient(accountAddress, {
      NODE_ENV: "development", SIGNUP_QA_TEST_INBOX: "monitored@example.org",
    }), "monitored@example.org");
    assert.equal(resolveSignupQaRecipient("other@example.org", {
      NODE_ENV: "development", SIGNUP_QA_TEST_INBOX: "monitored@example.org",
    }), "other@example.org");
  });
});

describe("signup welcome real database", { skip: !enabled }, () => {
  afterEach(() => { _outboxTestHooks.sendEmailFn = originalTransport; });
  after(async () => {
    if (fixtureIds.length) {
      await db.delete(emailOutbox).where(sql`${emailOutbox.metadata}->>'signupAccountId'
        IN (${sql.join(fixtureIds.map(id => sql`${id}`), sql`, `)})`);
      await db.delete(users).where(inArray(users.id, fixtureIds));
    }
  });
  async function fixture() {
    const id = randomUUID();
    fixtureIds.push(id);
    let rowId = 0;
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id, email: `${id}@traveloure-qa.test`, firstName: "Signup QA", lastName: "Fixture",
        authProvider: "email", role: "user",
        termsAcceptedAt: new Date(), privacyAcceptedAt: new Date(),
      });
      rowId = await enqueueSignupWelcome(tx, id);
    });
    return { id, rowId };
  }
  async function row(id: number) {
    const [r] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
    return r;
  }
  function intercept() {
    const keys: string[] = [];
    _outboxTestHooks.sendEmailFn = async (payload) => {
      assert.match(String(payload.to), /@traveloure-qa\.test$/);
      keys.push(payload.idempotencyKey!);
      return { ok: true, id: `intercepted-${keys.length}` };
    };
    return keys;
  }
  it("rolls back the account and welcome obligation together", async () => {
    const id = randomUUID(); fixtureIds.push(id);
    await assert.rejects(db.transaction(async tx => {
      await tx.insert(users).values({ id, email: `${id}@traveloure-qa.test` });
      await enqueueSignupWelcome(tx, id);
      throw new Error("forced rollback");
    }), /forced rollback/);
    assert.equal((await db.select({ id: users.id }).from(users).where(eq(users.id, id))).length, 0);
    assert.equal((await db.select({ id: emailOutbox.id }).from(emailOutbox)
      .where(sql`${emailOutbox.metadata}->>'signupAccountId' = ${id}`)).length, 0);
  });
  it("concurrent enqueues persist exactly one welcome", async () => {
    const f = await fixture();
    const ids = await Promise.all(Array.from({ length: 5 }, () =>
      db.transaction(tx => enqueueSignupWelcome(tx, f.id))));
    assert.deepEqual(ids, Array(5).fill(f.rowId));
    const rows = await db.select({ id: emailOutbox.id }).from(emailOutbox)
      .where(sql`${emailOutbox.metadata}->>'signupAccountId' = ${f.id}`);
    assert.equal(rows.length, 1);
  });
  it("immediate delivery claims once and persists the provider ID", async () => {
    const f = await fixture(), keys = intercept();
    await Promise.all([deliverQueuedEmail(f.rowId), deliverQueuedEmail(f.rowId)]);
    assert.deepEqual(keys, [`signup-welcome-${f.id}`]);
    assert.equal((await row(f.rowId)).status, "sent");
    assert.equal((await row(f.rowId)).resendId, "intercepted-1");
  });
  it("production dispatcher sends to the account's own address even with an override configured", async () => {
    const f = await fixture();
    const oldEnv = process.env.NODE_ENV;
    const oldInbox = process.env.SIGNUP_QA_TEST_INBOX;
    try {
      process.env.NODE_ENV = "production";
      process.env.SIGNUP_QA_TEST_INBOX = "wrong-recipient@example.org";
      _outboxTestHooks.sendEmailFn = async payload => {
        assert.equal(payload.to, `${f.id}@traveloure-qa.test`);
        return { ok: true, id: "intercepted-production" };
      };
      await deliverQueuedEmail(f.rowId);
      assert.equal((await row(f.rowId)).status, "sent");
      assert.equal((await row(f.rowId)).resendId, "intercepted-production");
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldEnv;
      if (oldInbox === undefined) delete process.env.SIGNUP_QA_TEST_INBOX;
      else process.env.SIGNUP_QA_TEST_INBOX = oldInbox;
    }
  });
  it("the scheduled/admin dispatcher cannot resend an already sent row", async () => {
    const f = await fixture(), keys = intercept();
    await deliverQueuedEmail(f.rowId);
    await deliverSignupWelcome(f.rowId, _outboxTestHooks.sendEmailFn!, _nextRetryAfter);
    assert.equal(keys.length, 1);
  });
  for (const scenario of ["changed-email", "no-consent", "soft-deleted", "suspended", "missing-account"] as const) {
    it(`send-time guard cancels ${scenario} without transport`, async () => {
      const f = await fixture(), keys = intercept();
      if (scenario === "missing-account") await db.delete(users).where(eq(users.id, f.id));
      else await db.update(users).set(scenario === "changed-email" ? { email: `${randomUUID()}@traveloure-qa.test` }
        : scenario === "no-consent" ? { privacyAcceptedAt: null }
        : scenario === "soft-deleted" ? { isDeleted: true } : { isSuspended: true }).where(eq(users.id, f.id));
      await deliverQueuedEmail(f.rowId);
      assert.equal(keys.length, 0);
      assert.equal((await row(f.rowId)).status, "cancelled");
    });
  }
  it("provider failure uses existing backoff and a stable retry key", async () => {
    const f = await fixture(), keys: string[] = [];
    _outboxTestHooks.sendEmailFn = async p => {
      keys.push(p.idempotencyKey!);
      return keys.length === 1 ? { ok: false, error: "intercepted failure" } : { ok: true, id: "intercepted-retry" };
    };
    await deliverQueuedEmail(f.rowId);
    assert.equal((await row(f.rowId)).status, "failed");
    assert.ok((await row(f.rowId)).retryAfter);
    await db.update(emailOutbox).set({ retryAfter: new Date(0) }).where(eq(emailOutbox.id, f.rowId));
    await deliverQueuedEmail(f.rowId);
    assert.deepEqual(keys, [`signup-welcome-${f.id}`, `signup-welcome-${f.id}`]);
    assert.equal((await row(f.rowId)).status, "sent");
  });
  it("another sent welcome suppresses a duplicate row", async () => {
    const f = await fixture(), keys = intercept();
    await db.insert(emailOutbox).values({
      emailType: "signup_welcome", toEmail: `${f.id}@traveloure-qa.test`, subject: "Historical fixture",
      html: "", status: "sent", metadata: { signupAccountId: f.id, signupWelcomeVersion: 1 },
    });
    await deliverQueuedEmail(f.rowId);
    assert.equal(keys.length, 0);
    assert.equal((await row(f.rowId)).status, "cancelled");
  });
  it("a stale duplicate sender waits for the first sender and cannot send again", async () => {
    const f = await fixture();
    await db.update(emailOutbox).set({ status: "processing" }).where(eq(emailOutbox.id, f.rowId));
    let release!: () => void, entered!: () => void, count = 0;
    const gate = new Promise<void>(r => { release = r; });
    const started = new Promise<void>(r => { entered = r; });
    const transport = async () => { count++; entered(); await gate; return { ok: true, id: "intercepted-held" }; };
    const first = deliverSignupWelcome(f.rowId, transport, _nextRetryAfter);
    await started;
    const second = deliverSignupWelcome(f.rowId, transport, _nextRetryAfter);
    release(); await Promise.all([first, second]);
    assert.equal(count, 1);
    assert.equal((await row(f.rowId)).status, "sent");
  });
});
