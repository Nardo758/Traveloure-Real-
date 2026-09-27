// e2e/specs/journey-4-5.spec.ts
// Journey 4 (expert) and Journey 5 (provider): a seller's listing goes live, a traveler finds it
// on the seller's storefront and checks out, and the seller's inbox tells the truth about it.
//
// REWRITTEN 2026-09-25 (ledger `2026-09-25-journey-4-5-rewritten`). The previous version waited on
// test ids no page renders any more (`expert-detail-page`, `expert-feed`, `tab-services`,
// `service-creation-form`, `earnings-dashboard`, …), drove a Stripe iframe by placeholder text,
// and asserted fixed commission splits ("Platform fee: 25%") that §8 forbids anywhere outside
// `fee_bands`. It could not pass against any build, so it measured nothing.
//
// WHAT THIS JOURNEY PROVES, per seller (one test each, same steps):
//   1. The seller publishes a listing through the rail the listing wizard posts to
//      (`POST /api/provider/services`) — born `submitted` (migration 111). The wizard UI itself is
//      proven by the persona suites (playwright/tests/personas/supply-*.spec.ts); this journey is
//      about what happens AFTER a listing exists.
//   2. The seller has a public handle (claimed through `PATCH /api/me/handle` if they have none) —
//      a storefront is addressed by handle (Locked Decision 40).
//   3. The admin approves the listing (`POST /api/admin/provider-services/:id/approve`).
//   4. A newly registered traveler starts a plan, opens `/s/<handle>`, finds the listing's card,
//      opens the listing page ON THAT PLAN, reads the seller's own price, and presses the page's
//      add control — the item lands on the plan (LD 39: every add surface is a view of
//      `itinerary_items`).
//   5. The traveler sends the item to checkout through the ONE routing rail the Finalize chooser
//      uses; the cart line is that item's projection and carries the seller's price, and the
//      traveler checks out (Checkout → Complete Booking).
//
// WHY THE TRAVELER PLANS FIRST (ledger `2026-09-25-journey-4-5-plans-first`). RC-2 (ledger
// `2026-09-24-rc2-add-to-plan`) rules that a signed-in member with no plan is ASKED which plan
// rather than handed a trip-less cart line, so "sign up, click add, see a cart line" is not a
// journey the platform offers a member. Planning first is the member's real path, and it is the
// same path with or without RC-2, so this file does not depend on which one a build carries.
//   6. The seller's side of the sale, read through the seller's own session and console.
//
// STRIPE — TWO TRUTHFUL CONTRACTS, CHOSEN EXPLICITLY (the journey-suite.yml posture, ruling 38).
// `JOURNEY_STRIPE_UNAVAILABLE=1` declares the server has no working Stripe key. Then checkout must
// answer the declared 503 `payment_unavailable`, the cart must be intact, and the seller must see
// the provisional claim ONLY as the §15b claim it is: never actionable (no Accept — §18b), listed
// under "Awaiting payment" on the provider console, and absent from the expert console's queue
// and history. With a real key, checkout must return a PaymentIntent, the PaymentElement is
// confirmed with the 4242 test card, and the seller's History shows the booking with "You earn"
// equal to the booking's own server-stamped `providerEarnings` — never a figure computed here
// (§8: no rate literal; the stamp's arithmetic is payout-parity-gate.yml's job).
//
// STATED NEGATIVE SPACE. The real-key branch has not been run: no CI job holds a Stripe test key
// today, so every green run of this file is the declared-unavailable branch. It does not prove the
// listing wizard, completion, earnings minting or payouts. It needs the Kyoto personas
// (`npx tsx scripts/seed-personas.ts --apply`) and the CI admin (`scripts/seed-ci-test-users.ts`).

import { test, expect, request as pwRequest, type APIRequestContext, type Page } from "@playwright/test";
import { loginAs } from "../../playwright/utils/auth";
import { PERSONAS, PERSONA_PASSWORD, CI_ADMIN_EMAIL, CI_ADMIN_PASSWORD } from "../../playwright/tests/personas/_persona-helpers";
import { PROVISIONAL_BOOKING_HINT } from "../../shared/booking-visibility";

const STRIPE_UNAVAILABLE = process.env.JOURNEY_STRIPE_UNAVAILABLE === "1";

test.setTimeout(240_000);

interface SellerCase {
  label: string;
  email: string;
  /** Used only when the seller has no handle yet. */
  handle: string;
  inboxPath: string;
  listing: Record<string, unknown> & { serviceName: string; price: string };
}

