/**
 * Concierge Routes (CON-A.P3 + P5).
 *
 * Surface for the pay-per-use Concierge layer.
 *   P3 ships POST /api/concierge/requests — the durable intent log.
 *   P5 ships POST /api/concierge/quote (router service + persisted quote) and
 *     PATCH /api/concierge/requests/:id (chosenTier/status updates).
 *   P8 will wire the Full/DFY catalog through the router service.
 *
 * No auth required to CREATE: guests can submit intent and request quotes (D6 —
 * free preview is the hook). userId is captured from session if present.
 *
 * MUTATIONS ARE POSSESSION-GATED (P0 fix, Jul 30 2026). See
 * `authorizeConciergeMutation` below: PATCH /requests/:id used to have no auth
 * middleware, no ownership check and no possession proof at all, while its
 * `chosenTier='full'` branch creates a `coordination_states` engagement — the §7
 * coordination-fee money path ($499 floor / 8% of budget) — for the ROW's userId.
 * Any unauthenticated caller could therefore mint a billable engagement on a
 * stranger's account by guessing/replaying a request id. The guest audience is
 * real (the create paths deliberately allow `userId = null`), so the gate is
 * possession-of-the-request, NOT `isAuthenticated`.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { and, eq, ilike, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { adminNotifications, conciergeRequests, conciergeRequestStatuses, conciergeTiers, eventPackages, coordinationStates } from "@shared/schema";
import { routeConcierge } from "../services/concierge-router.service";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { chatStorage } from "../replit_integrations/chat/storage";
import { createRateLimiter } from "../infrastructure/rate-limiter";
import {
  buildConciergeAdminNotification,
  escalationRequestSchema,
  type ConciergeNotifyEvent,
  type ConciergeRequestLike,
} from "../utils/concierge-admin-notification";

const router = Router();

// ─── Admin push signal (Lane C / C3) ────────────────────────────────────────
// Every concierge request creation, tier selection and chat escalation lands an
// admin_notifications row (ALL tiers — the Platform tier is a ruled hybrid, so
// its requests are staff work too). Non-fatal, the donor posture
// (service-requests.routes.ts): the traveler-facing operation is the important
// part; the notification is a surfacing aid.
async function notifyAdminsOfConciergeRequest(
  row: ConciergeRequestLike,
  event: ConciergeNotifyEvent,
  extraMetadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(adminNotifications).values(buildConciergeAdminNotification(row, event, extraMetadata));
  } catch (notifErr: any) {
    console.warn("[concierge] admin_notifications insert failed (non-fatal):", notifErr?.message);
  }
}

function makeClaimToken(requestId: string): string {
  const secret = process.env.SESSION_SECRET || "dev-fallback-secret";
  return createHmac("sha256", secret).update(`concierge-claim:${requestId}`).digest("hex");
}

// ─── Possession of a concierge request (P0 authorization primitive) ─────────
// A concierge request may legitimately be created by a GUEST (userId NULL), so
// "who may mutate it" cannot be answered by the session user alone. Three proofs
// are accepted, in this order:
//
//   1. OWNERSHIP  — the signed-in caller IS `concierge_requests.user_id`.
//   2. SESSION POSSESSION — the request id was stamped into the caller's own
//      express-session at create time (`rememberConciergeRequest`). This is the
//      guest path: the browser that created the request keeps the proof, and it
//      is server-side state (the session store), never a client-supplied value.
//      Only accepted while the row is still unclaimed (`user_id IS NULL`) — once
//      an account owns the row, proof (1) is the path.
//   3. CLAIM TOKEN — the same HMAC possession proof the sibling `/claim`
//      endpoint already requires (`makeClaimToken`), passed as `claimToken`.
//      Mirroring `/claim`, it can never take over a row owned by a DIFFERENT
//      account. This keeps non-browser/API callers and post-session-loss retries
//      working; the token is only ever handed back to the creator.
//
// Anything else is a 403. No proof is derivable from the request id alone, which
// is what the hole was.
const CONCIERGE_SESSION_KEY = "conciergeRequestIds";
const CONCIERGE_SESSION_MAX = 50;

/** Stamp a freshly created request into the creator's session (guest-safe). */
function rememberConciergeRequest(req: any, requestId: string): void {
  const sess = req?.session;
  if (!sess) return;
  const current = sess[CONCIERGE_SESSION_KEY];
  const list: string[] = Array.isArray(current)
    ? current.filter((v: unknown): v is string => typeof v === "string")
    : [];
  if (!list.includes(requestId)) list.push(requestId);
  // Bounded: a session is a browser, not an audit log. Keep the most recent ids.
  sess[CONCIERGE_SESSION_KEY] = list.slice(-CONCIERGE_SESSION_MAX);
}

