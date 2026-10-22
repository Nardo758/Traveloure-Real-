/**
 * Ops gap 13 — a listing status change, featured change, affinity-tag edit,
 * listing delete, and message-report decision each write one access_audit_logs
 * row. A refused body, a missing row, or an update the database rejects writes
 * none.
 *
 * Synthetic rows only. Assertions compare single fields and counts. This file
 * does not print row contents.
 *
 * Run against a disposable dev database with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/listing-report-audit.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";
import {
  LISTING_AFFINITY_TAGS_ACTION,
  LISTING_DELETE_ACTION,
  LISTING_FEATURED_ACTION,
  LISTING_STATUS_ACTION,
  MESSAGE_REPORT_DECISION_ACTION,
  MESSAGE_REPORT_RESOURCE,
  PROVIDER_SERVICE_RESOURCE,
} from "../services/admin-decision-audit";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const NOTE = "gap13-note";

const adminEmail = `gap13-${RUN}-admin@traveloure.test`;
const providerId = `gap13-${RUN}-provider`;
const travelerId = `gap13-${RUN}-traveler`;
const reporterId = `gap13-${RUN}-reporter`;
const reportedId = `gap13-${RUN}-reported`;

const ids = {
  status: `gap13-${RUN}-status`,
  featured: `gap13-${RUN}-featured`,
  affinity: `gap13-${RUN}-affinity`,
  deleteHard: `gap13-${RUN}-del-hard`,
  deleteSoft: `gap13-${RUN}-del-soft`,
  statusRefused: `gap13-${RUN}-status-no`,
  affinityRefused: `gap13-${RUN}-tags-no`,
  blockedUpdate: `gap13-${RUN}-block-upd`,
  blockedDelete: `gap13-${RUN}-block-del`,
  report: `gap13-${RUN}-report`,
  reportRefused: `gap13-${RUN}-report-no`,
  blockedReport: `gap13-${RUN}-block-report`,
};
const bookingId = `gap13-${RUN}-booking`;
const serviceIds = Object.values(ids).filter((id) => !id.includes("report"));
const reportIds = [ids.report, ids.reportRefused, ids.blockedReport];

let adminCookie = "";
let adminId = "";

interface AuditField {
  actor_id: string;
  actor_role: string;
  resource_type: string;
  target_user_id: string | null;
  before_status: string | null;
  after_status: string | null;
}

function assertSafeId(id: string): string {
  if (!/^[a-z0-9_-]+$/.test(id)) throw new Error("refusing an id that cannot be placed in a trigger");
  return id;
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      cookie: adminCookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function auditsFor(resourceId: string, action: string): Promise<AuditField[]> {
  const r = await pool.query(
    `SELECT actor_id, actor_role, resource_type, target_user_id,
            metadata->>'beforeStatus' AS before_status,
            metadata->>'afterStatus' AS after_status
     FROM access_audit_logs
     WHERE resource_id = $1 AND action = $2
     ORDER BY created_at ASC, id ASC`,
    [resourceId, action],
  );
  return r.rows as AuditField[];
}

async function auditCount(resourceId: string): Promise<number> {
  const r = await pool.query(`SELECT count(*)::int AS n FROM access_audit_logs WHERE resource_id = $1`, [resourceId]);
  return r.rows[0].n as number;
}

async function listingStatus(id: string): Promise<string | null> {
  const r = await pool.query(`SELECT status FROM provider_services WHERE id = $1`, [id]);
  if (r.rows.length === 0) return null;
  return r.rows[0].status as string;
}

async function reportStatus(id: string): Promise<string | null> {
  const r = await pool.query(`SELECT status FROM message_reports WHERE id = $1`, [id]);
  if (r.rows.length === 0) return null;
  return r.rows[0].status as string;
}

function assertDecision(
  rows: AuditField[],
  expected: { resource: string; target: string; before: string | null; after: string | null },
) {
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_id, adminId);
  assert.equal(rows[0].actor_role, "admin");
  assert.equal(rows[0].resource_type, expected.resource);
  assert.equal(rows[0].target_user_id, expected.target);
  assert.equal(rows[0].before_status, expected.before);
  assert.equal(rows[0].after_status, expected.after);
}

async function insertService(id: string, tags: string[] | null = null): Promise<void> {
  await pool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, price, status, approval_status, delivery_method, is_featured, content_affinity_tags)
     VALUES ($1, $2, $3, '10.00', 'active', 'approved', 'in_person', false, $4::text[])`,
    [id, providerId, `gap13-${RUN}`, tags],
  );
}

async function installBlock(fn: string, trigger: string, table: string, op: "UPDATE" | "DELETE", id: string) {
  const safeFn = assertSafeId(fn);
  const safeTrigger = assertSafeId(trigger);
  const safeId = assertSafeId(id);
  const row = op === "DELETE" ? "OLD" : "NEW";
  await pool.query(
    `CREATE OR REPLACE FUNCTION ${safeFn}() RETURNS trigger AS $fn$
     BEGIN
       IF ${row}.id = '${safeId}' THEN
         RAISE EXCEPTION 'gap13 blocked write';
       END IF;
       RETURN ${row};
     END;
     $fn$ LANGUAGE plpgsql`,
  );
  await pool.query(`DROP TRIGGER IF EXISTS ${safeTrigger} ON ${table}`);
  await pool.query(`CREATE TRIGGER ${safeTrigger} BEFORE ${op} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${safeFn}()`);
}

async function dropBlock(fn: string, trigger: string, table: string) {
  await pool.query(`DROP TRIGGER IF EXISTS ${assertSafeId(trigger)} ON ${table}`);
  await pool.query(`DROP FUNCTION IF EXISTS ${assertSafeId(fn)}()`);
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");

  // Supply intent is allowed while traveler sign-up is in waitlist mode. The role
  // is set to admin on the row afterwards; the intent grants no role by itself.
  const admin = await registerAndSignIn({
    baseUrl: BASE_URL,
    email: adminEmail,
    password: PASSWORD,
    firstName: "Gap13",
    lastName: "Admin",
    extra: { intent: "supply" },
  });
  adminCookie = admin.cookie;
  adminId = admin.id;
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [adminId]);

  await pool.query(
    `INSERT INTO users (id, email, first_name, role) VALUES
       ($1, $2, 'Gap13', 'service_provider'),
       ($3, $4, 'Gap13', 'user'),
       ($5, $6, 'Gap13', 'user'),
       ($7, $8, 'Gap13', 'user')`,
    [
      providerId, `${providerId}@traveloure.test`,
      travelerId, `${travelerId}@traveloure.test`,
      reporterId, `${reporterId}@traveloure.test`,
      reportedId, `${reportedId}@traveloure.test`,
    ],
  );

  for (const id of serviceIds) {
    const tags = id === ids.affinity ? ["general_logistics"] : [];
    await insertService(id, tags);
  }
  await pool.query(
    `INSERT INTO service_bookings
       (id, service_id, traveler_id, provider_id, total_amount, platform_fee, provider_earnings, status)
     VALUES ($1, $2, $3, $4, '10.00', '2.00', '8.00', 'completed')`,
    [bookingId, ids.deleteSoft, travelerId, providerId],
  );
  await pool.query(
    `INSERT INTO message_reports (id, reporter_id, reported_user_id, report_type, reason, status)
     VALUES ($1, $2, $3, 'user', 'spam', 'pending'),
            ($4, $2, $3, 'user', 'spam', 'pending'),
            ($5, $2, $3, 'user', 'spam', 'pending')`,
    [ids.report, reporterId, reportedId, ids.reportRefused, ids.blockedReport],
  );
});

after(async () => {
  try {
    await dropBlock(`gap13_fn_upd_${RUN}`, `gap13_tr_upd_${RUN}`, "provider_services").catch(() => {});
    await dropBlock(`gap13_fn_del_${RUN}`, `gap13_tr_del_${RUN}`, "provider_services").catch(() => {});
    await dropBlock(`gap13_fn_rep_${RUN}`, `gap13_tr_rep_${RUN}`, "message_reports").catch(() => {});
    const resourceIds = [...serviceIds, ...reportIds, bookingId];
    await pool.query(`DELETE FROM admin_notifications WHERE metadata->>'resourceId' = ANY($1)`, [resourceIds]).catch(() => {});
    await pool.query(`DELETE FROM access_audit_logs WHERE actor_id = $1 OR resource_id = ANY($2)`, [adminId, resourceIds]).catch(() => {});
    await pool.query(`DELETE FROM service_bookings WHERE id = $1`, [bookingId]).catch(() => {});
    await pool.query(`DELETE FROM message_reports WHERE id = ANY($1)`, [reportIds]).catch(() => {});
    await pool.query(`DELETE FROM provider_services WHERE id = ANY($1)`, [serviceIds]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = ANY($1) OR email = $2`, [
      [adminId, providerId, travelerId, reporterId, reportedId],
      adminEmail,
    ]).catch(() => {});
  } finally {
    await pool.end();
  }
});

test("action and resource names fit the audit columns", () => {
  for (const name of [
    LISTING_STATUS_ACTION,
    LISTING_FEATURED_ACTION,
    LISTING_AFFINITY_TAGS_ACTION,
    LISTING_DELETE_ACTION,
    MESSAGE_REPORT_DECISION_ACTION,
    PROVIDER_SERVICE_RESOURCE,
    MESSAGE_REPORT_RESOURCE,
  ]) {
    assert.ok(name.length > 0 && name.length <= 50);
  }
});

test("L1: each listing status change writes one row with the before and after status", async () => {
  const first = await call("PATCH", `/api/admin/services/${ids.status}/status`, { status: "suspended" });
  assert.equal(first.status, 200);
  assert.equal(first.json?.status, "suspended");
  assert.equal(Object.prototype.hasOwnProperty.call(first.json ?? {}, "auditWarning"), false);
  assert.equal(await listingStatus(ids.status), "suspended");
  const once = await auditsFor(ids.status, LISTING_STATUS_ACTION);
  assertDecision(once, {
    resource: PROVIDER_SERVICE_RESOURCE,
    target: providerId,
    before: "active",
    after: "suspended",
  });

  const second = await call("PATCH", `/api/admin/services/${ids.status}/status`, { status: "paused" });
  assert.equal(second.status, 200);
  assert.equal(second.json?.status, "paused");
  const twice = await auditsFor(ids.status, LISTING_STATUS_ACTION);
  assert.equal(twice.length, 2);
  assert.equal(twice[1].before_status, "suspended");
  assert.equal(twice[1].after_status, "paused");
  assert.equal(twice[1].actor_id, adminId);
  assert.equal(await auditCount(ids.status), 2);
});

test("L2: featuring a listing writes one row", async () => {
  const res = await call("PATCH", `/api/admin/services/${ids.featured}/featured`, { isFeatured: true });
  assert.equal(res.status, 200);
  assert.equal(res.json?.isFeatured, true);
  assert.equal(Object.prototype.hasOwnProperty.call(res.json ?? {}, "auditWarning"), false);
  const flag = await pool.query(`SELECT is_featured FROM provider_services WHERE id = $1`, [ids.featured]);
  assert.equal(flag.rows[0].is_featured, true);
  assertDecision(await auditsFor(ids.featured, LISTING_FEATURED_ACTION), {
    resource: PROVIDER_SERVICE_RESOURCE,
    target: providerId,
    before: "unfeatured",
    after: "featured",
  });
  assert.equal(await auditCount(ids.featured), 1);
});

test("L3: an affinity-tag edit writes one row and drops a tag that is not allowed", async () => {
  const res = await call("PATCH", `/api/admin/services/${ids.affinity}/affinity-tags`, {
    contentAffinityTags: ["hotel_arrival", "not-a-tag", "photo_shoot"],
  });
  assert.equal(res.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(res.json ?? {}, "auditWarning"), false);
  const tags = await pool.query(
    `SELECT array_to_string(content_affinity_tags, ',') AS tags FROM provider_services WHERE id = $1`,
    [ids.affinity],
  );
  assert.equal(tags.rows[0].tags, "hotel_arrival,photo_shoot");
  assertDecision(await auditsFor(ids.affinity, LISTING_AFFINITY_TAGS_ACTION), {
    resource: PROVIDER_SERVICE_RESOURCE,
    target: providerId,
    before: "general_logistics",
    after: "hotel_arrival,photo_shoot",
  });
  assert.equal(await auditCount(ids.affinity), 1);
});

test("L4: deleting a listing with no bookings writes one row and removes the listing", async () => {
  const res = await call("DELETE", `/api/admin/services/${ids.deleteHard}`);
  assert.equal(res.status, 200);
  assert.equal(res.json?.ok, true);
  assert.equal(res.json?.softDeleted, undefined);
  assert.equal(await listingStatus(ids.deleteHard), null);
  assertDecision(await auditsFor(ids.deleteHard, LISTING_DELETE_ACTION), {
    resource: PROVIDER_SERVICE_RESOURCE,
    target: providerId,
    before: "active",
    after: "deleted",
  });
  assert.equal(await auditCount(ids.deleteHard), 1);
});

test("L5: deleting a listing that has a booking archives it and writes one row", async () => {
  const res = await call("DELETE", `/api/admin/services/${ids.deleteSoft}`);
  assert.equal(res.status, 200);
  assert.equal(res.json?.ok, true);
  assert.equal(res.json?.softDeleted, true);
  assert.equal(await listingStatus(ids.deleteSoft), "suspended");
  const bookings = await pool.query(`SELECT count(*)::int AS n FROM service_bookings WHERE id = $1`, [bookingId]);
  assert.equal(bookings.rows[0].n, 1);
  assertDecision(await auditsFor(ids.deleteSoft, LISTING_DELETE_ACTION), {
    resource: PROVIDER_SERVICE_RESOURCE,
    target: providerId,
    before: "active",
    after: "suspended",
  });
  assert.equal(await auditCount(ids.deleteSoft), 1);
});

test("L6: a message-report decision writes one row with the before and after status", async () => {
  const res = await call("PATCH", `/api/admin/message-reports/${ids.report}`, { status: "actioned", adminNote: NOTE });
  assert.equal(res.status, 200);
  assert.equal(res.json?.status, "actioned");
  assert.equal(Object.prototype.hasOwnProperty.call(res.json ?? {}, "auditWarning"), false);
  assert.equal(await reportStatus(ids.report), "actioned");
  const reviewed = await pool.query(`SELECT reviewed_by FROM message_reports WHERE id = $1`, [ids.report]);
  assert.equal(reviewed.rows[0].reviewed_by, adminId);
  assertDecision(await auditsFor(ids.report, MESSAGE_REPORT_DECISION_ACTION), {
    resource: MESSAGE_REPORT_RESOURCE,
    target: reportedId,
    before: "pending",
    after: "actioned",
  });
  const note = await pool.query(
    `SELECT metadata->>'adminNote' AS note FROM access_audit_logs WHERE resource_id = $1 AND action = $2`,
    [ids.report, MESSAGE_REPORT_DECISION_ACTION],
  );
  assert.equal(note.rows.length, 1);
  assert.equal(note.rows[0].note, NOTE);
  assert.equal(await auditCount(ids.report), 1);
});

test("R1: a refused body or a missing row writes no audit row", async () => {
  const missing = crypto.randomUUID();
  const badStatus = await call("PATCH", `/api/admin/services/${ids.statusRefused}/status`, { status: "hidden" });
  assert.equal(badStatus.status, 400);
  assert.equal(await listingStatus(ids.statusRefused), "active");
  assert.equal(await auditCount(ids.statusRefused), 0);

  assert.equal((await call("PATCH", `/api/admin/services/${missing}/status`, { status: "paused" })).status, 404);
  assert.equal((await call("PATCH", `/api/admin/services/${missing}/featured`, { isFeatured: true })).status, 404);
  assert.equal((await call("PATCH", `/api/admin/services/${missing}/affinity-tags`, { contentAffinityTags: ["hotel_arrival"] })).status, 404);
  assert.equal((await call("DELETE", `/api/admin/services/${missing}`)).status, 404);
  assert.equal(await auditCount(missing), 0);

  const badTags = await call("PATCH", `/api/admin/services/${ids.affinityRefused}/affinity-tags`, { contentAffinityTags: "hotel_arrival" });
  assert.equal(badTags.status, 400);
  assert.equal(await auditCount(ids.affinityRefused), 0);

  const badReport = await call("PATCH", `/api/admin/message-reports/${ids.reportRefused}`, { status: "hidden" });
  assert.equal(badReport.status, 400);
  assert.equal(await reportStatus(ids.reportRefused), "pending");
  assert.equal(await auditCount(ids.reportRefused), 0);

  assert.equal((await call("PATCH", `/api/admin/message-reports/${missing}`, { status: "dismissed" })).status, 404);
  assert.equal(await auditCount(missing), 0);
});

test("R2: an update the database rejects writes no audit row", async () => {
  const updFn = `gap13_fn_upd_${RUN}`;
  const updTr = `gap13_tr_upd_${RUN}`;
  const delFn = `gap13_fn_del_${RUN}`;
  const delTr = `gap13_tr_del_${RUN}`;
  const repFn = `gap13_fn_rep_${RUN}`;
  const repTr = `gap13_tr_rep_${RUN}`;
  try {
    await installBlock(updFn, updTr, "provider_services", "UPDATE", ids.blockedUpdate);
    await installBlock(delFn, delTr, "provider_services", "DELETE", ids.blockedDelete);
    await installBlock(repFn, repTr, "message_reports", "UPDATE", ids.blockedReport);

    const status = await call("PATCH", `/api/admin/services/${ids.blockedUpdate}/status`, { status: "suspended" });
    assert.equal(status.status, 500);
    const featured = await call("PATCH", `/api/admin/services/${ids.blockedUpdate}/featured`, { isFeatured: true });
    assert.equal(featured.status, 500);
    const tags = await call("PATCH", `/api/admin/services/${ids.blockedUpdate}/affinity-tags`, { contentAffinityTags: ["hotel_arrival"] });
    assert.equal(tags.status, 500);
    assert.equal(await listingStatus(ids.blockedUpdate), "active");
    const flag = await pool.query(`SELECT is_featured FROM provider_services WHERE id = $1`, [ids.blockedUpdate]);
    assert.equal(flag.rows[0].is_featured, false);
    const tagCount = await pool.query(
      `SELECT coalesce(array_length(content_affinity_tags, 1), 0)::int AS n FROM provider_services WHERE id = $1`,
      [ids.blockedUpdate],
    );
    assert.equal(tagCount.rows[0].n, 0);
    assert.equal(await auditCount(ids.blockedUpdate), 0);

    const deleted = await call("DELETE", `/api/admin/services/${ids.blockedDelete}`);
    assert.equal(deleted.status, 500);
    assert.equal(await listingStatus(ids.blockedDelete), "active");
    assert.equal(await auditCount(ids.blockedDelete), 0);

    const report = await call("PATCH", `/api/admin/message-reports/${ids.blockedReport}`, { status: "dismissed", adminNote: NOTE });
    assert.equal(report.status, 500);
    assert.equal(await reportStatus(ids.blockedReport), "pending");
    assert.equal(await auditCount(ids.blockedReport), 0);
  } finally {
    await dropBlock(updFn, updTr, "provider_services");
    await dropBlock(delFn, delTr, "provider_services");
    await dropBlock(repFn, repTr, "message_reports");
  }
});
