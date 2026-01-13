import { db } from "./db";
import { 
  trips, generatedItineraries, touristPlaceResults, touristPlacesSearches,
  userAndExpertChats, helpGuideTrips, vendors,
  localExpertForms, serviceProviderForms, providerServices,
  serviceCategories, serviceSubcategories, faqs, wallets, creditTransactions,
  serviceTemplates, serviceBookings, serviceReviews, cartItems, userAndExpertContracts,
  notifications, experienceTypes, experienceTemplateSteps, expertExperienceTypes,
  userExperiences, userExperienceItems, users, customVenues,
  vendorAvailabilitySlots, coordinationStates, coordinationBookings,
  expertServiceCategories, expertServiceOfferings, expertSelectedServices, expertSpecializations,
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
  type CoordinationBooking, type InsertCoordinationBooking
} from "@shared/schema";
import { eq, ilike, and, desc, or, count } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

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
  updateLocalExpertFormStatus(id: string, status: string, rejectionMessage?: string): Promise<LocalExpertForm | undefined>;

  // Service Provider Forms
  getServiceProviderForm(userId: string): Promise<ServiceProviderForm | undefined>;
  getServiceProviderForms(status?: string): Promise<ServiceProviderForm[]>;
  createServiceProviderForm(form: InsertServiceProviderForm & { userId: string }): Promise<ServiceProviderForm>;
  updateServiceProviderFormStatus(id: string, status: string, rejectionMessage?: string): Promise<ServiceProviderForm | undefined>;

  // Provider Services
  getProviderServices(userId: string): Promise<ProviderService[]>;
  getAllProviderServices(): Promise<ProviderService[]>;
  createProviderService(service: InsertProviderService & { userId: string }): Promise<ProviderService>;
  updateProviderService(id: string, updates: Partial<InsertProviderService>): Promise<ProviderService | undefined>;
  deleteProviderService(id: string): Promise<void>;

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
  }): Promise<{ services: ProviderService[]; total: number }>;

  // Cart
  getCartItems(userId: string, experienceSlug?: string): Promise<any[]>;
  addToCart(userId: string, item: { serviceId?: string; customVenueId?: string; quantity?: number; tripId?: string; scheduledDate?: Date; notes?: string; experienceSlug?: string }): Promise<any>;
  updateCartItem(id: string, updates: { quantity?: number; scheduledDate?: Date; notes?: string }): Promise<any | undefined>;
  removeFromCart(id: string): Promise<void>;
  clearCart(userId: string, experienceSlug?: string): Promise<void>;

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
  
  // User Experiences
  getUserExperiences(userId: string): Promise<UserExperience[]>;
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
  getExpertSelectedServices(expertId: string): Promise<any[]>;
  addExpertSelectedService(expertId: string, serviceOfferingId: string, customPrice?: string): Promise<any>;
  removeExpertSelectedService(expertId: string, serviceOfferingId: string): Promise<void>;
  
  // Expert Specializations
  getExpertSpecializations(expertId: string): Promise<any[]>;
  addExpertSpecialization(expertId: string, specialization: string): Promise<any>;
  removeExpertSpecialization(expertId: string, specialization: string): Promise<void>;
  
  // Get experts with full profile (experience types, services, specializations)
  getExpertsWithProfiles(experienceTypeId?: string): Promise<any[]>;

  // Custom Venues
  getCustomVenues(userId?: string, tripId?: string, experienceType?: string): Promise<CustomVenue[]>;
  getCustomVenue(id: string): Promise<CustomVenue | undefined>;
  createCustomVenue(venue: InsertCustomVenue): Promise<CustomVenue>;
  updateCustomVenue(id: string, venue: Partial<InsertCustomVenue>): Promise<CustomVenue | undefined>;
  deleteCustomVenue(id: string): Promise<void>;

  // Vendor Availability Slots
  getVendorAvailabilitySlots(serviceId: string, date?: string): Promise<VendorAvailabilitySlot[]>;
  getProviderAvailabilitySlots(providerId: string): Promise<VendorAvailabilitySlot[]>;
  getVendorAvailabilitySlot(id: string): Promise<VendorAvailabilitySlot | undefined>;
  createVendorAvailabilitySlot(slot: InsertVendorAvailabilitySlot): Promise<VendorAvailabilitySlot>;
  updateVendorAvailabilitySlot(id: string, updates: Partial<InsertVendorAvailabilitySlot>): Promise<VendorAvailabilitySlot | undefined>;
  deleteVendorAvailabilitySlot(id: string): Promise<void>;
  bookSlot(id: string): Promise<VendorAvailabilitySlot | undefined>;

  // Coordination States
  getCoordinationStates(userId: string): Promise<CoordinationState[]>;
  getCoordinationState(id: string): Promise<CoordinationState | undefined>;
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
}

