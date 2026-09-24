// U2 second pass — probes that were BLOCKED on the first pass because of harness targeting or missing
// local test data. Same output contract as u2-ui-probes.mjs. Local test data used here:
//   · u2-seed.sql (one approved affiliate partner + one Kyoto product) for the curated card;
//   · an approved, handle-less expert addressed by id (/experts/:id) for the storefront share panel;
//   · `UPDATE trips SET dates_confirmed_at = NULL` on the probe's OWN freshly minted trip, so the slip's
//     "Set your dates" control renders (it exists only for unconfirmed windows, LD 30 amended).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, pool, futureDates, fillPlanModal, spaNavigate } from "./lib.mjs";

const OUT = path.resolve("docs/audits/ui");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const prev = JSON.parse(fs.readFileSync(path.join(OUT, "u2-results.json"), "utf8"));
const results = new Map(prev.map((r) => [r.rowId, r]));

const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
async function probe(rowId, fn) {
  if (ONLY && !ONLY.includes(rowId)) return;
  const dir = path.join(OUT, rowId.replace(/[:/]/g, "__"));
  fs.rmSync(dir, { recursive: true, force: true });
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
  const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(dir, `${name}.png`) }); };
  const toasts = async () => (await page.locator('li[data-state="open"], [role="status"]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  let out;
  try { out = await fn({ page, context, shot, toasts, net }); }
  catch (e) { await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {}); out = { verdict: "BLOCKED", observed: `harness error: ${String(e.message || e).slice(0, 300)}` }; }
  fs.writeFileSync(path.join(dir, "network.json"), JSON.stringify(net, null, 1));
  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ rowId, ...out }, null, 1));
  results.set(rowId, { rowId, dir: path.relative(process.cwd(), dir), ...out });
  console.log(rowId, "→", out.verdict);
  await context.close();
}
async function register(context, tag) {
  const email = `u2b-${tag}-${Date.now()}@traveloure.test`;
  const r = await context.request.post(`${BASE}/api/auth/register`, { data: { email, password: "TestPassword123!", firstName: "U2b", lastName: tag, userType: "user" } });
  await context.request.post(`${BASE}/api/auth/accept-terms`, { data: { acceptTerms: true, acceptPrivacy: true } });
  return { id: (await r.json()).user?.id };
}
async function modalMint(page, destination) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByTestId("button-plan-trip").click();
  await fillPlanModal(page, destination, 40);
  await page.getByTestId("planning-option-myself").click();
  await page.waitForTimeout(3000);
  return page.url().split("/plans/")[1]?.split("?")[0];
}
const failWith500 = (r) => r.fulfill({ status: 500, body: '{"message":"forced failure (audit)"}', contentType: "application/json" });
const isErr = (ts) => ts.some((x) => /fail|error|could not|couldn't|something went wrong/i.test(x));

await probe("services:curated-pick-trip", async ({ page, context, shot }) => {
  await register(context, "curated");
  const { start, end } = futureDates(45);
  await context.request.post(`${BASE}/api/trips`, { data: { title: "Kyoto plan", destination: "Kyoto, Japan", startDate: start, endDate: end } });
  await page.goto(`${BASE}/services?location=Kyoto%2C+Japan`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid^="button-add-trip-"]').first().waitFor({ timeout: 20000 });
  const curated = page.locator('[data-testid^="button-add-trip-"]').first();
  const card = page.locator('[data-testid^="button-add-to-cart-"]').first();
  await curated.scrollIntoViewIfNeeded().catch(() => {});
  await shot("before");
  const cLabel = (await curated.innerText().catch(() => "")).trim();
  const sLabel = (await card.innerText().catch(() => "")).trim();
  await curated.click();
  await page.waitForTimeout(900);
  await shot("after");
  const picker = await page.getByTestId("dialog-add-to-trip").isVisible().catch(() => false);
  return { verdict: picker && /plan/i.test(cLabel) && /plan/i.test(sLabel) ? "CONFIRMED" : "REFUTED", observed: `curated label "${cLabel}" opened a trip picker=${picker}; ServiceCard label on the same page "${sLabel}" adds directly to the pen target (J1 R3)` };
});
await probe("destinations:ade-primary", async ({ page, context, shot }) => {
  await register(context, "wish");
  await modalMint(page, "Kyoto, Japan");
  const s = await context.request.post(`${BASE}/api/saved-items`, { data: { contentType: "activity", contentId: "kyoto-audit-activity", contentName: "Kyoto tea ceremony (audit)", city: "Kyoto" } });
  await spaNavigate(page, "/destinations");
  await page.waitForTimeout(2500);
  const plus = page.locator('[data-testid^="button-add-to-trip-"]').first();
  await plus.scrollIntoViewIfNeeded().catch(() => {});
  await shot("before");
  if (!(await plus.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: `Wishlist '+ Trip' not rendered (saved-items POST → ${s.status()})` };
  await plus.click();
  await page.waitForTimeout(1200);
  await shot("after");
  const txt = (await page.getByTestId("button-add-content-to-cart").innerText().catch(() => "")).trim();
  return { verdict: txt && !/Kyoto/i.test(txt) ? "CONFIRMED" : "REFUTED", observed: `dialog primary button reads "${txt}" — it does not name the plan it will write to` };
});
await probe("discover-location:addon-agent", async ({ page, context, shot, net }) => {
  await register(context, "addon");
  await page.goto(`${BASE}/discover/location/kyoto`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const card = page.getByTestId("addon-airport-transfer");
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await shot("before");
  await card.click();
  await page.waitForTimeout(1500);
  await shot("after");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.getByTestId("addon-airport-transfer").scrollIntoViewIfNeeded().catch(() => {});
  await shot("after-reload");
  const post = net.find((x) => x.method === "POST" && /affiliate-booking-requests/.test(x.url));
  const badgeAfterReload = (await page.getByTestId("addon-airport-transfer").innerText().catch(() => "")).includes("Request sent");
  return { verdict: post && post.status < 300 && !badgeAfterReload ? "CONFIRMED" : post ? "REFUTED" : "BLOCKED", observed: `request → ${post ? post.status + " " + (post.response || "").slice(0, 120) : "not sent"}; 'Request sent' badge survives reload=${badgeAfterReload}; request carries no tripId (body ${post?.body?.slice(0, 120)})` };
});
await probe("transportation:twelvego-deeplink-book", async ({ page, context, shot, net }) => {
  await register(context, "twelvego");
  await page.goto(`${BASE}/transportation`, { waitUntil: "networkidle" });
  await page.getByTestId("tab-popular").click();
  await page.waitForTimeout(1200);
  const card = page.locator('[data-testid^="twelve-go-agent-route-"]').first();
  await shot("before");
  const txt = (await card.innerText()).replace(/\s+/g, " ").trim();
  await card.click();
  await page.waitForTimeout(1500);
  await shot("after");
  const post = net.find((x) => x.method === "POST" && /affiliate-booking-requests/.test(x.url));
  return { verdict: /schedule|price/i.test(txt) && post ? "CONFIRMED" : "REFUTED", observed: `card text "${txt.slice(0, 90)}" → ${post ? `POST /api/affiliate-booking-requests ${post.status}` : "no booking request"}` };
});
await probe("experience-template:add-to-cart", async ({ page, context, shot, net }) => {
  await register(context, "tplbound");
  const tripId = await modalMint(page, "Kyoto, Japan");
  // Stay in the SPA from the public landing so the pen stays bound (H8 D6); the full-load variant is recorded below.
  await spaNavigate(page, "/experiences/travel/new?destination=Kyoto%2C%20Japan");
  await page.waitForTimeout(2000);
  await page.getByTestId("tab-services").click().catch(() => {});
  const add = page.locator('[data-testid^="button-add-to-cart-"]').first();
  await add.waitFor({ timeout: 15000 });
  const label = (await add.innerText()).trim();
  await shot("before");
  await add.click();
  await page.waitForTimeout(3000);
  await shot("after");
  const url = page.url().replace(BASE, "");
  const item = net.find((x) => x.method === "POST" && /itinerary-items/.test(x.url));
  return {
    verdict: /cart/i.test(label) && item && url.includes("/plans/") ? "CONFIRMED" : "REFUTED",
    observed: `SPA path, pen bound to ${tripId}: button "${label}" → ${item ? "POST itinerary-items " + item.status : "no item POST"}, landed on ${url}. (First-pass full-load variant: the pen was unbound (H8 D6) and the same button went to /cart — so the label is right on one path and wrong on the other.)`,
  };
});
await probe("storefront:storefront-panel-share", async ({ page, context, shot, toasts }) => {
  await register(context, "store");
  const { start, end } = futureDates(45);
  const r = await context.request.post(`${BASE}/api/trips`, { data: { title: "Kyoto plan", destination: "Kyoto, Japan", startDate: start, endDate: end } });
  const tripId = (await r.json()).id;
  const { rows } = await pool.query("select u.id from users u join local_expert_forms f on f.user_id=u.id where f.status='approved' and u.role='expert' limit 1");
  await page.route("**/api/trips/*/advisors", (rt) => (rt.request().method() === "POST" ? failWith500(rt) : rt.continue()));
  await page.goto(`${BASE}/experts/${rows[0].id}?tripId=${tripId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const btn = page.getByTestId("storefront-panel-share");
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await shot("before");
  if (!(await btn.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: "share panel not rendered for an approved expert + owned trip" };
  await btn.click();
  await page.waitForTimeout(900);
  const t = await toasts();
  const inline = await page.getByTestId("storefront-panel-share-error").isVisible().catch(() => false);
  await shot("after");
  return { verdict: isErr(t) || inline ? "REFUTED" : "CONFIRMED", observed: `POST advisors forced 500 → toasts ${JSON.stringify(t)}, inline error (storefront-panel-share-error) visible=${inline}` };
});
await probe("inbox:button-report-thread", async ({ page, context, shot, toasts, net }) => {
  await register(context, "inbox");
  // Thread setup: the UI's first-message path 404s (new finding, docs/audits/ui/chat__first-message), so the
  // thread is created through the still-live deprecated receiverId rail — test setup only.
  const { rows } = await pool.query("select id from users where handle = 'kansai-bizlang'");
  const sent = await context.request.post(`${BASE}/api/chats`, { data: { receiverId: rows[0].id, senderId: "session", message: "Hello (audit probe)" } });
  if (sent.status() >= 300) return { verdict: "BLOCKED", observed: `thread setup via receiverId → ${sent.status()} ${(await sent.text()).slice(0, 120)}` };
  await page.route("**/api/messages/report/**", failWith500);
  await page.goto(`${BASE}/inbox`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const actions = page.locator('[data-testid^="button-thread-actions-"]').first();
  if (await actions.isVisible().catch(() => false)) await actions.click();
  await page.waitForTimeout(500);
  const rep = page.locator('[data-testid^="button-report-thread-"]').first();
  await shot("before");
  if (!(await rep.isVisible().catch(() => false))) return { verdict: "BLOCKED", observed: "no report control on /inbox even with a thread" };
  await rep.click();
  await page.waitForTimeout(600);
  const sel = page.getByTestId("select-inbox-report-reason");
  if (await sel.isVisible().catch(() => false)) { await sel.click(); await page.locator('[role="option"]').first().click(); }
  await page.getByTestId("textarea-inbox-report-details").fill("audit probe").catch(() => {});
  await shot("dialog");
  await page.getByTestId("button-submit-inbox-report").click();
  await page.waitForTimeout(900);
  const t = await toasts();
  const dialogOpen = await page.getByTestId("dialog-inbox-report").isVisible().catch(() => false);
  await shot("after");
  return { verdict: isErr(t) ? "REFUTED" : "CONFIRMED", observed: `report forced 500 → toasts ${JSON.stringify(t)}; dialog still open=${dialogOpen}` };
});
await probe("slip:button-slip-dates-save", async ({ page, context, shot, toasts }) => {
  await register(context, "dates");
  const { start, end } = futureDates(45);
  const r = await context.request.post(`${BASE}/api/trips`, { data: { title: "Kyoto plan", destination: "Kyoto, Japan", startDate: start, endDate: end } });
  const tripId = (await r.json()).id;
  await pool.query("update trips set dates_confirmed_at = null where id = $1", [tripId]); // local test setup, the probe's own trip
  await page.route(`**/api/trips/${tripId}`, (rt) => (rt.request().method() === "PATCH" ? failWith500(rt) : rt.continue()));
  await page.goto(`${BASE}/plans/${tripId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const cta = page.getByTestId("slip-dates-set-cta");
  if (!(await cta.isVisible().catch(() => false))) { await shot("before"); return { verdict: "BLOCKED", observed: "'Set your dates' not rendered even with dates_confirmed_at NULL" }; }
  await cta.click();
  const d = futureDates(70);
  await page.getByTestId("input-slip-dates-start").fill(d.start);
  await page.getByTestId("input-slip-dates-end").fill(d.end);
  await shot("before");
  await page.getByTestId("button-slip-dates-save").click();
  await page.waitForTimeout(900);
  const t = await toasts();
  const dialogOpen = await page.getByTestId("slip-dates-dialog").isVisible().catch(() => false);
  await shot("after");
  return { verdict: isErr(t) ? "REFUTED" : "CONFIRMED", observed: `PATCH trip forced 500 → toasts ${JSON.stringify(t)}; dialog still open=${dialogOpen}` };
});
// Environment-blocked rows: record the evidence of absence (screenshot + the empty feed).
await probe("services:unified-request-booking", async ({ page, context, shot }) => {
  await register(context, "unified");
  await page.goto(`${BASE}/services?location=Kyoto%2C+Japan`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await shot("before");
  const n = await page.locator('[data-testid^="card-result-"]').count();
  return { verdict: n ? "BLOCKED" : "BLOCKED", observed: `unified (SERP/partner) result cards rendered: ${n}. They come from live SERP/partner APIs (stub keys here). Needs SERP_API_KEY or a partner sandbox.` };
});
await probe("deals:book", async ({ page, context, shot }) => {
  await register(context, "deals");
  await page.goto(`${BASE}/deals`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await shot("before");
  const r = await context.request.get(`${BASE}/api/deals`);
  return { verdict: "BLOCKED", observed: `GET /api/deals → ${r.status()} ${(await r.text()).slice(0, 80)}; no deal card to click. Needs partner deal feeds.` };
});

fs.writeFileSync(path.join(OUT, "u2-results.json"), JSON.stringify([...results.values()], null, 1));
await browser.close();
await pool.end();
