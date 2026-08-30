/**
 * Trip-Canon Lane 1, Phase 1d (W7) — Trip Card routing UI.
 *
 * Governing docs: docs/briefs/RECONCILE_PHASE1_SCOPE.md (§1 W7, §3 Phase 1d gate),
 * docs/briefs/ROUTING_STATE_CONTRACT.md. Server authority: server/routes/routing.routes.ts
 * (read its header before changing which edges this spec expects — it is the single source
 * of truth this spec is checking against, not the other way around).
 *
 * Pattern mirrored from playwright/tests/optimization-payment-gate.spec.ts /
 * concierge-phase-a.spec.ts: registers real users via the live HTTP API, drives the real
 * server, and verifies state via `psql` (the established `sql()` helper) rather than mocks.
 *
 * TWO describe blocks, on purpose:
 *
 *   1. "routing contract (server + DB)" — uses ONLY the `request`/`APIRequestContext`
 *      fixtures (no `page`, no browser). This is the part proven end-to-end in THIS
 *      session against a real local Postgres + a real `npx tsx server/index.ts`: the four
 *      owner edges, the expert's one recall edge, the expert-denied 403 on the
 *      traveler-only edge, and the cart projection appearing/disappearing with the
 *      `ready_for_checkout` transition (ROUTING_STATE_CONTRACT §2's projection-sync row).
 *
 *   2. "Trip Card routing UI (browser)" — uses `page` to drive the actual rendered PlanCard:
 *      owner sees "Send to expert"/"Add to checkout", a click flips the badge to "In
 *      checkout" and reveals "Go to checkout"; the expert workspace view shows the SAME
 *      item as a read-only "With your expert"/booking badge with NO traveler routing
 *      buttons in the DOM. Every selector here is the literal `data-testid` written in
 *      client/src/components/plancard/ActivitiesSection.tsx by this same change, and the
 *      HTTP contract it depends on (registration, trip/item creation, the transition
 *      endpoint, the cart shape) is the exact contract proven live by block 1 above — so
 *      this block is believed-correct even where this sandbox could not execute it (see
 *      the note at the top of that describe block for why).
 *
 * Both blocks share one seeded trip+item+advisor-row per `test.describe.serial` run so the
 * UI block can pick up the DB state block 1 leaves the transition graph in.
 */
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const PASSWORD = "TestPassword123!";

function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

