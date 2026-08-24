import { db } from "../db";
import { 
  tripTransactions, 
  tripParticipants,
  type TripTransaction, 
  type InsertTripTransaction,
  type TripParticipant 
} from "@shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { createChildLogger, databaseQueryDuration } from "../infrastructure";
import { storage } from "../storage";

export interface BudgetSummary {
  totalBudget: number;
  totalSpent: number;
  totalPending: number;
  remaining: number;
  percentUsed: number;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface SplitCalculation {
  participantId: string;
  participantName: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
}

/**
 * Caller-input validation failure (L20 hardening). Distinct from an internal failure so a route
 * can answer 400 instead of masking a bad request as a 500.
 */
export class BudgetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetValidationError";
  }
}

export interface CurrencyConversion {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  convertedAmount: number;
  exchangeRate: number;
}

/**
 * In-memory FX rate cache — refreshed at most every 5 minutes so that repeated
 * convertCurrency calls within a request burst do not hammer the database while
 * still picking up the daily fx_rates refresh promptly.
 */
const FX_CACHE_TTL_MS = 5 * 60 * 1000;
let fxCacheRates: Record<string, number> | null = null;
let fxCacheExpiresAt = 0;

/**
 * Fetch the latest FX rates (units-per-USD) from the DB-backed fx_rates table,
 * with a short in-memory cache. USD itself is always 1.0.
 * Throws if the DB returns no rows (table not yet seeded).
 */
async function getDbFxRates(): Promise<Record<string, number>> {
  if (fxCacheRates && Date.now() < fxCacheExpiresAt) return fxCacheRates;
  const result = await storage.getLatestFxRates();
  if (!result || Object.keys(result.rates).length === 0) {
    throw new Error("FX rate table is empty — cannot perform currency conversion");
  }
  const rates: Record<string, number> = { USD: 1.0, ...result.rates };
  fxCacheRates = rates;
  fxCacheExpiresAt = Date.now() + FX_CACHE_TTL_MS;
  return rates;
}

const TIP_PERCENTAGES: Record<string, { restaurant: number; taxi: number; hotel: number }> = {
  "US": { restaurant: 18, taxi: 15, hotel: 5 },
  "UK": { restaurant: 10, taxi: 10, hotel: 2 },
  "FR": { restaurant: 5, taxi: 5, hotel: 2 },
  "JP": { restaurant: 0, taxi: 0, hotel: 0 },
  "DE": { restaurant: 10, taxi: 10, hotel: 3 },
  "IT": { restaurant: 10, taxi: 5, hotel: 2 },
  "ES": { restaurant: 5, taxi: 5, hotel: 2 },
  "AU": { restaurant: 10, taxi: 10, hotel: 0 },
  "CA": { restaurant: 18, taxi: 15, hotel: 5 },
  "MX": { restaurant: 15, taxi: 10, hotel: 3 },
  "TH": { restaurant: 10, taxi: 0, hotel: 2 },
  "DEFAULT": { restaurant: 10, taxi: 10, hotel: 2 },
};

const logger = createChildLogger("budget-service");

export class BudgetService {
  async getTransactions(tripId: string): Promise<TripTransaction[]> {
    const start = Date.now();
    const result = await db.select().from(tripTransactions)
      .where(eq(tripTransactions.tripId, tripId))
      .orderBy(desc(tripTransactions.transactionDate));
    databaseQueryDuration.labels("select", "trip_transactions").observe((Date.now() - start) / 1000);
    return result;
  }

  async getTransaction(id: string): Promise<TripTransaction | undefined> {
    const results = await db.select().from(tripTransactions).where(eq(tripTransactions.id, id));
    return results[0];
  }

  async createTransaction(data: InsertTripTransaction): Promise<TripTransaction> {
    const results = await db.insert(tripTransactions).values({
      ...data,
      transactionDate: data.transactionDate || new Date(),
    }).returning();
    return results[0];
  }

