import { test, expect, type APIRequestContext } from "@playwright/test";
import crypto from "crypto";
import { Pool } from "pg";
import { assertDisposableDb, assertCheckoutAccepted } from "./_journey-helpers";

/**
 * JOURNEY SUITE — Journey Wave 1 Tier-1 · J2 AI Entry.
 *
 * Governing docs: docs/planning/JOURNEY_TEST_SUITE_BRIEF.md (J2), docs/testing/coverage-matrix.md.
 * Matrix ID exercised here: J2 (matrix lint greps `playwright/`).
 *
 * Journey shape (traveler enters via the AI Concierge, then checks out ONE item):
 *   1. AI entry via /concierge                         → concierge_requests row (status 'quoted') — the AI-entry DB fact
 *   2. Materialize a trip + catalog-linked items       → itinerary_items born in_planning, providerServiceId set
 *      (in_planning)                                       (H5 guard: the catalog link is set at birth and must SURVIVE)
 *   3. Route ONE item → ready_for_checkout             → cart projection row upserted, serviceId = providerServiceId (H5 survives)
 *   4. J1-style checkout of that ONE item              → service_bookings row + item purchased + diary + projection gone
 *
 * FINDING (J2 flow shape): the brief's phrase "AI entry generates a draft → trip + items in_planning,
 * providerServiceId linkage survives (H5 guard)" describes a single endpoint that does not exist
 * as-built on this branch. Two separate as-built truths were confirmed by source inspection:
 *   (a) /concierge → POST /api/concierge/quote persists a concierge_requests row (status 'quoted')
 *       and returns priced tier options. It does NOT create a trip or any itinerary items.
 *   (b) The AI itinerary generators (POST /api/trips/:id/generate-itinerary — Claude; and
 *       POST /api/ai/generate-itinerary — Grok) DO create trip items born in_planning, but from
 *       pure AI content: those items carry providerServiceId = NULL (no catalog match), so there is
 *       no H5 linkage to survive there.
 * The observable H5 guard ("providerServiceId link survives") lives on the catalog-linked item path
 * and is proven end-to-end at checkout: providerServiceId set at item birth → survives into the cart
 * projection's serviceId → survives into the booking's serviceId. This spec therefore proves the AI
 * ENTRY (concierge_requests DB fact) and then exercises the H5-guarded catalog checkout of ONE item,
 * which is the brief's intent expressed against the real, as-built surfaces. See report.
 *
 * Discipline (brief §9): every step asserts a DB FACT via a read-only pg pool. Fresh registered user
 * + fresh trip per test via the app's own HTTP APIs; no shared fixtures; no direct app-table writes
 * (read-only SQL for asserts only). No fee literals (amount asserted against fee_bands). Fixture users
 * purged in afterAll.
 *
 * Transport: ALREADY-RUNNING dev server on http://127.0.0.1:5000; page.request shares the cookie jar.
 *
 * Run SOLO: npx playwright test playwright/tests/journeys/j2-ai-entry.spec.ts --project=chromium
 */

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";

const readPool = new Pool({ connectionString: process.env.DATABASE_URL });
const createdEmails: string[] = [];

function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const r = await readPool.query(sql, params);
  return r.rows as T[];
}

async function registerActor(request: APIRequestContext, label: string): Promise<{ id: string; email: string }> {
  const email = `j2-${label}-${uid()}@t.test`;
  const res = await request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: PASSWORD, firstName: "AI", lastName: label, userType: "user" },
  });
  expect(res.status(), `register failed (${res.status()}): ${await res.text()}`).toBe(201);
  const body = await res.json();
  createdEmails.push(email);
  return { id: body.user.id, email };
}

test.afterAll(async () => {
  if (createdEmails.length > 0) {
    // DB-write safety: refuse destructive cleanup unless the DB is a disposable dev/CI target
    // (localhost/127.0.0.1 or explicit JOURNEY_DB_WRITES_OK=1). Scope the DELETE to EXACTLY this
    // run's fixture emails (each is `j2-<label>-<uid>@t.test`) — cascades from the user rows;
    // never a broad delete.
    await assertDisposableDb(readPool);
    await readPool
      .query(`DELETE FROM users WHERE email = ANY($1::text[])`, [createdEmails])
      .catch(() => {});
  }
  await readPool.end();
});

