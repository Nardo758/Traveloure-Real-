import { test, expect, type Page } from "@playwright/test";
import { isAcceptableArrivalLine, isHotelItemTitle } from "../../../shared/draft-basis";
import { actAndAwait, ok2xx, appears, testid } from "../../../e2e/supply-demand/lib/ui";
import { fillPlanEntryToStart, clickPlanStart } from "../../../e2e/supply-demand/lib/flows";
import { BASE_URL, registerUser, createTrip, createItem, rows, closePool } from "./_journey-helpers";

/**
 * The free-draft stand-in proof. Runs only where `E2E_AI_STUB=1` AND `NODE_ENV` is not
 * `production` — the dev-server job boots tsx with `NODE_ENV=development`. A production bundle
 * ignores the flag (ledger `2026-10-20-js1-stub-never-in-production`); those steps live in
 * `j-kyoto-trips-golden-path.spec.ts` and assert the model failure.
 *
 * Assertions are structural. The one prose read ("Explore Kyoto") is the stand-in's own activity
 * name, which is how this file knows it is talking to the stub and not a live model.
 */
const KYOTO = "Kyoto, Japan";

test.beforeEach(() => {
  test.skip(
    process.env.DRAFT_STUB_SERVER !== "1",
    "Successful-draft proofs run only where DRAFT_STUB_SERVER=1 (a non-production server with E2E_AI_STUB=1).",
  );
});

test.afterAll(async () => {
  await closePool();
});

async function signedInTraveler(page: Page, label: string): Promise<{ id: string; email: string }> {
  return registerUser(page.request, `kyoto-stub-${label}`, "Kyoto", label);
}

async function planWithOccasion(page: Page, label: string, slug: string): Promise<string> {
  await signedInTraveler(page, label);
  const tripId = await createTrip(page.request, `Kyoto ${label}`, KYOTO);
  const res = await page.request.patch(`${BASE_URL}/api/trips/${tripId}/occasion`, { data: { experienceSlug: slug } });
  expect(res.status(), `occasion write: ${await res.text()}`).toBe(200);
  return tripId;
}

async function openModalFromHero(page: Page): Promise<void> {
  await page.goto("/");
  const hero = testid(page, "button-plan-trip");
  expect(await appears(hero, 20_000), "the landing hero offers its planning button").toBe(true);
  await hero.click();
  expect(await appears(testid(page, "plan-entry"), 10_000), "PlanEntry opens").toBe(true);
}

test("stub — a new plan's draft lands in that plan and leaves the first plan untouched", async ({ page }) => {
  const traveler = await signedInTraveler(page, "b8");
  await openModalFromHero(page);
  expect(await fillPlanEntryToStart(page, KYOTO, { occasionSlug: "travel", lenDays: 3 })).toBe(true);
  const firstId = await clickPlanStart(page);
  expect(firstId, "the first plan minted and is bound").toBeTruthy();
  await createItem(page.request, firstId!, "Fushimi Inari walk", 1);

  await page.goto("/destinations");
  const card = testid(page, "button-plan-now-kyoto").first();
  expect(await appears(card, 20_000), "the Destinations grid offers Kyoto").toBe(true);
  await card.click();
  await testid(page, "button-plan-now-kyoto").last().click();
  expect(await appears(testid(page, "plan-entry"), 10_000), "PlanEntry opens").toBe(true);
  await expect(testid(page, "plan-entry-summary")).toContainText("Kyoto");
  const year = new Date().getFullYear() + 1;
  await testid(page, "button-plan-entry-back").click();
  await testid(page, "plan-entry-around-date").click();
  await testid(page, "plan-entry-date-pick").click();
  await testid(page, "plan-entry-date-start").fill(`${year}-11-11`);
  await testid(page, "plan-entry-date-end").fill(`${year}-11-14`);
  await testid(page, "button-plan-entry-next").click();
  const secondId = await clickPlanStart(page);
  expect(secondId, "the door made a NEW plan").toBeTruthy();
  expect(secondId).not.toBe(firstId);
  const draft = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/ai/generate-itinerary" && r.request().method() === "POST" && r.status() !== 409,
    { timeout: 60_000 },
  );
  await testid(page, "slip-action-draft-ai").first().click();
  expect(ok2xx((await draft).status()), "the draft is not refused as 'already has items'").toBe(true);

  const plans = await rows<{ id: string }>(`SELECT id FROM trips WHERE user_id = $1`, [traveler.id]);
  expect(plans.length, "the door made a second plan").toBe(2);
  const second = plans.find((p) => p.id !== firstId)!;
  expect(
    (await rows(`SELECT id FROM itinerary_items WHERE trip_id = $1`, [second.id])).length,
    "the draft landed in the new plan",
  ).toBeGreaterThan(0);
  expect(
    (await rows(`SELECT id FROM itinerary_items WHERE trip_id = $1`, [firstId])).length,
    "the first plan is untouched",
  ).toBe(1);
});

