import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";

const { db, pool } = await import("../db");
const { users, messageReports } = await import("@shared/schema");
const { reportUser } = await import("../services/messages.service");

const runId = crypto.randomUUID();
const reporterId = `reporter-${runId}`;
const reportedId = `reported-${runId}`;
let reportId: string | null = null;

function assertDisposableDatabase(): void {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "set JOURNEY_DB_WRITES_OK=1 to enable disposable-DB writes");
  assert.equal(process.env.PROD_DATABASE_URL, undefined, "PROD_DATABASE_URL must be unset");
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL must point to the development database");
}

before(async () => {
  assertDisposableDatabase();
  await db.insert(users).values([
    { id: reporterId, email: `${reporterId}@test.invalid`, firstName: "Report", lastName: "Reporter" },
    { id: reportedId, email: `${reportedId}@test.invalid`, firstName: "Reported", lastName: "User" },
  ] as any);
});

after(async () => {
  if (reportId) {
    await pool.query("DELETE FROM admin_notifications WHERE metadata->>'reportId' = $1", [reportId]).catch(() => {});
    await pool.query("DELETE FROM message_reports WHERE id = $1", [reportId]).catch(() => {});
  }
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[reporterId, reportedId]]).catch(() => {});
});

test("new user report stays pending, sends its best-effort admin notification, and does not enforce", async () => {
  assertDisposableDatabase();
  const report = await reportUser(reporterId, reportedId, "harassment", "DB regression report");
  reportId = report.id;
  const [saved] = await db.select().from(messageReports).where(eq(messageReports.id, report.id));
  assert.equal(saved.status, "pending");
  assert.equal(saved.reportType, "user");

  const notificationRows = await pool.query(
    "SELECT id FROM admin_notifications WHERE type = 'message_report' AND metadata->>'reportId' = $1",
    [report.id],
  );
  assert.equal(notificationRows.rowCount, 1);
  const [target] = await db.select().from(users).where(eq(users.id, reportedId));
  assert.equal(target.isSuspended, false);
});