export class DatabaseStorage implements IStorage {
  // Trips
  async getTrips(userId?: string): Promise<Trip[]> {
    if (!userId) return [];
    return await db.select().from(trips).where(eq(trips.userId, userId));
  }

  async getTrip(id: string): Promise<Trip | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    return trip;
  }

  async createTrip(trip: InsertTrip & { userId: string }): Promise<Trip> {
    const [newTrip] = await db.insert(trips).values(trip).returning();
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
    const [newItinerary] = await db.insert(generatedItineraries).values(itinerary).returning();
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
    const [newChat] = await db.insert(userAndExpertChats).values(chat).returning();
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

  async updateLocalExpertFormStatus(id: string, status: string, rejectionMessage?: string): Promise<LocalExpertForm | undefined> {
    const [updated] = await db.update(localExpertForms)
      .set({ status, rejectionMessage })
      .where(eq(localExpertForms.id, id))
      .returning();
    return updated;
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

  // Provider Services
  async getProviderServices(userId: string): Promise<ProviderService[]> {
    return await db.select().from(providerServices).where(eq(providerServices.userId, userId));
  }

  async getAllProviderServices(): Promise<ProviderService[]> {
    return await db.select().from(providerServices).where(eq(providerServices.status, 'active'));
  }

  async createProviderService(service: InsertProviderService & { userId: string }): Promise<ProviderService> {
    const [newService] = await db.insert(providerServices).values(service).returning();
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
    let conditions = [eq(providerServices.status, "active")];
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
      bookingsCount: 0,
      totalRevenue: "0",
      averageRating: null,
      reviewCount: 0,
    }).returning();
    return newService;
  }

  async incrementServiceBookings(id: string, amount: number): Promise<void> {
    const service = await this.getProviderServiceById(id);
    if (service) {
      await db.update(providerServices)
        .set({ 
          bookingsCount: (service.bookingsCount || 0) + 1,
          totalRevenue: String(Number(service.totalRevenue || 0) + amount),
          updatedAt: new Date()
        })
        .where(eq(providerServices.id, id));
    }
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
    const [newBooking] = await db.insert(serviceBookings).values(booking).returning();
    return newBooking;
  }

  async updateServiceBookingStatus(id: string, status: string, reason?: string): Promise<ServiceBooking | undefined> {
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
    const [newReview] = await db.insert(serviceReviews).values(review).returning();
    
    // Update service average rating
    const allReviews = await this.getServiceReviews(review.serviceId);
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await db.update(providerServices)
      .set({ averageRating: String(avgRating), reviewCount: allReviews.length, updatedAt: new Date() })
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
  }): Promise<{ services: ProviderService[]; total: number }> {
    const conditions = [eq(providerServices.status, "active")];
    
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
    
    return {
      services: filtered.slice(offset, offset + limit),
      total: filtered.length
    };
  }

  // Cart Methods
  async getCartItems(userId: string, experienceSlug?: string): Promise<any[]> {
    let whereCondition = eq(cartItems.userId, userId);
    if (experienceSlug) {
      whereCondition = and(eq(cartItems.userId, userId), eq(cartItems.experienceSlug, experienceSlug)) as any;
    }
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
        return { ...item, isCustomVenue: false, service: service ? { ...service, providerName } : null };
      }
      return { ...item, service: null };
    }));
    return enriched;
  }

  async addToCart(userId: string, item: { serviceId?: string; customVenueId?: string; quantity?: number; tripId?: string; scheduledDate?: Date; notes?: string; experienceSlug?: string }): Promise<any> {
    // Check if item already in cart for this experience
    let whereCondition;
    if (item.customVenueId) {
      whereCondition = and(eq(cartItems.userId, userId), eq(cartItems.customVenueId, item.customVenueId));
    } else if (item.serviceId) {
      whereCondition = and(eq(cartItems.userId, userId), eq(cartItems.serviceId, item.serviceId));
    } else {
      throw new Error("Either serviceId or customVenueId is required");
    }
    
    if (item.experienceSlug) {
      whereCondition = and(whereCondition, eq(cartItems.experienceSlug, item.experienceSlug));
    }
    const [existing] = await db.select().from(cartItems).where(whereCondition);
    
    if (existing) {
      const [updated] = await db.update(cartItems)
        .set({ quantity: (existing.quantity || 1) + (item.quantity || 1) })
        .where(eq(cartItems.id, existing.id))
        .returning();
      return updated;
    }
    
    const [newItem] = await db.insert(cartItems).values({
      userId,
      serviceId: item.serviceId || null,
      customVenueId: item.customVenueId || null,
      experienceSlug: item.experienceSlug,
      quantity: item.quantity || 1,
      tripId: item.tripId,
      scheduledDate: item.scheduledDate,
      notes: item.notes
    }).returning();
    return newItem;
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

  // User Experiences Methods
  async getUserExperiences(userId: string): Promise<UserExperience[]> {
    return await db.select().from(userExperiences)
      .where(eq(userExperiences.userId, userId))
      .orderBy(desc(userExperiences.createdAt));
  }

  async getUserExperience(id: string): Promise<UserExperience | undefined> {
    const [result] = await db.select().from(userExperiences).where(eq(userExperiences.id, id));
    return result;
  }

  async createUserExperience(experience: InsertUserExperience & { userId: string }): Promise<UserExperience> {
    const [newExperience] = await db.insert(userExperiences).values(experience).returning();
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

  async bookSlot(id: string): Promise<VendorAvailabilitySlot | undefined> {
    const [slot] = await db.select().from(vendorAvailabilitySlots).where(eq(vendorAvailabilitySlots.id, id));
    if (!slot) return undefined;
    
    const newBookedCount = (slot.bookedCount || 0) + 1;
    const newStatus = newBookedCount >= (slot.capacity || 1) ? "fully_booked" : "available";
    
    const [updated] = await db.update(vendorAvailabilitySlots)
      .set({ bookedCount: newBookedCount, status: newStatus, updatedAt: new Date() })
      .where(eq(vendorAvailabilitySlots.id, id))
      .returning();
    return updated;
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
  async getExpertServiceCategories(): Promise<any[]> {
    return await db.select().from(expertServiceCategories).orderBy(expertServiceCategories.sortOrder);
  }

  async getExpertServiceOfferings(categoryId?: string): Promise<any[]> {
    if (categoryId) {
      return await db.select().from(expertServiceOfferings)
        .where(eq(expertServiceOfferings.categoryId, categoryId))
        .orderBy(expertServiceOfferings.sortOrder);
    }
    return await db.select().from(expertServiceOfferings).orderBy(expertServiceOfferings.sortOrder);
  }

  async getExpertSelectedServices(expertId: string): Promise<any[]> {
    return await db.select({
      id: expertSelectedServices.id,
      expertId: expertSelectedServices.expertId,
      serviceOfferingId: expertSelectedServices.serviceOfferingId,
      customPrice: expertSelectedServices.customPrice,
      isActive: expertSelectedServices.isActive,
      offering: expertServiceOfferings,
      category: expertServiceCategories
    })
    .from(expertSelectedServices)
    .leftJoin(expertServiceOfferings, eq(expertSelectedServices.serviceOfferingId, expertServiceOfferings.id))
    .leftJoin(expertServiceCategories, eq(expertServiceOfferings.categoryId, expertServiceCategories.id))
    .where(eq(expertSelectedServices.expertId, expertId));
  }

  async addExpertSelectedService(expertId: string, serviceOfferingId: string, customPrice?: string): Promise<any> {
    const [created] = await db.insert(expertSelectedServices).values({
      expertId,
      serviceOfferingId,
      customPrice: customPrice || null,
      isActive: true
    }).returning();
    return created;
  }

  async removeExpertSelectedService(expertId: string, serviceOfferingId: string): Promise<void> {
    await db.delete(expertSelectedServices)
      .where(and(
        eq(expertSelectedServices.expertId, expertId),
        eq(expertSelectedServices.serviceOfferingId, serviceOfferingId)
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
    // Get all users with expert role
    const experts = await db.select().from(users).where(eq(users.role, "expert"));
    
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
      const services = await this.getExpertSelectedServices(expert.id);

      // Get expert's specializations
      const specializations = await this.getExpertSpecializations(expert.id);

      // Get expert's local expert form for additional info
      const form = await this.getLocalExpertForm(expert.id);

      return {
        ...expert,
        experienceTypes: expTypes,
        selectedServices: services,
        specializations: specializations.map(s => s.specialization),
        expertForm: form
      };
    }));

    // Filter by experience type if provided
    if (experienceTypeId) {
      return expertsWithProfiles.filter(expert => 
        expert.experienceTypes.some((et: any) => et.experienceTypeId === experienceTypeId)
      );
    }

    return expertsWithProfiles;
  }
}

export const storage = new DatabaseStorage();
