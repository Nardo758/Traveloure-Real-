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

  // The guest plan is made through the same endpoint the entry uses, with the occasion on it: this gate runs
  // the app in WAITLIST mode, where the entry's Start does not mint a claimable guest plan and the slip below
  // never appears. The occasion slug is stored on the plan and is exactly what the guest resolver reads
  // (`plan.occasionSlug` -> resolveOccasionForPlan), so the wiring under test is unchanged.
  const made = await page.request.post("/api/guest-plans", {
    data: { destination: "Kyoto, Japan", title: "Kyoto corporate retreat", occasionSlug: "corporate-events" },
  });
  expect(made.ok(), `guest plan create answered ${made.status()}`).toBe(true);
  await page.goto(`${BASE_URL}/plans/new`, { waitUntil: "domcontentloaded" });
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
