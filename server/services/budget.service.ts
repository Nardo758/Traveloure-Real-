import { db } from "../db";
import { 
  tripTransactions, 
  tripParticipants,
  type TripTransaction, 
  type InsertTripTransaction,
  type TripParticipant 
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

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

export interface CurrencyConversion {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  convertedAmount: number;
  exchangeRate: number;
}

const EXCHANGE_RATES: Record<string, number> = {
  "USD": 1.0,
  "EUR": 0.92,
  "GBP": 0.79,
  "JPY": 149.5,
  "CAD": 1.36,
  "AUD": 1.53,
  "CHF": 0.88,
  "CNY": 7.24,
  "INR": 83.12,
  "MXN": 17.15,
  "BRL": 4.97,
  "THB": 35.5,
};

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

export class BudgetService {
  async getTransactions(tripId: string): Promise<TripTransaction[]> {
    return db.select().from(tripTransactions)
      .where(eq(tripTransactions.tripId, tripId))
      .orderBy(desc(tripTransactions.transactionDate));
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
    const participants = await db.select().from(tripParticipants)
      .where(eq(tripParticipants.tripId, tripId));

    const results: SplitCalculation[] = [];

    if (method === "equal") {
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
    const fromRate = EXCHANGE_RATES[fromCurrency.toUpperCase()] || 1;
    const toRate = EXCHANGE_RATES[toCurrency.toUpperCase()] || 1;
    
    const usdAmount = amount / fromRate;
    const convertedAmount = usdAmount * toRate;
    const exchangeRate = toRate / fromRate;

    return {
      amount,
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
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

  async createSplitTransaction(
    tripId: string,
    totalAmount: number,
    category: string,
    description: string,
    paidByParticipantId: string,
    splits: { participantId: string; amount: number }[]
  ): Promise<TripTransaction[]> {
    const results: TripTransaction[] = [];

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
