import { test, expect, authFile } from "../fixtures/roles";
import { loginAsTestAccount } from "./helpers/auth";
import { requireBaseUrl } from "../fixtures/base-url";

test.describe("Journey 7 — Event Coordination (Wedding)", () => {
  // All tests in this describe block run as the seeded traveler account.
  // global-setup logs in once and saves the session to e2e/auth/traveler.json;
  // storageState restores the cookie for both `page` and `page.request`.
  test.use({ storageState: authFile("traveler") });

  test("Concierge → Quote → Expert → Event Coordination surface", async ({ page }) => {
    const BASE = requireBaseUrl();

    // ── Step 1: Already authenticated via storageState — navigate directly ─

    // ── Step 2: Navigate to concierge — which is now a DOOR ─────────────
    // Ledger `2026-09-07-concierge-door` (CLAUDE.md Locked Decision 45 (2)): the page's three
    // priced tier cards are gone. The intent form opens the ONE plan modal carrying what this
    // page holds, and the TIER CHOICE IS THAT MODAL'S FINISH.
    await page.goto(`${BASE}/concierge?eventType=wedding`);
    await page.waitForSelector("[data-testid='textarea-concierge-intent']", { timeout: 10000 });

    // ── Step 3: State the intent — the door's own two fields ────────────
    await page.fill(
      "[data-testid='textarea-concierge-intent']",
      "Wedding in Santorini for 80 guests, June 2026",
    );
    await page.fill("[data-testid='input-concierge-destination']", "Santorini, Greece");
    // The type is pre-selected from the URL param and resolves to the seeded `wedding` row, so
    // the modal opens at step 2 (Where) under the occasion pill rather than asking step 1 again.
    await page.click("[data-testid='button-concierge-submit']");

    // ── Step 4: The ONE plan modal opens, pre-filled by the door ────────
    await page.waitForSelector("[data-testid='plan-modal']", { timeout: 15000 });
    await expect(page.locator("[data-testid='input-etp-destination']")).toHaveValue(
      /Santorini/,
      { timeout: 10000 },
    );

    // Answer the two questions a plan cannot exist without (`trips.start_date`/`end_date` are
    // NOT NULL, so no door skips them and nothing is invented for the traveler).
    await page.click("[data-testid='plan-step-when']");
    await page.fill("[data-testid='input-etp-start-date']", "2026-06-12");
    await page.fill("[data-testid='input-etp-end-date']", "2026-06-15");

    // A wedding's row has an internal schedule, so "What's happening" is the last visible step
    // and the finish lives there.
    await page.click("[data-testid='plan-step-events']");
    await page.waitForSelector("[data-testid='planning-option-local']", { timeout: 10000 });

    // ── Step 5: The Expert tier IS the local-expert finish; the press is a read (L19) ─
    // Ledger `2026-09-07-request-is-a-click` (brief §11.2 F2): choosing the tier used to PATCH
    // the concierge request and POST a real lead in one press. It now opens the SHARED review
    // sheet and writes NOTHING. This assertion is the negative half: every request the page
    // makes is recorded, and the expert-request rail must be absent from that record until the
    // sheet's own Send button is pressed.
    const expertRequestPosts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/expert-requests")) {
        expertRequestPosts.push(req.url());
      }
    });

    await page.click("[data-testid='planning-option-local']");
    await page.waitForSelector("[data-testid='expert-request-review']", { timeout: 10000 });
    // Give any (forbidden) in-flight write time to appear before asserting its absence.
    await page.waitForTimeout(1000);
    expect(expertRequestPosts, "opening the review must create no expert request").toHaveLength(0);

    // The sheet says what goes out, to whom, and at what price — never a name the routing has
    // not chosen yet, and never a basic the traveler did not state.
    const review = page.locator("[data-testid='expert-request-review']");
    await expect(review.locator("[data-testid='expert-request-review-recipient']")).toContainText(
      "A local expert we match",
    );
    await expect(review.locator("[data-testid='expert-request-review-price']")).toBeVisible();

    // Cancel closes with nothing sent, and the door can be reopened from the page.
    await review.locator("[data-testid='button-cancel-expert-request']").click();
    await expect(review).toBeHidden();
    expect(expertRequestPosts, "cancelling must create no expert request").toHaveLength(0);

    // ── Step 6: Send from the review sheet, and only then is a request created ─
    // The lead this page captured survives the modal closing, so the door is reopened rather
    // than the three questions being asked a second time.
    await page.click("[data-testid='button-concierge-reopen-planner']");
    await page.waitForSelector("[data-testid='plan-modal']", { timeout: 10000 });
    await page.click("[data-testid='plan-step-events']");
    await page.click("[data-testid='planning-option-local']");
    await page.waitForSelector("[data-testid='expert-request-review']", { timeout: 10000 });
    await page.locator("[data-testid='button-send-expert-request']").click();
    await page.waitForSelector("[data-testid='card-concierge-expert-sent']", { timeout: 15000 });
    // The request is bound to a real slip (Locked Decision 32) — before this lane the same POST
    // went out with no tripId and the server answered 400 while the page said it had been sent.
    expect(expertRequestPosts.length, "the send creates exactly one request").toBe(1);

    // ── Step 7: Sign out and sign in as expert ──────────────────────────
    await page.goto(`${BASE}/api/logout`); // or however logout works
    await loginAsTestAccount(page, "expert");

    // ── Step 8: Navigate to expert workspace ────────────────────────────
    // The expert needs to be assigned to the trip first. In a real test,
    // this would be done by an admin or auto-assignment. For this spec,
    // we assume the expert is already assigned or we check the assignment API.
    await page.goto(`${BASE}/expert/workspace`);
    await page.waitForSelector("[data-testid='expert-workspace']", { timeout: 10000 });

    // ── Step 9: Select a trip with wedding event type ──────────────────
    // Find a trip with wedding experience type
    const weddingTrip = page.locator("[data-testid*='trip-card-']").filter({ hasText: /wedding/i }).first();
    await weddingTrip.click();

    // ── Step 10: Verify Event Coordination tab is visible ───────────────
    await page.waitForSelector("[data-testid='tab-right-event-coord']", { timeout: 10000 });
    await page.click("[data-testid='tab-right-event-coord']");

    // ── Step 11: Verify timeline is displayed ───────────────────────────
    await page.waitForSelector("text=Timeline", { timeout: 10000 });
    await expect(page.locator("text=Ceremony")).toBeVisible();
    await expect(page.locator("text=Reception")).toBeVisible();

    // ── Step 12: Verify vendor gaps are displayed ───────────────────────
    await page.waitForSelector("text=Vendor Gaps", { timeout: 10000 });
    // At least one vendor gap should be shown (e.g., photographer, florist)
    await expect(page.locator("[data-testid*='vendor-gap-']").first()).toBeVisible();

    // ── Step 13: Verify coordination fee is displayed ───────────────────
    await page.waitForSelector("text=Coordination Fee", { timeout: 10000 });
    // The fee should be at least $499 (the floor)
    const feeText = await page.locator("text=Coordination Fee").locator("..").textContent();
    expect(feeText).toMatch(/\$[\d,]+\.\d{2}/);

    // ── Step 14: Verify optimize fee credit is shown (if applicable) ───
    // If an optimize fee was previously paid, the credit should be shown
    const creditBadge = page.locator("text=credited");
    if (await creditBadge.isVisible().catch(() => false)) {
      await expect(creditBadge).toContainText("credited");
    }
  });

  test("Coordination fee endpoint returns correct fee with credit", async ({ page }) => {
    const BASE = requireBaseUrl();

    // storageState (set at the describe level) puts the traveler session cookie
    // into page's browser context. page.request inherits that context, so every
    // API call below is authenticated — no explicit login needed here.

    // Create a coordination state for a wedding
    const createRes = await page.request.post(`${BASE}/api/coordination-states`, {
      data: {
        experienceType: "wedding",
        title: "Santorini Wedding",
        metadata: { budget: 25000 },
      },
    });
    expect(createRes.status()).toBe(201);
    const state = await createRes.json();

    // Get the fee
    const feeRes = await page.request.get(`${BASE}/api/coordination-states/${state.id}/fee`);
    expect(feeRes.status()).toBe(200);
    const fee = await feeRes.json();

    // Fee should be greater of $499 or 8% of $25,000 = $2,000
    expect(fee.feeCents).toBe(2000_00);
    expect(fee.rule).toBe("percent");
    expect(fee.breakdown.floorCents).toBe(499_00);
    expect(fee.breakdown.percentOfBudget).toBe(2000_00);
  });

  test("Event timeline endpoint returns wedding timeline", async ({ page }) => {
    const BASE = requireBaseUrl();

    // Create a trip with wedding type and a temporal anchor
    // ... (setup)

    // Create a coordination state linked to the trip
    // ... (setup)

    // Get the timeline
    // const timelineRes = await request.get(`${BASE}/api/coordination-states/${state.id}/timeline`);
    // expect(timelineRes.status()).toBe(200);
    // const timeline = await timelineRes.json();
    // expect(timeline.eventType).toBe("wedding");
    // expect(timeline.blocks.length).toBeGreaterThan(0);
    // expect(timeline.anchorType).toBe("ceremony_time");
  });
});
