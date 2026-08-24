import { db } from "../db";
import { 
  tripParticipants, 
  type TripParticipant, 
  type InsertTripParticipant 
} from "@shared/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { createChildLogger, databaseQueryDuration } from "../infrastructure";

export interface ParticipantStats {
  total: number;
  confirmed: number;
  pending: number;
  declined: number;
  maybe: number;
  responseRate: number;
}

export interface PaymentStats {
  totalOwed: number;
  totalPaid: number;
  totalOutstanding: number;
  paidCount: number;
  unpaidCount: number;
  collectionRate: number;
}

export interface DietaryRequirements {
  restrictions: { name: string; count: number }[];
  accessibilityNeeds: { name: string; count: number }[];
}

const logger = createChildLogger("coordination-service");

export class CoordinationService {
  async getParticipants(tripId: string): Promise<TripParticipant[]> {
    const start = Date.now();
    const result = await db.select().from(tripParticipants).where(eq(tripParticipants.tripId, tripId));
    databaseQueryDuration.labels("select", "trip_participants").observe((Date.now() - start) / 1000);
    return result;
  }

  async getParticipant(id: string): Promise<TripParticipant | undefined> {
    const results = await db.select().from(tripParticipants).where(eq(tripParticipants.id, id));
    return results[0];
  }

  async createParticipant(data: InsertTripParticipant): Promise<TripParticipant> {
    const results = await db.insert(tripParticipants).values({
      ...data,
      invitedAt: new Date(),
    }).returning();
    return results[0];
  }

  async updateParticipant(id: string, updates: Partial<InsertTripParticipant>): Promise<TripParticipant | undefined> {
    const results = await db.update(tripParticipants)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tripParticipants.id, id))
      .returning();
    return results[0];
  }

  async updateRSVP(id: string, status: string, notes?: string): Promise<TripParticipant | undefined> {
    const results = await db.update(tripParticipants)
      .set({ 
        status, 
        rsvpNotes: notes,
        respondedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(tripParticipants.id, id))
      .returning();
    return results[0];
  }

  async deleteParticipant(id: string): Promise<void> {
    await db.delete(tripParticipants).where(eq(tripParticipants.id, id));
  }

  async getParticipantStats(tripId: string): Promise<ParticipantStats> {
    const participants = await this.getParticipants(tripId);
    const total = participants.length;
    const confirmed = participants.filter(p => p.status === "confirmed").length;
    const pending = participants.filter(p => p.status === "pending" || p.status === "invited").length;
    const declined = participants.filter(p => p.status === "declined").length;
    const maybe = participants.filter(p => p.status === "maybe").length;
    const responded = total - pending;
    
    return {
      total,
      confirmed,
      pending,
      declined,
      maybe,
      responseRate: total > 0 ? Math.round((responded / total) * 100) : 0
    };
  }

  async getPaymentStats(tripId: string): Promise<PaymentStats> {
    const participants = await this.getParticipants(tripId);
    
    let totalOwed = 0;
    let totalPaid = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    for (const p of participants) {
      const owed = parseFloat(String(p.amountOwed || 0));
      const paid = parseFloat(String(p.amountPaid || 0));
      totalOwed += owed;
      totalPaid += paid;
      
      if (p.paymentStatus === "paid") {
        paidCount++;
      } else if (owed > 0) {
        unpaidCount++;
      }
    }

    return {
      totalOwed,
      totalPaid,
      totalOutstanding: totalOwed - totalPaid,
      paidCount,
      unpaidCount,
      collectionRate: totalOwed > 0 ? Math.round((totalPaid / totalOwed) * 100) : 100
    };
  }

  async updatePayment(
    id: string, 
    amount: number, 
    method?: string, 
    notes?: string
  ): Promise<TripParticipant | undefined> {
    const participant = await this.getParticipant(id);
    if (!participant) return undefined;

    const currentPaid = parseFloat(String(participant.amountPaid || 0));
    const owed = parseFloat(String(participant.amountOwed || 0));
    const newPaid = currentPaid + amount;
    
    let status: string = "partial";
    if (newPaid >= owed) {
      status = "paid";
    } else if (newPaid <= 0) {
      status = "unpaid";
    }

    return this.updateParticipant(id, {
      amountPaid: String(newPaid),
      paymentStatus: status,
      paymentMethod: method || participant.paymentMethod,
      paymentNotes: notes || participant.paymentNotes,
    });
  }

  async getDietaryRequirements(tripId: string): Promise<DietaryRequirements> {
    const participants = await this.getParticipants(tripId);
    
    const restrictionCounts = new Map<string, number>();
    const accessibilityCounts = new Map<string, number>();

    for (const p of participants) {
      const restrictions = (p.dietaryRestrictions as string[]) || [];
      const accessibility = (p.accessibilityNeeds as string[]) || [];
      
      for (const r of restrictions) {
        restrictionCounts.set(r, (restrictionCounts.get(r) || 0) + 1);
      }
      for (const a of accessibility) {
        accessibilityCounts.set(a, (accessibilityCounts.get(a) || 0) + 1);
      }
    }

    return {
      restrictions: Array.from(restrictionCounts.entries()).map(([name, count]) => ({ name, count })),
      accessibilityNeeds: Array.from(accessibilityCounts.entries()).map(([name, count]) => ({ name, count }))
    };
  }

  async bulkInvite(tripId: string, emails: string[]): Promise<TripParticipant[]> {
    const results: TripParticipant[] = [];
    
    for (const email of emails) {
      const existing = await db.select().from(tripParticipants)
        .where(and(
          eq(tripParticipants.tripId, tripId),
          eq(tripParticipants.email, email)
        ));
      
      if (existing.length === 0) {
        const created = await this.createParticipant({
          tripId,
          name: email.split("@")[0],
          email,
          status: "invited",
          role: "guest",
        });
        results.push(created);
      }
    }
    
    return results;
  }

  async setAmountOwed(tripId: string, amountPerPerson: number): Promise<TripParticipant[]> {
    const participants = await this.getParticipants(tripId);
    const results: TripParticipant[] = [];
    
    for (const p of participants) {
      if (p.role !== "organizer") {
        const updated = await this.updateParticipant(p.id, {
          amountOwed: String(amountPerPerson),
        });
        if (updated) results.push(updated);
      }
    }
    
    return results;
  }
}

export const coordinationService = new CoordinationService();
