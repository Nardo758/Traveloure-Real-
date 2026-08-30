/**
 * trip-entitlement-source.db.test.ts — trip_entitlements provenance proofs
 * (ledger 2026-08-29-trip-pass-provenance, migration 264).
 *
 * TPS1  manual grant (source:'manual', no PI) → row created, source='manual',
 *       coversAction(tripId, 'optimizer_run') true (same unconditional benefits as stripe)
 * TPS2  manual grant WITH a source_payment_id string → REJECTED (throws), no row created
 * TPS3  stripe grant WITHOUT a PaymentIntent id → REJECTED (throws), no row created
 * TPS4  stripe grant WITH a real PI → works, source='stripe' (regression guard — today's
 *       default behavior is unchanged by the new `source` parameter)
 * TPS5  a second manual grant on a trip that already has an active pass → clean no-op,
 *       not a duplicate (one-active-per-trip index still holds for the non-payment path)
 * TPS6  an invalid source value → REJECTED (throws), no row created
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 * Run solo: npx tsx --test server/__tests__/trip-entitlement-source.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { tripEntitlements, trips, users } from "@shared/schema";
import { coversAction, grantTripPass, tripHasPass } from "../services/trip-entitlement.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  user: `tps-${RUN}-user`,
  tripManual: `tps-${RUN}-trip-manual`,
  tripStripe: `tps-${RUN}-trip-stripe`,
  tripReject: `tps-${RUN}-trip-reject`,
  tripInvalid: `tps-${RUN}-trip-invalid`,
  piStripe: `pi_tps_${RUN}_stripe`,
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
  for (const tripId of [ids.tripManual, ids.tripStripe, ids.tripReject, ids.tripInvalid]) {
    await db
      .insert(trips)
      .values({
        id: tripId,
        userId: ids.user,
        title: "TPS proof trip",
        destination: "Kyoto, Japan",
        startDate: "2027-02-10",
        endDate: "2027-02-14",
      } as any)
      .onConflictDoNothing();
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id LIKE ${"tps-" + RUN + "%"}`);
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${"tps-" + RUN + "%"}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`);
});

test("TPS1: manual grant (no PI) creates an active pass with source='manual'", async () => {
  const { entitlement, created } = await grantTripPass({
    tripId: ids.tripManual,
    source: "manual",
    allowancesSnapshot: { revisionsRemaining: 1 },
  });
  assert.equal(created, true);
  assert.equal(entitlement.source, "manual");
  assert.equal(entitlement.sourcePaymentId, null);
  assert.equal(await tripHasPass(ids.tripManual), true);
  assert.equal(await coversAction(ids.tripManual, "optimizer_run"), true);
});

test("TPS2: manual grant carrying a source_payment_id is REJECTED — no row created", async () => {
  await assert.rejects(
    () =>
      grantTripPass({
        tripId: ids.tripReject,
        source: "manual",
        sourcePaymentId: "pi_should_never_be_accepted",
        allowancesSnapshot: {},
      }),
    /must not carry a sourcePaymentId/,
  );
  const rows = await db.select().from(tripEntitlements).where(eq(tripEntitlements.tripId, ids.tripReject));
  assert.equal(rows.length, 0);
});

test("TPS3: stripe grant WITHOUT a PaymentIntent id is REJECTED — no row created", async () => {
  await assert.rejects(
    () =>
      grantTripPass({
        tripId: ids.tripReject,
        source: "stripe",
        allowancesSnapshot: {},
      }),
    /requires a real, non-empty sourcePaymentId/,
  );
  const rows = await db.select().from(tripEntitlements).where(eq(tripEntitlements.tripId, ids.tripReject));
  assert.equal(rows.length, 0);
});

test("TPS4: stripe grant WITH a real PI works — source defaults/resolves to 'stripe' (regression guard)", async () => {
  const { entitlement, created } = await grantTripPass({
    tripId: ids.tripStripe,
    sourcePaymentId: ids.piStripe,
    allowancesSnapshot: { revisionsRemaining: 1 },
  });
  assert.equal(created, true);
  assert.equal(entitlement.source, "stripe");
  assert.equal(entitlement.sourcePaymentId, ids.piStripe);
});

test("TPS5: a second manual grant on the same active trip is a clean no-op, never a duplicate", async () => {
  const second = await grantTripPass({
    tripId: ids.tripManual,
    source: "manual",
    allowancesSnapshot: { revisionsRemaining: 99 },
  });
  assert.equal(second.created, false);
  const rows = await db.select().from(tripEntitlements).where(eq(tripEntitlements.tripId, ids.tripManual));
  assert.equal(rows.length, 1);
  // The original grant's frozen snapshot survives — the duplicate's payload never overwrites it.
  assert.equal((rows[0].allowancesSnapshot as any).revisionsRemaining, 1);
});

test("TPS6: an invalid source value is REJECTED — no row created", async () => {
  await assert.rejects(
    () =>
      grantTripPass({
        tripId: ids.tripInvalid,
        // @ts-expect-error deliberately invalid at the type level too
        source: "comp",
        allowancesSnapshot: {},
      }),
    /invalid source/,
  );
  const rows = await db.select().from(tripEntitlements).where(eq(tripEntitlements.tripId, ids.tripInvalid));
  assert.equal(rows.length, 0);
});
