import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { perDayAgreement } from "../../../shared/leg-resolution";
import { isAcceptableArrivalLine, isHotelItemTitle } from "../../../shared/draft-basis";
import { actAndAwait, ok2xx, appears, testid } from "../../../e2e/supply-demand/lib/ui";
import { fillPlanModalToFinish, clickPlanFinish } from "../../../e2e/supply-demand/lib/flows";
import {
  BASE_URL,
  registerUser,
  createTrip,
  createItem,
  rows,
  closePool,
} from "./_journey-helpers";

/**
 * THE KYOTO TRIPS SLICE — the acceptance test (Track A step A0 item (c), ledger
 * `2026-09-28-a0-slice-spec`, numeric citation R200).
 *
 * Content of record: docs/planning/golden-path-trips-kyoto.md, "Appendix A — Playwright acceptance
 * outline" (§1..§8; RATIFIED Sep 27, 2026) and docs/planning/track-a-rollout.md row A0 (c): every
 * step is `test.fixme` except §1 and the today-passable halves of §4, §6, §7 and §8. Each Track A
 * step turns its own fixmes into tests; this file is where "the slice works" is read.
 *
 * ONE TEST PER APPENDIX ASSERTION. A step's today-passable half and its NOT BUILT half are separate
 * tests, so a green run says exactly which halves passed and a fixme says exactly what it waits on.
 * A fixme is NEVER a weakened assertion: each one names the Track A step (A1…), the A1 supply gate
 * (R193 — the production census re-run), or the missing code it waits on.
 *
 * DISCIPLINE (ledger `2026-09-27-e2e-helpers-confirm-effect`, R170): every step asserts a network
 * response AND a DOM element; the helpers return only after confirming their effect. DB facts are
 * READ through the journey helpers' read pool; every WRITE goes through the app's own HTTP rails
 * (a fresh registered traveler and a fresh plan per test — no fixture rows in app tables, and no
 * fake Kyoto supply anywhere).
 *
 * WHERE TODAY'S RUN STOPS SHORT OF THE OUTLINE, AND WHY (stated, not hidden — §18d):
 *   · §4 today (the free draft) runs against the ONE explicit model stand-in, `E2E_AI_STUB=1`
 *     (ledger `2026-09-28-kyoto-s4-draft-ci`): the job sets it, nothing falls back to it, and the
 *     test asserts the draft's STRUCTURE and its funnel row, never its prose. What the real model
 *     writes is therefore NOT proven here.
 *   · §6 today is split: the free preview and the fee line PASS; paying, the board and adopt-stop
 *     need a Stripe test key (this job runs the stub — ruling 38's declared-503 contract).
 *     The outline says the fee equals the `fee_bands`-derived amount; on `main` the optimizer fee
 *     is resolved from `optimization_fees` (`optimization-fee.service.ts`), so the assertion is
 *     against the server's own `GET /api/optimization-fee` answer — recorded in the ledger row.
 *   · §7 today is split: Finalize and the "who books" chooser PASS; the staged listing, the fee
 *     line, checkout and cancel need a bookable instant-mode Kyoto listing (P-1c — A0 (a3) supply)
 *     plus a Stripe test key, and no seeder writes such a listing into a DB built from empty.
 *   · §8 today is split: the upcoming row and the Trip Card PASS; the refunded activity waits on §7.
 *   · §2/§3 (A3, ledger `2026-09-29-a3b-option-sets-slip`) add places BY NAME AND PIN through the
 *     slip's own control, fixture-free: the CI database seeds no `hotel_cache` rows (R211 — the census
 *     gate governs release, not the build), so the list source and M9's ranking are proven by the DB
 *     suite (`plan-option-sets.db.test.ts` O11/O12). §3's "est." assertions follow the SERVER's basis
 *     (`fit.basis`): "est." is shown exactly when the figure is a straight-line estimate, never
 *     assumed — ledger `2026-09-29-matrix-daily`.
 *   · §3 A4 (ledger `2026-09-29-a4-plan-fit-compare`): the compare view is proven on the same
 *     fixture-free places, so every price cell reads "price from the hotel"; the dated-offer price is
 *     proven by the DB suite (O14). "No est. on a located pair" runs LIVE wherever a Kyoto matrix
 *     refresh has completed on the database under test (a fixme reading "matrix not refreshed"
 *     elsewhere). The kyoto-slice job completes one through the real writer with the ONE Routes
 *     stand-in (`scripts/ci/seed-kyoto-matrix-standin.ts`, ledger `2026-09-29-matrix-daily`), so in
 *     CI it proves the view READS the matrix — never what Google's minutes for Kyoto are.
 *
 * Run solo: npx playwright test playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts --project=chromium
 * Needs: DATABASE_URL (read-only asserts), the app on BASE_URL (default http://127.0.0.1:5000).
 */

const KYOTO = "Kyoto, Japan";

test.afterAll(async () => {
  await closePool();
});

/** A fresh traveler, signed in on `page` (page.request shares the browser's cookie jar). */
async function signedInTraveler(page: Page, label: string): Promise<{ id: string; email: string }> {
  return registerUser(page.request, `kyoto-${label}`, "Kyoto", label);
}

/** Opens the ONE planning modal from the landing hero, confirming the modal appeared. */
async function openModalFromHero(page: Page): Promise<void> {
  await page.goto("/");
  const hero = testid(page, "button-plan-trip");
  expect(await appears(hero, 20_000), "the landing hero offers 'Plan a trip'").toBe(true);
  await hero.click();
  expect(await appears(testid(page, "plan-modal"), 10_000), "the one planning modal opens").toBe(true);
}

