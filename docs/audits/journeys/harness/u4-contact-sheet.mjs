// U4 — contact-sheet captures for the traveler path. One image per state, written to
// docs/audits/ui/contact/NN-<name>.png; CONTACT_SHEET.md annotates each with its gap row ids.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASE, futureDates } from "./lib.mjs";

const OUT = path.resolve("docs/audits/ui/contact");
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const shots = [];
let k = 0;

async function newAuthed(tag) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  const email = `u4-${tag}-${Date.now()}@traveloure.test`;
  await context.request.post(`${BASE}/api/auth/register`, { data: { email, password: "TestPassword123!", firstName: "U4", lastName: tag, userType: "user" } });
  await context.request.post(`${BASE}/api/auth/accept-terms`, { data: { acceptTerms: true, acceptPrivacy: true } });
  return { context, page };
}
async function shot(page, name, caption) {
  await page.waitForTimeout(900);
  k += 1;
  const file = `${String(k).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  shots.push({ file, caption, url: page.url().replace(BASE, "") });
}
async function spa(page, to) {
  await page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, to);
  await page.waitForTimeout(2500);
}
async function walkSteps(page, prefix, record = true) {
  const snap = (n, c) => (record ? shot(page, n, c) : Promise.resolve());
  const { start, end } = futureDates(40);
  for (let i = 1; i <= 6; i++) {
    if (await page.getByTestId("planning-option-ai").isVisible().catch(() => false)) break;
    if (await page.getByTestId("plan-step-occasion-body").isVisible().catch(() => false)) {
      await snap(`${prefix}-step-occasion`, "Plan modal: step 1, Occasion");
      await page.locator('[data-testid="option-occasion-travel"]').first().click();
    }
    const dest = page.getByTestId("input-etp-destination");
    if (await dest.isVisible().catch(() => false)) { await dest.fill("Kyoto, Japan"); await snap(`${prefix}-step-where`, "Plan modal: step 2, Where"); }
    const sd = page.getByTestId("input-etp-start-date");
    if (await sd.isVisible().catch(() => false)) {
      await sd.fill(start);
      const ed = page.getByTestId("input-etp-end-date");
      if (await ed.isVisible().catch(() => false)) await ed.fill(end);
      await snap(`${prefix}-step-when`, "Plan modal: step 3, When");
    }
    await page.getByTestId("button-planning-next").click();
    await page.waitForTimeout(600);
  }
  await snap(`${prefix}-finish`, "Plan modal: step 4, Who, with the finish CTAs");
}

// Path A — the canonical traveler path: landing → modal → "Build it myself" → Discover → add → My Plans → slip.
{
  const { page } = await newAuthed("a");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot(page, "landing", "Landing (signed in)");
  await page.getByTestId("button-plan-trip").click();
  await walkSteps(page, "modal");
  await page.getByTestId("planning-option-myself").click();
  await page.waitForTimeout(3000);
  await shot(page, "exit-build-myself-slip", "Exit: 'Build it myself' lands on the new plan's slip");
  const tripId = page.url().split("/plans/")[1]?.split("?")[0];
  await page.getByTestId("link-sidebar-discover").click().catch(() => {});
  await spa(page, "/services");
  await shot(page, "discover-services", "Discover /services (pen bound to the new plan)");
  await page.locator('[data-testid^="button-add-to-cart-"]').first().click();
  await page.waitForTimeout(500);
  await shot(page, "discover-add-toast", "'Add to plan' result on the grid");
  await spa(page, "/my-trips");
  await shot(page, "my-plans", "/my-trips after the add (list first loaded here)");
  await spa(page, `/plans/${tripId}`);
  await shot(page, "slip", "/plans/:tripId, the slip, showing the added item");
  await page.context().close();
}
// Path B — My Plans loaded BEFORE the modal (stale list).
{
  const { page } = await newAuthed("b");
  await page.goto(`${BASE}/my-trips`, { waitUntil: "networkidle" });
  await shot(page, "my-plans-empty-before", "/my-trips visited first (list cached, empty)");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await spa(page, "/my-trips");
  await spa(page, "/");
  await page.getByTestId("button-plan-trip").click();
  await walkSteps(page, "b-modal", false);
  await page.getByTestId("planning-option-myself").click();
  await page.waitForTimeout(3000);
  await spa(page, "/my-trips");
  await shot(page, "my-plans-stale", "/my-trips after 'Build it myself' in the same session: list not refreshed");
  await page.context().close();
}
// Path C — the other exits: Plan with AI, Save, Escape, then Discover add.
for (const exit of ["ai", "save", "escape"]) {
  const { page } = await newAuthed(`c-${exit}`);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByTestId("button-plan-trip").click();
  await walkSteps(page, `c-${exit}`, false); // step images already captured in Path A
  if (exit === "ai") {
    await page.getByTestId("planning-option-ai").click();
    await page.waitForTimeout(2000);
    await shot(page, "exit-ai-modal", "Exit: 'Plan with AI' opens a second modal (no plan yet)");
    await page.getByRole("button", { name: /^Cancel$/ }).last().click();
  } else if (exit === "save") {
    await page.getByTestId("button-etp-save").click();
    await page.waitForTimeout(800);
    await shot(page, "exit-save", "Exit: Save (no plan created; only the trip strip changes)");
  } else {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    await shot(page, "exit-escape", "Exit: Escape (nothing kept)");
  }
  await spa(page, "/services");
  await page.locator('[data-testid^="button-add-to-cart-"]').first().click();
  await page.waitForTimeout(500);
  await shot(page, `c-${exit}-add`, `Discover 'Add to plan' after the ${exit} exit`);
  await spa(page, "/my-trips");
  await shot(page, `c-${exit}-my-plans`, `/my-trips after the ${exit} exit`);
  await page.context().close();
}
fs.writeFileSync(path.join(OUT, "shots.json"), JSON.stringify(shots, null, 1));
await browser.close();
console.log(shots.length, "shots");
