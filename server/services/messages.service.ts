import { db } from "../db";
import { userAndExpertChats, users, notifications, userBlocks, messageReports, adminNotifications } from "@shared/schema";
import { eq, and, or, desc, sql, isNull, ilike } from "drizzle-orm";
import {
  matchPublicConversationId,
  toPublicConversationId as toPublicConversationIdImpl,
} from "./conversation-public-id.pure";
import { listConversationContexts } from "./contact-rails.service";
import type { ConversationContextView } from "./contact-rails.pure";

export function buildConversationId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join("_");
}

// ─── PUBLIC CONVERSATION IDS (Locked Decision 40, ledger `2026-09-05-user-id-is-internal`) ────
//
// `buildConversationId` above concatenates the two USER IDS. That string is returned to clients on
// every message and every conversation summary, so the THREAD KEY ITSELF publishes the
// counterpart's `users.id` — a leak no projection over the participant object would ever catch.
//
// `toPublicConversationId` is the client-visible projection: a keyed HMAC over the internal id,
// carrying no user id at all. It is re-exported from here (its implementation is in
// `conversation-public-id.pure.ts`) so callers have ONE import for the messaging vocabulary while
// the projection keeps its proof in an environment with no `DATABASE_URL`.
export { toPublicConversationId, isPublicConversationIdShape } from "./conversation-public-id.pure";

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
  // Locked Decision 40 (ledger `2026-09-05-user-id-is-internal`): the id a client should use. It
  // carries NO user ids. `conversationId` and `otherUserId` above/below are the LEGACY id-shaped
  // fields — deprecated, removed after lane 3 (the client switch); lane 2 strips the ids from
  // public projections. They stay for now so no client breaks in this lane.
  publicId: string;
  // WHAT this thread is about. EMPTY = an older thread with no recorded context, rendered honestly
  // as having none (§13) — never a guessed `storefront`. There is no backfill.
  contexts: ConversationContextView[];
  /** @deprecated — removed after lane 3 (Locked Decision 40); address by handle/service/booking. */
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
        publicId: toPublicConversationIdImpl(convId),
        contexts: [],
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

  const userIds = Array.from(new Set(conversations.map((c) => c.otherUserId)));
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
  const page = conversations.slice(0, limit);

  // Locked Decision 40: every thread carries WHAT it is about. Resolved server-side and labelled
  // server-side — a client must never restate the label, which would be the derivation-drift class
  // §18 rule 1 names. Looked up only for the page actually returned.
  const contextMap = await listConversationContexts(page.map((c) => c.conversationId));
  for (const conv of page) {
    conv.contexts = contextMap.get(conv.conversationId) ?? [];
  }
  return page;
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

export class BlockedUserError extends Error {
  constructor() {
    super("Cannot send message: a block exists between these users");
    this.name = "BlockedUserError";
  }
}
export async function sendMessage(
  senderId: string,
  recipientId: string,
  message: string,
  attachment?: string,
): Promise<MessageDetail> {
  // Block enforcement: refuse delivery in either direction when a block row exists.
  const blocked = await isBlockedBetween(senderId, recipientId);
  if (blocked) throw new BlockedUserError();

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
    // F4 (workstation-flows audit): carry the sender so the notification can deep-link straight
    // into the right chat thread (/chat?clientId=…) instead of the chat lobby.
    data: { clientId: senderId },
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

/**
 * True when at least one message already exists between the pair (either direction).
 * Used to classify a send as continuing an existing conversation vs. cold-contacting
 * a new one, which the messaging rate limiter throttles differently.
 */
export async function hasExistingConversation(userA: string, userB: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userAndExpertChats.id })
    .from(userAndExpertChats)
    .where(
      or(
        and(eq(userAndExpertChats.senderId, userA), eq(userAndExpertChats.receiverId, userB)),
        and(eq(userAndExpertChats.senderId, userB), eq(userAndExpertChats.receiverId, userA)),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Every INTERNAL conversation id the user is a party to.
 *
 * Deliberately a narrow projection (`sender_id`/`receiver_id` only) rather than a call into
 * `getConversationList`: resolving a public id must not depend on the summary payload's shape, its
 * party filter or its 50-row cap — a thread the caller is on must resolve whether or not it is on
 * the first page of their inbox.
 */
export async function listInternalConversationIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ senderId: userAndExpertChats.senderId, receiverId: userAndExpertChats.receiverId })
    .from(userAndExpertChats)
    .where(or(eq(userAndExpertChats.senderId, userId), eq(userAndExpertChats.receiverId, userId)));
  const ids = new Set<string>();
  for (const row of rows) {
    const other = row.senderId === userId ? row.receiverId : row.senderId;
    if (other) ids.add(buildConversationId(userId, other));
  }
  return Array.from(ids);
}

