/**
 * Row 168 (Z-18). On an address change, claimable must-have and security
 * outbox rows are rewritten onto the new address and re-queued. Every other
 * claimable row is cancelled. Old-address-by-design and not-account-bound
 * rows are left alone. No copy is inserted.
 *
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit \
 *     server/__tests__/email-outbox-readdress.db.test.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { db, pool } from "../db";
import { logger } from "../infrastructure/logger";
import {
  CANCELLED_BY_DEFAULT_EMAIL_TYPES,
  MUST_HAVE_EMAIL_TYPES,
  NOT_ACCOUNT_BOUND_EMAIL_TYPES,
  OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES,
  SECURITY_EMAIL_TYPES,
  classifyOutboxEmail,
  isDeliveryPriorityEmail,
} from "../services/email-outbox-classes";
import { OUTBOX_EXPIRED_REASON, UNWINDOWED_EMAIL_TYPES } from "../services/email-outbox-expiry";
import { _outboxTestHooks, drainOutbox } from "../services/email-outbox.service";
import { readdressOutboxOnEmailChange } from "../services/email-outbox-readdress";

const RUN = randomUUID().slice(0, 8);
const ADDRESS_CHANGED = "readdressed: address changed";
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
const origSends = process.env.EMAIL_SENDS_ENABLED;
const origAllow = process.env.EMAIL_TEMPLATE_ALLOWLIST;
const origTransaction = db.transaction.bind(db);
const origError = logger.error.bind(logger);
const userIds: string[] = [];

type WindowKind = "none" | "past" | "future";
type LeaseKind = "none" | "live" | "expired";

function oldAddress(label: string): string {
  return `ra-${RUN}-${label}-old@example.test`;
}

function newAddress(label: string): string {
  return `ra-${RUN}-${label}-new@example.test`;
}

async function assertDisposableDb(): Promise<void> {
  const found = await pool.query("SELECT inet_server_addr()::text AS addr");
  const addr: string | null = found.rows[0]?.addr ?? null;
  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; }
  })();
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    addr === null ||
    DISPOSABLE_HOSTS.has(addr.split("/")[0]);
  if (!ok) throw new Error(`email-outbox-readdress refuses a non-local database (${host ?? "unknown host"})`);
}

async function insertRow(opts: {
  emailType: string;
  toAddress: string;
  status?: string;
  attemptCount?: number;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
  window?: WindowKind;
  lease?: LeaseKind;
}): Promise<number> {
  const metadata = { ...(opts.metadata ?? {}), run: RUN };
  const inserted = await pool.query(
    `INSERT INTO email_outbox (
       email_type, to_email, subject, html, status, attempt_count, last_error,
       retry_after, metadata, expires_at
     ) VALUES (
       $1, $2, $3, '<p>notice</p>', $4, $5, $6,
       CASE $7::text
         WHEN 'live' THEN NOW() + INTERVAL '1 hour'
         WHEN 'expired' THEN NOW() - INTERVAL '5 minutes'
         ELSE NULL
       END,
       $8::jsonb,
       CASE $9::text
         WHEN 'past' THEN NOW() - INTERVAL '1 hour'
         WHEN 'future' THEN NOW() + INTERVAL '1 day'
         ELSE NULL
       END
     )
     RETURNING id`,
    [
      opts.emailType,
      opts.toAddress,
      `subject ${opts.emailType}`,
      opts.status ?? "pending",
      opts.attemptCount ?? 0,
      opts.lastError ?? null,
      opts.lease ?? "none",
      JSON.stringify(metadata),
      opts.window ?? "none",
    ],
  );
  return Number(inserted.rows[0].id);
}

async function load(id: number): Promise<Record<string, unknown>> {
  const found = await pool.query(`SELECT * FROM email_outbox WHERE id = $1`, [id]);
  assert.equal(found.rowCount, 1);
  return found.rows[0];
}

async function snap(id: number): Promise<unknown> {
  const found = await pool.query(
    `SELECT to_jsonb(email_outbox.*) AS doc FROM email_outbox WHERE id = $1`,
    [id],
  );
  return found.rows[0].doc;
}

function metaOf(row: Record<string, unknown>): Record<string, unknown> {
  const metadata = row.metadata;
  if (metadata && typeof metadata === "object") return metadata as Record<string, unknown>;
  return {};
}

async function runCount(): Promise<number> {
  const found = await pool.query(
    `SELECT count(*)::int AS n FROM email_outbox WHERE metadata->>'run' = $1`,
    [RUN],
  );
  return found.rows[0].n;
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await assertDisposableDb();
});

after(async () => {
  (db as { transaction: typeof db.transaction }).transaction = origTransaction;
  (logger as { error: typeof logger.error }).error = origError;
  delete _outboxTestHooks.sendEmailFn;
  if (origSends === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = origSends;
  if (origAllow === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
  else process.env.EMAIL_TEMPLATE_ALLOWLIST = origAllow;
  await pool.query(`DELETE FROM email_outbox WHERE metadata->>'run' = $1`, [RUN]);
  if (userIds.length) {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [userIds]);
  }
});

describe("readdressOutboxOnEmailChange", () => {
  it("RA1: rewrites a must-have row and a security row onto the new address", async () => {
    const old = oldAddress("ra1");
    const next = newAddress("ra1");
    const at = new Date("2026-10-26T22:00:00.000Z");
    const booking = await insertRow({
      emailType: "booking_confirmation",
      toAddress: old,
      metadata: { keep: "yes", n: 1 },
    });
    const reset = await insertRow({
      emailType: "password_reset",
      toAddress: old,
      metadata: { keep: "reset", n: 2 },
    });

    const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next, now: at });
    assert.equal(result.readdressed, 2);
    assert.equal(result.cancelled, 0);

    for (const id of [booking, reset]) {
      const row = await load(id);
      assert.equal(row.to_email, next);
      assert.equal(row.status, "pending");
      assert.equal(row.retry_after, null);
      const metadata = metaOf(row);
      assert.equal(metadata.readdressedFrom, old);
      assert.equal(metadata.readdressedAt, at.toISOString());
      assert.equal(metadata.readdressReason, "readdressed");
      assert.equal(metadata.run, RUN);
    }
    assert.equal(metaOf(await load(booking)).keep, "yes");
    assert.equal(metaOf(await load(booking)).n, 1);
    assert.equal(metaOf(await load(reset)).keep, "reset");
    assert.equal(metaOf(await load(reset)).n, 2);
  });

  it("RA2: cancels marketing, welcome, and an unknown type without rewriting them", async () => {
    const old = oldAddress("ra2");
    const next = newAddress("ra2");
    const ids = {
      nudge: await insertRow({ emailType: "itinerary_nudge_2h", toAddress: old }),
      welcome: await insertRow({ emailType: "signup_welcome", toAddress: old }),
      unknown: await insertRow({ emailType: "zz_unknown", toAddress: old }),
    };
    const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });
    assert.equal(result.readdressed, 0);
    assert.equal(result.cancelled, 3);
    for (const id of Object.values(ids)) {
      const row = await load(id);
      assert.equal(row.to_email, old);
      assert.equal(row.status, "cancelled");
      assert.equal(row.retry_after, null);
      assert.equal(row.last_error, ADDRESS_CHANGED);
    }
  });

  it("RA3: leaves terminal rows and a live lease alone, and re-queues an expired lease", async () => {
    const old = oldAddress("ra3");
    const next = newAddress("ra3");
    const sent = await insertRow({ emailType: "booking_confirmation", toAddress: old, status: "sent" });
    const dead = await insertRow({ emailType: "booking_confirmation", toAddress: old, status: "dead" });
    const cancelled = await insertRow({ emailType: "booking_confirmation", toAddress: old, status: "cancelled" });
    const live = await insertRow({
      emailType: "booking_confirmation",
      toAddress: old,
      status: "processing",
      lease: "live",
    });
    const expiredLease = await insertRow({
      emailType: "booking_confirmation",
      toAddress: old,
      status: "processing",
      lease: "expired",
    });
    const before = {
      sent: await snap(sent),
      dead: await snap(dead),
      cancelled: await snap(cancelled),
      live: await snap(live),
    };

    const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });
    assert.equal(result.readdressed, 1);
    assert.equal(result.cancelled, 0);
    assert.deepEqual(await snap(sent), before.sent);
    assert.deepEqual(await snap(dead), before.dead);
    assert.deepEqual(await snap(cancelled), before.cancelled);
    assert.deepEqual(await snap(live), before.live);

    const moved = await load(expiredLease);
    assert.equal(moved.to_email, next);
    assert.equal(moved.status, "pending");
    assert.equal(moved.retry_after, null);
  });

  it("RA4: re-queues failed and held must-have rows and keeps attempt_count and last_error", async () => {
    const old = oldAddress("ra4");
    const next = newAddress("ra4");
    const failed = await insertRow({
      emailType: "payment_failed",
      toAddress: old,
      status: "failed",
      attemptCount: 3,
      lastError: "provider down",
      lease: "live",
    });
    const held = await insertRow({
      emailType: "plan_delivered",
      toAddress: old,
      status: "held",
      attemptCount: 1,
      lastError: "EMAIL_TEMPLATE_ALLOWLIST",
    });

    const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });
    assert.equal(result.readdressed, 2);
    assert.equal(result.cancelled, 0);

    const failedRow = await load(failed);
    assert.equal(failedRow.to_email, next);
    assert.equal(failedRow.status, "pending");
    assert.equal(failedRow.retry_after, null);
    assert.equal(Number(failedRow.attempt_count), 3);
    assert.equal(failedRow.last_error, "provider down");

    const heldRow = await load(held);
    assert.equal(heldRow.to_email, next);
    assert.equal(heldRow.status, "pending");
    assert.equal(heldRow.retry_after, null);
    assert.equal(Number(heldRow.attempt_count), 1);
    assert.equal(heldRow.last_error, "EMAIL_TEMPLATE_ALLOWLIST");
  });

  it("RA5: leaves no claimable non-exempt copy on the old address and inserts nothing", async () => {
    const old = oldAddress("ra5");
    const next = newAddress("ra5");
    await insertRow({ emailType: "booking_confirmation", toAddress: old });
    await insertRow({ emailType: "password_reset", toAddress: old });
    await insertRow({ emailType: "signup_welcome", toAddress: old });
    await insertRow({ emailType: "email_changed_old", toAddress: old });
    const before = await runCount();
    const addressesBefore = await addressCount([old, next]);

    await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });

    const exempt = [...OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES, ...NOT_ACCOUNT_BOUND_EMAIL_TYPES];
    const remaining = await pool.query(
      `SELECT count(*)::int AS n
         FROM email_outbox
        WHERE lower(btrim(to_email)) = lower(btrim($1))
          AND position(',' in to_email) = 0
          AND (
            status IN ('pending', 'failed', 'held')
            OR (status = 'processing' AND retry_after < NOW() - INTERVAL '1 minute')
          )
          AND email_type <> ALL($2::text[])`,
      [old, exempt],
    );
    assert.equal(remaining.rows[0].n, 0);
    assert.equal(await runCount(), before);
    assert.equal(await addressCount([old, next]), addressesBefore);
  });

  it("RA6: matches a trimmed, different-case address and skips a multi-recipient row", async () => {
    const old = oldAddress("ra6");
    const next = newAddress("ra6");
    const padded = `  ${old.toUpperCase()}  `;
    const row = await insertRow({ emailType: "booking_confirmation", toAddress: padded });
    const multi = await insertRow({
      emailType: "booking_confirmation",
      toAddress: `${old}, ${next}`,
    });
    const multiBefore = await snap(multi);

    const result = await readdressOutboxOnEmailChange({
      oldEmail: `  ${old.toUpperCase()}  `,
      newEmail: `  ${next.toUpperCase()}  `,
    });
    assert.equal(result.readdressed, 1);
    const moved = await load(row);
    assert.equal(moved.to_email, next);
    assert.equal(moved.status, "pending");
    assert.equal(metaOf(moved).readdressedFrom, old);
    assert.deepEqual(await snap(multi), multiBefore);
  });

  it("RA7: does not touch a row for a different address", async () => {
    const old = oldAddress("ra7");
    const next = newAddress("ra7");
    const other = `ra-${RUN}-ra7-other@example.test`;
    const row = await insertRow({ emailType: "booking_confirmation", toAddress: other });
    const before = await snap(row);
    const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });
    assert.deepEqual(result, { readdressed: 0, cancelled: 0 });
    assert.deepEqual(await snap(row), before);
  });

  it("RA8: equal addresses and empty arguments are no-ops", async () => {
    const old = oldAddress("ra8");
    const row = await insertRow({ emailType: "booking_confirmation", toAddress: old });
    const before = await snap(row);
    const equal = await readdressOutboxOnEmailChange({
      oldEmail: `  ${old.toUpperCase()}  `,
      newEmail: old,
    });
    const blankOld = await readdressOutboxOnEmailChange({ oldEmail: "   ", newEmail: newAddress("ra8") });
    const blankNew = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: "" });
    assert.deepEqual(equal, { readdressed: 0, cancelled: 0 });
    assert.deepEqual(blankOld, { readdressed: 0, cancelled: 0 });
    assert.deepEqual(blankNew, { readdressed: 0, cancelled: 0 });
    assert.deepEqual(await snap(row), before);
  });

  it("RA9: does not write users, and a database error returns zeros", async () => {
    const old = oldAddress("ra9");
    const next = newAddress("ra9");
    const userId = randomUUID();
    userIds.push(userId);
    await pool.query(
      `INSERT INTO users (id, email, first_name, role) VALUES ($1, $2, 'Readdress', 'user')`,
      [userId, old],
    );
    await insertRow({ emailType: "booking_confirmation", toAddress: old });
    const beforeUser = await userSnap(userId);

    const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });
    assert.equal(result.readdressed, 1);
    assert.deepEqual(await userSnap(userId), beforeUser);

    const seen: string[] = [];
    (logger as { error: typeof logger.error }).error = ((...args: unknown[]) => {
      seen.push(JSON.stringify(args));
    }) as typeof logger.error;
    (db as { transaction: typeof db.transaction }).transaction = (async () => {
      throw new Error(`forced failure for ${old}`);
    }) as typeof db.transaction;
    try {
      const failed = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: `ra-${RUN}-ra9-other@example.test` });
      assert.deepEqual(failed, { readdressed: 0, cancelled: 0 });
      assert.equal(seen.length > 0, true);
      assert.equal(seen.join("\n").includes("@"), false);
      assert.equal(seen.join("\n").includes(old), false);
      assert.deepEqual(await userSnap(userId), beforeUser);
    } finally {
      (db as { transaction: typeof db.transaction }).transaction = origTransaction;
      (logger as { error: typeof logger.error }).error = origError;
    }
  });

  it("RA10: drain sends each re-addressed row once, to the new address only", async () => {
    const old = oldAddress("ra10");
    const next = newAddress("ra10");
    const reset = await insertRow({ emailType: "password_reset", toAddress: old });
    const verify = await insertRow({ emailType: "email_verification", toAddress: old });
    const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });
    assert.equal(result.readdressed, 2);

    const parked = await parkOtherClaimable(
      ["password_reset", "email_verification"],
      [reset, verify],
    );
    const sent: string[] = [];
    process.env.EMAIL_SENDS_ENABLED = "true";
    process.env.EMAIL_TEMPLATE_ALLOWLIST = "password_reset,email_verification";
    _outboxTestHooks.sendEmailFn = async (params) => {
      sent.push(Array.isArray(params.to) ? params.to.join(",") : params.to);
      return { ok: true, id: `stub-${sent.length}` };
    };
    try {
      const drained = await drainOutbox();
      assert.equal(drained.drained, 2);
      assert.deepEqual(sent, [next, next]);
      assert.equal(sent.includes(old), false);
      assert.equal((await load(reset)).status, "sent");
      assert.equal((await load(verify)).status, "sent");
      assert.equal((await load(reset)).to_email, next);
      assert.equal((await load(verify)).to_email, next);
    } finally {
      delete _outboxTestHooks.sendEmailFn;
      if (origSends === undefined) delete process.env.EMAIL_SENDS_ENABLED;
      else process.env.EMAIL_SENDS_ENABLED = origSends;
      if (origAllow === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
      else process.env.EMAIL_TEMPLATE_ALLOWLIST = origAllow;
      await restoreParked(parked);
    }
  });

  it("RA11: leaves old-address and admin rows alone, and re-addresses an unknown authCritical row", async () => {
    const old = oldAddress("ra11");
    const next = newAddress("ra11");
    const changed = await insertRow({
      emailType: "email_changed_old",
      toAddress: old,
      metadata: { authCritical: true },
    });
    const digest = await insertRow({ emailType: "admin_digest_24h", toAddress: old });
    const flagged = await insertRow({
      emailType: "zz_unknown_auth",
      toAddress: old,
      metadata: { authCritical: true, keep: "flag" },
    });
    const changedBefore = await snap(changed);
    const digestBefore = await snap(digest);

    const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });
    assert.equal(result.readdressed, 1);
    assert.equal(result.cancelled, 0);
    assert.deepEqual(await snap(changed), changedBefore);
    assert.deepEqual(await snap(digest), digestBefore);
    const moved = await load(flagged);
    assert.equal(moved.to_email, next);
    assert.equal(moved.status, "pending");
    assert.equal(metaOf(moved).readdressReason, "readdressed");
    assert.equal(metaOf(moved).keep, "flag");
    assert.equal(metaOf(moved).authCritical, true);
  });

  it("RA12: cancels a past password reset and re-addresses a future one", async () => {
    const old = oldAddress("ra12");
    const next = newAddress("ra12");
    const past = await insertRow({
      emailType: "password_reset",
      toAddress: old,
      window: "past",
    });
    const future = await insertRow({
      emailType: "password_reset",
      toAddress: old,
      window: "future",
    });
    const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });
    assert.equal(result.readdressed, 1);
    assert.equal(result.cancelled, 1);

    const pastRow = await load(past);
    assert.equal(pastRow.to_email, old);
    assert.equal(pastRow.status, "cancelled");
    assert.equal(pastRow.last_error, OUTBOX_EXPIRED_REASON);
    assert.equal(pastRow.retry_after, null);

    const futureRow = await load(future);
    assert.equal(futureRow.to_email, next);
    assert.equal(futureRow.status, "pending");
    assert.equal(metaOf(futureRow).readdressReason, "readdressed");
  });

  it("RA13: every known type is in one set, and the helper matches the class", async () => {
    assert.deepEqual(
      [
        SECURITY_EMAIL_TYPES.length,
        MUST_HAVE_EMAIL_TYPES.length,
        OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES.length,
        NOT_ACCOUNT_BOUND_EMAIL_TYPES.length,
        CANCELLED_BY_DEFAULT_EMAIL_TYPES.length,
      ],
      [2, 22, 1, 7, 15],
    );

    const known = new Set<string>([
      ...UNWINDOWED_EMAIL_TYPES,
      "password_reset",
      "email_verification",
      "itinerary_nudge_2h",
      "itinerary_followup_24h",
    ]);
    assert.equal(known.size, UNWINDOWED_EMAIL_TYPES.length + 4);

    const sets: Array<readonly string[]> = [
      SECURITY_EMAIL_TYPES,
      MUST_HAVE_EMAIL_TYPES,
      OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES,
      NOT_ACCOUNT_BOUND_EMAIL_TYPES,
      CANCELLED_BY_DEFAULT_EMAIL_TYPES,
    ];
    const seen = new Map<string, number>();
    for (const set of sets) {
      for (const name of set) seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    for (const name of known) assert.equal(seen.get(name), 1, name);
    const extras = [...seen.keys()].filter((name) => !known.has(name));
    assert.deepEqual(extras, ["email_changed_old"]);

    assert.equal(isDeliveryPriorityEmail("email_changed_old", { authCritical: true }), true);
    assert.equal(isDeliveryPriorityEmail("password_reset", {}), true);
    assert.equal(isDeliveryPriorityEmail("booking_confirmation", {}), true);
    assert.equal(isDeliveryPriorityEmail("admin_digest_24h", { authCritical: true }), false);
    assert.equal(isDeliveryPriorityEmail("signup_welcome", {}), false);
    assert.equal(classifyOutboxEmail("email_changed_old", { authCritical: true }), "old_address_by_design");
    assert.equal(classifyOutboxEmail("zz_unknown_auth", { authCritical: true }), "security");

    const old = oldAddress("ra13");
    const next = newAddress("ra13");
    const classes = [
      ...SECURITY_EMAIL_TYPES.map((emailType) => ({ emailType, klass: "security" as const })),
      ...MUST_HAVE_EMAIL_TYPES.map((emailType) => ({ emailType, klass: "must_have" as const })),
      ...OLD_ADDRESS_BY_DESIGN_EMAIL_TYPES.map((emailType) => ({ emailType, klass: "old_address_by_design" as const })),
      ...NOT_ACCOUNT_BOUND_EMAIL_TYPES.map((emailType) => ({ emailType, klass: "not_account_bound" as const })),
      ...CANCELLED_BY_DEFAULT_EMAIL_TYPES.map((emailType) => ({ emailType, klass: "cancelled_by_default" as const })),
    ];
    const rows: Array<{ id: number; emailType: string; klass: typeof classes[number]["klass"] }> = [];
    for (const entry of classes) {
      assert.equal(classifyOutboxEmail(entry.emailType, {}), entry.klass, entry.emailType);
      const id = await insertRow({
        emailType: entry.emailType,
        toAddress: old,
        metadata: entry.emailType === "email_changed_old" ? { authCritical: true } : {},
      });
      rows.push({ id, emailType: entry.emailType, klass: entry.klass });
    }

    const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });
    assert.equal(result.readdressed, SECURITY_EMAIL_TYPES.length + MUST_HAVE_EMAIL_TYPES.length);
    assert.equal(result.cancelled, CANCELLED_BY_DEFAULT_EMAIL_TYPES.length);

    for (const entry of rows) {
      const row = await load(entry.id);
      if (entry.klass === "security" || entry.klass === "must_have") {
        assert.equal(row.to_email, next, entry.emailType);
        assert.equal(row.status, "pending", entry.emailType);
        assert.equal(metaOf(row).readdressReason, "readdressed", entry.emailType);
      } else if (entry.klass === "cancelled_by_default") {
        assert.equal(row.to_email, old, entry.emailType);
        assert.equal(row.status, "cancelled", entry.emailType);
        assert.equal(row.last_error, ADDRESS_CHANGED, entry.emailType);
      } else {
        assert.equal(row.to_email, old, entry.emailType);
        assert.equal(row.status, "pending", entry.emailType);
        assert.equal(metaOf(row).readdressReason, undefined, entry.emailType);
      }
    }
    const changed = rows.find((entry) => entry.emailType === "email_changed_old");
    assert.ok(changed);
    assert.equal((await load(changed.id)).to_email, old);
    assert.equal(metaOf(await load(changed.id)).authCritical, true);
  });

  it("RA14: re-addresses the four moved types, cancels earner_no_response, and logs one live-lease skip", async () => {
    const moved = [
      "activity_booking_cancelled",
      "plan_approved",
      "plan_changes_requested",
      "activity_quote_request",
    ] as const;
    for (const emailType of moved) {
      assert.equal(classifyOutboxEmail(emailType, {}), "must_have");
    }
    assert.equal(classifyOutboxEmail("earner_no_response", {}), "cancelled_by_default");

    const old = oldAddress("ra14");
    const next = newAddress("ra14");
    const ids = new Map<string, number>();
    for (const emailType of moved) {
      ids.set(emailType, await insertRow({ emailType, toAddress: old }));
    }
    const silent = await insertRow({ emailType: "earner_no_response", toAddress: old });

    const seen: unknown[][] = [];
    const origInfo = logger.info.bind(logger);
    (logger as { info: typeof logger.info }).info = ((...args: unknown[]) => {
      seen.push(args);
    }) as typeof logger.info;
    try {
      const result = await readdressOutboxOnEmailChange({ oldEmail: old, newEmail: next });
      assert.equal(result.readdressed, moved.length);
      assert.equal(result.cancelled, 1);
      assert.equal(skipLines(seen).length, 0);

      for (const emailType of moved) {
        const row = await load(ids.get(emailType)!);
        assert.equal(row.to_email, next, emailType);
        assert.equal(row.status, "pending", emailType);
        assert.equal(row.retry_after, null, emailType);
        assert.equal(metaOf(row).readdressReason, "readdressed", emailType);
      }
      const stayed = await load(silent);
      assert.equal(stayed.to_email, old);
      assert.equal(stayed.status, "cancelled");
      assert.equal(stayed.retry_after, null);
      assert.equal(stayed.last_error, ADDRESS_CHANGED);

      const leaseOld = oldAddress("ra14-lease");
      const leaseNext = newAddress("ra14-lease");
      const live = await insertRow({
        emailType: "booking_confirmation",
        toAddress: leaseOld,
        status: "processing",
        lease: "live",
      });
      const nullLease = await insertRow({
        emailType: "plan_delivered",
        toAddress: leaseOld,
        status: "processing",
      });
      const liveBefore = await snap(live);
      const nullBefore = await snap(nullLease);
      seen.length = 0;

      const skipped = await readdressOutboxOnEmailChange({ oldEmail: leaseOld, newEmail: leaseNext });
      assert.deepEqual(skipped, { readdressed: 0, cancelled: 0 });
      assert.deepEqual(await snap(live), liveBefore);
      assert.deepEqual(await snap(nullLease), nullBefore);
      const lines = skipLines(seen);
      assert.equal(lines.length, 1);
      assert.equal(JSON.stringify(lines[0]).includes("@"), false);
      assert.equal(JSON.stringify(lines[0]).includes(leaseOld), false);
      assert.equal(lines[0][1], "[email-outbox] readdress skipped a live-lease row");
      assert.deepEqual(lines[0][0], { skippedLiveLease: 2 });
    } finally {
      (logger as { info: typeof logger.info }).info = origInfo;
    }
  });
});

function skipLines(seen: unknown[][]): unknown[][] {
  return seen.filter((args) => args.includes("[email-outbox] readdress skipped a live-lease row"));
}

async function addressCount(addresses: string[]): Promise<number> {
  const found = await pool.query(
    `SELECT count(*)::int AS n
       FROM email_outbox
      WHERE metadata->>'run' = $1
        AND lower(btrim(to_email)) = ANY($2::text[])`,
    [RUN, addresses],
  );
  return found.rows[0].n;
}

async function userSnap(id: string): Promise<unknown> {
  const found = await pool.query(`SELECT to_jsonb(users.*) AS doc FROM users WHERE id = $1`, [id]);
  assert.equal(found.rowCount, 1);
  return found.rows[0].doc;
}

async function parkOtherClaimable(
  emailTypes: string[],
  keepIds: number[],
): Promise<Array<{ id: string; retry_after: Date | null }>> {
  const found = await pool.query(
    `SELECT id::text AS id, retry_after
       FROM email_outbox
      WHERE email_type = ANY($1::text[])
        AND NOT (id = ANY($2::bigint[]))
        AND (
          (
            status IN ('pending', 'failed', 'held')
            AND (retry_after IS NULL OR retry_after <= NOW())
          )
          OR (
            status = 'processing'
            AND retry_after < NOW() - INTERVAL '1 minute'
          )
        )`,
    [emailTypes, keepIds],
  );
  if (found.rows.length) {
    await pool.query(
      `UPDATE email_outbox
          SET retry_after = NOW() + INTERVAL '2 days'
        WHERE id = ANY($1::bigint[])`,
      [found.rows.map((row: { id: string }) => row.id)],
    );
  }
  return found.rows;
}

async function restoreParked(rows: Array<{ id: string; retry_after: Date | null }>): Promise<void> {
  for (const row of rows) {
    await pool.query(`UPDATE email_outbox SET retry_after = $2 WHERE id = $1`, [row.id, row.retry_after]);
  }
}
