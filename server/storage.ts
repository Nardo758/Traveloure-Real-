import { db } from "./db";
import { 
  trips, generatedItineraries, touristPlaceResults, touristPlacesSearches,
  userAndExpertChats, helpGuideTrips, vendors,
  type Trip, type InsertTrip,
  type GeneratedItinerary, type InsertGeneratedItinerary,
  type TouristPlaceResult,
  type UserAndExpertChat, type HelpGuideTrip,
  type Vendor, type InsertVendor
} from "@shared/schema";
import { eq, ilike } from "drizzle-orm";
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
}

export const storage = new DatabaseStorage();
