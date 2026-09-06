/**
 * conversations.routes.ts — the CANONICAL contact rails.
 *
 * Ledger `2026-09-05-user-id-is-internal`, CLAUDE.md Locked Decision 40. Lane 1 of 3.
 *
 * `users.id` is INTERNAL. A conversation is opened by naming WHAT it is about — a storefront
 * handle, a public service, a booking the caller is already on, or the PLAN a traveler and an
 * advisor share — and the SERVER resolves the counterpart. Nothing here reads a recipient id from
 * a body, and nothing here returns one: §14's identity rule, applied to the other end of the
 * message.
 *
 * D22 (ledger `2026-09-05-slip-decisions-d18-d22`) added the fourth kind, `advisor`, and needed NO
 * migration: `conversation_contexts.context_kind` is app-enforced with no DB CHECK precisely so a
 * new kind is a code change rather than a publish-time push failure. Nothing else on this route
 * moved — the `.strict()` allowlist, the block check, the ONE rate limiter and the opaque
 * conversation id are all unchanged, and the plan address goes through the same refusal shape as
 * the other three.
 *
 * LANE 1 ADDS, IT DOES NOT REMOVE. The existing id-addressed rails (`POST /api/chats`,
 * `POST /api/chat/start`, `POST /api/messages` with `recipientId`) all still work and are annotated
 * `deprecated — removed after lane 3`. Lane 2 strips user ids from public projections; lane 3
 * switches the clients and deletes the deprecated inputs.
 */
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { sanitizeText } from "../utils/text-sanitizer";
import { contactStartBodySchema } from "@shared/contact-address";
import { conversationContextKindEnum, type ConversationContextKind } from "@shared/schema";
import {
  listAdminConversationsForContext,
  loadPublicRecipientCard,
  recordConversationContext,
  resolveContactTarget,
} from "../services/contact-rails.service";
import {
  BlockedUserError,
  buildConversationId,
  hasExistingConversation,
  isBlockedBetween,
  sendMessage,
  toPublicConversationId,
} from "../services/messages.service";
import { checkMessageRateLimit } from "../infrastructure/message-rate-limiter";
import { broadcastToUser } from "../websocket";

const router = Router();

/**
 * POST /api/conversations/start — open (or re-open) a thread with an earner BY CONTEXT.
 *
 * Body is a `.strict()` pick-based allowlist (§19): exactly one of `{handle}`, `{serviceId}`,
 * `{bookingId}`, `{tripId}`, plus an optional `about` (≤500 chars) sent as the first message.
 * `{tripId}` is the D22 plan-scoped advisor thread — it names a PLAN and never a person, and the
 * counterpart (owner ⇒ the plan's advisor in a §12 access status, advisor ⇒ the owner) is resolved
 * server-side; a plan the caller is not on is the same 404 as a plan that does not exist. `.strict()` is
 * load-bearing — a legacy `{ receiverId }` body is a 400 here, not a silently ignored key, so a
 * client that ports by renaming the URL fails loudly rather than appearing to work.
 *
 * The response carries NO USER ID: `{ conversationId: <public id>, recipient: { handle,
 * displayName, avatarUrl, verified } }`.
 */
router.post("/api/conversations/start", isAuthenticated, async (req, res) => {
  try {
    const sessionUserId = getUserId(req)!;
    if (!sessionUserId) return res.status(401).json({ message: "Unauthorized" });

    const parsed = contactStartBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid request" });
    }
    const body = parsed.data;

    const resolution = await resolveContactTarget(sessionUserId, body);
    if (!resolution.ok) {
      // "no such thing" and "not yours" are the SAME sentence (§13) — the rail must not be usable
      // to probe which handles, services or bookings exist. Only self-messaging is distinguished,
      // because the caller already knows who they are.
      if (resolution.reason === "self") {
        return res.status(400).json({ message: "You cannot start a conversation with yourself." });
      }
      return res.status(404).json({ message: "Not found" });
    }
    const { recipientId, context } = resolution.target;

    // Block enforcement BEFORE any write or notification, matching every other message write path.
    if (await isBlockedBetween(sessionUserId, recipientId)) {
      return res.status(403).json({ message: "You cannot send messages to this user." });
    }

    // ONE limiter, one more caller (§18 rule 1) — this endpoint opens NEW conversations, so
    // cold-contact throttling is the relevant guard.
    const isNewConversation = !(await hasExistingConversation(sessionUserId, recipientId));
    const rate = checkMessageRateLimit({
      senderId: sessionUserId,
      recipientId,
      isNewConversation,
      peerIp: req.ip,
    });
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSec ?? 60));
      return res.status(429).json({ message: rate.message, scope: rate.scope, retryAfter: rate.retryAfterSec });
    }

    const internalId = buildConversationId(sessionUserId, recipientId);
    await recordConversationContext(internalId, context, sessionUserId);

    let messageId: string | null = null;
    if (body.about) {
      const stored = sanitizeText(body.about) ?? body.about;
      const sent = await sendMessage(sessionUserId, recipientId, stored);
      messageId = sent.id;
      broadcastToUser(recipientId, {
        type: "chat",
        id: sent.id,
        senderId: sessionUserId,
        recipientId,
        content: stored,
        timestamp: new Date().toISOString(),
      });
    }

    const recipient = await loadPublicRecipientCard(recipientId);
    return res.status(201).json({
      conversationId: toPublicConversationId(internalId),
      context: { kind: context.kind, id: context.id },
      messageId,
      recipient,
    });
  } catch (error) {
    if (error instanceof BlockedUserError) {
      return res.status(403).json({ message: "You cannot send messages to this user." });
    }
    console.error("[conversations] start failed:", error);
    return res.status(500).json({ message: "Failed to start conversation" });
  }
});

const adminQuerySchema = z.object({
  contextKind: z.enum(conversationContextKindEnum),
  contextId: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * GET /api/admin/conversations?contextKind=&contextId=
 *
 * Which conversations exist about one booking / service / storefront handle. Rides §2's BLANKET
 * `adminApiGuard` (`app.use("/api/admin", adminApiGuard)` in routes.ts) — deliberately NO
 * per-endpoint admin check, which is the opt-in pattern §2 exists to forbid.
 *
 * READ-ONLY, and deliberately WITHOUT MESSAGE BODIES: whether an admin may read what two people
 * said to each other is a separate decision nobody has made, and shipping it as a side effect of a
 * context index would be making it silently.
 */
router.get("/api/admin/conversations", async (req, res) => {
  try {
    const parsed = adminQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid query" });
    }
    const { contextKind, contextId, limit } = parsed.data;
    const rows = await listAdminConversationsForContext(
      contextKind as ConversationContextKind,
      contextId,
      limit ?? 50,
    );
    return res.json({ contextKind, contextId, conversations: rows });
  } catch (error) {
    console.error("[conversations] admin context listing failed:", error);
    return res.status(500).json({ message: "Failed to load conversations" });
  }
});

export default router;
