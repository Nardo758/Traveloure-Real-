import { test, expect, type Page } from "@playwright/test";
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
      .toEqual({ door: "hero", occasionSource: "asked", datesConfirmed: true, market: "kyoto" });
  });

  test.fixme("§1 — the header shows the occasion's own name and the plan resolves to the Trips group", async () => {
    // Waits on A1 (the Trips frame): `experienceGroupFor` + the B1 header. Today the slip header
    // renders no occasion name (golden path step 1, "Gap — NOT BUILT"; P-2h).
  });
});

// ── §2 · where are you staying ────────────────────────────────────────────────────────────────
test.describe("2 · where are you staying", () => {
  test.fixme("§2 — the anchor question card opens a set; three options admitted, a fourth refused (cap 3)", async () => {
    // Waits on A3 (S1/S2: the anchor question card + the plan_option_sets rails, P-2a/P-2b) and on
    // the A1 supply gate (R193: ≥ 12 located Kyoto hotel_cache rows). POST …/option-sets → 201;
    // POST …/options ×3 → 201, 4th → 409; DB: one set 'open', 3 plan_options, itinerary_items 0.
  });
  test.fixme("§2 — GLANCE reads '3 to compare' and an option with no stated price shows no price", async () => {
    // Waits on A3 (S1 compare set at GLANCE; K1 rule 1 — no "$0").
  });
});

// ── §3 · plan-fit per hotel ───────────────────────────────────────────────────────────────────
test.describe("3 · plan-fit per hotel", () => {
  test.fixme("§3 — before the draft every option shows the 'add a few things' line and no minutes", async () => {
    // Waits on A4 (plan-fit in the compare view, §E4 scoring the CHOSEN options).
  });
  test.fixme("§3 — after the draft each option carries medianMeters|null and a line with 'est.' and 'of N located'", async () => {
    // Waits on A4, with A2's Kyoto travel-time matrix deciding where "est." remains.
  });
  test.fixme("§3 — at 375×812 the option cards stack with no horizontal scroll", async () => {
    // Waits on A4 (the compare view at phone width; Part 6 mock screen 2).
  });
});

// ── §4 · free draft around the set ────────────────────────────────────────────────────────────
test.describe("4 · free draft around the set", () => {
  test("§4 today — Draft it with AI on an empty slip writes origin='ai' items and an 'AI draft' chip", async ({ page }) => {
    // Ledger `2026-09-28-kyoto-s4-draft-ci`: the job's server runs with E2E_AI_STUB=1, the ONE
    // explicit stand-in for the draft model (grok.service.ts; refused where ENVIRONMENT=PROD, and it
    // names itself `e2e-ai-stub` on every cost row). Everything after the model call is real code.
    // Assertions are STRUCTURAL — never the stand-in's prose.
    await signedInTraveler(page, "s4");
    const tripId = await createTrip(page.request, "Kyoto trip", KYOTO);
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
              `SELECT stage, properties FROM funnel_events WHERE trip_id = $1 AND event_type = 'slip_free_draft_run'`,
              [tripId],
            )
          ).map((r) => ({ stage: r.stage, properties: r.properties })),
        { timeout: 10_000 },
      )
      .toEqual([{ stage: "SLIP", properties: { outcome: "drafted", itemsWritten: items.length } }]);

    await page.reload();
    await expect(testid(page, `badge-origin-${items[0].id}`)).toHaveText(/AI draft/, { timeout: 20_000 });

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
  test.fixme("§4 — with an open hotel set the draft succeeds, leaves the set open and adds no accommodation", async () => {
    // Waits on the R126 held slot (P-2c) — the Track A step that builds the draft around an open set.
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
  test.fixme("§7 — Finalize with an open set → 409 open_option_sets; choose → set 'chosen', one stay item", async () => {
    // Waits on the S1 choose rail and B7's open-set refusal (R125, P-2f) — A3 onward.
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
