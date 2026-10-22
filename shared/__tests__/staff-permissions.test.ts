/**
 * Ops gap 11 — support and moderator are additive staff roles.
 *
 * Pure map plus a source contract that the blanket guard and the seven job
 * routes read that map, and that payouts, refunds, and fees do not.
 *
 * Run: npx tsx --test shared/__tests__/staff-permissions.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { userRoleEnum } from "../models/auth";
import { isEarnerRole, isStaffRole, STAFF_ROLES } from "../roles";
import {
  STAFF_PERMISSIONS,
  STAFF_ROUTE_RULES,
  permissionsForRole,
  staffHasPermission,
  staffMayPassBlanketGuard,
  type StaffPermission,
} from "../staff-permissions";
import { isRoleTransitionAllowed, roleFamily } from "../../server/services/role-transition";
import { decideEmailMerge, EMAIL_MERGE_REFUSED_ROLES } from "../../server/replit_integrations/auth/email-merge";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const SUPPORT_JOBS: Array<[string, string]> = [
  ["GET", "/api/admin/contact-submissions"],
  ["GET", "/api/admin/contact-submissions?status=open"],
  ["PATCH", "/api/admin/contact-submissions/sub-1"],
  ["GET", "/api/admin/bookings/service/book-1"],
  ["GET", "/api/admin/bookings/legacy/book-1"],
  ["GET", "/api/admin/bookings/liteapi/book-1"],
];

const MODERATOR_JOBS: Array<[string, string]> = [
  ["GET", "/api/admin/message-reports"],
  ["GET", "/api/admin/message-reports?status=pending"],
  ["PATCH", "/api/admin/message-reports/rep-1"],
  ["GET", "/api/admin/conversations"],
  ["GET", "/api/admin/conversations?contextKind=booking&contextId=book-1"],
  ["PATCH", "/api/admin/services/svc-1/status"],
];

const ADMIN_ONLY: Array<[string, string]> = [
  ["GET", "/api/admin/payouts"],
  ["POST", "/api/admin/payouts"],
  ["PATCH", "/api/admin/payouts/pay-1"],
  ["GET", "/api/admin/fee-bands"],
  ["PATCH", "/api/admin/fee-bands/beta_flat"],
  ["POST", "/api/admin/fee-config"],
  ["GET", "/api/admin/revenue"],
  ["GET", "/api/admin/bookings"],
  ["POST", "/api/admin/bookings/book-1/exception-refund"],
  ["GET", "/api/admin/bookings/book-1/exception-refund"],
  ["POST", "/api/admin/bookings/service/book-1/resolve"],
  ["GET", "/api/admin/bookings/service/book-1/resolve"],
  ["DELETE", "/api/admin/services/svc-1"],
  ["PATCH", "/api/admin/services/svc-1/featured"],
  ["GET", "/api/admin/users"],
  ["GET", "/api/admin/bookings/stale-pending"],
];

test("support and moderator are staff, not earners, and fit the role column", () => {
  assert.deepEqual([...STAFF_ROLES], ["admin", "support", "moderator"]);
  for (const role of ["support", "moderator", "admin"] as const) {
    assert.equal(isStaffRole(role), true);
    assert.equal(isEarnerRole(role), false);
    assert.equal(roleFamily(role), null);
    assert.ok(userRoleEnum.includes(role));
    assert.ok(role.length <= 30, `${role} exceeds users.role varchar(30)`);
  }
  assert.equal(isStaffRole("user"), false);
  assert.equal(isStaffRole("travel_expert"), false);
  assert.equal(isStaffRole("service_provider"), false);
  assert.match(read("shared/models/auth.ts"), /role: varchar\("role", \{ length: 30 \}\)/);
});

test("the permission map is the fixed split, and admin holds every permission", () => {
  assert.deepEqual(
    [...permissionsForRole("support")],
    ["contact_submissions", "booking_detail_read"],
  );
  assert.deepEqual(
    [...permissionsForRole("moderator")],
    ["message_reports", "report_context", "listing_status"],
  );
  assert.equal(permissionsForRole("admin"), "all");
  for (const permission of STAFF_PERMISSIONS) {
    assert.equal(staffHasPermission("admin", permission), true, permission);
    assert.equal(staffHasPermission("user", permission), false, permission);
    assert.equal(staffHasPermission("travel_expert", permission), false, permission);
    assert.equal(staffHasPermission(null, permission), false, permission);
  }
  for (const permission of ["message_reports", "report_context", "listing_status"] as StaffPermission[]) {
    assert.equal(staffHasPermission("support", permission), false, permission);
  }
  for (const permission of ["contact_submissions", "booking_detail_read"] as StaffPermission[]) {
    assert.equal(staffHasPermission("moderator", permission), false, permission);
  }
  const granted = new Set(STAFF_ROUTE_RULES.map((rule) => rule.permission));
  assert.deepEqual([...granted].sort(), [...STAFF_PERMISSIONS].sort());
});

test("support and moderator can do their jobs and are refused on payouts, refunds, and fees", () => {
  for (const [method, url] of SUPPORT_JOBS) {
    assert.equal(staffMayPassBlanketGuard("support", method, url), true, `${method} ${url}`);
    assert.equal(staffMayPassBlanketGuard("moderator", method, url), false, `moderator ${method} ${url}`);
    assert.equal(staffMayPassBlanketGuard("admin", method, url), true, `admin ${method} ${url}`);
    assert.equal(staffMayPassBlanketGuard("user", method, url), false, `user ${method} ${url}`);
  }
  for (const [method, url] of MODERATOR_JOBS) {
    assert.equal(staffMayPassBlanketGuard("moderator", method, url), true, `${method} ${url}`);
    assert.equal(staffMayPassBlanketGuard("support", method, url), false, `support ${method} ${url}`);
    assert.equal(staffMayPassBlanketGuard("admin", method, url), true, `admin ${method} ${url}`);
  }
  for (const [method, url] of ADMIN_ONLY) {
    assert.equal(staffMayPassBlanketGuard("support", method, url), false, `support ${method} ${url}`);
    assert.equal(staffMayPassBlanketGuard("moderator", method, url), false, `moderator ${method} ${url}`);
    assert.equal(staffMayPassBlanketGuard("admin", method, url), true, `admin ${method} ${url}`);
    assert.equal(staffMayPassBlanketGuard("executive_assistant", method, url), false, `ea ${method} ${url}`);
  }
  // Mount-relative path (the shape inside some Express mounts) still resolves.
  assert.equal(staffMayPassBlanketGuard("support", "GET", "/contact-submissions"), true);
  assert.equal(staffMayPassBlanketGuard("support", "GET", "/api/admin/contact-submissions/../payouts"), false);
});

test("assigning a staff role is a legal transition and a social merge cannot land on one", () => {
  assert.equal(isRoleTransitionAllowed("user", "support"), true);
  assert.equal(isRoleTransitionAllowed("service_provider", "moderator"), true);
  assert.equal(isRoleTransitionAllowed("support", "admin"), true);
  assert.equal(isRoleTransitionAllowed("moderator", "user"), true);
  assert.deepEqual([...EMAIL_MERGE_REFUSED_ROLES], ["admin", "support", "moderator"]);
  for (const role of ["admin", "support", "moderator"]) {
    assert.deepEqual(
      decideEmailMerge({ emailVerified: true, owner: { role } }),
      { merge: false, reason: "privileged_account" },
    );
  }
  assert.deepEqual(
    decideEmailMerge({ emailVerified: true, owner: { role: "user" } }),
    { merge: true },
  );
});

test("the role-change audit query does not filter roles, so support and moderator are included", () => {
  const src = read("server/services/admin-query.service.ts");
  const start = src.indexOf("export async function getRoleChangeAuditLogs");
  const end = src.indexOf("export async function getAuditLogsForResource");
  assert.ok(start > -1 && end > start);
  const query = src.slice(start, end);
  assert.match(query, /action = 'role_change'/);
  assert.doesNotMatch(query, /new_role|newRole|IN \(/);
});

test("the blanket guard and only the gap routes call the shared helper", () => {
  const guard = read("server/routes.ts");
  const guardStart = guard.indexOf("const adminApiGuard = async (req");
  const guardEnd = guard.indexOf('app.use("/api/admin", adminApiGuard)');
  const guardBody = guard.slice(guardStart, guardEnd);
  assert.match(guardBody, /staffMayPassBlanketGuard\(user\.role, req\.method, req\.originalUrl \|\| req\.path\)/);
  assert.match(guardBody, /user\.isDeleted/);
  assert.match(guardBody, /user\.isSuspended/);
  assert.doesNotMatch(guardBody, /user\.role !== "admin"/);

  const admin = read("server/routes/admin.routes.ts");
  const wired = [
    'router.get("/api/admin/contact-submissions", isAuthenticated, requireStaff("contact_submissions")',
    'router.patch("/api/admin/contact-submissions/:id", isAuthenticated, requireStaff("contact_submissions")',
    'router.get("/api/admin/bookings/:kind(service|legacy|liteapi)/:id", isAuthenticated, requireStaff("booking_detail_read")',
    'router.get("/api/admin/message-reports", isAuthenticated, requireStaff("message_reports")',
    'router.patch("/api/admin/message-reports/:id", isAuthenticated, requireStaff("message_reports")',
    'router.patch("/api/admin/services/:id/status", isAuthenticated, requireStaff("listing_status")',
  ];
  for (const line of wired) assert.ok(admin.includes(line), line);
  assert.equal(admin.match(/requireStaff\(/g)?.length, wired.length);

  const conversations = read("server/routes/conversations.routes.ts");
  assert.match(
    conversations,
    /router\.get\("\/api\/admin\/conversations", isAuthenticated, requireStaff\("report_context"\)/,
  );

  const helper = read("server/utils/staff-access.ts");
  assert.match(helper, /export function requireStaff\(permission: StaffPermission\)/);
  assert.match(helper, /staffHasPermission\(user\.role, permission\)/);
  assert.match(helper, /user\.isDeleted/);
  assert.match(helper, /user\.isSuspended/);

  // Money routes stay on the existing admin check. This is the no-sweep pin.
  for (const marker of [
    'router.get("/api/admin/payouts"',
    'router.patch("/api/admin/fee-bands/:bandKey"',
    'router.post("/api/admin/bookings/:bookingId/exception-refund"',
    'router.post("/api/admin/bookings/:kind(service|legacy|liteapi)/:id/resolve"',
    'router.delete("/api/admin/services/:id"',
  ]) {
    const at = admin.indexOf(marker);
    assert.ok(at > -1, marker);
    const slice = admin.slice(at, at + 500);
    assert.match(slice, /role !== "admin"/, marker);
    assert.doesNotMatch(slice, /requireStaff\(/, marker);
  }
});
