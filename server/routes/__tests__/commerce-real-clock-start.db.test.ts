import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { users, trips, providerServices } from "../../../shared/schema";
import { storage } from "../../storage";
import { materializeCartLinesAsItems } from "../../services/cart-projection.service";
import { readCurrentCartActivity } from "../../services/cart-email-state.service";

test("non-sending real-clock start: real cart writer and retained owned QA fixture", async () => {
  const binding = JSON.parse(process.env.COMMERCE_QA_PROOF_RUN_ID!);
  assert.equal(binding.startOnly, true);
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.RESEND_API_KEY, undefined);
  assert.equal(process.env.SIGNUP_QA_TEST_INBOX, undefined);
  assert.equal(process.env.ITINERARY_OUTCOME_TEST_EMAIL, undefined);
  assert.equal((await db.execute(sql`SELECT current_schema() AS name`)).rows[0].name, binding.schema);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("Provider/network forbidden during real-clock start"); }) as typeof fetch;
  try {
    const id = randomUUID(), scenarioId = randomUUID();
    await db.insert(users).values({
      id, email: `${id}@traveloure-qa.test`,
      preferences: { commerceQaProofRun: binding.runId,
        itineraryMarketing: { enabled: true, timeZone: "Asia/Kolkata" } },
    });
    const [trip] = await db.insert(trips).values({
      userId: id, destination: "Kyoto", startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
    }).returning();
    const [service] = await db.insert(providerServices).values({
      userId: id, serviceName: `Real clock ${scenarioId}`, price: "10.00",
      priceType: "fixed", status: "active", availability: [],
    }).returning();
    const before = Date.now();
    const cart = await storage.addToCart(id, {
      serviceId: service.id, tripId: trip.id, quantity: 1, experienceSlug: scenarioId,
    });
    await materializeCartLinesAsItems(id, trip.id);
    assert.ok((await db.execute(sql`SELECT itinerary_item_id FROM cart_items WHERE id=${cart.id}`)).rows[0].itinerary_item_id,
      "Retained clock fixture must retain canonical owned itinerary correlation");
    const observed = (await db.execute(sql`SELECT content_meta FROM cart_items WHERE id=${cart.id}`)).rows[0];
    const clock = readCurrentCartActivity([{ contentMeta: observed.content_meta }], Date.now());
    assert.equal(clock.eligible, true);
    assert.ok(clock.eligible);
    assert.ok(clock.lastActivityMs >= before && clock.lastActivityMs <= Date.now());
    assert.equal(Number((await db.execute(sql`SELECT count(*) AS count FROM email_outbox`)).rows[0].count), 0);
    const start = clock.lastActivityMs;
    console.log("COMMERCE_REAL_CLOCK_START=" + JSON.stringify({
      runId: binding.runId, scenarioId, cartId: cart.id, sequenceId: clock.sequenceId,
      startTime: new Date(start).toISOString(),
      due1h: new Date(start + 3_600_000).toISOString(),
      due1d: new Date(start + 86_400_000).toISOString(),
      due3d: new Date(start + 259_200_000).toISOString(),
      timezone: "Asia/Kolkata", priorStepSent: false,
      outboxRows: 0, providerCallsBlocked: true,
    }));
  } finally { globalThis.fetch = oldFetch; await pool.end(); }
});
