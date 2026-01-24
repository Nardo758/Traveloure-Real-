import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, decimal, date } from "drizzle-orm/pg-core";
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
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
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

export const localExpertForms = pgTable("local_expert_forms", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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

export const userExperiences = pgTable("user_experiences", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
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

export const insertTripSchema = createInsertSchema(trips).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export const insertGeneratedItinerarySchema = createInsertSchema(generatedItineraries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReviewRatingSchema = createInsertSchema(reviewRatings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserAndExpertChatSchema = createInsertSchema(userAndExpertChats).omit({ id: true, createdAt: true });
export const insertTouristPlaceResultSchema = createInsertSchema(touristPlaceResults).omit({ id: true });
export const insertHelpGuideTripSchema = createInsertSchema(helpGuideTrips).omit({ id: true, userId: true, createdAt: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVendorAssignmentSchema = createInsertSchema(vendorAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiBlueprintSchema = createInsertSchema(aiBlueprints).omit({ id: true, createdAt: true });

// New schemas for Expert/Provider applications
export const insertLocalExpertFormSchema = createInsertSchema(localExpertForms).omit({ id: true, userId: true, status: true, rejectionMessage: true, createdAt: true });
export const insertServiceProviderFormSchema = createInsertSchema(serviceProviderForms).omit({ id: true, userId: true, status: true, rejectionMessage: true, createdAt: true });
export const insertServiceCategorySchema = createInsertSchema(serviceCategories).omit({ id: true, createdAt: true });
export const insertServiceSubcategorySchema = createInsertSchema(serviceSubcategories).omit({ id: true, createdAt: true });
export const insertProviderServiceSchema = createInsertSchema(providerServices).omit({ id: true, userId: true, formStatus: true, bookingsCount: true, totalRevenue: true, averageRating: true, reviewCount: true, createdAt: true, updatedAt: true });
export const insertFaqSchema = createInsertSchema(faqs).omit({ id: true, createdAt: true });
export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({ id: true, createdAt: true });

// Service Templates, Bookings, Reviews schemas
export const insertServiceTemplateSchema = createInsertSchema(serviceTemplates).omit({ id: true, usageCount: true, averageRating: true, createdAt: true });
export const insertServiceBookingSchema = createInsertSchema(serviceBookings).omit({ id: true, confirmedAt: true, completedAt: true, cancelledAt: true, createdAt: true, updatedAt: true });
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

// Cache schemas and types
export const insertHotelCacheSchema = createInsertSchema(hotelCache).omit({ id: true, lastUpdated: true });
export const insertHotelOfferCacheSchema = createInsertSchema(hotelOfferCache).omit({ id: true, lastUpdated: true });
export const insertActivityCacheSchema = createInsertSchema(activityCache).omit({ id: true, lastUpdated: true });
export const insertFlightCacheSchema = createInsertSchema(flightCache).omit({ id: true, lastUpdated: true });
export const insertLocationCacheSchema = createInsertSchema(locationCache).omit({ id: true, lastUpdated: true });
export const insertFeverEventCacheSchema = createInsertSchema(feverEventCache).omit({ id: true, lastUpdated: true });
export const insertUserFilterPreferencesSchema = createInsertSchema(userFilterPreferences).omit({ id: true, createdAt: true, updatedAt: true });

export type HotelCache = typeof hotelCache.$inferSelect;
export type InsertHotelCache = z.infer<typeof insertHotelCacheSchema>;
export type HotelOfferCache = typeof hotelOfferCache.$inferSelect;
export type InsertHotelOfferCache = z.infer<typeof insertHotelOfferCacheSchema>;
export type ActivityCache = typeof activityCache.$inferSelect;
export type InsertActivityCache = z.infer<typeof insertActivityCacheSchema>;
export type FlightCache = typeof flightCache.$inferSelect;
export type InsertFlightCache = z.infer<typeof insertFlightCacheSchema>;
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
  
  // Notes and attachments
  notes: text("notes"),
  privateNotes: text("private_notes"), // Organizer-only notes
  attachments: jsonb("attachments").default([]), // [{name, url, type}]
  
  // Ordering
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
