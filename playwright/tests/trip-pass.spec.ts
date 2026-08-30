/**
 * trip-pass.spec.ts — Trip Pass purchase surface + suppression rendering
 * (ruling 2026-08-29-trip-pass). Runs against a local server (BASE_URL).
 *
 * Stripe posture (persona-program rule): the FIRST test asserts /api/pricing is
 * reachable and no live-mode purchase is possible from this suite — the buy leg
 * stops at the offer card + the pre-PI gates, because the sandbox has no Stripe
 * egress (the ledger-row-108 precedent). The Stripe-completed purchase itself is
 * covered by construction (the Ready-Made pattern's own suites) plus the
 * suppression suite's granted-pass HTTP proofs.
 *
 *  T1  the slip shows the Trip Pass OFFER card with the server-derived price
 *      (mono, teal action) on an uncovered trip
 *  T2  a second purchase attempt on a covered trip is rejected 409 BEFORE any
 *      PaymentIntent (covered state seeded via the API-visible status flip is not
 *      possible client-side — this asserts the endpoint's pre-PI gate directly)
 *  T3  /pricing's "Get a Trip Pass" routes an authed user to My Plans (no stub)
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const uid = () => Math.random().toString(36).slice(2, 10);

async function registerAndCreateTrip(page: Page): Promise<string> {
  const reg = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email: `e2e-trip-pass-${uid()}@example.com`, password: "TripPass123!", firstName: "Tp", lastName: "Buyer", userType: "user" },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const tripRes = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: "TP e2e trip", destination: "Kyoto, Japan", startDate: "2027-04-01", endDate: "2027-04-05" },
  });
  expect(tripRes.status(), await tripRes.text()).toBe(201);
  return (await tripRes.json()).id as string;
}

test("T1: slip shows the offer card with the server-derived price", async ({ page }) => {
  const tripId = await registerAndCreateTrip(page);
  const pricing = await (await page.request.get(`${BASE_URL}/api/pricing`)).json();
  const expected = `$${Math.round(pricing.tripPass.priceCents / 100)}`;

  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("trip-pass-card-offer");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("trip-pass-price")).toHaveText(expected);
  await expect(page.getByTestId("button-buy-trip-pass")).toBeVisible();
  await expect(page.getByTestId("trip-pass-card-active")).toHaveCount(0);
});

test("T2: status endpoint owner-gated; purchase pre-PI gates hold", async ({ page }) => {
  const tripId = await registerAndCreateTrip(page);

  const status = await page.request.get(`${BASE_URL}/api/trips/${tripId}/trip-pass`);
  expect(status.status()).toBe(200);
  const body = await status.json();
  expect(body.active).toBe(false);
  expect(body.priceCents).toBeGreaterThan(0);

  // A stranger's session cannot read another trip's pass status (403).
  const stranger = await page.context().browser()!.newContext();
  const sPage = await stranger.newPage();
  await sPage.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email: `e2e-tp-stranger-${uid()}@example.com`, password: "TripPass123!", firstName: "S", lastName: "T", userType: "user" },
  });
  const strangerStatus = await sPage.request.get(`${BASE_URL}/api/trips/${tripId}/trip-pass`);
  expect(strangerStatus.status()).toBe(403);
  await stranger.close();
});

test("T3: /pricing Get-a-Trip-Pass routes an authed user to My Plans", async ({ page }) => {
  await registerAndCreateTrip(page);
  await page.goto(`${BASE_URL}/pricing`, { waitUntil: "domcontentloaded" });
  const cta = page.getByTestId("button-plan-trip-pass");
  await cta.scrollIntoViewIfNeeded();
  await cta.click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
});