// ── §1 · entry and occasion ───────────────────────────────────────────────────────────────────
test.describe("1 · entry and occasion", () => {
  test("§1 — hero → Travel → Kyoto, five days → Plan it myself mints a Kyoto plan and lands on its slip", async ({ page }) => {
    const traveler = await signedInTraveler(page, "s1");
    await openModalFromHero(page);

    expect(
      await fillPlanModalToFinish(page, KYOTO, { occasionSlug: "travel", lenDays: 5 }),
      "the modal walks to its finish row",
    ).toBe(true);

    let tripId: string | null = null;
    const status = await actAndAwait(
      page,
      async () => {
        tripId = await clickPlanFinish(page, "myself");
      },
      { method: "POST", path: /^\/api\/trips$/ },
    );
    expect(ok2xx(status), `POST /api/trips answered ${status}`).toBe(true);
    expect(tripId, "the finish lands on /plans/:tripId").toBeTruthy();
    await expect(page).toHaveURL(new RegExp(`/plans/${tripId}`));

    // DB: the mint's server-derived facts (LD 30, LD 42 D12, the LD 30 dates amendment).
    const [trip] = await rows<{ timezone: string | null; market_slug: string | null; confirmed: boolean; user_id: string }>(
      `SELECT timezone, market_slug, dates_confirmed_at IS NOT NULL AS confirmed, user_id FROM trips WHERE id = $1`,
      [tripId],
    );
    expect(trip, "the minted trips row exists").toBeTruthy();
    expect(trip.user_id).toBe(traveler.id);
    expect(trip.timezone).toBe("Asia/Tokyo");
    expect(trip.market_slug).toBe("kyoto");
    expect(trip.confirmed, "the traveler chose the dates, so dates_confirmed_at is stamped").toBe(true);

    // DOM: the slip's header names the plan.
    await expect(testid(page, "slip-title")).toContainText("Kyoto", { timeout: 20_000 });
  });

  test("§1 / E1 — the trip_created funnel row carries the door, the occasion source and datesConfirmed", async ({ page }) => {
    await signedInTraveler(page, "e1");
    await openModalFromHero(page);
    expect(await fillPlanModalToFinish(page, KYOTO, { occasionSlug: "travel", lenDays: 5 })).toBe(true);

    let tripId: string | null = null;
    const status = await actAndAwait(
      page,
      async () => {
        tripId = await clickPlanFinish(page, "myself");
      },
      { method: "POST", path: /^\/api\/trips$/ },
    );
    expect(ok2xx(status)).toBe(true);
    await expect(testid(page, "slip-title")).toBeVisible({ timeout: 20_000 });

    // The event is fire-and-forget after the commit (§15b), so poll the READ — never a timer.
    await expect
      .poll(
        async () =>
          (
            await rows<{ properties: Record<string, unknown> | null }>(
              `SELECT properties FROM funnel_events WHERE trip_id = $1 AND event_type = 'trip_created'`,
              [tripId],
            )
          )[0]?.properties ?? null,
        { timeout: 10_000 },
      )
      // `finish` joined the row with the expert door (slip-funnel-events §3.1 amendment 2026-09-29).
      .toEqual({ door: "hero", occasionSource: "asked", finish: "myself", datesConfirmed: true, market: "kyoto" });
  });

  test("§1 — the header shows the occasion's own name and the plan resolves to the Trips group", async ({ page }) => {
    // A1 (ledger `2026-09-29-a1-trips-frame`). The occasion is the one the traveler picked in the
    // modal, recorded into the plan's pen by the occasion rail — not guessed from `vacation`.
    await signedInTraveler(page, "a1");
    await openModalFromHero(page);
    expect(await fillPlanModalToFinish(page, KYOTO, { occasionSlug: "travel", lenDays: 5 })).toBe(true);
    let tripId: string | null = null;
    const status = await actAndAwait(
      page,
      async () => {
        tripId = await clickPlanFinish(page, "myself");
      },
      { method: "POST", path: /^\/api\/trips$/ },
    );
    expect(ok2xx(status)).toBe(true);
    await expect(testid(page, "slip-title")).toBeVisible({ timeout: 20_000 });

    // The occasion write is fire-and-forget after the mint (§15b): poll the READ, then load fresh.
    await expect
      .poll(
        async () =>
          (
            await rows<{ slug: string | null }>(
              `SELECT context->>'experienceSlug' AS slug FROM trip_contexts WHERE trip_id = $1`,
              [tripId],
            )
          )[0]?.slug ?? null,
        { timeout: 10_000 },
      )
      .toBe("travel");
    const tripRead = await actAndAwait(page, async () => { await page.reload(); }, { method: "GET", path: new RegExp(`^/api/trips/${tripId}$`) });
    expect(ok2xx(tripRead)).toBe(true);

    await expect(testid(page, "slip-occasion-name")).toHaveText(/Travel/, { timeout: 20_000 });
    await expect(testid(page, `slip-view-${tripId}`)).toHaveAttribute("data-experience-group", "trips");
    // The group is a key, never display text (R127).
    await expect(page.getByText("Trips", { exact: true })).toHaveCount(0);
    await expect(testid(page, "slip-anchor-state")).toHaveText("Where you'll stay: not chosen yet");
  });

  test("§1 B5 — the Travel date step speaks plainly and a four-night window reads '5 days · 4 nights'", async ({ page }) => {
    // Production smoke test Sep 30, 2026 (ledger `2026-09-30-b5-dates-days-and-nights`).
    await signedInTraveler(page, "b5");
    await openModalFromHero(page);
    await testid(page, "option-occasion-travel").click();
    const next = testid(page, "button-planning-next");
    await next.click();
    await testid(page, "input-etp-destination").fill(KYOTO);
    for (let i = 0; i < 6 && !(await appears(testid(page, "input-etp-start-date"), 600)); i++) await next.click();
    await expect(testid(page, "text-plan-step-note")).not.toContainText("travel-class");
    await expect(testid(page, "text-plan-step-note")).toContainText("first and last day");
    const year = new Date().getFullYear() + 1;
    await testid(page, "input-etp-start-date").fill(`${year}-11-11`);
    await testid(page, "input-etp-end-date").fill(`${year}-11-15`);
    for (let i = 0; i < 6 && !(await appears(testid(page, "planning-option-ai"), 600)); i++) await next.click();
    await testid(page, "planning-option-ai").click();
    await expect(testid(page, "text-basics-dates")).toContainText("5 days · 4 nights", { timeout: 15_000 });
  });

  test("§1 B1/B2 — a new Travel plan after a Kyoto wedding inherits nothing: its own dates, name and no events", async ({ page }) => {
    // Production smoke test Sep 30, 2026 (ledger `2026-09-30-b1-new-plan-inherits-nothing`): with a
    // Kyoto WEDDING plan bound (two events, Nov 24–26 of a future year), the hero's "Plan a trip"
    // re-used that plan — re-labelled it, kept its events and dates, dropped the typed name.
    const traveler = await signedInTraveler(page, "b1");
    const year = new Date().getFullYear() + 1;
    const next = testid(page, "button-planning-next");
    const walkTo = async (id: string) => {
      for (let i = 0; i < 8 && !(await appears(testid(page, id), 800)); i++) {
        if (!(await appears(next, 800)) || (await next.isDisabled())) break;
        await next.click();
      }
      expect(await appears(testid(page, id), 3000), `the modal reaches ${id}`).toBe(true);
    };

    // 1. The wedding: two events, Nov 24–26, minted through "Plan it myself".
    await openModalFromHero(page);
    await testid(page, "option-occasion-wedding").click();
    await next.click();
    await testid(page, "input-etp-destination").fill(KYOTO);
    await walkTo("input-etp-start-date");
    await testid(page, "input-etp-start-date").fill(`${year}-11-24`);
    await testid(page, "input-etp-end-date").fill(`${year}-11-26`);
    await walkTo("text-etp-events-intro");
    await testid(page, "chip-etp-event-welcome-drinks").click();
    await testid(page, "chip-etp-event-rehearsal-dinner").click();
    await walkTo("planning-option-myself");
    const weddingId = await clickPlanFinish(page, "myself");
    expect(weddingId, "the wedding minted and landed on its slip").toBeTruthy();

    // 2. A new Travel plan from the hero: Nov 11–15, with a name.
    await openModalFromHero(page);
    await expect(testid(page, "option-occasion-travel"), "a new plan asks its own occasion").toBeVisible();
    await testid(page, "option-occasion-travel").click();
    await next.click();
    await expect(testid(page, "input-etp-destination"), "nothing is carried from the bound plan").toHaveValue("");
    await testid(page, "input-etp-destination").fill(KYOTO);
    await walkTo("input-etp-start-date");
    await expect(testid(page, "input-etp-start-date")).toHaveValue("");
    await testid(page, "input-etp-start-date").fill(`${year}-11-11`);
    await testid(page, "input-etp-end-date").fill(`${year}-11-15`);
    await walkTo("input-plan-adults");
    await expect(testid(page, "input-plan-adults"), "no party is carried from the wedding").toHaveValue("");
    await testid(page, "input-plan-adults").fill("3");
    await walkTo("input-etp-title");
    await testid(page, "input-etp-title").fill("Kyoto smoke test");
    await walkTo("planning-option-myself");
    let travelId: string | null = null;
    const status = await actAndAwait(
      page,
      async () => {
        travelId = await clickPlanFinish(page, "myself");
      },
      { method: "POST", path: /^\/api\/trips$/ },
    );
    expect(ok2xx(status), `the Travel setup minted its own plan (POST /api/trips answered ${status})`).toBe(true);
    expect(travelId).toBeTruthy();
    expect(travelId).not.toBe(weddingId);

    const plans = await rows<{ id: string; title: string; s: string; e: string; confirmed: boolean; event_type: string; adults: number | null }>(
      `SELECT id, title, start_date::text AS s, end_date::text AS e, dates_confirmed_at IS NOT NULL AS confirmed, event_type, adults
         FROM trips WHERE user_id = $1`,
      [traveler.id],
    );
    const travel = plans.find((p) => p.id === travelId)!;
    const wedding = plans.find((p) => p.id === weddingId)!;
    expect(plans.length, "two plans — the wedding was not re-used").toBe(2);
    expect(travel.title, "B2: the name entered at setup is kept").toBe("Kyoto smoke test");
    expect([travel.s, travel.e, travel.confirmed]).toEqual([`${year}-11-11`, `${year}-11-15`, true]);
    await expect
      .poll(async () => (await rows<{ adults: number | null }>(`SELECT adults FROM trips WHERE id = $1`, [travelId]))[0]?.adults, {
        timeout: 10_000,
      })
      .toBe(3);
    expect([wedding.s, wedding.e, wedding.event_type], "the wedding is untouched").toEqual([`${year}-11-24`, `${year}-11-26`, "wedding"]);
    expect(
      await rows(`SELECT id FROM user_experiences WHERE trip_id = $1`, [travelId]),
      "the new plan carries none of the wedding's events",
    ).toEqual([]);
    await expect(testid(page, "slip-title")).toContainText("Kyoto smoke test", { timeout: 20_000 });
  });

  test("§1 B8 — with a Kyoto plan bound, Destinations → Kyoto → 'Plan New Trip with AI' makes a NEW plan and drafts into it", async ({ page }) => {
    // Production smoke test Sep 30, 2026 (ledger `2026-09-30-b1-new-plan-inherits-nothing`): this
    // door re-opened the bound plan's setup and sent the draft at the existing plan (409 "already
    // has items"). `city_grid` is an entry door: it mints its own plan.
    const traveler = await signedInTraveler(page, "b8");
    await openModalFromHero(page);
    expect(await fillPlanModalToFinish(page, KYOTO, { occasionSlug: "travel", lenDays: 3 })).toBe(true);
    const firstId = await clickPlanFinish(page, "myself");
    expect(firstId, "the first plan minted and is bound").toBeTruthy();
    await createItem(page.request, firstId!, "Fushimi Inari walk", 1);

    await page.goto("/destinations");
    const card = testid(page, "button-plan-now-kyoto").first();
    expect(await appears(card, 20_000), "the Destinations grid offers Kyoto").toBe(true);
    await card.click();
    await testid(page, "button-plan-now-kyoto").last().click();
    expect(await appears(testid(page, "plan-modal"), 10_000), "the one planning modal opens").toBe(true);
    await expect(testid(page, "option-occasion-travel"), "a new plan asks its own occasion").toBeVisible();
    const next = testid(page, "button-planning-next");
    const walkTo = async (id: string) => {
      for (let i = 0; i < 8 && !(await appears(testid(page, id), 800)); i++) {
        if (!(await appears(next, 800)) || (await next.isDisabled())) break;
        await next.click();
      }
      expect(await appears(testid(page, id), 3000), `the modal reaches ${id}`).toBe(true);
    };
    const year = new Date().getFullYear() + 1;
    await testid(page, "option-occasion-travel").click();
    await next.click();
    await expect(testid(page, "input-etp-destination"), "the door's city is pre-filled").toHaveValue(/Kyoto/);
    await walkTo("input-etp-start-date");
    await expect(testid(page, "input-etp-start-date"), "no date is carried from the bound plan").toHaveValue("");
    await testid(page, "input-etp-start-date").fill(`${year}-11-11`);
    await testid(page, "input-etp-end-date").fill(`${year}-11-14`);
    await walkTo("planning-option-ai");
    const draft = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/ai/generate-itinerary" && r.request().method() === "POST" && r.status() !== 409,
      { timeout: 60_000 },
    );
    await testid(page, "planning-option-ai").click();
    await testid(page, "button-generate-itinerary").click();
    // Smoke 4 item 5: the draft is never preceded by a hotel question.
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

  test("§1 B8 — the Trip Strip's Edit writes new dates and a name to the plan ROW; setup and plan never disagree", async ({ page }) => {
    // Ledger `2026-09-30-b1-new-plan-inherits-nothing`: an edit wrote dates and name to the pen only,
    // so the setup header and the saved plan showed different windows. They now ride the one
    // re-date rail, `PATCH /api/trips/:id`, and the edit mints nothing.
    const traveler = await signedInTraveler(page, "b8e");
    await openModalFromHero(page);
    expect(await fillPlanModalToFinish(page, KYOTO, { occasionSlug: "travel", lenDays: 3 })).toBe(true);
    const tripId = await clickPlanFinish(page, "myself");
    expect(tripId).toBeTruthy();
    const year = new Date().getFullYear() + 1;
    await page.goto("/pricing");
    const edit = page.locator('[data-testid="trip-strip-edit"], [data-testid="trip-strip-edit-plan"]').first();
    expect(await appears(edit, 20_000), "the Trip Strip offers Edit on a bound plan").toBe(true);
    await edit.click();
    expect(await appears(testid(page, "plan-modal"), 10_000)).toBe(true);
    const next = testid(page, "button-planning-next");
    for (let i = 0; i < 6 && !(await appears(testid(page, "input-etp-start-date"), 600)); i++) await next.click();
    await testid(page, "input-etp-start-date").fill(`${year}-12-01`);
    await testid(page, "input-etp-end-date").fill(`${year}-12-04`);
    for (let i = 0; i < 6 && !(await appears(testid(page, "input-etp-title"), 600)); i++) await next.click();
    await testid(page, "input-etp-title").fill("Renamed plan");
    const patched = await actAndAwait(
      page,
      async () => {
        await testid(page, "button-etp-save").click();
      },
      { method: "PATCH", path: new RegExp(`^/api/trips/${tripId}$`) },
    );
    expect(ok2xx(patched), `the edit reached the row (PATCH answered ${patched})`).toBe(true);
    const plans = await rows<{ id: string; s: string; e: string; title: string; confirmed: boolean }>(
      `SELECT id, start_date::text AS s, end_date::text AS e, title, dates_confirmed_at IS NOT NULL AS confirmed
         FROM trips WHERE user_id = $1`,
      [traveler.id],
    );
    expect(plans.map((p) => p.id), "an edit mints nothing").toEqual([tripId]);
    expect([plans[0].s, plans[0].e, plans[0].title, plans[0].confirmed]).toEqual([`${year}-12-01`, `${year}-12-04`, "Renamed plan", true]);
  });
});

// ── §2 · where are you staying ────────────────────────────────────────────────────────────────
/** A plan whose occasion is recorded through the owner-gated occasion rail (the modal's own save). */
async function planWithOccasion(page: Page, label: string, slug: string): Promise<string> {
  await signedInTraveler(page, label);
  const tripId = await createTrip(page.request, `Kyoto ${label}`, KYOTO);
  const res = await page.request.patch(`${BASE_URL}/api/trips/${tripId}/occasion`, { data: { experienceSlug: slug } });
  expect(res.status(), `occasion write: ${await res.text()}`).toBe(200);
  return tripId;
}

/**
 * A3b — three Kyoto places to stay, each added through the slip's own "Add one that isn't listed"
 * control with a pin (the traveler's own point). FIXTURE-FREE on purpose: the CI database seeds no
 * `hotel_cache` rows (R211 — the census gate governs release, not this build), so the list source is
 * proven by the DB suite and the phone path here uses the by-name rail. Returns the set id.
 */
const KYOTO_STAYS = [
  { name: "Gion inn", lat: "35.0037", lng: "135.7788" },
  { name: "Station hotel", lat: "34.9858", lng: "135.7588" },
  { name: "Arashiyama ryokan", lat: "35.0094", lng: "135.6669" },
];

async function openLodgingSetWithThree(page: Page, tripId: string): Promise<string> {
  await page.goto(`/plans/${tripId}`);
  const compare = testid(page, "slip-anchor-compare");
  expect(await appears(compare, 20_000), "the anchor question offers 'I'm deciding'").toBe(true);
  const created = await actAndAwait(page, () => compare.click(), { method: "POST", path: new RegExp(`^/api/trips/${tripId}/option-sets$`) });
  expect(created, "POST option-sets").toBe(201);
  const setEl = page.locator('[data-testid^="slip-option-set-"]').first();
  await expect(setEl).toBeVisible({ timeout: 10_000 });
  const setId = ((await setEl.getAttribute("data-testid")) ?? "").replace("slip-option-set-", "");
  for (const stay of KYOTO_STAYS) {
    await testid(page, `slip-option-add-${setId}`).click();
    await testid(page, "slip-option-mode-name").click();
    await testid(page, "slip-option-name").fill(stay.name);
    await testid(page, "slip-option-lat").fill(stay.lat);
    await testid(page, "slip-option-lng").fill(stay.lng);
    const added = await actAndAwait(page, () => testid(page, "slip-option-add-name").click(), {
      method: "POST",
      path: new RegExp(`^/api/trips/${tripId}/option-sets/${setId}/options$`),
    });
    expect(added, `add ${stay.name}`).toBe(201);
    await expect(page.getByText(stay.name, { exact: true })).toBeVisible({ timeout: 10_000 });
  }
  return setId;
}

test.describe("2 · where are you staying", () => {

  test("§2 A1 — an empty Travel slip asks 'Where are you staying?' and offers the stays browse", async ({ page }) => {
    const tripId = await planWithOccasion(page, "a1-stay", "travel");
    const read = await actAndAwait(page, async () => { await page.goto(`/plans/${tripId}`); }, { method: "GET", path: new RegExp(`^/api/trips/${tripId}$`) });
    expect(ok2xx(read)).toBe(true);
    const card = testid(page, "slip-anchor-question");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toHaveAttribute("data-anchor-kind", "lodging");
    await expect(card).toContainText("Where are you staying?");
    await expect(testid(page, "slip-empty-items")).toHaveCount(0);
    const browse = testid(page, "slip-anchor-browse-stays");
    await expect(browse).toHaveAttribute("href", new RegExp(`accommodation.*${tripId}|${tripId}.*accommodation`));
  });

  test("§2 A1 — a golf trip (schedule on) asks what is fixed first; lodging is secondary (M7)", async ({ page }) => {
    const tripId = await planWithOccasion(page, "a1-golf", "golf-trip");
    await page.goto(`/plans/${tripId}`);
    const card = testid(page, "slip-anchor-question");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toHaveAttribute("data-anchor-kind", "fixed_item");
    await expect(card).toContainText("What's fixed on these dates?");
    await expect(testid(page, "slip-anchor-state")).toHaveText("Built around: nothing fixed yet");
    await expect(testid(page, `slip-view-${tripId}`)).toHaveAttribute("data-experience-group", "trips");
  });

  test("§2 A1 — at 390 px the question card fits with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const tripId = await planWithOccasion(page, "a1-phone", "travel");
    await page.goto(`/plans/${tripId}`);
    await expect(testid(page, "slip-anchor-question")).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "no horizontal scroll at phone width").toBeLessThanOrEqual(0);
    // List before rail on a phone (track-a-rollout A1): the question is above the rail's first card.
    const q = await testid(page, "slip-anchor-question").boundingBox();
    const rail = await testid(page, "slip-view-toggle").boundingBox();
    expect(q && rail && q.y > rail.y, "the question follows the view bar, inside the plan column").toBeTruthy();
    const firstRailCard = await page.getByText("Browse services for this trip").first().boundingBox();
    expect(q && firstRailCard && q.y < firstRailCard.y, "the anchor question is above the rail on a phone").toBeTruthy();
  });

  test("§2 — at 390 px an item's whole name is readable beside its chips (ledger `2026-09-29-slip-item-name-390`)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signedInTraveler(page, "name390");
    const tripId = await createTrip(page.request, "Kyoto trip", KYOTO);
    const name = "Fushimi Inari Taisha early morning walk";
    await createItem(page.request, tripId, name, 1);
    const read = await actAndAwait(page, () => page.goto(`/plans/${tripId}`), { method: "GET", path: new RegExp(`^/api/trips/${tripId}/plancard$`) });
    expect(ok2xx(read)).toBe(true);
    // Located by its TEXT, not a test id, so the same assertion reads the row as it was before.
    const label = page.getByText(name, { exact: true });
    await expect(label).toBeVisible({ timeout: 20_000 });
    const clipped = await label.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(clipped, "the name is not cut off with an ellipsis").toBeLessThanOrEqual(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "no horizontal scroll at phone width").toBeLessThanOrEqual(0);
  });

  test("§2 A3 — the anchor question opens a set; three places admitted, a fourth refused (cap 3)", async ({ page }) => {
    const tripId = await planWithOccasion(page, "a3-cap", "travel");
    const setId = await openLodgingSetWithThree(page, tripId);
    // DOM: a full set offers no fourth add.
    await expect(testid(page, `slip-option-add-${setId}`)).toHaveCount(0);
    await expect(testid(page, `slip-option-set-${setId}`)).toContainText("3 places is the most one comparison holds.");
    // HTTP: the rail refuses a fourth with a 409, never a clamp.
    const fourth = await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/options`, {
      data: { source: { kind: "custom", title: "One too many" } },
    });
    expect(fourth.status()).toBe(409);
    expect((await fourth.json()).code).toBe("set_full");
    // DB: one open set, three options, and NO item — an open set is not an item (R126).
    const [set] = await rows<{ status: string; n: number }>(
      `SELECT s.status, (SELECT count(*)::int FROM plan_options o WHERE o.set_id = s.id) AS n FROM plan_option_sets s WHERE s.id = $1`,
      [setId],
    );
    expect(set).toEqual({ status: "open", n: 3 });
    const [items] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM itinerary_items WHERE trip_id = $1`, [tripId]);
    expect(items.n).toBe(0);
  });

  test("§2 A3 — GLANCE reads '3 to compare' and a place with no stated price shows no price", async ({ page }) => {
    const tripId = await planWithOccasion(page, "a3-glance", "travel");
    const setId = await openLodgingSetWithThree(page, tripId);
    await expect(testid(page, `slip-option-glance-${setId}`)).toHaveText("Where you'll stay · 3 to compare");
    // K1 rule 1: nothing stated ⇒ nothing shown — never "$0".
    await expect(page.locator('[data-testid^="slip-option-price-"]')).toHaveCount(0);
    await expect(testid(page, `slip-option-set-${setId}`)).not.toContainText("$0");
  });
});

