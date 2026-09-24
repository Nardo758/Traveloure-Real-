// J2 — Discover "Add to plan" with no prior modal, under 0 / 1 / 2+ trips. Also the H8 evidence run.
import path from "node:path";
import { BASE, pool, openRun, register, login, spaNavigate, futureDates } from "./lib.mjs";
import { fillPlanModal } from "./lib.mjs";

const OUT = path.resolve("docs/audits/journeys/J2");

async function addFirstService(run, page) {
  await page.locator('[data-testid^="button-add-to-cart-"]').first().waitFor({ timeout: 20000 });
  await run.step(page, "on Discover (/services)");
  await page.locator('[data-testid^="button-add-to-cart-"]').first().click();
  await page.waitForTimeout(2500);
  await run.step(page, "clicked first 'Add to plan'");
  if (await page.getByTestId("button-mismatch-add-anyway").isVisible().catch(() => false)) {
    await page.getByTestId("button-mismatch-add-anyway").click();
    await page.waitForTimeout(2500);
    await run.step(page, "location-mismatch → 'Add anyway'");
  }
}

// R1 — 0 trips, authed, no modal.
async function zeroTrips() {
  const run = await openRun(OUT, "R1-zero-trips");
  const { context, page } = await run.newContext();
  const user = await register(context, "j2-zero");
  await page.goto(`${BASE}/services`, { waitUntil: "networkidle" });
  await addFirstService(run, page);
  await spaNavigate(page, "/my-trips");
  await run.step(page, "My Plans", `cards=${await page.locator('[data-testid^="trip-card-"]').count()}`);
  await spaNavigate(page, "/cart");
  await run.step(page, "Trip Cart");
  await run.finish({ user });
}

// R2 — 1 trip that exists from an EARLIER session (minted through the app API, as any mint does).
async function oneTripPriorSession() {
  const run = await openRun(OUT, "R2-one-trip-prior-session");
  let { context, page } = await run.newContext();
  const user = await register(context, "j2-one");
  const { start, end } = futureDates(50);
  const r = await context.request.post(`${BASE}/api/trips`, { data: { title: "Kyoto spring", destination: "Kyoto, Japan", startDate: start, endDate: end } });
  const trip = await r.json();
  await page.goto(`${BASE}/my-trips`, { waitUntil: "networkidle" });
  await run.step(page, "session 1: My Plans shows the trip", `cards=${await page.locator('[data-testid^="trip-card-"]').count()}`);
  await context.close();
  // Session 2: a new browser context (new tab/device) — sessionStorage is empty, the pen re-hydrates from the server.
  ({ context, page } = await run.newContext());
  await login(context, user);
  await page.goto(`${BASE}/my-trips`, { waitUntil: "networkidle" });
  await run.step(page, "session 2: My Plans", `cards=${await page.locator('[data-testid^="trip-card-"]').count()}`);
  await spaNavigate(page, "/services");
  await addFirstService(run, page);
  await run.finish({ user, tripId: trip.id });
}

// R3 — 2+ trips in one session: A via the modal, a second modal "Build it myself", B via My Plans "Create New",
// then view B's slip and go to Discover from the sidebar.
async function twoTrips() {
  const run = await openRun(OUT, "R3-two-trips-in-session");
  const { context, page } = await run.newContext();
  const meta = {};
  try {
  const user = await register(context, "j2-two");
  meta.user = user;
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByTestId("button-plan-trip").click();
  await fillPlanModal(page, "Kyoto, Japan", 40);
  await page.getByTestId("planning-option-myself").click();
  await page.waitForTimeout(3000);
  await run.step(page, "plan A minted via modal 'Build it myself' (Kyoto)");
  const tripA = page.url().split("/plans/")[1]?.split("?")[0];
  meta.tripA = tripA;

  // Second modal attempt with a DIFFERENT destination while the pen holds A.
  await spaNavigate(page, "/");
  await page.getByTestId("button-plan-trip").click();
  await page.getByTestId("plan-modal").waitFor();
  await run.step(page, "reopened the plan modal while plan A is in the pen");
  await fillPlanModal(page, "Osaka, Japan", 60);
  await run.step(page, "modal refilled with Osaka — finish CTAs");
  await page.getByTestId("planning-option-myself").click();
  await page.waitForTimeout(3500);
  await run.step(page, "clicked 'Build it myself' for Osaka");

  // Plan B via My Plans → Create New (IntakePanel → useCreateTrip).
  await spaNavigate(page, "/my-trips");
  await run.step(page, "My Plans before Create New", `cards=${await page.locator('[data-testid^="trip-card-"]').count()}`);
  await page.getByTestId("button-create-new").click();
  const { start, end } = futureDates(90);
  await page.getByTestId("input-intake-destination").fill("Tokyo, Japan");
  await page.getByTestId("input-intake-start-date").fill(start);
  await page.getByTestId("input-intake-end-date").fill(end);
  await page.getByTestId("button-intake-next").click();
  await page.waitForTimeout(1500);
  const shape = page.locator('[data-testid^="button-intake-shape-"]').first();
  if (await shape.isVisible().catch(() => false)) await shape.click();
  await run.step(page, "IntakePanel filled (Tokyo)");
  await page.getByTestId("button-intake-create").click();
  await page.waitForTimeout(3000);
  await run.step(page, "IntakePanel 'Create' → plan B slip");
  const tripB = page.url().split("/plans/")[1]?.split("?")[0];
  meta.tripB = tripB;

  // The user is LOOKING AT plan B's slip. Go to Discover from the sidebar (not the slip's own Browse link).
  await page.getByTestId("link-sidebar-discover").click();
  await page.waitForTimeout(2500);
  await run.step(page, "sidebar 'Discover' from plan B's slip");
  // ?location only pins the grid's city filter so a listing renders; it carries NO tripId, so the
  // add target is still resolved from the pen exactly as a sidebar-driven visit would.
  await page.goto(`${BASE}/services?location=Kyoto%2C+Japan`, { waitUntil: "networkidle" });
  await addFirstService(run, page);
  await spaNavigate(page, "/my-trips");
  await run.step(page, "My Plans after", `cards=${await page.locator('[data-testid^="trip-card-"]').count()}`);
  Object.assign(meta, { user, tripA, tripB });
  } catch (e) {
    await run.step(page, "HARNESS ERROR", String(e?.message || e).slice(0, 300));
  } finally {
    if (meta.user) {
      const { rows } = await pool.query(
        "select i.trip_id, t.destination, i.title from itinerary_items i join trips t on t.id=i.trip_id where t.user_id=$1",
        [meta.user.id],
      );
      meta.itemsByTrip = rows;
    }
    await run.finish(meta);
  }
}


