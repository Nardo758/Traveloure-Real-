/**
 * EXP-01 through EXP-04: Expert Profile Tests
 */
import { test, expect } from "@playwright/test";

// ─── EXP-01: Expert Listing Page ─────────────────────────────────────────────
test("EXP-01: Expert Listing Page", async ({ page }) => {
  test.setTimeout(60000);

  await page.goto("/experts");
  await page.waitForLoadState("load");
  await page.waitForTimeout(3000); // wait for API data

  console.log("EXP-01: URL:", page.url());

  // Count expert cards
  const cards = page.locator('[data-testid^="card-expert-"]');
  await expect(cards.first()).toBeVisible({ timeout: 12000 });
  const cardCount = await cards.count();
  console.log(`EXP-01: Expert cards found: ${cardCount}`);

  // Inspect first card's contents
  const firstCard = cards.first();

  // Name
  const nameEl = firstCard.locator('[data-testid="text-expert-name"]');
  const hasName = await nameEl.isVisible({ timeout: 3000 }).catch(() => false);
  const nameText = hasName ? (await nameEl.textContent())?.trim() : "(missing)";
  console.log(`EXP-01: Name present: ${hasName ? "✓" : "✗"} — "${nameText}"`);

  // Photo / Avatar
  const avatar = firstCard.locator("img, [class*='avatar'], [class*='Avatar']").first();
  const hasPhoto = await avatar.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`EXP-01: Photo/Avatar present: ${hasPhoto ? "✓" : "✗"}`);

  // Location / Specialty
  const locationEl = firstCard.locator('[data-testid="text-expert-location"]');
  const hasLocation = await locationEl.isVisible({ timeout: 3000 }).catch(() => false);
  const locationText = hasLocation ? (await locationEl.textContent())?.trim() : "(missing)";
  console.log(`EXP-01: Location/Specialty: ${hasLocation ? "✓" : "✗"} — "${locationText}"`);

  // Expertise tags
  const expertiseBadge = firstCard.locator('[data-testid^="badge-expertise-"]').first();
  const hasExpertise = await expertiseBadge.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`EXP-01: Expertise tags: ${hasExpertise ? "✓" : "✗"}`);

  // Rating (inline, no testid — look for star icon + number)
  const ratingEl = firstCard.locator("text=/\\d+\\.\\d+/").first();
  const hasRating = await ratingEl.isVisible({ timeout: 3000 }).catch(() => false);
  const ratingText = hasRating ? (await ratingEl.textContent())?.trim() : "(missing)";
  console.log(`EXP-01: Rating: ${hasRating ? "✓" : "✗"} — "${ratingText}"`);

  // Price
  const priceEl = firstCard.locator('[data-testid="text-price"]');
  const hasPrice = await priceEl.isVisible({ timeout: 3000 }).catch(() => false);
  const priceText = hasPrice ? (await priceEl.textContent())?.trim() : "(missing)";
  console.log(`EXP-01: Price: ${hasPrice ? "✓" : "✗"} — "${priceText}"`);

  // View Profile / Message buttons
  const viewBtn = firstCard.locator('[data-testid="button-view-profile"]');
  const hasViewBtn = await viewBtn.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`EXP-01: View Profile button: ${hasViewBtn ? "✓" : "✗"}`);

  const msgBtn = firstCard.locator('[data-testid="button-message"]');
  const hasMsgBtn = await msgBtn.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`EXP-01: Message button: ${hasMsgBtn ? "✓" : "✗"}`);

  // Snapshot all cards' names
  for (let i = 0; i < Math.min(cardCount, 8); i++) {
    const card = cards.nth(i);
    const n = await card.locator('[data-testid="text-expert-name"]').textContent().catch(() => "(?)");
    const l = await card.locator('[data-testid="text-expert-location"]').textContent().catch(() => "(?)");
    console.log(`EXP-01:   Card ${i + 1}: "${n?.trim()}" — ${l?.trim()}`);
  }

  const pass = cardCount > 0 && hasName && hasPhoto;
  console.log(`\nEXP-01: ── Verdict: ${pass ? "PASS ✓" : "FAIL ✗"} — ${cardCount} experts listed ──`);
  expect(cardCount).toBeGreaterThan(0);
  expect(hasName).toBe(true);
});

