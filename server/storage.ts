import { db } from "./db";
import { sql } from "drizzle-orm";
import { availableAtFor } from "./config/earnings-hold.config";
import { PROCESSING_FEE_RATE, resolveCommissionRates } from "./services/commission";
import { 
  trips, generatedItineraries, touristPlaceResults, touristPlacesSearches,
  userAndExpertChats, helpGuideTrips, vendors,
  localExpertForms, serviceProviderForms, providerServices,
  serviceCategories, serviceSubcategories, faqs, wallets, creditTransactions,
  serviceTemplates, serviceBookings, serviceReviews, cartItems, userAndExpertContracts,
  notifications, experienceTypes, experienceTemplateSteps, expertExperienceTypes,
  userExperiences, userExperienceItems, users, customVenues,
  vendorAvailabilitySlots, coordinationStates, coordinationBookings,
  expertServiceCategories, expertServiceOfferings, expertSpecializations,
  destinationEvents, destinationSeasons, locationCache,
  experienceTemplateTabs, experienceTemplateFilters, experienceTemplateFilterOptions,
  experienceUniversalFilters, experienceUniversalFilterOptions,
  expertTemplates, templatePurchases, templateReviews, expertEarnings, expertPayouts,
  revenueSplits, expertTips, expertReferrals, affiliateEarnings, accessAuditLogs,
  providerEarnings, providerPayouts, platformRevenue, dailyRevenueSummary,
  contentRegistry, contentInvoices, contentVersions, contentFlags, contentAnalytics, trackingSequences,
  contentPlacementRules,
  type ContentPlacementRule, type InsertContentPlacementRule,
  type ContentRegistry, type InsertContentRegistry,
  type ContentInvoice, type InsertContentInvoice,
  type ContentVersion, type InsertContentVersion,
  type ContentFlag, type InsertContentFlag,
  type ContentAnalytics, type InsertContentAnalytics,
  type TrackingSequence,
  type Trip, type InsertTrip,
  type GeneratedItinerary, type InsertGeneratedItinerary,
  type TouristPlaceResult,
  type UserAndExpertChat, type HelpGuideTrip,
  type Vendor, type InsertVendor,
  type LocalExpertForm, type InsertLocalExpertForm,
  type ServiceProviderForm, type InsertServiceProviderForm,
  type ProviderService, type InsertProviderService,
  type ServiceCategory, type InsertServiceCategory,
  type ServiceSubcategory, type InsertServiceSubcategory,
  type FAQ, type InsertFAQ,
  type Wallet, type InsertWallet,
  type CreditTransaction, type InsertCreditTransaction,
  type ServiceTemplate, type InsertServiceTemplate,
  type ServiceBooking, type InsertServiceBooking,
  type ServiceReview, type InsertServiceReview,
  type CartItem, type Contract,
  type Notification, type InsertNotification,
  type ExperienceType, type InsertExperienceType,
  type ExperienceTemplateStep, type InsertExperienceTemplateStep,
  type ExpertExperienceType, type InsertExpertExperienceType,
  type UserExperience, type InsertUserExperience,
  type UserExperienceItem, type InsertUserExperienceItem,
  type CustomVenue, type InsertCustomVenue,
  type VendorAvailabilitySlot, type InsertVendorAvailabilitySlot,
  type CoordinationState, type InsertCoordinationState,
  type CoordinationBooking, type InsertCoordinationBooking,
  type ProviderServiceListing, type InsertProviderServiceListing,
  type DestinationEvent, type InsertDestinationEvent,
  type DestinationSeason, type InsertDestinationSeason,
  type LocationCache, type InsertLocationCache,
  type ExpertTemplate, type InsertExpertTemplate,
  type TemplatePurchase, type InsertTemplatePurchase,
  type TemplateReview, type InsertTemplateReview,
  type ExpertEarning, type InsertExpertEarning,
  type ExpertPayout, type InsertExpertPayout,
  type RevenueSplit, type InsertRevenueSplit,
  type ExpertTip, type InsertExpertTip,
  type ExpertReferral, type InsertExpertReferral,
  type AffiliateEarning, type InsertAffiliateEarning,
  type ProviderEarning, type InsertProviderEarning,
  type ProviderPayout, type InsertProviderPayout,
  type PlatformRevenue, type InsertPlatformRevenue,
  type DailyRevenueSummary, type InsertDailyRevenueSummary,
  temporalAnchors, dayBoundaries, energyTracking,
  type TemporalAnchor, type InsertTemporalAnchor,
  type DayBoundary, type InsertDayBoundary,
  type EnergyTracking, type InsertEnergyTracking,
  providerAvailabilitySchedule, providerBlackoutDates,
  providerBookingRequests, expertVendorCoordination,
  type ProviderAvailabilitySchedule, type InsertProviderAvailabilitySchedule,
  type ProviderBlackoutDate, type InsertProviderBlackoutDate,
  type ProviderBookingRequest, type InsertProviderBookingRequest,
  type ExpertVendorCoordination, type InsertExpertVendorCoordination,
  expertOfferingTypes,
  expertMatchAnalytics, destinationSearchPatterns, destinationMetricsHistory,
  type ExpertMatchAnalytics, type InsertExpertMatchAnalytics,
  type DestinationSearchPattern, type InsertDestinationSearchPattern,
  type DestinationMetricsHistory, type InsertDestinationMetricsHistory,
  itineraryChanges, activityComments,
  type ItineraryChange, type InsertItineraryChange,
  type ActivityComment, type InsertActivityComment,
  itineraryItems, tripExpertAdvisors, providerSettings,
  type ItineraryItem, type InsertItineraryItem,
  type ProviderSettings, type InsertProviderSettings,
  affiliateBookingRequests,
  type AffiliateBookingRequest, type InsertAffiliateBookingRequest,
  providerNeighborhoodCoverage,
  cityNeighborhoods,
  expertNeighborhoods,
  travelPulseCities,
  dmoRawContent,
  dmoScrapeJobs,
  crossSellEvents,
  itineraryComparisons, itineraryVariants, itineraryVariantItems, itineraryVariantMetrics,
  sharedItineraries, mapsExportCache,
  transportLegs, transportBookingOptions, affiliateClicks,
  expertUpdatedItineraries,
  aiGeneratedItineraries,
  tripAnalyticsEnhanced,
} from "@shared/schema";
import { eq, ilike, and, desc, or, count, gt, gte, lte, avg, inArray, asc, isNotNull, isNull, ne, sql as sqlOp } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";
import type { User } from "@shared/models/auth";
import {
  eventInvites,
  guestTravelPlans,
  inviteTemplates,
  type EventInvite,
  type GuestTravelPlan,
  type InviteTemplate,
} from "../shared/guest-invites-schema";

export interface IStorage {
  // Trips
  getTrips(userId?: string): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | undefined>;
  createTrip(trip: InsertTrip & { userId: string }): Promise<Trip>;
  updateTrip(id: string, trip: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: string): Promise<void>;

  // Itineraries
  createGeneratedItinerary(itinerary: InsertGeneratedItinerary): Promise<GeneratedItinerary>;
  getGeneratedItineraryByTripId(tripId: string): Promise<GeneratedItinerary | undefined>;

  // Tourist Places
  searchTouristPlaces(query: string): Promise<TouristPlaceResult[]>;

  // Users
  getUser(userId: string): Promise<User | undefined>;

