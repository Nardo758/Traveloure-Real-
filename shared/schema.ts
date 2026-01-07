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
  languages: jsonb("languages").default([]),
  yearsInCity: integer("years_in_city").notNull(),
  offerService: boolean("offer_service").default(false),
  govId: text("gov_id"), // File URL
  travelLicence: text("travel_licence"), // File URL
  instagramLink: text("instagram_link"),
  facebookLink: text("facebook_link"),
  linkedinLink: text("linkedin_link"),
  services: jsonb("services").default([]),
  serviceAvailability: integer("service_availability").default(15),
  priceExpectation: integer("price_expectation").notNull(),
  shortBio: text("short_bio"),
  confirmAge: boolean("confirm_age").default(false),
  termsAndConditions: boolean("terms_and_conditions").default(false),
  partnership: boolean("partnership").default(false),
  status: varchar("status", { length: 20 }).default("pending"), // Enum: applicationStatusEnum
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
  serviceId: varchar("service_id").notNull().references(() => providerServices.id, { onDelete: "cascade" }),
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
