// J1 behavioural harness — Action→Effect audit (docs-only; NOT wired into CI).
// Landing → Plan My Trip → modal complete → close → Discover add → My Plans.
// Per step: screenshot (what the user saw) + /api network log + DB diff (what happened).
//
// Run against a local server booted from `npm run build` + `node dist/index.cjs` with a migrated DB:
//   BASE_URL=http://127.0.0.1:5000 DATABASE_URL=postgres://… node docs/audits/journeys/harness/j1.mjs
import { chromium } from "@playwright/test";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5000";
const OUT = path.resolve(process.env.OUT_DIR || "docs/audits/journeys/J1");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Tables whose rows the journey could create or change. Full-table snapshots (local, near-empty DB).
const TABLES = {
  trips: "id, user_id, title, destination, start_date, end_date, status, experience_type_id, dates_confirmed_at",
  itinerary_items: "id, trip_id, title, provider_service_id, origin, status, user_experience_id",
  cart_items: "id, user_id, guest_session_id, service_id, trip_id, content_type, quantity",
  user_experiences: "id, user_id, trip_id, title, experience_type_id",
  trip_contexts: "id, user_id, trip_id, context",
  trip_destinations: "id, trip_id, position, name",
};

async function snapshot() {
  const s = {};
  for (const [t, cols] of Object.entries(TABLES)) {
    try {
      const r = await pool.query(`select ${cols} from ${t}`);
      s[t] = Object.fromEntries(r.rows.map((row) => [row.id, row]));
    } catch (e) {
      // Column drift must be visible, never silent.
      const r = await pool.query(`select * from ${t}`);
      s[t] = Object.fromEntries(r.rows.map((row) => [row.id, row]));
      s[`${t}__note`] = `fallback select * (${e.message})`;
    }
  }
  return s;
}

function diff(a, b) {
  const out = {};
  for (const t of Object.keys(TABLES)) {
    const A = a[t] || {}, B = b[t] || {};
    const added = Object.keys(B).filter((k) => !(k in A)).map((k) => B[k]);
    const removed = Object.keys(A).filter((k) => !(k in B)).map((k) => A[k]);
    const changed = Object.keys(B)
      .filter((k) => k in A && JSON.stringify(A[k]) !== JSON.stringify(B[k]))
      .map((k) => ({ before: A[k], after: B[k] }));
    if (added.length || removed.length || changed.length) out[t] = { added, removed, changed };
  }
  return out;
}

const iso = (d) => d.toISOString().slice(0, 10);

async function spaNavigate(page, to) {
  // Client-side navigation so the react-query cache survives (a full load would reset it).
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, to);
  await page.waitForTimeout(2500);
}

async function webStorage(page) {
  return page.evaluate(() => {
    const pick = (st) => {
      const o = {};
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i);
        if (/experienceContext|guestTrips|guest_cart|guest_session|return_to|searchSettings/.test(k)) {
          const v = st.getItem(k);
          o[k] = v && v.length > 600 ? v.slice(0, 600) + "…" : v;
        }
      }
      return o;
    };
    return { local: pick(localStorage), session: pick(sessionStorage) };
  });
}