// ── §3 · plan-fit per hotel ───────────────────────────────────────────────────────────────────
test.describe("3 · plan-fit per hotel", () => {
  test("§3 A3 — before the days have stops every place shows the 'add a few things' line and no minutes", async ({ page }) => {
    const tripId = await planWithOccasion(page, "a3-fit0", "travel");
    const setId = await openLodgingSetWithThree(page, tripId);
    const fits = page.locator(`[data-testid="slip-option-set-${setId}"] [data-testid^="slip-option-fit-"]`);
    await expect(fits).toHaveCount(3);
    for (const line of await fits.allTextContents()) {
      expect(line).toBe("Add a few things to your days to see how each place fits");
      expect(line).not.toMatch(/\d/);
    }
  });

  test("§3 A3 — with located stops each place carries a server fit and a line with its basis and 'of N located'", async ({ page }) => {
    const tripId = await planWithOccasion(page, "a3-fit", "travel");
    const setId = await openLodgingSetWithThree(page, tripId);
    // Three located stops and one without a pin (excluded and counted, never guessed).
    await createItem(page.request, tripId, "Yasaka Shrine", 1, { latitude: "35.0036", longitude: "135.7786" });
    await createItem(page.request, tripId, "Kennin-ji", 1, { latitude: "35.0005", longitude: "135.7736" });
    await createItem(page.request, tripId, "Fushimi Inari", 2, { latitude: "34.9671", longitude: "135.7727" });
    await createItem(page.request, tripId, "A friend's recommendation", 2);
    const read = await actAndAwait(page, () => page.goto(`/plans/${tripId}`), { method: "GET", path: new RegExp(`^/api/trips/${tripId}/option-sets$`) });
    expect(ok2xx(read)).toBe(true);
    // Response: the server derives every figure (§E4) — the slip computes none.
    const body = await (await page.request.get(`${BASE_URL}/api/trips/${tripId}/option-sets`)).json();
    const set = body.sets.find((x: any) => x.id === setId);
    for (const o of set.options) {
      expect(o.fit.scored).toBe(true);
      expect(["matrix", "est"]).toContain(o.fit.basis);
      expect(o.fit.located).toBe(3);
      expect(o.fit.total).toBe(4);
      expect(typeof o.fit.minutesPerDay).toBe("number");
    }
    await expect(page.locator(`[data-testid="slip-option-set-${setId}"] [data-testid^="slip-option-fit-"]`)).toHaveCount(3);
    for (const o of set.options) {
      const line = (await testid(page, `slip-option-fit-${o.id}`).textContent()) ?? "";
      if (estOn(o.fit)) expect(line).toContain("est.");
      else expect(line).not.toContain("est.");
      expect(line).toContain("of 4 located");
      expect(line).toContain("3 of 4");
    }
  });

  test("§3 A3 — at 375×812 the place cards stack with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const tripId = await planWithOccasion(page, "a3-phone", "travel");
    const setId = await openLodgingSetWithThree(page, tripId);
    const cards = page.locator(`[data-testid="slip-option-list-${setId}"] > li`);
    await expect(cards).toHaveCount(3);
    const boxes = await Promise.all([0, 1, 2].map((i) => cards.nth(i).boundingBox()));
    expect(boxes.every(Boolean)).toBe(true);
    expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 1);
    expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y + boxes[1]!.height - 1);
    expect(Math.abs(boxes[0]!.x - boxes[2]!.x)).toBeLessThan(2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "no horizontal scroll at phone width").toBeLessThanOrEqual(0);
  });
});

