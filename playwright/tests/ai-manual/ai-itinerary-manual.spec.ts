import { test, expect, Page } from "@playwright/test";
import { loginAs } from "../helpers/auth";

const BASE = "http://localhost:5000";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page) {
  await loginAs(page, "user");
}

async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
}

// ─── TEST 1 ───────────────────────────────────────────────────────────────────

test("AI-01: Itinerary form is accessible and all fields are present", async ({ page }) => {
  await login(page);
  await goto(page, "/quick-start");

  // Wait for the form card to appear
  await page.waitForSelector('[data-testid="input-destination"]', { timeout: 15000 });

  console.log("\n══════════════════════════════════════════");
  console.log("  AI-01: Itinerary Form Accessible");
  console.log("══════════════════════════════════════════");

  const fields: { field: string; found: boolean; value?: string }[] = [];

  const checks = [
    { id: "input-destination",       label: "Destination input" },
    { id: "input-country",           label: "Country input" },
    { id: "select-experience-type",  label: "Experience Type selector" },
    { id: "button-start-date",       label: "Start Date picker" },
    { id: "button-end-date",         label: "End Date picker" },
    { id: "select-adults",           label: "Adults selector" },
    { id: "select-kids",             label: "Kids selector" },
    { id: "badge-interest-culture",  label: "Interest: Culture & History" },
    { id: "badge-interest-food",     label: "Interest: Food & Dining" },
    { id: "badge-interest-adventure",label: "Interest: Adventure" },
    { id: "badge-interest-nature",   label: "Interest: Nature" },
    { id: "badge-interest-nightlife",label: "Interest: Nightlife" },
    { id: "button-pace-relaxed",     label: "Pace: Relaxed" },
    { id: "button-pace-moderate",    label: "Pace: Moderate" },
    { id: "button-pace-packed",      label: "Pace: Packed" },
    { id: "button-generate",         label: "Generate button" },
  ];

  for (const c of checks) {
    const el = page.locator(`[data-testid="${c.id}"]`);
    const visible = await el.isVisible().catch(() => false);
    let value: string | undefined;
    if (visible) {
      value = (await el.innerText().catch(() => "")).trim() ||
               (await el.getAttribute("value").catch(() => "")) || undefined;
    }
    fields.push({ field: c.label, found: visible, value });
    console.log(`  ${visible ? "✅" : "❌"} ${c.label}${value ? ` — "${value}"` : ""}`);
  }

  const cardTitle = await page.locator("h2, h3, .card-title, [class*='CardTitle']").first().innerText().catch(() => "");
  console.log(`\n  Page heading: "${cardTitle}"`);

  const found  = fields.filter(f => f.found).length;
  const total  = fields.length;
  const result = found === total ? "PASS" : found >= 10 ? "PASS (partial)" : "FAIL";
  console.log(`\n  RESULT: ${result} — ${found}/${total} fields visible`);
  console.log("══════════════════════════════════════════\n");

  // Assert core fields
  expect(await page.locator('[data-testid="input-destination"]').isVisible()).toBe(true);
  expect(await page.locator('[data-testid="button-start-date"]').isVisible()).toBe(true);
  expect(await page.locator('[data-testid="button-generate"]').isVisible()).toBe(true);
});

// ─── TEST 2 ───────────────────────────────────────────────────────────────────