async function runJourney({ name, auth, branch, precache, aiAction = "cancel" }) {
  const dir = path.join(OUT, name);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  const net = [];
  page.on("response", async (res) => {
    const req = res.request();
    const url = req.url();
    if (!url.includes("/api/")) return;
    const entry = { t: Date.now(), method: req.method(), url: url.replace(BASE, ""), status: res.status() };
    if (req.method() !== "GET") {
      entry.body = (req.postData() || "").slice(0, 800);
      try { entry.response = (await res.text()).slice(0, 800); } catch { /* body gone */ }
    }
    net.push(entry);
  });
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });

  let user = null;
  if (auth) {
    const email = `j1-${name}-${Date.now()}@traveloure.test`;
    const r = await context.request.post(`${BASE}/api/auth/register`, {
      data: { email, password: "TestPassword123!", firstName: "J1", lastName: "Audit", userType: "user" },
    });
    const body = await r.json();
    user = { id: body.user?.id, email, status: r.status() };
    await context.request.post(`${BASE}/api/auth/accept-terms`, { data: { acceptTerms: true, acceptPrivacy: true } });
  }

  const steps = [];
  let k = 0;
  let prev = await snapshot();
  let netMark = 0;
  async function step(label, note = "") {
    await page.waitForTimeout(1200);
    k += 1;
    const file = `step-${k}.png`;
    await page.screenshot({ path: path.join(dir, file), fullPage: false });
    const now = await snapshot();
    steps.push({
      step: k, label, note, url: page.url().replace(BASE, ""), screenshot: `${name}/${file}`,
      network: net.slice(netMark), dbDiff: diff(prev, now), storage: await webStorage(page),
    });
    netMark = net.length;
    prev = now;
  }

  try {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await step("landing loaded");

    if (precache) {
      // Prime ["/api/trips"] by visiting My Plans inside the SPA, then come back.
      await spaNavigate(page, "/my-trips");
      await step("pre-visit My Plans (primes the [\"/api/trips\"] cache)");
      await spaNavigate(page, "/");
      await step("back to landing (SPA)");
    }

    await page.getByTestId("button-plan-trip").click();
    await page.getByTestId("plan-modal").waitFor({ timeout: 10000 });
    await step("clicked 'Plan my trip' — modal open");

    // Walk the steps until the finish CTAs render.
    for (let i = 0; i < 8; i++) {
      if (await page.getByTestId("planning-option-ai").isVisible().catch(() => false)) break;
      const occ = page.locator('[data-testid^="option-occasion-"]');
      if (await page.getByTestId("plan-step-occasion-body").isVisible().catch(() => false)) {
        const preferred = page.locator('[data-testid="option-occasion-travel"], [data-testid="option-occasion-trip"]');
        if (await preferred.count()) await preferred.first().click(); else await occ.first().click();
      }
      const dest = page.getByTestId("input-etp-destination");
      if (await dest.isVisible().catch(() => false)) await dest.fill("Kyoto, Japan");
      const sd = page.getByTestId("input-etp-start-date");
      if (await sd.isVisible().catch(() => false)) {
        const s = new Date(); s.setDate(s.getDate() + 40);
        const e = new Date(s); e.setDate(e.getDate() + 5);
        await sd.fill(iso(s));
        const ed = page.getByTestId("input-etp-end-date");
        if (await ed.isVisible().catch(() => false)) await ed.fill(iso(e));
      }
      const plus = page.getByTestId("button-etp-adults-plus");
      if (await plus.isVisible().catch(() => false)) await plus.click();
      await step(`modal step ${i + 1} filled`);
      const next = page.getByTestId("button-planning-next");
      if (await next.isVisible().catch(() => false)) await next.click(); else break;
    }
    await step("finish CTAs visible");

    if (branch === "dismiss") {
      await page.keyboard.press("Escape"); // Radix onOpenChange(false) → PlanningContext.close()
      await page.waitForTimeout(3000);
      await step("pressed Escape on the plan modal (dismissal)");
    } else if (branch === "save") {
      await page.getByTestId("button-etp-save").click();
      await page.waitForTimeout(3000);
      await step("clicked 'Save' on the plan modal");
    } else {
      await page.getByTestId(`planning-option-${branch}`).click();
      await page.waitForTimeout(3000);
      await step(`clicked finish '${branch}'`);
    }

    // AI branch: EnhancedPlanningModal is a plain overlay (not a Radix Dialog), so Escape does not
    // reach it. Drive its own buttons: "Generate Itineraries" (completion) or "Cancel" (dismissal).
    if (branch === "ai") {
      const gen = page.getByRole("button", { name: /Generate Itineraries/i });
      if (aiAction === "generate" && (await gen.isVisible().catch(() => false))) {
        await gen.click();
        await page.waitForTimeout(8000);
        await step("AI modal → clicked 'Generate Itineraries'");
      }
      const cancel = page.getByRole("button", { name: /^Cancel$/ }).last();
      if (await cancel.isVisible().catch(() => false)) {
        await cancel.click();
        await page.waitForTimeout(1000);
        await step("AI modal → clicked 'Cancel'");
      }
    }
    // "Modal closes": whatever the finish left open (sign-in modal, Radix dialogs) is dismissed.
    for (let i = 0; i < 2; i++) {
      if (await page.locator('[role="dialog"]').first().isVisible().catch(() => false)) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(800);
      }
    }
    await step("dismissed any open dialog (modal closed)");

    await spaNavigate(page, "/services");
    await page.locator('[data-testid^="button-add-to-cart-"]').first().waitFor({ timeout: 20000 }).catch(() => {});
    await step("on Discover (/services)");

    const add = page.locator('[data-testid^="button-add-to-cart-"]').first();
    if (await add.isVisible().catch(() => false)) {
      await add.click();
      await page.waitForTimeout(2500);
      await step("clicked first 'Add to plan'");
      if (await page.getByTestId("button-mismatch-add-anyway").isVisible().catch(() => false)) {
        await page.getByTestId("button-mismatch-add-anyway").click();
        await page.waitForTimeout(2500);
        await step("location-mismatch dialog → 'Add anyway'");
      }
    } else {
      await step("NO 'Add to plan' button rendered", "Discover grid had no add control");
    }

    await spaNavigate(page, "/my-trips");
    await page.waitForTimeout(2000);
    const cards = await page.locator('[data-testid^="trip-card-"]').count();
    await step("My Plans (/my-trips) via SPA navigation", `trip-card count in DOM: ${cards}`);

    await page.goto(`${BASE}/my-trips`, { waitUntil: "networkidle" });
    const cardsReload = await page.locator('[data-testid^="trip-card-"]').count();
    await step("My Plans after FULL reload", `trip-card count in DOM: ${cardsReload}`);
  } catch (e) {
    await step("HARNESS ERROR", String(e?.message || e).slice(0, 500));
  }

  const record = { name, auth, branch, precache, aiAction, user, steps, consoleErrors: consoleErrors.slice(0, 40) };
  fs.writeFileSync(path.join(dir, "record.json"), JSON.stringify(record, null, 2));
  await browser.close();
  return record;
}