// ── §3 · the compare view (A4) ────────────────────────────────────────────────────────────────
/** The places on a plan's comparison as the SERVER derived them (the view computes none of this). */
async function serverSet(page: Page, tripId: string, setId: string): Promise<any> {
  const body = await (await page.request.get(`${BASE_URL}/api/trips/${tripId}/option-sets`)).json();
  return body.sets.find((x: any) => x.id === setId);
}

/** "est." exactly when the server's figure is a straight-line estimate (§E4, §13) — read, never assumed. */
const estOn = (fit: { basis: string }) => fit.basis === "est";

/** Three located stops and one without a pin, as in §3 A3 (excluded and counted, never guessed). */
async function addKyotoStops(page: Page, tripId: string): Promise<void> {
  await createItem(page.request, tripId, "Yasaka Shrine", 1, { latitude: "35.0036", longitude: "135.7786" });
  await createItem(page.request, tripId, "Kennin-ji", 1, { latitude: "35.0005", longitude: "135.7736" });
  await createItem(page.request, tripId, "Fushimi Inari", 2, { latitude: "34.9671", longitude: "135.7727" });
  await createItem(page.request, tripId, "A friend's recommendation", 2);
}

/** Opens the compare view from the slip's own "Compare side by side" link. */
async function openCompareView(page: Page, tripId: string, setId: string): Promise<void> {
  await page.goto(`/plans/${tripId}`);
  const link = testid(page, `slip-option-compare-${setId}`);
  expect(await appears(link, 20_000), "the open set offers 'Compare side by side'").toBe(true);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/plans/${tripId}/compare/${setId}$`));
  // The slip's query cache already holds the comparisons, so the click need not refetch; a reload
  // proves the view stands on its own server read.
  const read = await actAndAwait(page, () => page.reload(), { method: "GET", path: new RegExp(`^/api/trips/${tripId}/option-sets$`) });
  expect(ok2xx(read)).toBe(true);
  await expect(testid(page, `compare-view-${setId}`)).toBeVisible({ timeout: 20_000 });
}

test.describe("3 · the compare view (A4)", () => {
  test("§3 A4 — the compare view leads with plan-fit: minutes a day, walkable areas, 'N of M located', its basis", async ({ page }) => {
    const tripId = await planWithOccasion(page, "a4-compare", "travel");
    const setId = await openLodgingSetWithThree(page, tripId);
    await addKyotoStops(page, tripId);
    await openCompareView(page, tripId, setId);
    const set = await serverSet(page, tripId, setId);
    await expect(testid(page, "compare-title")).toHaveText("Compare 3 places");
    await expect(testid(page, "compare-intro")).toContainText("Based on 3 of 4 stops that have a location.");
    for (const o of set.options) {
      expect(o.fit.scored).toBe(true);
      expect(["matrix", "est"]).toContain(o.fit.basis);
      // The minutes are the SERVER's figure, printed as-is, with "est." beside it exactly when it is
      // a straight-line estimate (§E4, §13).
      await expect(testid(page, `compare-travel-${o.id}-value`)).toHaveText(`${o.fit.minutesPerDay} min`);
      await expect(testid(page, `compare-travel-${o.id}-note`)).toHaveText(estOn(o.fit) ? "est." : "per day");
      await expect(testid(page, `compare-fit-${o.id}`)).toContainText("based on 3 of 4 located stops");
      // Coverage: the server's two counts, or — with no known area — a dash and a reason, never 0.
      const areas = o.fit.coverage === null ? "—" : `${o.fit.areasNear} of ${o.fit.areasTotal}`;
      await expect(testid(page, `compare-areas-${o.id}-value`)).toHaveText(areas);
      // No offer for these places (fixture-free), so no number is typed: "price from the hotel".
      await expect(testid(page, `compare-price-${o.id}-value`)).toHaveText("—");
      await expect(testid(page, `compare-price-${o.id}-note`)).toHaveText("price from the hotel");
      await expect(testid(page, `compare-option-${o.id}`)).toHaveAttribute("data-fit-rank", String(o.fitRank ?? ""));
    }
    await expect(testid(page, `compare-view-${setId}`)).not.toContainText("$");
    // "Easiest days" is on exactly the place the server crowned, and nowhere else.
    const crowned = set.options.filter((o: any) => o.easiest);
    await expect(page.locator('[data-testid^="compare-easiest-"]')).toHaveCount(crowned.length);
    for (const o of crowned) await expect(testid(page, `compare-easiest-${o.id}`)).toHaveText("Easiest days");
    await expect(testid(page, "compare-foot")).toHaveText("Not chosen yet — your plan keeps all 3 open.");
  });

  test("§3 A4 — at 375×812 the cards stack, a long name wraps whole, and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const tripId = await planWithOccasion(page, "a4-phone", "travel");
    const set = await (await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets`, {
      data: { categoryKey: "accommodation", label: "Where you'll stay", anchor: true },
    })).json();
    const setId = set.set.id as string;
    const longName = "Hotel Kanra Kyoto, a restored machiya stay near Karasuma Gojo";
    for (const [title, lat, lng] of [[longName, 34.9969, 135.7596], ["Gion inn", 35.0037, 135.7788], ["Station hotel", 34.9858, 135.7588]] as const) {
      const r = await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/options`, { data: { source: { kind: "custom", title, lat, lng } } });
      expect(r.status(), await r.text()).toBe(201);
    }
    await addKyotoStops(page, tripId);
    await openCompareView(page, tripId, setId);
    const cards = page.locator('[data-testid="compare-list"] > li');
    await expect(cards).toHaveCount(3);
    const boxes = await Promise.all([0, 1, 2].map((i) => cards.nth(i).boundingBox()));
    expect(boxes.every(Boolean)).toBe(true);
    expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 1);
    expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y + boxes[1]!.height - 1);
    const name = page.getByText(longName, { exact: true });
    await expect(name).toBeVisible();
    expect(await name.evaluate((el) => el.scrollWidth - el.clientWidth), "the whole name is readable").toBeLessThanOrEqual(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "no horizontal scroll at 375 px").toBeLessThanOrEqual(0);
  });

  test("§3 A4 / E4 — each place's plan-fit view writes one slip_plan_fit_shown row carrying the server's figure", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const tripId = await planWithOccasion(page, "a4-e4", "travel");
    const setId = await openLodgingSetWithThree(page, tripId);
    await addKyotoStops(page, tripId);
    await openCompareView(page, tripId, setId);
    const set = await serverSet(page, tripId, setId);
    type Row = { option_id: string; surface: string; viewport: string; basis: string; burden: number | null; version: string };
    const read = () =>
      rows<Row>(
        `SELECT properties->>'optionId' AS option_id, properties->>'surface' AS surface, properties->>'viewport' AS viewport,
                properties->>'fitBasis' AS basis, (properties->>'burdenMinutes')::int AS burden, properties->>'fitVersion' AS version
           FROM funnel_events WHERE trip_id = $1 AND event_type = 'slip_plan_fit_shown' AND properties->>'surface' = 'compare_view'`,
        [tripId],
      );
    await expect.poll(async () => (await read()).length, { timeout: 15_000 }).toBe(3);
    const got = await read();
    for (const o of set.options) {
      const row = got.find((r) => r.option_id === o.id);
      expect(row, `a row for ${o.title}`).toBeTruthy();
      const basis = estOn(o.fit) ? "est_straight_line" : "matrix";
      expect(row).toMatchObject({ surface: "compare_view", viewport: "wide", basis, burden: o.fit.minutesPerDay, version: "m3-v1" });
    }
  });

  test("§3 A4 — after a choice, 'N places would make your days easier' reveals the minutes each saves", async ({ page }) => {
    const tripId = await planWithOccasion(page, "a4-easier", "travel");
    const setId = await openLodgingSetWithThree(page, tripId);
    await addKyotoStops(page, tripId);
    await openCompareView(page, tripId, setId);
    const before = await serverSet(page, tripId, setId);
    const worst = [...before.options].sort((a: any, b: any) => b.fit.minutesPerDay - a.fit.minutesPerDay)[0];
    const chose = await actAndAwait(page, () => testid(page, `compare-choose-${worst.id}`).click(), {
      method: "POST",
      path: new RegExp(`^/api/trips/${tripId}/option-sets/${setId}/choose$`),
    });
    expect(chose).toBe(200);
    await expect(testid(page, `compare-chosen-${worst.id}`)).toBeVisible({ timeout: 10_000 });
    const after = await serverSet(page, tripId, setId);
    expect(after.status).toBe("chosen");
    expect(after.easierCount, "the Gion inn beats the Arashiyama ryokan by the threshold").toBeGreaterThanOrEqual(1);
    const easier = testid(page, "compare-easier");
    await expect(easier).toHaveText(after.easierCount === 1 ? "1 place would make your days easier" : `${after.easierCount} places would make your days easier`);
    await easier.click();
    for (const o of after.options.filter((x: any) => x.easierByMinutes != null)) {
      await expect(testid(page, `compare-saves-${o.id}`)).toHaveText(`${o.easierByMinutes} min less travel per day than your choice${estOn(o.fit) ? " · est." : ""}`);
    }
    await expect(testid(page, "compare-foot")).toHaveText(`You chose ${worst.title}. You can change your mind until you book.`);
  });

  test("§3 A4 — no 'est.' on a located pair once the Kyoto matrix is refreshed", async ({ page }) => {
    const [refresh] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM travel_time_matrix_refreshes WHERE market_slug = 'kyoto' AND status = 'complete'`,
    );
    test.fixme(!refresh || refresh.n === 0, "matrix not refreshed");
    // Stops on three neighbourhood centroids and places on three OTHER centroids, so every pair is a
    // matrix pair. (A place in its stop's own neighbourhood is ruled `est` — R216's same-neighbourhood
    // case — which is proven below instead of being mistaken for a matrix miss.)
    const hoods = await rows<{ lat: string; lng: string }>(
      `SELECT centroid_lat AS lat, centroid_lng AS lng FROM city_neighborhoods WHERE lower(city) = 'kyoto' ORDER BY slug LIMIT 6`,
    );
    expect(hoods.length, "six Kyoto neighbourhoods to place stops and places apart").toBe(6);
    const openSet = async (tripId: string) =>
      ((await (await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets`, {
        data: { categoryKey: "accommodation", label: "Where you'll stay", anchor: true },
      })).json()).set.id as string);
    const addPlace = async (tripId: string, setId: string, title: string, h: { lat: string; lng: string }) => {
      const r = await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/options`, {
        data: { source: { kind: "custom", title, lat: Number(h.lat), lng: Number(h.lng) } },
      });
      expect(r.status()).toBe(201);
    };

    const tripId = await planWithOccasion(page, "a4-matrix", "travel");
    const setId = await openSet(tripId);
    for (const [i, h] of hoods.slice(0, 3).entries()) {
      await createItem(page.request, tripId, `Stop ${i + 1}`, 1 + (i % 2), { latitude: h.lat, longitude: h.lng });
    }
    for (const [i, h] of hoods.slice(3).entries()) await addPlace(tripId, setId, `Place ${i + 1}`, h);
    await openCompareView(page, tripId, setId);
    const set = await serverSet(page, tripId, setId);
    for (const o of set.options) {
      expect(o.fit.basis, `${o.title}: every located pair is a matrix pair`).toBe("matrix");
      await expect(testid(page, `compare-travel-${o.id}-note`)).toHaveText("per day");
      await expect(testid(page, `compare-fit-${o.id}`)).not.toContainText("est.");
    }

    // The same-neighbourhood pair stays a straight-line estimate WITH a matrix present, and says so.
    const sameId = await planWithOccasion(page, "a4-matrix-same", "travel");
    const sameSet = await openSet(sameId);
    // Plan-fit scores from three located stops (PLAN_FIT_MIN_LOCATED); all three sit tens of metres
    // from the place's own centroid, inside its neighbourhood.
    for (const [i, d] of [0, 0.0003, -0.0003].entries()) {
      await createItem(page.request, sameId, `Stop ${i + 1} in the same area`, 1, {
        latitude: (Number(hoods[0].lat) + d).toFixed(6),
        longitude: (Number(hoods[0].lng) - d).toFixed(6),
      });
    }
    await addPlace(sameId, sameSet, "Place in the same area", hoods[0]);
    await openCompareView(page, sameId, sameSet);
    const [same] = (await serverSet(page, sameId, sameSet)).options;
    expect(same.fit.basis, "a same-neighbourhood pair is ruled est (R216)").toBe("est");
    await expect(testid(page, `compare-travel-${same.id}-note`)).toHaveText("est.");
  });
});

