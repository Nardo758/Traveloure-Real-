/**
 * matrix-lane: Persona Lane B — journey-guest
 *
 * Signed-out browser context browsing Kyoto supply. Governing docs:
 * docs/testing/PERSONA_LANE_B_HANDOFF.md ("journey-guest.spec.ts"), PERSONA_JOURNEYS.md.
 *
 * Runs AFTER the supply suites (supply-expert / supply-provider) so there is real Kyoto
 * inventory to browse — but is otherwise independent of any persona (no login here at all).
 *
 * FINDING (client/src/pages/discover.tsx handleAddToCart): a signed-out "Add to trip" click does
 * NOT itself pop a sign-in prompt — it saves the pick into a per-browser guest cart
 * (saveToGuestCart) so a guest never loses a selection mid-browse. The sign-in prompt
 * (data-testid="banner-guest-nudge" / "button-sign-in-nudge") surfaces on /cart once that guest
 * cart has items, and opens SignInModal (data-testid="modal-sign-in"). This spec asserts the
 * ACTUAL two-step contract rather than a guessed single-step one, per the handoff's own
 * selector-notes instruction to inspect the rendered page before asserting.
 */
import { test, expect } from "@playwright/test";
import { BASE_URL, closePool, KYOTO, checkpoint, JourneyReport } from "./_persona-helpers";

test.setTimeout(120_000);

test.afterAll(async () => {
  await closePool();
});

test.describe("journey-guest — signed-out browse + protected-action boundary", () => {
  test("guest can browse Kyoto supply; a protected action prompts sign-in without a 500; browsing continues after dismissal", async ({ browser }) => {
    const report = new JourneyReport("journey-guest");
    // Explicit clean, signed-out context — never the shared authenticated `page` fixture.
    const context = await browser.newContext();
    const page = await context.newPage();

    const serverErrors: string[] = [];
    page.on("response", (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
    });

    // ── Step 2-3: open the Kyoto discover/feed route, assert public content ─────────────────
    await page.goto(`${BASE_URL}/discover/location/${encodeURIComponent(KYOTO)}`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-guest-discover-kyoto");

    const title = page.getByTestId("text-page-title");
    const titleVisible = await title.isVisible().catch(() => false);
    const serviceCards = page.locator('[data-testid^="card-service-"]');
    const expertCards = page.locator('[data-testid^="card-expert-"]');
    const serviceCount = await serviceCards.count().catch(() => 0);
    const expertCount = await expertCards.count().catch(() => 0);
    report.record({
      action: "open Kyoto discover/feed route, assert public content is visible",
      ui: `text-page-title visible=${titleVisible}, card-service-* count=${serviceCount}, card-expert-* count=${expertCount}`,
      db: "n/a (public read)",
      verdict: titleVisible ? "PASS" : "FAIL",
      note: serviceCount + expertCount === 0 ? "no cards rendered — supply suites may not have run first" : undefined,
    });

    // ── Step 4: attempt a protected action (add to trip) as a signed-out visitor ─────────────
    const addToCartBtn = page.locator('[data-testid^="button-add-to-cart-"]').first();
    const addBtnVisible = await addToCartBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    if (addBtnVisible) {
      await addToCartBtn.click();
      await page.waitForTimeout(500);
    }
    report.record({
      action: "attempt the protected add-to-cart action while signed out",
      ui: addBtnVisible ? "clicked button-add-to-cart-* (guest cart save, client-local — see file header)" : "no add-to-cart CTA found on this page",
      db: "n/a",
      verdict: addBtnVisible ? "PASS" : "UNSUPPORTED",
      note: addBtnVisible ? undefined : "no purchasable card with an add-to-cart CTA was visible; supply suites must run first",
    });

    // ── Step 5: the sign-in prompt appears (on /cart, once the guest cart has an item), and the
    //     browser stays usable after dismissal; no 500 was used as an auth fallback. ──────────
    await page.goto(`${BASE_URL}/cart`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-guest-cart-prompt");

    const nudgeBanner = page.getByTestId("banner-guest-nudge");
    const nudgeVisible = await nudgeBanner.isVisible({ timeout: 10_000 }).catch(() => false);
    let modalOpened = false;
    if (nudgeVisible) {
      await page.getByTestId("button-sign-in-nudge").click();
      modalOpened = await page.getByTestId("modal-sign-in").isVisible({ timeout: 5_000 }).catch(() => false);
      if (modalOpened) await page.keyboard.press("Escape");
    }
    report.record({
      action: "sign-in prompt appears for a guest cart with an item, and can be dismissed",
      ui: `banner-guest-nudge visible=${nudgeVisible}, modal-sign-in opened=${modalOpened}`,
      db: "n/a",
      verdict: addBtnVisible ? (nudgeVisible && modalOpened ? "PASS" : "FAIL") : "UNSUPPORTED",
    });

    // Browser stays usable after dismissal — re-navigate and confirm the page still renders.
    await page.goto(`${BASE_URL}/discover/location/${encodeURIComponent(KYOTO)}`);
    await page.waitForLoadState("networkidle");
    const stillUsable = await page.getByTestId("text-page-title").isVisible().catch(() => false);
    report.record({
      action: "browser remains usable after dismissing the sign-in prompt (re-navigation succeeds)",
      ui: `text-page-title visible after re-navigation=${stillUsable}`,
      db: "n/a",
      verdict: stillUsable ? "PASS" : "FAIL",
    });

    report.record({
      action: "no 500 response was used as an authentication fallback across this journey",
      ui: serverErrors.length === 0 ? "no >=500 responses observed" : `500s observed: ${serverErrors.join(", ")}`,
      db: "n/a",
      verdict: serverErrors.length === 0 ? "PASS" : "FAIL",
    });

    // ── Step 6: no authenticated-only console link or private trip data is present ───────────
    const expertConsoleLink = await page.getByTestId("link-expert-console").isVisible().catch(() => false);
    const providerConsoleLink = await page.getByTestId("link-provider-console").isVisible().catch(() => false);
    report.record({
      action: "no authenticated-only console link is exposed to a signed-out visitor",
      ui: `link-expert-console visible=${expertConsoleLink}, link-provider-console visible=${providerConsoleLink}`,
      db: "n/a",
      verdict: !expertConsoleLink && !providerConsoleLink ? "PASS" : "FAIL",
    });

    await context.close();
    report.write();
    expect(report.hasFailures, `journey-guest had failing steps: ${JSON.stringify(report)}`).toBe(false);
  });
});
