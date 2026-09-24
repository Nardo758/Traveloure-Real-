// Audit closeout probes (read-only against the app; local test data only).
//   · U1  — per-template selection controls as rendered, vs SELECTION_CONTROL_MODEL_SPEC_v2 starter sets.
//   · Re-run of the BLOCKED services:unified-request-booking row: `domcontentloaded` + 90s goto timeout.
//     The partner catalog feed (/api/catalog/activities-gyg) is EMPTY with stub keys, so ONE card is
//     rendered from a fixture feed response (page.route, stated in the result) whose bookingToken is a
//     REAL vault entry seeded into the shared cache table the vault reads (travelpayouts_cache,
//     brand 'affiliate-url-vault', 1h TTL). The submit goes to the REAL server rail.
//   · RC-12 — invented party size: slip header source, IntakePanel default, AI modal request body.
// Output: docs/audits/ui/<row-id>/ (screenshots, network.json, result.json) + ui/closeout-results.json.
// Passwords are generated per run and never written to disk.
import { chromium } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BASE, pool, futureDates, fillPlanModal } from "./lib.mjs";

const OUT = path.resolve("docs/audits/ui");
const GOTO = { waitUntil: "domcontentloaded", timeout: 90000 };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;

async function probe(rowId, fn) {
  if (ONLY && !ONLY.some((o) => rowId.startsWith(o))) return;
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
    if (req.method() !== "GET") { e.body = (req.postData() || "").slice(0, 600); try { e.response = (await res.text()).slice(0, 400); } catch {} }
    net.push(e);
  });
  const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(dir, `${name}.png`) }); };
  const toasts = async () => (await page.locator('li[data-state="open"], [role="status"]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  let out;
  try { out = await fn({ page, context, shot, toasts, net }); }
  catch (e) { await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {}); out = { verdict: "BLOCKED", observed: `harness error: ${String(e.message || e).slice(0, 300)}` }; }
  fs.writeFileSync(path.join(dir, "network.json"), JSON.stringify(net, null, 1));
  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ rowId, ...out }, null, 1));
  results.push({ rowId, dir: path.relative(process.cwd(), dir), ...out });
  console.log(rowId, "→", out.verdict, "·", String(out.observed).slice(0, 160));
  await context.close();
}
async function register(context, tag) {
  const email = `closeout-${tag}-${Date.now()}@traveloure.test`;
  const password = crypto.randomBytes(12).toString("base64url") + "A1!";
  const r = await context.request.post(`${BASE}/api/auth/register`, { data: { email, password, firstName: "Closeout", lastName: tag, userType: "user" } });
  await context.request.post(`${BASE}/api/auth/accept-terms`, { data: { acceptTerms: true, acceptPrivacy: true } });
  return { id: (await r.json()).user?.id };
}

// ── U1: selection controls per template tab, as rendered ─────────────────────────────────
const TEMPLATE_TABS = [
  ["travel", "services"], ["travel", "activities"],
  ["wedding", "vendors"], ["corporate-events", "team-activities"], ["corporate", "venues"],
  ["date-night", "dining"], ["proposal", "services"], ["birthday", "venues"],
];
for (const [slug, tab] of TEMPLATE_TABS) {
  await probe(`u1-controls:${slug}:${tab}`, async ({ page, context, shot }) => {
    await register(context, `u1-${slug}`);
    await page.goto(`${BASE}/experiences/${slug}?destination=Kyoto%2C+Japan`, GOTO);
    await page.waitForTimeout(3500);
    const t = page.getByTestId(`tab-${tab}`).first();
    if (await t.isVisible().catch(() => false)) { await t.click(); await page.waitForTimeout(1500); }
    const opts = await page.locator('[data-testid^="selection-"]:not([data-testid="selection-clear"])').evaluateAll((els) =>
      els.map((e) => `${e.getAttribute("data-testid")}="${(e.textContent || "").trim()}"`));
    await shot("tab");
    return { verdict: "OBSERVED", observed: `/experiences/${slug} tab ${tab}: ${opts.length} selection-control option(s) rendered ${JSON.stringify(opts)}`, options: opts };
  });
}