const RUN = Date.now().toString(36);

const EXPERT_CASE: SellerCase = {
  label: "expert",
  email: PERSONAS.gionExpert,
  handle: "gion-evenings",
  inboxPath: "/expert/inbox",
  listing: {
    serviceName: `Gion Lantern Walk Planning Call ${RUN}`,
    shortDescription: "A call to plan a quiet Gion evening walk.",
    description: "We plan a Gion evening walk around lantern light and foot traffic, on a call.",
    price: "80",
    priceType: "fixed",
    deliveryMethod: "call",
    location: "Kyoto",
    status: "active",
    // The seller's own per-listing choice (the Catalog "Card shows" toggle): this journey checks
    // the listing out, and a listing that resolves to `request` is never a cart line (ledger
    // `2026-09-25-checkout-request-mode`). An expert has no provider form, so an unset mode is
    // always `request`.
    bookingMode: "instant",
  },
};

const PROVIDER_CASE: SellerCase = {
  label: "provider",
  email: PERSONAS.kyotoProvider,
  handle: "kyoto-station-transfers",
  inboxPath: "/provider/inbox",
  listing: {
    serviceName: `Kyoto Station Meet and Transfer ${RUN}`,
    shortDescription: "Meet at Kyoto Station and ride to your hotel.",
    description: "A driver meets you at the Hachijo Central exit and takes you to your hotel.",
    price: "120",
    priceType: "fixed",
    deliveryMethod: "in_person",
    meetingPoint: "Kyoto Station, Hachijo Central exit",
    location: "Kyoto",
    status: "active",
    // The seller's own statement for an in-person listing (the SS-5a publish gate). The platform
    // does not verify it; the seller makes it when they publish, exactly as the wizard asks.
    affirmAttestations: ["in_person_safety_basics"],
    // Declared instant for the same reason as the expert case (ledger
    // `2026-09-25-checkout-request-mode`): the persona provider's account flag is unset.
    bookingMode: "instant",
  },
};

function baseURL(): string {
  const url = test.info().project.use.baseURL;
  if (!url) throw new Error("journey-4-5: no baseURL — run with playwright.local.config.ts (BASE_URL)");
  return url;
}

async function newSession(email: string, password: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL: baseURL() });
  await loginAs(ctx, email, password);
  return ctx;
}

/** The seller's public handle: the one they have, or the one this journey claims for them. */
async function ensureHandle(seller: APIRequestContext, wanted: string): Promise<string> {
  const me = await (await seller.get("/api/auth/user")).json();
  if (me?.handle) return me.handle as string;
  const res = await seller.patch("/api/me/handle", { data: { handle: wanted } });
  expect(res.status(), `claim @${wanted}: ${await res.text()}`).toBe(200);
  return ((await res.json()) as { handle: string }).handle;
}

async function publishAndApprove(seller: APIRequestContext, c: SellerCase): Promise<string> {
  const created = await seller.post("/api/provider/services", { data: c.listing });
  expect(created.status(), `publish ${c.label} listing: ${await created.text()}`).toBe(201);
  const listing = await created.json();
  expect(listing.approvalStatus, "a new listing is born submitted (migration 111)").toBe("submitted");

  const admin = await newSession(CI_ADMIN_EMAIL, CI_ADMIN_PASSWORD);
  const approved = await admin.post(`/api/admin/provider-services/${listing.id}/approve`);
  expect(approved.status(), `admin approve: ${await approved.text()}`).toBe(200);
  await admin.dispose();

  const pub = await (await seller.get(`/api/services/${listing.id}`)).json();
  expect(pub.approvalStatus).toBe("approved");
  expect(pub.status, "an approved listing from a verified seller is live").toBe("active");
  return listing.id as string;
}

