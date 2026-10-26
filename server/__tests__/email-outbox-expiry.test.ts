/**
 * Outbox expires_at (Z-03, ledger 2026-10-25-email-outbox-expires-at).
 *
 * A future expires_at still sends. A past expires_at is cancelled with reason
 * "expired" and is not sent, even when the type is allowlisted and sends are
 * enabled. Null expires_at keeps the previous send and auth-link behaviour.
 * The window is computed at enqueue. Migration 411 only adds the column.
 *
 *   npx tsx --test server/__tests__/email-outbox-expiry.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { db } from "../db.js";
import { logger } from "../infrastructure/logger.js";
import { buildOutboxHoldDigestSection } from "../services/email.service.js";
import {
  EMAIL_OUTBOX_EXPIRY_BOOT_MESSAGE,
  MARKETING_EXPIRY_CAP_MS,
  OUTBOX_EXPIRED_REASON,
  UNWINDOWED_EMAIL_TYPES,
  computeOutboxExpiresAt,
} from "../services/email-outbox-expiry.js";
import {
  _outboxTestHooks,
  deliverQueuedEmail,
  drainOutbox,
  emailOutboxScheduler,
  enqueueEmail,
  logEmailOutboxExpiry,
} from "../services/email-outbox.service.js";

const origExecute = db.execute.bind(db);
const origInsert = db.insert.bind(db);
const origInfo = logger.info.bind(logger);
const origSends = process.env.EMAIL_SENDS_ENABLED;
const origAllow = process.env.EMAIL_TEMPLATE_ALLOWLIST;

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

function sqlOf(query: unknown): string {
  const obj = query as { queryChunks?: unknown[]; sql?: string };
  if (typeof query === "string") return query;
  if (obj?.queryChunks !== undefined) return obj.queryChunks.map(chunkToString).join("");
  if (typeof obj?.sql === "string") return obj.sql;
  return String(query);
}

function patchExecute(claimRows: Record<string, unknown>[]): { captured: string[] } {
  const captured: string[] = [];
  let callCount = 0;
  (db as any).execute = (query: unknown) => {
    captured.push(sqlOf(query));
    callCount += 1;
    return Promise.resolve({ rows: callCount === 1 ? claimRows : [] });
  };
  return { captured };
}

function claimedRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1,
    to_email: "traveler@example.com",
    subject: "Reset",
    html: "<p>https://app.example/reset-password?token=issued</p>",
    text_body: null,
    from_address: null,
    reply_to: null,
    attempt_count: 0,
    max_attempts: 6,
    email_type: "password_reset",
    metadata: { authCritical: true, linkExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    ...overrides,
  };
}

before(() => {
  (db as any).execute = origExecute;
  (db as any).insert = origInsert;
});

beforeEach(() => {
  process.env.EMAIL_SENDS_ENABLED = "true";
  process.env.EMAIL_TEMPLATE_ALLOWLIST = "password_reset,email_verification";
  delete _outboxTestHooks.sendEmailFn;
});

afterEach(() => {
  (db as any).execute = origExecute;
  (db as any).insert = origInsert;
  delete _outboxTestHooks.sendEmailFn;
  (logger as any).info = origInfo;
  if (origSends === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = origSends;
  if (origAllow === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
  else process.env.EMAIL_TEMPLATE_ALLOWLIST = origAllow;
});

after(() => {
  (db as any).execute = origExecute;
  (db as any).insert = origInsert;
});

describe("computeOutboxExpiresAt", () => {
  const enqueued = new Date("2026-01-01T00:00:00.000Z");
  const readyAt = "2026-01-01T00:00:00.000Z";

  it("sets the 2-hour nudge to the next step, which is inside the 3-day cap", () => {
    const at = computeOutboxExpiresAt("itinerary_nudge_2h", { readyAt }, enqueued);
    assert.equal(at?.toISOString(), "2026-01-02T00:00:00.000Z");
  });

  it("caps the 24-hour notice at 3 days when the following step is later", () => {
    const at = computeOutboxExpiresAt("itinerary_followup_24h", { readyAt }, enqueued);
    assert.equal(at?.toISOString(), new Date(enqueued.getTime() + MARKETING_EXPIRY_CAP_MS).toISOString());
  });

  it("uses the 3-day cap when a windowed marketing row has no readyAt", () => {
    const at = computeOutboxExpiresAt("itinerary_nudge_2h", {}, enqueued);
    assert.equal(at?.toISOString(), new Date(enqueued.getTime() + MARKETING_EXPIRY_CAP_MS).toISOString());
  });

  it("uses the earlier of the next step and the 3-day cap", () => {
    const at = computeOutboxExpiresAt("itinerary_nudge_2h", { readyAt: "2025-12-01T00:00:00.000Z" }, enqueued);
    assert.equal(at?.toISOString(), "2025-12-02T00:00:00.000Z");
  });

  it("leaves the 5-day reengagement null", () => {
    assert.equal(computeOutboxExpiresAt("itinerary_reengagement_5d", { readyAt }, enqueued), null);
  });

  it("stores an issued auth link expiry and invents none", () => {
    const link = "2026-06-01T12:00:00.000Z";
    assert.equal(computeOutboxExpiresAt("password_reset", { linkExpiresAt: link }, enqueued)?.toISOString(), link);
    assert.equal(computeOutboxExpiresAt("email_verification", { linkExpiresAt: link }, enqueued)?.toISOString(), link);
    assert.equal(computeOutboxExpiresAt("password_reset", {}, enqueued), null);
    assert.equal(computeOutboxExpiresAt("email_verification", { linkExpiresAt: "not-a-date" }, enqueued), null);
  });

  it("leaves every unwindowed type null", () => {
    for (const emailType of UNWINDOWED_EMAIL_TYPES) {
      assert.equal(
        computeOutboxExpiresAt(emailType, { readyAt, linkExpiresAt: "2026-06-01T12:00:00.000Z" }, enqueued),
        null,
        emailType,
      );
    }
    assert.equal(computeOutboxExpiresAt("not_a_real_type", { readyAt }, enqueued), null);
  });
});

describe("enqueue stores expires_at once", () => {
  function captureInsert(): { row: () => Record<string, unknown> } {
    let inserted: Record<string, unknown> | undefined;
    (db as any).insert = () => ({
      values(row: Record<string, unknown>) {
        inserted = row;
        return { returning: () => Promise.resolve([{ id: 7 }]) };
      },
    });
    (db as any).execute = () => Promise.resolve({ rows: [] });
    return { row: () => inserted ?? {} };
  }

  it("writes the link instant for password_reset and null for an unwindowed type", async () => {
    process.env.EMAIL_SENDS_ENABLED = "false";
    const link = "2026-06-01T12:00:00.000Z";
    const reset = captureInsert();
    await enqueueEmail({
      to: "traveler@example.com",
      subject: "Reset",
      html: "<p>reset</p>",
      emailType: "password_reset",
      authCritical: true,
      metadata: { linkExpiresAt: link },
    });
    assert.equal((reset.row().expiresAt as Date).toISOString(), link);

    const invite = captureInsert();
    await enqueueEmail({
      to: "guest@example.com",
      subject: "Invite",
      html: "<p>invite</p>",
      emailType: "guest_invite",
    });
    assert.equal(invite.row().expiresAt, null);

    const nudge = captureInsert();
    await enqueueEmail({
      to: "traveler@example.com",
      subject: "Nudge",
      html: "<p>nudge</p>",
      emailType: "itinerary_nudge_2h",
      metadata: { readyAt: new Date().toISOString() },
    });
    assert.ok(nudge.row().expiresAt instanceof Date);
  });
});

describe("drain and send honour expires_at", () => {
  it("sends a row whose expires_at is still in the future", async () => {
    const { captured } = patchExecute([
      claimedRow({ expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
    ]);
    let calls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      calls += 1;
      return { ok: true, id: "future-sent" };
    };
    const result = await drainOutbox();
    assert.equal(result.drained, 1);
    assert.equal(calls, 1);
    const updateSql = captured.slice(1).join("\n");
    assert.ok(updateSql.includes("sent"), updateSql);
    assert.ok(updateSql.includes("future-sent"));
  });

  it("does not send a past expires_at even when the template is allowlisted and sends are enabled", async () => {
    const { captured } = patchExecute([
      claimedRow({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        metadata: { authCritical: true, linkExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      }),
    ]);
    let calls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      calls += 1;
      return { ok: true, id: "should-not-send" };
    };
    await drainOutbox();
    assert.equal(calls, 0);
    const updateSql = captured.slice(1).join("\n");
    assert.ok(updateSql.includes("cancelled"), updateSql);
    assert.ok(updateSql.includes(OUTBOX_EXPIRED_REASON), updateSql);
    assert.equal(updateSql.includes("attempt_count"), false);
    assert.equal(updateSql.includes("Auth link expired before delivery"), false);
  });

  it("sends a null expires_at row, and a past auth link still uses the existing cancel reason", async () => {
    const future = patchExecute([claimedRow({})]);
    let calls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      calls += 1;
      return { ok: true, id: "null-sent" };
    };
    await drainOutbox();
    assert.equal(calls, 1);
    assert.ok(future.captured.slice(1).join("\n").includes("null-sent"));

    const pastLink = patchExecute([
      claimedRow({
        email_type: "email_verification",
        metadata: { authCritical: true, linkExpiresAt: new Date(Date.now() - 1000).toISOString() },
      }),
    ]);
    calls = 0;
    await drainOutbox();
    assert.equal(calls, 0);
    const updateSql = pastLink.captured.slice(1).join("\n");
    assert.ok(updateSql.includes("cancelled"), updateSql);
    assert.ok(updateSql.includes("Auth link expired before delivery"), updateSql);
  });

  it("keeps an unlisted past row held instead of cancelling it", async () => {
    const { captured } = patchExecute([
      claimedRow({
        email_type: "guest_invite",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        metadata: {},
      }),
    ]);
    let calls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      calls += 1;
      return { ok: true, id: "no" };
    };
    await drainOutbox();
    assert.equal(calls, 0);
    const updateSql = captured.slice(1).join("\n");
    assert.ok(updateSql.includes("held"), updateSql);
    assert.ok(updateSql.includes("EMAIL_TEMPLATE_ALLOWLIST"), updateSql);
    assert.equal(updateSql.includes("cancelled"), false);
  });

  it("does not claim when sends are disabled", async () => {
    process.env.EMAIL_SENDS_ENABLED = "false";
    (db as any).execute = () => {
      throw new Error("drain must not claim while EMAIL_SENDS_ENABLED is not true");
    };
    const result = await drainOutbox();
    assert.equal(result.drained, 0);
  });

  it("cancels a past row inside the one claim statement and does not claim cancelled rows", async () => {
    const { captured } = patchExecute([]);
    await drainOutbox();
    assert.equal(captured.length, 1);
    const claimSql = captured[0];
    assert.match(claimSql, /FOR UPDATE SKIP LOCKED/);
    assert.match(claimSql, /expires_at IS NULL OR d\.expires_at > NOW\(\)/);
    assert.match(claimSql, /status\s*=\s*'cancelled'/);
    assert.ok(claimSql.includes(OUTBOX_EXPIRED_REASON));
    assert.match(claimSql, /status IN \('pending', 'failed', 'held'\)/);
    assert.doesNotMatch(claimSql, /status IN \([^)]*'cancelled'/);
    assert.match(claimSql, /email_type = ANY/);
  });

  it("does not send a kicked row whose expires_at is past", async () => {
    const captured: string[] = [];
    let n = 0;
    (db as any).execute = (query: unknown) => {
      captured.push(sqlOf(query));
      n += 1;
      if (n === 1) return Promise.resolve({ rows: [{ email_type: "password_reset" }] });
      if (n === 2) {
        return Promise.resolve({
          rows: [claimedRow({ expires_at: new Date(Date.now() - 1000).toISOString() })],
        });
      }
      return Promise.resolve({ rows: [] });
    };
    let calls = 0;
    _outboxTestHooks.sendEmailFn = async () => {
      calls += 1;
      return { ok: true, id: "kicked" };
    };
    await deliverQueuedEmail(1);
    assert.equal(calls, 0);
    const updateSql = captured.slice(2).join("\n");
    assert.ok(updateSql.includes("cancelled"), updateSql);
    assert.ok(updateSql.includes(OUTBOX_EXPIRED_REASON), updateSql);
  });
});

const SCAN_SKIP_DIRS = new Set(["node_modules", "__tests__", "dist", "coverage"]);

/** Files under the given roots whose text contains needle. Skips test directories. No shell binary. */
function filesMentioning(needle: string, roots: string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SCAN_SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      let text: string;
      try {
        text = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      if (text.includes(needle)) found.push(full);
    }
  };
  for (const root of roots) walk(root);
  return found;
}

