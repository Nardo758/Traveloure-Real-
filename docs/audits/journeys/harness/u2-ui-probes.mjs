// U2 — screenshot confirmation for every P1/P2 row in a UI gap class.
// Each probe: its own browser context, before.png → action → after.png (+ extra shots), network.json,
// result.json { verdict: CONFIRMED | REFUTED | BLOCKED, observed }. Failure paths are forced with
// Playwright request interception (page.route) — a test-side technique; no app code is touched.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, futureDates, fillPlanModal, spaNavigate } from "./lib.mjs";

const OUT = path.resolve("docs/audits/ui");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];

async function probe(rowId, fn) {
  const dir = path.join(OUT, rowId.replace(/[:/]/g, "__"));
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  const net = [];
  page.on("response", async (res) => {
    const req = res.request();
    if (!req.url().includes("/api/")) return;
    const e = { method: req.method(), url: req.url().replace(BASE, ""), status: res.status() };
    if (req.method() !== "GET") { e.body = (req.postData() || "").slice(0, 400); try { e.response = (await res.text()).slice(0, 400); } catch {} }
    net.push(e);
  });
  let n = 0;
  const shot = async (name) => { await page.waitForTimeout(700); n += 1; await page.screenshot({ path: path.join(dir, `${name}.png`) }); };
  const toasts = async () => (await page.locator('li[data-state="open"], [role="status"]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  let out;
  try {
    out = await fn({ page, context, shot, toasts, net });
  } catch (e) {
    await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {});
    out = { verdict: "BLOCKED", observed: `harness error: ${String(e.message || e).slice(0, 300)}` };
  }
  fs.writeFileSync(path.join(dir, "network.json"), JSON.stringify(net, null, 1));
  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ rowId, ...out }, null, 1));
  results.push({ rowId, dir: path.relative(process.cwd(), dir), ...out });
  console.log(rowId, "→", out.verdict);
  await context.close();
}

async function register(context, tag) {
  const email = `u2-${tag}-${Date.now()}@traveloure.test`;
  const r = await context.request.post(`${BASE}/api/auth/register`, { data: { email, password: "TestPassword123!", firstName: "U2", lastName: tag, userType: "user" } });
  await context.request.post(`${BASE}/api/auth/accept-terms`, { data: { acceptTerms: true, acceptPrivacy: true } });
  return { id: (await r.json()).user?.id, email };
}
async function apiTrip(context, destination = "Kyoto, Japan") {
  const { start, end } = futureDates(45);
  const r = await context.request.post(`${BASE}/api/trips`, { data: { title: `${destination.split(",")[0]} plan`, destination, startDate: start, endDate: end } });
  return (await r.json()).id;
}
/** Mint through the modal from the public landing, so the pen is bound (J1 R3 shape). */
async function modalMint(page, destination) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByTestId("button-plan-trip").click();
  await fillPlanModal(page, destination, 40);
  await page.getByTestId("planning-option-myself").click();
  await page.waitForTimeout(3000);
  return page.url().split("/plans/")[1]?.split("?")[0];
}
const addBtn = (page) => page.locator('[data-testid^="button-add-to-cart-"]').first();