// ── §4 · free draft around the set ────────────────────────────────────────────────────────────
test.describe("4 · free draft around the set", () => {
  test("§4 today — Draft it with AI on an empty slip writes origin='ai' items, drawn as plain rows (no pills, surface step 1)", async ({ page }) => {
    // Ledger `2026-09-28-kyoto-s4-draft-ci`: the job's server runs with E2E_AI_STUB=1, the ONE
    // explicit stand-in for the draft model (ai-generation.service.ts; refused where ENVIRONMENT=PROD, and it
    // names itself `e2e-ai-stub` on every cost row). Everything after the model call is real code.
    // Assertions are STRUCTURAL — never the stand-in's prose.
    await signedInTraveler(page, "s4");
    const tripId = await createTrip(page.request, "Kyoto trip", KYOTO);
    await page.goto(`/plans/${tripId}`);
    await expect(testid(page, "slip-action-draft-ai")).toBeVisible({ timeout: 20_000 });

    // A5 + R215: this plan has no recorded occasion — its `vacation` event type is the column default,
    // not the traveler's answer — so it is not a Trip and the draft does NOT ask where they are staying.
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

    // E6 (slip-funnel-events.md §3.6): one row, written after the snapshot commits — poll the READ.
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
    // Surface step 1 (ledger `2026-10-03-surface-step1-item-row`): the slip's `ItemRow` draws no
    // status pills — origin stays a stored fact (asserted above), never a chip on the row.
    // The FIRST day is the one open by default, so the row read is one of day 1's.
    const first = [...items].sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0))[0];
    await expect(testid(page, `slip-item-${first.id}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid^="badge-origin-"]')).toHaveCount(0);

    // LD 41 (b): the plan is no longer empty, so a second free draft is refused (409) before any
    // model call — and the refusal is its own E6 row, with no count.
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
  test("§4 B3/B4/B6 — the modal's AI finish drafts INTO the plan and lands on its slip; no alternatives run starts", async ({ page }) => {
    // Production smoke test Sep 30, 2026 (ledger `2026-09-30-b3-b6-draft-is-the-deliverable`): the
    // free draft used to start the PAID optimizer in the background and open the comparison page,
    // which could fail in front of the draft and labelled every item "evening". The draft is the
    // deliverable; alternatives are the slip's Optimize, charged on confirm.
    await signedInTraveler(page, "b3");
    await openModalFromHero(page);
    expect(await fillPlanModalToFinish(page, KYOTO, { occasionSlug: "travel", lenDays: 4 })).toBe(true);
    await testid(page, "planning-option-ai").click();
    // Smoke 5 item 4: the finish minted the plan, so the traveler is ON ITS SLIP before the AI form
    // opens over it — never left on the page the wizard was opened from.
    await page.waitForURL(/\/plans\//, { timeout: 30_000 });
    const tripId = page.url().match(/\/plans\/([a-zA-Z0-9-]+)/)![1];
    await expect(testid(page, "button-generate-itinerary")).toBeVisible({ timeout: 15_000 });
    // Smoke 4 item 5: the draft is never preceded by a hotel question.
    const drafted = await actAndAwait(
      page,
      async () => {
        await testid(page, "button-generate-itinerary").click();
      },
      { method: "POST", path: /^\/api\/ai\/generate-itinerary$/ },
      60_000,
    );
    expect(ok2xx(drafted), `draft answered ${drafted}`).toBe(true);
    await expect(page).toHaveURL(new RegExp(`/plans/${tripId}`));
    await expect(page).not.toHaveURL(/itinerary-comparison/);
    // The slip it already showed refreshes to the drafted items (no navigation needed).
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

  test("§4 — a Travel plan with no stay and no set drafts at once, then recommends where to stay", async ({ page }) => {
    // Smoke 4 item 5 (ledger `2026-10-02-smoke4-draft-fixes`; decision-maker, Oct 2, 2026: "Hotel is
    // optional and recommended after the draft, not asked before it"). A RESOLVED Trips occasion
    // (R215), no stay, no set: "Draft it with AI" drafts on the first press — the client sends the
    // explicit skip — and the slip then shows the "Where to stay" panel. Same stand-in as §4-today.
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
    // Smoke 5 item 10: a no-hotel draft carries no hotel item, and any arrival or departure line is
    // either our own ("Arrival in Kyoto") or a station-specific line the model wrote — both pass.
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
    // The stub draft's stops carry no coordinates, so nothing is ranked yet — and the panel says
    // THAT, never that Kyoto has no neighbourhoods (it has them; §13).
    expect(view.neighborhoods).toEqual([]);
    expect(view.unranked).toBe("no_located_items");
  });

  test("§4 — with the draft's stops on the map, Where to stay ranks Kyoto's neighbourhoods by the days", async ({ page }) => {
    // Follow-up to smoke 4 item 5 (ledger `2026-10-02-smoke4-draft-fixes`): the ranked panel, not
    // only its empty state. The CI database carries Kyoto's `city_neighborhoods` rows (the same rows
    // the matrix stand-in refreshes); the stub draft's stops have no coordinates, so this places five
    // days' stops the way located items would be — four in Gion, one in Arashiyama.
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
    // The stub draft writes day 1 only; days 2–5 get one stop each through the ordinary item rail.
    for (const day of [2, 3, 4, 5]) await createItem(page.request, tripId, `Stop on day ${day}`, day);
    // On the map: days 1–4 at Gion's centroid, day 5 at Arashiyama's (the CI rows' own centroids).
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
    expect(view.neighborhoods.slice(0, 2).map((n: any) => n.slug)).toEqual(["gion", "arashiyama"]);
    expect(view.neighborhoods[0].reason).toBe("closest to 4 of your 5 days");
    expect(view.neighborhoods[1].reason).toBe("closest to 1 of your 5 days");
    expect(JSON.stringify(view), "the ranking serves an order and words, never a number of minutes or metres").not.toMatch(/minutes|meters|"lat"|"lng"/);
    // Smoke 5 item 1: the same plan ranks the same way on a second call.
    const again = await (await page.request.get(`${BASE_URL}/api/trips/${tripId}/where-to-stay`)).json();
    expect(again.neighborhoods.map((n: any) => n.slug)).toEqual(view.neighborhoods.map((n: any) => n.slug));

    await page.reload();
    const panel = testid(page, "where-to-stay-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    for (const n of view.neighborhoods) {
      await expect(testid(page, `where-to-stay-reason-${n.slug}`)).toHaveText(n.reason);
    }
    // CI seeds no hotel inventory (R211), so each neighbourhood says so rather than inventing one.
    if (!view.hotelsAvailable) {
      await expect(page.locator('[data-testid^="where-to-stay-coming-soon-"]')).toHaveCount(3);
    }
    await expect(testid(page, "where-to-stay-no-neighborhoods")).toHaveCount(0);
    // Smoke 5 item 2: the panel is the ONE lodging surface — the legacy inline card never shows.
    await expect(testid(page, "slip-lodging-entry")).toHaveCount(0);

    // …and after Skip, a reload brings back neither the panel nor the legacy card.
    const skip = await actAndAwait(
      page,
      async () => {
        await testid(page, "where-to-stay-skip").click();
      },
      { method: "POST", path: new RegExp(`^/api/trips/${tripId}/where-to-stay$`) },
    );
    expect(ok2xx(skip), `skip answered ${skip}`).toBe(true);
    await page.reload();
    await expect(testid(page, "slip-header")).toBeVisible({ timeout: 20_000 });
    // Surface step 1: only the first day opens by default; day 2 is opened by its header.
    await testid(page, "slip-day-toggle-2").click();
    await expect(page.getByText("Stop on day 2")).toBeVisible({ timeout: 20_000 });
    await expect(testid(page, "where-to-stay-panel")).toHaveCount(0);
    await expect(testid(page, "slip-lodging-entry")).toHaveCount(0);
    expect((await (await page.request.get(`${BASE_URL}/api/trips/${tripId}/where-to-stay`)).json()).reason).toBe("decided");
  });

  test("§4 — with an open hotel set the draft succeeds, leaves the set open and adds no accommodation", async ({ page }) => {
    // A5 (ledger `2026-09-29-a5-draft-open-set`; §M5, R126) on a RESOLVED Trips occasion (R215).
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
});

// ── §5 · gaps and suggestions ─────────────────────────────────────────────────────────────────
test.describe("5 · gaps and suggestions", () => {
  test.fixme("§5 — 'N of M essentials', See options → Add → the row appears in that day", async () => {
    // Waits on B4 completeness + S3 slip suggestions + S4 move-to-day (P-2d), and on the A1 supply
    // gate (R193) for Kyoto listings to suggest.
  });
  test.fixme("§5 — a category with no Kyoto supply says one sentence naming Kyoto, never '0'", async () => {
    // Waits on S3 (§L2 empty-supply rule on the slip).
  });
});

// ── §6 · paid run ─────────────────────────────────────────────────────────────────────────────
test.describe("6 · paid run", () => {
  test("§6 today — the free preview and the run fee render on the slip before any charge", async ({ page }) => {
    await signedInTraveler(page, "s6");
    const tripId = await createTrip(page.request, "Kyoto trip", KYOTO);
    // Two traveler-typed stops (never catalog supply): the estimate needs at least two items.
    await createItem(page.request, tripId, "Fushimi Inari walk", 1);
    await createItem(page.request, tripId, "Kiyomizu-dera", 2);

    const previewResp = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/optimization-preview" && r.request().method() === "GET",
    );
    const feeResp = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/optimization-fee" && r.request().method() === "GET",
    );
    await page.goto(`/plans/${tripId}`);
    const [preview, fee] = await Promise.all([previewResp, feeResp]);
    expect(ok2xx(preview.status()), `preview answered ${preview.status()}`).toBe(true);
    expect(ok2xx(fee.status()), `fee answered ${fee.status()}`).toBe(true);
    const feeBody = (await fee.json()) as { feeCents: number; currency: string; coveredByTripPass: boolean };

    await expect(testid(page, "slip-action-optimize")).toBeVisible({ timeout: 20_000 });
    await expect(testid(page, "slip-optimize-preview")).toBeVisible();
    // The fee shown is the server's own quote, shown BEFORE the charge (LD 41 (d)); never a literal.
    expect(feeBody.coveredByTripPass, "a fresh plan holds no Trip Pass").toBe(false);
    expect(feeBody.currency).toBe("USD");
    expect(feeBody.feeCents).toBeGreaterThan(0);
    await expect(testid(page, "slip-optimize-preview-fee")).toContainText(`$${(feeBody.feeCents / 100).toFixed(2)}`);
    // B3 (ledger `2026-09-30-b3-b6-draft-is-the-deliverable`): the fee line states the ONE re-run
    // rule — the same sentence the comparison board renders (LD 41 (a)).
    await expect(testid(page, "slip-optimize-preview-fee")).toContainText(
      "A re-run within 24 hours of a completed optimization is free.",
    );
  });
  test.fixme("§6 today — pay in test mode; the board shows the baseline and up to three versions; adopt one stop", async () => {
    // TODAY-PASSABLE IN THE PRODUCT, NOT IN THIS JOB: needs a Stripe test key (the job runs the stub,
    // ruling 38) and a model key for the run. Missing code: none — missing CI secrets.
  });
  test.fixme("§6 — one version per hotel, each naming a distinct optionId; a badge only on the metric winner", async () => {
    // Waits on the §F2 delta (P-2e: per-version option picks, earned badges R128, adopt-stops) —
    // after A3/A4 give the run an open set to read.
  });
});

// ── §7 · choose, finalize, checkout, book, cancel ─────────────────────────────────────────────
test.describe("7 · choose, finalize, checkout, book, cancel", () => {
  test("§7 A3 — Finalize with an open set → 409 open_option_sets; choose → set 'chosen', one stay item", async ({ page }) => {
    const tripId = await planWithOccasion(page, "a3-final", "travel");
    await createItem(page.request, tripId, "Nishiki Market lunch", 1);
    const created = await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets`, {
      data: { categoryKey: "accommodation", label: "Where you'll stay", anchor: true },
    });
    expect(created.status()).toBe(201);
    const setId = (await created.json()).set.id as string;
    for (const stay of KYOTO_STAYS.slice(0, 2)) {
      const r = await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/options`, {
        data: { source: { kind: "custom", title: stay.name, lat: Number(stay.lat), lng: Number(stay.lng) } },
      });
      expect(r.status()).toBe(201);
    }
    await page.goto(`/plans/${tripId}`);
    const finalize = testid(page, "slip-action-finalize-plan");
    await expect(finalize).toBeVisible({ timeout: 20_000 });
    const refused = await actAndAwait(page, () => finalize.click(), { method: "POST", path: new RegExp(`^/api/trips/${tripId}/finalize$`) });
    expect(refused, "an open comparison blocks Finalize (R125)").toBe(409);
    const [before] = await rows<{ finalized: boolean }>(`SELECT finalized_at IS NOT NULL AS finalized FROM trips WHERE id = $1`, [tripId]);
    expect(before.finalized).toBe(false);

    const first = page.locator(`[data-testid="slip-option-set-${setId}"] [data-testid^="slip-option-choose-"]`).first();
    await expect(first).toBeVisible({ timeout: 10_000 });
    const chose = await actAndAwait(page, () => first.click(), { method: "POST", path: new RegExp(`^/api/trips/${tripId}/option-sets/${setId}/choose$`) });
    expect(ok2xx(chose)).toBe(true);
    await expect(testid(page, `slip-option-set-${setId}`)).toHaveCount(0);
    const [set] = await rows<{ status: string }>(`SELECT status FROM plan_option_sets WHERE id = $1`, [setId]);
    expect(set.status).toBe("chosen");
    const [stays] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM itinerary_items WHERE trip_id = $1 AND item_type = 'accommodation'`, [tripId]);
    expect(stays.n).toBe(1);
  });
  test("§7 today — Finalize snapshots the plan and the chooser asks once who books", async ({ page }) => {
    await signedInTraveler(page, "s7");
    const tripId = await createTrip(page.request, "Kyoto trip", KYOTO);
    await createItem(page.request, tripId, "Nishiki Market lunch", 1);
    await page.goto(`/plans/${tripId}`);

    const finalize = testid(page, "slip-action-finalize-plan");
    await expect(finalize).toBeVisible({ timeout: 20_000 });
    const status = await actAndAwait(page, () => finalize.click(), {
      method: "POST",
      path: new RegExp(`^/api/trips/${tripId}/finalize$`),
    });
    expect(ok2xx(status), `finalize answered ${status}`).toBe(true);

    // DOM: the chooser (LD 42 D2) — "I'll book these" is the self-serve answer.
    await expect(testid(page, "finalize-modal")).toBeVisible({ timeout: 10_000 });
    await expect(testid(page, "finalize-option-myself")).toBeVisible();

    // DB: a finalized plan with its first Trip Card version.
    const [trip] = await rows<{ finalized: boolean }>(
      `SELECT finalized_at IS NOT NULL AS finalized FROM trips WHERE id = $1`,
      [tripId],
    );
    expect(trip.finalized).toBe(true);
  });
  test("§7 A8 — Finalize computes the plan's legs, and they agree with plan-fit per day within 25%", async ({ page }) => {
    // R228: Finalize runs activate-transport through the ONE travel-time service, from the plan's
    // ITEMS. The fixture sits north of every seeded Kyoto neighbourhood, so both sides read the same
    // straight-line tier (CI has no Routes key; the matrix stand-in covers the centre) — the check is
    // that the two per-day numbers agree, and a day that does not is NAMED. The stay is placed on a
    // day with no stops so its own item joins neither side.
    const tripId = await planWithOccasion(page, "a8-legs", "travel");
    const stops: Array<[string, number, string, string]> = [
      ["North walk", 1, "35.0935", "135.7600"],
      ["South walk", 1, "35.0665", "135.7600"],
      ["East garden", 2, "35.0800", "135.7765"],
      ["West garden", 2, "35.0800", "135.7435"],
    ];
    for (const [title, day, latitude, longitude] of stops) await createItem(page.request, tripId, title, day, { latitude, longitude });
    const created = await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets`, {
      data: { categoryKey: "accommodation", label: "Where you'll stay", anchor: true, dayNumber: 3 },
    });
    expect(created.status(), await created.text()).toBe(201);
    const setId = (await created.json()).set.id as string;
    const added = await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/options`, {
      data: { source: { kind: "custom", title: "Kitayama stay", lat: 35.08, lng: 135.76 } },
    });
    expect(added.status(), await added.text()).toBe(201);
    const optionId = (await added.json()).option.id as string;

    const set = await serverSet(page, tripId, setId);
    const fit = set.options.find((o: any) => o.id === optionId).fit;
    expect(fit.scored, "plan-fit scores the chosen stay").toBe(true);

    const chose = await page.request.post(`${BASE_URL}/api/trips/${tripId}/option-sets/${setId}/choose`, { data: { optionId } });
    expect(ok2xx(chose.status()), await chose.text()).toBe(true);
    const fin = await page.request.post(`${BASE_URL}/api/trips/${tripId}/finalize`, { data: {} });
    expect(ok2xx(fin.status()), await fin.text()).toBe(true);
    expect((await fin.json()).transportLegsCreated, "Finalize wrote the plan's legs").toBeGreaterThan(0);

    const legRows = await rows<{ day: number; minutes: number; reason: string | null }>(
      `SELECT day_number AS day, estimated_duration_minutes AS minutes, alternative_modes->0->>'reason' AS reason
         FROM transport_legs WHERE trip_id = $1 AND variant_id IS NULL`,
      [tripId],
    );
    expect(legRows.length).toBe(2);
    for (const l of legRows) expect(l.reason, "a straight-line leg carries its 'est.' label").toBe("est.");
    const legsByDay: Record<number, number> = {};
    for (const l of legRows) legsByDay[l.day] = (legsByDay[l.day] ?? 0) + Number(l.minutes);
    const agreement = perDayAgreement(legsByDay, fit.minutesByDay);
    expect(agreement.agrees, `legs vs plan-fit disagree on day(s) ${agreement.disagreeing.join(", ")}: ${JSON.stringify(agreement.days)}`).toBe(true);
  });
  test.fixme("§7 today — a staged listing shows the traveler fee on the slip, checks out, books, and cancels to a refund", async () => {
    // Waits on A0 (a3) supply: a live instant-mode Kyoto listing with a price, a future open slot and
    // a `moderate` tier (P-1c). None exists in a DB built from empty and no seeder writes one; the
    // checkout/cancel legs also need a Stripe test key. Then: route → ready_for_checkout;
    // slip-traveler-fee-preview = GET /api/cart travelerFeePreview; assertCheckoutAccepted;
    // confirmPaymentIntentTestMode; one service_bookings 'confirmed'; cancel-preview = refund (R166);
    // the item never reads "Booked" (R145).
  });
  test.fixme("§7 — the chosen partner hotel goes through the booking-agent rail and reads 'prepared, awaiting purchase'", async () => {
    // Waits on a hotel option → stay item → booking-agent request path (golden path Appendix B Q3).
  });
});

