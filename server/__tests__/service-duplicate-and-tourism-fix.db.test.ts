/**
 * FW2-A — behavioural proof for T3-1 and T4-1.
 *
 * T3-1: `storage.duplicateService` spread the original `provider_services` row into the
 *       insert WITHOUT stripping `tracking_number` (UNIQUE) — every call collided and 500'd.
 *       Proven fixed: duplicateService succeeds and the copy carries a FRESH tracking_number
 *       (never equal to the original's), while still landing status='draft' +
 *       approval_status='submitted' (F2 posture, unchanged intent).
 *
 * T4-1: GET /api/admin/analytics/tourism's `avg(EXTRACT(DAY FROM (end_date - start_date)))`
 *       500'd because `date - date` is already an integer in Postgres, and there is no
 *       `extract(unknown, integer)` overload. Proven fixed by running the corrected
 *       expression (`avg(end_date - start_date)::numeric`) directly against the DB.
 *
 * DISPOSABLE DB ONLY — mirrors provider-money-hardening.db.test.ts's guard. Every row this
 * file writes is created by this file and deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/service-duplicate-and-tourism-fix.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `sdt-${RUN}-prov`,
};
const createdServiceIds: string[] = [];

// ── Disposable-DB guard (same shape as provider-money-hardening.db.test.ts) ──────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[service-duplicate-and-tourism-fix] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`sdt-${RUN}-prov@t.test`}, 'SDT', 'Provider', 'service_provider')
  `);
});

after(async () => {
  for (const id of createdServiceIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.provider}`).catch(() => {});
});

test("T3-1: duplicateService succeeds (no UNIQUE collision) and mints a FRESH trackingNumber", async () => {
  const original = await storage.createProviderService({
    serviceName: `SDT original ${RUN}`,
    price: "100.00",
    userId: ids.provider,
  } as any);
  createdServiceIds.push(original.id);
  assert.ok(original.trackingNumber, "fixture precondition: the original must have a trackingNumber to collide on");

  // Pre-fix this threw a UNIQUE-violation (23505) on tracking_number before ever reaching
  // a resolved row — the always-500 the route's swallowed catch was hiding.
  const duplicated = await storage.duplicateService(original.id, ids.provider);
  assert.ok(duplicated, "duplicateService must return the new row, not throw/undefined");
  createdServiceIds.push(duplicated!.id);

  assert.notEqual(duplicated!.id, original.id, "the copy must be a distinct row");
  assert.ok(duplicated!.trackingNumber, "the copy must carry a trackingNumber");
  assert.notEqual(
    duplicated!.trackingNumber,
    original.trackingNumber,
    "the copy's trackingNumber must be FRESH, never a carry-over of the original's (that is the UNIQUE collision)",
  );

  // F2 posture preserved: a duplicate of an (in this fixture, submitted-by-default) listing is
  // never silently born approved/active.
  assert.equal(duplicated!.approvalStatus, "submitted", "a duplicate must be born approval_status='submitted'");
  assert.equal(duplicated!.status, "draft", "a duplicate must be born status='draft', not silently 'active'");

  // Confirm at the DB layer too — both trackingNumbers actually persisted and differ.
  const rows = await db.execute(sql`
    SELECT id, tracking_number FROM provider_services WHERE id IN (${original.id}, ${duplicated!.id})
  `);
  const byId = new Map((rows.rows as any[]).map((r) => [r.id, r.tracking_number]));
  assert.equal(byId.size, 2, "both rows must be persisted");
  assert.notEqual(byId.get(original.id), byId.get(duplicated!.id));
});

test("T4-1: the corrected tourism avg-trip-duration expression runs without error", async () => {
  // Reproduces the exact broken expression first, to document the failure mode this fixes.
  await assert.rejects(
    () => db.execute(sql`SELECT avg(EXTRACT(DAY FROM (end_date - start_date)))::numeric FROM trips WHERE start_date IS NOT NULL AND end_date IS NOT NULL`),
    /extract/i,
    "the pre-fix expression must fail with the extract(unknown, integer) overload error",
  );

  // The fix: date - date is already an integer day count in Postgres.
  const result = await db.execute(
    sql`SELECT avg(end_date - start_date)::numeric AS avg_days FROM trips WHERE start_date IS NOT NULL AND end_date IS NOT NULL`,
  );
  assert.ok(result.rows.length === 1, "the corrected expression must return exactly one aggregate row");
});