  async updateTransaction(id: string, updates: Partial<InsertTripTransaction>): Promise<TripTransaction | undefined> {
    const results = await db.update(tripTransactions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tripTransactions.id, id))
      .returning();
    return results[0];
  }

  async deleteTransaction(id: string): Promise<void> {
    await db.delete(tripTransactions).where(eq(tripTransactions.id, id));
  }

  async getBudgetSummary(tripId: string, totalBudget: number = 0): Promise<BudgetSummary> {
    const transactions = await this.getTransactions(tripId);
    
    let totalSpent = 0;
    let totalPending = 0;

    for (const t of transactions) {
      const amount = parseFloat(String(t.amount || 0));
      if (t.status === "paid") {
        totalSpent += amount;
      } else if (t.status === "unpaid" || t.status === "partial") {
        totalPending += amount;
      }
    }

    const remaining = totalBudget - totalSpent - totalPending;
    const percentUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    return {
      totalBudget,
      totalSpent,
      totalPending,
      remaining,
      percentUsed,
    };
  }

  async getCategoryBreakdown(tripId: string): Promise<CategoryBreakdown[]> {
    const transactions = await this.getTransactions(tripId);
    const categoryMap = new Map<string, { amount: number; count: number }>();
    let totalAmount = 0;

    for (const t of transactions) {
      const amount = parseFloat(String(t.amount || 0));
      const category = t.category || "other";
      
      const current = categoryMap.get(category) || { amount: 0, count: 0 };
      categoryMap.set(category, {
        amount: current.amount + amount,
        count: current.count + 1,
      });
      totalAmount += amount;
    }

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        percentage: totalAmount > 0 ? Math.round((data.amount / totalAmount) * 100) : 0,
        transactionCount: data.count,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  async calculateSplit(
    tripId: string, 
    totalAmount: number, 
    method: "equal" | "percentage" | "custom" = "equal",
    customSplits?: { participantId: string; amount?: number; percentage?: number }[]
  ): Promise<SplitCalculation[]> {
    // L20 hardening: a missing / non-numeric `totalAmount` used to propagate NaN through every
    // computed amount (serialized as `null` money numbers in the response). Reject the input
    // instead of emitting dishonest figures.
    if (typeof totalAmount !== "number" || !Number.isFinite(totalAmount)) {
      throw new BudgetValidationError("`totalAmount` must be a finite number");
    }

    const participants = await db.select().from(tripParticipants)
      .where(eq(tripParticipants.tripId, tripId));

    const results: SplitCalculation[] = [];

    if (method === "equal") {
      // L20 hardening: an equal split over ZERO participants used to divide by 0 and emit
      // NaN/Infinity amounts (the common case — most trips have no participant rows). Fail
      // honestly instead of returning nonsense money numbers.
      if (participants.length === 0) {
        throw new BudgetValidationError(
          "Cannot calculate an equal split: this trip has no participants",
        );
      }
      const perPerson = totalAmount / participants.length;
      for (const p of participants) {
        results.push({
          participantId: p.id,
          participantName: p.name,
          totalOwed: Math.round(perPerson * 100) / 100,
          totalPaid: parseFloat(String(p.amountPaid || 0)),
          balance: Math.round(perPerson * 100) / 100 - parseFloat(String(p.amountPaid || 0)),
        });
      }
    } else if (method === "percentage" && customSplits) {
      for (const split of customSplits) {
        const participant = participants.find(p => p.id === split.participantId);
        if (participant && split.percentage !== undefined) {
          const owed = totalAmount * (split.percentage / 100);
          results.push({
            participantId: participant.id,
            participantName: participant.name,
            totalOwed: Math.round(owed * 100) / 100,
            totalPaid: parseFloat(String(participant.amountPaid || 0)),
            balance: Math.round(owed * 100) / 100 - parseFloat(String(participant.amountPaid || 0)),
          });
        }
      }
    } else if (method === "custom" && customSplits) {
      for (const split of customSplits) {
        const participant = participants.find(p => p.id === split.participantId);
        if (participant && split.amount !== undefined) {
          results.push({
            participantId: participant.id,
            participantName: participant.name,
            totalOwed: split.amount,
            totalPaid: parseFloat(String(participant.amountPaid || 0)),
            balance: split.amount - parseFloat(String(participant.amountPaid || 0)),
          });
        }
      }
    }

    return results;
  }

  async convertCurrency(
    amount: number, 
    fromCurrency: string, 
    toCurrency: string
  ): Promise<CurrencyConversion> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    const rates = await getDbFxRates();

    if (!(from in rates)) {
      throw new BudgetValidationError(
        `Unsupported currency "${from}" — no FX rate found in the database`,
      );
    }
    if (!(to in rates)) {
      throw new BudgetValidationError(
        `Unsupported currency "${to}" — no FX rate found in the database`,
      );
    }

    const fromRate = rates[from]; // units of `from` per 1 USD
    const toRate = rates[to];     // units of `to` per 1 USD

    const usdAmount = amount / fromRate;
    const convertedAmount = usdAmount * toRate;
    const exchangeRate = toRate / fromRate;

    return {
      amount,
      fromCurrency: from,
      toCurrency: to,
      convertedAmount: Math.round(convertedAmount * 100) / 100,
      exchangeRate: Math.round(exchangeRate * 10000) / 10000,
    };
  }

  calculateTip(
    amount: number, 
    countryCode: string, 
    serviceType: "restaurant" | "taxi" | "hotel"
  ): { tipAmount: number; tipPercentage: number; total: number } {
    const tips = TIP_PERCENTAGES[countryCode.toUpperCase()] || TIP_PERCENTAGES["DEFAULT"];
    const tipPercentage = tips[serviceType];
    const tipAmount = Math.round(amount * (tipPercentage / 100) * 100) / 100;
    
    return {
      tipAmount,
      tipPercentage,
      total: amount + tipAmount,
    };
  }

  /**
   * L20 hardening: verify every supplied participant id is a real `trip_participants` row on
   * THIS trip. Throws BudgetValidationError (→ 400) on the first id that isn't.
   * Blank/undefined ids are ignored (the column is nullable and optional).
   */
  private async assertParticipantsBelongToTrip(
    tripId: string,
    participantIds: (string | null | undefined)[],
  ): Promise<void> {
    const ids = Array.from(
      new Set(
        participantIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        ),
      ),
    );
    if (ids.length === 0) return;

    const rows = await db
      .select({ id: tripParticipants.id })
      .from(tripParticipants)
      .where(and(eq(tripParticipants.tripId, tripId), inArray(tripParticipants.id, ids)));

    const owned = new Set(rows.map((r) => r.id));
    const foreign = ids.filter((id) => !owned.has(id));
    if (foreign.length > 0) {
      throw new BudgetValidationError(
        `Participant(s) do not belong to this trip: ${foreign.join(", ")}`,
      );
    }
  }

  async createSplitTransaction(
    tripId: string,
    totalAmount: number,
    category: string,
    description: string,
    paidByParticipantId: string,
    splits: { participantId: string; amount: number }[]
  ): Promise<TripTransaction[]> {
    const results: TripTransaction[] = [];

    // L20 hardening (IDOR-shaped): `paidByParticipantId` and every `splits[].participantId`
    // become `paid_by_participant_id` / `assigned_to_participant_id` on rows scoped to THIS
    // trip. Unvalidated, a caller could point this trip's ledger at a participant row belonging
    // to someone else's trip (cross-trip reference, and a participant-id oracle). Owner-gating
    // the endpoint does not close that — the ids themselves must be verified against the trip.
    if (!Array.isArray(splits)) {
      throw new BudgetValidationError("`splits` must be an array");
    }
    await this.assertParticipantsBelongToTrip(tripId, [
      paidByParticipantId,
      ...splits.map((s) => s?.participantId),
    ]);

    const mainTransaction = await this.createTransaction({
      tripId,
      transactionType: "expense",
      status: "paid",
      amount: String(totalAmount),
      category,
      description,
      paidByParticipantId,
      splitMethod: "custom",
      splitDetails: splits,
    });
    results.push(mainTransaction);

    for (const split of splits) {
      if (split.participantId !== paidByParticipantId) {
        const splitTransaction = await this.createTransaction({
          tripId,
          transactionType: "split_contribution",
          status: "unpaid",
          amount: String(split.amount),
          category,
          description: `Split: ${description}`,
          assignedToParticipantId: split.participantId,
          paidByParticipantId,
        });
        results.push(splitTransaction);
      }
    }

    return results;
  }

  async getSettleUpSummary(tripId: string): Promise<{
    owes: { from: TripParticipant; to: TripParticipant; amount: number }[];
    totalOutstanding: number;
  }> {
    const transactions = await this.getTransactions(tripId);
    const participants = await db.select().from(tripParticipants)
      .where(eq(tripParticipants.tripId, tripId));

    const balances = new Map<string, number>();
    
    for (const p of participants) {
      balances.set(p.id, 0);
    }

    for (const t of transactions) {
      if (t.transactionType === "split_contribution" && t.status === "unpaid") {
        const amount = parseFloat(String(t.amount || 0));
        if (t.assignedToParticipantId) {
          const current = balances.get(t.assignedToParticipantId) || 0;
          balances.set(t.assignedToParticipantId, current - amount);
        }
        if (t.paidByParticipantId) {
          const current = balances.get(t.paidByParticipantId) || 0;
          balances.set(t.paidByParticipantId, current + amount);
        }
      }
    }

    const owes: { from: TripParticipant; to: TripParticipant; amount: number }[] = [];
    const debtors = participants.filter(p => (balances.get(p.id) || 0) < 0);
    const creditors = participants.filter(p => (balances.get(p.id) || 0) > 0);

    for (const debtor of debtors) {
      let debtAmount = Math.abs(balances.get(debtor.id) || 0);
      
      for (const creditor of creditors) {
        if (debtAmount <= 0) break;
        
        const creditAmount = balances.get(creditor.id) || 0;
        if (creditAmount <= 0) continue;

        const settleAmount = Math.min(debtAmount, creditAmount);
        if (settleAmount > 0) {
          owes.push({
            from: debtor,
            to: creditor,
            amount: Math.round(settleAmount * 100) / 100,
          });
          debtAmount -= settleAmount;
          balances.set(creditor.id, creditAmount - settleAmount);
        }
      }
    }

    const totalOutstanding = owes.reduce((sum, o) => sum + o.amount, 0);

    return { owes, totalOutstanding };
  }
}

export const budgetService = new BudgetService();
