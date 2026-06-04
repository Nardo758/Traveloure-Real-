import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { userAndExpertChats, users, notifications, userAndExpertContracts } from "@shared/schema";
import { eq, and, or, desc, sql, isNull, like, ilike } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";

const router = Router();

function getConversationId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join("_");
}

function parseConversationId(conversationId: string): { userId1: string; userId2: string } {
  const separatorIndex = conversationId.indexOf("_");
  if (separatorIndex === -1) return { userId1: conversationId, userId2: "" };
  const userId1 = conversationId.substring(0, separatorIndex);
  const userId2 = conversationId.substring(separatorIndex + 1);
  return { userId1, userId2 };
}

async function getParticipantRole(userId: string): Promise<string> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return user?.role || "traveler";
}

const sendMessageSchema = z.object({
  recipientId: z.string().optional(),
  conversationId: z.string().optional(),
  message: z.string().min(1, "Message cannot be empty"),
  attachment: z.string().url().optional(),
});

router.get("/", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    const partyType = (req.query.party as string)?.toLowerCase(); // Filter by expert, provider, traveler
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const allMessages = await db
      .select()
      .from(userAndExpertChats)
      .where(or(eq(userAndExpertChats.senderId, userId), eq(userAndExpertChats.receiverId, userId)))
      .orderBy(desc(userAndExpertChats.createdAt));

    const conversationMap = new Map<string, any>();
    for (const msg of allMessages) {
      const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!otherId) continue;
      const convId = getConversationId(userId, otherId);
      if (!conversationMap.has(convId)) {
        conversationMap.set(convId, {
          conversationId: convId,
          otherUserId: otherId,
          lastMessage: msg.message,
          lastMessageAt: msg.createdAt,
          isFromMe: msg.senderId === userId,
          unreadCount: 0,
          otherUserRole: undefined, // Will be populated below
        });
      }
      if (msg.receiverId === userId && !msg.readAt) {
        const conv = conversationMap.get(convId);
        conv.unreadCount++;
      }
    }

    let conversations = Array.from(conversationMap.values());
    const userIds = [...new Set(conversations.map((c: any) => c.otherUserId))];

    if (userIds.length > 0) {
      const otherUsers = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl, role: users.role })
        .from(users)
        .where(sql`${users.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);

      const userMap = new Map(otherUsers.map(u => [u.id, u]));
      for (const conv of conversations) {
        const user = userMap.get(conv.otherUserId);
        if (user) {
          conv.otherUser = {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
            role: user.role,
          };
          conv.otherUserRole = user.role;
        }
      }
    }

    // Filter by party type if specified
    if (partyType && ['expert', 'provider', 'traveler'].includes(partyType)) {
      conversations = conversations.filter((c: any) => c.otherUserRole === partyType);
    }

    // Sort by most recent and limit
    conversations.sort((a: any, b: any) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    conversations = conversations.slice(0, limit);

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

    const messages = await db
      .select()
      .from(userAndExpertChats)
      .where(
        or(
          and(eq(userAndExpertChats.senderId, userId1), eq(userAndExpertChats.receiverId, userId2)),
          and(eq(userAndExpertChats.senderId, userId2), eq(userAndExpertChats.receiverId, userId1))
        )
      )
      .orderBy(userAndExpertChats.createdAt);

    const formatted = messages.map(msg => ({
      id: msg.id,
      conversationId,
      message: msg.message,
      attachment: msg.attachment,
      isFromMe: msg.senderId === userId,
      createdAt: msg.createdAt,
      readAt: msg.readAt,
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

router.get("/unread/count", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userAndExpertChats)
      .where(and(eq(userAndExpertChats.receiverId, userId), isNull(userAndExpertChats.readAt)));
    res.json({ count: result?.count || 0 });
  } catch (error) {
    res.status(500).json({ message: "Failed to get unread count" });
  }
});

router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    const { id } = req.params;
    const [message] = await db
      .select()
      .from(userAndExpertChats)
      .where(eq(userAndExpertChats.id, id));
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (message.senderId !== userId && message.receiverId !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }
    res.json({
      id: message.id,
      conversationId: getConversationId(message.senderId, message.receiverId || ""),
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
    if (!validation.success) return res.status(400).json({ message: validation.error.errors[0]?.message });
    const { recipientId, conversationId, message, attachment } = validation.data;

    let targetRecipientId: string;
    if (recipientId) {
      targetRecipientId = recipientId;
    } else if (conversationId) {
      const { userId1, userId2 } = parseConversationId(conversationId);
      if (userId !== userId1 && userId !== userId2) return res.status(403).json({ message: "Not authorized" });
      targetRecipientId = userId === userId1 ? userId2 : userId1;
    } else {
      return res.status(400).json({ message: "recipientId or conversationId required" });
    }

    if (targetRecipientId === userId) return res.status(400).json({ message: "Cannot message yourself" });
    const [recipient] = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, targetRecipientId));
    if (!recipient) return res.status(404).json({ message: "Recipient not found" });

    const trackingNumber = `MSG${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const [newMessage] = await db.insert(userAndExpertChats).values({ senderId: userId, receiverId: targetRecipientId, message, attachment: attachment || null, trackingNumber }).returning();

    const [sender] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId));
    await db.insert(notifications).values({ userId: targetRecipientId, type: "message_received", title: "New message", message: `${[sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || 'Someone'} sent you a message`, relatedId: newMessage.id, relatedType: "message" });

    res.status(201).json({ id: newMessage.id, conversationId: getConversationId(userId, targetRecipientId), message: newMessage.message, isFromMe: true, createdAt: newMessage.createdAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to send message" });
  }
});