test("stub — Draft it with AI on an empty slip writes origin='ai' items", async ({ page }) => {
  await signedInTraveler(page, "s4");
  const tripId = await createTrip(page.request, "Kyoto trip", KYOTO);
  await page.goto(`/plans/${tripId}`);
  await expect(testid(page, "slip-action-draft-ai")).toBeVisible({ timeout: 20_000 });

  const [feesBefore] = await rows<{ c: number }>(
    `SELECT count(*)::int AS c FROM fee_ledger WHERE fee_type = 'ai_concierge_fee'`,
  );

  const status = await actAndAwait(
    page,
    async () => {
      await testid(page, "slip-action-draft-ai").click();
    },
    { method: "POST", path: /^\/api\/ai\/generate-itinerary$/ },
  );
  await expect(testid(page, "slip-draft-anchor-ask")).toHaveCount(0);
  expect(ok2xx(status), `draft answered ${status}`).toBe(true);

  const [span] = await rows<{ days: number }>(
    `SELECT (end_date - start_date) + 1 AS days FROM trips WHERE id = $1`,
    [tripId],
  );
  const items = await rows<{ id: string; title: string | null; day_number: number | null; origin: string | null }>(
    `SELECT id, title, day_number, origin FROM itinerary_items WHERE trip_id = $1`,
    [tripId],
  );
  expect(items.length, "the draft wrote rows onto the empty plan").toBeGreaterThan(0);
  for (const it of items) {
    expect(it.origin, "every drafted row is stamped origin='ai' server-side").toBe("ai");
    expect((it.title ?? "").trim().length, "every drafted row has a title").toBeGreaterThan(0);
    expect(it.day_number, "every drafted row sits on a day of the plan").toBeGreaterThanOrEqual(1);
    expect(it.day_number!).toBeLessThanOrEqual(Number(span.days));
  }
  const [feesAfter] = await rows<{ c: number }>(
    `SELECT count(*)::int AS c FROM fee_ledger WHERE fee_type = 'ai_concierge_fee'`,
  );
  expect(
    Number(feesAfter.c),
    "a free draft on an empty plan writes no ai_concierge_fee row",
  ).toBe(Number(feesBefore.c));

  await expect
    .poll(
      async () =>
        (
          await rows<{ stage: string; properties: Record<string, unknown> | null }>(
            `SELECT stage, properties FROM funnel_events WHERE trip_id = $1 AND event_type = 'slip_free_draft_run'
               ORDER BY created_at`,
            [tripId],
          )
        ).map((r) => ({ stage: r.stage, properties: r.properties })),
      { timeout: 10_000 },
    )
    .toEqual([{ stage: "SLIP", properties: { outcome: "drafted", itemsWritten: items.length, heldSlots: 0 } }]);

  await page.reload();
  const first = [...items].sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0))[0];
  await expect(testid(page, `slip-item-${first.id}`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-testid^="badge-origin-"]')).toHaveCount(0);

  const again = await page.request.post(`${BASE_URL}/api/ai/generate-itinerary`, {
    data: { tripId, destination: KYOTO, dates: { start: "2099-01-01", end: "2099-01-02" } },
  });
  expect(again.status()).toBe(409);
  await expect
    .poll(
      async () =>
        (
          await rows<{ properties: Record<string, unknown> | null }>(
            `SELECT properties FROM funnel_events WHERE trip_id = $1 AND event_type = 'slip_free_draft_run'
               AND properties->>'outcome' = 'refused_not_empty'`,
            [tripId],
          )
        ).map((r) => r.properties),
      { timeout: 10_000 },
    )
    .toEqual([{ outcome: "refused_not_empty" }]);
});

