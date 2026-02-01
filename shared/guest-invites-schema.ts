import { pgTable, text, varchar, timestamp, boolean, jsonb, decimal, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users } from "./models/auth";
import { userExperiences } from "./schema";

// === GUEST INVITE SYSTEM ===
// Game-changing feature for destination weddings and events
// Allows per-guest personalized travel logistics based on their origin city

export const rsvpStatusEnum = ["pending", "accepted", "declined", "maybe", "no_response"] as const;
export const accommodationPreferenceEnum = ["hotel_block", "own_booking", "with_family", "undecided"] as const;

/**
 * Event Invites Table
 * Stores unique invite links for each guest
 * Each guest gets personalized recommendations based on their origin city
 */
export const eventInvites = pgTable("event_invites", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // Link to the user experience (event) this invite is for
  experienceId: varchar("experience_id").notNull().references(() => userExperiences.id, { onDelete: "cascade" }),
  
  // Event organizer (host)
  organizerId: varchar("organizer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Guest information
  guestEmail: varchar("guest_email", { length: 255 }).notNull(),
  guestName: varchar("guest_name", { length: 255 }),
  guestPhone: varchar("guest_phone", { length: 50 }),
  
  // Unique token for invite link (e.g., /invite/abc123xyz)
  uniqueToken: varchar("unique_token", { length: 100 }).notNull().unique(),
  
  // Guest's city of origin (for personalized travel recommendations)
  originCity: varchar("origin_city", { length: 255 }),
  originState: varchar("origin_state", { length: 100 }),
  originCountry: varchar("origin_country", { length: 100 }),
  originLatitude: decimal("origin_latitude", { precision: 10, scale: 7 }),
  originLongitude: decimal("origin_longitude", { precision: 10, scale: 7 }),
  
  // RSVP details
  rsvpStatus: varchar("rsvp_status", { length: 20 }).default("pending"),
  rsvpDate: timestamp("rsvp_date"),
  numberOfGuests: integer("number_of_guests").default(1), // Including +1s
  
  // Guest preferences
  dietaryRestrictions: jsonb("dietary_restrictions").default([]),
  accommodationPreference: varchar("accommodation_preference", { length: 50 }).default("undecided"),
  transportationNeeded: boolean("transportation_needed").default(false),
  
  // Special notes from guest
  specialRequests: text("special_requests"),
  message: text("message"), // Message to organizer
  
  // Metadata
  inviteSentAt: timestamp("invite_sent_at"),
  inviteViewedAt: timestamp("invite_viewed_at"), // First time guest opened link
  lastViewedAt: timestamp("last_viewed_at"), // Most recent view
  viewCount: integer("view_count").default(0),
  
  // Tracking
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Guest Travel Plans Table
 * Stores personalized travel arrangements for each guest
 * Populated via SERP API queries based on origin city → destination city
 */
export const guestTravelPlans = pgTable("guest_travel_plans", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // Link to invite
  inviteId: varchar("invite_id").notNull().references(() => eventInvites.id, { onDelete: "cascade" }),
  
  // Flight details (from SERP API - Amadeus/Skyscanner)
  selectedFlight: jsonb("selected_flight").default(null),
  flightOptions: jsonb("flight_options").default([]), // Cached flight results
  flightSearchDate: timestamp("flight_search_date"),
  
  // Ground transportation (airport → venue)
  selectedTransport: jsonb("selected_transport").default(null),
  transportOptions: jsonb("transport_options").default([]), // Uber, rental car, shuttle
  transportSearchDate: timestamp("transport_search_date"),
  
  // Accommodation
  selectedAccommodation: jsonb("selected_accommodation").default(null),
  accommodationOptions: jsonb("accommodation_options").default([]), // Hotels near venue
  accommodationSearchDate: timestamp("accommodation_search_date"),
  
  // Local activities (for wedding guests arriving early/staying late)
  selectedActivities: jsonb("selected_activities").default([]),
  activityRecommendations: jsonb("activity_recommendations").default([]),
  activitiesSearchDate: timestamp("activities_search_date"),
  
  // Budget estimate
  estimatedTotalCost: decimal("estimated_total_cost", { precision: 10, scale: 2 }),
  budgetBreakdown: jsonb("budget_breakdown").default({}),
  
  // Travel dates (may differ from event dates)
  arrivalDate: timestamp("arrival_date"),
  departureDate: timestamp("departure_date"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Invite Template Messages
 * Allows organizers to customize invite emails/messages
 */
export const inviteTemplates = pgTable("invite_templates", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // User who created this template
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Template details
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }),
  messageBody: text("message_body").notNull(),
  
  // Template variables: {{guest_name}}, {{event_name}}, {{event_date}}, {{invite_link}}
  variables: jsonb("variables").default([]),
  
  // Default template for specific event type
  eventType: varchar("event_type", { length: 50 }),
  isDefault: boolean("is_default").default(false),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Invite Send Log
 * Tracks when invites are sent (email/SMS)
 */
export const inviteSendLog = pgTable("invite_send_log", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  inviteId: varchar("invite_id").notNull().references(() => eventInvites.id, { onDelete: "cascade" }),
  
  // Send method
  method: varchar("method", { length: 20 }).notNull(), // email, sms, whatsapp
  recipientAddress: varchar("recipient_address", { length: 255 }).notNull(),
  
  // Send status
  status: varchar("status", { length: 20 }).notNull(), // sent, failed, bounced, opened, clicked
  errorMessage: text("error_message"),
  
  // Tracking
  sentAt: timestamp("sent_at").defaultNow(),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
});

// === RELATIONS ===

export const eventInvitesRelations = relations(eventInvites, ({ one, many }) => ({
  experience: one(userExperiences, {
    fields: [eventInvites.experienceId],
    references: [userExperiences.id],
  }),
  organizer: one(users, {
    fields: [eventInvites.organizerId],
    references: [users.id],
  }),
  travelPlans: one(guestTravelPlans),
  sendLog: many(inviteSendLog),
}));

export const guestTravelPlansRelations = relations(guestTravelPlans, ({ one }) => ({
  invite: one(eventInvites, {
    fields: [guestTravelPlans.inviteId],
    references: [eventInvites.id],
  }),
}));

export const inviteTemplatesRelations = relations(inviteTemplates, ({ one }) => ({
  user: one(users, {
    fields: [inviteTemplates.userId],
    references: [users.id],
  }),
}));

export const inviteSendLogRelations = relations(inviteSendLog, ({ one }) => ({
  invite: one(eventInvites, {
    fields: [inviteSendLog.inviteId],
    references: [eventInvites.id],
  }),
}));

// === SCHEMAS ===

export const insertEventInviteSchema = createInsertSchema(eventInvites).omit({
  id: true,
  uniqueToken: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGuestTravelPlanSchema = createInsertSchema(guestTravelPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInviteTemplateSchema = createInsertSchema(inviteTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInviteSendLogSchema = createInsertSchema(inviteSendLog).omit({
  id: true,
  sentAt: true,
});

// === TYPES ===

export type EventInvite = typeof eventInvites.$inferSelect;
export type InsertEventInvite = z.infer<typeof insertEventInviteSchema>;

export type GuestTravelPlan = typeof guestTravelPlans.$inferSelect;
export type InsertGuestTravelPlan = z.infer<typeof insertGuestTravelPlanSchema>;

export type InviteTemplate = typeof inviteTemplates.$inferSelect;
export type InsertInviteTemplate = z.infer<typeof insertInviteTemplateSchema>;

export type InviteSendLog = typeof inviteSendLog.$inferSelect;
export type InsertInviteSendLog = z.infer<typeof insertInviteSendLogSchema>;
