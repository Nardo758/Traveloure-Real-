import { db } from "../../db";
import { conversations, messages } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface IChatStorage {
  getConversation(id: number, userId?: string): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(userId?: string): Promise<(typeof conversations.$inferSelect)[]>;
  /**
   * `tripId` is the LD 45 (1) plan link (migration 290). It arrives ALREADY RESOLVED — the caller
   * has run `resolveConversationTripLink` against the session user — so this writer never verifies
   * ownership itself and never accepts a raw body value. `null`/absent = the conversation belongs
   * to no plan, which is the ordinary pre-mint case and is never guessed (§13).
   */
  createConversation(title: string, userId?: string, tripId?: string | null): Promise<typeof conversations.$inferSelect>;
  renameConversation(id: number, title: string, userId?: string): Promise<typeof conversations.$inferSelect | undefined>;
  deleteConversation(id: number, userId?: string): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<typeof messages.$inferSelect>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number, userId?: string) {
    const conditions = [eq(conversations.id, id)];
    if (userId) conditions.push(eq(conversations.userId, userId));
    const [conversation] = await db.select().from(conversations).where(and(...conditions));
    return conversation;
  },

  async getAllConversations(userId?: string) {
    if (userId) {
      return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.createdAt));
    }
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  },

  async createConversation(title: string, userId?: string, tripId?: string | null) {
    const [conversation] = await db
      .insert(conversations)
      .values({ title, userId, tripId: tripId ?? null })
      .returning();
    return conversation;
  },

  async renameConversation(id: number, title: string, userId?: string) {
    const conversation = await this.getConversation(id, userId);
    if (!conversation) return undefined;
    const [updated] = await db
      .update(conversations)
      .set({ title: title.trim() })
      .where(eq(conversations.id, id))
      .returning();
    return updated;
  },

  async deleteConversation(id: number, userId?: string) {
    const conversation = await this.getConversation(id, userId);
    if (!conversation) return;
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  },

  async getMessagesByConversation(conversationId: number) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  },
};
