/**
 * slip-trip-card-link.spec.ts — TC-5a: THE SLIP LINKS TO THE TRIP CARD ON ANY PLAN THAT WAS EVER FINAL.
 *
 * Ledger `2026-10-12-tc5a-trip-card-entry`. Two placements read ONE predicate,
 * `tripCardHasFinal(trip.finalVersion)` (`shared/trip-primary-surface.ts`) — a `trip_finals` row
 * exists — and never `finalizedAt`, which goes null on "Back to planning":
 *   · the header link `slip-trip-card-link`, beside the phase chip, for EVERY viewer of the slip
 *     (the card's own read gate decides what they can open);
 *   · the ⋯ menu entry `slip-menu-trip-card`, after Share link, for the OWNER only (Share's rule).
 * The two older links (`slip-action-view-trip-card`, gated on `cardReady`) are untouched.
 *
 * Runs against a LOCAL server (BASE_URL) in the slip-rail-actions gate. The non-owner case seeds one
 * `trip_expert_advisors` row with psql — there is no lightweight API that mints it (the pattern
 * `lane1-phase1d-routing.spec.ts` established).
 *
 * Run: npx playwright test slip-trip-card-link --project=chromium
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execSync } from "child_process";
import { registerAndSignIn } from "../utils/auth";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const uid = () => Math.random().toString(36).slice(2, 10);

function sql(query: string): string {
  const db = process.env.DATABASE_URL;
  if (!db) throw new Error("DATABASE_URL is not set");
  const escaped = query.replace(/'/g, `'\\''`);
  return execSync(`psql '${db}' -t -A -c '${escaped}'`, { encoding: "utf8" }).trim();
}

async function register(ctx: APIRequestContext, tag: string): Promise<string> {
  const { id } = await registerAndSignIn(
    ctx,
    {
      email: `e2e-tc5a-${tag}-${uid()}@example.com`,
      password: "TripCard123!",
      firstName: "Card",
      lastName: "Link",
      extra: { userType: "user" },
    },
    BASE_URL,
  );
  return id;
}

/** A plan more than 48 h out, so finalize/reopen — not the date window — decides the card's state. */
async function planWithItem(ctx: APIRequestContext): Promise<{ tripId: string; itemId: string }> {
  const trip = await ctx.post(`${BASE_URL}/api/trips`, {
    data: { title: "Trip Card link plan", destination: "Kyoto, Japan", startDate: "2027-04-01", endDate: "2027-04-05" },
  });
  expect(trip.status(), await trip.text()).toBe(201);
  const tripId = (await trip.json()).id as string;
  const item = await ctx.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
    data: { title: "Nanzen-ji garden", dayNumber: 1, startTime: "15:00" },
  });
  expect([200, 201], await item.text()).toContain(item.status());
  return { tripId, itemId: (await item.json()).id as string };
}

async function finalize(ctx: APIRequestContext, tripId: string): Promise<void> {
  const res = await ctx.post(`${BASE_URL}/api/trips/${tripId}/finalize`);
  expect(res.status(), await res.text()).toBe(200);
}

async function openSlip(page: Page, tripId: string): Promise<void> {
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("slip-header")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("slip-title")).toBeVisible({ timeout: 30_000 });
}

async function expectHeaderLink(page: Page, tripId: string): Promise<void> {
  const link = page.getByTestId("slip-trip-card-link");
  await expect(link).toBeVisible({ timeout: 30_000 });
  await expect(link).toHaveText("Trip Card");
  await expect(link).toHaveAttribute("href", `/trip/${tripId}`);
}

async function menuEntry(page: Page) {
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByTestId("slip-plan-menu").click();
  await expect(page.getByRole("menu")).toBeVisible();
  return page.getByTestId("slip-menu-trip-card");
}

