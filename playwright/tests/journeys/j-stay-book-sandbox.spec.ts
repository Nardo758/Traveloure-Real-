import { test, expect } from "@playwright/test";
import { BASE_URL, uid } from "./_journey-helpers";

/**
 * S1-d-3b — the LiteAPI SANDBOX book-and-cancel (ledger `2026-10-11-s1-d3b-stay-book-ui`; S1-d-3 rulings).
 * Re-proves in CI the field names the founder's Oct 9 sandbox run verified (d-3a).
 *
 * RULES OF THIS TEST (ruled): sandbox only, a QA-domain account only, and the booking is cancelled
 * IMMEDIATELY. It never runs against production (the server refuses every booking step outside sandbox,
 * `liteapiBookingEnabled`), and the production smoke clicks nothing priced.
 *
 * WHAT IT DRIVES, AND WHAT IT DOES NOT (§18d):
 *   · UI: the stay's item sheet draws "Book"; the server's re-quoted price is shown BEFORE the SDK opens;
 *     "Continue to payment" mounts Nuitée's Payment SDK in the dialog.
 *   · It does NOT type a card into Nuitée's SDK — its fields are Nuitée's, not ours. The book step is then
 *     sent through our own rail with the sandbox transaction id. If sandbox ever requires the card step to
 *     complete first, the book step fails here and says so (a `failed` state), rather than passing.
 *   · Then the slip's existing booking line reads "booked · #<code>", and the immediate cancel clears it.
 *
 * Skipped unless LITEAPI_SANDBOX_E2E=1 (the job sets it only when the sandbox key is configured).
 */
const QA_DOMAIN = process.env.QA_ACCOUNT_EMAIL_DOMAIN ?? "";
const ON = process.env.LITEAPI_SANDBOX_E2E === "1";

test.describe("stay booking — LiteAPI sandbox book then immediate cancel", () => {
  test.skip(!ON, "LITEAPI_SANDBOX_E2E is not set — the sandbox key is not configured for this run");
  test.setTimeout(10 * 60_000);

  test("Book shows the server's price, books in sandbox, and is cancelled at once", async ({ page }) => {
    expect(QA_DOMAIN, "QA_ACCOUNT_EMAIL_DOMAIN must be set — QA accounts only").not.toBe("");
    const api = page.request;
    const email = `stay-book-${uid()}@${QA_DOMAIN}`;
    const reg = await api.post(`${BASE_URL}/api/auth/register`, {
      data: { email, password: process.env.E2E_TEST_PASSWORD || "TestPass123!", firstName: "Sandbox", lastName: "Traveler", userType: "user" },
    });
    expect(reg.status(), await reg.text()).toBe(201);

    // A Kyoto plan with chosen dates (the owner's re-date rail stamps them confirmed) and two adults.
    const start = new Date(Date.now() + 60 * 86_400_000);
    const end = new Date(start.getTime() + 86_400_000);
    const d = (x: Date) => x.toISOString().slice(0, 10);
    const trip = await api.post(`${BASE_URL}/api/trips`, { data: { title: "Sandbox stay", destination: "Kyoto, Japan", startDate: d(start), endDate: d(end) } });
    expect(trip.status(), await trip.text()).toBe(201);
    const tripId = (await trip.json()).id as string;
    const redate = await api.patch(`${BASE_URL}/api/trips/${tripId}`, { data: { startDate: d(start), endDate: d(end) } });
    expect(redate.ok(), await redate.text()).toBeTruthy();
    const party = await api.patch(`${BASE_URL}/api/trips/${tripId}/occasion`, { data: { adults: 2 } });
    expect(party.ok(), await party.text()).toBeTruthy();

    // The stay item, its option set, and a chosen LiteAPI hotel (the job ran the Kyoto static sync first).
    const item = await api.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, { data: { title: "Hotel", dayNumber: 1, type: "accommodation" } });
    expect(item.status(), await item.text()).toBe(201);
    const itemId = (await item.json()).id as string;
    const set = await api.post(`${BASE_URL}/api/trips/${tripId}/option-sets`, { data: { itineraryItemId: itemId, categoryKey: "accommodation", label: "Where to stay" } });
    expect(set.status(), await set.text()).toBe(201);
    const setId = (await set.json()).set.id as string;
    const search = await api.get(`${BASE_URL}/api/trips/${tripId}/option-sets/search?q=`);
    expect(search.ok(), await search.text()).toBeTruthy();
    const hotels = (await search.json()).results as Array<{ id: string; name: string }>;
    expect(hotels.length, "the Kyoto LiteAPI sync gave the plan's city hotels").toBeGreaterThan(0);

    // Try hotels in order until the SERVER says one is bookable and prices it (sandbox availability varies).
    let priced = false;
    for (const h of hotels.slice(0, 8)) {
      const opt = await api.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/options`, { data: { source: { kind: "hotel_cache", hotelCacheId: h.id } } });
      if (!opt.ok()) continue;
      const optionId = (await opt.json()).option.id as string;
      const chose = await api.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/choose`, { data: { optionId } });
      if (!chose.ok()) continue;
      const view = await (await api.get(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/stay-booking`)).json();
      if (!view.bookable) continue;

      await page.goto(`${BASE_URL}/plans/${tripId}`);
      await page.getByTestId(`slip-item-name-${itemId}`).first().click();
      const book = page.getByTestId(`item-sheet-stay-book-${itemId}`);
      await expect(book).toBeVisible();
      const prebook = page.waitForResponse((r) => r.url().endsWith(`/items/${itemId}/stay-booking/prebook`));
      await book.click();
      const pre = await (await prebook).json();
      if (pre.state !== "prebooked") {
        await expect(page.getByTestId(`stay-book-refusal-${itemId}`)).toBeVisible();
        await page.keyboard.press("Escape");
        continue;
      }
      // The price shown is the server's, before the SDK opens.
      await expect(page.getByTestId(`stay-book-price-${itemId}`)).toBeVisible();
      expect(pre.env).toBe("sandbox");
      await page.getByTestId(`stay-book-continue-${itemId}`).click();
      await expect(page.getByTestId(`stay-book-sdk-${itemId}`).locator("*").first()).toBeAttached({ timeout: 30_000 });
      priced = true;
      break;
    }
    expect(priced, "a Kyoto sandbox hotel priced the plan's dates").toBe(true);

    // Book through our rail (TRANSACTION_ID only — the server builds the body), then cancel at once.
    const booked = await (await api.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/stay-booking/book`, { data: {} })).json();
    try {
      expect(booked.state, JSON.stringify(booked)).toBe("confirmed");
      expect(typeof booked.hotelConfirmationCode === "string" || booked.hotelConfirmationCode === null).toBe(true);
      await page.goto(`${BASE_URL}/plans/${tripId}`);
      if (booked.hotelConfirmationCode) await expect(page.getByText(`booked · #${booked.hotelConfirmationCode}`).first()).toBeVisible();
    } finally {
      if (booked.state === "confirmed" || booked.state === "pending") {
        const cancelled = await (await api.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/stay-booking/cancel`, { data: {} })).json();
        expect(cancelled.state, JSON.stringify(cancelled)).toBe("cancelled");
      }
    }
    const after = await (await api.get(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/stay-booking`)).json();
    expect(after.booking.status).toBe("cancelled");
  });
});
