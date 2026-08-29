/**
 * matrix-lane: Persona Lane B — journey-guest
 *
 * Signed-out browser context browsing Kyoto supply. Governing docs:
 * docs/testing/PERSONA_LANE_B_HANDOFF.md ("journey-guest.spec.ts"), PERSONA_JOURNEYS.md.
 *
 * Runs AFTER the supply suites (supply-expert / supply-provider) so there is real Kyoto
 * inventory to browse — but is otherwise independent of any persona (no login here at all).
 *
 * TWO REAL PAGES, TWO REAL SELECTOR SETS (found by the Aug 29 persona-nightly proof run —
 * step 1 asserted `text-page-title`/`card-service-*` against a page that has neither):
 *   - `/discover/location/:city` renders `client/src/pages/discover-location.tsx`, the
 *     Kyoto-SCOPED city feed. Its real testids: `text-city-name` (title), `card-expert-*` (via
 *     the shared ExpertCard component — proven working), `feed-card-vendor-svc-*` (provider
 *     services, via CityFeedCardVendorService, add button `btn-add-svc-*`), and
 *     `feed-card-package-*` (ready-made trips, via FeedReadyMadeCard). It has NO
 *     `text-page-title` and NO `card-service-*`/`button-add-to-cart-*` — those belong to the
 *     OTHER page below.
 *   - `/services` renders `client/src/pages/discover.tsx`'s "services" marketplace surface
 *     (SURFACE_META.services). Its real testids: `text-page-title` (title), `card-service-*`
 *     (every approved+active service, unfiltered by default — no city/location matching at
 *     all), `button-add-to-cart-*`. It has NO expert cards on this surface.
 *   No single page renders both card-expert-* and card-service-*, so this spec browses BOTH
 *   pages: the city feed for the Kyoto-scoped expert + ready-made proof, and /services for the
 *   two NAMED provider services (by exact name — decoupled from the city feed's location-match
 *   predicate, see the FINDING below) and the button-add-to-cart-* protected action the handoff
 *   names literally.
 *
 * FINDING (open, not fabricated as fact — logged, non-blocking): the city feed's service match
 * (server/services/location-view.service.ts) is `city === cityName OR (city IS NULL AND
 * location ILIKE '%cityName%')`. supply-provider.spec.ts's two services use delivery method
 * "call" (deliberately, to skip the meeting-point flow), and nothing in this lane's
 * ServiceForm driver fills a city/location field for a call-only listing — so
 * provider_services.city/location plausibly stay NULL/empty for them, which would mean they
 * do NOT match the Kyoto city feed's predicate even though they are genuinely Kyoto supply
 * (their owner's service_provider_forms.city = 'Kyoto'). This spec checks for their
 * feed-card-vendor-svc-* presence on the city feed and records the actual result rather than
 * assuming either way — a miss there is a supply-visibility candidate for a follow-up, not
 * something this spec quietly works around.
 *
 * FINDING (client/src/pages/discover.tsx handleAddToCart, /services surface): a signed-out
 * "Add to trip" click does NOT itself pop a sign-in prompt — it saves the pick into a
 * per-browser guest cart (saveToGuestCart) so a guest never loses a selection mid-browse. The
 * sign-in prompt (data-testid="banner-guest-nudge" / "button-sign-in-nudge") surfaces on /cart
 * once that guest cart has items, and opens SignInModal (data-testid="modal-sign-in"). This
 * spec asserts the ACTUAL two-step contract rather than a guessed single-step one.
 */
import { test, expect } from "@playwright/test";
import { BASE_URL, rows, closePool, KYOTO, checkpoint, JourneyReport } from "./_persona-helpers";

test.setTimeout(120_000);

