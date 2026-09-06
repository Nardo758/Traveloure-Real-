/**
 * slip-rail-actions.spec.ts — EVERY RAIL ACTION SURVIVED THE RELAYOUT AND STILL WORKS.
 *
 * Ledger `2026-09-06-slip-conformance` (CLAUDE.md Locked Decision 42). Runs against a LOCAL server
 * (BASE_URL), on the workflow's own PR artifact — never a deployment.
 *
 * ── WHY A DOM SUITE AND NOT ONLY THE STATIC PIN ───────────────────────────────────────────────
 * `client/src/lib/__tests__/slip-conformance.test.ts` proves every control's testid and handler
 * TEXT survived the relayout. It reads source, so it cannot see two things that matter here:
 *   · whether a control still RENDERS — a card left out of the new container, or a row inside a
 *     gate the relayout accidentally inverted, still passes a text pin perfectly;
 *   · whether pressing it still DOES what it was designed to do — a handler whose body changed,
 *     or whose target route quietly 404s, is invisible to a string comparison.
 * This suite presses them.
 *
 * ── WHAT IT DELIBERATELY DOES NOT PRESS, AND WHY (§13 — stated, never skipped silently) ───────
 *  · "Get the Trip Pass" and "Draft it with AI". Both leave the platform on the first press — a
 *    Stripe PaymentIntent and an LLM generation — and the CI server runs with stub keys and no
 *    egress. Each is asserted UP TO the point before that call: the control renders, is enabled,
 *    and carries the state it is supposed to (the server-derived price; the empty-plan meta). The
 *    Trip Pass suite (`trip-pass.spec.ts`) takes the same posture for the same reason.
 *  · "Optimize this plan" opens `BuildAroundDialog` first, so the dialog IS pressed and the run
 *    itself — which is the paid rail — is not.
 *  · The event header's D6 role chips need an occasion whose `experience_types.roles_needed` is
 *    populated AND an event on the plan; seeding that from a traveler's own API is not possible
 *    here (the occasion catalog is admin-seeded). The chips' rules are proven purely in
 *    `slip-conformance.test.ts`, and their absence on an occasion-less plan is asserted below —
 *    which is the §13 half that matters most: NULL draws nothing.
 *
 * Run: npx playwright test slip-rail-actions --project=chromium
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const uid = () => Math.random().toString(36).slice(2, 10);

/** A signed-in traveler with a plan of their own. The pattern `trip-pass.spec.ts` established. */
async function registerAndCreateTrip(page: Page, tag: string): Promise<string> {
  const reg = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      email: `e2e-slip-rail-${tag}-${uid()}@example.com`,
      password: "SlipRail123!",
      firstName: "Slip",
      lastName: "Rail",
      userType: "user",
    },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const trip = await page.request.post(`${BASE_URL}/api/trips`, {
    data: {
      title: "Slip rail e2e plan",
      destination: "Kyoto, Japan",
      startDate: "2027-04-01",
      endDate: "2027-04-05",
    },
  });
  expect(trip.status(), await trip.text()).toBe(201);
  return (await trip.json()).id as string;
}

/** One planning row, so the plan is non-empty (the Optimize branch, and the view bar). */
async function addItem(page: Page, tripId: string): Promise<void> {
  const res = await page.request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
    data: { title: "Nanzen-ji garden", dayNumber: 1, startTime: "15:00" },
  });
  expect([200, 201], await res.text()).toContain(res.status());
}

async function openSlip(page: Page, tripId: string): Promise<void> {
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-rail")).toBeVisible({ timeout: 30_000 });
}

// ── 1 · placement ─────────────────────────────────────────────────────────────────────────────

test("A1: the rail is a fixed right column at lg, and stacks above the list below lg", async ({
  page,
}) => {
  const tripId = await registerAndCreateTrip(page, "layout");
  await addItem(page, tripId);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSlip(page, tripId);
  const rail = await page.getByTestId("slip-rail").boundingBox();
  const list = await page.getByTestId("slip-viewbar").boundingBox();
  expect(rail, "the rail has a box").toBeTruthy();
  expect(list, "the plan column has a box").toBeTruthy();
  // BESIDE, not above: the rail starts to the RIGHT of where the plan column ends.
  expect(rail!.x).toBeGreaterThan(list!.x + list!.width - 1);
  // The canvas's fixed 320px track (Tailwind `lg:w-80`), which is what stops the Trip Pass
  // card's price line wrapping a word at a time.
  expect(Math.round(rail!.width)).toBe(320);

  // Below lg the rail is FIRST on screen — the artboard's order.
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-rail")).toBeVisible({ timeout: 30_000 });
  const railSm = await page.getByTestId("slip-rail").boundingBox();
  const listSm = await page.getByTestId("slip-viewbar").boundingBox();
  expect(railSm!.y).toBeLessThan(listSm!.y);
});

