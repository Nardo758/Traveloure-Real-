import { db } from "../db";
import { userAndExpertChats, users, notifications } from "@shared/schema";
import { eq, and, or, desc, sql, isNull, ilike } from "drizzle-orm";

export function buildConversationId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join("_");
}

export function parseConversationId(conversationId: string): { userId1: string; userId2: string } {
  const sep = conversationId.indexOf("_");
  if (sep === -1) return { userId1: conversationId, userId2: "" };
  return {
    userId1: conversationId.substring(0, sep),
    userId2: conversationId.substring(sep + 1),
  };
}

export interface ConversationSummary {
  conversationId: string;
  otherUserId: string;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  isFromMe: boolean;
  unreadCount: number;
  otherUserRole?: string;
  otherUser?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    role: string | null;
  };
}

export interface MessageDetail {
  id: string;
  conversationId: string;
  message: string | null;
  attachment: string | null;
  isFromMe: boolean;
  createdAt: Date | null;
  readAt: Date | null;
}

export async function getConversationList(
  userId: string,
  partyType?: string,
  limit = 50,
): Promise<ConversationSummary[]> {
  const allMessages = await db
    .select()
    .from(userAndExpertChats)
    .where(or(eq(userAndExpertChats.senderId, userId), eq(userAndExpertChats.receiverId, userId)))
    .orderBy(desc(userAndExpertChats.createdAt));

  const conversationMap = new Map<string, ConversationSummary>();
  for (const msg of allMessages) {
    const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId;
    if (!otherId) continue;
    const convId = buildConversationId(userId, otherId);
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
      conversationMap.get(convId)!.unreadCount++;
    }
  }

  let conversations = Array.from(conversationMap.values());

  const userIds = [...new Set(conversations.map((c) => c.otherUserId))];
  if (userIds.length > 0) {
    const otherUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
      })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`);

    const userMap = new Map(otherUsers.map((u) => [u.id, u]));
    for (const conv of conversations) {
      const u = userMap.get(conv.otherUserId);
      if (u) {
        conv.otherUser = u;
        conv.otherUserRole = u.role ?? undefined;
      }
    }
  }

  if (partyType && ["expert", "provider", "traveler"].includes(partyType)) {
    conversations = conversations.filter((c) => c.otherUserRole === partyType);
  }

  conversations.sort(
    (a, b) => new Date(b.lastMessageAt!).getTime() - new Date(a.lastMessageAt!).getTime(),
  );
  return conversations.slice(0, limit);
}

export async function getConversationMessages(
  userId1: string,
  userId2: string,
  viewerUserId: string,
): Promise<MessageDetail[]> {
  const messages = await db
    .select()
    .from(userAndExpertChats)
    .where(
      or(
        and(eq(userAndExpertChats.senderId, userId1), eq(userAndExpertChats.receiverId, userId2)),
        and(eq(userAndExpertChats.senderId, userId2), eq(userAndExpertChats.receiverId, userId1)),
      ),
    )
    .orderBy(userAndExpertChats.createdAt);

  const convId = buildConversationId(userId1, userId2);
  return messages.map((msg) => ({
    id: msg.id,
    conversationId: convId,
    message: msg.message,
    attachment: msg.attachment,
    isFromMe: msg.senderId === viewerUserId,
    createdAt: msg.createdAt,
    readAt: msg.readAt,
  }));
}

export async function getUnreadMessageCount(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userAndExpertChats)
    .where(and(eq(userAndExpertChats.receiverId, userId), isNull(userAndExpertChats.readAt)));
  return result?.count ?? 0;
}

export async function getMessageById(id: string): Promise<typeof userAndExpertChats.$inferSelect | null> {
  const [msg] = await db.select().from(userAndExpertChats).where(eq(userAndExpertChats.id, id));
  return msg ?? null;
}

export async function sendMessage(
  senderId: string,
  recipientId: string,
  message: string,
  attachment?: string,
): Promise<MessageDetail> {
  const trackingNumber = `MSG${Date.now().toString(36).toUpperCase()}${Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase()}`;

  const [newMessage] = await db
    .insert(userAndExpertChats)
    .values({ senderId, receiverId: recipientId, message, attachment: attachment ?? null, trackingNumber })
    .returning();

  const [sender] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, senderId));

  const senderName =
    [sender?.firstName, sender?.lastName].filter(Boolean).join(" ") || "Someone";

  await db.insert(notifications).values({
    userId: recipientId,
    type: "message_received",
    title: "New message",
    message: `${senderName} sent you a message`,
    relatedId: newMessage.id,
    relatedType: "message",
  });

  return {
    id: newMessage.id,
    conversationId: buildConversationId(senderId, recipientId),
    message: newMessage.message,
    attachment: newMessage.attachment,
    isFromMe: true,
    createdAt: newMessage.createdAt,
    readAt: newMessage.readAt,
  };
}

export async function markMessageRead(
  messageId: string,
): Promise<{ id: string; readAt: Date | null }> {
  const [updated] = await db
    .update(userAndExpertChats)
    .set({ readAt: new Date() })
    .where(eq(userAndExpertChats.id, messageId))
    .returning();
  return { id: updated.id, readAt: updated.readAt };
}

export async function markConversationRead(
  userId: string,
  userId1: string,
  userId2: string,
): Promise<number> {
  const result = await db
    .update(userAndExpertChats)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(userAndExpertChats.receiverId, userId),
        isNull(userAndExpertChats.readAt),
        or(
          and(eq(userAndExpertChats.senderId, userId1), eq(userAndExpertChats.receiverId, userId2)),
          and(eq(userAndExpertChats.senderId, userId2), eq(userAndExpertChats.receiverId, userId1)),
        ),
      ),
    );
  return result.rowCount ?? 0;
}

export async function searchMessages(
  userId: string,
  query: string,
  limit = 20,
): Promise<MessageDetail[]> {
  const results = await db
    .select()
    .from(userAndExpertChats)
    .where(
      and(
        or(eq(userAndExpertChats.senderId, userId), eq(userAndExpertChats.receiverId, userId)),
        ilike(userAndExpertChats.message, `%${query}%`),
      ),
    )
    .orderBy(desc(userAndExpertChats.createdAt))
    .limit(limit);

  return results.map((msg) => ({
    id: msg.id,
    conversationId: buildConversationId(msg.senderId, msg.receiverId ?? ""),
    message: msg.message,
    attachment: msg.attachment,
    isFromMe: msg.senderId === userId,
    createdAt: msg.createdAt,
    readAt: msg.readAt,
  }));
}

export async function getUserRole(userId: string): Promise<string> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return user?.role ?? "traveler";
}

export async function assertRecipientExists(recipientId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, recipientId));
  return !!r;
}
