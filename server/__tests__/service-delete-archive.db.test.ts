/**
 * GAP #18 — DELETE-WITH-BOOKINGS: REFUSE + ARCHIVE (Gate G5, ratified Aug 13 2026;
 * DECISIONS.md ledger 2026-08-17-delete-archive).
 *
 * `service_bookings.service_id` is ON DELETE CASCADE, so before this lane a provider deleting a
 * listing silently destroyed every booking row on it — including the record a traveler's
 * receipt, review and the earner's payout all point at. The lane's guard
 * (`assessServiceDeletion`, server/services/service-delete-guard.service.ts) is the ONE
 * assessment both delete rails call; this file proves its predicate directly against real rows.
 *
 * PROOFS
 *   D1 — an OPEN booking (confirmed) refuses deletion: HAS_OPEN_BOOKINGS, count 1.
 *   D2 — a §15b in-flight claim (payment_pending) refuses deletion: the promote/void machinery
 *        needs the listing to exist, so an unauthorized claim is already blocking.
 *   D3 — TRANSACTED history only (completed) refuses deletion: HAS_BOOKING_HISTORY — the
 *        withdraw precedent's "sold history is never deleted", which deliberately supersedes
 *        the mock's "once delivered, deleting becomes possible" bullet.
 *   D4 — cancelled-unpaid + failed rows block NOTHING: the guard returns null and the listing
 *        is genuinely deletable (those rows cascade away — they were never real bookings).
 *   D5 — no bookings at all: null (the plain delete path is untouched).
 *   D6 — mixed open + transacted: HAS_OPEN_BOOKINGS wins (the traveler-facing obligation is
 *        the headline), and both counts are carried honestly.
 *   D7 — ARCHIVE leaves every public surface: an approved+active listing appears in the public
 *        browse read (`getAllActiveServices`); status='archived' removes it from that read with
 *        no other change — the invisibility rides the existing status='active' filters, no new
 *        predicate anywhere.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in
 * after(). No Stripe, no network.
 *
 * Run solo: DATABASE_URL=... npx tsx --test server/__tests__/service-delete-archive.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, serviceBookings } from "@shared/schema";
import { assessServiceDeletion } from "../services/service-delete-guard.service";
import { storage } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);
const providerId = `sda-${RUN}-provider`;
const travelerId = `sda-${RUN}-traveler`;
const serviceIds: string[] = [];

function newServiceRow(name: string, overrides: Partial<typeof providerServices.$inferInsert> = {}) {
  const id = crypto.randomUUID();
  serviceIds.push(id);
  return {
    id,
    userId: providerId,
    serviceName: name,
    price: "95.00",
    status: "active",
    approvalStatus: "approved",
    // A location string distinctive to this run so D7's public-read assertions can scope to
    // this file's own rows and never depend on (or disturb) whatever else the DB holds.
    location: `sda-${RUN}-kyoto`,
    ...overrides,
  } satisfies typeof providerServices.$inferInsert;
}

async function addBooking(serviceId: string, status: string) {
  await db.insert(serviceBookings).values({
    serviceId,
    travelerId,
    providerId,
    status,
    totalAmount: "95.00",
  });
}

before(async () => {
  await db.insert(users).values([
    { id: providerId, email: `${providerId}@t.test`, role: "service_provider" },
    { id: travelerId, email: `${travelerId}@t.test`, role: "user" },
  ]);
});

after(async () => {
  await db.delete(serviceBookings).where(inArray(serviceBookings.serviceId, serviceIds));
  await db.delete(providerServices).where(inArray(providerServices.id, serviceIds));
  await db.delete(users).where(inArray(users.id, [providerId, travelerId]));
});

test("D1 — a confirmed booking refuses deletion (HAS_OPEN_BOOKINGS)", async () => {
  const svc = newServiceRow("D1 confirmed-booked walk");
  await db.insert(providerServices).values(svc);
  await addBooking(svc.id, "confirmed");

  const refusal = await assessServiceDeletion([svc.id], svc.serviceName);
  assert.ok(refusal, "deletion must be refused");
  assert.equal(refusal.code, "HAS_OPEN_BOOKINGS");
  assert.equal(refusal.openCount, 1);
  assert.equal(refusal.transactedCount, 0);
  assert.equal(refusal.archiveOffered, true);
  assert.match(refusal.message, /1 upcoming booking\b/);
  assert.match(refusal.message, /"D1 confirmed-booked walk"/);
});

test("D2 — a §15b in-flight claim (payment_pending) refuses deletion", async () => {
  const svc = newServiceRow("D2 claim-in-flight");
  await db.insert(providerServices).values(svc);
  await addBooking(svc.id, "payment_pending");

  const refusal = await assessServiceDeletion([svc.id]);
  assert.ok(refusal);
  assert.equal(refusal.code, "HAS_OPEN_BOOKINGS");
  assert.equal(refusal.openCount, 1);
});

test("D3 — transacted history only (completed) refuses deletion (HAS_BOOKING_HISTORY)", async () => {
  const svc = newServiceRow("D3 delivered-once");
  await db.insert(providerServices).values(svc);
  await addBooking(svc.id, "completed");

  const refusal = await assessServiceDeletion([svc.id], svc.serviceName);
  assert.ok(refusal, "sold history is never deleted");
  assert.equal(refusal.code, "HAS_BOOKING_HISTORY");
  assert.equal(refusal.openCount, 0);
  assert.equal(refusal.transactedCount, 1);
  assert.match(refusal.message, /never deleted/);
});

test("D4 — cancelled-unpaid and failed rows block nothing", async () => {
  const svc = newServiceRow("D4 only-dead-rows");
  await db.insert(providerServices).values(svc);
  await addBooking(svc.id, "cancelled");
  await addBooking(svc.id, "failed");

  const refusal = await assessServiceDeletion([svc.id]);
  assert.equal(refusal, null, "a listing whose rows never transacted stays deletable");
});

test("D5 — no bookings at all: deletable", async () => {
  const svc = newServiceRow("D5 unbooked");
  await db.insert(providerServices).values(svc);
  assert.equal(await assessServiceDeletion([svc.id]), null);
});

test("D6 — mixed open + transacted: the open obligation is the headline, both counts carried", async () => {
  const svc = newServiceRow("D6 mixed");
  await db.insert(providerServices).values(svc);
  await addBooking(svc.id, "confirmed");
  await addBooking(svc.id, "deposit_paid");
  await addBooking(svc.id, "completed");
  await addBooking(svc.id, "refunded");
  await addBooking(svc.id, "cancelled"); // must count toward neither

  const refusal = await assessServiceDeletion([svc.id]);
  assert.ok(refusal);
  assert.equal(refusal.code, "HAS_OPEN_BOOKINGS");
  assert.equal(refusal.openCount, 2);
  assert.equal(refusal.transactedCount, 2);
});

test("D7 — archived leaves the public browse read; nothing else changed on the row", async () => {
  const svc = newServiceRow("D7 archive-visibility");
  await db.insert(providerServices).values(svc);

  const visible = await storage.getAllActiveServices(undefined, `sda-${RUN}-kyoto`);
  assert.ok(
    visible.some((s) => s.id === svc.id),
    "an approved+active listing appears on the public browse read",
  );

  await db
    .update(providerServices)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(providerServices.id, svc.id));

  const afterArchive = await storage.getAllActiveServices(undefined, `sda-${RUN}-kyoto`);
  assert.ok(
    !afterArchive.some((s) => s.id === svc.id),
    "an archived listing is gone from the public browse read — the status='active' filter is the mechanism",
  );

  // The row itself still exists (history keeps a listing to point at) and is still approved —
  // archive changed circulation, not identity.
  const [row] = await db.select().from(providerServices).where(eq(providerServices.id, svc.id));
  assert.ok(row);
  assert.equal(row.status, "archived");
  assert.equal(row.approvalStatus, "approved");
});