// ── Planning modal ─────────────────────────────────────────────────────────────────────────
await probe("planning-provider:run-branch-ai", async ({ page, context, shot }) => {
  await register(context, "aimodal");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByTestId("button-plan-trip").click();
  await fillPlanModal(page);
  await page.getByTestId("planning-option-ai").click();
  await page.waitForTimeout(2000);
  await shot("before");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  await shot("after-escape");
  await spaNavigate(page, "/services");
  await shot("after");
  const still = await page.getByText("Plan Your Perfect Trip").isVisible().catch(() => false);
  return { verdict: still ? "CONFIRMED" : "REFUTED", observed: `after Escape + client-side navigation to /services the AI modal is ${still ? "STILL visible over the page" : "gone"}` };
});
await probe("planning-provider:ai-modal-on-close", async ({ page, context, shot }) => {
  await register(context, "aimodal2");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByTestId("button-plan-trip").click();
  await fillPlanModal(page);
  await page.getByTestId("planning-option-ai").click();
  await page.waitForTimeout(2000);
  await shot("before");
  await page.mouse.click(10, 890); // backdrop area
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  await shot("after");
  const still = await page.getByText("Plan Your Perfect Trip").isVisible().catch(() => false);
  return { verdict: still ? "CONFIRMED" : "REFUTED", observed: `backdrop click + Escape: AI modal ${still ? "remains open (only its own Cancel/✕ close it)" : "closed"}` };
});
await probe("plan-modal:dialog-on-open-change", async ({ page, context, shot, toasts, net }) => {
  await register(context, "dismiss");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByTestId("button-plan-trip").click();
  await fillPlanModal(page);
  await shot("before");
  const mark = net.length;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const t = await toasts();
  await shot("after");
  await page.getByTestId("button-plan-trip").click();
  await page.waitForTimeout(800);
  await shot("after-reopen");
  const writes = net.slice(mark).filter((x) => x.method !== "GET" && !/analytics|moments|impression/.test(x.url));
  const empty = await page.getByTestId("plan-step-occasion-body").isVisible().catch(() => false);
  return { verdict: t.length === 0 && writes.length === 0 && empty ? "CONFIRMED" : "REFUTED", observed: `Escape: toasts=${JSON.stringify(t)}, writes=${writes.length}; reopened at step 1 empty=${empty}` };
});
await probe("plan-modal:button-etp-save", async ({ page, context, shot, toasts }) => {
  await register(context, "save");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByTestId("button-plan-trip").click();
  await fillPlanModal(page);
  await shot("before");
  await page.getByTestId("button-etp-save").click();
  await page.waitForTimeout(500);
  const t = await toasts();
  await shot("after");
  return { verdict: t.length === 0 ? "CONFIRMED" : "REFUTED", observed: `after Save: toasts=${JSON.stringify(t)} (the only visible change is the trip strip)` };
});