test.describe("J2 — AI Entry → catalog checkout (matrix-id: J2)", () => {
  test.describe.configure({ mode: "serial" });

  test("J2: concierge AI entry, then H5-guarded checkout of one catalog item", async ({ page }) => {
    test.setTimeout(120_000);
    const request = page.request;

    const actor = await registerActor(request, "traveler");

    // ── Step 1: AI entry via /concierge → POST /api/concierge/quote persists a concierge_requests row ──
    // This is the AI-entry funnel event. We assert the DB row (status 'quoted') the endpoint writes.
    const quoteRes = await request.post(`${BASE_URL}/api/concierge/quote`, {
      data: {
        intent: "Plan a weekend of activities in San Francisco",
        destination: "San Francisco",
        eventType: "leisure",
      },
    });
    expect(quoteRes.status(), `concierge/quote failed (${quoteRes.status()}): ${await quoteRes.text()}`).toBe(200);
    const quoteBody = await quoteRes.json();
    expect(quoteBody.requestId, "concierge/quote must return a requestId").toBeTruthy();
    expect(quoteBody.route, "concierge/quote must return priced route/tier options").toBeTruthy();

    const [conciergeRow] = await q<{ id: string; user_id: string; status: string; intent: string }>(
      `SELECT id, user_id, status, intent FROM concierge_requests WHERE id=$1`,
      [quoteBody.requestId],
    );
    expect(conciergeRow, "AI entry must persist a concierge_requests row (DB fact)").toBeTruthy();
    expect(conciergeRow.user_id).toBe(actor.id);
    expect(conciergeRow.status).toBe("quoted");

    // ── Step 2: materialize a trip + catalog-linked items in_planning (providerServiceId set) ──
    // The AI tier hands off to a plan/cart; here we build the plan the traveler proceeds with,
    // using real catalog services so the H5 linkage exists to be tracked through checkout.
    const tripRes = await request.post(`${BASE_URL}/api/trips`, {
      data: {
        title: "J2 AI Entry Trip",
        destination: "San Francisco",
        startDate: "2026-10-01",
        endDate: "2026-10-04",
      },
    });
    expect(tripRes.status(), `create trip failed (${tripRes.status()}): ${await tripRes.text()}`).toBe(201);
    const trip = await tripRes.json();
    const tripId: string = trip.id;

    // Two distinct approved+active priced services (checkout ONE of them, per brief).
    const services = await q<{ id: string; price: string; service_name: string }>(
      `SELECT id, price, service_name FROM provider_services
       WHERE approval_status='approved' AND status='active'
         AND price IS NOT NULL AND CAST(price AS FLOAT) > 0
       ORDER BY random() LIMIT 2`,
    );
    expect(services.length, "expected at least 2 approved+active priced provider_services").toBeGreaterThanOrEqual(2);

    const itemIds: string[] = [];
    for (const svc of services) {
      const itemRes = await request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
        data: { title: svc.service_name, dayNumber: 1, providerServiceId: svc.id, estimatedCost: svc.price },
      });
      expect(itemRes.status(), `create item failed (${itemRes.status()}): ${await itemRes.text()}`).toBe(201);
      const item = await itemRes.json();
      itemIds.push(item.id);
    }

    // DB fact: items born in_planning AND the providerServiceId linkage is set at birth (H5 guard).
    const bornRows = await q<{ id: string; routing_status: string; provider_service_id: string }>(
      `SELECT id, routing_status, provider_service_id FROM itinerary_items WHERE trip_id=$1 ORDER BY created_at`,
      [tripId],
    );
    expect(bornRows.length).toBe(services.length);
    for (const r of bornRows) {
      expect(r.routing_status, "AI-entry items are born in_planning").toBe("in_planning");
      expect(r.provider_service_id, "H5: providerServiceId linkage must be set at item birth").toBeTruthy();
    }

    // ── Step 3: route ONE item → ready_for_checkout; H5 link survives into the projection ──────
    const targetItemId = itemIds[0];
    const targetSvcId = services[0].id;
    const routeRes = await request.post(`${BASE_URL}/api/trips/${tripId}/items/${targetItemId}/route`, {
      data: { to: "ready_for_checkout" },
    });
    expect(routeRes.status(), `route failed (${routeRes.status()}): ${await routeRes.text()}`).toBe(200);
    expect((await routeRes.json()).changed).toBe(true);

    const [proj] = await q<{ service_id: string; itinerary_item_id: string }>(
      `SELECT service_id, itinerary_item_id FROM cart_items WHERE itinerary_item_id=$1`,
      [targetItemId],
    );
    expect(proj, "routing must upsert a projection row").toBeTruthy();
    expect(proj.service_id, "H5 SURVIVES: projection serviceId equals the item's providerServiceId").toBe(targetSvcId);

    // Only the routed item is projected — the other stays in_planning (no projection).
    const [{ n: otherProj }] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM cart_items WHERE itinerary_item_id=$1`,
      [itemIds[1]],
    );
    expect(Number(otherProj), "the un-routed item must NOT be projected").toBe(0);

    const routeDiary = await q<{ from_status: string; to_status: string; actor_type: string }>(
      `SELECT from_status, to_status, actor_type FROM item_transition_log
       WHERE item_id=$1 AND event_type='status_transition' ORDER BY created_at`,
      [targetItemId],
    );
    expect(routeDiary.length).toBe(1);
    expect(routeDiary[0]).toMatchObject({
      from_status: "in_planning",
      to_status: "ready_for_checkout",
      actor_type: "traveler",
    });

    // ── Step 4: J1-style checkout of that ONE item ─────────────────────────────────────────────
    const idempotencyKey = crypto.randomUUID();
    const checkoutRes = await request.post(`${BASE_URL}/api/checkout`, {
      data: { tripId, idempotencyKey },
    });
    // The HTTP envelope is the ONLY thing that depends on Stripe reachability — see
    // assertCheckoutAccepted. Every DB fact below is asserted unconditionally.
    await assertCheckoutAccepted(checkoutRes, "j2");

    // DB fact: exactly ONE booking (only one item was routed), H5 survives to booking.serviceId.
    const bookings = await q<{
      id: string;
      service_id: string;
      total_amount: string;
      platform_fee: string;
      provider_earnings: string;
      status: string;
    }>(
      `SELECT id, service_id, total_amount, platform_fee, provider_earnings, status
       FROM service_bookings WHERE traveler_id=$1 AND trip_id=$2`,
      [actor.id, tripId],
    );
    expect(bookings.length, "checkout must create exactly one booking (only one item was routed)").toBe(1);
    const booking = bookings[0];
    expect(booking.status).toBe("payment_pending");
    expect(booking.service_id, "H5 SURVIVES to booking: booking.serviceId equals the item's providerServiceId").toBe(targetSvcId);

    // NO FEE LITERAL: the split must resolve against an active fee_bands percent rate read from the DB.
    const total = Number(booking.total_amount);
    const platformFee = Number(booking.platform_fee);
    const providerEarnings = Number(booking.provider_earnings);
    expect(total).toBeGreaterThan(0);
    expect(Math.abs(providerEarnings - (total - platformFee))).toBeLessThan(0.01);
    const resolvedRate = platformFee / total;
    const activeBandRates = (
      await q<{ default_rate: string }>(
        `SELECT default_rate FROM fee_bands WHERE is_active=true AND rate_type='percent'`,
      )
    ).map((r) => Number(r.default_rate));
    expect(activeBandRates.length).toBeGreaterThan(0);
    expect(
      activeBandRates.some((r) => Math.abs(r - resolvedRate) < 0.0001),
      `booking platform-fee rate ${resolvedRate} must equal an active fee_bands percent default_rate ` +
        `(one of ${JSON.stringify(activeBandRates)}) — proves DB-fee-band resolution, no literal`,
    ).toBe(true);

    // DB fact: the routed item is purchased with booking_id; the other item is untouched (in_planning).
    const [purchased] = await q<{ routing_status: string; booking_id: string }>(
      `SELECT routing_status, booking_id FROM itinerary_items WHERE id=$1`,
      [targetItemId],
    );
    expect(purchased.routing_status).toBe("purchased");
    expect(purchased.booking_id).toBe(booking.id);

    const [untouched] = await q<{ routing_status: string; booking_id: string | null }>(
      `SELECT routing_status, booking_id FROM itinerary_items WHERE id=$1`,
      [itemIds[1]],
    );
    expect(untouched.routing_status, "the un-routed item must remain in_planning").toBe("in_planning");
    expect(untouched.booking_id, "the un-routed item must have no booking").toBeNull();

    // DB fact: checkout diary row + projection gone for the purchased item.
    const purchaseDiary = await q<{ from_status: string; to_status: string; actor_type: string }>(
      `SELECT from_status, to_status, actor_type FROM item_transition_log
       WHERE item_id=$1 AND to_status='purchased' ORDER BY created_at`,
      [targetItemId],
    );
    expect(purchaseDiary.length).toBe(1);
    expect(purchaseDiary[0]).toMatchObject({
      from_status: "ready_for_checkout",
      to_status: "purchased",
      actor_type: "checkout",
    });

    const [{ n: projGone }] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM cart_items WHERE itinerary_item_id=$1`,
      [targetItemId],
    );
    expect(Number(projGone), "projection must be deleted once the item is purchased").toBe(0);
  });
});