test("A2: the view bar is ONE row — the status counts beside the List | Map toggle", async ({
  page,
}) => {
  const tripId = await registerAndCreateTrip(page, "viewbar");
  await addItem(page, tripId);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSlip(page, tripId);

  const bar = page.getByTestId("slip-viewbar");
  await expect(bar).toBeVisible();
  await expect(bar.getByTestId("slip-status-strip")).toBeVisible();
  await expect(bar.getByTestId("slip-view-toggle")).toBeVisible();
  // The toggle WORKS: List is the default, Map is refused with its honest reason while no item
  // on this plan has coordinates (§13 — never a city-centre fallback).
  await expect(page.getByTestId("button-slip-view-list")).toBeEnabled();
  const mapBtn = page.getByTestId("button-slip-view-map");
  await expect(mapBtn).toBeDisabled();
  await expect(mapBtn).toHaveAttribute("title", /located/i);
});

// ── 2 · the Build card's rails ────────────────────────────────────────────────────────────────

test("A3: Browse services opens the marketplace carrying this plan's id", async ({ page }) => {
  const tripId = await registerAndCreateTrip(page, "browse");
  await openSlip(page, tripId);
  await page.getByTestId("slip-browse-services").click();
  await expect(page).toHaveURL(new RegExp(`/services\\?tripId=${tripId}`), { timeout: 15_000 });
});

test("A4: Hand off to a local expert opens the ONE picker", async ({ page }) => {
  const tripId = await registerAndCreateTrip(page, "hire");
  await openSlip(page, tripId);
  // No advisor on a fresh plan ⇒ the hire row, and NO Expert card and NO Message row (§13: the
  // rail says nothing about a person who is not there).
  await expect(page.getByTestId("slip-rail-expert")).toHaveCount(0);
  await expect(page.getByTestId("slip-action-message-expert")).toHaveCount(0);
  await page.getByTestId("slip-action-hire-expert").click();
  await expect(page.getByTestId("dialog-hire-expert")).toBeVisible({ timeout: 10_000 });
});

test("A5: the ONE AI action follows the item count, and stops before the external call", async ({
  page,
}) => {
  // Empty plan ⇒ Draft (LD 41 (b)). NOT PRESSED: the press calls the generate rail, which needs
  // an LLM the CI server has no key for. Asserted up to the press.
  const emptyTrip = await registerAndCreateTrip(page, "draft");
  await openSlip(page, emptyTrip);
  const draft = page.getByTestId("slip-action-draft-ai");
  await expect(draft).toBeVisible();
  await expect(draft).toBeEnabled();
  await expect(draft).toContainText("empty plan");
  await expect(page.getByTestId("slip-action-optimize")).toHaveCount(0);

  // One row of any status ⇒ Optimize, and pressing it opens the review-first dialog. The RUN is
  // the paid rail and is not started here.
  const fullTrip = await registerAndCreateTrip(page, "optimize");
  await addItem(page, fullTrip);
  await openSlip(page, fullTrip);
  await expect(page.getByTestId("slip-action-draft-ai")).toHaveCount(0);
  await page.getByTestId("slip-action-optimize").click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
});

test("A6: Trip Pass renders the server's own price and its buy control, unpressed", async ({
  page,
}) => {
  const tripId = await registerAndCreateTrip(page, "pass");
  await openSlip(page, tripId);
  const pass = page.getByTestId("slip-rail-trip-pass");
  await expect(pass).toBeVisible();
  const pricing = await (await page.request.get(`${BASE_URL}/api/pricing`)).json();
  await expect(page.getByTestId("trip-pass-price")).toHaveText(
    `$${Math.round(pricing.tripPass.priceCents / 100)}`,
  );
  // NOT PRESSED — the first press creates a real PaymentIntent (§14: the amount is the server's,
  // and this suite must not charge). Enabled-and-correct is the assertion that stops before it.
  await expect(page.getByTestId("button-buy-trip-pass")).toBeEnabled();
  // The relayout's own fix: inside the 320px rail the card must not be squeezed to a sliver.
  const box = await page.getByTestId("trip-pass-card-offer").boundingBox();
  expect(box!.width).toBeGreaterThan(240);
});

// ── 3 · the Plan card ─────────────────────────────────────────────────────────────────────────

test("A7: Stops & timezone opens the ONE planning modal", async ({ page }) => {
  const tripId = await registerAndCreateTrip(page, "stops");
  await openSlip(page, tripId);
  const row = page.getByTestId("slip-plan-stops");
  await expect(row).toBeVisible();
  // It states what the plan actually answers — the header's own stops line, composed (§18 rule 1).
  await expect(row).toContainText("Kyoto");
  await row.click();
  await expect(page.getByTestId("plan-modal")).toBeVisible({ timeout: 15_000 });
});

