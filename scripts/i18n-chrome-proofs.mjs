#!/usr/bin/env node
// scripts/i18n-chrome-proofs.mjs
//
// Ruling 60 Phase A — chrome i18n browser proofs (DECISIONS.md ruling 65). 27 assertions:
//   (a) provider console EN → JA via the shared 🌐 selector: sidebar/nav/Catalog chrome +
//       health labels, and the nav data-testids proven UNCHANGED under JA (the English label
//       is load-bearing as a test selector — see provider-sidebar.tsx).
//   (b) persistence: reload, users.preferences.settings.language as a DB fact, and a FRESH
//       login with empty localStorage (only resolution step 1 can produce Japanese there).
//   (c) guest on the traveler site: navbar/footer flip, localStorage persistence, reload,
//       footer locale pill, sign-in modal chrome.
//   (d) EN fallback: a surface deliberately NOT migrated renders its real English copy with
//       NO raw dotted-key soup in the DOM, while the shell chrome around it is translated.
//   (e) Accept-Language (step 3) and the en-US default (step 4).
//
// Standalone sibling of scripts/journeys/ (single-role, no DB access needed beyond the app
// itself). NOT wired into CI — the same [advisory] posture rulings 58/64 record for their
// committed suites. Leaves the bench as found: the account preference is reset to EN.
//
// Run (server must be up with the beta seed accounts):
//   node scripts/i18n-chrome-proofs.mjs
// Env: BASE_URL (default http://localhost:5000), OUT_DIR (screenshots; default
//   $TMPDIR/i18n-proofs), E2E_PROVIDER_EMAIL / E2E_TEST_PASSWORD (default the seeded
//   kyoto-interpreter@traveloure.test provider), PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.

import { chromium } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

const BASE = process.env.BASE_URL || "http://localhost:5000";
const SHOTS = process.env.OUT_DIR || path.join(os.tmpdir(), "i18n-proofs");
fs.mkdirSync(SHOTS, { recursive: true });

const CHROMIUM_EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const PROVIDER = {
  email: process.env.E2E_PROVIDER_EMAIL || "kyoto-interpreter@traveloure.test",
  password: process.env.E2E_TEST_PASSWORD || "TestPass123!",
};

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : pass === null ? "SKIP" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const hasJa = (s) => /[぀-ヿ一-龯]/.test(s || "");

async function login(page) {
  const res = await page.request.post(`${BASE}/api/auth/login`, {
    data: { email: PROVIDER.email, password: PROVIDER.password },
  });
  if (!res.ok()) throw new Error(`login failed ${res.status()} ${await res.text()}`);
}

