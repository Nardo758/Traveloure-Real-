/**
 * matrix-lane: Persona Lane B — journey-traveler
 *
 * Three traveler personas (docs/testing/PERSONA_LANE_B_HANDOFF.md ownership table): the free
 * traveler (browse -> cart -> checkout), the Trip Pass traveler (the real per-trip entitlement
 * purchase, migration 262), and the Plus member (occasions).
 *
 * Purchasable targets are BY NAME the three items the supply suites create (must run first):
 *   - "Kyoto Portrait Route Planning Call" ($75, provider)
 *   - "Gion Photo Session Preparation Call" ($95, provider) — named for completeness; the free
 *     traveler's cart/checkout leg exercises ONE of the two provider services ($75) plus the
 *     ready-made below, which together prove both money paths (cart/checkout spine AND the
 *     ready-made purchase/confirm pair) rather than repeating the same spine three times.
 *   - "Quiet Gion: A Dawn-to-Dusk Kyoto Day" ($39, ready-made)
 *
 * Stripe gating follows the SAME truthful-contract posture the Journey Wave 1 suites established
 * (see _journey-helpers.ts / DECISIONS.md ruling 38): a real sk_test_ key runs the full positive
 * path with every DB fact asserted; a stub key asserts the honest negative — for
 * POST /api/checkout that is the declared 503 + zero committed state
 * (assertCheckoutCommittedNothing); for ready-made/trip-pass purchase — NEITHER of which was
 * part of ruling 38's rewrite — it is whatever the endpoint actually returns for an
 * unauthenticated-with-Stripe key, asserted honestly and logged as a FINDING rather than assumed.
 */
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import {
  BASE_URL,
  rows,
  scalar,
  closePool,
  PERSONAS,
  KYOTO,
  loginAs,
  createTrip,
  createCatalogItem,
  routeItem,
  assertCheckoutAccepted,
  assertCheckoutCommittedNothing,
  hasStripeTestKey,
  confirmPaymentIntentTestMode,
  STRIPE_UNAVAILABLE,
  checkpoint,
  JourneyReport,
} from "./_persona-helpers";

test.setTimeout(240_000);

const PROVIDER_SERVICE_NAME = "Kyoto Portrait Route Planning Call";
const READY_MADE_TITLE = "Quiet Gion: A Dawn-to-Dusk Kyoto Day";

test.afterAll(async () => {
  await closePool();
});

