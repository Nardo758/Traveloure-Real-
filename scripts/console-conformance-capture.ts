/**
 * Console conformance dispatch capture (Aug 16 2026) — task-scoped helper.
 * Logs in as kyoto-interpreter@traveloure.test and captures row screenshots
 * A1–A6, B1–B6, C1–C5 into docs/testing/assets/console-conformance-aug16/.
 * B7 evidence is gathered via API in the dispatch run (see Results table).
 */
import { chromium, Page } from "@playwright/test";

const BASE = "http://127.0.0.1:5000";
const OUT = "docs/testing/assets/console-conformance-aug16";
const IN_PERSON_ID = "5c7ec36e-13e0-4982-b4b9-818e380e28d6"; // Business Meeting Interpretation
const ASYNC_ID = "5246d9ce-d415-4783-a919-b60c0eb0138a"; // Business Document Translation (async)
const APPROVED_ID = "9f08a627-ec17-4c15-a944-8442c448b75c"; // Conference & Event Interpretation

const notes: string[] = [];
function note(s: string) { notes.push(s); console.log("NOTE: " + s); }

async function shot(page: Page, name: string, opts: { full?: boolean } = {}) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.full ?? false });
  console.log("SAVED " + name);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  // login
  const r = await ctx.request.post(`${BASE}/api/auth/login`, {
    data: { email: "kyoto-interpreter@traveloure.test", password: "TestPass123!" },
  });
  if (!r.ok()) throw new Error("login failed " + r.status());

  // ── A: Workstation ──────────────────────────────────────────────
  await page.goto(`${BASE}/provider/workstation`, { waitUntil: "networkidle" });
  await shot(page, "A1-header");
  const ladder = page.getByTestId("grid-product-ladder");
  await ladder.scrollIntoViewIfNeeded();
  await shot(page, "A2-door-tiles");
  const cats = page.getByTestId("grid-workstation-categories");
  await cats.scrollIntoViewIfNeeded();
  await shot(page, "A3-category-grid");
  await page.getByTestId("section-workstation-bundles").scrollIntoViewIfNeeded().catch(() => note("A4: bundles section missing"));
  await shot(page, "A4-bundles-properties", { full: false });
  await page.getByTestId("section-workstation-properties").scrollIntoViewIfNeeded().catch(() => note("A4: properties section missing"));
  await shot(page, "A4b-properties");

  // A5 property builder ladder
  const newProp = page.getByRole("button", { name: /new property/i }).first();
  if (await newProp.count()) {
    await newProp.click();
  } else {
    await page.getByTestId("button-ladder-new-property").click();
  }
  await page.getByTestId("dialog-property-builder").waitFor({ timeout: 5000 });
  // step 1 — Submit must NOT exist
  if (await page.getByTestId("button-property-submit").count()) note("A5: Submit visible on step 1 (DIVERGES)");
  await shot(page, "A5-property-builder-step1");
  await page.getByTestId("input-property-name").fill("Conformance Test Machiya");
  await page.getByTestId("input-property-location").fill("Gion, Kyoto");
  await page.getByTestId("input-property-description").fill("Dispatch verification fixture — not a real property.");
  await page.getByTestId("button-property-next").click();
  await page.waitForTimeout(400);
  if (await page.getByTestId("button-property-submit").count()) note("A5: Submit visible on step 2 (DIVERGES)");
  await shot(page, "A5b-property-builder-step2-rooms");
  // Next gates on a valid room draft (S-2 validity gating — expected)
  await page.getByTestId("input-room-draft-name-0").fill("The Tatami Room");
  await page.getByTestId("input-room-draft-price-0").fill("180");
  await page.getByTestId("button-property-next").click();
  await page.waitForTimeout(400);
  if (!(await page.getByTestId("button-property-submit").count())) note("A5: Submit MISSING on Review step (DIVERGES)");
  await shot(page, "A5c-property-builder-review");
  // submit so A6 has a property to edit
  await page.getByTestId("button-property-submit").click().catch(() => note("A5: submit click failed"));
  await page.waitForTimeout(1200);

  // A6 property edit dialog
  await page.goto(`${BASE}/provider/workstation`, { waitUntil: "networkidle" });
  await page.getByTestId("section-workstation-properties").scrollIntoViewIfNeeded();
  const editBtn = page.getByTestId("section-workstation-properties").getByRole("button", { name: /edit/i }).first();
  if (await editBtn.count()) {
    await editBtn.click();
    await page.getByTestId("dialog-property-editor").waitFor({ timeout: 5000 }).catch(() => note("A6: editor dialog did not open"));
    await shot(page, "A6-property-edit-dialog");
    await page.keyboard.press("Escape");
  } else {
    note("A6: no Edit button found on property rows (check manually)");
    await shot(page, "A6-property-edit-dialog");
  }

  // ── B: Catalog ──────────────────────────────────────────────────
  await page.goto(`${BASE}/provider/services`, { waitUntil: "networkidle" });
  await shot(page, "B1-toolbar");
  await shot(page, "B2-listing-rows", { full: true });
  // B3 map toggle
  const mapBtn = page.getByRole("button", { name: /^map$/i }).first();
  if (await mapBtn.count()) {
    await mapBtn.click();
    await page.waitForTimeout(2500);
    await shot(page, "B3-map-preview", { full: true });
    await page.getByRole("button", { name: /^list$/i }).first().click().catch(() => {});
  } else {
    note("B3: List|Map toggle not found (DIVERGES?)");
  }

  // B4 month grid — availability deep link for scheduled in_person listing
  await page.goto(`${BASE}/provider/services?availability=${IN_PERSON_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "B4-month-grid", { full: true });
  const drawer = page.getByTestId("drawer-availability-editor");
  if (await drawer.count()) await page.screenshot({ path: `${OUT}/B4b-month-grid-drawer.png` });

  // B5 vocabulary — async listing "No calendar"
  await page.goto(`${BASE}/provider/services?availability=${ASYNC_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "B5-no-calendar", { full: true });

  // B6 edit-split panel on approved listing home
  await page.goto(`${BASE}/provider/services/${APPROVED_ID}/edit`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const panel = page.getByText(/Editing a live listing/i).first();
  if (await panel.count()) await panel.scrollIntoViewIfNeeded();
  else note("B6: 'Editing a live listing' panel not found (DIVERGES?)");
  await shot(page, "B6-edit-split-panel", { full: true });

  // B7 catalog row state after identity PATCH (Live + Edit in review)
  await page.goto(`${BASE}/provider/services`, { waitUntil: "networkidle" });
  await shot(page, "B7-edit-in-review-row", { full: true });

  // ── C: Distribute ───────────────────────────────────────────────
  await page.goto(`${BASE}/provider/distribute`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "C1-storefront-card");
  // select approved listing for share kit / channels
  const sel = page.getByTestId("select-listing");
  if (await sel.count()) {
    await sel.click();
    await page.getByRole("option").first().click().catch(async () => {
      await page.keyboard.press("Escape");
      note("C2: could not pick listing in select");
    });
    await page.waitForTimeout(2500);
  }
  await shot(page, "C2-share-kit", { full: true });
  const promo = page.getByTestId("section-channel-promote");
  if (await promo.count()) await promo.scrollIntoViewIfNeeded();
  if (!(await page.getByTestId("text-promote-measurement-note").count()))
    note("C3: measurement note missing (DIVERGES)");
  await shot(page, "C3-promote");
  // C5 ratified extras
  for (const t of ["card-channel-marketplace", "card-channel-direct", "channel-state-strip"]) {
    if (!(await page.getByTestId(t).count())) note(`C5: ${t} missing (DIVERGES)`);
  }
  await page.getByTestId("card-channel-marketplace").scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "C5-ratified-extras", { full: true });

  // C4 arrival flow from Catalog
  await page.goto(`${BASE}/provider/services`, { waitUntil: "networkidle" });
  const promoteLink = page.getByText("Promote this →").first();
  if (await promoteLink.count()) {
    await promoteLink.click();
    await page.waitForTimeout(2000);
    if (!(await page.getByTestId("banner-promote-arrival").count())) note("C4: arrival banner missing (DIVERGES?)");
    await shot(page, "C4-arrival-flow");
  } else {
    note("C4: 'Promote this →' not found on catalog rows (DIVERGES?)");
  }
  // forged id
  await page.goto(`${BASE}/provider/distribute?listing=00000000-0000-0000-0000-000000000000`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  if (await page.getByTestId("banner-promote-arrival").count()) note("C4: forged ?listing= id NOT ignored (DIVERGES)");
  await shot(page, "C4b-forged-listing-ignored");

  await browser.close();
  console.log("\n==== NOTES ====");
  notes.forEach((n) => console.log(n));
  console.log("DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