const RUNS = [
  { name: "R1-guest-myself", auth: false, branch: "myself", precache: false },
  { name: "R2-guest-ai", auth: false, branch: "ai", precache: false, aiAction: "generate" },
  { name: "R3-authed-myself", auth: true, branch: "myself", precache: false },
  { name: "R4-authed-ai-cancel", auth: true, branch: "ai", precache: false, aiAction: "cancel" },
  { name: "R4b-authed-ai-generate", auth: true, branch: "ai", precache: false, aiAction: "generate" },
  { name: "R5-authed-myself-precached", auth: true, branch: "myself", precache: true },
  { name: "R6-authed-ai-cancel-precached", auth: true, branch: "ai", precache: true, aiAction: "cancel" },
  { name: "R6b-authed-ai-generate-precached", auth: true, branch: "ai", precache: true, aiAction: "generate" },
  { name: "R7-authed-dismiss", auth: true, branch: "dismiss", precache: false },
  { name: "R8-authed-save", auth: true, branch: "save", precache: false },
];
const only = process.env.ONLY;
for (const r of RUNS.filter((x) => !only || x.name.startsWith(only))) {
  const rec = await runJourney(r);
  console.log(`${rec.name}: ${rec.steps.length} steps; last=${rec.steps.at(-1)?.label}`);
}
await pool.end();
