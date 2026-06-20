import { sql } from "drizzle-orm";
import { boolean, decimal, index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

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
  // Per-expert commission override (EXP-OVR.P1) — expert keeps this %; platform takes 100-x%.
  // NULL = use booking_fee_configs category default. Honors §6.9 beta-recruitment terms.
  // Resolved server-side in commission.ts:resolveCommissionRates before the category lookup.
  commissionOverrideExpertSharePercent: decimal("commission_override_expert_share_percent", { precision: 5, scale: 2 }),
  // Listing Engine publish-gate (Step 1). Admins flip providerVerificationStatus to "verified"
  // and backgroundCheckConfirmed to true after manual review. Until then any category with
  // requiresBackgroundCheck=true or insuranceBand >= 2 blocks publish and returns HTTP 422.
  providerVerificationStatus: varchar("provider_verification_status", { length: 20 }).default("pending"),
  backgroundCheckConfirmed: boolean("background_check_confirmed").default(false),
  // Multi-currency: user's preferred display/charge currency
  preferredCurrency: varchar("preferred_currency", { length: 3 }).default("USD"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("users_role_idx").on(table.role),
]);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// LB-P1: Token-based password reset.
// Raw token never stored — only its sha256 hash. Single-use (markedUsedAt) + TTL.
// Lookups go by tokenHash, not token, so a DB leak can't be used to reset accounts.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_password_reset_user").on(table.userId)],
);

// Email verification on signup. Same shape as password_reset_tokens — single-use,
// TTL, sha256 hash only. Sent automatically on register; resend-link from the UI
// targets POST /api/auth/send-verification.
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_email_verification_user").on(table.userId)],
);
