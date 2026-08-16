/**
 * Console conformance dispatch (Aug 16 2026) — EXECUTABLE verification.
 * Walks docs/testing/CONSOLE_CONFORMANCE_DISPATCH_AUG16.md checklist rows
 * A1–A6, B1–B7, C1–C5 against the running app, ASSERTING each row's
 * load-bearing expectations and saving evidence screenshots to
 * docs/testing/assets/console-conformance-aug16/.
 *
 * Exit code is non-zero if ANY assertion fails; failures are listed at the end.
 *
 * Fixture: kyoto-interpreter@traveloure.test (terms accepted, 3 approved+active
 * listings incl. one async). Availability must be authored via
 * PUT /api/provider/services/:id/availability-patterns (materializes slots);
 * this script seeds it idempotently.
 *
 * B7 is behavioral: this script performs the real authenticated PATCHes
 * (safe price → applies live; identity name → staged via editReview.stagedKeys),
 * captures the post-patch Catalog row, then reverts the price. The staged
 * identity edit has no owner-facing cancel API; the script verifies the fixture
 * is clean at START and prints the cleanup SQL to run afterwards.
 */
import { chromium, Page, APIRequestContext } from "@playwright/test";
import { mkdirSync, readdirSync, rmSync } from "node:fs";

const BASE = "http://127.0.0.1:5000";
const OUT = "docs/testing/assets/console-conformance-aug16";
const EMAIL = "kyoto-interpreter@traveloure.test";
const PASSWORD = process.env.E2E_TEST_PASSWORD || "TestPass123!";
const IN_PERSON_ID = "5c7ec36e-13e0-4982-b4b9-818e380e28d6"; // Business Meeting Interpretation (approved+active)
const ASYNC_ID = "5246d9ce-d415-4783-a919-b60c0eb0138a"; // Business Document Translation (async)
const APPROVED_ID = "9f08a627-ec17-4c15-a944-8442c448b75c"; // Conference & Event Interpretation (B7 subject)

const failures: string[] = [];
function check(row: string, cond: boolean, what: string) {
  if (cond) console.log(`  ok   [${row}] ${what}`);
  else { failures.push(`[${row}] ${what}`); console.log(`  FAIL [${row}] ${what}`); }
}
async function shot(page: Page, name: string, full = false) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log(`  shot ${name}.png`);
}

async function getService(req: APIRequestContext, id: string) {
  const list = await (await req.get(`${BASE}/api/provider/services`)).json();
  return list.find((s: any) => s.id === id);
}

/** Clear a B7-staged identity edit directly (there is deliberately no owner-facing
 * cancel API — see edit-split ruling — so the harness resets the fixture itself). */