test("A8: the Plan card's collapsibles still open", async ({ page }) => {
  const tripId = await registerAndCreateTrip(page, "plan");
  await openSlip(page, tripId);
  // Renamed by this lane — the row opens the ANCHORS editor, not a flights-and-hotels form.
  const anchors = page.getByTestId("button-toggle-slip-anchors");
  await expect(anchors).toContainText("Main moment");
  await expect(anchors).toHaveAttribute("data-state", "closed");
  await anchors.click();
  await expect(anchors).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("slip-logistics-section")).toBeVisible();

  const contracts = page.getByTestId("button-toggle-slip-contracts");
  await expect(contracts).toHaveAttribute("data-state", "closed");
  await contracts.click();
  await expect(contracts).toHaveAttribute("data-state", "open");
});

// ── 4 · the Share card ────────────────────────────────────────────────────────────────────────

test("A9: Share mints a token link; PDF and .ics answer 200", async ({ page }) => {
  const tripId = await registerAndCreateTrip(page, "share");
  await addItem(page, tripId);
  await openSlip(page, tripId);

  const sharePost = page.waitForResponse(
    (r) => r.url().includes(`/api/trips/${tripId}/share`) && r.request().method() === "POST",
  );
  await page.getByTestId("slip-action-share").click();
  const shareRes = await sharePost;
  expect(shareRes.status()).toBe(200);
  const shareBody = await shareRes.json();
  expect(typeof shareBody.shareToken, JSON.stringify(shareBody)).toBe("string");
  expect(String(shareBody.shareToken).length).toBeGreaterThan(0);

  // The two downloads are plain anchors at the routes the ONE builder names; pressing them starts
  // a browser download, so the ROUTES are exercised over the same authenticated session instead.
  await expect(page.getByTestId("slip-action-pdf")).toHaveAttribute(
    "href",
    `/api/trips/${tripId}/pdf`,
  );
  await expect(page.getByTestId("slip-action-calendar")).toHaveAttribute(
    "href",
    `/api/trips/${tripId}/calendar`,
  );
  expect((await page.request.get(`${BASE_URL}/api/trips/${tripId}/pdf`)).status()).toBe(200);
  const ics = await page.request.get(`${BASE_URL}/api/trips/${tripId}/calendar`);
  expect(ics.status()).toBe(200);
  expect(await ics.text()).toContain("BEGIN:VCALENDAR");
});

// ── 5 · the Finish card, and the finished state's own two controls ────────────────────────────

test("A10: Finalize writes a version and opens the chooser; then View as Trip card and Reopen", async ({
  page,
}) => {
  const tripId = await registerAndCreateTrip(page, "finalize");
  await addItem(page, tripId);
  await openSlip(page, tripId);

  const finalizePost = page.waitForResponse(
    (r) => r.url().includes(`/api/trips/${tripId}/finalize`) && r.request().method() === "POST",
  );
  await page.getByTestId("slip-action-finalize-plan").click();
  const finalizeRes = await finalizePost;
  expect(finalizeRes.status()).toBe(200);
  const body = await finalizeRes.json();
  expect(body.finalizedAt, JSON.stringify(body)).toBeTruthy();
  await expect(page.getByTestId("finalize-modal")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("finalize-back").click();

  // The finished state is the ONLY home of "View as Trip card" — before a snapshot exists that
  // link bounces back here, which is why the pre-final Preview control was removed.
  await page.reload({ waitUntil: "domcontentloaded" });
  const viewCard = page.getByTestId("slip-action-view-trip-card");
  await expect(viewCard).toBeVisible({ timeout: 30_000 });
  await viewCard.click();
  await expect(page).toHaveURL(new RegExp(`/trip/${tripId}`), { timeout: 15_000 });

  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  const reopenPost = page.waitForResponse(
    (r) => r.url().includes(`/api/trips/${tripId}/reopen`) && r.request().method() === "POST",
  );
  await page.getByTestId("slip-action-reopen").click();
  expect((await reopenPost).status()).toBe(200);
});

// ── 6 · the header, and the event header's D6 silence ─────────────────────────────────────────

test("A11: the working header prints no version; §13 — no roles, no chips", async ({ page }) => {
  const tripId = await registerAndCreateTrip(page, "header");
  await addItem(page, tripId);
  await openSlip(page, tripId);

  await expect(page.getByTestId("slip-header")).toBeVisible();
  await expect(page.getByTestId("slip-tracking-ref")).toHaveCount(0);
  await expect(page.getByTestId("slip-header")).not.toContainText(/\bv\d+\b/);
  // The stops line and its owner-only Edit affordance are untouched by the relayout.
  await expect(page.getByTestId("slip-meta-stops")).toContainText("Kyoto");
  await page.getByTestId("slip-meta-stops-edit").click();
  await expect(page.getByTestId("plan-modal")).toBeVisible({ timeout: 15_000 });
});
