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
import { users, emailOutbox, platformSettingsTable as platformSettings } from "../../shared/schema";
import { _outboxTestHooks, _nextRetryAfter, deliverQueuedEmail } from "../services/email-outbox.service";
import { enqueueSignupWelcome, deliverSignupWelcome, welcomeSuppressionReason } from "../services/signup-welcome-outbox.service";
import { resolveSignupQaRecipient } from "../../scripts/verification/signup-qa-recipient";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { upsertUser } from "../replit_integrations/auth/replitAuth";
import { facebookVerify } from "../replit_integrations/auth/facebookAuth";
import { emailVerificationTokens } from "../../shared/models/auth";
import {
  WELCOME_AWAITING_VERIFICATION, WELCOME_NEVER_VERIFIED, WELCOME_VERIFICATION_WINDOW_SETTING,
  parseWelcomeVerificationWindowDays,
} from "../../shared/welcome-verification";

process.env.EMAIL_SENDS_ENABLED = "true";
process.env.EMAIL_TEMPLATE_ALLOWLIST = "signup_welcome";
const enabled = process.env.NODE_ENV === "test" && process.env.RUN_SIGNUP_WELCOME_DB_TESTS === "1";
const fixtureIds: string[] = [];
const originalTransport = _outboxTestHooks.sendEmailFn;
const guardAccount = {
  email: "guard@traveloure-qa.test", isDeleted: false, isSuspended: false,
  termsAcceptedAt: new Date(), privacyAcceptedAt: new Date(),
};