test("stub — a plan started to be built with AI drafts into itself and starts no comparison", async ({ page }) => {
  await signedInTraveler(page, "b3");
  await page.goto("/pricing");
  await testid(page, "button-plan-ai").click();
  expect(await appears(testid(page, "plan-entry"), 10_000)).toBe(true);
  expect(await fillPlanEntryToStart(page, KYOTO, { occasionSlug: "travel", lenDays: 4 })).toBe(true);
  let tripId = "";
  const drafted = await actAndAwait(
    page,
    async () => {
      tripId = (await clickPlanStart(page)) ?? "";
    },
    { method: "POST", path: /^\/api\/ai\/generate-itinerary$/ },
    60_000,
  );
  expect(ok2xx(drafted), `draft answered ${drafted}`).toBe(true);
  expect(tripId).toBeTruthy();
  await expect(page).toHaveURL(new RegExp(`/plans/${tripId}`));
  await expect(page).not.toHaveURL(/itinerary-comparison/);
  await expect(page.getByText("Explore Kyoto").first()).toBeVisible({ timeout: 20_000 });
  expect(
    (await rows(`SELECT id FROM itinerary_items WHERE trip_id = $1`, [tripId])).length,
    "the draft is saved into the plan",
  ).toBeGreaterThan(0);
  expect(
    await rows(`SELECT id FROM itinerary_comparisons WHERE trip_id = $1`, [tripId]),
    "a free draft creates no comparison and starts no optimizer run",
  ).toEqual([]);
});

test("stub — a Travel plan with no stay drafts at once, then recommends where to stay", async ({ page }) => {
  const tripId = await planWithOccasion(page, "s4-ask", "travel");
  await page.goto(`/plans/${tripId}`);
  await expect(testid(page, "slip-action-draft-ai")).toBeVisible({ timeout: 20_000 });
  const status = await actAndAwait(
    page,
    async () => {
      await testid(page, "slip-action-draft-ai").click();
    },
    { method: "POST", path: /^\/api\/ai\/generate-itinerary$/ },
  );
  expect(ok2xx(status), `draft answered ${status} — it must draft, never ask first`).toBe(true);
  const items = await rows<{ id: string; title: string }>(`SELECT id, title FROM itinerary_items WHERE trip_id = $1`, [tripId]);
  expect(items.length, "the first press drafted the days").toBeGreaterThan(0);
  for (const it of items) {
    expect(isHotelItemTitle(it.title), `no hotel wording: "${it.title}"`).toBe(false);
    if (/\barriv/i.test(it.title)) expect(isAcceptableArrivalLine(it.title, "Kyoto", "arrival"), it.title).toBe(true);
    if (/\b(depart|leav)/i.test(it.title)) expect(isAcceptableArrivalLine(it.title, "Kyoto", "departure"), it.title).toBe(true);
  }
  await expect
    .poll(
      async () =>
        (
          await rows<{ properties: Record<string, unknown> | null }>(
            `SELECT properties FROM funnel_events WHERE trip_id = $1 AND event_type = 'slip_free_draft_run' ORDER BY created_at`,
            [tripId],
          )
        ).map((r) => r.properties),
      { timeout: 10_000 },
    )
    .toEqual([{ outcome: "drafted", itemsWritten: items.length, draftBasis: "none_asked", heldSlots: 0 }]);
  const stay = await page.request.get(`${BASE_URL}/api/trips/${tripId}/where-to-stay`);
  expect(stay.status()).toBe(200);
  const view = await stay.json();
  expect(view.eligible, "a drafted 2+ day plan with no stay is offered where to stay").toBe(true);
  expect(JSON.stringify(view), "no distance or minute value is served").not.toMatch(/minutes|meters|km/);
  expect(view.neighborhoods).toEqual([]);
  expect(view.unranked).toBe("no_located_items");
});

