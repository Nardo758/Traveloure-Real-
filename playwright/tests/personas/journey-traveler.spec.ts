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
 *
 * TWO DIFFERENT "Stripe available" SIGNALS, THREE REAL STATES (run #8 finding): `STRIPE_UNAVAILABLE`
 * reflects whether the SERVER has a working key (env-driven, JOURNEY_STRIPE_UNAVAILABLE — accurate
 * in any CI). `hasStripeTestKey()` resolves the LITERAL key value for THIS TEST PROCESS to act as
 * the customer and confirm a PaymentIntent — but it does so only via the Replit dev connector
 * (scripts/dev-stripe-key.cjs, needs REPLIT_CONNECTORS_HOSTNAME), which is unreachable from GitHub
 * Actions, so it is ALWAYS false there regardless of what the server's own STRIPE_SECRET_KEY is.
 * The ready-made purchase and Trip Pass legs branch on BOTH, in order: STRIPE_UNAVAILABLE selects
 * whether the purchase-initiation call itself can succeed at all (server has a key); within "yes",
 * hasStripeTestKey() selects whether this process can go on to CONFIRM it (full positive path) or
 * must stop at the honest intermediate state — 202 + a real PaymentIntent id, nothing yet marked
 * paid/granted because confirmation never ran (§19a). Checkout's own gate only ever needed
 * STRIPE_UNAVAILABLE (its positive assertion stops at "a PaymentIntent was authorized", never
 * confirms one), which is why it never hit this.
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
    // Run #8 finding: this previously navigated to `/discover/location/:city`
    // (client/src/pages/discover-location.tsx, the Kyoto-SCOPED city feed) and checked
    // `text-page-title`/`card-service-*` — testids that belong to the DIFFERENT `/services`
    // page (discover.tsx). Same wrong-page mistake journey-guest.spec.ts made and fixed
    // (see that file's header). And per that same fix, the unfiltered `/services` browse is
    // sorted by rating with a 12-row page against ~35 other seeded provider_services, so a
    // brand-new zero-rating fixture isn't guaranteed a page-1 slot either — searched by name
    // (`?q=`) instead, exactly like journey-guest's step 3.
    const svcRow = await scalar<string>(
      `SELECT id FROM provider_services WHERE service_name = $1 AND approval_status = 'approved' AND status = 'active' LIMIT 1`,
      [PROVIDER_SERVICE_NAME],
    );
    await page.goto(`${BASE_URL}/services?q=${encodeURIComponent(PROVIDER_SERVICE_NAME)}`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-traveler-free-discover");
    const titleVisible = await page.getByTestId("text-page-title").isVisible().catch(() => false);
    const cardVisible = svcRow
      ? await page
          .getByTestId(`card-service-${svcRow}`)
          .waitFor({ state: "visible", timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
      : false;
    report.record({
      action: `browse Kyoto surfaces, assert "${PROVIDER_SERVICE_NAME}" card is present (by name search)`,
      ui: `text-page-title=${titleVisible}, card-service-${svcRow}=${cardVisible}`,
      db: svcRow ? `provider_services.id=${svcRow} approved+active` : "service not found — supply-provider must run first",
      verdict: svcRow && titleVisible && cardVisible ? "PASS" : "FAIL",
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
    const [existingPurchase] = await rows<{
      id: string;
      status: string;
      stripe_payment_intent_id: string;
      clone_trip_id: string | null;
    }>(
      `SELECT id, status, stripe_payment_intent_id, clone_trip_id
       FROM ready_made_purchases
       WHERE buyer_id = $1 AND ready_made_trip_id = $2
       ORDER BY purchased_at DESC
       LIMIT 1`,
      [actor.id, listingId],
    );

    if (buyRes.status() === 409 && existingPurchase?.status === "cloned" && existingPurchase.clone_trip_id) {
      const rerunBody = await buyRes.json();
      const [cloneTrip] = await rows<{ id: string; user_id: string; title: string }>(
        `SELECT id, user_id, title FROM trips WHERE id = $1`,
        [existingPurchase.clone_trip_id],
      );
      report.record({
        action: `re-run purchase "${READY_MADE_TITLE}" without charging twice`,
        ui: `POST purchase status 409, cloneTripId=${rerunBody.purchase?.cloneTripId}`,
        db: JSON.stringify({ purchase: existingPurchase, cloneTrip }),
        verdict:
          rerunBody.purchase?.status === "cloned" &&
          rerunBody.purchase?.cloneTripId === existingPurchase.clone_trip_id &&
          existingPurchase.stripe_payment_intent_id &&
          cloneTrip?.id === existingPurchase.clone_trip_id &&
          cloneTrip.user_id === actor.id
            ? "PASS"
            : "FAIL",
      });
    } else if (STRIPE_UNAVAILABLE) {
      // No Stripe key on the SERVER at all — the purchase attempt cannot obtain a PaymentIntent.
      const purchaseCountBefore = await scalar<string>(
        `SELECT count(*)::int FROM ready_made_purchases WHERE buyer_id = $1 AND ready_made_trip_id = $2`,
        [actor.id, listingId],
      );
      report.record({
        action: `purchase "${READY_MADE_TITLE}" without a Stripe key on the server`,
        ui: `POST purchase status ${buyRes.status()}`,
        db: `ready_made_purchases count=${purchaseCountBefore} (expected 0 — nothing committed without a PaymentIntent)`,
        verdict: !buyRes.ok() && Number(purchaseCountBefore) === 0 ? "EXTERNAL" : "FAIL",
        note:
          "FINDING: unlike /api/checkout (ruling 38), the ready-made purchase route is not yet wired to the " +
          "declared-503 payment_unavailable contract — it fails with whatever Stripe's SDK raises on a stub key.",
      });
    } else if (!hasStripeTestKey()) {
      // Run #8 finding: the SERVER has a real Stripe key here (STRIPE_UNAVAILABLE is false — a
      // genuine PaymentIntent gets created, 202 Accepted), but `hasStripeTestKey()` resolves the
      // LITERAL key value only via the Replit dev connector (scripts/dev-stripe-key.cjs, needs
      // REPLIT_CONNECTORS_HOSTNAME) — unreachable from a GitHub Actions runner, so it is always
      // false here regardless of the server's own key. This test process therefore cannot act as
      // the "customer" and confirm the PaymentIntent itself. The honest, asserted-not-guessed
      // state for THIS combination is distinct from the no-key case above: purchase-initiation
      // succeeds server-side, and nothing is marked paid because confirmation never ran — exactly
      // the §19a posture (never mark a purchase paid without a Stripe-verified PaymentIntent).
      const paidCountBefore = await scalar<string>(
        `SELECT count(*)::int FROM ready_made_purchases WHERE buyer_id = $1 AND ready_made_trip_id = $2 AND status = 'paid'`,
        [actor.id, listingId],
      );
      const buyBody = buyRes.ok() ? await buyRes.json().catch(() => null) : null;
      report.record({
        action: `purchase "${READY_MADE_TITLE}" initiated (server has a Stripe key; this CI runner cannot confirm the PaymentIntent as a customer would)`,
        ui: `POST purchase status ${buyRes.status()}, paymentIntentId present=${Boolean(buyBody?.paymentIntentId)}`,
        db: `ready_made_purchases status='paid' count=${paidCountBefore} (expected 0 — never marked paid without a confirmed PaymentIntent, §19a)`,
        verdict: buyRes.status() === 202 && Boolean(buyBody?.paymentIntentId) && Number(paidCountBefore) === 0 ? "EXTERNAL" : "FAIL",
        note:
          "hasStripeTestKey() only resolves a literal key via the Replit dev connector, which is unreachable in " +
          "GitHub Actions — so it is always false in CI independent of whether the server's own STRIPE_SECRET_KEY " +
          "is real. STRIPE_UNAVAILABLE (server-side, env-driven) is the correct signal for whether the purchase " +
          "attempt itself should succeed; this branch asserts the server-succeeds-but-unconfirmed state honestly " +
          "instead of assuming the no-key failure shape.",
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
      const [purchaseRow] = await rows<{
        status: string;
        stripe_payment_intent_id: string;
        clone_trip_id: string | null;
      }>(
        `SELECT status, stripe_payment_intent_id, clone_trip_id
         FROM ready_made_purchases
         WHERE buyer_id = $1 AND ready_made_trip_id = $2
         ORDER BY purchased_at DESC
         LIMIT 1`,
        [actor.id, listingId],
      );
      const [cloneTrip] = await rows<{ id: string; user_id: string; title: string }>(
        `SELECT id, user_id, title FROM trips WHERE id = $1`,
        [purchaseRow?.clone_trip_id],
      );
      report.record({
        action: `purchase "${READY_MADE_TITLE}" in Stripe test mode`,
        ui: `purchase 202 -> confirm 200, cloneTripId=${confirmBody.cloneTripId}`,
        db: JSON.stringify({ purchase: purchaseRow, cloneTrip }),
        verdict:
          purchaseRow?.status === "cloned" &&
          purchaseRow?.stripe_payment_intent_id === buyBody.paymentIntentId &&
          purchaseRow?.clone_trip_id === confirmBody.cloneTripId &&
          confirmBody.purchase?.status === "cloned" &&
          confirmBody.purchase?.stripePaymentIntentId === buyBody.paymentIntentId &&
          confirmBody.purchase?.cloneTripId === confirmBody.cloneTripId &&
          cloneTrip?.id === confirmBody.cloneTripId &&
          cloneTrip.user_id === actor.id &&
          confirmBody.redirect === `/plans/${confirmBody.cloneTripId}`
            ? "PASS"
            : "FAIL",
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

    if (STRIPE_UNAVAILABLE) {
      // No Stripe key on the SERVER at all — the purchase attempt cannot obtain a PaymentIntent.
      const entitlementCount = await scalar<string>(
        `SELECT count(*)::int FROM trip_entitlements WHERE trip_id = $1`,
        [tripId],
      );
      report.record({
        action: "Trip Pass purchase without a Stripe key on the server",
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

    if (!hasStripeTestKey()) {
      // Run #8 finding (mirrors the ready-made purchase branch above): the SERVER has a real
      // Stripe key here (STRIPE_UNAVAILABLE is false — a genuine PaymentIntent gets created, 202
      // Accepted), but hasStripeTestKey() only resolves the literal key via the Replit dev
      // connector (unreachable in GitHub Actions), so this test process cannot confirm the
      // PaymentIntent as the customer would. The honest state: purchase-initiation succeeds
      // server-side, and no trip_entitlements row exists because grantTripPass (§19a) never runs
      // without a Stripe-verified confirm — asserted directly instead of assuming the no-key
      // failure shape that STRIPE_UNAVAILABLE (not hasStripeTestKey()) actually gates.
      const entitlementCount = await scalar<string>(
        `SELECT count(*)::int FROM trip_entitlements WHERE trip_id = $1`,
        [tripId],
      );
      const purchaseBody = purchaseRes.ok() ? await purchaseRes.json().catch(() => null) : null;
      report.record({
        action: "Trip Pass purchase initiated (server has a Stripe key; this CI runner cannot confirm the PaymentIntent as a customer would)",
        ui: `POST purchase status ${purchaseRes.status()}, paymentIntentId present=${Boolean(purchaseBody?.paymentIntentId)}`,
        db: `trip_entitlements count=${entitlementCount} (expected 0 — grantTripPass never runs without a confirmed PaymentIntent, §19a)`,
        verdict: purchaseRes.status() === 202 && Boolean(purchaseBody?.paymentIntentId) && Number(entitlementCount) === 0 ? "EXTERNAL" : "FAIL",
        note:
          "hasStripeTestKey() only resolves a literal key via the Replit dev connector, which is unreachable in " +
          "GitHub Actions — so it is always false in CI independent of whether the server's own STRIPE_SECRET_KEY " +
          "is real. STRIPE_UNAVAILABLE (server-side, env-driven) is the correct signal for whether the purchase " +
          "attempt itself should succeed.",
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

  // ── COVERED branch (ledger 2026-08-29-trip-pass-provenance) — extends the SAME describe
  //    block rather than duplicating it. The test above exercises the real Stripe
  //    purchase→confirm path on a FRESH trip (the uncovered/honest-negative-when-no-Stripe
  //    branch); this one exercises the trip scripts/seed-personas.ts already granted a
  //    MANUAL-provenance Trip Pass on (source='manual', no PaymentIntent) — so every
  //    assertion here is Stripe-independent EXCEPT the checkout-waiver step, which still
  //    needs a real charge to produce a real booking row.
  test("Trip Pass traveler: the COVERED branch on the seeded manual-provenance entitlement", async ({ page }) => {
    const report = new JourneyReport("journey-traveler-trip-pass-covered");
    const request = page.request;

    const actor = await loginAs(request, PERSONAS.tripPassTraveler);

    // Must match scripts/seed-personas.ts's TRIP_PASS_SEED_TRIP_TITLE exactly — the seed's
    // find-or-create key (no hardcoded trip id; a re-seed reuses the same row).
    const SEEDED_TRIP_TITLE = "Trip Pass Kyoto Trip (seeded entitlement)";
    const [seededTrip] = await rows<{ id: string }>(
      `SELECT id FROM trips WHERE user_id = $1 AND title = $2 LIMIT 1`,
      [actor.id, SEEDED_TRIP_TITLE],
    );
    expect(seededTrip, `seeded trip "${SEEDED_TRIP_TITLE}" not found — run scripts/seed-personas.ts --apply first`).toBeTruthy();
    const coveredTripId = seededTrip!.id;

    const [entitlement] = await rows<{
      status: string;
      plan_key: string;
      source: string;
      source_payment_id: string | null;
      allowances_snapshot: { revisionsRemaining?: number };
    }>(
      `SELECT status, plan_key, source, source_payment_id, allowances_snapshot FROM trip_entitlements WHERE trip_id = $1 AND status = 'active'`,
      [coveredTripId],
    );
    report.record({
      action: "assert the seeded manual-provenance entitlement (ruling 2026-08-29-trip-pass-provenance)",
      ui: "n/a (seed-created)",
      db: JSON.stringify(entitlement),
      verdict:
        entitlement?.status === "active" &&
        entitlement?.plan_key === "trip_pass" &&
        entitlement?.source === "manual" &&
        entitlement?.source_payment_id === null &&
        Number(entitlement?.allowances_snapshot?.revisionsRemaining) > 0
          ? "PASS"
          : "FAIL",
    });

    // ── Optimizer paid-gate: covered ─────────────────────────────────────────────────────
    // server/routes/optimization.routes.ts:276 short-circuits BEFORE any Stripe call —
    // asserted directly on the response, since NOTHING else observable changes: the code's
    // own comment records that suppression is `covered_by:trip_pass` in a console.log line
    // ONLY (fee_ledger's amount<>0 CHECK forbids a literal $0 row) — there is no DB ledger
    // row to assert against. Recorded here as a FINDING rather than fabricating one.
    const optRes = await request.post(`${BASE_URL}/api/optimization-payments`, {
      data: { tripId: coveredTripId, destination: "Kyoto" },
    });
    const optBody = optRes.ok() ? await optRes.json().catch(() => ({})) : {};
    report.record({
      action: "optimizer run on the covered trip — no PaymentIntent, no clientSecret",
      ui: `POST /api/optimization-payments status ${optRes.status()}, body=${JSON.stringify(optBody)}`,
      db: "n/a — coverage suppresses the charge before any Stripe call; the $0 suppression is a console.log line only (FINDING: no fee_ledger row exists for a covered run, by design — fee_ledger's amount<>0 CHECK forbids a literal $0 row)",
      verdict:
        optRes.status() === 200 &&
        optBody.coveredByTripPass === true &&
        optBody.feeCents === 0 &&
        !optBody.clientSecret &&
        !optBody.paymentIntentId
          ? "PASS"
          : "FAIL",
    });

    // ── Persistent "covered" UI (TripPassCard, the real testid/copy) ─────────────────────
    // FINDING: there is no distinct mid-optimize-click "Included in your Trip Pass" banner —
    // client/src/components/plancard/SlipView.tsx's startOptimization() treats
    // `covered_by_pass` identically to `free_rerun` (silently proceeds, no toast). The ONE
    // real, persistent signal a covered trip shows is TripPassCard's active state
    // (data-testid="trip-pass-card-active"), asserted here instead of a fabricated banner.
    await page.goto(`${BASE_URL}/plans/${coveredTripId}`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-traveler-trip-pass-covered-slip");
    const activeCard = page.getByTestId("trip-pass-card-active");
    const activeCardVisible = await activeCard.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
    const activeCardText = activeCardVisible ? await activeCard.textContent().catch(() => "") : "";
    report.record({
      action: 'slip shows the persistent "Trip Pass active" card (the real coverage signal — no separate mid-flow banner exists)',
      ui: `trip-pass-card-active visible=${activeCardVisible}, text="${activeCardText?.trim()}"`,
      db: `trip_entitlements.status=${entitlement?.status}`,
      verdict: activeCardVisible ? "PASS" : "FAIL",
    });

    // ── Checkout: traveler service-fee waiver recorded on the booking row ────────────────
    // display-honesty fix (this dispatch): `GET /api/cart/fee-preview` NOW considers
    // trip_entitlements via an optional ownership-checked `?tripId=` param, calling the SAME
    // coversAction/resolveTripPassFeeWaiver functions the real charge path uses (§18 rule 1) —
    // so the preview response's `tripPassFeeWaiver` is asserted directly below, Stripe-independent
    // (a pure read, no PaymentIntent involved). The REAL charge-side waiver mechanism remains
    // server/routes/payments.routes.ts:1269's resolveTripPassFeeWaiver pre-pass, which snapshots
    // onto the CREATED booking row's booking_details.tripPassFeeWaiver (basis:'trip_pass',
    // waived:true) at checkout — asserted directly against that row below, gated the same
    // Stripe-test-mode way as the free-traveler checkout above. Note also (from the resolver's
    // own doc comment): billedOnDirectPathToday=false — the traveler service fee is not actually
    // billed on the direct checkout path today regardless of Trip Pass, so BOTH waiver records are
    // counterfactual, not a suppression of a real charge.
    const svcRow = await scalar<string>(
      `SELECT id FROM provider_services WHERE service_name = $1 AND approval_status = 'approved' AND status = 'active' LIMIT 1`,
      [PROVIDER_SERVICE_NAME],
    );
    if (!svcRow) {
      report.record({
        action: `checkout waiver check skipped — "${PROVIDER_SERVICE_NAME}" not found`,
        ui: "n/a",
        db: "n/a",
        verdict: "EXTERNAL",
        note: "supply-provider.spec.ts must run first to create the named service.",
      });
    } else {
      const [svc] = await rows<{ id: string; price: string; service_name: string }>(
        `SELECT id, price, service_name FROM provider_services WHERE id = $1`,
        [svcRow],
      );
      const itemId = await createCatalogItem(request, coveredTripId, { id: svc.id, price: svc.price, name: svc.service_name });
      await routeItem(request, coveredTripId, itemId, "ready_for_checkout");

      // ── Fee-preview waiver parity (display-honesty fix) — a pure read, Stripe-independent,
      // asserted while the item is still in the cart (checkout below clears it). ────────────
      const previewRes = await request.get(`${BASE_URL}/api/cart/fee-preview?tripId=${coveredTripId}`);
      const previewBody = previewRes.ok() ? await previewRes.json().catch(() => ({})) : {};
      report.record({
        action: "fee-preview with ?tripId= on the covered trip carries the SAME waiver shape the charge path stamps onto a booking row",
        ui: `GET /api/cart/fee-preview?tripId=${coveredTripId} status ${previewRes.status()}, tripPassFeeWaiver=${JSON.stringify(previewBody.tripPassFeeWaiver)}`,
        db: "n/a — pure read, no booking/PaymentIntent involved",
        verdict:
          previewRes.status() === 200 &&
          previewBody.tripPassFeeWaiver?.waived === true &&
          previewBody.tripPassFeeWaiver?.basis === "trip_pass"
            ? "PASS"
            : "FAIL",
      });

      const idempotencyKey = crypto.randomUUID();
      const checkoutRes = await request.post(`${BASE_URL}/api/checkout`, { data: { tripId: coveredTripId, idempotencyKey } });

      if (STRIPE_UNAVAILABLE) {
        const [{ n: cartCountBefore }] = await rows<{ n: number }>(
          `SELECT count(*)::int AS n FROM cart_items WHERE user_id = $1`,
          [actor.id],
        );
        await assertCheckoutCommittedNothing(checkoutRes, "journey-traveler-trip-pass-covered", {
          userId: actor.id,
          tripId: coveredTripId,
          itemIds: [itemId],
          cartCountBefore: Number(cartCountBefore),
        });
        report.record({
          action: "checkout waiver check — Stripe unavailable, honest negative (declared 503, nothing committed)",
          ui: `POST /api/checkout status ${checkoutRes.status()}`,
          db: "no booking row exists to check the waiver on — nothing committed (hard-asserted above)",
          verdict: "EXTERNAL",
        });
      } else {
        await assertCheckoutAccepted(checkoutRes, "journey-traveler-trip-pass-covered");
        const [booking] = await rows<{ id: string; booking_details: { tripPassFeeWaiver?: { basis?: string; waived?: boolean } } }>(
          `SELECT id, booking_details FROM service_bookings WHERE traveler_id = $1 AND trip_id = $2 ORDER BY created_at DESC LIMIT 1`,
          [actor.id, coveredTripId],
        );
        const waiver = booking?.booking_details?.tripPassFeeWaiver;
        report.record({
          action: "checkout on the covered trip records the trip-pass traveler-fee waiver on the booking row",
          ui: `POST /api/checkout 2xx`,
          db: `booking_details.tripPassFeeWaiver=${JSON.stringify(waiver)}`,
          verdict: waiver?.waived === true && waiver?.basis === "trip_pass" ? "PASS" : "FAIL",
        });
      }
    }

    // ── One active pass per trip: a second purchase on the ALREADY-covered trip is
    //    rejected BEFORE any Stripe call, regardless of Stripe availability (the 409 check
    //    is the getActiveTripPass() pre-flight, which runs before any Stripe client is
    //    constructed) — so this assertion is Stripe-independent. ─────────────────────────
    const secondPurchase = await request.post(`${BASE_URL}/api/trips/${coveredTripId}/trip-pass/purchase`);
    const activeCountAfter = await scalar<string>(
      `SELECT count(*)::int FROM trip_entitlements WHERE trip_id = $1 AND status = 'active'`,
      [coveredTripId],
    );
    report.record({
      action: "second Trip Pass purchase on the already-covered (manually-granted) trip is rejected before any PaymentIntent",
      ui: `second purchase status ${secondPurchase.status()}`,
      db: `active trip_entitlements count=${activeCountAfter}`,
      verdict: secondPurchase.status() === 409 && Number(activeCountAfter) === 1 ? "PASS" : "FAIL",
    });

    report.write();
    expect(report.hasFailures, `journey-traveler-trip-pass-covered had failing steps: ${JSON.stringify(report)}`).toBe(false);
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
      ? await page
          .getByTestId(`occasion-${occasionRow.id}`)
          .waitFor({ state: "visible", timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
      : false;
    // Run #8 finding: `occasion_date` is a `date`-typed column — node-postgres parses it into a
    // real JS `Date` object, not a string. `String(dateObject)` calls `.toString()` (the locale
    // form, e.g. "Fri Sep 12 2026 00:00:00 GMT+0000 (Coordinated Universal Time)"), which never
    // starts with "YYYY-MM-DD" — so this comparison failed on every genuinely-correct row,
    // deterministically, regardless of the underlying data (the `db` field above looked right
    // only because `JSON.stringify` calls the Date's `.toJSON()`, a different method, which DOES
    // produce the ISO form). Re-parsing through `new Date(...)` before formatting works whether
    // the driver hands back a Date or a string.
    const occasionDateActual = occasionRow?.occasion_date ? new Date(occasionRow.occasion_date).toISOString().slice(0, 10) : null;
    report.record({
      action: "add one occasion 14 days out through the UI",
      ui: existing ? "reused an existing occasion (idempotent re-run)" : `filled the Add-occasion form, occasion-${occasionRow?.id} visible=${listItemVisible}`,
      db: JSON.stringify(occasionRow),
      verdict: occasionRow?.template_key === "birthday" && occasionDateActual === occasionDateStr ? "PASS" : "FAIL",
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
