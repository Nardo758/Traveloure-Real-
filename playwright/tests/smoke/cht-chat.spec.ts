/**
 * CHT — Chat & AI Assistant UI Smoke Tests
 *
 * CHT-01: /chat page renders expert list, search input, and back button
 * CHT-02: Chat search input filters the expert list in real time
 * CHT-03: Clicking an expert card reveals message input and send button
 * CHT-04: /ai-assistant page renders back button, new-chat button, and suggestion prompts
 *
 * Uses the shared loginAs("user") helper.
 * Test account: testuser@traveloure.test / TestPass123!
 *
 * API-layer coverage (auth guards, message send validation, unread count, AI chat)
 * lives in expert-chat.spec.ts (CHAT-01–16).
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─────────────────────────────────────────────────────────────────────────────
// CHT-01: /chat page renders expert list, search input, and back button
// ─────────────────────────────────────────────────────────────────────────────
test("CHT-01: Chat page renders expert list, search input, and back button", async ({ page }) => {
  await loginAs(page, "user");

  // API: messages endpoint accessible (confirms auth + route)
  const msgsRes  = await page.request.get("/api/messages");
  const msgsBody = await msgsRes.json() as any;
  console.log(`CHT-01: GET /api/messages → ${msgsRes.status()}  type: ${Array.isArray(msgsBody) ? "array(" + msgsBody.length + ")" : typeof msgsBody}`);
  expect(msgsRes.status()).toBe(200);

  // API: unread count shape
  const unreadRes  = await page.request.get("/api/messages/unread/count");
  const unreadBody = await unreadRes.json() as any;
  console.log(`CHT-01: GET /api/messages/unread/count → ${unreadRes.status()}  count: ${unreadBody?.count}`);
  expect(unreadRes.status()).toBe(200);
  expect(typeof unreadBody?.count).toBe("number");

  await page.goto("/chat");
  await page.waitForLoadState("domcontentloaded");

  // Wait for search input (page guard — renders after auth check)
  console.log("CHT-01: Waiting for input-search-experts (up to 15s)…");
  try {
    await page.waitForSelector('[data-testid="input-search-experts"]', { timeout: 15000 });
    console.log("CHT-01: input-search-experts appeared ✓");
  } catch {
    throw new Error(`input-search-experts not visible — URL: ${page.url()}`);
  }

  // Back button
  const hasBack = await page.locator('[data-testid="button-back"]').count() > 0;
  console.log(`CHT-01: button-back: ${hasBack ? "✓" : "✗"}`);
  expect(hasBack, "button-back not found").toBe(true);

  // Search input
  const hasSearch = await page.locator('[data-testid="input-search-experts"]').count() > 0;
  console.log(`CHT-01: input-search-experts: ${hasSearch ? "✓" : "✗"}`);
  expect(hasSearch, "input-search-experts not found").toBe(true);

  // 3 sample expert cards always rendered (IDs 1, 2, 3)
  const expertIds = [1, 2, 3];
  for (const id of expertIds) {
    const found = await page.locator(`[data-testid="card-expert-${id}"]`).count() > 0;
    console.log(`CHT-01:   card-expert-${id}: ${found ? "✓" : "✗"}`);
    expect(found, `card-expert-${id} not found`).toBe(true);
  }

  // Total expert cards visible
  const totalCards = await page.locator('[data-testid^="card-expert-"]').count();
  console.log(`CHT-01: total expert cards visible: ${totalCards}`);
  expect(totalCards).toBeGreaterThanOrEqual(3);

  console.log(`CHT-01: ── PASS ✓ ──
  API:     ✓ messages accessible, unread count: ${unreadBody.count}
  Page:    ✓ /chat loaded
  Back:    ✓ button-back present
  Search:  ✓ input-search-experts present
  Experts: ✓ card-expert-1, card-expert-2, card-expert-3 (${totalCards} total)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// CHT-02: Chat search input filters the expert list in real time
// ─────────────────────────────────────────────────────────────────────────────
test("CHT-02: Chat search filters expert list in real time", async ({ page }) => {
  await loginAs(page, "user");
  await page.goto("/chat");
  await page.waitForLoadState("domcontentloaded");

  await page.waitForSelector('[data-testid="input-search-experts"]', { timeout: 15000 });
  console.log("CHT-02: chat page loaded ✓");

  // Baseline: all 3 cards visible
  const beforeCount = await page.locator('[data-testid^="card-expert-"]').count();
  console.log(`CHT-02: expert cards before search: ${beforeCount}`);
  expect(beforeCount).toBeGreaterThanOrEqual(3);

  // Search by name — "Yuki" matches Yuki Tanaka (Tokyo, Japan)
  await page.locator('[data-testid="input-search-experts"]').fill("Yuki");
  await page.waitForTimeout(500);
  const afterYuki = await page.locator('[data-testid^="card-expert-"]').count();
  console.log(`CHT-02: cards visible after "Yuki": ${afterYuki}`);
  expect(afterYuki).toBeGreaterThanOrEqual(1);
  expect(afterYuki).toBeLessThan(beforeCount);

  // Yuki Tanaka card (ID 1) should be visible
  const hasYukiCard = await page.locator('[data-testid="card-expert-1"]').count() > 0;
  console.log(`CHT-02: card-expert-1 (Yuki Tanaka): ${hasYukiCard ? "✓" : "✗"}`);
  expect(hasYukiCard, "card-expert-1 not visible after 'Yuki' search").toBe(true);

  // Clear search — all cards return
  await page.locator('[data-testid="input-search-experts"]').fill("");
  await page.waitForTimeout(400);
  const afterClear = await page.locator('[data-testid^="card-expert-"]').count();
  console.log(`CHT-02: cards after clearing search: ${afterClear}`);
  expect(afterClear).toBeGreaterThanOrEqual(3);

  // Search by location — "Paris" matches Marie Dubois (ID 2)
  await page.locator('[data-testid="input-search-experts"]').fill("Paris");
  await page.waitForTimeout(500);
  const afterParis = await page.locator('[data-testid^="card-expert-"]').count();
  const hasMarieCard = await page.locator('[data-testid="card-expert-2"]').count() > 0;
  console.log(`CHT-02: after "Paris": ${afterParis} card(s)  card-expert-2: ${hasMarieCard ? "✓" : "✗"}`);
  expect(hasMarieCard, "card-expert-2 not visible after 'Paris' search").toBe(true);

  // No-match query — 0 or < baseline cards
  await page.locator('[data-testid="input-search-experts"]').fill("xyznonexistent9999");
  await page.waitForTimeout(400);
  const afterNoMatch = await page.locator('[data-testid^="card-expert-"]').count();
  console.log(`CHT-02: cards after no-match query: ${afterNoMatch}`);
  expect(afterNoMatch).toBe(0);

  console.log(`CHT-02: ── PASS ✓ ──
  Baseline:  ✓ ${beforeCount} expert card(s) shown
  Yuki:      ✓ ${afterYuki} card(s) after "Yuki" — card-expert-1 visible
  Clear:     ✓ ${afterClear} card(s) restored after clearing
  Paris:     ✓ card-expert-2 (Marie Dubois) visible after "Paris"
  No-match:  ✓ 0 cards for nonsense query`);
});

// ─────────────────────────────────────────────────────────────────────────────
// CHT-03: Clicking an expert card reveals message input and send button
// ─────────────────────────────────────────────────────────────────────────────
test("CHT-03: Clicking an expert card reveals message input and send button", async ({ page }) => {
  await loginAs(page, "user");
  await page.goto("/chat");
  await page.waitForLoadState("domcontentloaded");

  await page.waitForSelector('[data-testid="input-search-experts"]', { timeout: 15000 });
  console.log("CHT-03: chat page loaded ✓");

  // Before selecting — message input should NOT be visible
  const msgInputBefore = await page.locator('[data-testid="input-message"]').count();
  console.log(`CHT-03: input-message before expert click: ${msgInputBefore} (expect 0)`);

  // Click first expert card (Yuki Tanaka, ID 1)
  const expertCard = page.locator('[data-testid="card-expert-1"]').first();
  expect(await expertCard.count(), "card-expert-1 not found").toBeGreaterThan(0);
  await expertCard.click();
  await page.waitForTimeout(800);
  console.log("CHT-03: Clicked card-expert-1 (Yuki Tanaka)");

  // Message input should now be visible
  console.log("CHT-03: Waiting for input-message (up to 8s)…");
  try {
    await page.waitForSelector('[data-testid="input-message"]', { timeout: 8000 });
    console.log("CHT-03: input-message appeared ✓");
  } catch {
    throw new Error("input-message not visible after clicking expert card");
  }

  const hasInput  = await page.locator('[data-testid="input-message"]').count() > 0;
  const hasSend   = await page.locator('[data-testid="button-send"]').count() > 0;
  console.log(`CHT-03: input-message: ${hasInput ? "✓" : "✗"}  button-send: ${hasSend ? "✓" : "✗"}`);
  expect(hasInput, "input-message not visible after selecting expert").toBe(true);
  expect(hasSend,  "button-send not visible after selecting expert").toBe(true);

  // View Profile button
  const hasViewProfile = await page.locator('[data-testid="button-view-profile"]').count() > 0;
  console.log(`CHT-03: button-view-profile: ${hasViewProfile ? "✓" : "✗"}`);
  expect(hasViewProfile, "button-view-profile not found").toBe(true);

  // Type a message — input stays editable
  await page.locator('[data-testid="input-message"]').fill("Hello! Can you help me plan a trip?");
  const msgValue = await page.locator('[data-testid="input-message"]').inputValue();
  console.log(`CHT-03: message typed: "${msgValue.slice(0, 40)}…"`);
  expect(msgValue.length).toBeGreaterThan(0);

  console.log(`CHT-03: ── PASS ✓ ──
  Expert click:   ✓ card-expert-1 clicked
  Message input:  ✓ input-message appeared after selection
  Send button:    ✓ button-send present
  View profile:   ✓ button-view-profile present
  Typing:         ✓ input editable ("${msgValue.slice(0, 30)}…")`);
});

// ─────────────────────────────────────────────────────────────────────────────
// CHT-04: /ai-assistant page renders back button, new-chat button, and prompts
// ─────────────────────────────────────────────────────────────────────────────
test("CHT-04: AI Assistant page renders sidebar controls and suggestion prompts", async ({ page }) => {
  await loginAs(page, "user");

  // API: conversations accessible
  const convRes  = await page.request.get("/api/conversations");
  const convBody = await convRes.json() as any;
  const convCount = Array.isArray(convBody) ? convBody.length : 0;
  console.log(`CHT-04: GET /api/conversations → ${convRes.status()}  count: ${convCount}`);
  expect(convRes.status()).toBe(200);

  await page.goto("/ai-assistant");
  await page.waitForLoadState("domcontentloaded");

  // Wait for back button (page header — always rendered)
  console.log("CHT-04: Waiting for button-back-dashboard (up to 15s)…");
  try {
    await page.waitForSelector('[data-testid="button-back-dashboard"]', { timeout: 15000 });
    console.log("CHT-04: button-back-dashboard appeared ✓");
  } catch {
    throw new Error(`button-back-dashboard not visible — URL: ${page.url()}`);
  }

  // Back to dashboard button
  const hasBack = await page.locator('[data-testid="button-back-dashboard"]').count() > 0;
  console.log(`CHT-04: button-back-dashboard: ${hasBack ? "✓" : "✗"}`);
  expect(hasBack, "button-back-dashboard not found").toBe(true);

  // New chat button (in conversation sidebar)
  const hasNewChat = await page.locator('[data-testid="button-new-chat"]').count() > 0;
  console.log(`CHT-04: button-new-chat: ${hasNewChat ? "✓" : "✗"}`);
  expect(hasNewChat, "button-new-chat not found").toBe(true);

  // Suggestion prompts shown when no conversation selected (4 prompts, indices 0–3)
  // These are always visible on fresh page load
  const suggestionCount = await page.locator('[data-testid^="button-suggestion-"]').count();
  console.log(`CHT-04: suggestion prompt buttons: ${suggestionCount}`);
  expect(suggestionCount).toBeGreaterThanOrEqual(1);

  // Spot-check first suggestion button (index 0)
  const hasPrompt0 = await page.locator('[data-testid="button-suggestion-0"]').count() > 0;
  console.log(`CHT-04: button-suggestion-0: ${hasPrompt0 ? "✓" : "✗"}`);
  expect(hasPrompt0, "button-suggestion-0 not found").toBe(true);

  // Message input and send button (always rendered in main area)
  const hasInput = await page.locator('[data-testid="input-message"]').count() > 0;
  const hasSend  = await page.locator('[data-testid="button-send-message"]').count() > 0;
  console.log(`CHT-04: input-message: ${hasInput ? "✓" : "✗"}  button-send-message: ${hasSend ? "✓" : "✗"}`);
  expect(hasInput, "input-message not found on AI assistant page").toBe(true);
  expect(hasSend,  "button-send-message not found on AI assistant page").toBe(true);

  // Click "New" button — sidebar stays
  await page.locator('[data-testid="button-new-chat"]').first().click();
  await page.waitForTimeout(600);
  const newChatAfter = await page.locator('[data-testid="button-new-chat"]').count() > 0;
  console.log(`CHT-04: button-new-chat still present after click: ${newChatAfter ? "✓" : "✗"}`);
  expect(newChatAfter, "button-new-chat disappeared after click").toBe(true);

  // Conversation cards if any exist
  if (convCount > 0) {
    const firstConvId   = convBody[0].id;
    const hasConvCard   = await page.locator(`[data-testid="card-conversation-${firstConvId}"]`).count() > 0;
    console.log(`CHT-04: card-conversation-${firstConvId}: ${hasConvCard ? "✓" : "✗"}`);
    expect(hasConvCard, `card-conversation-${firstConvId} not found`).toBe(true);
  }

  console.log(`CHT-04: ── PASS ✓ ──
  API:         ✓ ${convCount} conversation(s) in /api/conversations
  Page:        ✓ /ai-assistant loaded
  Back btn:    ✓ button-back-dashboard present
  New chat:    ✓ button-new-chat present and clickable
  Prompts:     ✓ ${suggestionCount} suggestion button(s), button-suggestion-0 confirmed
  Message UI:  ✓ input-message + button-send-message present`);
});
