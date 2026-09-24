// J5 — guest builds cart + plan answers, then signs up: migrated or dropped?
// J6 — plan-modal dismissal variants (✕ button, backdrop) vs completion; complements J1 R7/R8.
import path from "node:path";
import { BASE, pool, openRun, spaNavigate, fillPlanModal } from "./lib.mjs";

const OUT5 = path.resolve("docs/audits/journeys/J5");
const OUT6 = path.resolve("docs/audits/journeys/J6");

async function j5GuestSignup() {
  const run = await openRun(OUT5, "R1-guest-builds-then-signs-up");
  const { context, page } = await run.newContext();
  const meta = {};
  try {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await run.step(page, "guest on landing");
    await page.getByTestId("button-plan-trip").click();
    await fillPlanModal(page, "Kyoto, Japan", 40);
    await page.getByTestId("button-etp-save").click();
    await page.waitForTimeout(2500);
    await run.step(page, "guest filled the plan modal and pressed Save");
    await spaNavigate(page, "/services");
    await page.locator('[data-testid^="button-add-to-cart-"]').first().waitFor({ timeout: 20000 });
    await page.locator('[data-testid^="button-add-to-cart-"]').nth(0).click();
    await page.waitForTimeout(1500);
    await page.locator('[data-testid^="button-add-to-cart-"]').nth(1).click();
    await page.waitForTimeout(2000);
    await run.step(page, "guest added two services on Discover");
    // Sign up through the in-app modal (header "Sign In" → "Sign up").
    await page.getByTestId("button-sign-in").click();
    await page.getByTestId("modal-sign-in").waitFor();
    await page.getByTestId("link-switch-signup").click();
    const email = `j5-${Date.now()}@traveloure.test`;
    meta.email = email;
    await page.getByTestId("input-first-name").fill("J5");
    await page.getByTestId("input-last-name").fill("Guest");
    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill("TestPassword123!");
    for (const cb of ["checkbox-signup-terms", "checkbox-signup-privacy"]) {
      const c = page.getByTestId(cb);
      if (await c.isVisible().catch(() => false)) await c.click();
    }
    await run.step(page, "sign-up form filled");
    await page.getByTestId("button-auth-submit").click();
    await page.waitForTimeout(6000);
    await run.step(page, "submitted sign-up (full reload to the role home)");
    const { rows } = await pool.query("select id from users where email=$1", [email]);
    meta.userId = rows[0]?.id;
    if (page.url().includes("/accept-terms")) {
      const accept = page.locator("button", { hasText: /accept/i }).last();
      for (const cb of await page.locator('[role="checkbox"]').all()) await cb.click().catch(() => {});
      await accept.click().catch(() => {});
      await page.waitForTimeout(3000);
      await run.step(page, "accepted terms");
    }
    await spaNavigate(page, "/cart");
    await page.waitForTimeout(3000);
    await run.step(page, "Trip Cart after sign-up");
    await spaNavigate(page, "/my-trips");
    await run.step(page, "My Plans after sign-up", `cards=${await page.locator('[data-testid^="trip-card-"]').count()}`);
    await spaNavigate(page, "/");
    await page.getByTestId("button-plan-trip").click();
    await page.getByTestId("plan-modal").waitFor();
    await run.step(page, "reopened the plan modal: are the guest answers still there?");
  } catch (e) {
    await run.step(page, "HARNESS ERROR", String(e?.message || e).slice(0, 300));
  } finally {
    await run.finish(meta);
  }
}

async function j6Dismiss(kind) {
  const run = await openRun(OUT6, `R-${kind}`);
  const { context, page } = await run.newContext();
  const meta = {};
  try {
    const email = `j6-${kind}-${Date.now()}@traveloure.test`;
    await context.request.post(`${BASE}/api/auth/register`, { data: { email, password: "TestPassword123!", firstName: "J6", lastName: kind, userType: "user" } });
    await context.request.post(`${BASE}/api/auth/accept-terms`, { data: { acceptTerms: true, acceptPrivacy: true } });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByTestId("button-plan-trip").click();
    await fillPlanModal(page, "Kyoto, Japan", 40);
    await run.step(page, "modal filled to the finish CTAs");
    if (kind === "close-x") {
      await page.getByTestId("plan-modal").locator("button:has(svg.lucide-x), button[aria-label*='lose' i], button:has-text('Close')").first().click();
    } else if (kind === "backdrop") {
      await page.mouse.click(15, 880);
    } else if (kind === "escape") {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(2500);
    await run.step(page, `dismissed via ${kind}`);
    await page.getByTestId("button-plan-trip").click();
    await page.getByTestId("plan-modal").waitFor();
    await page.waitForTimeout(1000);
    await run.step(page, "reopened: were the answers kept?");
  } catch (e) {
    await run.step(page, "HARNESS ERROR", String(e?.message || e).slice(0, 300));
  } finally {
    await run.finish(meta);
  }
}

const only = process.env.ONLY;
for (const [n, f] of [["J5", j5GuestSignup], ["J6x", () => j6Dismiss("close-x")], ["J6b", () => j6Dismiss("backdrop")], ["J6e", () => j6Dismiss("escape")]]) {
  if (only && !n.startsWith(only)) continue;
  try { await f(); console.log(n, "done"); } catch (e) { console.log(n, "ERROR", e.message.slice(0, 200)); }
}
await pool.end();
