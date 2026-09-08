import { index, pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
// LAZY, and deliberately so: shared/schema.ts re-exports THIS file, so the import is circular.
// Drizzle's .references() takes a CALLBACK it evaluates when the relation is built, never at
// module-evaluation time, so the binding is initialised by the time it is read. The FK must be
// declared here and not only in migration 290, because the publish-time drizzle push drops
// constraints the schema files do not declare (the deploy-push durability rule).
import { trips } from "../schema";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  userId: varchar("user_id", { length: 255 }),
  /**
   * The plan this AI conversation belongs to (migration 290, ledger
   * `2026-09-08-conversation-trip-id`; CLAUDE.md Locked Decision 45 (1)).
   *
   * Additive NULLABLE, **NO DEFAULT and NO DB CHECK** (the publish-trap posture) and **NO
   * backfill**. **NULL = the conversation belongs to NO plan** — the ordinary pre-mint case, and
   * the honest reading of every thread written before this column existed. A reader says that out
   * loud rather than resolving it to the owner's nearest plan (§13).
   *
   * `ON DELETE SET NULL`: deleting a plan must never delete the conversation that planned it.
   *
   * The FK is declared HERE as well as in migration 290 — see the lazy import at the top of the
   * file for why that is safe across the circular `shared/schema.ts` re-export.
   */
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  // Declared here because the deploy push drops indexes `shared/schema.ts` (and what it re-exports)
  // does not declare, and migration 290 is stamped by then so it would never be recreated.
  index("idx_conversations_trip_id").on(table.tripId),
]);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  // §19: `tripId` is a PAIRING the server verifies against the session user, so it is not admitted
  // by the generic denylist body schema. The pick-based `conversationTripLinkSchema` below is the
  // one admission rail — under an `.omit()` denylist a freshly-added column is client-settable BY
  // DEFAULT, which is exactly the class §19 exists to close.
  tripId: true,
});

/**
 * THE ONE ADMISSION of `conversations.trip_id` from a request body (§19 allowlist, the
 * `itineraryItemEventLinkSchema` precedent for LD 29's `userExperienceId`).
 *
 * `.strict()` so an unknown key is REFUSED rather than silently stripped, and nullable because an
 * explicit `null` is how a caller says "this thread belongs to no plan". Admitting the field proves
 * only that a string arrived — that it names a trip the SESSION USER owns is a separate question,
 * answered server-side by `resolveConversationTripLink`.
 */
export const conversationTripLinkSchema = z
  .object({ tripId: z.string().min(1).nullable().optional() })
  .strict();

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