function hasSessionPossession(req: any, requestId: string): boolean {
  const list = req?.session?.[CONCIERGE_SESSION_KEY];
  return Array.isArray(list) && list.includes(requestId);
}

/** Constant-time compare of a caller-supplied claim token against the expected HMAC. */
function claimTokenMatches(provided: unknown, requestId: string): boolean {
  if (typeof provided !== "string" || provided.length === 0) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(makeClaimToken(requestId), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorizeConciergeMutation(
  req: any,
  row: { id: string; userId: string | null },
  userId: string | null,
): boolean {
  // 1. Signed-in owner.
  if (row.userId && userId && row.userId === userId) return true;
  // 2. The (guest) browser session that created it, while still unclaimed.
  if (!row.userId && hasSessionPossession(req, row.id)) return true;
  // 3. HMAC possession token — never across accounts (same rule as /claim).
  if ((!row.userId || row.userId === userId) && claimTokenMatches(req?.body?.claimToken, row.id)) {
    return true;
  }
  return false;
}

const createRequestSchema = z.object({
  intent: z.string().min(1).max(2000),
  eventType: z.string().max(50).optional(),
  tripId: z.string().optional(),
  cartId: z.string().optional(),
  chosenTier: z.enum(conciergeTiers).optional(),
  status: z.enum(conciergeRequestStatuses).optional(),
});

router.post("/api/concierge/requests", async (req, res) => {
  try {
    const body = createRequestSchema.parse(req.body);
    const userId = getUserId(req)!;

    const [row] = await db
      .insert(conciergeRequests)
      .values({
        userId,
        intent: body.intent,
        eventType: body.eventType,
        tripId: body.tripId,
        cartId: body.cartId,
        chosenTier: body.chosenTier,
        status: body.status ?? "draft",
      })
      .returning();

    // Possession: the creating browser session may later mutate this request
    // (PATCH is possession-gated). Guests included — that is the point.
    rememberConciergeRequest(req, row.id);

    // C3: push signal into the admin queue on creation, all tiers.
    await notifyAdminsOfConciergeRequest(row, "created");

    // Guests additionally get the HMAC possession token (the /claim proof) so a
    // client that persists it can mutate/claim after a session loss. Owners don't
    // need it — they authorize by ownership.
    const claimToken = row.userId ? undefined : makeClaimToken(row.id);
    res.status(201).json({ ...row, ...(claimToken ? { claimToken } : {}) });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_failed", details: err.errors });
    }
    console.error("[concierge/requests] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/concierge/quote (CON-A.P5 / N2) ─────────────────────────────
// Resolves an intent into priced delivery options (AI/Expert/Full) and persists
// a concierge_requests row with status='quoted' so the funnel is captured even
// if the user never picks a tier.

const quoteSchema = z.object({
  intent: z.string().min(1).max(2000),
  destination: z.string().max(255).optional(),
  eventType: z.string().max(50).optional(),
  tripId: z.string().optional(),
  cartId: z.string().optional(),
});

router.post("/api/concierge/quote", async (req, res) => {
  try {
    const body = quoteSchema.parse(req.body);
    const userId = getUserId(req)!;

    const route = await routeConcierge({
      intent: body.intent,
      destination: body.destination,
      eventType: body.eventType,
      tripId: body.tripId,
      cartId: body.cartId,
    });

    const [row] = await db
      .insert(conciergeRequests)
      .values({
        userId,
        intent: body.intent,
        eventType: body.eventType,
        tripId: body.tripId,
        cartId: body.cartId,
        status: "quoted",
      })
      .returning({ id: conciergeRequests.id });

    // Possession stamp (see authorizeConciergeMutation) — this is the create path
    // the live client actually uses before PATCHing a tier, so the guest funnel
    // depends on it.
    rememberConciergeRequest(req, row.id);

    // C3: push signal on creation (this is the create path the live client uses).
    await notifyAdminsOfConciergeRequest(
      { id: row.id, intent: body.intent, eventType: body.eventType ?? null, userId, chosenTier: null },
      "created",
    );

    res.json({
      requestId: row.id,
      route,
      ...(userId ? {} : { claimToken: makeClaimToken(row.id) }),
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_failed", details: err.errors });
    }
    console.error("[concierge/quote] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/concierge/requests/:id (CON-A.P5) ──────────────────────────
// Updates chosenTier (and optionally status) on an existing quote. Picking a
// tier auto-bumps status to 'selected' unless an explicit status is provided.

const updateRequestSchema = z.object({
  chosenTier: z.enum(conciergeTiers).optional(),
  status: z.enum(conciergeRequestStatuses).optional(),
  // Possession proof (optional): the same HMAC token /claim requires. Never an
  // identity or an amount — it only proves the caller holds this request.
  claimToken: z.string().max(200).optional(),
});

router.patch("/api/concierge/requests/:id", async (req, res) => {
  try {
    const body = updateRequestSchema.parse(req.body);
    if (body.chosenTier === undefined && body.status === undefined) {
      return res.status(400).json({ error: "no_changes", message: "Provide chosenTier or status." });
    }

    const updates: Partial<typeof conciergeRequests.$inferInsert> = {};
    if (body.chosenTier !== undefined) updates.chosenTier = body.chosenTier;
    if (body.status !== undefined) {
      updates.status = body.status;
    } else if (body.chosenTier !== undefined) {
      updates.status = "selected";
    }

    // ── Authorize BEFORE any write (P0). Read the row first: possession is a
    // property of the row (owner / guest-session / claim token), so it cannot be
    // decided from the URL alone — which is exactly what the hole was.
    const userId: string | null =
      getUserId(req)!;

    const [target] = await db
      .select({ id: conciergeRequests.id, userId: conciergeRequests.userId })
      .from(conciergeRequests)
      .where(eq(conciergeRequests.id, req.params.id))
      .limit(1);

    if (!target) {
      return res.status(404).json({ error: "not_found" });
    }

    if (!authorizeConciergeMutation(req, target, userId)) {
      return res.status(403).json({
        error: "forbidden",
        message: "This concierge request belongs to someone else.",
      });
    }

    const [row] = await db
      .update(conciergeRequests)
      .set(updates)
      .where(eq(conciergeRequests.id, req.params.id))
      .returning();

    if (!row) {
      return res.status(404).json({ error: "not_found" });
    }

    // Fulfillment wire (§7): a signed-in traveler picking the Full / done-for-you tier
    // spins up a real coordination engagement so "we'll follow up" becomes a trackable
    // event-coordination state the fee engine + coordinator workspace already understand.
    // Guests stay request-only (coordination_states.userId is NOT NULL).
    //
    // IDEMPOTENCY (§15) — the pre-existing dedup on
    // `user_request->>'conciergeRequestId'` covers every SEQUENTIAL retry (second
    // click after the first finished, re-PATCH, status-only PATCH), but it is a
    // check-then-INSERT, i.e. the TOCTOU shape §15 explicitly calls out: two
    // CONCURRENT full-picks could both read "no engagement" and both insert, and
    // there is no unique index on that jsonb path to stop them (adding one is a
    // migration + `shared/schema.ts` declaration — see the CLAUDE.md index rule).
    // So the check-then-insert now runs inside a transaction-scoped Postgres
    // ADVISORY LOCK keyed on the concierge request id: the second caller blocks
    // until the first commits and then SEES its row, making the critical section
    // atomic with no schema change. One engagement per concierge request, both
    // sequentially and concurrently.
    let coordinationId: string | undefined;
    if (row.chosenTier === "full" && row.userId) {
      const lockKey = `concierge-coordination:${row.id}`;
      coordinationId = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

        const [existing] = await tx
          .select({ id: coordinationStates.id })
          .from(coordinationStates)
          .where(sql`${coordinationStates.userRequest}->>'conciergeRequestId' = ${row.id}`)
          .limit(1);
        if (existing) return existing.id;

        // Trip-Canon Lane 2: coordinationStates.tripId deliberately left unset here.
        // conciergeRequests does carry a tripId column, but it is written straight
        // from req.body with no ownership verification (out of this lane's scope),
        // so propagating it into coordination_states would mint an unverified
        // trip linkage — the exact class of gap this lane closes elsewhere. Leave
        // null (honest) until conciergeRequests.tripId itself gets an ownership
        // check of its own.
        const state = await storage.createCoordinationState({
          userId: row.userId,
          experienceType: row.eventType || "event",
          status: "intake",
          path: "concierge",
          userRequest: { conciergeRequestId: row.id, intent: row.intent, source: "concierge_full" },
        } as any);
        return state.id;
      });
    }

    // C3: push signal on tier selection (the PATCH), all tiers — including the
    // Platform tier, whose requests were previously invisible to staff.
    if (body.chosenTier !== undefined) {
      await notifyAdminsOfConciergeRequest(row, "tier_selected");
    }

    // For guests (no coordinationId), return a signed claim token they can use after sign-in.
    const isGuest = !row.userId;
    const claimToken = isGuest ? makeClaimToken(row.id) : undefined;

    res.json({ ...row, coordinationId, isGuest, ...(claimToken ? { claimToken } : {}) });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_failed", details: err.errors });
    }
    console.error("[concierge/requests/:id PATCH] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/concierge/requests/:id/claim ─────────────────────────────────
// Links an orphaned (guest) concierge request to the authenticated user and
// spins up a coordination_states row — the same path as the authenticated
// Full-pick flow in PATCH above. Auth required; idempotent.

router.post("/api/concierge/requests/:id/claim", async (req, res) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) {
      return res.status(401).json({ error: "unauthenticated", message: "Sign in to claim a concierge request." });
    }

    // Validate possession token — prevents another authenticated user from claiming
    // a request they didn't originate. Token is HMAC-SHA256(requestId, SESSION_SECRET).
    const providedToken: string | undefined = req.body?.claimToken;
    const expectedToken = makeClaimToken(req.params.id);
    if (!providedToken || providedToken !== expectedToken) {
      return res.status(403).json({ error: "invalid_claim_token", message: "Claim token is missing or invalid." });
    }

    const [row] = await db
      .select()
      .from(conciergeRequests)
      .where(eq(conciergeRequests.id, req.params.id))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: "not_found" });
    }

    // If already owned by a different user, reject.
    if (row.userId && row.userId !== userId) {
      return res.status(403).json({ error: "forbidden", message: "This request belongs to another account." });
    }

    // Stamp the userId if it was null (guest request).
    let claimed = row;
    if (!row.userId) {
      const [updated] = await db
        .update(conciergeRequests)
        .set({ userId, status: "selected", chosenTier: row.chosenTier ?? "full" })
        .where(eq(conciergeRequests.id, row.id))
        .returning();
      claimed = updated;
    }

    // Create or reuse a coordination_states row (idempotent, same as PATCH full).
    const [existing] = await db
      .select({ id: coordinationStates.id })
      .from(coordinationStates)
      .where(sql`${coordinationStates.userRequest}->>'conciergeRequestId' = ${claimed.id}`)
      .limit(1);

    let coordinationId: string;
    if (existing) {
      coordinationId = existing.id;
    } else {
      // Trip-Canon Lane 2: same as the PATCH full-pick path above — claimed.tripId
      // is left unlinked here (unverified body-sourced value, out of this lane's
      // scope), so this row is born with a null tripId, honestly.
      const state = await storage.createCoordinationState({
        userId,
        experienceType: claimed.eventType || "event",
        status: "intake",
        path: "concierge",
        userRequest: { conciergeRequestId: claimed.id, intent: claimed.intent, source: "concierge_guest_claim" },
      } as any);
      coordinationId = state.id;
    }

    res.json({ ...claimed, coordinationId });
  } catch (err: any) {
    console.error("[concierge/requests/:id/claim] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/concierge/event-packages (CON-A.P8 / N6) ─────────────────────
// Public read of the Full/DFY catalog. Optional eventType + market filters.
// status defaults to 'active' so the surface only sees live packages.

router.get("/api/concierge/event-packages", async (req, res) => {
  try {
    const { eventType, market } = req.query as { eventType?: string; market?: string };
    const conditions = [eq(eventPackages.status, "active")];
    if (eventType) conditions.push(eq(eventPackages.eventType, eventType));
    if (market) conditions.push(ilike(eventPackages.market, `%${market}%`));
    const rows = await db
      .select()
      .from(eventPackages)
      .where(and(...conditions))
      .orderBy(desc(eventPackages.createdAt))
      .limit(50);
    res.json(rows);
  } catch (err: any) {
    console.error("[concierge/event-packages GET] error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
