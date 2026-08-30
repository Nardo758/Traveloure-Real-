/**
 * Lane C (concierge-admin) — C5 route tests, DB-free.
 *
 * Covers the three server changes of the lane by exercising the PRODUCTION
 * modules the routes delegate to (the booking-decline-reason pattern: the
 * route handler imports these exact symbols, so these tests only stay green
 * while the real handler logic matches) plus source-level wiring assertions
 * (the config-completeness pattern) proving the routes actually call them:
 *
 *   C2 — GET /api/admin/concierge-requests tier views: resolveConciergeTierView
 *        (default = expert+full, Platform ('ai') reachable, unknown → default),
 *        and the route is ONE query with the tier list as a parameter — never
 *        a forked route or the old hardcoded IN ('expert','full').
 *   C3 — the admin_notifications payload (buildConciergeAdminNotification)
 *        inserted on create + tier selection + escalation, and the wiring of
 *        all four call sites in concierge.routes.ts.
 *   C4 — POST /api/concierge/escalations allowlist (§19): unknown fields are
 *        STRIPPED (userId/chosenTier/stripePaymentIntentId can never reach the
 *        insert), tier pinned server-side, session-derived identity (§14).
 *
 * Run with:
 *   npx tsx --test server/__tests__/concierge-admin-signal.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { CONCIERGE_TIER_VIEWS, resolveConciergeTierView } from "../utils/concierge-tier-filter";
import {
  CONCIERGE_NOTIFICATION_TYPE,
  buildConciergeAdminNotification,
  conciergeTierLabel,
  escalationRequestSchema,
} from "../utils/concierge-admin-notification";

const HERE = dirname(fileURLToPath(import.meta.url));
const conciergeRoutesSrc = readFileSync(join(HERE, "../routes/concierge.routes.ts"), "utf8");
const adminRoutesSrc = readFileSync(join(HERE, "../routes/admin.routes.ts"), "utf8");

// ─── C2: tier views ──────────────────────────────────────────────────────────

describe("C2 — admin queue tier views (resolveConciergeTierView)", () => {
  test("default view is unchanged staff muscle-memory: expert + full", () => {
    assert.deepEqual([...resolveConciergeTierView(undefined)], ["expert", "full"]);
    assert.deepEqual([...resolveConciergeTierView("human")], ["expert", "full"]);
  });

  test("Platform tier ('ai') is reachable as its own view", () => {
    assert.deepEqual([...resolveConciergeTierView("ai")], ["ai"]);
  });

  test("single-tier and all views resolve", () => {
    assert.deepEqual([...resolveConciergeTierView("expert")], ["expert"]);
    assert.deepEqual([...resolveConciergeTierView("full")], ["full"]);
    assert.deepEqual([...resolveConciergeTierView("all")].sort(), ["ai", "expert", "full"]);
  });

  test("unknown / non-string values fall back to the default view — never widen, never throw", () => {
    for (const bad of ["", "AI", "bogus", "human,ai", 42, null, {}, ["ai"]]) {
      assert.deepEqual([...resolveConciergeTierView(bad)], [...CONCIERGE_TIER_VIEWS.human]);
    }
  });

  test("route wiring: ONE tier-parameterized query, no fork, no hardcoded human-only filter", () => {
    // The old blind spot: WHERE cr.chosen_tier IN ('expert', 'full').
    assert.ok(
      !/chosen_tier\s+IN\s*\(\s*'expert'\s*,\s*'full'\s*\)/.test(adminRoutesSrc),
      "hardcoded IN ('expert','full') must be gone — Platform requests were invisible behind it"
    );
    assert.ok(
      adminRoutesSrc.includes("resolveConciergeTierView(req.query.tier)"),
      "the route must resolve the tier view through the shared helper"
    );
    assert.ok(
      /chosen_tier\s*=\s*ANY\(/.test(adminRoutesSrc),
      "the tier list must be a query parameter (= ANY), one query for every view"
    );
    const routeCount = adminRoutesSrc.split('"/api/admin/concierge-requests"').length - 1;
    assert.equal(routeCount, 1, "exactly one concierge-requests admin route — the view is a parameter, not a forked route");
  });
});

// ─── C3: admin notification payload + wiring ─────────────────────────────────

describe("C3 — concierge admin_notifications payload", () => {
  const row = {
    id: "req-123",
    intent: "Plan a proposal in Kyoto",
    chosenTier: "ai" as const,
    eventType: "proposal",
    userId: "user-9",
  };

  test("created event: donor-shaped payload (type/message/isRead/metadata) linking the queue row", () => {
    const n = buildConciergeAdminNotification(row, "created");
    assert.equal(n.type, CONCIERGE_NOTIFICATION_TYPE);
    assert.equal(n.isRead, false);
    assert.match(n.message, /New concierge request \(Platform\)/);
    assert.match(n.message, /Plan a proposal in Kyoto/);
    assert.equal(n.metadata.conciergeRequestId, "req-123");
    assert.equal(n.metadata.event, "created");
    assert.equal(n.metadata.chosenTier, "ai");
    assert.equal(n.metadata.userId, "user-9");
  });

  test("tier_selected event names the ruled tier labels", () => {
    assert.match(
      buildConciergeAdminNotification({ ...row, chosenTier: "expert" }, "tier_selected").message,
      /Concierge tier selected \(Destination\)/
    );
    assert.match(
      buildConciergeAdminNotification({ ...row, chosenTier: "full" }, "tier_selected").message,
      /Concierge tier selected \(Full \/ Done-for-You\)/
    );
  });

  test("escalated event carries the conversation id in metadata for staff context", () => {
    const n = buildConciergeAdminNotification(row, "escalated", { conversationId: 77 });
    assert.match(n.message, /AI chat escalation \(Platform\)/);
    assert.equal(n.metadata.conversationId, 77);
    assert.equal(n.metadata.conciergeRequestId, "req-123");
  });

  test("a request with no tier yet is still notifiable (creation precedes selection)", () => {
    const n = buildConciergeAdminNotification({ id: "r", intent: "hi", chosenTier: null }, "created");
    assert.match(n.message, /no tier yet/);
    assert.equal(n.metadata.chosenTier, null);
  });

  test("long intents are truncated to a message snippet (140 chars)", () => {
    const n = buildConciergeAdminNotification({ id: "r", intent: "x".repeat(500) }, "created");
    assert.ok(n.message.includes("x".repeat(140)));
    assert.ok(!n.message.includes("x".repeat(141)));
  });

  test("tier labels are the ruled vocabulary", () => {
    assert.equal(conciergeTierLabel("ai"), "Platform");
    assert.equal(conciergeTierLabel("expert"), "Destination");
    assert.equal(conciergeTierLabel("full"), "Full / Done-for-You");
  });

  test("route wiring: notification fires on BOTH create paths, tier selection, and escalation", () => {
    const calls = conciergeRoutesSrc.split("await notifyAdminsOfConciergeRequest(").length - 1;
    assert.ok(calls >= 4, `expected >=4 notify call sites (requests, quote, PATCH, escalations); found ${calls}`);
    assert.ok(
      conciergeRoutesSrc.includes("buildConciergeAdminNotification(row, event, extraMetadata)"),
      "the insert must use the shared payload builder these tests assert against"
    );
  });
});

// ─── C4: escalation allowlist (§19) + posture ────────────────────────────────

describe("C4 — POST /api/concierge/escalations body allowlist", () => {
  test("valid body parses; note is trimmed", () => {
    const parsed = escalationRequestSchema.parse({ conversationId: 12, note: "  need a human  " });
    assert.equal(parsed.conversationId, 12);
    assert.equal(parsed.note, "need a human");
  });

  test("both fields are optional (an escalation can predate any conversation)", () => {
    assert.deepEqual(escalationRequestSchema.parse({}), {});
  });

  test("unknown fields are STRIPPED — privileged names can never reach the insert (§19)", () => {
    const parsed: any = escalationRequestSchema.parse({
      conversationId: 3,
      note: "help",
      userId: "someone-else", // identity (§14)
      chosenTier: "full", // tier is pinned server-side
      status: "paid",
      stripePaymentIntentId: "pi_forged", // §19a class
      amount: 0,
      claimToken: "x",
    });
    assert.deepEqual(Object.keys(parsed).sort(), ["conversationId", "note"]);
    assert.ok(!("userId" in parsed));
    assert.ok(!("chosenTier" in parsed));
    assert.ok(!("stripePaymentIntentId" in parsed));
  });

  test("invalid conversationId is rejected (must be a positive integer)", () => {
    for (const bad of [0, -1, 1.5, "12", true]) {
      assert.equal(escalationRequestSchema.safeParse({ conversationId: bad }).success, false, String(bad));
    }
  });

  test("note over 2000 chars is rejected", () => {
    assert.equal(escalationRequestSchema.safeParse({ note: "a".repeat(2001) }).success, false);
    assert.equal(escalationRequestSchema.safeParse({ note: "a".repeat(2000) }).success, true);
  });

  test("route wiring: authenticated, session-derived identity, tier pinned, ownership-checked conversation", () => {
    const start = conciergeRoutesSrc.indexOf('router.post("/api/concierge/escalations"');
    assert.ok(start > -1, "escalations route must exist on the existing concierge router");
    const block = conciergeRoutesSrc.slice(start, conciergeRoutesSrc.indexOf("router.get", start));
    assert.ok(block.includes("isAuthenticated"), "escalations must require auth");
    assert.ok(block.includes("escalationRequestSchema.parse(req.body)"), "body must go through the allowlist schema");
    assert.ok(!block.includes("...req.body"), "no body spreading — §19");
    assert.ok(block.includes('chosenTier: "ai"'), "tier is pinned server-side to 'ai'");
    assert.ok(block.includes("getUserId(req)"), "identity comes from the session (§14)");
    assert.ok(
      block.includes("chatStorage.getConversation(body.conversationId, userId)"),
      "conversation context must be ownership-verified before reaching the staff queue"
    );
  });
});
