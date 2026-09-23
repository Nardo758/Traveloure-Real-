/**
 * PROVIDER BOOKING ALERTS GO THROUGH THE RETRYING OUTBOX — board task #1564, ledger
 * `2026-09-23-phase2-messages`.
 *
 * The provider's "new booking request" email used to be sent straight to Resend, with no record
 * and no retry, so a Resend outage lost it. It is now enqueued like every other transactional
 * email.
 *
 *   A1  The payload escapes what a traveler or provider typed, and names the service in the subject.
 *   A2  A failed send leaves a durable outbox row (`provider_booking_alert`, the booking id in its
 *       metadata) scheduled for retry — not a log line.
 *   A3  A successful send marks the row sent.
 *
 * DISPOSABLE DB ONLY. The send itself is faked through `_outboxTestHooks.sendEmailFn`; no Resend
 * call is made. Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/booking-alert-outbox.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, before, test } from "node:test";
import { buildBookingAlertEmailPayload } from "../services/email.service";
import { _outboxTestHooks, enqueueBookingAlertEmail } from "../services/email-outbox.service";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RUN = crypto.randomUUID().slice(0, 8);
const bookingIds: string[] = [];

function alert(bookingId: string) {
  bookingIds.push(bookingId);
  return {
    providerEmail: `alert-${RUN}@traveloure.test`,
    providerName: "Aiko <b>Host</b>",
    bookingId,
    serviceName: "Tea & <script>ceremony</script>",
    travelerName: "Sam \"Traveler\"",
    amount: "120.00",
  };
}

async function outboxRow(bookingId: string) {
  const r = await pool.query(
    `SELECT email_type, status, retry_after, attempt_count, metadata FROM email_outbox
      WHERE metadata->>'bookingId' = $1`,
    [bookingId],
  );
  return r.rows;
}

before(() => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
});

afterEach(() => {
  delete _outboxTestHooks.sendEmailFn;
});

after(async () => {
  try {
    await pool.query(`DELETE FROM email_outbox WHERE metadata->>'bookingId' = ANY($1)`, [bookingIds]);
  } finally {
    await pool.end();
  }
});

test("A1: the alert payload escapes typed text and names the service", () => {
  const payload = buildBookingAlertEmailPayload(alert(`alert-${RUN}-pure`));
  assert.match(payload.subject, /^New booking request: Tea & <script>ceremony<\/script>$/);
  assert.ok(!payload.html.includes("<script>"), "HTML is escaped");
  assert.ok(payload.html.includes("Tea &amp; &lt;script&gt;"));
  assert.ok(payload.text.includes("Amount:    $120.00"));
});

test("A2: a failed send leaves a durable row scheduled for retry", async () => {
  _outboxTestHooks.sendEmailFn = async () => ({ ok: false, error: "simulated Resend outage" });
  const bookingId = `alert-${RUN}-fail`;
  const id = await enqueueBookingAlertEmail(alert(bookingId));
  assert.ok(id, "an outbox row was written");
  const rows = await outboxRow(bookingId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email_type, "provider_booking_alert");
  assert.equal(rows[0].status, "failed");
  assert.ok(rows[0].retry_after, "the row is scheduled for another attempt");
  assert.equal(rows[0].attempt_count, 1);
});

test("A3: a successful send marks the row sent", async () => {
  _outboxTestHooks.sendEmailFn = async () => ({ ok: true, id: "re_test_123" });
  const bookingId = `alert-${RUN}-ok`;
  await enqueueBookingAlertEmail(alert(bookingId));
  const rows = await outboxRow(bookingId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "sent");
});
