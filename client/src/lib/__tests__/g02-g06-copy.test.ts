/**
 * G-06 and the kept copy swaps (ledger `2026-10-20-g02-g06-copy`).
 *
 * Run: npx tsx --test client/src/lib/__tests__/g02-g06-copy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOMEPAGE_META_DESCRIPTION, KYOTO_CITY_DESCRIPTION, isKyotoCity } from "../g02-g06-copy";

const read = (path: string) => readFileSync(path, "utf8");

const CLOSED_DAYS = "Plan Kyoto trips that work on the day: catch the closed days, last entries and crowds before you go, with local experts as they join.";

test("G06 homepage meta is the generic sentence and the Kyoto page carries only its own", () => {
  assert.equal(HOMEPAGE_META_DESCRIPTION, "Plan any trip or occasion with local experts and trusted providers, all in one place.");
  assert.equal(KYOTO_CITY_DESCRIPTION, "Plan your Kyoto days with local experts and trusted providers.");
  assert.equal(isKyotoCity("Kyoto"), true);
  assert.equal(isKyotoCity(" kyoto "), true);
  assert.equal(isKyotoCity("Osaka"), false);

  const html = read("client/index.html");
  assert.equal(html.split(HOMEPAGE_META_DESCRIPTION).length, 4, "description, og, and twitter");
  assert.equal(html.includes(CLOSED_DAYS), false);
  assert.equal(html.includes(KYOTO_CITY_DESCRIPTION), false, "the homepage meta is not the Kyoto sentence");

  const landing = read("client/src/pages/landing.tsx");
  assert.ok(landing.includes("description={HOMEPAGE_META_DESCRIPTION}"));
  assert.equal(landing.includes(CLOSED_DAYS), false);

  const city = read("client/src/pages/discover-location.tsx");
  assert.ok(city.includes("isKyotoCity(city) ? KYOTO_CITY_DESCRIPTION"));
  assert.ok(city.includes("description={KYOTO_CITY_DESCRIPTION}"));
});

test("pricing swaps, and the page shows no expert commission percentage", () => {
  const pricing = read("client/src/pages/pricing.tsx");
  assert.ok(pricing.includes('"Plan, browse and save, at your own pace"'));
  assert.ok(pricing.includes('"They review and re-route your plan with you."'));
  assert.ok(pricing.includes('"One price for the whole trip"'));
  assert.ok(pricing.includes('description: "Plus isn\'t open yet."'));
  assert.ok(pricing.includes("Demand view · wanted slots, lead time"));
  assert.equal(pricing.includes("Slip up, browse, book"), false);
  assert.equal(pricing.includes("Usually pays for itself"), false);
  assert.equal(pricing.includes("book in your name"), false);
  assert.equal(pricing.includes("We're finishing Plus for your city"), false);
  assert.equal(pricing.includes("lead-time"), false);
  assert.equal(pricing.includes("wanted slots, trend"), false);
  assert.equal(pricing.includes("Your commission"), false);
  assert.equal(pricing.includes("proRateStepped"), false);
  assert.equal(pricing.includes("proRateStandard"), false);
  assert.equal(pricing.includes("railsRate"), false);
  assert.equal(pricing.includes("text-pro-rate"), false);
  assert.ok(pricing.includes("serviceFeePct"), "the traveler service fee line stays");
  assert.ok(pricing.includes("text-concierge-fee-disclosure"), "the concierge fee disclosure stays");
});

test("help swaps keep the city phrase and drop the three amounts", () => {
  const help = read("shared/help-articles.ts");
  assert.ok(help.includes("Every expert is reviewed by our team before they appear"));
  assert.ok(help.includes("Our team reviews your application before you appear"));
  assert.ok(help.includes('keywords: ["local", "expert", "review", "suggest", "reviewed"]'));
  assert.ok(help.includes("Plus isn't available yet."));
  assert.ok(help.includes("how it fits with the rest of your plan"));
  assert.ok(help.includes("The price is shown before you pay."));
  assert.ok(help.includes("the price of each further AI task on a plan is shown before you pay."));
  assert.ok(help.includes("If you live in one of our cities"));
  assert.ok(help.includes("where in the world you want it"));
  assert.equal(help.includes("{tripPassPrice}"), false);
  assert.equal(help.includes("{serviceFeePct}"), false);
  assert.equal(help.includes("{serviceFeeCap}"), false);
  assert.equal(help.includes("{aiTaskFee}"), false);
  assert.ok(help.includes("{plusPrice}"));
  assert.ok(help.includes("{proFreeUntil}"));
  assert.equal(help.includes("Coming soon."), false);
  assert.equal(help.includes("Experts are verified"), false);
});

test("visa help has the two global lines and no Japan lock", () => {
  const visa = read("client/src/pages/visa-help.tsx");
  assert.ok(visa.includes('lead="Check what you need to enter the country you\'re visiting."'));
  assert.ok(visa.includes("No visa experts are listed right now."));
  assert.equal(visa.includes("Instantly look up visa requirements for any country"), false);
  assert.equal(visa.includes("we're onboarding visa specialists"), false);
  assert.equal(visa.includes("Kyoto"), false);
  assert.ok(visa.includes("Look up visa requirements for your destination instantly with AI"), "the SEO line is not the any-country claim");
});

test("press keeps executive assistants because the role and routes are live", () => {
  const press = read("client/src/pages/press.tsx");
  assert.ok(press.includes("executive assistants"));
  const app = read("client/src/App.tsx");
  assert.ok(app.includes('requiredRole="executive_assistant"'));
  assert.ok(app.includes('path="/ea/dashboard"'));
});

test("Planning Tools is already hidden from the desktop and mobile nav", () => {
  const nav = read("client/src/lib/nav-config.ts");
  const toolsAt = nav.indexOf('name: "Planning Tools"');
  assert.ok(toolsAt > 0);
  const window = nav.slice(toolsAt, toolsAt + 400);
  assert.match(window, /hidden:\s*true/);
  assert.match(window, /shortName:\s*"Tools"/);
  const layout = read("client/src/components/layout.tsx");
  assert.match(layout, /navGroupsConfig\.filter\(\(group\) => !group\.hidden\)/);
  assert.ok(read("client/src/App.tsx").includes('path="/visa-help"') || read("client/src/App.tsx").includes("visa-help"), "the visa route stays");
});
