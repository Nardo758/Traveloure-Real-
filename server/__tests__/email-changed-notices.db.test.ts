/**
 * Row 172 slice d: one email_changed_old notice after an unverified account
 * changes its address.
 *
 * The notice goes to the previous address, with no link, no token, and no
 * address in the body. The new address still gets the existing
 * email_verification mail. There is no email_changed_new type.
 * readdressOutboxOnEmailChange runs before the notice is queued.
 *
 * DISPOSABLE DB ONLY. Every row this file writes, it deletes. RESEND_API_KEY
 * is removed so nothing leaves the process.
 *
 *   NODE_ENV=test SESSION_COOKIE_INSECURE=1 \
 *   npx tsx --test --test-concurrency=1 --test-force-exit \
 *   server/__tests__/email-changed-notices.db.test.ts
 */
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const priorSends = process.env.EMAIL_SENDS_ENABLED;
const priorAllow = process.env.EMAIL_TEMPLATE_ALLOWLIST;
const priorResend = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { db, pool } = await import("../db");
const { eq, inArray, and } = await import("drizzle-orm");
const { users, emailVerificationTokens } = await import("../../shared/models/auth");
const { emailOutbox } = await import("../../shared/schema");
const { _outboxTestHooks } = await import("../services/email-outbox.service");
const { _emailChangedNoticeTestHooks } = await import("../services/email.service");
const { EMAIL_CHANGED_OLD_COPY } = await import("../services/email-changed-copy");
const {
  changeUnverifiedEmail,
  _changeUnverifiedEmailTestHooks,
} = await import("../services/email-verification.service");
const { readdressOutboxOnEmailChange } = await import("../services/email-outbox-readdress");
const { authStorage } = await import("../replit_integrations/auth/storage");

const RUN = crypto.randomUUID().slice(0, 8);
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

async function assertDisposableDb(): Promise<void> {
  const found = await pool.query("SELECT inet_server_addr()::text AS addr");
  const addr: string | null = found.rows[0]?.addr ?? null;
  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; }
  })();
  const ok = (host !== null && DISPOSABLE_HOSTS.has(host)) || addr === null || DISPOSABLE_HOSTS.has(addr.split("/")[0]);
  if (!ok) throw new Error(`email-changed-notices refuses a non-local database (${host ?? "unknown host"})`);
}

function setSends(value: string | undefined): void {
  if (value === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = value;
}

function setAllow(value: string | undefined): void {
  if (value === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
  else process.env.EMAIL_TEMPLATE_ALLOWLIST = value;
}

const fixtureIds: string[] = [];
const fixtureEmails: string[] = [];

function freshEmail(label: string): string {
  const email = `ecn-${label}-${crypto.randomUUID()}@example.test`;
  fixtureEmails.push(email);
  return email;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function account(opts: { verified?: boolean; deleted?: boolean; suspended?: boolean; email?: string } = {}) {
  const id = crypto.randomUUID();
  const email = opts.email ?? freshEmail(opts.verified ? "yes" : "no");
  fixtureIds.push(id);
  await db.insert(users).values({
    id,
    email,
    firstName: "Nia",
    lastName: "Fixture",
    role: "user",
    password: "old-hash",
    emailVerified: opts.verified ? new Date() : null,
    isDeleted: opts.deleted ?? false,
    isSuspended: opts.suspended ?? false,
  } as any);
  return { id, email };
}

async function emailOf(id: string): Promise<string | null> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, id));
  return row?.email ?? null;
}

type OutboxRow = {
  id: number;
  emailType: string;
  toEmail: string;
  subject: string;
  html: string;
  textBody: string | null;
  status: string;
  expiresAt: Date | null;
  lastError: string | null;
  metadata: unknown;
};

async function rowsOfType(emailType: string, toEmail?: string): Promise<OutboxRow[]> {
  const where = toEmail
    ? and(eq(emailOutbox.emailType, emailType), eq(emailOutbox.toEmail, toEmail))
    : eq(emailOutbox.emailType, emailType);
  return db.select({
    id: emailOutbox.id,
    emailType: emailOutbox.emailType,
    toEmail: emailOutbox.toEmail,
    subject: emailOutbox.subject,
    html: emailOutbox.html,
    textBody: emailOutbox.textBody,
    status: emailOutbox.status,
    expiresAt: emailOutbox.expiresAt,
    lastError: emailOutbox.lastError,
    metadata: emailOutbox.metadata,
  }).from(emailOutbox).where(where);
}

