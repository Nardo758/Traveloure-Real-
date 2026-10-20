/**
 * The J13 generate-then-share proof. Runs only where `E2E_AI_STUB=1` AND `NODE_ENV` is not
 * `production` — the dev-server job boots tsx with `NODE_ENV=development` and `DRAFT_STUB_SERVER=1`.
 * A production bundle ignores the flag. On that server `j13-share.spec.ts` asserts the model
 * failure and proves the share page from a traveler-authored stop.
 *
 * Here the trip generate route returns the canned days, stamps `origin='ai'` items, and the
 * public share page names the stand-in's own activity ("Walk through ${destination}").
 */
import { test, expect, request as pwRequest } from "@playwright/test";
import { BASE_URL, registerUser, createTrip, rows, scalar, closePool } from "./_journey-helpers";

test.beforeEach(() => {
  test.skip(
    process.env.DRAFT_STUB_SERVER !== "1",
    "Successful-draft proofs run only where DRAFT_STUB_SERVER=1 (a non-production server with E2E_AI_STUB=1).",
  );
});

test.afterAll(async () => {
  await closePool();
});

test.setTimeout(180_000);

test.describe("J13 stub — a drafted plan shares", () => {
  test("stub — generate-itinerary writes origin='ai' items and the public share names them", async ({ browser }) => {
    const owner = await pwRequest.newContext();
    await registerUser(owner, "j13-stub-owner", "J13", "StubOwner");
    const destination = "Kyoto, Japan";
    const tripId = await createTrip(owner, "J13 Stub Shared Plan", destination);

    const gen = await owner.post(`${BASE_URL}/api/trips/${tripId}/generate-itinerary`, { data: {} });
    expect([200, 201], `generate-itinerary failed: ${gen.status()} ${await gen.text()}`).toContain(gen.status());

    const genStatus = await scalar<string>(
      `SELECT status FROM generated_itineraries WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tripId],
    );
    expect(genStatus).toBe("generated");

    const walkTitle = `Walk through ${destination}`;
    const aiItems = await rows<{ title: string; origin: string }>(
      `SELECT title, origin FROM itinerary_items WHERE trip_id = $1`,
      [tripId],
    );
    expect(aiItems.length, "the stand-in wrote a stop for each day").toBeGreaterThan(0);
    for (const item of aiItems) expect(item.origin).toBe("ai");
    expect(aiItems.map((item) => item.title)).toContain(walkTitle);

    const shareRes = await owner.post(`${BASE_URL}/api/trips/${tripId}/share`, { data: {} });
    expect(shareRes.status(), await shareRes.text()).toBe(200);
    const token = (await shareRes.json()).shareToken as string;
    expect(token).toBeTruthy();

    const viewer = await pwRequest.newContext();
    const publicApi = await viewer.get(`${BASE_URL}/api/trips/shared/${token}`);
    expect(publicApi.status(), "public share GET must succeed unauthenticated").toBe(200);
    const publicBody = await publicApi.json();
    const sharedTitles = (publicBody.trip.itinerary_data?.days ?? []).flatMap(
      (day: { activities?: Array<{ title?: string }> }) => (day.activities ?? []).map((activity) => activity.title),
    );
    expect(sharedTitles, "the public payload names the stand-in walk").toContain(walkTitle);
    await viewer.dispose();

    const expectedDays = Number(
      await scalar<string>(
        `SELECT count(DISTINCT day_number)::text FROM itinerary_items WHERE trip_id = $1`,
        [tripId],
      ),
    );
    expect(expectedDays).toBeGreaterThan(0);

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(`${BASE_URL}/trips/shared/${token}`, { waitUntil: "domcontentloaded" });
    await expect(viewerPage.getByTestId("banner-shared-view")).toBeVisible({ timeout: 30_000 });
    await expect(viewerPage.getByTestId("shared-day-1")).toBeVisible();
    await expect(viewerPage.getByText(walkTitle).first()).toBeVisible();
    expect(await viewerPage.locator('[data-testid^="shared-day-"]').count()).toBe(expectedDays);
    expect(await viewerPage.getByRole("button", { name: /route|checkout|with expert|ready for/i }).count()).toBe(0);
    await expect(viewerPage.getByTestId("button-plan-own-trip")).toBeVisible();

    const addItemRes = await owner.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
      data: {
        title: "J13 Stub Live-Edit",
        description: "Added after sharing to verify live reflection.",
        itemType: "sightseeing",
        dayNumber: 1,
        startTime: "03:00 PM",
        locationName: "Kyoto station",
        estimatedCost: "12.00",
        status: "planned",
      },
    });
    expect(addItemRes.status(), `add item failed: ${await addItemRes.text()}`).toBe(201);
    await viewerPage.reload({ waitUntil: "domcontentloaded" });
    await expect(viewerPage.getByTestId("banner-shared-view")).toBeVisible({ timeout: 30_000 });
    await expect(viewerPage.getByText("J13 Stub Live-Edit")).toBeVisible();

    await viewerContext.close();
    await owner.dispose();
  });
});
