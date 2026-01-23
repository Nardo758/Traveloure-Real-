import { db } from "../db";
import { 
  tripEmergencyContacts, 
  tripAlerts,
  type TripEmergencyContact, 
  type InsertTripEmergencyContact,
  type TripAlert,
  type InsertTripAlert
} from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { createChildLogger, databaseQueryDuration } from "../infrastructure";

export interface EmergencyContactsByType {
  local_expert: TripEmergencyContact[];
  embassy: TripEmergencyContact[];
  hospital: TripEmergencyContact[];
  police: TripEmergencyContact[];
  hotel: TripEmergencyContact[];
  airline: TripEmergencyContact[];
  insurance: TripEmergencyContact[];
  custom: TripEmergencyContact[];
}

export interface AlertSummary {
  total: number;
  unread: number;
  critical: number;
  high: number;
  activeAlerts: TripAlert[];
}

const EMBASSY_DATA: Record<string, { name: string; phone: string; address: string; website: string }> = {
  "FR": { name: "U.S. Embassy Paris", phone: "+33 1 43 12 22 22", address: "2 Avenue Gabriel, 75008 Paris", website: "https://fr.usembassy.gov" },
  "UK": { name: "U.S. Embassy London", phone: "+44 20 7499 9000", address: "33 Nine Elms Lane, London SW11 7US", website: "https://uk.usembassy.gov" },
  "JP": { name: "U.S. Embassy Tokyo", phone: "+81 3-3224-5000", address: "1-10-5 Akasaka, Minato-ku, Tokyo", website: "https://jp.usembassy.gov" },
  "DE": { name: "U.S. Embassy Berlin", phone: "+49 30 8305 0", address: "Clayallee 170, 14191 Berlin", website: "https://de.usembassy.gov" },
  "IT": { name: "U.S. Embassy Rome", phone: "+39 06 46741", address: "Via Vittorio Veneto 121, 00187 Roma", website: "https://it.usembassy.gov" },
  "ES": { name: "U.S. Embassy Madrid", phone: "+34 91 587 2200", address: "Calle de Serrano 75, 28006 Madrid", website: "https://es.usembassy.gov" },
  "TH": { name: "U.S. Embassy Bangkok", phone: "+66 2 205 4000", address: "95 Wireless Road, Bangkok 10330", website: "https://th.usembassy.gov" },
  "MX": { name: "U.S. Embassy Mexico City", phone: "+52 55 5080 2000", address: "Paseo de la Reforma 305, Mexico City", website: "https://mx.usembassy.gov" },
  "AU": { name: "U.S. Embassy Canberra", phone: "+61 2 6214 5600", address: "Moonah Place, Yarralumla ACT 2600", website: "https://au.usembassy.gov" },
};

const EMERGENCY_NUMBERS: Record<string, { police: string; ambulance: string; fire: string }> = {
  "US": { police: "911", ambulance: "911", fire: "911" },
  "UK": { police: "999", ambulance: "999", fire: "999" },
  "EU": { police: "112", ambulance: "112", fire: "112" },
  "FR": { police: "17", ambulance: "15", fire: "18" },
  "DE": { police: "110", ambulance: "112", fire: "112" },
  "JP": { police: "110", ambulance: "119", fire: "119" },
  "AU": { police: "000", ambulance: "000", fire: "000" },
  "TH": { police: "191", ambulance: "1669", fire: "199" },
  "MX": { police: "911", ambulance: "911", fire: "911" },
  "DEFAULT": { police: "112", ambulance: "112", fire: "112" },
};

const logger = createChildLogger("emergency-service");

export class EmergencyService {
  async getContacts(tripId: string): Promise<TripEmergencyContact[]> {
    const start = Date.now();
    const result = await db.select().from(tripEmergencyContacts)
      .where(eq(tripEmergencyContacts.tripId, tripId))
      .orderBy(desc(tripEmergencyContacts.priority));
    databaseQueryDuration.labels("select", "trip_emergency_contacts").observe((Date.now() - start) / 1000);
    return result;
  }

  async getContact(id: string): Promise<TripEmergencyContact | undefined> {
    const results = await db.select().from(tripEmergencyContacts).where(eq(tripEmergencyContacts.id, id));
    return results[0];
  }

  async createContact(data: InsertTripEmergencyContact): Promise<TripEmergencyContact> {
    const results = await db.insert(tripEmergencyContacts).values(data).returning();
    return results[0];
  }

