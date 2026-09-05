import { Router } from "express";
import { getUserId } from "../utils/auth";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { sanitizeText } from "../utils/text-sanitizer";
import {
  buildConversationId,
  parseConversationId,
  getConversationList,
  getConversationMessages,
  getUnreadMessageCount,
  getMessageById,
  sendMessage,
  markMessageRead,
  markConversationRead,
  searchMessages,
  assertRecipientExists,
  hasExistingConversation,
  isPublicConversationIdShape,
  resolvePublicConversationId,
  blockUser,
  unblockUser,
  getBlockedByUser,
  reportMessage,
  reportUser,
  BlockedUserError,
} from "../services/messages.service";
import { checkMessageRateLimit } from "../infrastructure/message-rate-limiter";
import { broadcastToUser } from "../websocket";

const router = Router();

// Locked Decision 40, lane 1: the id-addressed inputs stay alive for one release so no client
// breaks, and warn ONCE PER PROCESS — never per message. A per-message log is noise on a busy
// instance and gets muted long before lane 3; once per process makes "have the clients switched
// yet?" answerable from a boot log.
let warnedDeprecatedRecipientId = false;
function warnDeprecatedRecipientIdOnce() {
  if (warnedDeprecatedRecipientId) return;
  warnedDeprecatedRecipientId = true;
  console.warn(
    "[messages] DEPRECATED: POST /api/messages addressed by recipientId or by the INTERNAL " +
      "conversation id. Address by handle/service/booking (POST /api/conversations/start) or by " +
      "public conversationId — CLAUDE.md Locked Decision 40. Removed after lane 3.",
  );
}

// CLAUDE.md Locked Decision 40 (ledger `2026-09-05-user-id-is-internal`): `conversationId` now
// accepts the PUBLIC (HMAC) conversation id, which carries no user ids. The internal pair id is
// still accepted for one release, and `recipientId` — a client-chosen recipient identity — is
// DEPRECATED; both are removed after lane 3, when the clients have switched.
const sendMessageSchema = z.object({
  /** @deprecated — removed after lane 3 (Locked Decision 40). Address by handle/service/booking. */
  recipientId: z.string().optional(),
  conversationId: z.string().optional(),
  message: z.string().min(1, "Message cannot be empty"),
  // Defensive validation: nothing renders this field today, but stored URLs flow back out of
  // the API, so reject dangerous schemes (javascript:, data:, file:, ...) at the door.
  // Only https URLs are accepted; loosen deliberately (with a host allowlist) if a real
  // attachment-upload feature is ever built.
  attachment: z
    .string()
    .url()
    .refine(
      (value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Attachment must be an https:// URL" },
    )
    .optional(),
});

router.get("/", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const partyType = (req.query.party as string)?.toLowerCase();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const conversations = await getConversationList(userId, partyType, limit);
    res.json(conversations);
  } catch (error) {
    console.error("Error loading messages:", error);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

router.get("/conversation/:conversationId", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { conversationId } = req.params;

    // CANONICAL (Locked Decision 40): a PUBLIC conversation id, resolved against the caller's own
    // threads. The INTERNAL pair id below still works and is DEPRECATED — removed after lane 3.
    if (isPublicConversationIdShape(conversationId)) {
      const resolved = await resolvePublicConversationId(userId, conversationId);
      if (!resolved) return res.status(404).json({ message: "Conversation not found" });
      const messages = await getConversationMessages(userId, resolved.otherUserId, userId);
      return res.json(messages);
    }

    const { userId1, userId2 } = parseConversationId(conversationId);

    if (userId !== userId1 && userId !== userId2) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const messages = await getConversationMessages(userId1, userId2, userId);
    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

router.get("/unread/count", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const count = await getUnreadMessageCount(userId);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: "Failed to get unread count" });
  }
});

router.get("/search/query", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const query = (req.query.q as string)?.trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    if (!query || query.length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }

    const results = await searchMessages(userId, query, limit);
    res.json({ results, count: results.length });
  } catch (error) {
    res.status(500).json({ message: "Failed to search messages" });
  }
});

router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const message = await getMessageById(req.params.id);
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (message.senderId !== userId && message.receiverId !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }
    res.json({
      id: message.id,
      conversationId: buildConversationId(message.senderId, message.receiverId ?? ""),
      message: message.message,
      attachment: message.attachment,
      isFromMe: message.senderId === userId,
      createdAt: message.createdAt,
      readAt: message.readAt,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load message" });
  }
});