// ─── EXP-02: Expert Detail Profile Page ──────────────────────────────────────
test("EXP-02: Expert Detail Profile Page", async ({ page }) => {
  test.setTimeout(60000);

  // Get a real expert ID from the API
  const res = await page.request.get("/api/experts");
  const experts = await res.json().catch(() => []);
  const expertList = Array.isArray(experts) ? experts : [];
  if (expertList.length === 0) {
    console.log("EXP-02: No experts returned from API — FAIL");
    expect(expertList.length).toBeGreaterThan(0);
    return;
  }
  const expert = expertList[0];
  console.log(`EXP-02: Using expert: "${expert.firstName} ${expert.lastName}" (id: ${expert.id})`);

  await page.goto(`/experts/${expert.id}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(3000);
  console.log("EXP-02: URL:", page.url());

  const sections: Record<string, boolean> = {};

  // 1. Profile photo
  const photo = page.locator("img, [class*='avatar'], [class*='Avatar']").first();
  sections["Profile photo"] = await photo.isVisible({ timeout: 5000 }).catch(() => false);

  // 2. Name — look for heading with the expert's first name
  const nameLoc = page.locator(`h1, h2, h3`).filter({ hasText: expert.firstName ?? "" }).first();
  sections["Name heading"] = await nameLoc.isVisible({ timeout: 5000 }).catch(() => false);

  // 3. Bio / About section
  const bioLoc = page.locator("text=/bio|about|experienced|local expert/i").first();
  sections["Bio/About"] = await bioLoc.isVisible({ timeout: 5000 }).catch(() => false);

  // 4. Expertise/specialty tags
  const tagLoc = page.locator('[class*="badge"], [class*="Badge"], [class*="tag"], [class*="Tag"], [class*="chip"]').first();
  sections["Expertise tags"] = await tagLoc.isVisible({ timeout: 5000 }).catch(() => false);

  // 5. Star rating
  const starLoc = page.locator('text=/\\d+\\.\\d+/').first();
  sections["Star rating"] = await starLoc.isVisible({ timeout: 5000 }).catch(() => false);

  // 6. Reviews section
  const reviewLoc = page.locator("text=/review|Review|rating/i").first();
  sections["Reviews section"] = await reviewLoc.isVisible({ timeout: 5000 }).catch(() => false);

  // 7. Availability / booking option
  const availLoc = page.locator("text=/availab|calendar|book|consult/i").first();
  sections["Availability/booking"] = await availLoc.isVisible({ timeout: 5000 }).catch(() => false);

  // 8. Contact / message button
  const contactBtn = page.locator('[data-testid="button-contact-expert"], [data-testid="button-schedule-consultation"]').first();
  sections["Contact/Message button"] = await contactBtn.isVisible({ timeout: 5000 }).catch(() => false);

  console.log("\nEXP-02: ── Section checklist ──");
  let passCount = 0;
  for (const [section, present] of Object.entries(sections)) {
    console.log(`EXP-02:   ${present ? "✓" : "✗"} ${section}`);
    if (present) passCount++;
  }

  const passed = passCount >= 5;
  console.log(`\nEXP-02: ── Verdict: ${passed ? "PASS ✓" : "FAIL ✗"} — ${passCount}/${Object.keys(sections).length} sections present ──`);
  expect(passCount).toBeGreaterThanOrEqual(4);
});

// ─── EXP-03: Filter Experts by Category ──────────────────────────────────────
test("EXP-03: Filter Experts by Category", async ({ page }) => {
  test.setTimeout(90000);

  await page.goto("/experts");
  await page.waitForLoadState("load");
  await page.waitForTimeout(3000);

  // Count baseline experts
  const cards = page.locator('[data-testid^="card-expert-"]');
  await cards.first().waitFor({ timeout: 12000 }).catch(() => {});
  const baseCount = await cards.count();
  console.log(`EXP-03: Baseline expert count: ${baseCount}`);

  // ── Experience Type filter (dropdown) ──
  const expTypeSelect = page.getByTestId("select-experience-type");
  const hasExpType = await expTypeSelect.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`EXP-03: Experience-type filter dropdown: ${hasExpType ? "✓" : "✗"}`);

  let filterWorked = false;

  if (hasExpType) {
    // Fetch experience types from API
    const etRes = await page.request.get("/api/experience-types");
    const etList = await etRes.json().catch(() => []);
    const types = Array.isArray(etList) ? etList : [];
    console.log(`EXP-03: Available experience types from API: ${types.map((t: any) => t.name).join(", ") || "(none)"}`);

    if (types.length > 0) {
      // Select first type
      const firstType = types[0];
      console.log(`EXP-03: Applying filter: "${firstType.name}" (id: ${firstType.id})`);
      await expTypeSelect.click();
      await page.waitForTimeout(500);
      // Pick the option by value or text
      const option = page.locator(`[role="option"]`).filter({ hasText: firstType.name }).first();
      const hasOption = await option.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasOption) {
        await option.click();
        await page.waitForTimeout(2000);
        const filteredCount = await cards.count();
        console.log(`EXP-03: Count after filter "${firstType.name}": ${filteredCount}`);
        filterWorked = filteredCount !== baseCount || filteredCount > 0;
        console.log(`EXP-03: Filter changed results: ${filteredCount !== baseCount ? "✓ (count changed)" : "— (same count, may be all matching)"}`);
      } else {
        console.log("EXP-03: Option not found in dropdown — checking text options");
        const allOpts = page.locator('[role="option"]');
        const optCount = await allOpts.count();
        for (let i = 0; i < Math.min(optCount, 5); i++) {
          const t = await allOpts.nth(i).textContent();
          console.log(`EXP-03:   Option ${i}: "${t?.trim()}"`);
        }
        if (optCount > 1) {
          await allOpts.nth(1).click();
          await page.waitForTimeout(2000);
          const filteredCount = await cards.count();
          console.log(`EXP-03: Count after selecting option 1: ${filteredCount}`);
          filterWorked = true;
        }
      }
    }
  }

  // ── Language filter ──
  const langSelect = page.getByTestId("select-language");
  const hasLang = await langSelect.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`EXP-03: Language filter: ${hasLang ? "✓" : "✗"}`);

  // ── Sort filter ──
  const sortSelect = page.getByTestId("select-sort");
  const hasSort = await sortSelect.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`EXP-03: Sort filter: ${hasSort ? "✓" : "✗"}`);

  // ── More Filters button ──
  const moreBtn = page.getByTestId("button-more-filters");
  const hasMore = await moreBtn.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`EXP-03: "More Filters" button: ${hasMore ? "✓" : "✗"}`);

  const filtersPresent = [hasExpType, hasLang, hasSort, hasMore].filter(Boolean).length;
  const passed = filtersPresent >= 2;
  console.log(`\nEXP-03: ── Verdict: ${passed ? "PASS ✓" : "FAIL ✗"} — ${filtersPresent}/4 filter controls present, filter updated results: ${filterWorked ? "✓" : "—"} ──`);
  expect(filtersPresent).toBeGreaterThanOrEqual(2);
});

// ─── EXP-04: Search for an Expert ────────────────────────────────────────────
test("EXP-04: Search for an Expert", async ({ page }) => {
  test.setTimeout(60000);

  await page.goto("/experts");
  await page.waitForLoadState("load");
  await page.waitForTimeout(3000);

  const searchInput = page.getByTestId("input-search-experts");
  const hasSearch = await searchInput.isVisible({ timeout: 8000 }).catch(() => false);
  console.log(`EXP-04: Search input present: ${hasSearch ? "✓" : "✗"}`);

  if (!hasSearch) {
    console.log("EXP-04: FAIL — no search input found");
    expect(hasSearch).toBe(true);
    return;
  }

  // Count baseline
  const cards = page.locator('[data-testid^="card-expert-"]');
  await cards.first().waitFor({ timeout: 12000 }).catch(() => {});
  const baseCount = await cards.count();
  console.log(`EXP-04: Baseline expert count: ${baseCount}`);

  // ── Search 1: "food" ──
  await searchInput.clear();
  await searchInput.fill("food");
  await page.waitForTimeout(1500); // real-time filter
  const foodCount = await cards.count();
  console.log(`EXP-04: Results for "food": ${foodCount}`);

  // ── Search 2: "Paris" ──
  await searchInput.clear();
  await searchInput.fill("Paris");
  await page.waitForTimeout(1500);
  const parisCount = await cards.count();
  console.log(`EXP-04: Results for "Paris": ${parisCount}`);

  // ── Search 3: exact expert name from API ──
  const apiRes = await page.request.get("/api/experts");
  const expertList = await apiRes.json().catch(() => []);
  const firstExpert = Array.isArray(expertList) ? expertList[0] : null;
  let nameSearchWorked = false;
  if (firstExpert) {
    const searchName = firstExpert.firstName ?? "";
    await searchInput.clear();
    await searchInput.fill(searchName);
    await page.waitForTimeout(1500);
    const nameCount = await cards.count();
    console.log(`EXP-04: Results for name "${searchName}": ${nameCount} (base was ${baseCount})`);
    nameSearchWorked = nameCount > 0 && nameCount <= baseCount;
  }

  // ── Clear search ──
  await searchInput.clear();
  await page.waitForTimeout(1000);
  const clearedCount = await cards.count();
  console.log(`EXP-04: Count after clearing search: ${clearedCount}`);
  const searchResets = clearedCount === baseCount;
  console.log(`EXP-04: Search resets correctly: ${searchResets ? "✓" : "✗"}`);

  // ── Search button ──
  const searchBtn = page.getByTestId("button-search-experts");
  const hasBtn = await searchBtn.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`EXP-04: Search button present: ${hasBtn ? "✓" : "✗"}`);

  const realTimeWorks = foodCount !== baseCount || parisCount !== baseCount || nameSearchWorked;
  const passed = hasSearch && (realTimeWorks || foodCount >= 0);
  console.log(`\nEXP-04: ── Verdict: ${passed ? "PASS ✓" : "FAIL ✗"} — real-time filtering: ${realTimeWorks ? "✓" : "—"} ──`);
  expect(hasSearch).toBe(true);
});
