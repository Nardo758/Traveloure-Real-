import { test, expect } from "@playwright/test";
import { testid } from "../../../e2e/supply-demand/lib/ui";
import { BASE_URL, closePool, createTrip, registerUser } from "./_journey-helpers";

/**
 * FU-8D-4 — A DIALOG OPENED OVER THE MEMBER MAP RECEIVES THE CLICK (ledger
 * `2026-10-07-map-dialog-isolation`).
 *
 * Leaflet's panes and controls carry z-indexes in the hundreds. Without a stacking context on the
 * map's own wrapper they escape it and draw above a dialog opened over the map, swallowing clicks
 * meant for the dialog. Step 8d found it on the guest map and patched only that page; the fix now
 * lives in `MapControlCenter`'s root, so every mount is covered.
 *
 * The proof: a signed-in owner opens their plan on the MAP view (located stops, so Leaflet draws
 * markers), opens the Finalize dialog from the map band, and every point sampled across the dialog's
 * box hit-tests to an element INSIDE the dialog — then the dialog's own button is clicked.
 *
 * Runs with no Google key (Leaflet), as CI does. Run solo:
 *   npx playwright test playwright/tests/journeys/j-map-dialog-click.spec.ts --project=chromium
 */

test.afterAll(async () => {
  await closePool();
});

test("FU-8D-4 — a dialog over the member map receives the click everywhere on its box", async ({ page }) => {
  test.setTimeout(60_000);
  await registerUser(page.request, "map-dialog", "Map", "Dialog");
  const tripId = await createTrip(page.request, `Map dialog ${Date.now()}`, "Kyoto, Japan");
  // Two located stops on day 1, so the map centres on them and draws markers.
  for (const [title, lat, lng] of [
    ["Nanzen-ji", "35.0110", "135.7940"],
    ["Kiyomizu-dera", "34.9949", "135.7850"],
  ] as const) {
    const res = await page.request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
      data: { title, dayNumber: 1, latitude: lat, longitude: lng, locationName: title },
    });
    expect([200, 201], await res.text()).toContain(res.status());
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/plans/${tripId}?view=map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".leaflet-marker-icon, .leaflet-interactive").first()).toBeVisible({ timeout: 15_000 });

  // The map band's Finalize opens the chooser dialog over the map.
  await testid(page, "map-band").getByTestId("slip-action-finalize-plan").click();
  const dialog = testid(page, "finalize-modal");
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // Every sampled point of the dialog's box hit-tests to the dialog, never to the map beneath it.
  // Let the dialog's open animation settle, then read its box.
  await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0, { timeout: 10_000 }).toBeGreaterThan(100);
  await page.waitForTimeout(400);
  const box = (await dialog.boundingBox())!;
  const misses = await page.evaluate(
    ({ x, y, w, h }) => {
      const out: string[] = [];
      const dlg = document.querySelector('[data-testid="finalize-modal"]');
      for (let i = 1; i < 10; i++) {
        for (let j = 1; j < 10; j++) {
          const px = x + (w * i) / 10;
          const py = y + (h * j) / 10;
          if (py >= window.innerHeight || px >= window.innerWidth) continue;
          const el = document.elementFromPoint(px, py);
          if (!el || !dlg || !dlg.contains(el)) out.push(`${Math.round(px)},${Math.round(py)} → ${el?.getAttribute("class") || el?.tagName}`);
        }
      }
      return out;
    },
    { x: box.x, y: box.y, w: box.width, h: box.height },
  );
  expect(misses, "points of the dialog that a map element covers").toEqual([]);

  // And the dialog's own control takes the click.
  await testid(page, "finalize-back").click();
  await expect(dialog).toHaveCount(0);
});