// ── §7 · a local expert checks the plan (the expert door) ─────────────────────────────────────
/**
 * The expert door (ledger `2026-09-29-expert-door`; decision-maker dispatch Sep 29, 2026). The
 * picker's supply is ONE fixture expert per test, seeded by `scripts/seed-fixture-kyoto-expert.ts`
 * — the one place this spec writes supply, because a byline-gated expert needs a VERIFIED
 * neighbourhood and the database lets only the claim services birth one (LD 27). The script refuses
 * to run without ALLOW_TEST_ACCOUNTS=1. Everything the TRAVELER does goes through the app's rails.
 */
function seedKyotoExpert(label: string, opts: { ungated?: boolean } = {}): { expertId: string; handle: string; serviceId: string; neighborhood: string } {
  const out = execFileSync("npx", ["tsx", "scripts/seed-fixture-kyoto-expert.ts", label, ...(opts.ungated ? ["--ungated"] : [])], {
    env: { ...process.env, ALLOW_TEST_ACCOUNTS: "1" },
    encoding: "utf8",
    timeout: 120_000,
  });
  const line = out.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  if (!line) throw new Error(`fixture seed printed nothing: ${out}`);
  return JSON.parse(line);
}

type DoorRow = { level: string | null; tier: string | null; market: string | null; count: number | null; itemId: string | null; question: string | null };
async function doorRows(tripId: string, type: string): Promise<DoorRow[]> {
  return rows<DoorRow>(
    `SELECT properties->>'level' AS level, properties->>'tier' AS tier, properties->>'market' AS market,
            (properties->>'count')::int AS count, properties->>'itemId' AS "itemId", properties->>'question' AS question
       FROM funnel_events WHERE trip_id = $1 AND event_type = $2 ORDER BY created_at`,
    [tripId, type],
  );
}