router.post("/", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const validation = sendMessageSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ message: validation.error.errors[0]?.message });
    }
    const { recipientId, conversationId, message, attachment } = validation.data;

    let targetRecipientId: string;
    if (isPublicConversationIdShape(conversationId)) {
      // CANONICAL: resolved against the CALLER'S OWN threads, so a non-participant holding a
      // valid-looking id resolves nothing. A 404 covers malformed, missing and not-yours alike
      // (§13) so the rail cannot be used as an oracle.
      const resolved = await resolvePublicConversationId(userId, conversationId);
      if (!resolved) return res.status(404).json({ message: "Conversation not found" });
      targetRecipientId = resolved.otherUserId;
    } else if (recipientId) {
      warnDeprecatedRecipientIdOnce();
      targetRecipientId = recipientId;
    } else if (conversationId) {
      // DEPRECATED: the INTERNAL pair id, which IS the counterpart's user id. Removed after lane 3.
      warnDeprecatedRecipientIdOnce();
      const { userId1, userId2 } = parseConversationId(conversationId);
      if (userId !== userId1 && userId !== userId2) {
        return res.status(403).json({ message: "Not authorized" });
      }
      targetRecipientId = userId === userId1 ? userId2 : userId1;
    } else {
      return res.status(400).json({ message: "recipientId or conversationId required" });
    }

    if (targetRecipientId === userId) {
      return res.status(400).json({ message: "Cannot message yourself" });
    }

    const exists = await assertRecipientExists(targetRecipientId);
    if (!exists) return res.status(404).json({ message: "Recipient not found" });

    const isNewConversation = !(await hasExistingConversation(userId, targetRecipientId));
    const rate = checkMessageRateLimit({ senderId: userId, recipientId: targetRecipientId, isNewConversation, peerIp: req.ip });
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSec ?? 60));
      return res.status(429).json({ message: rate.message, scope: rate.scope, retryAfter: rate.retryAfterSec });
    }

    const storedMessage = sanitizeText(message) ?? message;
    const result = await sendMessage(userId, targetRecipientId, storedMessage, attachment);

    // Live-push to the recipient's open chat client (same frame shape as the /ws relay).
    // HTTP sends were previously invisible to an open recipient until reload.
    broadcastToUser(targetRecipientId, {
      type: "chat",
      id: result.id,
      senderId: userId,
      recipientId: targetRecipientId,
      content: storedMessage,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof BlockedUserError) {
      return res.status(403).json({ message: "You cannot send messages to this user." });
    }
    console.error(error);
    res.status(500).json({ message: "Failed to send message" });
  }
});

router.patch("/:messageId/read", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const message = await getMessageById(req.params.messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (message.receiverId !== userId) {
      return res.status(403).json({ message: "Can only mark your messages as read" });
    }
    if (message.readAt) return res.json({ id: message.id, readAt: message.readAt });
    const updated = await markMessageRead(req.params.messageId);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to mark as read" });
  }
});

router.patch("/conversation/:conversationId/read-all", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { conversationId } = req.params;
    const { userId1, userId2 } = parseConversationId(conversationId);

    if (userId !== userId1 && userId !== userId2) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updated = await markConversationRead(userId, userId1, userId2);
    res.json({ success: true, updated });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark conversation as read" });
  }
});

router.get("/typing/:conversationId", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { conversationId } = req.params;
    const { userId1, userId2 } = parseConversationId(conversationId);
    if (userId !== userId1 && userId !== userId2) {
      return res.status(403).json({ message: "Not authorized" });
    }
    res.json({ typing: false });
  } catch (error) {
    res.status(500).json({ message: "Failed to get typing status" });
  }
});

router.post("/typing/:conversationId", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { conversationId } = req.params;
    const { userId1, userId2 } = parseConversationId(conversationId);
    if (userId !== userId1 && userId !== userId2) {
      return res.status(403).json({ message: "Not authorized" });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to update typing status" });
  }
});

// ─── Block / unblock ─────────────────────────────────────────────────────────

router.post("/block/:targetUserId", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { targetUserId } = req.params;
    if (targetUserId === userId) {
      return res.status(400).json({ message: "Cannot block yourself" });
    }
    const exists = await assertRecipientExists(targetUserId);
    if (!exists) return res.status(404).json({ message: "User not found" });
    await blockUser(userId, targetUserId);
    res.json({ success: true, blocked: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to block user" });
  }
});

router.delete("/block/:targetUserId", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { targetUserId } = req.params;
    await unblockUser(userId, targetUserId);
    res.json({ success: true, blocked: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to unblock user" });
  }
});

router.get("/block/status/:targetUserId", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { targetUserId } = req.params;
    // Only reveal the caller's OWN block state. Never expose whether the target has
    // blocked the caller — being blocked must stay invisible to the blocked party
    // (anti-escalation design goal; the send path already fails soft on block).
    const blockedByMe = (await getBlockedByUser(userId)).includes(targetUserId);
    res.json({ blockedByMe, blocked: blockedByMe });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to get block status" });
  }
});

// ─── Reporting ────────────────────────────────────────────────────────────────

const reportSchema = z.object({
  reason: z.enum(["spam", "harassment", "inappropriate", "other"]),
  details: z.string().max(1000).optional(),
});

router.post("/report/message/:messageId", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const validation = reportSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ message: validation.error.errors[0]?.message });
    }
    const { reason, details } = validation.data;
    const { messageId } = req.params;

    const message = await getMessageById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    // Only the recipient can report a message they received
    if (message.receiverId !== userId) {
      return res.status(403).json({ message: "Can only report messages sent to you" });
    }
    const result = await reportMessage(userId, message.senderId, messageId, reason, details);
    res.status(201).json({ success: true, reportId: result.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to submit report" });
  }
});

router.post("/report/user/:targetUserId", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const validation = reportSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ message: validation.error.errors[0]?.message });
    }
    const { reason, details } = validation.data;
    const { targetUserId } = req.params;
    if (targetUserId === userId) {
      return res.status(400).json({ message: "Cannot report yourself" });
    }
    const exists = await assertRecipientExists(targetUserId);
    if (!exists) return res.status(404).json({ message: "User not found" });
    const result = await reportUser(userId, targetUserId, reason, details);
    res.status(201).json({ success: true, reportId: result.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to submit report" });
  }
});

export default router;