describe("signup welcome pure guards and main wiring", () => {
  it("permits recorded consent and unchanged recipient", () => {
    assert.equal(welcomeSuppressionReason(guardAccount, guardAccount.email, false), null);
  });
  it("suppresses missing, deleted and suspended accounts", () => {
    assert.ok(welcomeSuppressionReason(undefined, guardAccount.email, false));
    assert.ok(welcomeSuppressionReason({ ...guardAccount, isDeleted: true }, guardAccount.email, false));
    assert.ok(welcomeSuppressionReason({ ...guardAccount, isSuspended: true }, guardAccount.email, false));
  });
  it("the verification window reads the ruled default of 7 days unless a whole number of days is stored", () => {
    assert.equal(parseWelcomeVerificationWindowDays(null), 7);
    assert.equal(parseWelcomeVerificationWindowDays("junk"), 7);
    assert.equal(parseWelcomeVerificationWindowDays("0"), 7);
    assert.equal(parseWelcomeVerificationWindowDays("14"), 14);
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
  // AUTH-1: a welcome now waits for a verified address, so a fixture account is born VERIFIED unless a
  // case asks for the unverified variant (`{ verified: false }`).
  async function fixture(opts: { verified?: boolean; authProvider?: string } = {}) {
    const id = randomUUID();
    fixtureIds.push(id);
    let rowId = 0;
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id, email: `${id}@traveloure-qa.test`, firstName: "Signup QA", lastName: "Fixture",
        authProvider: opts.authProvider ?? "email", role: "user",
        termsAcceptedAt: new Date(), privacyAcceptedAt: new Date(),
        emailVerified: opts.verified === false ? null : new Date(),
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

  // ── AUTH-1 Finding A: verify before welcome (the proposal's seven cases) ──────────────────────────
  async function claim(id: number) {
    // The drain's own claim predicate, scoped to one row: due pending/failed rows only.
    const r = await db.execute(sql`UPDATE email_outbox SET status = 'processing',
      retry_after = NOW() + INTERVAL '10 minutes', updated_at = NOW()
      WHERE id = ${id} AND status IN ('pending', 'failed') AND (retry_after IS NULL OR retry_after <= NOW())
      RETURNING id`);
    return (r.rows ?? []).length;
  }
  async function makeDue(id: number) {
    await db.update(emailOutbox).set({ retryAfter: new Date(0) }).where(eq(emailOutbox.id, id));
  }
  function assertHeld(r: typeof emailOutbox.$inferSelect) {
    assert.equal(r.status, "pending");
    assert.equal(r.lastError, WELCOME_AWAITING_VERIFICATION);
    assert.equal(r.attemptCount, 0);
    assert.equal(r.sentAt, null);
    assert.equal(r.resendId, null);
  }

  it("W1: an unverified account's welcome is held on immediate delivery, the scheduled drain and an admin retry", async () => {
    const f = await fixture({ verified: false }), keys = intercept();
    const before = Date.now();
    await deliverQueuedEmail(f.rowId);
    let r = await row(f.rowId);
    assertHeld(r);
    // Eligible again after the configured retry (default 5 minutes), by the database's clock.
    const wait = r.retryAfter!.getTime() - before;
    assert.ok(wait > 4 * 60_000 && wait < 6 * 60_000, `retry in ${wait}ms`);
    // The scheduled drain does not claim it before then …
    assert.equal(await claim(f.rowId), 0);
    // … and once due, the drain claims it and it is held again.
    await makeDue(f.rowId);
    assert.equal(await claim(f.rowId), 1);
    await deliverSignupWelcome(f.rowId, _outboxTestHooks.sendEmailFn!, _nextRetryAfter);
    assertHeld(await row(f.rowId));
    // An admin retry only re-queues failed/dead rows; a held row is neither.
    const retry = await db.execute(sql`UPDATE email_outbox SET status = 'pending', retry_after = NULL
      WHERE id = ${f.rowId} AND status IN ('failed', 'dead') RETURNING id`);
    assert.equal((retry.rows ?? []).length, 0);
    assert.equal(keys.length, 0);
  });

  it("W1 (window): a welcome still unverified after the configured window is cancelled email_never_verified", async () => {
    const f = await fixture({ verified: false }), keys = intercept();
    await db.update(emailOutbox).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) })
      .where(eq(emailOutbox.id, f.rowId));
    await deliverQueuedEmail(f.rowId);
    let r = await row(f.rowId);
    assert.equal(r.status, "cancelled");
    assert.equal(r.lastError, WELCOME_NEVER_VERIFIED);
    // The window is the admin-editable row: at 10 days an 8-day-old welcome is still held.
    const g = await fixture({ verified: false });
    await db.update(emailOutbox).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) })
      .where(eq(emailOutbox.id, g.rowId));
    await db.insert(platformSettings).values({ settingKey: WELCOME_VERIFICATION_WINDOW_SETTING, settingValue: "10" })
      .onConflictDoUpdate({ target: platformSettings.settingKey, set: { settingValue: "10" } });
    invalidatePlatformFlagCache(WELCOME_VERIFICATION_WINDOW_SETTING);
    try {
      await deliverQueuedEmail(g.rowId);
      assertHeld(await row(g.rowId));
    } finally {
      await db.delete(platformSettings).where(eq(platformSettings.settingKey, WELCOME_VERIFICATION_WINDOW_SETTING));
      invalidatePlatformFlagCache(WELCOME_VERIFICATION_WINDOW_SETTING);
    }
    assert.equal(keys.length, 0);
  });

  it("W2: verifying the address lets the SAME row send, once", async () => {
    const f = await fixture({ verified: false }), keys = intercept();
    await deliverQueuedEmail(f.rowId);
    assertHeld(await row(f.rowId));
    await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, f.id));
    await makeDue(f.rowId);
    await deliverQueuedEmail(f.rowId);
    assert.deepEqual(keys, [`signup-welcome-${f.id}`]);
    const r = await row(f.rowId);
    assert.equal(r.status, "sent");
    assert.equal(r.attemptCount, 1);
    const all = await db.select({ id: emailOutbox.id }).from(emailOutbox)
      .where(sql`${emailOutbox.metadata}->>'signupAccountId' = ${f.id}`);
    assert.deepEqual(all.map(a => a.id), [f.rowId]);
  });

  it("W3: an uncommitted verification never reaches the provider, in either order", async () => {
    // (a) Verification holds the account row first and rolls back: the dispatcher waits, then holds.
    const f = await fixture({ verified: false }), keys = intercept();
    let release!: () => void, locked!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const haveLock = new Promise<void>(r => { locked = r; });
    const verification = db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerified: new Date() }).where(eq(users.id, f.id));
      locked(); await gate;
      throw new Error("verification rolled back");
    }).catch(() => undefined);
    await haveLock;
    const delivery = deliverQueuedEmail(f.rowId);
    await new Promise(r => setTimeout(r, 200));
    assert.equal(keys.length, 0, "no handoff while the stamp is uncommitted");
    release(); await verification; await delivery;
    assertHeld(await row(f.rowId));
    assert.equal(keys.length, 0);
    // (b) The same, committed: the dispatcher sees the stamp once the lock is released and sends once.
    const g = await fixture({ verified: false });
    let release2!: () => void, locked2!: () => void;
    const gate2 = new Promise<void>(r => { release2 = r; });
    const haveLock2 = new Promise<void>(r => { locked2 = r; });
    const commit = db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerified: new Date() }).where(eq(users.id, g.id));
      locked2(); await gate2;
    });
    await haveLock2;
    const delivery2 = deliverQueuedEmail(g.rowId);
    await new Promise(r => setTimeout(r, 200));
    assert.equal(keys.length, 0);
    release2(); await commit; await delivery2;
    assert.equal((await row(g.rowId)).status, "sent");
    // (c) The dispatcher holds first; the verification that commits after it is seen on the next pass.
    const h = await fixture({ verified: false });
    await deliverQueuedEmail(h.rowId);
    assertHeld(await row(h.rowId));
    await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, h.id));
    await makeDue(h.rowId);
    await deliverQueuedEmail(h.rowId);
    assert.equal((await row(h.rowId)).status, "sent");
    assert.deepEqual(keys, [`signup-welcome-${g.id}`, `signup-welcome-${h.id}`]);
  });

  it("W4: two concurrent dispatches of a held welcome hold it once and send nothing", async () => {
    const f = await fixture({ verified: false }), keys = intercept();
    await db.update(emailOutbox).set({ status: "processing" }).where(eq(emailOutbox.id, f.rowId));
    await Promise.all([
      deliverSignupWelcome(f.rowId, _outboxTestHooks.sendEmailFn!, _nextRetryAfter),
      deliverSignupWelcome(f.rowId, _outboxTestHooks.sendEmailFn!, _nextRetryAfter),
    ]);
    assertHeld(await row(f.rowId));
    assert.equal(keys.length, 0);
  });

  for (const scenario of ["changed-email", "no-consent", "soft-deleted", "suspended", "duplicate-sent"] as const) {
    it(`W5: an unverified ${scenario} account is still cancelled, not held`, async () => {
      const f = await fixture({ verified: false }), keys = intercept();
      if (scenario === "duplicate-sent") {
        await db.insert(emailOutbox).values({
          emailType: "signup_welcome", toEmail: `${f.id}@traveloure-qa.test`, subject: "Historical fixture",
          html: "", status: "sent", metadata: { signupAccountId: f.id, signupWelcomeVersion: 1 },
        });
      } else {
        await db.update(users).set(scenario === "changed-email" ? { email: `${randomUUID()}@traveloure-qa.test` }
          : scenario === "no-consent" ? { termsAcceptedAt: null }
          : scenario === "soft-deleted" ? { isDeleted: true } : { isSuspended: true }).where(eq(users.id, f.id));
      }
      await deliverQueuedEmail(f.rowId);
      const r = await row(f.rowId);
      assert.equal(r.status, "cancelled");
      assert.notEqual(r.lastError, WELCOME_AWAITING_VERIFICATION);
      assert.equal(keys.length, 0);
    });
  }

  it("W6: an SSO account with no stamp is held; only a Replit claim of email_verified === true stamps a new account, never Facebook", async () => {
    const f = await fixture({ verified: false, authProvider: "replit" }), keys = intercept();
    await deliverQueuedEmail(f.rowId);
    assertHeld(await row(f.rowId));
    assert.equal(keys.length, 0);

    invalidatePlatformFlagCache();
    const verifiedSub = `auth1-${randomUUID()}`, unverifiedSub = `auth1-${randomUUID()}`;
    fixtureIds.push(verifiedSub, unverifiedSub);
    const mode = await db.select().from(platformSettings).where(eq(platformSettings.settingKey, "traveler_signup_mode"));
    await db.insert(platformSettings).values({ settingKey: "traveler_signup_mode", settingValue: "open" })
      .onConflictDoUpdate({ target: platformSettings.settingKey, set: { settingValue: "open" } });
    invalidatePlatformFlagCache();
    try {
      await upsertUser({ sub: verifiedSub, email: `${verifiedSub}@traveloure-qa.test`, email_verified: true });
      await upsertUser({ sub: unverifiedSub, email: `${unverifiedSub}@traveloure-qa.test`, email_verified: "true" });
      const [v] = await db.select().from(users).where(eq(users.id, verifiedSub));
      const [u] = await db.select().from(users).where(eq(users.id, unverifiedSub));
      assert.ok(v.emailVerified, "a literal true claim stamps the new account");
      assert.equal(u.emailVerified, null, "anything but a literal true stamps nothing");
      // An existing account is never re-stamped by a later sign-in.
      await db.update(users).set({ emailVerified: null }).where(eq(users.id, verifiedSub));
      await upsertUser({ sub: verifiedSub, email: `${verifiedSub}@traveloure-qa.test`, email_verified: true });
      const [again] = await db.select().from(users).where(eq(users.id, verifiedSub));
      assert.equal(again.emailVerified, null);

      // Facebook is never stamped: a new account gets the verification email (its token) and an
      // unverified account. Transport stubbed: no provider key, so nothing leaves the process.
      const fbId = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
      fixtureIds.push(`fb_${fbId}`);
      const oldKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      try {
        let signedIn: any;
        await facebookVerify("tok", "rtok", {
          id: fbId, displayName: "Fb Fixture", name: { givenName: "Fb" },
          emails: [{ value: `fb-${fbId}@traveloure-qa.test` }], photos: [],
        } as any, (_err, user) => { signedIn = user; });
        assert.equal(signedIn?.claims?.sub, `fb_${fbId}`);
        const [fb] = await db.select().from(users).where(eq(users.id, `fb_${fbId}`));
        assert.equal(fb.emailVerified, null, "a Facebook account is born unverified");
        let tokens: unknown[] = [];
        for (let i = 0; i < 40 && tokens.length === 0; i++) {
          tokens = await db.select({ id: emailVerificationTokens.id }).from(emailVerificationTokens)
            .where(eq(emailVerificationTokens.userId, `fb_${fbId}`));
          if (tokens.length === 0) await new Promise(r => setTimeout(r, 50));
        }
        assert.equal(tokens.length, 1, "the new Facebook account is sent one verification link");
        await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, `fb_${fbId}`));
      } finally {
        if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
      }
    } finally {
      if (mode[0]) await db.update(platformSettings).set({ settingValue: mode[0].settingValue })
        .where(eq(platformSettings.settingKey, "traveler_signup_mode"));
      else await db.delete(platformSettings).where(eq(platformSettings.settingKey, "traveler_signup_mode"));
      invalidatePlatformFlagCache();
    }
  });

  it("W7: a signup transaction fault still rolls the unverified account and its welcome back together", async () => {
    const id = randomUUID(); fixtureIds.push(id);
    await assert.rejects(db.transaction(async tx => {
      await tx.insert(users).values({
        id, email: `${id}@traveloure-qa.test`, termsAcceptedAt: new Date(), privacyAcceptedAt: new Date(),
      });
      await enqueueSignupWelcome(tx, id);
      throw new Error("forced rollback");
    }), /forced rollback/);
    assert.equal((await db.select({ id: users.id }).from(users).where(eq(users.id, id))).length, 0);
    assert.equal((await db.select({ id: emailOutbox.id }).from(emailOutbox)
      .where(sql`${emailOutbox.metadata}->>'signupAccountId' = ${id}`)).length, 0);
  });
});
