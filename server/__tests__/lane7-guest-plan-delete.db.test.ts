/**
 * Lane 7 — A-26: an admin deletes one guest test row (ledger `2026-11-05-lane7-guest-slip`).
 *
 *   D1  an unclaimed guest plan is deleted with its items, and the action is audit-logged
 *   D2  a member's plan, a claimed guest plan and an unknown id are one 404 and nothing is deleted
 *   D3  a signed-out caller is 401 and a non-admin is 403; the row stays
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/lane7-guest-plan-delete.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { accessAuditLogs, itineraryItems, trips, users } from "@shared/schema";
import adminRoutes from "../routes/admin.routes";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const adminId = `lane7-admin-${tag}`;
const memberId = `lane7-user-${tag}`;
const tripIds: string[] = [];

async function mkTrip(values: Record<string, unknown>): Promise<string> {
  const [t] = await db
    .insert(trips)
    .values({ title: "Lane 7", destination: "Kyoto, Japan", startDate: "2026-11-11", endDate: "2026-11-12", ...values } as any)
    .returning({ id: trips.id });
  tripIds.push(t.id);
  return t.id;
}

let guestTrip = "";
let guestItem = "";
let memberTrip = "";
let claimedTrip = "";

before(async () => {
  assertDisposableDb();
  await db.insert(users).values([
    { id: adminId, email: `${adminId}@example.test`, role: "admin" },
    { id: memberId, email: `${memberId}@example.test`, role: "user" },
  ] as any);
  guestTrip = await mkTrip({ guestSessionHash: crypto.createHash("sha256").update(tag + "g").digest("hex") });
  const [it] = await db.insert(itineraryItems).values({ tripId: guestTrip, title: "Stop", dayNumber: 1, itemType: "activity" } as any).returning({ id: itineraryItems.id });
  guestItem = it.id;
  memberTrip = await mkTrip({ userId: memberId });
  claimedTrip = await mkTrip({ userId: memberId, guestClaimedAt: new Date() });
});

after(async () => {
  await db.delete(accessAuditLogs).where(eq(accessAuditLogs.actorId, adminId));
  await db.delete(trips).where(inArray(trips.id, tripIds));
  await db.delete(users).where(inArray(users.id, [adminId, memberId]));
});

async function del(id: string, who: string | null): Promise<number> {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => !!who;
    if (who) (req as any).user = { claims: { sub: who } };
    (req as any).logout = (cb: () => void) => cb();
    next();
  });
  app.use(adminRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/guest-plans/${id}`, { method: "DELETE" });
    return res.status;
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const exists = async (id: string) => (await db.select({ id: trips.id }).from(trips).where(eq(trips.id, id))).length === 1;

describe("Lane 7 guest plan delete", () => {
  it("D3 signed out is 401, a member is 403, and the row stays", async () => {
    assert.equal(await del(guestTrip, null), 401);
    assert.equal(await del(guestTrip, memberId), 403);
    assert.ok(await exists(guestTrip));
  });

  it("D2 a member's plan, a claimed plan and an unknown id are 404", async () => {
    assert.equal(await del(memberTrip, adminId), 404);
    assert.equal(await del(claimedTrip, adminId), 404);
    assert.equal(await del(crypto.randomUUID(), adminId), 404);
    assert.ok(await exists(memberTrip));
    assert.ok(await exists(claimedTrip));
  });

  it("D1 an unclaimed guest plan is deleted with its items and audit-logged", async () => {
    assert.equal(await del(guestTrip, adminId), 200);
    assert.equal(await exists(guestTrip), false);
    assert.equal((await db.select().from(itineraryItems).where(eq(itineraryItems.id, guestItem))).length, 0);
    const audit = await db
      .select()
      .from(accessAuditLogs)
      .where(and(eq(accessAuditLogs.actorId, adminId), eq(accessAuditLogs.resourceId, guestTrip)));
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, "guest_plan_deleted");
    assert.equal(await del(guestTrip, adminId), 404, "a second delete finds nothing");
  });
});
