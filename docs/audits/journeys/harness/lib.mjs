// Shared plumbing for the J2–J6 harnesses (J1 predates it and is self-contained).
// Per step: screenshot + /api network slice + DB row diff + relevant web storage.
import { chromium } from "@playwright/test";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

export const BASE = process.env.BASE_URL || "http://127.0.0.1:5000";
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const TABLES = {
  trips: "id, user_id, title, destination, start_date, end_date, status",
  itinerary_items: "id, trip_id, title, provider_service_id, origin, status",
  cart_items: "id, user_id, guest_session_id, service_id, trip_id, content_type, quantity",
  user_experiences: "id, user_id, trip_id, title",
  trip_contexts: "id, user_id, trip_id, context",
  trip_destinations: "id, trip_id, position, name",
  affiliate_booking_requests: "id, user_id, trip_id, status",
  expert_requests: "id, user_id, trip_id, status",
};

export async function snapshot() {
  const s = {};
  for (const [t, cols] of Object.entries(TABLES)) {
    try {
      const r = await pool.query(`select ${cols} from ${t}`);
      s[t] = Object.fromEntries(r.rows.map((row) => [row.id, row]));
    } catch {
      const r = await pool.query(`select * from ${t}`);
      s[t] = Object.fromEntries(r.rows.map((row) => [row.id, row]));
    }
  }
  return s;
}

export function diff(a, b) {
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

export const iso = (d) => d.toISOString().slice(0, 10);
export function futureDates(offset = 40, len = 5) {
  const s = new Date(); s.setDate(s.getDate() + offset);
  const e = new Date(s); e.setDate(e.getDate() + len);
  return { start: iso(s), end: iso(e) };
}

export async function spaNavigate(page, to) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, to);
  await page.waitForTimeout(2500);
}

export async function webStorage(page) {
  return page.evaluate(() => {
    const pick = (st) => {
      const o = {};
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i);
        if (/experienceContext|guestTrips|guest_cart|guest_session|return_to|externalCart|searchSettings|guestConcierge/.test(k)) {
          const v = st.getItem(k);
          o[k] = v && v.length > 600 ? v.slice(0, 600) + "…" : v;
        }
      }
      return o;
    };
    return { local: pick(localStorage), session: pick(sessionStorage) };
  });
}

/** Opens a browser + context, wires the network log, and returns a `step()` recorder. */
export async function openRun(outDir, name) {
  const dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const run = { name, dir, browser, steps: [], net: [], consoleErrors: [], k: 0, netMark: 0 };
  run.newContext = async () => {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const page = await context.newPage();
    page.on("response", async (res) => {
      const req = res.request();
      const url = req.url();
      if (!url.includes("/api/")) return;
      const e = { t: Date.now(), method: req.method(), url: url.replace(BASE, ""), status: res.status() };
      if (req.method() !== "GET") {
        e.body = (req.postData() || "").slice(0, 800);
        try { e.response = (await res.text()).slice(0, 800); } catch { /* gone */ }
      }
      run.net.push(e);
    });
    page.on("console", (m) => { if (m.type() === "error") run.consoleErrors.push(m.text().slice(0, 300)); });
    return { context, page };
  };
  run.prev = await snapshot();
  run.step = async (page, label, note = "") => {
    await page.waitForTimeout(1200);
    run.k += 1;
    const file = `step-${run.k}.png`;
    await page.screenshot({ path: path.join(dir, file) });
    const now = await snapshot();
    run.steps.push({
      step: run.k, label, note, url: page.url().replace(BASE, ""), screenshot: `${name}/${file}`,
      network: run.net.slice(run.netMark), dbDiff: diff(run.prev, now), storage: await webStorage(page),
    });
    run.netMark = run.net.length;
    run.prev = now;
  };
  run.finish = async (meta = {}) => {
    fs.writeFileSync(path.join(dir, "record.json"), JSON.stringify({ name, ...meta, steps: run.steps, consoleErrors: run.consoleErrors.slice(0, 40) }, null, 2));
    await browser.close();
  };
  return run;
}

export async function register(context, tag) {
  const email = `${tag}-${Date.now()}@traveloure.test`;
  const r = await context.request.post(`${BASE}/api/auth/register`, {
    data: { email, password: "TestPassword123!", firstName: "Audit", lastName: tag, userType: "user" },
  });
  const body = await r.json();
  await context.request.post(`${BASE}/api/auth/accept-terms`, { data: { acceptTerms: true, acceptPrivacy: true } });
  return { id: body.user?.id, email, password: "TestPassword123!" };
}

export async function login(context, user) {
  const r = await context.request.post(`${BASE}/api/auth/login`, { data: { email: user.email, password: user.password } });
  return r.status();
}

/** Walk the plan modal to its finish CTAs (same driver as J1). */
export async function fillPlanModal(page, destination = "Kyoto, Japan", offset = 40) {
  await page.getByTestId("plan-modal").waitFor({ timeout: 10000 });
  for (let i = 0; i < 8; i++) {
    if (await page.getByTestId("planning-option-ai").isVisible().catch(() => false)) break;
    if (await page.getByTestId("plan-step-occasion-body").isVisible().catch(() => false)) {
      const preferred = page.locator('[data-testid="option-occasion-travel"]');
      if (await preferred.count()) await preferred.first().click();
      else await page.locator('[data-testid^="option-occasion-"]').first().click();
    }
    const dest = page.getByTestId("input-etp-destination");
    if (await dest.isVisible().catch(() => false)) await dest.fill(destination);
    const sd = page.getByTestId("input-etp-start-date");
    if (await sd.isVisible().catch(() => false)) {
      const { start, end } = futureDates(offset);
      await sd.fill(start);
      const ed = page.getByTestId("input-etp-end-date");
      if (await ed.isVisible().catch(() => false)) await ed.fill(end);
    }
    const next = page.getByTestId("button-planning-next");
    if (await next.isVisible().catch(() => false)) await next.click(); else break;
  }
}