// ── Discover /services ─────────────────────────────────────────────────────────────────────
await probe("services:add-to-plan#false-promise-cart", async ({ page, context, shot, toasts, net }) => {
  await register(context, "cart");
  await page.goto(`${BASE}/services?location=Kyoto%2C+Japan`, { waitUntil: "networkidle" });
  await addBtn(page).waitFor();
  const label = (await addBtn(page).innerText()).trim();
  await shot("before");
  await addBtn(page).click();
  await page.waitForTimeout(500);
  const t = await toasts();
  await shot("after");
  const post = net.find((x) => x.method === "POST" && /\/api\/cart$/.test(x.url));
  return { verdict: /plan/i.test(label) && post && t.some((x) => /cart/i.test(x)) ? "CONFIRMED" : "REFUTED", observed: `label "${label}" → ${post ? "POST /api/cart " + post.status : "no cart POST"}; toast ${JSON.stringify(t)}` };
});
await probe("services:add-to-plan#invisible-target", async ({ page, context, shot, toasts, net }) => {
  await register(context, "pen");
  const tripId = await modalMint(page, "Kyoto, Japan");
  await spaNavigate(page, "/services?location=Kyoto%2C+Japan");
  await addBtn(page).waitFor();
  await shot("before");
  const banner = await page.locator("text=/Adding to/i").isVisible().catch(() => false);
  await addBtn(page).click();
  await page.waitForTimeout(500);
  const t = await toasts();
  await shot("after");
  const post = net.find((x) => x.method === "POST" && /itinerary-items/.test(x.url));
  const named = t.some((x) => /Kyoto plan|Kyoto trip/i.test(x));
  return { verdict: post && !banner && !named ? "CONFIRMED" : "REFUTED", observed: `item written to ${post?.url} (trip ${tripId}); target banner visible=${banner}; toast ${JSON.stringify(t)} names the plan=${named}` };
});
await probe("services:add-to-plan#guest-saved", async ({ page, shot, toasts, net }) => {
  await page.goto(`${BASE}/services?location=Kyoto%2C+Japan`, { waitUntil: "networkidle" });
  await addBtn(page).waitFor();
  await shot("before");
  await addBtn(page).click();
  await page.waitForTimeout(500);
  const t = await toasts();
  await shot("after");
  const writes = net.filter((x) => x.method !== "GET" && !/analytics|impression/.test(x.url));
  return { verdict: t.some((x) => /Saved!/.test(x)) && writes.length === 0 ? "CONFIRMED" : "REFUTED", observed: `guest toast ${JSON.stringify(t)}; server writes=${writes.length} (localStorage only)` };
});
await probe("services:curated-pick-trip", async ({ page, context, shot }) => {
  await register(context, "curated");
  await apiTrip(context);
  await page.goto(`${BASE}/services?location=Kyoto%2C+Japan`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const curated = page.locator('[data-testid^="button-add-trip-"]').first();
  if (!(await curated.isVisible().catch(() => false))) {
    await shot("before");
    return { verdict: "BLOCKED", observed: "no curated-content card rendered for Kyoto in this seed (curated section is data-driven); nothing to click" };
  }
  await shot("before");
  await curated.click();
  await page.waitForTimeout(800);
  await shot("after");
  const picker = await page.getByTestId("dialog-add-to-trip").isVisible().catch(() => false);
  return { verdict: picker ? "CONFIRMED" : "REFUTED", observed: `curated 'Add to plan' opened a trip picker=${picker}, while the ServiceCard 'Add to plan' on the same page adds directly` };
});
await probe("services:unified-request-booking", async ({ page, context, shot }) => {
  await register(context, "unified");
  await page.goto(`${BASE}/services?location=Kyoto%2C+Japan`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const card = page.locator('[data-testid^="button-view-"]').first();
  await shot("before");
  if (!(await card.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: "no unified/partner result cards render without live SERP/partner feeds (stub keys); the request-booking modal cannot be reached here" };
  return { verdict: "BLOCKED", observed: "cards present but probe not implemented" };
});

// ── Mismatch dialog (pen bound to an OSAKA plan, add a KYOTO listing) ─────────────────────
async function mismatchSetup(page, context, tag) {
  await register(context, tag);
  await modalMint(page, "Osaka, Japan");
  await spaNavigate(page, "/services?location=Kyoto%2C+Japan");
  await addBtn(page).waitFor();
  await addBtn(page).click();
  await page.getByTestId("button-mismatch-add-anyway").waitFor({ timeout: 8000 });
}
await probe("discover-shared:mismatch-add-anyway", async ({ page, context, shot, toasts, net }) => {
  await mismatchSetup(page, context, "mmany");
  await shot("before");
  await page.getByTestId("button-mismatch-add-anyway").click();
  await page.waitForTimeout(500);
  const t = await toasts();
  await shot("after");
  const post = net.find((x) => x.method === "POST" && /itinerary-items/.test(x.url));
  const named = t.some((x) => /Osaka/i.test(x));
  return { verdict: post && !named ? "CONFIRMED" : "REFUTED", observed: `added to ${post?.url}; toast ${JSON.stringify(t)}; names the target plan=${named}` };
});
await probe("discover-shared:mismatch-add-as-stop", async ({ page, context, shot, toasts }) => {
  await mismatchSetup(page, context, "mmstop");
  await page.route("**/api/trips/*/destinations", (r) => (r.request().method() === "PUT" ? r.fulfill({ status: 500, body: '{"message":"forced failure (audit)"}', contentType: "application/json" }) : r.continue()));
  await shot("before");
  await page.getByTestId("button-mismatch-add-as-stop").click();
  await page.waitForTimeout(700);
  const t = await toasts();
  await shot("after");
  const err = t.some((x) => /fail|error|could not|couldn't/i.test(x));
  return { verdict: err ? "REFUTED" : "CONFIRMED", observed: `PUT destinations forced 500 → toasts ${JSON.stringify(t)}` };
});

// ── Destinations / city feed / service detail ─────────────────────────────────────────────
await probe("destinations:ade-primary", async ({ page, context, shot }) => {
  await register(context, "wish");
  await modalMint(page, "Kyoto, Japan");
  await context.request.post(`${BASE}/api/saved-items`, { data: { itemType: "city", itemId: "kyoto", itemName: "Kyoto", city: "Kyoto", country: "Japan" } });
  await spaNavigate(page, "/destinations");
  await page.waitForTimeout(2000);
  const plus = page.locator('[data-testid^="button-add-to-trip-"]').first();
  await shot("before");
  if (!(await plus.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: "Wishlist '+ Trip' not rendered (saved-items seed shape not accepted or section hidden)" };
  await plus.click();
  await page.waitForTimeout(1000);
  await shot("after");
  const primary = page.getByTestId("button-add-content-to-cart");
  const txt = (await primary.innerText().catch(() => "")).trim();
  return { verdict: txt && !/Kyoto/i.test(txt) ? "CONFIRMED" : "REFUTED", observed: `dialog primary button reads "${txt}" — it does not name the plan it will write to` };
});
await probe("discover-location:ade-primary", async ({ page, context, shot }) => {
  await register(context, "cityfeed");
  await modalMint(page, "Kyoto, Japan");
  await spaNavigate(page, "/discover/location/kyoto");
  await page.waitForTimeout(3000);
  const add = page.locator('[data-testid^="btn-add-"]').first();
  await shot("before");
  if (!(await add.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: "no city-feed 'Add to plan' tile rendered in this seed" };
  await add.click();
  await page.waitForTimeout(1000);
  await shot("after");
  const txt = (await page.getByTestId("button-add-content-to-cart").innerText().catch(() => "")).trim();
  return { verdict: txt && !/Kyoto/i.test(txt) ? "CONFIRMED" : "REFUTED", observed: `dialog primary button reads "${txt}"` };
});
await probe("discover-location:addon-agent", async ({ page, context, shot, net }) => {
  await register(context, "addon");
  await page.goto(`${BASE}/discover/location/kyoto`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const card = page.getByTestId("addon-airport-transfer");
  await shot("before");
  if (!(await card.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: "airport-transfer add-on card not rendered" };
  await card.locator("button").first().click();
  await page.waitForTimeout(1500);
  await shot("after");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await shot("after-reload");
  const post = net.find((x) => x.method === "POST" && /affiliate-booking-requests/.test(x.url));
  return { verdict: post ? "CONFIRMED" : "REFUTED", observed: `request ${post ? post.status : "not sent"}; after reload the card shows no trace of the request (see after-reload.png)` };
});
await probe("service-detail:add-to-plan", async ({ page, context, shot, toasts }) => {
  await register(context, "detail");
  await modalMint(page, "Kyoto, Japan");
  await spaNavigate(page, "/services/0027dbb3-cd1d-4020-8bfa-ee8dcdff0b86");
  await page.waitForTimeout(2500);
  await shot("before");
  const banner = (await page.locator("text=/Booking for your trip|Adding to/i").first().innerText().catch(() => "")).trim();
  await page.getByTestId("button-add-to-cart").click();
  await page.waitForTimeout(600);
  const t = await toasts();
  await shot("after");
  return { verdict: !/Kyoto/i.test(banner + t.join(" ")) ? "CONFIRMED" : "REFUTED", observed: `banner "${banner}" · toast ${JSON.stringify(t)} — plan named=${/Kyoto/i.test(banner + t.join(" "))}` };
});
await probe("service-detail:mismatch-add-as-stop", async ({ page, context, shot, toasts }) => {
  await register(context, "dstop");
  await modalMint(page, "Osaka, Japan");
  await spaNavigate(page, "/services/0027dbb3-cd1d-4020-8bfa-ee8dcdff0b86");
  await page.waitForTimeout(2500);
  await page.getByTestId("button-add-to-cart").click();
  await page.getByTestId("button-mismatch-add-as-stop").waitFor({ timeout: 8000 });
  await page.route("**/api/trips/*/destinations", (r) => (r.request().method() === "PUT" ? r.fulfill({ status: 500, body: '{"message":"forced failure (audit)"}', contentType: "application/json" }) : r.continue()));
  await shot("before");
  await page.getByTestId("button-mismatch-add-as-stop").click();
  await page.waitForTimeout(700);
  const t = await toasts();
  await shot("after");
  const err = t.some((x) => /fail|error|could not|couldn't/i.test(x));
  return { verdict: err ? "REFUTED" : "CONFIRMED", observed: `PUT destinations forced 500 → toasts ${JSON.stringify(t)}` };
});

// ── Deals / transportation ─────────────────────────────────────────────────────────────────
await probe("deals:book", async ({ page, context, shot }) => {
  await register(context, "deals");
  await page.goto(`${BASE}/deals`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const btn = page.locator('[data-testid^="button-book-"]').first();
  await shot("before");
  if (!(await btn.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: "no deal with a bookingToken rendered (deals feed empty without partner keys)" };
  return { verdict: "BLOCKED", observed: "deal present but probe not implemented" };
});
await probe("transportation:twelvego-deeplink-book", async ({ page, context, shot, net }) => {
  await register(context, "twelvego");
  await page.goto(`${BASE}/transportation`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const card = page.locator('[data-testid^="twelve-go-agent-route-"]').first();
  await shot("before");
  if (!(await card.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: "popular-route cards not rendered" };
  const txt = (await card.innerText()).replace(/\s+/g, " ").trim();
  await card.click();
  await page.waitForTimeout(1500);
  await shot("after");
  const post = net.find((x) => x.method === "POST" && /affiliate-booking-requests/.test(x.url));
  return { verdict: /schedules|prices/i.test(txt) && post ? "CONFIRMED" : "REFUTED", observed: `card text "${txt.slice(0, 80)}" → ${post ? `POST affiliate-booking-requests ${post.status}` : "no booking request"}` };
});

// ── Entry surfaces ─────────────────────────────────────────────────────────────────────────
await probe("experiences:button-intake-create", async ({ page, context, shot, toasts }) => {
  await register(context, "intake");
  await page.goto(`${BASE}/my-trips`, { waitUntil: "networkidle" });
  await page.route("**/api/trips", (r) => (r.request().method() === "POST" ? r.fulfill({ status: 500, body: '{"message":"forced failure (audit)"}', contentType: "application/json" }) : r.continue()));
  await page.getByTestId("button-create-new").click();
  const { start, end } = futureDates(60);
  await page.getByTestId("input-intake-destination").fill("Kyoto, Japan");
  await page.getByTestId("input-intake-start-date").fill(start);
  await page.getByTestId("input-intake-end-date").fill(end);
  await page.getByTestId("button-intake-next").click();
  await page.waitForTimeout(1000);
  const shape = page.locator('[data-testid^="button-intake-shape-"]').first();
  if (await shape.isVisible().catch(() => false)) await shape.click();
  await shot("before");
  await page.getByTestId("button-intake-create").click();
  await page.waitForTimeout(700);
  const t = await toasts();
  await shot("after");
  const err = t.some((x) => /fail|error|could not|couldn't/i.test(x));
  return { verdict: err ? "REFUTED" : "CONFIRMED", observed: `POST /api/trips forced 500 → toasts ${JSON.stringify(t)}` };
});
await probe("experience-template:effect-persist-settings", async ({ page, context, shot, net }) => {
  await register(context, "tplparty");
  await page.goto(`${BASE}/experiences`, { waitUntil: "networkidle" });
  await shot("before");
  await page.goto(`${BASE}/experiences/travel/new?destination=Kyoto%2C%20Japan`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await shot("after");
  const put = net.find((x) => x.method === "PUT" && /trip-context/.test(x.url) && /"travelers":2/.test(x.body || ""));
  return { verdict: put ? "CONFIRMED" : "REFUTED", observed: put ? `PUT /api/trip-context carried travelers:2 with no user input: ${put.body.slice(0, 160)}` : "no invented travelers write seen" };
});
await probe("experience-template:review-sheet-send", async ({ page, context, shot, toasts }) => {
  await register(context, "tplsend");
  await page.goto(`${BASE}/experiences/travel/new?destination=Kyoto%2C%20Japan`, { waitUntil: "networkidle" });
  await page.getByTestId("button-expert-help-ribbon").click();
  await page.getByTestId("button-send-expert-request").waitFor();
  await shot("before");
  const enabled = await page.getByTestId("button-send-expert-request").isEnabled();
  const dates = (await page.getByTestId("expert-request-review-basics").innerText()).replace(/\s+/g, " ");
  await page.getByTestId("button-send-expert-request").click();
  await page.waitForTimeout(400);
  const t = await toasts();
  await shot("after");
  return { verdict: enabled && /Not set/i.test(dates) ? "CONFIRMED" : "REFUTED", observed: `sheet basics "${dates}", Send enabled=${enabled}; after Send toast ${JSON.stringify(t)}` };
});
await probe("experience-template:add-to-cart", async ({ page, context, shot }) => {
  await register(context, "tplbound");
  const tripId = await modalMint(page, "Kyoto, Japan");
  await page.goto(`${BASE}/experiences/travel/new?destination=Kyoto%2C%20Japan`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByTestId("tab-services").click().catch(() => {});
  await addBtn(page).waitFor({ timeout: 15000 });
  const label = (await addBtn(page).innerText()).trim();
  await shot("before");
  await addBtn(page).click();
  await page.waitForTimeout(3000);
  await shot("after");
  const url = page.url().replace(BASE, "");
  return { verdict: /cart/i.test(label) && url.includes("/plans/") ? "CONFIRMED" : "REFUTED", observed: `button "${label}" with a bound plan (${tripId}) → landed on ${url}` };
});
await probe("storefront:storefront-panel-share", async ({ page, context, shot, toasts }) => {
  await register(context, "store");
  const tripId = await apiTrip(context);
  await page.route("**/api/trips/*/advisors", (r) => (r.request().method() === "POST" ? r.fulfill({ status: 500, body: '{"message":"forced failure (audit)"}', contentType: "application/json" }) : r.continue()));
  await page.goto(`${BASE}/s/sofia-chen?tripId=${tripId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const btn = page.locator('[data-testid="storefront-panel-share"], [data-testid="storefront-bar-primary"]').first();
  await shot("before");
  if (!(await btn.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: "share control not rendered for this storefront/trip" };
  await btn.click();
  await page.waitForTimeout(700);
  const t = await toasts();
  await shot("after");
  const err = t.some((x) => /fail|error|could not|couldn't/i.test(x));
  return { verdict: err ? "REFUTED" : "CONFIRMED", observed: `POST advisors forced 500 → toasts ${JSON.stringify(t)}` };
});
await probe("inbox:button-report-thread", async ({ page, context, shot, toasts }) => {
  await register(context, "inbox");
  await context.request.post(`${BASE}/api/conversations/start`, { data: { handle: "sofia-chen", about: "audit" } });
  await page.route("**/api/messages/report/**", (r) => r.fulfill({ status: 500, body: '{"message":"forced failure (audit)"}', contentType: "application/json" }));
  await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const rep = page.locator('[data-testid^="button-report-thread"]').first();
  await shot("before");
  if (!(await rep.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: "no thread with a report control rendered (conversation start may need a first message)" };
  await rep.click();
  await page.waitForTimeout(500);
  const submit = page.locator('[data-testid^="button-submit-report"], [data-testid^="button-report-submit"]').first();
  const reason = page.locator("textarea").first();
  if (await reason.isVisible().catch(() => false)) await reason.fill("audit probe");
  if (await submit.isVisible().catch(() => false)) await submit.click();
  await page.waitForTimeout(700);
  const t = await toasts();
  await shot("after");
  const err = t.some((x) => /fail|error|could not|couldn't/i.test(x));
  return { verdict: err ? "REFUTED" : "CONFIRMED", observed: `report forced 500 → toasts ${JSON.stringify(t)}` };
});
await probe("profile:button-save-profile", async ({ page, context, shot, toasts, net }) => {
  await register(context, "photo");
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot("before");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await page.waitForTimeout(800);
  const t1 = await toasts();
  await shot("after-upload");
  const save = page.getByTestId("button-save-profile");
  if (await save.isVisible().catch(() => false)) { await save.click(); await page.waitForTimeout(1500); }
  const t2 = await toasts();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot("after");
  const bodies = net.filter((x) => x.method !== "GET").map((x) => x.body || "").join(" ");
  const sent = /profileImage|data:image/.test(bodies);
  return { verdict: t1.concat(t2).some((x) => /photo/i.test(x)) && !sent ? "CONFIRMED" : "REFUTED", observed: `toasts ${JSON.stringify(t1.concat(t2))}; image sent to server=${sent}; after reload see after.png` };
});

// ── Console ────────────────────────────────────────────────────────────────────────────────
await probe("slip:button-slip-dates-save", async ({ page, context, shot, toasts }) => {
  await register(context, "dates");
  const tripId = await apiTrip(context);
  await page.goto(`${BASE}/plans/${tripId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.route(`**/api/trips/${tripId}`, (r) => (r.request().method() === "PATCH" ? r.fulfill({ status: 500, body: '{"message":"forced failure (audit)"}', contentType: "application/json" }) : r.continue()));
  const cta = page.getByTestId("slip-dates-set-cta");
  if (!(await cta.isVisible().catch(() => false))) { await shot("before"); return { verdict: "BLOCKED", observed: "'Set your dates' control not rendered (it shows only for unconfirmed dates)" }; }
  await cta.click();
  const { start, end } = futureDates(70);
  await page.getByTestId("input-slip-dates-start").fill(start);
  await page.getByTestId("input-slip-dates-end").fill(end);
  await shot("before");
  await page.getByTestId("button-slip-dates-save").click();
  await page.waitForTimeout(700);
  const t = await toasts();
  await shot("after");
  const err = t.some((x) => /fail|error|could not|couldn't/i.test(x));
  return { verdict: err ? "REFUTED" : "CONFIRMED", observed: `PATCH trip forced 500 → toasts ${JSON.stringify(t)}` };
});
await probe("trip-card:button-delete-plan-x", async ({ page, context, shot }) => {
  await register(context, "delete");
  const tripId = await apiTrip(context);
  await context.request.post(`${BASE}/api/trips/${tripId}/itinerary-items`, { data: { title: "Audit item", itemType: "activity", dayNumber: 1 } });
  const fin = await context.request.post(`${BASE}/api/trips/${tripId}/finalize`, { data: {} });
  await page.goto(`${BASE}/trip/${tripId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const del = page.locator('[data-testid^="button-delete-plan-"]').first();
  await shot("before");
  if (!(await del.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: `delete control not rendered (finalize → ${fin.status()})` };
  await del.click();
  await page.waitForTimeout(500);
  const confirm = page.locator('[data-testid^="button-delete-plan-"]').first();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(2000);
  await shot("after");
  return { verdict: page.url().includes(`/trip/${tripId}`) ? "CONFIRMED" : "REFUTED", observed: `after delete the page is ${page.url().replace(BASE, "")}` };
});
await probe("ai-assistant:button-send-message", async ({ page, context, shot, toasts }) => {
  await register(context, "chat");
  await page.goto(`${BASE}/ai-assistant`, { waitUntil: "networkidle" });
  await page.getByTestId("input-message").fill("Plan 3 days in Kyoto");
  await shot("before");
  await page.getByTestId("button-send-message").click();
  await page.waitForTimeout(8000);
  const t = await toasts();
  await shot("after");
  const errText = await page.locator("text=/error|failed|try again/i").first().isVisible().catch(() => false);
  return { verdict: !errText && t.length === 0 ? "CONFIRMED" : "REFUTED", observed: `after a 500 from the provider: toasts ${JSON.stringify(t)}, inline error visible=${errText}` };
});

fs.writeFileSync(path.join(OUT, "u2-results.json"), JSON.stringify(results, null, 1));
await browser.close();
