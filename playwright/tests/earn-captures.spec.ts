/**
 * earn-captures.spec.ts — Lane 2 (Experts & Services earn-grammar) visual capture.
 *
 * NOT a behavioral gate. This spec drives the public Experts & Services surfaces at
 * a fixed 1280px desktop viewport (and 375px for mobile nav) and writes full-page
 * PNG screenshots to `playwright/earn-captures/`. The discover-tabs-gate workflow
 * runs it after the behavioral suite and uploads the directory as the CI artifact
 * `earn-captures-<sha>` — the ROOTPREVIEW evidence the lane reviews each phase, so a
 * merge never depends on a hand-run Replit preview.
 *
 * Captures (spec §3.7–3.11 + the FIND HELP nav):
 *   1. /experts?role=local_expert            (Lamp masthead)
 *   2. /experts?role=travel_expert           (Waypoints masthead)
 *   3. /experts?role=event_planner           (Wine masthead — seeds have 0, so this
 *                                              captures the empty state, a real proof)
 *   4. first /experts/:id                    (open-card profile)
 *   5. /s/kansai-bizlang                      (storefront money page)
 *   6. /providers                             (Service Providers directory)
 *   7. desktop nav, FIND HELP dropdown open  (leaf icons from NAV_LEAF_ICONS)
 *   8. mobile nav (375px), menu open          (same icon source, mobile sheet)
 *
 * Resilience: captures are evidence, not assertions. Each capture navigates, settles,
 * and screenshots; a navigation hiccup fails only its own capture, and the workflow
 * step is non-blocking (continue-on-error) so the authoritative behavioral gate stays
 * discover-tabs-smoke. All surfaces are public — no auth setup.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "playwright", "earn-captures");
const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 375, height: 812 };

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

/** Navigate + let the API-heavy surfaces settle, tolerating slow networkidle. */
async function settle(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  // A short beat for card grids / hero images to paint before the shot.
  await page.waitForTimeout(1_200);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
}

test.describe("earn-grammar captures", () => {
  test.use({ viewport: DESKTOP });

  for (const role of ["local_expert", "travel_expert", "event_planner"] as const) {
    test(`experts — ${role}`, async ({ page }) => {
      await settle(page, `/experts?role=${role}`);
      await shot(page, `experts-${role}`);
    });
  }

  test("expert detail — first expert", async ({ page, request }) => {
    // Resolve a real expert id from the public API; skip honestly if the seed has none.
    let id: string | null = null;
    try {
      const res = await request.get("/api/experts");
      if (res.ok()) {
        const rows = (await res.json()) as Array<{ id?: string }>;
        id = rows.find((r) => r?.id)?.id ?? null;
      }
    } catch {
      /* fall through to skip */
    }
    test.skip(!id, "no experts in seed data");
    await settle(page, `/experts/${id}`);
    await shot(page, "expert-detail");
  });

  test("storefront — kansai-bizlang", async ({ page }) => {
    await settle(page, "/s/kansai-bizlang");
    await shot(page, "storefront-kansai-bizlang");
  });

  test("providers directory", async ({ page }) => {
    await settle(page, "/providers");
    await shot(page, "providers");
  });

  test("desktop nav — FIND HELP dropdown open", async ({ page }) => {
    await settle(page, "/");
    // The "Experts & Services" (FIND HELP) group trigger opens on hover.
    const trigger = page.getByTestId("button-nav-dropdown-experts-&-services");
    await trigger.waitFor({ state: "visible", timeout: 10_000 });
    await trigger.hover();
    // Wait for the dropdown panel (role=menu) to animate in.
    await page.getByRole("menu").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, "nav-desktop-find-help");
  });

  test("mobile nav — menu open", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await settle(page, "/");
    const menuBtn = page.getByTestId("button-mobile-menu");
    await menuBtn.waitFor({ state: "visible", timeout: 10_000 });
    await menuBtn.click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, "nav-mobile-menu");
  });
});