// R4 — H8 D2 proper: pen bound to plan A (modal mint), plan B created via My Plans → Create New,
// the user opens B's slip, then adds from Discover reached through the sidebar.
async function viewingBAddsToA(spa = false) {
  const run = await openRun(OUT, spa ? "R4b-viewing-B-adds-to-A-spa" : "R4-viewing-B-adds-to-A");
  const { context, page } = await run.newContext();
  const meta = {};
  try {
    const user = await register(context, "j2-d2");
    meta.user = user;
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByTestId("button-plan-trip").click();
    await fillPlanModal(page, "Kyoto, Japan", 40);
    await page.getByTestId("planning-option-myself").click();
    await page.waitForTimeout(3000);
    meta.tripA = page.url().split("/plans/")[1]?.split("?")[0];
    await run.step(page, "plan A minted via modal (pen → A)");
    await spaNavigate(page, "/my-trips");
    await page.getByTestId("button-create-new").click();
    const { start, end } = futureDates(90);
    await page.getByTestId("input-intake-destination").fill("Kyoto, Japan");
    await page.getByTestId("input-intake-start-date").fill(start);
    await page.getByTestId("input-intake-end-date").fill(end);
    await page.getByTestId("button-intake-next").click();
    await page.waitForTimeout(1500);
    const shape = page.locator('[data-testid^="button-intake-shape-"]').first();
    if (await shape.isVisible().catch(() => false)) await shape.click();
    await page.getByTestId("button-intake-create").click();
    await page.waitForTimeout(3000);
    meta.tripB = page.url().split("/plans/")[1]?.split("?")[0];
    await run.step(page, "plan B created via Create New — B's slip on screen");
    await page.getByTestId("link-sidebar-discover").click();
    await page.waitForTimeout(2000);
    await run.step(page, "sidebar 'Discover' from B's slip");
    // R4: a full page load (as a bookmark / new tab would). R4b: stay in the SPA, so the pen binding
    // established on the public landing survives (see H8 D6).
    if (spa) await spaNavigate(page, "/services?location=Kyoto%2C+Japan");
    else await page.goto(`${BASE}/services?location=Kyoto%2C+Japan`, { waitUntil: "networkidle" });
    await addFirstService(run, page);
  } catch (e) {
    await run.step(page, "HARNESS ERROR", String(e?.message || e).slice(0, 300));
  } finally {
    if (meta.user) {
      const { rows } = await pool.query(
        "select i.trip_id, t.title, i.title as item from itinerary_items i join trips t on t.id=i.trip_id where t.user_id=$1",
        [meta.user.id],
      );
      meta.itemsByTrip = rows;
    }
    await run.finish(meta);
  }
}

// R2b — D1 isolated from the binder: session 2 starts on the PUBLIC landing (Layout mounts, so
// useTripContextSync binds the principal and hydrates from the server), then SPA to /services.
async function oneTripPriorSessionFromLanding() {
  const run = await openRun(OUT, "R2b-one-trip-prior-session-from-landing");
  let { context, page } = await run.newContext();
  const meta = {};
  try {
    const user = await register(context, "j2-oneb");
    meta.user = user;
    const { start, end } = futureDates(50);
    const r = await context.request.post(`${BASE}/api/trips`, { data: { title: "Kyoto spring", destination: "Kyoto, Japan", startDate: start, endDate: end } });
    meta.tripId = (await r.json()).id;
    await context.close();
    ({ context, page } = await run.newContext());
    await login(context, user);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await run.step(page, "session 2: landing (public Layout → pen bound + hydrated)");
    await spaNavigate(page, "/services?location=Kyoto%2C+Japan");
    await addFirstService(run, page);
  } catch (e) {
    await run.step(page, "HARNESS ERROR", String(e?.message || e).slice(0, 300));
  } finally {
    await run.finish(meta);
  }
}

const only = process.env.ONLY;
for (const [n, f] of [["R1", zeroTrips], ["R2", oneTripPriorSession], ["R3", twoTrips], ["R4-", () => viewingBAddsToA(false)], ["R4b", () => viewingBAddsToA(true)], ["R2b", oneTripPriorSessionFromLanding]]) {
  if (only && !n.startsWith(only)) continue;
  try { await f(); console.log(n, "done"); } catch (e) { console.log(n, "ERROR", e.message.slice(0, 300)); }
}
await pool.end();
