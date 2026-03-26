import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, decimal, date, pgEnum, unique, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";
import { users } from "./models/auth";

// Re-export auth models
export * from "./models/auth";
export * from "./models/chat";

// === Enums ===
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
  status: varchar("status", { length: 20 }).default("draft").notNull(), // Enum: tripStatusEnum
  numberOfTravelers: integer("number_of_travelers").default(1),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  preferences: jsonb("preferences").default({}),
  eventDetails: jsonb("event_details").default({}),
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
  message: text("message"),
  assignedAt: timestamp("assigned_at").defaultNow(),
});

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
  // Expertise
  destinations: jsonb("destinations").default([]),
  specialties: jsonb("specialties").default([]),
  languages: jsonb("languages").default([]),
  experienceTypes: jsonb("experience_types").default([]),
  specializations: jsonb("specializations").default([]),
  selectedServices: jsonb("selected_services").default([]),
  // Experience
  yearsOfExperience: varchar("years_of_experience", { length: 50 }),
  bio: text("bio"),
  portfolio: text("portfolio"),
  certifications: text("certifications"),
  // Availability
  availability: varchar("availability", { length: 50 }),
  responseTime: varchar("response_time", { length: 50 }),
  hourlyRate: varchar("hourly_rate", { length: 50 }),
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
  referralCode: varchar("referral_code", { length: 50 }).unique(),
  tiktokLink: text("tiktok_link"),
  youtubeLink: text("youtube_link"),
  status: varchar("status", { length: 20 }).default("pending"),
  rejectionMessage: text("rejection_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  status: varchar("status", { length: 20 }).default("pending"), // Enum: applicationStatusEnum
  rejectionMessage: text("rejection_message"),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
export const deliveryMethodEnum = ["pdf", "video", "call", "in_person", "voice_notes", "async_messaging"] as const;
export const serviceStatusEnum = ["active", "paused", "draft"] as const;

export const providerServices = pgTable("provider_services", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  shortDescription: varchar("short_description", { length: 150 }),
  description: text("description"),
  serviceType: varchar("service_type", { length: 50 }).default("planning"), // consultation, planning, action, concierge, experience, specialty
  categoryId: varchar("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
  
  // Pricing
  price: decimal("price", { precision: 10, scale: 2 }),
  priceType: varchar("price_type", { length: 20 }).default("fixed"), // fixed, variable, custom_quote
  priceBasedOn: varchar("price_based_on", { length: 100 }),
  
  // Delivery
  deliveryMethod: varchar("delivery_method", { length: 50 }).default("pdf"), // pdf, video, call, in_person, voice_notes, async_messaging
  deliveryTimeframe: varchar("delivery_timeframe", { length: 100 }), // "24-48 hours", "same-day", etc.
  revisionsIncluded: integer("revisions_included").default(0),
  
  // Capacity & Scheduling
  maxConcurrentBookings: integer("max_concurrent_bookings"),
  leadTimeHours: integer("lead_time_hours").default(24),
  location: varchar("location", { length: 255 }).default("Unknown"),
  availability: jsonb("availability").default([]),
  
  // What's Included & Requirements
  whatIncluded: jsonb("what_included").default([]), // Array of strings: ["3 hours shooting", "50+ edited photos"]
  requirements: jsonb("requirements").default([]), // What provider needs from traveler
  faqs: jsonb("faqs").default([]), // [{question, answer}]
  
  // Media
  serviceImage: text("service_image"), // Cover image URL
  serviceFile: text("service_file"), // File URL
  
  // Status & Analytics
  status: varchar("status", { length: 20 }).default("active"), // active, paused, draft
  formStatus: varchar("form_status", { length: 50 }).default("pending"), // For approval workflow
  isFeatured: boolean("is_featured").default(false),
  bookingsCount: integer("bookings_count").default(0),
  totalRevenue: decimal("total_revenue", { precision: 10, scale: 2 }).default("0"),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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

// === Service Bookings ===

export const serviceBookingStatusEnum = ["pending", "confirmed", "in_progress", "completed", "cancelled", "refunded"] as const;

export const serviceBookings = pgTable("service_bookings", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
  travelerId: varchar("traveler_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contractId: varchar("contract_id").references(() => userAndExpertContracts.id, { onDelete: "set null" }),
  
  // Booking Details
  bookingDetails: jsonb("booking_details").default({}), // Trip dates, preferences, requirements
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "set null" }),
  
  // Status & Payment
  status: varchar("status", { length: 30 }).default("pending"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).default("0"),
  providerEarnings: decimal("provider_earnings", { precision: 10, scale: 2 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  
  // Timestamps
  confirmedAt: timestamp("confirmed_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
  isVerified: boolean("is_verified").default(false),
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
  type: varchar("type", { length: 50 }).notNull(), // booking_created, booking_confirmed, message_received, review_received, etc.
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  relatedId: varchar("related_id", { length: 255 }), // ID of related entity (booking, message, etc.)
  relatedType: varchar("related_type", { length: 50 }), // booking, message, review, contract
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Shopping Cart ===

export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").references(() => providerServices.id, { onDelete: "cascade" }),
  customVenueId: varchar("custom_venue_id").references(() => customVenues.id, { onDelete: "cascade" }),
  experienceSlug: varchar("experience_slug", { length: 50 }),
  quantity: integer("quantity").default(1),
  tripId: varchar("trip_id").references(() => trips.id, { onDelete: "set null" }),
  scheduledDate: timestamp("scheduled_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
});

// Link experts to their selected service offerings
export const expertSelectedServices = pgTable("expert_selected_services", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  serviceOfferingId: varchar("service_offering_id").notNull().references(() => expertServiceOfferings.id, { onDelete: "cascade" }),
  customPrice: decimal("custom_price", { precision: 10, scale: 2 }), // Allow experts to set custom pricing
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
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

// === Expert Custom Services (user-submitted offerings) ===
export const expertCustomServicesStatusEnum = ["draft", "submitted", "approved", "rejected"] as const;

export const expertCustomServices = pgTable("expert_custom_services", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  expertId: varchar("expert_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Service details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  categoryName: varchar("category_name", { length: 100 }), // Custom category or existing
  existingCategoryId: varchar("existing_category_id").references(() => expertServiceCategories.id, { onDelete: "set null" }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  duration: varchar("duration", { length: 50 }), // e.g., "2 hours", "1 day", "3-5 days"
  deliverables: jsonb("deliverables").default([]), // List of what's included
  // Policies
  cancellationPolicy: text("cancellation_policy"),
  leadTime: varchar("lead_time", { length: 50 }), // e.g., "48 hours", "1 week"
  // Media
  imageUrl: text("image_url"),
  galleryImages: jsonb("gallery_images").default([]),
  // Experience types this service applies to
  experienceTypes: jsonb("experience_types").default([]),
  // Approval workflow
  status: varchar("status", { length: 20 }).default("draft"), // draft, submitted, approved, rejected
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),
  // Metadata
  isActive: boolean("is_active").default(true),
  bookingsCount: integer("bookings_count").default(0),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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

export const userExperiences = pgTable("user_experiences", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trackingNumber: varchar("tracking_number", { length: 20 }).unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  experienceTypeId: varchar("experience_type_id").notNull().references(() => experienceTypes.id, { onDelete: "cascade" }),
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
});
export const insertServiceProviderFormSchema = createInsertSchema(serviceProviderForms).omit({ id: true, userId: true, status: true, rejectionMessage: true, createdAt: true });
export const insertServiceCategorySchema = createInsertSchema(serviceCategories).omit({ id: true, createdAt: true });
export const insertServiceSubcategorySchema = createInsertSchema(serviceSubcategories).omit({ id: true, createdAt: true });
export const insertProviderServiceSchema = createInsertSchema(providerServices).omit({ id: true, userId: true, formStatus: true, bookingsCount: true, totalRevenue: true, averageRating: true, reviewCount: true, createdAt: true, updatedAt: true });
export const insertFaqSchema = createInsertSchema(faqs).omit({ id: true, createdAt: true });
export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({ id: true, createdAt: true });

// Service Templates, Bookings, Reviews schemas
export const insertServiceTemplateSchema = createInsertSchema(serviceTemplates).omit({ id: true, usageCount: true, averageRating: true, createdAt: true });
// travelerId and providerId are set server-side from auth context and service lookup
export const insertServiceBookingSchema = createInsertSchema(serviceBookings).omit({ 
  id: true, 
  travelerId: true,  // Set server-side from authenticated user
  providerId: true,  // Set server-side from service lookup
  confirmedAt: true, 
  completedAt: true, 
  cancelledAt: true, 
  createdAt: true, 
  updatedAt: true 
});
export const insertServiceReviewSchema = createInsertSchema(serviceReviews).omit({ id: true, responseText: true, responseAt: true, createdAt: true });
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
export const insertExpertSelectedServiceSchema = createInsertSchema(expertSelectedServices).omit({ id: true, createdAt: true });
export const insertExpertSpecializationSchema = createInsertSchema(expertSpecializations).omit({ id: true, createdAt: true });

export type ExpertServiceCategory = typeof expertServiceCategories.$inferSelect;
export type InsertExpertServiceCategory = z.infer<typeof insertExpertServiceCategorySchema>;
export type ExpertServiceOffering = typeof expertServiceOfferings.$inferSelect;
export type InsertExpertServiceOffering = z.infer<typeof insertExpertServiceOfferingSchema>;
export type ExpertSelectedService = typeof expertSelectedServices.$inferSelect;
export type InsertExpertSelectedService = z.infer<typeof insertExpertSelectedServiceSchema>;
export type ExpertSpecialization = typeof expertSpecializations.$inferSelect;
export type InsertExpertSpecialization = z.infer<typeof insertExpertSpecializationSchema>;

// Expert Custom Services schemas and types
export const insertExpertCustomServiceSchema = createInsertSchema(expertCustomServices).omit({ 
  id: true, 
  expertId: true, 
  status: true, 
  submittedAt: true, 
  reviewedAt: true, 
  reviewedBy: true, 
  rejectionReason: true,
  bookingsCount: true,
  averageRating: true,
  createdAt: true, 
  updatedAt: true 
});

export type ExpertCustomService = typeof expertCustomServices.$inferSelect;
export type InsertExpertCustomService = z.infer<typeof insertExpertCustomServiceSchema>;

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
  averageTemp: varchar("average_temp", { length: 20 }),
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
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
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

export const flightCache = pgTable("flight_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  originCode: varchar("origin_code", { length: 10 }).notNull(),
  destinationCode: varchar("destination_code", { length: 10 }).notNull(),
  departureDate: date("departure_date").notNull(),
  returnDate: date("return_date"),
  adults: integer("adults").notNull(),
  offerId: varchar("offer_id", { length: 100 }).notNull(),
  carrierCode: varchar("carrier_code", { length: 10 }),
  carrierName: varchar("carrier_name", { length: 100 }),
  flightNumber: varchar("flight_number", { length: 20 }),
  departureTime: varchar("departure_time", { length: 30 }),
  arrivalTime: varchar("arrival_time", { length: 30 }),
  duration: varchar("duration", { length: 30 }),
  stops: integer("stops").default(0),
  // Origin location details
  originLatitude: decimal("origin_latitude", { precision: 10, scale: 7 }),
  originLongitude: decimal("origin_longitude", { precision: 10, scale: 7 }),
  originCity: varchar("origin_city", { length: 255 }),
  originCountryCode: varchar("origin_country_code", { length: 10 }),
  originAirportName: varchar("origin_airport_name", { length: 255 }),
  // Destination location details
  destinationLatitude: decimal("destination_latitude", { precision: 10, scale: 7 }),
  destinationLongitude: decimal("destination_longitude", { precision: 10, scale: 7 }),
  destinationCity: varchar("destination_city", { length: 255 }),
  destinationCountryCode: varchar("destination_country_code", { length: 10 }),
  destinationAirportName: varchar("destination_airport_name", { length: 255 }),
  // Provider and pricing
  provider: varchar("provider", { length: 100 }).default("amadeus"),
  price: decimal("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("USD"),
  cabin: varchar("cabin", { length: 50 }),
  // For sorting
  popularityScore: integer("popularity_score").default(0),
  rawData: jsonb("raw_data").default({}),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

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

// ============ AMADEUS TRANSFER CACHE TABLE ============
export const transferCache = pgTable("transfer_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  offerId: varchar("offer_id", { length: 100 }).notNull(),
  transferType: varchar("transfer_type", { length: 50 }).notNull(),
  startLocationCode: varchar("start_location_code", { length: 10 }).notNull(),
  endAddress: text("end_address"),
  endCityName: varchar("end_city_name", { length: 255 }),
  endLatitude: decimal("end_latitude", { precision: 10, scale: 7 }),
  endLongitude: decimal("end_longitude", { precision: 10, scale: 7 }),
  vehicleCode: varchar("vehicle_code", { length: 50 }),
  vehicleCategory: varchar("vehicle_category", { length: 100 }),
  vehicleDescription: text("vehicle_description"),
  maxSeats: integer("max_seats"),
  price: decimal("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("USD"),
  provider: varchar("provider", { length: 100 }).default("amadeus"),
  rawData: jsonb("raw_data").default({}),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// ============ AMADEUS SAFETY RATING CACHE TABLE ============
export const safetyCache = pgTable("safety_cache", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  amadeusId: varchar("amadeus_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 500 }).notNull(),
  subType: varchar("sub_type", { length: 50 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  city: varchar("city", { length: 255 }),
  country: varchar("country", { length: 100 }),
  countryCode: varchar("country_code", { length: 10 }),
  overallScore: integer("overall_score"),
  lgbtqScore: integer("lgbtq_score"),
  medicalScore: integer("medical_score"),
  physicalHarmScore: integer("physical_harm_score"),
  politicalFreedomScore: integer("political_freedom_score"),
  theftScore: integer("theft_score"),
  womenSafetyScore: integer("women_safety_score"),
  rawData: jsonb("raw_data").default({}),
  lastUpdated: timestamp("last_updated").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Cache schemas and types
export const insertHotelCacheSchema = createInsertSchema(hotelCache).omit({ id: true, lastUpdated: true });
export const insertHotelOfferCacheSchema = createInsertSchema(hotelOfferCache).omit({ id: true, lastUpdated: true });
export const insertActivityCacheSchema = createInsertSchema(activityCache).omit({ id: true, lastUpdated: true });
export const insertFlightCacheSchema = createInsertSchema(flightCache).omit({ id: true, lastUpdated: true });
export const insertLocationCacheSchema = createInsertSchema(locationCache).omit({ id: true, lastUpdated: true });
export const insertFeverEventCacheSchema = createInsertSchema(feverEventCache).omit({ id: true, lastUpdated: true });
export const insertPoiCacheSchema = createInsertSchema(poiCache).omit({ id: true, lastUpdated: true });
export const insertTransferCacheSchema = createInsertSchema(transferCache).omit({ id: true, lastUpdated: true });
export const insertSafetyCacheSchema = createInsertSchema(safetyCache).omit({ id: true, lastUpdated: true });
export const insertUserFilterPreferencesSchema = createInsertSchema(userFilterPreferences).omit({ id: true, createdAt: true, updatedAt: true });

export type HotelCache = typeof hotelCache.$inferSelect;
export type InsertHotelCache = z.infer<typeof insertHotelCacheSchema>;
export type HotelOfferCache = typeof hotelOfferCache.$inferSelect;
export type InsertHotelOfferCache = z.infer<typeof insertHotelOfferCacheSchema>;
export type ActivityCache = typeof activityCache.$inferSelect;
export type InsertActivityCache = z.infer<typeof insertActivityCacheSchema>;
export type FlightCache = typeof flightCache.$inferSelect;
export type InsertFlightCache = z.infer<typeof insertFlightCacheSchema>;
export type PoiCache = typeof poiCache.$inferSelect;
export type InsertPoiCache = z.infer<typeof insertPoiCacheSchema>;
export type TransferCache = typeof transferCache.$inferSelect;
export type InsertTransferCache = z.infer<typeof insertTransferCacheSchema>;
export type SafetyCache = typeof safetyCache.$inferSelect;
export type InsertSafetyCache = z.infer<typeof insertSafetyCacheSchema>;
export type LocationCache = typeof locationCache.$inferSelect;
export type InsertLocationCache = z.infer<typeof insertLocationCacheSchema>;
export type FeverEventCache = typeof feverEventCache.$inferSelect;
export type InsertFeverEventCache = z.infer<typeof insertFeverEventCacheSchema>;
export type UserFilterPreferences = typeof userFilterPreferences.$inferSelect;
export type InsertUserFilterPreferences = z.infer<typeof insertUserFilterPreferencesSchema>;

// Coordination Hub schemas and types
export const insertVendorAvailabilitySlotSchema = createInsertSchema(vendorAvailabilitySlots).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCoordinationStateSchema = createInsertSchema(coordinationStates).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export const insertCoordinationBookingSchema = createInsertSchema(coordinationBookings).omit({ id: true, createdAt: true, updatedAt: true, confirmedAt: true });

export type VendorAvailabilitySlot = typeof vendorAvailabilitySlots.$inferSelect;
export type InsertVendorAvailabilitySlot = z.infer<typeof insertVendorAvailabilitySlotSchema>;
export type CoordinationState = typeof coordinationStates.$inferSelect;
export type InsertCoordinationState = z.infer<typeof insertCoordinationStateSchema>;
export type CoordinationBooking = typeof coordinationBookings.$inferSelect;
export type InsertCoordinationBooking = z.infer<typeof insertCoordinationBookingSchema>;

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
  
  // Timestamps
  detectedAt: timestamp("detected_at").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

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
  bookingReference: varchar("booking_reference", { length: 255 }),
  bookingStatus: varchar("booking_status", { length: 20 }), // not_required, pending, confirmed, cancelled
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

  // Notes and attachments
  notes: text("notes"),
  privateNotes: text("private_notes"), // Organizer-only notes
  attachments: jsonb("attachments").default([]), // [{name, url, type}]
  
  // Suggestion tracking
  suggestedBy: varchar("suggested_by", { length: 20 }), // 'ai', 'expert', 'user'

  // Ordering
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
export const insertItineraryItemSchema = createInsertSchema(itineraryItems).omit({ id: true, createdAt: true, updatedAt: true });
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Affiliate products table - stores scraped product data
export const affiliateProducts = pgTable("affiliate_products", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: varchar("partner_id").notNull().references(() => affiliatePartners.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 200 }),
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
  availability: varchar("availability", { length: 200 }),
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
  status: varchar("status", { length: 50 }).default("completed"), // pending, completed, refunded
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
  status: varchar("status", { length: 50 }).default("pending"), // pending, available, paid_out
  availableAt: timestamp("available_at"), // when funds become available for payout
  paidOutAt: timestamp("paid_out_at"),
  payoutId: varchar("payout_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  status: varchar("status", { length: 20 }).default("pending"), // pending, available, paid_out
  availableAt: timestamp("available_at"), // When funds become available for payout
  paidAt: timestamp("paid_at"),
  payoutId: varchar("payout_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
});

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
  variantId: varchar("variant_id").notNull().references(() => itineraryVariants.id, { onDelete: "cascade" }),
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

export const activityComments = pgTable("activity_comments", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  activityId: varchar("activity_id").notNull(),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  authorId: varchar("author_id").notNull(),
  authorName: varchar("author_name", { length: 255 }).notNull(),
  text: text("text").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  parentId: varchar("parent_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertItineraryChangeSchema = createInsertSchema(itineraryChanges).omit({ id: true, createdAt: true });
export const insertActivityCommentSchema = createInsertSchema(activityComments).omit({ id: true, createdAt: true });

export type ItineraryChange = typeof itineraryChanges.$inferSelect;
export type InsertItineraryChange = z.infer<typeof insertItineraryChangeSchema>;
export type ActivityComment = typeof activityComments.$inferSelect;
export type InsertActivityComment = z.infer<typeof insertActivityCommentSchema>;

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