/**
 * Resolve a PUBLIC conversation id for one of its two participants.
 *
 * The walk is over the SESSION USER'S OWN conversations, which is what makes the id meaningless to
 * anyone else: a non-participant holding a perfectly valid public id has no internal id in their own
 * list that projects to it, so they get null. Null is also the answer for a malformed id and for a
 * thread that does not exist — one refusal, so the rail cannot be used as an oracle (§13).
 */
export async function resolvePublicConversationId(
  sessionUserId: string,
  publicId: unknown,
): Promise<{ internalId: string; otherUserId: string } | null> {
  const internalIds = await listInternalConversationIds(sessionUserId);
  const internalId = matchPublicConversationId(publicId, internalIds);
  if (!internalId) return null;
  const { userId1, userId2 } = parseConversationId(internalId);
  const otherUserId = userId1 === sessionUserId ? userId2 : userId1;
  if (!otherUserId || otherUserId === sessionUserId) return null;
  return { internalId, otherUserId };
}

export async function assertRecipientExists(recipientId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, recipientId));
  return !!r;
}

/** Returns true when either party has blocked the other. */
export async function isBlockedBetween(userId1: string, userId2: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, userId1), eq(userBlocks.blockedId, userId2)),
        and(eq(userBlocks.blockerId, userId2), eq(userBlocks.blockedId, userId1)),
      ),
    )
    .limit(1);
  return !!row;
}

export async function reportMessage(
  reporterId: string,
  reportedUserId: string,
  messageId: string,
  reason: string,
  details?: string,
): Promise<{ id: string }> {
  const safeReason: ReportReason = VALID_REASONS.includes(reason as ReportReason)
    ? (reason as ReportReason)
    : "other";
  const [row] = await db
    .insert(messageReports)
    .values({ reporterId, reportedUserId, messageId, reportType: "message", reason: safeReason, details: details ?? null })
    .returning({ id: messageReports.id });
  await notifyAdminsOfReport(row.id, "message", safeReason, reportedUserId);
  return row;
}

/**
 * Surface a new abuse report to admins via admin_notifications — the same
 * channel the lead-routing alerts use, which both the admin notifications
 * page and the daily digest (section A: unread rows) already read. Failure
 * here must never fail the report itself.
 */
async function notifyAdminsOfReport(
  reportId: string,
  reportType: "message" | "user",
  reason: string,
  reportedUserId: string,
): Promise<void> {
  try {
    await db.insert(adminNotifications).values({
      type: "message_report",
      message: `New ${reportType} abuse report (${reason}) — review it in Message Reports`,
      reason,
      metadata: { reportId, reportType, reportedUserId },
    });
  } catch (err: any) {
    console.error("[messages] admin notification for report failed (non-fatal):", err?.message ?? err);
  }
}

type ReportReason = (typeof VALID_REASONS)[number];

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
}

export async function reportUser(
  reporterId: string,
  reportedUserId: string,
  reason: string,
  details?: string,
): Promise<{ id: string }> {
  const safeReason: ReportReason = VALID_REASONS.includes(reason as ReportReason)
    ? (reason as ReportReason)
    : "other";
  const [row] = await db
    .insert(messageReports)
    .values({ reporterId, reportedUserId, messageId: null, reportType: "user", reason: safeReason, details: details ?? null })
    .returning({ id: messageReports.id });
  await notifyAdminsOfReport(row.id, "user", safeReason, reportedUserId);
  return row;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await db
    .insert(userBlocks)
    .values({ blockerId, blockedId })
    .onConflictDoNothing();
}

/** Returns the list of user IDs that `userId` has blocked. */
export async function getBlockedByUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerId, userId));
  return rows.map((r) => r.blockedId);
}

const VALID_REASONS = ["spam", "harassment", "inappropriate", "other"] as const;