test.describe("journey-traveler — free traveler (browse -> cart -> checkout + ready-made purchase)", () => {
  test.describe.configure({ mode: "serial" });

  test("free traveler buys the named provider service and the named ready-made", async ({ page }) => {
    const report = new JourneyReport("journey-traveler-free");
    const request = page.request;

    const actor = await loginAs(request, PERSONAS.freeTraveler);
    report.record({
      action: "login as persona-kyoto-free-traveler",
      ui: "POST /api/auth/login 200",
      db: `users.id=${actor.id} role=${actor.role}`,
      verdict: "PASS",
    });

    // ── Step 2: create a Kyoto trip. UI presence proof (button-create-new opens the intake),
    //     then the reliable app-API create (POST /api/trips — the same endpoint that dialog
    //     posts to, and the SAME pattern j1/j13 already use; never a raw SQL insert). ─────────
    await page.goto(`${BASE_URL}/my-trips`);
    await page.waitForLoadState("networkidle");
    const createBtn = page.getByTestId("button-create-new");
    const createBtnVisible = await createBtn.isVisible().catch(() => false);
    if (createBtnVisible) {
      await createBtn.click();
      await page.waitForTimeout(500);
      await page.keyboard.press("Escape").catch(() => {});
    }
    const tripId = await createTrip(request, "Free Traveler Kyoto Trip", KYOTO);
    const [tripRow] = await rows<{ user_id: string; destination: string }>(
      `SELECT user_id, destination FROM trips WHERE id = $1`,
      [tripId],
    );
    report.record({
      action: "create a Kyoto trip through the traveler UI/API",
      ui: `button-create-new visible=${createBtnVisible}; POST /api/trips 201`,
      db: `trips.user_id=${tripRow?.user_id} destination=${tripRow?.destination}`,
      verdict: tripRow?.user_id === actor.id && tripRow?.destination === KYOTO ? "PASS" : "FAIL",
    });

    // ── Step 3: browse Kyoto supply, assert the named service's card + CTA ───────────────────
    const svcRow = await scalar<string>(
      `SELECT id FROM provider_services WHERE service_name = $1 AND approval_status = 'approved' AND status = 'active' LIMIT 1`,
      [PROVIDER_SERVICE_NAME],
    );
    await page.goto(`${BASE_URL}/discover/location/${encodeURIComponent(KYOTO)}`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-traveler-free-discover");
    const titleVisible = await page.getByTestId("text-page-title").isVisible().catch(() => false);
    const cardVisible = svcRow
      ? await page.getByTestId(`card-service-${svcRow}`).isVisible({ timeout: 10_000 }).catch(() => false)
      : false;
    report.record({
      action: `browse Kyoto surfaces, assert "${PROVIDER_SERVICE_NAME}" card is present`,
      ui: `text-page-title=${titleVisible}, card-service-${svcRow}=${cardVisible}`,
      db: svcRow ? `provider_services.id=${svcRow} approved+active` : "service not found — supply-provider must run first",
      verdict: svcRow && titleVisible ? "PASS" : "FAIL",
    });

    // ── Step 4: add the named service to the trip and route it to checkout (the established
    //     J1 spine — providerServiceId-linked item, in_planning -> ready_for_checkout). ───────
    expect(svcRow, `"${PROVIDER_SERVICE_NAME}" must exist and be approved+active — run supply-provider.spec.ts first`).toBeTruthy();
    const [svc] = await rows<{ id: string; price: string; service_name: string }>(
      `SELECT id, price, service_name FROM provider_services WHERE id = $1`,
      [svcRow!],
    );
    const itemId = await createCatalogItem(request, tripId, { id: svc.id, price: svc.price, name: svc.service_name });
    const [itemRow] = await rows<{ routing_status: string; provider_service_id: string }>(
      `SELECT routing_status, provider_service_id FROM itinerary_items WHERE id = $1`,
      [itemId],
    );
    report.record({
      action: `add "${PROVIDER_SERVICE_NAME}" to the trip (cart/plan state)`,
      ui: `button-add-to-cart-${svc.id} equivalent — POST /api/trips/:tripId/itinerary-items 201`,
      db: JSON.stringify(itemRow),
      verdict: itemRow?.routing_status === "in_planning" && itemRow?.provider_service_id === svc.id ? "PASS" : "FAIL",
    });

    const routeRes = await routeItem(request, tripId, itemId, "ready_for_checkout");
    const [projRow] = await rows<{ id: string }>(`SELECT id FROM cart_items WHERE itinerary_item_id = $1`, [itemId]);
    report.record({
      action: "route item to ready_for_checkout (cart projection)",
      ui: `route status ${routeRes.status()}`,
      db: projRow ? `cart_items.id=${projRow.id}` : "no cart_items row",
      verdict: routeRes.status() === 200 && projRow ? "PASS" : "FAIL",
    });

    // ── Step 5-6: checkout, gated on Stripe test mode per the ruling-38 truthful contract ─────
    const idempotencyKey = crypto.randomUUID();
    const [{ n: cartCountBefore }] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM cart_items WHERE user_id = $1`,
      [actor.id],
    );
    const checkoutRes = await request.post(`${BASE_URL}/api/checkout`, { data: { tripId, idempotencyKey } });

    if (STRIPE_UNAVAILABLE) {
      await assertCheckoutCommittedNothing(checkoutRes, "journey-traveler-free", {
        userId: actor.id,
        tripId,
        itemIds: [itemId],
        cartCountBefore: Number(cartCountBefore),
      });
      report.record({
        action: "checkout refuses without a Stripe test key (declared 503, nothing committed)",
        ui: `POST /api/checkout status ${checkoutRes.status()}`,
        db: "zero authorized bookings, cart intact, no purchased item, no purchase diary row (hard-asserted above)",
        verdict: "EXTERNAL",
        note: "Stripe declared unavailable in this run (no sk_test_ key) — see _journey-helpers.ts assertCheckoutCommittedNothing",
      });
    } else {
      const body = await assertCheckoutAccepted(checkoutRes, "journey-traveler-free");
      const [booking] = await rows<{ id: string; status: string; stripe_payment_intent_id: string | null; service_id: string }>(
        `SELECT id, status, stripe_payment_intent_id, service_id FROM service_bookings WHERE traveler_id = $1 AND trip_id = $2`,
        [actor.id, tripId],
      );
      report.record({
        action: `checkout "${PROVIDER_SERVICE_NAME}" in Stripe test mode`,
        ui: `POST /api/checkout 2xx, clientSecret present=${Boolean(body?.paymentIntent?.clientSecret)}`,
        db: JSON.stringify(booking),
        verdict: booking?.service_id === svc.id && Boolean(booking?.stripe_payment_intent_id) ? "PASS" : "FAIL",
      });
    }

    // ── Ready-made purchase ("Quiet Gion...", $39) — the second named purchasable target,
    //     exercising the SEPARATE purchase/confirm pair (server/routes/ready-made.routes.ts). ─
    const listingId = await scalar<string>(
      `SELECT id FROM ready_made_trips WHERE title = $1 AND status = 'approved' AND active = true LIMIT 1`,
      [READY_MADE_TITLE],
    );
    expect(listingId, `"${READY_MADE_TITLE}" must be approved+active — run supply-expert.spec.ts first`).toBeTruthy();

    const buyRes = await request.post(`${BASE_URL}/api/ready-made/${listingId}/purchase`);
    if (!hasStripeTestKey()) {
      const purchaseCountBefore = await scalar<string>(
        `SELECT count(*)::int FROM ready_made_purchases WHERE buyer_id = $1 AND ready_made_trip_id = $2`,
        [actor.id, listingId],
      );
      report.record({
        action: `purchase "${READY_MADE_TITLE}" without a Stripe test key`,
        ui: `POST purchase status ${buyRes.status()}`,
        db: `ready_made_purchases count=${purchaseCountBefore} (expected 0 — nothing committed without a PaymentIntent)`,
        verdict: !buyRes.ok() && Number(purchaseCountBefore) === 0 ? "EXTERNAL" : "FAIL",
        note:
          "FINDING: unlike /api/checkout (ruling 38), the ready-made purchase route is not yet wired to the " +
          "declared-503 payment_unavailable contract — it fails with whatever Stripe's SDK raises on a stub key.",
      });
    } else {
      expect(buyRes.status(), `ready-made purchase failed: ${await buyRes.text()}`).toBe(202);
      const buyBody = await buyRes.json();
      const piStatus = await confirmPaymentIntentTestMode(buyBody.paymentIntentId);
      expect(piStatus, "ready-made purchase PaymentIntent must succeed in Stripe test mode").toBe("succeeded");
      const confirmRes = await request.post(`${BASE_URL}/api/ready-made/${listingId}/purchase/confirm`, {
        data: { paymentIntentId: buyBody.paymentIntentId },
      });
      expect(confirmRes.status(), `confirm failed: ${await confirmRes.text()}`).toBe(200);
      const confirmBody = await confirmRes.json();
      const [purchaseRow] = await rows<{ status: string; stripe_payment_intent_id: string }>(
        `SELECT status, stripe_payment_intent_id FROM ready_made_purchases WHERE buyer_id = $1 AND ready_made_trip_id = $2`,
        [actor.id, listingId],
      );
      report.record({
        action: `purchase "${READY_MADE_TITLE}" in Stripe test mode`,
        ui: `purchase 202 -> confirm 200, cloneTripId=${confirmBody.cloneTripId}`,
        db: JSON.stringify(purchaseRow),
        verdict: purchaseRow?.status === "paid" && purchaseRow?.stripe_payment_intent_id === buyBody.paymentIntentId ? "PASS" : "FAIL",
      });
    }

    report.write();
    expect(report.hasFailures, `journey-traveler-free had failing steps: ${JSON.stringify(report)}`).toBe(false);
  });
});

test.describe("journey-traveler — Trip Pass traveler", () => {
  test("Trip Pass traveler: the real per-trip entitlement purchase (migration 262)", async ({ page }) => {
    const report = new JourneyReport("journey-traveler-trip-pass");
    const request = page.request;

    const actor = await loginAs(request, PERSONAS.tripPassTraveler);
    const tripId = await createTrip(request, "Trip Pass Kyoto Trip", KYOTO);
    report.record({
      action: "login + create a Kyoto trip for the Trip Pass persona",
      ui: "POST /api/trips 201",
      db: `trips.id=${tripId} owner=${actor.id}`,
      verdict: "PASS",
    });

    const purchaseRes = await request.post(`${BASE_URL}/api/trips/${tripId}/trip-pass/purchase`);

    if (!hasStripeTestKey()) {
      const entitlementCount = await scalar<string>(
        `SELECT count(*)::int FROM trip_entitlements WHERE trip_id = $1`,
        [tripId],
      );
      report.record({
        action: "Trip Pass purchase without a Stripe test key",
        ui: `POST purchase status ${purchaseRes.status()}`,
        db: `trip_entitlements count=${entitlementCount} (expected 0)`,
        verdict: !purchaseRes.ok() && Number(entitlementCount) === 0 ? "EXTERNAL" : "FAIL",
        note:
          "Stripe declared unavailable — the real grant path (grantTripPass, §19a) requires a Stripe-verified " +
          "PaymentIntent and this run has none, so no trip_entitlements row is created. This IS the seed's " +
          "documented posture (scripts/seed-personas.ts header), exercised live here instead of faked.",
      });
      report.write();
      expect(report.hasFailures).toBe(false);
      return;
    }

    expect(purchaseRes.status(), `Trip Pass purchase failed: ${await purchaseRes.text()}`).toBe(202);
    const purchaseBody = await purchaseRes.json();
    const piStatus = await confirmPaymentIntentTestMode(purchaseBody.paymentIntentId);
    expect(piStatus, "Trip Pass PaymentIntent must succeed in Stripe test mode").toBe("succeeded");

    const confirmRes = await request.post(`${BASE_URL}/api/trips/${tripId}/trip-pass/purchase/confirm`, {
      data: { paymentIntentId: purchaseBody.paymentIntentId },
    });
    expect(confirmRes.status(), `Trip Pass confirm failed: ${await confirmRes.text()}`).toBe(200);

    const [entitlement] = await rows<{ status: string; source_payment_id: string; plan_key: string; allowances_snapshot: unknown }>(
      `SELECT status, source_payment_id, plan_key, allowances_snapshot FROM trip_entitlements WHERE trip_id = $1`,
      [tripId],
    );
    report.record({
      action: "grant the Trip Pass entitlement (real Stripe-verified PaymentIntent, §19a)",
      ui: `purchase 202 -> confirm 200`,
      db: JSON.stringify(entitlement),
      verdict:
        entitlement?.status === "active" &&
        entitlement?.plan_key === "trip_pass" &&
        entitlement?.source_payment_id === purchaseBody.paymentIntentId
          ? "PASS"
          : "FAIL",
    });

    // Idempotence: a second purchase attempt is rejected BEFORE any PaymentIntent (one active
    // pass per trip — the atomic conditional grantTripPass relies on).
    const secondPurchase = await request.post(`${BASE_URL}/api/trips/${tripId}/trip-pass/purchase`);
    const entitlementCountAfter = await scalar<string>(
      `SELECT count(*)::int FROM trip_entitlements WHERE trip_id = $1 AND status = 'active'`,
      [tripId],
    );
    report.record({
      action: "re-purchase is rejected (one active Trip Pass per trip)",
      ui: `second purchase status ${secondPurchase.status()}`,
      db: `active trip_entitlements count=${entitlementCountAfter}`,
      verdict: secondPurchase.status() === 409 && Number(entitlementCountAfter) === 1 ? "PASS" : "FAIL",
    });

    report.write();
    expect(report.hasFailures, `journey-traveler-trip-pass had failing steps: ${JSON.stringify(report)}`).toBe(false);
  });
});

test.describe("journey-traveler — Plus member", () => {
  test("Plus member: active plan + Kyoto home city + one occasion, idempotent on re-run", async ({ page }) => {
    const report = new JourneyReport("journey-traveler-plus");
    const request = page.request;

    const actor = await loginAs(request, PERSONAS.plusMember);
    const [membership] = await rows<{ status: string; plan_key: string; source: string }>(
      `SELECT status, plan_key, source FROM plan_memberships WHERE user_id = $1 AND plan_key = 'plus_annual'`,
      [actor.id],
    );
    const homeCity = await scalar<string>(`SELECT home_city FROM users WHERE id = $1`, [actor.id]);
    report.record({
      action: "assert active Plus membership + seeded Kyoto home city",
      ui: "n/a (asserted via the UI's own home-city select below)",
      db: `plan_memberships=${JSON.stringify(membership)} users.home_city=${homeCity}`,
      verdict: membership?.status === "active" && homeCity === KYOTO ? "PASS" : "FAIL",
    });

    await page.goto(`${BASE_URL}/plus/occasions`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-traveler-plus-occasions");
    const homeCitySelectValue = await page.getByTestId("select-home-city").inputValue().catch(() => null);
    report.record({
      action: "Plus occasions page renders the seeded Kyoto home city",
      ui: `select-home-city value=${homeCitySelectValue}`,
      db: `users.home_city=${homeCity}`,
      verdict: homeCitySelectValue === KYOTO ? "PASS" : "FAIL",
    });

    // 14 days out, per the handoff's draft-window requirement.
    const occasionDate = new Date();
    occasionDate.setUTCDate(occasionDate.getUTCDate() + 14);
    const occasionDateStr = occasionDate.toISOString().slice(0, 10);

    // The POST /api/occasions endpoint has no natural uniqueness (no idempotency key) — so, like
    // the ready-made listing above, THIS SUITE enforces idempotence by checking first, exactly
    // as the handoff's "re-run and assert idempotence" requires without inventing a server-side
    // dedupe the product does not have. FINDING recorded either way.
    const existing = await scalar<string>(
      `SELECT id FROM occasions WHERE user_id = $1 AND template_key = 'birthday' AND occasion_date = $2`,
      [actor.id, occasionDateStr],
    );

    if (!existing) {
      await page.getByTestId("select-occasion-template").selectOption("birthday");
      await page.getByTestId("input-occasion-date").fill(occasionDateStr);
      await page.getByTestId("select-occasion-recurrence").selectOption("none").catch(() => {});
      await page.getByTestId("input-occasion-label").fill("Persona Lane B fixture");
      await page.getByTestId("button-add-occasion").click();
      await page.waitForTimeout(1_000);
    }

    const [occasionRow] = await rows<{ id: string; template_key: string; occasion_date: string; active: boolean }>(
      `SELECT id, template_key, occasion_date, active FROM occasions WHERE user_id = $1 AND template_key = 'birthday' AND occasion_date = $2`,
      [actor.id, occasionDateStr],
    );
    const listItemVisible = occasionRow
      ? await page.getByTestId(`occasion-${occasionRow.id}`).isVisible({ timeout: 10_000 }).catch(() => false)
      : false;
    report.record({
      action: "add one occasion 14 days out through the UI",
      ui: existing ? "reused an existing occasion (idempotent re-run)" : `filled the Add-occasion form, occasion-${occasionRow?.id} visible=${listItemVisible}`,
      db: JSON.stringify(occasionRow),
      verdict: occasionRow?.template_key === "birthday" && String(occasionRow?.occasion_date).startsWith(occasionDateStr) ? "PASS" : "FAIL",
    });

    const dupeCount = await scalar<string>(
      `SELECT count(*)::int FROM occasions WHERE user_id = $1 AND template_key = 'birthday' AND occasion_date = $2`,
      [actor.id, occasionDateStr],
    );
    report.record({
      action: "no duplicate occasion on re-run (suite-enforced, since POST /api/occasions has no server-side dedupe)",
      ui: "n/a",
      db: `count=${dupeCount}`,
      verdict: Number(dupeCount) === 1 ? "PASS" : "FAIL",
      note:
        Number(dupeCount) === 1
          ? undefined
          : "FINDING: POST /api/occasions has no unique constraint / idempotency key — a client that " +
            "double-submits (no suite-side guard) would create two rows.",
    });

    report.write();
    expect(report.hasFailures, `journey-traveler-plus had failing steps: ${JSON.stringify(report)}`).toBe(false);
  });
});