describe("expiry is recorded, not backfilled", () => {
  it("migration 411 only adds a nullable timestamptz column", () => {
    const raw = readFileSync("server/migrations/411_email_outbox_expires_at.sql", "utf8");
    const sql = raw.replace(/--.*$/gm, "");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS expires_at timestamptz/);
    assert.match(raw, /email_outbox/);
    assert.doesNotMatch(sql, /\bUPDATE\b/i);
    assert.doesNotMatch(sql, /\bINSERT\b/i);
    assert.doesNotMatch(sql, /\bDEFAULT\b/i);
    assert.doesNotMatch(sql, /\bCHECK\b/i);
    assert.match(readFileSync("server/migrations/migration-files.ts", "utf8"), /411_email_outbox_expires_at\.sql/);
    assert.match(readFileSync("shared/schema.ts", "utf8"), /expiresAt:\s+timestamp\("expires_at", \{ withTimezone: true \}\)/);
  });

  it("does not assign expires_at on any existing row", () => {
    const files = filesMentioning("email_outbox", ["server", "shared"]);
    const assignments = files.filter((file) => /expires_at\s*=/.test(readFileSync(file, "utf8")));
    assert.deepEqual(assignments, []);
    const welcome = readFileSync("server/services/signup-welcome-outbox.service.ts", "utf8");
    assert.equal(welcome.includes("expiresAt"), false);
    assert.equal(welcome.includes("expires_at"), false);
    const outbox = readFileSync("server/services/email-outbox.service.ts", "utf8");
    assert.equal(outbox.includes("computeOutboxExpiresAt"), true);
    assert.match(outbox, /expiresAt:\s+computeOutboxExpiresAt\(/);
    const follow = readFileSync("server/services/itinerary-followup.service.ts", "utf8");
    assert.match(follow, /expiresAt:\s+computeOutboxExpiresAt\(/);
  });

  it("admin retry still resets only failed or dead rows", () => {
    const admin = readFileSync("server/routes/admin.routes.ts", "utf8");
    assert.match(admin, /existing\.status !== "failed" && existing\.status !== "dead"/);
  });

  it("logs the expiry rule from the outbox scheduler start", () => {
    const seen: unknown[][] = [];
    (logger as any).info = (...args: unknown[]) => {
      seen.push(args);
    };
    logEmailOutboxExpiry();
    const flat = JSON.stringify(seen);
    assert.ok(flat.includes(EMAIL_OUTBOX_EXPIRY_BOOT_MESSAGE), flat);
    assert.equal(flat.includes("@"), false);
    const start = readFileSync("server/services/email-outbox.service.ts", "utf8");
    assert.match(start, /start\(intervalMs[\s\S]*?logEmailOutboxExpiry\(\)/);
    assert.equal(typeof emailOutboxScheduler.start, "function");
  });
});

describe("admin digest counts", () => {
  it("omits the section when nothing is expired or held, and prints counts and escaped reasons", () => {
    assert.equal(buildOutboxHoldDigestSection(undefined), "");
    assert.equal(buildOutboxHoldDigestSection({ expired: 0, held: [] }), "");
    const html = buildOutboxHoldDigestSection({
      expired: 3,
      held: [{ reason: "EMAIL_TEMPLATE_ALLOWLIST <held>", count: 2 }],
    });
    assert.match(html, /3 cancelled with reason expired/);
    assert.match(html, /EMAIL_TEMPLATE_ALLOWLIST &lt;held&gt;/);
    assert.match(html, />2</);
    assert.equal(html.includes("@"), false);
    const scheduler = readFileSync("server/services/admin-digest-scheduler.service.ts", "utf8");
    assert.match(scheduler, /loadOutboxHoldSummary\(\)/);
    assert.match(scheduler, /outboxHolds/);
    assert.match(scheduler, /delivery\.outcome !== "sent"[\s\S]*settleAdminDigestDelivery\(dateKey, delivery\)/);
    const email = readFileSync("server/services/email.service.ts", "utf8");
    assert.match(email, /\$\{expiredCount > 0 \? `, \$\{expiredCount\} expired` : ""\}/);
    assert.match(email, /\$\{heldCount > 0 \? `, \$\{heldCount\} held` : ""\}/);
  });
});

describe("migration 411 on the database", () => {
  const dbOk = process.env.JOURNEY_DB_WRITES_OK === "1" && Boolean(process.env.DATABASE_URL);
  it("adds a nullable column with no default, and a past row is cancelled without being returned", { skip: !dbOk }, async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const to = `expiry-411-${Date.now()}@traveloure.test`;
    try {
      const col = await pool.query(
        `SELECT is_nullable, column_default, data_type
           FROM information_schema.columns
          WHERE table_name = 'email_outbox' AND column_name = 'expires_at'`,
      );
      assert.equal(col.rowCount, 1);
      assert.equal(col.rows[0].is_nullable, "YES");
      assert.equal(col.rows[0].column_default, null);
      assert.equal(col.rows[0].data_type, "timestamp with time zone");

      const omitted = await pool.query(
        `INSERT INTO email_outbox (email_type, to_email, subject, html, status)
         VALUES ('password_reset', $1, 'omit', '<p>x</p>', 'pending')
         RETURNING expires_at`,
        [to],
      );
      assert.equal(omitted.rows[0].expires_at, null);

      await pool.query(
        `INSERT INTO email_outbox (email_type, to_email, subject, html, status, expires_at, attempt_count)
         VALUES
           ('password_reset', $1, 'past', '<p>x</p>', 'pending', NOW() - INTERVAL '1 hour', 0),
           ('password_reset', $1, 'future', '<p>x</p>', 'pending', NOW() + INTERVAL '1 day', 0)`,
        [to],
      );

      const claimed = await pool.query(
        `WITH due AS (
           SELECT id, expires_at FROM email_outbox
           WHERE to_email = $1
             AND (
               (status IN ('pending', 'failed', 'held') AND (retry_after IS NULL OR retry_after <= NOW()))
               OR (status = 'processing' AND retry_after < NOW() - INTERVAL '1 minute')
             )
             AND email_type = 'password_reset'
           ORDER BY created_at ASC
           LIMIT 50
           FOR UPDATE SKIP LOCKED
         ),
         expired AS (
           UPDATE email_outbox AS e
           SET status = 'cancelled', last_error = 'expired', retry_after = NULL, updated_at = NOW()
           FROM due d
           WHERE e.id = d.id AND d.expires_at IS NOT NULL AND d.expires_at <= NOW()
           RETURNING e.id
         ),
         candidates AS (
           SELECT d.id FROM due d
           WHERE (d.expires_at IS NULL OR d.expires_at > NOW())
             AND NOT EXISTS (SELECT 1 FROM expired x WHERE x.id = d.id)
         )
         UPDATE email_outbox AS o
         SET status = 'processing', retry_after = NOW() + INTERVAL '10 minutes', updated_at = NOW()
         FROM candidates c
         WHERE o.id = c.id
         RETURNING o.id, o.subject, o.expires_at`,
        [to],
      );
      const subjects = claimed.rows.map((row) => row.subject).sort();
      assert.deepEqual(subjects, ["future", "omit"]);

      const stored = await pool.query(
        `SELECT subject, status, last_error, attempt_count FROM email_outbox WHERE to_email = $1 ORDER BY subject`,
        [to],
      );
      const bySubject = Object.fromEntries(stored.rows.map((row) => [row.subject, row]));
      assert.equal(bySubject.past.status, "cancelled");
      assert.equal(bySubject.past.last_error, "expired");
      assert.equal(Number(bySubject.past.attempt_count), 0);
      assert.equal(bySubject.future.status, "processing");
      assert.equal(bySubject.omit.status, "processing");
    } finally {
      await pool.query(`DELETE FROM email_outbox WHERE to_email = $1`, [to]);
      await pool.end();
    }
  });
});
