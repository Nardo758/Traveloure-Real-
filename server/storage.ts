import { db } from "./db";
import { 
  trips, generatedItineraries, touristPlaceResults, touristPlacesSearches,
  userAndExpertChats, helpGuideTrips, vendors,
  localExpertForms, serviceProviderForms, providerServices,
  serviceCategories, serviceSubcategories, faqs, wallets, creditTransactions,
  serviceTemplates, serviceBookings, serviceReviews,
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
  type ServiceReview, type InsertServiceReview
} from "@shared/schema";
import { eq, ilike, and, desc, or } from "drizzle-orm";
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
  createProviderService(service: InsertProviderService & { userId: string }): Promise<ProviderService>;
  updateProviderService(id: string, updates: Partial<InsertProviderService>): Promise<ProviderService | undefined>;
  deleteProviderService(id: string): Promise<void>;

  // Service Categories
  getServiceCategories(): Promise<ServiceCategory[]>;
  createServiceCategory(category: InsertServiceCategory): Promise<ServiceCategory>;
  getServiceSubcategories(categoryId: string): Promise<ServiceSubcategory[]>;
  createServiceSubcategory(subcategory: InsertServiceSubcategory): Promise<ServiceSubcategory>;

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
  createServiceReview(review: InsertServiceReview): Promise<ServiceReview>;
  addReviewResponse(id: string, responseText: string): Promise<ServiceReview | undefined>;
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
  async getServiceCategories(): Promise<ServiceCategory[]> {
    return await db.select().from(serviceCategories);
  }

  async createServiceCategory(category: InsertServiceCategory): Promise<ServiceCategory> {
    const [newCategory] = await db.insert(serviceCategories).values(category).returning();
    return newCategory;
  }

  async getServiceSubcategories(categoryId: string): Promise<ServiceSubcategory[]> {
    return await db.select().from(serviceSubcategories).where(eq(serviceSubcategories.categoryId, categoryId));
  }

  async createServiceSubcategory(subcategory: InsertServiceSubcategory): Promise<ServiceSubcategory> {
    const [newSubcategory] = await db.insert(serviceSubcategories).values(subcategory).returning();
    return newSubcategory;
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
}

export const storage = new DatabaseStorage();