// ── Re-run: services:unified-request-booking ────────────────────────────────────────────
async function seedVaultToken() {
  const batch = crypto.randomUUID();
  await pool.query(
    `insert into travelpayouts_cache (brand, cache_key, data, expires_at) values ('affiliate-url-vault', $1, $2, now() + interval '1 hour')`,
    [`affiliate-url-vault::${batch}`, JSON.stringify([{ url: "https://partner.example.test/audit-activity", name: "Audit Kyoto Tea Walk", provider: "GetYourGuide" }])],
  );
  return `${batch}.0`;
}
async function unifiedSetup(page, token) {
  await page.route("**/api/catalog/activities-gyg*", (rt) => rt.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ total: 1, items: [{ id: "audit-gyg-1", type: "activity", provider: "getyourguide", title: "Audit Kyoto Tea Walk",
      description: "Fixture feed row (audit harness)", price: 89, currency: "USD", destination: "Kyoto, Japan", categories: ["activity"], bookingToken: token }] }),
  }));
  await page.goto(`${BASE}/services?location=Kyoto%2C+Japan`, GOTO);
  const btn = page.getByTestId("button-view-audit-gyg-1");
  await btn.waitFor({ timeout: 30000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.getByTestId("booking-modal-audit-gyg-1").waitFor({ timeout: 10000 });
  await page.getByTestId("input-date-audit-gyg-1").fill(futureDates(40).start);
}
await probe("services:unified-request-booking", async ({ page, context, shot, toasts, net }) => {
  const u = await register(context, "unified");
  const token = await seedVaultToken();
  await unifiedSetup(page, token);
  await shot("before");
  await page.getByTestId("button-submit-audit-gyg-1").click();
  await page.waitForTimeout(1200);
  const t = await toasts();
  await shot("after");
  const post = net.find((x) => x.method === "POST" && /affiliate-booking-requests/.test(x.url));
  const { rows } = await pool.query("select id, trip_id, status, expert_id, item_name from affiliate_booking_requests where user_id = $1", [u.id]);
  // INVISIBLE_RESULT: reload the surface the traveler acted on — is the request shown anywhere?
  await page.goto(`${BASE}/services?location=Kyoto%2C+Japan`, GOTO);
  await page.waitForTimeout(4000);
  // The fixture feed route is still active, so the SAME card re-renders; the question is whether the card
  // (or anything on the page) now shows the request's state rather than the untouched "Request booking" CTA.
  const cardText = (await page.getByTestId("card-result-audit-gyg-1").innerText().catch(() => "")).replace(/\s+/g, " ");
  const bodyText = await page.locator("body").innerText();
  const visible = /requested|pending|received|in progress/i.test(cardText) || /booking requested|your request/i.test(bodyText);
  await shot("reload");
  const tripless = rows.length === 1 && rows[0].trip_id === null;
  return {
    verdict: post?.status === 201 || post?.status === 200 ? (tripless && !visible ? "CONFIRMED" : "REFUTED") : "BLOCKED",
    gap: "INVISIBLE_RESULT",
    observed: `fixture feed card (real vault token) → POST ${post?.url} ${post?.status}; toasts ${JSON.stringify(t)}; DB affiliate_booking_requests ${JSON.stringify(rows)}; after reload of /services the card reads ${JSON.stringify(cardText.slice(0, 160))}; request state shown on the surface=${visible}`,
  };
});
await probe("services:unified-request-booking-failure", async ({ page, context, shot, toasts, net }) => {
  await register(context, "unified-fail");
  const token = await seedVaultToken();
  await page.route("**/api/affiliate-booking-requests", (rt) => (rt.request().method() === "POST"
    ? rt.fulfill({ status: 500, contentType: "application/json", body: '{"message":"forced failure (audit)"}' }) : rt.continue()));
  await unifiedSetup(page, token);
  await page.getByTestId("button-submit-audit-gyg-1").click();
  await page.waitForTimeout(900);
  const t = await toasts();
  await shot("after");
  const signedIn = (await context.request.get(`${BASE}/api/auth/user`)).status() === 200;
  const claimsSignIn = t.some((x) => /sign in required/i.test(x));
  return {
    verdict: signedIn && claimsSignIn ? "CONFIRMED" : "REFUTED",
    gap: "SILENT_FAILURE_UI",
    observed: `signed in (GET /api/auth/user 200)=${signedIn}; POST affiliate-booking-requests forced 500 → toasts ${JSON.stringify(t)}`,
  };
});

// ── RC-12: invented party size ──────────────────────────────────────────────────────────
await probe("rc12:slip-party-untouched", async ({ page, context, shot, net }) => {
  await register(context, "rc12slip");
  await page.goto(`${BASE}/`, GOTO);
  await page.getByTestId("button-plan-trip").click();
  await fillPlanModal(page, "Kyoto, Japan", 40); // never touches the Who step's +/-
  await page.getByTestId("planning-option-myself").click();
  await page.waitForURL(/\/plans\//, { timeout: 20000 });
  await page.waitForTimeout(3500);
  const tripId = page.url().split("/plans/")[1]?.split(/[?#]/)[0];
  const mint = net.find((x) => x.method === "POST" && /\/api\/trips$/.test(x.url.split("?")[0]));
  const { rows } = await pool.query("select adults, kids, number_of_travelers from trips where id = $1", [tripId]);
  const pc = await (await context.request.get(`${BASE}/api/trips/${tripId}/plancard`)).json();
  const header = (await page.locator("body").innerText()).match(/\b\d+ (traveler|travelers|guest|guests|attendee|attendees)\b/)?.[0] ?? null;
  await shot("slip");
  const invented = header === "1 traveler" && rows[0] && rows[0].adults == null && rows[0].kids == null && rows[0].number_of_travelers == null;
  return {
    verdict: invented ? "CONFIRMED" : "REFUTED",
    observed: `mint body ${mint?.body}; DB trips(adults,kids,number_of_travelers)=${JSON.stringify(rows[0])}; plancard trip.travelers=${pc?.trip?.travelers}; slip header party text=${JSON.stringify(header)}`,
  };
});
await probe("rc12:intake-panel-default", async ({ page, context, shot, net }) => {
  await register(context, "rc12intake");
  await page.goto(`${BASE}/my-trips`, GOTO);
  await page.getByTestId("button-create-new").click();
  const f = page.getByTestId("input-intake-travelers");
  await f.waitFor({ timeout: 10000 });
  const shown = await f.inputValue();
  await shot("step1");
  const { start, end } = futureDates(60);
  const dest = page.locator("#intake-destination, [data-testid='input-intake-destination']").first();
  await dest.fill("Kyoto, Japan");
  await page.locator("[data-testid='input-intake-start-date'], #intake-start").first().fill(start).catch(() => {});
  await page.locator("[data-testid='input-intake-end-date'], #intake-end").first().fill(end).catch(() => {});
  await page.locator("[data-testid='button-intake-next']").click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.locator('[data-testid^="button-intake-shape-"], [data-testid^="option-intake-"]').first().click().catch(() => {});
  await page.getByTestId("button-intake-create").click().catch(() => {});
  await page.waitForTimeout(2500);
  await shot("after");
  const mint = net.find((x) => x.method === "POST" && /\/api\/trips$/.test(x.url.split("?")[0]));
  return {
    verdict: shown === "2" ? "CONFIRMED" : "REFUTED",
    observed: `Travelers field pre-filled with ${JSON.stringify(shown)} before any input; create body ${mint ? mint.body : "(create not reached)"}`,
  };
});
await probe("rc12:ai-modal-body", async ({ page, context, shot, net }) => {
  await register(context, "rc12ai");
  await page.route("**/api/ai/generate-itinerary", (rt) => rt.fulfill({ status: 500, contentType: "application/json", body: '{"message":"forced failure (audit): request body captured only"}' }));
  await page.goto(`${BASE}/`, GOTO);
  await page.getByTestId("button-plan-trip").click();
  await fillPlanModal(page, "Kyoto, Japan", 40);
  await page.getByTestId("planning-option-ai").click();
  await page.waitForTimeout(2000);
  const label = await page.getByTestId("text-basics-travelers").innerText().catch(() => null);
  await shot("ai-modal");
  const gen = page.getByTestId("button-generate-itinerary");
  let body = null;
  const reqP = page.waitForRequest((r) => r.url().includes("/api/ai/generate-itinerary"), { timeout: 15000 }).catch(() => null);
  if (await gen.isVisible().catch(() => false)) { await gen.click(); const r = await reqP; body = r?.postData() ?? null; }
  await shot("after-generate");
  const sent = body ? JSON.parse(body).travelers : undefined;
  return {
    verdict: /not stated/i.test(label || "") && sent === 2 ? "CONFIRMED" : "REFUTED",
    observed: `summary label ${JSON.stringify(label)}; generate-itinerary request body travelers=${JSON.stringify(sent)} (response forced 500 so nothing is minted)`,
  };
});

fs.writeFileSync(path.join(OUT, "closeout-results.json"), JSON.stringify(results, null, 1));
await browser.close();
await pool.end();