test("stub — with the draft's stops on the map, Where to stay ranks Kyoto's neighbourhoods", async ({ page }) => {
  const tripId = await planWithOccasion(page, "s4-rank", "travel");
  await page.goto(`/plans/${tripId}`);
  await expect(testid(page, "slip-action-draft-ai")).toBeVisible({ timeout: 20_000 });
  const status = await actAndAwait(
    page,
    async () => {
      await testid(page, "slip-action-draft-ai").click();
    },
    { method: "POST", path: /^\/api\/ai\/generate-itinerary$/ },
  );
  expect(ok2xx(status), `draft answered ${status}`).toBe(true);
  for (const day of [2, 3, 4, 5]) await createItem(page.request, tripId, `Stop on day ${day}`, day);
  await rows(
    `UPDATE itinerary_items SET latitude = CASE WHEN day_number = 5 THEN 35.0094 ELSE 35.0036 END,
       longitude = CASE WHEN day_number = 5 THEN 135.6680 ELSE 135.7748 END
     WHERE trip_id = $1`,
    [tripId],
  );
  const res = await page.request.get(`${BASE_URL}/api/trips/${tripId}/where-to-stay`);
  expect(res.status()).toBe(200);
  const view = await res.json();
  expect(view.eligible).toBe(true);
  expect(view.unranked, "a ranked view carries no empty-state reason").toBeUndefined();
  expect(view.neighborhoods.length, "the top three of Kyoto's neighbourhoods").toBe(3);
  expect(view.neighborhoods.slice(0, 2).map((n: { slug: string }) => n.slug)).toEqual(["gion", "arashiyama"]);
  expect(view.neighborhoods[0].reason).toBe("closest to 4 of your 5 days");
  expect(view.neighborhoods[1].reason).toBe("closest to 1 of your 5 days");
  expect(JSON.stringify(view), "the ranking serves an order and words, never a number of minutes or metres").not.toMatch(/minutes|meters|"lat"|"lng"/);
});

test("stub — an open hotel set stays open and the draft adds no accommodation", async ({ page }) => {
  const tripId = await planWithOccasion(page, "s4-set", "travel");
  const setRes = await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets`, {
    data: { categoryKey: "accommodation", label: "Where you'll stay", anchor: true },
  });
  expect(setRes.status(), await setRes.text()).toBe(201);
  const setId = (await setRes.json()).set.id as string;
  for (const [title, lat, lng] of [
    ["Gion stay", 35.0037, 135.7788],
    ["Station stay", 34.9858, 135.7588],
    ["Riverside stay", 35.0094, 135.6669],
  ] as const) {
    const r = await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/options`, {
      data: { source: { kind: "custom", title, lat, lng } },
    });
    expect(r.status(), await r.text()).toBe(201);
  }
  const optionsBefore = await rows(
    `SELECT id, position, title, latitude, longitude FROM plan_options WHERE set_id = $1 ORDER BY position`,
    [setId],
  );
  expect(optionsBefore.length).toBe(3);

  await page.goto(`/plans/${tripId}`);
  await expect(testid(page, "slip-action-draft-ai")).toBeVisible({ timeout: 20_000 });
  const status = await actAndAwait(
    page,
    async () => {
      await testid(page, "slip-action-draft-ai").click();
    },
    { method: "POST", path: /^\/api\/ai\/generate-itinerary$/ },
  );
  expect(ok2xx(status), `an open set does not make the slip non-empty (R126); draft answered ${status}`).toBe(true);

  const items = await rows<{ item_type: string | null; origin: string | null }>(
    `SELECT item_type, origin FROM itinerary_items WHERE trip_id = $1`,
    [tripId],
  );
  expect(items.length, "the draft wrote the days").toBeGreaterThan(0);
  for (const it of items) {
    expect(it.origin).toBe("ai");
    expect(
      ["accommodation", "hotel", "hostel", "lodging", "resort", "ryokan", "guesthouse", "inn"],
      "the held stay slot is never filled",
    ).not.toContain((it.item_type ?? "").toLowerCase());
  }
  const [set] = await rows<{ status: string; chosen_option_id: string | null }>(
    `SELECT status, chosen_option_id FROM plan_option_sets WHERE id = $1`,
    [setId],
  );
  expect(set, "the draft never closes or chooses the set").toEqual({ status: "open", chosen_option_id: null });
  expect(
    await rows(`SELECT id, position, title, latitude, longitude FROM plan_options WHERE set_id = $1 ORDER BY position`, [setId]),
    "its options are untouched",
  ).toEqual(optionsBefore);

  await expect
    .poll(
      async () =>
        (
          await rows<{ properties: Record<string, unknown> | null }>(
            `SELECT properties FROM funnel_events WHERE trip_id = $1 AND event_type = 'slip_free_draft_run'`,
            [tripId],
          )
        ).map((r) => r.properties),
      { timeout: 10_000 },
    )
    .toEqual([{ outcome: "drafted", itemsWritten: items.length, draftBasis: "open_anchor_set", heldSlots: 1 }]);
});