const PROVIDER_SERVICE_NAMES = ["Kyoto Portrait Route Planning Call", "Gion Photo Session Preparation Call"] as const;

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

    // ── Step 2-3a: the Kyoto-SCOPED city feed — real title + expert cards + ready-made ───────
    await page.goto(`${BASE_URL}/discover/location/${encodeURIComponent(KYOTO)}`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-guest-discover-kyoto");

    const cityTitle = page.getByTestId("text-city-name");
    const cityTitleVisible = await cityTitle.isVisible().catch(() => false);
    const expertCards = page.locator('[data-testid^="card-expert-"]');
    const expertCount = await expertCards.count().catch(() => 0);
    const readyMadeCards = page.locator('[data-testid^="feed-card-package-"]');
    const readyMadeCount = await readyMadeCards.count().catch(() => 0);
    report.record({
      action: "open the Kyoto-scoped city feed, assert public expert + ready-made content is visible",
      ui: `text-city-name visible=${cityTitleVisible}, card-expert-* count=${expertCount}, feed-card-package-* count=${readyMadeCount}`,
      db: "n/a (public read)",
      verdict: cityTitleVisible && expertCount > 0 ? "PASS" : "FAIL",
      note: readyMadeCount === 0 ? "no ready-made card on the city feed — supply-expert must run first, or see the DEEPER finding below" : undefined,
    });

    // Open finding, not asserted as pass/fail either way — see the file header FINDING.
    const vendorServiceCards = page.locator('[data-testid^="feed-card-vendor-svc-"]');
    const vendorServiceCount = await vendorServiceCards.count().catch(() => 0);
    report.record({
      action: "OPEN FINDING: do the two named provider services surface on the Kyoto city feed?",
      ui: `feed-card-vendor-svc-* count=${vendorServiceCount}`,
      db: "n/a",
      verdict: vendorServiceCount > 0 ? "PASS" : "UNSUPPORTED",
      note:
        vendorServiceCount > 0
          ? undefined
          : "0 vendor-service tiles on the city feed — consistent with the city-feed location-match " +
            "predicate (server/services/location-view.service.ts) requiring provider_services.city= " +
            "'Kyoto' OR location ILIKE '%Kyoto%', neither of which this lane's call-delivery service " +
            "fixtures set. Recorded as an open supply-visibility finding, not asserted as a defect — " +
            "the same services ARE proven publicly visible on /services below.",
    });

    // ── Step 3b: /services — real title + the two NAMED services + the protected action ──────
    // ONE row per name (name-scoped, retry-safe — same reasoning as supply-provider.spec.ts's
    // owned-service assertion: nothing deletes a prior failed Playwright retry's duplicate
    // rows, so a raw row/name-pair count is not what "both named services exist" means here).
    const svcRowsAll = await rows<{ id: string; service_name: string }>(
      `SELECT id, service_name FROM provider_services
       WHERE service_name = ANY($1::text[]) AND approval_status = 'approved' AND status = 'active'
       ORDER BY created_at DESC`,
      [PROVIDER_SERVICE_NAMES as unknown as string[]],
    );
    const svcRows = PROVIDER_SERVICE_NAMES.map((name) => svcRowsAll.find((r) => r.service_name === name)).filter(
      (r): r is { id: string; service_name: string } => Boolean(r),
    );
    await page.goto(`${BASE_URL}/services`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-guest-services-surface");

    const servicesTitle = page.getByTestId("text-page-title");
    const servicesTitleVisible = await servicesTitle.isVisible().catch(() => false);
    // Run #7 finding: the unfiltered /services browse defaults to sortBy=rating with a
    // 12-row page (client/src/pages/discover.tsx `limit = 12`), and by the time the supply
    // suites finish, the marketplace already carries ~35 OTHER approved+active
    // provider_services rows from server-startup seeding (8 "mock provider services" +
    // 27 Phase D Kyoto wedding/corporate vendors — server/index.ts runDatabaseSeeding, logged
    // "[Phase D] Vendors: 9 inserted... Services: 27 inserted" before the persona seed even
    // runs), all with real ratings/bookingsCount. The two brand-new named fixtures (rating=0,
    // bookings=0) land on a bare id-ASC tiebreak against that whole set for one of 12 page-1
    // slots — not reliably won (confirmed: run #7 hit the FULL 10s `waitFor` timeout on one
    // name, not a quick catch, so this was never the run #6 render-race theory; the row
    // genuinely isn't on page 1 of the default sort). A guest who wants a SPECIFIC service
    // searches for it by name — the page's own search box, `?q=` addressable per its "restore
    // the same result set" contract (line ~816 above) — rather than scrolling blind pages, so
    // this checks each named service through that real search path instead of the bare browse.
    let namedCardsVisible = 0;
    for (const svc of svcRows) {
      await page.goto(`${BASE_URL}/services?q=${encodeURIComponent(svc.service_name)}`);
      await page.waitForLoadState("networkidle");
      if (
        await page
          .getByTestId(`card-service-${svc.id}`)
          .waitFor({ state: "visible", timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        namedCardsVisible++;
      }
    }
    report.record({
      action: "open /services, assert the two named provider services are publicly visible (by name search)",
      ui: `text-page-title visible=${servicesTitleVisible}, named card-service-* visible=${namedCardsVisible}/${PROVIDER_SERVICE_NAMES.length}`,
      db: `names found=${svcRows.length}/${PROVIDER_SERVICE_NAMES.length} (${svcRows.map((s) => s.service_name).join(", ")})`,
      verdict: servicesTitleVisible && svcRows.length === PROVIDER_SERVICE_NAMES.length && namedCardsVisible === PROVIDER_SERVICE_NAMES.length ? "PASS" : "FAIL",
      note: svcRows.length < PROVIDER_SERVICE_NAMES.length ? "one or both named services missing/not approved+active — supply-provider.spec.ts must run first" : undefined,
    });

    // ── Step 4: attempt a protected action (add to trip) as a signed-out visitor ─────────────
    // Re-scope to the first named service's own search result — the loop above leaves the page
    // on whichever name it last searched, which is not necessarily this one.
    const targetId = svcRows[0]?.id;
    if (targetId) {
      await page.goto(`${BASE_URL}/services?q=${encodeURIComponent(svcRows[0].service_name)}`);
      await page.waitForLoadState("networkidle");
    }
    const addToCartBtn = targetId
      ? page.getByTestId(`button-add-to-cart-${targetId}`)
      : page.locator('[data-testid^="button-add-to-cart-"]').first();
    const addBtnVisible = await addToCartBtn
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (addBtnVisible) {
      await addToCartBtn.click();
      await page.waitForTimeout(500);
    }
    report.record({
      action: "attempt the protected add-to-cart action while signed out",
      ui: addBtnVisible ? "clicked button-add-to-cart-* (guest cart save, client-local — see file header)" : "no add-to-cart CTA found on this page",
      db: "n/a",
      verdict: addBtnVisible ? "PASS" : "UNSUPPORTED",
      note: addBtnVisible ? undefined : "no purchasable card with an add-to-cart CTA was visible; supply-provider.spec.ts must run first",
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
    const stillUsable = await page.getByTestId("text-city-name").isVisible().catch(() => false);
    report.record({
      action: "browser remains usable after dismissing the sign-in prompt (re-navigation succeeds)",
      ui: `text-city-name visible after re-navigation=${stillUsable}`,
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
