/**
 * trip-entitlement.db.test.ts — Trip Pass spine proofs (ruling 2026-08-29-trip-pass).
 *
 * TP1  no pass → tripHasPass false, coversAction false for every action
 * TP2  grantTripPass creates an active pass; coversAction true for optimizer/ai/fee
 * TP3  grant is IDEMPOTENT on source_payment_id — a duplicate confirm inserts nothing
 * TP4  ONE active pass per trip — a second grant (different PI) never double-grants
 * TP5  consumeRevision decrements exactly once (atomic WHERE guard); second call false
 * TP6  expert_revision coverage follows the snapshot count (1 → covered; 0 → not)
 * TP7  a revoked pass covers nothing
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 * Run solo: npx tsx --test server/__tests__/trip-entitlement.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { tripEntitlements, trips, users } from "@shared/schema";
import {
  consumeRevision,
  coversAction,
  getActiveTripPass,
  grantTripPass,
  tripHasPass,
} from "../services/trip-entitlement.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  user: `tp-${RUN}-user`,
  tripA: `tp-${RUN}-trip-a`,
  tripB: `tp-${RUN}-trip-b`,
  piA: `pi_tp_${RUN}_a`,
  piA2: `pi_tp_${RUN}_a2`,
  piB: `pi_tp_${RUN}_b`,
};

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const url = process.env.DATABASE_URL || "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* fallthrough to refusal */
  }
  if (!DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`Refusing to run DB-writing tests against non-local host "${host}"`);
  }
}

before(async () => {
  await assertDisposableDb();
  await db.insert(users).values({ id: ids.user, email: `${ids.user}@test.local` } as any).onConflictDoNothing();
  for (const tripId of [ids.tripA, ids.tripB]) {
    await db
      .insert(trips)
      .values({
        id: tripId,
        userId: ids.user,
        title: "TP proof trip",
        destination: "Kyoto, Japan",
        startDate: "2027-01-10",
        endDate: "2027-01-14",
      } as any)
      .onConflictDoNothing();
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id LIKE ${"tp-" + RUN + "%"}`);
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${"tp-" + RUN + "%"}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`);
});

test("TP1: no pass — nothing is covered", async () => {
  assert.equal(await tripHasPass(ids.tripA), false);
  for (const action of ["optimizer_run", "ai_task", "traveler_service_fee", "expert_revision"] as const) {
    assert.equal(await coversAction(ids.tripA, action), false, action);
  }
});

test("TP2: grant creates an active pass covering the unconditional benefits", async () => {
  const { created } = await grantTripPass({
    tripId: ids.tripA,
    sourcePaymentId: ids.piA,
    allowancesSnapshot: { revisionsRemaining: 1, priceCents: 1900 },
  });
  assert.equal(created, true);
  assert.equal(await tripHasPass(ids.tripA), true);
  assert.equal(await coversAction(ids.tripA, "optimizer_run"), true);
  assert.equal(await coversAction(ids.tripA, "ai_task"), true);
  assert.equal(await coversAction(ids.tripA, "traveler_service_fee"), true);
});

test("TP3: duplicate grant on the same PaymentIntent inserts nothing", async () => {
  const again = await grantTripPass({
    tripId: ids.tripA,
    sourcePaymentId: ids.piA,
    allowancesSnapshot: { revisionsRemaining: 99 },
  });
  assert.equal(again.created, false);
  const rows = await db.select().from(tripEntitlements).where(eq(tripEntitlements.tripId, ids.tripA));
  assert.equal(rows.length, 1);
  // The FROZEN snapshot survives — the duplicate's payload never overwrites it.
  assert.equal((rows[0].allowancesSnapshot as any).revisionsRemaining, 1);
});

test("TP4: one active pass per trip — a different PI cannot double-grant", async () => {
  const second = await grantTripPass({
    tripId: ids.tripA,
    sourcePaymentId: ids.piA2,
    allowancesSnapshot: { revisionsRemaining: 1 },
  });
  assert.equal(second.created, false);
  assert.equal(second.entitlement.sourcePaymentId, ids.piA);
  const rows = await db.select().from(tripEntitlements).where(eq(tripEntitlements.tripId, ids.tripA));
  assert.equal(rows.length, 1);
});

test("TP5+TP6: consumeRevision decrements exactly once; coverage follows the count", async () => {
  assert.equal(await coversAction(ids.tripA, "expert_revision"), true);
  assert.equal(await consumeRevision(ids.tripA), true);
  assert.equal(await coversAction(ids.tripA, "expert_revision"), false);
  assert.equal(await consumeRevision(ids.tripA), false, "second consume must find nothing to claim");
  const pass = await getActiveTripPass(ids.tripA);
  assert.equal((pass!.allowancesSnapshot as any).revisionsRemaining, 0);
});

test("TP7: a revoked pass covers nothing", async () => {
  await grantTripPass({
    tripId: ids.tripB,
    sourcePaymentId: ids.piB,
    allowancesSnapshot: { revisionsRemaining: 1 },
  });
  await db
    .update(tripEntitlements)
    .set({ status: "revoked" })
    .where(eq(tripEntitlements.tripId, ids.tripB));
  assert.equal(await tripHasPass(ids.tripB), false);
  assert.equal(await coversAction(ids.tripB, "optimizer_run"), false);
});