async function registerTraveler(page: Page): Promise<void> {
  const email = `j45-traveler-${RUN}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const reg = await page.request.post("/api/auth/register", {
    data: { email, password: "Journey45!pass", firstName: "Journey", lastName: "Traveler" },
  });
  expect(reg.status(), `register traveler: ${await reg.text()}`).toBe(201);
  const terms = await page.request.post("/api/auth/accept-terms", { data: { acceptTerms: true, acceptPrivacy: true } });
  expect(terms.ok()).toBe(true);
}

/** The traveler's own plan in the listing's city, minted through the one client trip rail. */
async function startPlan(page: Page): Promise<string> {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const res = await page.request.post("/api/trips", {
    data: { title: `Journey 4-5 plan ${RUN}`, destination: "Kyoto, Japan", startDate: day(30), endDate: day(33) },
  });
  expect(res.status(), `start a plan: ${await res.text()}`).toBe(201);
  const trip = await res.json();
  expect(trip.id, "the plan was minted").toBeTruthy();
  return trip.id as string;
}

/** Price as the listing page prints it: whole dollars without cents, cents kept otherwise. */
function listedPrice(price: string): string {
  const n = Number(price);
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

async function runJourney(page: Page, c: SellerCase): Promise<void> {
  // ── 1–3: the listing exists, is approved and is live under the seller's handle ─────────────
  const seller = await newSession(c.email, PERSONA_PASSWORD);
  const handle = await ensureHandle(seller, c.handle);
  const listingId = await publishAndApprove(seller, c);

  // ── 4: the traveler plans, finds the listing on the storefront and adds it to the plan ─────
  await registerTraveler(page);
  const tripId = await startPlan(page);
  await page.goto(`/s/${handle}`);
  const card = page.getByTestId(`storefront-service-${listingId}`);
  await expect(card, "the approved listing is on the seller's storefront").toBeVisible({ timeout: 90_000 });
  await expect(card).toContainText(c.listing.serviceName);
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/services/${listingId}`));
  // The same listing page, addressed to the traveler's plan (`resolveTargetTripId` reads `?tripId=`).
  await page.goto(`/services/${listingId}?tripId=${tripId}`);
  await expect(page.getByTestId("text-service-name")).toHaveText(c.listing.serviceName, { timeout: 90_000 });
  await expect(page.getByTestId("text-price")).toHaveText(listedPrice(c.listing.price));

  // The page's add control; its label is the buy descriptor's, so it is found by id, not by words.
  await page.getByTestId("button-add-to-cart").click();
  let planItem: any;
  await expect
    .poll(async () => {
      const body = await (await page.request.get(`/api/trips/${tripId}/itinerary-items`)).json();
      // The plan's items come back grouped by day: `{ days: [{ dayNumber, items }], total }`.
      const items: any[] = (body.days ?? []).flatMap((d: any) => d.items ?? []);
      planItem = items.find((i) => i.providerServiceId === listingId);
      return Boolean(planItem);
    }, { message: "the add lands on the traveler's plan", timeout: 30_000 })
    .toBe(true);

  // ── 5: the item goes to checkout; its cart line carries the seller's price ────────────────
  const routed = await page.request.post(`/api/trips/${tripId}/items/${planItem.id}/route`, {
    data: { to: "ready_for_checkout" },
  });
  expect(routed.ok(), `route the plan item to checkout: ${await routed.text()}`).toBe(true);
  expect((await routed.json()).projection?.action, "the cart projection was written").not.toBe("error");

  const cart = await (await page.request.get("/api/cart")).json();
  const line = (cart.items ?? []).find((i: any) => i.serviceId === listingId);
  expect(line, "the cart holds a line for this listing").toBeTruthy();
  const cartCountBefore = (cart.items ?? []).length;

  await page.goto("/cart");
  const cartLine = page.getByTestId(`cart-item-${line.id}`);
  await expect(cartLine).toBeVisible({ timeout: 90_000 });
  await expect(cartLine).toContainText(c.listing.serviceName);
  await expect(cartLine).toContainText(`$${Number(c.listing.price).toFixed(2)}`);

  await page.getByTestId("button-skip-to-payment").click();
  const checkoutResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST",
  );
  await page.getByTestId("button-complete-booking").click();
  const checkout = await checkoutResponse;

  const sellerBookings = async () =>
    ((await (await seller.get(c.label === "expert" ? "/api/expert/bookings" : "/api/provider/bookings")).json()) as any[]).filter(
      (b) => b.serviceId === listingId,
    );

  if (STRIPE_UNAVAILABLE) {
    // ── 6a: declared unavailable — nothing committed, and the seller is told the truth ────────
    expect(checkout.status(), "with Stripe declared unavailable the only answer is the declared 503").toBe(503);
    const body = await checkout.json();
    expect(body.error).toBe("payment_unavailable");
    expect(body.success).toBe(false);
    await expect(page.getByText("Payment provider unavailable").first()).toBeVisible();

    const cartAfter = await (await page.request.get("/api/cart")).json();
    expect((cartAfter.items ?? []).length, "the cart is exactly as the traveler left it").toBe(cartCountBefore);

    const rows = await sellerBookings();
    expect(rows.every((b) => b.status === "payment_pending" && !b.stripePaymentIntentId),
      `only an unauthorized §15b claim may exist for this listing: ${JSON.stringify(rows.map((b) => b.status))}`).toBe(true);

    const sellerPage = await page.context().browser()!.newPage({ baseURL: baseURL() });
    await loginAs(sellerPage, c.email, PERSONA_PASSWORD);
    await sellerPage.goto(c.inboxPath);
    await expect(sellerPage.getByTestId("tab-inbox-queue")).toBeVisible({ timeout: 90_000 });
    for (const claim of rows) {
      // Never actionable: the owner rail may not move a provisional claim (§18b).
      await expect(sellerPage.getByTestId(`button-accept-booking-${claim.id}`)).toHaveCount(0);
      if (c.label === "provider") {
        // The provider console discloses it read-only, under "Awaiting payment".
        const awaiting = sellerPage.getByTestId("section-inbox-awaiting-payment");
        await expect(awaiting).toBeVisible();
        await expect(awaiting.getByTestId(`inbox-booking-${claim.id}`)).toBeVisible();
        // …with no payout figure: nothing is earned until the traveler pays (ledger
        // `2026-09-25-provisional-claim-payout-line`) — the neutral line, never "You earn".
        await expect(awaiting.getByTestId(`booking-payout-${claim.id}`)).toHaveCount(0);
        await expect(awaiting.getByTestId(`booking-no-payout-${claim.id}`)).toHaveCount(0);
        await expect(awaiting.getByTestId(`booking-provisional-${claim.id}`)).toHaveText(PROVISIONAL_BOOKING_HINT);
      } else {
        // The expert console lists no provisional claim, in the queue or in History.
        await expect(sellerPage.getByTestId(`inbox-booking-${claim.id}`)).toHaveCount(0);
        await sellerPage.getByTestId("tab-inbox-history").click();
        await expect(sellerPage.getByTestId("section-inbox-history")).toBeVisible();
        await expect(sellerPage.getByTestId(`booking-payout-${claim.id}`)).toHaveCount(0);
      }
    }
    await sellerPage.close();
  } else {
    // ── 6b: a real Stripe test key — pay, then read the seller's promise ─────────────────────
    expect(checkout.status(), `checkout must accept with a working key: ${await checkout.text()}`).toBeLessThan(300);
    const body = await checkout.json();
    expect(body.paymentIntent?.clientSecret, "checkout returns a PaymentIntent").toBeTruthy();

    const frame = page.frameLocator('iframe[title*="Secure payment input frame"], iframe[name^="__privateStripeFrame"]').first();
    await frame.locator('input[name="number"]').fill("4242424242424242");
    await frame.locator('input[name="expiry"]').fill("12/34");
    await frame.locator('input[name="cvc"]').fill("123");
    const zip = frame.locator('input[name="postalCode"]');
    if (await zip.count()) await zip.fill("94105");
    await page.getByRole("button", { name: /^Pay \$/ }).click();

    await expect
      .poll(async () => (await sellerBookings()).find((b) => b.status === "confirmed")?.id ?? null, { timeout: 60_000 })
      .not.toBeNull();
    const booking = (await sellerBookings()).find((b) => b.status === "confirmed");
    const payout = Number(booking.providerEarnings);
    expect(payout, "the stamped payout is a positive part of the booking total").toBeGreaterThan(0);
    expect(payout).toBeLessThanOrEqual(Number(booking.totalAmount));

    const sellerPage = await page.context().browser()!.newPage({ baseURL: baseURL() });
    await loginAs(sellerPage, c.email, PERSONA_PASSWORD);
    await sellerPage.goto(c.inboxPath);
    await sellerPage.getByTestId("tab-inbox-history").click({ timeout: 90_000 });
    await expect(sellerPage.getByTestId(`booking-payout-${booking.id}`)).toContainText(`You earn $${payout.toFixed(2)}`);
    await sellerPage.close();
  }

  await seller.dispose();
}

test.describe("Journey 4 — expert: listing → storefront → checkout → the expert's inbox", () => {
  test("a traveler finds the expert's listing on their storefront and checks out", async ({ page }) => {
    await runJourney(page, EXPERT_CASE);
  });
});

test.describe("Journey 5 — provider: listing → storefront → checkout → the provider's inbox", () => {
  test("a traveler finds the provider's listing on their storefront and checks out", async ({ page }) => {
    await runJourney(page, PROVIDER_CASE);
  });
});