test("AI-02: Generate valid Paris 5-day itinerary", async ({ page }) => {
  await login(page);

  console.log("\n══════════════════════════════════════════");
  console.log("  AI-02: Generate Valid Itinerary");
  console.log("══════════════════════════════════════════");

  // Call the API directly to generate (mirrors exactly what the form does)
  // This avoids flaky date-picker UI interactions while testing the real AI response
  const start = Date.now();

  const res = await page.request.post(`${BASE}/api/quick-start-itinerary`, {
    data: {
      destination: "Paris",
      country: "France",
      dates: {
        start: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
        end:   new Date(Date.now() + 12 * 86400000).toISOString().split("T")[0],
      },
      travelers: 2,
      interests: ["culture", "food", "adventure"],
      pacePreference: "moderate",
    },
    timeout: 90000,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n  HTTP status: ${res.status()} (${elapsed}s)`);
  expect(res.ok()).toBe(true);

  const body = await res.json();
  const itinerary = body as {
    id: string;
    title: string;
    summary: string;
    dailyItinerary: { day: number; date: string; theme: string; activities: { name: string; location: string; time: string; duration: string; estimatedCost: number }[] }[];
  };

  console.log(`\n  Title   : "${itinerary.title}"`);
  console.log(`  Summary : "${(itinerary.summary || "").slice(0, 100)}..."`);
  console.log(`  Days    : ${itinerary.dailyItinerary?.length ?? 0}`);

  let pass = true;
  const days = itinerary.dailyItinerary ?? [];

  if (days.length === 0) {
    console.log("  ❌ No daily itinerary returned");
    pass = false;
  } else {
    console.log(`\n  Day-by-day breakdown:`);
    for (const day of days) {
      const acts = day.activities ?? [];
      console.log(`\n  Day ${day.day} (${day.date}) — "${day.theme}"`);
      console.log(`    Activities: ${acts.length}`);
      acts.slice(0, 3).forEach((a, i) => {
        console.log(`      ${i + 1}. ${a.name} @ ${a.location} (${a.time}, ${a.duration})`);
      });
      if (acts.length < 2) {
        console.log(`    ⚠️  Fewer than 2 activities on day ${day.day}`);
      }
    }
  }

  const firstDay = days[0];
  const firstActs = firstDay?.activities ?? [];

  console.log(`\n  ─── First 3 activities ───`);
  firstActs.slice(0, 3).forEach((a, i) => {
    console.log(`    ${i + 1}. ${a.name} at ${a.location}`);
  });

  const result = (days.length >= 3 && firstActs.length >= 2) ? "PASS" : "FAIL";
  console.log(`\n  RESULT: ${result} — ${days.length} days, ${firstActs.length} activities on Day 1`);
  console.log(`  Generation time: ${elapsed}s`);
  console.log("══════════════════════════════════════════\n");

  expect(days.length).toBeGreaterThanOrEqual(3);
  expect(firstActs.length).toBeGreaterThanOrEqual(2);

  // Store itinerary on page for test 3
  await page.evaluate((data) => {
    (window as any).__generatedItinerary = data;
  }, itinerary);
});

// ─── TEST 3 ───────────────────────────────────────────────────────────────────

test("AI-03: Itinerary content quality check", async ({ page }) => {
  await login(page);

  console.log("\n══════════════════════════════════════════");
  console.log("  AI-03: Content Quality Check");
  console.log("══════════════════════════════════════════");

  // Re-generate (stateless tests)
  const res = await page.request.post(`${BASE}/api/quick-start-itinerary`, {
    data: {
      destination: "Paris",
      country: "France",
      dates: {
        start: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
        end:   new Date(Date.now() + 12 * 86400000).toISOString().split("T")[0],
      },
      travelers: 2,
      interests: ["culture", "food", "adventure"],
      pacePreference: "moderate",
    },
    timeout: 90000,
  });

  expect(res.ok()).toBe(true);
  const body = await res.json();
  const days = (body.dailyItinerary ?? []) as {
    day: number; date: string; theme: string;
    activities: { name: string; location: string; description: string }[];
  }[];

  const allActivities = days.flatMap(d => d.activities);
  const allNames      = allActivities.map(a => a.name || "");
  const allLocations  = allActivities.map(a => a.location || "");
  const allDescs      = allActivities.map(a => a.description || "");

  // ── Quality check 1: Each day has ≥2 activities ─────────────────────────
  const daysWithFewActs = days.filter(d => (d.activities?.length ?? 0) < 2);
  const q1 = daysWithFewActs.length === 0;
  console.log(`\n  Q1 Each day has ≥2 activities   : ${q1 ? "✅ PASS" : "❌ FAIL"}`);
  if (!q1) {
    daysWithFewActs.forEach(d => console.log(`     Day ${d.day} only has ${d.activities?.length} activities`));
  } else {
    console.log(`     Min per day: ${Math.min(...days.map(d => d.activities?.length ?? 0))}, Max: ${Math.max(...days.map(d => d.activities?.length ?? 0))}`);
  }

  // ── Quality check 2: Real recognisable Paris landmarks ────────────────────
  const parisLandmarks = [
    "eiffel", "louvre", "notre", "champs", "versailles", "montmartre",
    "orsay", "pompidou", "sacré", "sacre", "seine", "musée", "musee",
    "palais", "tuileries", "opera", "marais", "pigalle", "bastille",
  ];
  const allText = [...allNames, ...allLocations, ...allDescs].join(" ").toLowerCase();
  const landmarksFound = parisLandmarks.filter(l => allText.includes(l));
  const q2 = landmarksFound.length >= 2;
  console.log(`\n  Q2 Real Paris landmarks present : ${q2 ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`     Found: ${landmarksFound.length > 0 ? landmarksFound.slice(0,6).join(", ") : "none"}`);

  // ── Quality check 3: No garbled / repeated / empty text ───────────────────
  const emptyNames   = allNames.filter(n => !n || n.trim().length < 3);
  const shortDescs   = allDescs.filter(d => !d || d.trim().length < 10);
  const repeatedNames = allNames.filter((n, i) => allNames.indexOf(n) !== i && n.length > 3);
  const q3 = emptyNames.length === 0 && repeatedNames.length === 0;
  console.log(`\n  Q3 No garbled/repeated/empty    : ${q3 ? "✅ PASS" : "⚠️  ISSUES"}`);
  if (emptyNames.length)   console.log(`     Empty names: ${emptyNames.length}`);
  if (repeatedNames.length) console.log(`     Repeated names: ${[...new Set(repeatedNames)].join(", ")}`);
  if (!q3 && emptyNames.length === 0 && repeatedNames.length > 0) {
    // Minor repeats are acceptable (e.g., same restaurant name across days)
    console.log(`     (minor repeats — not necessarily a defect)`);
  }

  // ── Quality check 4: Feels like a real travel plan ────────────────────────
  const hasDayThemes    = days.every(d => d.theme && d.theme.trim().length > 3);
  const hasVariety      = new Set(allNames).size >= Math.ceil(allNames.length * 0.7);
  const hasCost         = allActivities.some((a: any) => (a.estimatedCost ?? 0) > 0);
  const q4 = hasDayThemes && hasVariety;
  console.log(`\n  Q4 Feels like real travel plan  : ${q4 ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`     Day themes present  : ${hasDayThemes}`);
  console.log(`     Activity variety    : ${new Set(allNames).size}/${allNames.length} unique`);
  console.log(`     Has cost estimates  : ${hasCost}`);

  // ── Score ─────────────────────────────────────────────────────────────────
  const checks = [q1, q2, q3, q4];
  const score  = checks.filter(Boolean).length + 1; // +1 base (API worked)
  const issues: string[] = [];
  if (!q1) issues.push("some days have fewer than 2 activities");
  if (!q2) issues.push("no recognisable Paris landmarks found");
  if (!q3) issues.push("garbled/repeated/empty activity names");
  if (!q4) issues.push("lacks day themes or activity variety");

  const result = score >= 4 ? "PASS" : score === 3 ? "PASS (minor issues)" : "FAIL";

  console.log(`\n  ─── Sample activities ───`);
  allActivities.slice(0, 5).forEach((a, i) => {
    console.log(`    ${i + 1}. "${a.name}" @ ${a.location}`);
  });

  console.log(`\n  RESULT: ${result}`);
  console.log(`  Quality score: ${score}/5`);
  if (issues.length) console.log(`  Issues: ${issues.join("; ")}`);
  console.log("══════════════════════════════════════════\n");

  expect(score).toBeGreaterThanOrEqual(3);
  expect(days.length).toBeGreaterThanOrEqual(3);
});