  // Security & Audit Logging
  logAccess(log: {
    actorId: string;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    targetUserId?: string;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void>;

  // Chats
  getChats(userId: string): Promise<UserAndExpertChat[]>;
  createChat(chat: any): Promise<UserAndExpertChat>;

  // Help Guide Trips
  getHelpGuideTrips(): Promise<HelpGuideTrip[]>;
  getHelpGuideTrip(id: string): Promise<HelpGuideTrip | undefined>;

  // Vendors
  getVendors(category?: string, city?: string): Promise<Vendor[]>;
  getVendor(id: string): Promise<Vendor | undefined>;
  createVendor(vendor: InsertVendor): Promise<Vendor>;

  // Local Expert Forms
  getLocalExpertForm(userId: string): Promise<LocalExpertForm | undefined>;
  getLocalExpertForms(status?: string): Promise<LocalExpertForm[]>;
  createLocalExpertForm(form: InsertLocalExpertForm & { userId: string }): Promise<LocalExpertForm>;
  updateLocalExpertForm(id: string, form: Partial<InsertLocalExpertForm> & { status?: string; rejectionMessage?: string | null }): Promise<LocalExpertForm | undefined>;
  updateLocalExpertFormStatus(id: string, status: string, rejectionMessage?: string): Promise<LocalExpertForm | undefined>;
  updateLocalExpertFormRejectionMessage(id: string, rejectionMessage: string): Promise<LocalExpertForm | undefined>;
  updateLocalExpertFormKnowledgeScore(id: string, knowledgeScore: unknown): Promise<void>;
  updateLocalExpertFormNotesStyle(userId: string, notesStyle: string): Promise<void>;
  updateLocalExpertFormNeighborhoods(userId: string, neighborhoods: string[], localityProof: string): Promise<void>;
  updateLocalExpertFormType(userId: string, expertType: string): Promise<void>;

  // Provider Verification (publish-gate Step 1)
  updateProviderVerification(userId: string, updates: { providerVerificationStatus?: string; backgroundCheckConfirmed?: boolean }): Promise<void>;

  // Service Provider Forms
  getServiceProviderForm(userId: string): Promise<ServiceProviderForm | undefined>;
  getServiceProviderForms(status?: string): Promise<ServiceProviderForm[]>;
  createServiceProviderForm(form: InsertServiceProviderForm & { userId: string }): Promise<ServiceProviderForm>;
  updateServiceProviderFormStatus(id: string, status: string, rejectionMessage?: string): Promise<ServiceProviderForm | undefined>;
  updateServiceProviderFormRejectionMessage(id: string, rejectionMessage: string): Promise<ServiceProviderForm | undefined>;

  // Provider Services
  getProviderServices(userId: string, filters?: { destination?: string; category?: string; activeOnly?: boolean }): Promise<ProviderService[]>;
  getAllProviderServices(): Promise<ProviderService[]>;
  createProviderService(service: InsertProviderService & { userId: string }): Promise<ProviderService>;
  updateProviderService(id: string, updates: Partial<InsertProviderService>): Promise<ProviderService | undefined>;
  deleteProviderService(id: string): Promise<void>;
  upsertProviderNeighborhoodCoverage(providerId: string, categoryKey: string, neighborhoodSlugs: string[]): Promise<void>;

  // Category Field Schema
  getCategoryFieldSchema(categoryKey: string): Promise<any[]>;

  // Service Categories (Enhanced for Admin Management)
  getServiceCategories(type?: string): Promise<ServiceCategory[]>;
  getServiceCategoryById(id: string): Promise<ServiceCategory | undefined>;
  getServiceCategoryBySlug(slug: string): Promise<ServiceCategory | undefined>;
  createServiceCategory(category: InsertServiceCategory): Promise<ServiceCategory>;
  updateServiceCategory(id: string, updates: Partial<InsertServiceCategory>): Promise<ServiceCategory | undefined>;
  deleteServiceCategory(id: string): Promise<void>;
  getServiceSubcategories(categoryId: string): Promise<ServiceSubcategory[]>;
  getAllServiceSubcategories(): Promise<ServiceSubcategory[]>;
  createServiceSubcategory(subcategory: InsertServiceSubcategory): Promise<ServiceSubcategory>;
  updateServiceSubcategory(id: string, updates: Partial<InsertServiceSubcategory>): Promise<ServiceSubcategory | undefined>;
  deleteServiceSubcategory(id: string): Promise<void>;

  // FAQs
  getFAQs(category?: string): Promise<FAQ[]>;
  createFAQ(faq: InsertFAQ): Promise<FAQ>;
  updateFAQ(id: string, updates: Partial<InsertFAQ>): Promise<FAQ | undefined>;
  deleteFAQ(id: string): Promise<void>;

  // Wallets
  getWallet(userId: string): Promise<Wallet | undefined>;
  getOrCreateWallet(userId: string): Promise<Wallet>;
  addCredits(userId: string, amount: number, description: string, referenceId?: string): Promise<CreditTransaction>;
  deductCredits(userId: string, amount: number, description: string, referenceId?: string): Promise<CreditTransaction | null>;
  getCreditTransactions(walletId: string): Promise<CreditTransaction[]>;

  // Service Templates
  getServiceTemplates(categoryId?: string): Promise<ServiceTemplate[]>;
  getServiceTemplate(id: string): Promise<ServiceTemplate | undefined>;
  createServiceTemplate(template: InsertServiceTemplate): Promise<ServiceTemplate>;
  updateServiceTemplate(id: string, updates: Partial<InsertServiceTemplate>): Promise<ServiceTemplate | undefined>;
  deleteServiceTemplate(id: string): Promise<void>;

  // Enhanced Provider Services (for Expert Services Menu)
  getProviderServiceById(id: string): Promise<ProviderService | undefined>;
  getProviderServicesByStatus(userId: string, status?: string): Promise<ProviderService[]>;
  getAllActiveServices(categoryId?: string, location?: string): Promise<ProviderService[]>;
  toggleServiceStatus(id: string, status: string): Promise<ProviderService | undefined>;
  duplicateService(id: string, userId: string): Promise<ProviderService | undefined>;
  incrementServiceBookings(id: string, amount: number): Promise<void>;

  // Service Bookings
  getServiceBookings(filters: { providerId?: string; travelerId?: string; status?: string }): Promise<ServiceBooking[]>;
  getServiceBooking(id: string): Promise<ServiceBooking | undefined>;
  createServiceBooking(booking: InsertServiceBooking): Promise<ServiceBooking>;
  updateServiceBookingStatus(id: string, status: string, reason?: string): Promise<ServiceBooking | undefined>;
  updateServiceBookingMetadata(id: string, metadata: Record<string, any>): Promise<ServiceBooking | undefined>;

  // Service Reviews
  getServiceReviews(serviceId: string): Promise<ServiceReview[]>;
  getServiceReview(id: string): Promise<ServiceReview | undefined>;
  getReviewsByBookingId(bookingId: string): Promise<ServiceReview[]>;
  createServiceReview(review: InsertServiceReview): Promise<ServiceReview>;
  addReviewResponse(id: string, responseText: string): Promise<ServiceReview | undefined>;

  // Unified Discovery
  unifiedSearch(filters: {
    query?: string;
    categoryId?: string;
    location?: string;
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    sortBy?: "rating" | "price_low" | "price_high" | "reviews";
    limit?: number;
    offset?: number;
  }): Promise<{ services: (ProviderService & { providerFirstName?: string | null; providerLastName?: string | null; providerImageUrl?: string | null })[]; packages: ExpertTemplate[]; total: number }>;

  // Cart
  getCartItems(userId: string, experienceSlug?: string): Promise<any[]>;
  getGuestCartItems(guestSessionId: string, experienceSlug?: string): Promise<any[]>;
  getCartItemById(id: string): Promise<any | undefined>;
  addToCart(userId: string | null, item: { serviceId?: string; customVenueId?: string; contentType?: string; contentId?: string; contentMeta?: Record<string, any>; quantity?: number; tripId?: string; scheduledDate?: Date; notes?: string; experienceSlug?: string; guestSessionId?: string }): Promise<any>;
  updateCartItem(id: string, updates: { quantity?: number; scheduledDate?: Date; notes?: string }): Promise<any | undefined>;
  removeFromCart(id: string): Promise<void>;
  clearCart(userId: string, experienceSlug?: string): Promise<void>;
  migrateGuestCart(guestSessionId: string, userId: string): Promise<{ migrated: number; deduplicated: number }>;

  // Contracts
  getContract(id: string): Promise<any | undefined>;
  createContract(contract: { title: string; tripTo: string; description: string; amount: string; attachment?: string }): Promise<any>;
  updateContractStatus(id: string, status: string, paymentUrl?: string): Promise<any | undefined>;

  // Notifications
  getNotifications(userId: string, unreadOnly?: boolean): Promise<Notification[]>;
  getUnreadCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markAsRead(id: string): Promise<Notification | undefined>;
  markAllAsRead(userId: string): Promise<void>;
  deleteNotification(id: string): Promise<void>;

  // Experience Types
  getExperienceTypes(): Promise<ExperienceType[]>;
  getExperienceType(id: string): Promise<ExperienceType | undefined>;
  getExperienceTypeBySlug(slug: string): Promise<ExperienceType | undefined>;
  getExperienceTemplateSteps(experienceTypeId: string): Promise<ExperienceTemplateStep[]>;
  
  // Experience Template Tabs & Filters
  getExperienceTemplateTabs(experienceTypeId: string): Promise<any[]>;
  getExperienceTemplateFilters(tabId: string): Promise<any[]>;
  getExperienceUniversalFilters(experienceTypeId: string): Promise<any[]>;
  
  // User Experiences
  getUserExperiences(userId: string): Promise<UserExperience[]>;
  getUserExperienceById(experienceId: string): Promise<UserExperience | null>;
  getUserExperience(id: string): Promise<UserExperience | undefined>;
  createUserExperience(experience: InsertUserExperience & { userId: string }): Promise<UserExperience>;
  updateUserExperience(id: string, updates: Partial<InsertUserExperience>): Promise<UserExperience | undefined>;
  deleteUserExperience(id: string): Promise<void>;
  
  // User Experience Items
  getUserExperienceItems(userExperienceId: string): Promise<UserExperienceItem[]>;
  addUserExperienceItem(item: InsertUserExperienceItem): Promise<UserExperienceItem>;
  updateUserExperienceItem(id: string, updates: Partial<InsertUserExperienceItem>): Promise<UserExperienceItem | undefined>;
  removeUserExperienceItem(id: string): Promise<void>;

  // Expert Experience Types
  getExpertExperienceTypes(expertId: string): Promise<ExpertExperienceType[]>;
  getExpertsByExperienceType(experienceTypeId: string): Promise<any[]>;
  addExpertExperienceType(data: InsertExpertExperienceType): Promise<ExpertExperienceType>;
  removeExpertExperienceType(id: string): Promise<void>;

  // Expert Service Categories & Offerings
  getExpertServiceCategories(): Promise<any[]>;
  getExpertServiceOfferings(categoryId?: string): Promise<any[]>;
  getActiveExpertOfferingTypes(): Promise<any[]>;
  getExpertSelectedServices(expertId: string): Promise<any[]>;
  getApprovedServicesForExpert(expertId: string): Promise<any[]>;
  addExpertSelectedService(expertId: string, serviceOfferingId: string, customPrice?: string): Promise<any>;
  removeExpertSelectedService(expertId: string, serviceOfferingId: string): Promise<void>;
  
  // Expert Specializations
  getExpertSpecializations(expertId: string): Promise<any[]>;
  addExpertSpecialization(expertId: string, specialization: string): Promise<any>;
  removeExpertSpecialization(expertId: string, specialization: string): Promise<void>;
  
  // Get experts with full profile (experience types, services, specializations)
  getExpertsWithProfiles(experienceTypeId?: string): Promise<any[]>;

  // Expert Custom Services
  getProviderServiceListings(expertId: string): Promise<ProviderServiceListing[]>;
  getProviderServiceListingById(id: string): Promise<ProviderServiceListing | undefined>;
  getProviderServiceListingsByStatus(status: string): Promise<ProviderServiceListing[]>;
  createProviderServiceListing(expertId: string, service: InsertProviderServiceListing): Promise<ProviderServiceListing>;
  updateProviderServiceListing(id: string, updates: Partial<InsertProviderServiceListing>): Promise<ProviderServiceListing | undefined>;
  submitProviderServiceListing(id: string): Promise<ProviderServiceListing | undefined>;
  approveProviderServiceListing(id: string, reviewedBy: string): Promise<ProviderServiceListing | undefined>;
  rejectProviderServiceListing(id: string, reviewedBy: string, reason: string): Promise<ProviderServiceListing | undefined>;
  deleteProviderServiceListing(id: string): Promise<void>;
  getApprovedProviderServiceListingsForExperts(expertIds: string[]): Promise<ProviderServiceListing[]>;

  // Custom Venues
  getCustomVenues(userId?: string, tripId?: string, experienceType?: string): Promise<CustomVenue[]>;
  getCustomVenue(id: string): Promise<CustomVenue | undefined>;
  createCustomVenue(venue: InsertCustomVenue): Promise<CustomVenue>;
  updateCustomVenue(id: string, venue: Partial<InsertCustomVenue>): Promise<CustomVenue | undefined>;
  deleteCustomVenue(id: string): Promise<void>;

  // Vendor Availability Slots
  getVendorAvailabilitySlots(serviceId: string, date?: string): Promise<VendorAvailabilitySlot[]>;
  getVendorAvailabilitySlotsInRange(serviceId: string, startDate: string, endDate: string): Promise<VendorAvailabilitySlot[]>;
  getProviderAvailabilitySlots(providerId: string): Promise<VendorAvailabilitySlot[]>;
  getVendorAvailabilitySlot(id: string): Promise<VendorAvailabilitySlot | undefined>;
  createVendorAvailabilitySlot(slot: InsertVendorAvailabilitySlot): Promise<VendorAvailabilitySlot>;
  updateVendorAvailabilitySlot(id: string, updates: Partial<InsertVendorAvailabilitySlot>): Promise<VendorAvailabilitySlot | undefined>;
  deleteVendorAvailabilitySlot(id: string): Promise<void>;
  bookSlot(id: string): Promise<VendorAvailabilitySlot | undefined>;
  // C3: compensation release for a claimed slot (failed multi-item claim / future refund path).
  releaseSlot(id: string): Promise<void>;

  // Coordination States
  getCoordinationStates(userId: string): Promise<CoordinationState[]>;
  getCoordinationState(id: string): Promise<CoordinationState | undefined>;
  getCoordinationStatesByTripId(tripId: string): Promise<CoordinationState[]>;
  getActiveCoordinationState(userId: string, experienceType: string): Promise<CoordinationState | undefined>;
  createCoordinationState(state: InsertCoordinationState): Promise<CoordinationState>;
  updateCoordinationState(id: string, updates: Partial<InsertCoordinationState>): Promise<CoordinationState | undefined>;
  updateCoordinationStatus(id: string, status: string, historyEntry?: any): Promise<CoordinationState | undefined>;
  deleteCoordinationState(id: string): Promise<void>;

  // Coordination Bookings
  getCoordinationBookings(coordinationId: string): Promise<CoordinationBooking[]>;
  getCoordinationBooking(id: string): Promise<CoordinationBooking | undefined>;
  createCoordinationBooking(booking: InsertCoordinationBooking): Promise<CoordinationBooking>;
  updateCoordinationBooking(id: string, updates: Partial<InsertCoordinationBooking>): Promise<CoordinationBooking | undefined>;
  confirmCoordinationBooking(id: string, bookingReference: string, confirmationDetails?: any): Promise<CoordinationBooking | undefined>;
  deleteCoordinationBooking(id: string): Promise<void>;

  // Expert Workspace
  isExpertAssignedToTrip(tripId: string, expertId: string): Promise<boolean>;

  // Destination Calendar Events
  getDestinationEvents(country: string, city?: string, status?: string): Promise<DestinationEvent[]>;
  getApprovedDestinationEvents(country: string, city?: string): Promise<DestinationEvent[]>;
  getDestinationEventById(id: string): Promise<DestinationEvent | undefined>;
  getContributorDestinationEvents(contributorId: string): Promise<DestinationEvent[]>;
  getPendingDestinationEvents(): Promise<DestinationEvent[]>;
  createDestinationEvent(event: InsertDestinationEvent): Promise<DestinationEvent>;
  updateDestinationEvent(id: string, updates: Partial<InsertDestinationEvent>): Promise<DestinationEvent | undefined>;
  submitDestinationEvent(id: string): Promise<DestinationEvent | undefined>;
  approveDestinationEvent(id: string, reviewedBy: string): Promise<DestinationEvent | undefined>;
  rejectDestinationEvent(id: string, reviewedBy: string, reason: string): Promise<DestinationEvent | undefined>;
  deleteDestinationEvent(id: string): Promise<void>;
  
  // Destination Seasons
  getDestinationSeasons(country: string, city?: string): Promise<DestinationSeason[]>;
  createDestinationSeason(season: InsertDestinationSeason): Promise<DestinationSeason>;
  updateDestinationSeason(id: string, updates: Partial<InsertDestinationSeason>): Promise<DestinationSeason | undefined>;
  deleteDestinationSeason(id: string): Promise<void>;
  
  // Get unique countries with calendar data
  getCalendarCountries(): Promise<string[]>;

  // Location Cache
  searchLocationCache(keyword: string, locationType?: string): Promise<LocationCache[]>;
  upsertLocationCache(location: InsertLocationCache): Promise<LocationCache>;
  getLocationByIataCode(iataCode: string, locationType?: string): Promise<LocationCache | undefined>;

  // Expert Templates
  getExpertTemplates(filters?: { expertId?: string; isPublished?: boolean; category?: string; destination?: string }): Promise<ExpertTemplate[]>;
  getExpertTemplate(id: string): Promise<ExpertTemplate | undefined>;
  createExpertTemplate(template: InsertExpertTemplate): Promise<ExpertTemplate>;
  updateExpertTemplate(id: string, updates: Partial<InsertExpertTemplate>): Promise<ExpertTemplate | undefined>;
  deleteExpertTemplate(id: string): Promise<void>;
  getSubmittedExpertTemplates(): Promise<ExpertTemplate[]>;
  submitExpertTemplate(id: string): Promise<ExpertTemplate | undefined>;
  approveExpertTemplate(id: string, reviewedBy: string): Promise<ExpertTemplate | undefined>;
  rejectExpertTemplate(id: string, reviewedBy: string, reason: string): Promise<ExpertTemplate | undefined>;
  incrementTemplateView(id: string): Promise<void>;
  
  // Template Purchases
  getTemplatePurchases(filters?: { buyerId?: string; expertId?: string }): Promise<TemplatePurchase[]>;
  getTemplatePurchase(id: string): Promise<TemplatePurchase | undefined>;
  createTemplatePurchase(purchase: InsertTemplatePurchase): Promise<TemplatePurchase>;
  hasUserPurchasedTemplate(userId: string, templateId: string): Promise<boolean>;
  
  // Template Reviews
  getTemplateReviews(templateId: string): Promise<TemplateReview[]>;
  createTemplateReview(review: InsertTemplateReview): Promise<TemplateReview>;
  
  // Expert Earnings
  getExpertEarnings(expertId: string): Promise<ExpertEarning[]>;
  getExpertEarningsSummary(expertId: string): Promise<{ total: number; pending: number; available: number; paidOut: number }>;
  createExpertEarning(earning: InsertExpertEarning): Promise<ExpertEarning>;
  
  // Expert Payouts
  getExpertPayouts(expertId: string): Promise<ExpertPayout[]>;
  createExpertPayout(payout: InsertExpertPayout): Promise<ExpertPayout>;
  
  // Revenue Splits
  getRevenueSplits(): Promise<RevenueSplit[]>;
  getRevenueSplit(type: string): Promise<RevenueSplit | undefined>;
  
  // Expert Tips
  getExpertTips(expertId: string): Promise<ExpertTip[]>;
  createExpertTip(tip: InsertExpertTip): Promise<ExpertTip>;
  getTipsForExpert(expertId: string): Promise<{ tips: ExpertTip[]; totalAmount: number }>;
  
  // Expert Referrals
  getExpertReferrals(referrerId: string): Promise<ExpertReferral[]>;
  createExpertReferral(referral: InsertExpertReferral): Promise<ExpertReferral>;
  getReferralByCode(code: string): Promise<ExpertReferral | undefined>;
  updateReferralStatus(id: string, status: string, qualifiedAt?: Date): Promise<void>;
  
  // Affiliate Earnings
  getAffiliateEarnings(expertId: string): Promise<AffiliateEarning[]>;
  createAffiliateEarning(earning: InsertAffiliateEarning): Promise<AffiliateEarning>;
  getAffiliateEarningsSummary(expertId: string): Promise<{ total: number; pending: number; confirmed: number; paid: number }>;
  
  // Provider Earnings
  getProviderEarnings(providerId: string): Promise<ProviderEarning[]>;
  getProviderEarningsSummary(providerId: string): Promise<{ total: number; pending: number; available: number; paidOut: number }>;
  createProviderEarning(earning: InsertProviderEarning): Promise<ProviderEarning>;
  releaseMaturedEarnings(now?: Date): Promise<{ expert: number; provider: number }>;
  releaseEarningsForBooking(bookingId: string, now?: Date): Promise<number>;
  setBookingEarningsDispute(bookingId: string, open: boolean, now?: Date): Promise<number>;
  reverseEarningsForBooking(bookingId: string, now?: Date): Promise<{ reversed: number; skippedPaidOut: number }>;
  reversePlatformRevenueForBooking(bookingId: string, now?: Date): Promise<number>;

  // Provider Payouts
  getProviderPayouts(providerId: string): Promise<ProviderPayout[]>;
  createProviderPayout(payout: InsertProviderPayout): Promise<ProviderPayout>;

  // Admin Payouts
  getAllExpertPayouts(status?: string): Promise<(ExpertPayout & { requesterName?: string; requesterEmail?: string })[]>;
  getAllProviderPayouts(status?: string): Promise<(ProviderPayout & { requesterName?: string; requesterEmail?: string })[]>;
  updateExpertPayoutStatus(id: string, status: string, notes?: string, transactionId?: string): Promise<ExpertPayout>;
  updateProviderPayoutStatus(id: string, status: string, notes?: string, payoutReference?: string): Promise<ProviderPayout>;
  claimExpertPayoutForProcessing(id: string): Promise<ExpertPayout | undefined>;
  claimProviderPayoutForProcessing(id: string): Promise<ProviderPayout | undefined>;

  // Stripe Connect
  updateUserStripeAccount(userId: string, stripeAccountId: string, status: string): Promise<void>;
  getUserStripeAccount(userId: string): Promise<{ stripeAccountId: string | null; stripeAccountStatus: string | null; canReceivePayments: boolean | null }>;

  // Platform Revenue
  hasPlatformRevenueForSource(sourceId: string): Promise<boolean>;
  recordPlatformRevenue(revenue: InsertPlatformRevenue): Promise<PlatformRevenue>;
  getPlatformRevenue(filters?: { startDate?: Date; endDate?: Date; sourceType?: string; status?: string }): Promise<PlatformRevenue[]>;
  getPlatformRevenueSummary(startDate?: Date, endDate?: Date): Promise<{
    totalGross: number;
    totalPlatformFee: number;
    totalNet: number;
    totalExpertEarnings: number;
    totalProviderEarnings: number;
    bySource: Record<string, number>;
    totalReversedGross: number;
    totalReversedFee: number;
    reversedBySource: Record<string, number>;
  }>;
  
  // Daily Revenue Summary
  getDailyRevenueSummary(date: string): Promise<DailyRevenueSummary | undefined>;
  updateDailyRevenueSummary(date: string, updates: Partial<InsertDailyRevenueSummary>): Promise<DailyRevenueSummary>;

  // Logistics - Temporal Anchors
  getTemporalAnchors(tripId: string): Promise<TemporalAnchor[]>;
  getTemporalAnchorById(id: string): Promise<TemporalAnchor | undefined>;
  createTemporalAnchor(anchor: InsertTemporalAnchor): Promise<TemporalAnchor>;
  updateTemporalAnchor(id: string, updates: Partial<InsertTemporalAnchor>): Promise<TemporalAnchor | undefined>;
  deleteTemporalAnchor(id: string): Promise<void>;

  // Logistics - Day Boundaries
  getDayBoundaries(tripId: string): Promise<DayBoundary[]>;
  createDayBoundary(boundary: InsertDayBoundary): Promise<DayBoundary>;

  // Logistics - Energy Tracking
  getEnergyTracking(tripId: string): Promise<EnergyTracking[]>;
  saveEnergyTracking(entry: InsertEnergyTracking): Promise<EnergyTracking>;

  // Provider Settings
  getProviderSettings(userId: string): Promise<any>;
  upsertProviderSettings(userId: string, settings: Partial<any>): Promise<any>;

  // Itinerary Items CRUD
  getItineraryItems(tripId: string): Promise<any[]>;
  createItineraryItem(item: any): Promise<any>;
  updateItineraryItem(id: string, updates: any): Promise<any>;
  deleteItineraryItem(id: string): Promise<void>;

  // Expert Workspace Status
  getExpertAssignment(assignmentId: string): Promise<any>;
  updateExpertAssignmentWorkspaceStatus(assignmentId: string, workspaceStatus: string): Promise<any>;

  // Expert/Provider Logistics
  getProviderAvailability(providerId: string): Promise<ProviderAvailabilitySchedule[]>;
  getProviderAvailabilityById(id: string): Promise<ProviderAvailabilitySchedule | undefined>;
  setProviderAvailability(schedule: InsertProviderAvailabilitySchedule): Promise<ProviderAvailabilitySchedule>;
  updateProviderAvailabilityRule(id: string, providerId: string, updates: Partial<InsertProviderAvailabilitySchedule>): Promise<ProviderAvailabilitySchedule | undefined>;
  deleteProviderAvailability(id: string): Promise<void>;
  getProviderBlackoutDates(providerId: string): Promise<ProviderBlackoutDate[]>;
  getProviderBlackoutDateById(id: string): Promise<ProviderBlackoutDate | undefined>;
  addProviderBlackoutDate(blackout: InsertProviderBlackoutDate): Promise<ProviderBlackoutDate>;
  deleteProviderBlackoutDate(id: string): Promise<void>;
  isExpertAssignedToTrip(tripId: string, expertId: string): Promise<boolean>;
  createTripExpertAdvisor(data: { tripId: string; localExpertId: string; message?: string; status?: string }): Promise<any>;
  getBookingRequests(providerId: string): Promise<ProviderBookingRequest[]>;
  getBookingRequestsByTrip(tripId: string): Promise<ProviderBookingRequest[]>;
  createBookingRequest(request: InsertProviderBookingRequest): Promise<ProviderBookingRequest>;
  updateBookingRequest(id: string, updates: Partial<InsertProviderBookingRequest>): Promise<ProviderBookingRequest | undefined>;
  getVendorCoordination(tripId: string): Promise<ExpertVendorCoordination[]>;
  createVendorCoordination(vendor: InsertExpertVendorCoordination): Promise<ExpertVendorCoordination>;
  updateVendorCoordination(id: string, updates: Partial<InsertExpertVendorCoordination>): Promise<ExpertVendorCoordination | undefined>;
  deleteVendorCoordination(id: string): Promise<void>;
  // Grok Analytics
  createExpertMatchAnalytics(data: InsertExpertMatchAnalytics): Promise<ExpertMatchAnalytics>;
  getExpertMatchAnalytics(expertId: string): Promise<ExpertMatchAnalytics[]>;
  getExpertMatchTrends(expertId: string, days?: number): Promise<{ avgScore: number; matchCount: number; selectionRate: number }>;
  createDestinationSearchPattern(data: InsertDestinationSearchPattern): Promise<DestinationSearchPattern>;
  getDestinationSearchTrends(days?: number): Promise<Array<{ destination: string; searchCount: number; conversionRate: number }>>;
  createDestinationMetricsHistory(data: InsertDestinationMetricsHistory): Promise<DestinationMetricsHistory>;
  getDestinationMetricsHistory(destination: string, metricType: string, days?: number): Promise<DestinationMetricsHistory[]>;

  // Itinerary Changes (PlanCard change tracking)
  getItineraryChanges(tripId: string, limit?: number): Promise<ItineraryChange[]>;
  createItineraryChange(change: InsertItineraryChange): Promise<ItineraryChange>;
  deleteItineraryChange(id: string): Promise<void>;

  // Activity Comments (PlanCard collaboration)
  getActivityComment(id: string): Promise<ActivityComment | undefined>;
  getActivityComments(activityId: string): Promise<ActivityComment[]>;
  getActivityCommentCounts(tripId: string): Promise<Record<string, number>>;
  createActivityComment(comment: InsertActivityComment): Promise<ActivityComment>;
  deleteActivityComment(id: string): Promise<void>;

  // Affiliate Booking Requests
  createAffiliateBookingRequest(data: InsertAffiliateBookingRequest): Promise<AffiliateBookingRequest>;
  getAffiliateBookingRequestById(id: string): Promise<AffiliateBookingRequest | undefined>;
  getAffiliateBookingRequestsByUser(userId: string): Promise<Omit<AffiliateBookingRequest, "affiliateUrl">[]>;
  getAffiliateBookingRequestsByExpert(expertId: string): Promise<AffiliateBookingRequest[]>;
  updateAffiliateBookingRequest(id: string, data: Partial<Pick<AffiliateBookingRequest, "status" | "expertNotes" | "confirmationRef" | "price" | "expertId" | "tripId">>): Promise<AffiliateBookingRequest | undefined>;
  // R4/F7 (§15): atomic pending→confirmed claim used by the confirm site so a duplicate/concurrent
  // confirm can't double-insert the affiliate earning it triggers. Returns undefined when the row
  // was already confirmed (lost the race) — caller must treat that as an idempotent no-op.
  confirmAffiliateBookingRequest(id: string, data: Partial<Pick<AffiliateBookingRequest, "expertNotes" | "confirmationRef" | "price" | "expertId" | "tripId">>): Promise<AffiliateBookingRequest | undefined>;

  // Affiliate Content Registry helpers
  registerAffiliateProduct(product: {
    id: string;
    name: string;
    description?: string | null;
    partnerId: string;
    externalId?: string | null;
    price?: string | null;
    isActive?: boolean | null;
    partnerName?: string;
  }): Promise<string>;
  getAffiliateProviders(): Promise<{ id: string; name: string; isActive: boolean; productCount: number }[]>;
  backfillAffiliateProviderMetadata(): Promise<{ updated: number }>;
  getContentRegistry(filters?: {
    status?: string;
    contentType?: string;
    ownerId?: string;
    flagged?: boolean;
    provider?: string;
    limit?: number;
    offset?: number;
  }): Promise<ContentRegistry[]>;

  // ── Identity verification (webhook callbacks) ─────────────────────────────
  updateFormIdentityVerification(formType: 'expert' | 'provider', userId: string, status: string, verifiedAt?: Date): Promise<void>;
  updateProviderBusinessVerificationByInquiry(inquiryId: string, status: string): Promise<void>;
  hasPaymentIntentRevenue(paymentIntentId: string): Promise<boolean>;

  // ── Booking status queries ─────────────────────────────────────────────────
  getBookingStatusForUser(bookingId: string, userId: string): Promise<{ status: string } | null>;
  getBulkBookingStatuses(bookingIds: string[], userId: string): Promise<Record<string, { status: string; confirmationCode: string | null }>>;

  // ── DMO Workspace ──────────────────────────────────────────────────────────
  getDmoRawContentById(id: string): Promise<any | null>;
  getDmoScrapeJobById(id: string): Promise<any | null>;

  // ── Cross-sell ─────────────────────────────────────────────────────────────
  recordCrossSellEvents(events: any[]): Promise<number>;
  getProviderServiceIdsForUser(userId: string): Promise<string[]>;

  // ── Payments / fee resolution ──────────────────────────────────────────────
  getServiceCategorySlugsByIds(ids: string[]): Promise<{ id: string; slug: string | null }[]>;
  getExpertOfferingTypeKeysByIds(ids: string[]): Promise<{ id: string; key: string }[]>;
  getFeeBandByKey(bandKey: string): Promise<any | null>;
  // === Trip-level mutations ===
  setTripShareToken(tripId: string, token: string): Promise<Trip | undefined>;
  claimTrip(tripId: string, userId: string): Promise<Trip | undefined>;
  getTripEventType(tripId: string): Promise<string | null>;
  getTripExpertNotes(tripId: string): Promise<string>;
  // === Generated itinerary ===
  updateGeneratedItineraryData(id: string, itineraryData: any, status: string): Promise<GeneratedItinerary | undefined>;
  replaceItineraryItems(tripId: string, items: any[]): Promise<void>;
  // === Itinerary comparison & variants ===
  getItineraryComparison(id: string): Promise<any | null>;
  getComparisonByTripAndUser(tripId: string, userId: string): Promise<any | null>;
  createItineraryComparison(data: any): Promise<any>;
  getAiVariantByComparison(comparisonId: string): Promise<any | null>;
  createItineraryVariant(data: { comparisonId: string; name: string; source: string; status: string }): Promise<any>;
  getItineraryVariantById(id: string): Promise<any | null>;
  getItineraryVariantItemsByVariantId(variantId: string): Promise<any[]>;
  getComparisonTripId(comparisonId: string): Promise<string | null>;
  // === Cart ===
  replaceUserCartWithVariantItems(userId: string, variantItems: Array<{ providerServiceId: string | null; dayNumber: number | null; timeSlot: string | null }>): Promise<number>;
  // === AI-generated itinerary ===
  saveAiGeneratedItinerary(data: any): Promise<any>;
  // === Shared itinerary & maps export ===
  createSharedItinerary(data: any): Promise<void>;
  getSharedItineraryByToken(token: string): Promise<any | null>;
  getTransportLegsByVariantId(variantId: string): Promise<any[]>;
  getMapsExportCacheByVariantId(variantId: string): Promise<any | null>;
  updateMapsExportCache(variantId: string, updates: { kmlContent?: string; gpxContent?: string }): Promise<void>;
  // === Expert review ===
  updateSharedItineraryExpertReview(id: string, status: string, opts?: { notes?: string; diff?: any }): Promise<void>;
  saveExpertUpdatedItinerary(data: any): Promise<void>;
  // === Trip analytics ===
  upsertTripAnalytics(data: any): Promise<void>;
  // === Itinerary item lookup ===
  getItineraryItemByIdAndTrip(itemId: string, tripId: string): Promise<any | null>;
  // === Expert advisor assignment ===
  getTripExpertAdvisoryAssignment(tripId: string, expertId: string): Promise<any | null>;
  // === Optimization gate ===
  getRecentOptimizationRun(userId: string, cutoffDate: Date): Promise<{ id: string } | null>;
  getComparisonByOptimizationPaymentId(paymentId: string): Promise<{ id: string } | null>;
  getExperienceTypeSlugByExperienceId(experienceId: string): Promise<string | null>;
  getCartItemsWithServices(userId: string): Promise<Array<{ cartItem: any; service: any | null }>>;
  getActiveProviderServices(limit?: number): Promise<any[]>;
  getComparisonsByUserId(userId: string): Promise<any[]>;
  // === Share info ===
  getComparisonsByTripAndUser(tripId: string, userId: string): Promise<Array<{ id: string; selectedVariantId: string | null }>>;
  getVariantsByComparisonIds(comparisonIds: string[]): Promise<Array<{ id: string; comparisonId: string }>>;
  getSharedItinerariesByVariantIds(variantIds: string[], sharedByUserId: string): Promise<any[]>;
  // === Public share view ===
  incrementSharedItineraryViewCount(id: string, currentViewCount: number): Promise<void>;
  getUserPublicProfile(userId: string): Promise<{ id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null>;
  // === Transport ===
  getSelectedVariantByTrip(tripId: string): Promise<{ selectedVariantId: string } | null>;
  getTransportLegById(legId: string): Promise<any | null>;
  getVariantWithComparisonOwner(variantId: string): Promise<{ comparisonId: string; userId: string } | null>;
  getSharedItineraryByTokenAndVariant(shareToken: string, variantId: string): Promise<any | null>;
  updateTransportLegMode(legId: string, data: { userSelectedMode: string; estimatedDurationMinutes: number; estimatedCostUsd: any; energyCost: number }): Promise<void>;
  getUserTransportLegsWithJoin(userId: string): Promise<any[]>;
  getTransportLegByDayOrder(variantId: string, dayNumber: number, legOrder: number): Promise<any | null>;
  // === Optimizer scores ===
  getLatestComparisonByTripId(tripId: string): Promise<{ id: string } | null>;
  getLatestVariantByComparisonId(comparisonId: string): Promise<{ id: string } | null>;
  getVariantMetricsByKeys(variantId: string, keys: string[]): Promise<any[]>;
  getFirstVariantByComparisonId(comparisonId: string): Promise<any | null>;
  getOrderedVariantItemsByVariantId(variantId: string): Promise<any[]>;
  getOrderedTransportLegsByVariantId(variantId: string): Promise<any[]>;
  getVariantMetricFirstByVariantId(variantId: string): Promise<any | null>;
  getVariantMetricsAllByVariantId(variantId: string): Promise<any[]>;
  getFullComparisonByTripId(tripId: string): Promise<any | null>;
  getBookingOptionsByVariantId(variantId: string): Promise<any[]>;
  getTransportBookingOptionById(optionId: string): Promise<any | null>;
  updateTransportBookingOptionStatus(optionId: string, data: Record<string, any>): Promise<void>;
  createAffiliateClick(data: any): Promise<void>;
  getBookingOptionsByLegId(legId: string): Promise<any[]>;
  getTopAiVariantByComparison(comparisonId: string): Promise<any | null>;
  deleteItineraryItemsByTrip(tripId: string): Promise<void>;
  bulkInsertItineraryItems(items: any[]): Promise<void>;
  updateComparisonOptimizedAt(comparisonId: string, variantId: string): Promise<void>;
  getItineraryComparisonByTripId(tripId: string): Promise<any | null>;
  getBookingOptionsByLegIds(legIds: string[]): Promise<any[]>;
  updateItineraryItemCoordinates(id: string, lat: string, lng: string): Promise<void>;
  updateTransportLegUserSelectedMode(legId: string, mode: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Trips
  async getTrips(userId?: string, status?: string): Promise<Trip[]> {
    if (!userId) return [];
    const conditions = [eq(trips.userId, userId)];
    if (status) {
      conditions.push(eq(trips.status, status));
    }
    return await db.select().from(trips).where(and(...conditions));
  }

  async getTrip(id: string): Promise<Trip | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    return trip;
  }

  async createTrip(trip: InsertTrip & { userId: string }): Promise<Trip> {
    const trackingNumber = await this.generateTrackingNumber('TRV');
    const [newTrip] = await db.insert(trips).values({ ...trip, trackingNumber }).returning();
    
    // Auto-register in content tracking system
    await this.registerContent({
      trackingNumber,
      contentType: 'trip',
      contentId: newTrip.id,
      ownerId: newTrip.userId || undefined,
      title: newTrip.title || 'Untitled Trip',
      status: newTrip.status === 'draft' ? 'draft' : 'published',
      metadata: { destination: newTrip.destination, eventType: newTrip.eventType },
    });
    
    return newTrip;
  }

  async updateTrip(id: string, updates: Partial<InsertTrip>): Promise<Trip | undefined> {
    const [updatedTrip] = await db
      .update(trips)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(trips.id, id))
      .returning();
    return updatedTrip;
  }

  async deleteTrip(id: string): Promise<void> {
    await db.delete(trips).where(eq(trips.id, id));
  }

  // Itineraries
  async createGeneratedItinerary(itinerary: InsertGeneratedItinerary): Promise<GeneratedItinerary> {
    const trackingNumber = await this.generateTrackingNumber('TRV');
    const [newItinerary] = await db.insert(generatedItineraries).values({ ...itinerary, trackingNumber }).returning();
    
    // Auto-register in content tracking system
    await this.registerContent({
      trackingNumber,
      contentType: 'itinerary',
      contentId: newItinerary.id,
      title: `Itinerary for Trip ${itinerary.tripId}`,
      status: newItinerary.status === 'pending' ? 'draft' : 'published',
      metadata: { tripId: itinerary.tripId },
    });
    
    return newItinerary;
  }

  async getGeneratedItineraryByTripId(tripId: string): Promise<GeneratedItinerary | undefined> {
    const [itinerary] = await db.select().from(generatedItineraries).where(eq(generatedItineraries.tripId, tripId));
    return itinerary;
  }

  // Tourist Places
  async searchTouristPlaces(query: string): Promise<TouristPlaceResult[]> {
    // Basic search implementation
    return await db.select().from(touristPlaceResults).where(ilike(touristPlaceResults.place, `%${query}%`));
  }

  // Users
  async getUser(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  // Security & Audit Logging
  async logAccess(log: {
    actorId: string;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    targetUserId?: string;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await db.insert(accessAuditLogs).values({
        actorId: log.actorId,
        actorRole: log.actorRole,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        targetUserId: log.targetUserId,
        metadata: log.metadata || {},
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
      });
    } catch (error) {
      // Log to console but don't fail the request if audit logging fails
      console.error("Audit log error:", error);
    }
  }

  // Chats
  async getChats(userId: string): Promise<UserAndExpertChat[]> {
    // Get chats where user is sender or receiver
    // Drizzle OR logic needed here, for simplicity return all for now or filter in memory if volume low
    // Implementing proper OR
    // return await db.select().from(userAndExpertChats).where(or(eq(userAndExpertChats.senderId, userId), eq(userAndExpertChats.receiverId, userId)));
    
    // Simplification for MVP: get all chats
    return await db.select().from(userAndExpertChats);
  }

  async createChat(chat: any): Promise<UserAndExpertChat> {
    const trackingNumber = await this.generateTrackingNumber('TRV');
    const [newChat] = await db.insert(userAndExpertChats).values({ ...chat, trackingNumber }).returning();
    
    // Auto-register chat in content tracking system
    await this.registerContent({
      trackingNumber,
      contentType: 'chat_message',
      contentId: newChat.id,
      ownerId: chat.senderId,
      title: `Chat message`,
      status: 'published',
      metadata: { senderId: chat.senderId, receiverId: chat.receiverId },
    });
    
    return newChat;
  }

  // Help Guide Trips
  async getHelpGuideTrips(): Promise<HelpGuideTrip[]> {
    return await db.select().from(helpGuideTrips);
  }

  async getHelpGuideTrip(id: string): Promise<HelpGuideTrip | undefined> {
    const [trip] = await db.select().from(helpGuideTrips).where(eq(helpGuideTrips.id, id));
    return trip;
  }

  // Vendors
  async getVendors(category?: string, city?: string): Promise<Vendor[]> {
    let result = await db.select().from(vendors);
    if (category) {
      result = result.filter(v => v.category === category);
    }
    if (city) {
      result = result.filter(v => v.city === city);
    }
    return result;
  }

  async getVendor(id: string): Promise<Vendor | undefined> {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id));
    return vendor;
  }

  async createVendor(vendor: InsertVendor): Promise<Vendor> {
    const [newVendor] = await db.insert(vendors).values(vendor).returning();
    return newVendor;
  }

  // Local Expert Forms
  async getLocalExpertForm(userId: string): Promise<LocalExpertForm | undefined> {
    const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, userId));
    return form;
  }

  async getLocalExpertForms(status?: string): Promise<LocalExpertForm[]> {
    if (status) {
      return await db.select().from(localExpertForms).where(eq(localExpertForms.status, status));
    }
    return await db.select().from(localExpertForms);
  }

  async createLocalExpertForm(form: InsertLocalExpertForm & { userId: string }): Promise<LocalExpertForm> {
    const [newForm] = await db.insert(localExpertForms).values(form).returning();
    return newForm;
  }

  async updateLocalExpertForm(id: string, form: Partial<InsertLocalExpertForm> & { status?: string; rejectionMessage?: string | null }): Promise<LocalExpertForm | undefined> {
    const [updated] = await db.update(localExpertForms)
      .set(form)
      .where(eq(localExpertForms.id, id))
      .returning();
    return updated;
  }

  async updateLocalExpertFormStatus(id: string, status: string, rejectionMessage?: string): Promise<LocalExpertForm | undefined> {
    const [updated] = await db.update(localExpertForms)
      .set({ status, rejectionMessage })
      .where(eq(localExpertForms.id, id))
      .returning();
    // On approval, translate the expert's self-declared neighborhoods into
    // expert_neighborhoods rows — the source that feeds the feed's localExpert
    // enrichment + the "Ask about <neighborhood>" routing. Best-effort: a capture
    // failure must NEVER block or roll back the approval.
    if (updated && status === "approved") {
      try {
        await this.captureExpertNeighborhoods(updated);
      } catch (err: any) {
        console.error(`[expert-neighborhoods] capture failed for form ${id}:`, err?.message || err);
      }
      // Auto-enroll the expert's city into the AI content pipeline. The pipeline only
      // generates content (gems/events/seasons) for cities present in travel_pulse_cities
      // (~21 seeded), so a new market with a vetted local expert would otherwise stay dark.
      // Supply-driven by design (Kyoto-wedge §12): enroll where we have real local depth,
      // NOT every browsed city. Best-effort — never blocks approval.
      if (updated.city && updated.country) {
        try {
          const enrolled = await this.ensureCityEnrolled(updated.city, updated.country);
          if (enrolled) {
            console.log(`[city-enroll] ${updated.city}, ${updated.country} enrolled into the content pipeline (expert approval)`);
          }
        } catch (err: any) {
          console.error(`[city-enroll] failed for ${updated.city}, ${updated.country}:`, err?.message || err);
        }
      }
    }
    return updated;
  }

  /**
   * Ensure a city exists in travel_pulse_cities so the daily AI scheduler generates
   * content for it. A fresh row has `aiGeneratedAt = NULL`, which `getCitiesNeedingRefresh`
   * treats as stale → the next scheduler cycle runs `updateCityWithAI` and fills it in.
   * Idempotent (case-insensitive existence check — the table has no unique constraint,
   * matching updateCityWithAI's own dedup). Returns true only when a NEW row was created.
   */
  async ensureCityEnrolled(cityName: string, country: string): Promise<boolean> {
    const name = cityName?.trim();
    const ctry = country?.trim();
    if (!name || !ctry) return false;
    const existing = await db
      .select({ id: travelPulseCities.id })
      .from(travelPulseCities)
      .where(and(ilike(travelPulseCities.cityName, name), ilike(travelPulseCities.country, ctry)))
      .limit(1);
    if (existing.length > 0) return false;
    await db.insert(travelPulseCities).values({ cityName: name, country: ctry });
    return true;
  }

  /**
   * Translate a local-expert form's self-declared free-text `neighborhoods` into
   * `expert_neighborhoods` rows, matching each name to a `city_neighborhoods` row
   * scoped to the expert's city (+ country when present). Case-insensitive name
   * match with a slug fallback; unmatched names are skipped + logged (a name with
   * no city_neighborhoods row can't be honestly linked). Idempotent via the
   * (expert_id, neighborhood_id) unique constraint. Reused by the approval hook
   * and the one-time backfill. Returns the number of rows captured.
   */
  async captureExpertNeighborhoods(form: LocalExpertForm): Promise<number> {
    const names = Array.isArray(form.neighborhoods)
      ? (form.neighborhoods as unknown[]).map((n) => String(n)).filter((n) => n.trim().length > 0)
      : [];
    if (names.length === 0 || !form.city) return 0;

    const cityRows = await db
      .select({ id: cityNeighborhoods.id, name: cityNeighborhoods.name, slug: cityNeighborhoods.slug })
      .from(cityNeighborhoods)
      .where(
        form.country
          ? and(ilike(cityNeighborhoods.city, form.city), ilike(cityNeighborhoods.country, form.country))
          : ilike(cityNeighborhoods.city, form.city),
      );
    if (cityRows.length === 0) return 0;

    const slugify = (s: string) =>
      s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const byName = new Map(cityRows.map((r) => [r.name.toLowerCase().trim(), r.id]));
    const bySlug = new Map(cityRows.map((r) => [r.slug.toLowerCase().trim(), r.id]));

    const matchedIds = new Set<string>();
    for (const raw of names) {
      const key = raw.toLowerCase().trim();
      const id = byName.get(key) ?? bySlug.get(key) ?? bySlug.get(slugify(raw));
      if (id) matchedIds.add(id);
    }
    if (matchedIds.size === 0) return 0;

    await db
      .insert(expertNeighborhoods)
      .values(
        Array.from(matchedIds).map((neighborhoodId, i) => ({
          expertId: form.userId,
          neighborhoodId,
          isLead: false, // lead is a separate admin/curation concern; never auto-claimed here
          sortOrder: i,
        })),
      )
      .onConflictDoNothing();
    return matchedIds.size;
  }

  async updateLocalExpertFormRejectionMessage(id: string, rejectionMessage: string): Promise<LocalExpertForm | undefined> {
    const [updated] = await db.update(localExpertForms)
      .set({ rejectionMessage })
      .where(eq(localExpertForms.id, id))
      .returning();
    return updated;
  }

  // Kyoto Knowledge-Bar scored expertise gate (migration 114): persist the AI-scored rubric result.
  // Advisory — decision support for the admin queue; does not change status/approval.
  async updateLocalExpertFormKnowledgeScore(id: string, knowledgeScore: unknown): Promise<void> {
    await db.update(localExpertForms)
      .set({ knowledgeScore: knowledgeScore as any, knowledgeScoredAt: new Date() })
      .where(eq(localExpertForms.id, id));
  }

  async updateLocalExpertFormNotesStyle(userId: string, notesStyle: string): Promise<void> {
    await db.update(localExpertForms)
      .set({ expertNotesStyle: notesStyle })
      .where(eq(localExpertForms.userId, userId));
  }

  async updateLocalExpertFormNeighborhoods(userId: string, neighborhoods: string[], localityProof: string): Promise<void> {
    await db.update(localExpertForms)
      .set({ neighborhoods, localityProof })
      .where(eq(localExpertForms.userId, userId));
  }

  async updateLocalExpertFormType(userId: string, expertType: string): Promise<void> {
    await db.update(localExpertForms)
      .set({ expertType })
      .where(eq(localExpertForms.userId, userId));
    await db.update(users)
      .set({ role: expertType })
      .where(eq(users.id, userId));
  }

  async updateProviderVerification(userId: string, updates: { providerVerificationStatus?: string; backgroundCheckConfirmed?: boolean }): Promise<void> {
    const patch: Record<string, any> = {};
    if (updates.providerVerificationStatus !== undefined) patch.providerVerificationStatus = updates.providerVerificationStatus;
    if (updates.backgroundCheckConfirmed !== undefined) patch.backgroundCheckConfirmed = updates.backgroundCheckConfirmed;
    if (Object.keys(patch).length === 0) return;
    await db.update(users).set(patch).where(eq(users.id, userId));
  }

  // Service Provider Forms
  async getServiceProviderForm(userId: string): Promise<ServiceProviderForm | undefined> {
    const [form] = await db.select().from(serviceProviderForms).where(eq(serviceProviderForms.userId, userId));
    return form;
  }

  async getServiceProviderForms(status?: string): Promise<ServiceProviderForm[]> {
    if (status) {
      return await db.select().from(serviceProviderForms).where(eq(serviceProviderForms.status, status));
    }
    return await db.select().from(serviceProviderForms);
  }

  async createServiceProviderForm(form: InsertServiceProviderForm & { userId: string }): Promise<ServiceProviderForm> {
    const [newForm] = await db.insert(serviceProviderForms).values(form).returning();
    return newForm;
  }

  async updateServiceProviderFormStatus(id: string, status: string, rejectionMessage?: string): Promise<ServiceProviderForm | undefined> {
    const [updated] = await db.update(serviceProviderForms)
      .set({ status, rejectionMessage })
      .where(eq(serviceProviderForms.id, id))
      .returning();
    return updated;
  }

  async updateServiceProviderFormRejectionMessage(id: string, rejectionMessage: string): Promise<ServiceProviderForm | undefined> {
    const [updated] = await db.update(serviceProviderForms)
      .set({ rejectionMessage })
      .where(eq(serviceProviderForms.id, id))
      .returning();
    return updated;
  }

  // Provider Services
  async getProviderServices(userId: string, filters?: { destination?: string; category?: string; activeOnly?: boolean }): Promise<ProviderService[]> {
    const conditions = [eq(providerServices.userId, userId)];
    if (filters?.activeOnly) {
      conditions.push(eq(providerServices.status, 'active'));
    }
    if (filters?.category) {
      conditions.push(ilike(providerServices.serviceType, `%${filters.category}%`));
    }
    if (filters?.destination) {
      conditions.push(ilike(providerServices.location, `%${filters.destination}%`));
    }
    return await db.select().from(providerServices)
      .where(and(...conditions))
      .orderBy(desc(providerServices.createdAt));
  }

  async getAllProviderServices(): Promise<ProviderService[]> {
    return await db.select().from(providerServices).where(eq(providerServices.status, 'active'));
  }

  async createProviderService(service: InsertProviderService & { userId: string }): Promise<ProviderService> {
    const trackingNumber = await this.generateTrackingNumber('TRV');
    // F2 born-state clamp (approval lifecycle D1a): a create can NEVER produce an approved listing.
    // The client-supplied approvalStatus (insertProviderServiceSchema still exposes it — the mass-assign
    // twin of marketplace Gap 2) is clamped server-side to the non-approved born set: an explicit 'draft'
    // (ServiceForm save-as-draft) is honored, everything else — including a client-sent 'approved'/'rejected'
    // or an omitted value — is forced to 'submitted' (the review-queue entry state). Never trust the client
    // for approval; approval only happens via the admin queue (/api/admin/provider-services approve/reject).
    const bornApprovalStatus = (service as any).approvalStatus === 'draft' ? 'draft' : 'submitted';
    const [newService] = await db.insert(providerServices)
      .values({ ...service, approvalStatus: bornApprovalStatus, trackingNumber })
      .returning();
    
    // Auto-register in content tracking system
    await this.registerContent({
      trackingNumber,
      contentType: 'service',
      contentId: newService.id,
      ownerId: newService.userId,
      title: newService.serviceName,
      status: newService.status === 'draft' ? 'draft' : 'published',
      metadata: { serviceType: newService.serviceType, categoryId: newService.categoryId, subcategoryId: newService.subcategoryId ?? null },
    });
    
    return newService;
  }

  async updateProviderService(id: string, updates: Partial<InsertProviderService>): Promise<ProviderService | undefined> {
    const [updated] = await db.update(providerServices)
      .set(updates)
      .where(eq(providerServices.id, id))
      .returning();
    return updated;
  }

  async deleteProviderService(id: string): Promise<void> {
    await db.delete(providerServices).where(eq(providerServices.id, id));
  }

  async upsertProviderNeighborhoodCoverage(providerId: string, categoryKey: string, neighborhoodSlugs: string[]): Promise<void> {
    if (!categoryKey) return;
    await db.transaction(async (tx) => {
      await tx.delete(providerNeighborhoodCoverage).where(
        and(
          eq(providerNeighborhoodCoverage.providerId, providerId),
          eq(providerNeighborhoodCoverage.categoryKey, categoryKey)
        )
      );
      if (neighborhoodSlugs.length === 0) return;
      const resolved = await tx
        .select({ id: cityNeighborhoods.id, slug: cityNeighborhoods.slug })
        .from(cityNeighborhoods)
        .where(inArray(cityNeighborhoods.slug, neighborhoodSlugs));
      if (resolved.length === 0) return;
      const slugOrder = new Map(neighborhoodSlugs.map((s, i) => [s, i]));
      const sorted = resolved.sort((a, b) => (slugOrder.get(a.slug) ?? 99) - (slugOrder.get(b.slug) ?? 99));
      await tx.insert(providerNeighborhoodCoverage).values(
        sorted.map((n, idx) => ({
          providerId,
          neighborhoodId: n.id,
          categoryKey,
          isPrimary: idx === 0,
          sortOrder: idx,
        }))
      );
    });
  }

  // Service Categories
  async getServiceCategories(type?: string): Promise<ServiceCategory[]> {
    if (type) {
      return await db.select().from(serviceCategories).where(eq(serviceCategories.categoryType, type)).orderBy(serviceCategories.sortOrder);
    }
    return await db.select().from(serviceCategories).orderBy(serviceCategories.sortOrder);
  }

  async getServiceCategoryById(id: string): Promise<ServiceCategory | undefined> {
    const [category] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id));
    return category;
  }

  async getServiceCategoryBySlug(slug: string): Promise<ServiceCategory | undefined> {
    const [category] = await db.select().from(serviceCategories).where(eq(serviceCategories.slug, slug));
    return category;
  }

  async getCategoryFieldSchema(categoryKey: string): Promise<any[]> {
    const rows = await db.execute(
      sql`SELECT id, category_key, field_key, label, type, required, options, sort_order, default_price_type
          FROM category_field_schema
          WHERE category_key = ${categoryKey}
          ORDER BY sort_order ASC`
    );
    return (rows.rows ?? []).map((r: any) => ({
      id: r.id,
      categoryKey: r.category_key,
      fieldKey: r.field_key,
      label: r.label,
      type: r.type,
      required: r.required,
      options: r.options,
      sortOrder: r.sort_order,
      defaultPriceType: r.default_price_type ?? null,
    }));
  }

  async createServiceCategory(category: InsertServiceCategory): Promise<ServiceCategory> {
    const slug = category.slug || category.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const [newCategory] = await db.insert(serviceCategories).values({ ...category, slug }).returning();
    return newCategory;
  }

  async updateServiceCategory(id: string, updates: Partial<InsertServiceCategory>): Promise<ServiceCategory | undefined> {
    const [updated] = await db.update(serviceCategories)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(serviceCategories.id, id))
      .returning();
    return updated;
  }

  async deleteServiceCategory(id: string): Promise<void> {
    await db.delete(serviceCategories).where(eq(serviceCategories.id, id));
  }

  async getServiceSubcategories(categoryId: string): Promise<ServiceSubcategory[]> {
    return await db.select().from(serviceSubcategories)
      .where(eq(serviceSubcategories.categoryId, categoryId))
      .orderBy(serviceSubcategories.sortOrder);
  }

  async getAllServiceSubcategories(): Promise<ServiceSubcategory[]> {
    return await db.select().from(serviceSubcategories).orderBy(serviceSubcategories.sortOrder);
  }

  async createServiceSubcategory(subcategory: InsertServiceSubcategory): Promise<ServiceSubcategory> {
    const [newSubcategory] = await db.insert(serviceSubcategories).values(subcategory).returning();
    return newSubcategory;
  }

  async updateServiceSubcategory(id: string, updates: Partial<InsertServiceSubcategory>): Promise<ServiceSubcategory | undefined> {
    const [updated] = await db.update(serviceSubcategories)
      .set(updates)
      .where(eq(serviceSubcategories.id, id))
      .returning();
    return updated;
  }

  async deleteServiceSubcategory(id: string): Promise<void> {
    await db.delete(serviceSubcategories).where(eq(serviceSubcategories.id, id));
  }

  // FAQs
  async getFAQs(category?: string): Promise<FAQ[]> {
    if (category) {
      return await db.select().from(faqs).where(eq(faqs.category, category));
    }
    return await db.select().from(faqs);
  }

  async createFAQ(faq: InsertFAQ): Promise<FAQ> {
    const [newFAQ] = await db.insert(faqs).values(faq).returning();
    return newFAQ;
  }

  async updateFAQ(id: string, updates: Partial<InsertFAQ>): Promise<FAQ | undefined> {
    const [updated] = await db.update(faqs)
      .set(updates)
      .where(eq(faqs.id, id))
      .returning();
    return updated;
  }

  async deleteFAQ(id: string): Promise<void> {
    await db.delete(faqs).where(eq(faqs.id, id));
  }

  // Wallets
  async getWallet(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    return wallet;
  }

  async getOrCreateWallet(userId: string): Promise<Wallet> {
    let wallet = await this.getWallet(userId);
    if (!wallet) {
      const [newWallet] = await db.insert(wallets).values({ userId, credits: 0 }).returning();
      wallet = newWallet;
    }
    return wallet;
  }

  async addCredits(userId: string, amount: number, description: string, referenceId?: string): Promise<CreditTransaction> {
    const wallet = await this.getOrCreateWallet(userId);
    
    await db.update(wallets)
      .set({ credits: (wallet.credits || 0) + amount, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id));
    
    const [transaction] = await db.insert(creditTransactions).values({
      walletId: wallet.id,
      amount,
      transactionType: "credit",
      description,
      referenceId
    }).returning();
    
    return transaction;
  }

  async deductCredits(userId: string, amount: number, description: string, referenceId?: string): Promise<CreditTransaction | null> {
    const wallet = await this.getOrCreateWallet(userId);
    
    if ((wallet.credits || 0) < amount) {
      return null;
    }
    
    await db.update(wallets)
      .set({ credits: (wallet.credits || 0) - amount, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id));
    
    const [transaction] = await db.insert(creditTransactions).values({
      walletId: wallet.id,
      amount,
      transactionType: "debit",
      description,
      referenceId
    }).returning();
    
    return transaction;
  }

  async getCreditTransactions(walletId: string): Promise<CreditTransaction[]> {
    return await db.select().from(creditTransactions).where(eq(creditTransactions.walletId, walletId));
  }

  // Service Templates
  async getServiceTemplates(categoryId?: string): Promise<ServiceTemplate[]> {
    if (categoryId) {
      return await db.select().from(serviceTemplates)
        .where(and(eq(serviceTemplates.categoryId, categoryId), eq(serviceTemplates.isActive, true)))
        .orderBy(serviceTemplates.sortOrder);
    }
    return await db.select().from(serviceTemplates).where(eq(serviceTemplates.isActive, true)).orderBy(serviceTemplates.sortOrder);
  }

  async getServiceTemplate(id: string): Promise<ServiceTemplate | undefined> {
    const [template] = await db.select().from(serviceTemplates).where(eq(serviceTemplates.id, id));
    return template;
  }

  async createServiceTemplate(template: InsertServiceTemplate): Promise<ServiceTemplate> {
    const [newTemplate] = await db.insert(serviceTemplates).values(template).returning();
    return newTemplate;
  }

  async updateServiceTemplate(id: string, updates: Partial<InsertServiceTemplate>): Promise<ServiceTemplate | undefined> {
    const [updated] = await db.update(serviceTemplates)
      .set(updates)
      .where(eq(serviceTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteServiceTemplate(id: string): Promise<void> {
    await db.update(serviceTemplates).set({ isActive: false }).where(eq(serviceTemplates.id, id));
  }

  // Enhanced Provider Services
  async getProviderServiceById(id: string): Promise<ProviderService | undefined> {
    const [service] = await db.select().from(providerServices).where(eq(providerServices.id, id));
    return service;
  }

  async getProviderServicesByStatus(userId: string, status?: string): Promise<ProviderService[]> {
    if (status) {
      return await db.select().from(providerServices)
        .where(and(eq(providerServices.userId, userId), eq(providerServices.status, status)))
        .orderBy(desc(providerServices.createdAt));
    }
    return await db.select().from(providerServices)
      .where(eq(providerServices.userId, userId))
      .orderBy(desc(providerServices.createdAt));
  }

  async getAllActiveServices(categoryId?: string, location?: string): Promise<ProviderService[]> {
    // F2 public read-gate: only approved listings surface to public browse (never a submitted/draft one).
    let conditions = [eq(providerServices.status, "active"), eq(providerServices.approvalStatus, "approved")];
    if (categoryId) {
      conditions.push(eq(providerServices.categoryId, categoryId));
    }
    if (location) {
      conditions.push(ilike(providerServices.location, `%${location}%`));
    }
    return await db.select().from(providerServices)
      .where(and(...conditions))
      .orderBy(desc(providerServices.bookingsCount));
  }

  async toggleServiceStatus(id: string, status: string): Promise<ProviderService | undefined> {
    const [updated] = await db.update(providerServices)
      .set({ status, updatedAt: new Date() })
      .where(eq(providerServices.id, id))
      .returning();
    return updated;
  }

  async duplicateService(id: string, userId: string): Promise<ProviderService | undefined> {
    const original = await this.getProviderServiceById(id);
    if (!original) return undefined;
    
    const { id: _, createdAt, updatedAt, bookingsCount, totalRevenue, averageRating, reviewCount, ...serviceData } = original;
    const [newService] = await db.insert(providerServices).values({
      ...serviceData,
      serviceName: `${original.serviceName} (Copy)`,
      status: "draft",
      // F2: a duplicate must NOT inherit the original's approval_status — a copy of an approved
      // listing would otherwise be born-approved. Reset the whole review lineage to a fresh submitted state.
      approvalStatus: "submitted",
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
      bookingsCount: 0,
      totalRevenue: "0",
      averageRating: null,
      reviewCount: 0,
    }).returning();
    return newService;
  }

  async incrementServiceBookings(id: string, _amount: number): Promise<void> {
    // Only increment bookingsCount here; totalRevenue is updated on booking completion.
    await db.update(providerServices)
      .set({ bookingsCount: sql`${providerServices.bookingsCount} + 1`, updatedAt: new Date() })
      .where(eq(providerServices.id, id));
  }

  // Service Bookings
  async getServiceBookings(filters: { providerId?: string; travelerId?: string; status?: string }): Promise<ServiceBooking[]> {
    let conditions: any[] = [];
    if (filters.providerId) conditions.push(eq(serviceBookings.providerId, filters.providerId));
    if (filters.travelerId) conditions.push(eq(serviceBookings.travelerId, filters.travelerId));
    if (filters.status) conditions.push(eq(serviceBookings.status, filters.status));
    
    if (conditions.length === 0) {
      return await db.select().from(serviceBookings).orderBy(desc(serviceBookings.createdAt));
    }
    return await db.select().from(serviceBookings).where(and(...conditions)).orderBy(desc(serviceBookings.createdAt));
  }

  async getServiceBooking(id: string): Promise<ServiceBooking | undefined> {
    const [booking] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, id));
    return booking;
  }

  async createServiceBooking(booking: InsertServiceBooking): Promise<ServiceBooking> {
    const trackingNumber = await this.generateTrackingNumber('TRV');
    const [newBooking] = await db.insert(serviceBookings).values({ ...booking, trackingNumber }).returning();
    
    // Auto-register in content tracking system
    await this.registerContent({
      trackingNumber,
      contentType: 'booking',
      contentId: newBooking.id,
      ownerId: newBooking.travelerId,
      title: `Booking ${trackingNumber}`,
      status: newBooking.status === 'pending' ? 'pending_review' : 'published',
      metadata: { serviceId: newBooking.serviceId, providerId: newBooking.providerId },
    });
    
    return newBooking;
  }

  async updateServiceBookingMetadata(id: string, metadata: Record<string, any>): Promise<ServiceBooking | undefined> {
    const prior = await this.getServiceBooking(id);
    if (!prior) return undefined;
    const merged = { ...(prior.bookingMetadata as Record<string, any> || {}), ...metadata };
    const [updated] = await db.update(serviceBookings)
      .set({ bookingMetadata: merged, updatedAt: new Date() })
      .where(eq(serviceBookings.id, id))
      .returning();
    return updated;
  }

  async updateServiceBookingStatus(id: string, status: string, reason?: string): Promise<ServiceBooking | undefined> {
    // Read prior status before applying any update so side-effects are idempotent.
    const prior = await this.getServiceBooking(id);
    if (!prior) return undefined;
    const priorStatus = prior.status;

    const updates: any = { status, updatedAt: new Date() };
    if (status === "confirmed") updates.confirmedAt = new Date();
    if (status === "completed") updates.completedAt = new Date();
    if (status === "cancelled" || status === "refunded") {
      updates.cancelledAt = new Date();
      if (reason) updates.cancellationReason = reason;
    }
    
    const [updated] = await db.update(serviceBookings)
      .set(updates)
      .where(eq(serviceBookings.id, id))
      .returning();

    if (!updated) return undefined;

    // Only fire completion side-effects on the FIRST transition to "completed".
    const isFirstCompletion = status === "completed" && priorStatus !== "completed";
    if (isFirstCompletion) {
      const grossAmount = parseFloat(updated.totalAmount || '0');
      const platformFee = parseFloat(updated.platformFee || '0');
      const providerEarningsAmount = parseFloat(updated.providerEarnings || '0');
      
      // Atomically add provider earnings to service totalRevenue
      if (providerEarningsAmount > 0) {
        await db.update(providerServices)
          .set({ totalRevenue: sql`${providerServices.totalRevenue} + ${providerEarningsAmount}` })
          .where(eq(providerServices.id, updated.serviceId));
      }
      
      // Record platform revenue if there's a platform fee
      if (platformFee > 0) {
        await this.recordPlatformRevenue({
          sourceType: 'booking_commission',
          sourceId: updated.id,
          trackingNumber: updated.trackingNumber || undefined,
          grossAmount: String(grossAmount),
          platformFee: String(platformFee),
          netAmount: String(platformFee * (1 - PROCESSING_FEE_RATE)),
          processingFees: String(platformFee * PROCESSING_FEE_RATE),
          providerId: updated.providerId,
          providerEarnings: String(providerEarningsAmount),
          description: `Booking commission from ${updated.trackingNumber || id}`,
          status: 'recorded',
          transactionDate: new Date(),
        });
      }
      
      // Create earnings ledger entries only if amount > 0
      // Earnings become available after the configurable hold period (default 7 days)
      const availableAt = availableAtFor('service_booking'); // escrow P2: per-surface clearance window (config)

      if (providerEarningsAmount > 0) {
        await this.createProviderEarning({
          providerId: updated.providerId,
          type: 'service_booking',
          amount: String(providerEarningsAmount),
          sourceType: 'booking',
          sourceId: updated.id,
          trackingNumber: updated.trackingNumber || undefined,
          description: `Earnings from booking ${updated.trackingNumber || id}`,
          status: 'held', // escrow: born held; releasable when available_at clears (migration 112)
          availableAt,
        });

        // Also record in expert earnings ledger (provider may be an expert)
        await this.createExpertEarning({
          expertId: updated.providerId,
          type: 'consulting',
          amount: String(providerEarningsAmount),
          referenceId: updated.id,
          referenceType: 'service_booking',
          description: `Service booking earnings from ${updated.trackingNumber || id}`,
          status: 'held', // escrow: born held; releasable when available_at clears (migration 112)
          availableAt,
        });
      }
    }

    // Only decrement bookingsCount on the FIRST transition to cancelled/refunded.
    const cancelStatuses = ["cancelled", "refunded"];
    const isFirstCancellation =
      cancelStatuses.includes(status) && !cancelStatuses.includes(priorStatus || '');
    if (isFirstCancellation) {
      await db.update(providerServices)
        .set({ bookingsCount: sql`GREATEST(${providerServices.bookingsCount} - 1, 0)` })
        .where(eq(providerServices.id, updated.serviceId));
    }
    
    return updated;
  }

  // Service Reviews
  async getServiceReviews(serviceId: string): Promise<ServiceReview[]> {
    return await db.select().from(serviceReviews)
      .where(eq(serviceReviews.serviceId, serviceId))
      .orderBy(desc(serviceReviews.createdAt));
  }

  async getServiceReview(id: string): Promise<ServiceReview | undefined> {
    const [review] = await db.select().from(serviceReviews).where(eq(serviceReviews.id, id));
    return review;
  }

  async getReviewsByBookingId(bookingId: string): Promise<ServiceReview[]> {
    return await db.select().from(serviceReviews)
      .where(eq(serviceReviews.bookingId, bookingId));
  }

  async createServiceReview(review: InsertServiceReview): Promise<ServiceReview> {
    const trackingNumber = await this.generateTrackingNumber('TRV');
    const [newReview] = await db.insert(serviceReviews).values({ ...review, trackingNumber }).returning();
    
    // Auto-register in content tracking system
    await this.registerContent({
      trackingNumber,
      contentType: 'review',
      contentId: newReview.id,
      ownerId: newReview.travelerId,
      title: `Review for Service ${review.serviceId}`,
      status: 'pending_review',
      metadata: { rating: newReview.rating, serviceId: newReview.serviceId, providerId: newReview.providerId },
    });
    
    // Update service average rating — approved reviews only so pending/removed don't skew stats
    const allReviews = await this.getServiceReviews(review.serviceId);
    const approvedReviews = allReviews.filter(r => (r as any).status === "approved");
    const avgRating = approvedReviews.length > 0
      ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length
      : 0;
    await db.update(providerServices)
      .set({ averageRating: String(avgRating), reviewCount: approvedReviews.length, updatedAt: new Date() })
      .where(eq(providerServices.id, review.serviceId));
    
    return newReview;
  }

  async addReviewResponse(id: string, responseText: string): Promise<ServiceReview | undefined> {
    const [updated] = await db.update(serviceReviews)
      .set({ responseText, responseAt: new Date() })
      .where(eq(serviceReviews.id, id))
      .returning();
    return updated;
  }

  // Unified Discovery
  async unifiedSearch(filters: {
    query?: string;
    categoryId?: string;
    location?: string;
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    sortBy?: "rating" | "price_low" | "price_high" | "reviews";
    limit?: number;
    offset?: number;
  }): Promise<{ services: ProviderService[]; packages: ExpertTemplate[]; total: number }> {
    // F2 public read-gate: unified search is a public surface — approved listings only.
    const conditions = [eq(providerServices.status, "active"), eq(providerServices.approvalStatus, "approved")];

    if (filters.query) {
      conditions.push(
        or(
          ilike(providerServices.serviceName, `%${filters.query}%`),
          ilike(providerServices.description, `%${filters.query}%`)
        )!
      );
    }
    
    if (filters.categoryId) {
      conditions.push(eq(providerServices.categoryId, filters.categoryId));
    }
    
    if (filters.location) {
      conditions.push(ilike(providerServices.location, `%${filters.location}%`));
    }
    
    // Get total count first
    const allMatching = await db.select().from(providerServices)
      .where(and(...conditions));
    
    // Filter by price and rating in memory (since they're stored as strings)
    let filtered = allMatching.filter(s => {
      const price = parseFloat(s.price || "0") || 0;
      const rating = parseFloat(s.averageRating || "0") || 0;
      
      if (filters.minPrice && price < filters.minPrice) return false;
      if (filters.maxPrice && price > filters.maxPrice) return false;
      if (filters.minRating && rating < filters.minRating) return false;
      
      return true;
    });
    
    // Sort
    switch (filters.sortBy) {
      case "rating":
        filtered.sort((a, b) => parseFloat(b.averageRating || "0") - parseFloat(a.averageRating || "0"));
        break;
      case "price_low":
        filtered.sort((a, b) => parseFloat(a.price || "0") - parseFloat(b.price || "0"));
        break;
      case "price_high":
        filtered.sort((a, b) => parseFloat(b.price || "0") - parseFloat(a.price || "0"));
        break;
      case "reviews":
        filtered.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
        break;
      default:
        filtered.sort((a, b) => (b.bookingsCount || 0) - (a.bookingsCount || 0));
    }
    
    const limit = filters.limit || 20;
    const offset = filters.offset || 0;

    // Packages (expert_templates) — discovery parity with services: search the SAME public set
    // the packages feed shows (approved + published only). Content is redacted at the route
    // layer (teaser only). Category-locked browses are services-only (template categories are a
    // different vocabulary than service_categories), so skip packages when categoryId is set.
    let packages: ExpertTemplate[] = [];
    if (!filters.categoryId) {
      const pkgConditions = [
        eq(expertTemplates.approvalStatus, "approved"),
        eq(expertTemplates.isPublished, true),
      ];
      if (filters.query) {
        pkgConditions.push(
          or(
            ilike(expertTemplates.title, `%${filters.query}%`),
            ilike(expertTemplates.description, `%${filters.query}%`),
            ilike(expertTemplates.destination, `%${filters.query}%`)
          )!
        );
      }
      if (filters.location) {
        pkgConditions.push(ilike(expertTemplates.destination, `%${filters.location}%`));
      }
      const pkgRows = await db
        .select()
        .from(expertTemplates)
        .where(and(...pkgConditions))
        .orderBy(
          // Remediation P2: standardize package quality ordering to match the recommender +
          // upsell-query (featured → salesCount → averageRating → recency). unifiedSearch was the
          // one site dropping the averageRating tier, so search silently ranked packages differently.
          desc(expertTemplates.isFeatured),
          desc(expertTemplates.salesCount),
          desc(expertTemplates.averageRating),
          desc(expertTemplates.createdAt)
        )
        .limit(6);
      // Price filters in memory (decimal stored as string), mirroring the services handling.
      packages = pkgRows.filter((t) => {
        const price = parseFloat(t.price || "0") || 0;
        if (filters.minPrice && price < filters.minPrice) return false;
        if (filters.maxPrice && price > filters.maxPrice) return false;
        return true;
      });
    }

    const pageServices = filtered.slice(offset, offset + limit);

    // Enrich page results with real provider name and profile image from users table
    let enrichedServices: (ProviderService & { providerFirstName?: string | null; providerLastName?: string | null; providerImageUrl?: string | null })[] = pageServices;
    if (pageServices.length > 0) {
      const userIds = [...new Set(pageServices.map(s => s.userId))];
      const userRows = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(inArray(users.id, userIds));
      const userMap = new Map(userRows.map(u => [u.id, u]));
      enrichedServices = pageServices.map(s => {
        const u = userMap.get(s.userId);
        return { ...s, providerFirstName: u?.firstName ?? null, providerLastName: u?.lastName ?? null, providerImageUrl: u?.profileImageUrl ?? null };
      });
    }

    return {
      services: enrichedServices,
      packages,
      total: filtered.length
    };
  }

  // Cart Methods
  async getGuestCartItems(guestSessionId: string, experienceSlug?: string): Promise<any[]> {
    let whereCondition: any = eq(cartItems.guestSessionId, guestSessionId);
    if (experienceSlug) {
      whereCondition = and(eq(cartItems.guestSessionId, guestSessionId), eq(cartItems.experienceSlug, experienceSlug));
    }
    return this._enrichCartItems(whereCondition);
  }

  async getCartItems(userId: string, experienceSlug?: string): Promise<any[]> {
    let whereCondition: any = eq(cartItems.userId, userId);
    if (experienceSlug) {
      // Include unslugged items (Discover add-to-cart sets no experienceSlug) alongside the
      // experience's own items. A strict eq() filter made Discover-origin items vanish from the
      // cart whenever a lingering experience context set the filter — general-pool items belong
      // in every experience cart view until they're scoped to one.
      whereCondition = and(
        eq(cartItems.userId, userId),
        or(eq(cartItems.experienceSlug, experienceSlug), isNull(cartItems.experienceSlug)),
      );
    }
    return this._enrichCartItems(whereCondition);
  }

  async getCartItemById(id: string): Promise<any | undefined> {
    const [item] = await db.select().from(cartItems).where(eq(cartItems.id, id));
    return item;
  }

  private async _enrichCartItems(whereCondition: any): Promise<any[]> {
    const items = await db.select().from(cartItems).where(whereCondition);
    // Join with service details or custom venue details
    const enriched = await Promise.all(items.map(async (item) => {
      // Handle custom venues
      if (item.customVenueId) {
        const [venue] = await db.select().from(customVenues).where(eq(customVenues.id, item.customVenueId));
        if (venue) {
          return {
            ...item,
            isCustomVenue: true,
            service: {
              id: `custom-${venue.id}`,
              serviceName: "Venue Location",
              shortDescription: venue.name || venue.notes || "",
              price: venue.estimatedCost || "0",
              location: venue.address,
              providerName: "Custom Venue"
            },
            customVenue: venue
          };
        }
      }
      // Handle discover content items (gems, hotels, activities)
      if (item.contentId && item.contentType) {
        const meta = (item.contentMeta as Record<string, any>) || {};
        return {
          ...item,
          isContentItem: true,
          service: null,
          contentDisplay: {
            name: meta.name || item.contentId,
            imageUrl: meta.imageUrl || null,
            city: meta.city || null,
            description: meta.description || null,
            price: meta.price || null,
          },
        };
      }
      // Handle regular provider services
      if (item.serviceId) {
        const [service] = await db.select().from(providerServices).where(eq(providerServices.id, item.serviceId));
        let providerName = "Provider";
        if (service?.userId) {
          const [provider] = await db.select().from(users).where(eq(users.id, service.userId));
          if (provider) {
            providerName = [provider.firstName, provider.lastName].filter(Boolean).join(" ") || "Provider";
          }
        }
        let categorySlug: string | null = null;
        if (service?.categoryId) {
          const [cat] = await db.select({ slug: serviceCategories.slug }).from(serviceCategories).where(eq(serviceCategories.id, service.categoryId));
          categorySlug = cat?.slug ?? null;
        }
        // C3/FP-4 filed follow-up: expose the held slot's real date + times so the cart can show
        // "Time slot held at checkout: {date} {start}–{end}" instead of the date-only line (the
        // time-of-day lives only on vendor_availability_slots; rendering one without this join
        // would be fabrication). Null when the slot was deleted (FK SET NULL) — client falls back.
        let slot: { date: string; startTime: string | null; endTime: string | null } | null = null;
        if (item.slotId) {
          const [slotRow] = await db
            .select({
              date: vendorAvailabilitySlots.date,
              startTime: vendorAvailabilitySlots.startTime,
              endTime: vendorAvailabilitySlots.endTime,
            })
            .from(vendorAvailabilitySlots)
            .where(eq(vendorAvailabilitySlots.id, item.slotId));
          if (slotRow) slot = { date: String(slotRow.date), startTime: slotRow.startTime, endTime: slotRow.endTime };
        }
        return { ...item, isCustomVenue: false, slot, service: service ? { ...service, providerName, categorySlug } : null };
      }
      return { ...item, service: null };
    }));
    return enriched;
  }

  async addToCart(userId: string | null, item: { serviceId?: string; customVenueId?: string; contentType?: string; contentId?: string; contentMeta?: Record<string, any>; quantity?: number; tripId?: string; scheduledDate?: Date; slotId?: string; notes?: string; experienceSlug?: string; guestSessionId?: string }): Promise<any> {
    if (!userId && !item.guestSessionId) {
      throw new Error("Either userId or guestSessionId is required");
    }
    if (!item.serviceId && !item.customVenueId && !item.contentId) {
      throw new Error("One of serviceId, customVenueId, or contentId is required");
    }

    // Build the owner match condition
    let ownerCondition: any;
    if (userId) {
      ownerCondition = eq(cartItems.userId, userId);
    } else {
      ownerCondition = eq(cartItems.guestSessionId, item.guestSessionId!);
    }

    // Build the item match condition (for deduplication)
    let itemCondition: any;
    if (item.customVenueId) {
      itemCondition = and(ownerCondition, eq(cartItems.customVenueId, item.customVenueId));
    } else if (item.serviceId) {
      itemCondition = and(ownerCondition, eq(cartItems.serviceId, item.serviceId));
    } else if (item.contentId) {
      itemCondition = and(ownerCondition, eq(cartItems.contentId, item.contentId));
    }

    if (item.experienceSlug && itemCondition) {
      itemCondition = and(itemCondition, eq(cartItems.experienceSlug, item.experienceSlug));
    }

    const [existing] = await db.select().from(cartItems).where(itemCondition);

    if (existing) {
      const [updated] = await db.update(cartItems)
        .set({
          quantity: (existing.quantity || 1) + (item.quantity || 1),
          // C3: re-adding with a picked slot attaches (or replaces) the slot + its derived date.
          ...(item.slotId ? { slotId: item.slotId, scheduledDate: item.scheduledDate } : {}),
        })
        .where(eq(cartItems.id, existing.id))
        .returning();
      return updated;
    }

    const [newItem] = await db.insert(cartItems).values({
      userId: userId || null,
      guestSessionId: item.guestSessionId || null,
      serviceId: item.serviceId || null,
      customVenueId: item.customVenueId || null,
      contentType: item.contentType || null,
      contentId: item.contentId || null,
      contentMeta: item.contentMeta || {},
      experienceSlug: item.experienceSlug,
      quantity: item.quantity || 1,
      tripId: item.tripId,
      scheduledDate: item.scheduledDate,
      slotId: item.slotId || null,
      notes: item.notes
    }).returning();
    return newItem;
  }

  async migrateGuestCart(guestSessionId: string, userId: string): Promise<{ migrated: number; deduplicated: number }> {
    const guestItems = await db.select().from(cartItems).where(eq(cartItems.guestSessionId, guestSessionId));
    if (guestItems.length === 0) return { migrated: 0, deduplicated: 0 };

    let migrated = 0;
    let deduplicated = 0;

    for (const guestItem of guestItems) {
      // Check if the authenticated cart already has this item
      let dupeCondition: any = eq(cartItems.userId, userId);
      if (guestItem.serviceId) {
        dupeCondition = and(dupeCondition, eq(cartItems.serviceId, guestItem.serviceId));
      } else if (guestItem.customVenueId) {
        dupeCondition = and(dupeCondition, eq(cartItems.customVenueId, guestItem.customVenueId));
      } else if (guestItem.contentId) {
        dupeCondition = and(dupeCondition, eq(cartItems.contentId, guestItem.contentId));
      } else {
        // No service, venue, or content item — just delete the orphan guest row
        await db.delete(cartItems).where(eq(cartItems.id, guestItem.id));
        continue;
      }
      if (guestItem.experienceSlug) {
        dupeCondition = and(dupeCondition, eq(cartItems.experienceSlug, guestItem.experienceSlug));
      }

      const [existing] = await db.select().from(cartItems).where(dupeCondition);
      if (existing) {
        // Deduplicate: remove guest row (user already has this item)
        await db.delete(cartItems).where(eq(cartItems.id, guestItem.id));
        deduplicated++;
      } else {
        // Migrate: assign to user
        await db.update(cartItems)
          .set({ userId, guestSessionId: null })
          .where(eq(cartItems.id, guestItem.id));
        migrated++;
      }
    }

    return { migrated, deduplicated };
  }

  async updateCartItem(id: string, updates: { quantity?: number; scheduledDate?: Date; notes?: string }): Promise<any | undefined> {
    const [updated] = await db.update(cartItems)
      .set(updates)
      .where(eq(cartItems.id, id))
      .returning();
    return updated;
  }

  async removeFromCart(id: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }

  async clearCart(userId: string, experienceSlug?: string): Promise<void> {
    if (experienceSlug) {
      await db.delete(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.experienceSlug, experienceSlug)));
    } else {
      await db.delete(cartItems).where(eq(cartItems.userId, userId));
    }
  }

  // Contract Methods
  async getContract(id: string): Promise<any | undefined> {
    const [contract] = await db.select().from(userAndExpertContracts).where(eq(userAndExpertContracts.id, id));
    return contract;
  }

  async createContract(contract: { title: string; tripTo: string; description: string; amount: string; attachment?: string }): Promise<any> {
    const [newContract] = await db.insert(userAndExpertContracts).values({
      title: contract.title,
      tripTo: contract.tripTo,
      description: contract.description,
      amount: contract.amount,
      attachment: contract.attachment,
      status: "pending",
      isPaid: false
    }).returning();
    return newContract;
  }

  async updateContractStatus(id: string, status: string, paymentUrl?: string): Promise<any | undefined> {
    const [updated] = await db.update(userAndExpertContracts)
      .set({ 
        status, 
        paymentUrl: paymentUrl || undefined,
        isPaid: status === "paid" 
      })
      .where(eq(userAndExpertContracts.id, id))
      .returning();
    return updated;
  }

  // Notification Methods
  async getNotifications(userId: string, unreadOnly?: boolean): Promise<Notification[]> {
    if (unreadOnly) {
      return await db.select().from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
        .orderBy(desc(notifications.createdAt));
    }
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async getUnreadCount(userId: string): Promise<number> {
    const [result] = await db.select({ count: count() }).from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result?.count || 0;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async markAsRead(id: string): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return updated;
  }

  async markAllAsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  // Experience Types Methods
  async getExperienceTypes(): Promise<ExperienceType[]> {
    return await db.select().from(experienceTypes)
      .where(eq(experienceTypes.isActive, true))
      .orderBy(experienceTypes.sortOrder);
  }

  async getExperienceType(id: string): Promise<ExperienceType | undefined> {
    const [result] = await db.select().from(experienceTypes).where(eq(experienceTypes.id, id));
    return result;
  }

  async getExperienceTypeBySlug(slug: string): Promise<ExperienceType | undefined> {
    const [result] = await db.select().from(experienceTypes).where(eq(experienceTypes.slug, slug));
    return result;
  }

  async getExperienceTemplateSteps(experienceTypeId: string): Promise<ExperienceTemplateStep[]> {
    return await db.select().from(experienceTemplateSteps)
      .where(eq(experienceTemplateSteps.experienceTypeId, experienceTypeId))
      .orderBy(experienceTemplateSteps.stepNumber);
  }

  // Experience Template Tabs & Filters Methods
  async getExperienceTemplateTabs(experienceTypeId: string): Promise<any[]> {
    const tabs = await db.select().from(experienceTemplateTabs)
      .where(and(
        eq(experienceTemplateTabs.experienceTypeId, experienceTypeId),
        eq(experienceTemplateTabs.isActive, true)
      ))
      .orderBy(experienceTemplateTabs.sortOrder);
    
    const tabsWithFilters = await Promise.all(tabs.map(async (tab) => {
      const filters = await this.getExperienceTemplateFilters(tab.id);
      return { ...tab, filters };
    }));
    
    return tabsWithFilters;
  }

  async getExperienceTemplateFilters(tabId: string): Promise<any[]> {
    const filters = await db.select().from(experienceTemplateFilters)
      .where(and(
        eq(experienceTemplateFilters.tabId, tabId),
        eq(experienceTemplateFilters.isActive, true)
      ))
      .orderBy(experienceTemplateFilters.sortOrder);
    
    const filtersWithOptions = await Promise.all(filters.map(async (filter) => {
      const options = await db.select().from(experienceTemplateFilterOptions)
        .where(and(
          eq(experienceTemplateFilterOptions.filterId, filter.id),
          eq(experienceTemplateFilterOptions.isActive, true)
        ))
        .orderBy(experienceTemplateFilterOptions.sortOrder);
      return { ...filter, options };
    }));
    
    return filtersWithOptions;
  }

  async getExperienceUniversalFilters(experienceTypeId: string): Promise<any[]> {
    const filters = await db.select().from(experienceUniversalFilters)
      .where(and(
        eq(experienceUniversalFilters.experienceTypeId, experienceTypeId),
        eq(experienceUniversalFilters.isActive, true)
      ))
      .orderBy(experienceUniversalFilters.sortOrder);
    
    const filtersWithOptions = await Promise.all(filters.map(async (filter) => {
      const options = await db.select().from(experienceUniversalFilterOptions)
        .where(and(
          eq(experienceUniversalFilterOptions.filterId, filter.id),
          eq(experienceUniversalFilterOptions.isActive, true)
        ))
        .orderBy(experienceUniversalFilterOptions.sortOrder);
      return { ...filter, options };
    }));
    
    return filtersWithOptions;
  }

  // User Experiences Methods
  async getUserExperiences(userId: string): Promise<UserExperience[]> {
    return await db.select().from(userExperiences)
      .where(eq(userExperiences.userId, userId))
      .orderBy(desc(userExperiences.createdAt));
  }

  async getUserExperienceById(experienceId: string): Promise<UserExperience | null> {
    const [row] = await db.select().from(userExperiences)
      .where(eq(userExperiences.id, experienceId)).limit(1);
    return row ?? null;
  }

  async getUserExperience(id: string): Promise<UserExperience | undefined> {
    const [result] = await db.select().from(userExperiences).where(eq(userExperiences.id, id));
    return result;
  }

  async createUserExperience(experience: InsertUserExperience & { userId: string }): Promise<UserExperience> {
    const trackingNumber = await this.generateTrackingNumber('TRV');
    const [newExperience] = await db.insert(userExperiences).values({ ...experience, trackingNumber }).returning();
    
    // Auto-register experience in content tracking system
    await this.registerContent({
      trackingNumber,
      contentType: 'experience',
      contentId: newExperience.id,
      ownerId: newExperience.userId,
      title: newExperience.title || 'Untitled Experience',
      status: 'draft',
      metadata: { location: newExperience.location },
    });
    
    return newExperience;
  }

  async updateUserExperience(id: string, updates: Partial<InsertUserExperience>): Promise<UserExperience | undefined> {
    const [updated] = await db.update(userExperiences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userExperiences.id, id))
      .returning();
    return updated;
  }

  async deleteUserExperience(id: string): Promise<void> {
    await db.delete(userExperiences).where(eq(userExperiences.id, id));
  }

  // User Experience Items Methods
  async getUserExperienceItems(userExperienceId: string): Promise<UserExperienceItem[]> {
    return await db.select().from(userExperienceItems)
      .where(eq(userExperienceItems.userExperienceId, userExperienceId))
      .orderBy(userExperienceItems.sortOrder);
  }

  async addUserExperienceItem(item: InsertUserExperienceItem): Promise<UserExperienceItem> {
    const [newItem] = await db.insert(userExperienceItems).values(item).returning();
    return newItem;
  }

  async updateUserExperienceItem(id: string, updates: Partial<InsertUserExperienceItem>): Promise<UserExperienceItem | undefined> {
    const [updated] = await db.update(userExperienceItems)
      .set(updates)
      .where(eq(userExperienceItems.id, id))
      .returning();
    return updated;
  }

  async removeUserExperienceItem(id: string): Promise<void> {
    await db.delete(userExperienceItems).where(eq(userExperienceItems.id, id));
  }

  // Expert Experience Types Methods
  async getExpertExperienceTypes(expertId: string): Promise<ExpertExperienceType[]> {
    return await db.select().from(expertExperienceTypes)
      .where(eq(expertExperienceTypes.expertId, expertId));
  }

  async getExpertsByExperienceType(experienceTypeId: string): Promise<any[]> {
    const results = await db.select({
      expertExperienceType: expertExperienceTypes,
    }).from(expertExperienceTypes)
      .where(eq(expertExperienceTypes.experienceTypeId, experienceTypeId));
    return results;
  }

  async addExpertExperienceType(data: InsertExpertExperienceType): Promise<ExpertExperienceType> {
    const [result] = await db.insert(expertExperienceTypes).values(data).returning();
    return result;
  }

  async removeExpertExperienceType(id: string): Promise<void> {
    await db.delete(expertExperienceTypes).where(eq(expertExperienceTypes.id, id));
  }

  // Custom Venues
  async getCustomVenues(userId?: string, tripId?: string, experienceType?: string): Promise<CustomVenue[]> {
    const conditions = [];
    if (userId) conditions.push(eq(customVenues.userId, userId));
    if (tripId) conditions.push(eq(customVenues.tripId, tripId));
    if (experienceType) conditions.push(eq(customVenues.experienceType, experienceType));
    
    if (conditions.length === 0) {
      return await db.select().from(customVenues).orderBy(desc(customVenues.createdAt));
    }
    return await db.select().from(customVenues).where(and(...conditions)).orderBy(desc(customVenues.createdAt));
  }

  async getCustomVenue(id: string): Promise<CustomVenue | undefined> {
    const [venue] = await db.select().from(customVenues).where(eq(customVenues.id, id));
    return venue;
  }

  async createCustomVenue(venue: InsertCustomVenue): Promise<CustomVenue> {
    const [created] = await db.insert(customVenues).values(venue).returning();
    return created;
  }

  async updateCustomVenue(id: string, updates: Partial<InsertCustomVenue>): Promise<CustomVenue | undefined> {
    const [updated] = await db.update(customVenues).set(updates).where(eq(customVenues.id, id)).returning();
    return updated;
  }

  async deleteCustomVenue(id: string): Promise<void> {
    await db.delete(customVenues).where(eq(customVenues.id, id));
  }

  // Vendor Availability Slots
  async getVendorAvailabilitySlots(serviceId: string, date?: string): Promise<VendorAvailabilitySlot[]> {
    const conditions = [eq(vendorAvailabilitySlots.serviceId, serviceId)];
    if (date) conditions.push(eq(vendorAvailabilitySlots.date, date));
    return await db.select().from(vendorAvailabilitySlots).where(and(...conditions)).orderBy(vendorAvailabilitySlots.date);
  }

  // C2: month-range read for the public per-service availability calendar.
  async getVendorAvailabilitySlotsInRange(serviceId: string, startDate: string, endDate: string): Promise<VendorAvailabilitySlot[]> {
    return await db.select().from(vendorAvailabilitySlots)
      .where(and(
        eq(vendorAvailabilitySlots.serviceId, serviceId),
        gte(vendorAvailabilitySlots.date, startDate),
        lte(vendorAvailabilitySlots.date, endDate),
      ))
      .orderBy(vendorAvailabilitySlots.date);
  }

  async getProviderAvailabilitySlots(providerId: string): Promise<VendorAvailabilitySlot[]> {
    return await db.select().from(vendorAvailabilitySlots)
      .where(eq(vendorAvailabilitySlots.providerId, providerId))
      .orderBy(vendorAvailabilitySlots.date);
  }

  async getVendorAvailabilitySlot(id: string): Promise<VendorAvailabilitySlot | undefined> {
    const [slot] = await db.select().from(vendorAvailabilitySlots).where(eq(vendorAvailabilitySlots.id, id));
    return slot;
  }

  async createVendorAvailabilitySlot(slot: InsertVendorAvailabilitySlot): Promise<VendorAvailabilitySlot> {
    const [created] = await db.insert(vendorAvailabilitySlots).values(slot).returning();
    return created;
  }

  async updateVendorAvailabilitySlot(id: string, updates: Partial<InsertVendorAvailabilitySlot>): Promise<VendorAvailabilitySlot | undefined> {
    const [updated] = await db.update(vendorAvailabilitySlots)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(vendorAvailabilitySlots.id, id))
      .returning();
    return updated;
  }

  async deleteVendorAvailabilitySlot(id: string): Promise<void> {
    await db.delete(vendorAvailabilitySlots).where(eq(vendorAvailabilitySlots.id, id));
  }

  // C3 (§15): ATOMIC capacity claim — the conditional UPDATE is the concurrency guard. The
  // previous implementation was a check-then-update TOCTOU (two concurrent bookings could both
  // read bookedCount=0 and both "claim" the last spot, overbooking past capacity); it also had
  // zero callers, so this rewrite regresses nothing. Returns undefined when the slot is missing,
  // blocked, in the past, or full — the caller's "this slot just booked" signal. Claim the slot
  // FIRST, then create bookings / call Stripe; release via releaseSlot on a downstream failure.
  async bookSlot(id: string): Promise<VendorAvailabilitySlot | undefined> {
    const result = await db.execute(sqlOp`
      UPDATE vendor_availability_slots
      SET booked_count = COALESCE(booked_count, 0) + 1,
          status = CASE
            WHEN COALESCE(booked_count, 0) + 1 >= COALESCE(capacity, 1) THEN 'fully_booked'
            ELSE status
          END,
          updated_at = NOW()
      WHERE id = ${id}
        AND status <> 'blocked'
        AND date >= CURRENT_DATE
        AND COALESCE(booked_count, 0) < COALESCE(capacity, 1)
      RETURNING *
    `);
    return (result.rows?.[0] as VendorAvailabilitySlot | undefined) ?? undefined;
  }

  // C3: compensation for a failed multi-slot claim (and the future refund-release path). Never
  // drops below zero; re-opens a fully_booked slot when capacity frees up (blocked stays blocked).
  async releaseSlot(id: string): Promise<void> {
    await db.execute(sqlOp`
      UPDATE vendor_availability_slots
      SET booked_count = GREATEST(COALESCE(booked_count, 0) - 1, 0),
          status = CASE
            WHEN status = 'fully_booked' AND GREATEST(COALESCE(booked_count, 0) - 1, 0) < COALESCE(capacity, 1)
              THEN 'available'
            ELSE status
          END,
          updated_at = NOW()
      WHERE id = ${id}
    `);
  }

  // Coordination States
  async getCoordinationStates(userId: string): Promise<CoordinationState[]> {
    return await db.select().from(coordinationStates)
      .where(eq(coordinationStates.userId, userId))
      .orderBy(desc(coordinationStates.updatedAt));
  }

  async getCoordinationState(id: string): Promise<CoordinationState | undefined> {
    const [state] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, id));
    return state;
  }

  async getCoordinationStatesByTripId(tripId: string): Promise<CoordinationState[]> {
    return await db.select().from(coordinationStates)
      .where(eq(coordinationStates.tripId, tripId))
      .orderBy(desc(coordinationStates.updatedAt));
  }

  async getActiveCoordinationState(userId: string, experienceType: string): Promise<CoordinationState | undefined> {
    const [state] = await db.select().from(coordinationStates)
      .where(and(
        eq(coordinationStates.userId, userId),
        eq(coordinationStates.experienceType, experienceType),
        or(
          eq(coordinationStates.status, "intake"),
          eq(coordinationStates.status, "expert_matching"),
          eq(coordinationStates.status, "vendor_discovery"),
          eq(coordinationStates.status, "itinerary_generation"),
          eq(coordinationStates.status, "optimization"),
          eq(coordinationStates.status, "booking_coordination")
        )
      ))
      .orderBy(desc(coordinationStates.updatedAt));
    return state;
  }

  async createCoordinationState(state: InsertCoordinationState): Promise<CoordinationState> {
    const stateWithHistory = {
      ...state,
      stateHistory: [{ status: "intake", timestamp: new Date().toISOString(), action: "created" }]
    };
    const [created] = await db.insert(coordinationStates).values(stateWithHistory).returning();
    return created;
  }

  async updateCoordinationState(id: string, updates: Partial<InsertCoordinationState>): Promise<CoordinationState | undefined> {
    const [updated] = await db.update(coordinationStates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(coordinationStates.id, id))
      .returning();
    return updated;
  }

  async updateCoordinationStatus(id: string, status: string, historyEntry?: any): Promise<CoordinationState | undefined> {
    const [current] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, id));
    if (!current) return undefined;
    
    const currentHistory = (current.stateHistory as any[]) || [];
    const newHistory = [...currentHistory, {
      status,
      timestamp: new Date().toISOString(),
      ...historyEntry
    }];
    
    const updateData: any = { status, stateHistory: newHistory, updatedAt: new Date() };
    if (status === "completed") updateData.completedAt = new Date();
    
    const [updated] = await db.update(coordinationStates)
      .set(updateData)
      .where(eq(coordinationStates.id, id))
      .returning();
    return updated;
  }

  async deleteCoordinationState(id: string): Promise<void> {
    await db.delete(coordinationStates).where(eq(coordinationStates.id, id));
  }

  // Coordination Bookings
  async getCoordinationBookings(coordinationId: string): Promise<CoordinationBooking[]> {
    return await db.select().from(coordinationBookings)
      .where(eq(coordinationBookings.coordinationId, coordinationId))
      .orderBy(coordinationBookings.scheduledDate);
  }

  async getCoordinationBooking(id: string): Promise<CoordinationBooking | undefined> {
    const [booking] = await db.select().from(coordinationBookings).where(eq(coordinationBookings.id, id));
    return booking;
  }

  async createCoordinationBooking(booking: InsertCoordinationBooking): Promise<CoordinationBooking> {
    const [created] = await db.insert(coordinationBookings).values(booking).returning();
    return created;
  }

  async updateCoordinationBooking(id: string, updates: Partial<InsertCoordinationBooking>): Promise<CoordinationBooking | undefined> {
    const [updated] = await db.update(coordinationBookings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(coordinationBookings.id, id))
      .returning();
    return updated;
  }

  async confirmCoordinationBooking(id: string, bookingReference: string, confirmationDetails?: any): Promise<CoordinationBooking | undefined> {
    const [updated] = await db.update(coordinationBookings)
      .set({
        status: "confirmed",
        bookingReference,
        confirmationDetails: confirmationDetails || {},
        confirmedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(coordinationBookings.id, id))
      .returning();
    return updated;
  }

  async deleteCoordinationBooking(id: string): Promise<void> {
    await db.delete(coordinationBookings).where(eq(coordinationBookings.id, id));
  }

  // Expert Service Categories & Offerings
  // expert_service_categories was NOT dropped by migration 013 (that migration says
  // "intentionally NOT dropped here") and migration 030 restores/seeds it (7 rows + FK).
  // It is the read-only ESO onboarding catalog (the signup category picker). The old
  // `return []` stub — written on the false "dropped by 013" premise — left
  // /api/expert-service-categories permanently EMPTY, so the expert service-listings and
  // travel-expert onboarding category pickers had no options. Now reads the live table.
  async getExpertServiceCategories(): Promise<any[]> {
    return await db.select().from(expertServiceCategories)
      .orderBy(expertServiceCategories.sortOrder);
  }

  async getActiveExpertOfferingTypes(): Promise<any[]> {
    return await db.select({
      id: expertOfferingTypes.id,
      offeringTypeKey: expertOfferingTypes.offeringTypeKey,
      serviceTier: expertOfferingTypes.serviceTier,
      displayName: expertOfferingTypes.displayName,
      tagline: expertOfferingTypes.tagline,
      deliveryFormats: expertOfferingTypes.deliveryFormats,
      isSurprising: expertOfferingTypes.isSurprising,
      sortOrder: expertOfferingTypes.sortOrder,
    })
    .from(expertOfferingTypes)
    .where(eq(expertOfferingTypes.isActive, true))
    .orderBy(expertOfferingTypes.sortOrder);
  }

  async getExpertServiceOfferings(categoryId?: string): Promise<any[]> {
    if (categoryId) {
      return await db.select().from(expertServiceOfferings)
        .where(eq(expertServiceOfferings.categoryId, categoryId))
        .orderBy(expertServiceOfferings.sortOrder);
    }
    return await db.select().from(expertServiceOfferings).orderBy(expertServiceOfferings.sortOrder);
  }

  // expert_selected_services was dropped by migration 013.
  // Services are now stored in provider_services (canonical table).
  async getExpertSelectedServices(expertId: string): Promise<any[]> {
    // OWNER view — returns the expert's own listings regardless of approval (their pipeline). NOT public.
    return await db.select().from(providerServices)
      .where(eq(providerServices.userId, expertId));
  }

  // F2 public read-gate variant: the approved+active subset of an expert's listings, for PUBLIC
  // surfaces (the /api/experts/:id/services profile page and the experts-browse card embed). Keeps
  // the owner view (above) ungated so an expert still sees their own submitted/draft listings.
  async getApprovedServicesForExpert(expertId: string): Promise<any[]> {
    return await db.select().from(providerServices)
      .where(and(
        eq(providerServices.userId, expertId),
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "active"),
      ));
  }

  async addExpertSelectedService(expertId: string, serviceOfferingId: string, customPrice?: string): Promise<any> {
    const [offering] = await db.select().from(expertServiceOfferings)
      .where(eq(expertServiceOfferings.id, serviceOfferingId));
    if (!offering) return null;
    const [created] = await db.insert(providerServices).values({
      userId: expertId,
      serviceName: offering.name,
      description: offering.description ?? undefined,
      serviceType: 'planning',
      price: customPrice || offering.price || '0',
      priceType: 'fixed',
      deliveryMethod: 'async_messaging',
      approvalStatus: 'approved',
      status: 'active',
      revenueShareRate: '0.75',
    }).returning();
    return created;
  }

  async removeExpertSelectedService(expertId: string, serviceOfferingId: string): Promise<void> {
    const [offering] = await db.select({ name: expertServiceOfferings.name })
      .from(expertServiceOfferings)
      .where(eq(expertServiceOfferings.id, serviceOfferingId));
    if (!offering) return;
    await db.delete(providerServices)
      .where(and(
        eq(providerServices.userId, expertId),
        eq(providerServices.serviceName, offering.name)
      ));
  }

  // Expert Specializations
  async getExpertSpecializations(expertId: string): Promise<any[]> {
    return await db.select().from(expertSpecializations)
      .where(eq(expertSpecializations.expertId, expertId));
  }

  async addExpertSpecialization(expertId: string, specialization: string): Promise<any> {
    const [created] = await db.insert(expertSpecializations).values({
      expertId,
      specialization
    }).returning();
    return created;
  }

  async removeExpertSpecialization(expertId: string, specialization: string): Promise<void> {
    await db.delete(expertSpecializations)
      .where(and(
        eq(expertSpecializations.expertId, expertId),
        eq(expertSpecializations.specialization, specialization)
      ));
  }

  // Get experts with full profile (experience types, services, specializations)
  async getExpertsWithProfiles(experienceTypeId?: string): Promise<any[]> {
    // Get all users with any expert-like role
    const expertRoles = ["expert", "travel_expert", "local_expert", "event_planner", "executive_assistant"];
    const experts = await db.select().from(users).where(inArray(users.role, expertRoles));
    
    const expertsWithProfiles = await Promise.all(experts.map(async (expert) => {
      // Get expert's experience types
      const expTypes = await db.select({
        id: expertExperienceTypes.id,
        experienceTypeId: expertExperienceTypes.experienceTypeId,
        proficiencyLevel: expertExperienceTypes.proficiencyLevel,
        yearsExperience: expertExperienceTypes.yearsExperience,
        experienceType: experienceTypes
      })
      .from(expertExperienceTypes)
      .leftJoin(experienceTypes, eq(expertExperienceTypes.experienceTypeId, experienceTypes.id))
      .where(eq(expertExperienceTypes.expertId, expert.id));

      // Get expert's services
      const services = await this.getApprovedServicesForExpert(expert.id); // F2: public browse embed — approved only

      // Get expert's specializations
      const specializations = await this.getExpertSpecializations(expert.id);

      // Get expert's local expert form for additional info
      const form = await this.getLocalExpertForm(expert.id);

      // Expert-level rating aggregate (§13-honest). Experts have no rating column of
      // their own, so we derive it from the real, booking-gated reviews on their OWN
      // approved services (the per-service average_rating/review_count already stored
      // on provider_services). Review-count-WEIGHTED mean — equivalent to the true
      // mean of every individual review across the expert's services, so a service
      // with many reviews correctly outweighs one with a single review (a naive
      // average-of-averages would distort that). No fabrication: null → the client
      // renders "New" when the expert has no reviews yet. Zero extra queries — the
      // services are already loaded above.
      let weightedSum = 0;
      let totalReviews = 0;
      for (const s of services) {
        const rc = Number(s.reviewCount ?? 0);
        const ar = s.averageRating != null ? Number(s.averageRating) : null;
        if (rc > 0 && ar != null && !Number.isNaN(ar)) {
          weightedSum += ar * rc;
          totalReviews += rc;
        }
      }
      const expertAverageRating =
        totalReviews > 0 ? Math.round((weightedSum / totalReviews) * 100) / 100 : null;

      return {
        ...expert,
        experienceTypes: expTypes,
        selectedServices: services,
        specializations: specializations.map(s => s.specialization),
        expertForm: form,
        // Computed expert-level aggregate (overrides any column of the same name).
        averageRating: expertAverageRating,
        reviewCount: totalReviews,
      };
    }));

    // SECURITY GATE: local_expert role users MUST have an approved local_expert_forms row
    // to appear anywhere on the platform.  Users who somehow acquire role='local_expert'
    // without completing the approval flow (no form at all, or status='pending'/'rejected')
    // must be excluded from every public-facing expert surface.
    //
    // Other expert roles (travel_expert, event_planner, executive_assistant) have separate
    // onboarding paths and are not gated by local_expert_forms here.
    const approvedExperts = expertsWithProfiles.filter(expert => {
      if (expert.role === 'local_expert') {
        return expert.expertForm?.status === 'approved';
      }
      return true;
    });

    // Strip sensitive user fields before returning to any API consumer.
    // These columns live on the users row but must never leave the server.
    const SENSITIVE_EXPERT_FIELDS = [
      "password",
      "instagramAccessToken",
      "instagramUserId",
    ] as const;
    const scrub = (expert: any) => {
      const safe = { ...expert };
      for (const field of SENSITIVE_EXPERT_FIELDS) delete safe[field];
      return safe;
    };

    // Filter by experience type if provided
    if (experienceTypeId) {
      return approvedExperts
        .filter(expert =>
          expert.experienceTypes.some((et: any) => et.experienceTypeId === experienceTypeId)
        )
        .map(scrub);
    }

    return approvedExperts.map(scrub);
  }

  // Expert Custom Services
  // === Expert Custom Services ===
  //
  // Consolidated in migration 0007: these now read/write provider_services
  // filtered by approval_status. The legacy expert_custom_services table is
  // retained (parallel-run) until 0008 drops it. Shape is mapped back to
  // ProviderServiceListing so route consumers don't change.

  private mapProviderServiceToListing(ps: ProviderService): ProviderServiceListing {
    return {
      id: ps.id,
      expertId: ps.userId,
      title: ps.serviceName,
      description: ps.description ?? null,
      categoryName: null,
      existingCategoryId: null,
      price: ps.price as any,
      duration: ps.duration ?? null,
      deliverables: ps.deliverables as any,
      cancellationPolicy: ps.cancellationPolicy ?? null,
      leadTime: ps.leadTime ?? null,
      imageUrl: ps.serviceImage ?? null,
      galleryImages: ps.galleryImages as any,
      experienceTypes: ps.experienceTypes as any,
      status: (ps.approvalStatus ?? "draft") as any,
      submittedAt: ps.submittedAt ?? null,
      reviewedAt: ps.reviewedAt ?? null,
      reviewedBy: ps.reviewedBy ?? null,
      rejectionReason: ps.rejectionReason ?? null,
      isActive: ps.status === "active",
      bookingsCount: ps.bookingsCount ?? 0,
      averageRating: ps.averageRating ?? "0",
      createdAt: ps.createdAt,
      updatedAt: ps.updatedAt,
    } as ProviderServiceListing;
  }

  async getProviderServiceListings(expertId: string): Promise<ProviderServiceListing[]> {
    const rows = await db.select().from(providerServices)
      .where(eq(providerServices.userId, expertId))
      .orderBy(desc(providerServices.createdAt));
    return rows.map(r => this.mapProviderServiceToListing(r));
  }

  async getProviderServiceListingById(id: string): Promise<ProviderServiceListing | undefined> {
    const [row] = await db.select().from(providerServices).where(eq(providerServices.id, id));
    return row ? this.mapProviderServiceToListing(row) : undefined;
  }

  async getProviderServiceListingsByStatus(status: string): Promise<ProviderServiceListing[]> {
    const rows = await db.select().from(providerServices)
      .where(eq(providerServices.approvalStatus, status))
      .orderBy(desc(providerServices.submittedAt));
    return rows.map(r => this.mapProviderServiceToListing(r));
  }

  async createProviderServiceListing(expertId: string, service: InsertProviderServiceListing): Promise<ProviderServiceListing> {
    // Single taxonomy: experts use service_categories directly (no mapping from expert_service_categories).
    // categoryId comes from the form as a service_categories.id, passed through as-is.
    const categoryId = (service as any).categoryId || null;

    const trackingNumber = await this.generateTrackingNumber('TRV');
    const [newRow] = await db.insert(providerServices).values({
      userId: expertId,
      serviceName: service.title,
      description: service.description ?? null,
      serviceType: "planning",
      categoryId,
      price: service.price as any,
      priceType: "fixed",
      duration: service.duration ?? null,
      deliveryMethod: "async_messaging",
      cancellationPolicy: (service as any).cancellationPolicy ?? null,
      leadTime: (service as any).leadTime ?? null,
      deliverables: (service as any).deliverables ?? [],
      experienceTypes: (service as any).experienceTypes ?? [],
      galleryImages: (service as any).galleryImages ?? [],
      serviceImage: (service as any).imageUrl ?? null,
      whatIncluded: (service as any).deliverables ?? [],
      approvalStatus: "draft",
      status: "draft",
      trackingNumber,
    }).returning();

    await this.registerContent({
      trackingNumber,
      contentType: 'service',
      contentId: newRow.id,
      ownerId: newRow.userId,
      title: newRow.serviceName,
      status: 'draft',
      metadata: { serviceType: newRow.serviceType, categoryId: newRow.categoryId, approvalStatus: 'draft' },
    });

    return this.mapProviderServiceToListing(newRow);
  }

  async updateProviderServiceListing(id: string, updates: Partial<InsertProviderServiceListing>): Promise<ProviderServiceListing | undefined> {
    const patch: any = { updatedAt: new Date() };
    if (updates.title !== undefined) patch.serviceName = updates.title;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.price !== undefined) patch.price = updates.price;
    if (updates.duration !== undefined) patch.duration = updates.duration;
    if ((updates as any).deliverables !== undefined) {
      patch.deliverables = (updates as any).deliverables;
      patch.whatIncluded = (updates as any).deliverables;
    }
    if ((updates as any).cancellationPolicy !== undefined) patch.cancellationPolicy = (updates as any).cancellationPolicy;
    if ((updates as any).leadTime !== undefined) patch.leadTime = (updates as any).leadTime;
    if ((updates as any).imageUrl !== undefined) patch.serviceImage = (updates as any).imageUrl;
    if ((updates as any).galleryImages !== undefined) patch.galleryImages = (updates as any).galleryImages;
    if ((updates as any).experienceTypes !== undefined) patch.experienceTypes = (updates as any).experienceTypes;

    const [row] = await db.update(providerServices)
      .set(patch)
      .where(eq(providerServices.id, id))
      .returning();
    return row ? this.mapProviderServiceToListing(row) : undefined;
  }

  async submitProviderServiceListing(id: string): Promise<ProviderServiceListing | undefined> {
    const [row] = await db.update(providerServices)
      .set({ approvalStatus: "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(providerServices.id, id))
      .returning();
    return row ? this.mapProviderServiceToListing(row) : undefined;
  }

  async approveProviderServiceListing(id: string, reviewedBy: string): Promise<ProviderServiceListing | undefined> {
    const [row] = await db.update(providerServices)
      .set({
        approvalStatus: "approved",
        status: "active",
        reviewedAt: new Date(),
        reviewedBy,
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(providerServices.id, id))
      .returning();
    return row ? this.mapProviderServiceToListing(row) : undefined;
  }

  async rejectProviderServiceListing(id: string, reviewedBy: string, reason: string): Promise<ProviderServiceListing | undefined> {
    const [row] = await db.update(providerServices)
      .set({
        approvalStatus: "rejected",
        reviewedAt: new Date(),
        reviewedBy,
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(providerServices.id, id))
      .returning();
    return row ? this.mapProviderServiceToListing(row) : undefined;
  }

  async deleteProviderServiceListing(id: string): Promise<void> {
    await db.delete(providerServices).where(eq(providerServices.id, id));
  }

  async getApprovedProviderServiceListingsForExperts(expertIds: string[]): Promise<ProviderServiceListing[]> {
    if (expertIds.length === 0) return [];
    const rows = await db.select().from(providerServices)
      .where(and(
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "active"),
        inArray(providerServices.userId, expertIds),
      ));
    return rows.map(r => this.mapProviderServiceToListing(r));
  }

  // Destination Calendar Events
  async getDestinationEvents(country: string, city?: string, status?: string): Promise<DestinationEvent[]> {
    const conditions = [eq(destinationEvents.country, country)];
    if (city) conditions.push(eq(destinationEvents.city, city));
    if (status) conditions.push(eq(destinationEvents.status, status));
    return await db.select().from(destinationEvents).where(and(...conditions)).orderBy(destinationEvents.startMonth);
  }

  async getApprovedDestinationEvents(country: string, city?: string): Promise<DestinationEvent[]> {
    const conditions = [
      eq(destinationEvents.country, country),
      eq(destinationEvents.status, "approved")
    ];
    if (city) conditions.push(eq(destinationEvents.city, city));
    return await db.select().from(destinationEvents).where(and(...conditions)).orderBy(destinationEvents.startMonth);
  }

  async getDestinationEventById(id: string): Promise<DestinationEvent | undefined> {
    const [event] = await db.select().from(destinationEvents).where(eq(destinationEvents.id, id));
    return event;
  }

  async getContributorDestinationEvents(contributorId: string): Promise<DestinationEvent[]> {
    return await db.select().from(destinationEvents)
      .where(eq(destinationEvents.contributorId, contributorId))
      .orderBy(desc(destinationEvents.createdAt));
  }

  async getPendingDestinationEvents(): Promise<DestinationEvent[]> {
    return await db.select().from(destinationEvents)
      .where(eq(destinationEvents.status, "pending"))
      .orderBy(desc(destinationEvents.createdAt));
  }

  async createDestinationEvent(event: InsertDestinationEvent): Promise<DestinationEvent> {
    const [newEvent] = await db.insert(destinationEvents).values(event).returning();
    return newEvent;
  }

  async updateDestinationEvent(id: string, updates: Partial<InsertDestinationEvent>): Promise<DestinationEvent | undefined> {
    const [updated] = await db.update(destinationEvents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(destinationEvents.id, id))
      .returning();
    return updated;
  }

  async submitDestinationEvent(id: string): Promise<DestinationEvent | undefined> {
    const [updated] = await db.update(destinationEvents)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(destinationEvents.id, id))
      .returning();
    return updated;
  }

  async approveDestinationEvent(id: string, reviewedBy: string): Promise<DestinationEvent | undefined> {
    const [updated] = await db.update(destinationEvents)
      .set({ 
        status: "approved", 
        reviewedAt: new Date(), 
        reviewedBy, 
        rejectionReason: null,
        updatedAt: new Date() 
      })
      .where(eq(destinationEvents.id, id))
      .returning();
    return updated;
  }

  async rejectDestinationEvent(id: string, reviewedBy: string, reason: string): Promise<DestinationEvent | undefined> {
    const [updated] = await db.update(destinationEvents)
      .set({ 
        status: "rejected", 
        reviewedAt: new Date(), 
        reviewedBy, 
        rejectionReason: reason,
        updatedAt: new Date() 
      })
      .where(eq(destinationEvents.id, id))
      .returning();
    return updated;
  }

  async deleteDestinationEvent(id: string): Promise<void> {
    await db.delete(destinationEvents).where(eq(destinationEvents.id, id));
  }

  // Destination Seasons
  async getDestinationSeasons(country: string, city?: string): Promise<DestinationSeason[]> {
    const conditions = [eq(destinationSeasons.country, country)];
    if (city) conditions.push(eq(destinationSeasons.city, city));
    return await db.select().from(destinationSeasons).where(and(...conditions)).orderBy(destinationSeasons.month);
  }

  async createDestinationSeason(season: InsertDestinationSeason): Promise<DestinationSeason> {
    const [newSeason] = await db.insert(destinationSeasons).values(season).returning();
    return newSeason;
  }

  async updateDestinationSeason(id: string, updates: Partial<InsertDestinationSeason>): Promise<DestinationSeason | undefined> {
    const [updated] = await db.update(destinationSeasons)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(destinationSeasons.id, id))
      .returning();
    return updated;
  }

  async deleteDestinationSeason(id: string): Promise<void> {
    await db.delete(destinationSeasons).where(eq(destinationSeasons.id, id));
  }

  // Get unique countries with calendar data
  async getCalendarCountries(): Promise<string[]> {
    const events = await db.selectDistinct({ country: destinationEvents.country }).from(destinationEvents).where(eq(destinationEvents.status, "approved"));
    const seasons = await db.selectDistinct({ country: destinationSeasons.country }).from(destinationSeasons);
    const countries = new Set([...events.map(e => e.country), ...seasons.map(s => s.country)]);
    return Array.from(countries).sort();
  }

  // Location Cache
  async searchLocationCache(keyword: string, locationType?: string): Promise<LocationCache[]> {
    const now = new Date();
    const searchPattern = `%${keyword.toLowerCase()}%`;
    
    // Build conditions including expiration check at SQL level
    const conditions = [
      or(
        ilike(locationCache.name, searchPattern),
        ilike(locationCache.cityName, searchPattern),
        ilike(locationCache.iataCode, searchPattern),
        ilike(locationCache.detailedName, searchPattern)
      ),
      gt(locationCache.expiresAt, now) // SQL-level expiration filtering
    ];
    
    if (locationType) {
      conditions.push(eq(locationCache.locationType, locationType));
    }
    
    return await db.select()
      .from(locationCache)
      .where(and(...conditions))
      .limit(20);
  }

  async upsertLocationCache(location: InsertLocationCache): Promise<LocationCache> {
    // Check if exists with same iataCode and locationType
    const existing = await db.select()
      .from(locationCache)
      .where(and(
        eq(locationCache.iataCode, location.iataCode),
        eq(locationCache.locationType, location.locationType)
      ))
      .limit(1);
    
    // Ensure expiresAt is set - default to 30 days if not provided
    const expiresAt = location.expiresAt || (() => {
      const date = new Date();
      date.setDate(date.getDate() + 30);
      return date;
    })();
    
    if (existing.length > 0) {
      // Update existing with refreshed expiration
      const [updated] = await db.update(locationCache)
        .set({ ...location, expiresAt, lastUpdated: new Date() })
        .where(eq(locationCache.id, existing[0].id))
        .returning();
      return updated;
    }
    
    // Insert new
    const [newLocation] = await db.insert(locationCache).values({ ...location, expiresAt }).returning();
    return newLocation;
  }

  async getLocationByIataCode(iataCode: string, locationType?: string): Promise<LocationCache | undefined> {
    const now = new Date();
    const conditions = [
      eq(locationCache.iataCode, iataCode),
      gt(locationCache.expiresAt, now) // Only return non-expired entries
    ];
    if (locationType) {
      conditions.push(eq(locationCache.locationType, locationType));
    }
    
    const [result] = await db.select()
      .from(locationCache)
      .where(and(...conditions))
      .limit(1);
    
    return result;
  }

  // Expert Templates
  async getExpertTemplates(filters?: { expertId?: string; isPublished?: boolean; approvalStatus?: string; category?: string; destination?: string }): Promise<ExpertTemplate[]> {
    const conditions = [];
    if (filters?.expertId) {
      conditions.push(eq(expertTemplates.expertId, filters.expertId));
    }
    if (filters?.isPublished !== undefined) {
      conditions.push(eq(expertTemplates.isPublished, filters.isPublished));
    }
    // Marketplace read-gate (D1a / §10 "safety before surfacing"): public surfaces pass
    // approvalStatus:'approved' so an unapproved (draft/submitted/rejected) template — even one the
    // expert has self-published — never leaks into the public feed. The owner console and admin
    // reads omit this filter intentionally (owner sees their own pipeline; admin sees the queue).
    if (filters?.approvalStatus) {
      conditions.push(eq(expertTemplates.approvalStatus, filters.approvalStatus));
    }
    if (filters?.category) {
      conditions.push(eq(expertTemplates.category, filters.category));
    }
    if (filters?.destination) {
      conditions.push(ilike(expertTemplates.destination, `%${filters.destination}%`));
    }
    
    // Quality ordering (packages-in-discovery): featured first, then proven sellers, then rating,
    // then recency — so the public feed and B4 surfaces lead with the strongest packages instead
    // of raw insertion order. Owner/admin reads share the ordering harmlessly.
    const ordering = [
      desc(expertTemplates.isFeatured),
      desc(expertTemplates.salesCount),
      desc(expertTemplates.averageRating),
      desc(expertTemplates.createdAt),
    ];
    if (conditions.length > 0) {
      return await db.select().from(expertTemplates).where(and(...conditions)).orderBy(...ordering);
    }
    return await db.select().from(expertTemplates).orderBy(...ordering);
  }

  async getExpertTemplate(id: string): Promise<ExpertTemplate | undefined> {
    const [template] = await db.select().from(expertTemplates).where(eq(expertTemplates.id, id));
    return template;
  }

  async createExpertTemplate(template: InsertExpertTemplate): Promise<ExpertTemplate> {
    const trackingNumber = await this.generateTrackingNumber('TRV');
    const [newTemplate] = await db.insert(expertTemplates).values({ ...template, trackingNumber }).returning();
    
    // Auto-register in content tracking system
    await this.registerContent({
      trackingNumber,
      contentType: 'template',
      contentId: newTemplate.id,
      ownerId: newTemplate.expertId,
      title: newTemplate.title,
      status: newTemplate.isPublished ? 'published' : 'draft',
      metadata: { destination: newTemplate.destination, category: newTemplate.category, price: newTemplate.price },
    });
    
    return newTemplate;
  }

  async updateExpertTemplate(id: string, updates: Partial<InsertExpertTemplate>): Promise<ExpertTemplate | undefined> {
    const [updated] = await db.update(expertTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(expertTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteExpertTemplate(id: string): Promise<void> {
    await db.delete(expertTemplates).where(eq(expertTemplates.id, id));
  }

  // ── Approval workflow (marketplace activation, shared queue = Phase 4's queue) ──
  async getSubmittedExpertTemplates(): Promise<ExpertTemplate[]> {
    return await db.select().from(expertTemplates)
      .where(eq(expertTemplates.approvalStatus, "submitted"))
      .orderBy(desc(expertTemplates.submittedAt));
  }

  async submitExpertTemplate(id: string): Promise<ExpertTemplate | undefined> {
    const [row] = await db.update(expertTemplates)
      .set({ approvalStatus: "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(expertTemplates.id, id))
      .returning();
    return row;
  }

  async approveExpertTemplate(id: string, reviewedBy: string): Promise<ExpertTemplate | undefined> {
    const [row] = await db.update(expertTemplates)
      .set({ approvalStatus: "approved", reviewedAt: new Date(), reviewedBy, rejectionReason: null, updatedAt: new Date() })
      .where(eq(expertTemplates.id, id))
      .returning();
    return row;
  }

  async rejectExpertTemplate(id: string, reviewedBy: string, reason: string): Promise<ExpertTemplate | undefined> {
    const [row] = await db.update(expertTemplates)
      .set({ approvalStatus: "rejected", reviewedAt: new Date(), reviewedBy, rejectionReason: reason, updatedAt: new Date() })
      .where(eq(expertTemplates.id, id))
      .returning();
    return row;
  }

  async incrementTemplateView(id: string): Promise<void> {
    await db.update(expertTemplates)
      .set({ viewCount: sql`${expertTemplates.viewCount} + 1` })
      .where(eq(expertTemplates.id, id));
  }

  // Template Purchases
  async getTemplatePurchases(filters?: { buyerId?: string; expertId?: string }): Promise<TemplatePurchase[]> {
    const conditions = [];
    if (filters?.buyerId) {
      conditions.push(eq(templatePurchases.buyerId, filters.buyerId));
    }
    if (filters?.expertId) {
      conditions.push(eq(templatePurchases.expertId, filters.expertId));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(templatePurchases).where(and(...conditions)).orderBy(desc(templatePurchases.purchasedAt));
    }
    return await db.select().from(templatePurchases).orderBy(desc(templatePurchases.purchasedAt));
  }

  async getTemplatePurchase(id: string): Promise<TemplatePurchase | undefined> {
    const [purchase] = await db.select().from(templatePurchases).where(eq(templatePurchases.id, id));
    return purchase;
  }

  async createTemplatePurchase(purchase: InsertTemplatePurchase): Promise<TemplatePurchase> {
    const [newPurchase] = await db.insert(templatePurchases).values(purchase).returning();
    
    // Update template sales count
    await db.update(expertTemplates)
      .set({ salesCount: sql`${expertTemplates.salesCount} + 1` })
      .where(eq(expertTemplates.id, purchase.templateId));
    
    // Record platform revenue for template sale
    const grossAmount = parseFloat(newPurchase.price || '0');
    const platformFee = parseFloat(newPurchase.platformFee || '0');
    const expertEarningsAmount = parseFloat(newPurchase.expertEarnings || '0');
    
    if (newPurchase.status === 'completed') {
      // Get template tracking number
      const [template] = await db.select({ trackingNumber: expertTemplates.trackingNumber })
        .from(expertTemplates)
        .where(eq(expertTemplates.id, purchase.templateId))
        .limit(1);
      
      // Record platform revenue if there's a platform fee
      if (platformFee > 0) {
        await this.recordPlatformRevenue({
          sourceType: 'template_commission',
          sourceId: newPurchase.id,
          trackingNumber: template?.trackingNumber || undefined,
          grossAmount: String(grossAmount),
          platformFee: String(platformFee),
          netAmount: String(platformFee * (1 - PROCESSING_FEE_RATE)),
          processingFees: String(platformFee * PROCESSING_FEE_RATE),
          expertId: newPurchase.expertId || undefined,
          expertEarnings: String(expertEarningsAmount),
          description: `Template sale commission`,
          status: 'recorded',
          transactionDate: new Date(),
        });
      }
      
      // Create expert earning record only if amount > 0
      if (newPurchase.expertId && expertEarningsAmount > 0) {
        await this.createExpertEarning({
          expertId: newPurchase.expertId,
          type: 'template_sale',
          amount: String(expertEarningsAmount),
          referenceId: newPurchase.id,
          referenceType: 'template_purchase',
          description: `Template sale earnings`,
          status: 'held', // escrow: born held (migration 112)
          availableAt: availableAtFor('template_sale'), // P2: real (gated on completed purchase) — clears after template window
        });
      }
    }
    
    return newPurchase;
  }

  async hasUserPurchasedTemplate(userId: string, templateId: string): Promise<boolean> {
    const [purchase] = await db.select()
      .from(templatePurchases)
      .where(and(
        eq(templatePurchases.buyerId, userId),
        eq(templatePurchases.templateId, templateId),
        eq(templatePurchases.status, 'completed')
      ))
      .limit(1);
    return !!purchase;
  }

  // Template Reviews
  async getTemplateReviews(templateId: string): Promise<TemplateReview[]> {
    return await db.select().from(templateReviews).where(eq(templateReviews.templateId, templateId)).orderBy(desc(templateReviews.createdAt));
  }

  async createTemplateReview(review: InsertTemplateReview): Promise<TemplateReview> {
    const [newReview] = await db.insert(templateReviews).values(review).returning();
    
    // Update template review count and average rating
    const allReviews = await this.getTemplateReviews(review.templateId);
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await db.update(expertTemplates)
      .set({ reviewCount: allReviews.length, averageRating: avgRating.toFixed(2) })
      .where(eq(expertTemplates.id, review.templateId));
    
    return newReview;
  }

  // Expert Earnings
  async getExpertEarnings(expertId: string): Promise<ExpertEarning[]> {
    return await db.select().from(expertEarnings).where(eq(expertEarnings.expertId, expertId)).orderBy(desc(expertEarnings.createdAt));
  }

  // Escrow earning summary (unified — migration 112 / docs/design/escrow-spine.md). ONE reducer for
  // both expert_earnings and provider_earnings. Vocabulary: held / releasable / paid_out / reversed.
  // Releasability is COMPUTED (Phase 1 has no release job yet): a 'releasable' row is payable; a 'held'
  // row is payable once its available_at clears AND it isn't disputed. This reproduces the old
  // status='available' && (available_at IS NULL|<=now) "ready" test exactly (the backfill mapped the old
  // ready rows to 'releasable' and gives new held rows an available_at). Keys {total,pending,available,
  // paidOut} are unchanged so callers don't break. 'reversed' is excluded from all buckets.
  private summarizeEscrowEarnings(
    earnings: Array<{ amount: string | null; status: string | null; availableAt: Date | null; disputeState?: string | null }>,
  ): { total: number; pending: number; available: number; paidOut: number } {
    const now = new Date();
    const amt = (e: { amount: string | null }) => parseFloat(e.amount || '0');
    const isReleasable = (e: { status: string | null; availableAt: Date | null; disputeState?: string | null }) =>
      e.status === 'releasable' ||
      (e.status === 'held' && e.availableAt !== null && new Date(e.availableAt) <= now && e.disputeState !== 'open');
    const live = earnings.filter(e => e.status !== 'reversed');
    return {
      total: live.reduce((sum, e) => sum + amt(e), 0),
      pending: live.filter(e => e.status !== 'paid_out' && !isReleasable(e)).reduce((sum, e) => sum + amt(e), 0),
      available: live.filter(isReleasable).reduce((sum, e) => sum + amt(e), 0),
      paidOut: live.filter(e => e.status === 'paid_out').reduce((sum, e) => sum + amt(e), 0),
    };
  }

  async getExpertEarningsSummary(expertId: string): Promise<{ total: number; pending: number; available: number; paidOut: number }> {
    return this.summarizeEscrowEarnings(await this.getExpertEarnings(expertId) as any);
  }

  async createExpertEarning(earning: InsertExpertEarning): Promise<ExpertEarning> {
    const [newEarning] = await db.insert(expertEarnings).values(earning).returning();
    return newEarning;
  }

  // Expert Payouts
  async getExpertPayouts(expertId: string): Promise<ExpertPayout[]> {
    return await db.select().from(expertPayouts).where(eq(expertPayouts.expertId, expertId)).orderBy(desc(expertPayouts.requestedAt));
  }

  async createExpertPayout(payout: InsertExpertPayout): Promise<ExpertPayout> {
    const [newPayout] = await db.insert(expertPayouts).values(payout).returning();
    return newPayout;
  }

  // Revenue Splits
  async getRevenueSplits(): Promise<RevenueSplit[]> {
    return await db.select().from(revenueSplits).where(eq(revenueSplits.isActive, true));
  }

  async getRevenueSplit(type: string): Promise<RevenueSplit | undefined> {
    const [split] = await db.select().from(revenueSplits)
      .where(and(eq(revenueSplits.type, type), eq(revenueSplits.isActive, true)));
    return split;
  }

  // Expert Tips
  async getExpertTips(expertId: string): Promise<ExpertTip[]> {
    return await db.select().from(expertTips)
      .where(eq(expertTips.expertId, expertId))
      .orderBy(desc(expertTips.createdAt));
  }

  async createExpertTip(tip: InsertExpertTip): Promise<ExpertTip> {
    // Resolve tip commission rates from booking_fee_configs (canonical source).
    // Falls back to hardcoded 25/75 if no "tip" row exists, but the startup seed
    // inserts a "tip" row with platform_fee=5 / expert_share=95 to match legacy behaviour. // fee-literal-ok: comment describing legacy seed, actual code uses resolveCommissionRates
    const { platformFeeRate } = await resolveCommissionRates({ category: 'tip' });
    const tipAmount = parseFloat(String(tip.amount));
    const platformFee = tipAmount * platformFeeRate;
    const expertAmount = tipAmount - platformFee;

    // Generate tracking number for content registry
    const trackingNumber = await this.generateTrackingNumber('TRV');

    const [newTip] = await db.insert(expertTips).values({
      ...tip,
      trackingNumber,
      platformFee: String(platformFee),
      expertAmount: String(expertAmount),
    }).returning();

    // Auto-register in content tracking system
    await this.registerContent({
      trackingNumber,
      contentType: 'tip',
      contentId: newTip.id,
      ownerId: tip.expertId,
      title: `Tip from traveler`,
      status: 'published',
    });

    // Create expert earning record only if amount > 0
    if (expertAmount > 0) {
      await this.createExpertEarning({
        expertId: tip.expertId,
        type: 'tip',
        amount: String(expertAmount),
        referenceId: newTip.id,
        referenceType: 'expert_tip',
        description: tip.message ? `Tip: ${tip.message.substring(0, 50)}` : 'Tip from traveler',
        status: 'held', // escrow: born held (migration 112)
        availableAt: availableAtFor('tip'), // P2: tip window (default 0 = immediate)
      });
    }

    // Record platform revenue from tip commission with tracking number
    if (platformFee > 0) {
      await this.recordPlatformRevenue({
        sourceType: 'tip_commission',
        sourceId: newTip.id,
        trackingNumber,
        grossAmount: String(tipAmount),
        platformFee: String(platformFee),
        netAmount: String(platformFee * (1 - PROCESSING_FEE_RATE)),
        processingFees: String(platformFee * PROCESSING_FEE_RATE),
        expertId: tip.expertId,
        expertEarnings: String(expertAmount),
        description: `Tip commission from ${tip.travelerId || 'traveler'}`,
        status: 'recorded',
        transactionDate: new Date(),
      });
    }

    return newTip;
  }

  async getTipsForExpert(expertId: string): Promise<{ tips: ExpertTip[]; totalAmount: number }> {
    const tips = await this.getExpertTips(expertId);
    const totalAmount = tips
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + parseFloat(t.expertAmount || '0'), 0);
    return { tips, totalAmount };
  }

  // Expert Referrals
  async getExpertReferrals(referrerId: string): Promise<ExpertReferral[]> {
    return await db.select().from(expertReferrals)
      .where(eq(expertReferrals.referrerId, referrerId))
      .orderBy(desc(expertReferrals.createdAt));
  }

  async createExpertReferral(referral: InsertExpertReferral): Promise<ExpertReferral> {
    const [newReferral] = await db.insert(expertReferrals).values(referral).returning();
    return newReferral;
  }

  async getReferralByCode(code: string): Promise<ExpertReferral | undefined> {
    const [referral] = await db.select().from(expertReferrals)
      .where(eq(expertReferrals.referralCode, code));
    return referral;
  }

  async updateReferralStatus(id: string, status: string, qualifiedAt?: Date): Promise<void> {
    await db.update(expertReferrals)
      .set({ status, qualifiedAt: qualifiedAt || new Date() })
      .where(eq(expertReferrals.id, id));

    // If status is qualified, create the referral bonus earning
    if (status === 'qualified') {
      const [referral] = await db.select().from(expertReferrals).where(eq(expertReferrals.id, id));
      if (referral) {
        await this.createExpertEarning({
          expertId: referral.referrerId,
          type: 'referral_bonus',
          amount: referral.bonusAmount || '50',
          referenceId: referral.id,
          referenceType: 'expert_referral',
          description: 'Referral bonus for new expert signup',
          status: 'held', // escrow: born held (migration 112)
          availableAt: availableAtFor('referral_bonus'), // P2: referral window (default 0 = immediate)
        });
      }
    }
  }

  // Affiliate Earnings
  async getAffiliateEarnings(expertId: string): Promise<AffiliateEarning[]> {
    return await db.select().from(affiliateEarnings)
      .where(eq(affiliateEarnings.expertId, expertId))
      .orderBy(desc(affiliateEarnings.createdAt));
  }

  async createAffiliateEarning(earning: InsertAffiliateEarning): Promise<AffiliateEarning> {
    const [newEarning] = await db.insert(affiliateEarnings).values(earning).returning();

    // Also create an expert earning record for the expert's share — only when there's a real
    // expert counterparty to credit (expert_earnings.expert_id is NOT NULL). R4/F7: the confirm
    // site can create an affiliate_earnings row with no expert assigned yet (an unclaimed
    // booking confirmed by an admin); skip the expert-earning side record rather than violating
    // the FK / crediting the wrong actor.
    if (earning.expertId) {
      await this.createExpertEarning({
        expertId: earning.expertId,
        type: 'affiliate_commission',
        amount: earning.expertShare,
        referenceId: newEarning.id,
        referenceType: 'affiliate_earning',
        description: `Affiliate commission from booking`,
        status: 'held', // escrow: born held (migration 112)
        availableAt: availableAtFor('affiliate_commission'), // P2: clears after affiliate window
      });
    }

    return newEarning;
  }

  async getAffiliateEarningsSummary(expertId: string): Promise<{ total: number; pending: number; confirmed: number; paid: number }> {
    const earnings = await this.getAffiliateEarnings(expertId);

    return {
      total: earnings.reduce((sum, e) => sum + parseFloat(e.expertShare || '0'), 0),
      pending: earnings.filter(e => e.status === 'pending').reduce((sum, e) => sum + parseFloat(e.expertShare || '0'), 0),
      confirmed: earnings.filter(e => e.status === 'confirmed').reduce((sum, e) => sum + parseFloat(e.expertShare || '0'), 0),
      paid: earnings.filter(e => e.status === 'paid').reduce((sum, e) => sum + parseFloat(e.expertShare || '0'), 0),
    };
  }

  // Platform-wide affiliate revenue (the PLATFORM's cut, not any one expert's). Affiliate commission
  // is earned on external partner networks so it never flows through platform_revenue / Stripe — this
  // sums affiliate_earnings.platform_share across ALL rows so the admin revenue dashboard can show
  // affiliate alongside booking/template/optimization revenue. Read-only aggregate; by status.
  async getPlatformAffiliateRevenueSummary(): Promise<{ total: number; pending: number; confirmed: number; paid: number }> {
    const rows = await db.select().from(affiliateEarnings);
    const sum = (list: typeof rows) => list.reduce((s, e) => s + parseFloat(e.platformShare || "0"), 0);
    return {
      total: sum(rows),
      pending: sum(rows.filter((e) => e.status === "pending")),
      confirmed: sum(rows.filter((e) => e.status === "confirmed")),
      paid: sum(rows.filter((e) => e.status === "paid")),
    };
  }

  // === Provider Earnings & Payouts ===

  async getProviderEarnings(providerId: string): Promise<ProviderEarning[]> {
    return await db.select().from(providerEarnings).where(eq(providerEarnings.providerId, providerId)).orderBy(desc(providerEarnings.createdAt));
  }

  async getProviderEarningsSummary(providerId: string): Promise<{ total: number; pending: number; available: number; paidOut: number }> {
    return this.summarizeEscrowEarnings(await this.getProviderEarnings(providerId) as any);
  }

  async createProviderEarning(earning: InsertProviderEarning): Promise<ProviderEarning> {
    const [newEarning] = await db.insert(providerEarnings).values(earning).returning();
    return newEarning;
  }

  // Escrow release (spine Phase 2 / docs/design/escrow-spine.md): flip held → releasable once the
  // clearance window has passed and no dispute is open. Atomic conditional UPDATE (the WHERE is the
  // guard) on both ledgers; idempotent — a second run matches nothing. NULL availableAt is never
  // released here (stuck-held rows stay held until an explicit backfill decision — Phase 2b). The
  // dispute check uses IS DISTINCT FROM so a NULL dispute_state still releases.
  async releaseMaturedEarnings(now: Date = new Date()): Promise<{ expert: number; provider: number }> {
    const expertRows = await db.update(expertEarnings)
      .set({ status: 'releasable' })
      .where(and(
        eq(expertEarnings.status, 'held'),
        isNotNull(expertEarnings.availableAt),
        lte(expertEarnings.availableAt, now),
        sqlOp`${expertEarnings.disputeState} IS DISTINCT FROM 'open'`,
      ))
      .returning({ id: expertEarnings.id });
    const providerRows = await db.update(providerEarnings)
      .set({ status: 'releasable', updatedAt: now })
      .where(and(
        eq(providerEarnings.status, 'held'),
        isNotNull(providerEarnings.availableAt),
        lte(providerEarnings.availableAt, now),
        sqlOp`${providerEarnings.disputeState} IS DISTINCT FROM 'open'`,
      ))
      .returning({ id: providerEarnings.id });
    return { expert: expertRows.length, provider: providerRows.length };
  }

  // ── Escrow Phase 3: booking-linked traveler confirm / dispute (docs/design/escrow-spine.md) ──
  // Earnings link to a booking via provider_earnings.source_id and expert_earnings.reference_id.

  /** Traveler confirmed completion → early-release the booking's held, undisputed earnings. */
  async releaseEarningsForBooking(bookingId: string, now: Date = new Date()): Promise<number> {
    const prov = await db.update(providerEarnings)
      .set({ status: 'releasable', availableAt: now, updatedAt: now })
      .where(and(
        eq(providerEarnings.sourceId, bookingId),
        eq(providerEarnings.status, 'held'),
        sqlOp`${providerEarnings.disputeState} IS DISTINCT FROM 'open'`,
      ))
      .returning({ id: providerEarnings.id });
    const exp = await db.update(expertEarnings)
      .set({ status: 'releasable', availableAt: now })
      .where(and(
        eq(expertEarnings.referenceId, bookingId),
        eq(expertEarnings.status, 'held'),
        sqlOp`${expertEarnings.disputeState} IS DISTINCT FROM 'open'`,
      ))
      .returning({ id: expertEarnings.id });
    return prov.length + exp.length;
  }

  /**
   * Set/clear the dispute flag on a booking's unpaid earnings.
   * open=true: a dispute blocks release — pull any unpaid earning (held OR releasable) back to
   *   `held` + `dispute_state='open'`, so the summary's held+dispute exclusion keeps it out of the
   *   payable balance. (releasable rows are only dispute-checked once forced back to held; that's
   *   the "disputed ⟹ held" invariant.) paid_out earnings are NOT touched — post-payout claw-back
   *   is Phase 4, not the automated spine.
   * open=false: dispute rejected — clear the flag; the earning stays held and re-clears via the
   *   release job/summary once its availableAt passes (already past for a completed booking).
   */
  async setBookingEarningsDispute(bookingId: string, open: boolean, now: Date = new Date()): Promise<number> {
    if (open) {
      const prov = await db.update(providerEarnings)
        .set({ status: 'held', disputeState: 'open', updatedAt: now })
        .where(and(eq(providerEarnings.sourceId, bookingId), sqlOp`${providerEarnings.status} IN ('held','releasable')`))
        .returning({ id: providerEarnings.id });
      const exp = await db.update(expertEarnings)
        .set({ status: 'held', disputeState: 'open' })
        .where(and(eq(expertEarnings.referenceId, bookingId), sqlOp`${expertEarnings.status} IN ('held','releasable')`))
        .returning({ id: expertEarnings.id });
      return prov.length + exp.length;
    }
    const prov = await db.update(providerEarnings)
      .set({ disputeState: 'none', updatedAt: now })
      .where(and(eq(providerEarnings.sourceId, bookingId), eq(providerEarnings.disputeState, 'open')))
      .returning({ id: providerEarnings.id });
    const exp = await db.update(expertEarnings)
      .set({ disputeState: 'none' })
      .where(and(eq(expertEarnings.referenceId, bookingId), eq(expertEarnings.disputeState, 'open')))
      .returning({ id: expertEarnings.id });
    return prov.length + exp.length;
  }

  // ── Escrow Phase 4: reversal (refund / dispute upheld) — docs/design/escrow-spine.md ──
  //
  // Reversal is only ever applied to money still in escrow (held OR releasable). paid_out earnings
  // are NEVER auto-clawed-back (ratified: "reversal only while held/releasable") — a post-payout
  // reversal is a manual admin action. reverseEarningsForBooking counts any paid_out earning it had
  // to skip so the caller can surface "manual clawback needed" instead of silently under-reversing.

  /**
   * Reverse a booking's in-escrow earnings: flip held/releasable → 'reversed' on both ledgers.
   * Atomic conditional UPDATE (the WHERE is the guard) → idempotent: a second call flips nothing.
   * paid_out rows are counted (skippedPaidOut) but left untouched — no automated post-payout clawback.
   */
  async reverseEarningsForBooking(bookingId: string, now: Date = new Date()): Promise<{ reversed: number; skippedPaidOut: number }> {
    const prov = await db.update(providerEarnings)
      .set({ status: 'reversed', updatedAt: now })
      .where(and(eq(providerEarnings.sourceId, bookingId), sqlOp`${providerEarnings.status} IN ('held','releasable')`))
      .returning({ id: providerEarnings.id });
    const exp = await db.update(expertEarnings)
      .set({ status: 'reversed' })
      .where(and(eq(expertEarnings.referenceId, bookingId), sqlOp`${expertEarnings.status} IN ('held','releasable')`))
      .returning({ id: expertEarnings.id });
    const paidProv = await db.select({ id: providerEarnings.id })
      .from(providerEarnings)
      .where(and(eq(providerEarnings.sourceId, bookingId), eq(providerEarnings.status, 'paid_out')));
    const paidExp = await db.select({ id: expertEarnings.id })
      .from(expertEarnings)
      .where(and(eq(expertEarnings.referenceId, bookingId), eq(expertEarnings.status, 'paid_out')));
    return { reversed: prov.length + exp.length, skippedPaidOut: paidProv.length + paidExp.length };
  }

  /**
   * Reverse a booking's recognised platform revenue. platform_revenue totals sum every row
   * regardless of status, so a reversal is a compensating NEGATIVE entry (double-entry) — that also
   * flows through recordPlatformRevenue into the daily summary, keeping both nets correct without
   * touching any reader. The original row's status is flipped to 'reversed' as the idempotency guard:
   * an atomic claim (WHERE status <> 'reversed') means a second call finds nothing and inserts no
   * second compensating row. Returns the number of original rows reversed.
   */
  async reversePlatformRevenueForBooking(bookingId: string, now: Date = new Date()): Promise<number> {
    const originals = await db.update(platformRevenue)
      .set({ status: 'reversed' })
      .where(and(eq(platformRevenue.sourceId, bookingId), sqlOp`${platformRevenue.status} <> 'reversed'`))
      .returning();
    for (const o of originals) {
      const neg = (v: string | null) => String(-parseFloat(v || '0'));
      await this.recordPlatformRevenue({
        sourceType: o.sourceType,
        sourceId: o.sourceId,
        trackingNumber: o.trackingNumber,
        grossAmount: neg(o.grossAmount),
        platformFee: neg(o.platformFee),
        netAmount: neg(o.netAmount),
        processingFees: neg(o.processingFees),
        currency: o.currency,
        expertId: o.expertId,
        expertEarnings: neg(o.expertEarnings),
        providerId: o.providerId,
        providerEarnings: neg(o.providerEarnings),
        description: `Reversal of platform revenue ${o.id} (booking ${bookingId})`,
        metadata: { reversalOf: o.id, reason: 'escrow_reversal' },
        status: 'reversed',
        transactionDate: now,
      } as any);
    }
    return originals.length;
  }

  async getProviderPayouts(providerId: string): Promise<ProviderPayout[]> {
    return await db.select().from(providerPayouts).where(eq(providerPayouts.providerId, providerId)).orderBy(desc(providerPayouts.requestedAt));
  }

  async createProviderPayout(payout: InsertProviderPayout): Promise<ProviderPayout> {
    const [newPayout] = await db.insert(providerPayouts).values(payout).returning();
    return newPayout;
  }

  // Admin Payouts
  async getAllExpertPayouts(status?: string): Promise<(ExpertPayout & { requesterName?: string; requesterEmail?: string })[]> {
    const conditions = status ? [eq(expertPayouts.status, status)] : [];
    const payouts = await db.select({
      id: expertPayouts.id,
      expertId: expertPayouts.expertId,
      amount: expertPayouts.amount,
      currency: expertPayouts.currency,
      payoutMethod: expertPayouts.payoutMethod,
      status: expertPayouts.status,
      processedAt: expertPayouts.processedAt,
      failureReason: expertPayouts.failureReason,
      transactionId: expertPayouts.transactionId,
      metadata: expertPayouts.metadata,
      requestedAt: expertPayouts.requestedAt,
      requesterName: users.name,
      requesterEmail: users.email,
    }).from(expertPayouts)
      .leftJoin(users, eq(expertPayouts.expertId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(expertPayouts.requestedAt));
    return payouts;
  }

  async getAllProviderPayouts(status?: string): Promise<(ProviderPayout & { requesterName?: string; requesterEmail?: string })[]> {
    const conditions = status ? [eq(providerPayouts.status, status)] : [];
    const payouts = await db.select({
      id: providerPayouts.id,
      providerId: providerPayouts.providerId,
      amount: providerPayouts.amount,
      currency: providerPayouts.currency,
      payoutMethod: providerPayouts.payoutMethod,
      status: providerPayouts.status,
      payoutReference: providerPayouts.payoutReference,
      notes: providerPayouts.notes,
      requestedAt: providerPayouts.requestedAt,
      processedAt: providerPayouts.processedAt,
      completedAt: providerPayouts.completedAt,
      requesterName: users.name,
      requesterEmail: users.email,
    }).from(providerPayouts)
      .leftJoin(users, eq(providerPayouts.providerId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(providerPayouts.requestedAt));
    return payouts;
  }

  async updateExpertPayoutStatus(id: string, status: string, notes?: string, transactionId?: string): Promise<ExpertPayout> {
    const updates: any = { status };
    if (status === 'completed' || status === 'failed') updates.processedAt = new Date();
    if (notes) updates.failureReason = notes;
    if (transactionId) updates.transactionId = transactionId;
    const [updated] = await db.update(expertPayouts).set(updates).where(eq(expertPayouts.id, id)).returning();
    return updated;
  }

  // Atomic claim before a Stripe transfer (money-safety idempotency): flip to 'processing' ONLY
  // if not already completed/processing. Returns undefined if another caller already claimed/
  // completed it — the transition IS the concurrency guard, so a double-invocation transfers once.
  async claimExpertPayoutForProcessing(id: string): Promise<ExpertPayout | undefined> {
    const [row] = await db.update(expertPayouts)
      .set({ status: 'processing', processedAt: new Date() })
      .where(and(eq(expertPayouts.id, id), sqlOp`${expertPayouts.status} NOT IN ('completed','processing')`))
      .returning();
    return row;
  }

  async claimProviderPayoutForProcessing(id: string): Promise<ProviderPayout | undefined> {
    const [row] = await db.update(providerPayouts)
      .set({ status: 'processing', processedAt: new Date() })
      .where(and(eq(providerPayouts.id, id), sqlOp`${providerPayouts.status} NOT IN ('completed','processing')`))
      .returning();
    return row;
  }

  async updateProviderPayoutStatus(id: string, status: string, notes?: string, payoutReference?: string): Promise<ProviderPayout> {
    const updates: any = { status };
    if (status === 'processing') updates.processedAt = new Date();
    if (status === 'completed') updates.completedAt = new Date();
    if (notes) updates.notes = notes;
    if (payoutReference) updates.payoutReference = payoutReference;
    const [updated] = await db.update(providerPayouts).set(updates).where(eq(providerPayouts.id, id)).returning();
    return updated;
  }

  // Stripe Connect
  async updateUserStripeAccount(userId: string, stripeAccountId: string, status: string): Promise<void> {
    await db.update(users).set({
      stripeAccountId,
      stripeAccountStatus: status,
      canReceivePayments: status === 'active',
    } as any).where(eq(users.id, userId));
  }

  async getUserStripeAccount(userId: string): Promise<{ stripeAccountId: string | null; stripeAccountStatus: string | null; canReceivePayments: boolean | null }> {
    const [user] = await db.select({
      stripeAccountId: users.stripeAccountId,
      stripeAccountStatus: users.stripeAccountStatus,
      canReceivePayments: users.canReceivePayments,
    }).from(users).where(eq(users.id, userId));
    return user || { stripeAccountId: null, stripeAccountStatus: null, canReceivePayments: null };
  }

  // === Platform Revenue ===

  async hasPlatformRevenueForSource(sourceId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: platformRevenue.id })
      .from(platformRevenue)
      .where(eq(platformRevenue.sourceId, sourceId))
      .limit(1);
    return !!row;
  }

  async recordPlatformRevenue(revenue: InsertPlatformRevenue): Promise<PlatformRevenue> {
    const [newRevenue] = await db.insert(platformRevenue).values(revenue).returning();
    
    // Update daily summary
    const date = new Date(revenue.transactionDate || new Date()).toISOString().split('T')[0];
    await this.updateDailyRevenueSummary(date, {
      totalGross: String(parseFloat(revenue.grossAmount) || 0),
      totalPlatformFee: String(parseFloat(revenue.platformFee) || 0),
      totalNet: String(parseFloat(revenue.netAmount) || 0),
    });
    
    return newRevenue;
  }

  async getPlatformRevenue(filters?: { startDate?: Date; endDate?: Date; sourceType?: string; status?: string }): Promise<PlatformRevenue[]> {
    let query = db.select().from(platformRevenue);
    
    const conditions = [];
    if (filters?.sourceType) {
      conditions.push(eq(platformRevenue.sourceType, filters.sourceType));
    }
    if (filters?.status) {
      conditions.push(eq(platformRevenue.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(sql`${platformRevenue.transactionDate} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${platformRevenue.transactionDate} <= ${filters.endDate}`);
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(desc(platformRevenue.transactionDate));
  }

  async getPlatformRevenueSummary(startDate?: Date, endDate?: Date): Promise<{
    totalGross: number;
    totalPlatformFee: number;
    totalNet: number;
    totalExpertEarnings: number;
    totalProviderEarnings: number;
    bySource: Record<string, number>;
    totalReversedGross: number;
    totalReversedFee: number;
    reversedBySource: Record<string, number>;
  }> {
    const revenues = await this.getPlatformRevenue({ startDate, endDate });
    
    const active = revenues.filter(r => r.status !== 'reversed');
    const reversed = revenues.filter(r => r.status === 'reversed');

    const bySource: Record<string, number> = {};
    for (const r of active) {
      const source = r.sourceType || 'other';
      bySource[source] = (bySource[source] || 0) + parseFloat(r.platformFee || '0');
    }

    const reversedBySource: Record<string, number> = {};
    for (const r of reversed) {
      const source = r.sourceType || 'other';
      reversedBySource[source] = (reversedBySource[source] || 0) + parseFloat(r.platformFee || '0');
    }
    
    return {
      totalGross: active.reduce((sum, r) => sum + parseFloat(r.grossAmount || '0'), 0),
      totalPlatformFee: active.reduce((sum, r) => sum + parseFloat(r.platformFee || '0'), 0),
      totalNet: active.reduce((sum, r) => sum + parseFloat(r.netAmount || '0'), 0),
      totalExpertEarnings: active.reduce((sum, r) => sum + parseFloat(r.expertEarnings || '0'), 0),
      totalProviderEarnings: active.reduce((sum, r) => sum + parseFloat(r.providerEarnings || '0'), 0),
      bySource,
      totalReversedGross: reversed.reduce((sum, r) => sum + parseFloat(r.grossAmount || '0'), 0),
      totalReversedFee: reversed.reduce((sum, r) => sum + parseFloat(r.platformFee || '0'), 0),
      reversedBySource,
    };
  }

  async getDailyRevenueSummary(date: string): Promise<DailyRevenueSummary | undefined> {
    const [summary] = await db.select().from(dailyRevenueSummary).where(eq(dailyRevenueSummary.date, date));
    return summary;
  }

  async updateDailyRevenueSummary(date: string, updates: Partial<InsertDailyRevenueSummary>): Promise<DailyRevenueSummary> {
    const existing = await this.getDailyRevenueSummary(date);
    
    if (existing) {
      const [updated] = await db.update(dailyRevenueSummary)
        .set({
          ...updates,
          totalGross: String(parseFloat(existing.totalGross || '0') + parseFloat(updates.totalGross || '0')),
          totalPlatformFee: String(parseFloat(existing.totalPlatformFee || '0') + parseFloat(updates.totalPlatformFee || '0')),
          totalNet: String(parseFloat(existing.totalNet || '0') + parseFloat(updates.totalNet || '0')),
          transactionCount: (existing.transactionCount || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(dailyRevenueSummary.date, date))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(dailyRevenueSummary).values({
        date,
        ...updates,
        transactionCount: 1,
      }).returning();
      return created;
    }
  }

  // === Content Tracking System ===

  // Generate unique tracking number (TRV-YYYYMM-XXXXX format)
  // Uses atomic upsert with retry for concurrent safety
  async generateTrackingNumber(prefix: string = 'TRV', maxRetries: number = 3): Promise<string> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try to insert or update atomically using raw SQL for true atomicity
        const result = await db.execute(sql`
          INSERT INTO tracking_sequences (id, prefix, year_month, last_number, updated_at)
          VALUES (gen_random_uuid(), ${prefix}, ${yearMonth}, 1, NOW())
          ON CONFLICT (prefix, year_month)
          DO UPDATE SET 
            last_number = tracking_sequences.last_number + 1,
            updated_at = NOW()
          RETURNING last_number
        `);

        const nextNumber = (result.rows[0] as any).last_number as number;
        return `${prefix}-${yearMonth}-${String(nextNumber).padStart(5, '0')}`;
      } catch (error: any) {
        // Retry on concurrent insert conflicts
        if (attempt < maxRetries - 1 && error.code === '23505') {
          continue;
        }
        throw error;
      }
    }

    throw new Error(`Failed to generate tracking number after ${maxRetries} attempts`);
  }

  // Generate invoice number (INV-YYYYMM-XXXXX format)
  async generateInvoiceNumber(): Promise<string> {
    return this.generateTrackingNumber('INV');
  }

  // Register new content in the tracking system
  async registerContent(data: InsertContentRegistry): Promise<ContentRegistry> {
    const trackingNumber = data.trackingNumber || await this.generateTrackingNumber();
    const [content] = await db.insert(contentRegistry).values({
      ...data,
      trackingNumber,
      publishedAt: data.status === 'published' ? new Date() : undefined,
    }).returning();

    // Create initial version record
    await this.createContentVersion({
      trackingNumber: content.trackingNumber,
      version: 1,
      changeType: 'created',
      changedBy: data.ownerId,
      newData: { title: data.title, description: data.description, status: data.status },
    });

    return content;
  }

  // Get content by tracking number
  async getContentByTrackingNumber(trackingNumber: string): Promise<ContentRegistry | null> {
    const [content] = await db.select().from(contentRegistry)
      .where(eq(contentRegistry.trackingNumber, trackingNumber));
    return content || null;
  }

  // Get content by content ID and type
  async getContentByContentId(contentId: string, contentType: string): Promise<ContentRegistry | null> {
    const [content] = await db.select().from(contentRegistry)
      .where(and(
        eq(contentRegistry.contentId, contentId),
        eq(contentRegistry.contentType, contentType as any)
      ));
    return content || null;
  }

  // Update content registry entry
  async updateContentRegistry(trackingNumber: string, updates: Partial<InsertContentRegistry>, changedBy?: string): Promise<ContentRegistry | null> {
    const existing = await this.getContentByTrackingNumber(trackingNumber);
    if (!existing) return null;

    const [updated] = await db.update(contentRegistry)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contentRegistry.trackingNumber, trackingNumber))
      .returning();

    // Record version change
    await this.createContentVersion({
      trackingNumber,
      changeType: 'updated',
      changedBy,
      previousData: { status: existing.status, title: existing.title },
      newData: updates,
    });

    return updated;
  }

  // Flag content
  async flagContent(trackingNumber: string, flaggedBy: string, reason: string): Promise<ContentRegistry | null> {
    return this.updateContentRegistry(trackingNumber, {
      status: 'flagged',
      flaggedAt: new Date(),
      flaggedBy,
      flagReason: reason,
    } as any, flaggedBy);
  }

  // Moderate content
  async moderateContent(trackingNumber: string, moderatorId: string, action: 'approve' | 'suspend' | 'delete', notes?: string): Promise<ContentRegistry | null> {
    const statusMap = {
      approve: 'published',
      suspend: 'suspended',
      delete: 'deleted',
    };

    return this.updateContentRegistry(trackingNumber, {
      status: statusMap[action] as any,
      moderatorId,
      moderatorNotes: notes,
      moderatedAt: new Date(),
      flaggedAt: null as any,
      flagReason: null as any,
      flaggedBy: null as any,
    } as any, moderatorId);
  }

  // Get all content (with filters)
  async getContentRegistry(filters?: {
    status?: string;
    contentType?: string;
    ownerId?: string;
    flagged?: boolean;
    provider?: string;
    limit?: number;
    offset?: number;
  }): Promise<ContentRegistry[]> {
    const conditions: any[] = [];
    if (filters?.status) {
      conditions.push(eq(contentRegistry.status, filters.status as any));
    }
    if (filters?.contentType) {
      conditions.push(eq(contentRegistry.contentType, filters.contentType as any));
    }
    if (filters?.ownerId) {
      conditions.push(eq(contentRegistry.ownerId, filters.ownerId));
    }
    if (filters?.flagged) {
      conditions.push(eq(contentRegistry.status, 'flagged'));
    }
    if (filters?.provider) {
      conditions.push(
        sql`${contentRegistry.metadata}->>'provider' ILIKE ${'%' + filters.provider + '%'}`
      );
    }

    const baseQuery = conditions.length > 0
      ? db.select().from(contentRegistry).where(and(...conditions))
      : db.select().from(contentRegistry);

    const results = await baseQuery
      .orderBy(desc(contentRegistry.createdAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    return results;
  }

  // Get distinct provider names from affiliate_product registry entries
  async getAffiliateProviders(): Promise<{ id: string; name: string; isActive: boolean; productCount: number }[]> {
    const rows = await db.execute(sql`
      SELECT
        ap.id,
        ap.name,
        ap.is_active AS "isActive",
        COALESCE(cr.product_count, 0)::int AS "productCount"
      FROM affiliate_partners ap
      LEFT JOIN (
        SELECT metadata->>'partnerId' AS partner_id, COUNT(*) AS product_count
        FROM content_registry
        WHERE content_type = 'affiliate_product'
          AND metadata->>'partnerId' IS NOT NULL
        GROUP BY metadata->>'partnerId'
      ) cr ON cr.partner_id = ap.id
      ORDER BY ap.name
    `);
    return (rows.rows as any[]).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      isActive: r.isActive as boolean,
      productCount: Number(r.productCount),
    }));
  }

  async backfillAffiliateProviderMetadata(): Promise<{ updated: number }> {
    const result = await db.execute(sql`
      UPDATE content_registry cr
      SET metadata = jsonb_set(
        COALESCE(cr.metadata, '{}'::jsonb),
        '{provider}',
        to_jsonb(ap.name)
      ),
      updated_at = NOW()
      FROM affiliate_partners ap
      WHERE cr.content_type = 'affiliate_product'
        AND (cr.metadata->>'provider' IS NULL OR cr.metadata->>'provider' = '')
        AND cr.metadata->>'partnerId' IS NOT NULL
        AND ap.id = cr.metadata->>'partnerId'
    `);
    return { updated: result.rowCount ?? 0 };
  }

  // Register an affiliate product in the content tracking system
  async registerAffiliateProduct(product: {
    id: string;
    name: string;
    description?: string | null;
    partnerId: string;
    externalId?: string | null;
    price?: string | null;
    isActive?: boolean | null;
    partnerName?: string;
  }): Promise<string> {
    // Resolve partnerName from DB if not explicitly provided
    let resolvedPartnerName = product.partnerName;
    if (!resolvedPartnerName) {
      const partnerRow = await db.execute(sql`
        SELECT name FROM affiliate_partners WHERE id = ${product.partnerId} LIMIT 1
      `);
      resolvedPartnerName = (partnerRow.rows[0] as any)?.name as string | undefined;
    }

    // Check if already registered to avoid duplicates
    const existing = await this.getContentByContentId(product.id, 'affiliate_product');
    if (existing) {
      // Check if key fields changed and create a version if so
      const prevMeta = (existing.metadata as any) || {};
      const titleChanged = existing.title !== product.name;
      const priceChanged = prevMeta.price !== product.price;
      const statusChanged = prevMeta.isActive !== product.isActive;
      // Also update if provider was previously missing
      const providerMissing = !prevMeta.provider && resolvedPartnerName;

      if (titleChanged || priceChanged || statusChanged || providerMissing) {
        await db.update(contentRegistry)
          .set({
            title: product.name,
            description: product.description || existing.description,
            status: product.isActive === false ? 'archived' : 'published',
            metadata: {
              ...(existing.metadata as object || {}),
              price: product.price,
              isActive: product.isActive,
              provider: resolvedPartnerName,
              partnerId: product.partnerId,
              externalId: product.externalId,
            },
            updatedAt: new Date(),
          })
          .where(eq(contentRegistry.trackingNumber, existing.trackingNumber));

        await this.createContentVersion({
          trackingNumber: existing.trackingNumber,
          changeType: 'updated',
          previousData: { title: existing.title, price: prevMeta.price, isActive: prevMeta.isActive },
          newData: { title: product.name, price: product.price, isActive: product.isActive },
        });
      }
      return existing.trackingNumber;
    }

    const trackingNumber = await this.generateTrackingNumber('TRV');
    await this.registerContent({
      trackingNumber,
      contentType: 'affiliate_product',
      contentId: product.id,
      title: product.name,
      description: product.description || undefined,
      status: product.isActive === false ? 'archived' : 'published',
      metadata: {
        provider: resolvedPartnerName,
        partnerId: product.partnerId,
        externalId: product.externalId,
        price: product.price,
        isActive: product.isActive,
      },
    });

    // Write the tracking number back to affiliate_products
    await db.execute(sql`
      UPDATE affiliate_products SET tracking_number = ${trackingNumber} WHERE id = ${product.id}
    `);

    return trackingNumber;
  }

  // Get moderation queue (flagged content)
  async getModerationQueue(): Promise<ContentRegistry[]> {
    return this.getContentRegistry({ status: 'flagged' });
  }

  // Increment view count
  async incrementContentView(trackingNumber: string): Promise<void> {
    const content = await this.getContentByTrackingNumber(trackingNumber);
    if (content) {
      await db.update(contentRegistry)
        .set({
          viewCount: (content.viewCount || 0) + 1,
          lastViewedAt: new Date(),
        })
        .where(eq(contentRegistry.trackingNumber, trackingNumber));
    }
  }

  // === Content Invoices ===

  async createContentInvoice(data: InsertContentInvoice): Promise<ContentInvoice> {
    const invoiceNumber = data.invoiceNumber || await this.generateInvoiceNumber();
    const [invoice] = await db.insert(contentInvoices).values({
      ...data,
      invoiceNumber,
    }).returning();
    return invoice;
  }

  async getContentInvoice(invoiceNumber: string): Promise<ContentInvoice | null> {
    const [invoice] = await db.select().from(contentInvoices)
      .where(eq(contentInvoices.invoiceNumber, invoiceNumber));
    return invoice || null;
  }

  async getInvoicesByTrackingNumber(trackingNumber: string): Promise<ContentInvoice[]> {
    return await db.select().from(contentInvoices)
      .where(eq(contentInvoices.trackingNumber, trackingNumber))
      .orderBy(desc(contentInvoices.createdAt));
  }

  async getInvoicesByCustomer(customerId: string): Promise<ContentInvoice[]> {
    return await db.select().from(contentInvoices)
      .where(eq(contentInvoices.customerId, customerId))
      .orderBy(desc(contentInvoices.createdAt));
  }

  async updateInvoiceStatus(invoiceNumber: string, status: string, paymentReference?: string): Promise<ContentInvoice | null> {
    const updates: any = { status, updatedAt: new Date() };
    if (status === 'paid') {
      updates.paidAt = new Date();
    }
    if (paymentReference) {
      updates.paymentReference = paymentReference;
    }

    const [updated] = await db.update(contentInvoices)
      .set(updates)
      .where(eq(contentInvoices.invoiceNumber, invoiceNumber))
      .returning();
    return updated || null;
  }

  // === Content Versions ===

  async createContentVersion(data: InsertContentVersion): Promise<ContentVersion> {
    // Get the latest version number
    const versions = await db.select().from(contentVersions)
      .where(eq(contentVersions.trackingNumber, data.trackingNumber))
      .orderBy(desc(contentVersions.version))
      .limit(1);

    const nextVersion = versions.length > 0 ? (versions[0].version || 0) + 1 : 1;

    const [version] = await db.insert(contentVersions).values({
      ...data,
      version: nextVersion,
    }).returning();
    return version;
  }

  async getContentVersions(trackingNumber: string): Promise<ContentVersion[]> {
    return await db.select().from(contentVersions)
      .where(eq(contentVersions.trackingNumber, trackingNumber))
      .orderBy(desc(contentVersions.version));
  }

  // === Content Flags ===

  async createContentFlag(data: InsertContentFlag): Promise<ContentFlag> {
    const [flag] = await db.insert(contentFlags).values(data).returning();

    // Also update the content registry to mark as flagged
    await this.flagContent(data.trackingNumber, data.reporterId || 'system', data.description || data.flagType);

    return flag;
  }

  async getContentFlags(trackingNumber: string): Promise<ContentFlag[]> {
    return await db.select().from(contentFlags)
      .where(eq(contentFlags.trackingNumber, trackingNumber))
      .orderBy(desc(contentFlags.createdAt));
  }

  async getPendingFlags(): Promise<ContentFlag[]> {
    return await db.select().from(contentFlags)
      .where(eq(contentFlags.status, 'pending'))
      .orderBy(desc(contentFlags.createdAt));
  }

  async resolveFlag(flagId: string, resolvedBy: string, resolution: string): Promise<ContentFlag | null> {
    const [updated] = await db.update(contentFlags)
      .set({
        status: 'resolved',
        resolution,
        resolvedBy,
        resolvedAt: new Date(),
      })
      .where(eq(contentFlags.id, flagId))
      .returning();
    return updated || null;
  }

  // === Content Analytics ===

  async recordContentAnalytics(data: InsertContentAnalytics): Promise<ContentAnalytics> {
    const [analytics] = await db.insert(contentAnalytics).values(data).returning();
    return analytics;
  }

  async getContentAnalytics(trackingNumber: string, startDate?: Date, endDate?: Date): Promise<ContentAnalytics[]> {
    let query = db.select().from(contentAnalytics)
      .where(eq(contentAnalytics.trackingNumber, trackingNumber));

    return await query.orderBy(desc(contentAnalytics.date));
  }

  // Get content tracking summary for dashboard
  async getContentTrackingSummary(): Promise<{
    totalContent: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    flaggedCount: number;
    recentContent: ContentRegistry[];
  }> {
    const allContent = await db.select().from(contentRegistry);

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};

    allContent.forEach(c => {
      byStatus[c.status || 'unknown'] = (byStatus[c.status || 'unknown'] || 0) + 1;
      byType[c.contentType] = (byType[c.contentType] || 0) + 1;
    });

    const recentContent = await db.select().from(contentRegistry)
      .orderBy(desc(contentRegistry.createdAt))
      .limit(10);

    return {
      totalContent: allContent.length,
      byStatus,
      byType,
      flaggedCount: byStatus['flagged'] || 0,
      recentContent,
    };
  }

  // === Logistics: Temporal Anchors ===
  async getTemporalAnchors(tripId: string): Promise<TemporalAnchor[]> {
    return await db.select().from(temporalAnchors).where(eq(temporalAnchors.tripId, tripId));
  }

  // Resolve a single anchor by id (for ownership checks on PUT/DELETE /api/anchors/:id).
  // Returns the full row incl. tripId, or undefined when the id is unknown (route maps → 404).
  async getTemporalAnchorById(id: string): Promise<TemporalAnchor | undefined> {
    const [row] = await db.select().from(temporalAnchors).where(eq(temporalAnchors.id, id)).limit(1);
    return row;
  }

  async createTemporalAnchor(anchor: InsertTemporalAnchor): Promise<TemporalAnchor> {
    const [created] = await db.insert(temporalAnchors).values(anchor).returning();
    return created;
  }

  async updateTemporalAnchor(id: string, updates: Partial<InsertTemporalAnchor>): Promise<TemporalAnchor | undefined> {
    const [updated] = await db.update(temporalAnchors).set({ ...updates, updatedAt: new Date() }).where(eq(temporalAnchors.id, id)).returning();
    return updated;
  }

  async deleteTemporalAnchor(id: string): Promise<void> {
    await db.delete(temporalAnchors).where(eq(temporalAnchors.id, id));
  }

  // === Logistics: Day Boundaries ===
  async getDayBoundaries(tripId: string): Promise<DayBoundary[]> {
    return await db.select().from(dayBoundaries).where(eq(dayBoundaries.tripId, tripId));
  }

  async createDayBoundary(boundary: InsertDayBoundary): Promise<DayBoundary> {
    const [created] = await db.insert(dayBoundaries).values(boundary).returning();
    return created;
  }

  // === Logistics: Energy Tracking ===
  async getEnergyTracking(tripId: string): Promise<EnergyTracking[]> {
    return await db.select().from(energyTracking).where(eq(energyTracking.tripId, tripId));
  }

  async saveEnergyTracking(entry: InsertEnergyTracking): Promise<EnergyTracking> {
    const [saved] = await db.insert(energyTracking).values(entry).returning();
    return saved;
  }

  // === Expert/Provider Logistics ===

  async getProviderAvailability(providerId: string): Promise<ProviderAvailabilitySchedule[]> {
    return await db.select().from(providerAvailabilitySchedule)
      .where(eq(providerAvailabilitySchedule.providerId, providerId))
      .orderBy(providerAvailabilitySchedule.dayOfWeek);
  }

  async getProviderAvailabilityById(id: string): Promise<ProviderAvailabilitySchedule | undefined> {
    const [row] = await db.select().from(providerAvailabilitySchedule)
      .where(eq(providerAvailabilitySchedule.id, id));
    return row;
  }

  async setProviderAvailability(schedule: InsertProviderAvailabilitySchedule): Promise<ProviderAvailabilitySchedule> {
    const [created] = await db.insert(providerAvailabilitySchedule).values(schedule).returning();
    return created;
  }

  async updateProviderAvailabilityRule(id: string, providerId: string, updates: Partial<InsertProviderAvailabilitySchedule>): Promise<ProviderAvailabilitySchedule | undefined> {
    const [updated] = await db.update(providerAvailabilitySchedule)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(providerAvailabilitySchedule.id, id), eq(providerAvailabilitySchedule.providerId, providerId)))
      .returning();
    return updated;
  }

  async deleteProviderAvailability(id: string): Promise<void> {
    await db.delete(providerAvailabilitySchedule).where(eq(providerAvailabilitySchedule.id, id));
  }

  async getProviderBlackoutDates(providerId: string): Promise<ProviderBlackoutDate[]> {
    return await db.select().from(providerBlackoutDates)
      .where(eq(providerBlackoutDates.providerId, providerId))
      .orderBy(providerBlackoutDates.startDate);
  }

  async getProviderBlackoutDateById(id: string): Promise<ProviderBlackoutDate | undefined> {
    const [row] = await db.select().from(providerBlackoutDates)
      .where(eq(providerBlackoutDates.id, id));
    return row;
  }

  async addProviderBlackoutDate(blackout: InsertProviderBlackoutDate): Promise<ProviderBlackoutDate> {
    const [created] = await db.insert(providerBlackoutDates).values(blackout).returning();
    return created;
  }

  async deleteProviderBlackoutDate(id: string): Promise<void> {
    await db.delete(providerBlackoutDates).where(eq(providerBlackoutDates.id, id));
  }

  async isExpertAssignedToTrip(tripId: string, expertId: string): Promise<boolean> {
    const [row] = await db.select({ id: tripExpertAdvisors.id }).from(tripExpertAdvisors)
      .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, expertId)))
      .limit(1);
    return !!row;
  }

  async createTripExpertAdvisor(data: { tripId: string; localExpertId: string; message?: string; status?: string }): Promise<any> {
    const [created] = await db.insert(tripExpertAdvisors).values({
      tripId: data.tripId,
      localExpertId: data.localExpertId,
      status: data.status ?? "pending",
      workspaceStatus: "draft",
      message: data.message,
    }).returning();
    return created;
  }

  async getBookingRequests(providerId: string): Promise<ProviderBookingRequest[]> {
    return await db.select().from(providerBookingRequests)
      .where(eq(providerBookingRequests.providerId, providerId))
      .orderBy(desc(providerBookingRequests.createdAt));
  }

  async getBookingRequestsByTrip(tripId: string): Promise<ProviderBookingRequest[]> {
    return await db.select().from(providerBookingRequests)
      .where(eq(providerBookingRequests.tripId, tripId))
      .orderBy(providerBookingRequests.requestedDate);
  }

  async createBookingRequest(request: InsertProviderBookingRequest): Promise<ProviderBookingRequest> {
    const [created] = await db.insert(providerBookingRequests).values(request).returning();
    return created;
  }

  async updateBookingRequest(id: string, updates: Partial<InsertProviderBookingRequest>): Promise<ProviderBookingRequest | undefined> {
    const [updated] = await db.update(providerBookingRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(providerBookingRequests.id, id))
      .returning();
    return updated;
  }

  async getVendorCoordination(tripId: string): Promise<ExpertVendorCoordination[]> {
    return await db.select().from(expertVendorCoordination)
      .where(eq(expertVendorCoordination.tripId, tripId))
      .orderBy(expertVendorCoordination.serviceDate);
  }

  async createVendorCoordination(vendor: InsertExpertVendorCoordination): Promise<ExpertVendorCoordination> {
    const [created] = await db.insert(expertVendorCoordination).values(vendor).returning();
    return created;
  }

  async updateVendorCoordination(id: string, updates: Partial<InsertExpertVendorCoordination>): Promise<ExpertVendorCoordination | undefined> {
    const [updated] = await db.update(expertVendorCoordination)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(expertVendorCoordination.id, id))
      .returning();
    return updated;
  }

  async deleteVendorCoordination(id: string): Promise<void> {
    await db.delete(expertVendorCoordination).where(eq(expertVendorCoordination.id, id));
  }

  // === Grok Analytics ===

  async createExpertMatchAnalytics(data: InsertExpertMatchAnalytics): Promise<ExpertMatchAnalytics> {
    const [created] = await db.insert(expertMatchAnalytics).values(data).returning();
    return created;
  }

  async getExpertMatchAnalytics(expertId: string): Promise<ExpertMatchAnalytics[]> {
    return await db.select().from(expertMatchAnalytics)
      .where(eq(expertMatchAnalytics.expertId, expertId))
      .orderBy(desc(expertMatchAnalytics.createdAt));
  }

  async getExpertMatchTrends(expertId: string, days: number = 30): Promise<{ avgScore: number; matchCount: number; selectionRate: number }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const matches = await db.select().from(expertMatchAnalytics)
      .where(and(
        eq(expertMatchAnalytics.expertId, expertId),
        gte(expertMatchAnalytics.createdAt, cutoff)
      ));

    const matchCount = matches.length;
    const avgScore = matchCount > 0 ? matches.reduce((sum, m) => sum + m.matchScore, 0) / matchCount : 0;
    const selectionRate = matchCount > 0 ? matches.filter(m => m.expertSelected).length / matchCount : 0;
    return { avgScore: Math.round(avgScore), matchCount, selectionRate: Math.round(selectionRate * 100) / 100 };
  }

  async createDestinationSearchPattern(data: InsertDestinationSearchPattern): Promise<DestinationSearchPattern> {
    const [created] = await db.insert(destinationSearchPatterns).values(data).returning();
    return created;
  }

  async getDestinationSearchTrends(days: number = 7): Promise<Array<{ destination: string; searchCount: number; conversionRate: number }>> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const patterns = await db.select().from(destinationSearchPatterns)
      .where(gte(destinationSearchPatterns.createdAt, cutoff));

    const grouped = patterns.reduce((acc, p) => {
      const key = p.destination;
      if (!acc[key]) acc[key] = { searches: 0, conversions: 0 };
      acc[key].searches++;
      if (p.itemSelected) acc[key].conversions++;
      return acc;
    }, {} as Record<string, { searches: number; conversions: number }>);

    return Object.entries(grouped)
      .map(([destination, stats]) => ({
        destination,
        searchCount: stats.searches,
        conversionRate: stats.searches > 0 ? Math.round((stats.conversions / stats.searches) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.searchCount - a.searchCount);
  }

  async createDestinationMetricsHistory(data: InsertDestinationMetricsHistory): Promise<DestinationMetricsHistory> {
    const [created] = await db.insert(destinationMetricsHistory).values(data).returning();
    return created;
  }

  async getDestinationMetricsHistory(destination: string, metricType: string, days: number = 30): Promise<DestinationMetricsHistory[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await db.select().from(destinationMetricsHistory)
      .where(and(
        eq(destinationMetricsHistory.destination, destination),
        eq(destinationMetricsHistory.metricType, metricType),
        gte(destinationMetricsHistory.recordedAt, cutoff)
      ))
      .orderBy(desc(destinationMetricsHistory.recordedAt));
  }

  async getItineraryChanges(tripId: string, limit: number = 50): Promise<ItineraryChange[]> {
    return await db.select().from(itineraryChanges)
      .where(eq(itineraryChanges.tripId, tripId))
      .orderBy(desc(itineraryChanges.createdAt))
      .limit(limit);
  }

  async createItineraryChange(change: InsertItineraryChange): Promise<ItineraryChange> {
    const [created] = await db.insert(itineraryChanges).values(change).returning();
    return created;
  }

  async deleteItineraryChange(id: string): Promise<void> {
    await db.delete(itineraryChanges).where(eq(itineraryChanges.id, id));
  }

  async getActivityComment(id: string): Promise<ActivityComment | undefined> {
    const [comment] = await db.select().from(activityComments)
      .where(eq(activityComments.id, id))
      .limit(1);
    return comment;
  }

  async getActivityComments(activityId: string): Promise<ActivityComment[]> {
    return await db.select().from(activityComments)
      .where(eq(activityComments.activityId, activityId))
      .orderBy(desc(activityComments.createdAt));
  }

  async getActivityCommentCounts(tripId: string): Promise<Record<string, number>> {
    const rows = await db.select({
      activityId: activityComments.activityId,
      count: count(),
    }).from(activityComments)
      .where(eq(activityComments.tripId, tripId))
      .groupBy(activityComments.activityId);
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.activityId] = row.count;
    }
    return result;
  }

  async createActivityComment(comment: InsertActivityComment): Promise<ActivityComment> {
    const [created] = await db.insert(activityComments).values(comment).returning();
    return created;
  }

  async deleteActivityComment(id: string): Promise<void> {
    await db.delete(activityComments).where(eq(activityComments.id, id));
  }

  // Provider Settings
  async getProviderSettings(userId: string): Promise<ProviderSettings | null> {
    const [row] = await db.select().from(providerSettings).where(eq(providerSettings.userId, userId));
    return row ?? null;
  }

  async upsertProviderSettings(userId: string, settings: Partial<InsertProviderSettings>): Promise<ProviderSettings> {
    const existing = await this.getProviderSettings(userId);
    if (existing) {
      const [updated] = await db.update(providerSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(providerSettings.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(providerSettings)
        .values({ userId, ...settings })
        .returning();
      return created;
    }
  }

  // Itinerary Items CRUD
  async getItineraryItems(tripId: string): Promise<ItineraryItem[]> {
    return await db.select().from(itineraryItems)
      .where(eq(itineraryItems.tripId, tripId))
      .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder), asc(itineraryItems.startTime));
  }

  async createItineraryItem(item: InsertItineraryItem & { tripId: string }): Promise<ItineraryItem> {
    const [created] = await db.insert(itineraryItems).values(item).returning();
    return created;
  }

  async updateItineraryItem(id: string, updates: Partial<InsertItineraryItem>): Promise<ItineraryItem | undefined> {
    const [updated] = await db.update(itineraryItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(itineraryItems.id, id))
      .returning();
    return updated;
  }

  async deleteItineraryItem(id: string): Promise<void> {
    await db.delete(itineraryItems).where(eq(itineraryItems.id, id));
  }

  // Expert Workspace Status
  async getExpertAssignment(assignmentId: string): Promise<any> {
    const [row] = await db.select().from(tripExpertAdvisors)
      .where(eq(tripExpertAdvisors.id, assignmentId));
    return row ?? null;
  }

  async updateExpertAssignmentWorkspaceStatus(assignmentId: string, workspaceStatus: string): Promise<any> {
    const [updated] = await db.update(tripExpertAdvisors)
      .set({ workspaceStatus })
      .where(eq(tripExpertAdvisors.id, assignmentId))
      .returning();
    return updated;
  }

  // Atomically accept a pending advisory assignment (owner + pending guard in one UPDATE — §15).
  // Returns undefined if the row isn't the expert's or isn't pending → caller 409s, no double-accept.
  async acceptTripAssignment(assignmentId: string, expertId: string): Promise<any> {
    const [updated] = await db.update(tripExpertAdvisors)
      .set({ status: "accepted" })
      .where(and(
        eq(tripExpertAdvisors.id, assignmentId),
        eq(tripExpertAdvisors.localExpertId, expertId),
        eq(tripExpertAdvisors.status, "pending"),
      ))
      .returning();
    return updated;
  }

  // ─── Content Placement Rules ─────────────────────────────────────────────

  async getContentPlacementRules(filters?: {
    cityName?: string;
    surface?: string;
    contentSource?: string;
    isActive?: boolean;
  }): Promise<ContentPlacementRule[]> {
    const conditions: any[] = [];
    if (filters?.cityName) conditions.push(ilike(contentPlacementRules.cityName, `%${filters.cityName}%`));
    if (filters?.surface) conditions.push(sql`${contentPlacementRules.surfaces} @> ${JSON.stringify([filters.surface])}::jsonb`);
    if (filters?.contentSource) conditions.push(eq(contentPlacementRules.contentSource, filters.contentSource));
    if (filters?.isActive !== undefined) conditions.push(eq(contentPlacementRules.isActive, filters.isActive));
    return db.select().from(contentPlacementRules)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(contentPlacementRules.createdAt));
  }

  async createContentPlacementRule(rule: InsertContentPlacementRule): Promise<ContentPlacementRule> {
    const [created] = await db.insert(contentPlacementRules).values(rule).returning();
    return created;
  }

  async updateContentPlacementRule(id: string, updates: Partial<InsertContentPlacementRule>): Promise<ContentPlacementRule | undefined> {
    const [updated] = await db.update(contentPlacementRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contentPlacementRules.id, id))
      .returning();
    return updated;
  }

  async deleteContentPlacementRule(id: string): Promise<void> {
    await db.delete(contentPlacementRules).where(eq(contentPlacementRules.id, id));
  }

  async bulkUpsertContentPlacementRules(rules: InsertContentPlacementRule[]): Promise<number> {
    if (!rules.length) return 0;
    let upserted = 0;
    for (const rule of rules) {
      const existing = await db.select({ id: contentPlacementRules.id })
        .from(contentPlacementRules)
        .where(and(
          eq(contentPlacementRules.contentSource, rule.contentSource),
          eq(contentPlacementRules.sourceId, rule.sourceId),
          ilike(contentPlacementRules.cityName, rule.cityName),
        ))
        .limit(1);
      if (existing.length) {
        await db.update(contentPlacementRules)
          .set({ surfaces: rule.surfaces, updatedAt: new Date() })
          .where(eq(contentPlacementRules.id, existing[0].id));
      } else {
        await db.insert(contentPlacementRules).values(rule);
        upserted++;
      }
    }
    return upserted;
  }

  // Affiliate Booking Requests
  async createAffiliateBookingRequest(data: InsertAffiliateBookingRequest): Promise<AffiliateBookingRequest> {
    const [record] = await db.insert(affiliateBookingRequests).values(data).returning();
    return record;
  }

  async getAffiliateBookingRequestById(id: string): Promise<AffiliateBookingRequest | undefined> {
    const [row] = await db
      .select()
      .from(affiliateBookingRequests)
      .where(eq(affiliateBookingRequests.id, id))
      .limit(1);
    return row;
  }

  async getAffiliateBookingRequestsByUser(userId: string): Promise<Omit<AffiliateBookingRequest, "affiliateUrl">[]> {
    const rows = await db
      .select()
      .from(affiliateBookingRequests)
      .where(eq(affiliateBookingRequests.userId, userId))
      .orderBy(desc(affiliateBookingRequests.createdAt));
    return rows.map(({ affiliateUrl: _url, ...rest }) => rest);
  }

  async getAffiliateBookingRequestsByExpert(expertId: string): Promise<AffiliateBookingRequest[]> {
    return db
      .select()
      .from(affiliateBookingRequests)
      .where(
        or(
          eq(affiliateBookingRequests.expertId, expertId),
          sql`${affiliateBookingRequests.expertId} IS NULL`,
        )
      )
      .orderBy(asc(affiliateBookingRequests.status), asc(affiliateBookingRequests.createdAt));
  }

  async updateAffiliateBookingRequest(
    id: string,
    data: Partial<Pick<AffiliateBookingRequest, "status" | "expertNotes" | "confirmationRef" | "price" | "expertId" | "tripId">>,
  ): Promise<AffiliateBookingRequest | undefined> {
    const [updated] = await db
      .update(affiliateBookingRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(affiliateBookingRequests.id, id))
      .returning();
    return updated;
  }

  async confirmAffiliateBookingRequest(
    id: string,
    data: Partial<Pick<AffiliateBookingRequest, "expertNotes" | "confirmationRef" | "price" | "expertId" | "tripId">>,
  ): Promise<AffiliateBookingRequest | undefined> {
    // §15 atomic claim: transitions pending/failed/etc → 'confirmed' ONLY when the row is not
    // already 'confirmed'. A concurrent/duplicate confirm request matches 0 rows and returns
    // undefined — the caller (the R4/F7 earning-ledger write) must treat that as "already
    // confirmed" and skip re-running the confirm side-effects (itinerary item + affiliate earning),
    // not retry the insert.
    const [updated] = await db
      .update(affiliateBookingRequests)
      .set({ ...data, status: "confirmed", updatedAt: new Date() })
      .where(and(eq(affiliateBookingRequests.id, id), ne(affiliateBookingRequests.status, "confirmed")))
      .returning();
    return updated;
  }

  // ── Identity verification ─────────────────────────────────────────────────

  async updateFormIdentityVerification(
    formType: 'expert' | 'provider',
    userId: string,
    status: string,
    verifiedAt?: Date,
  ): Promise<void> {
    const updates: any = { identityVerificationStatus: status };
    if (verifiedAt) updates.identityVerifiedAt = verifiedAt;
    if (formType === 'expert') {
      await db.update(localExpertForms).set(updates).where(eq(localExpertForms.userId, userId));
    } else {
      await db.update(serviceProviderForms).set(updates).where(eq(serviceProviderForms.userId, userId));
    }
  }

  async updateProviderBusinessVerificationByInquiry(inquiryId: string, status: string): Promise<void> {
    await db
      .update(serviceProviderForms)
      .set({ businessVerificationStatus: status } as any)
      .where(eq((serviceProviderForms as any).personaInquiryId, inquiryId));
  }

  async hasPaymentIntentRevenue(paymentIntentId: string): Promise<boolean> {
    const rows = await db
      .select({ id: platformRevenue.id })
      .from(platformRevenue)
      .where(sql`${platformRevenue.metadata}->>'paymentIntentId' = ${paymentIntentId}`)
      .limit(1);
    return rows.length > 0;
  }

  // ── Booking status queries ─────────────────────────────────────────────────

  async getBookingStatusForUser(bookingId: string, userId: string): Promise<{ status: string } | null> {
    const result = await db.execute(
      sql`SELECT status FROM bookings WHERE id = ${bookingId} AND user_id = ${userId} LIMIT 1`
    );
    const row = result.rows?.[0] as any;
    return row ? { status: row.status } : null;
  }

  async getBulkBookingStatuses(
    bookingIds: string[],
    userId: string,
  ): Promise<Record<string, { status: string; confirmationCode: string | null }>> {
    const statuses: Record<string, { status: string; confirmationCode: string | null }> = {};
    for (const bookingId of bookingIds) {
      const result = await db.execute(
        sql`SELECT id, status, confirmation_code FROM bookings WHERE id = ${bookingId} AND user_id = ${userId} LIMIT 1`
      );
      const row = result.rows?.[0] as any;
      if (row) {
        statuses[row.id] = { status: row.status, confirmationCode: row.confirmation_code ?? null };
      }
    }
    return statuses;
  }

  // ── DMO Workspace ──────────────────────────────────────────────────────────

  async getDmoRawContentById(id: string): Promise<any | null> {
    const [item] = await db.select().from(dmoRawContent).where(eq(dmoRawContent.id, id)).limit(1);
    return item ?? null;
  }

  async getDmoScrapeJobById(id: string): Promise<any | null> {
    const [job] = await db.select().from(dmoScrapeJobs).where(eq(dmoScrapeJobs.id, id)).limit(1);
    return job ?? null;
  }

  // ── Cross-sell ─────────────────────────────────────────────────────────────

  async recordCrossSellEvents(events: any[]): Promise<number> {
    if (events.length === 0) return 0;
    await db.insert(crossSellEvents).values(events);
    return events.length;
  }

  async getProviderServiceIdsForUser(userId: string): Promise<string[]> {
    const rows = await db
      .select({ id: providerServices.id })
      .from(providerServices)
      .where(eq(providerServices.userId, userId));
    return rows.map(r => r.id);
  }

  // ── Payments / fee resolution ──────────────────────────────────────────────

  async getServiceCategorySlugsByIds(ids: string[]): Promise<{ id: string; slug: string | null }[]> {
    if (ids.length === 0) return [];
    return db.select({ id: serviceCategories.id, slug: serviceCategories.slug })
      .from(serviceCategories)
      .where(inArray(serviceCategories.id, ids));
  }

  async getExpertOfferingTypeKeysByIds(ids: string[]): Promise<{ id: string; key: string }[]> {
    if (ids.length === 0) return [];
    const rows = await db.select({ id: expertOfferingTypes.id, key: expertOfferingTypes.offeringTypeKey })
      .from(expertOfferingTypes)
      .where(inArray(expertOfferingTypes.id, ids));
    return rows.map(r => ({ id: r.id, key: r.key }));
  }

  async getFeeBandByKey(bandKey: string): Promise<any | null> {
    const result = await db.execute(sql`
      SELECT
        band_key,
        rate_type,
        CAST(default_rate AS FLOAT) AS default_rate,
        CAST(min_rate AS FLOAT) AS min_rate,
        CAST(max_rate AS FLOAT) AS max_rate,
        display_name,
        description
      FROM fee_bands
      WHERE band_key = ${bandKey} AND is_active = true
      LIMIT 1
    `);
    return result.rows?.[0] ?? null;
  }

  // === Trip-level mutations ===
  async setTripShareToken(tripId: string, token: string): Promise<Trip | undefined> {
    const [updated] = await db.update(trips).set({ shareToken: token }).where(eq(trips.id, tripId)).returning();
    return updated;
  }

  async claimTrip(tripId: string, userId: string): Promise<Trip | undefined> {
    const [updated] = await db.update(trips).set({ userId }).where(eq(trips.id, tripId)).returning();
    return updated;
  }

  async getTripEventType(tripId: string): Promise<string | null> {
    const [row] = await db.select({ eventType: trips.eventType }).from(trips).where(eq(trips.id, tripId)).limit(1);
    return row?.eventType ?? null;
  }

  async getTripExpertNotes(tripId: string): Promise<string> {
    const [row] = await db.select({ expertNotes: trips.expertNotes }).from(trips).where(eq(trips.id, tripId)).limit(1);
    return row?.expertNotes ?? "";
  }

  // === Generated itinerary ===
  async updateGeneratedItineraryData(id: string, itineraryData: any, status: string): Promise<GeneratedItinerary | undefined> {
    const [updated] = await db.update(generatedItineraries).set({ itineraryData, status }).where(eq(generatedItineraries.id, id)).returning();
    return updated;
  }

  async replaceItineraryItems(tripId: string, items: any[]): Promise<void> {
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));
    if (items.length > 0) {
      await db.insert(itineraryItems).values(items);
    }
  }

  // === Itinerary comparison & variants ===
  async getItineraryComparison(id: string): Promise<any | null> {
    const [row] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, id)).limit(1);
    return row ?? null;
  }

  async getComparisonByTripAndUser(tripId: string, userId: string): Promise<any | null> {
    const [row] = await db.select().from(itineraryComparisons).where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryComparisons.userId, userId)));
    return row ?? null;
  }

  async createItineraryComparison(data: any): Promise<any> {
    const [created] = await db.insert(itineraryComparisons).values(data).returning();
    return created;
  }

  async getAiVariantByComparison(comparisonId: string): Promise<any | null> {
    const [row] = await db.select().from(itineraryVariants).where(and(eq(itineraryVariants.comparisonId, comparisonId), eq(itineraryVariants.source, "ai")));
    return row ?? null;
  }

  async createItineraryVariant(data: { comparisonId: string; name: string; source: string; status: string }): Promise<any> {
    const [created] = await db.insert(itineraryVariants).values(data).returning();
    return created;
  }

  async getItineraryVariantById(id: string): Promise<any | null> {
    const [row] = await db.select().from(itineraryVariants).where(eq(itineraryVariants.id, id)).limit(1);
    return row ?? null;
  }

  async getItineraryVariantItemsByVariantId(variantId: string): Promise<any[]> {
    return await db.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.variantId, variantId));
  }

  async getComparisonTripId(comparisonId: string): Promise<string | null> {
    const [row] = await db.select({ tripId: itineraryComparisons.tripId }).from(itineraryComparisons).where(eq(itineraryComparisons.id, comparisonId)).limit(1);
    return row?.tripId ?? null;
  }

  // === Cart ===
  async replaceUserCartWithVariantItems(userId: string, variantItems: Array<{ providerServiceId: string | null; dayNumber: number | null; timeSlot: string | null }>): Promise<number> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
    let inserted = 0;
    for (const item of variantItems) {
      if (item.providerServiceId) {
        await db.insert(cartItems).values({
          userId,
          serviceId: item.providerServiceId,
          quantity: 1,
          notes: `Day ${item.dayNumber} - ${item.timeSlot}`,
        });
        inserted++;
      }
    }
    return inserted;
  }

  // === AI-generated itinerary ===
  async saveAiGeneratedItinerary(data: any): Promise<any> {
    const [saved] = await db.insert(aiGeneratedItineraries).values(data).returning();
    return saved;
  }

  // === Shared itinerary & maps export ===
  async createSharedItinerary(data: any): Promise<void> {
    await db.insert(sharedItineraries).values(data);
  }

  async getSharedItineraryByToken(token: string): Promise<any | null> {
    const [row] = await db.select().from(sharedItineraries).where(eq(sharedItineraries.shareToken, token));
    return row ?? null;
  }

  async getTransportLegsByVariantId(variantId: string): Promise<any[]> {
    return await db.select().from(transportLegs).where(eq(transportLegs.variantId, variantId));
  }

  async getMapsExportCacheByVariantId(variantId: string): Promise<any | null> {
    const [row] = await db.select().from(mapsExportCache).where(eq(mapsExportCache.variantId, variantId));
    return row ?? null;
  }

  async updateMapsExportCache(variantId: string, updates: { kmlContent?: string; gpxContent?: string }): Promise<void> {
    await db.update(mapsExportCache).set(updates).where(eq(mapsExportCache.variantId, variantId));
  }

  // === Expert review ===
  async updateSharedItineraryExpertReview(id: string, status: string, opts?: { notes?: string; diff?: any }): Promise<void> {
    if (opts?.notes !== undefined && opts?.diff !== undefined) {
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = ${status}, expert_notes = ${opts.notes}, expert_diff = ${JSON.stringify(opts.diff)}::jsonb, updated_at = NOW() WHERE id = ${id}`
      );
    } else if (opts?.diff !== undefined) {
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = ${status}, expert_diff = ${JSON.stringify(opts.diff)}::jsonb, updated_at = NOW() WHERE id = ${id}`
      );
    } else {
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = ${status}, updated_at = NOW() WHERE id = ${id}`
      );
    }
  }

  async saveExpertUpdatedItinerary(data: any): Promise<void> {
    await db.insert(expertUpdatedItineraries).values(data);
  }

  // === Trip analytics ===
  async upsertTripAnalytics(data: any): Promise<void> {
    const { tripId, ...rest } = data;
    await db.insert(tripAnalyticsEnhanced).values({ tripId, ...rest })
      .onConflictDoUpdate({
        target: [tripAnalyticsEnhanced.tripId],
        set: {
          partyComposition: rest.partyComposition,
          hasChildren: rest.hasChildren,
          lengthOfStay: rest.lengthOfStay,
          season: rest.season,
          priceSegment: rest.priceSegment,
          primaryActivity: rest.primaryActivity,
        },
      });
  }

  // === Itinerary item lookup ===
  async getItineraryItemByIdAndTrip(itemId: string, tripId: string): Promise<any | null> {
    const [row] = await db.select().from(itineraryItems)
      .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
      .limit(1);
    return row ?? null;
  }

  // === Expert advisor assignment ===
  async getTripExpertAdvisoryAssignment(tripId: string, expertId: string): Promise<any | null> {
    const [row] = await db.select().from(tripExpertAdvisors)
      .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, expertId)))
      .limit(1);
    return row ?? null;
  }

  // === Optimization gate ===
  async getRecentOptimizationRun(userId: string, cutoffDate: Date): Promise<{ id: string } | null> {
    const [row] = await db.select({ id: itineraryComparisons.id }).from(itineraryComparisons)
      .where(and(eq(itineraryComparisons.userId, userId), sqlOp`${itineraryComparisons.optimizedAt} >= ${cutoffDate.toISOString()}`))
      .limit(1);
    return row ?? null;
  }

  async getComparisonByOptimizationPaymentId(paymentId: string): Promise<{ id: string } | null> {
    const [row] = await db.select({ id: itineraryComparisons.id }).from(itineraryComparisons)
      .where(eq(itineraryComparisons.optimizationPaymentId, paymentId))
      .limit(1);
    return row ?? null;
  }

  async getExperienceTypeSlugByExperienceId(experienceId: string): Promise<string | null> {
    const [row] = await db.select({ slug: experienceTypes.slug })
      .from(userExperiences)
      .innerJoin(experienceTypes, eq(userExperiences.experienceTypeId, experienceTypes.id))
      .where(eq(userExperiences.id, experienceId))
      .limit(1);
    return row?.slug ?? null;
  }

  async getCartItemsWithServices(userId: string): Promise<Array<{ cartItem: any; service: any | null }>> {
    return await db.select({ cartItem: cartItems, service: providerServices })
      .from(cartItems)
      .leftJoin(providerServices, eq(cartItems.serviceId, providerServices.id))
      .where(eq(cartItems.userId, userId));
  }

  async getActiveProviderServices(limit = 100): Promise<any[]> {
    // F2 public read-gate: these listings are offered to users (trip-builder / discover feed) — approved only.
    return await db.select().from(providerServices)
      .where(and(eq(providerServices.status, "active"), eq(providerServices.approvalStatus, "approved")))
      .limit(limit);
  }

  async getComparisonsByUserId(userId: string): Promise<any[]> {
    return await db.select().from(itineraryComparisons)
      .where(eq(itineraryComparisons.userId, userId))
      .orderBy(itineraryComparisons.createdAt);
  }

  // === Share info ===
  async getComparisonsByTripAndUser(tripId: string, userId: string): Promise<Array<{ id: string; selectedVariantId: string | null }>> {
    return await db.select({ id: itineraryComparisons.id, selectedVariantId: itineraryComparisons.selectedVariantId })
      .from(itineraryComparisons)
      .where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryComparisons.userId, userId)));
  }

  async getVariantsByComparisonIds(comparisonIds: string[]): Promise<Array<{ id: string; comparisonId: string }>> {
    if (!comparisonIds.length) return [];
    return await db.select({ id: itineraryVariants.id, comparisonId: itineraryVariants.comparisonId })
      .from(itineraryVariants)
      .where(inArray(itineraryVariants.comparisonId, comparisonIds));
  }

  async getSharedItinerariesByVariantIds(variantIds: string[], sharedByUserId: string): Promise<any[]> {
    if (!variantIds.length) return [];
    return await db.select().from(sharedItineraries)
      .where(and(inArray(sharedItineraries.variantId, variantIds), eq(sharedItineraries.sharedByUserId, sharedByUserId)))
      .orderBy(sharedItineraries.createdAt);
  }

  // === Public share view ===
  async incrementSharedItineraryViewCount(id: string, currentViewCount: number): Promise<void> {
    await db.update(sharedItineraries)
      .set({ viewCount: (currentViewCount || 0) + 1, lastViewedAt: new Date() })
      .where(eq(sharedItineraries.id, id));
  }

  async getUserPublicProfile(userId: string): Promise<{ id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null> {
    const [row] = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
      .from(users)
      .where(eq(users.id, userId));
    return row ?? null;
  }

  // === Transport ===
  async getSelectedVariantByTrip(tripId: string): Promise<{ selectedVariantId: string } | null> {
    const [row] = await db.select({ selectedVariantId: itineraryComparisons.selectedVariantId })
      .from(itineraryComparisons)
      .where(and(eq(itineraryComparisons.tripId, tripId), sqlOp`${itineraryComparisons.selectedVariantId} IS NOT NULL`))
      .orderBy(desc(itineraryComparisons.createdAt))
      .limit(1);
    return row?.selectedVariantId ? { selectedVariantId: row.selectedVariantId } : null;
  }

  async getTransportLegById(legId: string): Promise<any | null> {
    const [row] = await db.select().from(transportLegs).where(eq(transportLegs.id, legId));
    return row ?? null;
  }

  async getVariantWithComparisonOwner(variantId: string): Promise<{ comparisonId: string; userId: string } | null> {
    const [row] = await db.select({ comparisonId: itineraryVariants.comparisonId, userId: itineraryComparisons.userId })
      .from(itineraryVariants)
      .innerJoin(itineraryComparisons, eq(itineraryComparisons.id, itineraryVariants.comparisonId))
      .where(eq(itineraryVariants.id, variantId))
      .limit(1);
    return row ?? null;
  }

  async getSharedItineraryByTokenAndVariant(shareToken: string, variantId: string): Promise<any | null> {
    const [row] = await db.select()
      .from(sharedItineraries)
      .where(and(eq(sharedItineraries.shareToken, shareToken), eq(sharedItineraries.variantId, variantId)));
    return row ?? null;
  }

  async updateTransportLegMode(legId: string, data: { userSelectedMode: string; estimatedDurationMinutes: number; estimatedCostUsd: any; energyCost: number }): Promise<void> {
    await db.update(transportLegs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(transportLegs.id, legId));
  }

  async getUserTransportLegsWithJoin(userId: string): Promise<any[]> {
    return await db.select({
      id: transportLegs.id,
      variantId: transportLegs.variantId,
      legOrder: transportLegs.legOrder,
      fromName: transportLegs.fromName,
      toName: transportLegs.toName,
      userSelectedMode: transportLegs.userSelectedMode,
      recommendedMode: transportLegs.recommendedMode,
    })
      .from(transportLegs)
      .innerJoin(itineraryVariants, eq(itineraryVariants.id, transportLegs.variantId))
      .innerJoin(itineraryComparisons, eq(itineraryComparisons.id, itineraryVariants.comparisonId))
      .where(eq(itineraryComparisons.userId, userId));
  }

  async getTransportLegByDayOrder(variantId: string, dayNumber: number, legOrder: number): Promise<any | null> {
    const [row] = await db.select().from(transportLegs)
      .where(and(eq(transportLegs.variantId, variantId), eq(transportLegs.dayNumber, dayNumber), eq(transportLegs.legOrder, legOrder)));
    return row ?? null;
  }

  // === Optimizer scores ===
  async getLatestComparisonByTripId(tripId: string): Promise<{ id: string } | null> {
    const [row] = await db.select({ id: itineraryComparisons.id }).from(itineraryComparisons)
      .where(eq(itineraryComparisons.tripId, tripId))
      .orderBy(desc(itineraryComparisons.createdAt))
      .limit(1);
    return row ?? null;
  }

  async getLatestVariantByComparisonId(comparisonId: string): Promise<{ id: string } | null> {
    const [row] = await db.select({ id: itineraryVariants.id }).from(itineraryVariants)
      .where(eq(itineraryVariants.comparisonId, comparisonId))
      .orderBy(desc(itineraryVariants.createdAt))
      .limit(1);
    return row ?? null;
  }

  async getVariantMetricsByKeys(variantId: string, keys: string[]): Promise<any[]> {
    if (!keys.length) return [];
    return await db.select().from(itineraryVariantMetrics)
      .where(and(eq(itineraryVariantMetrics.variantId, variantId), inArray(itineraryVariantMetrics.metricKey, keys)));
  }

  async getFirstVariantByComparisonId(comparisonId: string): Promise<any | null> {
    const [row] = await db.select().from(itineraryVariants)
      .where(eq(itineraryVariants.comparisonId, comparisonId))
      .orderBy(asc(itineraryVariants.sortOrder))
      .limit(1);
    return row ?? null;
  }

  async getOrderedVariantItemsByVariantId(variantId: string): Promise<any[]> {
    return await db.select().from(itineraryVariantItems)
      .where(eq(itineraryVariantItems.variantId, variantId))
      .orderBy(asc(itineraryVariantItems.dayNumber), asc(itineraryVariantItems.sortOrder));
  }

  async getOrderedTransportLegsByVariantId(variantId: string): Promise<any[]> {
    return await db.select().from(transportLegs)
      .where(eq(transportLegs.variantId, variantId))
      .orderBy(asc(transportLegs.dayNumber), asc(transportLegs.legOrder));
  }

  async getVariantMetricFirstByVariantId(variantId: string): Promise<any | null> {
    const [row] = await db.select().from(itineraryVariantMetrics)
      .where(eq(itineraryVariantMetrics.variantId, variantId))
      .limit(1);
    return row ?? null;
  }

  async getVariantMetricsAllByVariantId(variantId: string): Promise<any[]> {
    return await db.select().from(itineraryVariantMetrics)
      .where(eq(itineraryVariantMetrics.variantId, variantId));
  }

  async getFullComparisonByTripId(tripId: string): Promise<any | null> {
    const [row] = await db.select().from(itineraryComparisons)
      .where(eq(itineraryComparisons.tripId, tripId))
      .orderBy(desc(itineraryComparisons.createdAt))
      .limit(1);
    return row ?? null;
  }

  async getBookingOptionsByVariantId(variantId: string): Promise<any[]> {
    return await db.select().from(transportBookingOptions)
      .where(eq(transportBookingOptions.variantId, variantId));
  }

  async getTransportBookingOptionById(optionId: string): Promise<any | null> {
    const [row] = await db.select().from(transportBookingOptions)
      .where(eq(transportBookingOptions.id, optionId))
      .limit(1);
    return row ?? null;
  }

  async updateTransportBookingOptionStatus(optionId: string, data: Record<string, any>): Promise<void> {
    await db.update(transportBookingOptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(transportBookingOptions.id, optionId));
  }

  async createAffiliateClick(data: any): Promise<void> {
    await db.insert(affiliateClicks).values(data);
  }

  async getBookingOptionsByLegId(legId: string): Promise<any[]> {
    return await db.select().from(transportBookingOptions)
      .where(eq(transportBookingOptions.transportLegId, legId))
      .orderBy(asc(transportBookingOptions.sortOrder));
  }

  async getTopAiVariantByComparison(comparisonId: string): Promise<any | null> {
    const [row] = await db.select().from(itineraryVariants)
      .where(and(eq(itineraryVariants.comparisonId, comparisonId), eq(itineraryVariants.source, "ai_optimized")))
      .orderBy(desc(itineraryVariants.optimizationScore))
      .limit(1);
    return row ?? null;
  }

  async deleteItineraryItemsByTrip(tripId: string): Promise<void> {
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));
  }

  async bulkInsertItineraryItems(items: any[]): Promise<void> {
    if (!items.length) return;
    for (const item of items) {
      await db.insert(itineraryItems).values(item);
    }
  }

  async updateComparisonOptimizedAt(comparisonId: string, variantId: string): Promise<void> {
    await db.update(itineraryComparisons)
      .set({ optimizedAt: new Date(), selectedVariantId: variantId } as any)
      .where(eq(itineraryComparisons.id, comparisonId));
  }

  async getItineraryComparisonByTripId(tripId: string): Promise<any | null> {
    const [row] = await db.select().from(itineraryComparisons)
      .where(eq(itineraryComparisons.tripId, tripId))
      .limit(1);
    return row ?? null;
  }

  async getBookingOptionsByLegIds(legIds: string[]): Promise<any[]> {
    if (!legIds.length) return [];
    return await db.select().from(transportBookingOptions)
      .where(inArray(transportBookingOptions.transportLegId, legIds));
  }

  async updateItineraryItemCoordinates(id: string, lat: string, lng: string): Promise<void> {
    await db.update(itineraryItems)
      .set({ latitude: lat, longitude: lng })
      .where(eq(itineraryItems.id, id));
  }

  async updateTransportLegUserSelectedMode(legId: string, mode: string): Promise<void> {
    await db.update(transportLegs)
      .set({ userSelectedMode: mode })
      .where(eq(transportLegs.id, legId));
  }

  // ─── Guest Invite System ──────────────────────────────────────────────────

  async getInviteByToken(token: string): Promise<{ invite: EventInvite; experience: any } | null> {
    const [row] = await db.select({ invite: eventInvites, experience: userExperiences })
      .from(eventInvites)
      .leftJoin(userExperiences, eq(eventInvites.experienceId, userExperiences.id))
      .where(eq(eventInvites.uniqueToken, token))
      .limit(1);
    return row ?? null;
  }

  async getInviteById(inviteId: string): Promise<EventInvite | null> {
    const [row] = await db.select().from(eventInvites).where(eq(eventInvites.id, inviteId)).limit(1);
    return row ?? null;
  }

  async getInvitesByExperience(experienceId: string): Promise<EventInvite[]> {
    return db.select().from(eventInvites)
      .where(eq(eventInvites.experienceId, experienceId))
      .orderBy(desc(eventInvites.createdAt));
  }

  async inviteTokenExists(token: string): Promise<boolean> {
    const [row] = await db.select({ id: eventInvites.id })
      .from(eventInvites).where(eq(eventInvites.uniqueToken, token)).limit(1);
    return !!row;
  }

  async createEventInvite(values: {
    experienceId: string;
    organizerId: string;
    guestEmail: string;
    guestName: string;
    guestPhone?: string;
    uniqueToken: string;
    inviteSentAt: Date;
  }): Promise<EventInvite> {
    const [row] = await db.insert(eventInvites).values(values).returning();
    return row;
  }

  async deleteEventInvite(inviteId: string): Promise<void> {
    await db.delete(eventInvites).where(eq(eventInvites.id, inviteId));
  }

  async trackInviteView(token: string, firstViewedAt: Date | null): Promise<void> {
    await db.update(eventInvites)
      .set({
        inviteViewedAt: firstViewedAt ?? new Date(),
        lastViewedAt: new Date(),
        viewCount: sql`COALESCE(${eventInvites.viewCount}, 0) + 1`,
      })
      .where(eq(eventInvites.uniqueToken, token));
  }

  async updateInviteOrigin(token: string, values: {
    originCity: string;
    originState?: string;
    originCountry?: string;
    originLatitude?: string;
    originLongitude?: string;
  }): Promise<EventInvite | null> {
    const [row] = await db.update(eventInvites).set(values)
      .where(eq(eventInvites.uniqueToken, token)).returning();
    return row ?? null;
  }

  async updateInviteRsvp(token: string, values: {
    rsvpStatus: string;
    rsvpDate: Date;
    numberOfGuests: number;
    dietaryRestrictions: string[];
    accommodationPreference: string;
    transportationNeeded: boolean;
    specialRequests?: string;
    message?: string;
  }): Promise<EventInvite | null> {
    const [row] = await db.update(eventInvites).set(values)
      .where(eq(eventInvites.uniqueToken, token)).returning();
    return row ?? null;
  }

  async getTravelPlanByInviteId(inviteId: string): Promise<GuestTravelPlan | null> {
    const [row] = await db.select().from(guestTravelPlans)
      .where(eq(guestTravelPlans.inviteId, inviteId)).limit(1);
    return row ?? null;
  }

  async createTravelPlan(inviteId: string, values?: Partial<GuestTravelPlan>): Promise<GuestTravelPlan> {
    const [row] = await db.insert(guestTravelPlans)
      .values({ inviteId, ...values } as any).returning();
    return row;
  }

  async updateTravelPlan(travelPlanId: string, values: Partial<GuestTravelPlan>): Promise<GuestTravelPlan | null> {
    const [row] = await db.update(guestTravelPlans).set(values as any)
      .where(eq(guestTravelPlans.id, travelPlanId)).returning();
    return row ?? null;
  }

  async createInviteTemplate(values: {
    userId: string;
    name: string;
    subject?: string;
    messageBody: string;
    eventType?: string;
  }): Promise<InviteTemplate> {
    const [row] = await db.insert(inviteTemplates).values(values).returning();
    return row;
  }

  async getInviteTemplatesByUser(userId: string): Promise<InviteTemplate[]> {
    return db.select().from(inviteTemplates)
      .where(eq(inviteTemplates.userId, userId))
      .orderBy(desc(inviteTemplates.createdAt));
  }
}

export const storage = new DatabaseStorage();