async function switchTo(page, code) {
  await page.click('[data-testid="button-language-menu"]');
  await page.click(`[data-testid="language-option-${code}"]`);
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(CHROMIUM_EXECUTABLE) ? CHROMIUM_EXECUTABLE : undefined,
    args: ["--no-sandbox"],
  });

  // ───────────────── (a) + (d) provider console EN → JA ─────────────────
  let ctx = await browser.newContext({ locale: "en-US" });
  let page = await ctx.newPage();
  await login(page);

  await page.goto(`${BASE}/provider/services`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/a1-catalog-en.png`, fullPage: false });

  const enSidebar = await page.textContent('[data-testid="nav-catalog"]');
  const enTitle = await page.textContent('[data-testid="text-page-title"]');
  const enHeader = await page.textContent('[data-testid="text-services-title"]');
  const enLang = await page.getAttribute("html", "lang");
  check("a0 EN baseline: sidebar Catalog + page title + header in English",
    enSidebar.includes("Catalog") && enTitle.includes("Catalog") && enHeader.includes("Your Services"),
    `sidebar="${enSidebar.trim()}" title="${enTitle.trim()}" header="${enHeader.trim()}" html.lang=${enLang}`);

  // Switch to Japanese via the console 🌐 selector.
  await switchTo(page, "ja");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/a2-catalog-ja.png`, fullPage: false });

  const jaSidebar = await page.textContent('[data-testid="nav-catalog"]');
  const jaTitle = await page.textContent('[data-testid="text-page-title"]');
  const jaHeader = await page.textContent('[data-testid="text-services-title"]');
  const jaLang = await page.getAttribute("html", "lang");

  check("a1 provider sidebar renders Japanese", hasJa(jaSidebar), `"${jaSidebar.trim()}"`);
  check("a2 console page title renders Japanese", hasJa(jaTitle), `"${jaTitle.trim()}"`);
  check("a3 Catalog page header renders Japanese", hasJa(jaHeader), `"${jaHeader.trim()}"`);
  check("a4 <html lang> follows the locale", jaLang === "ja", `html.lang="${jaLang}"`);

  // testids must be untouched by translation (Playwright suites select on them)
  const navIds = await page.$$eval("[data-testid^='nav-']", (els) => els.map((e) => e.dataset.testid));
  const expectedIds = ["nav-dashboard", "nav-calendar", "nav-inbox", "nav-workstation", "nav-catalog",
    "nav-customers", "nav-performance", "nav-money", "nav-settings", "nav-playbook"];
  const missing = expectedIds.filter((id) => !navIds.includes(id));
  check("a5 provider nav data-testids UNCHANGED under JA", missing.length === 0,
    missing.length ? `missing ${missing.join(",")}` : `all ${expectedIds.length} present`);

  // Catalog chrome: buttons + health labels
  const bodyJa = await page.textContent("body");
  check("a6 Catalog buttons translated (List/Map/Add)",
    bodyJa.includes("リスト") && bodyJa.includes("地図") && bodyJa.includes("サービスを追加"),
    "リスト/地図/サービスを追加");

  const healthEl = await page.$("[data-testid^='health-row-']");
  if (healthEl) {
    const ht = await healthEl.textContent();
    check("a7 health-check labels translated (meter + check names)", hasJa(ht), `"${ht.trim().slice(0, 90)}"`);
  } else {
    check("a7 health-check labels translated", null, "SKIPPED — no health row rendered for this account");
  }
  const chip = await page.$("[data-testid^='chip-pin-']");
  if (chip) {
    const ct = await chip.textContent();
    check("a8 pin / delivery chip translated", hasJa(ct), `"${ct.trim()}"`);
  } else {
    check("a8 pin / delivery chip translated", null, "SKIPPED — no service chip rendered");
  }

  // Provider Settings chrome + the §06-A Preferences card
  await page.goto(`${BASE}/provider/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/a3-settings-ja.png`, fullPage: false });
  const setBody = await page.textContent("body");
  check("a9 provider Settings chrome translated",
    setBody.includes("ビジネス設定") && setBody.includes("通知設定"), "ビジネス設定 + 通知設定");
  check("a10 Settings→Preferences card present (mockup §06-A)",
    (await page.$("[data-testid='card-language-preference']")) !== null);

  // (d) EN fallback on a surface deliberately NOT migrated this phase.
  await page.goto(`${BASE}/provider/customers`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/d1-untranslated-fallback-ja.png`, fullPage: false });
  const custBody = await page.textContent("body");
  const custTitle = await page.textContent('[data-testid="text-page-title"]');
  // Raw-key soup would look like "nav.dashboard" / "header.title" rendered literally.
  const keySoup = /\b(nav|header|catalog|settings|auth|common|provider)\.[a-zA-Z]+\b/.test(custBody);
  // The page renders its real English copy — a deferred surface must still be USABLE, not blank
  // and not key-soup. (An arbitrary body-length threshold was the wrong assertion: this page's
  // honest empty state is only ~411 chars, and length says nothing about correctness.)
  check("d1 untranslated surface renders its real English copy",
    custBody.includes("No customers yet") && custBody.includes("derived from your real bookings"),
    "English page body intact under a ja locale");
  check("d2 NO raw key-soup anywhere on the page", !keySoup,
    keySoup ? "found a raw dotted key in the DOM" : "no raw keys");
  check("d3 shell chrome IS translated while the page body stays EN (fallback)",
    hasJa(custTitle) && /[A-Za-z]{4,}/.test(custBody), `title="${custTitle.trim()}"`);

  // ───────────────── (b) persistence: reload, then a FRESH login ─────────────────
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const afterReload = await page.textContent('[data-testid="nav-catalog"]');
  check("b1 preference survives a reload", hasJa(afterReload), `"${afterReload.trim()}"`);

  // Verify it really landed in users.preferences.settings (the account copy, not just device).
  const prefs = await (await page.request.get(`${BASE}/api/me/preferences`)).json();
  check("b2 persisted to users.preferences.settings.language", prefs.language === "ja",
    `GET /api/me/preferences -> ${JSON.stringify(prefs)}`);
  await ctx.close();

  // FRESH login: brand-new context ⇒ empty localStorage, so ONLY the account preference
  // (resolution step 1) can produce Japanese here.
  const ctx2 = await browser.newContext({ locale: "en-US" });
  const page2 = await ctx2.newPage();
  await login(page2);
  await page2.goto(`${BASE}/provider/services`, { waitUntil: "networkidle" });
  await page2.waitForTimeout(2000);
  await page2.screenshot({ path: `${SHOTS}/b1-fresh-login-ja.png`, fullPage: false });
  const freshNav = await page2.textContent('[data-testid="nav-catalog"]');
  const freshLang = await page2.getAttribute("html", "lang");
  const ls = await page2.evaluate(() => window.localStorage.getItem("traveloure_locale"));
  check("b3 preference survives a FRESH login (account copy, empty localStorage at load)",
    hasJa(freshNav) && freshLang === "ja", `nav="${freshNav.trim()}" html.lang=${freshLang} localStorage=${ls}`);

  // Reset the account back to EN so the bench is left as found.
  await page2.request.patch(`${BASE}/api/me/preferences`, { data: { language: "en" } });
  await ctx2.close();

  // ───────────────── (c) GUEST on the traveler site ─────────────────
  const ctx3 = await browser.newContext({ locale: "en-US" });
  const page3 = await ctx3.newPage();
  await page3.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page3.waitForTimeout(1500);
  await page3.screenshot({ path: `${SHOTS}/c1-traveler-en.png`, fullPage: false });
  const guestEn = await page3.textContent("body");
  const guestLangEn = await page3.getAttribute("html", "lang");
  check("c0 guest EN baseline (navbar + footer English)",
    guestEn.includes("Marketplace") && guestEn.includes("Sign In"), `html.lang=${guestLangEn}`);

  await switchTo(page3, "ja");
  await page3.waitForTimeout(1200);
  await page3.screenshot({ path: `${SHOTS}/c2-traveler-ja.png`, fullPage: false });
  const navText = await page3.textContent("nav");
  const footText = await page3.textContent("footer");
  const guestLangJa = await page3.getAttribute("html", "lang");
  check("c1 guest navbar flips to Japanese", hasJa(navText) && navText.includes("マーケットプレイス"),
    `nav contains マーケットプレイス`);
  check("c2 guest footer flips to Japanese",
    hasJa(footText) && footText.includes("サポート") && footText.includes("利用規約"), "サポート + 利用規約");
  check("c3 <html lang> = ja for the guest", guestLangJa === "ja", `html.lang="${guestLangJa}"`);
  const footLocale = await page3.textContent('[data-testid="text-footer-locale"]');
  check("c4 footer locale pill reflects the live locale (was hardcoded 'English (US)')",
    footLocale.includes("日本語"), `"${footLocale.trim()}"`);

  const guestLs = await page3.evaluate(() => window.localStorage.getItem("traveloure_locale"));
  check("c5 guest choice persisted to localStorage", guestLs === "ja", `traveloure_locale="${guestLs}"`);

  await page3.reload({ waitUntil: "networkidle" });
  await page3.waitForTimeout(1500);
  await page3.screenshot({ path: `${SHOTS}/c3-traveler-ja-after-reload.png`, fullPage: false });
  const navAfter = await page3.textContent("nav");
  const footAfter = await page3.textContent("footer");
  check("c6 guest choice survives a reload (no account involved)",
    hasJa(navAfter) && hasJa(footAfter), "navbar + footer still Japanese");

  // Auth chrome (sign-in modal) in JA
  await page3.click('[data-testid="button-sign-in"]');
  await page3.waitForTimeout(900);
  await page3.screenshot({ path: `${SHOTS}/c4-signin-modal-ja.png`, fullPage: false });
  const modalTitle = await page3.textContent('[data-testid="text-sign-in-title"]');
  const modalBody = await page3.textContent('[data-testid="modal-sign-in"]');
  check("c7 auth (sign-in modal) chrome translated",
    hasJa(modalTitle) && modalBody.includes("メールアドレス") && modalBody.includes("パスワード"),
    `title="${modalTitle.trim()}"`);
  await ctx3.close();

  // ───────────────── Accept-Language (resolution step 3) ─────────────────
  const ctx4 = await browser.newContext({ locale: "ja-JP" });
  const page4 = await ctx4.newPage();
  await page4.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page4.waitForTimeout(1500);
  await page4.screenshot({ path: `${SHOTS}/e1-accept-language-ja.png`, fullPage: false });
  const alLang = await page4.getAttribute("html", "lang");
  const alNav = await page4.textContent("nav");
  check("e1 Accept-Language (step 3) resolves a ja-JP browser to Japanese with NO stored choice",
    alLang === "ja" && hasJa(alNav), `html.lang="${alLang}"`);
  await ctx4.close();

  // ───────────────── en-US guest stays English (step 4 default) ─────────────────
  const ctx5 = await browser.newContext({ locale: "en-US" });
  const page5 = await ctx5.newPage();
  await page5.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page5.waitForTimeout(1200);
  const enLang2 = await page5.getAttribute("html", "lang");
  const enNav2 = await page5.textContent("nav");
  check("e2 en-US guest with no stored choice stays English (step 4)",
    enLang2 === "en" && enNav2.includes("Marketplace"), `html.lang="${enLang2}"`);
  await ctx5.close();

  await browser.close();

  const failed = results.filter((r) => r.pass === false);
  const skipped = results.filter((r) => r.pass === null);
  console.log(`\n=== ${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped ===`);
  console.log(`screenshots: ${SHOTS}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(2); });
