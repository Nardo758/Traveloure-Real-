import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, decimal, date, pgEnum, unique, uniqueIndex, index, doublePrecision, uuid, serial, time, primaryKey, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";
import { users } from "./models/auth";

// Re-export auth models
export * from "./models/auth";
export * from "./models/chat";

// === Enums ===
// §13 (CLAUDE.md): DEAD FIELD — trips.status (below) is write-once at creation (born draft/
// planning depending on the create path) and no code path ever advances it to confirmed/
// completed/cancelled. DO NOT READ this column for trip phase/lifecycle — every renderer derives
// phase from startDate/endDate vs now instead (see client/src/pages/my-trips.tsx). DO NOT WRITE
// new transitions into it either — see docs/briefs/L3-trips-status-brief.md (Option B, ratified
// Jul 31, 2026) for the full record and the named future owner (the Phase 4 convert-to-ready-made
// brief) if a real trip lifecycle is ever needed.
export const tripStatusEnum = ["draft", "planning", "confirmed", "completed", "cancelled"] as const;
export const expertAdvisorStatusEnum = ["pending", "accepted", "rejected"] as const;
export const itineraryStatusEnum = ["pending", "generated", "failed"] as const;
export const platformEnum = ["hotel", "car", "flight"] as const;
export const feedbackStatusEnum = ["pending", "accepted", "rejected"] as const;
export const eventTypeEnum = ["vacation", "wedding", "honeymoon", "proposal", "anniversary", "birthday", "corporate", "adventure", "cultural", "other"] as const;
export const vendorStatusEnum = ["active", "inactive", "pending_approval"] as const;
export const vendorAssignmentStatusEnum = ["pending", "confirmed", "completed", "cancelled"] as const;
export const applicationStatusEnum = ["pending", "approved", "rejected", "deleted"] as const;
export const serviceFormStatusEnum = ["pending", "approved", "rejected"] as const;

// Logistics enums
export const temporalAnchorTypeEnum = [
  "flight_arrival", "flight_departure", "hotel_checkin", "hotel_checkout",
  "pre_booked_tour", "ceremony_time", "rehearsal_time", "proposal_moment",
  "meeting_time", "hair_makeup_start", "reception_start", "photographer_arrival",
  "dinner_reservation", "custom"
] as const;
export const energyTypeEnum = ["physical", "mental", "social", "mixed"] as const;
export const peakTimingEnum = ["morning", "afternoon", "evening", "night", "flexible"] as const;
export const attendanceRequirementEnum = ["all", "subset", "optional"] as const;

// Per-item routing state (migration 159; Trip-Canon Lane 1 W1, docs/briefs/ROUTING_STATE_CONTRACT.md).
// Exclusive per item, mixed per trip. The canonical value set lives HERE, not in a DB CHECK — the
// column is a plain varchar (the pre-109 delivery-method posture) so the publish-time drizzle push
// has no CHECK to enforce against un-remapped rows. Transitions are contract-gated in code.
export const ROUTING_STATUSES = ["in_planning", "with_expert", "ready_for_checkout", "purchased"] as const;
export type RoutingStatus = (typeof ROUTING_STATUSES)[number];

// Plan-approval handshake on trip_expert_advisors (migration 164; QA_PUNCH_LIST W2-A, item 13
// ratified Aug 1 2026). NULL = no decision yet (the honest pre-feature/pre-delivery state). Same
// pre-109 posture as ROUTING_STATUSES above: plain varchar, canonical set lives HERE not in a DB
// CHECK, so the publish-time drizzle push has no CHECK to enforce against un-remapped rows.
export const PLAN_APPROVAL_STATUSES = ["approved", "changes_requested"] as const;
export type PlanApprovalStatus = (typeof PLAN_APPROVAL_STATUSES)[number];

// === Tables ===

export const touristPlacesSearches = pgTable("tourist_places_searches", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  search: text("search").notNull(),
});

export const touristPlaceResults = pgTable("tourist_place_results", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  searchId: varchar("search_id").notNull().references(() => touristPlacesSearches.id, { onDelete: "cascade" }),
  country: varchar("country", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  place: varchar("place", { length: 200 }).notNull(),
  description: text("description").notNull(),
  activities: jsonb("activities").notNull(),
  festivals: jsonb("festivals").notNull(),
  latitude: varchar("latitude", { length: 200 }),
  longitude: varchar("longitude", { length: 200 }),
  category: varchar("category", { length: 200 }).notNull(),
  bestMonths: varchar("best_months", { length: 100 }).notNull(),
  imageUrl: jsonb("image_url").default([]),
});

export const touristPlaceCategory = pgTable("tourist_place_category", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 100 }).unique().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trips = pgTable("trips", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  title: varchar("title", { length: 255 }).default("My Trip"),
  eventType: varchar("event_type", { length: 30 }).default("vacation"), // Enum: eventTypeEnum
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  destination: varchar("destination", { length: 255 }).notNull(),
  // §13: DEAD FIELD — write-once at creation, nothing ever advances it past its born draft/
  // planning value. DO NOT READ for trip phase (derive from startDate/endDate vs now instead —
  // see client/src/pages/my-trips.tsx); DO NOT add new writers. See tripStatusEnum above and
  // docs/briefs/L3-trips-status-brief.md (Option B, ratified Jul 31, 2026).
  status: varchar("status", { length: 20 }).default("draft").notNull(), // Enum: tripStatusEnum
  numberOfTravelers: integer("number_of_travelers").default(1),
  adults: integer("adults").default(2),
  kids: integer("kids").default(0),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  preferences: jsonb("preferences").default({}),
  eventDetails: jsonb("event_details").default({}),
  experienceType: varchar("experience_type", { length: 20 }),
  travelers: integer("travelers"),
  specialRequests: text("special_requests"),
  expertId: varchar("expert_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
  // PRIVATE Workstation build notes (PATCH /api/trips/:id/expert-notes) — never delivered to the
  // traveler. The traveler-facing trip-level note is expertTravelerNote below (§21) — never merge.
  expertNotes: text("expert_notes"),
  // Traveler-facing trip-level "Expert Notes" (§21, migration 187) — one delivery note shown at
  // the top of the delivered plan ("from your expert").
  expertTravelerNote: text("expert_traveler_note"),
  expertModifiedAt: timestamp("expert_modified_at"),
  // Master Integration Brief — Phase 3.
  // primaryExpertId: neighborhood-lead expert assigned to this trip. Distinct
  // from expertId (the generic handler). Set when the upsell engine routes a
  // trip to the lead of the trip's primary neighborhood.
  // neighborhoodIds: derived from itinerary items at write time; powers the
  // upsell engine's neighborhood-context branch (Phase 5).
  primaryExpertId: varchar("primary_expert_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
  neighborhoodIds: text("neighborhood_ids").array(),
  bookingReference: varchar("booking_reference", { length: 50 }),
  isPublic: boolean("is_public").default(false),
  shareToken: varchar("share_token", { length: 64 }),
  // EA delegation: when an EA coordinates this trip on behalf of the client.
  // userId remains the traveler; managedByEaId is the EA running the show.
  managedByEaId: varchar("managed_by_ea_id").references(() => users.id, { onDelete: "set null" }),
  eaClientRelationshipId: varchar("ea_client_relationship_id"),
  // Ready-made authoring mode (migration 133): the expert who AUTHORS this trip as a speculative
  // ready-made listing. Authoring trips have userId = NULL (traveler-surface exclusion by
  // construction) + authorId = the expert. NULL for every normal traveler trip. Auth path:
  // assignment OR (authorId IS NOT NULL AND authorId === caller) — never via getTripRole.
  authorId: varchar("author_id").references(() => users.id, { onDelete: "set null" }),
  // Console Realign R-F (migration 173): NULL = never finalized (born state, no backfill). Set by
  // POST /api/trips/:tripId/finalize, cleared by POST /api/trips/:tripId/reopen. NOT a revival of
  // the dead `status` field above — a narrow rendering-handover signal consumed only by
  // shared/trip-primary-surface.ts's `tripCardIsPrimary` OR-branch, never a lifecycle/status value.
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const generatedItineraries = pgTable("generated_itineraries", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  itineraryData: jsonb("itinerary_data").default({}),
  status: varchar("status", { length: 20 }).default("pending"), // Enum: itineraryStatusEnum
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tripExpertAdvisors = pgTable("trip_expert_advisors", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  localExpertId: varchar("local_expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).default("pending"), // Enum: expertAdvisorStatusEnum
  workspaceStatus: varchar("workspace_status", { length: 20 }).default("draft"), // draft | in_review | delivered
  message: text("message"),
  expertResponse: text("expert_response"),
  assignedAt: timestamp("assigned_at").defaultNow(),
  // Plan-approval handshake (migration 164). NULL = no customer decision yet. Set only once the
  // advisor row is `delivered` (server-enforced at the decision endpoint, not here). See
  // PLAN_APPROVAL_STATUSES above for the canonical value set.
  planApprovalStatus: varchar("plan_approval_status", { length: 20 }),
  planApprovedAt: timestamp("plan_approved_at"),
  planReviewNote: text("plan_review_note"),
}, (table) => ({
  uniqueTripExpert: uniqueIndex("trip_expert_advisors_trip_expert_unique").on(table.tripId, table.localExpertId),
}));

export const tripSuggestions = pgTable("trip_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // activity | transport | venue | note
  dayNumber: integer("day_number"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | approved | rejected
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export type TripSuggestion = typeof tripSuggestions.$inferSelect;
export type InsertTripSuggestion = typeof tripSuggestions.$inferInsert;

// === Per-item plan comments (migration 165, QA_PUNCH_LIST W3-C item 12) ===
// The communication half of the delivery loop: "can we do this earlier?" lives on the item,
// not in detached chat. Declared here (deploy-push durability rule) even though the FK targets
// (trips/itineraryItems/users) are declared elsewhere in this file — the `() => x.id` callback
// form Drizzle uses for references is resolved lazily, so declaration order doesn't matter.
export const tripItemComments = pgTable("trip_item_comments", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  itemId: varchar("item_id").notNull().references(() => itineraryItems.id, { onDelete: "cascade" }),
  authorId: varchar("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TripItemComment = typeof tripItemComments.$inferSelect;
export type InsertTripItemComment = typeof tripItemComments.$inferInsert;

export const reviewRatings = pgTable("review_ratings", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  localExpertId: varchar("local_expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewerId: varchar("reviewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  review: text("review").notNull(),
  rating: integer("rating").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const expertUpdatedItineraries = pgTable("expert_updated_itineraries", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  shareToken: varchar("share_token"),
  itineraryData: jsonb("itinerary_data").default({}),
  message: text("message"),
  status: varchar("status", { length: 20 }).default("pending"),
  createdById: varchar("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const touristPreferences = pgTable("tourist_preferences", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  preferenceId: varchar("preference_id").notNull().references(() => touristPlaceResults.id, { onDelete: "cascade" }),
});

export const touristHelpMeGuideActivities = pgTable("tourist_help_me_guide_activities", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  location: text("location").notNull(),
  activity: text("activity").notNull(),
});

export const touristHelpMeGuideEvents = pgTable("tourist_help_me_guide_events", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  location: text("location").notNull(),
  event: jsonb("event").notNull(),
});

export const helpGuideTrips = pgTable("help_guide_trips", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  country: varchar("country", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  highlights: text("highlights").notNull(),
  days: integer("days").notNull(),
  nights: integer("nights").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  oldPrice: decimal("old_price", { precision: 10, scale: 2 }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  inclusive: text("inclusive").notNull(),
  exclusive: text("exclusive").notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

// =============================================================
// EVENTS MODEL — Canonical Source of Truth
// See EVENTS_MODEL.md for the full ownership map.
//
// CANONICAL TABLE:  destination_events
//   • Single source of truth for user-facing event display
//   • All Events-view queries read exclusively from this table
//   • sourceType + sourceId columns prevent duplicate inserts
//
// INTEGRATION CACHES (write into destination_events):
//   • fever_event_cache      — Fever API (24 h TTL); write path via fever-cache.service.ts
//   • travel_pulse_calendar_events — AI impact intelligence; write path via travelpulse.service.ts
//
// CONTEXT-SPECIFIC (separate namespaces, NOT part of the event calendar):
//   • live_events                   — tourist search result cache
//   • tourist_help_me_guide_events  — Help Me Guide user flow
//   • ea_events                     — Executive Assistant module
// =============================================================

export const liveEvents = pgTable("live_events", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  searchId: varchar("search_id").notNull().references(() => touristPlacesSearches.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  startDate: varchar("start_date", { length: 100 }),
  address: text("address"),
  link: text("link"),
  imageUrl: text("image_url"),
});

export const tripSelectedPlaces = pgTable("trip_selected_places", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  placeId: varchar("place_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  address: varchar("address", { length: 255 }),
  rating: decimal("rating"),
  imageUrl: varchar("image_url", { length: 1000 }),
  websiteUrl: varchar("website_url", { length: 1000 }),
  metadata: jsonb("metadata").default({}),
});

export const tripSelectedHotels = pgTable("trip_selected_hotels", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  hotelId: varchar("hotel_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  address: varchar("address", { length: 255 }),
  rating: decimal("rating"),
  priceRange: varchar("price_range", { length: 50 }),
  imageUrl: varchar("image_url", { length: 1000 }),
  websiteUrl: varchar("website_url", { length: 1000 }),
  metadata: jsonb("metadata").default({}),
});

export const tripSelectedServices = pgTable("trip_selected_services", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  serviceType: varchar("service_type", { length: 50 }).notNull(),
  priceRange: varchar("price_range", { length: 50 }),
  imageUrl: varchar("image_url", { length: 1000 }),
  websiteUrl: varchar("website_url", { length: 1000 }),
  metadata: jsonb("metadata").default({}),
});

export const tripOtherServices = pgTable("trip_other_services", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  otherService: jsonb("other_service").default({}),
});

export const tripSelectedFlights = pgTable("trip_selected_flights", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  flightId: varchar("flight_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  origin: varchar("origin", { length: 255 }),
  destination: varchar("destination", { length: 255 }),
  departureDate: date("departure_date"),
  returnDate: date("return_date"),
  priceRange: varchar("price_range", { length: 50 }),
  imageUrl: varchar("image_url", { length: 1000 }),
  websiteUrl: varchar("website_url", { length: 1000 }),
  metadata: jsonb("metadata").default({}),
});

export const affiliateTrips = pgTable("affiliate_trips", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  placeData: jsonb("place_data").default([]),
  hotelData: jsonb("hotel_data").default([]),
  serviceData: jsonb("service_data").default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const affiliatePlatforms = pgTable("affiliate_platforms", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: varchar("title", { length: 100 }).notNull(),
  imageUrl: text("image_url").notNull(),
  platform: varchar("platform", { length: 10 }).notNull(), // Enum: platformEnum
  baseUrl: text("base_url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Local Expert & Service Provider Applications ===

// Expert type enum for application forms
export const expertTypeEnum = ["travel_expert", "local_expert", "event_planner", "executive_assistant"] as const;

export const localExpertForms = pgTable("local_expert_forms", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Expert Type (travel_expert, local_expert, event_planner, executive_assistant)
  expertType: varchar("expert_type", { length: 30 }).default("travel_expert"),
  // Basic Info
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  country: varchar("country", { length: 100 }),
  city: varchar("city", { length: 100 }),
  // Public-facing display fields (migration 204) — edited from the expert profile editor.
  displayName: varchar("display_name", { length: 100 }),
  headline: varchar("headline", { length: 150 }),
  // Expertise
  destinations: jsonb("destinations").default([]),
  specialties: jsonb("specialties").default([]),
  languages: jsonb("languages").default([]),
  experienceTypes: jsonb("experience_types").default([]),
  specializations: jsonb("specializations").default([]),
  selectedServices: jsonb("selected_services").default([]),
  // Local Expert specific fields
  neighborhoods: jsonb("neighborhoods").default([]),
  localityProof: varchar("locality_proof", { length: 30 }),
  knowledgeProofAnswers: jsonb("knowledge_proof_answers").default([]),
  // Kyoto Knowledge-Bar scored expertise gate (migration 114): AI-scored rubric result over the
  // knowledge-proof answers ({ overall, verdict, perAnswer:[{dimensions, score, feedback}], market,
  // model }). ADVISORY in v1 — surfaced to admin as decision support, does not auto-gate approval.
  knowledgeScore: jsonb("knowledge_score"),
  knowledgeScoredAt: timestamp("knowledge_scored_at"),
  localSpecialties: jsonb("local_specialties").default([]),
  // Experience
  yearsOfExperience: varchar("years_of_experience", { length: 50 }),
  bio: text("bio"),
  portfolio: text("portfolio"),
  certifications: text("certifications"),
  // Availability
  availability: varchar("availability", { length: 50 }),
  responseTime: varchar("response_time", { length: 50 }),
  hourlyRate: varchar("hourly_rate", { length: 50 }), // money-derive-ok: a free-text DISPLAY string the applicant writes about themselves (seeded values look like "$80-150/hour"), not a fraction and not a platform take. No server code reads it into any fee, amount or payout decision — verified repo-wide (ruling 42 class sweep). Name-matched by the rate-bearing guard; adjudicated not-a-rate.
  // Legacy fields (keeping for compatibility)
  yearsInCity: integer("years_in_city").default(0),
  offerService: boolean("offer_service").default(false),
  govId: text("gov_id"),
  travelLicence: text("travel_licence"),
  instagramLink: text("instagram_link"),
  facebookLink: text("facebook_link"),
  linkedinLink: text("linkedin_link"),
  services: jsonb("services").default([]),
  serviceAvailability: integer("service_availability").default(15),
  priceExpectation: integer("price_expectation").default(0),
  shortBio: text("short_bio"),
  confirmAge: boolean("confirm_age").default(false),
  termsAndConditions: boolean("terms_and_conditions").default(false),
  partnership: boolean("partnership").default(false),
  // Influencer fields
  isInfluencer: boolean("is_influencer").default(false),
  socialFollowers: jsonb("social_followers").default({}), // {"instagram": 50000, "tiktok": 100000, "youtube": 25000}
  verifiedInfluencer: boolean("verified_influencer").default(false),
  influencerTier: varchar("influencer_tier", { length: 20 }), // nano, micro, mid, macro, mega
  expertNotesStyle: text("expert_notes_style"),
  referralCode: varchar("referral_code", { length: 50 }).unique(),
  tiktokLink: text("tiktok_link"),
  youtubeLink: text("youtube_link"),
  canBookOnBehalf: boolean("can_book_on_behalf").default(false),
  isPersonalAssistant: boolean("is_personal_assistant").default(false),
  paAccessGrantedAt: timestamp("pa_access_granted_at"),
  paAccessGrantedBy: varchar("pa_access_granted_by", { length: 255 }),
  bookingFeeType: varchar("booking_fee_type", { length: 20 }),
  bookingFeePercentage: decimal("booking_fee_percentage"),
  bookingFeeFixed: decimal("booking_fee_fixed"),
  bookingFeeHourly: decimal("booking_fee_hourly"),
  minBookingFee: decimal("min_booking_fee"),
  stripeAccountId: varchar("stripe_account_id", { length: 255 }),
  stripeAccountStatus: varchar("stripe_account_status", { length: 50 }),
  canReceivePayments: boolean("can_receive_payments").default(false),
  totalEarnings: decimal("total_earnings").default("0"),
  pendingPayout: decimal("pending_payout").default("0"),
  totalHandoffs: integer("total_handoffs").default(0),
  completedHandoffs: integer("completed_handoffs").default(0),
  totalBookingsAssisted: integer("total_bookings_assisted").default(0),
  handoffResponseTimeHours: integer("handoff_response_time_hours"),
  maxConcurrentHandoffs: integer("max_concurrent_handoffs").default(5),
  acceptsNewHandoffs: boolean("accepts_new_handoffs").default(true),
  feeSettings: jsonb("fee_settings").default({}),
  payoutSchedule: varchar("payout_schedule", { length: 20 }),
  identityVerificationSessionId: varchar("identity_verification_session_id", { length: 255 }),
  identityVerificationStatus: varchar("identity_verification_status", { length: 20 }).default("pending"),
  identityVerifiedAt: timestamp("identity_verified_at"),
  stripeConnectStatus: varchar("stripe_connect_status", { length: 20 }).default("not_started"),
  status: varchar("status", { length: 20 }).default("pending"),
  rejectionMessage: text("rejection_message"),
  // Canonical offering-type selection carried from /earn (migration 107).
  // FK to expert_offering_types.offering_type_key — the expert catalog only;
  // the provider form references service_offering_types (parallel catalogs).
  offeringTypeKey: varchar("offering_type_key", { length: 100 }).references(() => expertOfferingTypes.offeringTypeKey, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  statusIdx: index("local_expert_forms_status_idx").on(table.status),
}));

export const serviceProviderForms = pgTable("service_provider_forms", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  website: text("website"),
  mobile: varchar("mobile", { length: 50 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 50 }),
  country: varchar("country", { length: 100 }).notNull(),
  address: text("address").notNull(),
  bookingLink: text("booking_link"),
  gst: varchar("gst", { length: 100 }),
  instagramLink: text("instagram_link"),
  facebookLink: text("facebook_link"),
  linkedinLink: text("linkedin_link"),
  photo1: text("photo1"), // File URL
  photo2: text("photo2"),
  photo3: text("photo3"),
  photo4: text("photo4"),
  photo5: text("photo5"),
  businessType: varchar("business_type", { length: 100 }).notNull(),
  serviceOffers: jsonb("service_offers").default([]),
  description: text("description"),
  instantBooking: boolean("instant_booking").default(false),
  businessLogo: text("business_logo"), // File URL
  businessLicense: text("business_license"), // File URL
  businessGstTax: text("business_gst_tax"), // File URL
  termsAndConditions: boolean("terms_and_conditions").default(false),
  infoConfirmation: boolean("info_confirmation").default(false),
  contactRequest: boolean("contact_request").default(false),
  identityVerificationSessionId: varchar("identity_verification_session_id", { length: 255 }),
  identityVerificationStatus: varchar("identity_verification_status", { length: 20 }).default("pending"),
  identityVerifiedAt: timestamp("identity_verified_at"),
  businessVerificationStatus: varchar("business_verification_status", { length: 20 }).default("pending"),
  businessCountry: varchar("business_country", { length: 100 }),
  businessRegistrationNumber: varchar("business_registration_number", { length: 255 }),
  businessDocuments: jsonb("business_documents").default({}),
  personaInquiryId: varchar("persona_inquiry_id", { length: 255 }),
  status: varchar("status", { length: 20 }).default("pending"), // Enum: applicationStatusEnum
  rejectionMessage: text("rejection_message"),
  // Canonical offering-type selection carried from /earn (migration 107).
  // FK to service_offering_types.offering_type_key — the provider catalog only.
  offeringTypeKey: varchar("offering_type_key", { length: 100 }).references(() => serviceOfferingTypes.offeringTypeKey, { onDelete: "set null" }),
  // Applicant's self-attested insurance flag (migration 108). Nullable: NULL =
  // never asked (pre-108 rows), distinct from an explicit false. The FEE-2
  // brief's admin-validated insurance_tier evidence columns will sit beside it.
  hasInsurance: boolean("has_insurance"),
  // Account-level office / place-of-business location (DECISIONS.md ruling 85, migration 207).
  // { address, lat, lng } — the provider's confirmed business location, captured via the SAME
  // confirm-gated LocationPointPicker the per-listing meeting pin uses (address typed OR pin
  // dropped; geocoded through the ONE server path POST /api/geocode; persisted ONLY on explicit
  // Confirm). PURPOSE: pre-fill a NEW listing's meeting pin so the provider does not re-place it
  // every time (still overridable/removable per listing). NULL = "office location not set" — the
  // honest §13 default; NEVER backfilled with a guessed/city-centre coordinate. This is provider-
  // owned CONFIG, not a money/identity/rate field (§14/§18/§19 do not apply — nothing derives a
  // charge from it); written owner-gated via PATCH /api/provider-application through a hand-written
  // zod ALLOWLIST (no new .omit() schema — #PS18 ratchet untouched). Additive-nullable jsonb,
  // declared here per the publish-trap rule (deploy-push would drop an undeclared column).
  officeLocation: jsonb("office_location"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Service Categories ===

export const categoryTypeEnum = ["service_provider", "local_expert", "hybrid"] as const;

export const serviceCategories = pgTable("service_categories", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 100 }).notNull().unique(),
  slug: varchar("slug", { length: 100 }).unique(),
  description: text("description"),
  icon: varchar("icon", { length: 10 }),
  imageUrl: text("image_url"),
  categoryType: varchar("category_type", { length: 20 }).default("service_provider"),
  verificationRequired: boolean("verification_required").default(true),
  requiredDocuments: jsonb("required_documents").default([]),
  customProfileFields: jsonb("custom_profile_fields").default([]),
  priceRange: jsonb("price_range").default({}),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  // Master Integration Brief — Phase 1: billing-aware attributes per SEED_DATA §2.
  // All nullable; populated by Phase 1.2 reconciliation pass (see audit doc).
  // categoryKey is the brief's stable join key — distinct from the legacy slug,
  // so existing FKs and string-literal references stay valid. Brief integrations
  // (service_offering_types, template_category_matrix, neighborhood_coverage_target,
  // fee resolver) join on categoryKey, never on the legacy slug.
  categoryKey: varchar("category_key", { length: 100 }),                    // brief's join key; unique when non-null
  sourceType: varchar("source_type", { length: 30 }),                       // 'platform_provider' | 'affiliate'
  launchTier: varchar("launch_tier", { length: 20 }),                       // 'core' | 'secondary' | 'segment'
  // money-derive-ok: this SELECTS a fee_bands row rather than carrying a rate, and its setter is
  // ADMIN by design — that is the fee-band admin surface, not a client path. All three parse sites
  // of insertServiceCategorySchema are admin-gated (admin.routes.ts under the blanket requireAdmin;
  // content.routes.ts:807 behind an explicit DB role check). Ruling 42's rule is that a rate-bearing
  // field is never CLIENT-settable; an authenticated admin editing bands is the intended path.
  // FILED (ruling-42 class sweep, #PS14 — NOT fixed here, it is fee taxonomy and owes a doc-first
  // decision per Coordination Prevention): the two admin setters DIVERGE. admin.routes.ts:2218-2245
  // rejects a commissionBandKey that matches no fee_bands row and refuses to clear it unless
  // platform_settings.default_commission_band_key is set and active; content.routes.ts:807 parses
  // the same schema on CREATE with no band validation at all, so a category can be born pointing at
  // a band that does not exist.
  commissionBandKey: varchar("commission_band_key", { length: 100 }),       // → fee_bands.bandKey (tiered policy only) — money-derive-ok: see the note above (admin-by-design setter)
  insuranceBand: integer("insurance_band"),                                 // 1 | 2 | 3 (platform_provider only)
  riskProfile: varchar("risk_profile", { length: 20 }),                     // 'low' | 'moderate' | 'high'
  requiresBackgroundCheck: boolean("requires_background_check").default(false),
  affiliatePartnerKey: varchar("affiliate_partner_key", { length: 50 }),    // populated only when sourceType='affiliate'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Migration 032. Deploy-push rule (see `bookings`). Partial WHERE mirrored verbatim —
  // category_key is nullable for categories that predate the Phase-1 key column.
  categoryKeyIdx: uniqueIndex("idx_service_categories_category_key")
    .on(table.categoryKey)
    .where(sql`category_key IS NOT NULL`),
}));

export const serviceSubcategories = pgTable("service_subcategories", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  categoryId: varchar("category_id").notNull().references(() => serviceCategories.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 10 }),
  priceRange: jsonb("price_range").default({}),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Expert/Provider Services (Enhanced for Marketplace) ===

export const serviceTypeEnum = ["consultation", "planning", "action", "concierge", "experience", "specialty"] as const;
// D3a canonical set (structural brief Phase 1c): schema set + "hybrid".
// The column is varchar with no DB CHECK; this const is the single canonical
// vocabulary all writers must use. Legacy rows carry divergent values
// (video-call, document, in-person) until the Phase-1d approved remap runs.
export const deliveryMethodEnum = ["pdf", "video", "call", "in_person", "voice_notes", "async_messaging", "hybrid"] as const;
export const serviceStatusEnum = ["active", "paused", "draft"] as const;
// X1 (§13 hardcoded-copy arm) — structured cancellation-policy TYPE vocabulary. Column is varchar
// with no DB CHECK (migration 144: app-enforced, like deliveryMethodEnum pre-109); NULL = the owner
// hasn't declared a policy type (the honest state — never a fabricated blanket claim).
export const cancellationPolicyTypeEnum = ["flexible", "moderate", "strict", "non_refundable"] as const;
// Deposit CONFIG vocabulary (Lane 7, ruling 72). App-enforced (no DB CHECK): 'percentage' collects
// depositPercentage% of the line total now; 'flat' collects depositFlatAmount dollars now.
export const depositTypeEnum = ["percentage", "flat"] as const;
export const CANCELLATION_POLICY_TYPE_LABELS: Record<typeof cancellationPolicyTypeEnum[number], string> = {
  // Concrete windows mirror the server enforcement schedule in
  // server/services/cancellation-policy.service.ts (refundPercentFor).
  flexible: "Flexible — full refund if cancelled at least 24 hours before the start",
  moderate: "Moderate — full refund 5+ days before the start; 50% refund 2+ days before",
  strict: "Strict — 50% refund if cancelled at least 7 days before the start",
  non_refundable: "Non-refundable — no refund once booked",
};

// ── D7 service-logistics vocabularies (docs/DECISIONS.md ruling 62, migration 195) ───────────
// Both columns are varchar with NO DB CHECK — the migration-144 posture (app-enforced
// vocabulary, publish-trap avoidance). NULL is the honest "never captured" state on every
// pre-195 row; it is NEVER read as "not applicable".
//
// `transportProvision` is FINER-GRAINED than the pre-existing `transportProvided`
// (yes|no|not_applicable, migration 119, which DOES carry a DB CHECK). The two are deliberately
// NOT merged: widening 119's CHECK to a 4-value set is exactly the publish-time CHECK failure
// CLAUDE.md warns about, and the old column's answer ("do you drive them once you've met?") is a
// different question from this one ("how does the traveler get to the start?").
export const transportProvisionEnum = [
  "pickup_included",   // the price includes collecting the traveler
  "pickup_available",  // pickup can be arranged (possibly for extra), but is not the default
  "meet_at_point",     // the traveler makes their own way to the meeting pin
  "not_applicable",    // remote/artifact delivery — no physical arrival at all
] as const;

// The ruling-62 AMENDMENT (decision-maker, verbatim intent: "ensure the service provider can set
// EITHER a pickup RADIUS or a pickup ROUTE"). This column records WHICH of two ALREADY-SHIPPED
// stores the provider means their pickup coverage to be read from:
//   radius → `provider_services.service_radius` (the display-only ring around the confirmed pin)
//   route  → `service_route_points` (ruling 22, migration 192 — ordered stops)
// NEVER-CLOBBER RULE (§13): declaring one mode does not delete, null, or overwrite the other
// mode's data. Both stores keep whatever they hold; only the RENDERING is switched, and the
// authoring UI states out loud that the other mode's saved data is still there.
export const pickupCoverageModeEnum = ["radius", "route"] as const;

// Per-listing booking affordance (Catalog+Distribute ruling 74/75, lane C3). The provider's own
// display choice for the traveler card's CTA — NOT a money/identity/rate field (§14/§18/§19 do not
// apply: nothing here multiplies a charge, selects a fee band, or identifies an actor), so it is an
// ordinary owner-authored listing pref that is legitimately client-settable, like `price`/
// `serviceRadius`. App-enforced vocabulary in insertProviderServiceSchema, NO DB CHECK (migration
// 144/195/202 publish-trap posture). NULL on the column = "unset" → the read-time default is DERIVED
// from the account's existing `service_provider_forms.instantBooking` (never duplicated here) via
// `resolveBookingMode` below.
export const bookingModeEnum = ["instant", "request", "hidden"] as const;
export type BookingMode = (typeof bookingModeEnum)[number];

// ── Travel surcharge — PROVIDER-CHOSEN MODE per listing (DECISIONS.md ruling 81, lane B1,
//    migration 205). A §14 MONEY lane: the mode + config are ordinary owner-authored LISTING config
//    (like `serviceRadius`/deposit config — client-settable, no fee_bands involvement, §8), but the
//    resulting CHARGE is SERVER-DERIVED at checkout from the mode + config + the traveler's CONFIRMED
//    pickup location, NEVER off req.body. NO DB CHECK on the mode column (the migration-144/195/202
//    publish-trap posture — the vocabulary is enforced by insertProviderServiceSchema's field-level
//    extend so it survives `.partial()`). The FOUR modes:
//   none    — DEFAULT (every pre-205 row; column DEFAULTs 'none'). No surcharge, ever. §13.
//   flat    — one flat fee when the pickup is OUTSIDE the coverage radius (binary in/out — honest
//             containment, NO computed distance shown). Config: `surchargeFlatAmount`.
//   zones   — provider-drawn base area + N ordered tiers (each a distance ring + a fee, child rows in
//             `service_surcharge_tiers`); the pickup maps to the SMALLEST ring that CONTAINS it (0 if
//             inside the base). Honest containment — no computed distance shown.
//   per_km  — provider rate × the STRAIGHT-LINE ("as-the-crow-flies, not driving") km from the pin.
//             Config: `surchargePerKm`. §13 — labeled straight-line, never a driving time/distance.
// NEVER-CLOBBER (ruling 62 posture): switching the mode changes only what applies/renders; the other
// modes' config (flat amount, per-km rate, tiers) is preserved, never nulled.
export const surchargeModeEnum = ["none", "flat", "zones", "per_km"] as const;
export type SurchargeMode = (typeof surchargeModeEnum)[number];

// The ONE place the null-default is resolved (ruling 75). Called SERVER-SIDE on every card read
// (the public storefront read and the owner Catalog read) so the traveler card always receives a
// CONCRETE booking mode: an explicit per-listing value wins; an unset (null) listing inherits the
// account flag — instant if the provider offers instant booking, request otherwise. `hidden` is only
// ever an explicit per-listing choice, never a derived default.
export function resolveBookingMode(
  stored: string | null | undefined,
  accountInstantBooking: boolean | null | undefined,
): BookingMode {
  if (stored === "instant" || stored === "request" || stored === "hidden") return stored;
  return accountInstantBooking ? "instant" : "request";
}

export const providerServices = pgTable("provider_services", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  shortDescription: varchar("short_description", { length: 150 }),
  description: text("description"),
  serviceType: varchar("service_type", { length: 50 }).default("planning"), // consultation, planning, action, concierge, experience, specialty
  categoryId: varchar("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
  subcategoryId: varchar("subcategory_id").references(() => serviceSubcategories.id, { onDelete: "set null" }),

  // Pricing
  price: decimal("price", { precision: 10, scale: 2 }),
  priceType: varchar("price_type", { length: 20 }).default("fixed"), // fixed, variable, custom_quote, hourly, package_tiers, per_event, range, per_person
  priceBasedOn: varchar("price_based_on", { length: 100 }),
  // Structured pricing tiers: [{label, price, unit, description}] — used when priceType="package_tiers"
  pricingTiers: jsonb("pricing_tiers"),
  
  // Delivery
  deliveryMethod: varchar("delivery_method", { length: 50 }).default("pdf"), // canonical: deliveryMethodEnum — DB CHECK enforced since migration 109
  deliveryTimeframe: varchar("delivery_timeframe", { length: 100 }), // "24-48 hours", "same-day", etc.
  // SS-6 (docs/DECISIONS.md ruling 69 disposition 9, migration 199): the language(s) the service is
  // DELIVERED in — a purchasable attribute in the launch market, and a thing providers previously
  // could not state at all. Typed to match `local_expert_forms.languages` (jsonb string array)
  // rather than inventing a shape. DELIBERATELY no default: NULL = never captured (render NOTHING,
  // never a presumed "English" — §13), `[]` = deliberately cleared. This is NOT ruling 60's chrome
  // (A) or content (B) translation; it is the third question those two do not ask.
  deliveryLanguages: jsonb("delivery_languages").$type<string[]>(),
  revisionsIncluded: integer("revisions_included").default(0),
  includesExpertNotes: boolean("includes_expert_notes").default(false),
  
  // Capacity & Scheduling
  maxConcurrentBookings: integer("max_concurrent_bookings"),
  leadTimeHours: integer("lead_time_hours").default(24),
  location: varchar("location", { length: 255 }).default("Unknown"),
  availability: jsonb("availability").default([]),

  // Logistics
  meetingPoint: text("meeting_point"), // Where client meets provider (address / description)
  pickupAvailable: boolean("pickup_available").default(false), // Provider offers pickup
  pickupAddress: text("pickup_address"), // Starting pickup location
  serviceRadius: integer("service_radius"), // km radius provider covers
  // SS-4 (docs/DECISIONS.md ruling 69 disposition 9, migration 199): how far the provider travels
  // TO COLLECT a traveler — a genuinely different number from `serviceRadius` above ("how far I
  // travel to work"). Until this column existed, the wizard rendered BOTH labels and wrote BOTH
  // into `service_radius`, so typing one changed the other. NEVER-CLOBBER: `serviceRadius` keeps
  // its stored value with no backfill, and NULL here means "not set" — never 0, never a copy (§13).
  pickupRadiusKm: integer("pickup_radius_km"),
  // Does the provider transport the traveler during/from the meeting point?
  // 3-value so "not applicable" (remote/self-guided) is distinct from an explicit "no transport".
  // DB CHECK enforced in migration 119. Default not_applicable so grandfathered rows make no claim.
  transportProvided: varchar("transport_provided", { length: 20 }).default("not_applicable"), // yes, no, not_applicable
  // Content logistics envelope (migration 166, QA_PUNCH_LIST item 20) — the one logistics field
  // with no prior home: meetingPoint/pickupAddress cover arrival, nothing structurally captured
  // departure. Additive nullable, no DB CHECK. NULL = never captured (§13, not "no drop-off").
  dropOffPoint: text("drop_off_point"),
  // Neighborhood tag (v2 spec §5.1) — soft reference into city_neighborhoods.slug.
  neighborhood: varchar("neighborhood", { length: 100 }),

  // ══ D7 service_logistics capture (docs/DECISIONS.md ruling 62, migration 195) ═══════════════
  // CAPTURE-ONLY by ruling: nothing here has a consumer yet (no transport resolver, no
  // fundamentals check, no pricing/matching read). Every column is additive-nullable with NO DB
  // CHECK — NULL means "the provider never told us", never a fabricated default (§13).
  //
  // AUDIT — what this block deliberately REUSES instead of duplicating (ruling 62 asked for a
  // field set; these members of it already exist on this table and are NOT re-added):
  //   lead-time hours          → `leadTimeHours` above (integer, default 24)
  //   pickup radius            → `serviceRadius` above (integer km; the amendment's radius arm)
  //   pickup route             → `service_route_points` (ruling 22, migration 192)
  //   meeting point / pickup / drop-off → `meetingPoint`, `pickupAvailable`, `pickupAddress`,
  //                              `dropOffPoint`
  //   concurrency cap          → `maxConcurrentBookings` above
  //   turnaround copy          → `deliveryTimeframe` above (free text; NOT a duration — see below)
  //   confirmed pin            → `latitude`/`longitude`/`locationPrecision` above
  //   per-group vs per-person  → `priceType` above already carries `per_person` alongside
  //                              `fixed`/`per_event` (per-group), so the group-handling flag
  //                              ruling 62 listed IS already expressible — no new column.
  //   cancellation refund tiers → `cancellationPolicyType` (a REFUND policy; distinct from the
  //                              reschedule window captured by `changeCutoffHours` below)
  transportProvision: varchar("transport_provision", { length: 30 }), // transportProvisionEnum
  pickupCoverageMode: varchar("pickup_coverage_mode", { length: 20 }), // pickupCoverageModeEnum
  // Temporal shape. `deliveryTimeframe` is free-text turnaround copy ("24-48 hours") and can't be
  // arithmetic'd, so a structured duration genuinely had no home on this table (the
  // `duration_minutes` that exists elsewhere is on `itinerary_items`, a different row entirely).
  durationMinutes: integer("duration_minutes"),
  bufferMinutes: integer("buffer_minutes"), // setup//teardown minutes to keep free around a booking
  earliestStartTime: varchar("earliest_start_time", { length: 5 }), // "HH:MM", local wall clock
  latestStartTime: varchar("latest_start_time", { length: 5 }),     // "HH:MM", local wall clock
  serviceTimezone: varchar("service_timezone", { length: 64 }),     // IANA id, e.g. "Asia/Tokyo"
  // Booking constraints.
  partySizeMin: integer("party_size_min"),
  partySizeMax: integer("party_size_max"),
  changeCutoffHours: integer("change_cutoff_hours"), // reschedule window (NOT the refund policy)

  // ══ S9 session/async fields (docs/DECISIONS.md ledger row 102, migration 212) ════════════════
  // Ratifies docs/briefs/WAVE3_SCHEMA_PROPOSALS.md's S9 section (execution-map Wave 3, Gate G3).
  // Additive nullable, no DB CHECK (app-enforced shape floors in insertProviderServiceSchema,
  // the migration-195/181 posture). NULL = never captured (§13), never a default claim.
  //
  // `joinLink` is a SENSITIVE field — unlike the free-text logistics fields around it, it is NOT
  // safe to read on any public/pre-booking surface. It is the provider's OWN meeting link for a
  // scheduled remote session (call/video — shared/service-fundamentals.ts SESSION_END_METHODS)
  // and is stripped everywhere `serviceFile` (the D3 pdf-deliverable precedent) is stripped, then
  // revealed ONLY to the CONFIRMED traveler + the owning provider — mirroring the
  // `GET /api/service-bookings/:id/deliverable` gate (booking.travelerId === session user AND
  // booking.status === 'confirmed', never 'payment_pending', §15b). A PENDING advisor's read
  // grant (§12) does NOT extend to this field (ballot ruling, ledger row 102 S9).
  joinLink: text("join_link"),
  // `responseWindowHours`/`scopeStatement` are async (async_messaging/voice_notes) fields: the
  // promised response time and an SLA/promise statement distinct from `whatIncluded` (marketing
  // copy). Both are ordinary public pre-purchase info (like earliestStartTime/serviceTimezone
  // above) — DESCRIPTIVE ONLY. Neither feeds shared/service-fundamentals.ts's completionRuleFor
  // (unchanged — async_messaging/voice_notes already route to 'provider_declared') or
  // server/services/booking-completion.service.ts, which this lane does not touch.
  responseWindowHours: integer("response_window_hours"),
  scopeStatement: text("scope_statement"),

  // ══ Deposits / partial payments — CONFIG (Lane 7, docs/DECISIONS.md ruling 72, migration 200) ══
  // PROVIDER OPT-IN PER LISTING: no listing takes a deposit unless `depositEnabled` is on and a
  // percentage OR a flat amount is set. These are ordinary owner-authored LISTING facts, like
  // `price`/`serviceRadius` beside them — the provider's OWN business config on their OWN listing,
  // read server-side at checkout to derive the amount-due-now (§14). They are NOT a platform
  // fee/commission rate (§8/§18 do not apply: nothing here multiplies a platform take or selects a
  // fee band), and are named so the fee gate cannot misread them. All additive-nullable, app-layer
  // vocabulary in insertProviderServiceSchema, no DB CHECK (publish-trap posture).
  depositEnabled: boolean("deposit_enabled").default(false),
  depositType: varchar("deposit_type", { length: 20 }),          // depositTypeEnum: 'percentage' | 'flat'
  depositPercentage: integer("deposit_percentage"),               // e.g. 30 = collect 30% of the line total now
  depositFlatAmount: decimal("deposit_flat_amount", { precision: 10, scale: 2 }), // flat dollars collected now

  // ══ Per-listing card display options (Catalog+Distribute ruling 74/75, lane C3, migration 202) ══
  // The provider's own "Card shows" choices, rendered on the shared traveler OfferingCard in Catalog
  // Preview AND on the public storefront. DISPLAY PREFS, not §14/§18/§19 fields — no amount, identity
  // or rate — so they are legitimately client-settable (owner-gated on POST/PATCH like `price`) and
  // are NOT stripped. `showPrice` DEFAULTs true so every row is concrete without a backfill: false ⇒
  // the card hides the price and shows an honest "Enquire for pricing" affordance (allowed for ALL
  // services, ruling 74 res. A — never a blank or a fake "$0", §13). `bookingMode` is nullable (app-
  // enforced bookingModeEnum, NO DB CHECK — publish-trap posture): NULL = unset ⇒ resolved at read
  // time from the account `service_provider_forms.instantBooking` by `resolveBookingMode`.
  showPrice: boolean("show_price").default(true),
  bookingMode: varchar("booking_mode", { length: 20 }), // bookingModeEnum: 'instant' | 'request' | 'hidden'

  // Can this service serve as a day's fixed point? Mirrors the `itinerary_items`/`temporal_anchors`
  // anchor vocabulary. CAPTURE ONLY — no scheduler reads it yet.
  canAnchor: boolean("can_anchor"),

  // ══ Travel surcharge — CONFIG (ruling 81, lane B1, migration 205) — §14 money lane ══════════════
  // Provider-chosen `surchargeMode` (surchargeModeEnum none|flat|zones|per_km, app-enforced in
  // insertProviderServiceSchema, NO DB CHECK — publish-trap posture) + the config the chosen mode
  // needs. These are owner-authored LISTING config (no fee_bands, §8), NOT §18 rates: nothing here
  // multiplies a platform take or selects a fee band, so they are legitimately client-settable (like
  // `serviceRadius`/deposit config) and NOT stripped. But the resulting CHARGE is derived SERVER-SIDE
  // at checkout from these + the traveler's confirmed pickup (server/services/travel-surcharge.service.ts),
  // never from req.body (§14). NEVER-CLOBBER (ruling 62): switching the mode preserves the other
  // modes' config. All additive-nullable, no DB CHECK. Column named `surcharge_flat_amount`/
  // `surcharge_per_km` (not a bare `amount`/`rate`) so the fee gate cannot misread them — the same
  // naming care the deposit config uses. `surchargeMaxKm` doubles as BOOKING ELIGIBILITY: a confirmed
  // pickup beyond it cannot book (refused BEFORE any charge). Declared here per the publish-trap rule.
  surchargeMode: varchar("surcharge_mode", { length: 20 }).default("none"), // surchargeModeEnum
  surchargeFlatAmount: decimal("surcharge_flat_amount", { precision: 10, scale: 2 }), // flat mode: dollars added when pickup is outside the radius
  surchargePerKm: decimal("surcharge_per_km", { precision: 10, scale: 2 }),           // per_km mode: dollars per straight-line km from the pin
  surchargeMaxKm: integer("surcharge_max_km"),                                        // outer bound / booking-eligibility ceiling ("won't travel beyond X km")

  // Product Builder shape (§17, migrations 151+153) — NULL = single service (every pre-151
  // row), 'bundle' = a bundle row whose components live in bundle_components, 'property' = an
  // accommodation listing, 'property_room' = a bookable room-type child of a property.
  // Additive nullable, app-layer values, no DB CHECK (the migration-129 posture).
  productShape: varchar("product_shape", { length: 20 }),

  // Property rung (§17, migration 153). pricingUnit: NULL = flat price (every existing row),
  // 'per_night' = price is a nightly rate — charge = nights × rate, server-derived (§14).
  // parentServiceId: room-child → parent property self-FK, ON DELETE RESTRICT (a property
  // can't be deleted while rooms exist — the bundle-components posture). Both additive
  // nullable, no DB CHECK.
  pricingUnit: varchar("pricing_unit", { length: 20 }),
  parentServiceId: varchar("parent_service_id").references((): AnyPgColumn => providerServices.id, { onDelete: "restrict" }),

  // S8 property builder (Gate G2, migration 211, docs/briefs/WAVE3_SCHEMA_PROPOSALS.md, ledger
  // row 102). check_in_time/check_out_time: "HH:MM" wall clock, same shape as
  // earliestStartTime/latestStartTime above. house_rules: property-level ONLY — a room never
  // carries its own (absolute inheritance, the same posture as the pin below: no per-room
  // override). amenities: string array, the deliveryLanguages precedent (§13) — NULL = never
  // captured (every pre-211 row), [] = deliberately cleared; the two states must not collapse.
  // All three ride the EXISTING POST/PATCH /api/provider/services + insertProviderServiceSchema
  // (not money/identity/rate fields, §14/§18/§19 do not apply) — no new endpoint. Additive
  // nullable, no DB CHECK (app-enforced HH:MM regex + amenities shape live on the zod schema
  // below, the migration-195/199 posture).
  checkInTime: varchar("check_in_time", { length: 5 }),
  checkOutTime: varchar("check_out_time", { length: 5 }),
  houseRules: text("house_rules"),
  amenities: jsonb("amenities").$type<string[]>(),
  // Ruling 112 Q6 (migration 214): minimum stay in nights, property/property_room by convention
  // (editor renders it only for property shapes; app-enforced ≥1, no DB CHECK). NULL = never
  // captured — never a guessed 1-night default (§13).
  minStayNights: integer("min_stay_nights"),

  // Content location normalization (Lane A Phase 1, migration 129) — additive nullable coordinate
  // columns. Backfilled from city_neighborhoods centroids where the neighborhood slug resolves;
  // NULL when unresolvable (NULL is the honest state — no city-center fallback). NOT read by the
  // coverage/upsell engine for pricing/matching. No DB CHECK (additive-nullable only).
  // location_precision intended values: 'neighborhood_centroid' | 'exact'.
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  city: varchar("city"),
  locationPrecision: varchar("location_precision"),

  // What's Included & Requirements
  whatIncluded: jsonb("what_included").default([]), // Array of strings: ["3 hours shooting", "50+ edited photos"]
  requirements: jsonb("requirements").default([]), // What provider needs from traveler
  faqs: jsonb("faqs").default([]), // [{question, answer}]
  
  // Media
  serviceImage: text("service_image"), // Cover image URL
  // D3 (docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md): the artifact-delivery deliverable
  // (pdf listings only — shared/service-fundamentals.ts isArtifactDelivery). Owner-gated
  // write (same session/ownership check as serviceImage on POST/PATCH /api/provider/services
  // — not a privileged §14/§18/§19 field, so no allowlist/omit needed there). NEVER select
  // this column into a public/non-owner read — see the D3 leak-prevention audit; the one
  // sanctioned reveal is GET /api/service-bookings/:id/deliverable (server/routes.ts), gated
  // on a confirmed booking belonging to the session user.
  serviceFile: text("service_file"), // File URL
  // D8 artifact-timer delivery clock (ruling 63, executed by ruling 66; migration 196). Stamped
  // by the deliverable UPLOAD path only. `deliveredAt` for a pdf booking is
  // max(booking.confirmedAt, this) — the moment the entitlement first became satisfiable. NULL =
  // never recorded (every pre-196 row, and every legacy pasted-URL deliverable) ⇒ the
  // UNDOWNLOADED auto-complete arm is skipped with a stated reason, never guessed (§13). The
  // downloaded arm rides deliverable_downloads and is unaffected. Declared here per the
  // publish-trap rule — a column only in migration SQL is dropped by the deploy push.
  deliverableUploadedAt: timestamp("deliverable_uploaded_at"),
  
  // Status & Analytics
  status: varchar("status", { length: 20 }).default("active"), // active, paused, draft
  formStatus: varchar("form_status", { length: 50 }).default("pending"), // For approval workflow

  // Approval workflow (consolidated from expert_custom_services in 0007)
  approvalStatus: varchar("approval_status", { length: 20 }).default("submitted"), // draft, submitted, approved, rejected — F2: born submitted, never born-approved (migration 111)
  cancellationPolicy: text("cancellation_policy"), // free-text detail, e.g. "Full refund if cancelled 48h before"
  // X1 (migration 144): structured policy TYPE — cancellationPolicyTypeEnum. Additive nullable,
  // no DB CHECK (app-enforced vocabulary). NULL = not yet declared by the owner (honest default).
  cancellationPolicyType: varchar("cancellation_policy_type", { length: 30 }),
  leadTime: varchar("lead_time", { length: 50 }),
  deliverables: jsonb("deliverables").default([]),
  experienceTypes: jsonb("experience_types").default([]),
  galleryImages: jsonb("gallery_images").default([]),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),

  isFeatured: boolean("is_featured").default(false),
  bookingsCount: integer("bookings_count").default(0),
  totalRevenue: decimal("total_revenue", { precision: 10, scale: 2 }).default("0"),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").default(0),
  // D0 (fee-ledger lane, ruled 2026-08-06 — migration 178): `fee_bands` is authoritative, reached
  // through ONE resolver. This column stops being "the final override" it was at
  // payments.routes.ts:826/877/1090 — the mechanism behind audit C2/Q9, where a stale per-service
  // snapshot outranked band resolution so an admin band edit could not change what a service
  // charged (ruling 32's defeated proof).
  //
  // The hardcoded "0.75" DEFAULT is DELETED: it was a fee literal (ruling 32) that silently became
  // the charged rate whenever derivation was unavailable. NULL now means "no override — ask the
  // resolver", and migration 178 backfills every pre-existing row to NULL rather than freezing a
  // computed rate into it (a fresh snapshot would go stale on the next band edit, re-creating the
  // defect). Whether the column is retired outright or kept as a derived cache is Phase 1A's
  // remaining call; either way it is never the first operand again.
  revenueShareRate: decimal("revenue_share_rate", { precision: 4, scale: 2 }),

  // Content-affinity tags — canonical slugs indicating which traveller contexts
  // surface this service. e.g. ['hotel_arrival','photo_shoot'].
  // Empty array → system falls back to serviceType inference in content-matching.service.
  contentAffinityTags: text("content_affinity_tags").array().default([]),

  // Per-category dynamic attributes (jsonb, data-driven fields per category_field_schema)
  categoryAttributes: jsonb("category_attributes"),

  // Expert 5-tier connection (FK managed at DB level by migration 057)
  expertOfferingTypeId: uuid("expert_offering_type_id"),
  // Migration 148 (§17): the provider-side offering linkage — which /earn service_offering_types
  // row this listing IS. Nullable; NULL = created before the offering-first form (identity never
  // captured) — never fabricate a backfill.
  serviceOfferingTypeId: uuid("service_offering_type_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === Bundle components (Product Builder §17, migration 151 — ratified join-table decision) ===
// A bundle IS a provider_services row (product_shape='bundle') so the F2 approval queue,
// storefront read-gates, and checkout rails work unchanged; this table links it to its
// component services. component FK is ON DELETE RESTRICT — a service inside a bundle cannot
// be deleted until removed from the bundle (silently vanishing components would change a
// sellable bundle's contents underneath the buyer).
export const bundleComponents = pgTable("bundle_components", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bundleServiceId: varchar("bundle_service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  componentServiceId: varchar("component_service_id").notNull().references(() => providerServices.id, { onDelete: "restrict" }),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Category Field Schema (admin-configurable per-category dynamic fields) ===

export const categoryFieldSchema = pgTable("category_field_schema", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryKey: varchar("category_key", { length: 100 }).notNull(),
  fieldKey: varchar("field_key", { length: 100 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // text | number | select | boolean | url | multiselect
  required: boolean("required").notNull().default(false),
  options: jsonb("options"), // string[] for select/multiselect
  sortOrder: integer("sort_order").notNull().default(0),
  // Category-level pricing hint — same value across all rows for a given category_key.
  // Values: hourly | package_tiers | per_event | fixed | range | per_person
  defaultPriceType: varchar("default_price_type", { length: 30 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqCategoryField: unique("category_field_schema_category_key_field_key_key").on(table.categoryKey, table.fieldKey),
}));

export const insertCategoryFieldSchemaSchema = createInsertSchema(categoryFieldSchema).omit({ id: true, createdAt: true });
export type CategoryFieldSchema = typeof categoryFieldSchema.$inferSelect;
export type InsertCategoryFieldSchema = z.infer<typeof insertCategoryFieldSchemaSchema>;

// === Service Templates (Pre-defined service templates experts can use) ===

export const serviceTemplates = pgTable("service_templates", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  categoryId: varchar("category_id").references(() => serviceCategories.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  shortDescription: varchar("short_description", { length: 150 }),
  description: text("description"),
  serviceType: varchar("service_type", { length: 50 }).default("planning"),
  suggestedPrice: decimal("suggested_price", { precision: 10, scale: 2 }),
  priceRange: jsonb("price_range").default([]), // [min, max]
  deliveryMethod: varchar("delivery_method", { length: 50 }),
  deliveryTimeframe: varchar("delivery_timeframe", { length: 100 }),
  whatIncluded: jsonb("what_included").default([]),
  requirements: jsonb("requirements").default([]),
  usageCount: integer("usage_count").default(0),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Custom Venues (User-added locations) ===

export const customVenues = pgTable("custom_venues", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  experienceType: varchar("experience_type", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  venueType: varchar("venue_type", { length: 50 }).default("custom"),
  notes: text("notes"),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  imageUrl: text("image_url"),
  source: varchar("source", { length: 20 }).default("custom"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Legacy Archives (generic durable archive for retired tables with real rows) ===
// Migration 168 (CLAUDE.md Coordination Prevention record): a generic archive for the class of
// problem "a table has zero code consumers but holds real user data, so it can't simply be
// dropped." Declared here per the deploy-push-durability rule -- an UNDECLARED archive table is
// itself the next drop target on a Replit publish, which would defeat the entire point of
// archiving into it. First tenant: `activity_bookings` (dropped by migration 168; its
// `activityBookings` declaration is now removed — step 2 of the two-deploy retirement).
// INCIDENT (Aug 1, 2026, recorded + CLOSED in CLAUDE.md): the archive ran against an
// already-empty table — a drizzle push executed while the declaration-removal (#386) was
// merged un-gated dropped the table before migration 168 could archive it. A live-Stripe
// check later showed the lost row was an UNPAID booking (no captured funds — the account's
// live history holds no such charge), so nothing of financial substance was lost. See the
// CLAUDE.md migration-168 entry for the sequencing lessons.
export const legacyArchives = pgTable("legacy_archives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceTable: varchar("source_table").notNull(),
  archivedAt: timestamp("archived_at").defaultNow(),
  reason: text("reason"),
  rowData: jsonb("row_data").notNull(),
});

// === Service Bookings ===

export const serviceBookingStatusEnum = ["pending", "confirmed", "in_progress", "completed", "cancelled", "refunded"] as const;

export const serviceBookings = pgTable("service_bookings", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  serviceId: varchar("service_id").references(() => providerServices.id, { onDelete: "cascade" }),
  travelerId: varchar("traveler_id").references(() => users.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id").references(() => users.id, { onDelete: "cascade" }),
  contractId: varchar("contract_id").references(() => userAndExpertContracts.id, { onDelete: "set null" }),
  
  // Booking Details
  bookingDetails: jsonb("booking_details").default({}), // Trip dates, preferences, requirements
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "set null" }),
  
  // Status & Payment
  status: varchar("status", { length: 30 }).default("pending"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).default("0"),
  insuranceFee: decimal("insurance_fee", { precision: 10, scale: 2 }).default("0.00"),
  providerEarnings: decimal("provider_earnings", { precision: 10, scale: 2 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),

  // ══ Deposits / partial payments — BOOKING STATE (Lane 7, ruling 72, migration 200) ═══════════
  // Mirrors the legacy `bookings` deposit/balance shape additively on THIS (cart-rail) table. A
  // deposit-partial booking lands in status='deposit_paid' (a plain varchar value, no CHECK) —
  // distinguishable BY CONSTRUCTION from a full-paid `confirmed` (deposit_paid has an outstanding
  // balance) and from an unauthorized `payment_pending` claim (deposit_paid carries a stamped PI +
  // deposit_paid=true). `total_amount`/`platformFee`/`providerEarnings` stay the FULL values — the
  // deposit/balance split is the PAYMENT SCHEDULE, not a re-split of the charge, so completion (D8)
  // and earnings math read the full amounts unchanged.
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }),   // charged NOW at deposit checkout (§14 server-derived)
  depositPaid: boolean("deposit_paid").default(false),
  balanceAmount: decimal("balance_amount", { precision: 10, scale: 2 }),   // = (total_amount + platform_fee) − deposit; collected at the SECOND checkout
  balancePaid: boolean("balance_paid").default(false),
  balanceDueAt: timestamp("balance_due_at"),                                // cutoff, derived at checkout from the listing's service date / change window
  // §19a: PI linkage — written ONLY by the shared promotion / balance-authorization paths, never
  // born on the row. Stripped in insertServiceBookingSchema (.omit) and in createServiceBooking.
  stripeDepositIntentId: varchar("stripe_deposit_intent_id", { length: 255 }),
  stripeBalanceIntentId: varchar("stripe_balance_intent_id", { length: 255 }),

  // Visa / specialty service metadata collected during booking intake
  bookingMetadata: jsonb("booking_metadata").default({}),

  // Attribution (S4): source vocabulary is direct | link | cross_sell, DERIVED SERVER-SIDE at
  // checkout (payments.routes.ts) — 'link' only when acquisitionRef resolves to a real
  // short_links.code (migration 139). App-enforced, no DB CHECK. acquisitionRef is a soft
  // reference (no FK) so deleting a link never breaks historical attribution.
  source: varchar("source", { length: 30 }).default("direct"),
  crossSellSourceContentId: varchar("cross_sell_source_content_id", { length: 255 }),
  acquisitionRef: varchar("acquisition_ref", { length: 12 }),
  // C3 (migration 145): the availability slot this booking claimed capacity on — stamped only
  // AFTER the atomic bookSlot claim succeeded at checkout. SET NULL on slot deletion; the
  // bookingDetails snapshot keeps the human-readable schedule regardless.
  slotId: varchar("slot_id").references(() => vendorAvailabilitySlots.id, { onDelete: "set null" }),

  // Idempotency: set by the client on checkout; checked server-side before insert.
  // Unique partial index (WHERE NOT NULL) prevents duplicate bookings on retries.
  // The index is DECLARED below — see the note on `sbIdempotencyKeyIdx`; leaving it in
  // migration SQL only is what made it non-durable across publishes.
  idempotencyKey: text("idempotency_key"),

  // Timestamps
  confirmedAt: timestamp("confirmed_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // §15 CHECKOUT IDEMPOTENCY — the DB half of the guard, and the reason this declaration
  // exists at all.
  //
  // This index was created by migration 096 and re-asserted by 155, but declared ONLY in
  // migration SQL. Per the CLAUDE.md deploy-push note, publish runs an automatic drizzle-kit
  // push from THIS FILE and is authoritative over objects it does not find declared here —
  // proven by isolating a bare `DROP INDEX "sb_idempotency_key_idx"` in a push plan. That made
  // the index NON-DURABLE in the worst possible way: publish 1 drops it and the (first-time)
  // migration recreates it, but publish 2+ drops it while both migrations are already stamped,
  // so it is never recreated and is silently, permanently gone.
  //
  // It is load-bearing, not belt-and-braces. `/api/checkout` has a SELECT fast-path that two
  // concurrent same-key requests BOTH pass; this unique index is the only thing that makes the
  // loser's insert raise 23505 before any Stripe call. Measured: without it, 3 concurrent
  // same-key checkouts produced 3 REAL STRIPE CHARGES; with it, 1.
  //
  // Safe to declare (verified in BOTH environments before adding, because a UNIQUE the push
  // cannot satisfy fails the deploy and offers the destructive "copy dev over production"
  // option): zero duplicate non-NULL keys in prod or dev, and the live `indexdef` in both is
  // byte-identical to what this emits — same name, same UNIQUE, same partial predicate. Any
  // divergence in name or predicate would make the push DROP and CREATE it on every publish.
  sbIdempotencyKeyIdx: uniqueIndex("service_bookings_idempotency_key_idx")
    .on(table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
}));

// === Service Reviews ===

export const serviceReviews = pgTable("service_reviews", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  bookingId: varchar("booking_id").notNull().references(() => serviceBookings.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  travelerId: varchar("traveler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1-5
  reviewText: text("review_text"),
  responseText: text("response_text"), // Provider response
  responseAt: timestamp("response_at"),
  // §06d (ratified Aug 9 2026): ONE public reply by the service owner; write-gated to the
  // listing's owner; rendered traveler-side beside the review; visible to admin
  // review-moderation.
  providerReply: text("provider_reply"),
  providerRepliedAt: timestamp("provider_replied_at"),
  isVerified: boolean("is_verified").default(false),
  // Moderation (REV-MOD)
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending | approved | flagged | removed
  flagReason: text("flag_reason"),
  moderatedBy: varchar("moderated_by", { length: 255 }),
  moderatedAt: timestamp("moderated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Review Moderation Logs ===
export const reviewModerationLogs = pgTable("review_moderation_logs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reviewId: varchar("review_id").notNull().references(() => serviceReviews.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 20 }).notNull(), // approve | flag | remove
  actorId: varchar("actor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === FAQ ===

export const faqs = pgTable("faqs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  attachment: text("attachment"), // File URL
  category: varchar("category", { length: 100 }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Wallets & Credits ===

export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  credits: integer("credits").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const creditTransactions = pgTable("credit_transactions", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  walletId: varchar("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  transactionType: varchar("transaction_type", { length: 20 }).notNull(), // "credit" or "debit"
  description: text("description"),
  referenceId: varchar("reference_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Vendors & Coordination ===

export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description"),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  website: varchar("website", { length: 500 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  priceRange: varchar("price_range", { length: 50 }),
  imageUrl: varchar("image_url", { length: 1000 }),
  status: varchar("status", { length: 30 }).default("active"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vendorAssignments = pgTable("vendor_assignments", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  serviceType: varchar("service_type", { length: 100 }).notNull(),
  status: varchar("status", { length: 30 }).default("pending"),
  notes: text("notes"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === Notifications ===

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // booking_request, booking_confirmed, message_received, review_received, etc.
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  relatedId: varchar("related_id", { length: 255 }), // ID of related entity (booking, message, etc.)
  relatedType: varchar("related_type", { length: 50 }), // booking, message, review, contract
  data: jsonb("data"), // Arbitrary payload e.g. { bookingId, serviceName, travelerName, amount }
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  // QA-2 (migration 209): nullable idempotency key for a notification event, shaped
  // `booking:<id>:<event>` (e.g. `booking:abc123:accepted`). NULL for every pre-209 row and every
  // caller that has not opted in (message/review/etc. notifications keep firing exactly as before).
  // A caller writing a durable, at-most-once notification (the booking-status canonical writer)
  // supplies this and relies on the partial UNIQUE index below + ON CONFLICT DO NOTHING so a
  // crash-retry of the SAME transition inserts zero duplicate rows. Declared here AND in migration
  // SQL (publish-trap rule — the migration-155/203 precedent).
  dedupeKey: varchar("dedupe_key", { length: 255 }),
}, (table) => ({
  // Migration 209 (QA-2): partial so legacy NULL rows (and any caller that never opts in) never
  // collide with each other — only two ACTUAL dedupe keys colliding is a conflict.
  dedupeKeyUniq: uniqueIndex("notifications_dedupe_key_uniq")
    .on(table.dedupeKey)
    .where(sql`${table.dedupeKey} IS NOT NULL`),
}));

// === Contact Submissions (landing page / contact page) ===

export const contactSubmissions = pgTable("contact_submissions", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  subject: varchar("subject", { length: 200 }).notNull(),
  message: text("message").notNull(),
  reason: varchar("reason", { length: 50 }), // general, support, partnership, press, feedback
  preferredContactMethod: varchar("preferred_contact_method", { length: 20 }), // email, phone
  source: varchar("source", { length: 50 }).default("contact_page"), // contact_page, landing, footer, etc.
  status: varchar("status", { length: 20 }).default("new"), // new, in_progress, resolved, archived
  assignedAdminId: varchar("assigned_admin_id").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  responseNotes: text("response_notes"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContactSubmissionSchema = createInsertSchema(contactSubmissions).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  status: true,
  assignedAdminId: true,
  responseNotes: true,
});
export type ContactSubmission = typeof contactSubmissions.$inferSelect;
export type InsertContactSubmission = z.infer<typeof insertContactSubmissionSchema>;

// === Shopping Cart ===

export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  guestSessionId: varchar("guest_session_id", { length: 64 }),
  serviceId: varchar("service_id").references(() => providerServices.id, { onDelete: "cascade" }),
  customVenueId: varchar("custom_venue_id").references(() => customVenues.id, { onDelete: "cascade" }),
  contentType: varchar("content_type", { length: 20 }),
  contentId: text("content_id"),
  contentMeta: jsonb("content_meta").default({}),
  experienceSlug: varchar("experience_slug", { length: 50 }),
  quantity: integer("quantity").default(1),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "set null" }),
  scheduledDate: timestamp("scheduled_date"),
  // C3 (migration 145): the traveler's picked availability slot. Nullable — non-dated services
  // and content items carry no slot. The capacity CLAIM happens at checkout (atomic bookSlot),
  // never at add-to-cart, so an abandoned cart can't hold a slot hostage.
  slotId: varchar("slot_id").references(() => vendorAvailabilitySlots.id, { onDelete: "set null" }),
  // The PROJECTION SOURCE KEY (migration 160, Trip-Canon Lane 1 W2). NULL = this cart row is NOT
  // a projection — a legacy row, a guest add, or a direct add-to-cart. NON-NULL = this row is the
  // materialized projection of one `itinerary_items` row currently in `ready_for_checkout`, owned
  // exclusively by server/services/cart-projection.service.ts (the single writer). The sync module
  // never reads, writes, or deletes a NULL-keyed row, which is what keeps every pre-existing cart
  // consumer byte-identical. ON DELETE CASCADE (not SET NULL — contrast itinerary_items.booking_id):
  // the projection has no independent existence, and an orphan would be uncleanable yet chargeable.
  itineraryItemId: varchar("itinerary_item_id").references(() => itineraryItems.id, { onDelete: "cascade" }),
  notes: text("notes"),
  // Travel-surcharge TRIGGER (ruling 81, lane B1, migration 205). The traveler's CONFIRMED pickup
  // location for this cart line — { address, lat, lng } — captured/confirmed at booking (geocoded
  // client-side via POST /api/geocode, same confirm posture as the meeting pin). NULL = no pickup
  // given ⇒ NO surcharge (§13 — a surcharge is NEVER triggered by an invented/defaulted location).
  // Written owner-gated via PATCH /api/cart/:id; read SERVER-SIDE at checkout/preview to derive the
  // surcharge (§14 — the coords are the traveler's own booking input, like scheduledDate/notes; the
  // AMOUNT is derived server-side from them + the listing config, never off req.body). Additive-
  // nullable jsonb, declared here per the publish-trap rule.
  pickupLocation: jsonb("pickup_location"),
  // Booking-eligibility TRIGGER-INPUT (ruling 83, lane T2, migration 206). The traveler's CONFIRMED
  // party count for this cart line — the input the D7 party-size gate (party_size_min/max on
  // provider_services, migration 195) validates against BEFORE any slot claim or charge. NULL = no
  // party count given ⇒ NO party-size gate (§13 — never gate on a fabricated count; cart_items.quantity
  // is the price-multiplier "number of the service", NOT a party count, so it is deliberately not
  // reused here). Written owner-gated via PATCH /api/cart/:id, read SERVER-SIDE at checkout — a booking
  // input like scheduledDate, never a money field (no amount/rate is derived from it). Additive-nullable
  // integer, declared here per the publish-trap rule.
  partySize: integer("party_size"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Declared here, not only in migration 160: per the CLAUDE.md deploy-push rule the publish-time
  // drizzle push is authoritative over objects absent from THIS file and will DROP an index that
  // exists only in migration SQL — after which the stamped migration never recreates it. This is
  // the sync module's ONLY lookup key ("find the projection row for this item").
  cartItemsItineraryItemIdIdx: index("idx_cart_items_itinerary_item_id").on(table.itineraryItemId),
}));

// === AI Blueprints ===

export const aiBlueprints = pgTable("ai_blueprints", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 30 }).notNull(),
  destination: varchar("destination", { length: 255 }),
  blueprintData: jsonb("blueprint_data").default({}),
  status: varchar("status", { length: 30 }).default("generated"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userAndExpertContracts = pgTable("user_and_expert_contracts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Ownership (migration 157). Until this landed the table had NO principal at all, which is
  // why its two live readers could not be gated — there was nothing to filter on.
  // `earner_id`, not `expert_id`: the counterparty is the owner of the booked service, who may
  // be an `expert` OR a `service_provider`, so the table-name-matching `expert_id` would be
  // false for every provider-owned booking (the role-vocabulary-audit class of error).
  // Nullable by design — a row we cannot attribute stays NULL, and the read gate treats NULL
  // as admin-only rather than showing an unattributable financial artifact to a guessing caller.
  travelerId: varchar("traveler_id").references(() => users.id, { onDelete: "set null" }),
  earnerId: varchar("earner_id").references(() => users.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  tripTo: varchar("trip_to", { length: 255 }).notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending"),
  isPaid: boolean("is_paid").default(false),
  paymentUrl: text("payment_url"),
  attachment: text("attachment"), // URL
  createdAt: timestamp("created_at").defaultNow(),
});

export const submitItineraryFeedbacks = pgTable("submit_itinerary_feedbacks", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contractId: varchar("contract_id").references(() => userAndExpertContracts.id, { onDelete: "cascade" }),
  attachment: text("attachment"), // URL
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  location: varchar("location", { length: 200 }).notNull(),
  status: varchar("status", { length: 10 }).default("pending"), // Enum: feedbackStatusEnum
  createdAt: timestamp("created_at").defaultNow(),
});

export const userAndExpertChats = pgTable("user_and_expert_chats", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id").references(() => users.id, { onDelete: "cascade" }),
  contractId: varchar("contract_id").references(() => userAndExpertContracts.id, { onDelete: "cascade" }),
  message: text("message"),
  attachment: text("attachment"), // URL
  itinerarySubmitId: varchar("itinerary_submit_id").references(() => submitItineraryFeedbacks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  readAt: timestamp("read_at"),
});


// === AI Itinerary Optimization ===

export const itineraryVariantStatusEnum = ["pending", "generating", "generated", "failed", "selected"] as const;
export const itineraryVariantSourceEnum = ["user", "ai_optimized"] as const;

export const itineraryComparisons = pgTable("itinerary_comparisons", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userExperienceId: varchar("user_experience_id").references(() => userExperiences.id, { onDelete: "cascade" }),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  destination: varchar("destination", { length: 255 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  travelers: integer("travelers").default(1),
  experienceTypeSlug: varchar("experience_type_slug", { length: 50 }),
  status: varchar("status", { length: 30 }).default("pending"),
  selectedVariantId: varchar("selected_variant_id"),
  optimizedAt: timestamp("optimized_at"),
  optimizationPaymentId: varchar("optimization_payment_id", { length: 255 }),
  // WP-C follow-up (docs/briefs/TRIP_SEGMENTATION_DESIGN.md §5b Phase 1, migration 183):
  // recommendation-only output of `proposeSegmentation` (server/services/trip-segmentation.service.ts)
  // for this optimize run — strategy/rationale/segments/unplaced, shown to the traveler. NULL = no
  // recommendation computed (predates the engine's wiring, or the computation failed and was
  // logged-and-omitted per §15b — a segmentation failure must never fail the paid optimize). Never
  // read for a money/ownership decision; no materialization in this wave (no trip_segments, no
  // apply action). Sole writer: server/itinerary-optimizer.ts's generateOptimizedItineraries.
  segmentationProposal: jsonb("segmentation_proposal"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === Optimization Fee Tiers ===
// CON-A.P2 (FEE-A): keyed by (complexity_tier, event_type). event_type IS NULL = tier-level
// default. Non-null event_type = admin override for that experience type (e.g. wedding $49.99). // fee-literal-ok: schema comment describing band name, fees resolve from config
// is_disabled = "$0=off" semantic per §4.8 — explicit disable, distinct from a $0 price.
export const optimizationFees = pgTable("optimization_fees", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  complexityTier: varchar("complexity_tier", { length: 20 }).notNull(), // simple | standard | complex
  eventType: varchar("event_type", { length: 50 }), // null = tier-level default; non-null = per-event-type override
  priceCents: integer("price_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  isDisabled: boolean("is_disabled").notNull().default(false), // $0=off per §4.8
  updatedBy: varchar("updated_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOptimizationFeeSchema = createInsertSchema(optimizationFees).omit({ id: true, createdAt: true, updatedAt: true });
export type OptimizationFee = typeof optimizationFees.$inferSelect;
export type InsertOptimizationFee = z.infer<typeof insertOptimizationFeeSchema>;

export const itineraryVariants = pgTable("itinerary_variants", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  comparisonId: varchar("comparison_id").notNull().references(() => itineraryComparisons.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  source: varchar("source", { length: 30 }).default("user"),
  status: varchar("status", { length: 30 }).default("pending"),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }),
  totalTravelTime: integer("total_travel_time"),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }),
  freeTimeMinutes: integer("free_time_minutes"),
  optimizationScore: integer("optimization_score"),
  aiReasoning: text("ai_reasoning"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const itineraryVariantItems = pgTable("itinerary_variant_items", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  variantId: varchar("variant_id").notNull().references(() => itineraryVariants.id, { onDelete: "cascade" }),
  providerServiceId: varchar("provider_service_id").references(() => providerServices.id, { onDelete: "set null" }),
  dayNumber: integer("day_number").notNull(),
  timeSlot: varchar("time_slot", { length: 50 }),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  serviceType: varchar("service_type", { length: 50 }),
  price: decimal("price", { precision: 10, scale: 2 }),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  location: varchar("location", { length: 255 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  duration: integer("duration"),
  travelTimeFromPrevious: integer("travel_time_from_previous"),
  isReplacement: boolean("is_replacement").default(false),
  replacementReason: text("replacement_reason"),
  metadata: jsonb("metadata").default({}),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const itineraryVariantMetrics = pgTable("itinerary_variant_metrics", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  variantId: varchar("variant_id").notNull().references(() => itineraryVariants.id, { onDelete: "cascade" }),
  metricKey: varchar("metric_key", { length: 50 }).notNull(),
  metricLabel: varchar("metric_label", { length: 100 }).notNull(),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 30 }),
  betterIsLower: boolean("better_is_lower").default(true),
  comparison: varchar("comparison", { length: 50 }),
  improvementPercentage: decimal("improvement_percentage", { precision: 5, scale: 2 }),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Experience Types & Templates ===

export const experienceTypeSlugEnum = [
  "travel", "wedding", "proposal", "romance", "birthday", "corporate", "boys-trip", "girls-trip",
  "date-night", "corporate-events", "reunions", "wedding-anniversaries", "retreats", "baby-shower",
  "graduation-party", "engagement-party", "housewarming-party", "retirement-party",
  "career-achievement-party", "farewell-party", "holiday-party"
] as const;

export const experienceTypes = pgTable("experience_types", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 100 }).notNull().unique(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }), // Lucide icon name
  color: varchar("color", { length: 20 }), // Brand color for this experience
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  // Logistics Intelligence Fields
  paymentFlowType: varchar("payment_flow_type", { length: 50 }), // group_split, joint, single_payer, multi_stakeholder, individual_with_discount
  paymentComplexity: varchar("payment_complexity", { length: 20 }), // low, medium, high, very_high
  timingComplexity: varchar("timing_complexity", { length: 20 }), // low, medium, high, very_high, extreme
  contingencyLevel: varchar("contingency_level", { length: 20 }), // flexible, important, critical
  typicalGroupSizeMin: integer("typical_group_size_min"),
  typicalGroupSizeMax: integer("typical_group_size_max"),
  typicalDurationMinDays: integer("typical_duration_min_days"),
  typicalDurationMaxDays: integer("typical_duration_max_days"),
  // Hero card configuration — DB-driven (P462)
  headcountLabel: varchar("headcount_label", { length: 50 }),       // singular unit e.g. "guest" | "traveler" | "attendee"
  showOriginCity: varchar("show_origin_city", { length: 10 }).default("optional"), // "hide" | "optional" | "required"
  showKids: boolean("show_kids").default(true),
  locationLabel: varchar("location_label", { length: 100 }),
  heroImage: text("hero_image"),
  contextFields: jsonb("context_fields").default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const experienceTemplateSteps = pgTable("experience_template_steps", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  experienceTypeId: varchar("experience_type_id").notNull().references(() => experienceTypes.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  name: varchar("name", { length: 100 }).notNull(), // "Venue", "Catering", "Photography"
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  serviceCategories: jsonb("service_categories").default([]), // Links to which service categories apply
  isRequired: boolean("is_required").default(false),
  fields: jsonb("fields").default([]), // Custom form fields for this step
  createdAt: timestamp("created_at").defaultNow(),
});

export const expertExperienceTypes = pgTable("expert_experience_types", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  experienceTypeId: varchar("experience_type_id").notNull().references(() => experienceTypes.id, { onDelete: "cascade" }),
  proficiencyLevel: varchar("proficiency_level", { length: 20 }).default("intermediate"), // beginner, intermediate, expert
  yearsExperience: integer("years_experience").default(0),
  portfolioUrl: text("portfolio_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Expert Service Categories & Offerings (from backend seeder) ===

export const expertServiceCategories = pgTable("expert_service_categories", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isDefault: boolean("is_default").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const expertServiceOfferings = pgTable("expert_service_offerings", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  categoryId: varchar("category_id").notNull().references(() => expertServiceCategories.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  isDefault: boolean("is_default").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  // Migration 016: role-scoped templates
  // NULL = shown to all expert roles; array = scoped to listed role(s)
  targetRoles: text("target_roles").array(),
  // NOTE: expertId, externalId, status, submittedAt, reviewedAt, reviewedBy, rejectionReason,
  // duration, deliverables, cancellationPolicy, leadTime, imageUrl, galleryImages, experienceTypes,
  // isActive, categoryName, updatedAt were all dropped in migration 013.
  // All ESO rows are platform templates; expert-owned services live in provider_services.
});


// Expert specializations (Budget, Luxury, Adventure, etc.)
export const expertSpecializationEnum = [
  "budget_travel", "luxury_experiences", "adventure_outdoor", "cultural_immersion",
  "family_friendly", "solo_travel", "food_wine", "photography_tours",
  "honeymoon", "wellness_retreat", "group_travel", "backpacking"
] as const;

export const expertSpecializations = pgTable("expert_specializations", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  specialization: varchar("specialization", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Expert Custom Services ===
// DB table dropped in migration 013 (data migrated to provider_services in 012).
// pgTable definition removed — migration confirmed; Drizzle no longer needs the
// stub to avoid proposing DROP TABLE. Types/Zod schema kept below for storage adapter.

// === Influencer Referral Tracking ===
export const influencerReferralStatusEnum = ["pending", "converted", "paid", "expired"] as const;

export const influencerReferrals = pgTable("influencer_referrals", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  influencerId: varchar("influencer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referralCode: varchar("referral_code", { length: 50 }).notNull(),
  referredUserId: varchar("referred_user_id").references(() => users.id, { onDelete: "set null" }),
  bookingId: varchar("booking_id"), // Can reference contracts or bookings
  status: varchar("status", { length: 20 }).default("pending"), // pending, converted, paid, expired
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).default("10.00"), // Percentage
  commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }),
  bookingAmount: decimal("booking_amount", { precision: 10, scale: 2 }),
  paidAt: timestamp("paid_at"),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata").default({}), // Additional tracking data
  createdAt: timestamp("created_at").defaultNow(),
});

// Influencer curated content/collections
export const influencerCuratedContent = pgTable("influencer_curated_content", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  influencerId: varchar("influencer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // Food & Drink, Destinations, Tips, etc.
  contentType: varchar("content_type", { length: 50 }).default("guide"), // guide, collection, itinerary, tips
  platform: varchar("platform", { length: 50 }), // instagram, youtube, tiktok, blog
  externalUrl: text("external_url"), // Link to original content
  imageUrl: text("image_url"),
  destinations: jsonb("destinations").default([]), // Cities/countries featured
  experiences: jsonb("experiences").default([]), // Experience types covered
  tags: jsonb("tags").default([]),
  viewCount: integer("view_count").default(0),
  saveCount: integer("save_count").default(0),
  isFeatured: boolean("is_featured").default(false),
  isActive: boolean("is_active").default(true),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// TripContext server persistence (migration 130, Trip-Strip P2/E2; re-keyed by migration
// 161, Trip-Canon Lane 6): mirrors the client sessionStorage trip context for signed-in
// users. A `user_id`-only PK could hold only one row per user, so it could never let
// context follow a SPECIFIC trip once the Trip became the canonical planning container
// (Lane 1) — a user planning two trips at once had their context smeared across both.
// Re-keyed onto a surrogate `id` PK; `tripId` NULL = the legacy "no active trip" row
// (migration 130's original one-row-per-user meaning, preserved verbatim for every
// pre-migration row), non-NULL = a context scoped to that specific trip. The "one row per
// scope" invariant now lives in the two partial unique indexes below rather than the PK,
// because Postgres treats NULL as distinct in a unique index — a bare
// UNIQUE(userId, tripId) would let a user accumulate unlimited legacy rows.
export const tripContexts = pgTable("trip_contexts", {
  // DB-side default is LOAD-BEARING (the shortLinks / ai_cost_tracking posture, NOT the house
  // $defaultFn pattern): this table is written via raw db.execute(sql`…`) which never supplies
  // `id`, so the default must exist in the database itself — and it must be DECLARED here or the
  // deploy push treats it as drift and drops it (the sb_idempotency_key_idx lesson), after which
  // every trip-context PUT would violate NOT NULL.
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  context: jsonb("context").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // At most one legacy (tripId IS NULL) row per user — migration 130's original invariant.
  userLegacyUidx: uniqueIndex("trip_contexts_user_legacy_uidx")
    .on(table.userId)
    .where(sql`${table.tripId} IS NULL`),
  // At most one row per (userId, tripId) once trip-scoped.
  userTripUidx: uniqueIndex("trip_contexts_user_trip_uidx")
    .on(table.userId, table.tripId)
    .where(sql`${table.tripId} IS NOT NULL`),
  // Ownership checks / trip-scoped lookups filter by tripId alone.
  tripIdIdx: index("idx_trip_contexts_trip_id").on(table.tripId),
}));

export const userExperiences = pgTable("user_experiences", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  experienceTypeId: varchar("experience_type_id").notNull().references(() => experienceTypes.id, { onDelete: "cascade" }),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }),
  status: varchar("status", { length: 20 }).default("draft"), // draft, planning, confirmed, completed, cancelled
  eventDate: date("event_date"),
  location: varchar("location", { length: 255 }),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  guestCount: integer("guest_count"),
  preferences: jsonb("preferences").default({}), // Experience-specific preferences
  stepData: jsonb("step_data").default({}), // Data collected from each wizard step
  currentStep: integer("current_step").default(1),
  mapData: jsonb("map_data").default({}), // Location coordinates for map display
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userExperienceItems = pgTable("user_experience_items", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userExperienceId: varchar("user_experience_id").notNull().references(() => userExperiences.id, { onDelete: "cascade" }),
  stepId: varchar("step_id").references(() => experienceTemplateSteps.id, { onDelete: "set null" }),
  providerServiceId: varchar("provider_service_id").references(() => providerServices.id, { onDelete: "set null" }),
  externalServiceData: jsonb("external_service_data").default({}), // For SERP API results
  isExternal: boolean("is_external").default(false), // True if from SERP API
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }),
  scheduledDate: timestamp("scheduled_date"),
  scheduledTime: varchar("scheduled_time", { length: 20 }),
  location: varchar("location", { length: 255 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  status: varchar("status", { length: 20 }).default("pending"), // pending, confirmed, completed, cancelled
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Relations ===

export const tripsRelations = relations(trips, ({ one, many }) => ({
  user: one(users, { fields: [trips.userId], references: [users.id] }),
  generatedItinerary: one(generatedItineraries, { fields: [trips.id], references: [generatedItineraries.tripId] }),
  places: many(tripSelectedPlaces),
  hotels: many(tripSelectedHotels),
  services: many(tripSelectedServices),
  flights: many(tripSelectedFlights),
  otherServices: many(tripOtherServices),
  affiliateTrip: one(affiliateTrips, { fields: [trips.id], references: [affiliateTrips.tripId] }),
}));

export const generatedItinerariesRelations = relations(generatedItineraries, ({ one }) => ({
  trip: one(trips, { fields: [generatedItineraries.tripId], references: [trips.id] }),
}));

// === Schemas ===

// Enhanced trip schema with better validations (simpler version for compatibility)
export const insertTripSchema = createInsertSchema(trips).omit({ 
  id: true, 
  userId: true, 
  createdAt: true, 
  updatedAt: true 
}).extend({
  title: z.string().min(1, "Title is required").max(255),
  destination: z.string().min(1, "Destination is required").max(255),
  numberOfTravelers: z.coerce.number().int().min(1).default(1),
  adults: z.coerce.number().int().min(1).default(2),
  kids: z.coerce.number().int().min(0).default(0),
});
export const insertGeneratedItinerarySchema = createInsertSchema(generatedItineraries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReviewRatingSchema = createInsertSchema(reviewRatings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserAndExpertChatSchema = createInsertSchema(userAndExpertChats).omit({ id: true, createdAt: true });
export const insertTouristPlaceResultSchema = createInsertSchema(touristPlaceResults).omit({ id: true });
export const insertHelpGuideTripSchema = createInsertSchema(helpGuideTrips).omit({ id: true, userId: true, createdAt: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVendorAssignmentSchema = createInsertSchema(vendorAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiBlueprintSchema = createInsertSchema(aiBlueprints).omit({ id: true, createdAt: true });

// New schemas for Expert/Provider applications
export const insertLocalExpertFormSchema = createInsertSchema(localExpertForms).omit({
  id: true,
  userId: true,
  status: true,
  rejectionMessage: true,
  createdAt: true,
  // Admin-managed influencer fields (set by backend after verification)
  verifiedInfluencer: true,
  influencerTier: true,
  referralCode: true,
  // MI-1 class sweep (provider money-hardening lane, ruling 42): the rate/fee-bearing and
  // payment-identity families on this table were mass-assignable — `insertLocalExpertFormSchema
  // .parse(req.body)` is spread verbatim into create/update at POST /api/expert-application and
  // POST /api/expert-forms (server/routes.ts), so any authenticated applicant could set their own
  // booking-fee rate, their Stripe Connect linkage, and their earnings/payout balances. No client
  // sends any of them and no server code reads them today (dormant), which is exactly why it had
  // not surfaced — the ruling is that a rate-bearing field is never client-settable on ANY schema,
  // consumer or not. These are server/admin-managed, same posture as the influencer block above.
  bookingFeeType: true,
  bookingFeePercentage: true,
  bookingFeeFixed: true,
  bookingFeeHourly: true,
  minBookingFee: true,
  feeSettings: true,
  stripeAccountId: true,
  stripeAccountStatus: true,
  stripeConnectStatus: true,
  canReceivePayments: true,
  totalEarnings: true,
  pendingPayout: true,
  payoutSchedule: true,
}).extend({
  // Role-vocabulary audit (Jul 27, 2026): expertType MUST be validated against the enum.
  // The admin approval path copies expertType into users.role verbatim, so an unvalidated
  // free string here was a privilege-escalation vector (submit expertType "admin", get
  // approved as an expert, become an admin) and how stray "service_provider" values
  // polluted local_expert_forms. The varchar column has no DB CHECK — this is the gate.
  expertType: z.enum(expertTypeEnum).optional(),
}).superRefine((data, ctx) => {
  // CC-5 (minimum-content gate): every field on this schema is independently optional, so an
  // empty `{}` body previously parsed clean and created a fully-valid PENDING application —
  // flooding the admin review queue with contentless rows. This closes that without rejecting
  // any real submission:
  //   - expertType is always required. The client (client/src/pages/travel-experts.tsx)
  //     always sends it — it defaults from the URL `type` param, itself defaulted to
  //     "travel_expert" — so no legitimate submission omits it.
  //   - Beyond that, SOME identifying content is required: either an expertise signal
  //     (destinations/specialties/experienceTypes, guaranteed non-empty by the default
  //     (travel_expert/event_planner/executive_assistant) flow's canProceed() step-2 gate;
  //     or localSpecialties, guaranteed non-empty by the local_expert flow's step-4 gate —
  //     the local_expert flow NEVER populates destinations/specialties/experienceTypes, so
  //     those three alone would wrongly reject every real local_expert submission) OR a
  //     filled-in city+country pair. city/country are intentionally NOT hard-required on
  //     their own: travel-experts.tsx's canProceed() never gates on either field for the
  //     default flow, and only gates on city (never country) for the local_expert flow, so
  //     requiring them unconditionally would reject real in-flight submissions. Existing
  //     regression fixtures (N11 in journey-suite-negatives.http.test.ts; K1 in
  //     console-sigma-kyoto-bench.http.test.ts) submit city+country with no expertise arrays
  //     and expect success — city+country-together is treated as an alternative satisfying
  //     condition, not an extra unconditional requirement.
  const isNonEmptyArr = (v: unknown) => Array.isArray(v) && v.length > 0;
  const isNonEmptyStr = (v: unknown) => typeof v === "string" && v.trim().length > 0;

  if (!isNonEmptyStr(data.expertType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expertType"],
      message: "expertType is required",
    });
  }

  const hasExpertiseContent =
    isNonEmptyArr(data.destinations) ||
    isNonEmptyArr(data.specialties) ||
    isNonEmptyArr(data.experienceTypes) ||
    isNonEmptyArr(data.localSpecialties);
  const hasLocation = isNonEmptyStr(data.city) && isNonEmptyStr(data.country);

  if (!hasExpertiseContent && !hasLocation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destinations"],
      message:
        "Application must include at least one destination, specialty, experience type, or local specialty, or both a city and country",
    });
  }
});
export const insertServiceProviderFormSchema = createInsertSchema(serviceProviderForms).omit({ id: true, userId: true, status: true, rejectionMessage: true, createdAt: true });
export const insertServiceCategorySchema = createInsertSchema(serviceCategories).omit({ id: true, createdAt: true });
export const insertServiceSubcategorySchema = createInsertSchema(serviceSubcategories).omit({ id: true, createdAt: true });
// MI-1 (provider money-hardening lane, ruling 42): `revenueShareRate` is a COMMISSION SPLIT and is
// therefore NOT client-settable — this is layer 1 of the strip-and-clamp. It was previously exposed
// here, parsed straight off `req.body` by POST/PATCH /api/provider/services, spread into the row, and
// read at `payments.routes.ts` as "the final override (takes priority over config)" over the
// fee_bands-resolved split at the real Stripe charge — a client-supplied rate reaching a payment
// decision (§14 in substance, §8 in spirit). No UI ever sent it. Layer 2 is the storage-level
// derivation in `createProviderService`/`updateProviderService`, so every caller is covered.
// D8/ruling 66: `deliverableUploadedAt` joins the omit list (§18 layer 1). It is the clock the
// pdf auto-complete timer measures from — a client-settable, backdatable value would fire a
// completion event, and mint a held earning, on a booking whose deliverable never existed. The
// storage strip-and-derive in `updateProviderService` is layer 2, so every caller is covered.
export const insertProviderServiceSchema = createInsertSchema(providerServices).omit({ id: true, userId: true, formStatus: true, bookingsCount: true, totalRevenue: true, averageRating: true, reviewCount: true, createdAt: true, updatedAt: true, revenueShareRate: true, deliverableUploadedAt: true }).extend({
  // X1: app-enforced vocabulary (migration 144 has no DB CHECK) — reject anything outside the set here.
  cancellationPolicyType: z.enum(cancellationPolicyTypeEnum).nullable().optional(),
  // EX-2 (expert walkthrough, docs/testing/EXPERT_UX_WALKTHROUGH.md): a NEGATIVE price is never
  // valid on any path — POST and PATCH /api/provider/services both parse this schema, and both
  // persisted price=-50 straight to a row (even at status=active/approval_status=submitted).
  // Field-level so it survives `.partial()` on the PATCH path. ZERO is deliberately allowed here:
  // a fresh ServiceForm draft legitimately sends "0" (price not set yet) — the "no zero-price
  // listing goes LIVE" half is the publish gate in the route handlers, beside the meeting-point
  // gate, where draft saves are exempt by the same rule.
  price: z.string().nullish().refine(
    (v) => v == null || (Number.isFinite(Number(v)) && Number(v) >= 0),
    { message: "Price must be a non-negative number" },
  ),
  // ── D7 (ruling 62, migration 195): app-enforced vocabularies + shape floors ─────────────────
  // No DB CHECK exists for any of these (publish-trap posture), so THIS is the enforcement.
  // Field-level so every refinement survives `.partial()` on the PATCH path — the update path is
  // checked as hard as the insert (§18 rule 2, applied by analogy to a non-privileged field).
  transportProvision: z.enum(transportProvisionEnum).nullable().optional(),
  pickupCoverageMode: z.enum(pickupCoverageModeEnum).nullable().optional(),
  durationMinutes: z.coerce.number().int().min(0).max(10080).nullable().optional(),
  bufferMinutes: z.coerce.number().int().min(0).max(1440).nullable().optional(),
  earliestStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)").nullable().optional(),
  latestStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)").nullable().optional(),
  serviceTimezone: z.string().trim().min(1).max(64).nullable().optional(),
  partySizeMin: z.coerce.number().int().min(0).max(10000).nullable().optional(),
  partySizeMax: z.coerce.number().int().min(0).max(10000).nullable().optional(),
  changeCutoffHours: z.coerce.number().int().min(0).max(8760).nullable().optional(),
  canAnchor: z.boolean().nullable().optional(),
  // ── S9 session/async fields (ledger row 102, migration 212) ────────────────────────────────
  // No DB CHECK exists for either (publish-trap posture), so THIS is the enforcement, and
  // field-level so both survive `.partial()` on the PATCH path (the update path is checked as
  // hard as the insert). Neither is a §14/§18/§19-privileged field — ordinary owner-authored
  // listing config, like the D7 block above — so they are NOT omitted.
  //
  // `joinLink` gets a BASIC URL-shape check only (https?://…), the same free-text-with-a-floor
  // posture as meetingPoint/pickupAddress elsewhere on this table — reject garbage, don't
  // over-constrain. The SENSITIVE half of this field (never reaching a public read; revealed only
  // to the confirmed traveler + owning provider) is enforced on the READ side (server/routes.ts,
  // server/routes/content.routes.ts, server/storage.ts), not here — this schema only governs the
  // WRITE shape.
  joinLink: z.string().trim().max(2048).nullable().optional().refine(
    (v) => v == null || v === "" || /^https?:\/\/.+/i.test(v),
    { message: "Join link must be a URL starting with http:// or https://" },
  ),
  responseWindowHours: z.coerce.number().int().min(1).max(8760).nullable().optional(),
  // Same free-text-with-a-floor posture as houseRules (S8, beside it on this table): an SLA/promise
  // statement is prose, not unbounded storage. Added at Wave-3 integration (the lane shipped the
  // column without a length ceiling).
  scopeStatement: z.string().max(10000).nullable().optional(),
  // ── SS-4 + SS-6 (ruling 69 disposition 9, migration 199) ────────────────────────────────────
  // Same treatment as the D7 block above and for the same reason: no DB CHECK exists (publish-trap
  // posture), so THIS is the enforcement, and field-level so it survives `.partial()` on PATCH.
  // Neither is privileged (§18 rule 3 does not apply — no amount, no identity, no rate), so they
  // are ordinary wizard fields, NOT omitted.
  pickupRadiusKm: z.coerce.number().int().min(0).max(10000).nullable().optional(),
  // Array of language NAMES, matching `local_expert_forms.languages`. `null` is preserved as
  // "never captured" and `[]` as "deliberately cleared" — the two must not collapse (§13).
  deliveryLanguages: z.array(z.string().trim().min(1).max(60)).max(20).nullable().optional(),
  // ── Deposits CONFIG (Lane 7, ruling 72) — owner listing config, NOT a §18 rate ──────────────
  // App-enforced vocabulary + shape floors (no DB CHECK, migration-200 posture); field-level so
  // each refinement survives `.partial()` on the PATCH path (the update path is checked as hard as
  // the insert). These are ordinary wizard fields (no amount/identity/rate reaching a MONEY
  // DECISION on the config write — the deposit is derived server-side at checkout from the
  // persisted row), so they are NOT omitted.
  depositEnabled: z.boolean().nullable().optional(),
  depositType: z.enum(depositTypeEnum).nullable().optional(),
  depositPercentage: z.coerce.number().int().min(1).max(100).nullable().optional(),
  depositFlatAmount: z.string().nullish().refine(
    (v) => v == null || (Number.isFinite(Number(v)) && Number(v) >= 0),
    { message: "Deposit amount must be a non-negative number" },
  ),
  // ── Card display options (ruling 74/75, migration 202) — app-enforced vocabulary, no DB CHECK ──
  // Field-level so the bookingMode enum survives `.partial()` on the PATCH path (the update path is
  // checked as hard as the insert). These are ordinary owner display prefs (no amount/identity/rate),
  // so — like the deposit CONFIG above — they are NOT omitted; the money guard's rate/identity
  // predicates do not match `showPrice`/`bookingMode`.
  showPrice: z.boolean().nullable().optional(),
  bookingMode: z.enum(bookingModeEnum).nullable().optional(),
  // ── Travel surcharge CONFIG (ruling 81, lane B1, migration 205) — owner listing config, NOT a §18 rate ──
  // App-enforced vocabulary + non-negative shape floors (no DB CHECK, migration-205 publish-trap
  // posture); field-level so each refinement survives `.partial()` on the PATCH path (the update path
  // is checked as hard as the insert). These set the LISTING config only — no amount/identity/rate
  // reaches a MONEY DECISION on this write (the surcharge is derived server-side at checkout from the
  // persisted row + the traveler's pickup) — so they are ordinary wizard fields, NOT omitted, exactly
  // like the deposit CONFIG above. The `surchargeFlatAmount`/`surchargePerKm` names are deliberately
  // not a bare `amount`/`rate` so the money gate does not misread them.
  surchargeMode: z.enum(surchargeModeEnum).nullable().optional(),
  surchargeFlatAmount: z.string().nullish().refine(
    (v) => v == null || (Number.isFinite(Number(v)) && Number(v) >= 0),
    { message: "Travel surcharge amount must be a non-negative number" },
  ),
  surchargePerKm: z.string().nullish().refine(
    (v) => v == null || (Number.isFinite(Number(v)) && Number(v) >= 0),
    { message: "Per-km surcharge rate must be a non-negative number" },
  ),
  surchargeMaxKm: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  // ── S8 property builder (Gate G2, migration 211) ────────────────────────────────────────────
  // App-enforced vocabulary + shape floors (no DB CHECK, migration-211 publish-trap posture);
  // field-level so each refinement survives `.partial()` on the PATCH path (update checked as
  // hard as insert). Ordinary owner-authored listing facts — no amount/identity/rate reaches a
  // money decision — so NOT omitted, exactly like deliveryLanguages/cancellationPolicy beside them.
  checkInTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)").nullable().optional(),
  checkOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)").nullable().optional(),
  houseRules: z.string().max(10000).nullable().optional(),
  // `null` is preserved as "never captured" and `[]` as "deliberately cleared" — the two must
  // not collapse (§13), the same rule deliveryLanguages already states above.
  amenities: z.array(z.string().trim().min(1).max(60)).max(50).nullable().optional(),
  // Ruling 112 Q6 (migration 214): a declared minimum stay is at least one night; NULL stays
  // "never captured" (no guessed default, §13).
  minStayNights: z.coerce.number().int().min(1).max(365).nullable().optional(),
});
export const insertFaqSchema = createInsertSchema(faqs).omit({ id: true, createdAt: true });
export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({ id: true, createdAt: true });

// Service Templates, Bookings, Reviews schemas
export const insertServiceTemplateSchema = createInsertSchema(serviceTemplates).omit({ id: true, usageCount: true, averageRating: true, createdAt: true });
// travelerId and providerId are set server-side from auth context and service lookup.
//
// ── PS15 (ruling 46) — `stripePaymentIntentId` is a SERVER_VERIFIED_ACTORS-only field ─────────
// Ruling 41 states the invariant as PROVENANCE, not transport: a PaymentIntent id may resolve or
// stamp a booking only when the platform itself obtained it from Stripe as a verified actor, and
// "a CLIENT-supplied PaymentIntent id may never resolve or stamp anything." This schema was
// `.parse`d straight off `req.body` at POST /api/bookings and the result SPREAD into
// `createServiceBooking`, so a crafted request could BIRTH a booking already carrying its own PI —
// which ruling 41's clause forbids on the promotion side but had no counterpart on the birth side.
// A born-stamped row is not a promotion, so it never trips N17c; it is simply a row that looks
// authorized to every consumer that keys on this column (the sweep skips it, `promotePaidCheckout`
// matches it, the drift job trusts it as linkage).
//
// This is layer 1 of the strip. Safe to omit outright — verified at 281d355c that NO caller of
// `createServiceBooking` passes it: `payments.routes.ts:926` (checkout) and `routes.ts:1430` both
// omit it, and the column's SOLE production writer is `stampAuthorization`
// (`checkout-claim.service.ts:177`), an atomic conditional UPDATE that runs after the Stripe call.
// (The audit's PS15 note cautioned that this omit list is load-bearing for the `InsertServiceBooking`
// TYPE that checkout writes — true of `platformFee`/`insuranceFee`/`providerEarnings`/`status`,
// which checkout DOES pass, and NOT true of this field. Those are handled by the route-level
// allowlist at POST /api/bookings instead.) Layer 2 is the storage-level strip in
// `createServiceBooking`, so every caller is covered.
export const insertServiceBookingSchema = createInsertSchema(serviceBookings).omit({
  id: true,
  travelerId: true,  // Set server-side from authenticated user
  providerId: true,  // Set server-side from service lookup
  stripePaymentIntentId: true,  // PS15/ruling 46 — server-verified actors only, via stampAuthorization
  // Lane 7 (ruling 72): the deposit/balance PI linkage columns are the same class as
  // stripePaymentIntentId — written ONLY by the shared promotion / balance-authorization paths
  // (§19a), never born on the row. Stripped here (layer 1) and in createServiceBooking (layer 2).
  stripeDepositIntentId: true,
  stripeBalanceIntentId: true,
  confirmedAt: true,
  completedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true
});
// ── PS15 (ruling 46): POST /api/bookings admits an ALLOWLIST, not a denylist ────────────────────
// `POST /api/bookings` (server/routes.ts) used to `insertServiceBookingSchema.parse(req.body)` and
// SPREAD the result into `createServiceBooking`. That schema is `.omit()`-based — a DENYLIST — so
// every column its omit list did not happen to name was client-settable BY CONSTRUCTION:
// `stripePaymentIntentId` (ruling 41's immovable clause; now also stripped above and in storage),
// `platformFee`, `insuranceFee`, `providerEarnings`, `totalAmount`, `status`, `idempotencyKey`,
// `slotId`, `source`, `acquisitionRef`, `trackingNumber`, `crossSellSourceContentId`.
//
// A denylist schema fails OPEN: the day a privileged column is added to `service_bookings`, it is
// reachable from that body until someone remembers to omit it — and nobody edits an omit list for a
// column that did not exist when it was written. That is the standing class ruling 46 records, third
// instance (`revenueShareRate`, the MI-1 sweep's dormant fee/payout family, this). A pick-based
// schema fails CLOSED: a new column is unreachable until it is deliberately named here.
//
// NOT admitted, and why each one: `status` (this rail creates a booking REQUEST, born `pending` from
// the column default — it must never birth a `payment_pending` claim, §15b, a state that belongs to
// `checkout-claim.service.ts`); `idempotencyKey`/`slotId` (the checkout spine's own claim machinery,
// §15/§18c); the amount family and `stripePaymentIntentId` (§14 and rulings 41+46 — server-derived
// or server-written, never proposed by a caller).
//
// EXTEND DELIBERATELY. `booking-birth-provenance.db.test.ts` B6 asserts this exact key set, so
// widening it is a decision someone makes on purpose rather than a column that leaks in from
// elsewhere. (Note for the guard's negative space: `scripts/check-money-endpoints.cjs` detects
// body-parsed schemas by the `insert*Schema` NAME, so a derived schema like this one is outside its
// parse pass — B6 is what covers it.)
export const createBookingRequestSchema = insertServiceBookingSchema.pick({
  serviceId: true,
  tripId: true,
  contractId: true,
  bookingDetails: true,
  bookingMetadata: true,
});

export const insertServiceReviewSchema = createInsertSchema(serviceReviews).omit({ id: true, responseText: true, responseAt: true, providerReply: true, providerRepliedAt: true, createdAt: true, status: true, flagReason: true, moderatedBy: true, moderatedAt: true }).extend({
  rating: z.number().int().min(1, "Rating must be at least 1 star").max(5, "Rating cannot exceed 5 stars"),
});
export const insertCartItemSchema = createInsertSchema(cartItems).omit({ id: true, userId: true, createdAt: true });
export const insertContractSchema = createInsertSchema(userAndExpertContracts).omit({ id: true, status: true, isPaid: true, paymentUrl: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, isRead: true, createdAt: true });

// === Types ===
export type Trip = typeof trips.$inferSelect;
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type GeneratedItinerary = typeof generatedItineraries.$inferSelect;
export type InsertGeneratedItinerary = z.infer<typeof insertGeneratedItinerarySchema>;
export type ReviewRating = typeof reviewRatings.$inferSelect;
export type UserAndExpertChat = typeof userAndExpertChats.$inferSelect;
export type TouristPlaceResult = typeof touristPlaceResults.$inferSelect;
export type HelpGuideTrip = typeof helpGuideTrips.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type VendorAssignment = typeof vendorAssignments.$inferSelect;
export type InsertVendorAssignment = z.infer<typeof insertVendorAssignmentSchema>;
export type AiBlueprint = typeof aiBlueprints.$inferSelect;
export type InsertAiBlueprint = z.infer<typeof insertAiBlueprintSchema>;

// New types for Expert/Provider applications
export type LocalExpertForm = typeof localExpertForms.$inferSelect;
export type InsertLocalExpertForm = z.infer<typeof insertLocalExpertFormSchema>;
export type ServiceProviderForm = typeof serviceProviderForms.$inferSelect;
export type InsertServiceProviderForm = z.infer<typeof insertServiceProviderFormSchema>;
export type ServiceCategory = typeof serviceCategories.$inferSelect;
export type InsertServiceCategory = z.infer<typeof insertServiceCategorySchema>;
export type ServiceSubcategory = typeof serviceSubcategories.$inferSelect;
export type InsertServiceSubcategory = z.infer<typeof insertServiceSubcategorySchema>;
export type ProviderService = typeof providerServices.$inferSelect;
export type InsertProviderService = z.infer<typeof insertProviderServiceSchema>;
export type BundleComponent = typeof bundleComponents.$inferSelect;
export type FAQ = typeof faqs.$inferSelect;
export type InsertFAQ = z.infer<typeof insertFaqSchema>;
export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;

// Service Templates, Bookings, Reviews types
export type ServiceTemplate = typeof serviceTemplates.$inferSelect;
export type InsertServiceTemplate = z.infer<typeof insertServiceTemplateSchema>;
export type ServiceBooking = typeof serviceBookings.$inferSelect;
export type InsertServiceBooking = z.infer<typeof insertServiceBookingSchema>;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type Contract = typeof userAndExpertContracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;
export type ServiceReview = typeof serviceReviews.$inferSelect;
export type InsertServiceReview = z.infer<typeof insertServiceReviewSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Experience Types schemas and types
export const insertExperienceTypeSchema = createInsertSchema(experienceTypes).omit({ id: true, createdAt: true });
export const insertExperienceTemplateStepSchema = createInsertSchema(experienceTemplateSteps).omit({ id: true, createdAt: true });
export const insertExpertExperienceTypeSchema = createInsertSchema(expertExperienceTypes).omit({ id: true, createdAt: true });
export const insertUserExperienceSchema = createInsertSchema(userExperiences).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export const insertUserExperienceItemSchema = createInsertSchema(userExperienceItems).omit({ id: true, createdAt: true });

export type ExperienceType = typeof experienceTypes.$inferSelect;
export type InsertExperienceType = z.infer<typeof insertExperienceTypeSchema>;
export type ExperienceTemplateStep = typeof experienceTemplateSteps.$inferSelect;
export type InsertExperienceTemplateStep = z.infer<typeof insertExperienceTemplateStepSchema>;
export type ExpertExperienceType = typeof expertExperienceTypes.$inferSelect;
export type InsertExpertExperienceType = z.infer<typeof insertExpertExperienceTypeSchema>;

// Expert Service Categories & Offerings schemas and types
export const insertExpertServiceCategorySchema = createInsertSchema(expertServiceCategories).omit({ id: true, createdAt: true });
export const insertExpertServiceOfferingSchema = createInsertSchema(expertServiceOfferings).omit({ id: true, createdAt: true });
export const insertExpertSpecializationSchema = createInsertSchema(expertSpecializations).omit({ id: true, createdAt: true });

export type ExpertServiceCategory = typeof expertServiceCategories.$inferSelect;
export type InsertExpertServiceCategory = z.infer<typeof insertExpertServiceCategorySchema>;
export type ExpertServiceOffering = typeof expertServiceOfferings.$inferSelect;
export type InsertExpertServiceOffering = z.infer<typeof insertExpertServiceOfferingSchema>;
export type ExpertSpecialization = typeof expertSpecializations.$inferSelect;
export type InsertExpertSpecialization = z.infer<typeof insertExpertSpecializationSchema>;

// Expert Custom Services schemas and types
// (table dropped in migration 013; type kept manually for storage adapter compatibility)
export const insertProviderServiceListingSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  existingCategoryId: z.string().nullable().optional(),
  price: z.string(),
  duration: z.string().nullable().optional(),
  deliverables: z.array(z.string()).optional(),
  cancellationPolicy: z.string().nullable().optional(),
  leadTime: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  galleryImages: z.array(z.string()).optional(),
  experienceTypes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export type ProviderServiceListing = {
  id: string;
  expertId: string;
  title: string;
  description: string | null;
  categoryName: string | null;
  existingCategoryId: string | null;
  price: string;
  duration: string | null;
  deliverables: unknown;
  cancellationPolicy: string | null;
  leadTime: string | null;
  imageUrl: string | null;
  galleryImages: unknown;
  experienceTypes: unknown;
  status: "draft" | "submitted" | "approved" | "rejected";
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  isActive: boolean | null;
  bookingsCount: number | null;
  averageRating: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};
export type InsertProviderServiceListing = z.infer<typeof insertProviderServiceListingSchema>;

// Influencer schemas and types
export const insertInfluencerReferralSchema = createInsertSchema(influencerReferrals).omit({ id: true, createdAt: true });
export const insertInfluencerCuratedContentSchema = createInsertSchema(influencerCuratedContent).omit({ 
  id: true, 
  viewCount: true, 
  saveCount: true, 
  createdAt: true, 
  updatedAt: true 
});

export type InfluencerReferral = typeof influencerReferrals.$inferSelect;
export type InsertInfluencerReferral = z.infer<typeof insertInfluencerReferralSchema>;
export type InfluencerCuratedContent = typeof influencerCuratedContent.$inferSelect;
export type InsertInfluencerCuratedContent = z.infer<typeof insertInfluencerCuratedContentSchema>;

export type UserExperience = typeof userExperiences.$inferSelect;
export type InsertUserExperience = z.infer<typeof insertUserExperienceSchema>;
export type UserExperienceItem = typeof userExperienceItems.$inferSelect;
export type InsertUserExperienceItem = z.infer<typeof insertUserExperienceItemSchema>;

// AI Itinerary Optimization schemas and types
export const insertItineraryComparisonSchema = createInsertSchema(itineraryComparisons).omit({ id: true, createdAt: true, updatedAt: true });
export const insertItineraryVariantSchema = createInsertSchema(itineraryVariants).omit({ id: true, createdAt: true });
export const insertItineraryVariantItemSchema = createInsertSchema(itineraryVariantItems).omit({ id: true, createdAt: true });
export const insertItineraryVariantMetricSchema = createInsertSchema(itineraryVariantMetrics).omit({ id: true, createdAt: true });

export type ItineraryComparison = typeof itineraryComparisons.$inferSelect;
export type InsertItineraryComparison = z.infer<typeof insertItineraryComparisonSchema>;
export type ItineraryVariant = typeof itineraryVariants.$inferSelect;
export type InsertItineraryVariant = z.infer<typeof insertItineraryVariantSchema>;
export type ItineraryVariantItem = typeof itineraryVariantItems.$inferSelect;
export type InsertItineraryVariantItem = z.infer<typeof insertItineraryVariantItemSchema>;
export type ItineraryVariantMetric = typeof itineraryVariantMetrics.$inferSelect;
export type InsertItineraryVariantMetric = z.infer<typeof insertItineraryVariantMetricSchema>;

// Custom Venues schemas and types
export const insertCustomVenueSchema = createInsertSchema(customVenues).omit({ id: true, createdAt: true });
export type CustomVenue = typeof customVenues.$inferSelect;
export type InsertCustomVenue = z.infer<typeof insertCustomVenueSchema>;

// === DESTINATION CALENDAR SYSTEM ===

export const destinationEventTypeEnum = ["festival", "holiday", "weather", "season", "cultural", "sporting", "religious", "other"] as const;
export const destinationEventStatusEnum = ["draft", "pending", "approved", "rejected"] as const;
export const seasonRatingEnum = ["best", "good", "average", "avoid"] as const;

export const destinationEvents = pgTable("destination_events", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  country: varchar("country", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }),
  region: varchar("region", { length: 100 }),
  
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  
  eventType: varchar("event_type", { length: 30 }).default("other"),
  
  startMonth: integer("start_month"),
  endMonth: integer("end_month"),
  specificDate: date("specific_date"),
  isRecurring: boolean("is_recurring").default(true),
  year: integer("year"),
  
  seasonRating: varchar("season_rating", { length: 20 }),
  
  highlights: jsonb("highlights").default([]),
  tips: text("tips"),
  
  sourceType: varchar("source_type", { length: 20 }).default("manual"),
  sourceId: varchar("source_id", { length: 255 }),
  
  contributorId: varchar("contributor_id").references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  
  metadata: jsonb("metadata").default({}),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const destinationSeasons = pgTable("destination_seasons", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  country: varchar("country", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }),
  
  month: integer("month").notNull(),
  rating: varchar("rating", { length: 20 }).notNull(),
  
  weatherDescription: text("weather_description"),
  averageTemp: text("average_temp"),
  rainfall: varchar("rainfall", { length: 50 }),
  
  crowdLevel: varchar("crowd_level", { length: 20 }),
  priceLevel: varchar("price_level", { length: 20 }),
  
  highlights: jsonb("highlights").default([]),
  
  sourceType: varchar("source_type", { length: 20 }).default("system"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Destination Calendar schemas and types
export const insertDestinationEventSchema = createInsertSchema(destinationEvents).omit({ id: true, createdAt: true, updatedAt: true, reviewedAt: true });
export const insertDestinationSeasonSchema = createInsertSchema(destinationSeasons).omit({ id: true, createdAt: true, updatedAt: true });

export type DestinationEvent = typeof destinationEvents.$inferSelect;
export type InsertDestinationEvent = z.infer<typeof insertDestinationEventSchema>;
export type DestinationSeason = typeof destinationSeasons.$inferSelect;
export type InsertDestinationSeason = z.infer<typeof insertDestinationSeasonSchema>;

// === COORDINATION HUB: Vendor Availability System ===

export const vendorAvailabilityStatusEnum = ["available", "limited", "fully_booked", "blocked"] as const;

export const vendorAvailabilitySlots = pgTable("vendor_availability_slots", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  date: date("date").notNull(),
  startTime: varchar("start_time", { length: 10 }), // "09:00", "14:00"
  endTime: varchar("end_time", { length: 10 }),

  capacity: integer("capacity").default(1),
  bookedCount: integer("booked_count").default(0),
  status: varchar("status", { length: 20 }).default("available"),

  pricing: jsonb("pricing").default({}),
  discounts: jsonb("discounts").default([]),

  minimumNotice: varchar("minimum_notice", { length: 50 }).default("24 hours"),
  cancellationPolicy: varchar("cancellation_policy", { length: 100 }),
  specialRequirements: jsonb("special_requirements").default([]),

  confirmationMethod: varchar("confirmation_method", { length: 20 }).default("instant"),

  // S11 (migration 213, DECISIONS.md ledger row 107): app-enforced provenance vocabulary
  // ('pattern' | 'date_range' | NULL = manually created) — NO DB CHECK (migration-181/195
  // posture). Lets a materializer-authored row be told apart from a manually-created one before
  // a price-edit re-price or a future stale-slot cleanup pass ever touches it. Every pre-213 row
  // (including every pre-213 S7 pattern-materialized row — not backfilled, §13: an honest NULL
  // beats a guess) reads back NULL.
  materializedFrom: varchar("materialized_from", { length: 20 }),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // S7 (DECISIONS.md ledger 102, migration 210, S7-Q2): the availability materializer's
  // idempotency target — `db.insert(vendorAvailabilitySlots).values(rows).onConflictDoNothing({
  // target: [...] })` against this index is what lets re-materializing a pattern/blackout change
  // never duplicate a slot and never touch an existing row's capacity/booked_count/status (manual
  // edits and live bookings survive untouched). DELIBERATELY NOT PARTIAL (no WHERE clause), even
  // though start_time is nullable: a plain composite unique index already tolerates multiple NULL
  // start_times per (service_id, date) under standard SQL NULL semantics (NULL is never considered
  // equal to NULL), so no WHERE predicate is needed for correctness — and Drizzle's
  // `onConflictDoNothing({ target: [...] })` emits `ON CONFLICT (cols) DO NOTHING` with no WHERE,
  // which Postgres can only use to infer a MATCHING arbiter index; pointing it at a partial index
  // (tried during development) fails with "there is no unique or exclusion constraint matching the
  // ON CONFLICT specification" because the inference clause's predicate must match the index's
  // predicate verbatim. Declared here per the publish-trap rule (migration-155/sb_idempotency_key_idx
  // lesson: an index the code depends on, absent from schema.ts, is dropped by the Replit
  // deploy-push on the next publish once the migration is already stamped). Migration 210
  // defensively verifies no pre-existing duplicates and FAILS LOUDLY if any are found — see its
  // header and scripts/preflight-prod-unique-indexes.cjs for the required pre-publish check.
  uniqueIndex("vendor_availability_slots_service_date_start_unique")
    .on(table.serviceId, table.date, table.startTime),
]);

// === COORDINATION HUB: Itinerary Coordination State ===

export const coordinationStatusEnum = [
  "intake",
  "expert_matching", 
  "vendor_discovery",
  "itinerary_generation",
  "optimization",
  "booking_coordination",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled"
] as const;

export const coordinationStates = pgTable("coordination_states", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  experienceType: varchar("experience_type", { length: 50 }).notNull(),
  
  status: varchar("status", { length: 30 }).default("intake"),
  path: varchar("path", { length: 20 }).default("browse"),
  
  userRequest: jsonb("user_request").default({}),
  destination: varchar("destination", { length: 255 }),
  dates: jsonb("dates").default({}),
  travelers: jsonb("travelers").default({}),
  budget: jsonb("budget").default({}),
  preferences: jsonb("preferences").default({}),
  
  assignedExpertId: varchar("assigned_expert_id").references(() => users.id, { onDelete: "set null" }),
  expertRecommendations: jsonb("expert_recommendations").default({}),
  
  selectedVendors: jsonb("selected_vendors").default([]),
  customVenueIds: jsonb("custom_venue_ids").default([]),
  
  generatedItinerary: jsonb("generated_itinerary").default({}),
  optimizationScore: decimal("optimization_score", { precision: 5, scale: 2 }),
  aiInsights: jsonb("ai_insights").default({}),
  
  bookingStatuses: jsonb("booking_statuses").default([]),
  confirmations: jsonb("confirmations").default([]),
  
  timeline: jsonb("timeline").default([]),
  stateHistory: jsonb("state_history").default([]),
  
  totalEstimatedCost: decimal("total_estimated_cost", { precision: 10, scale: 2 }),
  totalConfirmedCost: decimal("total_confirmed_cost", { precision: 10, scale: 2 }),

  // Coordination FEE capture (CLAUDE.md §7 "Quote-only → CAPTURED", migration 125). 1:1 per
  // engagement. fee_amount_cents is the NET charged (after the paid-optimize credit); fee_credit_cents
  // is the applied credit. State machine has a DB CHECK (unpaid|pending|paid).
  feePaymentStatus: varchar("fee_payment_status", { length: 20 }).notNull().default("unpaid"),
  feePaymentIntentId: varchar("fee_payment_intent_id"),
  feeAmountCents: integer("fee_amount_cents"),
  feeCreditCents: integer("fee_credit_cents").notNull().default(0),
  feePaidAt: timestamp("fee_paid_at"),

  // Set to true when a refund is processed but no platform_revenue rows are found to reverse.
  // This is an admin-visible flag indicating a ledger inconsistency that needs manual review.
  revenueReversalMissing: boolean("revenue_reversal_missing").notNull().default(false),
  // #877 (migration 169): lets an admin mark the above ledger-gap warning reviewed instead of
  // it warning forever in the admin concierge panel. NULL = not yet reviewed (open warning).
  revenueReversalReviewedAt: timestamp("revenue_reversal_reviewed_at"),
  revenueReversalReviewedBy: varchar("revenue_reversal_reviewed_by").references(() => users.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Paid-signal ledger (CLAUDE.md §7 "Paid-signal ledger", migration 125). One row per PAID
// Event-branch optimize fee, recorded by optimization-payments/confirm. Applied ONCE against a
// coordination fee: consumed_by_coordination_id (+ the atomic claim in the pay route) is what
// prevents double-credit. source_payment_intent_id is UNIQUE so the insert is idempotent.
export const coordinationFeeCredits = pgTable("coordination_fee_credits", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourcePaymentIntentId: varchar("source_payment_intent_id").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),
  eventType: varchar("event_type", { length: 50 }),
  consumedByCoordinationId: varchar("consumed_by_coordination_id").references(() => coordinationStates.id, { onDelete: "set null" }),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const coordinationBookings = pgTable("coordination_bookings", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  coordinationId: varchar("coordination_id").notNull().references(() => coordinationStates.id, { onDelete: "cascade" }),
  
  itemType: varchar("item_type", { length: 30 }).notNull(),
  itemId: varchar("item_id", { length: 255 }).notNull(),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  
  vendorId: varchar("vendor_id").references(() => users.id, { onDelete: "set null" }),
  serviceId: varchar("service_id").references(() => providerServices.id, { onDelete: "set null" }),
  availabilitySlotId: varchar("availability_slot_id").references(() => vendorAvailabilitySlots.id, { onDelete: "set null" }),
  
  scheduledDate: date("scheduled_date"),
  scheduledTime: varchar("scheduled_time", { length: 10 }),
  duration: varchar("duration", { length: 50 }),
  
  price: decimal("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("USD"),
  
  status: varchar("status", { length: 30 }).default("pending"),
  bookingReference: varchar("booking_reference", { length: 100 }),
  confirmationDetails: jsonb("confirmation_details").default({}),
  
  source: varchar("source", { length: 30 }).default("platform"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
});

// ============ API CACHE TABLES ============
// Cache tables for storing API data locally with location info for mapping

// Preference tags enum for filtering
export const preferenceTagsEnum = [
  "budget", "luxury", "family", "adventure", "business", "beach", "city", "nature",
  "culture_history", "food_dining", "nature_outdoors", "nightlife", "shopping",
  "wellness_spa", "art_museums", "romantic", "solo", "group"
] as const;

export const hotelCache = pgTable("hotel_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  hotelId: varchar("hotel_id", { length: 100 }).notNull(),
  cityCode: varchar("city_code", { length: 10 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  address: text("address"),
  // Enhanced location fields
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 100 }),
  county: varchar("county", { length: 100 }),
  countryCode: varchar("country_code", { length: 10 }),
  countryName: varchar("country_name", { length: 100 }),
  postalCode: varchar("postal_code", { length: 20 }),
  // Provider and rating
  provider: varchar("provider", { length: 100 }).default("amadeus"),
  rating: varchar("rating", { length: 10 }),
  starRating: integer("star_rating"),
  reviewCount: integer("review_count").default(0),
  popularityScore: integer("popularity_score").default(0),
  // Preference tags for filtering
  preferenceTags: jsonb("preference_tags").default([]),
  // Existing fields
  amenities: jsonb("amenities").default([]),
  media: jsonb("media").default([]),
  rawData: jsonb("raw_data").default({}),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const hotelOfferCache = pgTable("hotel_offer_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  hotelCacheId: varchar("hotel_cache_id").notNull().references(() => hotelCache.id, { onDelete: "cascade" }),
  offerId: varchar("offer_id", { length: 100 }).notNull(),
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
  roomType: varchar("room_type", { length: 100 }),
  roomDescription: text("room_description"),
  price: decimal("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("USD"),
  rawData: jsonb("raw_data").default({}),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const activityCache = pgTable("activity_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productCode: varchar("product_code", { length: 100 }).notNull().unique(),
  destination: varchar("destination", { length: 255 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  meetingPoint: text("meeting_point"),
  // Enhanced location fields
  address: text("address"),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 100 }),
  county: varchar("county", { length: 100 }),
  countryCode: varchar("country_code", { length: 10 }),
  countryName: varchar("country_name", { length: 100 }),
  postalCode: varchar("postal_code", { length: 20 }),
  // Provider and categorization
  provider: varchar("provider", { length: 100 }).default("viator"),
  category: varchar("category", { length: 100 }),
  subcategory: varchar("subcategory", { length: 100 }),
  // Preference tags for filtering (budget, luxury, family, adventure, etc.)
  preferenceTags: jsonb("preference_tags").default([]),
  popularityScore: integer("popularity_score").default(0),
  // Existing fields
  durationMinutes: integer("duration_minutes"),
  price: decimal("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("USD"),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").default(0),
  imageUrl: text("image_url"),
  flags: jsonb("flags").default([]),
  tags: jsonb("tags").default([]),
  rawData: jsonb("raw_data").default({}),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// flight_cache RETIRED by migration 176 (writerless since the Amadeus drop, ruling 34;
// last route reader deleted in PR #425). Do not re-declare without a new ruling.

export const locationCache = pgTable("location_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  iataCode: varchar("iata_code", { length: 10 }).notNull(),
  locationType: varchar("location_type", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  detailedName: text("detailed_name"),
  cityName: varchar("city_name", { length: 255 }),
  cityCode: varchar("city_code", { length: 10 }),
  countryName: varchar("country_name", { length: 100 }),
  countryCode: varchar("country_code", { length: 10 }),
  regionCode: varchar("region_code", { length: 20 }),
  stateCode: varchar("state_code", { length: 20 }),
  latitude: text("latitude"),
  longitude: text("longitude"),
  timeZoneOffset: varchar("timezone_offset", { length: 10 }),
  travelerScore: integer("traveler_score"),
  rawData: jsonb("raw_data").default({}),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// ============ FEVER EVENT CACHE TABLE ============
// Caches Fever events from Impact.com to reduce API calls and improve performance

export const feverEventCache = pgTable("fever_event_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: varchar("event_id", { length: 100 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  slug: varchar("slug", { length: 500 }),
  description: text("description"),
  shortDescription: text("short_description"),
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  category: varchar("category", { length: 100 }).notNull(),
  subcategory: varchar("subcategory", { length: 100 }),
  city: varchar("city", { length: 255 }).notNull(),
  cityCode: varchar("city_code", { length: 10 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  countryCode: varchar("country_code", { length: 10 }),
  venueName: varchar("venue_name", { length: 255 }),
  venueAddress: text("venue_address"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  sessions: jsonb("sessions").default([]),
  currency: varchar("currency", { length: 10 }).default("USD"),
  minPrice: decimal("min_price", { precision: 10, scale: 2 }),
  maxPrice: decimal("max_price", { precision: 10, scale: 2 }),
  priceRange: varchar("price_range", { length: 100 }),
  isFree: boolean("is_free").default(false),
  isSoldOut: boolean("is_sold_out").default(false),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").default(0),
  bookingUrl: text("booking_url").notNull(),
  affiliateUrl: text("affiliate_url"),
  tags: jsonb("tags").default([]),
  highlights: jsonb("highlights").default([]),
  provider: varchar("provider", { length: 100 }).default("fever"),
  rawData: jsonb("raw_data").default({}),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// ============ USER FILTER PREFERENCES TABLE ============
// Stores user's persistent filter and sorting preferences per item type

export const sortByOptionsEnum = ["price_low", "price_high", "rating", "popularity", "distance", "newest"] as const;
export const itemTypeEnum = ["hotel", "activity", "flight", "service", "all"] as const;

export const userFilterPreferences = pgTable("user_filter_preferences", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemType: varchar("item_type", { length: 30 }).notNull(), // hotel, activity, flight, service, all
  // Price range filter
  priceMin: decimal("price_min", { precision: 10, scale: 2 }).default("0"),
  priceMax: decimal("price_max", { precision: 10, scale: 2 }).default("10000"),
  // Rating filter
  minRating: decimal("min_rating", { precision: 3, scale: 2 }).default("0"),
  // Sorting preference
  sortBy: varchar("sort_by", { length: 30 }).default("popularity"),
  // Selected preference tags (array of tags like budget, luxury, family, etc.)
  selectedTags: jsonb("selected_tags").default([]),
  // Text search query (optional persistent search term)
  searchQuery: text("search_query"),
  // Location filters
  county: varchar("county", { length: 100 }),
  state: varchar("state", { length: 100 }),
  countryCode: varchar("country_code", { length: 10 }),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============ AMADEUS POI CACHE TABLE ============
export const poiCache = pgTable("poi_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  amadeusId: varchar("amadeus_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 500 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  rank: integer("rank").default(0),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  city: varchar("city", { length: 255 }),
  country: varchar("country", { length: 100 }),
  countryCode: varchar("country_code", { length: 10 }),
  tags: jsonb("tags").default([]),
  rawData: jsonb("raw_data").default({}),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// transfer_cache and safety_cache RETIRED by migration 176 (Amadeus-era, writerless,
// no live reader — ruling 34). Do not re-declare without a new ruling.

export const restaurantCache = pgTable("restaurant_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  externalId: varchar("external_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  cuisine: varchar("cuisine", { length: 255 }),
  priceLevel: varchar("price_level", { length: 10 }),
  rating: varchar("rating", { length: 10 }),
  reviewCount: integer("review_count").default(0),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  city: varchar("city", { length: 255 }),
  bookingUrl: text("booking_url"),
  imageUrl: text("image_url"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Cache schemas and types
export const insertHotelCacheSchema = createInsertSchema(hotelCache).omit({ id: true, lastUpdated: true });
export const insertHotelOfferCacheSchema = createInsertSchema(hotelOfferCache).omit({ id: true, lastUpdated: true });
export const insertActivityCacheSchema = createInsertSchema(activityCache).omit({ id: true, lastUpdated: true });
export const insertLocationCacheSchema = createInsertSchema(locationCache).omit({ id: true, lastUpdated: true });
export const insertFeverEventCacheSchema = createInsertSchema(feverEventCache).omit({ id: true, lastUpdated: true });
export const insertPoiCacheSchema = createInsertSchema(poiCache).omit({ id: true, lastUpdated: true });
export const insertUserFilterPreferencesSchema = createInsertSchema(userFilterPreferences).omit({ id: true, createdAt: true, updatedAt: true });

export type HotelCache = typeof hotelCache.$inferSelect;
export type InsertHotelCache = z.infer<typeof insertHotelCacheSchema>;
export type HotelOfferCache = typeof hotelOfferCache.$inferSelect;
export type InsertHotelOfferCache = z.infer<typeof insertHotelOfferCacheSchema>;
export type ActivityCache = typeof activityCache.$inferSelect;
export type InsertActivityCache = z.infer<typeof insertActivityCacheSchema>;
export type PoiCache = typeof poiCache.$inferSelect;
export type InsertPoiCache = z.infer<typeof insertPoiCacheSchema>;
export type LocationCache = typeof locationCache.$inferSelect;
export type InsertLocationCache = z.infer<typeof insertLocationCacheSchema>;
export type FeverEventCache = typeof feverEventCache.$inferSelect;
export type InsertFeverEventCache = z.infer<typeof insertFeverEventCacheSchema>;
export type UserFilterPreferences = typeof userFilterPreferences.$inferSelect;
export type InsertUserFilterPreferences = z.infer<typeof insertUserFilterPreferencesSchema>;

export const insertRestaurantCacheSchema = createInsertSchema(restaurantCache).omit({ id: true, lastUpdated: true });
export type RestaurantCache = typeof restaurantCache.$inferSelect;
export type InsertRestaurantCache = z.infer<typeof insertRestaurantCacheSchema>;

// Coordination Hub schemas and types
export const insertVendorAvailabilitySlotSchema = createInsertSchema(vendorAvailabilitySlots).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCoordinationStateSchema = createInsertSchema(coordinationStates).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export const insertCoordinationBookingSchema = createInsertSchema(coordinationBookings).omit({ id: true, createdAt: true, updatedAt: true, confirmedAt: true });
export const insertCoordinationFeeCreditSchema = createInsertSchema(coordinationFeeCredits).omit({ id: true, createdAt: true, consumedAt: true, consumedByCoordinationId: true });

export type VendorAvailabilitySlot = typeof vendorAvailabilitySlots.$inferSelect;
export type InsertVendorAvailabilitySlot = z.infer<typeof insertVendorAvailabilitySlotSchema>;
export type CoordinationState = typeof coordinationStates.$inferSelect;
export type InsertCoordinationState = z.infer<typeof insertCoordinationStateSchema>;
export type CoordinationBooking = typeof coordinationBookings.$inferSelect;
export type InsertCoordinationBooking = z.infer<typeof insertCoordinationBookingSchema>;
export type CoordinationFeeCredit = typeof coordinationFeeCredits.$inferSelect;
export type InsertCoordinationFeeCredit = z.infer<typeof insertCoordinationFeeCreditSchema>;

// === AI Integration Tables ===

export const aiTaskTypeEnum = [
  "expert_matching",
  "content_generation",
  "real_time_intelligence",
  "autonomous_itinerary",
  "itinerary_optimization",
  "transportation_analysis",
  "travel_recommendations",
  "chat",
  "image_analysis"
] as const;

export const aiProviderEnum = ["grok", "claude", "openai"] as const;

export const aiInteractions = pgTable("ai_interactions", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskType: varchar("task_type", { length: 50 }).notNull(),
  provider: varchar("provider", { length: 20 }).notNull(),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 6 }).default("0"),
  durationMs: integer("duration_ms").default(0),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const expertMatchScores = pgTable("expert_match_scores", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  travelerId: varchar("traveler_id").references(() => users.id, { onDelete: "set null" }),
  overallScore: integer("overall_score").notNull(),
  destinationMatch: integer("destination_match").default(0),
  specialtyMatch: integer("specialty_match").default(0),
  experienceTypeMatch: integer("experience_type_match").default(0),
  budgetAlignment: integer("budget_alignment").default(0),
  availabilityScore: integer("availability_score").default(0),
  strengths: jsonb("strengths").default([]),
  reasoning: text("reasoning"),
  requestContext: jsonb("request_context").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const destinationIntelligence = pgTable("destination_intelligence", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  destination: varchar("destination", { length: 255 }).notNull(),
  startDate: varchar("start_date", { length: 10 }), // YYYY-MM-DD format, optional for date-specific cache
  endDate: varchar("end_date", { length: 10 }),
  intelligenceData: jsonb("intelligence_data").default({}),
  events: jsonb("events").default([]),
  weatherForecast: jsonb("weather_forecast").default({}),
  safetyAlerts: jsonb("safety_alerts").default([]),
  trendingExperiences: jsonb("trending_experiences").default([]),
  deals: jsonb("deals").default([]),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const trendingExperiences = pgTable("trending_experiences", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  destination: varchar("destination", { length: 255 }),
  experienceName: varchar("experience_name", { length: 255 }).notNull(),
  experienceType: varchar("experience_type", { length: 50 }),
  reason: text("reason"),
  popularityScore: integer("popularity_score").default(0),
  source: varchar("source", { length: 50 }).default("grok"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const aiGeneratedItineraries = pgTable("ai_generated_itineraries", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  destination: varchar("destination", { length: 255 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  title: varchar("title", { length: 255 }),
  summary: text("summary"),
  totalEstimatedCost: decimal("total_estimated_cost", { precision: 10, scale: 2 }),
  itineraryData: jsonb("itinerary_data").default({}),
  accommodationSuggestions: jsonb("accommodation_suggestions").default([]),
  packingList: jsonb("packing_list").default([]),
  travelTips: jsonb("travel_tips").default([]),
  provider: varchar("provider", { length: 20 }).default("grok"),
  status: varchar("status", { length: 20 }).default("generated"),
  feedback: jsonb("feedback").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Expert AI Tasks - for task delegation to AI
export const expertAiTaskStatusEnum = ["pending", "in_progress", "completed", "rejected", "regenerating"] as const;
export const expertAiTaskTypeEnum = ["client_message", "vendor_research", "itinerary_update", "content_draft", "response_draft"] as const;

export const expertAiTasks = pgTable("expert_ai_tasks", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskType: varchar("task_type", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  clientName: varchar("client_name", { length: 255 }),
  taskDescription: text("task_description").notNull(),
  context: jsonb("context").default({}),
  aiResult: jsonb("ai_result").default({}),
  confidence: integer("confidence"),
  qualityScore: decimal("quality_score", { precision: 3, scale: 1 }),
  editedContent: text("edited_content"),
  wasEdited: boolean("was_edited").default(false),
  tokensUsed: integer("tokens_used").default(0),
  costEstimate: decimal("cost_estimate", { precision: 10, scale: 6 }).default("0"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI Integration schemas and types
export const insertAIInteractionSchema = createInsertSchema(aiInteractions).omit({ id: true, createdAt: true });
export const insertExpertAiTaskSchema = createInsertSchema(expertAiTasks).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export const insertExpertMatchScoreSchema = createInsertSchema(expertMatchScores).omit({ id: true, createdAt: true });
export const insertDestinationIntelligenceSchema = createInsertSchema(destinationIntelligence).omit({ id: true, lastUpdated: true });
export const insertTrendingExperienceSchema = createInsertSchema(trendingExperiences).omit({ id: true, createdAt: true });
export const insertAIGeneratedItinerarySchema = createInsertSchema(aiGeneratedItineraries).omit({ id: true, createdAt: true, updatedAt: true });

export type AIInteraction = typeof aiInteractions.$inferSelect;
export type InsertAIInteraction = z.infer<typeof insertAIInteractionSchema>;
export type ExpertMatchScore = typeof expertMatchScores.$inferSelect;
export type InsertExpertMatchScore = z.infer<typeof insertExpertMatchScoreSchema>;
export type DestinationIntelligence = typeof destinationIntelligence.$inferSelect;
export type InsertDestinationIntelligence = z.infer<typeof insertDestinationIntelligenceSchema>;
export type TrendingExperience = typeof trendingExperiences.$inferSelect;
export type InsertTrendingExperience = z.infer<typeof insertTrendingExperienceSchema>;
export type AIGeneratedItinerary = typeof aiGeneratedItineraries.$inferSelect;
export type InsertAIGeneratedItinerary = z.infer<typeof insertAIGeneratedItinerarySchema>;
export type ExpertAiTask = typeof expertAiTasks.$inferSelect;
export type InsertExpertAiTask = z.infer<typeof insertExpertAiTaskSchema>;

// ============================================
// TRAVELPULSE - Real-Time Collective Intelligence
// ============================================

// Enums for TravelPulse
export const travelPulseTrendStatusEnum = ["emerging", "viral", "mainstream", "declining"] as const;
export const travelPulseVerdictEnum = ["highly_recommended", "recommended", "mixed", "skip"] as const;
export const travelPulseCrowdLevelEnum = ["quiet", "moderate", "busy", "packed"] as const;

// Trending Destinations - Core table for trending places with full intelligence
export const travelPulseTrending = pgTable("travel_pulse_trending", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }),
  destinationName: varchar("destination_name", { length: 255 }).notNull(),
  destinationType: varchar("destination_type", { length: 50 }), // restaurant, attraction, hotel, tour, etc.
  
  // Trending metrics
  trendScore: integer("trend_score").default(0), // 0-1000 velocity score
  growthPercent: integer("growth_percent").default(0), // % increase in mentions
  mentionCount: integer("mention_count").default(0),
  trendStatus: varchar("trend_status", { length: 20 }).default("emerging"),
  triggerEvent: text("trigger_event"), // What caused the trend (influencer, news, etc.)
  
  // LiveScore data
  liveScore: decimal("live_score", { precision: 3, scale: 2 }), // 1.00 to 5.00
  liveScoreChange: decimal("live_score_change", { precision: 3, scale: 2 }), // change from 24h ago
  sentimentScore: decimal("sentiment_score", { precision: 3, scale: 2 }), // -1.00 to +1.00
  sentimentTrend: varchar("sentiment_trend", { length: 10 }), // up, down, stable
  
  // Truth Check data
  worthItPercent: integer("worth_it_percent"), // 0-100
  mehPercent: integer("meh_percent"),
  avoidPercent: integer("avoid_percent"),
  overallVerdict: varchar("overall_verdict", { length: 20 }),
  realityScore: integer("reality_score"), // 1-10 (photo vs reality)
  
  // Insights
  topHighlights: jsonb("top_highlights").default([]), // ["amazing views", "worth the wait"]
  topWarnings: jsonb("top_warnings").default([]), // ["too crowded", "overpriced"]
  crowdsourcedTips: jsonb("crowdsourced_tips").default([]), // [{tip, mentionCount}]
  
  // Best times
  bestTimeToVisit: varchar("best_time_to_visit", { length: 100 }),
  worstTimeToVisit: varchar("worst_time_to_visit", { length: 100 }),
  crowdForecast: jsonb("crowd_forecast").default([]), // [{hour, level, percent}]
  
  // Metadata
  imageUrl: text("image_url"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  detectedAt: timestamp("detected_at").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

// LiveScores - Real-time ratings for destinations/experiences
export const travelPulseLiveScores = pgTable("travel_pulse_live_scores", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityName: varchar("entity_name", { length: 255 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }), // restaurant, hotel, attraction, tour
  city: varchar("city", { length: 100 }).notNull(),
  
  // Time window
  windowPeriod: varchar("window_period", { length: 20 }).default("24h"), // 24h, 7d, 30d
  
  // Metrics
  mentionCount: integer("mention_count").default(0),
  uniqueUsersCount: integer("unique_users_count").default(0),
  
  // Sentiment
  avgSentiment: decimal("avg_sentiment", { precision: 3, scale: 2 }), // -1.00 to +1.00
  positiveCount: integer("positive_count").default(0),
  neutralCount: integer("neutral_count").default(0),
  negativeCount: integer("negative_count").default(0),
  sentimentTrend: varchar("sentiment_trend", { length: 10 }), // up, down, stable
  
  // LiveScore
  liveScore: decimal("live_score", { precision: 3, scale: 2 }), // 1.00 to 5.00
  scoreChange24h: decimal("score_change_24h", { precision: 3, scale: 2 }),
  scoreChange7d: decimal("score_change_7d", { precision: 3, scale: 2 }),
  
  // Trending
  isTrending: boolean("is_trending").default(false),
  trendVelocity: integer("trend_velocity").default(0),
  
  // Keywords
  topPositiveKeywords: jsonb("top_positive_keywords").default([]),
  topNegativeKeywords: jsonb("top_negative_keywords").default([]),
  
  calculatedAt: timestamp("calculated_at").defaultNow(),
  validUntil: timestamp("valid_until"),
});

// Truth Checks - Cached "Is X worth it?" analysis
export const travelPulseTruthChecks = pgTable("travel_pulse_truth_checks", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  queryText: text("query_text").notNull(),
  queryHash: varchar("query_hash", { length: 64 }).unique().notNull(),
  
  // Subject
  subjectName: varchar("subject_name", { length: 255 }),
  subjectType: varchar("subject_type", { length: 50 }), // place, experience, claim
  city: varchar("city", { length: 100 }),
  
  // Analysis
  postsAnalyzed: integer("posts_analyzed").default(0),
  analysisStartDate: date("analysis_start_date"),
  analysisEndDate: date("analysis_end_date"),
  
  // Results
  worthItPercent: integer("worth_it_percent"), // 0-100
  mehPercent: integer("meh_percent"),
  avoidPercent: integer("avoid_percent"),
  overallVerdict: varchar("overall_verdict", { length: 20 }),
  
  // Insights
  positiveMentions: jsonb("positive_mentions").default([]), // [{text, count}]
  negativeMentions: jsonb("negative_mentions").default([]),
  crowdsourcedTips: jsonb("crowdsourced_tips").default([]), // [{tip, mentions, context}]
  
  // Photo vs Reality
  realityScore: integer("reality_score"), // 1-10
  expectationGap: integer("expectation_gap"), // -5 to +5
  
  // Cache metadata
  hitCount: integer("hit_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  lastAccessedAt: timestamp("last_accessed_at").defaultNow(),
});

// Crowd Forecasts - Predicted crowd levels by hour
export const travelPulseCrowdForecasts = pgTable("travel_pulse_crowd_forecasts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  placeName: varchar("place_name", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  
  // Forecast period
  forecastDate: date("forecast_date").notNull(),
  hourOfDay: integer("hour_of_day").notNull(), // 0-23
  
  // Prediction
  crowdLevelPercent: integer("crowd_level_percent"), // 0-100
  crowdLevelLabel: varchar("crowd_level_label", { length: 20 }), // quiet, moderate, busy, packed
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }), // 0.00 to 1.00
  
  // Context
  weatherForecast: varchar("weather_forecast", { length: 50 }),
  specialEvents: jsonb("special_events").default([]),
  
  // Recommendations
  isOptimalWindow: boolean("is_optimal_window").default(false),
  isAvoidWindow: boolean("is_avoid_window").default(false),
  
  generatedAt: timestamp("generated_at").defaultNow(),
});

// Calendar Events - Festivals, holidays, events affecting travel
export const travelPulseCalendarEvents = pgTable("travel_pulse_calendar_events", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventName: varchar("event_name", { length: 255 }).notNull(),
  eventType: varchar("event_type", { length: 50 }), // festival, holiday, conference, sporting, cultural
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  region: varchar("region", { length: 100 }), // For multi-city events
  
  // Dates
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  
  // Impact
  crowdImpact: varchar("crowd_impact", { length: 20 }), // low, moderate, high, extreme
  priceImpact: varchar("price_impact", { length: 20 }), // lower, normal, higher, surge
  crowdImpactPercent: integer("crowd_impact_percent"), // Expected % increase
  
  // Details
  description: text("description"),
  affectedAreas: jsonb("affected_areas").default([]), // Specific neighborhoods/attractions affected
  tips: jsonb("tips").default([]), // Advice for travelers during this event
  
  // Metadata
  source: varchar("source", { length: 50 }),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// TravelPulse schemas and types
export const insertTravelPulseTrendingSchema = createInsertSchema(travelPulseTrending).omit({ id: true, detectedAt: true, lastUpdated: true });
export const insertTravelPulseLiveScoreSchema = createInsertSchema(travelPulseLiveScores).omit({ id: true, calculatedAt: true });
export const insertTravelPulseTruthCheckSchema = createInsertSchema(travelPulseTruthChecks).omit({ id: true, createdAt: true, lastAccessedAt: true });
export const insertTravelPulseCrowdForecastSchema = createInsertSchema(travelPulseCrowdForecasts).omit({ id: true, generatedAt: true });
export const insertTravelPulseCalendarEventSchema = createInsertSchema(travelPulseCalendarEvents).omit({ id: true, createdAt: true, updatedAt: true });

export type TravelPulseTrending = typeof travelPulseTrending.$inferSelect;
export type InsertTravelPulseTrending = z.infer<typeof insertTravelPulseTrendingSchema>;
export type TravelPulseLiveScore = typeof travelPulseLiveScores.$inferSelect;
export type InsertTravelPulseLiveScore = z.infer<typeof insertTravelPulseLiveScoreSchema>;
export type TravelPulseTruthCheck = typeof travelPulseTruthChecks.$inferSelect;
export type InsertTravelPulseTruthCheck = z.infer<typeof insertTravelPulseTruthCheckSchema>;
export type TravelPulseCrowdForecast = typeof travelPulseCrowdForecasts.$inferSelect;
export type InsertTravelPulseCrowdForecast = z.infer<typeof insertTravelPulseCrowdForecastSchema>;
export type TravelPulseCalendarEvent = typeof travelPulseCalendarEvents.$inferSelect;
export type InsertTravelPulseCalendarEvent = z.infer<typeof insertTravelPulseCalendarEventSchema>;

// ============================================
// TRAVELPULSE EXTENDED - Cities, Hidden Gems, Live Feed
// ============================================

// Vibe tags for cities
export const cityVibeTagsEnum = ["romantic", "adventure", "foodie", "nightlife", "cultural", "relaxation", "family", "budget", "luxury", "nature"] as const;

// City Pulse - Aggregated city-level intelligence
export const travelPulseCities = pgTable("travel_pulse_cities", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // City identification
  cityName: varchar("city_name", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  countryCode: varchar("country_code", { length: 3 }),
  region: varchar("region", { length: 100 }),
  timezone: varchar("timezone", { length: 50 }),
  
  // Coordinates for map
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  // Pulse metrics
  pulseScore: integer("pulse_score").default(0), // 0-100 overall activity score
  activeTravelers: integer("active_travelers").default(0), // Currently active travelers
  trendingScore: integer("trending_score").default(0), // How hot is it trending
  crowdLevel: varchar("crowd_level", { length: 20 }).default("moderate"), // quiet, moderate, busy, packed
  
  // Vibe and highlights
  vibeTags: jsonb("vibe_tags").default([]), // Array of vibe tags
  currentHighlight: text("current_highlight"), // e.g., "Cherry Blossom Season"
  highlightEmoji: varchar("highlight_emoji", { length: 10 }),
  
  // Weather and conditions
  currentWeather: jsonb("current_weather").default({}), // temp, conditions, etc.
  weatherScore: integer("weather_score").default(50), // 0-100 how good is weather for travel
  
  // Price trends
  avgHotelPrice: decimal("avg_hotel_price", { precision: 10, scale: 2 }),
  priceChange: decimal("price_change", { precision: 5, scale: 2 }), // % change from last week
  priceTrend: varchar("price_trend", { length: 20 }), // up, down, stable
  dealAlert: text("deal_alert"), // e.g., "Hotels dropped 30%!"
  
  // Stats
  totalTrendingSpots: integer("total_trending_spots").default(0),
  totalHiddenGems: integer("total_hidden_gems").default(0),
  totalAlerts: integer("total_alerts").default(0),
  
  // Images
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  
  // AI Intelligence Data
  aiGeneratedAt: timestamp("ai_generated_at"), // When AI last updated this city
  aiSourceModel: varchar("ai_source_model", { length: 50 }), // e.g., "grok-2-1212"
  
  // AI Seasonal Insights (for Calendar integration)
  aiBestTimeToVisit: text("ai_best_time_to_visit"), // e.g., "March-May for cherry blossoms"
  aiSeasonalHighlights: jsonb("ai_seasonal_highlights").default([]), // Monthly highlights
  aiUpcomingEvents: jsonb("ai_upcoming_events").default([]), // Next 30 days events
  
  // AI Travel Tips & Recommendations
  aiTravelTips: jsonb("ai_travel_tips").default([]), // Array of tips
  aiLocalInsights: text("ai_local_insights"), // Cultural nuances, local customs
  aiSafetyNotes: text("ai_safety_notes"), // Current safety considerations
  
  // AI Optimization Data (for itinerary optimization)
  aiOptimalDuration: varchar("ai_optimal_duration", { length: 50 }), // e.g., "3-5 days"
  aiBudgetEstimate: jsonb("ai_budget_estimate").default({}), // { low: 100, mid: 200, high: 400 }
  aiMustSeeAttractions: jsonb("ai_must_see_attractions").default([]), // Top attractions
  aiAvoidDates: jsonb("ai_avoid_dates").default([]), // Dates to avoid

  expiresAt: timestamp("expires_at"),
  aiRefreshErrorCount: integer("ai_refresh_error_count").default(0),
  lastRefreshStatus: varchar("last_refresh_status", { length: 20 }),

  // Timestamps
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Hidden Gems - Local favorites tourists haven't discovered
export const travelPulseHiddenGems = pgTable("travel_pulse_hidden_gems", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // Location
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }),
  placeName: varchar("place_name", { length: 200 }).notNull(),
  placeType: varchar("place_type", { length: 50 }), // restaurant, cafe, attraction, etc.
  address: text("address"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  // Gem metrics
  localRating: decimal("local_rating", { precision: 3, scale: 2 }), // How locals rate it
  touristMentions: integer("tourist_mentions").default(0), // Low = more hidden
  localMentions: integer("local_mentions").default(0), // High = local favorite
  gemScore: integer("gem_score").default(0), // 0-100 how "hidden" and good it is
  
  // Discovery status
  discoveryStatus: varchar("discovery_status", { length: 20 }).default("hidden"), // hidden, emerging, discovered
  daysUntilMainstream: integer("days_until_mainstream"),
  
  // Details
  description: text("description"),
  whyLocalsLoveIt: text("why_locals_love_it"),
  bestFor: jsonb("best_for").default([]), // Array of use cases
  priceRange: varchar("price_range", { length: 10 }), // $, $$, $$$, $$$$
  
  // Media
  imageUrl: text("image_url"),
  
  // AI source tracking
  aiGenerated: boolean("ai_generated").default(false),
  aiGeneratedAt: timestamp("ai_generated_at"),
  
  // Neighborhood tag (v2 spec §5.1) — soft reference into city_neighborhoods.slug;
  // populated by backfill-gem-neighborhoods.ts or set directly on AI generation.
  neighborhood: varchar("neighborhood", { length: 100 }),

  // Expert curation link — when set, the gem was explicitly recommended or
  // curated by this expert. Soft FK into users.id (expert role). Populated
  // manually by admins or via the expert workspace "Recommend a gem" action.
  curatedByExpertId: varchar("curated_by_expert_id", { length: 255 }),

  // Timestamps
  detectedAt: timestamp("detected_at").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// === City Neighborhoods Lookup (v2 spec §5.1) ===
// Explicit, denormalized neighborhood tagging is preferred over pure proximity:
// stable, cheap to query, and lets the location-view ecosystem-unit roll up by name.
// This table provides centroids so gems (which have lat/lng) can auto-backfill,
// and powers the provider listing form's neighborhood picker per selected city.
export const cityNeighborhoods = pgTable("city_neighborhoods", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),

  // Centroid + radius for nearest-match backfill of items with lat/lng.
  centroidLat: decimal("centroid_lat", { precision: 10, scale: 7 }).notNull(),
  centroidLng: decimal("centroid_lng", { precision: 10, scale: 7 }).notNull(),
  radiusKm: decimal("radius_km", { precision: 5, scale: 2 }).default("1.50"),

  description: text("description"),
  isFeatured: boolean("is_featured").default(false),

  // Master Integration Brief — Phase 3 additions.
  // adjacentKeys: slugs of neighboring neighborhoods (proximity ranking signal
  // for the upsell engine). NULL = unknown / no graph yet (deferred per brief).
  // leadExpertTarget: per SEED_DATA §7 "featured-lead slot: 1". Admin can tune.
  adjacentKeys: text("adjacent_keys").array(),
  leadExpertTarget: integer("lead_expert_target").notNull().default(1),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqCitySlug: unique("city_neighborhoods_city_country_slug_uniq").on(table.city, table.country, table.slug),
}));

// A market's self-rendered geography layer (water/parks/roads polylines in lon/lat), DB-backed
// so the admin "Add market" flow is one action with no code commit per market (CLAUDE.md §20b,
// migration 186; decision-maker ratified Aug 9 2026). Written by the server-side Overpass
// extract (same length-ranked caps as scripts/generate-market-geography.ts); read DB-first with
// the committed KYOTO_GEOGRAPHY literal as server-side fallback. Absent row = the market
// honestly renders without a geography layer (§13 — never another city's shapes). ODbL: every
// render of this data carries "© OpenStreetMap contributors". Declared here per the
// publish-trap rule — an undeclared table would be dropped by the deploy push.
export const marketGeography = pgTable("market_geography", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  market: varchar("market", { length: 100 }).notNull().unique(), // slug, matches getMarketGeography contains-lookup
  displayName: varchar("display_name", { length: 100 }),
  country: varchar("country", { length: 100 }),
  bbox: jsonb("bbox").notNull(), // [west, south, east, north] lon/lat
  water: jsonb("water").notNull().default([]), // [[lon,lat],...][] polylines
  parks: jsonb("parks").notNull().default([]),
  roads: jsonb("roads").notNull().default([]),
  // Honesty metadata: {water:{kept,total},parks:{...},roads:{...}} — a capped extract must
  // never read as full OSM coverage (§13).
  wayCounts: jsonb("way_counts"),
  source: varchar("source", { length: 30 }).notNull().default("overpass"),
  extractedAt: timestamp("extracted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Phase 3 join + target tables ───────────────────────────────────────────
// expertNeighborhoods: expert ↔ neighborhood. Soft-exclusive "lead" enforced
// at DB level by a partial unique index (one is_lead=true per neighborhood).
export const expertNeighborhoods = pgTable("expert_neighborhoods", {
  id: uuid("id").primaryKey().defaultRandom(),
  expertId: varchar("expert_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  neighborhoodId: varchar("neighborhood_id").notNull().references(() => cityNeighborhoods.id, { onDelete: "cascade" }),
  isLead: boolean("is_lead").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqExpertNeighborhood: unique("expert_neighborhoods_expert_neighborhood_uniq").on(table.expertId, table.neighborhoodId),
  // Migration 041. Deploy-push rule (full rationale in the `bookings` block) — created only in
  // migration SQL, so every publish dropped it. The partial WHERE is what makes this express
  // "at most ONE lead expert per neighborhood" rather than "one row per neighborhood": without
  // it the index would forbid a second non-lead expert, which is the opposite of the intent.
  oneLeadPerNeighborhood: uniqueIndex("idx_expert_neighborhoods_one_lead_per")
    .on(table.neighborhoodId)
    .where(sql`is_lead = true`),
}));
export type ExpertNeighborhood = typeof expertNeighborhoods.$inferSelect;
export const insertExpertNeighborhoodSchema = createInsertSchema(expertNeighborhoods).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpertNeighborhood = z.infer<typeof insertExpertNeighborhoodSchema>;

// providerNeighborhoodCoverage: which providers serve which neighborhood × category.
// Powers the "category × neighborhood" upsell query (brief Phase 3 gate).
export const providerNeighborhoodCoverage = pgTable("provider_neighborhood_coverage", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: varchar("provider_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  neighborhoodId: varchar("neighborhood_id").notNull().references(() => cityNeighborhoods.id, { onDelete: "cascade" }),
  // Soft FK into service_categories.category_key (the brief's join key).
  categoryKey: varchar("category_key", { length: 100 }).notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqProviderNeighborhoodCategory: unique("provider_neighborhood_coverage_uniq").on(table.providerId, table.neighborhoodId, table.categoryKey),
}));
export type ProviderNeighborhoodCoverage = typeof providerNeighborhoodCoverage.$inferSelect;
export const insertProviderNeighborhoodCoverageSchema = createInsertSchema(providerNeighborhoodCoverage).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProviderNeighborhoodCoverage = z.infer<typeof insertProviderNeighborhoodCoverageSchema>;

// neighborhoodCoverageTarget: per (neighborhood, category) target count.
// Lead-expert target lives on cityNeighborhoods.leadExpertTarget — not here.
export const neighborhoodCoverageTarget = pgTable("neighborhood_coverage_target", {
  neighborhoodId: varchar("neighborhood_id").notNull().references(() => cityNeighborhoods.id, { onDelete: "cascade" }),
  categoryKey: varchar("category_key", { length: 100 }).notNull(),
  targetCount: integer("target_count").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  pk: primaryKey({ name: "neighborhood_coverage_target_pk", columns: [table.neighborhoodId, table.categoryKey] }),
}));
export type NeighborhoodCoverageTargetRow = typeof neighborhoodCoverageTarget.$inferSelect;
export const insertNeighborhoodCoverageTargetSchema = createInsertSchema(neighborhoodCoverageTarget).omit({ createdAt: true, updatedAt: true });
export type InsertNeighborhoodCoverageTargetRow = z.infer<typeof insertNeighborhoodCoverageTargetSchema>;

// Live Activity Feed - Real-time traveler activity
export const travelPulseLiveActivity = pgTable("travel_pulse_live_activity", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // Location
  city: varchar("city", { length: 100 }).notNull(),
  placeName: varchar("place_name", { length: 200 }),
  
  // Activity details
  activityType: varchar("activity_type", { length: 50 }).notNull(), // check_in, discovery, review, photo, booking
  activityText: text("activity_text").notNull(), // e.g., "discovered a hidden gem"
  activityEmoji: varchar("activity_emoji", { length: 10 }),
  
  // User (anonymized)
  userName: varchar("user_name", { length: 50 }), // First name only or pseudonym
  userAvatar: text("user_avatar"),
  
  // Engagement
  likesCount: integer("likes_count").default(0),
  
  // Timestamps
  occurredAt: timestamp("occurred_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Activity feed items expire
});

// User Discovery Scores - Gamification
export const travelPulseDiscoveryScores = pgTable("travel_pulse_discovery_scores", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 255 }).notNull(),
  
  // Scores
  totalDiscoveryScore: integer("total_discovery_score").default(0),
  hiddenGemsFound: integer("hidden_gems_found").default(0),
  emergingSpotsVisited: integer("emerging_spots_visited").default(0),
  tipsContributed: integer("tips_contributed").default(0),
  
  // Badges
  badges: jsonb("badges").default([]), // Array of badge objects
  
  // Rank
  rank: varchar("rank", { length: 50 }).default("Explorer"), // Explorer, Pathfinder, Pioneer, Legend
  
  // Timestamps
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// City Alerts - Safety, weather, events
export const travelPulseCityAlerts = pgTable("travel_pulse_city_alerts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  city: varchar("city", { length: 100 }).notNull(),
  alertType: varchar("alert_type", { length: 50 }).notNull(), // safety, weather, event, price, crowd
  severity: varchar("severity", { length: 20 }).default("info"), // info, warning, critical
  
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  emoji: varchar("emoji", { length: 10 }),
  
  actionUrl: text("action_url"),
  actionText: varchar("action_text", { length: 50 }),
  
  isActive: boolean("is_active").default(true),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// What's Happening Now - Live events in cities
export const travelPulseHappeningNow = pgTable("travel_pulse_happening_now", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  city: varchar("city", { length: 100 }).notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // popup, festival, market, performance, special
  
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  venue: varchar("venue", { length: 200 }),
  address: text("address"),
  
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  
  crowdLevel: varchar("crowd_level", { length: 20 }),
  entryFee: varchar("entry_fee", { length: 50 }),
  
  imageUrl: text("image_url"),
  sourceUrl: text("source_url"),
  
  isLive: boolean("is_live").default(false),
  detectedAt: timestamp("detected_at").defaultNow(),
});

// Extended TravelPulse schemas and types
// City Media Cache - Aggregated photos and videos from multiple sources
export const cityMediaCache = pgTable("city_media_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // City reference
  cityId: varchar("city_id").references(() => travelPulseCities.id, { onDelete: "cascade" }),
  cityName: varchar("city_name", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  
  // Media source
  source: varchar("source", { length: 20 }).notNull(), // unsplash, pexels, google_places
  mediaType: varchar("media_type", { length: 20 }).notNull(), // photo, video
  
  // Media details
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  previewUrl: text("preview_url"), // For videos
  
  // Dimensions
  width: integer("width"),
  height: integer("height"),
  duration: integer("duration"), // For videos, in seconds
  
  // Context - what this media represents
  context: varchar("context", { length: 50 }), // hero, attraction, seasonal, general, hidden_gem
  contextQuery: text("context_query"), // Search query used to find this
  attractionName: varchar("attraction_name", { length: 200 }), // If linked to specific attraction
  
  // Attribution (required by APIs)
  photographerName: varchar("photographer_name", { length: 200 }),
  photographerUrl: text("photographer_url"),
  sourceName: varchar("source_name", { length: 100 }), // e.g., "Unsplash", "Pexels"
  sourceUrl: text("source_url"), // Link back to original
  license: varchar("license", { length: 50 }),
  downloadLocationUrl: text("download_location_url"), // For Unsplash API compliance - must trigger when photo is used
  
  // Google Places specific
  googlePlaceId: varchar("google_place_id", { length: 200 }),
  htmlAttributions: text("html_attributions").array(), // Required by Google - must display exactly as provided
  
  // Quality and ranking
  qualityScore: integer("quality_score").default(50), // 0-100 for sorting
  isPrimary: boolean("is_primary").default(false), // Is this the main image for this context
  
  // Cache management
  fetchedAt: timestamp("fetched_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // When to refresh
  isActive: boolean("is_active").default(true),
});

export const insertTravelPulseCitySchema = createInsertSchema(travelPulseCities).omit({ id: true, lastUpdated: true, createdAt: true });
export const insertTravelPulseHiddenGemSchema = createInsertSchema(travelPulseHiddenGems).omit({ id: true, detectedAt: true, lastUpdated: true });
export const insertTravelPulseLiveActivitySchema = createInsertSchema(travelPulseLiveActivity).omit({ id: true, occurredAt: true });
export const insertTravelPulseDiscoveryScoreSchema = createInsertSchema(travelPulseDiscoveryScores).omit({ id: true, lastActivityAt: true, createdAt: true });
export const insertTravelPulseCityAlertSchema = createInsertSchema(travelPulseCityAlerts).omit({ id: true, createdAt: true });
export const insertTravelPulseHappeningNowSchema = createInsertSchema(travelPulseHappeningNow).omit({ id: true, detectedAt: true });
export const insertCityMediaCacheSchema = createInsertSchema(cityMediaCache).omit({ id: true, fetchedAt: true });

export type TravelPulseCity = typeof travelPulseCities.$inferSelect;
export type InsertTravelPulseCity = z.infer<typeof insertTravelPulseCitySchema>;
export type TravelPulseHiddenGem = typeof travelPulseHiddenGems.$inferSelect;
export type InsertTravelPulseHiddenGem = z.infer<typeof insertTravelPulseHiddenGemSchema>;
export type TravelPulseLiveActivity = typeof travelPulseLiveActivity.$inferSelect;
export type InsertTravelPulseLiveActivity = z.infer<typeof insertTravelPulseLiveActivitySchema>;
export type TravelPulseDiscoveryScore = typeof travelPulseDiscoveryScores.$inferSelect;
export type InsertTravelPulseDiscoveryScore = z.infer<typeof insertTravelPulseDiscoveryScoreSchema>;
export type TravelPulseCityAlert = typeof travelPulseCityAlerts.$inferSelect;
export type InsertTravelPulseCityAlert = z.infer<typeof insertTravelPulseCityAlertSchema>;
export type TravelPulseHappeningNow = typeof travelPulseHappeningNow.$inferSelect;
export type InsertTravelPulseHappeningNow = z.infer<typeof insertTravelPulseHappeningNowSchema>;
export type CityMediaCache = typeof cityMediaCache.$inferSelect;
export type InsertCityMediaCache = z.infer<typeof insertCityMediaCacheSchema>;

// === Experience Template Tabs & Filters System ===

export const experienceTemplateTabs = pgTable("experience_template_tabs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  experienceTypeId: varchar("experience_type_id").notNull().references(() => experienceTypes.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(), // "Destinations", "Accommodations"
  slug: varchar("slug", { length: 50 }).notNull(), // "destinations", "accommodations"
  description: text("description"), // Logistics role description
  icon: varchar("icon", { length: 50 }), // Lucide icon name
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  tabType: varchar("tab_type", { length: 50 }).default("venue-search"), // "flights"|"hotels"|"venue-search"|"activity-search"|"transport"
  controlConfig: jsonb("control_config"), // filter control descriptors for flight/hotel tabs
  createdAt: timestamp("created_at").defaultNow(),
});

export const experienceTemplateFilters = pgTable("experience_template_filters", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tabId: varchar("tab_id").notNull().references(() => experienceTemplateTabs.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(), // "Distance from Origin", "Vibe"
  slug: varchar("slug", { length: 50 }).notNull(), // "distance", "vibe"
  description: text("description"),
  filterType: varchar("filter_type", { length: 30 }).default("multi_select"), // single_select, multi_select, range, toggle
  icon: varchar("icon", { length: 50 }),
  sortOrder: integer("sort_order").default(0),
  isRequired: boolean("is_required").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const experienceTemplateFilterOptions = pgTable("experience_template_filter_options", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  filterId: varchar("filter_id").notNull().references(() => experienceTemplateFilters.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 100 }).notNull(), // "Drivable", "Short Flight 0-3hrs"
  value: varchar("value", { length: 100 }).notNull(), // "drivable", "short_flight"
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  minValue: decimal("min_value", { precision: 10, scale: 2 }), // For range filters
  maxValue: decimal("max_value", { precision: 10, scale: 2 }), // For range filters
  sortOrder: integer("sort_order").default(0),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Universal filters that apply to all tabs within an experience type
export const experienceUniversalFilters = pgTable("experience_universal_filters", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  experienceTypeId: varchar("experience_type_id").notNull().references(() => experienceTypes.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull(),
  description: text("description"),
  filterType: varchar("filter_type", { length: 30 }).default("multi_select"),
  icon: varchar("icon", { length: 50 }),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const experienceUniversalFilterOptions = pgTable("experience_universal_filter_options", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  filterId: varchar("filter_id").notNull().references(() => experienceUniversalFilters.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 100 }).notNull(),
  value: varchar("value", { length: 100 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  minValue: decimal("min_value", { precision: 10, scale: 2 }),
  maxValue: decimal("max_value", { precision: 10, scale: 2 }),
  sortOrder: integer("sort_order").default(0),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertExperienceTemplateTabSchema = createInsertSchema(experienceTemplateTabs).omit({ id: true, createdAt: true });
export const insertExperienceTemplateFilterSchema = createInsertSchema(experienceTemplateFilters).omit({ id: true, createdAt: true });
export const insertExperienceTemplateFilterOptionSchema = createInsertSchema(experienceTemplateFilterOptions).omit({ id: true, createdAt: true });
export const insertExperienceUniversalFilterSchema = createInsertSchema(experienceUniversalFilters).omit({ id: true, createdAt: true });
export const insertExperienceUniversalFilterOptionSchema = createInsertSchema(experienceUniversalFilterOptions).omit({ id: true, createdAt: true });

export type ExperienceTemplateTab = typeof experienceTemplateTabs.$inferSelect;
export type InsertExperienceTemplateTab = z.infer<typeof insertExperienceTemplateTabSchema>;
export type ExperienceTemplateFilter = typeof experienceTemplateFilters.$inferSelect;
export type InsertExperienceTemplateFilter = z.infer<typeof insertExperienceTemplateFilterSchema>;
export type ExperienceTemplateFilterOption = typeof experienceTemplateFilterOptions.$inferSelect;
export type InsertExperienceTemplateFilterOption = z.infer<typeof insertExperienceTemplateFilterOptionSchema>;
export type ExperienceUniversalFilter = typeof experienceUniversalFilters.$inferSelect;
export type InsertExperienceUniversalFilter = z.infer<typeof insertExperienceUniversalFilterSchema>;
export type ExperienceUniversalFilterOption = typeof experienceUniversalFilterOptions.$inferSelect;
export type InsertExperienceUniversalFilterOption = z.infer<typeof insertExperienceUniversalFilterOptionSchema>;

// === Logistics Intelligence Layer ===

// Enums for logistics
export const participantStatusEnum = ["invited", "pending", "confirmed", "declined", "maybe", "cancelled"] as const;
export const paymentStatusEnum = ["unpaid", "partial", "paid", "refunded", "overdue"] as const;
export const contractStatusEnum = ["draft", "sent", "negotiating", "signed", "active", "completed", "cancelled", "disputed"] as const;
export const transactionTypeEnum = ["deposit", "payment", "refund", "split_contribution", "expense", "fee", "tip"] as const;
export const itineraryItemTypeEnum = ["activity", "meal", "transport", "accommodation", "free_time", "meeting", "checkpoint"] as const;
export const itineraryItemStatusEnum = ["planned", "booked", "confirmed", "in_progress", "completed", "cancelled", "skipped"] as const;
export const alertSeverityEnum = ["info", "low", "medium", "high", "critical"] as const;

// Trip Participants - RSVP tracking and group coordination
export const tripParticipants = pgTable("trip_participants", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }), // null for non-registered guests
  
  // Basic info
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  role: varchar("role", { length: 50 }).default("guest"), // organizer, co-organizer, guest, vendor_contact
  
  // RSVP tracking
  status: varchar("status", { length: 20 }).default("invited"), // participantStatusEnum
  invitedAt: timestamp("invited_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  rsvpNotes: text("rsvp_notes"),
  
  // Dietary and accessibility
  dietaryRestrictions: jsonb("dietary_restrictions").default([]), // ["vegetarian", "gluten-free", "nut-allergy"]
  accessibilityNeeds: jsonb("accessibility_needs").default([]), // ["wheelchair", "hearing-impaired"]
  specialRequests: text("special_requests"),
  
  // Payment tracking
  paymentStatus: varchar("payment_status", { length: 20 }).default("unpaid"), // paymentStatusEnum
  amountOwed: decimal("amount_owed", { precision: 10, scale: 2 }).default("0"),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0"),
  paymentMethod: varchar("payment_method", { length: 50 }), // venmo, paypal, bank_transfer, cash, card
  paymentNotes: text("payment_notes"),
  
  // Emergency contact for this participant
  emergencyContactName: varchar("emergency_contact_name", { length: 200 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 50 }),
  emergencyContactRelation: varchar("emergency_contact_relation", { length: 50 }),
  
  // Logistics - group coordination
  arrivalDatetime: timestamp("arrival_datetime"), // when this participant arrives
  departureDatetime: timestamp("departure_datetime"), // when this participant departs
  mobilityLevel: varchar("mobility_level", { length: 20 }).default("high"), // high, medium, low
  mandatoryEventIds: jsonb("mandatory_event_ids").default([]), // itinerary item IDs they MUST attend
  optionalEventIds: jsonb("optional_event_ids").default([]), // itinerary item IDs they CAN attend

  // Metadata
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Vendor Contracts - Contract tracking and payment schedules
export const vendorContracts = pgTable("vendor_contracts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  vendorId: varchar("vendor_id").references(() => vendors.id, { onDelete: "set null" }), // Link to existing vendor if applicable
  
  // Vendor info (stored in case vendor record changes/deleted)
  vendorName: varchar("vendor_name", { length: 255 }).notNull(),
  vendorCategory: varchar("vendor_category", { length: 100 }), // venue, catering, photography, entertainment, etc.
  vendorEmail: varchar("vendor_email", { length: 255 }),
  vendorPhone: varchar("vendor_phone", { length: 50 }),
  vendorAddress: text("vendor_address"),
  
  // Contract details
  contractStatus: varchar("contract_status", { length: 20 }).default("draft"), // contractStatusEnum
  contractNumber: varchar("contract_number", { length: 100 }),
  serviceDescription: text("service_description"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  
  // Financial
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }).default("0"),
  remainingBalance: decimal("remaining_balance", { precision: 10, scale: 2 }),
  
  // Payment schedule (array of payment milestones)
  paymentSchedule: jsonb("payment_schedule").default([]), // [{name, amount, dueDate, status, paidDate}]
  
  // Documents
  contractDocumentUrl: text("contract_document_url"),
  signedDocumentUrl: text("signed_document_url"),
  attachments: jsonb("attachments").default([]), // [{name, url, type}]
  
  // Terms
  cancellationPolicy: text("cancellation_policy"),
  specialTerms: text("special_terms"),
  notes: text("notes"),
  
  // Communication log
  communicationLog: jsonb("communication_log").default([]), // [{date, type, subject, summary, attachments}]
  lastContactDate: timestamp("last_contact_date"),
  nextFollowUpDate: timestamp("next_follow_up_date"),
  
  // Assignment to participant (if vendor is assigned to specific person)
  assignedToParticipantId: varchar("assigned_to_participant_id").references(() => tripParticipants.id, { onDelete: "set null" }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Trip Transactions - Budget tracking and payment splitting
export const tripTransactions = pgTable("trip_transactions", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  
  // Transaction type and status
  transactionType: varchar("transaction_type", { length: 30 }).notNull(), // transactionTypeEnum
  status: varchar("status", { length: 20 }).default("unpaid"), // paymentStatusEnum
  
  // Who paid / who owes
  paidByParticipantId: varchar("paid_by_participant_id").references(() => tripParticipants.id, { onDelete: "set null" }),
  paidToVendorContractId: varchar("paid_to_vendor_contract_id").references(() => vendorContracts.id, { onDelete: "set null" }),
  
  // For split payments - who this split is assigned to
  assignedToParticipantId: varchar("assigned_to_participant_id").references(() => tripParticipants.id, { onDelete: "set null" }),
  
  // Amount details
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  originalAmount: decimal("original_amount", { precision: 10, scale: 2 }), // If currency conversion applied
  originalCurrency: varchar("original_currency", { length: 3 }),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }),
  
  // Category for budgeting
  category: varchar("category", { length: 50 }), // accommodation, food, transport, activities, tips, fees, other
  subcategory: varchar("subcategory", { length: 50 }),
  description: text("description"),
  
  // Payment details
  paymentMethod: varchar("payment_method", { length: 50 }), // card, cash, venmo, paypal, bank_transfer
  paymentReference: varchar("payment_reference", { length: 255 }), // transaction ID, check number, etc.
  receiptUrl: text("receipt_url"),
  
  // Dates
  transactionDate: timestamp("transaction_date").defaultNow(),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),
  
  // Tip calculation (for service transactions)
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }),
  tipPercentage: decimal("tip_percentage", { precision: 5, scale: 2 }),
  
  // Split details
  splitMethod: varchar("split_method", { length: 20 }), // equal, percentage, custom
  splitDetails: jsonb("split_details").default([]), // [{participantId, amount, percentage, paid}]
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Itinerary Items - Scheduling and optimization
export const itineraryItems = pgTable("itinerary_items", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  
  // Basic info
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  itemType: varchar("item_type", { length: 30 }).default("activity"), // itineraryItemTypeEnum
  status: varchar("status", { length: 20 }).default("planned"), // itineraryItemStatusEnum
  
  // Timing
  dayNumber: integer("day_number").notNull(), // 1, 2, 3, etc.
  startTime: varchar("start_time", { length: 10 }), // "09:00"
  endTime: varchar("end_time", { length: 10 }), // "11:00"
  durationMinutes: integer("duration_minutes"),
  isFlexible: boolean("is_flexible").default(false), // Can timing be adjusted?
  
  // Location
  locationName: varchar("location_name", { length: 255 }),
  locationAddress: text("location_address"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  googlePlaceId: varchar("google_place_id", { length: 255 }),
  
  // Travel to this item
  travelFromPrevious: jsonb("travel_from_previous").default({}), // {mode, duration, distance, instructions}
  
  // Booking info
  vendorContractId: varchar("vendor_contract_id").references(() => vendorContracts.id, { onDelete: "set null" }),
  // Link to a bookable platform service (provider_services) when an expert drops one onto the
  // itinerary from the Workstation service catalog. Nullable — free-text/place items have none.
  // ON DELETE SET NULL so removing the underlying service doesn't cascade-delete the plan item.
  providerServiceId: varchar("provider_service_id").references(() => providerServices.id, { onDelete: "set null" }),
  bookingReference: varchar("booking_reference", { length: 255 }),
  bookingStatus: varchar("booking_status", { length: 20 }), // not_required, pending, confirmed, cancelled
  // The item↔booking key (migration 159; master brief §5 item 2). Stamped by the checkout confirm
  // path atomically with `routingStatus → 'purchased'`, and the key the refund/cancel reversal
  // edge (`purchased → in_planning`) resolves through. Nullable — an item has no booking until
  // bought. ON DELETE SET NULL so removing a booking never cascade-deletes the plan item.
  bookingId: varchar("booking_id").references(() => serviceBookings.id, { onDelete: "set null" }),
  confirmationNumber: varchar("confirmation_number", { length: 255 }),
  
  // Cost
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  costPerPerson: boolean("cost_per_person").default(false),
  
  // Energy level for optimization
  energyLevel: varchar("energy_level", { length: 20 }), // low, medium, high, very_high
  isOutdoor: boolean("is_outdoor").default(false),
  weatherDependent: boolean("weather_dependent").default(false),
  
  // Weather backup (self-reference stored as plain varchar to avoid circular dependency)
  backupPlanId: varchar("backup_plan_id", { length: 255 }), // References another itinerary item
  isBackupPlan: boolean("is_backup_plan").default(false),
  weatherConditions: jsonb("weather_conditions").default({}), // {requiredConditions, triggers}
  
  // Participants (subset of trip participants for this item)
  participantIds: jsonb("participant_ids").default([]), // IDs of participants attending
  minParticipants: integer("min_participants"),
  maxParticipants: integer("max_participants"),

  // Logistics - energy and scheduling
  energyCost: integer("energy_cost").default(20), // 0-100 scale (complements energyLevel varchar)
  energyType: varchar("energy_type", { length: 20 }), // physical, mental, social, mixed
  attendanceRequirement: varchar("attendance_requirement", { length: 20 }).default("optional"), // all, subset, optional
  conflictsWith: jsonb("conflicts_with").default([]), // itinerary item IDs that can't overlap
  peakTimingPreference: varchar("peak_timing_preference", { length: 20 }), // morning, afternoon, evening, night, flexible

  // Calendar date when this item is planned — carries the "Add to {date}" intent
  scheduledDate: date("scheduled_date"),

  // Notes and attachments
  notes: text("notes"),
  privateNotes: text("private_notes"), // Organizer-only notes
  // Durable per-item expert note (migration 152, Workstation audit C-1) — the traveler-facing
  // tip PlanCard renders per activity. Distinct from notes (traveler's own) and privateNotes
  // (organizer-only): this is the EXPERT's voice on the item. Nullable; NULL = no note.
  expertNote: text("expert_note"),
  // Content logistics envelope (migration 166, QA_PUNCH_LIST item 20) — what the ADDING SOURCE
  // knew about transport at add-time, carried onto the plan item so it survives independent of
  // the source row (a partner-feed or DMO item has nothing else to carry it in). transportProvided
  // mirrors provider_services.transportProvided's app-layer vocabulary (yes|no|not_applicable,
  // no DB CHECK here — see migration 166 header). durationMinutes above already served the
  // "duration" leg of the envelope pre-166. Nullable; NULL = the source never captured that fact
  // (§13 — never fabricated, never defaulted to "not provided" at the DATA layer; the transport-gap
  // checker (21) is the layer that treats unknown as "not provided" for FLAGGING purposes only).
  transportProvided: varchar("transport_provided", { length: 20 }),
  pickupPoint: text("pickup_point"),
  dropOffPoint: text("drop_off_point"),
  attachments: jsonb("attachments").default([]), // [{name, url, type}]
  
  // Suggestion tracking
  suggestedBy: varchar("suggested_by", { length: 20 }), // 'ai', 'expert', 'user'

  // Provenance (migration 181, D2 ratified Aug 7 2026). App-enforced value set = 'ai' | 'traveler'
  // | 'expert' — deliberately NO DB CHECK (publish-time push trap, same posture as
  // `routingStatus`/`transportProvided` above). Nullable: NULL means either (a) a legacy row
  // born before this column existed, or (b) a truly-internal/dead write path this lane
  // deliberately left unstamped — both are ambiguous by construction and are treated as such
  // (see the regenerate-delete predicate below, which only trusts a NON-NULL origin). Server-
  // derived only (§14 posture) — every user-facing create route strips a client-supplied value
  // and re-stamps it from session/assignment state, never from `req.body`.
  origin: varchar("origin", { length: 20 }),

  // Gem link (migration 133, authoring brief §3a — design room only). Soft reference (no FK: two gem
  // tables exist — ai_discovered_gems + travel_pulse_hidden_gems; source disambiguation is future work).
  gemId: varchar("gem_id"),

  // Ordering
  sortOrder: integer("sort_order").default(0),

  // Per-item routing state (migration 159, Trip-Canon Lane 1 W1). Canonical value set =
  // ROUTING_STATUSES above; deliberately NO DB CHECK (see the migration header). The DEFAULT here
  // must stay byte-identical to the migration's explicit ALTER default — the Phase 1a gate proves
  // ORM default == DB default via information_schema, and a divergence would make the publish push
  // rewrite the column default on every deploy.
  routingStatus: varchar("routing_status", { length: 20 }).notNull().default("in_planning"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Declared here, not only in migration 159: per the CLAUDE.md deploy-push rule the publish-time
  // drizzle push is authoritative over objects it does not find in THIS file and will DROP an
  // index that exists only in migration SQL — after which the stamped migration never recreates
  // it. This index serves the refund/cancel reversal lookup (find the item for a booking).
  itineraryItemsBookingIdIdx: index("idx_itinerary_items_booking_id").on(table.bookingId),
}));

// Temporal Anchors - Fixed time commitments that constrain all other scheduling
export const temporalAnchors = pgTable("temporal_anchors", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  userExperienceId: varchar("user_experience_id").references(() => userExperiences.id, { onDelete: "cascade" }),

  // Anchor details
  anchorType: varchar("anchor_type", { length: 50 }).notNull(), // temporalAnchorTypeEnum
  anchorDatetime: timestamp("anchor_datetime").notNull(),
  bufferBefore: integer("buffer_before").default(0), // minutes before anchor that must be kept free
  bufferAfter: integer("buffer_after").default(0), // minutes after anchor that must be kept free

  // Location
  location: varchar("location", { length: 255 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  radiusKm: integer("radius_km").default(5),

  // Constraints
  mustReturnToHotel: boolean("must_return_to_hotel").default(false),
  isImmovable: boolean("is_immovable").default(false),
  dependsOnItemIds: jsonb("depends_on_item_ids").default([]), // itinerary item IDs this anchor depends on

  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Day Boundaries - Per-day constraints like hotel relocations, end-of-day limits
export const dayBoundaries = pgTable("day_boundaries", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),

  // End-of-day constraints
  endLocation: varchar("end_location", { length: 255 }),
  mustReturnToHotel: boolean("must_return_to_hotel").default(false),
  latestActivityEnd: varchar("latest_activity_end", { length: 10 }), // "22:00"
  reasonForConstraint: varchar("reason_for_constraint", { length: 500 }),

  // Relocation details
  relocationRequired: boolean("relocation_required").default(false),
  transitDurationMinutes: integer("transit_duration_minutes").default(0),
  earliestActivityStart: varchar("earliest_activity_start", { length: 10 }), // "13:00"
  nextDayHotelLocation: varchar("next_day_hotel_location", { length: 255 }),

  createdAt: timestamp("created_at").defaultNow(),
});

// Energy Tracking - Per-day energy budget to prevent burnout across multi-day trips
export const energyTracking = pgTable("energy_tracking", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),

  // Energy budget
  startingEnergy: integer("starting_energy").default(100), // 0-100 scale
  activityDepletion: integer("activity_depletion").default(0), // total energy used
  endingEnergy: integer("ending_energy").default(100), // remaining energy

  // Recovery
  recoveryNeeded: boolean("recovery_needed").default(false),
  recoveryReason: varchar("recovery_reason", { length: 500 }),
  energyBreakdown: jsonb("energy_breakdown").default([]), // [{itemId, energyCost, reason}]

  createdAt: timestamp("created_at").defaultNow(),
});

// Logistics Relations
export const temporalAnchorsRelations = relations(temporalAnchors, ({ one }) => ({
  trip: one(trips, { fields: [temporalAnchors.tripId], references: [trips.id] }),
  userExperience: one(userExperiences, { fields: [temporalAnchors.userExperienceId], references: [userExperiences.id] }),
}));

export const dayBoundariesRelations = relations(dayBoundaries, ({ one }) => ({
  trip: one(trips, { fields: [dayBoundaries.tripId], references: [trips.id] }),
}));

export const energyTrackingRelations = relations(energyTracking, ({ one }) => ({
  trip: one(trips, { fields: [energyTracking.tripId], references: [trips.id] }),
}));

// Emergency Contacts - Per-trip emergency information
export const tripEmergencyContacts = pgTable("trip_emergency_contacts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),

  // Contact type
  contactType: varchar("contact_type", { length: 50 }).notNull(), // local_expert, embassy, hospital, police, hotel, airline, insurance, custom
  
  // Contact details
  name: varchar("name", { length: 255 }).notNull(),
  organization: varchar("organization", { length: 255 }),
  phone: varchar("phone", { length: 100 }),
  alternatePhone: varchar("alternate_phone", { length: 100 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  website: text("website"),
  
  // Location
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  // Availability
  available24Hours: boolean("available_24_hours").default(false),
  operatingHours: jsonb("operating_hours").default({}), // {mon: "9-5", tue: "9-5", ...}
  languages: jsonb("languages").default(["English"]),
  
  // Priority and notes
  priority: integer("priority").default(0), // Higher = more important
  notes: text("notes"),
  specialInstructions: text("special_instructions"),
  
  // Verification
  isVerified: boolean("is_verified").default(false),
  lastVerifiedAt: timestamp("last_verified_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Trip Alerts - Active alerts for trips
export const tripAlerts = pgTable("trip_alerts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  
  // Alert details
  alertType: varchar("alert_type", { length: 50 }).notNull(), // weather, safety, health, travel_advisory, vendor, deadline, custom
  severity: varchar("severity", { length: 20 }).default("info"), // alertSeverityEnum
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  
  // Source
  source: varchar("source", { length: 100 }), // weather_api, government_advisory, system, manual
  sourceUrl: text("source_url"),
  
  // Timing
  effectiveFrom: timestamp("effective_from"),
  effectiveUntil: timestamp("effective_until"),
  
  // Status
  isActive: boolean("is_active").default(true),
  isRead: boolean("is_read").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedByUserId: varchar("acknowledged_by_user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Actions
  suggestedActions: jsonb("suggested_actions").default([]), // [{action, url, priority}]
  actionTaken: text("action_taken"),
  
  // Affected items
  affectedItineraryItemIds: jsonb("affected_itinerary_item_ids").default([]),
  affectedVendorContractIds: jsonb("affected_vendor_contract_ids").default([]),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============ SPONTANEOUS ACTIVITIES & LIVE INTEL ENGINE ============

// Spontaneous opportunity types
export const spontaneousOpportunityTypeEnum = ["last_minute", "trending", "local_event", "flash_deal"] as const;
export const signalSourceEnum = ["provider_cache", "fever", "viator", "amadeus", "manual"] as const;

// Spontaneous Opportunities - Live opportunities for instant booking
export const spontaneousOpportunities = pgTable("spontaneous_opportunities", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // Location
  city: varchar("city", { length: 100 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  
  // Type and source
  type: varchar("type", { length: 50 }).notNull(), // spontaneousOpportunityTypeEnum
  source: varchar("source", { length: 50 }).notNull(), // signalSourceEnum
  externalId: varchar("external_id", { length: 255 }), // ID from source provider
  
  // Content
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  affiliateUrl: text("affiliate_url"),
  
  // Pricing
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
  currentPrice: decimal("current_price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  discountPercent: integer("discount_percent"),
  
  // Timing
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  expirationTime: timestamp("expiration_time"), // When this opportunity expires
  
  // Availability
  capacity: integer("capacity"),
  remainingSpots: integer("remaining_spots"),
  
  // Scoring
  urgencyScore: integer("urgency_score").default(0), // 0-100
  actionabilityScore: integer("actionability_score").default(0), // 0-100
  trendingScore: decimal("trending_score", { precision: 5, scale: 2 }).default("0.0"),
  
  // Category and tags
  category: varchar("category", { length: 100 }),
  tags: jsonb("tags").default([]),
  
  // Metadata
  metadata: jsonb("metadata").default({}),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Real-time Signals - Tracking trending and popularity signals
export const realtimeSignals = pgTable("realtime_signals", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // Source identification
  source: varchar("source", { length: 50 }).notNull(), // signalSourceEnum
  keyword: varchar("keyword", { length: 100 }).notNull(),
  location: varchar("location", { length: 100 }),
  
  // Signal strength metrics
  signalStrength: integer("signal_strength").notNull(), // 1-100
  volume: integer("volume"), // Number of mentions/bookings
  sentiment: decimal("sentiment", { precision: 3, scale: 2 }), // -1 to 1
  
  // Related opportunity
  opportunityId: varchar("opportunity_id").references(() => spontaneousOpportunities.id, { onDelete: "cascade" }),
  
  // Timing
  detectedAt: timestamp("detected_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  
  // Metadata
  metadata: jsonb("metadata").default({}),
});

// User Spontaneity Preferences - Personalization settings
export const userSpontaneityPreferences = pgTable("user_spontaneity_preferences", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Spontaneity level (0 = very planned, 100 = very spontaneous)
  spontaneityLevel: integer("spontaneity_level").default(50),
  
  // Location preferences
  notificationRadius: integer("notification_radius").default(10), // km
  preferredCities: jsonb("preferred_cities").default([]),
  
  // Content preferences
  preferredCategories: jsonb("preferred_categories").default([]),
  blacklistedTypes: jsonb("blacklisted_types").default([]),
  
  // Price sensitivity (0 = price conscious, 100 = price insensitive)
  priceSensitivity: integer("price_sensitivity").default(50),
  maxBudgetPerActivity: decimal("max_budget_per_activity", { precision: 10, scale: 2 }),
  
  // Time preferences
  timeWindows: jsonb("time_windows").default([
    { day: "weekend", hours: ["18:00", "22:00"] },
    { day: "weekday", hours: ["19:00", "23:00"] }
  ]),
  
  // Notification settings
  enableNotifications: boolean("enable_notifications").default(true),
  lastNotifiedAt: timestamp("last_notified_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertTripParticipantSchema = createInsertSchema(tripParticipants).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVendorContractSchema = createInsertSchema(vendorContracts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTripTransactionSchema = createInsertSchema(tripTransactions).omit({ id: true, createdAt: true, updatedAt: true });
// `origin` is OMITTED (D2/§14/§19 posture): it is a provenance column stamped server-side only —
// never client-settable via this schema. Every create route strips whatever the client sent and
// re-derives it explicitly (mirroring the pre-existing `suggestedBy` derivation).
export const insertItineraryItemSchema = createInsertSchema(itineraryItems).omit({ id: true, createdAt: true, updatedAt: true, origin: true });
export const insertTripEmergencyContactSchema = createInsertSchema(tripEmergencyContacts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTripAlertSchema = createInsertSchema(tripAlerts).omit({ id: true, createdAt: true, updatedAt: true });

// Spontaneous Activity schemas
export const insertSpontaneousOpportunitySchema = createInsertSchema(spontaneousOpportunities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRealtimeSignalSchema = createInsertSchema(realtimeSignals).omit({ id: true });
export const insertUserSpontaneityPreferencesSchema = createInsertSchema(userSpontaneityPreferences).omit({ id: true, createdAt: true, updatedAt: true });

// Types
export type TripParticipant = typeof tripParticipants.$inferSelect;
export type InsertTripParticipant = z.infer<typeof insertTripParticipantSchema>;
export type VendorContract = typeof vendorContracts.$inferSelect;
export type InsertVendorContract = z.infer<typeof insertVendorContractSchema>;
export type TripTransaction = typeof tripTransactions.$inferSelect;
export type InsertTripTransaction = z.infer<typeof insertTripTransactionSchema>;
export type ItineraryItem = typeof itineraryItems.$inferSelect;
export type InsertItineraryItem = z.infer<typeof insertItineraryItemSchema>;
export type TripEmergencyContact = typeof tripEmergencyContacts.$inferSelect;
export type InsertTripEmergencyContact = z.infer<typeof insertTripEmergencyContactSchema>;
export type TripAlert = typeof tripAlerts.$inferSelect;
export type InsertTripAlert = z.infer<typeof insertTripAlertSchema>;

// Spontaneous Activity types
export type SpontaneousOpportunity = typeof spontaneousOpportunities.$inferSelect;
export type InsertSpontaneousOpportunity = z.infer<typeof insertSpontaneousOpportunitySchema>;
export type RealtimeSignal = typeof realtimeSignals.$inferSelect;
export type InsertRealtimeSignal = z.infer<typeof insertRealtimeSignalSchema>;
export type UserSpontaneityPreferences = typeof userSpontaneityPreferences.$inferSelect;
export type InsertUserSpontaneityPreferences = z.infer<typeof insertUserSpontaneityPreferencesSchema>;

// === SERP API Hybrid Data Tables ===

export const serpCache = pgTable("serp_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  cacheKey: varchar("cache_key", { length: 500 }).unique().notNull(),
  query: text("query").notNull(),
  location: varchar("location", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }),
  template: varchar("template", { length: 100 }),
  results: jsonb("results").notNull(),
  resultCount: integer("result_count").default(0),
  cachedAt: timestamp("cached_at").defaultNow().notNull(),
});

export const serpProviderTracking = pgTable("serp_provider_tracking", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serpProviderId: varchar("serp_provider_id", { length: 200 }).unique().notNull(),
  providerName: varchar("provider_name", { length: 300 }).notNull(),
  destination: varchar("destination", { length: 200 }),
  category: varchar("category", { length: 100 }),
  template: varchar("template", { length: 100 }),
  clickCount: integer("click_count").default(0),
  inquiryCount: integer("inquiry_count").default(0),
  priorityScore: varchar("priority_score", { length: 20 }).default("LOW"),
  lastClickedAt: timestamp("last_clicked_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const serpInquiries = pgTable("serp_inquiries", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull(),
  serpProviderId: varchar("serp_provider_id", { length: 200 }).notNull(),
  providerName: varchar("provider_name", { length: 300 }).notNull(),
  providerEmail: varchar("provider_email", { length: 200 }),
  providerPhone: varchar("provider_phone", { length: 50 }),
  providerWebsite: text("provider_website"),
  message: text("message").notNull(),
  destination: varchar("destination", { length: 200 }),
  category: varchar("category", { length: 100 }),
  template: varchar("template", { length: 100 }),
  status: varchar("status", { length: 50 }).default("pending"),
  sentAt: timestamp("sent_at"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// SERP Insert Schemas
export const insertSerpCacheSchema = createInsertSchema(serpCache).omit({ id: true, cachedAt: true });
export const insertSerpProviderTrackingSchema = createInsertSchema(serpProviderTracking).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSerpInquirySchema = createInsertSchema(serpInquiries).omit({ id: true, createdAt: true, updatedAt: true });

// SERP API Request Validation Schemas
export const serpTemplateSearchQuerySchema = z.object({
  serviceType: z.string().min(1, "serviceType is required"),
  destination: z.string().min(1, "destination is required"),
  template: z.string().optional().default("travel"),
  priceRange: z.string().optional(),
  style: z.string().optional(),
  groupSize: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined)
});

export const serpTrackClickBodySchema = z.object({
  providerId: z.string().min(1, "providerId is required"),
  metadata: z.record(z.unknown()).optional().default({})
});

export const serpInquiryBodySchema = z.object({
  serpProviderId: z.string().min(1, "serpProviderId is required"),
  providerName: z.string().min(1, "providerName is required"),
  providerEmail: z.string().optional(),
  providerPhone: z.string().optional(),
  providerWebsite: z.string().optional(),
  message: z.string().min(1, "Message is required").min(10, "Message must be at least 10 characters"),
  destination: z.string().optional().default(""),
  category: z.string().optional().default(""),
  template: z.string().optional().default("")
});

const safeParseFloat = (val: string | undefined): number | undefined => {
  if (!val) return undefined;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? undefined : parsed;
};

const safeParseInt = (val: string | undefined): number | undefined => {
  if (!val) return undefined;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? undefined : parsed;
};

const catalogContentTypeEnum = z.enum([
  "activity", "event", "hotel", "flight", "poi", "transfer", "safety"
]);

export const hybridCatalogSearchQuerySchema = z.object({
  destination: z.string().optional(),
  query: z.string().optional(),
  priceMin: z.string().optional().transform(safeParseFloat),
  priceMax: z.string().optional().transform(safeParseFloat),
  rating: z.string().optional().transform(safeParseFloat),
  sortBy: z.enum(["popular", "price_low", "price_high", "rating"]).optional(),
  limit: z.string().optional().transform(safeParseInt),
  offset: z.string().optional().transform(safeParseInt),
  providers: z.string().optional().transform(val => val ? val.split(",") : undefined),
  type: z.string().optional().transform(val =>
    val ? val.split(",").flatMap(t => {
      const parsed = catalogContentTypeEnum.safeParse(t.trim());
      return parsed.success ? [parsed.data] : [];
    }) : undefined
  ),
  experienceTypeSlug: z.string().optional(),
  tabSlug: z.string().optional(),
  enableSerpFallback: z.string().optional().transform(val => val === "true"),
  templateSlug: z.string().optional(),
  minNativeResults: z.string().optional().transform(safeParseInt)
});

// SERP Result DTO for consistent typing
export const serpResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  priceLevel: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  imageUrl: z.string().nullable(),
  source: z.literal("serp"),
  isPartner: z.literal(false)
});

export type SerpResult = z.infer<typeof serpResultSchema>;

// SERP Types
export type SerpCacheEntry = typeof serpCache.$inferSelect;
export type InsertSerpCacheEntry = z.infer<typeof insertSerpCacheSchema>;
export type SerpProviderTracking = typeof serpProviderTracking.$inferSelect;
export type InsertSerpProviderTracking = z.infer<typeof insertSerpProviderTrackingSchema>;
export type SerpInquiry = typeof serpInquiries.$inferSelect;
export type InsertSerpInquiry = z.infer<typeof insertSerpInquirySchema>;

// === AI Discovery System ===

export const discoveryCategories = [
  "local_food_secrets",
  "hidden_viewpoints",
  "off_tourist_path",
  "seasonal_events",
  "cultural_experiences",
  "secret_beaches",
  "street_art",
  "local_markets",
  "sunset_spots",
  "historic_gems",
  "nature_escapes",
  "nightlife_secrets"
] as const;

export type DiscoveryCategory = typeof discoveryCategories[number];

export const aiDiscoveredGems = pgTable("ai_discovered_gems", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  destination: varchar("destination", { length: 200 }).notNull(),
  country: varchar("country", { length: 100 }),
  category: varchar("category", { length: 100 }).notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  description: text("description").notNull(),
  whySpecial: text("why_special"),
  bestTimeToVisit: varchar("best_time_to_visit", { length: 200 }),
  insiderTip: text("insider_tip"),
  approximateLocation: varchar("approximate_location", { length: 300 }),
  coordinates: jsonb("coordinates").$type<{ lat: number; lng: number }>(),
  priceRange: varchar("price_range", { length: 50 }),
  difficultyLevel: varchar("difficulty_level", { length: 50 }),
  tags: jsonb("tags").$type<string[]>().default([]),
  imageUrl: text("image_url"),
  imageSearchTerms: jsonb("image_search_terms").$type<string[]>().default([]),
  relatedExperiences: jsonb("related_experiences").$type<string[]>().default([]),
  sourceModel: varchar("source_model", { length: 50 }).default("grok"),
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }),
  verifiedByUser: boolean("verified_by_user").default(false),
  verifiedByExpert: boolean("verified_by_expert").default(false),
  viewCount: integer("view_count").default(0),
  saveCount: integer("save_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastRefreshedAt: timestamp("last_refreshed_at"),
});

export const discoveryJobs = pgTable("discovery_jobs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  destination: varchar("destination", { length: 200 }).notNull(),
  categories: jsonb("categories").$type<DiscoveryCategory[]>().notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  gemsDiscovered: integer("gems_discovered").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userSavedGems = pgTable("user_saved_gems", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull(),
  gemId: varchar("gem_id").notNull().references(() => aiDiscoveredGems.id, { onDelete: "cascade" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertAiDiscoveredGemSchema = createInsertSchema(aiDiscoveredGems).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  viewCount: true,
  saveCount: true 
});

export const insertDiscoveryJobSchema = createInsertSchema(discoveryJobs).omit({
  id: true,
  createdAt: true,
  status: true,
  gemsDiscovered: true
});

export const insertUserSavedGemSchema = createInsertSchema(userSavedGems).omit({
  id: true,
  createdAt: true
});

// ==================== AFFILIATE WEB SCRAPING ====================

// Affiliate partner categories
export const affiliatePartnerCategories = [
  "tours_activities",
  "hotels_accommodation", 
  "transportation",
  "restaurants_dining",
  "events_tickets",
  "experiences",
  "travel_gear",
  "insurance",
  "other"
] as const;
export type AffiliatePartnerCategory = typeof affiliatePartnerCategories[number];

// Affiliate partners table - stores partner info and tracking codes
export const affiliatePartners = pgTable("affiliate_partners", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 200 }).notNull(),
  websiteUrl: varchar("website_url", { length: 500 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  affiliateTrackingId: varchar("affiliate_tracking_id", { length: 200 }),
  affiliateLinkTemplate: varchar("affiliate_link_template", { length: 1000 }),
  description: text("description"),
  logoUrl: varchar("logo_url", { length: 500 }),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }),
  scrapeConfig: jsonb("scrape_config").$type<{
    productListUrl?: string;
    productSelector?: string;
    paginationType?: "page" | "scroll" | "loadMore";
    maxPages?: number;
    scrapeInterval?: number;
  }>(),
  isActive: boolean("is_active").default(true),
  lastScrapedAt: timestamp("last_scraped_at"),
  // Source tracking: "manual" (admin-created / scraper) or "partnerize" (synced from Partnerize network).
  source: varchar("source", { length: 30 }).default("manual"),
  externalCampaignId: varchar("external_campaign_id", { length: 100 }), // uniquely indexed below
  lastSyncedAt: timestamp("last_synced_at"),
  // Partner-level admin approval (D1a): affiliate content is admin-gated ONCE at the partner level —
  // every product inherits its partner's approval. Born 'submitted' (never self-approved); an admin
  // approves/rejects via /api/admin/affiliate/partners/:id/approve|reject. Public reads gate on
  // 'approved' (migration 121); admin reads are ungated. Existing active partners grandfathered
  // 'approved' (no outage). draft/submitted/approved/rejected — DB CHECK in migration 121.
  approvalStatus: varchar("approval_status", { length: 20 }).default("submitted"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Migration 103. Declared per the deploy-push rule (full rationale in the `bookings` block):
  // created only in migration SQL, so every publish dropped it and the stamped migration never
  // recreated it. Partial WHERE mirrored verbatim — nullable for manually-added partners.
  externalCampaignIdIdx: uniqueIndex("affiliate_partners_external_campaign_id_idx")
    .on(table.externalCampaignId)
    .where(sql`external_campaign_id IS NOT NULL`),
}));

// Affiliate products table - stores scraped product data
export const affiliateProducts = pgTable("affiliate_products", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: varchar("partner_id").notNull().references(() => affiliatePartners.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 200 }),
  trackingNumber: varchar("tracking_number", { length: 25 }),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
  shortDescription: varchar("short_description", { length: 500 }),
  category: varchar("category", { length: 100 }),
  subCategory: varchar("sub_category", { length: 100 }),
  price: decimal("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("USD"),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
  discountPercent: integer("discount_percent"),
  imageUrl: varchar("image_url", { length: 1000 }),
  imageUrls: jsonb("image_urls").$type<string[]>().default([]),
  productUrl: varchar("product_url", { length: 1000 }).notNull(),
  affiliateUrl: varchar("affiliate_url", { length: 1500 }),
  location: varchar("location", { length: 300 }),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  coordinates: jsonb("coordinates").$type<{ lat: number; lng: number }>(),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count"),
  duration: varchar("duration", { length: 100 }),
  highlights: jsonb("highlights").$type<string[]>().default([]),
  includes: jsonb("includes").$type<string[]>().default([]),
  tags: jsonb("tags").$type<string[]>().default([]),
  availability: varchar("availability", { length: 200 }), // legacy free-text
  // Remediation P1 (migration 131) — normalized availability + CTA booking classifier.
  // All NULLABLE, no DB CHECK (values validated at zod/ORM layer → no publish-time drizzle-push trap).
  availabilityStatus: varchar("availability_status", { length: 20 }), // available|seasonal|limited|sold_out; null=unknown (§13)
  availableFrom: date("available_from"),
  availableTo: date("available_to"),
  // CTA classifier (P4): in_platform_bookable → add-to-cart · affiliate_bookable → agent rail ·
  // informational → tracked "View". NULL → resolver treats affiliate content as affiliate_bookable.
  bookingType: varchar("booking_type", { length: 24 }),
  bookingInfo: text("booking_info"),
  metadata: jsonb("metadata"),
  isActive: boolean("is_active").default(true),
  lastScrapedAt: timestamp("last_scraped_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Affiliate scrape jobs table - tracks scraping operations
export const affiliateScrapeJobs = pgTable("affiliate_scrape_jobs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: varchar("partner_id").notNull().references(() => affiliatePartners.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).default("pending"),
  productsFound: integer("products_found").default(0),
  productsUpdated: integer("products_updated").default(0),
  productsNew: integer("products_new").default(0),
  pagesScraped: integer("pages_scraped").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Affiliate click tracking table - for commission tracking
export const affiliateClicks = pgTable("affiliate_clicks", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: varchar("product_id").references(() => affiliateProducts.id, { onDelete: "set null" }),
  partnerId: varchar("partner_id").references(() => affiliatePartners.id, { onDelete: "set null" }),
  userId: varchar("user_id"),
  tripId: varchar("trip_id"),
  itineraryItemId: varchar("itinerary_item_id"),
  referrer: varchar("referrer", { length: 500 }),
  userAgent: varchar("user_agent", { length: 500 }),
  ipAddress: varchar("ip_address", { length: 50 }),
  initiatedBy: varchar("initiated_by", { length: 20 }).default("user"), // user | ai_agent | expert
  agentType: varchar("agent_type", { length: 20 }), // grok | claude | system | null
  sessionId: varchar("session_id", { length: 255 }), // AI planning session trace ID
  clickedAt: timestamp("clicked_at").defaultNow(),
});

// Insert schemas for affiliate tables
export const insertAffiliatePartnerSchema = createInsertSchema(affiliatePartners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastScrapedAt: true,
});

export const insertAffiliateProductSchema = createInsertSchema(affiliateProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastScrapedAt: true,
});

export const insertAffiliateScrapeJobSchema = createInsertSchema(affiliateScrapeJobs).omit({
  id: true,
  createdAt: true,
  status: true,
  productsFound: true,
  productsUpdated: true,
  productsNew: true,
  pagesScraped: true,
});

export const insertAffiliateClickSchema = createInsertSchema(affiliateClicks).omit({
  id: true,
  clickedAt: true,
});

// Types
export type AiDiscoveredGem = typeof aiDiscoveredGems.$inferSelect;
export type InsertAiDiscoveredGem = z.infer<typeof insertAiDiscoveredGemSchema>;
export type DiscoveryJob = typeof discoveryJobs.$inferSelect;
export type InsertDiscoveryJob = z.infer<typeof insertDiscoveryJobSchema>;
export type UserSavedGem = typeof userSavedGems.$inferSelect;
export type InsertUserSavedGem = z.infer<typeof insertUserSavedGemSchema>;

// Affiliate types
export type AffiliatePartner = typeof affiliatePartners.$inferSelect;
export type InsertAffiliatePartner = z.infer<typeof insertAffiliatePartnerSchema>;
export type AffiliateProduct = typeof affiliateProducts.$inferSelect;
export type InsertAffiliateProduct = z.infer<typeof insertAffiliateProductSchema>;
export type AffiliateScrapeJob = typeof affiliateScrapeJobs.$inferSelect;
export type InsertAffiliateScrapeJob = z.infer<typeof insertAffiliateScrapeJobSchema>;
export type AffiliateClick = typeof affiliateClicks.$inferSelect;
export type InsertAffiliateClick = z.infer<typeof insertAffiliateClickSchema>;

// === Expert Income Streams ===

// Expert templates - itineraries that experts sell
export const expertTemplates = pgTable("expert_templates", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  shortDescription: varchar("short_description", { length: 500 }),
  destination: varchar("destination", { length: 255 }).notNull(),
  duration: integer("duration").notNull(), // days
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  category: varchar("category", { length: 100 }), // adventure, luxury, budget, family, etc.
  coverImage: varchar("cover_image", { length: 1000 }),
  images: jsonb("images").$type<string[]>().default([]),
  itineraryData: jsonb("itinerary_data").$type<{
    days: Array<{
      day: number;
      title: string;
      activities: Array<{
        time?: string;
        title: string;
        description: string;
        location?: string;
        tips?: string;
      }>;
    }>;
    highlights?: string[];
    includes?: string[];
    excludes?: string[];
    packingList?: string[];
    budgetBreakdown?: Record<string, number>;
  }>(),
  tags: jsonb("tags").$type<string[]>().default([]),
  highlights: jsonb("highlights").$type<string[]>().default([]),
  isPublished: boolean("is_published").default(false),
  isFeatured: boolean("is_featured").default(false),
  salesCount: integer("sales_count").default(0),
  viewCount: integer("view_count").default(0),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").default(0),
  // Approval workflow (marketplace activation, migration 110) — mirrors provider_services.
  // Purchasable only when approval_status = 'approved' AND isPublished = true.
  approvalStatus: varchar("approval_status", { length: 20 }).default("draft"), // draft, submitted, approved, rejected
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Template purchases - tracks when users buy templates
export const templatePurchases = pgTable("template_purchases", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  templateId: varchar("template_id").notNull().references(() => expertTemplates.id, { onDelete: "cascade" }),
  buyerId: varchar("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(), // Traveloure's cut
  expertEarnings: decimal("expert_earnings", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending_payment"), // pending_payment, completed, refunded (migration 110 CHECK) — never born 'completed'
  purchasedAt: timestamp("purchased_at").defaultNow(),
  refundedAt: timestamp("refunded_at"),
});

// Template reviews - reviews for purchased templates
export const templateReviews = pgTable("template_reviews", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  templateId: varchar("template_id").notNull().references(() => expertTemplates.id, { onDelete: "cascade" }),
  purchaseId: varchar("purchase_id").notNull().references(() => templatePurchases.id, { onDelete: "cascade" }),
  reviewerId: varchar("reviewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1-5
  review: text("review"),
  helpfulCount: integer("helpful_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Expert earnings ledger - tracks all expert income
export const expertEarnings = pgTable("expert_earnings", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // template_sale, affiliate_commission, consulting, tip
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  referenceId: varchar("reference_id"), // template_purchase_id, affiliate_click_id, etc.
  referenceType: varchar("reference_type", { length: 50 }),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("held"), // escrow: held, releasable, paid_out, reversed (migration 112)
  disputeState: varchar("dispute_state", { length: 20 }).default("none"), // none, open (blocks release; admin-resolved) — escrow spine
  availableAt: timestamp("available_at"), // clearance deadline: held → releasable when now >= available_at (Phase 2 job)
  paidOutAt: timestamp("paid_out_at"),
  payoutId: varchar("payout_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Migration 203 (task 1091): completion-mint race guard — see provider_earnings twin.
  bookingMintUniq: uniqueIndex("expert_earnings_booking_mint_uniq")
    .on(table.referenceId)
    .where(sql`reference_type = 'service_booking' AND amount >= 0`),
}));

// Expert payouts - tracks payout requests
export const expertPayouts = pgTable("expert_payouts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  payoutMethod: varchar("payout_method", { length: 50 }), // bank_transfer, paypal, stripe
  status: varchar("status", { length: 50 }).default("pending"), // pending, processing, completed, failed
  processedAt: timestamp("processed_at"),
  failureReason: text("failure_reason"),
  transactionId: varchar("transaction_id", { length: 255 }),
  metadata: jsonb("metadata"),
  requestedAt: timestamp("requested_at").defaultNow(),
});

// Insert schemas for expert income tables
export const insertExpertTemplateSchema = createInsertSchema(expertTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  salesCount: true,
  viewCount: true,
  reviewCount: true,
});

export const insertTemplatePurchaseSchema = createInsertSchema(templatePurchases).omit({
  id: true,
  purchasedAt: true,
  refundedAt: true,
});

export const insertTemplateReviewSchema = createInsertSchema(templateReviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  helpfulCount: true,
});

export const insertExpertEarningsSchema = createInsertSchema(expertEarnings).omit({
  id: true,
  createdAt: true,
});

export const insertExpertPayoutSchema = createInsertSchema(expertPayouts).omit({
  id: true,
  requestedAt: true,
  processedAt: true,
});

// Types for expert income tables
export type ExpertTemplate = typeof expertTemplates.$inferSelect;
export type InsertExpertTemplate = z.infer<typeof insertExpertTemplateSchema>;
export type TemplatePurchase = typeof templatePurchases.$inferSelect;
export type InsertTemplatePurchase = z.infer<typeof insertTemplatePurchaseSchema>;
export type TemplateReview = typeof templateReviews.$inferSelect;
export type InsertTemplateReview = z.infer<typeof insertTemplateReviewSchema>;
export type ExpertEarning = typeof expertEarnings.$inferSelect;
export type InsertExpertEarning = z.infer<typeof insertExpertEarningsSchema>;
export type ExpertPayout = typeof expertPayouts.$inferSelect;
export type InsertExpertPayout = z.infer<typeof insertExpertPayoutSchema>;

// ============================================
// REVENUE SPLITS & INCOME STREAMS
// ============================================

// Revenue split configuration - defines how revenue is split between platform, providers, and experts
export const revenueSplitTypes = ["service_booking", "template_sale", "affiliate_commission", "tip", "referral_bonus"] as const;
export type RevenueSplitType = typeof revenueSplitTypes[number];

export const revenueSplits = pgTable("revenue_splits", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: varchar("type", { length: 50 }).notNull(), // service_booking, template_sale, affiliate_commission, tip, referral_bonus
  platformPercentage: decimal("platform_percentage", { precision: 5, scale: 2 }).notNull().default("15.00"), // Platform's cut
  expertPercentage: decimal("expert_percentage", { precision: 5, scale: 2 }).notNull().default("85.00"), // Expert's cut
  providerPercentage: decimal("provider_percentage", { precision: 5, scale: 2 }).default("0.00"), // Provider's cut (for affiliate bookings)
  description: text("description"),
  isActive: boolean("is_active").default(true),
  effectiveFrom: timestamp("effective_from").defaultNow(),
  effectiveUntil: timestamp("effective_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Expert tips - travelers can tip experts after service
export const expertTips = pgTable("expert_tips", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  travelerId: varchar("traveler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookingId: varchar("booking_id").references(() => serviceBookings.id, { onDelete: "set null" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  message: text("message"), // Optional thank you message
  isAnonymous: boolean("is_anonymous").default(false),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).default("0.00"),
  expertAmount: decimal("expert_amount", { precision: 10, scale: 2 }), // Amount after platform fee
  status: varchar("status", { length: 20 }).default("pending"), // pending, completed, refunded
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Expert referrals - track expert-to-expert referrals
export const expertReferrals = pgTable("expert_referrals", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  referrerId: varchar("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }), // Expert who referred
  referredId: varchar("referred_id").notNull().references(() => users.id, { onDelete: "cascade" }), // New expert who signed up
  referralCode: varchar("referral_code", { length: 50 }),
  status: varchar("status", { length: 20 }).default("pending"), // pending, qualified, paid
  bonusAmount: decimal("bonus_amount", { precision: 10, scale: 2 }).default("50.00"), // Referral bonus
  qualifiedAt: timestamp("qualified_at"), // When referral completed qualification (e.g., first booking)
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Affiliate earnings breakdown - detailed tracking for affiliate commissions
export const affiliateEarnings = pgTable("affiliate_earnings", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  clickId: varchar("click_id").references(() => affiliateClicks.id, { onDelete: "set null" }),
  partnerId: varchar("partner_id").references(() => affiliatePartners.id, { onDelete: "set null" }),
  expertId: varchar("expert_id").references(() => users.id, { onDelete: "cascade" }),
  bookingAmount: decimal("booking_amount", { precision: 10, scale: 2 }).notNull(), // Total booking value
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).notNull(), // Partner's commission %
  totalCommission: decimal("total_commission", { precision: 10, scale: 2 }).notNull(), // Total commission earned
  platformShare: decimal("platform_share", { precision: 10, scale: 2 }).notNull(), // Platform's cut
  expertShare: decimal("expert_share", { precision: 10, scale: 2 }).notNull(), // Expert's cut
  providerShare: decimal("provider_share", { precision: 10, scale: 2 }).default("0.00"), // Provider's cut if applicable
  currency: varchar("currency", { length: 10 }).default("USD"),
  status: varchar("status", { length: 20 }).default("pending"), // pending, confirmed, paid
  partnerReferenceId: varchar("partner_reference_id", { length: 255 }), // Partner's own booking/transaction ID
  reconciliationStatus: varchar("reconciliation_status", { length: 20 }).default("unmatched"), // unmatched | matched | disputed | written_off
  reconciledAt: timestamp("reconciled_at"),
  reconciliationNotes: text("reconciliation_notes"),
  externalReportData: jsonb("external_report_data"), // Raw line from partner report
  contentTrackingNumber: varchar("content_tracking_number", { length: 25 }), // Links to content_registry
  confirmedAt: timestamp("confirmed_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas for income stream tables
export const insertRevenueSplitSchema = createInsertSchema(revenueSplits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExpertTipSchema = createInsertSchema(expertTips).omit({
  id: true,
  platformFee: true,
  expertAmount: true,
  status: true,
  createdAt: true,
});

export const insertExpertReferralSchema = createInsertSchema(expertReferrals).omit({
  id: true,
  status: true,
  qualifiedAt: true,
  paidAt: true,
  createdAt: true,
});

export const insertAffiliateEarningSchema = createInsertSchema(affiliateEarnings).omit({
  id: true,
  status: true,
  confirmedAt: true,
  paidAt: true,
  createdAt: true,
});

// Types for income stream tables
export type RevenueSplit = typeof revenueSplits.$inferSelect;
export type InsertRevenueSplit = z.infer<typeof insertRevenueSplitSchema>;
export type ExpertTip = typeof expertTips.$inferSelect;
export type InsertExpertTip = z.infer<typeof insertExpertTipSchema>;
export type ExpertReferral = typeof expertReferrals.$inferSelect;
export type InsertExpertReferral = z.infer<typeof insertExpertReferralSchema>;
export type AffiliateEarning = typeof affiliateEarnings.$inferSelect;
export type InsertAffiliateEarning = z.infer<typeof insertAffiliateEarningSchema>;

// === Provider Earnings & Payouts ===

// Provider earnings ledger - tracks all provider income
export const providerEarnings = pgTable("provider_earnings", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // service_booking, refund, adjustment
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  sourceType: varchar("source_type", { length: 50 }), // booking, refund
  sourceId: varchar("source_id"), // Reference to booking or other source
  trackingNumber: varchar("tracking_number", { length: 20 }), // Link to content registry
  description: text("description"),
  status: varchar("status", { length: 20 }).default("held"), // escrow: held, releasable, paid_out, reversed (migration 112)
  disputeState: varchar("dispute_state", { length: 20 }).default("none"), // none, open (blocks release; admin-resolved) — escrow spine
  availableAt: timestamp("available_at"), // clearance deadline: held → releasable when now >= available_at (Phase 2 job)
  paidAt: timestamp("paid_at"),
  payoutId: varchar("payout_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Migration 203 (task 1091): the completion mint's race guard — one booking-mint row per
  // booking; the mint INSERTs with ON CONFLICT DO NOTHING against this index. Declared here
  // AND in migration SQL (publish-trap rule).
  // amount >= 0: only the one original positive completion-mint row is unique; negative
  // compensation/clawback rows sharing the same source identity stay insertable.
  bookingMintUniq: uniqueIndex("provider_earnings_booking_mint_uniq")
    .on(table.sourceId)
    .where(sql`source_type = 'booking' AND amount >= 0`),
}));

// Provider payouts - tracks payout requests
export const providerPayouts = pgTable("provider_payouts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  payoutMethod: varchar("payout_method", { length: 50 }), // bank_transfer, paypal, stripe
  status: varchar("status", { length: 20 }).default("pending"), // pending, processing, completed, failed
  payoutReference: varchar("payout_reference", { length: 100 }), // External reference
  notes: text("notes"),
  requestedAt: timestamp("requested_at").defaultNow(),
  processedAt: timestamp("processed_at"),
  completedAt: timestamp("completed_at"),
});

export const insertProviderEarningSchema = createInsertSchema(providerEarnings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProviderPayoutSchema = createInsertSchema(providerPayouts).omit({
  id: true,
  requestedAt: true,
});

export type ProviderEarning = typeof providerEarnings.$inferSelect;
export type InsertProviderEarning = z.infer<typeof insertProviderEarningSchema>;
export type ProviderPayout = typeof providerPayouts.$inferSelect;
export type InsertProviderPayout = z.infer<typeof insertProviderPayoutSchema>;

// === Platform Settings (key-value config store) ===
// NOTE: This table exists in production with 13 rows of live configuration
// (commission rate ranges, feature flags, support_email, timezone, etc.).
// platformSettings (key/value shape) — removed. The live table uses setting_key/setting_value
// columns (see platformSettingsTable below). commission.ts reads via raw SQL; no ORM access.

// === Platform Revenue Tracking ===

// Revenue source types for platform earnings
export const revenueSourceTypes = ["booking_commission", "template_commission", "affiliate_commission", "tip_commission", "subscription", "advertising", "premium_listing", "other"] as const;
export type RevenueSourceType = typeof revenueSourceTypes[number];

// Platform revenue - consolidated platform earnings linked to content tracking
export const platformRevenue = pgTable("platform_revenue", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sourceType: varchar("source_type", { length: 50 }).notNull(), // booking_commission, template_commission, etc.
  sourceId: varchar("source_id"), // Reference to booking, template purchase, etc.
  trackingNumber: varchar("tracking_number", { length: 20 }), // Link to content registry
  
  // Revenue amounts
  grossAmount: decimal("gross_amount", { precision: 10, scale: 2 }).notNull(), // Total transaction value
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(), // Platform's cut
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(), // Amount after processing fees
  processingFees: decimal("processing_fees", { precision: 10, scale: 2 }).default("0"), // Payment processor fees
  
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Stakeholder breakdown
  expertId: varchar("expert_id").references(() => users.id, { onDelete: "set null" }),
  expertEarnings: decimal("expert_earnings", { precision: 10, scale: 2 }).default("0"),
  providerId: varchar("provider_id").references(() => users.id, { onDelete: "set null" }),
  providerEarnings: decimal("provider_earnings", { precision: 10, scale: 2 }).default("0"),
  
  // Metadata
  description: text("description"),
  metadata: jsonb("metadata").default({}),
  
  // Status and timing
  status: varchar("status", { length: 20 }).default("recorded"), // recorded, reconciled, disputed
  transactionDate: timestamp("transaction_date").defaultNow(),
  reconciliationDate: timestamp("reconciliation_date"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Migration 203 (task 1091): completion-mint race guard — see provider_earnings twin.
  // gross_amount >= 0: only the original completion-mint row is unique; negative reversal
  // compensation rows (reversePlatformRevenueForBooking) share the same identity and stay free.
  bookingMintUniq: uniqueIndex("platform_revenue_booking_mint_uniq")
    .on(table.sourceId)
    .where(sql`source_type = 'booking_commission' AND gross_amount >= 0`),
}));

// Daily revenue summary for dashboard analytics
export const dailyRevenueSummary = pgTable("daily_revenue_summary", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: date("date").notNull().unique(),
  
  // Platform totals
  totalGross: decimal("total_gross", { precision: 12, scale: 2 }).default("0"),
  totalPlatformFee: decimal("total_platform_fee", { precision: 12, scale: 2 }).default("0"),
  totalProcessingFees: decimal("total_processing_fees", { precision: 12, scale: 2 }).default("0"),
  totalNet: decimal("total_net", { precision: 12, scale: 2 }).default("0"),
  
  // Breakdown by source
  bookingRevenue: decimal("booking_revenue", { precision: 12, scale: 2 }).default("0"),
  templateRevenue: decimal("template_revenue", { precision: 12, scale: 2 }).default("0"),
  affiliateRevenue: decimal("affiliate_revenue", { precision: 12, scale: 2 }).default("0"),
  tipRevenue: decimal("tip_revenue", { precision: 12, scale: 2 }).default("0"),
  otherRevenue: decimal("other_revenue", { precision: 12, scale: 2 }).default("0"),
  
  // Stakeholder payouts
  totalExpertEarnings: decimal("total_expert_earnings", { precision: 12, scale: 2 }).default("0"),
  totalProviderEarnings: decimal("total_provider_earnings", { precision: 12, scale: 2 }).default("0"),
  
  // Transaction counts
  transactionCount: integer("transaction_count").default(0),
  bookingCount: integer("booking_count").default(0),
  templateSalesCount: integer("template_sales_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlatformRevenueSchema = createInsertSchema(platformRevenue).omit({
  id: true,
  createdAt: true,
});

export const insertDailyRevenueSummarySchema = createInsertSchema(dailyRevenueSummary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PlatformRevenue = typeof platformRevenue.$inferSelect;
export type InsertPlatformRevenue = z.infer<typeof insertPlatformRevenueSchema>;
export type DailyRevenueSummary = typeof dailyRevenueSummary.$inferSelect;
export type InsertDailyRevenueSummary = z.infer<typeof insertDailyRevenueSummarySchema>;

// === Security & Audit Logging ===

export const accessAuditLogs = pgTable("access_audit_logs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  actorId: varchar("actor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actorRole: varchar("actor_role", { length: 30 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(), // view_profile, view_booking, access_chat, etc.
  resourceType: varchar("resource_type", { length: 50 }).notNull(), // user, booking, chat, etc.
  resourceId: varchar("resource_id"), // ID of the accessed resource
  targetUserId: varchar("target_user_id").references(() => users.id, { onDelete: "set null" }), // Whose data was accessed
  metadata: jsonb("metadata").default({}), // Additional context
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAccessAuditLogSchema = createInsertSchema(accessAuditLogs).omit({
  id: true,
  createdAt: true,
});

export type AccessAuditLog = typeof accessAuditLogs.$inferSelect;
export type InsertAccessAuditLog = z.infer<typeof insertAccessAuditLogSchema>;

// === Content Tracking System ===

// Content types enum for the registry
export const contentTypeEnum = pgEnum("content_type", [
  "trip",
  "itinerary",
  "service",
  "review",
  "chat_message",
  "expert_profile",
  "provider_profile",
  "template",
  "booking",
  "vendor",
  "experience",
  "custom_venue",
  "contract",
  "media",
  "tip",
  "affiliate_product",
  "dmo_content",
  "other"
]);

// Content status enum
export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "pending_review",
  "published",
  "flagged",
  "under_review",
  "suspended",
  "archived",
  "deleted"
]);

// Content Registry - Central tracking of all platform content
export const contentRegistry = pgTable("content_registry", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number", { length: 20 }).notNull().unique(), // TRV-YYYYMM-XXXXX format
  contentType: contentTypeEnum("content_type").notNull(),
  contentId: varchar("content_id").notNull(), // ID in the source table
  ownerId: varchar("owner_id").references(() => users.id, { onDelete: "set null" }),
  status: contentStatusEnum("status").default("published"),
  title: text("title"), // Summary/title for quick reference
  description: text("description"), // Brief description
  metadata: jsonb("metadata").default({}), // Flexible metadata storage
  viewCount: integer("view_count").default(0),
  engagementScore: integer("engagement_score").default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  publishedAt: timestamp("published_at"),
  flaggedAt: timestamp("flagged_at"),
  flagReason: text("flag_reason"),
  flaggedBy: varchar("flagged_by").references(() => users.id, { onDelete: "set null" }),
  moderatorId: varchar("moderator_id").references(() => users.id, { onDelete: "set null" }),
  moderatorNotes: text("moderator_notes"),
  moderatedAt: timestamp("moderated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Content Invoices - Links content to billing/invoices
export const contentInvoices = pgTable("content_invoices", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  invoiceNumber: varchar("invoice_number", { length: 20 }).notNull().unique(), // INV-YYYYMM-XXXXX format
  trackingNumber: varchar("tracking_number").notNull().references(() => contentRegistry.trackingNumber, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => users.id, { onDelete: "set null" }),
  providerId: varchar("provider_id").references(() => users.id, { onDelete: "set null" }),
  invoiceType: varchar("invoice_type", { length: 30 }).notNull(), // booking, service, template_purchase, subscription, etc.
  amount: integer("amount").notNull(), // Amount in cents
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: varchar("status", { length: 20 }).default("pending"), // pending, paid, cancelled, refunded
  taxAmount: integer("tax_amount").default(0),
  discountAmount: integer("discount_amount").default(0),
  totalAmount: integer("total_amount").notNull(),
  paymentMethod: varchar("payment_method", { length: 30 }),
  paymentReference: varchar("payment_reference"),
  notes: text("notes"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Content Version History - Track changes to content
export const contentVersions = pgTable("content_versions", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number").notNull().references(() => contentRegistry.trackingNumber, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  changeType: varchar("change_type", { length: 20 }).notNull(), // created, updated, status_change, moderation
  changedBy: varchar("changed_by").references(() => users.id, { onDelete: "set null" }),
  previousData: jsonb("previous_data"), // Snapshot of previous state
  newData: jsonb("new_data"), // Snapshot of new state
  changeReason: text("change_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Content Flags - Reports/flags on content
export const contentFlags = pgTable("content_flags", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number").notNull().references(() => contentRegistry.trackingNumber, { onDelete: "cascade" }),
  reporterId: varchar("reporter_id").references(() => users.id, { onDelete: "set null" }),
  flagType: varchar("flag_type", { length: 30 }).notNull(), // inappropriate, spam, misleading, copyright, safety, other
  severity: varchar("severity", { length: 10 }).default("medium"), // low, medium, high, critical
  description: text("description"),
  evidence: jsonb("evidence").default([]), // Screenshots, links, etc.
  status: varchar("status", { length: 20 }).default("pending"), // pending, investigating, resolved, dismissed
  resolution: text("resolution"),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Content Analytics - Aggregate performance metrics
export const contentAnalytics = pgTable("content_analytics", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number").notNull().references(() => contentRegistry.trackingNumber, { onDelete: "cascade" }),
  date: timestamp("date").notNull(), // Date for daily aggregation
  views: integer("views").default(0),
  uniqueViews: integer("unique_views").default(0),
  clicks: integer("clicks").default(0),
  shares: integer("shares").default(0),
  bookmarks: integer("bookmarks").default(0),
  conversions: integer("conversions").default(0), // E.g., bookings made
  revenue: integer("revenue").default(0), // Revenue generated in cents
  avgTimeSpent: integer("avg_time_spent").default(0), // Seconds
  bounceRate: integer("bounce_rate").default(0), // Percentage * 100
  createdAt: timestamp("created_at").defaultNow(),
});

// Content Impressions - one row per card scrolled into view on the feed
// (analytics-only, fire-and-forget writes; written by POST /api/tracking/impression).
// Table created by migration 082, completed by migration 116 (session_id NOT NULL +
// unique dedup index on (session_id, content_type, content_id)).
export const contentImpressions = pgTable("content_impressions", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  contentType: varchar("content_type", { length: 50 }).notNull(), // gem | expert | provider_service | affiliate_product | event | ...
  contentId: varchar("content_id", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }),
  cardPosition: integer("card_position"), // slot position in the feed/grid (1-indexed)
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }), // opportunistic — feed is public
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// AI Usage Logs - Track API calls and costs for all AI providers
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  provider: varchar("provider", { length: 20 }).notNull(), // grok, anthropic, openai
  model: varchar("model", { length: 50 }).notNull(), // grok-2, claude-3-sonnet, etc.
  operation: varchar("operation", { length: 50 }).notNull(), // city_intelligence, expert_match, chat, etc.
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  estimatedCostCents: integer("estimated_cost_cents").notNull().default(0), // Cost in cents for precision
  inputCostPerMillion: integer("input_cost_per_million").default(0), // Rate used in cents
  outputCostPerMillion: integer("output_cost_per_million").default(0), // Rate used in cents
  responseTimeMs: integer("response_time_ms").default(0),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default({}), // Additional context (city, request type, etc.)
  createdAt: timestamp("created_at").defaultNow(),
});

// External API Usage Logs - Track API calls and costs for non-AI providers (Amadeus, etc.)
export const apiUsageLogs = pgTable("api_usage_logs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  provider: varchar("provider", { length: 30 }).notNull(), // amadeus, viator, fever, serp, etc.
  endpoint: varchar("endpoint", { length: 100 }).notNull(), // flight_search, hotel_search, poi, etc.
  operation: varchar("operation", { length: 50 }).notNull(), // search, get, list, etc.
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  requestCount: integer("request_count").notNull().default(1), // Number of API calls (usually 1)
  estimatedCostCents: integer("estimated_cost_cents").notNull().default(0), // Cost in cents
  costPerCallCents: integer("cost_per_call_cents").default(0), // Rate used in cents (e.g., 0.3 cents = $0.003)
  responseTimeMs: integer("response_time_ms").default(0),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  resultCount: integer("result_count").default(0), // Number of results returned
  metadata: jsonb("metadata").default({}), // Additional context (city, search params, etc.)
  createdAt: timestamp("created_at").defaultNow(),
});

// Tracking number sequences for generating unique IDs
export const trackingSequences = pgTable("tracking_sequences", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  prefix: varchar("prefix", { length: 10 }).notNull(), // TRV, INV, etc.
  yearMonth: varchar("year_month", { length: 6 }).notNull(), // YYYYMM
  lastNumber: integer("last_number").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  prefixYearMonthUnique: unique().on(table.prefix, table.yearMonth),
}));

// Schema exports
export const insertContentRegistrySchema = createInsertSchema(contentRegistry).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContentInvoiceSchema = createInsertSchema(contentInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContentVersionSchema = createInsertSchema(contentVersions).omit({
  id: true,
  createdAt: true,
});

export const insertContentFlagSchema = createInsertSchema(contentFlags).omit({
  id: true,
  createdAt: true,
});

export const insertContentAnalyticsSchema = createInsertSchema(contentAnalytics).omit({
  id: true,
  createdAt: true,
});

export const insertContentImpressionSchema = createInsertSchema(contentImpressions).omit({
  id: true,
  createdAt: true,
});

// AI Usage schema exports
export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({
  id: true,
  createdAt: true,
});

// Type exports
export type ContentRegistry = typeof contentRegistry.$inferSelect;
export type InsertContentRegistry = z.infer<typeof insertContentRegistrySchema>;
export type ContentInvoice = typeof contentInvoices.$inferSelect;
export type InsertContentInvoice = z.infer<typeof insertContentInvoiceSchema>;
export type ContentVersion = typeof contentVersions.$inferSelect;
export type InsertContentVersion = z.infer<typeof insertContentVersionSchema>;
export type ContentFlag = typeof contentFlags.$inferSelect;
export type InsertContentFlag = z.infer<typeof insertContentFlagSchema>;
export type ContentAnalytics = typeof contentAnalytics.$inferSelect;
export type InsertContentAnalytics = z.infer<typeof insertContentAnalyticsSchema>;
export type ContentImpression = typeof contentImpressions.$inferSelect;
export type InsertContentImpression = z.infer<typeof insertContentImpressionSchema>;
export type TrackingSequence = typeof trackingSequences.$inferSelect;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;

// === Service Recommendation Engine ===
// Powered by TravelPulse trend analysis for users, experts, and providers

export const recommendationTypeEnum = ["user", "expert", "provider"] as const;
export const recommendationStatusEnum = ["active", "dismissed", "converted", "expired"] as const;
export const demandLevelEnum = ["low", "moderate", "high", "very_high", "trending"] as const;

// Service demand signals derived from TravelPulse trends
export const serviceDemandSignals = pgTable("service_demand_signals", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }),
  serviceType: varchar("service_type", { length: 100 }).notNull(), // e.g., "food_tour", "airport_transfer", "photography"
  categorySlug: varchar("category_slug", { length: 100 }), // Links to expert/provider categories
  demandLevel: varchar("demand_level", { length: 20 }).notNull().$type<typeof demandLevelEnum[number]>(),
  demandScore: integer("demand_score").notNull().default(0), // 0-1000
  trendDirection: varchar("trend_direction", { length: 10 }).$type<"up" | "down" | "stable">().default("stable"),
  trendVelocity: integer("trend_velocity").default(0), // Rate of change
  searchVolume: integer("search_volume").default(0), // Estimated searches
  supplyGap: integer("supply_gap").default(0), // Demand - Supply score
  averagePrice: decimal("average_price", { precision: 10, scale: 2 }),
  priceTrend: varchar("price_trend", { length: 10 }).$type<"rising" | "falling" | "stable">(),
  seasonalPeak: jsonb("seasonal_peak").default([]), // Months with peak demand
  triggerEvents: jsonb("trigger_events").default([]), // Events driving demand
  relatedTrends: jsonb("related_trends").default([]), // Related TravelPulse trends
  dataSource: varchar("data_source", { length: 50 }).default("travelpulse"), // travelpulse, user_behavior, booking_data
  confidenceScore: integer("confidence_score").default(80), // 0-100
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Recommendations generated for users, experts, and providers
export const serviceRecommendations = pgTable("service_recommendations", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  targetType: varchar("target_type", { length: 20 }).notNull().$type<typeof recommendationTypeEnum[number]>(),
  targetId: varchar("target_id"), // userId, expertId, or providerId (null for general recommendations)
  demandSignalId: varchar("demand_signal_id").references(() => serviceDemandSignals.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  serviceType: varchar("service_type", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  opportunityScore: integer("opportunity_score").notNull().default(0), // 0-100
  potentialRevenue: decimal("potential_revenue", { precision: 10, scale: 2 }), // Estimated revenue
  competitionLevel: varchar("competition_level", { length: 20 }).$type<"low" | "medium" | "high">(),
  actionItems: jsonb("action_items").default([]), // Steps to capitalize
  supportingData: jsonb("supporting_data").default({}), // TravelPulse data supporting the recommendation
  status: varchar("status", { length: 20 }).notNull().default("active").$type<typeof recommendationStatusEnum[number]>(),
  dismissedAt: timestamp("dismissed_at"),
  convertedAt: timestamp("converted_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Track which recommendations were acted upon (for ML improvement)
export const recommendationConversions = pgTable("recommendation_conversions", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  recommendationId: varchar("recommendation_id").notNull().references(() => serviceRecommendations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  conversionType: varchar("conversion_type", { length: 50 }).notNull(), // service_created, booking_made, template_used
  resultId: varchar("result_id"), // ID of the created service/booking
  revenueGenerated: decimal("revenue_generated", { precision: 10, scale: 2 }),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

// Service gap analysis - what's missing in a market
export const serviceGapAnalysis = pgTable("service_gap_analysis", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }),
  serviceType: varchar("service_type", { length: 100 }).notNull(),
  currentSupplyCount: integer("current_supply_count").default(0), // Number of providers offering this
  estimatedDemand: integer("estimated_demand").default(0), // Based on TravelPulse
  gapScore: integer("gap_score").notNull().default(0), // 0-100, higher = bigger gap
  priceRangeGap: jsonb("price_range_gap").default({}), // { budget: 0, midrange: 50, luxury: 80 }
  qualityGap: integer("quality_gap").default(0), // Average rating vs benchmark
  availabilityGap: integer("availability_gap").default(0), // Booking availability issues
  languageGaps: jsonb("language_gaps").default([]), // Languages not well served
  specializationGaps: jsonb("specialization_gaps").default([]), // Niches not covered
  competitorAnalysis: jsonb("competitor_analysis").default({}),
  opportunityDescription: text("opportunity_description"),
  recommendedActions: jsonb("recommended_actions").default([]),
  lastAnalyzedAt: timestamp("last_analyzed_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Seasonal opportunity calendar for proactive recommendations
export const seasonalOpportunities = pgTable("seasonal_opportunities", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }),
  month: integer("month").notNull(), // 1-12
  serviceType: varchar("service_type", { length: 100 }).notNull(),
  opportunityType: varchar("opportunity_type", { length: 50 }).notNull(), // peak_demand, event_driven, weather_optimal
  eventName: varchar("event_name", { length: 255 }), // If event-driven
  demandMultiplier: decimal("demand_multiplier", { precision: 4, scale: 2 }).default("1.0"), // 1.5x, 2x demand
  pricingOpportunity: varchar("pricing_opportunity", { length: 20 }).$type<"premium" | "normal" | "discount">(),
  leadTimeWeeks: integer("lead_time_weeks").default(4), // How early to prepare
  preparationTips: jsonb("preparation_tips").default([]),
  historicalPerformance: jsonb("historical_performance").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Indexes for efficient queries
// CREATE INDEX idx_demand_signals_city ON service_demand_signals(city);
// CREATE INDEX idx_demand_signals_type ON service_demand_signals(service_type);
// CREATE INDEX idx_recommendations_target ON service_recommendations(target_type, target_id);
// CREATE INDEX idx_gap_analysis_city ON service_gap_analysis(city);

// Service Recommendation Engine schemas and types
export const insertServiceDemandSignalSchema = createInsertSchema(serviceDemandSignals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServiceRecommendationSchema = createInsertSchema(serviceRecommendations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRecommendationConversionSchema = createInsertSchema(recommendationConversions).omit({
  id: true,
  createdAt: true,
});

export const insertServiceGapAnalysisSchema = createInsertSchema(serviceGapAnalysis).omit({
  id: true,
  createdAt: true,
  lastAnalyzedAt: true,
});

export const insertSeasonalOpportunitySchema = createInsertSchema(seasonalOpportunities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ServiceDemandSignal = typeof serviceDemandSignals.$inferSelect;
export type InsertServiceDemandSignal = z.infer<typeof insertServiceDemandSignalSchema>;
export type ServiceRecommendation = typeof serviceRecommendations.$inferSelect;
export type InsertServiceRecommendation = z.infer<typeof insertServiceRecommendationSchema>;
export type RecommendationConversion = typeof recommendationConversions.$inferSelect;
export type InsertRecommendationConversion = z.infer<typeof insertRecommendationConversionSchema>;
export type ServiceGapAnalysis = typeof serviceGapAnalysis.$inferSelect;
export type InsertServiceGapAnalysis = z.infer<typeof insertServiceGapAnalysisSchema>;
export type SeasonalOpportunity = typeof seasonalOpportunities.$inferSelect;
export type InsertSeasonalOpportunity = z.infer<typeof insertSeasonalOpportunitySchema>;

// Logistics schemas
export const insertTemporalAnchorSchema = createInsertSchema(temporalAnchors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDayBoundarySchema = createInsertSchema(dayBoundaries).omit({ id: true, createdAt: true });
export const insertEnergyTrackingSchema = createInsertSchema(energyTracking).omit({ id: true, createdAt: true });

export type TemporalAnchor = typeof temporalAnchors.$inferSelect;
export type InsertTemporalAnchor = z.infer<typeof insertTemporalAnchorSchema>;
export type DayBoundary = typeof dayBoundaries.$inferSelect;
export type InsertDayBoundary = z.infer<typeof insertDayBoundarySchema>;
export type EnergyTracking = typeof energyTracking.$inferSelect;
export type InsertEnergyTracking = z.infer<typeof insertEnergyTrackingSchema>;

// === Expert/Provider Logistics Integration ===

export const providerAvailabilitySchedule = pgTable("provider_availability_schedule", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: varchar("start_time", { length: 10 }).notNull(),
  endTime: varchar("end_time", { length: 10 }).notNull(),
  isAvailable: boolean("is_available").default(true),
  preferredSlots: jsonb("preferred_slots").default([]).$type<{
    label: string;
    startTime: string;
    endTime: string;
    isPreferred: boolean;
    reason: string;
  }[]>(),
  pricingModifier: integer("pricing_modifier").default(0),
  pricingReason: varchar("pricing_reason", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const providerBlackoutDates = pgTable("provider_blackout_dates", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: varchar("reason", { length: 500 }),
  isRecurring: boolean("is_recurring").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const providerBookingRequests = pgTable("provider_booking_requests", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expertId: varchar("expert_id").references(() => users.id, { onDelete: "set null" }),
  serviceType: varchar("service_type", { length: 100 }).notNull(),
  serviceDescription: text("service_description"),
  requestedDate: date("requested_date").notNull(),
  requestedStartTime: varchar("requested_start_time", { length: 10 }).notNull(),
  requestedEndTime: varchar("requested_end_time", { length: 10 }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }),
  clientContext: jsonb("client_context").default({}).$type<{
    tripDay: number;
    energyLevel: string;
    priorActivity: string | null;
    nextActivity: string | null;
    clientAvailableFrom: string;
    clientAvailableUntil: string;
    dietaryRestrictions: string[];
    mobilityLevel: string;
    specialNotes: string;
  }>(),
  anchorConstraints: jsonb("anchor_constraints").default([]).$type<{
    anchorType: string;
    time: string;
    constraint: string;
  }[]>(),
  expertNotes: text("expert_notes"),
  status: varchar("status", { length: 30 }).default("pending"),
  counterOffer: jsonb("counter_offer").default(null).$type<{
    newStartTime: string;
    newEndTime: string;
    newPrice: number;
    reason: string;
  } | null>(),
  providerResponse: text("provider_response"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const expertVendorCoordination = pgTable("expert_vendor_coordination", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vendorName: varchar("vendor_name", { length: 255 }).notNull(),
  vendorCategory: varchar("vendor_category", { length: 100 }).notNull(),
  vendorEmail: varchar("vendor_email", { length: 255 }),
  vendorPhone: varchar("vendor_phone", { length: 50 }),
  providerId: varchar("provider_id").references(() => users.id, { onDelete: "set null" }),
  setupTime: varchar("setup_time", { length: 10 }),
  arrivalTime: varchar("arrival_time", { length: 10 }),
  startTime: varchar("start_time", { length: 10 }),
  endTime: varchar("end_time", { length: 10 }),
  serviceDate: date("service_date"),
  status: varchar("status", { length: 30 }).default("pending"),
  contractStatus: varchar("contract_status", { length: 30 }).default("none"),
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  primaryAnchorId: varchar("primary_anchor_id"),
  anchorConstraintNote: text("anchor_constraint_note"),
  notes: text("notes"),
  lastContactedAt: timestamp("last_contacted_at"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProviderAvailabilityScheduleSchema = createInsertSchema(providerAvailabilitySchedule).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProviderBlackoutDateSchema = createInsertSchema(providerBlackoutDates).omit({ id: true, createdAt: true });
export const insertProviderBookingRequestSchema = createInsertSchema(providerBookingRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExpertVendorCoordinationSchema = createInsertSchema(expertVendorCoordination).omit({ id: true, createdAt: true, updatedAt: true });

export type ProviderAvailabilitySchedule = typeof providerAvailabilitySchedule.$inferSelect;
export type InsertProviderAvailabilitySchedule = z.infer<typeof insertProviderAvailabilityScheduleSchema>;
export type ProviderBlackoutDate = typeof providerBlackoutDates.$inferSelect;
export type InsertProviderBlackoutDate = z.infer<typeof insertProviderBlackoutDateSchema>;
export type ProviderBookingRequest = typeof providerBookingRequests.$inferSelect;
export type InsertProviderBookingRequest = z.infer<typeof insertProviderBookingRequestSchema>;
export type ExpertVendorCoordination = typeof expertVendorCoordination.$inferSelect;
export type InsertExpertVendorCoordination = z.infer<typeof insertExpertVendorCoordinationSchema>;

// === GROK ANALYTICS & TREND STORAGE TABLES ===

export const expertMatchAnalytics = pgTable("expert_match_analytics", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  travelerId: varchar("traveler_id").references(() => users.id, { onDelete: "set null" }),
  matchScore: integer("match_score").notNull(),
  breakdown: jsonb("breakdown").default({}),
  reasoning: text("reasoning"),
  travelerDestination: varchar("traveler_destination", { length: 255 }),
  travelerBudget: decimal("traveler_budget", { precision: 10, scale: 2 }),
  travelerInterests: jsonb("traveler_interests").default([]),
  travelerGroupSize: integer("traveler_group_size"),
  expertSelected: boolean("expert_selected").default(false),
  bookingCompleted: boolean("booking_completed").default(false),
  feedback: jsonb("feedback").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const destinationSearchPatterns = pgTable("destination_search_patterns", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  destination: varchar("destination", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  searchQuery: varchar("search_query", { length: 500 }),
  searchType: varchar("search_type", { length: 50 }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  resultsViewed: integer("results_viewed").default(0),
  itemsClicked: integer("items_clicked").default(0),
  itemSelected: boolean("item_selected").default(false),
  bookingValue: decimal("booking_value", { precision: 10, scale: 2 }),
  dwellTimeSeconds: integer("dwell_time_seconds").default(0),
  date: date("date").notNull(),
  hour: integer("hour"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const destinationMetricsHistory = pgTable("destination_metrics_history", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  destination: varchar("destination", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  metricType: varchar("metric_type", { length: 50 }).notNull(),
  metricValue: decimal("metric_value", { precision: 10, scale: 2 }).notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const insertExpertMatchAnalyticsSchema = createInsertSchema(expertMatchAnalytics).omit({ id: true, createdAt: true });
export const insertDestinationSearchPatternSchema = createInsertSchema(destinationSearchPatterns).omit({ id: true, createdAt: true });
export const insertDestinationMetricsHistorySchema = createInsertSchema(destinationMetricsHistory).omit({ id: true });

export type ExpertMatchAnalytics = typeof expertMatchAnalytics.$inferSelect;
export type InsertExpertMatchAnalytics = z.infer<typeof insertExpertMatchAnalyticsSchema>;
export type DestinationSearchPattern = typeof destinationSearchPatterns.$inferSelect;
export type InsertDestinationSearchPattern = z.infer<typeof insertDestinationSearchPatternSchema>;
export type DestinationMetricsHistory = typeof destinationMetricsHistory.$inferSelect;
export type InsertDestinationMetricsHistory = z.infer<typeof insertDestinationMetricsHistorySchema>;

// === Shareable Itinerary Card System ===

export const transportLegs = pgTable("transport_legs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // SCOPE (migration 154, §18 L4): a leg is EITHER variant-scoped (the legacy AI-optimizer home)
  // OR trip-scoped (expert-built Workstation trips). Both columns are nullable and the
  // exactly-one-of rule is enforced in the app layer (server/services/trip-transport-legs.service.ts)
  // — deliberately NOT a cross-column DB CHECK, which is the shape that fails Replit's
  // publish-time drizzle-push.
  variantId: varchar("variant_id").references(() => itineraryVariants.id, { onDelete: "cascade" }),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  legOrder: integer("leg_order").notNull(),
  fromActivityId: varchar("from_activity_id"),
  fromName: text("from_name").notNull(),
  fromLat: doublePrecision("from_lat").notNull(),
  fromLng: doublePrecision("from_lng").notNull(),
  toActivityId: varchar("to_activity_id"),
  toName: text("to_name").notNull(),
  toLat: doublePrecision("to_lat").notNull(),
  toLng: doublePrecision("to_lng").notNull(),
  distanceMeters: integer("distance_meters").notNull(),
  distanceDisplay: text("distance_display").notNull(),
  recommendedMode: text("recommended_mode").notNull(),
  userSelectedMode: text("user_selected_mode"),
  estimatedDurationMinutes: integer("estimated_duration_minutes").notNull(),
  estimatedCostUsd: doublePrecision("estimated_cost_usd"),
  alternativeModes: jsonb("alternative_modes").$type<{
    mode: string;
    durationMinutes: number;
    costUsd: number | null;
    energyCost: number;
    reason: string;
  }[]>(),
  energyCost: integer("energy_cost").default(0),
  linkedProductId: varchar("linked_product_id"),
  linkedProductUrl: text("linked_product_url"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
  destinationProfile: text("destination_profile"),
  // Expert-stated arrangement facts for a chauffeured leg (migration 154). Only ever what the
  // expert actually wrote (§13); pickupTime is a DISPLAY STRING in v1 — no tz math, never derived
  // from an activity start time. NOT a booking record: booked-ride state still derives from
  // transport_booking_options.
  pickupPoint: text("pickup_point"),
  pickupTime: text("pickup_time"),
  // Proposal lifecycle for trip-scoped legs: 'proposed' (engine-computed, expert-only) →
  // 'confirmed' (expert-confirmed; the ONLY state traveler surfaces render). NULL = legacy
  // variant leg, grandfathered. DB CHECK (migration 154) allows NULL.
  proposalStatus: varchar("proposal_status", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sharedItineraries = pgTable("shared_itineraries", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  shareToken: varchar("share_token").notNull().unique(),
  variantId: varchar("variant_id").notNull().references(() => itineraryVariants.id, { onDelete: "cascade" }),
  sharedByUserId: varchar("shared_by_user_id").notNull().references(() => users.id),
  sharedWithUserId: varchar("shared_with_user_id").references(() => users.id),
  permissions: varchar("permissions", { length: 20 }).notNull().default("view"),
  expertStatus: varchar("expert_status", { length: 30 }).default("pending"),
  expertNotes: text("expert_notes"),
  expertDiff: jsonb("expert_diff").$type<{
    activityDiffs: Record<string, { name?: string; startTime?: string; note?: string; originalName: string; originalStartTime?: string }>;
    transportDiffs: Record<string, { originalMode: string; newMode: string; legOrder: number }>;
    submittedAt: string;
  }>(),
  transportPreferences: jsonb("transport_preferences").$type<{
    defaultMode: string;
    avoidModes: string[];
    prioritize: "time" | "cost" | "comfort" | "scenic";
    maxWalkMinutes: number;
    accessibility: boolean;
  }>(),
  viewCount: integer("view_count").default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const mapsExportCache = pgTable("maps_export_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  variantId: varchar("variant_id").notNull().references(() => itineraryVariants.id, { onDelete: "cascade" }),
  kmlContent: text("kml_content"),
  gpxContent: text("gpx_content"),
  geoJsonContent: jsonb("geo_json_content"),
  googleMapsUrls: jsonb("google_maps_urls").$type<Record<number, string>>(),
  appleMapsUrls: jsonb("apple_maps_urls").$type<Record<number, string>>(),
  appleMapsWebUrls: jsonb("apple_maps_web_urls").$type<Record<number, string>>(),
  generatedAt: timestamp("generated_at").defaultNow(),
  transportLegsHash: text("transport_legs_hash"),
});

// Transport Booking Options (choices for booking a specific leg or multi-day pass)
export const transportBookingOptions = pgTable("transport_booking_options", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Which transport leg (or trip for multi-day pass)
  transportLegId: varchar("transport_leg_id").references(() => transportLegs.id, { onDelete: "cascade" }),
  variantId: varchar("variant_id").references(() => itineraryVariants.id, { onDelete: "cascade" }),

  // Booking channel and source
  bookingType: text("booking_type").notNull(), // "platform", "affiliate", "deep_link", "info_only"
  source: text("source").notNull(), // "traveloure", "12go", "viator", "uber", "walking", etc.

  // Display information
  title: text("title").notNull(),
  description: text("description"),
  modeType: text("mode_type").notNull(),
  iconType: text("icon_type"),

  // Pricing
  priceDisplay: text("price_display"),
  priceCentsLow: integer("price_cents_low"),
  priceCentsHigh: integer("price_cents_high"),
  pricePerPerson: boolean("price_per_person").default(false),
  currency: text("currency").default("USD"),

  // Timing
  estimatedMinutes: integer("estimated_minutes"),
  estimatedMinutesHigh: integer("estimated_minutes_high"),

  // Provider and external links
  providerId: integer("provider_id"),
  externalUrl: text("external_url"),
  affiliateCode: text("affiliate_code"),
  deepLinkScheme: text("deep_link_scheme"),

  // Booking and pass metadata
  bookingStatus: text("booking_status").default("available"), // "available", "booked", "confirmed", "cancelled"
  confirmationRef: text("confirmation_ref"),
  bookingId: integer("booking_id"),
  isMultiDayPass: boolean("is_multi_day_pass").default(false),
  passValidDays: integer("pass_valid_days"),
  savingsVsIndividual: integer("savings_vs_individual_cents"),

  // Rating and reviews (for providers)
  rating: doublePrecision("rating"),
  reviewCount: integer("review_count"),

  // Sorting and recommendation
  sortOrder: integer("sort_order").default(0),
  isRecommended: boolean("is_recommended").default(false),

  // Partnerize sourcing: flags offers that came from a synced Partnerize
  // campaign (affiliate_partners.source = 'partnerize') so surfaces can show
  // the "book with an expert" CTA alongside the direct link.
  isPartnerizeSourced: boolean("is_partnerize_sourced").default(false),
  partnerizePartnerId: varchar("partnerize_partner_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTransportLegSchema = createInsertSchema(transportLegs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTransportBookingOptionSchema = createInsertSchema(transportBookingOptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSharedItinerarySchema = createInsertSchema(sharedItineraries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMapsExportCacheSchema = createInsertSchema(mapsExportCache).omit({ id: true });

export type TransportLeg = typeof transportLegs.$inferSelect;
export type InsertTransportLeg = z.infer<typeof insertTransportLegSchema>;
export type TransportBookingOption = typeof transportBookingOptions.$inferSelect;
export type InsertTransportBookingOption = z.infer<typeof insertTransportBookingOptionSchema>;
export type SharedItinerary = typeof sharedItineraries.$inferSelect;
export type InsertSharedItinerary = z.infer<typeof insertSharedItinerarySchema>;
export type MapsExportCache = typeof mapsExportCache.$inferSelect;
export type InsertMapsExportCache = z.infer<typeof insertMapsExportCacheSchema>;

// === Trip Collaborators ===

export const tripCollaborators = pgTable("trip_collaborators", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().$type<"owner" | "expert" | "friend">(),
  invitedBy: varchar("invited_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueTripUser: unique("trip_collaborators_trip_user_unique").on(table.tripId, table.userId),
}));

export const insertTripCollaboratorSchema = createInsertSchema(tripCollaborators).omit({ id: true, createdAt: true });
export type TripCollaborator = typeof tripCollaborators.$inferSelect;
export type InsertTripCollaborator = z.infer<typeof insertTripCollaboratorSchema>;

export const itineraryChanges = pgTable("itinerary_changes", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  activityId: varchar("activity_id"),
  who: varchar("who", { length: 255 }).notNull(),
  action: text("action").notNull(),
  changeType: varchar("change_type", { length: 20 }).notNull(), // edit, suggest, ai, confirm, reorder, add, remove
  role: varchar("role", { length: 20 }).notNull(), // owner, expert, friend, ai
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Item transition log — the slip's diary (Lane S, migration 171) ─────────────────────────────
// APPEND-ONLY: no app code may UPDATE or DELETE rows here (unlike `itinerary_changes`, which is a
// traveler display feed with a DELETE endpoint — ruling 11 keeps the two separate: one truth per
// event type). Every `itinerary_items.routing_status` transition writes a row in the SAME
// transaction as the flip (ruling 18); trip-scoped events (`variant_applied`) carry itemId NULL
// (ruling 16). `item_id` deliberately has NO FK — a deleted item's history must survive it (the
// same posture as itinerary_changes.activityId). Version = count of rows per trip, display-only —
// never a stored column. NO DB CHECK on the vocab columns (the migration-159 posture): canonical
// sets live here in code. This insert path is the future subscription hook for the expert
// PULL→PUSH notification lane — do not build notifications on it yet.
export const itemTransitionLog = pgTable(
  "item_transition_log",
  {
    id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    itemId: varchar("item_id"), // NULL = trip-scoped event (ruling 16); no FK — history outlives the item
    eventType: varchar("event_type", { length: 30 }).notNull().default("status_transition"), // status_transition | variant_applied | plan_finalized | plan_reopened (R-F) | workspace_status_transition (task 1028)
    fromStatus: varchar("from_status", { length: 20 }), // NULL for non-status events
    toStatus: varchar("to_status", { length: 20 }),
    actorType: varchar("actor_type", { length: 20 }).notNull(), // traveler | expert | checkout | refund | optimizer | system
    actorId: varchar("actor_id"), // session user when there is one; NULL for system/checkout/refund actors
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // The diary read (newest-first per trip) + the version count both ride this index.
    // Declared here, not only in migration 171 — the deploy push drops undeclared indexes.
    index("itl_trip_created_idx").on(table.tripId, table.createdAt),
  ],
);

export type ItemTransitionLogEntry = typeof itemTransitionLog.$inferSelect;
export type InsertItemTransitionLogEntry = typeof itemTransitionLog.$inferInsert;

// NOTE (W5-D cleanup, Aug 1, 2026): the `activity_comments` table + its schema were retired here —
// zero client callers of GET/POST /api/activities/:activityId/comments or DELETE /api/comments/:id
// ever existed. Per-item comments now live on `trip_item_comments` (migration 165). See migration
// 167_drop_activity_comments.sql for the DROP TABLE rationale.

export const insertItineraryChangeSchema = createInsertSchema(itineraryChanges).omit({ id: true, createdAt: true });

export type ItineraryChange = typeof itineraryChanges.$inferSelect;
export type InsertItineraryChange = z.infer<typeof insertItineraryChangeSchema>;

// ============================================
// DATA MONETIZATION & ANALYTICS INFRASTRUCTURE
// ============================================

// Search Analytics - Track what travelers are looking for
export const searchAnalytics = pgTable("search_analytics", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: varchar("session_id", { length: 100 }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  searchType: varchar("search_type", { length: 50 }).notNull(), // destination, expert, service, hotel, flight, activity
  query: text("query"),
  destination: varchar("destination", { length: 255 }),
  originCountry: varchar("origin_country", { length: 100 }),
  originCity: varchar("origin_city", { length: 100 }),
  travelDates: jsonb("travel_dates"), // {startDate, endDate}
  travelers: integer("travelers"),
  budget: varchar("budget", { length: 50 }),
  filters: jsonb("filters"), // Applied filters
  resultsCount: integer("results_count"),
  clickedResults: jsonb("clicked_results"), // Array of clicked result IDs
  convertedToBooking: boolean("converted_to_booking").default(false),
  deviceType: varchar("device_type", { length: 20 }), // mobile, desktop, tablet
  userAgent: text("user_agent"),
  ipCountry: varchar("ip_country", { length: 100 }),
  ipCity: varchar("ip_city", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Page View Analytics - Track user journeys
export const pageViewAnalytics = pgTable("page_view_analytics", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: varchar("session_id", { length: 100 }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  pagePath: varchar("page_path", { length: 500 }).notNull(),
  pageType: varchar("page_type", { length: 50 }), // home, search, expert, destination, booking, checkout
  referrer: text("referrer"),
  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),
  timeOnPage: integer("time_on_page"), // seconds
  scrollDepth: integer("scroll_depth"), // percentage
  deviceType: varchar("device_type", { length: 20 }),
  ipCountry: varchar("ip_country", { length: 100 }),
  ipCity: varchar("ip_city", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Booking Funnel Analytics - Conversion tracking
export const bookingFunnelAnalytics = pgTable("booking_funnel_analytics", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: varchar("session_id", { length: 100 }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  funnelStage: varchar("funnel_stage", { length: 50 }).notNull(), // search, view, cart, checkout, payment, complete, abandoned
  serviceType: varchar("service_type", { length: 50 }), // expert, provider, hotel, flight, activity
  serviceId: varchar("service_id"),
  providerId: varchar("provider_id"),
  destination: varchar("destination", { length: 255 }),
  price: decimal("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  abandonReason: varchar("abandon_reason", { length: 100 }),
  ipCountry: varchar("ip_country", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Destination Demand Signals - What people want but can't find
export const demandSignals = pgTable("demand_signals", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  destination: varchar("destination", { length: 255 }).notNull(),
  country: varchar("country", { length: 100 }),
  serviceType: varchar("service_type", { length: 50 }), // expert, photographer, tour_guide, hotel, etc.
  searchCount: integer("search_count").default(0),
  noResultsCount: integer("no_results_count").default(0), // Searches with zero results
  avgBudget: decimal("avg_budget", { precision: 10, scale: 2 }),
  peakMonth: varchar("peak_month", { length: 20 }),
  travelersProfile: jsonb("travelers_profile"), // {solo: 10, couples: 20, families: 15}
  originCountries: jsonb("origin_countries"), // {USA: 50, UK: 30, Germany: 20}
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Traveler-submitted service requests — an explicit "I want a service that doesn't
// exist yet" capture (distinct from the machine-generated serviceDemandSignals /
// aggregate demandSignals). A traveler describes what they're looking for; admins
// triage the queue; the request carries a status so it can be marked fulfilled.
// travelerId is set server-side from the session (§14). Migration 123.
export const serviceRequests = pgTable("service_requests", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  travelerId: varchar("traveler_id").references(() => users.id, { onDelete: "set null" }),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }),
  serviceType: varchar("service_type", { length: 100 }), // free-text category hint (optional)
  description: text("description").notNull(),
  budget: decimal("budget", { precision: 10, scale: 2 }), // optional traveler budget, dollars
  // open → the request is live in the admin queue; fulfilled → a matching service now exists;
  // closed → dismissed/won't-build. DB CHECK enforces this set (new table, no legacy rows).
  status: varchar("status", { length: 20 }).notNull().default("open"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({
  id: true, travelerId: true, status: true, adminNotes: true, createdAt: true, updatedAt: true,
}).extend({
  // `description` is a TEXT column, so drizzle-zod imposes no length cap by default —
  // bound it so an authenticated user can't POST a multi-MB body into the admin queue.
  description: z.string().min(5).max(5000),
});
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type ServiceRequest = typeof serviceRequests.$inferSelect;

// Provider Performance Metrics - For selling insights to providers
export const providerPerformanceMetrics = pgTable("provider_performance_metrics", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 20 }).notNull(), // daily, weekly, monthly
  periodStart: timestamp("period_start").notNull(),
  impressions: integer("impressions").default(0),
  profileViews: integer("profile_views").default(0),
  searchAppearances: integer("search_appearances").default(0),
  inquiries: integer("inquiries").default(0),
  bookings: integer("bookings").default(0),
  revenue: decimal("revenue", { precision: 10, scale: 2 }).default("0"),
  avgResponseTime: integer("avg_response_time"), // minutes
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }),
  competitorRank: integer("competitor_rank"),
  priceCompetitiveness: varchar("price_competitiveness", { length: 20 }), // below_avg, avg, above_avg
  createdAt: timestamp("created_at").defaultNow(),
});

// Market Intelligence - Aggregated insights for selling to tourism boards
export const marketIntelligence = pgTable("market_intelligence", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reportType: varchar("report_type", { length: 50 }).notNull(), // destination, country, service_type, seasonal
  targetEntity: varchar("target_entity", { length: 255 }).notNull(), // Country name, destination, etc.
  period: varchar("period", { length: 20 }).notNull(),
  periodStart: timestamp("period_start").notNull(),
  metrics: jsonb("metrics").notNull(), // Flexible metrics storage
  insights: jsonb("insights"), // AI-generated insights
  recommendations: jsonb("recommendations"),
  dataQuality: varchar("data_quality", { length: 20 }).default("high"), // high, medium, low
  createdAt: timestamp("created_at").defaultNow(),
});

// Pricing Intelligence - Track market pricing
export const pricingIntelligence = pgTable("pricing_intelligence", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceType: varchar("service_type", { length: 50 }).notNull(),
  destination: varchar("destination", { length: 255 }),
  country: varchar("country", { length: 100 }),
  avgPrice: decimal("avg_price", { precision: 10, scale: 2 }),
  minPrice: decimal("min_price", { precision: 10, scale: 2 }),
  maxPrice: decimal("max_price", { precision: 10, scale: 2 }),
  medianPrice: decimal("median_price", { precision: 10, scale: 2 }),
  priceRange: varchar("price_range", { length: 50 }), // budget, mid-range, luxury
  sampleSize: integer("sample_size"),
  period: varchar("period", { length: 20 }),
  periodStart: timestamp("period_start"),
  createdAt: timestamp("created_at").defaultNow(),
});


// Activity & Service Booking Analytics
export const activityBookingAnalytics = pgTable("activity_booking_analytics", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: varchar("session_id", { length: 100 }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Activity/Service Details
  activityType: varchar("activity_type", { length: 100 }).notNull(), // photography, tour, wedding_planning, adventure, culinary, wellness, etc.
  activityCategory: varchar("activity_category", { length: 100 }), // outdoor, cultural, romantic, family, luxury, budget
  serviceName: varchar("service_name", { length: 255 }),
  providerId: varchar("provider_id"),
  providerType: varchar("provider_type", { length: 50 }), // expert, service_provider
  
  // Location Data
  destination: varchar("destination", { length: 255 }),
  country: varchar("country", { length: 100 }),
  city: varchar("city", { length: 100 }),
  
  // Booking Details
  bookingStatus: varchar("booking_status", { length: 50 }), // viewed, inquired, booked, completed, cancelled
  price: decimal("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  groupSize: integer("group_size"),
  
  // Traveler Profile
  tripType: varchar("trip_type", { length: 50 }), // vacation, honeymoon, wedding, business, adventure, family
  travelerOriginCountry: varchar("traveler_origin_country", { length: 100 }),
  
  // Timing
  bookingLeadDays: integer("booking_lead_days"), // Days between booking and activity
  activityDate: timestamp("activity_date"),
  
  // Device & Source
  deviceType: varchar("device_type", { length: 20 }),
  referralSource: varchar("referral_source", { length: 100 }),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Activity Demand Trends - Aggregated insights
export const activityDemandTrends = pgTable("activity_demand_trends", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  activityType: varchar("activity_type", { length: 100 }).notNull(),
  destination: varchar("destination", { length: 255 }),
  country: varchar("country", { length: 100 }),
  period: varchar("period", { length: 20 }).notNull(), // daily, weekly, monthly
  periodStart: timestamp("period_start").notNull(),
  
  // Metrics
  searchCount: integer("search_count").default(0),
  viewCount: integer("view_count").default(0),
  inquiryCount: integer("inquiry_count").default(0),
  bookingCount: integer("booking_count").default(0),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default("0"),
  avgPrice: decimal("avg_price", { precision: 10, scale: 2 }),
  avgGroupSize: decimal("avg_group_size", { precision: 5, scale: 1 }),
  
  // Traveler Demographics
  topOriginCountries: jsonb("top_origin_countries"), // [{country: "USA", count: 50}, ...]
  tripTypeBreakdown: jsonb("trip_type_breakdown"), // {honeymoon: 30, vacation: 50, ...}
  
  // Conversion
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
});


// Enhanced Location & Trip Analytics (for tourism board sales)
export const tripAnalyticsEnhanced = pgTable("trip_analytics_enhanced", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "set null" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Destination Details
  destinationCountry: varchar("destination_country", { length: 100 }),
  destinationRegion: varchar("destination_region", { length: 100 }), // e.g., "Tuscany", "Provence", "Bali"
  destinationCity: varchar("destination_city", { length: 100 }),
  destinationType: varchar("destination_type", { length: 50 }), // beach, city, mountain, countryside, island
  
  // Source Market (Where traveler is FROM)
  originCountry: varchar("origin_country", { length: 100 }),
  originRegion: varchar("origin_region", { length: 100 }),
  originCity: varchar("origin_city", { length: 100 }),
  
  // Trip Timing
  bookingDate: timestamp("booking_date"),
  tripStartDate: timestamp("trip_start_date"),
  tripEndDate: timestamp("trip_end_date"),
  leadTimeDays: integer("lead_time_days"), // Days between booking and trip
  lengthOfStay: integer("length_of_stay"), // Nights
  season: varchar("season", { length: 20 }), // spring, summer, fall, winter
  
  // Traveler Profile
  partySize: integer("party_size"),
  partyComposition: varchar("party_composition", { length: 50 }), // solo, couple, family, group, business
  hasChildren: boolean("has_children"),
  tripPurpose: varchar("trip_purpose", { length: 50 }), // leisure, business, wedding, honeymoon, anniversary
  
  // Spending
  totalBudget: decimal("total_budget", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  accommodationBudget: decimal("accommodation_budget", { precision: 10, scale: 2 }),
  activitiesBudget: decimal("activities_budget", { precision: 10, scale: 2 }),
  diningBudget: decimal("dining_budget", { precision: 10, scale: 2 }),
  transportBudget: decimal("transport_budget", { precision: 10, scale: 2 }),
  spendPerDay: decimal("spend_per_day", { precision: 10, scale: 2 }),
  priceSegment: varchar("price_segment", { length: 20 }), // budget, mid-range, luxury, ultra-luxury
  
  // Activities Booked
  activitiesBooked: jsonb("activities_booked"), // [{type: "photography", price: 500}, ...]
  primaryActivity: varchar("primary_activity", { length: 100 }),
  
  // Accommodation
  accommodationType: varchar("accommodation_type", { length: 50 }), // hotel, resort, villa, airbnb, hostel
  starRating: integer("star_rating"),
  
  // Booking Channel
  bookingChannel: varchar("booking_channel", { length: 50 }), // direct, platform, agent
  deviceUsed: varchar("device_used", { length: 20 }),
  
  // Competitor Data
  otherDestinationsConsidered: jsonb("other_destinations_considered"), // ["Barcelona", "Rome", "Lisbon"]
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Destination Comparison Reports (sell to competing destinations)
export const destinationBenchmarks = pgTable("destination_benchmarks", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  destination: varchar("destination", { length: 255 }).notNull(),
  country: varchar("country", { length: 100 }),
  period: varchar("period", { length: 20 }).notNull(),
  periodStart: timestamp("period_start").notNull(),
  
  // Volume Metrics
  searchVolume: integer("search_volume"),
  bookingVolume: integer("booking_volume"),
  marketShare: decimal("market_share", { precision: 5, scale: 2 }), // % of total bookings
  
  // Source Markets
  topSourceCountries: jsonb("top_source_countries"), // [{country: "USA", share: 25}, ...]
  
  // Spending
  avgTripSpend: decimal("avg_trip_spend", { precision: 10, scale: 2 }),
  avgDailySpend: decimal("avg_daily_spend", { precision: 10, scale: 2 }),
  revenueEstimate: decimal("revenue_estimate", { precision: 14, scale: 2 }),
  
  // Trip Characteristics
  avgLengthOfStay: decimal("avg_length_of_stay", { precision: 5, scale: 1 }),
  avgLeadTime: decimal("avg_lead_time", { precision: 5, scale: 1 }),
  avgPartySize: decimal("avg_party_size", { precision: 5, scale: 1 }),
  
  // Seasonality
  peakMonths: jsonb("peak_months"), // ["June", "July", "August"]
  seasonalityIndex: jsonb("seasonality_index"), // {jan: 0.5, feb: 0.6, ...}
  
  // Activity Mix
  topActivities: jsonb("top_activities"), // [{activity: "photography", share: 15}, ...]
  
  // Competitor Comparison
  similarDestinations: jsonb("similar_destinations"), // ["Barcelona", "Lisbon"]
  competitorComparison: jsonb("competitor_comparison"), // vs similar destinations
  
  // Sentiment
  avgRating: decimal("avg_rating", { precision: 3, scale: 2 }),
  sentimentScore: decimal("sentiment_score", { precision: 3, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
  tripId: varchar("trip_id", { length: 255 }).references(() => trips.id, { onDelete: "set null" }),
  tripItemId: uuid("trip_item_id"),
  providerId: varchar("provider_id", { length: 255 }),
  expertId: varchar("expert_id", { length: 255 }),
  bookingType: varchar("booking_type", { length: 20 }),
  status: varchar("status", { length: 50 }).default("pending"),
  title: varchar("title", { length: 255 }),
  bookingDate: date("booking_date"),
  bookingTime: time("booking_time"),
  travelers: integer("travelers"),
  serviceAmount: decimal("service_amount"),
  platformFee: decimal("platform_fee"),
  expertFee: decimal("expert_fee"),
  totalAmount: decimal("total_amount"),
  providerPayout: decimal("provider_payout"),
  paymentMethod: varchar("payment_method", { length: 20 }),
  depositAmount: decimal("deposit_amount"),
  depositPaid: boolean("deposit_paid").default(false),
  balanceAmount: decimal("balance_amount"),
  balancePaid: boolean("balance_paid").default(false),
  balanceDueDate: date("balance_due_date"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeDepositIntentId: varchar("stripe_deposit_intent_id", { length: 255 }),
  stripeBalanceIntentId: varchar("stripe_balance_intent_id", { length: 255 }),
  paymentStatus: varchar("payment_status", { length: 50 }),
  // Chargeback / dispute tracking (set by charge.dispute.created webhook)
  disputeId: text("dispute_id"),
  disputeReason: text("dispute_reason"),
  // Idempotency: set by the client on checkout; checked server-side before insert.
  idempotencyKey: text("idempotency_key"),
  confirmationCode: varchar("confirmation_code", { length: 50 }),
  confirmedAt: timestamp("confirmed_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  cancelledBy: varchar("cancelled_by", { length: 20 }),
  refundAmount: decimal("refund_amount"),
  refundStatus: varchar("refund_status", { length: 50 }),
  refundedAt: timestamp("refunded_at"),
  specialRequests: text("special_requests"),
  metadata: jsonb("metadata").default({}),
  bookingMetadata: jsonb("booking_metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  createdAtIdx: index("bookings_created_at_idx").on(table.createdAt),

  // ── Declared here per the CLAUDE.md deploy-push rule ──────────────────────────────────
  // The publish-time drizzle push is AUTHORITATIVE over objects absent from this file and
  // will DROP an index that exists only in migration SQL — after which the stamped migration
  // never recreates it. All three below were created by registered migrations and declared
  // nowhere, so each publish silently removed them.
  //
  // This rail is NOT dead: §15c records the legacy `bookings` table as still live behind
  // /booking-demo and POST /api/bookings/process-cart.
  //
  // Partial WHERE clauses are mirrored from the migrations verbatim. They are load-bearing:
  // every one of these columns is nullable on legacy rows, and a FULL unique index would
  // collapse all those NULLs into a single conflicting value set and fail the publish.

  // Migration 096. The SAME guard it creates on `service_bookings` (declared at
  // sb_idempotency_key_idx above) — only that half was ever declared, so the cart rail kept
  // its protection across publishes and this rail lost it. Absence of this index was measured
  // to turn 3 concurrent same-key checkouts into 3 REAL Stripe charges.
  idempotencyKeyIdx: uniqueIndex("bookings_idempotency_key_idx")
    .on(table.idempotencyKey)
    .where(sql`idempotency_key IS NOT NULL`),

  // Migration 053. One booking per PaymentIntent — the DB-level backstop behind §15's
  // promotion conditionals.
  stripePaymentIntentIdUnique: uniqueIndex("bookings_stripe_payment_intent_id_unique")
    .on(table.stripePaymentIntentId)
    .where(sql`stripe_payment_intent_id IS NOT NULL`),

  // Migration 099. One expert cannot be double-booked into the same date+time slot.
  expertSlotUnique: uniqueIndex("bookings_expert_slot_unique_idx")
    .on(table.expertId, table.bookingDate, table.bookingTime)
    .where(sql`expert_id IS NOT NULL AND booking_date IS NOT NULL AND booking_time IS NOT NULL`),
}));

export const platformFees = pgTable("platform_fees", {
  id: uuid("id").primaryKey().defaultRandom(),
  feeType: varchar("fee_type", { length: 20 }),
  category: varchar("category", { length: 50 }),
  providerId: varchar("provider_id", { length: 255 }),
  feeTypeMethod: varchar("fee_type_method", { length: 20 }),
  feePercentage: decimal("fee_percentage"),
  feeFixedAmount: decimal("fee_fixed_amount"),
  minFee: decimal("min_fee"),
  maxFee: decimal("max_fee"),
  isActive: boolean("is_active").default(true),
  priority: integer("priority").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const paymentIntents = pgTable("payment_intents", {
  id: serial("id").primaryKey(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  userId: varchar("user_id", { length: 255 }),
  amount: decimal("amount"),
  currency: varchar("currency", { length: 10 }).default("usd"),
  status: varchar("status", { length: 50 }),
  isDeposit: boolean("is_deposit").default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Refund audit log (migration 156). MUST stay byte-for-byte equivalent to
// server/migrations/156_refunds_audit_table.sql — the deploy runs an automatic drizzle-kit
// push from this file, so any disagreement makes the push ALTER the table under a live
// money path. Written by exactly two sites in server/services/stripe-payment.service.ts:
//   handleRefund()          — the `charge.refunded` webhook: charge id + PI + amount +
//                             currency + status ('completed'); no booking_id / refund id / reason.
//   refundServiceBooking()  — the escrow refund terminal (§14 server-derived amount, §15 atomic
//                             status claim + deterministic Stripe idempotencyKey): booking_id +
//                             refund id + PI + amount + currency + Stripe status + reason.
// Nothing reads this table yet (the admin "Refunds" tab reads reversed platform_revenue rows) —
// it is an append-only audit log, so every column a writer omits is nullable.
// `status` is deliberately NULLABLE with NO CHECK: refundServiceBooking stores Stripe's
// refund.status, an external value typed `string | null` — a CHECK/NOT NULL here would
// reproduce the exact bug 156 fixes (money refunded in Stripe, audit insert throws).
export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  // ON DELETE SET NULL, never CASCADE: a financial audit row must outlive its booking.
  bookingId: varchar("booking_id").references(() => serviceBookings.id, { onDelete: "set null" }),
  stripeRefundId: varchar("stripe_refund_id", { length: 255 }),
  stripeChargeId: varchar("stripe_charge_id", { length: 255 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  // DOLLARS — same precision/scale as service_bookings.total_amount, the value it reverses.
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("usd"),
  status: varchar("status", { length: 50 }),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  bookingIdx: index("idx_refunds_booking_id").on(table.bookingId),
  paymentIntentIdx: index("idx_refunds_payment_intent").on(table.stripePaymentIntentId),
}));

// ══ RECONCILIATION DETECTION (migration 177, reconciliation-detection lane) ═════════════════
//
// The daily Stripe-vs-DB drift job's ops-visible output. Recovery on the money path is
// three-layered (ruling 38's TTL sweep, ruling 39's webhook + client-confirm promotion) but
// DETECTION used to be one-eyed — `server/jobs/stripeReconciliation.ts` scanned only the legacy
// `bookings` table, so cart checkout (the primary checkout) never appeared in a drift report.
//
// Declared HERE, not only in migration 177: the deploy push is authoritative over tables AND
// indexes it does not find in this file and will drop them, after which the stamped migration
// never recreates them (CLAUDE.md deploy-push rule, both variants).

/** One row per reconciliation pass — written for EVERY pass, including a clean one. A zero-
 *  exception run and a job that never ran must not look the same from the admin surface. */
export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    /** scheduled | manual | test — `trigger` is a reserved word, hence the column name. */
    triggeredBy: varchar("triggered_by", { length: 20 }).notNull().default("scheduled"),
    /** running | completed | skipped | failed */
    status: varchar("status", { length: 20 }).notNull().default("running"),
    windowStart: timestamp("window_start"),
    scannedPaymentIntents: integer("scanned_payment_intents").notNull().default(0),
    scannedCharges: integer("scanned_charges").notNull().default(0),
    scannedRefunds: integer("scanned_refunds").notNull().default(0),
    scannedCartBookings: integer("scanned_cart_bookings").notNull().default(0),
    scannedLegacyBookings: integer("scanned_legacy_bookings").notNull().default(0),
    /** Every drift found this pass, including ones already on record from an earlier pass. */
    exceptionsDetected: integer("exceptions_detected").notNull().default(0),
    /** Rows this pass actually inserted (detected minus already-recorded). */
    exceptionsNew: integer("exceptions_new").notNull().default(0),
    /** The ONE narrow repair this job may perform — PI-succeeded / row-still-provisional handed
     *  to the EXISTING shared promotion (`promotePaidCheckout`, actor `reconciliation`). */
    promoted: integer("promoted").notNull().default(0),
    note: text("note"),
  },
  (table) => ({
    startedIdx: index("recon_runs_started_idx").on(table.startedAt),
  }),
);

/** The canonical drift vocabulary. No DB CHECK (migration-159/171 posture) — this is the source
 *  of truth, and the admin surface renders from it. */
export const RECONCILIATION_EXCEPTION_KINDS = [
  // ── CART rail (service_bookings) ──────────────────────────────────────────────────────────
  /** A PaymentIntent succeeded and NO service_bookings row can be resolved from it (neither by
   *  stamped PI id nor by its own `bookingIds` metadata). Customer billed, no record. */
  "pi_succeeded_no_booking",
  /** A PaymentIntent succeeded but its booking is still an unpromoted claim. The ONE case the
   *  job may hand to the shared promotion; recorded as an exception when that fails. */
  "pi_succeeded_claim_provisional",
  /** A PaymentIntent succeeded and its booking is VOIDED/terminal (ruling 39's late-signal
   *  reconciliation-exception state). Never resurrected — a human decides refund vs. re-book. */
  "pi_succeeded_booking_voided",
  /** A booking is `confirmed` (or otherwise paid-equivalent) with NO PaymentIntent stamped. */
  "booking_confirmed_no_pi",
  /** A booking is `confirmed` but its PaymentIntent is not in a succeeded state at Stripe. */
  "booking_confirmed_pi_not_succeeded",
  /** Stripe's captured amount and the server-derived total of the PI's booking rows disagree. */
  "amount_mismatch",
  /** Stripe holds a refund whose reversal never landed in the DB (`refunds` row / status). */
  "refund_not_reversed",
  /** PS15 / ruling 46 — UNVERIFIABLE PAYMENT PROVENANCE. A booking carries a
   *  `stripe_payment_intent_id` with NO `bookingDetails.stripeAttemptAt` marker behind it.
   *
   *  Every PI the checkout spine writes is preceded by that §15b pre-flight marker
   *  (`markStripeAttempt` runs immediately before `paymentIntents.create`; `stampAuthorization`
   *  and the ordering-1 `resolveAndStamp` only ever act on rows that already carry it). A stamped
   *  row WITHOUT it was written by something that is not the spine — the PS15 mass-assignment on
   *  `POST /api/bookings` (closed by ruling 46), a seed (`beta-reviews-bookings.ts` mints synthetic
   *  `pi_…` values), or a row predating ruling 38.
   *
   *  Those are INDISTINGUISHABLE after the fact, and that is the whole point of the classification:
   *  the platform cannot prove the id came from Stripe, so it neither trusts it nor repairs it
   *  (§17 DETECT, DON'T REPAIR). It is a `warning`, not `critical` — the row may be perfectly fine;
   *  what is not fine is that nothing can tell. */
  "payment_provenance_unverified",
  // ── LEGACY rail (`bookings` — still live via /booking-demo and process-cart) ───────────────
  "stripe_charge_no_booking",
  "booking_no_stripe_charge",
] as const;
export type ReconciliationExceptionKind = (typeof RECONCILIATION_EXCEPTION_KINDS)[number];

/** One row per DISTINCT drift fact. APPEND-ONLY: no app code carries an UPDATE or DELETE path
 *  (item_transition_log / ruling 11 posture). Re-detection on a later pass is absorbed by the
 *  UNIQUE `dedupeKey` (`ON CONFLICT DO NOTHING`), so a month-long drift is ONE row, while the
 *  run rows keep recording that it is still being seen. */
export const reconciliationExceptions = pgTable(
  "reconciliation_exceptions",
  {
    id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    runId: varchar("run_id").notNull().references(() => reconciliationRuns.id, { onDelete: "cascade" }),
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    /** cart (service_bookings) | legacy (bookings) */
    rail: varchar("rail", { length: 20 }).notNull(),
    kind: varchar("kind", { length: 60 }).notNull(),
    /** critical | warning */
    severity: varchar("severity", { length: 20 }).notNull().default("critical"),
    dedupeKey: text("dedupe_key").notNull(),
    /** Soft reference, NO FK — the job must be able to name a booking id that does not exist
     *  (that is one of the drift cases), and an audit row outlives the row it indicts. */
    bookingId: varchar("booking_id"),
    paymentIntentId: varchar("payment_intent_id", { length: 255 }),
    chargeId: varchar("charge_id", { length: 255 }),
    /** DOLLARS — same precision/scale as service_bookings.total_amount. */
    expectedAmount: decimal("expected_amount", { precision: 10, scale: 2 }),
    actualAmount: decimal("actual_amount", { precision: 10, scale: 2 }),
    currency: varchar("currency", { length: 10 }),
    details: jsonb("details").notNull().default({}),
  },
  (table) => ({
    dedupeIdx: uniqueIndex("recon_exc_dedupe_idx").on(table.dedupeKey),
    detectedIdx: index("recon_exc_detected_idx").on(table.detectedAt),
    runIdx: index("recon_exc_run_idx").on(table.runId),
  }),
);

export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type ReconciliationException = typeof reconciliationExceptions.$inferSelect;

/**
 * FEE LEDGER (migration 179, fee-ledger lane) — the append-only fee EVENT log.
 *
 * Audit C1: fee capture was a scalar column in a two-sided fee model. `payments.routes.ts:307` adds
 * a computed fee to the traveler total and `:878-879` deducts the same rate from the provider base,
 * while `:961-964` records ONE side in `service_bookings.platform_fee` — so on an $80 booking the
 * platform retained $40 and recorded $20, and ~15 independent aggregations all under-reported by
 * half. This table records each side as its own event.
 *
 * A fee EVENT log, NOT a general ledger — no double-entry, no chart of accounts. The per-booking
 * invariant (`traveler_paid - provider_credited = SUM(amount)`) supplies the integrity.
 *
 * APPEND-ONLY: application code carries no UPDATE and no DELETE against this table, including to
 * correct a bad row — a correction is a `reversal` row linked by `reversesLedgerId` plus a new row.
 *
 * MUST stay equivalent to server/migrations/179_fee_ledger.sql: the deploy runs an automatic
 * drizzle-kit push from this file and is authoritative over tables AND indexes it does not find
 * declared here; 179 is stamped after its first run, so a dropped object would never be recreated.
 */
export const FEE_LEDGER_TYPES = [
  "traveler_service_fee",
  "provider_commission_full",
  "provider_commission_rails",
  "expert_commission",
  "ai_concierge_fee",
  "affiliate_margin",
  "credit_applied",
  "reversal",
] as const;
export type FeeLedgerType = (typeof FEE_LEDGER_TYPES)[number];

/** Which layer decided the rate. `band_id` is null for every value except "band" (Phase 0 §1a). */
export const FEE_RATE_SOURCES = ["band", "entity_override", "rails", "code_fallback", "flat"] as const;
export type FeeRateSource = (typeof FEE_RATE_SOURCES)[number];

export const feeLedger = pgTable(
  "fee_ledger",
  {
    id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** service_booking | booking (legacy rail) | ready_made_purchase | template_purchase | coordination | tip | affiliate */
    sourceType: varchar("source_type", { length: 40 }).notNull(),
    sourceId: varchar("source_id").notNull(),
    /** Denormalized for the per-booking invariant; NULL for non-booking events. */
    bookingId: varchar("booking_id"),
    feeType: varchar("fee_type", { length: 40 }).notNull().$type<FeeLedgerType>(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    borneBy: varchar("borne_by", { length: 12 }).notNull(),
    /** NULLABLE BY DESIGN — an entity-override or fallback rate has no band that explains it. */
    bandId: uuid("band_id").references(() => feeBands.id),
    rateAsResolved: decimal("rate_as_resolved", { precision: 10, scale: 4 }),
    rateSource: varchar("rate_source", { length: 20 }).notNull().$type<FeeRateSource>(),
    /** True when fee_bands.max_amount clamped the amount (D1's $25 traveler-fee cap). */
    capApplied: boolean("cap_applied").notNull().default(false),
    /** platform | rails — on this table attribution is a FEE INPUT, not an analytics dimension. */
    sourceAttribution: varchar("source_attribution", { length: 12 }).notNull().default("platform"),
    acquisitionRef: varchar("acquisition_ref", { length: 32 }),
    stripePaymentRef: varchar("stripe_payment_ref", { length: 255 }),
    stripeTransferRef: varchar("stripe_transfer_ref", { length: 255 }),
    stripeRefundRef: varchar("stripe_refund_ref", { length: 255 }),
    reversesLedgerId: varchar("reverses_ledger_id"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    description: text("description"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => ({
    idempotencyKeyIdx: uniqueIndex("fee_ledger_idempotency_key_idx").on(table.idempotencyKey),
    bookingIdx: index("fee_ledger_booking_idx").on(table.bookingId),
    sourceIdx: index("fee_ledger_source_idx").on(table.sourceType, table.sourceId),
    paymentRefIdx: index("fee_ledger_payment_ref_idx").on(table.stripePaymentRef),
    reversesIdx: index("fee_ledger_reverses_idx").on(table.reversesLedgerId),
  }),
);
export type FeeLedgerRow = typeof feeLedger.$inferSelect;
export type InsertFeeLedgerRow = typeof feeLedger.$inferInsert;

// AI cost tracking (migration 025b). MUST stay byte-for-byte equivalent to
// server/migrations/025b_ai_cost_tracking.sql — the deploy runs an automatic drizzle-kit push
// from this file, and the push is authoritative over BOTH tables and indexes it does not find
// declared here (proven Jul 30, 2026: the push emitted a bare `DROP INDEX` for the undeclared
// sb_idempotency_key_idx). 025b is already stamped, so a publish that drops this table would
// mean runMigrations() NEVER recreates it → permanent silent loss of AI-cost observability.
// Written (raw SQL) by server/services/ai-cost-tracker.ts, called from claude.service.ts,
// itinerary-optimizer.ts, the chat routes and the content/experts/trips routers; read by
// lead-routing.service.ts for the admin dead-end-lead cost breakdown.
// Exact-match notes — these are the DDL, not preferences:
//   • id: DB-side DEFAULT gen_random_uuid() is REQUIRED (the writer never supplies id), hence
//     uuid().primaryKey().defaultRandom() — NOT the house varchar().$defaultFn(crypto.randomUUID)
//     pattern, which is client-side and emits no DB default.
//   • userId is uuid with NO foreign key, matching the DDL. users.id is varchar in this codebase,
//     so a .references() here would make the push try to create a constraint that cannot exist.
//   • cost is NUMERIC(10, 6) — six decimal places (per-request AI cost in USD), not the usual (10, 2).
//   • both indexes carry their exact existing names and DESC direction on created_at.
//     `.nullsFirst()` is LOAD-BEARING, do not "simplify" it away: Postgres defaults DESC to
//     NULLS FIRST, but drizzle's bare `.desc()` emits `DESC NULLS LAST` — proven to make the
//     push plan `DROP INDEX` + `CREATE INDEX` for BOTH indexes on every single publish.
//     With `.desc().nullsFirst()` the push plan contains zero ai_cost_tracking statements.
export const aiCostTracking = pgTable("ai_cost_tracking", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  modelUsed: varchar("model_used", { length: 100 }),
  requestId: varchar("request_id", { length: 255 }),
  userId: uuid("user_id"),
  cost: decimal("cost", { precision: 10, scale: 6 }).notNull(),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  sourceTypeCreatedIdx: index("idx_ai_cost_tracking_source_type_created")
    .on(table.sourceType, table.createdAt.desc().nullsFirst()),
  userIdCreatedIdx: index("idx_ai_cost_tracking_user_id_created")
    .on(table.userId, table.createdAt.desc().nullsFirst()),
}));

// DEPRECATED: 2026-06-27
// Renamed to _deprecated_expert_city_queues
// Scheduled DROP: after 2026-09-01
// Migration file: server/migrations/
//   scheduled_drop_deprecated_city_queues.sql
// DO NOT add new references to this table.
export const expertCityQueues = pgTable("expert_city_queues", {
  id: uuid("id").primaryKey().defaultRandom(),
  city: text("city"),
  expertIds: jsonb("expert_ids").$type<string[]>().default([]),
  activeRequests: integer("active_requests").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const expertRequests = pgTable("expert_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  variantId: text("variant_id"),
  comparisonId: text("comparison_id"),
  destinationCity: text("destination_city"),
  requestType: text("request_type"),
  expertFee: decimal("expert_fee"),
  status: text("status").default("pending"),
  assignedExpertId: text("assigned_expert_id"),
  queuePosition: integer("queue_position"),
  notes: text("notes"),
  optimizationContext: jsonb("optimization_context"),
  createdAt: timestamp("created_at").defaultNow(),
  assignedAt: timestamp("assigned_at"),
  completedAt: timestamp("completed_at"),
  fallbackMessage: text("fallback_message"),
}, (table) => ({
  destinationIdx: index("expert_requests_destination_idx").on(table.destinationCity),
  statusIdx: index("expert_requests_status_idx").on(table.status),
}));

// === Concierge Requests (CON-A.P3 / N5) ===
// Intent log for the pay-per-use Concierge layer. Persists every concierge request
// — including guest previews — for funnel metrics and resume-after-abandonment.
// userId is nullable so the guest hook (D6) is captured the same way as authed flows.
// chosenTier is null until the user picks a delivery tier (Phase 5 router writes it).
export const conciergeRequestStatuses = ["draft", "quoted", "selected", "paid", "delivered", "abandoned"] as const;
export type ConciergeRequestStatus = (typeof conciergeRequestStatuses)[number];

export const conciergeTiers = ["ai", "expert", "full"] as const;
export type ConciergeTier = (typeof conciergeTiers)[number];

export const conciergeRequests = pgTable("concierge_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"), // nullable: guests can submit intent before sign-up
  intent: text("intent").notNull(),
  eventType: text("event_type"),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "set null" }),
  cartId: text("cart_id"),
  chosenTier: text("chosen_tier"), // ai | expert | full — null until the user picks
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConciergeRequestSchema = createInsertSchema(conciergeRequests).omit({ id: true, createdAt: true });
export type ConciergeRequest = typeof conciergeRequests.$inferSelect;
export type InsertConciergeRequest = z.infer<typeof insertConciergeRequestSchema>;

// === Event Packages (CON-A.P8 / N6) ===
// Full / Done-for-You catalog. Admin-curated listings the Concierge surface
// presents as "quote on request" for high-stakes events (weddings, proposals,
// corporate, etc.). Phase A is catalog-only; the transactional flow (quote
// → approve → PI → workspace + provider bundle) is Phase C / C1.
export const eventPackageStatuses = ["active", "paused", "archived"] as const;
export type EventPackageStatus = (typeof eventPackageStatuses)[number];

export const eventPackages = pgTable("event_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  market: text("market").notNull(), // city / region name (matched ilike against destination)
  title: text("title").notNull(),
  description: text("description"),
  priceFromCents: integer("price_from_cents"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEventPackageSchema = createInsertSchema(eventPackages).omit({ id: true, createdAt: true, updatedAt: true });
export type EventPackage = typeof eventPackages.$inferSelect;
export type InsertEventPackage = z.infer<typeof insertEventPackageSchema>;

// === Event Coordination Profiles (Phase 4 / CON-A.P4) ===
// Config-driven event-type profiles. One row per event type (wedding, proposal,
// birthday, corporate, etc.). The generic event-coordination.service.ts reads the
// profile for the event type and builds the timeline, vendor matrix, and sequencing
// from these data rows — no per-event-type code paths.
export const eventCoordinationProfiles = pgTable("event_coordination_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull().unique(), // wedding, proposal, birthday, corporate
  anchorType: text("anchor_type").notNull(), // ceremony_time, proposal_moment, keynote_time, etc.
  // vendorMatrix: JSON of { category: string, required: boolean, priority: "critical"|"high"|"medium"|"low" }
  vendorMatrix: jsonb("vendor_matrix").$type<Array<{
    category: string;
    required: boolean;
    priority: "critical" | "high" | "medium" | "low";
    label: string;
    blocks: string[]; // which timeline blocks this vendor covers
  }>>().default([]),
  // sequencingRuleset: JSON of timeline blocks with offsets from anchor (in minutes)
  sequencingRuleset: jsonb("sequencing_ruleset").$type<Array<{
    key: string;
    label: string;
    offset: number; // minutes from anchor (negative = before)
    duration: number; // minutes
    isLocked: boolean; // immovable anchor
  }>>().default([]),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEventCoordinationProfileSchema = createInsertSchema(eventCoordinationProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type EventCoordinationProfile = typeof eventCoordinationProfiles.$inferSelect;
export type InsertEventCoordinationProfile = z.infer<typeof insertEventCoordinationProfileSchema>;

export const savedTrips = pgTable("saved_trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  variantId: text("variant_id"),
  comparisonId: text("comparison_id"),
  notes: text("notes"),
  savedAt: timestamp("saved_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  priceSnapshot: decimal("price_snapshot"),
  remindersSent: integer("reminders_sent").default(0),
  status: text("status").default("active"),
});


export const tripItems = pgTable("trip_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: varchar("trip_id", { length: 255 }).notNull().references(() => trips.id, { onDelete: "cascade" }),
  itemType: varchar("item_type", { length: 20 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  date: date("date").notNull(),
  time: time("time"),
  duration: varchar("duration", { length: 50 }),
  dayNumber: integer("day_number"),
  orderInDay: integer("order_in_day").default(0),
  price: decimal("price").notNull().default("0"),
  isPriceEstimated: boolean("is_price_estimated").default(true),
  currency: varchar("currency", { length: 3 }).default("USD"),
  locationName: varchar("location_name", { length: 255 }),
  latitude: decimal("latitude"),
  longitude: decimal("longitude"),
  address: text("address"),
  providerId: varchar("provider_id", { length: 255 }),
  bookingType: varchar("booking_type", { length: 20 }),
  externalUrl: text("external_url"),
  affiliatePartner: varchar("affiliate_partner", { length: 50 }),
  bookingStatus: varchar("booking_status", { length: 20 }).default("not_booked"),
  confirmationCode: varchar("confirmation_code", { length: 100 }),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bookingRequests = pgTable("booking_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  tripItemId: uuid("trip_item_id"),
  providerId: varchar("provider_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending_provider"),
  requestedDate: date("requested_date").notNull(),
  requestedTime: time("requested_time"),
  travelers: integer("travelers").notNull(),
  specialRequests: text("special_requests"),
  providerResponse: text("provider_response"),
  respondedAt: timestamp("responded_at"),
  responseExpiresAt: timestamp("response_expires_at"),
  counterDate: date("counter_date"),
  counterTime: time("counter_time"),
  counterPrice: decimal("counter_price"),
  counterMessage: text("counter_message"),
  bookingId: uuid("booking_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const providerAvailability = pgTable("provider_availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: varchar("provider_id", { length: 255 }).notNull(),
  serviceId: uuid("service_id"),
  availabilityType: varchar("availability_type", { length: 20 }).notNull(),
  blockedDates: jsonb("blocked_dates").default([]),
  availableDates: jsonb("available_dates").default([]),
  isAvailable: boolean("is_available").default(true),
  dailyCapacity: integer("daily_capacity"),
  currentBookings: integer("current_bookings").default(0),
  timeSlots: jsonb("time_slots"),
  recurringUnavailable: jsonb("recurring_unavailable"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const expertHandoffs = pgTable("expert_handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: varchar("trip_id", { length: 255 }).notNull(),
  expertId: varchar("expert_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  originalItinerary: jsonb("original_itinerary").notNull(),
  modifiedItinerary: jsonb("modified_itinerary"),
  expertNotes: text("expert_notes"),
  userFeedback: text("user_feedback"),
  canBookOnBehalf: boolean("can_book_on_behalf").default(false),
  bookingsMade: jsonb("bookings_made").default([]),
  expertFee: decimal("expert_fee"),
  feePaid: boolean("fee_paid").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  completedAt: timestamp("completed_at"),
  userApprovedAt: timestamp("user_approved_at"),
});

export const providerPricing = pgTable("provider_pricing", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: varchar("provider_id", { length: 255 }).notNull(),
  serviceId: uuid("service_id"),
  pricingType: varchar("pricing_type", { length: 20 }).notNull(),
  basePrice: decimal("base_price"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  seasonalPricing: jsonb("seasonal_pricing"),
  dateOverrides: jsonb("date_overrides"),
  requiresQuote: boolean("requires_quote").default(false),
  estimatedRangeMin: decimal("estimated_range_min"),
  estimatedRangeMax: decimal("estimated_range_max"),
  perPerson: boolean("per_person").default(false),
  groupDiscounts: jsonb("group_discounts"),
  requiresDeposit: boolean("requires_deposit").default(false),
  depositType: varchar("deposit_type", { length: 20 }),
  depositAmount: decimal("deposit_amount"),
  depositPercentage: integer("deposit_percentage"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sharedTrips = pgTable("shared_trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  variantId: text("variant_id"),
  comparisonId: text("comparison_id"),
  sharedBy: text("shared_by"),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  shareToken: text("share_token").notNull(),
  views: integer("views").default(0),
  bookings: integer("bookings").default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const travelpayoutsCache = pgTable("travelpayouts_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  brand: varchar("brand", { length: 100 }).notNull(),
  cacheKey: varchar("cache_key", { length: 500 }).notNull().unique(),
  data: jsonb("data").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTravelpayoutsCacheSchema = createInsertSchema(travelpayoutsCache).omit({ id: true, createdAt: true });
export type InsertTravelpayoutsCache = z.infer<typeof insertTravelpayoutsCacheSchema>;
export type TravelpayoutsCache = typeof travelpayoutsCache.$inferSelect;

export const sharedTripViews = pgTable("shared_trip_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  sharedTripId: uuid("shared_trip_id"),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  viewerIp: text("viewer_ip"),
  viewerCountry: text("viewer_country"),
  viewedAt: timestamp("viewed_at").defaultNow(),
});

export const reminderEmails = pgTable("reminder_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  savedTripId: uuid("saved_trip_id").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  reminderType: text("reminder_type").notNull(),
  status: text("status").notNull().default("sent"),
});

export const leadRoutingLogs = pgTable("lead_routing_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id"),
  userId: varchar("user_id", { length: 255 }),
  destination: varchar("destination", { length: 255 }),
  topic: varchar("topic", { length: 255 }),
  assignedExpertId: varchar("assigned_expert_id", { length: 255 }),
  topScore: integer("top_score"),
  scoresJson: jsonb("scores_json"),
  overriddenBy: varchar("overridden_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tripIdIdx: index("lead_routing_logs_trip_id_idx").on(table.tripId),
}));

export const bookingFeeConfigs = pgTable("booking_fee_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: varchar("category", { length: 50 }).notNull().unique(),
  platformFeePercent: decimal("platform_fee_percent", { precision: 5, scale: 2 }).default("12.00"),
  expertSharePercent: decimal("expert_share_percent", { precision: 5, scale: 2 }).default("75.00"),
  aiKeeps100: boolean("ai_keeps_100").default(true),
  minFee: decimal("min_fee", { precision: 10, scale: 2 }),
  maxFee: decimal("max_fee", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").default(true),
  // Insurance tier (FEE-2 Phase 2)
  insuranceEnabled: boolean("insurance_enabled").default(false),
  insuranceRatePercent: decimal("insurance_rate_percent", { precision: 5, scale: 2 }).default("0.00"),
  insuranceAppliesTo: jsonb("insurance_applies_to").default([]),
  updatedBy: varchar("updated_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type BookingFeeConfig = typeof bookingFeeConfigs.$inferSelect;
export const insertBookingFeeConfigSchema = createInsertSchema(bookingFeeConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBookingFeeConfig = z.infer<typeof insertBookingFeeConfigSchema>;

// ─── Master Integration Brief — Phase 1 (taxonomy + fee_bands) ───────────────
// fee_bands: single source of truth for rates. Replaces booking_fee_configs.
// Percent bands store decimals (0.25 = 25 %). Flat bands store USD (49.99 = $49.99). // fee-literal-ok: schema comment describing format, fees resolve from config
export const feeBands = pgTable("fee_bands", {
  id: uuid("id").primaryKey().defaultRandom(),
  bandKey: varchar("band_key", { length: 100 }).notNull().unique(),
  rateType: varchar("rate_type", { length: 10 }).notNull(), // 'percent' | 'flat'
  defaultRate: decimal("default_rate", { precision: 10, scale: 4 }).notNull(),
  minRate: decimal("min_rate", { precision: 10, scale: 4 }),
  maxRate: decimal("max_rate", { precision: 10, scale: 4 }),
  // Per-booking DOLLAR ceiling on the resolved amount (NULL = uncapped). Distinct from maxRate,
  // which bounds the RATE. D1 (fee-ledger lane, migration 178): the traveler service fee is
  // "0.07, capped at $25.00 per booking (cap enforced at resolution ... not in code)", so the cap
  // is band data, not a constant. Declared here because migration 178 creates it and the resolver
  // depends on it — an undeclared column is dropped by the Autoscale deploy-push (CLAUDE.md).
  maxAmount: decimal("max_amount", { precision: 10, scale: 2 }),
  displayName: text("display_name"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  updatedBy: varchar("updated_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type FeeBand = typeof feeBands.$inferSelect;
export const insertFeeBandSchema = createInsertSchema(feeBands).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFeeBand = z.infer<typeof insertFeeBandSchema>;

// platform_settings: key/value rows for cross-cutting flags.
// First user: active_provider_commission_policy = 'beta_flat' | 'tiered'.
export const platformSettingsTable = pgTable("platform_settings", {
  settingKey: varchar("setting_key", { length: 100 }).primaryKey(),
  settingValue: text("setting_value").notNull(),
  description: text("description"),
  updatedBy: varchar("updated_by", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type PlatformSetting = typeof platformSettingsTable.$inferSelect;
export const insertPlatformSettingSchema = createInsertSchema(platformSettingsTable).omit({ updatedAt: true });
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;

// template_category_matrix per SEED_DATA §3.
// (templateKey, categoryKey) composite PK; strength = 'REQ' | 'REC' | 'OPT'.
export const templateCategoryMatrix = pgTable("template_category_matrix", {
  templateKey: varchar("template_key", { length: 50 }).notNull(),
  categoryKey: varchar("category_key", { length: 100 }).notNull(),
  strength: varchar("strength", { length: 3 }).notNull(), // 'REQ' | 'REC' | 'OPT'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  pk: primaryKey({ name: "template_category_matrix_pk", columns: [table.templateKey, table.categoryKey] }),
}));
export type TemplateCategoryMatrixRow = typeof templateCategoryMatrix.$inferSelect;
export const insertTemplateCategoryMatrixSchema = createInsertSchema(templateCategoryMatrix).omit({ createdAt: true });
export type InsertTemplateCategoryMatrixRow = z.infer<typeof insertTemplateCategoryMatrixSchema>;

// ─── Master Integration Brief — Phase 2 (offering types catalogs) ────────────
// Three "expert offering" concepts coexist in this codebase. Their roles:
//   expertOfferingTypes      = THE TYPE CATALOG (read-only vocabulary, this Phase 2 addition).
//                              Feeds /earn, ask-an-expert picker, expert profiles.
//   expertSelectedServices   = THE EXPERT'S CHOSEN INSTANCES (their selected templates).
//   expertServiceOfferings   = LEGACY template catalog (kept around for back-compat,
//                              not a write target per CLAUDE.md / migration 013).
// Forward direction (NOT Phase 2 scope): eventually expertSelectedServices should
// reference expertOfferingTypes so this catalog becomes the selection vocabulary.
//
// serviceOfferingTypes is the provider-side equivalent — the read-only catalog
// of named offerings (Airport Driver, Tea Ceremony Host, …) keyed to
// service_categories.category_key. Does NOT write bookings (canonical = provider_services).

export const serviceOfferingTypes = pgTable("service_offering_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  offeringTypeKey: varchar("offering_type_key", { length: 100 }).notNull().unique(),
  // Soft reference to service_categories.category_key (enforced by Phase 2 completeness gate).
  categoryKey: varchar("category_key", { length: 100 }).notNull(),
  displayName: text("display_name").notNull(),
  tagline: text("tagline"),
  isSurprising: boolean("is_surprising").notNull().default(false),
  // Array of market slugs (e.g. ['kyoto', 'edinburgh']). NULL = universal.
  marketScoped: text("market_scoped").array(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type ServiceOfferingType = typeof serviceOfferingTypes.$inferSelect;
export const insertServiceOfferingTypeSchema = createInsertSchema(serviceOfferingTypes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceOfferingType = z.infer<typeof insertServiceOfferingTypeSchema>;

export const expertOfferingTypes = pgTable("expert_offering_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  offeringTypeKey: varchar("offering_type_key", { length: 100 }).notNull().unique(),
  // Enum: advisory | planning | coordination | live_support | specialized (CHECK at DB level).
  serviceTier: varchar("service_tier", { length: 20 }).notNull(),
  displayName: text("display_name").notNull(),
  tagline: text("tagline"),
  // Array: chat | written | video | live_text | done_for_you (CHECK at DB level via gate).
  deliveryFormats: text("delivery_formats").array().notNull().default([]),
  isSurprising: boolean("is_surprising").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type ExpertOfferingType = typeof expertOfferingTypes.$inferSelect;
export const insertExpertOfferingTypeSchema = createInsertSchema(expertOfferingTypes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpertOfferingType = z.infer<typeof insertExpertOfferingTypeSchema>;

// ─── Master Integration Brief — Phase 5 (Upsell engine) ──────────────────────
// upsell_slot_config: per-surface admin-tunable knobs. The dominance contract
// (relevance can never be overridden by revenue across a band) is enforced
// in upsell-engine.service.ts via min(revenueWeight, revenueCap) ≤ bandWidth.
// upsell_impressions: attribution log used to tune weights empirically.
export const upsellSlotConfig = pgTable("upsell_slot_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  surface: varchar("surface", { length: 50 }).notNull().unique(),
  maxItems: integer("max_items").notNull().default(3),
  revenueWeight: decimal("revenue_weight", { precision: 5, scale: 4 }).notNull().default("0.15"),
  revenueCap: decimal("revenue_cap", { precision: 5, scale: 4 }).notNull().default("0.15"),
  frequencyCapHours: integer("frequency_cap_hours").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  updatedBy: varchar("updated_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type UpsellSlotConfig = typeof upsellSlotConfig.$inferSelect;
export const insertUpsellSlotConfigSchema = createInsertSchema(upsellSlotConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUpsellSlotConfig = z.infer<typeof insertUpsellSlotConfigSchema>;

export const upsellImpressions = pgTable("upsell_impressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: varchar("trip_id", { length: 255 }),
  guestSessionId: varchar("guest_session_id", { length: 255 }),
  userId: varchar("user_id", { length: 255 }),
  surface: varchar("surface", { length: 50 }).notNull(),
  offeringId: varchar("offering_id", { length: 255 }).notNull(),
  categoryKey: varchar("category_key", { length: 100 }),
  sourceType: varchar("source_type", { length: 30 }),
  relevanceScore: decimal("relevance_score", { precision: 6, scale: 4 }),
  revenueScore: decimal("revenue_score", { precision: 6, scale: 4 }),
  finalScore: decimal("final_score", { precision: 6, scale: 4 }),
  rankPosition: integer("rank_position"),
  shownAt: timestamp("shown_at").notNull().defaultNow(),
  clicked: boolean("clicked").notNull().default(false),
  clickedAt: timestamp("clicked_at"),
  added: boolean("added").notNull().default(false),
  addedAt: timestamp("added_at"),
  booked: boolean("booked").notNull().default(false),
  bookedAt: timestamp("booked_at"),
});
export type UpsellImpression = typeof upsellImpressions.$inferSelect;
export const insertUpsellImpressionSchema = createInsertSchema(upsellImpressions).omit({ id: true, shownAt: true });
export type InsertUpsellImpression = z.infer<typeof insertUpsellImpressionSchema>;

// Phase 5.4 (step 6) — expert endorsements. Two scopes:
//   scope='trip'         → expert curates for a specific trip
//   scope='neighborhood' → lead endorses for a neighborhood (compounds across trips)
// XOR enforced at the DB via CHECK constraint (migration 050). Endorsements
// feed the relevance term only — never revenue — so the lead's pick can't
// be bought. See upsell-engine.service.ts.computeRelevance and the
// "endorsement raises relevance, not revenue" gate test.
export const upsellExpertEndorsements = pgTable("upsell_expert_endorsements", {
  id: uuid("id").primaryKey().defaultRandom(),
  expertId: varchar("expert_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  scope: varchar("scope", { length: 20 }).notNull(),    // 'trip' | 'neighborhood'
  tripId: varchar("trip_id", { length: 255 }),
  neighborhoodId: varchar("neighborhood_id"),
  offeringId: varchar("offering_id", { length: 255 }).notNull(),
  categoryKey: varchar("category_key", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type UpsellExpertEndorsement = typeof upsellExpertEndorsements.$inferSelect;
export const insertUpsellExpertEndorsementSchema = createInsertSchema(upsellExpertEndorsements).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUpsellExpertEndorsement = z.infer<typeof insertUpsellExpertEndorsementSchema>;

// === Provider Settings ===
export const providerSettings = pgTable("provider_settings", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  instantBooking: boolean("instant_booking").default(false),
  autoResponse: boolean("auto_response").default(true),
  minimumLeadTimeDays: integer("minimum_lead_time_days").default(7),
  targetResponseTimeHours: integer("target_response_time_hours").default(2),
  payoutFrequency: varchar("payout_frequency", { length: 20 }).default("monthly"), // weekly | biweekly | monthly
  minimumPayoutAmount: decimal("minimum_payout_amount", { precision: 10, scale: 2 }).default("100"),
  notificationsJson: jsonb("notifications_json").default({
    newBookings: true,
    bookingUpdates: true,
    messages: true,
    reviews: true,
    payouts: true,
    marketing: false,
  }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProviderSettingsSchema = createInsertSchema(providerSettings).omit({ id: true, updatedAt: true });
export type ProviderSettings = typeof providerSettings.$inferSelect;
export type InsertProviderSettings = z.infer<typeof insertProviderSettingsSchema>;

// === EA Client Relationships (Delegation System) ===

export const eaClientRelationships = pgTable("ea_client_relationships", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eaUserId: varchar("ea_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientUserId: varchar("client_user_id").references(() => users.id, { onDelete: "set null" }),
  clientEmail: varchar("client_email", { length: 255 }),
  displayName: varchar("display_name", { length: 100 }),
  notes: text("notes"),
  billingName: varchar("billing_name", { length: 255 }),
  billingEmail: varchar("billing_email", { length: 255 }),
  billingAddress: text("billing_address"),
  paymentNotes: text("payment_notes"),
  preferredCurrency: varchar("preferred_currency", { length: 10 }).default("USD"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEaClientRelationshipSchema = createInsertSchema(eaClientRelationships).omit({ id: true, createdAt: true, updatedAt: true });
export type EaClientRelationship = typeof eaClientRelationships.$inferSelect;
export type InsertEaClientRelationship = z.infer<typeof insertEaClientRelationshipSchema>;

// === EA Executive Management ===

export const eaExecutives = pgTable("ea_executives", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eaUserId: varchar("ea_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 150 }).notNull(),
  title: varchar("title", { length: 150 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  status: varchar("status", { length: 20 }).default("active"),
  preferences: jsonb("preferences").default({}),
  family: jsonb("family").default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEaExecutiveSchema = createInsertSchema(eaExecutives).omit({ id: true, createdAt: true, updatedAt: true });
export type EaExecutive = typeof eaExecutives.$inferSelect;
export type InsertEaExecutive = z.infer<typeof insertEaExecutiveSchema>;

// === EA Event Coordination ===

export const eaEvents = pgTable("ea_events", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eaUserId: varchar("ea_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  executiveId: varchar("executive_id").references(() => eaExecutives.id, { onDelete: "set null" }),
  executiveName: varchar("executive_name", { length: 150 }),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).default("meeting"),
  date: timestamp("date"),
  venue: varchar("venue", { length: 255 }),
  guests: integer("guests").default(0),
  status: varchar("status", { length: 30 }).default("pending"),
  notes: text("notes"),
  giftNeeded: boolean("gift_needed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEaEventSchema = createInsertSchema(eaEvents).omit({ id: true, createdAt: true, updatedAt: true });
export type EaEvent = typeof eaEvents.$inferSelect;
export type InsertEaEvent = z.infer<typeof insertEaEventSchema>;

// === EA Travel Arrangements ===

export const eaTravelArrangements = pgTable("ea_travel_arrangements", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eaUserId: varchar("ea_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  executiveId: varchar("executive_id").references(() => eaExecutives.id, { onDelete: "set null" }),
  executiveName: varchar("executive_name", { length: 150 }),
  title: varchar("title", { length: 255 }).notNull(),
  destination: varchar("destination", { length: 255 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: varchar("status", { length: 30 }).default("planning"),
  segments: jsonb("segments").default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEaTravelArrangementSchema = createInsertSchema(eaTravelArrangements).omit({ id: true, createdAt: true, updatedAt: true });
export type EaTravelArrangement = typeof eaTravelArrangements.$inferSelect;
export type InsertEaTravelArrangement = z.infer<typeof insertEaTravelArrangementSchema>;

// === EA Gift Tracking ===

export const eaGifts = pgTable("ea_gifts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eaUserId: varchar("ea_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  executiveId: varchar("executive_id").references(() => eaExecutives.id, { onDelete: "set null" }),
  executiveName: varchar("executive_name", { length: 150 }),
  occasion: varchar("occasion", { length: 150 }).notNull(),
  occasionDate: date("occasion_date"),
  recipient: varchar("recipient", { length: 150 }),
  gift: varchar("gift", { length: 255 }),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 30 }).default("pending"),
  rating: integer("rating"),
  giftNeeded: boolean("gift_needed").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEaGiftSchema = createInsertSchema(eaGifts).omit({ id: true, createdAt: true });
export type EaGift = typeof eaGifts.$inferSelect;
export type InsertEaGift = z.infer<typeof insertEaGiftSchema>;

// === EA Saved Venues ===

export const eaSavedVenues = pgTable("ea_saved_venues", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eaUserId: varchar("ea_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).default("Restaurant"),
  location: varchar("location", { length: 255 }),
  rating: decimal("rating", { precision: 3, scale: 1 }),
  priceRange: varchar("price_range", { length: 10 }),
  notes: text("notes"),
  favorite: boolean("favorite").default(false),
  usedBy: text("used_by").array().default([]),
  lastUsed: date("last_used"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEaSavedVenueSchema = createInsertSchema(eaSavedVenues).omit({ id: true, createdAt: true });
export type EaSavedVenue = typeof eaSavedVenues.$inferSelect;
export type InsertEaSavedVenue = z.infer<typeof insertEaSavedVenueSchema>;

// === EA Communications Log ===

export const eaCommunications = pgTable("ea_communications", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eaUserId: varchar("ea_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  executiveId: varchar("executive_id").references(() => eaExecutives.id, { onDelete: "set null" }),
  executiveName: varchar("executive_name", { length: 150 }),
  type: varchar("type", { length: 20 }).default("email"),
  subject: varchar("subject", { length: 255 }).notNull(),
  recipient: varchar("recipient", { length: 255 }),
  status: varchar("status", { length: 30 }).default("sent"),
  body: text("body"),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEaCommunicationSchema = createInsertSchema(eaCommunications).omit({ id: true, createdAt: true });
export type EaCommunication = typeof eaCommunications.$inferSelect;
export type InsertEaCommunication = z.infer<typeof insertEaCommunicationSchema>;

// === EA AI Tasks ===

export const eaAiTasks = pgTable("ea_ai_tasks", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eaUserId: varchar("ea_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 100 }).notNull(),
  executiveName: varchar("executive_name", { length: 150 }),
  task: text("task").notNull(),
  status: varchar("status", { length: 20 }).default("pending"),
  confidence: integer("confidence").default(90),
  draft: text("draft"),
  options: jsonb("options").default([]),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEaAiTaskSchema = createInsertSchema(eaAiTasks).omit({ id: true, createdAt: true, updatedAt: true });
export type EaAiTask = typeof eaAiTasks.$inferSelect;
export type InsertEaAiTask = z.infer<typeof insertEaAiTaskSchema>;

// === Local Expert Knowledge Nuggets ===

export const knowledgeNuggetTypeEnum = ["tip", "warning", "recommendation", "cultural-note", "hidden-cost"] as const;
export const knowledgeSeasonEnum = ["year-round", "spring", "summer", "fall", "winter"] as const;

export const localKnowledgeNuggets = pgTable("local_knowledge_nuggets", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertUserId: varchar("expert_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nuggetType: varchar("nugget_type", { length: 30 }).notNull().default("tip"), // knowledgeNuggetTypeEnum
  city: varchar("city", { length: 150 }).notNull(),
  linkedPoi: varchar("linked_poi", { length: 255 }),
  linkedNeighbourhood: varchar("linked_neighbourhood", { length: 255 }),
  insight: text("insight").notNull(),
  targetAudience: text("target_audience"),
  notFor: text("not_for"),
  seasonality: jsonb("seasonality").default([]), // array of knowledgeSeasonEnum
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLocalKnowledgeNuggetSchema = createInsertSchema(localKnowledgeNuggets).omit({ id: true, createdAt: true, updatedAt: true });
export type LocalKnowledgeNugget = typeof localKnowledgeNuggets.$inferSelect;
export type InsertLocalKnowledgeNugget = z.infer<typeof insertLocalKnowledgeNuggetSchema>;

// ─── Content Placement Rules ──────────────────────────────────────────────────
// Explicit mapping: content item → cities → surfaces → pulse threshold.
// Created manually by admins or auto-generated by the TravelPulse indexer.

export const contentPlacementRules = pgTable("content_placement_rules", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  contentSource: varchar("content_source", { length: 30 }).notNull(), // 'affiliate_product' | 'content_registry'
  sourceId: varchar("source_id", { length: 255 }).notNull(),           // ID in source table
  contentLabel: varchar("content_label", { length: 500 }),             // Display name for UI
  cityName: varchar("city_name", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }),
  surfaces: jsonb("surfaces").default([]).$type<string[]>(),           // Array of SurfaceSlug
  minPulseScore: integer("min_pulse_score").default(0),                // City pulse score threshold
  isPinned: boolean("is_pinned").default(false),                       // Ignore pulse threshold
  isAutoTagged: boolean("is_auto_tagged").default(false),              // Created by auto-indexer
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContentPlacementRuleSchema = createInsertSchema(contentPlacementRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ContentPlacementRule = typeof contentPlacementRules.$inferSelect;
export type InsertContentPlacementRule = z.infer<typeof insertContentPlacementRuleSchema>;

// === Visa Requirements Cache ===

export const visaRequirementsCache = pgTable("visa_requirements_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  passportCountry: varchar("passport_country", { length: 100 }).notNull(),
  destinationCountry: varchar("destination_country", { length: 100 }).notNull(),
  visaRequired: boolean("visa_required").notNull(),
  visaTypes: jsonb("visa_types").default([]),
  requiredDocuments: jsonb("required_documents").default([]),
  processingTime: varchar("processing_time", { length: 200 }),
  feeRange: varchar("fee_range", { length: 200 }),
  disclaimer: text("disclaimer"),
  cachedAt: timestamp("cached_at").defaultNow().notNull(),
});

export const insertVisaRequirementsCacheSchema = createInsertSchema(visaRequirementsCache).omit({ id: true, cachedAt: true });
export type VisaRequirementsCache = typeof visaRequirementsCache.$inferSelect;
export type InsertVisaRequirementsCache = z.infer<typeof insertVisaRequirementsCacheSchema>;

export const insertCityNeighborhoodSchema = createInsertSchema(cityNeighborhoods).omit({ id: true, createdAt: true, updatedAt: true });
export type CityNeighborhood = typeof cityNeighborhoods.$inferSelect;
export type InsertCityNeighborhood = z.infer<typeof insertCityNeighborhoodSchema>;

// === Affiliate Booking Requests ===
// Partner/affiliate bookings routed through experts — users never leave the site.

export const affiliateBookingRequests = pgTable("affiliate_booking_requests", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 255 }).notNull().references(() => users.id),
  expertId: varchar("expert_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
  // Phase 2.1: nullable link to the canonical Trip. Set at expert-confirmation
  // (the create trigger is a no-trip discover surface), enabling the facilitated
  // booking to be logged onto the Trip/PlanCard. See migration 051.
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "set null" }),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  itemDescription: text("item_description"),
  partnerName: varchar("partner_name", { length: 100 }).notNull(),
  partnerCategory: varchar("partner_category", { length: 50 }),
  affiliateUrl: text("affiliate_url").notNull(),
  travelDate: date("travel_date"),
  travelers: integer("travelers").default(1),
  userNotes: text("user_notes"),
  expertNotes: text("expert_notes"),
  confirmationRef: varchar("confirmation_ref", { length: 255 }),
  price: decimal("price", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 30 }).default("pending"),
  // Migration 170 — AI booking copilot verification leg. Additive nullable jsonb snapshot written
  // by server/services/booking-verification.service.ts (Tavily-extract + LLM-extract, key-gated,
  // §13 never-fabricates). NEVER holds the affiliateUrl (§16 — enforced in the service layer).
  verification: jsonb("verification"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAffiliateBookingRequestSchema = createInsertSchema(affiliateBookingRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAffiliateBookingRequest = z.infer<typeof insertAffiliateBookingRequestSchema>;
export type AffiliateBookingRequest = typeof affiliateBookingRequests.$inferSelect;

// === Saved Items (Wishlist) ===
// Single-user wishlist: saves gems, hotels, activities without requiring an active trip.

export const savedItems = pgTable("saved_items", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contentType: varchar("content_type", { length: 50 }).notNull(), // gem | hotel | activity | service
  contentId: varchar("content_id", { length: 255 }).notNull(),
  contentName: varchar("content_name", { length: 255 }).notNull(),
  contentImage: text("content_image"),
  city: varchar("city", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueUserItem: unique("saved_items_user_content_unique").on(table.userId, table.contentType, table.contentId),
}));

export const insertSavedItemSchema = createInsertSchema(savedItems).omit({ id: true, createdAt: true });
export type SavedItem = typeof savedItems.$inferSelect;
export type InsertSavedItem = z.infer<typeof insertSavedItemSchema>;

// === Cross-Sell Conversion Tracking ===

export const crossSellEvents = pgTable("cross_sell_events", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventType: varchar("event_type", { length: 20 }).notNull(), // impression | click | conversion
  sourceContentType: varchar("source_content_type", { length: 50 }).notNull(), // hotel | activity | gem | service | etc.
  sourceContentId: varchar("source_content_id", { length: 255 }).notNull(),
  sourceContentName: varchar("source_content_name", { length: 255 }),
  targetServiceId: varchar("target_service_id", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }),
  neighborhood: varchar("neighborhood", { length: 100 }),
  userId: varchar("user_id", { length: 255 }), // nullable — anonymous events allowed
  sessionId: varchar("session_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCrossSellEventSchema = createInsertSchema(crossSellEvents).omit({ id: true, createdAt: true });
export type CrossSellEvent = typeof crossSellEvents.$inferSelect;
export type InsertCrossSellEvent = z.infer<typeof insertCrossSellEventSchema>;

// === DMO Content Layer (AI Scraping + Expert Workspace) ===
// See research/traveloure_dmo_implementation_map.md for architecture.
// All DMO content routes to Expert Workspace first. Nothing reaches Discover without expert review.

export const dmoSourceTypeEnum = ["api", "partner_portal", "scraped", "manual_curation", "unverified"] as const;
export const dmoSourceConfidenceEnum = ["official_api", "partner_pack", "scraped", "manual", "quarantined"] as const;
export const dmoContentTypeEnum = ["destination", "attraction", "venue", "event", "restaurant", "itinerary", "photo", "statistic", "transport", "other"] as const;
export const dmoContentStatusEnum = ["pending_ingest", "ingested", "pending_expert_review", "expert_enriched", "published", "rejected", "quarantined"] as const;
export const dmoLicenseTypeEnum = ["cc", "partner_rights_cleared", "restricted", "unknown", "public_domain"] as const;
export const scrapeJobStatusEnum = ["queued", "running", "completed", "failed", "cancelled"] as const;
export const gapSeverityEnum = ["low", "medium", "high", "critical"] as const;

export const dmoSources = pgTable("dmo_sources", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  sourceType: varchar("source_type", { length: 30 }).notNull().default("scraped"), // Enum: dmoSourceTypeEnum
  market: varchar("market", { length: 100 }).notNull(), // e.g., "thailand", "japan", "uk"
  marketRegion: varchar("market_region", { length: 100 }).notNull(), // "apac", "europe", "americas", "mea"
  apiEndpoint: text("api_endpoint"),
  apiDocsUrl: text("api_docs_url"),
  partnerPortalUrl: text("partner_portal_url"),
  scrapeConfig: jsonb("scrape_config").default({}), // { rate_limit, paths, selectors, respect_robots_txt }
  confidence: varchar("confidence", { length: 30 }).notNull().default("scraped"), // Enum: dmoSourceConfidenceEnum
  attributionRequired: boolean("attribution_required").default(false),
  attributionText: text("attribution_text"),
  isActive: boolean("is_active").default(true),
  lastIngestedAt: timestamp("last_ingested_at"),
  totalRecords: integer("total_records").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueDomainMarket: unique("dmo_sources_domain_market_unique").on(table.domain, table.market),
}));

export const dmoRawContent = pgTable("dmo_raw_content", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sourceId: varchar("source_id").notNull().references(() => dmoSources.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 255 }), // ID from the source API/system
  contentType: varchar("content_type", { length: 30 }).notNull().default("attraction"), // Enum: dmoContentTypeEnum
  status: varchar("status", { length: 30 }).notNull().default("pending_expert_review"), // Enum: dmoContentStatusEnum
  
  // Identity & Location
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }),
  description: text("description"),
  shortDescription: text("short_description"),
  country: varchar("country", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  neighborhood: varchar("neighborhood", { length: 100 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  address: text("address"),
  
  // Content Payload
  rawData: jsonb("raw_data").notNull().default({}), // Original source payload, unmodified
  extractedData: jsonb("extracted_data").default({}), // AI-extracted structured fields (venue_name, capacity, pricing, etc.)
  normalizedData: jsonb("normalized_data").default({}), // Post-normalization (Traveloure schema)
  
  // Media
  images: jsonb("images").default([]), // Array of { url, alt, license, attribution, source_page }
  primaryImageUrl: text("primary_image_url"),
  
  // Metadata
  tags: jsonb("tags").default([]), // Array of strings: ["wedding_venue", "temple", "beach", "unesco"]
  categories: jsonb("categories").default([]), // Taxonomy from source
  eventTypes: jsonb("event_types").default([]), // ["wedding", "birthday", "corporate", "proposal"]
  
  // Source Provenance
  sourceUrl: text("source_url").notNull(),
  sourcePageTitle: text("source_page_title"),
  scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
  scrapedBy: varchar("scraped_by", { length: 255 }), // Job ID or user ID
  license: varchar("license", { length: 30 }).default("unknown"), // Enum: dmoLicenseTypeEnum
  
  // Confidence & Quality
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }).default("0.5"), // 0.0–1.0
  dataQualityFlags: jsonb("data_quality_flags").default([]), // ["missing_pricing", "outdated_hours", "partial_translation"]
  
  // Expert Review Fields
  expertReviewedAt: timestamp("expert_reviewed_at"),
  expertReviewedBy: varchar("expert_reviewed_by").references(() => users.id, { onDelete: "set null" }),
  expertNotes: text("expert_notes"),
  expertModifiedData: jsonb("expert_modified_data").default({}), // Expert overrides
  
  // Visibility Flags (CRITICAL: Expert Workspace gate)
  // Born FALSE — scraped/DMO content is admin-intake-gated: an admin must approve raw content into the
  // expert library before an expert can see it (ratified "B"). Admin approve flips this true; existing
  // pre-gate rows are grandfathered true (no backfill), the F2 pattern.
  expertWorkspaceVisible: boolean("expert_workspace_visible").default(false).notNull(),
  discoverPageVisible: boolean("discover_page_visible").default(false).notNull(),
  publishedAt: timestamp("published_at"),
  publishedBy: varchar("published_by").references(() => users.id, { onDelete: "set null" }),
  
  // AI Enrichment
  embeddingVector: jsonb("embedding_vector"), // For semantic search / matching
  aiSummary: text("ai_summary"), // LLM-generated summary for expert preview
  aiSuggestedTags: jsonb("ai_suggested_tags").default([]),
  
  // Search & Indexing
  searchVector: text("search_vector"), // tsvector or simple concatenated text for search
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  sourceUrlUnique: unique("dmo_raw_content_source_url_unique").on(table.sourceUrl, table.sourceId),
  marketIdx: uniqueIndex("dmo_raw_content_market_idx").on(table.country, table.city, table.contentType),
  statusIdx: uniqueIndex("dmo_raw_content_status_idx").on(table.status, table.expertWorkspaceVisible),
}));

// Places extracted from a DMO guide, promoted from the extracted_data.places JSON blob to
// first-class child rows (CLAUDE.md §20a, migration 185; decision-maker ratified Aug 9 2026).
// Source of truth for the Research Reader's harvest panel: re-extract replaces by position but
// preserves expert-added ticketing_url by normalized_name match. The parent's extracted_data
// blob is backfilled-from and thereafter historical (never read). Declared here per the
// publish-trap rule — an undeclared table would be dropped by the deploy push.
export const dmoExtractedPlaces = pgTable("dmo_extracted_places", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dmoContentId: varchar("dmo_content_id").notNull().references(() => dmoRawContent.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), // 1-based article order (the reader's numbered dots)
  name: varchar("name", { length: 255 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 255 }).notNull(), // lower(trim(name)) — merge/dedupe key
  // Best-effort geocode at extraction time; NULL = honestly coordinate-less (§13 — no city-center fallback).
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  inLibraryId: varchar("in_library_id"), // soft ref → dmo_raw_content.id (same-city library match; no FK — advisory only)
  ticketingUrl: text("ticketing_url"), // expert-added https:// reference link — survives re-extract
  // Open-data enrichment envelope (migration 188): {officialUrl, openingHours, heritage,
  // wikidataId, osmId, source, fetchedAt} from explicitly-licensed sources (Wikidata CC0,
  // OSM ODbL). Facts only, never prose (§13); NULL = not enriched. Never overwrites the
  // expert-curated ticketingUrl above.
  enrichment: jsonb("enrichment"),
  source: varchar("source", { length: 30 }).notNull().default("stored_text"), // 'stored_text' | 'live_fetch' (app-enforced, no CHECK)
  extractedAt: timestamp("extracted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  contentPositionUnique: unique("dmo_extracted_places_content_position_unique").on(table.dmoContentId, table.position),
  contentIdx: index("dmo_extracted_places_content_idx").on(table.dmoContentId),
  normalizedNameIdx: index("dmo_extracted_places_normalized_name_idx").on(table.normalizedName),
}));

// Sweep/ingest run ledger — the admin "Content Ops" page (CLAUDE.md §17 lesson applied by
// analogy, decision-maker ratified Aug 10 2026; migration 191). Every YouTube ingestion call
// (server/services/youtube-ingestion.service.ts) and every warmup-sweep boot pass
// (server/jobs/dmoExtractionWarmup.ts) writes ONE append-only row here, success or not — silence
// must be distinguishable from "never ran" (§17 rule 2, by analogy). `counts` carries the full
// stats object each caller already produces verbatim rather than forcing a shared column set
// neither caller naturally has (youtube_ingest: scanned/upserted/skippedShape/skippedShort/
// skippedDuplicate/error; warmup_sweep: scanned/extracted/emptied/failed/skippedCap/
// stoppedNoApiKey/durationMs). No UPDATE/DELETE path. Additive, idempotent, no CHECK. Declared
// here per the publish-trap rule.
export const dmoExtractionRuns = pgTable("dmo_extraction_runs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  kind: varchar("kind", { length: 40 }).notNull(), // 'youtube_ingest' | 'warmup_sweep' (app-enforced, no CHECK — §13 growth room)
  counts: jsonb("counts").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  kindCreatedIdx: index("dmo_extraction_runs_kind_created_idx").on(table.kind, table.createdAt),
}));

export const expertDmoCollections = pgTable("expert_dmo_collections", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "My Phuket Wedding Venues"
  description: text("description"),
  market: varchar("market", { length: 100 }).notNull(),
  contentTypeFilter: varchar("content_type_filter", { length: 30 }), // Optional: only attractions, only venues, etc.
  tagFilter: jsonb("tag_filter").default([]),
  isPublic: boolean("is_public").default(false), // Can other experts see this collection?
  isDefault: boolean("is_default").default(false), // System-created default collections per market
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const expertDmoCollectionItems = pgTable("expert_dmo_collection_items", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  collectionId: varchar("collection_id").notNull().references(() => expertDmoCollections.id, { onDelete: "cascade" }),
  rawContentId: varchar("raw_content_id").notNull().references(() => dmoRawContent.id, { onDelete: "cascade" }),
  expertNotes: text("expert_notes"),
  expertRating: integer("expert_rating"), // 1-5, expert's private rating
  customTags: jsonb("custom_tags").default([]),
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => ({
  uniqueCollectionItem: unique("expert_dmo_collection_items_unique").on(table.collectionId, table.rawContentId),
}));

export const expertDmoEdits = pgTable("expert_dmo_edits", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  rawContentId: varchar("raw_content_id").notNull().references(() => dmoRawContent.id, { onDelete: "cascade" }),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Editable fields
  editedName: varchar("edited_name", { length: 255 }),
  editedDescription: text("edited_description"),
  editedShortDescription: text("edited_short_description"),
  editedImages: jsonb("edited_images").default([]), // Expert-curated image set
  addedImages: jsonb("added_images").default([]), // Expert-uploaded photos
  editedTags: jsonb("edited_tags").default([]),
  editedCategories: jsonb("edited_categories").default([]),
  editedEventTypes: jsonb("edited_event_types").default([]),
  editedPricing: jsonb("edited_pricing").default({}), // { currency, range_min, range_max, basis, notes }
  editedCapacity: jsonb("edited_capacity").default({}), // { min, max, unit }
  editedHours: jsonb("edited_hours").default({}), // { monday: "9-17", ... }
  editedAddress: text("edited_address"),
  editedLatitude: decimal("edited_latitude", { precision: 10, scale: 7 }),
  editedLongitude: decimal("edited_longitude", { precision: 10, scale: 7 }),
  
  // Vendor links (expert connects DMO content to bookable vendors)
  vendorLinks: jsonb("vendor_links").default([]), // [{ vendor_id, service_type, notes }]
  
  // Status
  editStatus: varchar("edit_status", { length: 20 }).default("draft").notNull(), // draft | submitted | approved | rejected
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contentGapAlerts = pgTable("content_gap_alerts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  market: varchar("market", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }),
  contentType: varchar("content_type", { length: 30 }).notNull(), // Enum: dmoContentTypeEnum
  severity: varchar("severity", { length: 20 }).notNull().default("medium"), // Enum: gapSeverityEnum
  
  // Gap Description
  gapDescription: text("gap_description").notNull(), // e.g., "Only 3 wedding venues in Cartagena vs. 50 in Phuket"
  missingCount: integer("missing_count"), // Estimated number of missing items
  existingCount: integer("existing_count"), // What we have
  benchmarkMarket: varchar("benchmark_market", { length: 100 }), // Compare against this market
  
  // AI-Generated Suggestion
  aiSuggestedSources: jsonb("ai_suggested_sources").default([]), // [{ source_name, url, scrape_strategy }]
  aiGeneratedDraft: jsonb("ai_generated_draft").default({}), // AI-generated content to seed expert curation
  
  // Resolution
  assignedExpertId: varchar("assigned_expert_id").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  
  // Metadata
  isAutoGenerated: boolean("is_auto_generated").default(true),
  generatedBy: varchar("generated_by", { length: 255 }), // Job ID or AI model name
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dmoScrapeJobs = pgTable("dmo_scrape_jobs", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sourceId: varchar("source_id").references(() => dmoSources.id, { onDelete: "set null" }),
  jobType: varchar("job_type", { length: 30 }).notNull().default("search_extract"), // search_extract | crawl | batch_scrape | manual_import
  market: varchar("market", { length: 100 }).notNull(),
  
  // Query / Target
  query: text("query"), // For search-based jobs
  targetUrls: jsonb("target_urls").default([]), // For batch scrape
  startUrl: text("start_url"), // For crawl jobs
  includePaths: jsonb("include_paths").default([]), // ["/wedding", "/weddings", "/bodas"]
  excludePaths: jsonb("exclude_paths").default([]),
  maxDepth: integer("max_depth").default(2),
  
  // Status
  status: varchar("status", { length: 20 }).notNull().default("queued"), // Enum: scrapeJobStatusEnum
  totalUrls: integer("total_urls").default(0),
  processedUrls: integer("processed_urls").default(0),
  failedUrls: integer("failed_urls").default(0),
  recordsCreated: integer("records_created").default(0),
  recordsUpdated: integer("records_updated").default(0),
  
  // Error Tracking
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details").default({}),
  
  // Tool Used
  toolUsed: varchar("tool_used", { length: 30 }).default("firecrawl"), // firecrawl | tavily | brave | smartvel_api | atdw_api | manual
  toolJobId: varchar("tool_job_id", { length: 255 }), // External job ID from Firecrawl/Tavily/etc.
  
  // Scheduling
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Cost Tracking
  creditsConsumed: integer("credits_consumed").default(0),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 4 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Optimizer gap-fill ledger (migration 182, OPTIMIZER_SOURCING_BUILD_SPEC WP-B).
 *
 * `content_gap_alerts` above answers "how much DMO content do we hold per editorial type vs. a
 * target" (an UPDATE-in-place gauge, Kyoto-only, reconciled by `analyzeKyotoContentGaps`). This
 * table answers a different, narrower question the sourcing rule needs: "every time the OPTIMIZER
 * could not place a platform (`provider_services`) match and fell back to external content, what
 * city/category/kind did it need, and what filled it (or didn't)?" — real-time optimizer demand,
 * not a periodic editorial sweep, and not scoped to one market. The existing shape cannot carry
 * this: no tripId, no itemKind (service|transport|content), no source discriminator matching
 * tavily/google/grok/unfilled, and its per-(market,city,contentType) row is reconciled/UPDATEd in
 * place rather than appended.
 *
 * APPEND-ONLY (§17 posture): one row per external-fill event, no UPDATE/DELETE path in app code.
 * "Dedupe by counts, not UPDATE-in-place of facts" is implemented at READ time — the admin summary
 * GROUPs BY (city, category) and COUNTs rows in a window — rather than by mutating a bucket row, so
 * a persistent gap reads as rising demand volume without any fact ever being rewritten.
 *
 * NO DB CHECK on item_kind/source (migration-159/171/177 posture): canonical vocabulary lives in
 * TS (`OPTIMIZER_GAP_ITEM_KINDS` / `OPTIMIZER_GAP_SOURCES` below) — a brand-new all-default-free
 * table has no legacy rows, so a CHECK here would buy nothing and only add a publish-push remap
 * trap risk if the vocabulary ever grows. `tripId` is a SOFT reference, deliberately no FK: a
 * demand-ledger row is a fact about what the optimizer needed, and must outlive the trip it was
 * observed on (the `reconciliationExceptions.bookingId` precedent, one section up). Table + both
 * indexes are declared here in shared/schema.ts in the same commit as the migration (CLAUDE.md
 * deploy-push durability rule) and its insert schema is `.pick()`-based (§19) so a future column
 * added to this table is unreachable from a client body until deliberately named.
 */
export const optimizerGapFills = pgTable(
  "optimizer_gap_fills",
  {
    id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    /** dataType/category — e.g. "activity", "dining", "lodging", "transport", "photography". */
    category: varchar("category", { length: 100 }).notNull(),
    /** service | transport | content — app-enforced, see OPTIMIZER_GAP_ITEM_KINDS. */
    itemKind: varchar("item_kind", { length: 20 }).notNull(),
    /** tavily | google | grok | unfilled — app-enforced, see OPTIMIZER_GAP_SOURCES. */
    source: varchar("source", { length: 20 }).notNull(),
    /** Soft reference, NO FK (see rationale above). */
    tripId: varchar("trip_id"),
    details: jsonb("details").notNull().default({}),
  },
  (table) => ({
    cityCategoryIdx: index("optimizer_gap_fills_city_category_idx").on(table.city, table.category),
    occurredAtIdx: index("optimizer_gap_fills_occurred_at_idx").on(table.occurredAt),
  }),
);

/** Canonical item-kind vocabulary — app-enforced, no DB CHECK (see table comment). */
export const OPTIMIZER_GAP_ITEM_KINDS = ["service", "transport", "content"] as const;
export type OptimizerGapItemKind = (typeof OPTIMIZER_GAP_ITEM_KINDS)[number];

/** Canonical fill-source vocabulary — app-enforced, no DB CHECK (see table comment). 'unfilled'
 *  is the honest default when no tracked pipeline (Tavily/Google/Grok) actually produced the item
 *  — e.g. the optimizer's own LLM knowledge filled it, or nothing did. */
export const OPTIMIZER_GAP_SOURCES = ["tavily", "google", "grok", "unfilled"] as const;
export type OptimizerGapSource = (typeof OPTIMIZER_GAP_SOURCES)[number];

// === Zod Schemas & Types for DMO Tables ===

export const insertDmoSourceSchema = createInsertSchema(dmoSources).omit({ id: true, createdAt: true, updatedAt: true, lastIngestedAt: true, totalRecords: true });
export type DmoSource = typeof dmoSources.$inferSelect;
export type InsertDmoSource = z.infer<typeof insertDmoSourceSchema>;

export const insertDmoRawContentSchema = createInsertSchema(dmoRawContent).omit({ id: true, createdAt: true, updatedAt: true, scrapedAt: true, expertReviewedAt: true, publishedAt: true, embeddingVector: true, aiSummary: true, aiSuggestedTags: true });
export type DmoRawContent = typeof dmoRawContent.$inferSelect;
export type InsertDmoRawContent = z.infer<typeof insertDmoRawContentSchema>;

export const insertExpertDmoCollectionSchema = createInsertSchema(expertDmoCollections).omit({ id: true, createdAt: true, updatedAt: true });
export type ExpertDmoCollection = typeof expertDmoCollections.$inferSelect;
export type InsertExpertDmoCollection = z.infer<typeof insertExpertDmoCollectionSchema>;

export const insertExpertDmoCollectionItemSchema = createInsertSchema(expertDmoCollectionItems).omit({ id: true, addedAt: true });
export type ExpertDmoCollectionItem = typeof expertDmoCollectionItems.$inferSelect;
export type InsertExpertDmoCollectionItem = z.infer<typeof insertExpertDmoCollectionItemSchema>;

export const insertExpertDmoEditSchema = createInsertSchema(expertDmoEdits).omit({ id: true, createdAt: true, updatedAt: true, reviewedAt: true });
export type ExpertDmoEdit = typeof expertDmoEdits.$inferSelect;
export type InsertExpertDmoEdit = z.infer<typeof insertExpertDmoEditSchema>;

export const insertContentGapAlertSchema = createInsertSchema(contentGapAlerts).omit({ id: true, createdAt: true, updatedAt: true, resolvedAt: true });
export type ContentGapAlert = typeof contentGapAlerts.$inferSelect;
export type InsertContentGapAlert = z.infer<typeof insertContentGapAlertSchema>;

export const insertDmoScrapeJobSchema = createInsertSchema(dmoScrapeJobs).omit({ id: true, createdAt: true, updatedAt: true, startedAt: true, completedAt: true, scheduledAt: true });
export type DmoScrapeJob = typeof dmoScrapeJobs.$inferSelect;
export type InsertDmoScrapeJob = z.infer<typeof insertDmoScrapeJobSchema>;

// ALLOWLIST (§19/#PS18 target shape, ratchet-exempt): the ledger writer only ever needs these six
// fields — id/occurredAt are server-derived — so a future column added to optimizer_gap_fills is
// unreachable until deliberately picked here.
export const insertOptimizerGapFillSchema = createInsertSchema(optimizerGapFills).pick({
  city: true,
  category: true,
  itemKind: true,
  source: true,
  tripId: true,
  details: true,
});
export type OptimizerGapFill = typeof optimizerGapFills.$inferSelect;
export type InsertOptimizerGapFill = z.infer<typeof insertOptimizerGapFillSchema>;

// === DMO Relations ===

export const dmoSourcesRelations = relations(dmoSources, ({ many }) => ({
  rawContent: many(dmoRawContent),
  scrapeJobs: many(dmoScrapeJobs),
}));

export const dmoRawContentRelations = relations(dmoRawContent, ({ one, many }) => ({
  source: one(dmoSources, { fields: [dmoRawContent.sourceId], references: [dmoSources.id] }),
  expertReviewer: one(users, { fields: [dmoRawContent.expertReviewedBy], references: [users.id] }),
  publisher: one(users, { fields: [dmoRawContent.publishedBy], references: [users.id] }),
  collectionItems: many(expertDmoCollectionItems),
  expertEdits: many(expertDmoEdits),
}));

export const expertDmoCollectionsRelations = relations(expertDmoCollections, ({ one, many }) => ({
  expert: one(users, { fields: [expertDmoCollections.expertId], references: [users.id] }),
  items: many(expertDmoCollectionItems),
}));

export const expertDmoCollectionItemsRelations = relations(expertDmoCollectionItems, ({ one }) => ({
  collection: one(expertDmoCollections, { fields: [expertDmoCollectionItems.collectionId], references: [expertDmoCollections.id] }),
  rawContent: one(dmoRawContent, { fields: [expertDmoCollectionItems.rawContentId], references: [dmoRawContent.id] }),
}));

export const expertDmoEditsRelations = relations(expertDmoEdits, ({ one }) => ({
  rawContent: one(dmoRawContent, { fields: [expertDmoEdits.rawContentId], references: [dmoRawContent.id] }),
  expert: one(users, { fields: [expertDmoEdits.expertId], references: [users.id] }),
  reviewer: one(users, { fields: [expertDmoEdits.reviewedBy], references: [users.id] }),
}));

export const contentGapAlertsRelations = relations(contentGapAlerts, ({ one }) => ({
  assignedExpert: one(users, { fields: [contentGapAlerts.assignedExpertId], references: [users.id] }),
}));

export const dmoScrapeJobsRelations = relations(dmoScrapeJobs, ({ one }) => ({
  source: one(dmoSources, { fields: [dmoScrapeJobs.sourceId], references: [dmoSources.id] }),
}));

// ─── Funnel Events (ADR-004) ────────────────────────────────────────────────
// Append-only audit log spanning the full traveler funnel T0→T7.
// Fire-and-forget — never await these writes on the request critical path.
// userId nullable for T0 events that fire before account creation.
export const funnelEvents = pgTable("funnel_events", {
  id:         uuid("id").primaryKey().defaultRandom(),
  sessionId:  varchar("session_id", { length: 128 }),
  userId:     varchar("user_id"),   // varchar to match users.id PK type; no FK — rows survive deletion
  tripId:     varchar("trip_id"),   // varchar to match trips.id PK type; no FK — rows survive deletion
  eventType:  varchar("event_type", { length: 64 }).notNull(),
  stage:      varchar("stage", { length: 4 }).notNull(),   // T0 – T7
  properties: jsonb("properties"),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertFunnelEventSchema = createInsertSchema(funnelEvents).omit({ id: true, createdAt: true });
export type InsertFunnelEvent = z.infer<typeof insertFunnelEventSchema>;
export type FunnelEvent = typeof funnelEvents.$inferSelect;

// === Admin Notifications ===
// Created whenever a lead cannot be routed (no approved experts or zero score).
// Gives admins a push-style signal to handle dead-end leads manually.
export const adminNotifications = pgTable("admin_notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  tripId: text("trip_id"),
  destination: text("destination"),
  reason: text("reason"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const insertAdminNotificationSchema = createInsertSchema(adminNotifications).omit({ id: true, createdAt: true });
export type InsertAdminNotification = z.infer<typeof insertAdminNotificationSchema>;
export type AdminNotification = typeof adminNotifications.$inferSelect;

// === Webhook Events ===
// Durable log of every Stripe webhook received.
// Used for deduplication (stripe_event_id UNIQUE), manual reconciliation,
// and the daily admin gap-check comparing local log vs Stripe's event API.
export const webhookEvents = pgTable("webhook_events", {
  id:            uuid("id").primaryKey().defaultRandom(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  eventType:     text("event_type").notNull(),
  processed:     boolean("processed").notNull().default(false),
  processedAt:   timestamp("processed_at"),
  rawPayload:    jsonb("raw_payload").notNull(),
  error:         text("error"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({ id: true, createdAt: true });
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

// === QA Run Snapshots ===
// Stores each nightly (or manual) QA run for diff reporting and dashboard badge.
export const qaRunSnapshots = pgTable("qa_run_snapshots", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ranAt:        timestamp("ran_at").notNull().defaultNow(),
  triggeredBy:  text("triggered_by").notNull().default("scheduled"),
  results:      jsonb("results").$type<Record<string, { pass: boolean; detail: string }>>().notNull().default({}),
  passCount:    integer("pass_count").notNull().default(0),
  failCount:    integer("fail_count").notNull().default(0),
  partialCount: integer("partial_count").notNull().default(0),
  totalCount:   integer("total_count").notNull().default(0),
});

export const insertQaRunSnapshotSchema = createInsertSchema(qaRunSnapshots).omit({ id: true });
export type InsertQaRunSnapshot = z.infer<typeof insertQaRunSnapshotSchema>;
export type QaRunSnapshot = typeof qaRunSnapshots.$inferSelect;

// === Ready-Made Trips (Trips by Locals) — migration 133, spec v3 ===
// The cloneable-trip product: a listing pointing at a REAL author-owned trip (trips.authorId set,
// trips.userId NULL) that clones into the buyer's editable PlanCard on purchase. Distinct from
// expert_templates (the view-only "Guides" lane). Born 'draft'; admin approval only (D1a).

export const readyMadeTrips = pgTable("ready_made_trips", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  authorId: varchar("author_id").notNull().references(() => users.id),
  sourceTripId: varchar("source_trip_id").notNull().references(() => trips.id),
  market: varchar("market", { length: 100 }).notNull(), // launch: Kyoto only (§12)
  title: varchar("title", { length: 200 }).notNull(),
  // Nullable by design: born-draft before any hero exists. Submit/approve enforce non-null
  // (Unsplash picker per D2 — photoUrl + attribution stored in heroImageMeta).
  heroImageUrl: text("hero_image_url"),
  heroImageMeta: jsonb("hero_image_meta"), // { unsplashId, photographer, profileUrl, downloadLocation }
  durationDays: integer("duration_days").notNull(),
  // "Type of Plan" — the headline of the store's quality structure (migration 134). NULL only in
  // draft; the submit gate requires it. Vocabulary: shared/ready-made-plan-types.ts (code-validated,
  // no DB CHECK, so the editorial list can grow without a schema migration).
  planType: varchar("plan_type", { length: 60 }),
  // Free-text theme label for planType='custom' only (migration 184, decision-maker approved Aug 9
  // 2026 — shared/ready-made-plan-types.ts's "custom" vocabulary entry). NULL for every non-custom
  // key; server validation (server/routes/ready-made.routes.ts) requires 3..80 trimmed chars
  // whenever planType==='custom' and clears/nulls this column on any save that picks a non-custom
  // key, so free text never leaks into the validated planType column and the closed taxonomy can't
  // sprawl (see the module header on shared/ready-made-plan-types.ts).
  planTypeCustom: varchar("plan_type_custom", { length: 80 }),
  bestSeason: varchar("best_season", { length: 60 }),
  pricingMode: varchar("pricing_mode", { length: 20 }).notNull().default("fixed"), // CHECK fixed|per_traveler
  priceCents: integer("price_cents"), // display/charge base; USD-only v1; resolved with fee band
  feeBandKey: varchar("fee_band_key", { length: 100 }).notNull().default("ready_made_trip"),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // CHECK draft|submitted|approved|rejected|withdrawn (migration 163)
  badge: varchar("badge", { length: 30 }),
  insideCounts: jsonb("inside_counts"), // snapshot derived ONLY at the approved transition
  buildReview: jsonb("build_review"),   // Phase 2.5 advisory verdict (score + findings), admin-queue visible
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  lastVerifiedAt: timestamp("last_verified_at"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Migration 133. Deploy-push rule (see `bookings`). No WHERE in the migration — one
  // ready-made listing per source trip, unconditionally.
  sourceTripIdx: uniqueIndex("idx_rmt_source_trip").on(table.sourceTripId),
}));

export const readyMadePurchases = pgTable("ready_made_purchases", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  readyMadeTripId: varchar("ready_made_trip_id").notNull().references(() => readyMadeTrips.id),
  pricePaidCents: integer("price_paid_cents").notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),
  // Idempotency anchor (§15): unique — a webhook/confirm retry can never double-clone.
  stripePaymentIntentId: varchar("stripe_payment_intent_id").notNull().unique(),
  attributionRef: varchar("attribution_ref", { length: 64 }), // share-link first-touch (map §4)
  cloneTripId: varchar("clone_trip_id").references(() => trips.id, { onDelete: "set null" }), // migration 135
  // Row is inserted only AFTER capture, so born-'paid' is correct (unlike the template pre-payment row).
  status: varchar("status", { length: 20 }).notNull().default("paid"), // CHECK paid|cloned|refunded|revoked
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
}, (table) => ({
  // Migration 133. Deploy-push rule (see `bookings`). Partial WHERE mirrored verbatim: a buyer
  // may hold only ONE live purchase of a listing, but refunded/revoked rows must be allowed to
  // accumulate — a full unique index would block re-purchase after a refund.
  buyerTripActiveIdx: uniqueIndex("idx_rmp_buyer_trip_active")
    .on(table.buyerId, table.readyMadeTripId)
    .where(sql`status IN ('paid','cloned')`),
}));

export const boards = pgTable("boards", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerId: varchar("owner_id").references(() => users.id, { onDelete: "cascade" }), // null = editorial (platform)
  boardType: varchar("board_type", { length: 20 }).notNull(), // CHECK wishlist|storefront|editorial (v1 writes storefront|editorial only; ♡ uses saved_items)
  title: varchar("title", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).unique(), // editorial boards route /collections/:slug
  market: varchar("market", { length: 100 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const boardItems = pgTable("board_items", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  boardId: varchar("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  readyMadeTripId: varchar("ready_made_trip_id").notNull().references(() => readyMadeTrips.id, { onDelete: "cascade" }),
  position: integer("position"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (table) => ({
  boardTripUnique: unique("board_items_board_trip_unique").on(table.boardId, table.readyMadeTripId),
}));

export const insertReadyMadeTripSchema = createInsertSchema(readyMadeTrips).omit({ id: true, createdAt: true, updatedAt: true });
export type ReadyMadeTrip = typeof readyMadeTrips.$inferSelect;
export type InsertReadyMadeTrip = z.infer<typeof insertReadyMadeTripSchema>;
export const insertReadyMadePurchaseSchema = createInsertSchema(readyMadePurchases).omit({ id: true, purchasedAt: true });
export type ReadyMadePurchase = typeof readyMadePurchases.$inferSelect;
export type InsertReadyMadePurchase = z.infer<typeof insertReadyMadePurchaseSchema>;
export type Board = typeof boards.$inferSelect;
export type BoardItem = typeof boardItems.$inferSelect;

// short_links — backoffice S3 short-link + click store (migration 139). NO CHECK on target_type —
// vocabulary ('storefront'|'service'|'template'|'ready_made') is app-enforced (short-links.routes.ts),
// same posture as users.handle (migration 136): a CHECK over an app-layer vocabulary is the
// publish-time push trap. target_id is nullable (storefront links carry no target_id — the owner's
// handle is resolved at redirect time, never baked into the row).
// `frame` (migration 193, D4 — docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md, decision-maker
// ratified Aug 10 2026): additive nullable varchar, same NO-CHECK posture as target_type — the
// closed allowlist (`shared/share-frames.ts` SHARE_FRAMES) is app-enforced at the create route.
// NULL = an untagged/generic link, the historical shape; every pre-193 row and every caller that
// omits frame keeps working exactly as before. Frame participates in the create-path dedupe
// identity (owner + targetType + targetId + frame) so each frame mints its OWN code.
export const shortLinks = pgTable("short_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 12 }).notNull().unique(),
  ownerUserId: varchar("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetType: varchar("target_type", { length: 30 }).notNull(),
  targetId: varchar("target_id"),
  frame: varchar("frame", { length: 20 }),
  clicks: integer("clicks").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  // D6 rails attribution (migration 198, ruling 61). NULL = never expires — every link shared
  // before this column existed behaves identically. Read by the rails MONEY decision only
  // (rails-attribution.service.ts): past-dated ⇒ the ref no longer selects the rails band lane.
  // The /r/:code redirect and the S4 analytics attribution deliberately ignore it — a click that
  // really happened stays a true analytics fact whatever the fee lane says (§13).
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_short_links_owner_user_id").on(table.ownerUserId),
]);

// §18 rule 3 ("a field with no consumer is still stripped") + ruling 66's money-timer precedent:
// `expiresAt` GATES a fee lane (an unexpired link selects the rails band, an expired one does not),
// so it is omitted here as well as being absent from the route's hand-written body schema. This
// schema is parsed off no request body today; that is exactly why it must not become the way in.
export const insertShortLinkSchema = createInsertSchema(shortLinks).omit({ id: true, clicks: true, createdAt: true, expiresAt: true });
export type ShortLink = typeof shortLinks.$inferSelect;
export type InsertShortLink = z.infer<typeof insertShortLinkSchema>;

// === Provider Back-Office Wave — migration 189 (decision-maker approved Aug 9 2026) ===
// Two new tables, neither wired to enforcement yet — the feature builds that read/write these
// beyond the create path land separately. Vacation mode itself lives on `users`
// (shared/models/auth.ts: vacationUntil/vacationMessage), not here.

// offering_type_requests — provider "I don't see my offering" requests. status is app-enforced
// (pending|approved|rejected), no DB CHECK (house posture). Consumed by the admin categories page.
export const offeringTypeRequests = pgTable("offering_type_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestedName: varchar("requested_name", { length: 120 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("offering_type_requests_status_idx").on(table.status),
]);

// ALLOWLIST (§19/#PS18 target shape, ratchet-exempt — new schemas must be .pick()-based per
// scripts/check-omit-schema-ratchet.cjs): a request only ever needs to carry the requester's own
// text; id/userId/status/timestamps are all server-derived (userId from the session, status
// defaults 'pending', the rest by the DB).
export const insertOfferingTypeRequestSchema = createInsertSchema(offeringTypeRequests).pick({
  requestedName: true,
  description: true,
});
export type OfferingTypeRequest = typeof offeringTypeRequests.$inferSelect;
export type InsertOfferingTypeRequest = z.infer<typeof insertOfferingTypeRequestSchema>;

/** App-enforced offering_type_requests.status vocabulary — no DB CHECK (house posture). */
export const OFFERING_TYPE_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export type OfferingTypeRequestStatus = (typeof OFFERING_TYPE_REQUEST_STATUSES)[number];

// demand_signal_events — append-only §13 event log. Every trending/demand surface must read
// ONLY these logged events; writers land in the feature builds that produce each signal kind,
// not here. kind is app-enforced (stay_anchor_miss|places_fallthrough|no_stay_flag|
// search_unfilled), no DB CHECK — same posture as optimizer_gap_fills (migration 182).
export const demandSignalEvents = pgTable("demand_signal_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: varchar("kind", { length: 40 }).notNull(),
  market: varchar("market", { length: 100 }),
  category: varchar("category", { length: 60 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  context: jsonb("context"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("demand_signal_events_kind_created_idx").on(table.kind, table.createdAt),
  index("demand_signal_events_market_idx").on(table.market),
]);

// ALLOWLIST (§19/#PS18 target shape, ratchet-exempt — see optimizer_gap_fills precedent): id/
// createdAt are server-derived; every other column is writer-supplied signal data.
export const insertDemandSignalEventSchema = createInsertSchema(demandSignalEvents).pick({
  kind: true,
  market: true,
  category: true,
  latitude: true,
  longitude: true,
  context: true,
});
export type DemandSignalEvent = typeof demandSignalEvents.$inferSelect;
export type InsertDemandSignalEvent = z.infer<typeof insertDemandSignalEventSchema>;

/** App-enforced demand_signal_events.kind vocabulary — no DB CHECK (house posture). */
export const DEMAND_SIGNAL_EVENT_KINDS = [
  "stay_anchor_miss",
  "places_fallthrough",
  "no_stay_flag",
  "search_unfilled",
] as const;
export type DemandSignalEventKind = (typeof DEMAND_SIGNAL_EVENT_KINDS)[number];

// Ordered route stops for a provider service — CLAUDE.md ruling 22 (decision-maker ratified
// Aug 10, 2026; migration 192). dmo_extracted_places pattern: child rows, CASCADE, composite
// UNIQUE on (service_id, position). lat/lng nullable — an unlocated stop stays visibly flagged
// in lists and is NEVER guessed onto the map (§13; no city-center fallback). Positions are
// server-derived from array order on the replace-list write (PUT
// /api/provider/services/:id/route-points) — never client-numbered. Declared here per the
// publish-trap rule (table + UNIQUE + index must survive the deploy push).
export const serviceRoutePoints = pgTable("service_route_points", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), // 1-based stop order (the numbered pins)
  name: varchar("name", { length: 255 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("service_route_points_service_position_unique").on(table.serviceId, table.position),
  index("service_route_points_service_idx").on(table.serviceId),
]);
export type ServiceRoutePoint = typeof serviceRoutePoints.$inferSelect;

// Travel-surcharge ZONE tiers for a provider service — DECISIONS.md ruling 81 (lane B1, migration
// 205). The `zones` mode's ordered surcharge rings, on the service_route_points/service_attestations
// child-row pattern: ON DELETE CASCADE, composite UNIQUE (service_id, position). Positions are
// server-derived from array order on the owner-gated replace-list write (PUT
// /api/provider/services/:id/surcharge-tiers) — never client-numbered. Each row is a ring: any
// pickup within `radiusKm` of the confirmed pin (and outside every smaller ring) incurs `fee`. The
// resolver picks the SMALLEST containing ring (§13 honest containment — no computed distance shown).
// `radiusKm`/`fee` are owner LISTING config (not §18 rates), but the CHARGE is derived server-side at
// checkout. Declared here per the publish-trap rule (table + UNIQUE + index must survive the deploy
// push). NO createInsertSchema: the write body is a hand-written zod ALLOWLIST in the route (§19).
export const serviceSurchargeTiers = pgTable("service_surcharge_tiers", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), // 1-based ring order (smallest ⇒ largest radius)
  radiusKm: decimal("radius_km", { precision: 10, scale: 3 }).notNull(), // outer radius of this ring, km from the pin
  fee: decimal("fee", { precision: 10, scale: 2 }).notNull(),            // surcharge dollars for a pickup landing in this ring
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("service_surcharge_tiers_service_position_unique").on(table.serviceId, table.position),
  index("service_surcharge_tiers_service_idx").on(table.serviceId),
]);
export type ServiceSurchargeTier = typeof serviceSurchargeTiers.$inferSelect;

// S7 availability model — DECISIONS.md ledger row 102 (Wave 3 schema ballot, ratified as
// recommended, decision-maker Aug 13, 2026; docs/briefs/WAVE3_SCHEMA_PROPOSALS.md; migration 210).
// Three additive child tables. Patterns/blackouts are AUTHORING data, not the §15 claim surface —
// server/services/availability-materializer.service.ts expands a pattern minus blackouts into
// ordinary vendorAvailabilitySlots rows for a rolling window, so storage.bookSlot/releaseSlot/the
// sweep need ZERO changes. service_date_ranges is property/room authoring only this wave; S11 owns
// the range-claim machinery (checkout, §15 claim/promote/void).
//
// Weekly repeat rule ("every Tuesday 09:00-11:00, capacity 4"). Natural-key UNIQUE (service_id,
// day_of_week, start_time, end_time) — a weekly grid has no sequence, only distinct slots, so this
// deliberately does NOT follow the position-ordered service_route_points/service_surcharge_tiers
// shape (the ballot's own note). day_of_week 0=Sun..6=Sat, app-enforced range, NO DB CHECK (the
// migration-181/195 posture). Owner-gated replace-list write: PUT
// /api/provider/services/:id/availability-patterns, hand-written ALLOWLIST body (§19 — no
// createInsertSchema).
export const serviceAvailabilityPatterns = pgTable("service_availability_patterns", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun..6=Sat, app-enforced, NO DB CHECK
  startTime: varchar("start_time", { length: 5 }).notNull(), // "HH:MM", matches earliestStartTime's shape
  endTime: varchar("end_time", { length: 5 }).notNull(),
  capacity: integer("capacity").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("service_availability_patterns_unique").on(table.serviceId, table.dayOfWeek, table.startTime, table.endTime),
  index("service_availability_patterns_service_idx").on(table.serviceId),
]);
export type ServiceAvailabilityPattern = typeof serviceAvailabilityPatterns.$inferSelect;

// Property/room date-range availability, per-night price (S11's future checkout input). S7-Q4
// (ratified): nightlyPrice is provider-authored config like `price` — NULL = inherit
// provider_services.price — but §14 stays in force: S11 must server-derive the stay charge from
// THIS row, never req.body. capacity = units (rooms) available across the range. Owner-gated
// replace-list write: PUT /api/provider/services/:id/date-ranges — the route validates
// productShape is 'property'/'property_room' server-side before accepting a write. Natural-key
// UNIQUE (service_id, start_date, end_date), NO DB CHECK.
export const serviceDateRanges = pgTable("service_date_ranges", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  nightlyPrice: decimal("nightly_price", { precision: 10, scale: 2 }), // NULL = inherit provider_services.price
  capacity: integer("capacity").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("service_date_ranges_unique").on(table.serviceId, table.startDate, table.endDate),
  index("service_date_ranges_service_idx").on(table.serviceId),
]);
export type ServiceDateRange = typeof serviceDateRanges.$inferSelect;

// Blackouts apply to EITHER shape (scheduled-slot services or property date-ranges). S7-Q3
// (ratified): a blackout blocks FUTURE materialization/manual creation only — it NEVER cancels an
// existing slot or booking (auto-cancelling a paid booking is a §15 violation waiting to happen).
// Owner-gated replace-list write: PUT /api/provider/services/:id/blackouts. Natural-key UNIQUE
// (service_id, start_date, end_date), NO DB CHECK.
export const serviceAvailabilityBlackouts = pgTable("service_availability_blackouts", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("service_availability_blackouts_unique").on(table.serviceId, table.startDate, table.endDate),
  index("service_availability_blackouts_service_idx").on(table.serviceId),
]);
export type ServiceAvailabilityBlackout = typeof serviceAvailabilityBlackouts.$inferSelect;

// D9 onboarding attestations — docs/DECISIONS.md ruling 62's D9 clause, executed by ruling 67
// (migration 197). Child rows of provider_services on the service_route_points pattern: ON DELETE
// CASCADE, composite UNIQUE (service_id, attestation_key). That UNIQUE is the idempotency
// mechanism, not a nicety — the write path is INSERT … ON CONFLICT DO NOTHING, so re-affirming
// keeps the FIRST affirmation's timestamp and never mints a second row.
//
// `attestationKey` carries NO DB CHECK: the vocabulary lives in shared/service-attestations.ts and
// is app-enforced (the migration-144/195 posture — a CHECK over an app vocabulary is the
// publish-time deploy-push failure CLAUDE.md warns about). `affirmedBy` is the SESSION user,
// stamped server-side (§14 — never from req.body), ON DELETE SET NULL because deleting an account
// must not erase the historical fact that the attestation was made.
//
// Deliberately NO createInsertSchema: the write body is a hand-written zod ALLOWLIST in
// server/routes/service-attestations.routes.ts (§19/#PS18 — a denylist schema over a table whose
// every non-key column is server-stamped would be exactly the mass-assignment shape ruling 46
// named). Declared here per the publish-trap rule.
export const serviceAttestations = pgTable("service_attestations", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  attestationKey: varchar("attestation_key", { length: 64 }).notNull(),
  affirmedAt: timestamp("affirmed_at").notNull().defaultNow(),
  affirmedBy: varchar("affirmed_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("service_attestations_service_key_unique").on(table.serviceId, table.attestationKey),
  index("service_attestations_service_idx").on(table.serviceId),
]);
export type ServiceAttestation = typeof serviceAttestations.$inferSelect;

// Ruling 60 Phase B — provider CONTENT translation (docs/DECISIONS.md ruling 60 / ruling 73;
// QA_PUNCH_LIST I18N-4; migration 201). Child rows of provider_services on the
// service_route_points / service_attestations pattern: ON DELETE CASCADE, composite UNIQUE
// (service_id, locale). ONE row per (service, locale) — the write path is a replace-for-locale
// upsert (INSERT … ON CONFLICT (service_id, locale) DO UPDATE), the dmo_extracted_places /
// route-points replace-list precedent applied per-locale.
//
// Only genuine free-text CONTENT columns are translatable — the exact set ruling 60 names
// ("listing names/descriptions/meeting-point text"): serviceName, shortDescription, description,
// meetingPoint. NO enums/prices/IDs live here (§14 — identity/amount/rate never travel through a
// translation row). Each is nullable so a provider may translate a subset; the traveler read
// falls each untranslated field back to the original.
//
// `status` ('draft' | 'approved') and `source` ('human' | 'ai_draft') carry NO DB CHECK — the
// vocabulary is app-enforced (the migration-144/195 posture; a CHECK over an app vocabulary is
// the publish-time deploy-push failure CLAUDE.md warns about). `source='ai_draft'` labels a
// machine draft BY CONSTRUCTION — §13's honesty rule for CONTENT: a draft is NEVER shown to a
// traveler, and an AI draft is ALWAYS labeled as machine-generated for the reviewing provider.
// `updatedBy` is the SESSION user, stamped server-side (§14 — never from req.body), ON DELETE
// SET NULL so deleting an account keeps the historical row.
//
// Deliberately NO createInsertSchema: the write body is a hand-written zod ALLOWLIST in
// server/routes.ts (§19/#PS18 — a denylist schema over a table whose status/source/updatedBy are
// all server-stamped would be exactly the mass-assignment shape ruling 46 named, and would grow
// the omit-ratchet baseline for nothing). Declared here per the publish-trap rule.
export const serviceTranslations = pgTable("service_translations", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  locale: varchar("locale", { length: 8 }).notNull(),
  serviceName: varchar("service_name", { length: 255 }),
  shortDescription: varchar("short_description", { length: 150 }),
  description: text("description"),
  meetingPoint: text("meeting_point"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),   // 'draft' | 'approved'
  source: varchar("source", { length: 20 }).notNull().default("human"),   // 'human' | 'ai_draft'
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("service_translations_service_locale_unique").on(table.serviceId, table.locale),
  index("service_translations_service_idx").on(table.serviceId),
]);
export type ServiceTranslation = typeof serviceTranslations.$inferSelect;

// R4/R5 (docs/DECISIONS.md ruling 58; migration 194): append-only download log for the D3
// deliverable rail. One row per SUCCESSFUL fetch of GET /api/service-bookings/:id/deliverable —
// the download signal D8's proposed "auto-complete after N days undownloaded" needs and does not
// yet have (P2, QA_PUNCH_LIST.md); this table only LOGS, it implements no completion/auto-complete
// behavior (D8 is unruled). `protected` distinguishes a proxied `objstore:` stream (true) from a
// legacy pasted-URL reveal (false) — the same discriminator the endpoint response carries.
// Additive, no CHECK (publish-trap avoidance). Declared here per the publish-trap rule (table +
// index must survive the deploy push).
export const deliverableDownloads = pgTable("deliverable_downloads", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: varchar("booking_id").notNull().references(() => serviceBookings.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  protected: boolean("protected").notNull().default(false),
  downloadedAt: timestamp("downloaded_at").defaultNow().notNull(),
}, (table) => [
  index("deliverable_downloads_booking_idx").on(table.bookingId),
  index("deliverable_downloads_service_idx").on(table.serviceId),
]);
export type DeliverableDownload = typeof deliverableDownloads.$inferSelect;
