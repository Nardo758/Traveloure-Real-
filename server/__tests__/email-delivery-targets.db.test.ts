/**
 * Row 170 (Z-10). The drain attempts delivery-priority rows first, a priority
 * enqueue leases for 6 minutes, and the daily digest counts misses.
 *
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit \
 *     server/__tests__/email-delivery-targets.db.test.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { logger } from "../infrastructure/logger";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { outboxDeliveryPrioritySql } from "../services/email-outbox-classes";
import {
  EMAIL_DELIVERY_TARGETS,
  loadDeliveryTargetMisses,
  type DeliveryTargetMisses,
} from "../services/email-delivery-targets";
import { buildDeliveryTargetDigestLine } from "../services/email.service";
import {
  BACKOFF_MINUTES,
  _outboxTestHooks,
  deliverQueuedEmail,
  drainOutbox,
  enqueueEmail,
} from "../services/email-outbox.service";

const RUN = randomUUID().slice(0, 8);
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
const origSends = process.env.EMAIL_SENDS_ENABLED;
const origAllow = process.env.EMAIL_TEMPLATE_ALLOWLIST;
const origExecute = db.execute.bind(db);
const origWarn = logger.warn.bind(logger);

function addr(label: string): string {
  return `dt170-${RUN}-${label}@traveloure.test`;
}

function chunkToString(c: unknown): string {
  if (c === null || c === undefined) return "NULL";
  if (typeof c === "string") return c;
  if (typeof c === "object") {
    const obj = c as { queryChunks?: unknown[]; value?: unknown };
    if (obj.queryChunks !== undefined) return obj.queryChunks.map(chunkToString).join("");
    if ("value" in obj) return obj.value === null || obj.value === undefined ? "NULL" : String(obj.value);
  }
  return String(c);
}

async function assertDisposableDb(): Promise<void> {
  const found = await pool.query("SELECT inet_server_addr()::text AS addr");
  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; }
  })();
  const addr: string | null = found.rows[0]?.addr ?? null;
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    addr === null ||
    DISPOSABLE_HOSTS.has(addr.split("/")[0]);
  if (!ok) throw new Error(`email-delivery-targets refuses a non-local database (${host ?? "unknown host"})`);
}

function arm(allowlist: string): void {
  process.env.EMAIL_SENDS_ENABLED = "true";
  process.env.EMAIL_TEMPLATE_ALLOWLIST = allowlist;
  invalidatePlatformFlagCache();
}

async function insertRows(opts: {
  emailType: string;
  count: number;
  label: string;
  status?: string;
  createdAgo?: string;
  retryAgo?: string | null;
  retryAhead?: string | null;
  attemptCount?: number;
  metadata?: Record<string, unknown>;
  firstAgo?: string | null;
  gateHeld?: boolean;
  readdressedAgo?: string | null;
  readdressedRaw?: string | null;
}): Promise<number[]> {
  const status = opts.status ?? "pending";
  const createdAgo = opts.createdAgo ?? "1 hour";
  const attemptCount = opts.attemptCount ?? 0;
  const metadata = { ...(opts.metadata ?? {}), run: RUN };
  const retrySql = opts.retryAgo
    ? sql`NOW() - ${opts.retryAgo}::interval`
    : opts.retryAhead
      ? sql`NOW() + ${opts.retryAhead}::interval`
      : sql`NULL`;
  const inserted = await db.execute(sql`
    INSERT INTO email_outbox (
      email_type, to_email, subject, html, status, attempt_count, retry_after, metadata, created_at
    )
    SELECT
      ${opts.emailType},
      ${`dt170-${RUN}-${opts.label}-`} || g || '@traveloure.test',
      ${`DT ${opts.label}`},
      '<p>notice</p>',
      ${status},
      ${attemptCount},
      ${retrySql},
      ${JSON.stringify(metadata)}::jsonb
        || CASE WHEN ${opts.firstAgo ?? null}::text IS NULL THEN '{}'::jsonb
           ELSE jsonb_build_object('firstAttemptAt', to_char((NOW() - ${opts.firstAgo ?? "0 seconds"}::interval) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
           END
        || CASE WHEN ${opts.gateHeld ? "1" : null}::text IS NULL THEN '{}'::jsonb
           ELSE jsonb_build_object('gateHeldAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
           END
        || CASE WHEN ${opts.readdressedRaw ?? null}::text IS NOT NULL
           THEN jsonb_build_object('readdressedAt', ${opts.readdressedRaw ?? ""}::text)
           WHEN ${opts.readdressedAgo ?? null}::text IS NOT NULL
           THEN jsonb_build_object('readdressedAt', to_char((NOW() - ${opts.readdressedAgo ?? "0 seconds"}::interval) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
           ELSE '{}'::jsonb
           END,
      NOW() - ${createdAgo}::interval
    FROM generate_series(1, ${opts.count}) AS g
    RETURNING id
  `);
  return (inserted.rows as { id: number }[]).map((row) => Number(row.id));
}

async function parkOthers(): Promise<Array<{ id: string; retry_after: Date | null }>> {
  const found = await pool.query(
    `SELECT id::text AS id, retry_after
       FROM email_outbox
      WHERE COALESCE(metadata->>'run', '') <> $1
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
    [RUN],
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

async function counts(): Promise<DeliveryTargetMisses> {
  return loadDeliveryTargetMisses();
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await assertDisposableDb();
});

after(async () => {
  delete _outboxTestHooks.sendEmailFn;
  (db as { execute: typeof db.execute }).execute = origExecute;
  (logger as { warn: typeof logger.warn }).warn = origWarn;
  if (origSends === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = origSends;
  if (origAllow === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
  else process.env.EMAIL_TEMPLATE_ALLOWLIST = origAllow;
  invalidatePlatformFlagCache();
  await pool.query(`DELETE FROM email_outbox WHERE metadata->>'run' = $1 OR to_email LIKE $2`, [
    RUN,
    `dt170-${RUN}-%@traveloure.test`,
  ]);
});

describe("delivery targets", { concurrency: 1 }, () => {
  it("DT1: 15 minutes is 900000, backoff is unchanged, and the claim fragment prints no type name", async () => {
    assert.equal(EMAIL_DELIVERY_TARGETS.mustHaveAndSecurityMs, 900000);
    assert.deepEqual(BACKOFF_MINUTES, [5, 15, 45, 120, 360]);
    const src = readFileSync("server/services/email-delivery-targets.ts", "utf8");
    assert.equal(src.includes("75"), false);
    assert.equal(src.includes("60 * 60"), false);
    assert.deepEqual(src.match(/\b60\b/g), ["60"]);
    const printed = chunkToString(outboxDeliveryPrioritySql());
    assert.equal(printed.includes("booking_decline"), false);
    assert.equal(printed.includes("password_reset"), false);
    assert.equal(printed.includes("email_changed_old"), false);

    const matched = await db.execute(sql`
      SELECT email_type
        FROM (
          VALUES
            ('booking_confirmation'::text, '{}'::jsonb),
            ('itinerary_nudge_2h'::text, '{}'::jsonb),
            ('generic'::text, '{"authCritical": true}'::jsonb),
            ('admin_digest_24h'::text, '{"authCritical": true}'::jsonb),
            ('email_changed_old'::text, '{}'::jsonb)
        ) AS sample(email_type, metadata)
       WHERE ${outboxDeliveryPrioritySql()}
       ORDER BY email_type
    `);
    assert.deepEqual(
      (matched.rows as { email_type: string }[]).map((row) => row.email_type),
      ["booking_confirmation", "email_changed_old", "generic"],
    );
  });

  it("DT2 priority claim: 3 newer booking_confirmation rows are attempted before 120 older nudges", async () => {
    arm("booking_confirmation,itinerary_nudge_2h");
    const parked = await parkOthers();
    const seen: string[] = [];
    _outboxTestHooks.sendEmailFn = async (params) => {
      const nudged = await pool.query(
        `SELECT count(*)::int AS n FROM email_outbox
          WHERE metadata->>'run' = $1 AND email_type = 'itinerary_nudge_2h' AND attempt_count > 0`,
        [RUN],
      );
      assert.equal(nudged.rows[0].n, 0);
      seen.push(String(params.emailType));
      return { ok: true, id: "dt2" };
    };
    try {
      await insertRows({ emailType: "itinerary_nudge_2h", count: 120, label: "dt2n", createdAgo: "3 hours" });
      await insertRows({ emailType: "booking_confirmation", count: 3, label: "dt2c", createdAgo: "30 minutes" });
      const drained = await drainOutbox();
      assert.equal(drained.drained, 50);
      assert.deepEqual(seen, ["booking_confirmation", "booking_confirmation", "booking_confirmation"]);
      const sent = await pool.query(
        `SELECT count(*)::int AS n FROM email_outbox
          WHERE metadata->>'run' = $1 AND email_type = 'booking_confirmation' AND status = 'sent'`,
        [RUN],
      );
      assert.equal(sent.rows[0].n, 3);
    } finally {
      delete _outboxTestHooks.sendEmailFn;
      await pool.query(
        `DELETE FROM email_outbox WHERE metadata->>'run' = $1 AND to_email LIKE $2`,
        [RUN, `dt170-${RUN}-dt2%`],
      );
      await restoreParked(parked);
    }
  });

  it("DT3 bound: with 60 due priority rows the pass claims exactly 50, all priority", async () => {
    arm("booking_confirmation,itinerary_nudge_2h");
    const parked = await parkOthers();
    _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "dt3" });
    try {
      await insertRows({ emailType: "booking_confirmation", count: 60, label: "dt3c", createdAgo: "2 hours" });
      await insertRows({ emailType: "itinerary_nudge_2h", count: 10, label: "dt3n", createdAgo: "3 hours" });
      const drained = await drainOutbox();
      assert.equal(drained.drained, 50);
      const tally = await pool.query(
        `SELECT email_type, status, count(*)::int AS n
           FROM email_outbox
          WHERE metadata->>'run' = $1
            AND to_email LIKE $2
          GROUP BY email_type, status
          ORDER BY email_type, status`,
        [RUN, `dt170-${RUN}-dt3%`],
      );
      const key = (emailType: string, status: string) => `${emailType}:${status}`;
      const map = new Map(tally.rows.map((row: { email_type: string; status: string; n: number }) => [key(row.email_type, row.status), row.n]));
      assert.equal(map.get(key("booking_confirmation", "sent")), 50);
      assert.equal(map.get(key("booking_confirmation", "pending")), 10);
      assert.equal(map.get(key("itinerary_nudge_2h", "pending")), 10);
      assert.equal(map.has(key("itinerary_nudge_2h", "sent")), false);
      assert.equal(map.has(key("itinerary_nudge_2h", "failed")), false);
    } finally {
      delete _outboxTestHooks.sendEmailFn;
      await pool.query(
        `DELETE FROM email_outbox WHERE metadata->>'run' = $1 AND to_email LIKE $2`,
        [RUN, `dt170-${RUN}-dt3%`],
      );
      await restoreParked(parked);
    }
  });

  it("DT4 lease: priority enqueue is about 6 minutes; a nudge enqueue is about 10", async () => {
    arm("booking_confirmation,password_reset,itinerary_nudge_2h");
    const minutesAhead = async (emailType: string): Promise<number> => {
      let release: () => void = () => {};
      const hung = new Promise<void>((resolve) => { release = resolve; });
      const to = addr(`dt4-${emailType}`);
      _outboxTestHooks.sendEmailFn = async () => {
        await hung;
        return { ok: true, id: "dt4" };
      };
      let captured: Date | null = null;
      const origQuery = pool.query.bind(pool);
      const poolAny = pool as unknown as { query: typeof pool.query };
      poolAny.query = (async (...args: unknown[]) => {
        const first = args[0] as { text?: string } | string;
        const text = typeof first === "string" ? first : first?.text ?? "";
        if (captured === null && /select/i.test(text) && /email_outbox/i.test(text)) {
          const found = await origQuery(
            `SELECT retry_after FROM email_outbox WHERE to_email = $1`,
            [to],
          );
          captured = found.rows[0]?.retry_after ?? null;
        }
        return origQuery(...(args as Parameters<typeof pool.query>));
      }) as typeof pool.query;
      const pending = enqueueEmail({
        to,
        subject: "DT4",
        html: "<p>dt4</p>",
        emailType,
        metadata: { run: RUN },
      });
      try {
        const start = Date.now();
        while (captured === null && Date.now() - start < 5000) {
          const found = await origQuery(`SELECT retry_after FROM email_outbox WHERE to_email = $1`, [to]);
          if (found.rows[0]?.retry_after) captured = found.rows[0].retry_after;
          else await new Promise((resolve) => setTimeout(resolve, 15));
        }
        assert.ok(captured instanceof Date || typeof captured === "string", `${emailType} lease was not visible`);
        return (new Date(captured as Date | string).getTime() - Date.now()) / 60000;
      } finally {
        poolAny.query = origQuery;
        release();
        await pending;
      }
    };
    try {
      const confirmation = await minutesAhead("booking_confirmation");
      const reset = await minutesAhead("password_reset");
      const nudge = await minutesAhead("itinerary_nudge_2h");
      assert.ok(confirmation > 5.5 && confirmation <= 6.05, `booking_confirmation lease ${confirmation}`);
      assert.ok(reset > 5.5 && reset <= 6.05, `password_reset lease ${reset}`);
      assert.ok(nudge > 9.5 && nudge <= 10.05, `itinerary_nudge_2h lease ${nudge}`);
    } finally {
      delete _outboxTestHooks.sendEmailFn;
    }
  });

  it("DT5 crash recovery: retry_after 7 minutes past is claimed; inside the 1-minute grace, and a 5-minute-old 6-minute lease, are not", async () => {
    arm("booking_confirmation");
    const parked = await parkOthers();
    _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "dt5" });
    try {
      const [old] = await insertRows({
        emailType: "booking_confirmation",
        count: 1,
        label: "dt5old",
        status: "processing",
        createdAgo: "20 minutes",
        retryAgo: "7 minutes",
      });
      const [grace] = await insertRows({
        emailType: "booking_confirmation",
        count: 1,
        label: "dt5grace",
        status: "processing",
        createdAgo: "6 minutes",
        retryAgo: "30 seconds",
      });
      const [young] = await insertRows({
        emailType: "booking_confirmation",
        count: 1,
        label: "dt5young",
        status: "processing",
        createdAgo: "5 minutes",
        retryAhead: "1 minute",
      });
      await drainOutbox();
      const statusOf = async (id: number) => {
        const found = await pool.query(`SELECT status FROM email_outbox WHERE id = $1`, [id]);
        return found.rows[0].status as string;
      };
      assert.equal(await statusOf(old), "sent");
      assert.equal(await statusOf(grace), "processing");
      assert.equal(await statusOf(young), "processing");
    } finally {
      delete _outboxTestHooks.sendEmailFn;
      await restoreParked(parked);
    }
  });

  it("DT6 stamp: first success and first failure write firstAttemptAt; a later attempt keeps it; a gate hold writes gateHeldAt once", async () => {
    arm("booking_confirmation");
    const to = addr("dt6ok");
    _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "dt6ok" });
    const okId = await enqueueEmail({
      to,
      subject: "DT6 ok",
      html: "<p>ok</p>",
      emailType: "booking_confirmation",
      metadata: { run: RUN },
    });
    const ok = await pool.query(`SELECT status, attempt_count, metadata FROM email_outbox WHERE id = $1`, [okId]);
    assert.equal(ok.rows[0].status, "sent");
    assert.equal(Number(ok.rows[0].attempt_count), 1);
    const okMeta = ok.rows[0].metadata as { firstAttemptAt?: string; gateHeldAt?: string };
    assert.match(okMeta.firstAttemptAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(okMeta.gateHeldAt, undefined);

    const failTo = addr("dt6fail");
    _outboxTestHooks.sendEmailFn = async () => ({ ok: false, error: "simulated" });
    const failId = await enqueueEmail({
      to: failTo,
      subject: "DT6 fail",
      html: "<p>fail</p>",
      emailType: "booking_confirmation",
      metadata: { run: RUN },
    });
    const failed = await pool.query(`SELECT metadata FROM email_outbox WHERE id = $1`, [failId]);
    const firstStamp = (failed.rows[0].metadata as { firstAttemptAt?: string }).firstAttemptAt;
    assert.match(firstStamp ?? "", /^\d{4}-\d{2}-\d{2}T/);
    await pool.query(`UPDATE email_outbox SET retry_after = NOW() - INTERVAL '1 minute' WHERE id = $1`, [failId]);
    _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "dt6retry" });
    await deliverQueuedEmail(failId!);
    const retried = await pool.query(`SELECT status, attempt_count, metadata FROM email_outbox WHERE id = $1`, [failId]);
    assert.equal(retried.rows[0].status, "sent");
    assert.equal(Number(retried.rows[0].attempt_count), 2);
    assert.equal((retried.rows[0].metadata as { firstAttemptAt?: string }).firstAttemptAt, firstStamp);

    arm("password_reset");
    delete _outboxTestHooks.sendEmailFn;
    _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "should-not" });
    const heldTo = addr("dt6held");
    const heldId = await enqueueEmail({
      to: heldTo,
      subject: "DT6 held",
      html: "<p>held</p>",
      emailType: "booking_confirmation",
      metadata: { run: RUN },
    });
    const held = await pool.query(`SELECT status, attempt_count, metadata FROM email_outbox WHERE id = $1`, [heldId]);
    assert.equal(held.rows[0].status, "held");
    assert.equal(Number(held.rows[0].attempt_count), 0);
    const heldMeta = held.rows[0].metadata as { gateHeldAt?: string; firstAttemptAt?: string };
    assert.match(heldMeta.gateHeldAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(heldMeta.firstAttemptAt, undefined);
    await pool.query(
      `UPDATE email_outbox SET status = 'pending', retry_after = NULL WHERE id = $1`,
      [heldId],
    );
    process.env.EMAIL_SENDS_ENABLED = "false";
    await deliverQueuedEmail(heldId!);
    const again = await pool.query(`SELECT status, metadata FROM email_outbox WHERE id = $1`, [heldId]);
    assert.equal(again.rows[0].status, "held");
    assert.equal((again.rows[0].metadata as { gateHeldAt?: string }).gateHeldAt, heldMeta.gateHeldAt);
    assert.equal((again.rows[0].metadata as { firstAttemptAt?: string }).firstAttemptAt, undefined);
    delete _outboxTestHooks.sendEmailFn;
  });

  it("DT7 measure late: 16 minutes counts, 2 does not, gate and readdress and marketing stay out, security and old-address count", async () => {
    arm("booking_confirmation,password_reset,email_changed_old,itinerary_nudge_2h");
    const before = await counts();
    await insertRows({
      emailType: "booking_confirmation", count: 1, label: "dt7late", status: "sent",
      createdAgo: "20 minutes", firstAgo: "4 minutes", attemptCount: 1,
    });
    await insertRows({
      emailType: "booking_confirmation", count: 1, label: "dt7ontime", status: "sent",
      createdAgo: "20 minutes", firstAgo: "18 minutes", attemptCount: 1,
    });
    await insertRows({
      emailType: "booking_confirmation", count: 1, label: "dt7gate", status: "sent",
      createdAgo: "20 minutes", firstAgo: "4 minutes", gateHeld: true, attemptCount: 1,
    });
    await insertRows({
      emailType: "booking_confirmation", count: 1, label: "dt7re", status: "sent",
      createdAgo: "2 hours", firstAgo: "10 minutes", readdressedAgo: "12 minutes", attemptCount: 1,
    });
    await insertRows({
      emailType: "itinerary_nudge_2h", count: 1, label: "dt7mkt", status: "sent",
      createdAgo: "4 hours", firstAgo: "1 hour", attemptCount: 1,
    });
    await insertRows({
      emailType: "password_reset", count: 1, label: "dt7sec", status: "sent",
      createdAgo: "40 minutes", firstAgo: "20 minutes", attemptCount: 1,
    });
    await insertRows({
      emailType: "email_changed_old", count: 1, label: "dt7old", status: "sent",
      createdAgo: "40 minutes", firstAgo: "20 minutes", attemptCount: 1,
      metadata: { authCritical: true },
    });
    await insertRows({
      emailType: "booking_confirmation", count: 1, label: "dt7bad", status: "sent",
      createdAgo: "20 minutes", firstAgo: "4 minutes", readdressedRaw: "not-a-date", attemptCount: 1,
    });
    const after = await counts();
    assert.equal(after.lateFirstAttempts - before.lateFirstAttempts, 4);
  });

  it("DT8 measure unattempted: a 20-minute pending allowlisted row counts; sends off, type off, held, and 14 minutes do not", async () => {
    const pending = async (label: string, createdAgo: string, status = "pending") => {
      await insertRows({
        emailType: "booking_confirmation", count: 1, label, status, createdAgo, attemptCount: 0,
      });
    };
    arm("booking_confirmation");
    const before = await counts();
    await pending("dt8due", "20 minutes");
    const due = await counts();
    assert.equal(due.notYetAttempted - before.notYetAttempted, 1);

    process.env.EMAIL_SENDS_ENABLED = "false";
    assert.equal((await counts()).notYetAttempted, 0);

    arm("itinerary_nudge_2h");
    assert.equal((await counts()).notYetAttempted, 0);

    arm("booking_confirmation");
    const beforeHeld = await counts();
    await pending("dt8held", "20 minutes", "held");
    assert.equal((await counts()).notYetAttempted - beforeHeld.notYetAttempted, 0);

    const beforeYoung = await counts();
    await pending("dt8young", "14 minutes");
    assert.equal((await counts()).notYetAttempted - beforeYoung.notYetAttempted, 0);
  });

  it("DT9 window: a late first attempt 25 hours ago is out; one 23 hours ago is in", async () => {
    arm("booking_confirmation");
    const before = await counts();
    await insertRows({
      emailType: "booking_confirmation", count: 1, label: "dt9old", status: "sent",
      createdAgo: "26 hours", firstAgo: "25 hours", attemptCount: 1,
    });
    const mid = await counts();
    assert.equal(mid.lateFirstAttempts - before.lateFirstAttempts, 0);
    await insertRows({
      emailType: "booking_confirmation", count: 1, label: "dt9new", status: "sent",
      createdAgo: "26 hours", firstAgo: "23 hours", attemptCount: 1,
    });
    const after = await counts();
    assert.equal(after.lateFirstAttempts - mid.lateFirstAttempts, 1);
  });

  it("DT10 read only: snapshots match, the result is four numbers, and a database error is thrown", async () => {
    arm("booking_confirmation");
    const [id] = await insertRows({
      emailType: "booking_confirmation", count: 1, label: "dt10", status: "sent",
      createdAgo: "20 minutes", firstAgo: "4 minutes", attemptCount: 1,
    });
    const before = await pool.query(`SELECT to_jsonb(email_outbox.*) AS doc FROM email_outbox WHERE id = $1`, [id]);
    const warns: unknown[][] = [];
    (logger as { warn: (...args: unknown[]) => void }).warn = (...args: unknown[]) => {
      warns.push(args);
    };
    const result = await counts();
    (logger as { warn: typeof logger.warn }).warn = origWarn;
    const after = await pool.query(`SELECT to_jsonb(email_outbox.*) AS doc FROM email_outbox WHERE id = $1`, [id]);
    assert.deepEqual(after.rows[0].doc, before.rows[0].doc);
    assert.equal(warns.length, 0);
    assert.deepEqual(Object.keys(result).sort(), ["lateFirstAttempts", "misses", "notYetAttempted", "windowHours"]);
    const encoded = JSON.stringify(result);
    assert.equal(encoded.includes("@"), false);
    assert.equal(encoded.includes("DT dt10"), false);
    assert.equal(encoded.includes(addr("dt10")), false);
    assert.equal("id" in result, false);

    (db as { execute: typeof db.execute }).execute = (() => {
      throw new Error("dt10 database down");
    }) as typeof db.execute;
    await assert.rejects(() => loadDeliveryTargetMisses(), /dt10 database down/);
    (db as { execute: typeof db.execute }).execute = origExecute;
  });

  it("DT11 digest line: one paragraph, zero prints, skip and subject stay clear of the measure", () => {
    assert.equal(buildDeliveryTargetDigestLine(undefined), "");
    const zero = buildDeliveryTargetDigestLine({
      windowHours: 24, misses: 0, lateFirstAttempts: 0, notYetAttempted: 0,
    });
    assert.equal(zero.split("<p>").length - 1, 1);
    assert.match(zero, /^<p>.*<\/p>$/);
    assert.equal(zero.includes("0"), true);
    assert.equal(zero.includes("15-minute"), true);
    assert.equal(zero.includes("@"), false);
    const counted = buildDeliveryTargetDigestLine({
      windowHours: 24, misses: 4, lateFirstAttempts: 1, notYetAttempted: 3,
    });
    assert.match(counted, /Delivery target: 4 must-have or security emails missed the 15-minute first-attempt target in the last 24 hours \(1 late, 3 not yet attempted\)\./);
    assert.equal(counted.includes("@"), false);

    const scheduler = readFileSync("server/services/admin-digest-scheduler.service.ts", "utf8");
    const marker = 'console.log("[AdminDigest] Nothing to report — skipping email")';
    const at = scheduler.indexOf(marker);
    assert.ok(at > 0);
    const skip = scheduler.slice(scheduler.lastIndexOf("if (", at), at);
    assert.equal(skip.includes("deliveryTarget"), false);
    assert.equal(skip.includes("loadDeliveryTargetMisses"), false);
    assert.equal(skip.includes("15-minute"), false);
    assert.match(scheduler, /deliveryTargets = await loadDeliveryTargetMisses\(\)/);
    assert.match(scheduler, /console\.error\("\[AdminDigest\] Failed to load delivery target misses:", err\)/);

    const email = readFileSync("server/services/email.service.ts", "utf8");
    const subjectLine = email.split("\n").find((line) => line.includes("const subject = `[Traveloure Admin]"));
    assert.ok(subjectLine);
    assert.equal(/delivery target|15-minute|first-attempt/i.test(subjectLine ?? ""), false);
    const measure = readFileSync("server/services/email-delivery-targets.ts", "utf8");
    assert.equal(measure.includes("logger.warn"), false);
    assert.equal(measure.includes("INSERT"), false);
    assert.equal(measure.includes("admin_notifications"), false);
  });
});
