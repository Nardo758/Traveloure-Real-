/**
 * Row 156. No login path clears users.email. A login that changes the stored
 * email sets emailVerified null unless the provider asserts email_verified
 * boolean true for that email. Facebook has no verified flag.
 *
 * The conflict rule lives in authStorage.upsertUser (one statement). These
 * cases drive that method, replitAuth.upsertUser(claims), and facebookVerify.
 *
 * L7 documents today's collision: the new email already belongs to another
 * account, the users.email unique index rejects the write, the login fails,
 * and neither row changes. No merge is added here.
 *
 * DISPOSABLE DB ONLY. Every row this file writes, it deletes.
 *
 *   NODE_ENV=test SESSION_COOKIE_INSECURE=1 \
 *   npx tsx --test --test-concurrency=1 --test-force-exit \
 *   server/__tests__/login-email-no-clear.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, pool } from "../db";
import { eq, inArray, sql } from "drizzle-orm";
import { users, emailVerificationTokens } from "../../shared/models/auth";
import { emailOutbox } from "../../shared/schema";
import { authStorage } from "../replit_integrations/auth/storage";
import { upsertUser } from "../replit_integrations/auth/replitAuth";
import { facebookVerify } from "../replit_integrations/auth/facebookAuth";
import { EMAIL_SIGN_IN_REQUIRED } from "../replit_integrations/auth/email-merge";
import { invalidatePlatformFlagCache } from "../services/platform-flags";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
const PRIOR_VERIFIED = new Date("2020-01-15T12:00:00.000Z");
const STATED_VERIFIED = new Date("2019-06-01T00:00:00.000Z");

const ids: string[] = [];
const emails: string[] = [];
const origFetch = global.fetch;
let priorMode: { had: boolean; value: string | null } = { had: false, value: null };
let priorRegistration: { had: boolean; value: string | null } = { had: false, value: null };

async function assertDisposableDb(): Promise<void> {
  const r = await pool.query("SELECT inet_server_addr()::text AS addr");
  const addr: string | null = r.rows[0]?.addr ?? null;
  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; }
  })();
  const ok = (host !== null && DISPOSABLE_HOSTS.has(host)) || addr === null || DISPOSABLE_HOSTS.has(addr.split("/")[0]);
  if (!ok) throw new Error(`login-email-no-clear refuses a non-local database (${host ?? "unknown host"})`);
}

async function readSetting(key: string): Promise<{ had: boolean; value: string | null }> {
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key}`);
  if (!r.rows.length) return { had: false, value: null };
  return { had: true, value: ((r.rows[0] as { setting_value?: string | null }).setting_value ?? null) };
}

async function writeSetting(key: string, value: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO platform_settings (setting_key, setting_value) VALUES (${key}, ${value})
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value
  `);
  invalidatePlatformFlagCache();
}

async function restoreSetting(key: string, prior: { had: boolean; value: string | null }): Promise<void> {
  if (prior.had) {
    await db.execute(sql`UPDATE platform_settings SET setting_value = ${prior.value} WHERE setting_key = ${key}`);
  } else {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
  }
  invalidatePlatformFlagCache();
}

function freshEmail(label: string): string {
  const email = `r156-${label}-${crypto.randomUUID()}@traveloure-qa.test`;
  emails.push(email);
  return email;
}

function track(id: string): string {
  ids.push(id);
  return id;
}

function stamp(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) throw new Error(`unreadable emailVerified stamp: ${String(value)}`);
  return time;
}

async function load(id: string) {
  const [row] = await db.select({
    id: users.id,
    email: users.email,
    emailVerified: users.emailVerified,
    role: users.role,
  }).from(users).where(eq(users.id, id));
  assert.ok(row, `missing user ${id}`);
  return row;
}

async function seed(opts: {
  id: string;
  email: string | null;
  verified?: Date | null;
  role?: string;
  authProvider?: string;
}) {
  track(opts.id);
  if (opts.email) emails.push(opts.email);
  await db.insert(users).values({
    id: opts.id,
    email: opts.email,
    firstName: "Kept",
    lastName: "Fixture",
    role: opts.role ?? "user",
    authProvider: opts.authProvider ?? "email",
    emailVerified: opts.verified === undefined ? PRIOR_VERIFIED : opts.verified,
  });
  return load(opts.id);
}

function fbProfile(profileId: string, email: string | null) {
  const profile: Record<string, unknown> = {
    id: profileId,
    displayName: "Kept Fixture",
    name: { givenName: "Kept", familyName: "Fixture" },
    photos: [],
  };
  if (email !== null) profile.emails = [{ value: email }];
  return profile;
}

function facebookLogin(profileId: string, email: string | null): Promise<{ err: unknown; user: any; info: any }> {
  return new Promise((resolve) => {
    facebookVerify("tok", "rtok", fbProfile(profileId, email) as any, (err, user, info) => {
      resolve({ err, user, info });
    });
  });
}

function errorText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      const code = (cur as { code?: string }).code;
      if (code) parts.push(String(code));
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.join(" ");
}

function isUniqueViolation(err: unknown): boolean {
  return /23505|unique|duplicate key/i.test(errorText(err));
}

describe("row 156 — login never clears users.email", () => {
  before(async () => {
    await assertDisposableDb();
    priorMode = await readSetting("traveler_signup_mode");
    priorRegistration = await readSetting("new_user_registration_enabled");
    await writeSetting("traveler_signup_mode", "open");
    await writeSetting("new_user_registration_enabled", "true");
    (global as any).fetch = async () => ({ ok: false, json: async () => ({}) });
  });

  after(async () => {
    (global as any).fetch = origFetch;
    await new Promise((r) => setTimeout(r, 300));
    if (emails.length) {
      await db.delete(emailOutbox).where(inArray(emailOutbox.toEmail, emails));
    }
    for (const id of ids) {
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    await restoreSetting("traveler_signup_mode", priorMode);
    await restoreSetting("new_user_registration_enabled", priorRegistration);
  });

  it("L1 Facebook login with no profile email leaves the stored email and its verified stamp", async () => {
    const profileId = crypto.randomUUID();
    const id = `fb_${profileId}`;
    const email = freshEmail("l1");
    const beforeRow = await seed({ id, email, authProvider: "facebook" });
    const result = await facebookLogin(profileId, null);
    assert.equal(result.err, null, errorText(result.err));
    assert.equal(result.user?.claims?.sub, id);
    const afterRow = await load(id);
    assert.equal(afterRow.email, beforeRow.email);
    assert.equal(stamp(afterRow.emailVerified), stamp(beforeRow.emailVerified));
  });

  it("L1 storage: a null or blank incoming email does not clear a stored address", async () => {
    const id = track(`r156-blank-${crypto.randomUUID()}`);
    const email = freshEmail("blank");
    await seed({ id, email });
    await authStorage.upsertUser({ id, email: null, firstName: "Kept" });
    let row = await load(id);
    assert.equal(row.email, email);
    assert.equal(stamp(row.emailVerified), PRIOR_VERIFIED.getTime());
    await authStorage.upsertUser({ id, email: "   ", firstName: "Kept" });
    row = await load(id);
    assert.equal(row.email, email);
    assert.equal(stamp(row.emailVerified), PRIOR_VERIFIED.getTime());
    await authStorage.upsertUser({ id, firstName: "Kept" });
    row = await load(id);
    assert.equal(row.email, email);
    assert.equal(stamp(row.emailVerified), PRIOR_VERIFIED.getTime());
  });

  it("L2 Facebook login with the same email in another case and whitespace changes nothing", async () => {
    const profileId = crypto.randomUUID();
    const id = `fb_${profileId}`;
    const email = freshEmail("l2");
    const beforeRow = await seed({ id, email, authProvider: "facebook" });
    const result = await facebookLogin(profileId, `  ${email.toUpperCase()}  `);
    assert.equal(result.err, null, errorText(result.err));
    const afterRow = await load(id);
    assert.equal(afterRow.email, beforeRow.email);
    assert.equal(stamp(afterRow.emailVerified), stamp(beforeRow.emailVerified));
  });

  it("L3 Facebook login with a different email stores it and clears emailVerified", async () => {
    const profileId = crypto.randomUUID();
    const id = `fb_${profileId}`;
    const email = freshEmail("l3");
    await seed({ id, email, authProvider: "facebook" });
    const next = freshEmail("l3next");
    const result = await facebookLogin(profileId, next);
    assert.equal(result.err, null, errorText(result.err));
    const afterRow = await load(id);
    assert.equal(afterRow.email, next);
    assert.equal(afterRow.emailVerified, null);
  });

  it("L4 Replit OIDC replaces a different email and resets emailVerified unless the claim is boolean true", async () => {
    for (const claim of [undefined, false, "true"] as const) {
      const id = track(`r156-l4-${crypto.randomUUID()}`);
      const email = freshEmail("l4");
      await seed({ id, email, authProvider: "replit" });
      const next = freshEmail("l4next");
      const claims: Record<string, unknown> = { sub: id, email: next, first_name: "Kept" };
      if (claim !== undefined) claims.email_verified = claim;
      assert.equal(await upsertUser(claims), id);
      const afterRow = await load(id);
      assert.equal(afterRow.email, next, `claim ${String(claim)}`);
      assert.equal(afterRow.emailVerified, null, `claim ${String(claim)} must not stay verified`);
    }

    const id = track(`r156-l4t-${crypto.randomUUID()}`);
    const email = freshEmail("l4t");
    await seed({ id, email, authProvider: "replit" });
    const next = freshEmail("l4tnext");
    const started = Date.now();
    assert.equal(await upsertUser({ sub: id, email: next, email_verified: true, first_name: "Kept" }), id);
    const afterRow = await load(id);
    assert.equal(afterRow.email, next);
    const verifiedAt = stamp(afterRow.emailVerified);
    assert.ok(verifiedAt !== null && verifiedAt >= started - 2000, "boolean true stamps emailVerified");
    assert.notEqual(verifiedAt, PRIOR_VERIFIED.getTime());
  });

  it("L5 Replit OIDC with no email, or the same email, leaves the stored address and stamp", async () => {
    const missing = track(`r156-l5a-${crypto.randomUUID()}`);
    const missingEmail = freshEmail("l5a");
    await seed({ id: missing, email: missingEmail, authProvider: "replit" });
    assert.equal(await upsertUser({ sub: missing, first_name: "Kept" }), missing);
    let row = await load(missing);
    assert.equal(row.email, missingEmail);
    assert.equal(stamp(row.emailVerified), PRIOR_VERIFIED.getTime());

    const same = track(`r156-l5b-${crypto.randomUUID()}`);
    const sameEmail = freshEmail("l5b");
    await seed({ id: same, email: sameEmail, authProvider: "replit" });
    assert.equal(
      await upsertUser({ sub: same, email: `  ${sameEmail.toUpperCase()}  `, email_verified: true, first_name: "Kept" }),
      same,
    );
    row = await load(same);
    assert.equal(row.email, sameEmail);
    assert.equal(stamp(row.emailVerified), PRIOR_VERIFIED.getTime());
  });

  it("L6 a new Facebook account with no email still inserts, and a new verified OIDC account is born verified", async () => {
    const profileId = crypto.randomUUID();
    const fbId = track(`fb_${profileId}`);
    const created = await facebookLogin(profileId, null);
    assert.equal(created.err, null, errorText(created.err));
    assert.equal(created.user?.claims?.sub, fbId);
    const fbRow = await load(fbId);
    assert.equal(fbRow.email, null);
    assert.equal(fbRow.emailVerified, null);

    const oidcId = track(`r156-l6-${crypto.randomUUID()}`);
    const oidcEmail = freshEmail("l6");
    const started = Date.now();
    assert.equal(await upsertUser({ sub: oidcId, email: oidcEmail, email_verified: true, first_name: "Born" }), oidcId);
    const oidcRow = await load(oidcId);
    assert.equal(oidcRow.email, oidcEmail);
    const born = stamp(oidcRow.emailVerified);
    assert.ok(born !== null && born >= started - 2000, "a new OIDC account with a verified claim is born verified");

    const flagOnly = track(`r156-l6flag-${crypto.randomUUID()}`);
    const flagEmail = freshEmail("l6flag");
    await authStorage.upsertUser(
      { id: flagOnly, email: flagEmail, firstName: "Flag", authProvider: "replit" },
      { providerEmailVerified: true },
    );
    const flagRow = await load(flagOnly);
    assert.equal(flagRow.email, flagEmail);
    assert.equal(flagRow.emailVerified, null, "the provider flag does not stamp a brand-new insert");

    const spreadId = track(`r156-l6spread-${crypto.randomUUID()}`);
    const spreadEmail = freshEmail("l6spread");
    await authStorage.upsertUser(
      { id: spreadId, email: spreadEmail, emailVerified: STATED_VERIFIED, authProvider: "replit" },
      { providerEmailVerified: false },
    );
    const spreadRow = await load(spreadId);
    assert.equal(spreadRow.email, spreadEmail);
    assert.equal(stamp(spreadRow.emailVerified), STATED_VERIFIED.getTime());
  });

  it("L7 a login whose new email belongs to another account fails on the unique index and touches neither row", async () => {
    const ownerId = track(`r156-l7o-${crypto.randomUUID()}`);
    const ownerEmail = freshEmail("l7owner");
    const owner = await seed({ id: ownerId, email: ownerEmail, role: "user" });

    const storedId = track(`r156-l7s-${crypto.randomUUID()}`);
    const storedEmail = freshEmail("l7stored");
    const stored = await seed({ id: storedId, email: storedEmail });
    await assert.rejects(
      () => authStorage.upsertUser({ id: storedId, email: ownerEmail, firstName: "Kept" }),
      (err: unknown) => {
        if (!isUniqueViolation(err)) throw new Error(`expected unique violation, got: ${errorText(err)}`);
        return true;
      },
    );
    assert.equal((await load(storedId)).email, stored.email);
    assert.equal(stamp((await load(storedId)).emailVerified), stamp(stored.emailVerified));
    assert.equal((await load(ownerId)).email, owner.email);
    assert.equal(stamp((await load(ownerId)).emailVerified), stamp(owner.emailVerified));

    const fbProfileId = crypto.randomUUID();
    const fbId = `fb_${fbProfileId}`;
    const fbEmail = freshEmail("l7fb");
    const fb = await seed({ id: fbId, email: fbEmail, authProvider: "facebook" });
    const fbResult = await facebookLogin(fbProfileId, ownerEmail);
    assert.ok(fbResult.err, "Facebook login fails instead of merging or clearing either row");
    assert.equal(isUniqueViolation(fbResult.err), true, errorText(fbResult.err));
    assert.equal((await load(fbId)).email, fb.email);
    assert.equal(stamp((await load(fbId)).emailVerified), stamp(fb.emailVerified));
    assert.equal((await load(ownerId)).email, owner.email);

    const replitId = track(`r156-l7r-${crypto.randomUUID()}`);
    const replitEmail = freshEmail("l7replit");
    const replit = await seed({ id: replitId, email: replitEmail, authProvider: "replit" });
    await assert.rejects(
      () => upsertUser({ sub: replitId, email: ownerEmail, email_verified: true, first_name: "Kept" }),
      (err: unknown) => {
        if (!isUniqueViolation(err)) throw new Error(`expected unique violation, got: ${errorText(err)}`);
        return true;
      },
    );
    assert.equal((await load(replitId)).email, replit.email);
    assert.equal(stamp((await load(replitId)).emailVerified), stamp(replit.emailVerified));
    assert.equal((await load(ownerId)).email, owner.email);
    assert.equal(stamp((await load(ownerId)).emailVerified), stamp(owner.emailVerified));
  });

  it("L8 staff follow the same email rule, and a first-time login still does not merge into staff", async () => {
    const adminProfile = crypto.randomUUID();
    const adminId = `fb_${adminProfile}`;
    const adminEmail = freshEmail("l8admin");
    await seed({ id: adminId, email: adminEmail, role: "admin", authProvider: "facebook" });
    const adminNext = freshEmail("l8adminnext");
    const adminLogin = await facebookLogin(adminProfile, adminNext);
    assert.equal(adminLogin.err, null, errorText(adminLogin.err));
    const adminAfter = await load(adminId);
    assert.equal(adminAfter.role, "admin");
    assert.equal(adminAfter.email, adminNext);
    assert.equal(adminAfter.emailVerified, null);

    const supportId = track(`r156-l8s-${crypto.randomUUID()}`);
    const supportEmail = freshEmail("l8support");
    await seed({ id: supportId, email: supportEmail, role: "support", authProvider: "replit" });
    assert.equal(await upsertUser({ sub: supportId, first_name: "Kept" }), supportId);
    const supportAfter = await load(supportId);
    assert.equal(supportAfter.role, "support");
    assert.equal(supportAfter.email, supportEmail);
    assert.equal(stamp(supportAfter.emailVerified), PRIOR_VERIFIED.getTime());

    const staffId = track(`r156-l8m-${crypto.randomUUID()}`);
    const staffEmail = freshEmail("l8staff");
    const staff = await seed({ id: staffId, email: staffEmail, role: "moderator" });
    const stranger = `r156-l8stranger-${crypto.randomUUID()}`;
    await assert.rejects(
      () => upsertUser({ sub: stranger, email: staffEmail, email_verified: true, first_name: "Stranger" }),
      (err: unknown) => {
        if (!errorText(err).includes(EMAIL_SIGN_IN_REQUIRED)) {
          throw new Error(`expected ${EMAIL_SIGN_IN_REQUIRED}, got: ${errorText(err)}`);
        }
        return true;
      },
    );
    assert.equal((await load(staffId)).email, staff.email);
    assert.equal(stamp((await load(staffId)).emailVerified), stamp(staff.emailVerified));
    const strangerRows = await db.select({ id: users.id }).from(users).where(eq(users.id, stranger));
    assert.equal(strangerRows.length, 0);

    const fbStranger = crypto.randomUUID();
    const fbResult = await facebookLogin(fbStranger, staffEmail);
    assert.equal(fbResult.err, null);
    assert.equal(fbResult.user, false);
    assert.equal(fbResult.info?.code, EMAIL_SIGN_IN_REQUIRED);
    assert.equal((await load(staffId)).email, staff.email);
    const fbRows = await db.select({ id: users.id }).from(users).where(eq(users.id, `fb_${fbStranger}`));
    assert.equal(fbRows.length, 0);
  });

  it("a caller-stated emailVerified is kept when the address changes, and left alone when it does not", async () => {
    const changed = track(`r156-stated-${crypto.randomUUID()}`);
    const changedEmail = freshEmail("stated");
    await seed({ id: changed, email: changedEmail });
    const next = freshEmail("statednext");
    await authStorage.upsertUser(
      { id: changed, email: next, emailVerified: STATED_VERIFIED, firstName: "Kept" },
      { providerEmailVerified: true },
    );
    let row = await load(changed);
    assert.equal(row.email, next);
    assert.equal(stamp(row.emailVerified), STATED_VERIFIED.getTime());

    const same = track(`r156-stated-same-${crypto.randomUUID()}`);
    const sameEmail = freshEmail("statedsame");
    await seed({ id: same, email: sameEmail });
    await authStorage.upsertUser({
      id: same,
      email: sameEmail.toUpperCase(),
      emailVerified: STATED_VERIFIED,
      firstName: "Kept",
    });
    row = await load(same);
    assert.equal(row.email, sameEmail);
    assert.equal(stamp(row.emailVerified), PRIOR_VERIFIED.getTime());
  });
});
