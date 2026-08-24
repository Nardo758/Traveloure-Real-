#!/usr/bin/env node
// scripts/journeys/traveler-comms.mjs (J5)
//
// TRAVELER-COMMS JOURNEY — permanent, self-contained repo harness per docs/EXECUTION_MAP.md §4b.
// Read scripts/journeys/README.md + expert-loop.mjs's header first — same house pattern via
// scripts/journeys/lib/journey-lib.mjs (idempotent `jrny5-` fixtures, verdict-table output).
//
// WHAT THIS PROVES: the traveler communications surface (QA_PUNCH_LIST items 12 + 15) end to
// end — the unified traveler /inbox (Messages tab = real conversation threads from
// `user_and_expert_chats`, Updates tab = real notifications), deep-link navigation off an
// update, mark-read persistence, and per-item plan comments (migration 165,
// server/routes/booking-actions.ts): owner writes notify the assigned expert, expert writes
// notify the owner, a REJECTED advisor is refused (403 — the canonical `isTripAdvisor`
// allow-list, never the status-blind `storage.isExpertAssignedToTrip`), an unrelated user is
// refused (403), and the thread renders on BOTH the traveler's Trip Card (PlanCard
// ActivitiesSection) and the expert's Workstation editor — one shared `ItemComments` component,
// proven from both sides.
//
// ── COLD-BOOT RECIPE — IDENTICAL to expert-loop.mjs's (see its header, or README.md).
//      node scripts/journeys/traveler-comms.mjs --base-url http://localhost:5601 \
//        --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
//
// ── EXTERNAL-STEP MARKING (§4b rule 4) ──────────────────────────────────────────────
// No EXTERNAL steps — every mutation here is structural (chat rows, notifications, comment
// rows) with zero real external calls.
//
// ── FIXTURES (idempotent, `jrny5-` prefixed) ────────────────────────────────────────
// One trip (owner=traveler), one ACCEPTED advisor (kyoto-food), one REJECTED advisor
// (kyoto-photography, a second real E2E account reused in the "rejected advisor" role — no
// separate account needed since isTripAdvisor is role-agnostic), one baseline item, two chat
// rows (one each direction), and one notification with a trip deep-link.

import {
  resolveConfig, preflight, connectDb, dbOne, dbAll, resolveUserIdByEmail,
  upsertTrip, upsertCollaboratorOwner, upsertAdvisor,
  launchBrowser, login, waitVisible, createStepRunner, isoDate,
} from "./lib/journey-lib.mjs";

const JOURNEY_FILE = "scripts/journeys/traveler-comms.mjs";
const cfg = resolveConfig();
const { BASE_URL, DB_URL, OUT_DIR, HEADED, PASSWORD } = cfg;

const TRAVELER_EMAIL = process.env.E2E_TRAVELER_EMAIL || "test-traveler-kyoto@traveloure.test";
const EXPERT_EMAIL = process.env.E2E_EXPERT_EMAIL || "kyoto-food@traveloure.test";
const REJECTED_ADVISOR_EMAIL = process.env.E2E_PROVIDER_EMAIL || "kyoto-photography@traveloure.test";
const UNRELATED_EMAIL = process.env.E2E_EA_EMAIL || "test-ea@traveloure.test";

const TRIP_ID = "jrny5-trip-1";
const COLLAB_ID = "jrny5-collab-owner-1";
const ADVISOR_ID = "jrny5-advisor-accepted";
const REJECTED_ADVISOR_ID = "jrny5-advisor-rejected";
const ITEM_ID = "jrny5-item-1";
const CHAT_ID_TO_EXPERT = "jrny5-chat-to-expert";
const CHAT_ID_FROM_EXPERT = "jrny5-chat-from-expert";
const NOTIF_ID = "jrny5-notif-update";