function metaOf(row: OutboxRow): Record<string, unknown> {
  const metadata = row.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
  return {};
}

async function waitFor(load: () => Promise<OutboxRow[]>, count: number): Promise<OutboxRow[]> {
  const start = Date.now();
  let rows: OutboxRow[] = [];
  while (Date.now() - start < 3000) {
    rows = await load();
    if (rows.length >= count) return rows;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return rows;
}

async function waitUntilSettled(load: () => Promise<OutboxRow[]>): Promise<OutboxRow[]> {
  const start = Date.now();
  let rows: OutboxRow[] = [];
  while (Date.now() - start < 3000) {
    rows = await load();
    if (rows.length > 0 && rows.every((row) => row.status !== "processing")) return rows;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return rows;
}

function clearHooks(): void {
  delete _emailChangedNoticeTestHooks.enqueueEmail;
  delete _changeUnverifiedEmailTestHooks.beforeUpdate;
  delete _changeUnverifiedEmailTestHooks.readdress;
  delete _changeUnverifiedEmailTestHooks.sendNotice;
  delete _outboxTestHooks.sendEmailFn;
}

async function insertPending(emailType: string, toAddress: string): Promise<number> {
  const inserted = await pool.query(
    `INSERT INTO email_outbox (email_type, to_email, subject, html, status, metadata)
     VALUES ($1, $2, $3, '<p>seed</p>', 'pending', $4::jsonb)
     RETURNING id`,
    [emailType, toAddress, `seed ${emailType}`, JSON.stringify({ run: RUN, seed: emailType })],
  );
  return Number(inserted.rows[0].id);
}

async function snap(id: number): Promise<unknown> {
  const found = await pool.query(
    `SELECT to_jsonb(email_outbox.*) AS doc FROM email_outbox WHERE id = $1`,
    [id],
  );
  assert.equal(found.rowCount, 1);
  return found.rows[0].doc;
}

describe("email_changed_old notice after an unverified address change (row 172 slice d)", () => {
  before(async () => {
    assert.equal(process.env.NODE_ENV, "test");
    await assertDisposableDb();
  });

  beforeEach(() => {
    setSends(priorSends);
    setAllow(priorAllow);
    clearHooks();
  });

  after(async () => {
    setSends(priorSends);
    setAllow(priorAllow);
    if (priorResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorResend;
    clearHooks();
    if (fixtureEmails.length) {
      await db.delete(emailOutbox).where(inArray(emailOutbox.toEmail, fixtureEmails));
    }
    await pool.query(`DELETE FROM email_outbox WHERE metadata->>'run' = $1`, [RUN]);
    for (const id of fixtureIds) {
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("PD1 a successful change queues one email_changed_old row to the old address", async () => {
    setSends(undefined);
    const user = await account();
    const next = freshEmail("pd1");
    await changeUnverifiedEmail(user.id, next, null);
    assert.equal(await emailOf(user.id), next);
    const rows = await rowsOfType("email_changed_old", user.email);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].toEmail, user.email);
    assert.equal(metaOf(rows[0]).authCritical, true);
    assert.equal(rows[0].expiresAt, null);
    const html = rows[0].html;
    const text = rows[0].textBody ?? "";
    assert.equal(html.includes("http"), false);
    assert.equal(text.includes("http"), false);
    assert.equal(html.includes("token="), false);
    assert.equal(text.includes("token="), false);
    const verify = await waitFor(() => rowsOfType("email_verification", next), 1);
    assert.equal(verify.length, 1);
    const tokenMatch = verify[0].html.match(/token=([^"&\s]+)/);
    assert.ok(tokenMatch, "verification mail still carries its link");
    const token = decodeURIComponent(tokenMatch[1]);
    assert.equal(html.includes(token), false);
    assert.equal(text.includes(token), false);
    assert.equal(html.includes(sha256(token)), false);
    assert.equal(text.includes(sha256(token)), false);
  });

  it("PD2 the new address gets one email_verification and no email_changed_new", async () => {
    setSends(undefined);
    const user = await account();
    const next = freshEmail("pd2");
    await changeUnverifiedEmail(user.id, next, null);
    const verify = await waitFor(() => rowsOfType("email_verification", next), 1);
    assert.equal(verify.length, 1);
    assert.equal(verify[0].toEmail, next);
    assert.equal((await rowsOfType("email_changed_new", next)).length, 0);
    assert.equal((await rowsOfType("email_changed_new", user.email)).length, 0);
    assert.equal((await rowsOfType("email_changed_old", next)).length, 0);
    assert.equal((await rowsOfType("email_verification", user.email)).length, 0);
  });

  it("PD3 the same address sends no old-address notice", async () => {
    setSends(undefined);
    const user = await account();
    await changeUnverifiedEmail(user.id, user.email, null);
    assert.equal(await emailOf(user.id), user.email);
    const verify = await waitFor(() => rowsOfType("email_verification", user.email), 1);
    assert.equal(verify.length, 1);
    assert.equal((await rowsOfType("email_changed_old", user.email)).length, 0);
  });

  it("PD4 taken, verified, suspended, deleted, and a unique violation send no notice", async () => {
    setSends(undefined);

    const held = await account();
    const occupant = await account();
    await changeUnverifiedEmail(held.id, occupant.email, null);
    assert.equal(await emailOf(held.id), held.email);
    assert.equal((await rowsOfType("email_changed_old", held.email)).length, 0);
    assert.equal((await rowsOfType("email_verification", occupant.email)).length, 0);

    const verified = await account({ verified: true });
    const verifiedNext = freshEmail("verified-next");
    await changeUnverifiedEmail(verified.id, verifiedNext, null);
    assert.equal(await emailOf(verified.id), verified.email);
    assert.equal((await rowsOfType("email_changed_old", verified.email)).length, 0);

    const suspended = await account({ suspended: true });
    const suspendedNext = freshEmail("suspended-next");
    await changeUnverifiedEmail(suspended.id, suspendedNext, null);
    assert.equal(await emailOf(suspended.id), suspended.email);
    assert.equal((await rowsOfType("email_changed_old", suspended.email)).length, 0);

    const deleted = await account({ deleted: true });
    const deletedNext = freshEmail("deleted-next");
    await changeUnverifiedEmail(deleted.id, deletedNext, null);
    assert.equal(await emailOf(deleted.id), deleted.email);
    assert.equal((await rowsOfType("email_changed_old", deleted.email)).length, 0);

    const left = await account();
    const right = await account();
    const raced = freshEmail("race");
    let entered = 0;
    let settled = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("both changes did not reach the update"));
      }, 5000);
      release = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
    });
    _changeUnverifiedEmailTestHooks.beforeUpdate = async () => {
      entered += 1;
      if (entered >= 2) release();
      await gate;
    };
    await Promise.all([
      changeUnverifiedEmail(left.id, raced, null),
      changeUnverifiedEmail(right.id, raced, null),
    ]);
    assert.equal(entered, 2);
    const leftEmail = await emailOf(left.id);
    const rightEmail = await emailOf(right.id);
    const winner = leftEmail === raced ? left : right;
    const loser = leftEmail === raced ? right : left;
    assert.equal([leftEmail, rightEmail].filter((value) => value === raced).length, 1);
    assert.equal(await emailOf(loser.id), loser.email);
    assert.equal((await rowsOfType("email_changed_old", loser.email)).length, 0);
    assert.equal((await rowsOfType("email_changed_old", winner.email)).length, 1);
  });

  it("PD5 a throwing notice does not block the verification mail or the return", async () => {
    setSends(undefined);
    _changeUnverifiedEmailTestHooks.sendNotice = async () => {
      throw new Error("email_changed_old sender stub");
    };
    const user = await account();
    const next = freshEmail("pd5");
    await changeUnverifiedEmail(user.id, next, null);
    assert.equal(await emailOf(user.id), next);
    const verify = await waitFor(() => rowsOfType("email_verification", next), 1);
    assert.equal(verify.length, 1);
    assert.equal(verify[0].toEmail, next);
    assert.equal((await rowsOfType("email_changed_old", user.email)).length, 0);

    delete _changeUnverifiedEmailTestHooks.sendNotice;
    _emailChangedNoticeTestHooks.enqueueEmail = async () => {
      throw new Error("enqueue stub");
    };
    const second = await account();
    const secondNext = freshEmail("pd5b");
    await changeUnverifiedEmail(second.id, secondNext, null);
    assert.equal(await emailOf(second.id), secondNext);
    assert.equal((await waitFor(() => rowsOfType("email_verification", secondNext), 1)).length, 1);
    assert.equal((await rowsOfType("email_changed_old", second.email)).length, 0);
  });

  it("PD6 metadata hashes the new address and the body shows no address", async () => {
    setSends(undefined);
    const user = await account();
    const next = freshEmail("pd6");
    await changeUnverifiedEmail(user.id, next, null);
    const [row] = await rowsOfType("email_changed_old", user.email);
    assert.ok(row);
    const html = row.html;
    const text = row.textBody ?? "";
    const hash = sha256(next);
    const prefix = `email_changed_old:${user.id}:${hash}:`;
    const dedupeKey = String(metaOf(row).dedupeKey ?? "");
    assert.equal(dedupeKey.startsWith(prefix), true);
    const stamp = dedupeKey.slice(prefix.length);
    assert.equal(Number.isNaN(Date.parse(stamp)), false);
    assert.equal(html.includes("@"), false);
    assert.equal(text.includes("@"), false);
    assert.equal(row.subject.includes("@"), false);
    assert.equal(html.includes(next), false);
    assert.equal(text.includes(next), false);
    assert.equal(html.includes(user.email), false);
    assert.equal(text.includes(user.email), false);
    assert.equal(html.includes(hash), false);
    assert.equal(text.includes(hash), false);
    assert.equal(html.includes(stamp), false);
    assert.equal(text.includes(stamp), false);
    const metadataJson = JSON.stringify(row.metadata);
    assert.equal(metadataJson.includes(next), false);
    assert.equal(metadataJson.includes(user.email), false);
    assert.equal(metadataJson.includes(hash), true);
    assert.equal(row.subject, EMAIL_CHANGED_OLD_COPY.subject);
    assert.match(html, new RegExp(`>${EMAIL_CHANGED_OLD_COPY.heading}<`));
    assert.equal(text.split("\n")[0], EMAIL_CHANGED_OLD_COPY.heading);
    const bodyLines = text.split("\n").filter((line) => line.length > 0 && line !== EMAIL_CHANGED_OLD_COPY.heading);
    assert.deepEqual(bodyLines, [...EMAIL_CHANGED_OLD_COPY.body]);
    for (const line of EMAIL_CHANGED_OLD_COPY.body) assert.equal(html.includes(line), true, line);
  });

  it("PD7 the row is held until email_changed_old is allowlisted, then the stub is called once", async () => {
    setSends("true");
    setAllow("password_reset");
    const sends: string[] = [];
    _outboxTestHooks.sendEmailFn = async (params) => {
      sends.push(String(params.to));
      return { ok: true, id: "stub-email-changed-old" };
    };
    const held = await account();
    const heldNext = freshEmail("pd7-held");
    await changeUnverifiedEmail(held.id, heldNext, null);
    const heldRows = await rowsOfType("email_changed_old", held.email);
    assert.equal(heldRows.length, 1);
    assert.equal(heldRows[0].status, "held");
    assert.equal(heldRows[0].expiresAt, null);
    const heldVerify = await waitUntilSettled(() => rowsOfType("email_verification", heldNext));
    assert.equal(heldVerify.length, 1);
    assert.equal(heldVerify[0].status, "held");
    assert.equal(sends.length, 0);

    setAllow("email_changed_old");
    const sent = await account();
    const sentNext = freshEmail("pd7-sent");
    await changeUnverifiedEmail(sent.id, sentNext, null);
    const sentRows = await rowsOfType("email_changed_old", sent.email);
    assert.equal(sentRows.length, 1);
    assert.equal(sentRows[0].status, "sent");
    assert.equal(sentRows[0].toEmail, sent.email);
    assert.deepEqual(sends, [sent.email]);
  });

  it("PD8 readdress runs before the notice, and the old-address notice stays put", async () => {
    setSends(undefined);
    const user = await account();
    const next = freshEmail("pd8");
    const mustHave = await insertPending("booking_confirmation", user.email);
    const security = await insertPending("password_reset", user.email);
    const marketing = await insertPending("signup_welcome", user.email);
    const exempt = await insertPending("email_changed_old", user.email);
    const exemptBefore = await snap(exempt);
    const order: string[] = [];
    _changeUnverifiedEmailTestHooks.readdress = async (input) => {
      order.push("readdress");
      assert.equal(input.oldEmail, user.email);
      assert.equal(input.newEmail, next);
      return readdressOutboxOnEmailChange(input);
    };
    _changeUnverifiedEmailTestHooks.sendNotice = async (params) => {
      order.push("notice");
      assert.deepEqual(order, ["readdress", "notice"]);
      const already = await rowsOfType("email_changed_old", user.email);
      assert.equal(already.length, 1);
      assert.equal(already[0].id, exempt);
      const moved = await pool.query(`SELECT to_email FROM email_outbox WHERE id = $1`, [mustHave]);
      assert.equal(moved.rows[0].to_email, next);
      return sendRealNotice(params);
    };
    await changeUnverifiedEmail(user.id, next, null);
    assert.deepEqual(order, ["readdress", "notice"]);

    const mustRow = await snap(mustHave) as { to_email: string; status: string; metadata: { readdressedFrom?: string } };
    const securityRow = await snap(security) as { to_email: string; status: string };
    const marketingRow = await snap(marketing) as { to_email: string; status: string; last_error: string };
    assert.equal(mustRow.to_email, next);
    assert.equal(mustRow.status, "pending");
    assert.equal(mustRow.metadata.readdressedFrom, user.email);
    assert.equal(securityRow.to_email, next);
    assert.equal(securityRow.status, "pending");
    assert.equal(marketingRow.status, "cancelled");
    assert.equal(marketingRow.last_error, "readdressed: address changed");
    assert.equal(marketingRow.to_email, user.email);
    assert.deepEqual(await snap(exempt), exemptBefore);

    const notices = await rowsOfType("email_changed_old", user.email);
    assert.equal(notices.length, 2);
    const created = notices.find((row) => row.id !== exempt);
    assert.ok(created);
    assert.equal(created.toEmail, user.email);
    assert.equal(metaOf(created).readdressedFrom, undefined);
    assert.equal(metaOf(created).authCritical, true);

    const liveAtOld = await pool.query(
      `SELECT email_type FROM email_outbox
       WHERE lower(btrim(to_email)) = lower(btrim($1))
         AND status IN ('pending', 'failed', 'held', 'processing')`,
      [user.email],
    );
    assert.ok(liveAtOld.rows.length >= 1);
    for (const row of liveAtOld.rows) assert.equal(row.email_type, "email_changed_old");
  });

  it("PD9 the change path still has one users.email write, and a blank login does not clear it", async () => {
    const src = fs.readFileSync(new URL("../services/email-verification.service.ts", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const sets: string[] = [];
    const re = /\.update\(users\)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(code))) {
      const window = code.slice(match.index, match.index + 500);
      const setAt = window.indexOf(".set(");
      if (setAt === -1) continue;
      const open = match.index + setAt + ".set".length;
      let depth = 0;
      for (let i = open; i < code.length; i++) {
        const ch = code[i];
        if (ch === "(" || ch === "{" || ch === "[") depth++;
        else if (ch === ")" || ch === "}" || ch === "]") {
          depth--;
          if (depth === 0) {
            sets.push(code.slice(open + 1, i));
            break;
          }
        }
      }
    }
    const emailSets = sets.filter((arg) => /(?<![A-Za-z0-9_])email\s*:/.test(arg));
    assert.equal(emailSets.length, 1);
    assert.match(emailSets[0], /email:\s*next/);

    const user = await account({ verified: true });
    await authStorage.upsertUser({ id: user.id, email: null, firstName: "Kept" });
    assert.equal(await emailOf(user.id), user.email);
    await authStorage.upsertUser({ id: user.id, email: "   ", firstName: "Kept" });
    assert.equal(await emailOf(user.id), user.email);
    await authStorage.upsertUser({ id: user.id, firstName: "Kept" });
    assert.equal(await emailOf(user.id), user.email);
  });
});

async function sendRealNotice(params: {
  toEmail: string;
  userId: string;
  newEmail: string;
  changedAt: string;
}): Promise<void> {
  const { sendEmailChangedOldAddressEmail } = await import("../services/email.service");
  await sendEmailChangedOldAddressEmail(params);
}
