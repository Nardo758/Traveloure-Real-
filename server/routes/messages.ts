import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
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
} from "../services/messages.service";

const router = Router();

const sendMessageSchema = z.object({
  recipientId: z.string().optional(),
  conversationId: z.string().optional(),
  message: z.string().min(1, "Message cannot be empty"),
  attachment: z.string().url().optional(),
});

router.get("/", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
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
    const userId = (req as any).user?.claims?.sub;
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
    const userId = (req as any).user?.claims?.sub;
    const count = await getUnreadMessageCount(userId);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: "Failed to get unread count" });
  }
});

router.get("/search/query", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
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
    const userId = (req as any).user?.claims?.sub;
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
    const userId = (req as any).user?.claims?.sub;
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

    const result = await sendMessage(userId, targetRecipientId, message, attachment);
    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to send message" });
  }
});

router.patch("/:messageId/read", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
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
    const userId = (req as any).user?.claims?.sub;
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
    const userId = (req as any).user?.claims?.sub;
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
    const userId = (req as any).user?.claims?.sub;
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

export default router;