test.describe("7 · a local expert checks the plan", () => {
  test("§7 expert door — 'Get a local expert' mints the plan, records finish=local_expert and opens the help card", async ({ page }) => {
    await signedInTraveler(page, "door");
    await openModalFromHero(page);
    expect(await fillPlanModalToFinish(page, KYOTO, { occasionSlug: "travel", lenDays: 5 })).toBe(true);
    let tripId: string | null = null;
    const status = await actAndAwait(page, async () => { tripId = await clickPlanFinish(page, "local"); }, { method: "POST", path: /^\/api\/trips$/ });
    expect(ok2xx(status)).toBe(true);
    expect(tripId).toBeTruthy();
    await expect(page).toHaveURL(new RegExp(`/plans/${tripId}`));
    await expect(testid(page, "expert-door-card")).toBeVisible({ timeout: 20_000 });
    await expect(testid(page, "expert-door-card")).toContainText("How much help do you want?");
    for (const level of ["check", "plan", "handle", "question"]) await expect(testid(page, `expert-door-level-${level}`)).toBeVisible();
    // The finish is its own property beside the door (slip-funnel-events §3.1 amendment 2026-09-29).
    const [row] = await rows<{ finish: string | null; door: string | null }>(
      `SELECT properties->>'finish' AS finish, properties->>'door' AS door FROM funnel_events WHERE trip_id = $1 AND event_type = 'trip_created'`,
      [tripId],
    );
    expect(row).toEqual({ finish: "local_expert", door: "hero" });
  });

  test("§7 expert door — dismissed, the card becomes 'Add a local expert' in the header and comes back", async ({ page }) => {
    await signedInTraveler(page, "door-dismiss");
    const tripId = await createTrip(page.request, "Kyoto door", KYOTO);
    await page.goto(`/plans/${tripId}?help=expert`);
    await expect(testid(page, "expert-door-card")).toBeVisible({ timeout: 20_000 });
    await testid(page, "expert-door-dismiss").click();
    await expect(testid(page, "expert-door-card")).toHaveCount(0);
    await expect(testid(page, "slip-add-local-expert")).toHaveText("Add a local expert");
    await page.reload();
    await expect(testid(page, "slip-add-local-expert")).toBeVisible({ timeout: 20_000 });
    await testid(page, "slip-add-local-expert").click();
    await expect(testid(page, "expert-door-card")).toBeVisible();
  });

  test("§7 expert door — a market with no expert says so, naming the city, and records the interest", async ({ page }) => {
    await signedInTraveler(page, "door-empty");
    const tripId = await createTrip(page.request, "Jaipur door", "Jaipur, India");
    await createItem(page.request, tripId, "Amber Fort", 1);
    await page.goto(`/plans/${tripId}?help=expert`);
    await expect(testid(page, "expert-door-card")).toBeVisible({ timeout: 20_000 });
    // No band anywhere: nobody offers anything here, and a number would be invented (§13).
    await expect(page.locator('[data-testid^="expert-door-band-"]')).toHaveCount(0);
    const shown = await actAndAwait(page, () => testid(page, "expert-door-level-plan").click(), {
      method: "GET",
      path: new RegExp(`^/api/trips/${tripId}/expert-help/picker$`),
    });
    expect(ok2xx(shown)).toBe(true);
    const empty = testid(page, "expert-picker-empty");
    await expect(empty).toContainText("No local expert offers this in Jaipur yet");
    await expect(testid(page, "expert-picker-list").locator("li")).toHaveCount(0);
    await testid(page, "expert-picker-interest").click();
    await expect.poll(async () => (await doorRows(tripId, "expert_interest")).length, { timeout: 10_000 }).toBe(1);
    expect((await doorRows(tripId, "expert_interest"))[0]).toMatchObject({ level: "plan", tier: "planning", market: "jaipur" });
    expect((await doorRows(tripId, "expert_help_level_chosen"))[0]).toMatchObject({ level: "plan", tier: "planning" });
    expect((await doorRows(tripId, "expert_picker_shown"))[0]).toMatchObject({ level: "plan", count: 0 });
  });

  test("§7 R-r — with no local live in the city, ⋯ Ask a local about this records the item and the question, charging nothing", async ({ page }) => {
    // Surface step 1 (ledger `2026-10-03-surface-step1-item-row`).
    await signedInTraveler(page, "ask-local");
    const tripId = await createTrip(page.request, "Jaipur ask", "Jaipur, India");
    const itemId = await createItem(page.request, tripId, "Amber Fort", 1);
    await page.goto(`/plans/${tripId}`);
    await testid(page, `item-menu-${itemId}`).click();
    await testid(page, `item-menu-ask-local-${itemId}`).click();
    await testid(page, `item-ask-local-input-${itemId}`).fill("Is the elephant ride still running?");
    const saved = await actAndAwait(page, () => testid(page, `item-ask-local-save-${itemId}`).click(), {
      method: "POST",
      path: new RegExp(`^/api/trips/${tripId}/slip-events$`),
    });
    expect(ok2xx(saved)).toBe(true);
    await expect(testid(page, `item-ask-local-saved-${itemId}`)).toContainText("nothing was charged");
    expect((await doorRows(tripId, "expert_interest"))[0]).toMatchObject({
      level: "question",
      market: "jaipur",
      itemId,
      question: "Is the elephant ride still running?",
    });
  });

  test("§7 expert door — the picker shows only byline-gated experts who list the level", async ({ page }) => {
    const gated = seedKyotoExpert("pick");
    const ungated = seedKyotoExpert("nogate", { ungated: true });
    await signedInTraveler(page, "door-pick");
    const tripId = await createTrip(page.request, "Kyoto pick", KYOTO);
    await createItem(page.request, tripId, "Yasaka Shrine", 1);
    await page.goto(`/plans/${tripId}?help=expert`);
    await expect(testid(page, "expert-door-card")).toBeVisible({ timeout: 20_000 });
    // "Check my plan" lists the fixture's advisory offering; its band is its own price.
    await expect(testid(page, "expert-door-band-check")).toContainText("$60");
    await testid(page, "expert-door-level-check").click();
    await expect(testid(page, `expert-picker-card-${gated.handle}`)).toBeVisible({ timeout: 20_000 });
    await expect(testid(page, `expert-picker-card-${ungated.handle}`)).toHaveCount(0);
    await expect(testid(page, `expert-picker-card-${gated.handle}`)).toContainText(gated.neighborhood);
    await expect(testid(page, `expert-picker-request-${gated.serviceId}`)).toBeVisible();
    // The same expert lists no planning offering, so "Plan it with me" never shows them.
    const api = await (await page.request.get(`${BASE_URL}/api/trips/${tripId}/expert-help/picker?level=plan`)).json();
    expect(api.experts.map((x: any) => x.handle)).not.toContain(gated.handle);
    // No user id crosses the wire (LD 40).
    const check = await (await page.request.get(`${BASE_URL}/api/trips/${tripId}/expert-help/picker?level=check`)).json();
    expect(JSON.stringify(check)).not.toContain(gated.expertId);
  });

  test("§7 — a local expert checks the plan: Request attaches them through the storefront rail and the card hides", async ({ page }) => {
    const expert = seedKyotoExpert("checks");
    await signedInTraveler(page, "door-req");
    const tripId = await createTrip(page.request, "Kyoto request", KYOTO);
    await createItem(page.request, tripId, "Fushimi Inari", 1);
    await page.goto(`/plans/${tripId}?help=expert`);
    await testid(page, "expert-door-level-check").click();
    const req = testid(page, `expert-picker-request-${expert.serviceId}`);
    await expect(req).toBeVisible({ timeout: 20_000 });
    const posted = await actAndAwait(page, () => req.click(), { method: "POST", path: /^\/api\/expert-booking-requests$/ });
    expect(ok2xx(posted)).toBe(true);
    // DB: the advisor row came from the ONE author (pending until the expert accepts, §12).
    const [adv] = await rows<{ status: string }>(
      `SELECT status FROM trip_expert_advisors WHERE trip_id = $1 AND local_expert_id = $2`,
      [tripId, expert.expertId],
    );
    expect(adv?.status).toBe("pending");
    await expect.poll(async () => (await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM funnel_events WHERE trip_id = $1 AND event_type = 'expert_request_sent'`, [tripId])
    )[0].n, { timeout: 10_000 }).toBe(1);
    // DOM: with an expert attached neither the card nor the header control renders.
    await page.reload();
    await expect(testid(page, "slip-view-toggle")).toBeVisible({ timeout: 20_000 });
    await expect(testid(page, "expert-door-card")).toHaveCount(0);
    await expect(testid(page, "slip-add-local-expert")).toHaveCount(0);
  });
});

// ── §8 · a month later ────────────────────────────────────────────────────────────────────────
test.describe("8 · a month later", () => {
  test("§8 today — Home's time axis carries the trip start, and /trip/:id shows the Trip Card rail and its version", async ({ page }) => {
    await signedInTraveler(page, "s8");
    const tripId = await createTrip(page.request, "Kyoto trip", KYOTO);
    await createItem(page.request, tripId, "Philosopher's Path", 1);
    const [trip] = await rows<{ start_date: string }>(
      `SELECT to_char(start_date, 'YYYY-MM-DD') AS start_date FROM trips WHERE id = $1`,
      [tripId],
    );

    // Finalize through the app's own rail (the §7 test proves the press; this is setup).
    const fin = await page.request.post(`${BASE_URL}/api/trips/${tripId}/finalize`, { data: {} });
    expect(fin.status(), await fin.text()).toBe(200);

    const upcoming = await page.request.get(`${BASE_URL}/api/me/upcoming`);
    expect(upcoming.status()).toBe(200);
    const body = (await upcoming.json()) as { rows: Array<{ kind: string; tripId?: string; date: string }> };
    const start = body.rows.find((r) => r.kind === "trip_start" && r.tripId === tripId);
    expect(start, "the trip start is on Home's time axis").toBeTruthy();
    expect(start!.date).toBe(trip.start_date);

    const plancard = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/trips/${tripId}/plancard` && r.request().method() === "GET",
    );
    await page.goto(`/trip/${tripId}`);
    expect(ok2xx((await plancard).status())).toBe(true);
    await expect(testid(page, "trip-card-rail")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Final · v1").first()).toBeVisible();
  });
  test("§8 — Home's upcoming rows state the traveler-chosen dates as confirmed (a countdown may render)", async ({ page }) => {
    // Ledger `2026-09-28-upcoming-dates-confirmed`: the loader now hands the builder the
    // `trips.dates_confirmed_at` it reads, so a plan whose dates the traveler chose makes NO
    // placeholder claim (`datesConfirmed` is present only when it is false — LD 30 / LD 45 (8)).
    await signedInTraveler(page, "s8c");
    const tripId = await createTrip(page.request, "Kyoto trip", KYOTO);
    const [trip] = await rows<{ confirmed: boolean }>(
      `SELECT dates_confirmed_at IS NOT NULL AS confirmed FROM trips WHERE id = $1`,
      [tripId],
    );
    expect(trip.confirmed, "the traveler's own mint stamps dates_confirmed_at").toBe(true);

    const upcoming = await page.request.get(`${BASE_URL}/api/me/upcoming`);
    expect(upcoming.status()).toBe(200);
    const body = (await upcoming.json()) as { rows: Array<{ kind: string; tripId?: string; datesConfirmed?: boolean }> };
    const start = body.rows.find((r) => r.kind === "trip_start" && r.tripId === tripId);
    expect(start, "the trip start is on Home's time axis").toBeTruthy();
    expect("datesConfirmed" in start!, "a chosen window is not labelled a placeholder").toBe(false);
  });
  test.fixme("§8 today — the refunded activity reads refunded on the Trip Card", async () => {
    // Waits on §7's booking + cancel (A0 (a3) supply and a Stripe test key).
  });
  test.fixme("§8 — per-plan run history", async () => {
    // Waits on optimizer run records (Part 2 N, P-2g).
  });
});