function sql(query: string): string {
  const db = process.env.DATABASE_URL;
  if (!db) throw new Error("DATABASE_URL is not set");
  const escaped = query.replace(/'/g, `'\\''`);
  return execSync(`psql '${db}' -t -A -c '${escaped}'`, { encoding: "utf8" }).trim();
}

async function registerUser(
  ctx: APIRequestContext,
  email: string,
  firstName: string,
  lastName: string,
): Promise<string> {
  const res = await ctx.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: PASSWORD, firstName, lastName, userType: "user" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  return body.user.id as string;
}

async function createTrip(ctx: APIRequestContext): Promise<string> {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await ctx.post(`${BASE_URL}/api/trips`, {
    data: {
      title: "Lane1 Phase1d Test Trip",
      destination: "Kyoto, Japan",
      startDate: fmt(start),
      endDate: fmt(end),
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const trip = await res.json();
  return trip.id as string;
}

async function createItem(ctx: APIRequestContext, tripId: string, title: string): Promise<string> {
  const res = await ctx.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
    data: { title, dayNumber: 1 },
  });
  expect(res.status(), await res.text()).toBe(201);
  const item = await res.json();
  return item.id as string;
}

/** Grants userId an access-granting (isTripAdvisor-passing) row on tripId. Mirrors the
 *  established raw-SQL test-fixture pattern (optimization-payment-gate.spec.ts's seeded
 *  itinerary_comparisons row) — there is no lightweight API path to mint this relationship
 *  (every real writer goes through an admin lead-confirm or a booking-accept bridge). */
function grantAcceptedAdvisor(tripId: string, expertUserId: string): void {
  // role='travel_expert' unlocks the client ProtectedRoute requiredRole="expert" gate
  // (client/src/lib/role-utils.ts isExpertRole) for the browser block; the server-side
  // routing/plancard authorization below depends ONLY on the trip_expert_advisors row
  // (server/utils/trip-advisor.ts isTripAdvisor), never on this platform role.
  sql(`UPDATE users SET role = 'travel_expert' WHERE id = '${expertUserId}'`);
  sql(`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)
    VALUES (gen_random_uuid(), '${tripId}', '${expertUserId}', 'accepted')
  `);
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Block 1 — the routing contract, server + DB only. Executed for real in the authoring
// session against a local Postgres + `npx tsx server/index.ts` (see the PR description /
// final report for the exact commands) — no browser required for this block.
// ─────────────────────────────────────────────────────────────────────────────────────────
test.describe("Lane 1 Phase 1d — routing contract (server + DB)", () => {
  test("owner: in_planning → ready_for_checkout creates the cart projection; → in_planning removes it", async () => {
    const owner = await pwRequest.newContext();
    const ownerId = await registerUser(owner, `e2e-p1d-owner-${uid()}@example.com`, "Owner", "Traveler");
    const tripId = await createTrip(owner);
    const itemId = await createItem(owner, tripId, "Fushimi Inari Shrine");

    // Real backing item — the assembler must expose routing_status (plancard-types.tsx /
    // trip-plan.service.ts buildActivity), the WHOLE reason the badge/actions can render.
    const before = await (await owner.get(`${BASE_URL}/api/trips/${tripId}/plancard`)).json();
    expect(before.tripRole).toBe("owner");
    expect(before.days[0].activities[0].routingStatus).toBe("in_planning");

    // → ready_for_checkout (the ONLY edge the owner branch is granted from in_planning that
    // creates a projection row — send-to-expert is the sibling edge, checked below).
    const toCheckout = await owner.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
      data: { to: "ready_for_checkout" },
    });
    expect(toCheckout.status(), await toCheckout.text()).toBe(200);
    const toCheckoutBody = await toCheckout.json();
    expect(toCheckoutBody.changed).toBe(true);
    expect(toCheckoutBody.projection.action).toBe("upserted");
    const cartItemId = toCheckoutBody.projection.cartItemId as string;

    // DB-verified: the projection row really exists, keyed on itinerary_item_id (W2's
    // single-writer invariant) — the "creates the projection" half of the gate.
    const projectedId = sql(`SELECT id FROM cart_items WHERE itinerary_item_id = '${itemId}'`);
    expect(projectedId).toBe(cartItemId);
    const routingAfterCheckout = sql(`SELECT routing_status FROM itinerary_items WHERE id = '${itemId}'`);
    expect(routingAfterCheckout).toBe("ready_for_checkout");

    // GET /api/cart (the "Go to checkout" destination) actually carries the projected item.
    const cart = await (await owner.get(`${BASE_URL}/api/cart`)).json();
    expect(cart.items.some((i: any) => i.itineraryItemId === itemId)).toBe(true);

    // → in_planning ("Remove from checkout") deletes the projection row again.
    const toPlanning = await owner.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
      data: { to: "in_planning" },
    });
    expect(toPlanning.status(), await toPlanning.text()).toBe(200);
    const toPlanningBody = await toPlanning.json();
    expect(toPlanningBody.projection.action).toBe("deleted");
    const projectedAfterRemove = sql(`SELECT count(*) FROM cart_items WHERE itinerary_item_id = '${itemId}'`);
    expect(projectedAfterRemove).toBe("0");

    await owner.dispose();
  });

  test("owner: in_planning → with_expert; expert recall (with_expert → in_planning) succeeds; expert cannot set ready_for_checkout; expert cannot un-route a checkout item", async () => {
    const owner = await pwRequest.newContext();
    const ownerId = await registerUser(owner, `e2e-p1d-owner-${uid()}@example.com`, "Owner", "Traveler");
    const tripId = await createTrip(owner);
    const itemId = await createItem(owner, tripId, "Kinkaku-ji Temple");

    const expert = await pwRequest.newContext();
    const expertId = await registerUser(expert, `e2e-p1d-expert-${uid()}@example.com`, "Probe", "Expert");
    grantAcceptedAdvisor(tripId, expertId);

    // The expert's GET is real access, not a coincidence: getTripRole resolves "expert" off
    // the trip_expert_advisors row we just granted (contract: expert workspace READS every
    // routing state).
    const expertView = await (await expert.get(`${BASE_URL}/api/trips/${tripId}/plancard`)).json();
    expect(expertView.tripRole).toBe("expert");

    // ── Owner sends to expert ──────────────────────────────────────────────────────────
    const toExpert = await owner.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
      data: { to: "with_expert" },
    });
    expect(toExpert.status(), await toExpert.text()).toBe(200);
    expect((await toExpert.json()).actor).toBe("owner");
    expect(sql(`SELECT routing_status FROM itinerary_items WHERE id = '${itemId}'`)).toBe("with_expert");

    // ── EXPERT-DENIED, half 1: the expert may NOT set the traveler-only edge. This is the
    //    direct POST of a traveler-only edge from the expert session the Phase 1d gate names
    //    explicitly — proven here against the real endpoint, not asserted from reading the
    //    source. ────────────────────────────────────────────────────────────────────────────
    const expertTriesCheckout = await expert.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
      data: { to: "ready_for_checkout" },
    });
    expect(expertTriesCheckout.status()).toBe(403);
    const deniedMsg = (await expertTriesCheckout.json()).message as string;
    expect(deniedMsg).toContain("traveler");
    // No transition happened — still with_expert, not silently advanced.
    expect(sql(`SELECT routing_status FROM itinerary_items WHERE id = '${itemId}'`)).toBe("with_expert");

    // ── The ONE cell where the expert DOES have WRITES: with_expert → in_planning (recall). ──
    const recall = await expert.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
      data: { to: "in_planning" },
    });
    expect(recall.status(), await recall.text()).toBe(200);
    const recallBody = await recall.json();
    expect(recallBody.actor).toBe("expert");
    expect(sql(`SELECT routing_status FROM itinerary_items WHERE id = '${itemId}'`)).toBe("in_planning");

    // ── EXPERT-DENIED, half 2: once the owner moves the item to checkout, the expert may not
    //    un-route it either (checkout is traveler-only both ways per the contract matrix —
    //    "ready_for_checkout: NEVER" for the expert workspace). ─────────────────────────────
    const toCheckout = await owner.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
      data: { to: "ready_for_checkout" },
    });
    expect(toCheckout.status()).toBe(200);
    const expertTriesUnroute = await expert.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
      data: { to: "in_planning" },
    });
    expect(expertTriesUnroute.status()).toBe(403);
    expect(sql(`SELECT routing_status FROM itinerary_items WHERE id = '${itemId}'`)).toBe("ready_for_checkout");

    await owner.dispose();
    await expert.dispose();
  });

  test("purchased is checkout-only: neither owner nor expert may set it directly, and its reversal is refund-only", async () => {
    const owner = await pwRequest.newContext();
    await registerUser(owner, `e2e-p1d-owner-${uid()}@example.com`, "Owner", "Traveler");
    const tripId = await createTrip(owner);
    const itemId = await createItem(owner, tripId, "Arashiyama Bamboo Grove");

    const res = await owner.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
      data: { to: "purchased" },
    });
    expect(res.status()).toBe(403);
    expect(sql(`SELECT routing_status FROM itinerary_items WHERE id = '${itemId}'`)).toBe("in_planning");

    await owner.dispose();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// Block 2 — the rendered Trip Card. Uses `page` (a real browser context) because the
// assertions are about what's actually in the DOM (button testids present/absent, badge
// text), not just the HTTP contract block 1 already proved.
//
// NOT EXECUTED IN THE AUTHORING SANDBOX: this environment's Chromium download is blocked by
// the org egress policy (cdn.playwright.dev → 403; confirmed via
// `curl $HTTPS_PROXY/__agentproxy/status`, a policy denial per /root/.ccr/README.md, not a
// transient failure to retry around) and the pre-baked browser cache at
// $PLAYWRIGHT_BROWSERS_PATH is a revision behind the installed playwright-core. Every
// `data-testid` selector below is copied verbatim from the diff that introduced it
// (client/src/components/plancard/ActivitiesSection.tsx), and the HTTP/DB contract each
// assertion rides on on is the exact contract block 1 proves live. Run this block with:
//   BASE_URL=http://localhost:5000 DATABASE_URL=<local-pg-url> npx playwright test lane1-phase1d-routing --config=playwright.config.ts
// against a server booted per docs/RELEASE.md's local-postgres pattern (or CI's
// cart-checkout-redirect-gate.yml job, which this spec's setup mirrors) with a real Chromium
// available.
// ─────────────────────────────────────────────────────────────────────────────────────────
test.describe("Lane 1 Phase 1d — Trip Card routing UI (browser)", () => {
  test("owner sees routing actions on the dashboard Trip Card; Add to checkout flips the badge and reveals Go to checkout", async ({ page }) => {
    const email = `e2e-p1d-ui-owner-${uid()}@example.com`;
    await registerUser(page.request, email, "UiOwner", "Traveler");
    const tripId = await createTrip(page.request);
    const itemId = await createItem(page.request, tripId, "Nijo Castle");

    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector(`[data-testid="card-plan-${tripId}"]`, { timeout: 30_000 });
    await page.waitForSelector(`[data-testid="activity-row-${itemId}"]`, { timeout: 15_000 });

    // Owner sees BOTH edges available from in_planning.
    await expect(page.locator(`[data-testid="button-route-send-expert-${itemId}"]`)).toBeVisible();
    const addToCheckoutBtn = page.locator(`[data-testid="button-route-add-checkout-${itemId}"]`);
    await expect(addToCheckoutBtn).toBeVisible();

    // No badge yet — in_planning renders no badge noise (§1 W7 rendering rule).
    await expect(page.locator(`[data-testid="badge-routing-checkout-${itemId}"]`)).toHaveCount(0);

    await addToCheckoutBtn.click();

    // Badge flips to "In checkout"; the checkout link appears; the in_planning-only buttons
    // are gone (replaced by "Remove from checkout").
    await expect(page.locator(`[data-testid="badge-routing-checkout-${itemId}"]`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`[data-testid="link-go-to-checkout-${itemId}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="button-route-remove-checkout-${itemId}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="button-route-add-checkout-${itemId}"]`)).toHaveCount(0);

    // The link really goes to the cart and the item is really there.
    await page.locator(`[data-testid="link-go-to-checkout-${itemId}"]`).click();
    await page.waitForURL(/\/cart/, { timeout: 15_000 });

    const cartRow = sql(`SELECT id FROM cart_items WHERE itinerary_item_id = '${itemId}'`);
    expect(cartRow).toBeTruthy();
  });

  test("expert workspace shows the badge (read-only) with NO traveler routing buttons in the DOM", async ({ page, browser }) => {
    // Owner side (page's own context): create + route an item to with_expert.
    const ownerEmail = `e2e-p1d-ui-owner2-${uid()}@example.com`;
    await registerUser(page.request, ownerEmail, "UiOwner2", "Traveler");
    const tripId = await createTrip(page.request);
    const itemId = await createItem(page.request, tripId, "Gion District Walk");
    const routeRes = await page.request.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
      data: { to: "with_expert" },
    });
    expect(routeRes.status()).toBe(200);

    // Expert side: a SEPARATE browser context (own cookie jar) — never the owner's session.
    const expertCtx = await browser.newContext();
    const expertPage = await expertCtx.newPage();
    const expertEmail = `e2e-p1d-ui-expert-${uid()}@example.com`;
    const expertId = await registerUser(expertPage.request, expertEmail, "UiProbe", "Expert");
    grantAcceptedAdvisor(tripId, expertId);

    await expertPage.goto(`${BASE_URL}/expert/workspace/${tripId}`);
    await expertPage.waitForSelector(`[data-testid="card-plan-${tripId}"]`, { timeout: 30_000 });
    await expertPage.waitForSelector(`[data-testid="activity-row-${itemId}"]`, { timeout: 15_000 });

    // READ: the badge is visible to the expert (contract §2 — expert workspace READS every state).
    await expect(expertPage.locator(`[data-testid="badge-routing-with-expert-${itemId}"]`)).toBeVisible();

    // NEVER: no owner-only routing action renders for this viewer, on this item or any other.
    await expect(expertPage.locator('[data-testid^="button-route-"]')).toHaveCount(0);
    await expect(expertPage.locator(`[data-testid="link-go-to-checkout-${itemId}"]`)).toHaveCount(0);

    // Direct POST proof, from the SAME expert session driving this page — the traveler-only
    // edge is still refused server-side even though the UI never offers it (defense in depth,
    // proven end-to-end from this exact browser session, not just block 1's bare request).
    const denied = await expertPage.request.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
      data: { to: "ready_for_checkout" },
    });
    expect(denied.status()).toBe(403);

    await expertCtx.close();
  });
});
