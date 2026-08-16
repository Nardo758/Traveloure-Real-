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

const sendMessageSchema = z.object({
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
    if (recipientId) {
      targetRecipientId = recipientId;
    } else if (conversationId) {
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