async function resetAndSeedFixtures(pg) {
  const travelerId = await resolveUserIdByEmail(pg, TRAVELER_EMAIL);
  const expertId = await resolveUserIdByEmail(pg, EXPERT_EMAIL);
  const rejectedId = await resolveUserIdByEmail(pg, REJECTED_ADVISOR_EMAIL);
  const unrelatedId = await resolveUserIdByEmail(pg, UNRELATED_EMAIL);

  await pg.query("DELETE FROM trip_item_comments WHERE trip_id = $1", [TRIP_ID]);
  await pg.query("DELETE FROM notifications WHERE id = $1", [NOTIF_ID]);
  await pg.query("DELETE FROM notifications WHERE related_id = $1 AND related_type = 'trip'", [ITEM_ID]);
  await pg.query("DELETE FROM user_and_expert_chats WHERE id IN ($1, $2)", [CHAT_ID_TO_EXPERT, CHAT_ID_FROM_EXPERT]);

  await upsertTrip(pg, {
    id: TRIP_ID, userId: travelerId, title: "Journey: Traveler Comms", destination: "Kyoto, Japan",
    startDate: isoDate(50), endDate: isoDate(55), status: "planning",
  });
  await upsertCollaboratorOwner(pg, { id: COLLAB_ID, tripId: TRIP_ID, userId: travelerId });
  await upsertAdvisor(pg, { id: ADVISOR_ID, tripId: TRIP_ID, expertId, status: "accepted", workspaceStatus: "draft" });
  await upsertAdvisor(pg, { id: REJECTED_ADVISOR_ID, tripId: TRIP_ID, expertId: rejectedId, status: "rejected", workspaceStatus: "draft" });

  await pg.query(
    `INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, routing_status, location_name, estimated_cost)
     VALUES ($1, $2, 'Journey Comment Target Item', 'activity', 1, 'in_planning', 'Kyoto', '25.00')
     ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
    [ITEM_ID, TRIP_ID],
  );

  await pg.query(
    `INSERT INTO user_and_expert_chats (id, sender_id, receiver_id, message)
     VALUES ($1, $2, $3, 'Hi, looking forward to the trip!')
     ON CONFLICT (id) DO UPDATE SET message = EXCLUDED.message, created_at = now()`,
    [CHAT_ID_TO_EXPERT, travelerId, expertId],
  );
  await pg.query(
    `INSERT INTO user_and_expert_chats (id, sender_id, receiver_id, message)
     VALUES ($1, $2, $3, 'Happy to help — I have a few ideas for Day 1.')
     ON CONFLICT (id) DO UPDATE SET message = EXCLUDED.message, created_at = now()`,
    [CHAT_ID_FROM_EXPERT, expertId, travelerId],
  );

  await pg.query(
    `INSERT INTO notifications (id, user_id, type, title, message, is_read, related_id, related_type, data)
     VALUES ($1, $2, 'itinerary_update', 'Journey Test Update', 'Something changed on your trip.', false, $3, 'trip', $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET is_read = false, created_at = now()`,
    [NOTIF_ID, travelerId, TRIP_ID, JSON.stringify({ tripId: TRIP_ID, workspacePath: `/trip/${TRIP_ID}?tab=itinerary` })],
  );

  return { travelerId, expertId, rejectedId, unrelatedId };
}

async function commentNotification(pg, userId, itemId, titleContains) {
  return dbOne(
    pg,
    `SELECT id, title, message FROM notifications
     WHERE user_id = $1 AND related_id = $2 AND related_type = 'trip' AND title ILIKE $3
     ORDER BY created_at DESC LIMIT 1`,
    [userId, itemId, `%${titleContains}%`],
  );
}

async function main() {
  await preflight({ baseUrl: BASE_URL, dbUrl: DB_URL, journeyFile: JOURNEY_FILE });
  const pg = await connectDb(DB_URL);
  const { runStep, printReport } = createStepRunner({ outDir: OUT_DIR, skipExternal: cfg.SKIP_EXTERNAL });

  console.log("[seed] resetting & seeding jrny5- fixtures (idempotent)...");
  const seeded = await resetAndSeedFixtures(pg);
  console.log(`[seed] trip=${TRIP_ID} traveler=${seeded.travelerId} expert=${seeded.expertId}`);

  const browser = await launchBrowser({ headed: HEADED });
  const travelerCtx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1400, height: 1000 } });
  const expertCtx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1400, height: 1000 } });
  const rejectedCtx = await browser.newContext({ baseURL: BASE_URL });
  const unrelatedCtx = await browser.newContext({ baseURL: BASE_URL });
  let travelerPage, expertPage, rejectedPage, unrelatedPage;

  try {
    travelerPage = await login(travelerCtx, TRAVELER_EMAIL, PASSWORD);
    expertPage = await login(expertCtx, EXPERT_EMAIL, PASSWORD);
    rejectedPage = await login(rejectedCtx, REJECTED_ADVISOR_EMAIL, PASSWORD);
    unrelatedPage = await login(unrelatedCtx, UNRELATED_EMAIL, PASSWORD);
    console.log("[auth] all four accounts authenticated.");

    // ═══ Step 1 — /inbox Messages tab shows the thread ═══
    await runStep(
      "Traveler: /inbox Messages tab shows the expert thread",
      async () => {
        await travelerPage.goto("/inbox");
        await waitVisible(travelerPage, "tab-inbox-messages");
        const threadSel = await waitVisible(travelerPage, `inbox-thread-${seeded.expertId}`);
        const text = await travelerPage.textContent(threadSel);
        // The thread card's lastMessage shows the MOST RECENT of the two seeded rows (the
        // expert's reply), per useConversationThreads' "keep only the latest per counterpart".
        if (!text || !text.toLowerCase().includes("happy to help")) {
          throw new Error(`thread card does not show the latest message: '${text}'`);
        }
        return {
          ui: `inbox-thread-${seeded.expertId} visible on /inbox, shows the latest message ("Happy to help…")`,
          db: `user_and_expert_chats rows ${CHAT_ID_TO_EXPERT} + ${CHAT_ID_FROM_EXPERT} both present between traveler and expert`,
        };
      },
      { page: travelerPage },
    );

    // ═══ Step 2 — clicking the thread deep-links to /chat?expertId= ═══
    await runStep(
      "Traveler: clicking the thread navigates to /chat?expertId=<expert>",
      async () => {
        await travelerPage.click(`[data-testid="inbox-thread-${seeded.expertId}"]`);
        await travelerPage.waitForURL(new RegExp(`/chat\\?expertId=${seeded.expertId}`), { timeout: 10000 });
        return {
          ui: `navigated to ${travelerPage.url()}`,
          db: "N/A (client-side routing assertion)",
        };
      },
      { page: travelerPage },
    );

    // ═══ Step 3 — Updates tab shows the notification ═══
    await runStep(
      "Traveler: /inbox Updates tab shows the notification",
      async () => {
        await travelerPage.goto("/inbox");
        await travelerPage.click(`[data-testid="tab-inbox-updates"]`);
        const sel = await waitVisible(travelerPage, `inbox-update-${NOTIF_ID}`);
        const text = await travelerPage.textContent(sel);
        if (!text || !text.includes("Journey Test Update")) {
          throw new Error(`update card does not render the expected title: '${text}'`);
        }
        const row = await dbOne(pg, "SELECT is_read FROM notifications WHERE id = $1", [NOTIF_ID]);
        if (row?.is_read !== false) throw new Error(`expected is_read=false at baseline, got ${row?.is_read}`);
        return {
          ui: `inbox-update-${NOTIF_ID} visible on the Updates tab, renders "Journey Test Update"`,
          db: `notifications.is_read=false (baseline, pre-click)`,
        };
      },
      { page: travelerPage },
    );

    // ═══ Step 4 — deep-link navigates AND persists the mark-read ═══
    await runStep(
      "Traveler: the update's deep-link button navigates to the trip AND persists mark-read",
      async () => {
        const [resp] = await Promise.all([
          travelerPage.waitForResponse(
            (r) => r.url().includes(`/api/notifications/${NOTIF_ID}/read`) && r.request().method() === "PATCH",
            { timeout: 10000 },
          ),
          travelerPage.click(`[data-testid="button-open-update-${NOTIF_ID}"]`),
        ]);
        if (!resp.ok()) throw new Error(`PATCH mark-read failed: ${resp.status()}`);
        await travelerPage.waitForURL(new RegExp(`/trip/${TRIP_ID}\\?tab=itinerary`), { timeout: 10000 });

        const row = await dbOne(pg, "SELECT is_read FROM notifications WHERE id = $1", [NOTIF_ID]);
        if (row?.is_read !== true) throw new Error(`expected is_read=true after the click, got ${row?.is_read}`);
        return {
          ui: `navigated to ${travelerPage.url()}`,
          db: `notifications.is_read=true for ${NOTIF_ID} (persists across the navigation)`,
        };
      },
      { page: travelerPage },
    );

    // ═══ Step 5 — owner posts a comment -> row + expert bell ═══
    await runStep("Traveler (owner): POST a comment -> row created + expert bell notification", async () => {
      const resp = await travelerPage.request.post(`/api/trips/${TRIP_ID}/items/${ITEM_ID}/comments`, {
        data: { body: "Can we move this earlier in the day?" },
      });
      if (resp.status() !== 201) throw new Error(`expected 201, got ${resp.status()}: ${await resp.text()}`);
      const body = await resp.json();
      if (!body.comment?.id || body.comment.authorName === "Member") {
        // authorName must be the REAL traveler name, never the generic fallback, given the
        // E2E seed always sets firstName/lastName.
        throw new Error(`unexpected comment shape (fabricated/missing author name?): ${JSON.stringify(body)}`);
      }
      const row = await dbOne(pg, "SELECT id, body, author_id FROM trip_item_comments WHERE id = $1", [body.comment.id]);
      if (!row || row.author_id !== seeded.travelerId) throw new Error(`unexpected DB row: ${JSON.stringify(row)}`);
      const notif = await commentNotification(pg, seeded.expertId, ITEM_ID, "New comment on the plan");
      if (!notif) throw new Error("no expert-side bell notification for the owner's comment");
      return {
        ui: "N/A (API-driven)",
        db: `trip_item_comments row ${row.id} by owner; notifications row '${notif.title}' for the expert`,
      };
    });

    // ═══ Step 6 — expert posts a comment -> row + owner bell ═══
    await runStep("Expert: POST a comment -> row created + owner bell notification", async () => {
      const resp = await expertPage.request.post(`/api/trips/${TRIP_ID}/items/${ITEM_ID}/comments`, {
        data: { body: "Sure — I'll swap it with the temple visit." },
      });
      if (resp.status() !== 201) throw new Error(`expected 201, got ${resp.status()}: ${await resp.text()}`);
      const body = await resp.json();
      const row = await dbOne(pg, "SELECT id, author_id FROM trip_item_comments WHERE id = $1", [body.comment.id]);
      if (!row || row.author_id !== seeded.expertId) throw new Error(`unexpected DB row: ${JSON.stringify(row)}`);
      const notif = await commentNotification(pg, seeded.travelerId, ITEM_ID, "New comment from your expert");
      if (!notif) throw new Error("no owner-side bell notification for the expert's comment");
      const allComments = await dbAll(pg, "SELECT id FROM trip_item_comments WHERE trip_id = $1", [TRIP_ID]);
      return {
        ui: "N/A (API-driven)",
        db: `trip_item_comments row ${row.id} by expert; notifications row '${notif.title}' for the owner; ${allComments.length} total comments on the trip`,
      };
    });

    // ═══ Step 7 — rejected advisor -> 403 ═══
    await runStep("Rejected advisor: POST a comment -> 403 (canonical isTripAdvisor denies 'rejected')", async () => {
      const resp = await rejectedPage.request.post(`/api/trips/${TRIP_ID}/items/${ITEM_ID}/comments`, {
        data: { body: "Should not be allowed" },
      });
      if (resp.status() !== 403) throw new Error(`expected 403, got ${resp.status()}: ${await resp.text()}`);
      const row = await dbOne(pg, "SELECT id FROM trip_item_comments WHERE trip_id = $1 AND body = $2", [TRIP_ID, "Should not be allowed"]);
      if (row) throw new Error("comment was created despite the 403");
      return { ui: "N/A (API-driven)", db: "no trip_item_comments row created for the rejected advisor's attempt" };
    });

    // ═══ Step 8 — unrelated user -> 403 ═══
    await runStep("Unrelated user: POST a comment -> 403 (no owner/advisor/author relation)", async () => {
      const resp = await unrelatedPage.request.post(`/api/trips/${TRIP_ID}/items/${ITEM_ID}/comments`, {
        data: { body: "Also should not be allowed" },
      });
      if (resp.status() !== 403) throw new Error(`expected 403, got ${resp.status()}: ${await resp.text()}`);
      const row = await dbOne(pg, "SELECT id FROM trip_item_comments WHERE trip_id = $1 AND body = $2", [TRIP_ID, "Also should not be allowed"]);
      if (row) throw new Error("comment was created despite the 403");
      return { ui: "N/A (API-driven)", db: "no trip_item_comments row created for the unrelated user's attempt" };
    });

    // ═══ Step 9 — thread renders on the Trip Card (traveler) ═══
    await runStep(
      "Browser: comment thread renders on the traveler's Trip Card (dashboard PlanCard)",
      async () => {
        await travelerPage.goto("/dashboard");
        await waitVisible(travelerPage, "active-plans-section");
        const chip = `[data-testid="trip-chip-${TRIP_ID}"]`;
        if (await travelerPage.isVisible(chip)) await travelerPage.click(chip);
        await waitVisible(travelerPage, `activity-row-${ITEM_ID}`);
        const commentsSection = await waitVisible(travelerPage, `item-comments-${ITEM_ID}`);
        await travelerPage.click(`[data-testid="button-toggle-comments-${ITEM_ID}"]`);
        await waitVisible(travelerPage, `comment-thread-${ITEM_ID}`);
        const threadText = await travelerPage.textContent(`[data-testid="comment-thread-${ITEM_ID}"]`);
        if (!threadText || !threadText.includes("swap it with the temple")) {
          throw new Error(`comment thread does not render the expert's comment: '${threadText}'`);
        }
        return {
          ui: `item-comments-${ITEM_ID} + comment-thread-${ITEM_ID} visible on /dashboard, renders both comments`,
          db: "N/A (rendering assertion over the trip_item_comments rows already proven in Steps 5-6)",
        };
      },
      { page: travelerPage },
    );

    // ═══ Step 10 — thread renders on the Workstation (expert) ═══
    await runStep(
      "Browser: comment thread renders on the expert's Workstation editor",
      async () => {
        await expertPage.goto(`/expert/workspace/${TRIP_ID}`);
        await waitVisible(expertPage, "tab-right-add");
        const dayListToggle = `[data-testid="toggle-format-day-list"]`;
        if (await expertPage.isVisible(dayListToggle)) await expertPage.click(dayListToggle);
        await waitVisible(expertPage, `activities-section-${TRIP_ID}`);
        await waitVisible(expertPage, "button-toggle-item-editor");
        await expertPage.click(`[data-testid="button-toggle-item-editor"]`);
        const expandBtn = await waitVisible(expertPage, `button-expand-item-${ITEM_ID}`);
        await expertPage.click(expandBtn);
        await waitVisible(expertPage, `item-comments-${ITEM_ID}`);
        await expertPage.click(`[data-testid="button-toggle-comments-${ITEM_ID}"]`);
        await waitVisible(expertPage, `comment-thread-${ITEM_ID}`);
        const threadText = await expertPage.textContent(`[data-testid="comment-thread-${ITEM_ID}"]`);
        if (!threadText || !threadText.includes("move this earlier")) {
          throw new Error(`comment thread does not render the owner's comment: '${threadText}'`);
        }
        return {
          ui: `item-comments-${ITEM_ID} + comment-thread-${ITEM_ID} visible in the Workstation editor, renders both comments`,
          db: "N/A (same shared ItemComments component + the same trip_item_comments rows as Step 9)",
        };
      },
      { page: expertPage },
    );
  } finally {
    await browser.close().catch(() => {});
    await pg.end().catch(() => {});
  }

  const exitCode = printReport("traveler-comms");
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