router.patch("/:messageId/read", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    const { messageId } = req.params;
    const [message] = await db.select().from(userAndExpertChats).where(eq(userAndExpertChats.id, messageId));
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (message.receiverId !== userId) return res.status(403).json({ message: "Can only mark your messages as read" });
    if (message.readAt) return res.json({ id: message.id, readAt: message.readAt });
    const [updated] = await db.update(userAndExpertChats).set({ readAt: new Date() }).where(eq(userAndExpertChats.id, messageId)).returning();
    res.json({ id: updated.id, readAt: updated.readAt });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark as read" });
  }
});

// Bulk mark all messages in a conversation as read
router.patch("/conversation/:conversationId/read-all", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    const { conversationId } = req.params;
    const { userId1, userId2 } = parseConversationId(conversationId);

    if (userId !== userId1 && userId !== userId2) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const unreadCount = await db.update(userAndExpertChats)
      .set({ readAt: new Date() })
      .where(and(
        eq(userAndExpertChats.receiverId, userId),
        isNull(userAndExpertChats.readAt),
        or(
          and(eq(userAndExpertChats.senderId, userId1), eq(userAndExpertChats.receiverId, userId2)),
          and(eq(userAndExpertChats.senderId, userId2), eq(userAndExpertChats.receiverId, userId1))
        )
      ));

    res.json({ success: true, updated: unreadCount.rowCount });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark conversation as read" });
  }
});

// Search messages across conversations
router.get("/search/query", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    const query = (req.query.q as string)?.trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    if (!query || query.length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }

    const results = await db.select()
      .from(userAndExpertChats)
      .where(and(
        or(eq(userAndExpertChats.senderId, userId), eq(userAndExpertChats.receiverId, userId)),
        ilike(userAndExpertChats.message, `%${query}%`)
      ))
      .orderBy(desc(userAndExpertChats.createdAt))
      .limit(limit);

    const formatted = results.map(msg => ({
      id: msg.id,
      conversationId: getConversationId(msg.senderId, msg.receiverId || ""),
      message: msg.message,
      isFromMe: msg.senderId === userId,
      createdAt: msg.createdAt,
      readAt: msg.readAt,
    }));

    res.json({ results: formatted, count: formatted.length });
  } catch (error) {
    res.status(500).json({ message: "Failed to search messages" });
  }
});

// Get typing indicator status (optimistic - fire & forget)
router.get("/typing/:conversationId", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    const { conversationId } = req.params;
    const { userId1, userId2 } = parseConversationId(conversationId);

    if (userId !== userId1 && userId !== userId2) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // For now, just acknowledge. Real-time typing would need WebSocket.
    res.json({ typing: false });
  } catch (error) {
    res.status(500).json({ message: "Failed to get typing status" });
  }
});

// POST typing indicator (optimistic - for client tracking)
router.post("/typing/:conversationId", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    const { conversationId } = req.params;
    const { userId1, userId2 } = parseConversationId(conversationId);

    if (userId !== userId1 && userId !== userId2) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // TODO: Wire to WebSocket/real-time service when available
    // For now, just acknowledge the client's typing state
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to update typing status" });
  }
});

export default router;
