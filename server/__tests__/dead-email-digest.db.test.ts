/**
 * UNDELIVERED EMAILS REACH THE DAILY ADMIN DIGEST — board task #1566, ledger
 * `2026-09-23-phase2-messages`.
 *
 * An email that exhausts its retries goes `dead` in the outbox. Until now the only signal was a log
 * line, so a traveler's confirmation could be lost with nobody told.
 *
 *   D1  The summary lists currently-dead rows newest first, counts all of them, and counts the ones
 *       that went dead in the last 24 hours separately. Sent and failed rows are not included.
 *   D2  The digest section is omitted when nothing is dead, escapes what it prints, and says when
 *       it is showing only some of the rows.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/dead-email-digest.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { loadDeadEmailSummary } from "../services/email-outbox.service";
import { buildDeadEmailDigestSection } from "../services/email.service";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const RUN = crypto.randomUUID().slice(0, 8);

async function row(status: string, ageHours: number, label: string): Promise<number> {
  const r = await pool.query(
    `INSERT INTO email_outbox (email_type, to_email, subject, html, status, attempt_count, last_error, metadata, updated_at)
     VALUES ('booking_confirmation', $1, $2, '<p>x</p>', $3, 6, 'simulated', $4::jsonb, NOW() - make_interval(hours => $5))
     RETURNING id`,
    [`dead-${RUN}-${label}@traveloure.test`, `Subject ${label}`, status, JSON.stringify({ run: RUN }), ageHours],
  );
  return Number(r.rows[0].id);
}

before(() => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
});

after(async () => {
  try {
    await pool.query(`DELETE FROM email_outbox WHERE metadata->>'run' = $1`, [RUN]);
  } finally {
    await pool.end();
  }
});

test("D1: currently-dead rows, newest first, with an all-time and a last-24h count", async () => {
  const before = await loadDeadEmailSummary(1000);
  const oldDead = await row("dead", 72, "old");
  const newDead = await row("dead", 1, "new");
  await row("sent", 1, "sent");
  await row("failed", 1, "failed");

  const summary = await loadDeadEmailSummary(1000);
  assert.equal(summary.total, before.total + 2, "both dead rows count; sent and failed rows do not");
  assert.equal(summary.newInLast24h, before.newInLast24h + 1, "only the recent one is new today");
  const ours = summary.rows.filter((r) => r.toEmail.startsWith(`dead-${RUN}-`)).map((r) => r.id);
  assert.deepEqual(ours, [newDead, oldDead], "newest first");
});

test("D2: the digest section — omitted when empty, escaped, and honest about truncation", () => {
  assert.equal(buildDeadEmailDigestSection(undefined), "");
  assert.equal(buildDeadEmailDigestSection({ total: 0, newInLast24h: 0, rows: [] }), "");

  const html = buildDeadEmailDigestSection({
    total: 3,
    newInLast24h: 1,
    rows: [
      {
        id: 7,
        emailType: "booking_confirmation",
        toEmail: "traveler@example.com",
        subject: "Your <b>booking</b>",
        attemptCount: 6,
        lastError: "Resend 500",
        deadAt: new Date().toISOString(),
      },
    ],
  });
  assert.match(html, /Undelivered Emails \(3, 1 new today\)/);
  assert.ok(html.includes("Your &lt;b&gt;booking&lt;/b&gt;"), "subject is escaped");
  assert.ok(html.includes("Showing the 1 most recent of 3."));
  assert.ok(html.includes("/api/admin/email-outbox/&lt;id&gt;/retry"), "names the real retry path");
});