test("T1: a finalized plan shows the header link and the owner's menu entry, after Share link", async ({ page }) => {
  await register(page.request, "final");
  const { tripId } = await planWithItem(page.request);
  await finalize(page.request, tripId);
  await openSlip(page, tripId);
  await expectHeaderLink(page, tripId);

  const entry = await menuEntry(page);
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAttribute("href", `/trip/${tripId}`);
  // Placed after Share link.
  const items = await page.getByRole("menuitem").allTextContents();
  const share = items.findIndex((t) => t.includes("Share link"));
  const card = items.findIndex((t) => t.includes("Trip Card"));
  expect(share, items.join(" | ")).toBeGreaterThanOrEqual(0);
  expect(card, items.join(" | ")).toBe(share + 1);
});

test("T2: a time edit leaves the final out of date — the link stays", async ({ page }) => {
  await register(page.request, "edit");
  const { tripId, itemId } = await planWithItem(page.request);
  await finalize(page.request, tripId);
  const edit = await page.request.patch(`${BASE_URL}/api/trips/${tripId}/itinerary-items/${itemId}`, {
    data: { startTime: "16:30" },
  });
  expect(edit.status(), await edit.text()).toBe(200);
  const plan = await (await page.request.get(`${BASE_URL}/api/trips/${tripId}/plancard`)).json();
  expect(plan.trip.finalVersion, JSON.stringify(plan.trip)).not.toBeNull();
  expect(plan.trip.finalOutOfDate, "the edit made the final out of date").toBe(true);

  await openSlip(page, tripId);
  await expectHeaderLink(page, tripId);
  await expect(await menuEntry(page)).toBeVisible();
});

test("T3: after Back to planning on a plan more than 48 h out, the link stays", async ({ page }) => {
  await register(page.request, "reopen");
  const { tripId } = await planWithItem(page.request);
  await finalize(page.request, tripId);
  const reopen = await page.request.post(`${BASE_URL}/api/trips/${tripId}/reopen`);
  expect(reopen.status(), await reopen.text()).toBe(200);
  const plan = await (await page.request.get(`${BASE_URL}/api/trips/${tripId}/plancard`)).json();
  expect(plan.trip.finalizedAt ?? null, "reopened: finalizedAt is cleared").toBeNull();
  expect(plan.trip.finalVersion, "the final version survives the reopen").not.toBeNull();

  await openSlip(page, tripId);
  await expectHeaderLink(page, tripId);
  // The older cardReady-gated link is unchanged: with no finalizedAt and the start > 48 h away it is
  // not offered — which is the gap this link closes.
  await expect(page.getByTestId("slip-action-view-trip-card")).toHaveCount(0);
  await expect(await menuEntry(page)).toBeVisible();
});

test("T4: a plan that was never finalized shows neither", async ({ page }) => {
  await register(page.request, "never");
  const { tripId } = await planWithItem(page.request);
  await openSlip(page, tripId);
  await expect(page.getByTestId("slip-trip-card-link")).toHaveCount(0);
  const entry = await menuEntry(page);
  await expect(page.getByTestId("slip-action-share")).toBeVisible();
  await expect(entry).toHaveCount(0);
});

test("T5: a non-owner viewer (the plan's advisor) sees the header link but no menu entry", async ({ page, browser }) => {
  await register(page.request, "owner");
  const { tripId } = await planWithItem(page.request);
  await finalize(page.request, tripId);

  const expertCtx = await browser.newContext();
  const expertPage = await expertCtx.newPage();
  const expertId = await register(expertPage.request, "advisor");
  sql(`INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)
       VALUES (gen_random_uuid(), '${tripId}', '${expertId}', 'accepted')`);
  try {
    await openSlip(expertPage, tripId);
    await expectHeaderLink(expertPage, tripId);
    await expect(expertPage.getByTestId("slip-menu-trip-card")).toHaveCount(0);
    // The menu, if this viewer has one at all, does not carry the owner's entry.
    const trigger = expertPage.getByTestId("slip-plan-menu");
    if (await trigger.count()) {
      await trigger.click();
      await expect(expertPage.getByRole("menu")).toBeVisible();
      await expect(expertPage.getByTestId("slip-menu-trip-card")).toHaveCount(0);
    }
  } finally {
    await expertCtx.close();
  }
});
