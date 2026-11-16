/**
 * E9 (option A) - a GUEST plan's party ask, in a browser.
 *
 * The unit tests render the panel; this file proves the guest page actually FEEDS it: a guest plan whose
 * occasion is Corporate Retreats must ask ONE "Attendees" field, with no kids field, and the guest page must
 * never reach /api/trips/<id> (it cannot - an unclaimed guest plan is not owner-scoped).
 *
 * The controls and their testids are the ones the passing guest journey already uses
 * (`j-guest-continue.spec.ts:117-120`): slip-meta-ask-party, input-slip-who-adults, button-slip-who-save,
 * slip-who-panel.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const tid = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`);

test("E9: a guest plan's Corporate Retreats asks Attendees only, and never calls /api/trips/<id>", async ({ page }) => {
  test.setTimeout(120_000);
  const tripReads: string[] = [];
  page.on("request", (req) => {
    if (/\/api\/trips\/[^/?]+/.test(req.url())) tripReads.push(req.url());
  });

  await page.goto(`${BASE_URL}/?start=1&step=around`, { waitUntil: "domcontentloaded" });
  await tid(page, "plan-entry-around-place").click({ timeout: 20_000 });
  await tid(page, "plan-entry-city-kyoto").click();

  // Corporate Retreats, the way a traveler reaches it: More specific -> See all occasions.
  await tid(page, "plan-entry-more-specific").click();
  await tid(page, "occasion-see-all").click();
  await tid(page, "option-occasion-corporate-events").click({ timeout: 20_000 });
  await tid(page, "button-plan-entry-start").click();

  await expect(tid(page, "guest-plan")).toBeVisible({ timeout: 25_000 });

  // "Who's coming?" on the guest slip.
  await tid(page, "slip-meta-ask-party").click();
  const panel = tid(page, "slip-who-panel");
  await expect(panel).toBeVisible({ timeout: 15_000 });

  // ONE field, labelled with the occasion's own word, and no kids field.
  await expect(panel).toContainText("Attendees");
  await expect(tid(page, "input-slip-who-adults")).toHaveCount(1);
  await expect(tid(page, "input-slip-who-kids")).toHaveCount(0);

  // The row came from the guest plan's own payload: no /api/trips/<id> was requested on this page.
  expect(tripReads, `trip reads seen: ${tripReads.join(", ")}`).toEqual([]);
});
