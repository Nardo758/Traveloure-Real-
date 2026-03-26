import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { userAndExpertChats, users, notifications } from "@shared/schema";
import { eq, and, or, desc, sql, isNull } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";

const router = Router();

function getConversationId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join("_");
}

function parseConversationId(conversationId: string): { userId1: string; userId2: string } {
  const [userId1, userId2] = conversationId.split("_");
  return { userId1, userId2 };
}

const sendMessageSchema = z.object({
  recipientId: z.string().optional(),
  conversationId: z.string().optional(),
  message: z.string().min(1, "Message cannot be empty"),
  attachment: z.string().url().optional(),
});

router.get("/", isAuthenticated, async (req, res) => {
  res.redirect(307, "/api/messages/conversations");
});

router.get("/conversations", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;

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
        });
      }
      if (msg.receiverId === userId && !msg.readAt) {
        const conv = conversationMap.get(convId);
        conv.unreadCount++;
      }
    }

    const conversations = Array.from(conversationMap.values());
    const userIds = [...new Set(conversations.map((c: any) => c.otherUserId))];

    if (userIds.length > 0) {
      const otherUsers = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImage: users.profileImage, role: users.role })
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
            profileImage: user.profileImage,
            role: user.role,
          };
        }
      }
    }

    res.json(conversations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load conversations" });
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

export default router;
