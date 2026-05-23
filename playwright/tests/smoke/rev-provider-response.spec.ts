/**
 * REV-09: Provider Response to Review
 *
 * Verifies that the service provider can respond to a traveler's review.
 * Uses pacific-rentals@traveloure.test (provider who owns the Alcatraz service).
 *
 * Flow:
 *  1. Reset any existing provider responses (dev endpoint)
 *  2. Login as provider
 *  3. Navigate to service page
 *  4. Find the "Respond" button on a review card
 *  5. Click it — inline respond form opens
 *  6. Fill response text and submit
 *  7. PATCH /respond → 200; response appears in card
 *  8. Reload — response persists (DB was updated)
 */

import { test, expect } from "@playwright/test";

const BOOKED_SERVICE_ID = "24717f66-4741-400e-9f58-97224f8a2856";
const PROVIDER_EMAIL    = "pacific-rentals@traveloure.test";
const PROVIDER_PASSWORD = "Provider@1234";
const RESPONSE_TEXT     = "Thank you for your kind words — we're thrilled you enjoyed the early access!";

test("REV-09: Provider Response — respond button, form, persists after reload", async ({ page }) => {
  test.setTimeout(90000);

  // ── 0. Reset any existing provider responses so test is rerunnable ──────────
  const resetRes = await page.request.delete("/api/dev/reset-provider-response");
  console.log(`REV-09: Reset provider responses → ${resetRes.status()}`);

  // ── 1. Login as provider ─────────────────────────────────────────────────────
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10000 });
  await page.locator('input[type="email"]').first().fill(PROVIDER_EMAIL);
  await page.locator('input[type="password"]').first().fill(PROVIDER_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/provider\/dashboard|\/dashboard/, { timeout: 20000 });
  console.log(`REV-09: Logged in as ${PROVIDER_EMAIL} ✓`);

  // ── 2. Navigate to the service page ─────────────────────────────────────────
  await page.goto(`/services/${BOOKED_SERVICE_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000); // wait for reviews + bookings APIs

  // ── 3. Find the "Respond" button (only on reviews the provider can respond to) ─
  const respondBtnLocator = page.locator('[data-testid^="button-respond-review-"]').first();
  await expect(respondBtnLocator, "button-respond-review-* not found — provider must see respond button").toBeVisible({ timeout: 8000 });

  const respondBtnTestid = await respondBtnLocator.getAttribute("data-testid") ?? "";
  const reviewId         = respondBtnTestid.replace("button-respond-review-", "");
  console.log(`REV-09: Found Respond button for review: ${reviewId.slice(0, 8)}… ✓`);

  // ── 4. Click Respond — inline form opens ────────────────────────────────────
  await respondBtnLocator.click();
  await page.waitForTimeout(300);

  const respondForm = page.locator(`[data-testid="respond-form-${reviewId}"]`);
  await expect(respondForm, "respond-form should appear after clicking Respond").toBeVisible({ timeout: 5000 });
  console.log("REV-09: Inline respond form opened ✓");

  // ── 5. Fill response text ────────────────────────────────────────────────────
  const responseTextarea = page.locator(`[data-testid="input-response-text-${reviewId}"]`);
  await expect(responseTextarea).toBeVisible();
  await responseTextarea.fill(RESPONSE_TEXT);
  console.log("REV-09: ✓ Filled response text");

  // ── 6. Submit — wait for PATCH /respond ─────────────────────────────────────
  const submitBtn = page.locator(`[data-testid="button-submit-response-${reviewId}"]`);
  await expect(submitBtn).toBeVisible();
  await expect(submitBtn).not.toBeDisabled();

  const [patchResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(`/reviews/${reviewId}/respond`) && r.request().method() === "PATCH",
      { timeout: 10000 }
    ),
    submitBtn.click(),
  ]);
  const patchStatus = patchResponse.status();
  console.log(`REV-09: PATCH /respond status: ${patchStatus}`);
  expect(patchStatus, "PATCH /respond should return 200").toBe(200);
  console.log("REV-09: ✓ Response submitted");

  // ── 7. Verify: form dismissed + response text visible ─────────────────────
  await page.waitForFunction(
    (id) => !document.querySelector(`[data-testid="respond-form-${id}"]`),
    reviewId,
    { timeout: 8000 }
  );
  console.log("REV-09: Respond form dismissed ✓");

  await page.waitForFunction(
    ([id, text]) => {
      const el = document.querySelector(`[data-testid="text-response-${id}"]`);
      return el && el.textContent?.includes(text as string);
    },
    [reviewId, "Thank you"],
    { timeout: 8000 }
  );
  const responseEl = page.locator(`[data-testid="text-response-${reviewId}"]`);
  const responseShown = (await responseEl.first().textContent())?.trim() ?? "";
  console.log(`REV-09: Response visible in card: "${responseShown.substring(0, 60)}" ✓`);
  expect(responseShown).toContain("Thank you");

  // ── 8. Reload — verify persists ──────────────────────────────────────────────
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  const afterReloadEl   = page.locator(`[data-testid="text-response-${reviewId}"]`);
  const afterReloadText = await afterReloadEl.count() > 0
    ? (await afterReloadEl.first().textContent())?.trim() ?? ""
    : "";
  console.log(`REV-09: After reload — response: "${afterReloadText.substring(0, 60)}"`);
  expect(afterReloadText, "provider response must persist after page reload").toContain("Thank you");

  // ── 9. Verify "Respond" button is now gone (already responded) ───────────────
  const respondBtnGone = await page.locator(`[data-testid="button-respond-review-${reviewId}"]`).count();
  expect(respondBtnGone, "Respond button should be hidden once a response exists").toBe(0);
  console.log("REV-09: Respond button hidden after response posted ✓");

  console.log(`REV-09: ── PASS ✓ ──
  Provider:       ${PROVIDER_EMAIL}
  Review ID:      ${reviewId.slice(0, 8)}…
  Respond button: ✓ visible before response
  Form opened:    ✓ respond-form-* with textarea + submit
  Response text:  ✓ "${RESPONSE_TEXT.substring(0, 40)}…"
  Submitted:      ✓ PATCH /respond → ${patchStatus}
  Form dismissed: ✓ respond-form gone after submit
  Text visible:   ✓ text-response-* in card
  After reload:   ✓ persists in DB
  Respond hidden: ✓ button gone once response exists`);
});
