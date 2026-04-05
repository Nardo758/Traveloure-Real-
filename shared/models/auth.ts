import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, boolean } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User role enum
// - user: Regular traveler
// - travel_expert: Share destination knowledge, create itineraries
// - local_expert: Guide travelers through your city
// - event_planner: Plan weddings, proposals, celebrations
// - service_provider: Hotels, restaurants, tours, experiences
// - executive_assistant: Manage travel for high-net-worth clients
// - expert: Legacy role (maps to travel_expert)
// - admin: Platform administration
export const userRoleEnum = [
  "user",
  "travel_expert",
  "local_expert", 
  "event_planner",
  "service_provider",
  "executive_assistant",
  "expert", // Legacy - kept for backwards compatibility
  "admin"
] as const;

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  password: varchar("password", { length: 255 }), // Hashed password for email/password auth
  emailVerified: timestamp("email_verified"), // When email was verified (null = not verified)
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 30 }).default("user"),
  bio: varchar("bio", { length: 500 }),
  specialties: jsonb("specialties").default([]),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  privacyAcceptedAt: timestamp("privacy_accepted_at"),
  termsVersion: varchar("terms_version", { length: 20 }),
  privacyVersion: varchar("privacy_version", { length: 20 }),
  instagramUserId: varchar("instagram_user_id"),
  instagramAccessToken: varchar("instagram_access_token", { length: 512 }),
  authProvider: varchar("auth_provider", { length: 20 }).default("email"), // email, replit, google, etc.
  suspended: boolean("suspended").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
