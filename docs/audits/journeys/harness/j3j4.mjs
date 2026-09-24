// J3 — AI planner entry → does it produce a tripId?   J4 — Experience template entry → trip resolution.
import path from "node:path";
import { BASE, pool, openRun, register, spaNavigate } from "./lib.mjs";

const OUT3 = path.resolve("docs/audits/journeys/J3");
const OUT4 = path.resolve("docs/audits/journeys/J4");

// J3-R1: sidebar "Start with AI" → /ai-assistant chat → draft panel → "Continue in planner".
async function j3AiAssistant() {
  const run = await openRun(OUT3, "R1-ai-assistant");
  const { context, page } = await run.newContext();
  const meta = {};
  try {
    meta.user = await register(context, "j3");
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await run.step(page, "Home (console)");
    await page.getByTestId("link-sidebar-start-with-ai").click();
    await page.waitForTimeout(2500);
    await run.step(page, "sidebar 'Start with AI' → /ai-assistant");
    await page.getByTestId("input-message").fill("Plan 5 days in Kyoto, Japan from Nov 3 to Nov 8 for 2 adults");
    await page.getByTestId("button-send-message").click();
    await page.waitForTimeout(9000);
    await run.step(page, "sent a planning prompt (AI provider is stubbed)");
    const cont = page.getByTestId("button-continue-in-planner");
    if (await cont.isVisible().catch(() => false)) {
      await cont.click();
      await page.waitForTimeout(2500);
      await run.step(page, "clicked 'Continue in planner'");
    } else {
      await run.step(page, "'Continue in planner' not rendered", "draft panel control absent");
    }
    await spaNavigate(page, "/my-trips");
    await run.step(page, "My Plans", `cards=${await page.locator('[data-testid^="trip-card-"]').count()}`);
  } catch (e) {
    await run.step(page, "HARNESS ERROR", String(e?.message || e).slice(0, 300));
  } finally {
    await run.finish(meta);
  }
}

// J3-R2: an existing (empty) plan → slip "Draft it with AI".
async function j3SlipDraft() {
  const run = await openRun(OUT3, "R2-slip-draft-with-ai");
  const { context, page } = await run.newContext();
  const meta = {};
  try {
    meta.user = await register(context, "j3b");
    const r = await context.request.post(`${BASE}/api/trips`, { data: { title: "Kyoto", destination: "Kyoto, Japan", startDate: "2026-11-03", endDate: "2026-11-08" } });
    meta.tripId = (await r.json()).id;
    await page.goto(`${BASE}/plans/${meta.tripId}`, { waitUntil: "networkidle" });
    await run.step(page, "slip of an empty plan");
    await page.getByTestId("slip-action-draft-ai").click();
    await page.waitForTimeout(9000);
    await run.step(page, "clicked 'Draft it with AI' (AI provider stubbed)");
  } catch (e) {
    await run.step(page, "HARNESS ERROR", String(e?.message || e).slice(0, 300));
  } finally {
    await run.finish(meta);
  }
}

async function findServicesTab(page) {
  const tabs = page.locator('[data-testid^="tab-"]');
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    const t = tabs.nth(i);
    const id = await t.getAttribute("data-testid");
    if (!id || /tab-right-|tab-ai-match|tab-chat/.test(id)) continue;
    await t.click().catch(() => {});
    await page.waitForTimeout(2000);
    if (await page.locator('[data-testid^="button-add-to-cart-"]').first().isVisible().catch(() => false)) return id;
  }
  return null;
}

// J4-R1/R2: authed, no plan, experience template → add a service; then the expert-help ribbon → Send.
async function j4Template(guest) {
  const run = await openRun(OUT4, guest ? "R2-guest-template" : "R1-authed-template");
  const { context, page } = await run.newContext();
  const meta = {};
  try {
    if (!guest) meta.user = await register(context, "j4");
    await page.goto(`${BASE}/experiences`, { waitUntil: "networkidle" });
    await run.step(page, "/experiences");
    await page.goto(`${BASE}/experiences/travel/new?destination=Kyoto%2C%20Japan`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await run.step(page, "/experiences/travel/new?destination=Kyoto");
    const confirm = page.getByTestId("button-confirm-destination");
    if (await confirm.isVisible().catch(() => false)) { await confirm.click(); await page.waitForTimeout(1000); }
    const tabId = await findServicesTab(page);
    meta.servicesTab = tabId;
    await run.step(page, `services tab: ${tabId ?? "none found"}`);
    const add = page.locator('[data-testid^="button-add-to-cart-"]').first();
    if (await add.isVisible().catch(() => false)) {
      await add.click();
      await page.waitForTimeout(3500);
      await run.step(page, "clicked a service 'Add'");
    }
    await page.goto(`${BASE}/experiences/travel/new?destination=Kyoto%2C%20Japan`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const help = page.getByTestId("button-expert-help-ribbon");
    if (await help.isVisible().catch(() => false)) {
      await help.click();
      await page.waitForTimeout(2000);
      await run.step(page, "clicked the expert-help ribbon");
      const send = page.getByTestId("button-send-expert-request");
      if (await send.isVisible().catch(() => false)) {
        await send.click();
        await page.waitForTimeout(4000);
        await run.step(page, "review sheet → 'Send'");
      }
    } else {
      await run.step(page, "expert-help ribbon not visible");
    }
    for (let i = 0; i < 2; i++) {
      if (await page.locator('[role="dialog"]').first().isVisible().catch(() => false)) { await page.keyboard.press("Escape"); await page.waitForTimeout(600); }
    }
    if (!guest) {
      await spaNavigate(page, "/my-trips");
      await run.step(page, "My Plans", `cards=${await page.locator('[data-testid^="trip-card-"]').count()}`);
    }
  } catch (e) {
    await run.step(page, "HARNESS ERROR", String(e?.message || e).slice(0, 300));
  } finally {
    await run.finish(meta);
  }
}

const only = process.env.ONLY;
for (const [n, f] of [["J3R1", j3AiAssistant], ["J3R2", j3SlipDraft], ["J4R1", () => j4Template(false)], ["J4R2", () => j4Template(true)]]) {
  if (only && !n.startsWith(only)) continue;
  try { await f(); console.log(n, "done"); } catch (e) { console.log(n, "ERROR", e.message.slice(0, 200)); }
}
await pool.end();
