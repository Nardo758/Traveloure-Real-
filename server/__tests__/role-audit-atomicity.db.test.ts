/**
 * Role-change audit atomicity tests (real DB, real failure injection).
 *
 * A1: updateUserRole writes an audit record with correct oldRole/newRole/reason.
 * A2: if the audit insert fails (FK violation via nonexistent actorId), the
 *     role change itself rolls back — no silent unaudited role change.
 * A3: expert self-switch path (storage.updateLocalExpertFormType with audit)
 *     is atomic the same way: audit failure rolls back the role change.
 *
 * Run: JOURNEY_DB_WRITES_OK=1 tsx --test server/__tests__/role-audit-atomicity.db.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { users, accessAuditLogs, localExpertForms } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { updateUserRole } from "../services/admin-query.service";
import { storage } from "../storage";

if (!process.env.JOURNEY_DB_WRITES_OK) {
  throw new Error("Set JOURNEY_DB_WRITES_OK=1 to run DB-writing tests");
}

const suffix = randomUUID().slice(0, 8);
const mkUser = async (role: string) => {
  const [u] = await db
    .insert(users)
    .values({
      email: `audit-atomic-${role}-${suffix}-${randomUUID().slice(0, 6)}@traveloure.test`,
      firstName: "Audit",
      lastName: "Test",
      role,
    } as any)
    .returning({ id: users.id });
  return u.id;
};

const getRole = async (id: string) =>
  (await db.select({ role: users.role }).from(users).where(eq(users.id, id)))[0]?.role;

const cleanup: string[] = [];

test("A1: updateUserRole commits role + audit with correct metadata", async () => {
  const admin = await mkUser("admin");
  const target = await mkUser("user");
  cleanup.push(admin, target);

  await updateUserRole(target, "expert", {
    actorId: admin,
    actorRole: "admin",
    reason: "test_admin_approval",
  });

  assert.equal(await getRole(target), "expert", "role updated");

  const [log] = await db
    .select()
    .from(accessAuditLogs)
    .where(and(eq(accessAuditLogs.targetUserId, target), eq(accessAuditLogs.action, "role_change")))
    .orderBy(desc(accessAuditLogs.createdAt))
    .limit(1);
  assert.ok(log, "audit record exists");
  assert.equal(log.actorId, admin);
  assert.equal(log.actorRole, "admin");
  const meta = log.metadata as any;
  assert.equal(meta.oldRole, "user");
  assert.equal(meta.newRole, "expert");
  assert.equal(meta.reason, "test_admin_approval");
});

test("A2: audit insert failure rolls back the role change (updateUserRole)", async () => {
  const target = await mkUser("user");
  cleanup.push(target);

  // Nonexistent actorId violates the access_audit_logs.actor_id FK → the
  // audit insert fails inside the transaction → role update must roll back.
  await assert.rejects(
    updateUserRole(target, "admin", {
      actorId: randomUUID(), // no such user
      actorRole: "admin",
      reason: "should_never_commit",
    }),
    "updateUserRole must throw when the audit insert fails",
  );

  assert.equal(await getRole(target), "user", "role change rolled back");
  const logs = await db
    .select()
    .from(accessAuditLogs)
    .where(eq(accessAuditLogs.targetUserId, target));
  assert.equal(logs.length, 0, "no audit record committed");
});

test("A3: self-switch path is atomic — audit failure rolls back role + form type", async () => {
  const expert = await mkUser("expert");
  cleanup.push(expert);
  await db.insert(localExpertForms).values({
    userId: expert,
    fullName: "Audit Test",
    email: `form-${suffix}@traveloure.test`,
    expertType: "expert",
    status: "approved",
  } as any);

  await assert.rejects(
    storage.updateLocalExpertFormType(expert, "trip_designer", {
      actorId: randomUUID(), // no such user → FK violation on audit insert
      actorRole: "expert",
      oldRole: "expert",
      reason: "expert_self_switch",
    }),
    "self-switch must throw when the audit insert fails",
  );

  assert.equal(await getRole(expert), "expert", "role rolled back");
  const [form] = await db
    .select({ expertType: localExpertForms.expertType })
    .from(localExpertForms)
    .where(eq(localExpertForms.userId, expert));
  assert.equal(form.expertType, "expert", "form type rolled back");

  // And the success path commits role + form + audit together.
  await storage.updateLocalExpertFormType(expert, "trip_designer", {
    actorId: expert,
    actorRole: "expert",
    oldRole: "expert",
    reason: "expert_self_switch",
  });
  assert.equal(await getRole(expert), "trip_designer");
  const [log] = await db
    .select()
    .from(accessAuditLogs)
    .where(and(eq(accessAuditLogs.targetUserId, expert), eq(accessAuditLogs.action, "role_change")))
    .orderBy(desc(accessAuditLogs.createdAt))
    .limit(1);
  assert.equal((log.metadata as any).newRole, "trip_designer");
  assert.equal((log.metadata as any).reason, "expert_self_switch");
});

test("cleanup", async () => {
  for (const id of cleanup) {
    await db.delete(accessAuditLogs).where(eq(accessAuditLogs.targetUserId, id));
    await db.delete(accessAuditLogs).where(eq(accessAuditLogs.actorId, id));
    await db.delete(localExpertForms).where(eq(localExpertForms.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
});
