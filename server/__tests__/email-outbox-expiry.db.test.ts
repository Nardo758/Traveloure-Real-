/**
 * Outbox expiry against Postgres (fix queue row 167).
 *
 * An expired row is held and not sent. A row that has not expired still follows
 * the allowlist. A NULL expires_at follows the previous send rules.
 *
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/email-outbox-expiry.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { _outboxTestHooks, drainOutbox } from "../services/email-outbox.service";
import { invalidatePlatformFlagCache } from "../services/platform-flags";

const PROBE = "outbox_expiry_probe";
const OTHER = "outbox_expiry_other";
const RUN = crypto.randomUUID();

const priorSends = process.env.EMAIL_SENDS_ENABLED;
const priorAllow = process.env.EMAIL_TEMPLATE_ALLOWLIST;

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type OutboxRow = {
  email_type: string;
  to_email: string;
  status: string;
  last_error: string | null;
  expires_at: Date | null;
  metadata: { expiryReason?: string; expiryRun?: string };
};

async function insertRow(input: {
  emailType: string;
  toEmail: string;
  expiresAt: Date | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO email_outbox
       (email_type, to_email, subject, html, status, attempt_count, max_attempts, expires_at, metadata)
     VALUES ($1, $2, 'expiry probe', '<p>probe</p>', 'pending', 0, 6, $3, $4::jsonb)`,
    [input.emailType, input.toEmail, input.expiresAt, JSON.stringify({ expiryRun: RUN })],
  );
}

async function rows(): Promise<OutboxRow[]> {
  const result = await pool.query<OutboxRow>(
    `SELECT email_type, to_email, status, last_error, expires_at, metadata
       FROM email_outbox
      WHERE metadata->>'expiryRun' = $1`,
    [RUN],
  );
  return result.rows;
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  const column = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'email_outbox' AND column_name = 'expires_at'`,
  );
  assert.equal(column.rowCount, 1, "migration 411 has not added email_outbox.expires_at");
  await pool.query(`DELETE FROM email_outbox WHERE email_type IN ($1, $2)`, [PROBE, OTHER]);
});

after(async () => {
  delete _outboxTestHooks.sendEmailFn;
  if (priorSends === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = priorSends;
  if (priorAllow === undefined) delete process.env.EMAIL_TEMPLATE_ALLOWLIST;
  else process.env.EMAIL_TEMPLATE_ALLOWLIST = priorAllow;
  try {
    await pool.query(`DELETE FROM email_outbox WHERE metadata->>'expiryRun' = $1`, [RUN]);
  } finally {
    await pool.end();
  }
});

test("expired rows are held, a future allowlisted row and a NULL row follow the existing rules", async () => {
  process.env.EMAIL_SENDS_ENABLED = "true";
  process.env.EMAIL_TEMPLATE_ALLOWLIST = PROBE;
  invalidatePlatformFlagCache();

  const past = "past-probe@traveloure.test";
  const future = "future-probe@traveloure.test";
  const open = "null-probe@traveloure.test";
  const otherFuture = "future-other@traveloure.test";
  const otherPast = "past-other@traveloure.test";
  const hour = 60 * 60 * 1000;
  await insertRow({ emailType: PROBE, toEmail: past, expiresAt: new Date(Date.now() - hour) });
  await insertRow({ emailType: PROBE, toEmail: future, expiresAt: new Date(Date.now() + 3 * 24 * hour) });
  await insertRow({ emailType: PROBE, toEmail: open, expiresAt: null });
  await insertRow({ emailType: OTHER, toEmail: otherFuture, expiresAt: new Date(Date.now() + 3 * 24 * hour) });
  await insertRow({ emailType: OTHER, toEmail: otherPast, expiresAt: new Date(Date.now() - hour) });

  const sent: string[] = [];
  _outboxTestHooks.sendEmailFn = async (params) => {
    sent.push(Array.isArray(params.to) ? params.to.join(",") : params.to);
    return { ok: true, id: "probe-sent" };
  };

  const flag = await pool.query<{ setting_value: string }>(
    `SELECT setting_value FROM platform_settings WHERE setting_key = 'email_notifications_enabled' LIMIT 1`,
  );
  const stored = flag.rows[0]?.setting_value ?? null;
  const notificationsOn = stored === null || stored === "true";

  const result = await drainOutbox();
  assert.equal(result.drained, 2, "only the two non-expired allowlisted rows are claimed");

  const found = await rows();
  const byTo = new Map(found.map((row) => [row.to_email, row]));
  const expiredProbe = byTo.get(past);
  const futureProbe = byTo.get(future);
  const nullProbe = byTo.get(open);
  const unlistedFuture = byTo.get(otherFuture);
  const unlistedPast = byTo.get(otherPast);
  assert.ok(expiredProbe && futureProbe && nullProbe && unlistedFuture && unlistedPast);

  assert.equal(expiredProbe.status, "held");
  assert.equal(expiredProbe.last_error, "expired");
  assert.equal(expiredProbe.metadata.expiryReason, "expired");
  assert.equal(expiredProbe.metadata.expiryRun, RUN);
  assert.equal(sent.includes(past), false);

  assert.equal(unlistedPast.status, "held");
  assert.equal(unlistedPast.last_error, "expired");
  assert.equal(unlistedPast.metadata.expiryReason, "expired");
  assert.equal(sent.includes(otherPast), false);

  assert.equal(unlistedFuture.status, "pending");
  assert.equal(unlistedFuture.last_error, null);
  assert.equal(unlistedFuture.metadata.expiryReason, undefined);
  assert.equal(sent.includes(otherFuture), false);

  for (const row of [futureProbe, nullProbe]) {
    assert.notEqual(row.last_error, "expired");
    assert.equal(row.metadata.expiryReason, undefined);
    if (notificationsOn) {
      assert.equal(row.status, "sent", `${row.to_email} ${row.status} ${row.last_error}`);
      assert.equal(sent.includes(row.to_email), true);
    } else {
      assert.equal(row.status, "pending", `${row.to_email} ${row.status} ${row.last_error}`);
      assert.equal(row.last_error, "Email notifications are disabled by platform settings");
      assert.equal(sent.includes(row.to_email), false);
    }
  }
  assert.equal(nullProbe.expires_at, null);
});