async function clearStagedEdit(serviceId: string) {
  const { db } = await import("../server/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`UPDATE provider_services
    SET pending_changes = NULL, edit_review_status = NULL WHERE id = ${serviceId}`);
}

async function main() {
  // one coherent evidence set per run: start from an empty output dir
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) rmSync(`${OUT}/${f}`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const req = ctx.request;
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("vite")) console.log(`  http ${r.status()} ${r.url()}`);
  });

  async function ensureLoggedIn() {
    const me = await req.get(`${BASE}/api/auth/user`);
    if (me.status() === 401) {
      const login = await req.post(`${BASE}/api/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
      if (!login.ok()) throw new Error(`login failed ${login.status()}`);
      console.log("  (re)logged in");
    }
  }
  await ensureLoggedIn();

  // Pre-run cleanup: remove fixtures left by a previous crashed run (idempotency)
  {
    const list = await (await req.get(`${BASE}/api/provider/services`)).json();
    // room rows must go before their parent property or the property DELETE 500s
    list.sort((a: any, b: any) => (a.serviceName === "The Tatami Room" ? -1 : b.serviceName === "The Tatami Room" ? 1 : 0));
    for (const s of list) {
      if (["Conformance Test Machiya", "The Tatami Room", "Dispatch Draft Probe"].includes(s.serviceName)) {
        const del = await req.delete(`${BASE}/api/provider/services/${s.id}`);
        console.log(`  pre-cleanup: delete leftover '${s.serviceName}' → ${del.status()}`);
        if (!del.ok()) failures.push(`[pre] could not delete leftover fixture '${s.serviceName}' (${del.status()})`);
      }
    }
  }

  // Fixture preconditions (B7 must start clean)
  let subject0 = await getService(req, APPROVED_ID);
  check("pre", !!subject0 && subject0.approvalStatus === "approved" && subject0.status === "active",
    "B7 subject listing is approved+active");
  if (subject0?.editReviewStatus) {
    console.log("  pre-cleanup: clearing staged edit left by a previous run");
    await clearStagedEdit(APPROVED_ID);
    subject0 = await getService(req, APPROVED_ID);
  }
  check("pre", !subject0?.editReviewStatus, "B7 subject has no staged edit at start (clean fixture)");
  const ORIGINAL_PRICE = subject0?.price; // e.g. "2400.00"
  const ORIGINAL_NAME = subject0?.serviceName;

  // Seed availability through the REAL write path (idempotent replace-list; materializes slots)
  const putPatterns = await req.put(`${BASE}/api/provider/services/${IN_PERSON_ID}/availability-patterns`, {
    data: { patterns: [
      { dayOfWeek: 2, startTime: "18:00", endTime: "20:00", capacity: 8 },
      { dayOfWeek: 4, startTime: "18:00", endTime: "20:00", capacity: 8 },
    ] },
  });
  check("pre", putPatterns.ok(), "availability patterns PUT succeeded (materializes slots)");

  // ── A: Workstation ──────────────────────────────────────────────
  console.log("Checklist A — Workstation");
  await page.goto(`${BASE}/provider/workstation`, { waitUntil: "networkidle" });
  check("A1", (await page.getByText("What are you building?").count()) > 0, "header 'What are you building?'");
  await shot(page, "A1-header");
  check("A2", (await page.getByTestId("card-ladder-service").count()) > 0, "Single service tile");
  check("A2", (await page.getByTestId("card-ladder-bundle").count()) > 0, "Bundle tile (locked or unlocked per real approved count)");
  check("A2", (await page.getByTestId("card-ladder-property").count()) > 0, "Property tile");
  check("A2", (await page.getByRole("button", { name: /preview as unlocked/i }).count()) === 0,
    "no 'Preview as unlocked' button (authority note 4)");
  await page.getByTestId("grid-product-ladder").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.getByTestId("grid-product-ladder").screenshot({ path: `${OUT}/A2-door-tiles.png` });
  console.log("  shot A2-door-tiles.png (element)");
  check("A3", (await page.getByText(/start from what you do/i).count()) > 0, "'Or start from what you do' category grid");
  check("A3", (await page.getByTestId("grid-workstation-categories").count()) > 0, "category grid renders");
  await page.getByTestId("grid-workstation-categories").scrollIntoViewIfNeeded();
  await shot(page, "A3-category-grid");
  check("A4", (await page.getByTestId("section-workstation-bundles").count()) > 0, "Your bundles section");
  check("A4", (await page.getByTestId("section-workstation-properties").count()) > 0, "Your properties section");
  await page.getByTestId("section-workstation-bundles").scrollIntoViewIfNeeded();
  await shot(page, "A4-bundles-properties");
  await page.getByTestId("section-workstation-properties").scrollIntoViewIfNeeded();
  await shot(page, "A4b-properties");

  // A5 property builder ladder (S-2) — empty-state CTA when no properties, else the door tile
  if (await page.getByTestId("button-empty-new-property").count())
    await page.getByTestId("button-empty-new-property").click();
  else await page.getByTestId("button-ladder-new-property").click();
  await page.getByTestId("dialog-property-builder").waitFor({ timeout: 5000 });
  check("A5", (await page.getByText("1. The property").count()) > 0 && (await page.getByText("3. Review").count()) > 0,
    "ladder reads 1. The property · 2. Rooms · 3. Review");
  check("A5", (await page.getByTestId("button-property-submit").count()) === 0, "Submit ABSENT on step 1");
  await shot(page, "A5-property-builder-step1");
  await page.getByTestId("input-property-name").fill("Conformance Test Machiya");
  await page.getByTestId("input-property-location").fill("Gion, Kyoto");
  await page.getByTestId("input-property-description").fill("Dispatch verification fixture — not a real property.");
  await page.getByTestId("button-property-next").click();
  await page.waitForTimeout(400);
  check("A5", (await page.getByTestId("button-property-submit").count()) === 0, "Submit ABSENT on step 2 (Rooms)");
  check("A5", await page.getByTestId("button-property-next").isDisabled(), "Next gates on validity (disabled with empty room)");
  await shot(page, "A5b-property-builder-step2-rooms");
  await page.getByTestId("input-room-draft-name-0").fill("The Tatami Room");
  await page.getByTestId("input-room-draft-price-0").fill("180");
  await page.getByTestId("button-property-next").click();
  await page.waitForTimeout(400);
  check("A5", (await page.getByTestId("button-property-submit").count()) > 0, "Submit PRESENT only on Review step");
  check("A5", (await page.getByText("Not placed — optional").count()) > 0, "Review reads back pin 'Not placed — optional'");
  check("A5", (await page.getByText(/The Tatami Room/).count()) > 0, "Review reads back room + price");
  await shot(page, "A5c-property-builder-review");
  await page.getByTestId("button-property-submit").click();
  await page.waitForTimeout(1500);

  // A6 property EDIT dialog — unchanged tabs, per-step saves, no Review
  await page.goto(`${BASE}/provider/workstation`, { waitUntil: "networkidle" });
  await page.getByTestId("section-workstation-properties").scrollIntoViewIfNeeded();
  await page.getByTestId("section-workstation-properties").getByRole("button", { name: /edit/i }).first().click();
  await page.getByTestId("dialog-property-editor").waitFor({ timeout: 5000 });
  const editor = page.getByTestId("dialog-property-editor");
  check("A6", (await editor.getByText("The property").count()) > 0 && (await editor.getByText(/^Details$/).count()) > 0,
    "editor tabs: The property · Details · Rooms");
  check("A6", (await editor.getByText(/Review/).count()) === 0, "editor has NO Review step (deliberate)");
  check("A6", (await editor.getByRole("button", { name: /save room/i }).count()) > 0, "per-step saves present");
  await shot(page, "A6-property-edit-dialog");
  await page.keyboard.press("Escape");

  // find the property's service id so we can clean it up at the end
  const allServices = await (await req.get(`${BASE}/api/provider/services`)).json();
  const machiya = allServices.find((s: any) => s.serviceName === "Conformance Test Machiya");
  const tatami = allServices.find((s: any) => s.serviceName === "The Tatami Room");

  // ── B: Catalog ──────────────────────────────────────────────────
  console.log("Checklist B — Catalog");
  await page.goto(`${BASE}/provider/services`, { waitUntil: "networkidle" });
  check("B1", (await page.getByTestId("input-catalog-search").count()) > 0, "search box");
  for (const chip of [/^All/, /^Live/, /^In review/, /^Draft/])
    check("B1", (await page.getByRole("button", { name: chip }).count()) > 0, `status chip ${chip}`);
  check("B1", (await page.getByRole("button", { name: /^Map$/i }).count()) > 0, "List | Map toggle");
  await shot(page, "B1-toolbar");
  check("B2", (await page.getByText("Promote this →").count()) >= 3, "rows carry 'Promote this →'");
  check("B2", (await page.getByText("Availability →").count()) >= 3, "rows carry 'Availability →'");
  check("B2", (await page.getByText("Show on my storefront").count()) >= 3, "rows carry storefront toggle");
  await shot(page, "B2-listing-rows", true);

  // B3 map = read-only traveler preview
  await page.getByRole("button", { name: /^Map$/i }).first().click();
  await page.waitForTimeout(3000);
  check("B3", (await page.getByText(/read.?only/i).count()) > 0, "read-only notice");
  check("B3", (await page.getByText(/of \d+ place-anchored listings located/i).count()) > 0, "'X of Y' coverage line");
  check("B3", (await page.getByText(/OpenStreetMap/).count()) > 0, "ODbL/OSM attribution visible");
  check("B3", (await page.getByText(/Fix it in the Workstation/i).count()) > 0, "shape-aware fix links for unlocated rows");
  await shot(page, "B3-map-preview", true);

  // B4 month grid (S-3) via ?availability=<id> deep link (authority note 8)
  await page.goto(`${BASE}/provider/services?availability=${IN_PERSON_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  for (const label of ["Bookable", "Blacked out", "Nothing published", "Today"])
    check("B4", (await page.getByText(label, { exact: true }).count()) > 0, `legend entry '${label}'`);
  check("B4", (await page.getByText(/Next available/i).count()) > 0, "'Next available' chip");
  check("B4", (await page.getByText(/18:00 · 8/).count()) > 0, "scheduled cells show real slot time + seats left");
  await shot(page, "B4-month-grid");
  const drawer = page.getByTestId("drawer-availability-editor");
  if (await drawer.count()) { await drawer.evaluate((e) => (e.scrollTop = 300)); await shot(page, "B4b-month-grid-drawer"); }

  // B5 vocabulary (S-4): async listing → No calendar, no empty grid
  check("B5", (await page.getByText("Repeats weekly").count()) > 0, "scheduled listing titled 'Repeats weekly'");
  await page.goto(`${BASE}/provider/services?availability=${ASYNC_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  check("B5", (await page.getByText(/No calendar — this sells without slots/i).count()) > 0,
    "async listing shows 'No calendar — this sells without slots'");
  check("B5", (await page.getByText("Bookable", { exact: true }).count()) === 0, "no empty grid/legend on async listing");
  await shot(page, "B5-no-calendar");

  // B6 edit-split panel (S-1): present on APPROVED listing home…
  await page.goto(`${BASE}/provider/services/${APPROVED_ID}/edit`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("B6", (await page.getByText("Editing a live listing").count()) > 0, "panel renders on approved listing");
  check("B6", (await page.getByText(/goes live immediately/i).count()) > 0, "'Goes live immediately' column");
  check("B6", (await page.getByText(/re-enters review/i).count()) > 0, "'Re-enters review' column");
  check("B6", (await page.getByText(/Nothing is taken down for an edit/i).count()) > 0, "closing line present");
  await shot(page, "B6-edit-split-panel", true);
  // …and ABSENT on a draft listing (created + deleted here)
  const draftRes = await req.post(`${BASE}/api/provider/services`, {
    data: { serviceName: "Dispatch Draft Probe", description: "temporary draft for B6 negative check",
            price: "100.00", deliveryMethod: "in_person", status: "draft" } });
  check("B6", draftRes.ok(), "draft probe created");
  const draft = await draftRes.json();
  await page.goto(`${BASE}/provider/services/${draft.id}/edit`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("B6", (await page.getByText("Editing a live listing").count()) === 0, "panel ABSENT on draft listing");
  await shot(page, "B6b-no-panel-on-draft", true);

  // B7 — behavioral edit-split truth test (real PATCHes)
  console.log("B7 — behavioral truth test");
  const safe = await (await req.patch(`${BASE}/api/provider/services/${APPROVED_ID}`, { data: { price: "2450.00" } })).json();
  check("B7", safe.price === "2450.00", "safe PATCH (price) applied immediately");
  check("B7", safe.editReview === undefined, "safe PATCH returned NO editReview");
  check("B7", safe.approvalStatus === "approved" && safe.status === "active", "listing stays live after safe PATCH");
  const ident = await (await req.patch(`${BASE}/api/provider/services/${APPROVED_ID}`, {
    data: { serviceName: `${ORIGINAL_NAME} (Kansai)` } })).json();
  check("B7", ident.editReview?.status === "pending", "identity PATCH staged (editReview.status=pending)");
  check("B7", JSON.stringify(ident.editReview?.stagedKeys) === JSON.stringify(["serviceName"]),
    "editReview.stagedKeys === ['serviceName']");
  check("B7", ident.serviceName === ORIGINAL_NAME, "live row name UNCHANGED after identity PATCH");
  await page.goto(`${BASE}/provider/services`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("B7", (await page.getByText("Edit in review").count()) > 0, "Catalog row shows 'Edit in review' chip");
  await shot(page, "B7-edit-in-review-row", true);
  // revert the safe patch and verify
  const revert = await (await req.patch(`${BASE}/api/provider/services/${APPROVED_ID}`, { data: { price: ORIGINAL_PRICE } })).json();
  check("B7", revert.price === ORIGINAL_PRICE, `price reverted to ${ORIGINAL_PRICE}`);

  // ── C: Distribute ───────────────────────────────────────────────
  console.log("Checklist C — Distribute");
  await page.goto(`${BASE}/provider/distribute?listing=${IN_PERSON_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  check("C1", (await page.getByTestId("card-storefront-header").count()) > 0, "storefront card leads");
  check("C1", (await page.getByText(/\/p\/kansai-bizlang/).count()) > 0, "'/p/<handle>' URL (authority note 1)");
  check("C1", (await page.getByText(/Live · showing \d+ of \d+ listings/).count()) > 0, "'Live · showing X of Y listings'");
  check("C1", (await page.getByTestId("button-edit-handle-bio").count()) > 0, "Edit handle & bio");
  await shot(page, "C1-storefront-card");
  // C2 — approved+active listing: frames unlocked
  check("C2", (await page.locator(`[data-testid="img-share-feed-${IN_PERSON_ID}"]`).count()) > 0, "Feed frame unlocked on approved+active listing");
  check("C2", (await page.locator(`[data-testid="img-share-story-${IN_PERSON_ID}"]`).count()) > 0, "Story frame unlocked");
  check("C2", (await page.getByText(/route stops|not a travel route/i).count()) > 0, "Route honesty line present");
  await shot(page, "C2-share-kit", true);
  // C3 — promote: measurement note, no analytics numbers
  check("C3", (await page.getByTestId("text-promote-measurement-note").count()) > 0, "'Measurement stays on Performance.' note");
  check("C3", (await page.getByTestId("button-view-link-performance").count()) > 0, "'View link performance' deep-link");
  check("C3", (await page.getByText(/\d+ (clicks|views|bookings)/i).count()) === 0, "no analytics numbers on the page");
  await page.getByTestId("section-channel-promote").scrollIntoViewIfNeeded();
  await shot(page, "C3-promote");
  // C5 — ratified extras (authority note 3: absence = divergence)
  check("C5", (await page.getByTestId("card-channel-marketplace").count()) > 0, "Marketplace channel present");
  check("C5", (await page.getByTestId("card-channel-direct").count()) > 0, "Direct-link channel present");
  check("C5", (await page.getByTestId("channel-state-strip").count()) > 0, "channel-state strip present");
  await page.getByTestId("card-channel-marketplace").scrollIntoViewIfNeeded();
  await shot(page, "C5-ratified-extras", true);
  // C2 negative — unapproved (draft) listing: honest locked message
  await ensureLoggedIn();
  await page.goto(`${BASE}/provider/distribute?listing=${machiya?.id ?? draft.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  check("C2", (await page.getByText(/unlock once this listing is approved/i).count()) > 0,
    "honest unlock message on not-yet-approved listing");
  check("C2", (await page.locator('[data-testid^="img-share-feed-"]').count()) === 0, "no share images pre-approval");
  await shot(page, "C2b-share-kit-locked", true);

  // C4 — arrival flow from Catalog + forged id
  await ensureLoggedIn();
  await page.goto(`${BASE}/provider/services`, { waitUntil: "networkidle" });
  await page.getByText("Promote this →").first().click();
  await page.waitForTimeout(2000);
  check("C4", (await page.getByTestId("banner-promote-arrival").count()) > 0, "'Promoting «name»' arrival banner");
  check("C4", (await page.getByText(/Back to Catalog/i).count()) > 0, "'← Back to Catalog'");
  check("C4", (await page.getByTestId("text-arrival-crumbs").count()) > 0, "crumb line Catalog › Distribute › «name»");
  await shot(page, "C4-arrival-flow");
  await page.goto(`${BASE}/provider/distribute?listing=00000000-0000-0000-0000-000000000000`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  check("C4", (await page.getByTestId("banner-promote-arrival").count()) === 0, "forged ?listing= id silently ignored");
  await shot(page, "C4b-forged-listing-ignored");

  // ── Cleanup ─────────────────────────────────────────────────────
  const delDraft = await req.delete(`${BASE}/api/provider/services/${draft.id}`);
  check("cleanup", delDraft.ok(), "draft probe deleted");
  for (const s of [tatami, machiya]) if (s) { // room before parent property
    const d = await req.delete(`${BASE}/api/provider/services/${s.id}`);
    check("cleanup", d.ok(), `A5 fixture '${s.serviceName}' deleted`);
  }
  await clearStagedEdit(APPROVED_ID); // deterministic B7 residue cleanup (no owner cancel API exists)
  const finalSubject = await getService(req, APPROVED_ID);
  check("cleanup", finalSubject.price === ORIGINAL_PRICE && finalSubject.serviceName === ORIGINAL_NAME,
    "B7 subject live row back to original price/name");
  check("cleanup", !finalSubject.editReviewStatus && !finalSubject.pendingChanges,
    "B7 staged edit cleared — fixture left clean");

  await browser.close();
  console.log(`\n==== ${failures.length === 0 ? "ALL CHECKS PASSED" : failures.length + " FAILURES"} ====`);
  failures.forEach((f) => console.log("FAIL " + f));
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