  async updateContact(id: string, updates: Partial<InsertTripEmergencyContact>): Promise<TripEmergencyContact | undefined> {
    const results = await db.update(tripEmergencyContacts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tripEmergencyContacts.id, id))
      .returning();
    return results[0];
  }

  async deleteContact(id: string): Promise<void> {
    await db.delete(tripEmergencyContacts).where(eq(tripEmergencyContacts.id, id));
  }

  async getContactsByType(tripId: string): Promise<EmergencyContactsByType> {
    const contacts = await this.getContacts(tripId);
    
    const byType: EmergencyContactsByType = {
      local_expert: [],
      embassy: [],
      hospital: [],
      police: [],
      hotel: [],
      airline: [],
      insurance: [],
      custom: [],
    };

    for (const contact of contacts) {
      const type = contact.contactType as keyof EmergencyContactsByType;
      if (byType[type]) {
        byType[type].push(contact);
      } else {
        byType.custom.push(contact);
      }
    }

    return byType;
  }

  async getAlerts(tripId: string): Promise<TripAlert[]> {
    return db.select().from(tripAlerts)
      .where(eq(tripAlerts.tripId, tripId))
      .orderBy(desc(tripAlerts.createdAt));
  }

  async getActiveAlerts(tripId: string): Promise<TripAlert[]> {
    const now = new Date();
    return db.select().from(tripAlerts)
      .where(and(
        eq(tripAlerts.tripId, tripId),
        eq(tripAlerts.isActive, true)
      ))
      .orderBy(desc(tripAlerts.createdAt));
  }

  async getAlert(id: string): Promise<TripAlert | undefined> {
    const results = await db.select().from(tripAlerts).where(eq(tripAlerts.id, id));
    return results[0];
  }

  async createAlert(data: InsertTripAlert): Promise<TripAlert> {
    const results = await db.insert(tripAlerts).values(data).returning();
    return results[0];
  }

  async updateAlert(id: string, updates: Partial<InsertTripAlert>): Promise<TripAlert | undefined> {
    const results = await db.update(tripAlerts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tripAlerts.id, id))
      .returning();
    return results[0];
  }

  async acknowledgeAlert(id: string, userId: string): Promise<TripAlert | undefined> {
    return this.updateAlert(id, {
      isRead: true,
      acknowledgedAt: new Date(),
      acknowledgedByUserId: userId,
    });
  }

  async dismissAlert(id: string): Promise<TripAlert | undefined> {
    return this.updateAlert(id, { isActive: false });
  }

  async getAlertSummary(tripId: string): Promise<AlertSummary> {
    const alerts = await this.getActiveAlerts(tripId);
    
    return {
      total: alerts.length,
      unread: alerts.filter(a => !a.isRead).length,
      critical: alerts.filter(a => a.severity === "critical").length,
      high: alerts.filter(a => a.severity === "high").length,
      activeAlerts: alerts,
    };
  }

  getEmergencyNumbers(countryCode: string): { police: string; ambulance: string; fire: string } {
    return EMERGENCY_NUMBERS[countryCode.toUpperCase()] || EMERGENCY_NUMBERS["DEFAULT"];
  }

  getEmbassyInfo(countryCode: string): { name: string; phone: string; address: string; website: string } | null {
    return EMBASSY_DATA[countryCode.toUpperCase()] || null;
  }

  async addEmbassyContact(tripId: string, countryCode: string): Promise<TripEmergencyContact | null> {
    const embassy = this.getEmbassyInfo(countryCode);
    if (!embassy) return null;

    return this.createContact({
      tripId,
      contactType: "embassy",
      name: embassy.name,
      phone: embassy.phone,
      address: embassy.address,
      website: embassy.website,
      country: countryCode,
      available24Hours: false,
      priority: 90,
      isVerified: true,
    });
  }

  async addLocalEmergencyNumbers(tripId: string, countryCode: string): Promise<TripEmergencyContact[]> {
    const numbers = this.getEmergencyNumbers(countryCode);
    const results: TripEmergencyContact[] = [];

    const policeContact = await this.createContact({
      tripId,
      contactType: "police",
      name: "Local Police Emergency",
      phone: numbers.police,
      country: countryCode,
      available24Hours: true,
      priority: 100,
      isVerified: true,
    });
    results.push(policeContact);

    const ambulanceContact = await this.createContact({
      tripId,
      contactType: "hospital",
      name: "Emergency Medical Services",
      phone: numbers.ambulance,
      country: countryCode,
      available24Hours: true,
      priority: 100,
      isVerified: true,
    });
    results.push(ambulanceContact);

    return results;
  }

  async createWeatherAlert(
    tripId: string,
    title: string,
    message: string,
    severity: "info" | "low" | "medium" | "high" | "critical",
    effectiveFrom?: Date,
    effectiveUntil?: Date,
    affectedItemIds?: string[]
  ): Promise<TripAlert> {
    return this.createAlert({
      tripId,
      alertType: "weather",
      severity,
      title,
      message,
      source: "weather_api",
      effectiveFrom,
      effectiveUntil,
      affectedItineraryItemIds: affectedItemIds || [],
      suggestedActions: [
        { action: "Check backup plans", priority: "high" },
        { action: "Monitor weather updates", priority: "medium" },
      ],
    });
  }

  async createVendorAlert(
    tripId: string,
    title: string,
    message: string,
    affectedContractIds: string[]
  ): Promise<TripAlert> {
    return this.createAlert({
      tripId,
      alertType: "vendor",
      severity: "medium",
      title,
      message,
      source: "system",
      affectedVendorContractIds: affectedContractIds,
      suggestedActions: [
        { action: "Contact vendor", priority: "high" },
        { action: "Review contract terms", priority: "medium" },
      ],
    });
  }

  async createDeadlineAlert(
    tripId: string,
    title: string,
    message: string,
    deadline: Date
  ): Promise<TripAlert> {
    return this.createAlert({
      tripId,
      alertType: "deadline",
      severity: "medium",
      title,
      message,
      source: "system",
      effectiveUntil: deadline,
      suggestedActions: [
        { action: "Complete required action", priority: "high" },
      ],
    });
  }

  async getRebookingOptions(tripId: string, itemType: string): Promise<{
    type: string;
    description: string;
    estimatedCost: string;
    timeToArrange: string;
  }[]> {
    const options = [];

    switch (itemType) {
      case "flight":
        options.push(
          { type: "Same airline rebooking", description: "Contact airline for same-day alternatives", estimatedCost: "$0-200 change fee", timeToArrange: "1-2 hours" },
          { type: "Alternative airline", description: "Search for flights on other carriers", estimatedCost: "Varies by route", timeToArrange: "2-4 hours" },
          { type: "Ground transport backup", description: "Train or bus alternative", estimatedCost: "$50-150", timeToArrange: "30 min booking" }
        );
        break;
      case "hotel":
        options.push(
          { type: "Same hotel chain", description: "Check availability at nearby properties", estimatedCost: "Similar rate", timeToArrange: "30 minutes" },
          { type: "Alternative accommodation", description: "Search other hotels/Airbnb", estimatedCost: "Varies", timeToArrange: "1-2 hours" },
          { type: "Extended stay", description: "Extend current booking if available", estimatedCost: "Daily rate", timeToArrange: "15 minutes" }
        );
        break;
      case "activity":
        options.push(
          { type: "Reschedule", description: "Move to different time/date", estimatedCost: "Usually free", timeToArrange: "15-30 minutes" },
          { type: "Alternative activity", description: "Similar experience nearby", estimatedCost: "Varies", timeToArrange: "1-2 hours" },
          { type: "Indoor backup", description: "Weather-proof alternative", estimatedCost: "Varies", timeToArrange: "30 minutes" }
        );
        break;
      default:
        options.push(
          { type: "Contact vendor", description: "Reach out to arrange alternatives", estimatedCost: "Varies", timeToArrange: "Varies" },
          { type: "Expert assistance", description: "Request help from travel expert", estimatedCost: "Service fee may apply", timeToArrange: "1-4 hours" }
        );
    }

    return options;
  }

  async initializeTripEmergencyInfo(tripId: string, destinationCountry: string): Promise<{
    contacts: TripEmergencyContact[];
    alerts: TripAlert[];
  }> {
    const contacts = await this.addLocalEmergencyNumbers(tripId, destinationCountry);
    
    const embassy = await this.addEmbassyContact(tripId, destinationCountry);
    if (embassy) contacts.push(embassy);

    const welcomeAlert = await this.createAlert({
      tripId,
      alertType: "custom",
      severity: "info",
      title: "Emergency contacts added",
      message: `Local emergency numbers and embassy information for ${destinationCountry} have been added to your trip.`,
      source: "system",
      suggestedActions: [
        { action: "Review emergency contacts", priority: "low" },
        { action: "Add travel insurance info", priority: "medium" },
      ],
    });

    return { contacts, alerts: [welcomeAlert] };
  }
}

export const emergencyService = new EmergencyService();
